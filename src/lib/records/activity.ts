import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import {
  allocations,
  checkpoints,
  externalMovements,
  purchases,
  receipts,
  scheduleInstances,
  schedules,
  transfers,
} from '../db/schema';
import { formatPence } from '../money';
import { endOfLocalDate, isValidLocalDate, toLocalDateString } from '../time';
import { categoryTree } from './categories';
import { addDaysLocal } from './dates';
import { expectedInflowOccurrences, expectedInflowPotId, listDebts } from './debts';
import { listPeople } from './people';
import { listPotsIncludingArchived } from './pots';
import { listSuppliers } from './suppliers';
import { purchaseLineSummary, targetNames } from './targets';
import { ACTIVITY_FAMILY_RANK, compareActivityOrder, type ActivityOrder } from './activity-order';
import { transferInPlaceHref } from './transfer-activity';
import { listVehicles } from './vehicles';
import { recordIsAfterCheckpoint, type CheckpointFacts, type SignedMovement } from './estimates';

/**
 * The "All Transactions" projection (docs/SPEC.md §15.3, plan decisions
 * 101–108): every movement that touched one pot inside a local date window,
 * as one flat, read-only list.
 *
 * It is a **pure projection of existing records** — it writes nothing, stores
 * nothing and invents nothing. Every row carries a link to the canonical form
 * that owns the add/edit/void behaviour, because this page deliberately has
 * none. Voided records are excluded (`voided_at IS NULL` on every family).
 *
 * Income is rendered as `BAC` (v0.4.0, plan decisions 109–113): both the
 * receipts converted from income schedules and the one-off income the
 * household records on the Income page. It carried no source column and no
 * entry form when `BAC` was first reserved, so it was deferred with income
 * itself; that gap is closed, and a one-off third-party credit is income
 * rather than other money in.
 *
 * Expected support is rendered as `EXP<` (v0.7.0, SPEC §10.2): a debt's
 * expectation appears from its due date, flagged and outside the totals,
 * and gives way to the real `LN<` row once that month's borrowing is
 * recorded. It is an expectation, never income and never a movement.
 *
 * Signs are relative to the selected pot, so one pot→pot transfer is green on
 * the receiving side and red on the sending side with no data change anywhere.
 *
 * The date column is date-only ('YYYY-MM-DD', decision 108): a date-only
 * record's instant is the end-of-local-date marker, so rendering the instant
 * would print a 23:59 time that never happened.
 *
 * Running balance (v0.33.0): each transaction row shows the pot's balance
 * after that movement, anchored on the most recent checkpoint. Balances
 * before a checkpoint stay as computed from the previous checkpoint; after
 * a checkpoint the new balances use that checkpoint's reported figure.
 * This resolves drift without line-by-line reconciliation: a checkpoint
 * resets the running total. Colour-coded green (credit) / red (debit).
 */

/** The compact type codes the household sketch asked for (SPEC §15.3). */
export type ActivityCode =
  | 'PUR'
  | 'REF'
  | 'DD'
  | 'SO'
  | 'TX<'
  | 'TX>'
  | 'LN<'
  | 'LN>'
  | 'SW<'
  | 'SW>'
  | 'BAC'
  /** An expected debt inflow, not yet recorded (v0.7.0) — always money in. */
  | 'EXP<';

export const ACTIVITY_ROW_LIMIT = 500;

export class InvalidActivityInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidActivityInputError';
  }
}

export interface ActivityLink {
  href: string;
  label: string;
}

export interface ActivityRow {
  /** Stable React key: family + record id. */
  key: string;
  /**
   * `expected` rows (v0.7.0) are a debt's expectation, not a record: they are
   * listed and flagged, never counted in the totals, and they disappear once
   * that month's borrowing is recorded.
   */
  family: 'purchase' | 'transfer' | 'external' | 'receipt' | 'expected';
  recordId: number;
  /** Local calendar date, 'YYYY-MM-DD' — the only date this page shows. */
  date: string;
  code: ActivityCode;
  /** Supplier, the other pot's label, or the counterparty. */
  source: string;
  /** 'Parent / Child (Target)' for purchases; '' for everything else. */
  category: string;
  /** Allocation lines beyond the first (a split shows "+N more"). */
  extraLines: number;
  /** Always positive; `direction` carries the sign. */
  amountPence: number;
  direction: 'in' | 'out';
  note: string;
  link: ActivityLink;
  /** DD/SO → the schedule; a swap leg → the paired swap list. */
  secondaryLink: ActivityLink | null;
  /** Swap pairing state, or null. */
  badge: string | null;
  /** Running balance after this movement, anchored on checkpoints (null when no anchor). */
  runningBalancePence: number | null;
  /**
   * An internal transfer opens in place (decision 225): these are the facts
   * its correction and void forms start from. Null on every other family.
   */
  transfer: ActivityTransferFacts | null;
  /**
   * A purchase opens in place too (decision 226, GitHub issue #57): these are
   * the facts its correction and void forms start from. Present on exactly the
   * rows that open in place — a hand-recorded purchase (`PUR`) and a schedule
   * conversion (`DD` / `SO`); null on every other family, **and on a refund**
   * (`REF`), which keeps its link to the Purchases page beside its original.
   */
  purchase: ActivityPurchaseFacts | null;
}

