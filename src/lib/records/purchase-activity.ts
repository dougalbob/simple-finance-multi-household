import type { ActivityEntry, ActivityLink, ActivityRow } from './activity';
import type { ActivityOrder } from './activity-order';
import {
  activityWindowContaining,
  parseOpenRecordId,
  withPinnedEntry,
  type ActivityWindow,
  type PinnedActivityEntry,
} from './in-place-activity';
import type { Purchase } from './purchases';

/**
 * A purchase opens **in place** on All Transactions (decision 226, GitHub
 * issue #57), exactly as a transfer does (decision 225): the supplier or
 * schedule name in the row is the way in, and the record's correction and void
 * forms open in a panel directly beneath that row. The rows that open this way
 * are the ones the household asked for by their classifications — `PUR` (a
 * purchase recorded by hand), `DD` (a direct debit a schedule converted) and
 * `SO` (a standing order it converted), which are all the same record with the
 * same canonical editor on the Purchases page.
 *
 * A **refund** (`REF`) keeps its link to Purchases: it is a purchase record
 * too, but its amount lives in the negative and its form belongs beside the
 * original it was refunded against, where the Purchases page teaches both.
 *
 * The open purchase lives in the URL as `?purchase={id}` — one record open at
 * a time, shared with the transfer contract — so the server knows which panel
 * the household is working in. That matters after a save: a void always takes
 * the purchase out of the list (voided records are never movements), and a
 * correction can too (re-dated outside the window). Rather than let the row —
 * and the panel with it — vanish under the household's pointer, the page keeps
 * the open purchase on screen as a **pinned row**: at the position it held
 * while live, outside the totals, the stripe and the running balance, saying
 * plainly why it no longer counts here. Closing the panel lets it go.
 *
 * Everything here is pure: the page reads the records, these decide.
 */

/** The query parameter that names the open purchase. */
export const OPEN_PURCHASE_PARAM = 'purchase';

/** Why the open purchase is shown pinned instead of as a live row. */
export type PinnedPurchaseReason =
  /** Voided: no longer a movement anywhere. */
  | 'voided'
  /** Its date is outside the window the page is showing. */
  | 'outside-window'
  /** Inside the window, but past the page's row cap. */
  | 'hidden';

export interface PinnedPurchaseEntry extends PinnedActivityEntry {
  kind: 'pinned-purchase';
  reason: PinnedPurchaseReason;
}

/**
 * `?purchase=` as a record id, or null (`parseOpenRecordId`: only a plain
 * positive integer names a purchase).
 */
export function parseOpenPurchaseId(value: string | string[] | undefined): number | null {
  return parseOpenRecordId(value);
}

/** The All Transactions URL that shows `potId` over `window` with this purchase open. */
export function purchaseInPlaceHref(
  potId: number,
  window: ActivityWindow,
  purchaseId: number,
): string {
  return `/transactions?potId=${potId}&from=${window.dateFrom}&to=${window.dateTo}&${OPEN_PURCHASE_PARAM}=${purchaseId}#purchase-${purchaseId}`;
}

/**
 * Where a purchase can be opened in place, seen from the pot the page is
 * showing: that pot's activity over a window containing the purchase's date.
 * A pinned row's "show it again" link uses it.
 */
export function purchaseActivityHref(
  purchase: Pick<Purchase, 'id' | 'occurredDate'>,
  potId: number,
  today: string,
): string {
  return purchaseInPlaceHref(
    potId,
    activityWindowContaining(purchase.occurredDate, today),
    purchase.id,
  );
}

/**
 * Why the open purchase has to be pinned, or null when it is already one of
 * the view's live rows (the ordinary case: the panel simply opens under it).
 * Voided wins over everything else; then a date outside the window; and a
 * live, in-window purchase that is still missing can only have fallen past the
 * row cap. A purchase is never pinned as "elsewhere": unlike a transfer, the
 * correction form cannot move it to another pot.
 */
export function pinnedPurchaseReason(
  purchase: Pick<Purchase, 'id' | 'occurredDate' | 'voidedAt'>,
  view: { dateFrom: string; dateTo: string; entries: readonly ActivityEntry[] },
): PinnedPurchaseReason | null {
  const listed = view.entries.some(
    (entry) =>
      entry.kind === 'row' && entry.row.family === 'purchase' && entry.row.recordId === purchase.id,
  );
  if (listed) return null;
  if (purchase.voidedAt !== null) return 'voided';
  if (purchase.occurredDate < view.dateFrom || purchase.occurredDate > view.dateTo) {
    return 'outside-window';
  }
  return 'hidden';
}

/**
 * Where a pinned purchase can be seen again, in the household's words. Re-dated
 * outside the window: this pot's activity over a window that holds the new
 * date. Voided: the Purchases page, where the Voided toggle lists it and its
 * reason is kept — the one place a voided purchase is still readable, because
 * it is not a movement anywhere. A row past the cap is already inside the
 * window, so it has nowhere to send the household.
 */
export function pinnedPurchaseLinks(
  purchase: Pick<Purchase, 'id' | 'occurredDate'>,
  reason: PinnedPurchaseReason,
  context: {
    potId: number;
    livePots: ReadonlyArray<{ id: number; label: string }>;
    today: string;
  },
): ActivityLink[] {
  const liveLabel = (potId: number) =>
    context.livePots.find((candidate) => candidate.id === potId)?.label;
  if (reason === 'outside-window') {
    const label = liveLabel(context.potId) ?? 'this pot';
    return [
      {
        href: purchaseActivityHref(purchase, context.potId, context.today),
        label: `Show ${label} around ${purchase.occurredDate}`,
      },
    ];
  }
  if (reason === 'voided') {
    return [
      {
        href: `/purchases?voidedOnly=1#purchase-${purchase.id}`,
        label: 'See it on Purchases',
      },
    ];
  }
  return [];
}

/**
 * The entries with the pinned purchase placed exactly where the projection
 * would list it — `withPinnedEntry` in the shared in-place contract, so a
 * pinned purchase lands by the very same rule as a pinned transfer.
 */
export function withPinnedPurchase(
  entries: readonly ActivityEntry[],
  pinned: PinnedPurchaseEntry | null,
): Array<ActivityEntry | PinnedPurchaseEntry> {
  return withPinnedEntry(entries, pinned);
}
