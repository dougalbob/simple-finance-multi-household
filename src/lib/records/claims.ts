import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { recordAudit, type DbTx } from '../audit';
import type { Db } from '../db/client';
import {
  claimPurchases,
  claimSettlements,
  claims,
  pots,
  purchases,
  receipts,
  suppliers,
  debts,
} from '../db/schema';
import { formatPence, isValidPenceAmount } from '../money';
import { isValidLocalDate } from '../time';
import { debtBalance, getDebt, type Debt } from './debts';
import { AlreadyVoidError, RecordVoidedError, VersionConflictError } from './errors';
import { resolveOccurred } from './occurred';

/**
 * Money owed to us — reimbursement claims (SPEC §10.3, issue 124).
 *
 * A claim names the third party the household fronted money for and the
 * purchases it covers. Its figures are **derived**, never stored:
 *
 *   claimedPence      = Σ total of the linked, non-voided purchases
 *   settledPence      = Σ amount of the live settlements
 *   outstandingPence  = claimedPence − settledPence
 *
 * Claims never move a pot, an estimate or a projection, and they never touch
 * Insights — the spend stays where it was recorded. A claim closes itself when
 * its settlements bring the outstanding figure to zero (`settled`), and
 * reopens if a void brings outstanding back above zero; only a household
 * `cancel` close is sticky. The one place a claim crosses into another
 * arrangement is the explicit `direct` settlement, which may clear a named
 * informal IOU by the same amount — one audited action, at most one IOU,
 * never automatic.
 */

/** A query surface: the database itself or one of its write transactions. */
type Reader = Db | DbTx;

export type Claim = typeof claims.$inferSelect;
export type ClaimPurchase = typeof claimPurchases.$inferSelect;
export type ClaimSettlement = typeof claimSettlements.$inferSelect;

export class ClaimNotFoundError extends Error {
  constructor(claimId: number) {
    super(`No claim with id ${claimId}`);
    this.name = 'ClaimNotFoundError';
  }
}

export class ClaimSettlementNotFoundError extends Error {
  constructor(settlementId: number) {
    super(`No claim settlement with id ${settlementId}`);
    this.name = 'ClaimSettlementNotFoundError';
  }
}

export class InvalidClaimInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidClaimInputError';
  }
}

export class ClaimNotOpenError extends Error {
  constructor(claimId: number) {
    super(`Claim ${claimId} is not open — closed and cancelled claims cannot be changed.`);
    this.name = 'ClaimNotOpenError';
  }
}

export class PurchaseNotClaimableError extends Error {
  constructor(purchaseId: number, reason: string) {
    super(`Purchase ${purchaseId} cannot be attached to a claim — ${reason}.`);
    this.name = 'PurchaseNotClaimableError';
  }
}

export class ClaimOverSettledError extends Error {
  constructor(outstandingPence: number) {
    super(
      `Only ${formatPence(outstandingPence)} is outstanding on this claim — record anything extra as ordinary income.`,
    );
    this.name = 'ClaimOverSettledError';
  }
}

export class DebtReductionExceedsBalanceError extends Error {
  constructor(counterparty: string, outstandingPence: number) {
    super(
      `That would clear more than is owed to ${counterparty} (${formatPence(outstandingPence)} outstanding). Clear it with the outstanding figure, or record the difference separately.`,
    );
    this.name = 'DebtReductionExceedsBalanceError';
  }
}

export const MAX_CLAIM_COUNTERPARTY_LENGTH = 120;
export const MAX_CLAIM_NOTE_LENGTH = 280;
export const MAX_CLAIM_VOID_REASON_LENGTH = 280;

export interface ClaimTotals {
  /** Σ total of the linked, non-voided purchases. */
  claimedPence: number;
  /** Σ amount of the live settlements. */
  settledPence: number;
  /** claimedPence − settledPence; never negative through the domain. */
  outstandingPence: number;
}

export interface ClaimLinkedPurchase {
  purchaseId: number;
  occurredDate: string;
  totalPence: number;
  supplierName: string | null;
  note: string | null;
  potLabel: string;
}

export interface ClaimWithDetails extends ClaimTotals {
  claim: Claim;
  purchases: ClaimLinkedPurchase[];
  settlements: ClaimSettlement[];
}

