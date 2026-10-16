import type { ActivityEntry, ActivityRow } from './activity';
import { compareActivityOrder, type ActivityOrder } from './activity-order';
import { addDaysLocal } from './dates';

/**
 * The **in-place panel** contract, shared by the two records that open beneath
 * their own row in All Transactions (SPEC §15.3): an internal transfer
 * (decision 225, GitHub issue #55) and, since decision 226, a purchase — one
 * recorded by hand (`PUR`), a direct debit (`DD`) or a standing order (`SO`).
 * A refund (`REF`) keeps its link to the Purchases page, where its original
 * sits and where the refund/void rules are taught.
 *
 * The open record lives in the URL, one at a time, so the server knows which
 * panel the household is working in — and can keep it on screen after a save
 * takes it out of the projection. Everything here is pure: the page reads the
 * records, these decide. The kind-specific rules live in `transfer-activity.ts`
 * and `purchase-activity.ts`; this module holds only what both need.
 */

/** Which kind of record can be open in place. */
export type InPlaceKind = 'transfer' | 'purchase';

/** The record the URL names as open, if any. */
export interface OpenInPlaceRow {
  kind: InPlaceKind;
  id: number;
}

/** The window of local dates the page is showing. */
export interface ActivityWindow {
  dateFrom: string;
  dateTo: string;
}

/**
 * `?transfer=` (or `?purchase=`) as a record id, or null. Only a plain
 * positive integer names a record; anything else is ignored rather than
 * failing the page. A repeated parameter takes its last value, the way the
 * page's other parameters do.
 */
export function parseOpenRecordId(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[value.length - 1] : value;
  if (raw === undefined || !/^[1-9][0-9]{0,14}$/.test(raw)) return null;
  return Number(raw);
}

/**
 * Which record the page's query parameters name, if any. The two parameters
 * are alternatives — opening one clears the other — so a URL that carries both
 * (typed by hand, or a stale link) resolves to the **transfer**: that is the
 * older contract, and an old `/transactions?transfer=` link keeps its meaning.
 */
export function parseOpenRowParams(params: {
  transfer?: string | string[] | undefined;
  purchase?: string | string[] | undefined;
}): OpenInPlaceRow | null {
  const transferId = parseOpenRecordId(params.transfer);
  if (transferId !== null) return { kind: 'transfer', id: transferId };
  const purchaseId = parseOpenRecordId(params.purchase);
  return purchaseId === null ? null : { kind: 'purchase', id: purchaseId };
}

/**
 * A date window that contains `date`. The page's own default — the last 30
 * days, so the "Last 30 days" quick pick still reads as selected — whenever
 * it can; otherwise about a month around the date, never past today.
 */
export function activityWindowContaining(date: string, today: string): ActivityWindow {
  const defaultFrom = addDaysLocal(today, -29);
  if (date >= defaultFrom) return { dateFrom: defaultFrom, dateTo: today };
  const end = addDaysLocal(date, 15);
  return { dateFrom: addDaysLocal(date, -14), dateTo: end > today ? today : end };
}

/**
 * A record the page keeps on screen even though it is no longer one of the
 * view's live rows: its projection, where it sorts, and — in the kind-specific
 * entries — why it left.
 */
export interface PinnedActivityEntry {
  /** `pinned-transfer` or `pinned-purchase`. */
  kind: `pinned-${InPlaceKind}`;
  row: ActivityRow;
  /** Where it sorts — the position it held while live. */
  order: ActivityOrder;
}

/**
 * The entries with the pinned record placed exactly where the projection would
 * list it (`compareActivityOrder`), so the panel the household is using does
 * not jump: a record voided, or corrected out of the window, stays in the very
 * position it held while live — at the top when it is newer than the window,
 * at the bottom when it is older. A checkpoint divider sits below its own
 * date's rows, so the pinned row goes above any divider dated on or before it.
 * It is an addition only: no live entry moves, so the stripe, the running
 * balance and the totals the page already computed stay exactly as they were.
 */
export function withPinnedEntry<T extends PinnedActivityEntry>(
  entries: readonly ActivityEntry[],
  pinned: T | null,
): Array<ActivityEntry | T> {
  const display: Array<ActivityEntry | T> = [...entries];
  if (pinned === null) return display;
  const insertAt = display.findIndex((entry) =>
    entry.kind === 'checkpoint'
      ? entry.checkpoint.date <= pinned.row.date
      : entry.kind === 'row' && compareActivityOrder(pinned.order, entry.order) < 0,
  );
  if (insertAt === -1) display.push(pinned);
  else display.splice(insertAt, 0, pinned);
  return display;
}
