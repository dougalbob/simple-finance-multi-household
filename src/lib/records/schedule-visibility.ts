/**
 * Hide-cancelled filter and search filter for the Recurring page's Schedules list
 * (issues #28, #34, #35).
 *
 * Cancelled schedules are kept for history and are shown by default, so a
 * deep link such as `/recurring#schedule-12` always finds its row. The
 * household can hide them with `?hideCancelled=1`; the choice lives in the URL
 * and is remembered across page navigation in a device cookie (decision 214).
 *
 * An in-place filter search box filters schedules by name or supplier. When a
 * query is active, matching cancelled schedules are kept visible even if cancelled
 * schedules are otherwise hidden (issue #34).
 */

/** Only the exact value `1` hides cancelled schedules; anything else shows them. */
export const HIDE_CANCELLED_PARAM = 'hideCancelled';
export const SCHEDULE_HIDE_CANCELLED_COOKIE = 'sf_hide_cancelled_schedules';
export const SCHEDULE_HIDE_CANCELLED_COOKIE_MAX_AGE = 31536000; // 1 year

export function parseHideCancelled(raw: string | undefined): boolean {
  return raw === '1';
}

/**
 * Resolves whether cancelled schedules should be hidden.
 * Query parameter takes precedence over the device cookie; if neither is set,
 * cancelled schedules stay visible by default.
 */
export function resolveHideCancelled(
  paramValue: string | undefined,
  cookieValue: string | undefined,
): boolean {
  if (paramValue !== undefined) {
    return parseHideCancelled(paramValue);
  }
  if (cookieValue !== undefined) {
    return parseHideCancelled(cookieValue);
  }
  return false;
}

export interface ScheduleVisibility<T> {
  /** Rows to render, in their original order. */
  visible: T[];
  /** Cancelled rows in the whole list (hidden or not) — drives whether a toggle shows. */
  cancelledCount: number;
  /** Cancelled rows the current choice hides — the toggle's badge. */
  hiddenCount: number;
}

export function defaultMatchesScheduleQuery(row: unknown, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  let name = '';
  let supplierName: string | null = null;
  if (typeof row === 'object' && row !== null) {
    const record = row as Record<string, unknown>;
    if (
      'schedule' in record &&
      typeof record.schedule === 'object' &&
      record.schedule !== null &&
      'name' in (record.schedule as Record<string, unknown>)
    ) {
      name = String((record.schedule as Record<string, unknown>).name);
    } else if ('name' in record) {
      name = String(record.name);
    }
    if ('supplierName' in record && typeof record.supplierName === 'string') {
      supplierName = record.supplierName;
    }
  }
  return (
    name.toLowerCase().includes(q) ||
    (supplierName !== null && supplierName.toLowerCase().includes(q))
  );
}

/**
 * `isCancelled` reads the row's cancellation state, so the page can pass its
 * `{ schedule, nextDueDate }` items without reshaping them.
 * When `query` is provided, matching rows are returned; matching cancelled
 * rows are NOT hidden (issue #34).
 */
export function filterScheduleVisibility<T>(
  rows: readonly T[],
  isCancelled: (row: T) => boolean,
  hideCancelled: boolean,
  query?: string,
  matchesQuery?: (row: T, q: string) => boolean,
): ScheduleVisibility<T> {
  const cancelledCount = rows.filter((row) => isCancelled(row)).length;
  const q = query?.trim() ?? '';
  const matcher = matchesQuery ?? defaultMatchesScheduleQuery;

  if (q !== '') {
    // When a search/filter query is active, only matching rows are kept.
    // If a matching schedule is cancelled, it is displayed even if hideCancelled is on.
    const matching = rows.filter((row) => matcher(row, q));
    return {
      visible: matching,
      cancelledCount,
      hiddenCount: 0,
    };
  }

  const visible = hideCancelled ? rows.filter((row) => !isCancelled(row)) : [...rows];
  return {
    visible,
    cancelledCount,
    hiddenCount: hideCancelled ? cancelledCount : 0,
  };
}

/**
 * Builds a `/recurring` href that keeps the month, the hide-cancelled choice,
 * and an optional search query / anchor.
 */
export function recurringHref(options: {
  month?: string;
  hideCancelled?: boolean;
  q?: string;
  hash?: string;
}): string {
  const params = new URLSearchParams();
  if (options.month !== undefined) params.set('month', options.month);
  if (options.hideCancelled) params.set(HIDE_CANCELLED_PARAM, '1');
  if (options.q !== undefined && options.q.trim() !== '') {
    params.set('q', options.q.trim());
  }
  const query = params.toString();
  const base = query === '' ? '/recurring' : `/recurring?${query}`;
  return options.hash !== undefined && options.hash !== '' ? `${base}#${options.hash}` : base;
}

/**
 * Builds the deep link from a Supplier card to a specific recurring schedule (issue #34).
 * Filters the recurring schedules list to the schedule name and anchors to its row.
 */
export function scheduleRecurringHref(schedule: { id: number; name: string }): string {
  return recurringHref({ q: schedule.name, hash: `schedule-${schedule.id}` });
}