function checkedCounterparty(raw: string): string {
  const counterparty = raw.trim().replace(/\s+/g, ' ');
  if (counterparty === '') {
    throw new InvalidClaimInputError('Say who the money is owed by.');
  }
  if (counterparty.length > MAX_CLAIM_COUNTERPARTY_LENGTH) {
    throw new InvalidClaimInputError(
      `Keep the name to ${MAX_CLAIM_COUNTERPARTY_LENGTH} characters or fewer.`,
    );
  }
  return counterparty;
}

function checkedNote(raw: string | null | undefined): string | null {
  if (raw === undefined || raw === null) return null;
  const note = raw.trim();
  if (note === '') return null;
  if (note.length > MAX_CLAIM_NOTE_LENGTH) {
    throw new InvalidClaimInputError(
      `Keep the note to ${MAX_CLAIM_NOTE_LENGTH} characters or fewer.`,
    );
  }
  return note;
}

function checkedVoidReason(raw: string): string {
  const reason = raw.trim().replace(/\s+/g, ' ');
  if (reason === '') {
    throw new InvalidClaimInputError('Say why this is being voided.');
  }
  if (reason.length > MAX_CLAIM_VOID_REASON_LENGTH) {
    throw new InvalidClaimInputError(
      `Keep the reason to ${MAX_CLAIM_VOID_REASON_LENGTH} characters or fewer.`,
    );
  }
  return reason;
}

function checkedActor(raw: string): string {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new InvalidClaimInputError('Every claim records who entered it.');
  }
  return raw.trim();
}

function checkedPurchaseIds(raw: number[]): number[] {
  const ids = [...new Set(raw)];
  if (ids.length === 0) {
    throw new InvalidClaimInputError('Pick at least one purchase the claim covers.');
  }
  for (const id of ids) {
    if (!Number.isInteger(id) || id <= 0) {
      throw new InvalidClaimInputError('Pick purchases from the list.');
    }
  }
  return ids;
}

function checkedPositivePence(raw: number, field: string): number {
  if (!isValidPenceAmount(raw) || raw <= 0) {
    throw new InvalidClaimInputError(`${field} must be a positive whole-pence figure.`);
  }
  return raw;
}

/** Σ total of the claim's linked, non-voided purchases (derived). */
function claimedPunc(db: Reader, claimId: number): number {
  const row = db
    .select({ total: sql<number | null>`sum(${purchases.totalPence})` })
    .from(claimPurchases)
    .innerJoin(purchases, eq(claimPurchases.purchaseId, purchases.id))
    .where(and(eq(claimPurchases.claimId, claimId), isNull(purchases.voidedAt)))
    .get();
  return row?.total ?? 0;
}

/** Σ amount of the claim's live settlements (derived). */
function settledPunc(db: Reader, claimId: number): number {
  const row = db
    .select({ total: sql<number | null>`sum(${claimSettlements.amountPence})` })
    .from(claimSettlements)
    .where(and(eq(claimSettlements.claimId, claimId), isNull(claimSettlements.voidedAt)))
    .get();
  return row?.total ?? 0;
}

function liveSettlements(db: Reader, claimId: number): ClaimSettlement[] {
  return db
    .select()
    .from(claimSettlements)
    .where(and(eq(claimSettlements.claimId, claimId), isNull(claimSettlements.voidedAt)))
    .orderBy(asc(claimSettlements.occurredAt), asc(claimSettlements.id))
    .all();
}

function linkedPurchases(db: Reader, claimId: number): ClaimLinkedPurchase[] {
  return db
    .select({
      purchaseId: purchases.id,
      occurredDate: purchases.occurredDate,
      totalPence: purchases.totalPence,
      supplierName: suppliers.name,
      note: purchases.note,
      potLabel: pots.label,
    })
    .from(claimPurchases)
    .innerJoin(purchases, eq(claimPurchases.purchaseId, purchases.id))
    .innerJoin(pots, eq(purchases.potId, pots.id))
    .leftJoin(suppliers, eq(purchases.supplierId, suppliers.id))
    .where(and(eq(claimPurchases.claimId, claimId), isNull(purchases.voidedAt)))
    .orderBy(asc(purchases.occurredDate), asc(purchases.id))
    .all();
}

