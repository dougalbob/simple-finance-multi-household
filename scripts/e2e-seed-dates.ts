/**
 * Seed date rules for the fictional e2e household (`scripts/e2e-server.mts`).
 *
 * Kept in its own module — and covered by `tests/e2e-seed-dates.test.ts` —
 * because a seeded **due day is a date the whole suite quietly depends on**,
 * and one of them was a time bomb:
 *
 * The "Phone plan" standing order used to be seeded on the 28th of the month
 * (`Math.min(dueDay + 5, 28)`). Its newest converted payment was therefore the
 * 28th of the *previous* month, which is 30 days behind today whenever the
 * previous month has 31 days. All Transactions shows the last 30 days
 * (`src/app/transactions/page.tsx`: `addDaysLocal(today, -29)`), so on the 27th
 * of January, February, April, June, August, September and November the row
 * simply did not exist and `e2e/transactions.spec.ts` failed on a green
 * codebase. It failed on 2026-09-27 for exactly that reason, and nothing about
 * the app was wrong. (It also cannot be rescued by the next conversion:
 * `e2e/desktop.spec.ts` moves this schedule to the 21st earlier in the same
 * run, and a cadence edit deliberately does not invent past instances —
 * SPEC §11.1, decision 162.)
 *
 * The rule below is the repair: seed a monthly due day that lands a conversion
 * **about a week behind today, on every day of the year**, so a converted row
 * is always comfortably inside the default window.
 */

/**
 * A day-of-month (1–28) whose most recent occurrence is `daysBehind` — or, when
 * that day is in `avoid`, up to `daysBehind + 4` — days before `todayIso`.
 *
 * - 28 is the ceiling because every month has 28 days, so the occurrence is
 *   never clamped and the gap below never stretches.
 * - The gap between `todayIso` and the most recent occurrence is
 *   `daysBehind` days when the due day lands earlier in the same month, and
 *   `daysBehind + (previous month's length − 28)` — so at most
 *   `daysBehind + 3` — when it wraps into the previous month. Each avoided day
 *   adds one more. The worst case the seed can produce is therefore
 *   `daysBehind + 7` days (13 with the default), against a 30-day window.
 * - `avoid` exists for the specs: `desktop.spec.ts` moves Phone plan to the
 *   **21st** and asserts the reported next-due date actually changed, so the
 *   seed must never already be on the 21st.
 */
export function recentMonthlyDueDay(
  todayIso: string,
  daysBehind = 6,
  avoid: readonly number[] = [],
): number {
  const dayOfMonth = Number(todayIso.slice(8, 10));
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
    throw new Error(`Expected a YYYY-MM-DD local date, got “${todayIso}”.`);
  }
  if (!Number.isInteger(daysBehind) || daysBehind < 1 || daysBehind > 20) {
    throw new Error(`daysBehind must be 1–20, got ${daysBehind}.`);
  }
  for (let step = 0; step <= 4; step += 1) {
    let day = dayOfMonth - (daysBehind + step);
    while (day < 1) day += 28;
    day = ((day - 1) % 28) + 1;
    if (!avoid.includes(day)) return day;
  }
  // Unreachable: five consecutive days cannot all be in `avoid` unless the
  // caller passes five or more avoided days, which no spec does.
  throw new Error(`No usable due day for “${todayIso}” avoiding ${avoid.join(', ')}.`);
}