/** What the in-place transfer panel needs beyond the row's own cells (decision 225). */
export interface ActivityTransferFacts {
  /** The version the page rendered — the edit and void forms' stale-form guard. */
  version: number;
  fromPotId: number;
  toPotId: number;
  fromLabel: string;
  toLabel: string;
  /** The saved note as stored (the row's `note` is the display string). */
  note: string | null;
  enteredBy: string;
  /** Null while the transfer stands; the reason ('' when none was given) once voided. */
  voidReason: string | null;
}

/** What the in-place purchase panel needs beyond the row's own cells (decision 226). */
export interface ActivityPurchaseFacts {
  /** The version the page rendered — the edit and void forms' stale-form guard. */
  version: number;
  /** The saved note as stored (the row's `note` is the display string). */
  note: string | null;
  /** Who recorded it, as the ledger stores them. */
  enteredBy: string;
  /** Null while the purchase stands; the reason ('' when none was given) once voided. */
  voidReason: string | null;
  /** The allocation lines the correction form starts from, in their stored order. */
  lines: ActivityPurchaseLine[];
}

/** One allocation line, as the correction form wants it (no display labels). */
export interface ActivityPurchaseLine {
  amountPence: number;
  categoryId: number;
  targetKind: 'household' | 'person' | 'vehicle';
  targetId: number | null;
}

export interface ActivityCheckpoint {
  key: string;
  date: string;
  /** The user-reported figure — never a computed balance (SPEC §15.3). */
  amountPence: number;
  note: string;
}

export type ActivityEntry =
  | {
      kind: 'row';
      row: ActivityRow;
      /** Where the row sorts — kept so a row placed later lands where it belongs. */
      order: ActivityOrder;
    }
  | { kind: 'checkpoint'; checkpoint: ActivityCheckpoint };

export interface ActivityTotals {
  /** Sum of the recorded rows actually shown, credits. */
  inPence: number;
  /** Sum of the recorded rows actually shown, debits. */
  outPence: number;
  /** Recorded rows shown. Expected-support rows are counted separately. */
  rowCount: number;
  /** Rows in the window that fell off the cap — the page must say so. */
  hiddenRowCount: number;
  /** Expected-support rows shown (v0.7.0): expectations, never movements. */
  expectedRowCount: number;
  /** Their total. Deliberately outside `inPence`/`outPence`/`rowCount`. */
  expectedInPence: number;
}

export interface ActivityView {
  potId: number;
  dateFrom: string;
  dateTo: string;
  /** Newest first; a checkpoint divider sits below its own date's rows. */
  entries: ActivityEntry[];
  totals: ActivityTotals;
}

export interface ActivityFilters {
  potId: number;
  dateFrom: string;
  dateTo: string;
  limit?: number;
}

interface PendingRow {
  /** Epoch ms, for the cross-family sort. */
  sortAt: number;
  /** Tie-break inside one family. */
  recordId: number;
  familyRank: number;
  row: ActivityRow;
  /** Movement facts for running-balance calculation (null for expected rows). */
  movement: BalanceMovement | null;
}

interface BalanceMovement extends SignedMovement {
  /** For ordering */
  sortAt: number;
  recordId: number;
  familyRank: number;
  key: string;
  signedPence: number;
}

function pendingOrder(item: PendingRow): ActivityOrder {
  return {
    at: item.sortAt,
    familyRank: item.familyRank,
    recordId: item.recordId,
    key: item.row.key,
  };
}

function movementOrderLE(a: BalanceMovement, b: BalanceMovement): boolean {
  if (a.sortAt !== b.sortAt) return a.sortAt < b.sortAt;
  const aEntered = a.enteredAt?.getTime() ?? 0;
  const bEntered = b.enteredAt?.getTime() ?? 0;
  if (aEntered !== bEntered) return aEntered < bEntered;
  if (a.familyRank !== b.familyRank) return a.familyRank < b.familyRank;
  if (a.recordId !== b.recordId) return a.recordId < b.recordId;
  return a.key <= b.key;
}

function movementOrderLEInclusive(a: BalanceMovement, b: BalanceMovement): boolean {
  if (a.key === b.key) return true;
  return movementOrderLE(a, b);
}