export function claimTotals(db: Db, claimId: number): ClaimTotals {
  const claimedPence = claimedPunc(db, claimId);
  const settledPence = settledPunc(db, claimId);
  return { claimedPence, settledPence, outstandingPence: claimedPence - settledPence };
}

function getClaimRow(db: Reader, claimId: number): Claim {
  const row = db.select().from(claims).where(eq(claims.id, claimId)).get();
  if (row === undefined) throw new ClaimNotFoundError(claimId);
  return row;
}

function getClaimLive(db: Reader, claimId: number): Claim {
  const row = getClaimRow(db, claimId);
  if (row.voidedAt !== null) {
    throw new RecordVoidedError('claim', claimId);
  }
  return row;
}

function checkedOpenClaim(db: Reader, claimId: number): Claim {
  const row = getClaimLive(db, claimId);
  if (row.status !== 'open') throw new ClaimNotOpenError(claimId);
  return row;
}

/**
 * Recompute the stored status from the derived figures, inside the write
 * transaction. `settled` closures and reopenings happen here and only here;
 * a household `cancelled` close is sticky and never auto-reopens.
 */
function recomputeClaimStatusTx(
  tx: DbTx,
  claim: Claim,
  now: Date,
): { claim: Claim; changed: boolean } {
  const outstanding = claimedPunc(tx, claim.id) - settledPunc(tx, claim.id);
  const next =
    outstanding <= 0
      ? claim.status === 'closed' && claim.closedReason === 'settled'
        ? null // already closed as settled — nothing to change
        : claim.closedReason === 'cancelled'
          ? null // cancelled stays closed, whatever the arithmetic says
          : { status: 'closed' as const, closedReason: 'settled' as const, closedAt: now }
      : claim.status === 'closed' && claim.closedReason === 'settled'
        ? { status: 'open' as const, closedReason: null, closedAt: null }
        : null;
  if (next === null) return { claim, changed: false };
  const updated = tx
    .update(claims)
    .set({
      status: next.status,
      closedReason: next.closedReason,
      closedAt: next.closedAt,
      updatedAt: now,
      version: claim.version + 1,
    })
    .where(eq(claims.id, claim.id))
    .returning()
    .get();
  return { claim: updated ?? claim, changed: true };
}

/** A purchase is claimable when it is a live, positive, non-refund spend on no live claim. */
function assertClaimablePurchase(
  tx: Reader,
  purchaseId: number,
  claimIdBeingWritten: number | null,
): void {
  const purchase = tx
    .select({
      id: purchases.id,
      totalPence: purchases.totalPence,
      voidedAt: purchases.voidedAt,
      refundOfPurchaseId: purchases.refundOfPurchaseId,
    })
    .from(purchases)
    .where(eq(purchases.id, purchaseId))
    .get();
  if (purchase === undefined) {
    throw new PurchaseNotClaimableError(purchaseId, 'no such purchase');
  }
  if (purchase.voidedAt !== null) {
    throw new PurchaseNotClaimableError(purchaseId, 'it is voided');
  }
  if (purchase.refundOfPurchaseId !== null || purchase.totalPence <= 0) {
    throw new PurchaseNotClaimableError(purchaseId, 'a refund is a purchase, not a claim');
  }
  const existing = tx
    .select({ claimId: claimPurchases.claimId })
    .from(claimPurchases)
    .innerJoin(claims, eq(claimPurchases.claimId, claims.id))
    .where(
      and(
        eq(claimPurchases.purchaseId, purchaseId),
        isNull(claims.voidedAt),
        claimIdBeingWritten === null ? undefined : sql`${claims.id} != ${claimIdBeingWritten}`,
      ),
    )
    .get();
  if (existing !== undefined) {
    throw new PurchaseNotClaimableError(purchaseId, 'another live claim already covers it');
  }
}

export interface CreateClaimInput {
  counterparty: string;
  note?: string | null;
  purchaseIds: number[];
  actor: string;
  now?: Date;
}

