import type { ActivityEntry, ActivityLink, ActivityRow } from './activity';
import { compareActivityOrder, type ActivityOrder } from './activity-order';
import { addDaysLocal } from './dates';
import type { Transfer } from './transfers';

/**
 * A transfer between the household's own pots opens **in place** on All
 * Transactions (decision 225, GitHub issue #55): its pot name in the row is
 * the way in, and the correction and void forms open in a panel directly
 * beneath that row. Purchases, income and money across the household
 * boundary keep their links to the pages that own them.
 *
 * The open transfer lives in the URL as `?transfer={id}` — one at a time — so
 * the server knows which transfer the household is working on. That matters
 * after a save: a void always takes the transfer out of the list (voided
 * records are never movements), and a correction can too (moved onto two
 * other pots, or re-dated outside the window). Rather than let the row — and
 * the panel with it — vanish under the household's pointer, the page keeps
 * the open transfer on screen as a **pinned row**: at its date, outside the
 * totals, the stripe and the running balance, saying plainly why it no longer
 * counts here. Closing the panel lets it go.
 *
 * Everything here is pure: the page reads the records, these decide.
 */

/** The query parameter that names the open transfer. */
export const OPEN_TRANSFER_PARAM = 'transfer';

/** Why the open transfer is shown pinned instead of as a live row. */
export type PinnedTransferReason =
  /** Voided: no longer a movement anywhere. */
  | 'voided'
  /** Corrected onto two other pots: it no longer touches this one. */
  | 'elsewhere'
  /** Its date is outside the window the page is showing. */
  | 'outside-window'
  /** Inside the window, but past the page's row cap. */
  | 'hidden';

export interface PinnedTransferEntry {
  kind: 'pinned-transfer';
  row: ActivityRow;
  /** Where it sorts — `transferActivityOrder`, the position it held while live. */
  order: ActivityOrder;
  reason: PinnedTransferReason;
}

/** What the All Transactions table renders: the projection, plus at most one pinned transfer. */
export type DisplayEntry = ActivityEntry | PinnedTransferEntry;

export interface ActivityWindow {
  dateFrom: string;
  dateTo: string;
}

/**
 * `?transfer=` as a record id, or null. Only a plain positive integer names a
 * transfer; anything else is ignored rather than failing the page. A repeated
 * parameter takes its last value, the way the page's other parameters do.
 */
export function parseOpenTransferId(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[value.length - 1] : value;
  if (raw === undefined || !/^[1-9][0-9]{0,14}$/.test(raw)) return null;
  return Number(raw);
}

/** The All Transactions URL that shows `potId` over `window` with this transfer open. */
export function transferInPlaceHref(
  potId: number,
  window: ActivityWindow,
  transferId: number,
): string {
  return `/transactions?potId=${potId}&from=${window.dateFrom}&to=${window.dateTo}&${OPEN_TRANSFER_PARAM}=${transferId}#transfer-${transferId}`;
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
 * Where a transfer can be opened in place, seen from one of its pots: that
 * pot's activity over a window containing the transfer's date. The old
 * `/pots?transfer={id}` deep link redirects here, and a pinned row's
 * "see it on…" links use it.
 */
export function transferActivityHref(
  transfer: Pick<Transfer, 'id' | 'occurredDate'>,
  potId: number,
  today: string,
): string {
  return transferInPlaceHref(
    potId,
    activityWindowContaining(transfer.occurredDate, today),
    transfer.id,
  );
}

/**
 * Which pot to open a transfer on when a link names only the transfer: the
 * pot the household usually reviews in All Transactions when the transfer
 * touches it, otherwise the pot the money left.
 */
export function transferViewPotId(
  transfer: Pick<Transfer, 'fromPotId' | 'toPotId'>,
  usualPotId: number | null,
): number {
  return usualPotId !== null &&
    (usualPotId === transfer.fromPotId || usualPotId === transfer.toPotId)
    ? usualPotId
    : transfer.fromPotId;
}

/**
 * Why the open transfer has to be pinned, or null when it is already one of
 * the view's live rows (the ordinary case: the panel simply opens under it).
 * Voided wins over everything else; then a transfer that no longer touches
 * the viewed pot; then a date outside the window; and a live, in-window
 * transfer that is still missing can only have fallen past the row cap.
 */
export function pinnedTransferReason(
  transfer: Pick<Transfer, 'id' | 'fromPotId' | 'toPotId' | 'occurredDate' | 'voidedAt'>,
  view: { potId: number; dateFrom: string; dateTo: string; entries: readonly ActivityEntry[] },
): PinnedTransferReason | null {
  const listed = view.entries.some(
    (entry) =>
      entry.kind === 'row' && entry.row.family === 'transfer' && entry.row.recordId === transfer.id,
  );
  if (listed) return null;
  if (transfer.voidedAt !== null) return 'voided';
  if (transfer.fromPotId !== view.potId && transfer.toPotId !== view.potId) return 'elsewhere';
  if (transfer.occurredDate < view.dateFrom || transfer.occurredDate > view.dateTo) {
    return 'outside-window';
  }
  return 'hidden';
}

/**
 * Where a pinned transfer can be seen as a live row again. Moved onto two
 * other pots: each of those pots' activity (live pots only — a pot that can
 * no longer be selected has no activity page to open). Re-dated outside the
 * window: this pot's activity over a window that holds the new date. A
 * voided transfer is a live row nowhere, and a row past the cap is already
 * inside the window, so neither has anywhere to send the household.
 */
export function pinnedTransferLinks(
  transfer: Pick<Transfer, 'id' | 'fromPotId' | 'toPotId' | 'occurredDate'>,
  reason: PinnedTransferReason,
  context: {
    potId: number;
    livePots: ReadonlyArray<{ id: number; label: string }>;
    today: string;
  },
): ActivityLink[] {
  const liveLabel = (potId: number) =>
    context.livePots.find((candidate) => candidate.id === potId)?.label;
  if (reason === 'elsewhere') {
    return [transfer.fromPotId, transfer.toPotId].flatMap((potId) => {
      const label = liveLabel(potId);
      return label === undefined
        ? []
        : [
            {
              href: transferActivityHref(transfer, potId, context.today),
              label: `See it in ${label}`,
            },
          ];
    });
  }
  if (reason === 'outside-window') {
    const label = liveLabel(context.potId) ?? 'this pot';
    return [
      {
        href: transferActivityHref(transfer, context.potId, context.today),
        label: `Show ${label} around ${transfer.occurredDate}`,
      },
    ];
  }
  return [];
}

/**
 * The entries with the pinned transfer placed exactly where the projection
 * would list it (`compareActivityOrder`): a transfer voided or moved onto
 * other pots stays in the very position it held while live, so the panel
 * the household is using does not jump; a re-dated one moves to its new
 * date — at the top when it is newer than the window, at the bottom when it
 * is older. A checkpoint divider sits below its own date's rows, so the
 * pinned row goes above any divider dated on or before it. It is an addition
 * only: no live entry moves, so the stripe and the totals the page already
 * computed stay exactly as they were.
 */
export function withPinnedTransfer(
  entries: readonly ActivityEntry[],
  pinned: PinnedTransferEntry | null,
): DisplayEntry[] {
  const display: DisplayEntry[] = [...entries];
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