export function listPotActivity(db: Db, filters: ActivityFilters): ActivityView {
  const { potId, dateFrom, dateTo } = filters;
  if (!isValidLocalDate(dateFrom)) {
    throw new InvalidActivityInputError(`Invalid start date: ${dateFrom}`);
  }
  if (!isValidLocalDate(dateTo)) {
    throw new InvalidActivityInputError(`Invalid end date: ${dateTo}`);
  }
  if (dateFrom > dateTo) {
    throw new InvalidActivityInputError(`The start date ${dateFrom} is after ${dateTo}.`);
  }
  const limit = Math.min(Math.max(filters.limit ?? ACTIVITY_ROW_LIMIT, 1), 1000);

  const potLabels = new Map(listPotsIncludingArchived(db).map((pot) => [pot.id, pot.label]));
  const supplierNames = new Map(listSuppliers(db).map((supplier) => [supplier.id, supplier.name]));
  const categoryNames = new Map(
    categoryTree(db).flatMap((parent) =>
      parent.children.map((child) => [child.id, `${parent.name} / ${child.name}`] as const),
    ),
  );
  const names = targetNames({ people: listPeople(db), vehicles: listVehicles(db) });

  const pending: PendingRow[] = [];

  // --- Purchases: PUR / REF / DD / SO -------------------------------------
  const purchaseRows = db
    .select()
    .from(purchases)
    .where(
      and(
        eq(purchases.potId, potId),
        isNull(purchases.voidedAt),
        gte(purchases.occurredDate, dateFrom),
        lte(purchases.occurredDate, dateTo),
      ),
    )
    .orderBy(desc(purchases.occurredAt), desc(purchases.id))
    .limit(limit)
    .all();

  const linesByPurchase = new Map<number, Array<typeof allocations.$inferSelect>>();
  if (purchaseRows.length > 0) {
    const lines = db
      .select()
      .from(allocations)
      .where(
        inArray(
          allocations.purchaseId,
          purchaseRows.map((row) => row.id),
        ),
      )
      // By allocation id, so the line the row names and the lines the
      // correction form starts from are the household's own order — the same
      // order the Purchases page reads them in (decision 226).
      .orderBy(asc(allocations.id))
      .all();
    for (const line of lines) {
      const list = linesByPurchase.get(line.purchaseId) ?? [];
      list.push(line);
      linesByPurchase.set(line.purchaseId, list);
    }
  }
  const scheduleByInstance = scheduleKindByInstance(
    db,
    purchaseRows.map((row) => row.scheduleInstanceId).filter((id): id is number => id !== null),
  );

  for (const purchase of purchaseRows) {
    const lines = linesByPurchase.get(purchase.id) ?? [];
    const schedule =
      purchase.scheduleInstanceId === null
        ? undefined
        : scheduleByInstance.get(purchase.scheduleInstanceId);
    const sortAt = purchase.occurredAt.getTime();
    const signedPence = -purchase.totalPence;
    pending.push({
      sortAt,
      recordId: purchase.id,
      familyRank: 0,
      row: purchaseActivityRowFrom(purchase, lines, {
        potId,
        dateFrom,
        dateTo,
        source:
          purchase.supplierId !== null
            ? (supplierNames.get(purchase.supplierId) ?? 'Unknown supplier')
            : (schedule?.name ?? 'Unknown supplier'),
        code: purchaseActivityCode(purchase.refundOfPurchaseId !== null, schedule?.kind),
        scheduleId: schedule?.scheduleId ?? null,
        summary: purchaseLineSummary(lines, categoryNames, names),
      }),
      movement: {
        key: `purchase-${purchase.id}`,
        recordId: purchase.id,
        familyRank: 0,
        sortAt,
        signedPence,
        occurredAt: purchase.occurredAt,
        occurredDate: purchase.occurredDate,
        enteredAt: purchase.createdAt,
      },
    });
  }

  // --- Transfers: TX< / TX> ------------------------------------------------
  const transferRows = db
    .select()
    .from(transfers)
    .where(
      and(
        or(eq(transfers.fromPotId, potId), eq(transfers.toPotId, potId)),
        isNull(transfers.voidedAt),
        gte(transfers.occurredDate, dateFrom),
        lte(transfers.occurredDate, dateTo),
      ),
    )
    .orderBy(desc(transfers.occurredAt), desc(transfers.id))
    .limit(limit)
    .all();

  for (const transfer of transferRows) {
    const incoming = transfer.toPotId === potId;
    const sortAt = transfer.occurredAt.getTime();
    const signedPence = incoming ? transfer.amountPence : -transfer.amountPence;
    pending.push({
      sortAt,
      recordId: transfer.id,
      familyRank: ACTIVITY_FAMILY_RANK.transfer,
      row: transferActivityRow(transfer, potId, potLabels, { dateFrom, dateTo }),
      movement: {
        key: `transfer-${transfer.id}`,
        recordId: transfer.id,
        familyRank: 1,
        sortAt,
        signedPence,
        occurredAt: transfer.occurredAt,
        occurredDate: transfer.occurredDate,
        enteredAt: transfer.createdAt,
      },
    });
  }

  // --- Money across the boundary: TX / LN / SW -----------------------------
  const externalRows = db
    .select()
    .from(externalMovements)
    .where(
      and(
        eq(externalMovements.potId, potId),
        isNull(externalMovements.voidedAt),
        gte(externalMovements.occurredDate, dateFrom),
        lte(externalMovements.occurredDate, dateTo),
      ),
    )
    .orderBy(desc(externalMovements.occurredAt), desc(externalMovements.id))
    .limit(limit)
    .all();

  const swapPartners = swapPartnerByExchangeKey(
    db,
    externalRows
      .filter((row) => row.kind === 'swap' && row.exchangeKey !== null)
      .map((row) => row.exchangeKey as string),
    potId,
  );

  for (const movement of externalRows) {
    const incoming = movement.direction === 'in';
    const arrow = incoming ? '<' : '>';
    const code: ActivityCode =
      movement.kind === 'loan'
        ? (`LN${arrow}` as ActivityCode)
        : movement.kind === 'swap'
          ? (`SW${arrow}` as ActivityCode)
          : (`TX${arrow}` as ActivityCode);
    const sortAt = movement.occurredAt.getTime();
    const signedPence = incoming ? movement.amountPence : -movement.amountPence;
    pending.push({
      sortAt,
      recordId: movement.id,
      familyRank: 2,
      row: {
        key: `external-${movement.id}`,
        family: 'external',
        recordId: movement.id,
        date: movement.occurredDate,
        code,
        source: movement.counterparty,
        category: '',
        extraLines: 0,
        amountPence: movement.amountPence,
        direction: incoming ? 'in' : 'out',
        note: movement.note ?? '',
        link: {
          href: `/pots?external=${movement.id}#external-${movement.id}`,
          label: 'Open this record',
        },
        secondaryLink:
          movement.kind === 'swap' ? { href: '/pots#swaps', label: 'Open the swap list' } : null,
        badge: movement.kind === 'swap' ? (swapPartners.get(movement.id) ?? null) : null,
        runningBalancePence: null,
        transfer: null,
        purchase: null,
      },
      movement: {
        key: `external-${movement.id}`,
        recordId: movement.id,
        familyRank: 2,
        sortAt,
        signedPence,
        occurredAt: movement.occurredAt,
        occurredDate: movement.occurredDate,
        enteredAt: movement.createdAt,
      },
    });
  }

  // --- Income: BAC --------------------------------------------------------
  const receiptRows = db
    .select({
      receipt: receipts,
      scheduleId: schedules.id,
      scheduleName: schedules.name,
    })
    .from(receipts)
    .leftJoin(scheduleInstances, eq(scheduleInstances.id, receipts.scheduleInstanceId))
    .leftJoin(schedules, eq(schedules.id, scheduleInstances.scheduleId))
    .where(
      and(
        eq(receipts.potId, potId),
        isNull(receipts.voidedAt),
        gte(receipts.occurredDate, dateFrom),
        lte(receipts.occurredDate, dateTo),
      ),
    )
    .orderBy(desc(receipts.occurredAt), desc(receipts.id))
    .limit(limit)
    .all();

  for (const { receipt, scheduleId, scheduleName } of receiptRows) {
    const sortAt = receipt.occurredAt.getTime();
    pending.push({
      sortAt,
      recordId: receipt.id,
      familyRank: 3,
      row: {
        key: `receipt-${receipt.id}`,
        family: 'receipt',
        recordId: receipt.id,
        date: receipt.occurredDate,
        code: 'BAC',
        source: receipt.source ?? scheduleName ?? 'Income',
        category: '',
        extraLines: 0,
        amountPence: receipt.amountPence,
        direction: 'in',
        note: receipt.note ?? '',
        link: {
          href: `/income?receipt=${receipt.id}#receipt-${receipt.id}`,
          label: 'Open this income record',
        },
        secondaryLink:
          scheduleId === null
            ? null
            : { href: `/recurring#schedule-${scheduleId}`, label: 'Open the schedule' },
        badge: scheduleName === null ? null : 'from schedule',
        runningBalancePence: null,
        transfer: null,
        purchase: null,
      },
      movement: {
        key: `receipt-${receipt.id}`,
        recordId: receipt.id,
        familyRank: 3,
        sortAt,
        signedPence: receipt.amountPence,
        occurredAt: receipt.occurredAt,
        occurredDate: receipt.occurredDate,
        enteredAt: receipt.createdAt,
      },
    });
  }

  // --- Expected support: EXP< ---------------------------------------------
  for (const debt of listDebts(db)) {
    if (expectedInflowPotId(db, debt) !== potId) continue;
    const occurrences = expectedInflowOccurrences(
      db,
      debt,
      addDaysLocal(dateFrom, -1),
      dateTo,
      potId,
    );
    const plannedFrom = toLocalDateString(debt.updatedAt);
    for (const occurrence of occurrences) {
      if (occurrence.configuredDate < plannedFrom) continue;
      if (occurrence.dueDate < dateFrom || occurrence.dueDate > dateTo) continue;
      pending.push({
        sortAt: endOfLocalDate(occurrence.dueDate).getTime(),
        recordId: debt.id,
        familyRank: 4,
        row: {
          key: `expected-debt-${debt.id}-${occurrence.dueDate}`,
          family: 'expected',
          recordId: debt.id,
          date: occurrence.dueDate,
          code: 'EXP<',
          source: debt.counterparty,
          category: '',
          extraLines: 0,
          amountPence: occurrence.amountPence,
          direction: 'in',
          note: debt.note ?? '',
          link: { href: `/pots#debt-${debt.id}`, label: 'Open the loan panel' },
          secondaryLink: null,
          badge: 'expected — not recorded yet',
          runningBalancePence: null,
          transfer: null,
          purchase: null,
        },
        movement: null,
      });
    }
  }

  // One deterministic order across families: newest first, then a stable
  // tie-break so a re-render cannot reshuffle rows sharing an instant.
  pending.sort((a, b) => compareActivityOrder(pendingOrder(a), pendingOrder(b)));
  const shown = pending.slice(0, limit);
  const windowRowCount =
    countRows(db, purchases, potId, dateFrom, dateTo) +
    countTransferRows(db, potId, dateFrom, dateTo) +
    countRows(db, externalMovements, potId, dateFrom, dateTo) +
    countRows(db, receipts, potId, dateFrom, dateTo);

  // ---- Running balance calculation --------------------------------------
  // Fetch all checkpoints for this pot, ascending.
  const allCheckpointsAsc = db
    .select()
    .from(checkpoints)
    .where(eq(checkpoints.potId, potId))
    .orderBy(asc(checkpoints.effectiveAt), asc(checkpoints.id))
    .all();

  const relevantCheckpointsAsc = allCheckpointsAsc.filter(
    (c) => toLocalDateString(c.effectiveAt) <= dateTo,
  );

  let balanceMovementsAsc: BalanceMovement[] = [];
  if (relevantCheckpointsAsc.length > 0) {
    const firstCp = relevantCheckpointsAsc[0];
    if (firstCp === undefined) {
      // Should not happen due to length check, but keep TS happy
      throw new Error('No checkpoint found');
    }
    const earliestDate = toLocalDateString(firstCp.effectiveAt);
    // Fetch all movements from earliest checkpoint date to dateTo (no limit)
    const balancePurchaseRows = db
      .select()
      .from(purchases)
      .where(
        and(
          eq(purchases.potId, potId),
          isNull(purchases.voidedAt),
          gte(purchases.occurredDate, earliestDate),
          lte(purchases.occurredDate, dateTo),
        ),
      )
      .all();
    const balanceTransferRows = db
      .select()
      .from(transfers)
      .where(
        and(
          or(eq(transfers.fromPotId, potId), eq(transfers.toPotId, potId)),
          isNull(transfers.voidedAt),
          gte(transfers.occurredDate, earliestDate),
          lte(transfers.occurredDate, dateTo),
        ),
      )
      .all();
    const balanceExternalRows = db
      .select()
      .from(externalMovements)
      .where(
        and(
          eq(externalMovements.potId, potId),
          isNull(externalMovements.voidedAt),
          gte(externalMovements.occurredDate, earliestDate),
          lte(externalMovements.occurredDate, dateTo),
        ),
      )
      .all();
    const balanceReceiptRows = db
      .select()
      .from(receipts)
      .where(
        and(
          eq(receipts.potId, potId),
          isNull(receipts.voidedAt),
          gte(receipts.occurredDate, earliestDate),
          lte(receipts.occurredDate, dateTo),
        ),
      )
      .all();

    const all: BalanceMovement[] = [];
    for (const p of balancePurchaseRows) {
      all.push({
        key: `purchase-${p.id}`,
        recordId: p.id,
        familyRank: 0,
        sortAt: p.occurredAt.getTime(),
        signedPence: -p.totalPence,
        occurredAt: p.occurredAt,
        occurredDate: p.occurredDate,
        enteredAt: p.createdAt,
      });
    }
    for (const t of balanceTransferRows) {
      const incoming = t.toPotId === potId;
      all.push({
        key: `transfer-${t.id}`,
        recordId: t.id,
        familyRank: 1,
        sortAt: t.occurredAt.getTime(),
        signedPence: incoming ? t.amountPence : -t.amountPence,
        occurredAt: t.occurredAt,
        occurredDate: t.occurredDate,
        enteredAt: t.createdAt,
      });
    }
    for (const m of balanceExternalRows) {
      const incoming = m.direction === 'in';
      all.push({
        key: `external-${m.id}`,
        recordId: m.id,
        familyRank: 2,
        sortAt: m.occurredAt.getTime(),
        signedPence: incoming ? m.amountPence : -m.amountPence,
        occurredAt: m.occurredAt,
        occurredDate: m.occurredDate,
        enteredAt: m.createdAt,
      });
    }
    for (const r of balanceReceiptRows) {
      all.push({
        key: `receipt-${r.id}`,
        recordId: r.id,
        familyRank: 3,
        sortAt: r.occurredAt.getTime(),
        signedPence: r.amountPence,
        occurredAt: r.occurredAt,
        occurredDate: r.occurredDate,
        enteredAt: r.createdAt,
      });
    }
    all.sort((a, b) => {
      if (a.sortAt !== b.sortAt) return a.sortAt - b.sortAt;
      const aEntered = a.enteredAt?.getTime() ?? 0;
      const bEntered = b.enteredAt?.getTime() ?? 0;
      if (aEntered !== bEntered) return aEntered - bEntered;
      if (a.familyRank !== b.familyRank) return a.familyRank - b.familyRank;
      if (a.recordId !== b.recordId) return a.recordId - b.recordId;
      return a.key.localeCompare(b.key);
    });
    balanceMovementsAsc = all;
  }

  const checkpointFactsAsc: Array<CheckpointFacts & { id: number; date: string }> =
    relevantCheckpointsAsc.map((c) => ({
      id: c.id,
      amountPence: c.amountPence,
      effectiveAt: c.effectiveAt,
      enteredAt: c.createdAt,
      date: toLocalDateString(c.effectiveAt),
    }));

  // Map from key to BalanceMovement for quick lookup of shown rows
  const balanceByKey = new Map(balanceMovementsAsc.map((m) => [m.key, m]));

  // Compute running balance for each shown row
  const runningBalanceByKey = new Map<string, number | null>();
  for (const item of shown) {
    if (item.movement === null) {
      runningBalanceByKey.set(item.row.key, null);
      continue;
    }
    // Find the movement in balanceMovementsAsc (should exist)
    const movement = balanceByKey.get(item.row.key) ?? item.movement;
    // Find anchor checkpoint: latest where movement is after checkpoint
    let anchor: (CheckpointFacts & { id: number; date: string }) | null = null;
    for (let i = checkpointFactsAsc.length - 1; i >= 0; i--) {
      const cp = checkpointFactsAsc[i];
      if (cp === undefined) continue;
      const cpFacts: CheckpointFacts = {
        amountPence: cp.amountPence,
        effectiveAt: cp.effectiveAt,
        enteredAt: cp.enteredAt,
      };
      const mov: SignedMovement = {
        signedPence: movement.signedPence,
        occurredAt: movement.occurredAt,
        occurredDate: movement.occurredDate,
        enteredAt: movement.enteredAt,
      };
      if (recordIsAfterCheckpoint(mov, cpFacts)) {
        anchor = cp;
        break;
      }
    }
    if (anchor === null || anchor === undefined) {
      runningBalanceByKey.set(item.row.key, null);
      continue;
    }
    // Sum movements after anchor up to and including this movement
    let sum = anchor.amountPence;
    for (const m of balanceMovementsAsc) {
      const mFacts: CheckpointFacts = {
        amountPence: anchor.amountPence,
        effectiveAt: anchor.effectiveAt,
        enteredAt: anchor.enteredAt,
      };
      const mMov: SignedMovement = {
        signedPence: m.signedPence,
        occurredAt: m.occurredAt,
        occurredDate: m.occurredDate,
        enteredAt: m.enteredAt,
      };
      if (!recordIsAfterCheckpoint(mMov, mFacts)) continue;
      if (!movementOrderLEInclusive(m, movement)) continue;
      // m is after anchor and <= current movement
      // But also ensure m's date is not after current movement's date? The order check already handles time
      // However we must also ensure m is not after current movement in terms of checkpoint absorption?
      // The anchor check ensures m is after anchor; if m is absorbed by a later checkpoint that is between anchor and current, then m would NOT be after anchor? Actually if there's a later checkpoint C2 between anchor and current, and m is before C2, then m would be NOT after C2, but it could still be after anchor. However for current movement T anchored to C2, we wouldn't be summing after anchor (C) but after C2. Since we already selected anchor as latest checkpoint where T is after, any intermediate checkpoint between anchor and T cannot exist, because anchor is latest where T is after. If there is C2 between anchor and T where T is after C2, then anchor would be C2, not earlier. So our anchor is already latest.
      // For other movements M that are after anchor but before C2, and C2 is between anchor and T, then M would be inside C2 (not after C2), but we are summing after anchor, not after C2. Should we include M? No, because C2 resets balance and M is already included in C2's amount.
      // However our anchor is C2, so we are summing after C2, not after earlier checkpoint. So M before C2 would not be after C2, so excluded. Good.
      sum += m.signedPence;
    }
    runningBalanceByKey.set(item.row.key, sum);
  }

  let inPence = 0;
  let outPence = 0;
  let expectedInPence = 0;
  let expectedRowCount = 0;
  let shownRecordCount = 0;
  const entries: ActivityEntry[] = shown.map((item) => {
    if (item.row.family === 'expected') {
      expectedInPence += item.row.amountPence;
      expectedRowCount += 1;
      return {
        kind: 'row',
        row: { ...item.row, runningBalancePence: null },
        order: pendingOrder(item),
      };
    }
    shownRecordCount += 1;
    if (item.row.direction === 'in') inPence += item.row.amountPence;
    else outPence += item.row.amountPence;
    const bal = runningBalanceByKey.get(item.row.key) ?? null;
    return {
      kind: 'row',
      row: { ...item.row, runningBalancePence: bal },
      order: pendingOrder(item),
    };
  });
  const hiddenRowCount = Math.max(windowRowCount - shownRecordCount, 0);

  // Checkpoint dividers (SPEC §15.3): the reported figure inside the window,
  // sitting below its own date's rows so "everything above the line happened
  // on or after this report" reads correctly in a newest-first list.
  const checkpointRows = db
    .select()
    .from(checkpoints)
    .where(eq(checkpoints.potId, potId))
    .orderBy(desc(checkpoints.effectiveAt), desc(checkpoints.id))
    .limit(200)
    .all();
  for (const checkpoint of checkpointRows) {
    const date = toLocalDateString(checkpoint.effectiveAt);
    if (date < dateFrom || date > dateTo) continue;
    const insertAt = entries.findIndex((entry) => entry.kind === 'row' && entry.row.date < date);
    const divider: ActivityEntry = {
      kind: 'checkpoint',
      checkpoint: {
        key: `checkpoint-${checkpoint.id}`,
        date,
        amountPence: checkpoint.amountPence,
        note: checkpoint.note ?? '',
      },
    };
    if (insertAt === -1) entries.push(divider);
    else entries.splice(insertAt, 0, divider);
  }

  return {
    potId,
    dateFrom,
    dateTo,
    entries,
    totals: {
      inPence,
      outPence,
      rowCount: shownRecordCount,
      hiddenRowCount,
      expectedRowCount,
      expectedInPence,
    },
  };
}

