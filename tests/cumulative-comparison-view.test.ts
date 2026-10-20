import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createHouseholdFixture, type HouseholdFixture } from './household';
import { createPurchase, listPurchases, voidPurchase } from '../src/lib/records/purchases';
import { createSchedule } from '../src/lib/records/schedules';
import { changeSpendingPreset, getSpendingPresets } from '../src/lib/records/spending-presets';
import { getCumulativeComparisonView } from '../src/lib/records/charts-view';
import { ensureScheduleState } from '../src/lib/records/money-view';
import { firstRecordedPurchaseDate, firstSpendingEntryDate } from '../src/lib/records/recording';
import type { Db } from '../src/lib/db/client';

/**
 * Chart G, Spending pace (issue #89, decision 246): two months' cumulative
 * spending compared day by day.
 *
 * The qualifying-month rule under test: recording is taken to begin on the
 * earliest dated spending entry of ANY kind — a schedule-generated entry
 * counts, unlike the hand-entered-only rule the honesty loop keeps
 * (decision 183) — and a month qualifies only when recording covers it
 * from the 1st. Until one qualifying month has completed, the view
 * explains itself rather than drawing. Every drawn total is reconciled
 * against an independent sum over `listPurchases`, the charts-view
 * contract.
 */

const NOW = new Date('2026-10-11T12:00:00Z'); // Sunday 11 October 2026
const ACTOR = 'alex@example.com';

/** Independent line-level sum straight from the review rows. */
function lineTotalPence(db: Db, from: string, to: string): number {
  return listPurchases(db, { dateFrom: from, dateTo: to })
    .flatMap((row) => row.allocations)
    .reduce((sum, line) => sum + line.amountPence, 0);
}