export function createClaim(db: Db, input: CreateClaimInput): ClaimWithDetails {
  const now = input.now ?? new Date();
  const actor = checkedActor(input.actor);
  const counterparty = checkedCounterparty(input.counterparty);
  const note = checkedNote(input.note);
  const purchaseIds = checkedPurchaseIds(input.purchaseIds);

  return db.transaction((tx) => {
    for (const purchaseId of purchaseIds) {
      assertClaimablePurchase(tx, purchaseId, null);
    }
    const inserted = tx
      .insert(claims)
      .values({ counterparty, note, createdBy: actor, createdAt: now, updatedAt: now })
      .returning()
      .get();
    if (inserted === undefined) {
      throw new Error('insert claim returned no row');
    }
    for (const purchaseId of purchaseIds) {
      tx.insert(claimPurchases).values({ claimId: inserted.id, purchaseId }).run();
    }
    const totals = {
      claimedPence: claimedPunc(tx, inserted.id),
      settledPence: 0,
      outstandingPence: claimedPunc(tx, inserted.id),
    };
    recordAudit(tx, {
      actor,
      action: 'claim.create',
      entity: 'claim',
      entityId: inserted.id,
      summary: `Tracked £${(totals.claimedPence / 100).toFixed(2)} owed to us by ${counterparty} (${purchaseIds.length} purchase${purchaseIds.length === 1 ? '' : 's'})`,
      after: inserted,
      now,
    });
    return getClaimDetailsTx(tx, inserted.id);
  });
}

/** Reads inside a write transaction — the same shapes as the read paths. */
function getClaimDetailsTx(tx: Reader, claimId: number): ClaimWithDetails {
  const claim = getClaimRow(tx, claimId);
  const totals = claimTotals(tx, claimId);
  return {
    claim,
    ...totals,
    purchases: linkedPurchases(tx, claimId),
    settlements: liveSettlements(tx, claimId),
  };
}

export function getClaimDetails(db: Db, claimId: number): ClaimWithDetails {
  getClaimLive(db, claimId);
  return getClaimDetailsTx(db, claimId);
}

export interface ClaimListOptions {
  /** Which claims to list; 'all' includes closed ones (settled and cancelled). */
  status?: 'open' | 'closed' | 'all';
  limit?: number;
}

export function listClaims(db: Db, options: ClaimListOptions = {}): ClaimWithDetails[] {
  const status = options.status ?? 'all';
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const rows = db
    .select()
    .from(claims)
    .where(and(isNull(claims.voidedAt), status === 'all' ? undefined : eq(claims.status, status)))
    .orderBy(desc(claims.createdAt), desc(claims.id))
    .limit(limit)
    .all();
  return rows.map((claim) => ({
    claim,
    ...claimTotals(db, claim.id),
    purchases: linkedPurchases(db, claim.id),
    settlements: liveSettlements(db, claim.id),
  }));
}

export interface ClaimSummary {
  openCount: number;
  openOutstandingPence: number;
}

export function claimsSummary(db: Db): ClaimSummary {
  const rows = db
    .select({ id: claims.id })
    .from(claims)
    .where(and(isNull(claims.voidedAt), eq(claims.status, 'open')))
    .all();
  let openOutstandingPence = 0;
  for (const row of rows) {
    openOutstandingPence += Math.max(0, claimTotals(db, row.id).outstandingPence);
  }
  return { openCount: rows.length, openOutstandingPence };
}

export interface EditClaimInput {
  id: number;
  expectedVersion: number;
  actor: string;
  now?: Date;
  patch: { counterparty?: string; note?: string | null };
}

export function editClaim(db: Db, input: EditClaimInput): ClaimWithDetails {
  const now = input.now ?? new Date();
  const actor = checkedActor(input.actor);
  return db.transaction((tx) => {
    const current = checkedOpenClaim(tx, input.id);
    if (current.version !== input.expectedVersion) {
      throw new VersionConflictError('claim', input.id, input.expectedVersion, current.version);
    }
    const counterparty =
      input.patch.counterparty === undefined
        ? current.counterparty
        : checkedCounterparty(input.patch.counterparty);
    const note = input.patch.note === undefined ? current.note : checkedNote(input.patch.note);
    const updated = tx
      .update(claims)
      .set({ counterparty, note, updatedAt: now, version: current.version + 1 })
      .where(eq(claims.id, current.id))
      .returning()
      .get();
    if (updated === undefined) throw new Error('update claim returned no row');
    recordAudit(tx, {
      actor,
      action: 'claim.edit',
      entity: 'claim',
      entityId: current.id,
      summary:
        counterparty !== current.counterparty
          ? `Edited claim on “${current.counterparty}” → “${counterparty}”`
          : `Edited claim on “${counterparty}”`,
      before: current,
      after: updated,
      now,
    });
    return getClaimDetailsTx(tx, current.id);
  });
}