/**
 * The pot All Transactions shows when the URL names none (issue #44): the
 * household's saved default, then the pot labelled "Main account", then the
 * first live pot. `pots` are the live pots in display order.
 */
export function defaultActivityPot<T extends { id: number; label: string }>(
  pots: readonly T[],
  savedDefaultPotId: number | null,
): T | null {
  return (
    pots.find((candidate) => candidate.id === savedDefaultPotId) ??
    pots.find((candidate) => candidate.label.toLowerCase() === 'main account') ??
    pots[0] ??
    null
  );
}

/**
 * One internal transfer as a row of `potId`'s activity: `TX<` on the pot it
 * reached, `TX>` on the pot it left, the other pot's label as the source.
 * Its link is this page's own in-place URL (decision 225) — the transfer's
 * correction and void forms open beneath the row rather than on another
 * page — and it carries the facts those forms start from.
 *
 * Exported for the page's pinned row (`transfer-activity.ts`): the open
 * transfer stays on screen after a save takes it out of the list, so it is
 * projected the same way whether or not it still counts here.
 */
export function transferActivityRow(
  transfer: typeof transfers.$inferSelect,
  potId: number,
  potLabels: ReadonlyMap<number, string>,
  window: { dateFrom: string; dateTo: string },
): ActivityRow {
  const incoming = transfer.toPotId === potId;
  const otherPotId = incoming ? transfer.fromPotId : transfer.toPotId;
  return {
    key: `transfer-${transfer.id}`,
    family: 'transfer',
    recordId: transfer.id,
    date: transfer.occurredDate,
    code: incoming ? 'TX<' : 'TX>',
    source: potLabels.get(otherPotId) ?? 'Another pot',
    category: '',
    extraLines: 0,
    amountPence: transfer.amountPence,
    direction: incoming ? 'in' : 'out',
    note: transfer.note ?? '',
    link: {
      href: transferInPlaceHref(potId, window, transfer.id),
      label: 'Open this transfer',
    },
    secondaryLink: null,
    badge: null,
    runningBalancePence: null,
    transfer: {
      version: transfer.version,
      fromPotId: transfer.fromPotId,
      toPotId: transfer.toPotId,
      fromLabel: potLabels.get(transfer.fromPotId) ?? 'Another pot',
      toLabel: potLabels.get(transfer.toPotId) ?? 'Another pot',
      note: transfer.note,
      enteredBy: transfer.enteredBy,
      voidReason: transfer.voidedAt === null ? null : (transfer.voidReason ?? ''),
    },
    purchase: null,
  };
}