describe('cumulative comparison: a schedule entry starts the recording clock', () => {
  let fixture: HouseholdFixture;
  const db = (): Db => fixture.db;
  let foodPresetId = '';
  let emptyPresetId = '';

  before(async () => {
    fixture = await createHouseholdFixture(ACTOR, NOW);
    const { pots, people } = fixture;
    const weeklyShop = fixture.categoryId('Groceries', 'Weekly Shop');
    const clothing = fixture.categoryId('Personal', 'Clothing & Shoes');
    const energy = fixture.categoryId('Utilities', 'Energy');

    // The household's earliest entry of any kind is a scheduled energy
    // bill dated 15 August. August itself is only part-covered, so
    // September is the first qualifying month.
    createSchedule(db(), {
      name: 'Energy direct debit',
      kind: 'dd',
      frequency: 'monthly',
      dueDayOfMonth: 15,
      amountPence: 9000,
      potId: pots.main.id,
      categoryId: energy,
      supplierName: 'Wattstream Energy',
      activeFrom: '2026-08-01',
      actor: ACTOR,
      now: NOW,
    });
    const buy = (occurredDate: string, amountPence: number, categoryId: number) =>
      createPurchase(db(), {
        potId: pots.main.id,
        totalPence: amountPence,
        paidByPersonId: people.alex.id,
        occurredDate,
        lines: [{ amountPence, categoryId, targetKind: 'household' }],
        actor: ACTOR,
        now: NOW,
      });
    // The lazy due pass (SPEC §11.2) is what turns the schedule's past
    // instances into purchases; every chart view runs it first, and the
    // direct helper assertions below need it run just as much.
    ensureScheduleState(db(), NOW);
    buy('2026-09-03', 8000, weeklyShop);
    buy('2026-09-20', 4000, clothing);
    buy('2026-10-02', 5000, weeklyShop);

    foodPresetId = changeSpendingPreset(db(), {
      operation: 'save',
      id: '',
      name: 'Food only',
      categoryIds: [weeklyShop],
      version: getSpendingPresets(db()).version,
      actor: ACTOR,
      now: NOW,
    });
    emptyPresetId = changeSpendingPreset(db(), {
      operation: 'save',
      id: '',
      name: 'Nothing ticked',
      categoryIds: [],
      version: getSpendingPresets(db()).version,
      actor: ACTOR,
      now: NOW,
    });
  });

  after(() => {
    fixture.close();
  });

  it('takes the earliest entry of any kind as the start of recording', () => {
    // The schedule entry (15 August) starts this chart's clock, while the
    // hand-entered-only rule other views keep still starts in September.
    assert.equal(firstSpendingEntryDate(db()), '2026-08-15');
    assert.equal(firstRecordedPurchaseDate(db()), '2026-09-03');
  });

  it('defaults to the current month against the latest completed qualifying month', () => {
    const view = getCumulativeComparisonView(db(), {}, NOW);
    assert.equal(view.available, true);
    assert.deepEqual(
      view.qualifying.map((month) => month.key),
      ['2026-09', '2026-10'],
    );
    assert.equal(view.primaryKey, '2026-10');
    assert.equal(view.comparisonKey, '2026-09');
    assert.equal(view.scope.kind, 'all');
    assert.deepEqual(view.notices, []);

    const comparison = view.comparison;
    assert.ok(comparison !== null);
    assert.equal(comparison.primary.days.length, 11);
    assert.equal(comparison.primary.totalPence, 5000);
    assert.equal(comparison.comparison.totalPence, 21000);
    assert.equal(comparison.commonDay, 11);
    assert.equal(comparison.deltaPence, -3000);
    assert.equal(
      comparison.headline,
      'By day 11, October 2026 has spent £50.00 — £30.00 less than September 2026 at the same point. September 2026 finished at £210.00.',
    );
  });

  it('reconciles each line\u2019s final figure with the purchase history', () => {
    const view = getCumulativeComparisonView(db(), {}, NOW);
    assert.ok(view.comparison !== null);
    assert.equal(
      view.comparison.comparison.totalPence,
      lineTotalPence(db(), '2026-09-01', '2026-09-30'),
    );
    assert.equal(
      view.comparison.primary.totalPence,
      lineTotalPence(db(), '2026-10-01', '2026-10-11'),
    );
  });

  it('draws the same two months the other way round when asked', () => {
    const view = getCumulativeComparisonView(
      db(),
      { primary: '2026-09', comparison: '2026-10' },
      NOW,
    );
    assert.ok(view.comparison !== null);
    assert.equal(
      view.comparison.headline,
      'By day 11, September 2026 had spent £80.00 — £30.00 more than October 2026 at the same point. September 2026 finished at £210.00.',
    );
  });

  it('counts a saved preset\u2019s categories on both lines', () => {
    const view = getCumulativeComparisonView(db(), { presetId: foodPresetId }, NOW);
    assert.equal(view.scope.label, 'Food only');
    assert.ok(view.comparison !== null);
    assert.equal(view.comparison.primary.totalPence, 5000);
    assert.equal(view.comparison.comparison.totalPence, 8000);
  });

  it('draws nothing for an explicitly empty preset', () => {
    const view = getCumulativeComparisonView(db(), { presetId: emptyPresetId }, NOW);
    assert.equal(view.scope.label, 'Nothing ticked');
    assert.equal(view.comparison, null);
    assert.equal(view.available, true);
  });

  it('falls back to all spending with a notice when the preset is gone', () => {
    const view = getCumulativeComparisonView(db(), { presetId: 'no-such-preset' }, NOW);
    assert.equal(view.scope.kind, 'all');
    assert.match(view.notices.join(' '), /no longer exists, so this shows all spending/);
    assert.ok(view.comparison !== null);
  });

  it('refuses a part-recorded month and says what is shown instead', () => {
    const view = getCumulativeComparisonView(db(), { primary: '2026-08' }, NOW);
    assert.equal(view.primaryKey, '2026-10');
    assert.match(
      view.notices.join(' '),
      /August 2026 cannot be used here — recording did not cover it from the 1st, so it cannot be compared fairly — so October 2026 is shown instead\./,
    );
  });

  it('refuses a future month', () => {
    const view = getCumulativeComparisonView(db(), { comparison: '2026-12' }, NOW);
    assert.equal(view.comparisonKey, '2026-09');
    assert.match(view.notices.join(' '), /December 2026 cannot be used here — it is in the future/);
  });

  it('draws nothing when both selectors name the same month', () => {
    const view = getCumulativeComparisonView(
      db(),
      { primary: '2026-09', comparison: '2026-09' },
      NOW,
    );
    assert.equal(view.sameMonth, true);
    assert.equal(view.comparison, null);
  });
});