export interface DetachPurchaseInput {
  id: number;
  expectedVersion: number;
  purchaseId: number;
  actor: string;
  now?: Date;
}

/** Unlink one purchase from an open claim (a correction, not a void). */
export function detachClaimPurchase(db: Db, input: DetachPurchaseInput): ClaimWithDetails {
  const now = input.now ?? new Date();
  const actor = checkedActor(input.actor);
  return db.transaction((tx) => {
    const current = checkedOpenClaim(tx, input.id);
    if (current.version !== input.expectedVersion) {
      throw new VersionConflictError('claim', input.id, input.expectedVersion, current.version);
    }
    const link = tx
      .select()
      .from(claimPurchases)
      .where(
        and(
          eq(claimPurchases.claimId, current.id),
          eq(claimPurchases.purchaseId, input.purchaseId),
        ),
      )
      .get();
    if (link === undefined) {
      throw new InvalidClaimInputError('That purchase is not attached to this claim.');
    }
    tx.delete(claimPurchases)
      .where(
        and(
          eq(claimPurchases.claimId, current.id),
          eq(claimPurchases.purchaseId, input.purchaseId),
        ),
      )
      .run();
    const remaining = tx
      .select({ purchaseId: claimPurchases.purchaseId })
      .from(claimPurchases)
      .where(eq(claimPurchases.claimId, current.id))
      .all();
    if (remaining.length === 0) {
      throw new InvalidClaimInputError(
        'A claim must cover at least one purchase — void the claim instead.',
      );
    }
    const totalsBefore = { claimed: claimedPunc(tx, current.id) };
    const updated = tx
      .update(claims)
      .set({ updatedAt: now, version: current.version + 1 })
      .where(eq(claims.id, current.id))
      .returning()
      .get();
    recordAudit(tx, {
      actor,
      action: 'claim-purchase.detach',
      entity: 'claim',
      entityId: current.id,
      summary: `Detached purchase #${input.purchaseId} from claim on “${current.counterparty}” (claimed now ${formatPence(totalsBefore.claimed)})`,
      before: current,
      after: updated ?? current,
      now,
    });
    recomputeClaimStatusTx(tx, updated ?? current, now);
    return getClaimDetailsTx(tx, current.id);
  });
}

export interface AttachPurchasesInput {
  id: number;
  expectedVersion: number;
  purchaseIds: number[];
  actor: string;
  now?: Date;
}

/** Attach further purchases to an open claim (the estate keeps adding wake costs). */
export function attachClaimPurchases(db: Db, input: AttachPurchasesInput): ClaimWithDetails {
  const now = input.now ?? new Date();
  const actor = checkedActor(input.actor);
  const purchaseIds = checkedPurchaseIds(input.purchaseIds);
  return db.transaction((tx) => {
    const current = checkedOpenClaim(tx, input.id);
    if (current.version !== input.expectedVersion) {
      throw new VersionConflictError('claim', input.id, input.expectedVersion, current.version);
    }
    for (const purchaseId of purchaseIds) {
      assertClaimablePurchase(tx, purchaseId, current.id);
      tx.insert(claimPurchases).values({ claimId: current.id, purchaseId }).run();
    }
    const updated = tx
      .update(claims)
      .set({ updatedAt: now, version: current.version + 1 })
      .where(eq(claims.id, current.id))
      .returning()
      .get();
    if (updated === undefined) throw new Error('update claim returned no row');
    recordAudit(tx, {
      actor,
      action: 'claim-purchase.attach',
      entity: 'claim',
      entityId: current.id,
      summary: `Attached ${purchaseIds.length} purchase${purchaseIds.length === 1 ? '' : 's'} to claim on “${current.counterparty}”`,
      before: current,
      after: updated,
      now,
    });
    recomputeClaimStatusTx(tx, updated, now);
    return getClaimDetailsTx(tx, current.id);
  });
}

export interface VoidClaimInput {
  id: number;
  expectedVersion: number;
  reason: string;
  actor: string;
  now?: Date;
}