/**
 * One purchase as a row of `potId`'s activity (SPEC §15.3, decisions 101–108
 * and 226): `PUR` for a record the household typed, `DD` / `SO` for one a
 * schedule converted, `REF` for a refund. A purchase that opens in place
 * carries the facts its correction and void forms start from — the transfer
 * row's arrangement (`transferActivityRow` above), and the exact projection
 * the live row goes through, so the panel's row reads the same before and
 * after a save takes it out of the list.
 *
 * The classification is the record's own: a refund is `REF` whatever made it,
 * a converted instance is `DD` or `SO` from its schedule's kind, and anything
 * else is `PUR`. Refunds do **not** open in place, so their row carries no
 * form facts and keeps its link to Purchases.
 *
 * Reads the record's own details (its lines, its supplier or schedule name and
 * its schedule's kind) — used for the page's pinned row; the projection
 * passes what it has already loaded instead of asking again.
 */
export function purchaseActivityRow(
  db: Db,
  purchase: typeof purchases.$inferSelect,
  potId: number,
  window: { dateFrom: string; dateTo: string },
): ActivityRow {
  const lines = db
    .select()
    .from(allocations)
    .where(eq(allocations.purchaseId, purchase.id))
    .orderBy(asc(allocations.id))
    .all();
  const schedule =
    purchase.scheduleInstanceId === null
      ? undefined
      : scheduleKindByInstance(db, [purchase.scheduleInstanceId]).get(purchase.scheduleInstanceId);
  const supplierNames = new Map(
    listSuppliers(db).map((supplier) => [supplier.id, supplier.name] as const),
  );
  const categoryNames = new Map(
    categoryTree(db).flatMap((parent) =>
      parent.children.map((child) => [child.id, `${parent.name} / ${child.name}`] as const),
    ),
  );
  const names = targetNames({ people: listPeople(db), vehicles: listVehicles(db) });
  return purchaseActivityRowFrom(purchase, lines, {
    potId,
    dateFrom: window.dateFrom,
    dateTo: window.dateTo,
    source:
      purchase.supplierId !== null
        ? (supplierNames.get(purchase.supplierId) ?? 'Unknown supplier')
        : (schedule?.name ?? 'Unknown supplier'),
    code: purchaseActivityCode(purchase.refundOfPurchaseId !== null, schedule?.kind),
    scheduleId: schedule?.scheduleId ?? null,
    summary: purchaseLineSummary(lines, categoryNames, names),
  });
}

