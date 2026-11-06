import { formatPence } from '../money';
import { toLocalDateString } from '../time';
import { addDaysLocal } from './dates';
import {
  debtBalanceLabel,
  expectedInflowOccurrences,
  expectedInflowPotId,
  listDebtsWithBalances,
  type Debt,
  type DebtDirection,
} from './debts';
import type { Db } from '../db/client';
import { listExternalMovements, type ExternalMovement } from './external-movements';
import { listSettlementRowsReducingDebt } from './claims';

/**
 * The Borrowing page's view layer (GitHub issue #60,
 * docs/BORROWING_PAGE_PLAN.md): one combined transaction-style ledger over
 * the household's informal debts, with a From/To filter and a per-person
 * running balance drawn the way the household's own tables drew it —
 * **negative = we owe, positive = owed to us**.
 *
 * Everything here is a reshape over records the domain already keeps
 * (SPEC §10.2): loan movements and each debt's derived balance and expected
 * support occurrences. Nothing is stored; the ledger cannot drift from the
 * movements it lists.
 */

/** How far ahead the ledger shows a plan's expected rows (the plan itself may run longer). */
const EXPECTED_LOOKAHEAD_DAYS = 365;

/**
 * How many expected rows a single plan previews in the ledger.
 *
 * **One** (issue #68): a plan on a cadence shows only its **next** expected
 * occurrence — "expected — not yet recorded" — because the ledger is a
 * history of what happened, and a wall of identical greyed future rows says
 * nothing the person's card does not already say ("Expecting £1,000.00 on
 * day 12 of each month"). The plan itself is unchanged: every occurrence
 * still projects into the money views, exactly as before.
 */
const EXPECTED_ROWS_PER_DEBT = 1;

export interface BorrowingExpected {
  debtId: number;
  amountPence: number;
  dueDate: string;
  /** The weekend shift moved this occurrence off its configured day (decision 7). */
  shifted: boolean;
  configuredDate: string;
}

export interface BorrowingDebtLine {
  debt: Debt;
  /** Domain convention: positive = outstanding, zero = settled, negative = overpaid. */
  balancePence: number;
  movementCount: number;
  totalMovementCount: number;
  /** Honest words (decisions 167/168): awaiting / Nothing owing / overpaid / we owe … */
  statusLabel: string;
  /** Ledger convention: **negative = we owe, positive = owed to us**. */
  signedBalancePence: number;
  /** The plan's next expected occurrence, or null when nothing is expected. */
  nextExpected: BorrowingExpected | null;
}

export interface BorrowingPerson {
  /** The counterparty as displayed — one person may carry two IOUs, never netted. */
  label: string;
  lines: BorrowingDebtLine[];
  /** Chip text: "we owe £2,500 · owed to us £50", honest words beside the sign. */
  positionLabel: string;
  /** The earliest of the person's lines' next expected occurrences, if any. */
  nextExpected: BorrowingExpected | null;
}

export interface BorrowingMovementRow {
  kind: 'movement';
  /** Row key: `movement-{id}`. */
  key: string;
  id: number;
  date: string;
  movement: ExternalMovement;
  debtId: number;
  counterparty: string;
  direction: DebtDirection;
  /** Money in = borrowed (`we_owe`) or repaid to us (`they_owe`); money out mirrors it. */
  moneyIn: boolean;
  /**
   * The debt's signed balance **after** this row (ledger convention), live
   * rows only — a voided row never moved the balance, so it shows none.
   */
  runningBalancePence: number | null;
  voided: boolean;
}

export interface BorrowingExpectedRow {
  kind: 'expected';
  /** Row key: `expected-{debtId}-{dueDate}`. */
  key: string;
  date: string;
  debtId: number;
  counterparty: string;
  direction: DebtDirection;
  amountPence: number;
  shifted: boolean;
  configuredDate: string;
  runningBalancePence: null;
}