/**
 * Void a claim. Its live settlements are voided with it (so a mis-tracked
 * claim stops reducing any IOU it named); linked income records — money that
 * really arrived — are kept, and the audit says so. Purchases are released.
 */
export function voidClaim(db: Db, input: VoidClaimInput): Claim {
  const now = input.now ?? new Date();
  const actor = checkedActor(input.actor);
  const reason = checkedVoidReason(input.reason);
  return db.transaction((tx) => {
    const current = getClaimLive(tx, input.id);
    if (current.version !== input.expectedVersion) {
      throw new VersionConflictError('claim', input.id, input.expectedVersion, current.version);
    }
    const live = tx
      .select()
      .from(claimSettlements)
      .where(and(eq(claimSettlements.claimId, current.id), isNull(claimSettlements.voidedAt)))
      .all();
    for (const settlement of live) {
      tx.update(claimSettlements)
        .set({
          voidedAt: now,
          voidedBy: actor,
          voidReason: reason,
          version: settlement.version + 1,
        })
        .where(eq(claimSettlements.id, settlement.id))
        .run();
    }
    const updated = tx
      .update(claims)
      .set({
        voidedAt: now,
        voidedBy: actor,
        voidReason: reason,
        updatedAt: now,
        version: current.version + 1,
      })
      .where(eq(claims.id, current.id))
      .returning()
      .get();
    if (updated === undefined) throw new Error('void claim returned no row');
    recordAudit(tx, {
      actor,
      action: 'claim.void',
      entity: 'claim',
      entityId: current.id,
      summary:
        live.length === 0
          ? `Voided claim on “${current.counterparty}” (${reason})`
          : `Voided claim on “${current.counterparty}” and ${live.length} settlement${live.length === 1 ? '' : 's'} (${reason}); linked income records kept`,
      before: current,
      after: updated,
      now,
    });
    return updated;
  });
}

export interface VoidSettlementInput {
  settlementId: number;
  expectedVersion: number;
  reason: string;
  actor: string;
  now?: Date;
}

export function voidSettlement(db: Db, input: VoidSettlementInput): ClaimWithDetails {
  const now = input.now ?? new Date();
  const actor = checkedActor(input.actor);
  const reason = checkedVoidReason(input.reason);
  return db.transaction((tx) => {
    const settlement = tx
      .select()
      .from(claimSettlements)
      .where(eq(claimSettlements.id, input.settlementId))
      .get();
    if (settlement === undefined) throw new ClaimSettlementNotFoundError(input.settlementId);
    if (settlement.voidedAt !== null) {
      throw new AlreadyVoidError('claim settlement', input.settlementId);
    }
    if (settlement.version !== input.expectedVersion) {
      throw new VersionConflictError(
        'claim settlement',
        input.settlementId,
        input.expectedVersion,
        settlement.version,
      );
    }
    const claim = getClaimLive(tx, settlement.claimId);
    tx.update(claimSettlements)
      .set({
        voidedAt: now,
        voidedBy: actor,
        voidReason: reason,
        version: settlement.version + 1,
      })
      .where(eq(claimSettlements.id, settlement.id))
      .run();
    recordAudit(tx, {
      actor,
      action: 'claim-settlement.void',
      entity: 'claim',
      entityId: claim.id,
      summary: `Voided a ${formatPence(settlement.amountPence)} settlement on claim “${claim.counterparty}” (${reason})`,
      before: settlement,
      now,
    });
    recomputeClaimStatusTx(tx, claim, now);
    return getClaimDetailsTx(tx, claim.id);
  });
}

interface SettleCommon {
  id: number;
  expectedVersion: number;
  actor: string;
  now?: Date;
  /** Default: the outstanding figure. Never more than it. */
  amountPence?: number;
  occurredAt?: Date;
  occurredDate?: string;
  note?: string | null;
}

export interface SettleClaimIntoPotInput extends SettleCommon {
  kind: 'pot';
  potId: number;
}

export interface SettleClaimDirectInput extends SettleCommon {
  kind: 'direct';
  /** Required for a direct settlement — the money left the household. */
  note: string;
  /** Optional: the informal IOU this settlement clears by the same amount. */
  reduceDebtId?: number | null;
}

export type SettleClaimInput = SettleClaimIntoPotInput | SettleClaimDirectInput;