describe('cumulative comparison: before the first full month completes', () => {
  let fixture: HouseholdFixture;

  before(async () => {
    fixture = await createHouseholdFixture(ACTOR, new Date('2026-10-08T12:00:00Z'));
    createPurchase(fixture.db, {
      potId: fixture.pots.main.id,
      totalPence: 8000,
      paidByPersonId: fixture.people.alex.id,
      occurredDate: '2026-09-14',
      lines: [
        {
          amountPence: 8000,
          categoryId: fixture.categoryId('Groceries', 'Weekly Shop'),
          targetKind: 'household',
        },
      ],
      actor: ACTOR,
      now: new Date('2026-10-08T12:00:00Z'),
    });
  });

  after(() => {
    fixture.close();
  });

  it('explains the wait instead of drawing a part-recorded comparison', () => {
    const view = getCumulativeComparisonView(fixture.db, {}, new Date('2026-10-08T12:00:00Z'));
    assert.equal(view.available, false);
    assert.equal(view.comparison, null);
    assert.deepEqual(
      view.qualifying.map((month) => month.key),
      ['2026-10'],
    );
    assert.equal(
      view.unavailableText,
      'Recording began on 14 September 2026, so September 2026 was only part-recorded and cannot be used for a fair comparison. October 2026 is your first full recorded month; this comparison will be available from 1 November 2026, once October 2026 is complete.',
    );
  });
});

describe('cumulative comparison: an entry on the 1st qualifies its own month', () => {
  let fixture: HouseholdFixture;
  const EARLY = new Date('2026-09-20T12:00:00Z');
  const LATER = new Date('2026-10-05T12:00:00Z');

  before(async () => {
    fixture = await createHouseholdFixture(ACTOR, EARLY);
    createPurchase(fixture.db, {
      potId: fixture.pots.main.id,
      totalPence: 2500,
      paidByPersonId: fixture.people.alex.id,
      occurredDate: '2026-09-01',
      lines: [
        {
          amountPence: 2500,
          categoryId: fixture.categoryId('Groceries', 'Weekly Shop'),
          targetKind: 'household',
        },
      ],
      actor: ACTOR,
      now: EARLY,
    });
  });

  after(() => {
    fixture.close();
  });

  it('waits for that month to complete, then compares against it', () => {
    const waiting = getCumulativeComparisonView(fixture.db, {}, EARLY);
    assert.equal(waiting.available, false);
    assert.equal(
      waiting.unavailableText,
      'Recording began on 1 September 2026. September 2026 is your first full recorded month; this comparison will be available from 1 October 2026, once September 2026 is complete.',
    );

    // October has no spending at all yet: its line is still drawn, flat
    // at £0 through today, against the now-completed September.
    const view = getCumulativeComparisonView(fixture.db, {}, LATER);
    assert.equal(view.available, true);
    assert.equal(view.primaryKey, '2026-10');
    assert.equal(view.comparisonKey, '2026-09');
    assert.ok(view.comparison !== null);
    assert.equal(view.comparison.primary.days.length, 5);
    assert.equal(view.comparison.primary.totalPence, 0);
    assert.equal(view.comparison.comparison.totalPence, 2500);
  });
});

describe('cumulative comparison: nothing recorded yet', () => {
  let fixture: HouseholdFixture;

  before(async () => {
    fixture = await createHouseholdFixture(ACTOR, NOW);
    // A voided entry is not an entry: it cannot start the recording clock.
    const mistake = createPurchase(fixture.db, {
      potId: fixture.pots.main.id,
      totalPence: 1000,
      paidByPersonId: fixture.people.alex.id,
      occurredDate: '2026-08-20',
      lines: [
        {
          amountPence: 1000,
          categoryId: fixture.categoryId('Groceries', 'Weekly Shop'),
          targetKind: 'household',
        },
      ],
      actor: ACTOR,
      now: NOW,
    });
    voidPurchase(fixture.db, {
      id: mistake.purchase.id,
      expectedVersion: mistake.purchase.version,
      reason: 'Typed twice',
      actor: ACTOR,
      now: NOW,
    });
  });

  after(() => {
    fixture.close();
  });

  it('has no recording start and no months to offer', () => {
    assert.equal(firstSpendingEntryDate(fixture.db), null);
    const view = getCumulativeComparisonView(fixture.db, {}, NOW);
    assert.equal(view.available, false);
    assert.deepEqual(view.qualifying, []);
    assert.equal(
      view.unavailableText,
      'Nothing has been recorded yet, so there are no months to compare.',
    );
  });
});
