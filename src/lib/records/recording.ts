import { and, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { purchases } from '../db/schema';

/**
 * The local date the household's recording began: the earliest non-voided
 * purchase that was entered by hand (SPEC §16.7 B, decision 183).
 *
 * Schedule-converted purchases are left out. Backdating a direct debit
 * writes its past instances as purchases, and those say nothing about
 * whether the shop was being recorded at the time.
 *
 * Null when nothing has been recorded yet. Dates are 'YYYY-MM-DD' in
 * Europe/London, so the string minimum is the earliest date.
 */
export function firstRecordedPurchaseDate(db: Db): string | null {
  const row = db
    .select({ first: sql<string | null>`min(${purchases.occurredDate})` })
    .from(purchases)
    .where(and(isNull(purchases.voidedAt), isNull(purchases.scheduleInstanceId)))
    .get();
  return row?.first ?? null;
}

/**
 * The local date of the earliest dated spending entry of **any** kind —
 * hand-entered or schedule-generated (the two-month comparison chart,
 * decision 246).
 *
 * Deliberately different from `firstRecordedPurchaseDate` above: for the
 * qualifying-month rule the household's position is that spending is
 * always a mixture of recurring bills and other purchases, so a scheduled
 * entry dated in a month is evidence enough that the household was
 * recording its spending then. Recording is taken to be complete from
 * this date onwards. The honesty loop's stricter hand-entered-only rule
 * (decision 183) is unchanged.
 *
 * Null when nothing has been recorded yet.
 */
export function firstSpendingEntryDate(db: Db): string | null {
  const row = db
    .select({ first: sql<string | null>`min(${purchases.occurredDate})` })
    .from(purchases)
    .where(isNull(purchases.voidedAt))
    .get();
  return row?.first ?? null;
}