export interface BorrowingSettlementRow {
  kind: 'settlement';
  /** Row key: `settlement-{id}`. */
  key: string;
  id: number;
  date: string;
  /** The IOU's counterparty — the From/To filter value, like a movement row. */
  counterparty: string;
  /** The claim whose settlement this is — what the money was settling. */
  claimCounterparty: string | null;
  /** The claim the settlement belongs to. */
  claimId: number;
  debtId: number;
  amountPence: number;
  /** Money in = settlement cleared a `they_owe` IOU; mirrors the movements' convention. */
  moneyIn: boolean;
  /** The debt's signed balance **after** this row (ledger convention), live rows only. */
  runningBalancePence: number | null;
  voided: boolean;
  note: string | null;
}

export type BorrowingLedgerRow =
  BorrowingMovementRow | BorrowingExpectedRow | BorrowingSettlementRow;

export interface BorrowingLedger {
  people: BorrowingPerson[];
  rows: BorrowingLedgerRow[];
}

export interface BorrowingLedgerOptions {
  /** From/To filter: the exact counterparty shown on the rows, or undefined for all. */
  who?: string | undefined;
  /** Newest first (the default since issue #68) or oldest first. */
  order?: 'oldest' | 'newest';
  /** Ledger `today` — expected rows project strictly after it. Tests pass a fixed date. */
  today?: string;
}

/** Signed ledger balance: `we_owe` outstanding reads negative (we owe), `they_owe` positive. */
export function signedBalancePence(direction: DebtDirection, outstandingPence: number): number {
  return direction === 'we_owe' ? -outstandingPence : outstandingPence;
}

/**
 * True when the arrangement owes nothing at all (issue #68): the balance is
 * zero, or overpaid. A repayment then has nothing to repay, so the page
 * greys the repayment action out rather than offering a form that can only
 * be refused. Borrowing more is always allowed.
 */
export function nothingOwed(balancePence: number): boolean {
  return balancePence <= 0;
}

/** The balance cell, in the ledger's own convention: "−£1,000" / "£75 (owed)" / "—". */
export function formatSignedBalancePence(pence: number | null): string {
  if (pence === null) return '—';
  if (pence === 0) return '£0.00';
  const magnitude = formatPence(Math.abs(pence));
  return pence < 0 ? `−${magnitude}` : `${magnitude} (owed)`;
}

export function describeLoanMovement(
  movement: Pick<ExternalMovement, 'direction' | 'counterparty'>,
  direction: DebtDirection,
): string {
  const who = movement.counterparty;
  if (direction === 'we_owe') {
    return movement.direction === 'in' ? `Borrowed from ${who}` : `Repaid ${who}`;
  }
  return movement.direction === 'out' ? `Lent to ${who}` : `${who} repaid us`;
}

/**
 * The plain-words pot line the detail panel leads with (the issue's "into
 * which pot did the Amt in land, was it paid in cash or was it a bank
 * transfer"). The pot is the fact; the note carries the route when it
 * matters (decision: pot + note, no "how" field).
 */
export function potLandingPhrase(
  pot: { label: string; kind: 'bank' | 'cash' | 'credit-card' },
  direction: 'in' | 'out',
): string {
  const asCash = pot.kind === 'cash';
  return direction === 'in'
    ? asCash
      ? `Came in as cash to ${pot.label}.`
      : `Came in to ${pot.label}.`
    : asCash
      ? `Went out as cash from ${pot.label}.`
      : `Went out from ${pot.label}.`;
}

/** One debt's contribution to a person's chip text, in honest words. */
function linePositionLabel(line: BorrowingDebtLine): string {
  return debtBalanceLabel(line.debt, line.balancePence, line.movementCount);
}

function personPositionLabel(lines: BorrowingDebtLine[]): string {
  return lines.map(linePositionLabel).join(' · ');
}