/** Where a purchase sorts among the rows — the same position whether it is live or pinned. */
export function purchaseActivityOrder(purchase: typeof purchases.$inferSelect): ActivityOrder {
  return {
    at: purchase.occurredAt.getTime(),
    familyRank: ACTIVITY_FAMILY_RANK.purchase,
    recordId: purchase.id,
    key: `purchase-${purchase.id}`,
  };
}

/** `REF` for a refund, else `DD` / `SO` from the schedule that made it, else `PUR`. */
function purchaseActivityCode(
  isRefund: boolean,
  scheduleKind: 'dd' | 'so' | 'receipt' | undefined,
): ActivityCode {
  if (isRefund) return 'REF';
  if (scheduleKind === 'dd') return 'DD';
  if (scheduleKind === 'so') return 'SO';
  return 'PUR';
}

interface PurchaseRowDetail {
  potId: number;
  dateFrom: string;
  dateTo: string;
  /** The supplier's name, or the schedule's name when the record has no supplier. */
  source: string;
  code: ActivityCode;
  /** The schedule this record was converted from, when there is one. */
  scheduleId: number | null;
  /** The first allocation's label, and how many lines follow it. */
  summary: { label: string; extraLines: number };
}

/** One purchase row, from facts the caller already has (the projection and the pinned row both use it). */
function purchaseActivityRowFrom(
  purchase: typeof purchases.$inferSelect,
  lines: ReadonlyArray<typeof allocations.$inferSelect>,
  detail: PurchaseRowDetail,
): ActivityRow {
  return {
    key: `purchase-${purchase.id}`,
    family: 'purchase',
    recordId: purchase.id,
    date: purchase.occurredDate,
    code: detail.code,
    source: detail.source,
    category: detail.summary.label,
    extraLines: detail.summary.extraLines,
    amountPence: Math.abs(purchase.totalPence),
    direction: purchase.totalPence < 0 ? 'in' : 'out',
    note: purchase.note ?? '',
    link: {
      href: `/purchases?potId=${detail.potId}&from=${detail.dateFrom}&to=${detail.dateTo}#purchase-${purchase.id}`,
      label: 'Open this purchase',
    },
    secondaryLink:
      detail.scheduleId === null
        ? null
        : {
            href: `/recurring#schedule-${detail.scheduleId}`,
            label: 'Open the schedule',
          },
    badge: null,
    runningBalancePence: null,
    transfer: null,
    purchase:
      detail.code === 'REF'
        ? null
        : {
            version: purchase.version,
            note: purchase.note,
            enteredBy: purchase.enteredBy,
            voidReason: purchase.voidedAt === null ? null : (purchase.voidReason ?? ''),
            lines: lines.map((line) => ({
              amountPence: line.amountPence,
              categoryId: line.categoryId,
              targetKind: line.targetKind,
              targetId: line.targetId,
            })),
          },
  };
}

