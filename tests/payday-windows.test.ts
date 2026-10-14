import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createHouseholdFixture, type HouseholdFixture } from './household';
import {
  cadenceDatesOnOrBefore,
  createSchedule,
  type Schedule,
} from '../src/lib/records/schedules';
import { recentPaydayDates, recentScheduledIncomeDates } from '../src/lib/records/money-view';
import { getSpendingMixView, paydayCycleWindows } from '../src/lib/records/charts-view';

/**
 * Chart E's payday quick windows when the salary schedule is new (issue #24).
 *
 * The household reported seeing only two quick windows: the "previous payday
 * cycle" never appeared. The windows were bracketed by the salary's
 * *recorded* instances, and a salary schedule added this month has only one
 * payday on record, so the full cycle before it was silently missing. The
 * earlier paydays are now worked out from the salary's cadence.
 *
 * The household's own case: today is Wednesday 14 October 2026, payday is the
 * 25th (Friday 25 September was the last one), so the last full cycle is
 * 25 August to 24 September and "since last payday" is 25 September to today.
 */

const ACTOR = 'alex@example.com';
const NOW = new Date('2026-10-14T11:00:00Z');
const TODAY = '2026-10-14';

function addSalary(
  fixture: HouseholdFixture,
  activeFrom: string,
  dueDayOfMonth = 25,
  now: Date = NOW,
): Schedule {
  return createSchedule(fixture.db, {
    name: 'Salary',
    kind: 'receipt',
    frequency: 'monthly',
    dueDayOfMonth,
    amountPence: 215000,
    potId: fixture.pots.main.id,
    targetKind: 'household',
    activeFrom,
    actor: ACTOR,
    now,
  }).schedule;
}

describe('payday windows: a salary schedule added this month (issue #24)', () => {
  let fixture: HouseholdFixture;

  before(async () => {
    fixture = await createHouseholdFixture(ACTOR, NOW);
    // Started a few days before September's payday: one payday on record.
    addSalary(fixture, '2026-09-20');
  });
  after(() => fixture.close());

  it('has only one recorded payday, which is what hid the full cycle', () => {
    assert.deepEqual(recentScheduledIncomeDates(fixture.db, TODAY, 2), ['2026-09-25']);
  });

  it('works the payday before it out from the cadence', () => {
    assert.deepEqual(recentPaydayDates(fixture.db, TODAY, 2), ['2026-09-25', '2026-08-25']);
  });

  it('offers since last payday and the last full payday cycle, both ending by today', () => {
    const cycles = paydayCycleWindows(fixture.db, TODAY);
    assert.deepEqual(cycles.payday, { kind: 'payday', from: '2026-09-25', to: TODAY });
    assert.deepEqual(cycles.previousPayday, {
      kind: 'previous-payday',
      from: '2026-08-25',
      to: '2026-09-24',
    });
  });

  it('draws the chart for since last payday by default, with no fallback notice', () => {
    const view = getSpendingMixView(fixture.db, {}, NOW);
    assert.equal(view.window.kind, 'payday');
    assert.equal(view.window.from, '2026-09-25');
    assert.equal(view.window.to, TODAY);
    assert.equal(view.notice, null);
    assert.deepEqual(view.presets.month, { kind: 'month', from: '2026-10-01', to: TODAY });
  });
});

describe('payday windows: a salary schedule whose first payday is still to come', () => {
  let fixture: HouseholdFixture;

  before(async () => {
    fixture = await createHouseholdFixture(ACTOR, NOW);
    addSalary(fixture, '2026-10-20');
  });
  after(() => fixture.close());

  it('still knows the salary rhythm, so both payday windows are offered', () => {
    assert.deepEqual(recentScheduledIncomeDates(fixture.db, TODAY, 2), []);
    const cycles = paydayCycleWindows(fixture.db, TODAY);
    assert.deepEqual(cycles.payday, { kind: 'payday', from: '2026-09-25', to: TODAY });
    assert.deepEqual(cycles.previousPayday, {
      kind: 'previous-payday',
      from: '2026-08-25',
      to: '2026-09-24',
    });
  });
});

describe('payday windows: no salary scheduled', () => {
  let fixture: HouseholdFixture;

  before(async () => {
    fixture = await createHouseholdFixture(ACTOR, NOW);
  });
  after(() => fixture.close());

  it('offers no payday windows and falls back to month to date, saying why', () => {
    assert.deepEqual(recentPaydayDates(fixture.db, TODAY, 2), []);
    const view = getSpendingMixView(fixture.db, {}, NOW);
    assert.equal(view.presets.payday, null);
    assert.equal(view.presets.previousPayday, null);
    assert.deepEqual(view.window, { kind: 'month', from: '2026-10-01', to: TODAY });
    assert.match(view.notice ?? '', /month to date/);
  });
});

describe('cadenceDatesOnOrBefore', () => {
  let fixture: HouseholdFixture;
  let salary: Schedule;

  before(async () => {
    fixture = await createHouseholdFixture(ACTOR, NOW);
    salary = addSalary(fixture, '2026-09-20');
  });
  after(() => fixture.close());

  it('walks back from the anchor, newest first, ignoring the start date', () => {
    assert.deepEqual(cadenceDatesOnOrBefore(salary, '2026-10-14', 3), [
      '2026-09-25',
      '2026-08-25',
      '2026-07-24', // Saturday 25 July → the Friday before
    ]);
  });

  it('counts a payday that falls on the anchor day itself', () => {
    assert.deepEqual(cadenceDatesOnOrBefore(salary, '2026-09-25', 1), ['2026-09-25']);
  });

  it("brings next month's weekend payday back into this month", () => {
    // Saturday 1 August 2026 is paid on Friday 31 July.
    const firstOfMonth: Schedule = { ...salary, dueDayOfMonth: 1 };
    assert.deepEqual(cadenceDatesOnOrBefore(firstOfMonth, '2026-07-31', 2), [
      '2026-07-31',
      '2026-07-01',
    ]);
  });

  it('skips excluded months', () => {
    const noAugust: Schedule = { ...salary, excludedMonths: [8] };
    assert.deepEqual(cadenceDatesOnOrBefore(noAugust, '2026-10-14', 2), [
      '2026-09-25',
      '2026-07-24',
    ]);
  });

  it('handles an annual cadence', () => {
    const annual: Schedule = { ...salary, frequency: 'annual', dueMonth: 3, dueDayOfMonth: 31 };
    // 31 March 2026 is a Tuesday; 31 March 2025 a Monday.
    assert.deepEqual(cadenceDatesOnOrBefore(annual, '2026-10-14', 2), ['2026-03-31', '2025-03-31']);
  });

  it('returns nothing when nothing is asked for', () => {
    assert.deepEqual(cadenceDatesOnOrBefore(salary, '2026-10-14', 0), []);
  });
});