function expectedForDebt(db: Db, debt: Debt, today: string): BorrowingExpected[] {
  const potId = expectedInflowPotId(db, debt);
  if (potId === null) return [];
  return expectedInflowOccurrences(
    db,
    debt,
    today,
    addDaysLocal(today, EXPECTED_LOOKAHEAD_DAYS),
    potId,
  )
    .slice(0, EXPECTED_ROWS_PER_DEBT)
    .map((occurrence) => ({
      debtId: occurrence.debtId,
      amountPence: occurrence.amountPence,
      dueDate: occurrence.dueDate,
      shifted: occurrence.shifted,
      configuredDate: occurrence.configuredDate,
    }));
}

/**
 * The combined ledger: every loan movement (live and voided — history keeps)
 * plus each plan's **next** expected row, newest first by default (issue
 * #68). A row's running balance is its **debt's** balance after it (never
 * netted across the two IOUs one person may hold), signed as the household's
 * tables draw it.
 */
export function buildBorrowingLedger(
  db: Db,
  options: BorrowingLedgerOptions = {},
): BorrowingLedger {
  const today = options.today ?? toLocalDateString(new Date());
  const order = options.order ?? 'newest';
  const who = options.who;

  const debtLines: BorrowingDebtLine[] = listDebtsWithBalances(db).map(
    ({ debt, balancePence, movementCount, totalMovementCount }) => {
      const expected = expectedForDebt(db, debt, today).sort((a, b) =>
        a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0,
      );
      return {
        debt,
        balancePence,
        movementCount,
        totalMovementCount,
        statusLabel: debtBalanceLabel(debt, balancePence, movementCount),
        signedBalancePence: signedBalancePence(debt.direction, balancePence),
        nextExpected: expected[0] ?? null,
      };
    },
  );

  const people: BorrowingPerson[] = [];
  const peopleByName = new Map<string, BorrowingPerson>();
  for (const line of debtLines) {
    const existing = peopleByName.get(line.debt.counterparty);
    if (existing !== undefined) {
      existing.lines.push(line);
    } else {
      const person: BorrowingPerson = {
        label: line.debt.counterparty,
        lines: [line],
        positionLabel: '',
        nextExpected: null,
      };
      peopleByName.set(line.debt.counterparty, person);
      people.push(person);
    }
  }
  for (const person of people) {
    person.positionLabel = personPositionLabel(person.lines);
    person.nextExpected =
      person.lines
        .map((line) => line.nextExpected)
        .filter((expected): expected is BorrowingExpected => expected !== null)
        .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0))[0] ?? null;
  }

  const debtById = new Map(debtLines.map((line) => [line.debt.id, line.debt]));
  const rows: BorrowingLedgerRow[] = [];

  // Movement and settlement rows, with the running balance walked in true
  // chronological order per debt (voided rows never move it), whatever display
  // order the household asked for.
  const movements = listExternalMovements(db, { kind: 'loan', includeVoided: true, limit: 1000 });
  const byDebt = new Map<number, ExternalMovement[]>();
  for (const movement of movements) {
    if (movement.debtId === null) continue;
    const list = byDebt.get(movement.debtId);
    if (list === undefined) byDebt.set(movement.debtId, [movement]);
    else list.push(movement);
  }
  const settlementDebtIds = new Set<number>();
  for (const debt of debtById.values()) {
    settlementDebtIds.add(debt.id);
  }
  // Settlements reducing an IOU with no loan movements at all still belong in
  // that arrangement's ledger — they are why its balance moved.
  const allMovementDebtIds = new Set([...byDebt.keys()]);
  for (const debtId of settlementDebtIds) {
    allMovementDebtIds.add(debtId);
  }
  type LedgerEntry =
    | { sort: 'movement'; at: number; id: number; movement: ExternalMovement }
    | {
        sort: 'settlement';
        at: number;
        id: number;
        settlement: ReturnType<typeof listSettlementRowsReducingDebt>[number];
      };
  const chronologicalByDebt = new Map<number, LedgerEntry[]>();
  for (const debtId of allMovementDebtIds) {
    const entries: LedgerEntry[] = [];
    for (const movement of byDebt.get(debtId) ?? []) {
      entries.push({
        sort: 'movement',
        at: movement.occurredAt.getTime(),
        id: movement.id,
        movement,
      });
    }
    for (const settlement of listSettlementRowsReducingDebt(db, debtId)) {
      entries.push({
        sort: 'settlement',
        at: settlement.occurredAt.getTime(),
        id: settlement.id,
        settlement,
      });
    }
    entries.sort((a, b) =>
      a.at !== b.at
        ? a.at - b.at
        : a.sort === b.sort
          ? a.id - b.id
          : a.sort === 'movement'
            ? -1
            : 1,
    );
    chronologicalByDebt.set(debtId, entries);
  }
  for (const [debtId, entries] of chronologicalByDebt) {
    const debt = debtById.get(debtId);
    if (debt === undefined) continue;
    const chronological = entries;
    let outstanding = 0;
    for (const entry of chronological) {
      if (entry.sort === 'settlement') {
        const settlement = entry.settlement;
        const live = settlement.voidedAt === null;
        if (live) outstanding -= settlement.amountPence;
        rows.push({
          kind: 'settlement',
          key: `settlement-${settlement.id}`,
          id: settlement.id,
          date: settlement.occurredDate,
          counterparty: debt.counterparty,
          claimCounterparty: settlement.claimCounterparty,
          claimId: settlement.claimId,
          debtId,
          amountPence: settlement.amountPence,
          moneyIn: debt.direction === 'they_owe',
          runningBalancePence: live ? signedBalancePence(debt.direction, outstanding) : null,
          voided: !live,
          note: settlement.note,
        });
        continue;
      }
      const movement = entry.movement;
      {
        const raises =
          (debt.direction === 'we_owe' && movement.direction === 'in') ||
          (debt.direction === 'they_owe' && movement.direction === 'out');
        const live = movement.voidedAt === null;
        if (live) outstanding += raises ? movement.amountPence : -movement.amountPence;
        rows.push({
          kind: 'movement',
          key: `movement-${movement.id}`,
          id: movement.id,
          date: movement.occurredDate,
          movement,
          debtId,
          counterparty: debt.counterparty,
          direction: debt.direction,
          moneyIn: movement.direction === 'in',
          runningBalancePence: live ? signedBalancePence(debt.direction, outstanding) : null,
          voided: !live,
        });
      }
    }
  }

  // Expected rows: each plan's future occurrences, strictly after today
  // (SPEC §10.2). A month already answered by a live movement is silenced by
  // `expectedInflowOccurrences` itself — recording the real Borrow is what
  // takes it out of the ledger's future.
  for (const line of debtLines) {
    for (const expected of expectedForDebt(db, line.debt, today)) {
      rows.push({
        kind: 'expected',
        key: `expected-${expected.debtId}-${expected.dueDate}`,
        date: expected.dueDate,
        debtId: expected.debtId,
        counterparty: line.debt.counterparty,
        direction: line.debt.direction,
        amountPence: expected.amountPence,
        shifted: expected.shifted,
        configuredDate: expected.configuredDate,
        runningBalancePence: null,
      });
    }
  }

  const filtered = who === undefined ? rows : rows.filter((row) => row.counterparty === who);
  filtered.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    // On one date: recorded rows before expected ones, then the record's own
    // instant/id — a stable order a re-render cannot reshuffle.
    const recorded = (kind: BorrowingLedgerRow['kind']) => kind !== 'expected';
    if (recorded(a.kind) !== recorded(b.kind)) return recorded(a.kind) ? -1 : 1;
    if (a.kind === 'movement' && b.kind === 'movement') {
      const delta = a.movement.occurredAt.getTime() - b.movement.occurredAt.getTime();
      if (delta !== 0) return delta;
      return a.id - b.id;
    }
    if (a.kind === 'movement' && b.kind === 'settlement') return -1;
    if (a.kind === 'settlement' && b.kind === 'movement') return 1;
    if (a.kind === 'settlement' && b.kind === 'settlement') return a.id - b.id;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
  const rowsInOrder = order === 'oldest' ? filtered : [...filtered].reverse();

  return { people, rows: rowsInOrder };
}
