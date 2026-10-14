/**
 * Hide-cancelled filter for the Recurring page's Schedules list (issue #28).
 *
 * Cancelled schedules are kept for history and are shown by default, so a
 * deep link such as `/recurring#schedule-12` always finds its row. The
 * household can hide them with `?hideCancelled=1`; the choice lives in the URL
 * so it survives month paging and reloads, and needs no client state.
 */

/** Only the exact value `1` hides cancelled schedules; anything else shows them. */
export const HIDE_CANCELLED_PARAM = 'hideCancelled';

export function parseHideCancelled(raw: string | undefined): boolean {
  return raw === '1';
}

export interface ScheduleVisibility<T> {
  /** Rows to render, in their original order. */
  visible: T[];
  /** Cancelled rows in the whole list (hidden or not) — drives whether a toggle shows. */
  cancelledCount: number;
  /** Cancelled rows the current choice hides — the toggle's badge. */
  hiddenCount: number;
}

/**
 * `isCancelled` reads the row's cancellation state, so the page can pass its
 * `{ schedule, nextDueDate }` items without reshaping them.
 */
export function filterScheduleVisibility<T>(
  rows: readonly T[],
  isCancelled: (row: T) => boolean,
  hideCancelled: boolean,
): ScheduleVisibility<T> {
  const cancelledCount = rows.filter((row) => isCancelled(row)).length;
  const visible = hideCancelled ? rows.filter((row) => !isCancelled(row)) : [...rows];
  return {
    visible,
    cancelledCount,
    hiddenCount: hideCancelled ? cancelledCount : 0,
  };
}

/**
 * Builds a `/recurring` href that keeps the month and the hide-cancelled choice.
 * Shared by the calendar's Prev/Today/Next links and the Schedules toggle.
 */
export function recurringHref(options: { month?: string; hideCancelled: boolean }): string {
  const params = new URLSearchParams();
  if (options.month !== undefined) params.set('month', options.month);
  if (options.hideCancelled) params.set(HIDE_CANCELLED_PARAM, '1');
  const query = params.toString();
  return query === '' ? '/recurring' : `/recurring?${query}`;
}
