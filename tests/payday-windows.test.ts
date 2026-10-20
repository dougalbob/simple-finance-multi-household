import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createHouseholdFixture, type HouseholdFixture } from './household';
import {
  cadenceDatesOnOrBefore,
  createSchedule,
  type Schedule,
} from '../src/lib/records/schedules';
import { recentPaydayDates } from '../src/lib/records/money-view';
import { getSpendingMixView, paydayCycleWindows } from '../src/lib/records/charts-view';
import { setPaydayDayOfMonth } from '../src/lib/records/settings';

/** Chart E's payday quick windows come from the household payday setting. */

const ACTOR = 'alex@example.com';
const NOW = new Date('2026-10-14T11:00:00Z');
const TODAY = '2026-10-14';

function addReceipt(
  fixture: HouseholdFixture,
  name: string,
  activeFrom: string,
  dueDayOfMonth: number,
  now: Date = NOW,
): Schedule {
  return createSchedule(fixture.db, {
    name,
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

describe('Chart E payday windows use the configured household payday', () => {
  let fixture: HouseholdFixture;
  after(() => fixture.close());

  it('offers both windows from the setting even with no receipt schedules', async () => {
    fixture = await createHouseholdFixture(ACTOR, NOW);
    setPaydayDayOfMonth(fixture.db, 25, ACTOR, NOW);

    assert.deepEqual(recentPaydayDates(fixture.db, TODAY, 2), ['2026-09-25', '2026-08-25']);
    const cycles = paydayCycleWindows(fixture.db, TODAY);
    assert.deepEqual(cycles.payday, { kind: 'payday', from: '2026-09-25', to: TODAY });
    assert.deepEqual(cycles.previousPayday, {
      kind: 'previous-payday',
      from: '2026-08-25',
      to: '2026-09-24',
    });

    const view = getSpendingMixView(fixture.db, {}, NOW);
    assert.equal(view.window.kind, 'payday');
    assert.equal(view.window.from, '2026-09-25');
    assert.equal(view.window.to, TODAY);
    assert.equal(view.notice, null);
  });

  it('multiple mismatched receipt schedules do not move either window', async () => {
    fixture = await createHouseholdFixture(ACTOR, NOW);
    setPaydayDayOfMonth(fixture.db, 25, ACTOR, NOW);
    addReceipt(fixture, 'Salary on the 15th', '2026-09-01', 15);
    addReceipt(fixture, 'Benefit on the 20th', '2026-09-01', 20);

    assert.deepEqual(recentPaydayDates(fixture.db, TODAY, 2), ['2026-09-25', '2026-08-25']);
    assert.deepEqual(paydayCycleWindows(fixture.db, TODAY), {
      payday: { kind: 'payday', from: '2026-09-25', to: TODAY },
      previousPayday: { kind: 'previous-payday', from: '2026-08-25', to: '2026-09-24' },
    });
    assert.equal(getSpendingMixView(fixture.db, {}, NOW).window.from, '2026-09-25');
  });

  it('without a setting, receipt schedules do not invent payday windows', async () => {
    fixture = await createHouseholdFixture(ACTOR, NOW);
    addReceipt(fixture, 'Salary', '2026-09-20', 25);

    assert.deepEqual(recentPaydayDates(fixture.db, TODAY, 2), []);
    const cycles = paydayCycleWindows(fixture.db, TODAY);
    assert.deepEqual(cycles, { payday: null, previousPayday: null });
    const view = getSpendingMixView(fixture.db, {}, NOW);
    assert.equal(view.presets.payday, null);
    assert.equal(view.presets.previousPayday, null);
    assert.deepEqual(view.window, { kind: 'month', from: '2026-10-01', to: TODAY });
    assert.match(view.notice ?? '', /month to date/);
  });
});

describe('cadenceDatesOnOrBefore (receipt-schedule helper)', () => {
  let fixture: HouseholdFixture;
  let salary: Schedule;

  before(async () => {
    fixture = await createHouseholdFixture(ACTOR, NOW);
    salary = addReceipt(fixture, 'Salary', '2026-09-20', 25);
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
    assert.deepEqual(cadenceDatesOnOrBefore(annual, '2026-10-14', 2), ['2026-03-31', '2025-03-31']);
  });

  it('returns nothing when nothing is asked for', () => {
    assert.deepEqual(cadenceDatesOnOrBefore(salary, '2026-10-14', 0), []);
  });
});
