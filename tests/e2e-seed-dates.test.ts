import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addDaysLocal,
  checkedLocalDate,
  clampedDueDate,
  daysBetween,
} from '../src/lib/records/dates';
import { recentMonthlyDueDay } from '../scripts/e2e-seed-dates';

/**
 * The e2e seed's due-day rule (decision 170).
 *
 * `e2e/transactions.spec.ts` asserts that All Transactions shows a *converted
 * standing order* — the seeded "Phone plan" — in its default window, which is
 * the last 30 days (`src/app/transactions/page.tsx`: `addDaysLocal(today, -29)`,
 * inclusive). A seeded due day that is a fixed number puts the newest conversion
 * a calendar-dependent distance behind today, so the row can fall out of the
 * window and the spec fails on a codebase where nothing is wrong. That is not
 * hypothetical: seeded on the 28th, the newest conversion was 30 days behind on
 * the 27th of any month whose predecessor has 31 days, and the suite went red on
 * 2026-09-27 — reproduced on `main` at 0f7070f, with no pending change to blame.
 *
 * These tests are the alarm: they walk every day of four years (a leap year
 * included) and assert the seeded rule always lands a conversion inside the
 * window, and never on the day `e2e/desktop.spec.ts` moves the schedule to.
 */

/** All Transactions' inclusive window start for a local date. */
const WINDOW_DAYS = 30;

function windowStart(todayIso: string): string {
  return addDaysLocal(todayIso, -(WINDOW_DAYS - 1));
}

/**
 * The most recent date a monthly due day has occurred on or before `todayIso`,
 * using the production clamping rule (a due day never exceeds the month's
 * length — `clampedDueDate`, plan OQ1).
 */
function mostRecentOccurrence(dueDayOfMonth: number, todayIso: string): string {
  const { year, month } = checkedLocalDate(todayIso);
  const thisMonth = clampedDueDate(dueDayOfMonth, year, month);
  if (thisMonth <= todayIso) return thisMonth;
  return month === 1
    ? clampedDueDate(dueDayOfMonth, year - 1, 12)
    : clampedDueDate(dueDayOfMonth, year, month - 1);
}

/** Every local date in [fromIso, throughIso], inclusive. */
function eachLocalDate(fromIso: string, throughIso: string): string[] {
  const dates: string[] = [];
  for (let date = fromIso; date <= throughIso; date = addDaysLocal(date, 1)) dates.push(date);
  return dates;
}

// Four years: a leap February, both 28- and 31-day predecessors, every
// day-of-month a run can start on.
const FOUR_YEARS = eachLocalDate('2025-01-01', '2028-12-31');

describe('e2e seed due-day rule', () => {
  it('lands a conversion inside the All Transactions window on every day of four years', () => {
    const outside: string[] = [];
    for (const today of FOUR_YEARS) {
      const dueDay = recentMonthlyDueDay(today, 6, [21]);
      const occurrence = mostRecentOccurrence(dueDay, today);
      // The row is only shown when its date is inside [windowStart, today].
      if (occurrence < windowStart(today))
        outside.push(`${today} (due ${dueDay}, paid ${occurrence})`);
    }
    assert.deepEqual(
      outside,
      [],
      `${outside.length} day(s) would seed a standing order with no converted row in the ` +
        `last ${WINDOW_DAYS} days: ${outside.slice(0, 8).join(', ')}`,
    );
  });

  it('keeps the newest conversion about a week old, never near the window edge', () => {
    let oldest = 0;
    let newest = Number.MAX_SAFE_INTEGER;
    for (const today of FOUR_YEARS) {
      const gap = daysBetween(
        mostRecentOccurrence(recentMonthlyDueDay(today, 6, [21]), today),
        today,
      );
      oldest = Math.max(oldest, gap);
      newest = Math.min(newest, gap);
    }
    // The documented bound: `daysBehind` (same month) up to `daysBehind + 7`
    // (a 31-day previous month plus avoided days). A gap of 29 would be the
    // last day the row is visible — that is the edge this rule exists to avoid.
    assert.ok(newest >= 6, `expected the newest conversion at least 6 days old, got ${newest}`);
    assert.ok(oldest <= 13, `expected no conversion older than 13 days, got ${oldest}`);
  });

  it('never seeds the day the desktop spec moves the schedule to', () => {
    // `e2e/desktop.spec.ts` fills "Day of month" with 21 for Phone plan and
    // asserts the reported next-due date actually changed. Seeding 21 would make
    // that edit a no-op and fail a spec that has nothing to do with dates.
    for (const today of FOUR_YEARS) {
      assert.notEqual(recentMonthlyDueDay(today, 6, [21]), 21, `seeded the 21st on ${today}`);
    }
  });

  it('returns a day every month actually has', () => {
    for (const today of FOUR_YEARS) {
      const dueDay = recentMonthlyDueDay(today, 6, [21]);
      assert.ok(Number.isInteger(dueDay) && dueDay >= 1 && dueDay <= 28, `${today} -> ${dueDay}`);
    }
  });

  it('regression — 2026-09-27, the day the fixed 28th fell out of the window', () => {
    const today = '2026-09-27';
    // The old rule: BroadbandCo's due day, plus five, capped at 28.
    const oldDueDay = Math.min(Math.min(Number(today.slice(8, 10)) + 2, 28) + 5, 28);
    assert.equal(oldDueDay, 28);
    assert.equal(mostRecentOccurrence(oldDueDay, today), '2026-08-28');
    assert.ok(
      '2026-08-28' < windowStart(today),
      'the 28th should have been outside the window on 2026-09-27 — that is the failure',
    );
    assert.equal(daysBetween('2026-08-28', today), 30, 'one day too old to be shown');

    // The new rule keeps it a week behind today, and off the 21st.
    const dueDay = recentMonthlyDueDay(today, 6, [21]);
    assert.equal(dueDay, 20);
    assert.equal(mostRecentOccurrence(dueDay, today), '2026-09-20');
    assert.ok(mostRecentOccurrence(dueDay, today) >= windowStart(today), 'inside the window');
  });

  it('rejects nonsense instead of seeding a schedule nobody can predict', () => {
    assert.throws(() => recentMonthlyDueDay('not-a-date', 6, [21]), /YYYY-MM-DD/);
    assert.throws(() => recentMonthlyDueDay('2026-09-27', 0, [21]), /daysBehind/);
    assert.throws(() => recentMonthlyDueDay('2026-09-27', 21, [21]), /daysBehind/);
    // Five consecutive avoided days leave nothing to pick.
    assert.throws(
      () => recentMonthlyDueDay('2026-09-27', 6, [17, 18, 19, 20, 21]),
      /No usable due day/,
    );
  });
});
