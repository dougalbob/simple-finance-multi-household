/**
 * Where a movement sorts in All Transactions' newest-first list (SPEC §15.3).
 *
 * One deterministic order across the record families: the record's instant,
 * newest first; then a fixed family rank for records sharing an instant
 * (purchases, transfers, boundary money, income, expectations); then the
 * newest record id; then the row key — so a re-render can never reshuffle
 * rows that share an instant.
 *
 * Its own module because two readers need the same order: the projection
 * (`activity.ts`) sorts by it, and the pinned open transfer
 * (`transfer-activity.ts`, decision 225) is placed by it after the
 * projection has run — exactly where the transfer stood while it was live.
 */
export interface ActivityOrder {
  /** Epoch ms of the record's instant. */
  at: number;
  familyRank: number;
  recordId: number;
  key: string;
}

/** The family ranks, in the order records sharing an instant are listed. */
export const ACTIVITY_FAMILY_RANK = {
  purchase: 0,
  transfer: 1,
  external: 2,
  receipt: 3,
  expected: 4,
} as const;

/** Negative when `a` is listed above `b`. */
export function compareActivityOrder(a: ActivityOrder, b: ActivityOrder): number {
  return (
    b.at - a.at ||
    a.familyRank - b.familyRank ||
    b.recordId - a.recordId ||
    a.key.localeCompare(b.key)
  );
}