function resolveSettlementAmount(
  outstandingPence: number,
  amountPence: number | undefined,
): number {
  const amount = amountPence ?? outstandingPence;
  checkedPositivePence(amount, 'The settlement');
  if (amount > outstandingPence) {
    throw new ClaimOverSettledError(Math.max(0, outstandingPence));
  }
  return amount;
}

export function settleClaim(
  db: Db,
  input: SettleClaimInput,
): { claim: ClaimWithDetails; settlement: ClaimSettlement; receiptId: number | null } {
  const now = input.now ?? new Date();
  const actor = checkedActor(input.actor);

  if (input.kind === 'direct') {
    // The note is the record: saying where the money went is the whole point.
    const note = checkedNote(input.note);
    if (note === null) {
      throw new InvalidClaimInputError(
        'Say where the money went — a note is required for a settlement outside the pots.',
      );
    }
    input = { ...input, note };
  }
  const note = checkedNote(input.note);

  return db.transaction((tx) => {
    const current = checkedOpenClaim(tx, input.id);
    if (current.version !== input.expectedVersion) {
      throw new VersionConflictError('claim', input.id, input.expectedVersion, current.version);
    }
    const outstanding = claimedPunc(tx, current.id) - settledPunc(tx, current.id);
    if (outstanding <= 0) {
      throw new ClaimNotOpenError(current.id);
    }
    const amount = resolveSettlementAmount(outstanding, input.amountPence);
    const occurred = resolveOccurred({
      occurredAt: input.occurredAt,
      occurredDate: input.occurredDate,
      now,
    });

    let settlement: ClaimSettlement | undefined;
    let receiptId: number | null = null;

    if (input.kind === 'pot') {
      const potRow = tx.select({ id: pots.id }).from(pots).where(eq(pots.id, input.potId)).get();
      if (potRow === undefined) {
        throw new InvalidClaimInputError('That pot no longer exists.');
      }
      // The one-off income record is created in the same transaction — the
      // claim and the money can never half-save.
      const receipt = tx
        .insert(receipts)
        .values({
          scheduleInstanceId: null,
          potId: input.potId,
          amountPence: amount,
          occurredAt: occurred.occurredAt,
          occurredDate: occurred.occurredDate,
          enteredBy: actor,
          source: current.counterparty,
          note,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      if (receipt === undefined) throw new Error('insert receipt returned no row');
      receiptId = receipt.id;
      recordAudit(tx, {
        actor,
        action: 'receipt.create',
        entity: 'receipt',
        entityId: receipt.id,
        summary: `Recorded ${formatPence(amount)} of income from ${current.counterparty} — settles a claim, income not spending`,
        after: receipt,
        now,
      });
      settlement = tx
        .insert(claimSettlements)
        .values({
          claimId: current.id,
          amountPence: amount,
          occurredAt: occurred.occurredAt,
          occurredDate: occurred.occurredDate,
          kind: 'pot',
          receiptId: receipt.id,
          reducesDebtId: null,
          note,
          createdBy: actor,
          createdAt: now,
        })
        .returning()
        .get();
    } else {
      let reduceDebtId: number | null = null;
      if (input.reduceDebtId !== undefined && input.reduceDebtId !== null) {
        const debt = getDebt(tx, input.reduceDebtId);
        const debtOutstanding = debtBalance(tx, debt).balancePence;
        if (debtOutstanding < amount) {
          throw new DebtReductionExceedsBalanceError(
            debt.counterparty,
            Math.max(0, debtOutstanding),
          );
        }
        reduceDebtId = debt.id;
      }
      settlement = tx
        .insert(claimSettlements)
        .values({
          claimId: current.id,
          amountPence: amount,
          occurredAt: occurred.occurredAt,
          occurredDate: occurred.occurredDate,
          kind: 'direct',
          receiptId: null,
          reducesDebtId: reduceDebtId,
          note,
          createdBy: actor,
          createdAt: now,
        })
        .returning()
        .get();
    }
    if (settlement === undefined) throw new Error('insert settlement returned no row');

    const { claim: refreshed } = recomputeClaimStatusTx(tx, current, now);
    recordAudit(tx, {
      actor,
      action: input.kind === 'pot' ? 'claim.settle-pot' : 'claim.settle-direct',
      entity: 'claim',
      entityId: current.id,
      summary:
        input.kind === 'pot'
          ? `Settled ${formatPence(amount)} of claim “${current.counterparty}” — money recorded as income`
          : input.reduceDebtId !== undefined && input.reduceDebtId !== null
            ? `Settled ${formatPence(amount)} of claim “${current.counterparty}” — paid directly; reduces the IOU to ${reduceDebtCounterparty(
                tx,
                settlement.reducesDebtId,
              )}`
            : `Settled ${formatPence(amount)} of claim “${current.counterparty}” — paid directly, no pot movement`,
      before: current,
      after: refreshed,
      now,
    });
    return {
      claim: getClaimDetailsTx(tx, current.id),
      settlement,
      receiptId,
    };
  });
}

function reduceDebtCounterparty(db: Reader, debtId: number | null): string {
  if (debtId === null) return 'no IOU';
  const row = db
    .select({ counterparty: debts.counterparty })
    .from(debts)
    .where(eq(debts.id, debtId))
    .get();
  return row?.counterparty ?? 'unknown';
}

export interface ClaimablePurchase {
  id: number;
  occurredDate: string;
  totalPence: number;
  supplierName: string | null;
  note: string | null;
  potLabel: string;
}

/**
 * The purchases a new claim could cover: live, positive, non-refund spends on
 * no live claim, newest first, optionally filtered by a search over supplier,
 * note and date. The picker is deliberately plain — the household is picking
 * "the wake costs", not querying a ledger.
 */
export function listClaimablePurchases(
  db: Db,
  options: { search?: string; limit?: number } = {},
): ClaimablePurchase[] {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const search = options.search?.trim() ?? '';
  const liveClaimPurchase = db
    .select({ purchaseId: claimPurchases.purchaseId })
    .from(claimPurchases)
    .innerJoin(claims, eq(claimPurchases.claimId, claims.id))
    .where(isNull(claims.voidedAt));

  const rows = db
    .select({
      id: purchases.id,
      occurredDate: purchases.occurredDate,
      totalPence: purchases.totalPence,
      supplierName: suppliers.name,
      note: purchases.note,
      potLabel: pots.label,
    })
    .from(purchases)
    .innerJoin(pots, eq(purchases.potId, pots.id))
    .leftJoin(suppliers, eq(purchases.supplierId, suppliers.id))
    .where(
      and(
        isNull(purchases.voidedAt),
        isNull(purchases.refundOfPurchaseId),
        sql`${purchases.totalPence} > 0`,
        sql`${purchases.id} NOT IN (${liveClaimPurchase})`,
        search === ''
          ? undefined
          : sql`(lower(${suppliers.name}) LIKE ${`%${search.toLowerCase()}%`} OR lower(coalesce(${purchases.note}, '')) LIKE ${`%${search.toLowerCase()}%`} OR ${purchases.occurredDate} LIKE ${`%${search}%`})`,
      ),
    )
    .orderBy(desc(purchases.occurredAt), desc(purchases.id))
    .limit(limit)
    .all();
  return rows;
}

/** Every live claim against a given purchase — used by tests and the picker hint. */
export function claimsForPurchase(db: Db, purchaseId: number): Claim[] {
  return db
    .select({ claim: claims })
    .from(claimPurchases)
    .innerJoin(claims, eq(claimPurchases.claimId, claims.id))
    .where(and(eq(claimPurchases.purchaseId, purchaseId), isNull(claims.voidedAt)))
    .all()
    .map((row) => row.claim);
}

/** A settlement linked to a given IOU, with the claim's counterparty for display. */
export interface SettlementReducingDebtRow extends ClaimSettlement {
  claimCounterparty: string | null;
}

/** Settlements linked to a given IOU, oldest first — the Borrowing ledger reads these. */
export function listSettlementRowsReducingDebt(
  db: Reader,
  debtId: number,
): SettlementReducingDebtRow[] {
  return db
    .select({
      settlement: claimSettlements,
      claimCounterparty: claims.counterparty,
    })
    .from(claimSettlements)
    .leftJoin(claims, eq(claimSettlements.claimId, claims.id))
    .where(eq(claimSettlements.reducesDebtId, debtId))
    .orderBy(asc(claimSettlements.occurredAt), asc(claimSettlements.id))
    .all()
    .map((row) => ({ ...row.settlement, claimCounterparty: row.claimCounterparty }));
}