/** Where a transfer sorts among the rows — the same position whether it is live or pinned. */
export function transferActivityOrder(transfer: typeof transfers.$inferSelect): ActivityOrder {
  return {
    at: transfer.occurredAt.getTime(),
    familyRank: ACTIVITY_FAMILY_RANK.transfer,
    recordId: transfer.id,
    key: `transfer-${transfer.id}`,
  };
}

/** instance id → the schedule it came from, so DD and SO stay distinct. */
function scheduleKindByInstance(
  db: Db,
  instanceIds: number[],
): Map<number, { scheduleId: number; name: string; kind: 'dd' | 'so' | 'receipt' }> {
  const map = new Map<
    number,
    { scheduleId: number; name: string; kind: 'dd' | 'so' | 'receipt' }
  >();
  if (instanceIds.length === 0) return map;
  const rows = db
    .select({
      instanceId: scheduleInstances.id,
      scheduleId: schedules.id,
      name: schedules.name,
      kind: schedules.kind,
    })
    .from(scheduleInstances)
    .innerJoin(schedules, eq(schedules.id, scheduleInstances.scheduleId))
    .where(inArray(scheduleInstances.id, instanceIds))
    .all();
  for (const row of rows) {
    map.set(row.instanceId, { scheduleId: row.scheduleId, name: row.name, kind: row.kind });
  }
  return map;
}

