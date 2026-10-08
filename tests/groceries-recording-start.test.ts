import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createHouseholdFixture, type HouseholdFixture } from './household';
import { createPurchase } from '../src/lib/records/purchases';
import { getGroceriesChartView } from '../src/lib/records/charts-view';
import { getHonestyLoopView } from '../src/lib/records/insights-view';
import { setWeeklyGroceriesPence } from '../src/lib/records/settings';
import { firstRecordedPurchaseDate } from '../src/lib/records/recording';
import type { Db } from '../src/lib/db/client';

/**
 * The weekly shop must not average weeks from before the household started
 * recording. A new household has no purchases before its first one, so an
 * 8-week average with five empty pre-launch weeks flatters nothing — it
 * simply drags the figure down with weeks that were never recorded.
 *
 * The rule (SPEC §16.7 B, decision 183): a week counts towards the average
 * only if it is complete AND begins on or after the first recorded purchase
 * (the earliest non-voided, hand-entered purchase). Weeks inside the
 * recording period still count when empty — a week with no shop is a zero
 * week. The Charts card and the Insights honesty loop read the same rule,
 * so they agree.
 */

// Thursday 8 October 2026: the current week is Mon 5 Oct → Sun 11 Oct.
const NOW = new Date('2026-10-08T12:00:00Z');
const TODAY = '2026-10-08';
const ACTOR = 'alex@example.com';

describe('groceries average counts only weeks since recording began', () => {
  let fixture: HouseholdFixture;
  const db = (): Db => fixture.db;

  before(async () => {
    fixture = await createHouseholdFixture(ACTOR, NOW);
    const weeklyShop = fixture.categoryId('Groceries', 'Weekly Shop');
    const buy = (occurredDate: string, amountPence: number) =>
      createPurchase(fixture.db, {
        potId: fixture.pots.main.id,
        totalPence: amountPence,
        paidByPersonId: fixture.people.alex.id,
        occurredDate,
        lines: [{ amountPence, categoryId: weeklyShop, targetKind: 'household' }],
        actor: ACTOR,
        now: NOW,
      });
    // The app went live on Monday 14 September. Three complete weeks since:
    // 14–20 Sep (£80.00), 21–27 Sep (no shop at all — a genuine zero week),
    // 28 Sep–4 Oct (£60.00). The week of 5 Oct is still being lived.
    buy('2026-09-14', 8000);
    buy('2026-09-29', 6000);
    buy('2026-10-06', 2000);
    setWeeklyGroceriesPence(fixture.db, 9000, ACTOR, NOW);
  });

  after(() => {
    fixture.close();
  });

  it('finds the first recorded purchase', () => {
    assert.equal(firstRecordedPurchaseDate(db()), '2026-09-14');
  });

  it('the Charts card averages the three recorded complete weeks, zero week included', () => {
    const view = getGroceriesChartView(db(), {}, NOW);
    assert.equal(view.recordingStartedOn, '2026-09-14');
    const series = view.laptop;
    assert.equal(series.averageWeeks, 3);
    // (8000 + 0 + 6000) / 3 = 4666.67 → 4667 half-up.
    assert.equal(series.averagePence, 4667);
    assert.equal(series.driftPence, 4667 - 9000);
    assert.match(series.headline, /£46\.67 a week over the last 3 complete weeks/);
    assert.match(series.headline, /£43\.33 a week under the £90\.00 configured/);
  });

  it('marks pre-recording weeks as not recorded, and keeps them out of the average', () => {
    const series = getGroceriesChartView(db(), {}, NOW).laptop;
    const week = (weekStart: string) => series.weeks.find((entry) => entry.weekStart === weekStart);
    assert.equal(week('2026-08-31')?.recorded, false);
    assert.equal(week('2026-09-07')?.recorded, false);
    assert.equal(week('2026-09-14')?.recorded, true);
    assert.equal(week('2026-09-21')?.amountPence, 0);
    assert.equal(week('2026-09-21')?.recorded, true);
    assert.equal(week('2026-10-05')?.complete, false);
  });

  it('the Insights honesty loop agrees with the Charts card', () => {
    const loop = getHonestyLoopView(db(), NOW);
    assert.equal(loop.groceries.recordedFrom, '2026-09-14');
    assert.deepEqual(
      loop.groceries.weeks.map((week) => week.weekStart),
      ['2026-09-14', '2026-09-21', '2026-09-28'],
    );
    assert.equal(loop.groceries.averageWeeklyPence, 4667);
    assert.equal(loop.groceries.driftPence, 4667 - 9000);
  });
});

describe('a household that has recorded nothing yet', () => {
  let fixture: HouseholdFixture;

  before(async () => {
    fixture = await createHouseholdFixture(ACTOR, NOW);
    setWeeklyGroceriesPence(fixture.db, 9000, ACTOR, NOW);
  });

  after(() => {
    fixture.close();
  });

  it('counts no weeks and claims no average', () => {
    assert.equal(firstRecordedPurchaseDate(fixture.db), null);
    const series = getGroceriesChartView(fixture.db, {}, NOW).laptop;
    assert.equal(series.averageWeeks, 0);
    assert.equal(series.driftPence, null);
    assert.match(series.headline, /No complete week of shopping recorded yet/);

    const loop = getHonestyLoopView(fixture.db, NOW);
    assert.equal(loop.groceries.weeks.length, 0);
    assert.equal(loop.groceries.driftPence, null);
  });
});

describe('a recording that began mid-week counts from the next whole week', () => {
  let fixture: HouseholdFixture;

  before(async () => {
    fixture = await createHouseholdFixture(ACTOR, NOW);
    const weeklyShop = fixture.categoryId('Groceries', 'Weekly Shop');
    // Recording began on Thursday 17 September: the week of 14 Sep was only
    // partly recorded, so it is not counted. Complete weeks since: 21 Sep, 28 Sep.
    createPurchase(fixture.db, {
      potId: fixture.pots.main.id,
      totalPence: 10000,
      paidByPersonId: fixture.people.alex.id,
      occurredDate: '2026-09-17',
      lines: [{ amountPence: 10000, categoryId: weeklyShop, targetKind: 'household' }],
      actor: ACTOR,
      now: NOW,
    });
    createPurchase(fixture.db, {
      potId: fixture.pots.main.id,
      totalPence: 4000,
      paidByPersonId: fixture.people.alex.id,
      occurredDate: '2026-09-28',
      lines: [{ amountPence: 4000, categoryId: weeklyShop, targetKind: 'household' }],
      actor: ACTOR,
      now: NOW,
    });
    setWeeklyGroceriesPence(fixture.db, 9000, ACTOR, NOW);
  });

  after(() => {
    fixture.close();
  });

  it('leaves the partly recorded week out of the average', () => {
    const series = getGroceriesChartView(fixture.db, {}, NOW).laptop;
    assert.equal(series.averageWeeks, 2);
    assert.equal(series.averagePence, 2000); // (0 + 4000) / 2
    const partial = series.weeks.find((week) => week.weekStart === '2026-09-14');
    assert.equal(partial?.recorded, false);
    // The partly recorded week still shows what was recorded in it.
    assert.equal(partial?.amountPence, 10000);
  });

  it('keeps the honesty loop on the same two weeks', () => {
    const loop = getHonestyLoopView(fixture.db, NOW);
    assert.deepEqual(
      loop.groceries.weeks.map((week) => week.weekStart),
      ['2026-09-21', '2026-09-28'],
    );
    assert.equal(loop.groceries.averageWeeklyPence, 2000);
  });
});
