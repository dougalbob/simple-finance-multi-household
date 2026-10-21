/**
 * The date presets behind one drop-down on All Transactions (GitHub issue #98)
 * and on Purchases (the follow-up in the same session): pure and
 * framework-free, so the calendar edges — month starts, the 30-day lookback
 * across a month or year boundary, a leap February — are unit-tested without
 * a browser. The All Transactions select is
 * `src/components/activity-filters.tsx`; the Purchases one is
 * `src/components/purchase-filter-form.tsx`.
 *
 * Every preset ends at `today`: no record can be dated in the future
 * (SPEC §9.1), so offering one would only be a promise the list cannot keep.
 */

import { addDaysLocal } from './dates';

/**
 * The earliest date "All" asks for. A sentinel is deliberate: the page's date
 * window is plain URL state, and it must go on meaning the same thing when an
 * older record is added. `1970-01-01` predates every record the app can hold
 * (dates are local calendar dates, and the household's history starts after
 * it), so "all" is a real window the rest of the page already understands —
 * `from`, `to`, balance anchors and the row cap all keep working unchanged.
 *
 * All Transactions always has a window, so its "All" carries this date.
 * Purchases has no date filter at all by default, so its "All" simply clears
 * `from` and `to` — the same meaning, with a cleaner URL.
 */
export const DATE_RANGE_ALL_FROM = '1970-01-01';

export type DateRangePresetId = 'last-30-days' | 'this-month' | 'last-month' | 'this-year' | 'all';

export interface DateRangePreset {
  id: DateRangePresetId;
  label: string;
  /** Local calendar date, inclusive. */
  from: string;
  /** Local calendar date, inclusive — never after today. */
  to: string;
}

/** Two digits, for the month part of a `YYYY-MM-DD` local date. */
function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * The five presets in the order the household asked for (issue #98):
 * Last 30 days, This month, Last Month, This Year, All. `today` is the
 * household's local calendar date, so the answer never depends on the
 * browser's clock or timezone.
 */
export function dateRangePresets(today: string): DateRangePreset[] {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const monthStart = `${today.slice(0, 7)}-01`;
  // Calendar-exact: the day before this month begins is the last day of the
  // previous month, in every month (including a leap February).
  const lastMonthEnd = addDaysLocal(monthStart, -1);
  const lastMonthStart = lastMonthEnd.slice(0, 8) + '01';
  return [
    {
      id: 'last-30-days',
      label: 'Last 30 days',
      from: addDaysLocal(today, -29),
      to: today,
    },
    { id: 'this-month', label: 'This month', from: monthStart, to: today },
    { id: 'last-month', label: 'Last Month', from: lastMonthStart, to: lastMonthEnd },
    { id: 'this-year', label: 'This Year', from: `${year}-01-01`, to: today },
    { id: 'all', label: 'All', from: DATE_RANGE_ALL_FROM, to: today },
  ];
}

/**
 * Which preset, if any, the page is showing. The select offers the five
 * presets and falls back to a "Custom dates" entry whenever the household has
 * set its own start or end date — the dates remain the page's real state, so
 * a hand-edited window is never misrepresented as one of the presets.
 */
export function matchedDateRangePreset(
  today: string,
  from: string,
  to: string,
): DateRangePreset | null {
  return dateRangePresets(today).find((preset) => preset.from === from && preset.to === to) ?? null;
}