/**
 * Swap legs shown on this pot, keyed by leg id → the pairing badge. The badge
 * says the same thing the paired list on /pots says (decision 100): balanced,
 * legs differ, or the other leg was voided.
 */
function swapPartnerByExchangeKey(
  db: Db,
  exchangeKeys: string[],
  potId: number,
): Map<number, string> {
  const badges = new Map<number, string>();
  if (exchangeKeys.length === 0) return badges;
  const legs = db
    .select()
    .from(externalMovements)
    .where(
      and(
        eq(externalMovements.kind, 'swap'),
        inArray(externalMovements.exchangeKey, [...new Set(exchangeKeys)]),
      ),
    )
    .all();
  const potLabels = new Map(listPotsIncludingArchived(db).map((pot) => [pot.id, pot.label]));
  const byKey = new Map<string, Array<typeof externalMovements.$inferSelect>>();
  for (const leg of legs) {
    if (leg.exchangeKey === null) continue;
    const list = byKey.get(leg.exchangeKey) ?? [];
    list.push(leg);
    byKey.set(leg.exchangeKey, list);
  }
  for (const leg of legs) {
    if (leg.potId !== potId || leg.exchangeKey === null) continue;
    const partner = byKey.get(leg.exchangeKey)?.find((other) => other.id !== leg.id);
    if (partner === undefined) {
      badges.set(leg.id, 'swap · no paired leg');
      continue;
    }
    const partnerPot = potLabels.get(partner.potId) ?? 'another pot';
    if (partner.voidedAt !== null) {
      badges.set(leg.id, 'swap · other leg voided');
      continue;
    }
    badges.set(
      leg.id,
      partner.amountPence === leg.amountPence
        ? `swap (paired, ${formatPence(partner.amountPence)} with ${partnerPot})`
        : `swap (legs differ, ${formatPence(partner.amountPence)} with ${partnerPot})`,
    );
  }
  return badges;
}

/** Exact live-row count in the window for a single-pot family. */
function countRows(
  db: Db,
  table: typeof purchases | typeof externalMovements | typeof receipts,
  potId: number,
  dateFrom: string,
  dateTo: string,
): number {
  const row = db
    .select({ value: sql<number>`count(*)` })
    .from(table)
    .where(
      and(
        eq(table.potId, potId),
        isNull(table.voidedAt),
        gte(table.occurredDate, dateFrom),
        lte(table.occurredDate, dateTo),
      ),
    )
    .get();
  return row?.value ?? 0;
}

/** Exact live-row count in the window for transfers touching this pot. */
function countTransferRows(db: Db, potId: number, dateFrom: string, dateTo: string): number {
  const row = db
    .select({ value: sql<number>`count(*)` })
    .from(transfers)
    .where(
      and(
        or(eq(transfers.fromPotId, potId), eq(transfers.toPotId, potId)),
        isNull(transfers.voidedAt),
        gte(transfers.occurredDate, dateFrom),
        lte(transfers.occurredDate, dateTo),
      ),
    )
    .get();
  return row?.value ?? 0;
}
