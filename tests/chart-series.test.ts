import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  commitmentSeries,
  cumulativeComparison,
  cumulativeMonthSeries,
  describeForecast,
  firstQualifyingMonth,
  forecastSeries,
  groceriesSeries,
  monthKey,
  monthlyBuckets,
  parseMonthKey,
  personalSpendSeries,
  purchasesHref,
  qualifyingMonths,
  weeklyBuckets,
  type ChartSpendingLine,
} from '../src/lib/records/chart-series';
import type { SpendingLineInput } from '../src/lib/records/insights';
import type { ProjectionDay } from '../src/lib/records/projection';
import { chartDomain, formatAxisPence, niceStep, yFor } from '../src/components/charts/scale';

/**
 * The chart resolvers and the chart geometry (SPEC §16.7, v0.14.0). No DB
 * and no browser here — these are pure functions over flat typed rows, and
 * the DB assembly is covered by tests/charts-view.test.ts.
 *
 * The awkward cases are the point: an empty series, a single point, a week
 * with nothing in it, an all-negative forecast, a month whose refunds
 * outweigh its spending.
 */

const TODAY = '2026-09-20'; // a Sunday
const MONDAY = '2026-09-14';
/** Unit fixtures that predate any recording rule: recording has always been on. */
const RECORDING_ALWAYS_ON = '2000-01-01';

function line(
  partial: Partial<SpendingLineInput> & Pick<SpendingLineInput, 'occurredDate' | 'amountPence'>,
): SpendingLineInput {
  return {
    categoryId: 1,
    parentName: 'Other',
    childName: 'Other',
    targetKind: 'household',
    targetId: null,
    ...partial,
  };
}

function commitmentLine(
  partial: Partial<ChartSpendingLine> & Pick<ChartSpendingLine, 'occurredDate' | 'amountPence'>,
): ChartSpendingLine {
  return { ...line(partial), scheduleConverted: false, ...partial };
}

function day(
  date: string,
  runningPence: number,
  extra: Partial<ProjectionDay> = {},
): ProjectionDay {
  return {
    date,
    receiptsPence: 0,
    commitmentsPence: 0,
    dayToDayPence: 0,
    runningPence,
    ...extra,
  };
}

describe('chart series: forecast (A)', () => {
  it('starts at the reported balance and then follows the projection day by day', () => {
    const series = forecastSeries({
      today: TODAY,
      availableNowPence: 50000,
      perDay: [
        day('2026-09-21', 42000, { commitmentsPence: 8000 }),
        day('2026-09-22', 41000, { dayToDayPence: 1000 }),
        day('2026-09-23', 141000, { receiptsPence: 100000 }),
      ],
    });
    assert.equal(series.days.length, 4);
    assert.equal(series.days[0]?.date, TODAY);
    assert.equal(series.days[0]?.reported, true);
    assert.equal(
      series.days.slice(1).every((entry) => !entry.reported),
      true,
    );
    assert.equal(series.startPence, 50000);
    assert.equal(series.endPence, 141000);
    assert.equal(series.throughDate, '2026-09-23');
    assert.equal(series.lowPence, 41000);
    assert.equal(series.lowDate, '2026-09-22');
    assert.equal(series.highPence, 141000);
    assert.deepEqual(series.incomeDates, ['2026-09-23']);
  });

  it('reports a negative low as "below zero", never clipped at zero', () => {
    const series = forecastSeries({
      today: TODAY,
      availableNowPence: 12000,
      perDay: [day('2026-09-21', -3450, { commitmentsPence: 15450 })],
    });
    assert.equal(series.lowPence, -3450);
    assert.equal(series.belowZeroDate, '2026-09-21');
    assert.match(series.headline, /£34\.50 below zero on Mon 21 Sep/);
  });

  it('separates "overdrawn inside the limit" from "past the limit"', () => {
    const inside = forecastSeries({
      today: TODAY,
      availableNowPence: 1000,
      perDay: [day('2026-09-21', -20000, { commitmentsPence: 21000 })],
      overdraftLimitPence: 80000,
    });
    assert.equal(inside.belowZeroDate, '2026-09-21');
    assert.equal(inside.belowOverdraftDate, null);
    assert.doesNotMatch(inside.headline, /overdraft/);

    const past = forecastSeries({
      today: TODAY,
      availableNowPence: 1000,
      perDay: [
        day('2026-09-21', -20000, { commitmentsPence: 21000 }),
        day('2026-09-22', -90000, { commitmentsPence: 70000 }),
      ],
      overdraftLimitPence: 80000,
    });
    assert.equal(past.belowOverdraftDate, '2026-09-22');
    assert.match(past.headline, /past the £800\.00 overdraft limit from Tue 22 Sep/);
  });

  it('flags the warning threshold and ranks the three biggest outgoing days', () => {
    const series = forecastSeries({
      today: TODAY,
      availableNowPence: 100000,
      perDay: [
        day('2026-09-21', 95000, { commitmentsPence: 5000 }),
        day('2026-09-22', 75000, { commitmentsPence: 20000 }),
        day('2026-09-23', 65000, { dayToDayPence: 10000 }),
        day('2026-09-24', 20000, { commitmentsPence: 40000, dayToDayPence: 5000 }),
      ],
      warningThresholdPence: 25000,
    });
    assert.equal(series.belowThresholdDate, '2026-09-24');
    assert.deepEqual(
      series.dips.map((dip) => dip.date),
      ['2026-09-24', '2026-09-22', '2026-09-23'],
    );
    assert.equal(series.dips[0]?.amountPence, 45000);
  });

  it('survives a horizon with no days at all', () => {
    const series = forecastSeries({ today: TODAY, availableNowPence: 7300, perDay: [] });
    assert.equal(series.days.length, 1);
    assert.equal(series.lowDate, TODAY);
    assert.equal(series.endPence, 7300);
    assert.match(describeForecast(series), /stay at or above today's £73\.00/);
  });
});

describe('chart series: weekly buckets and groceries (B)', () => {
  it('buckets Monday to Sunday and keeps empty weeks as zero weeks', () => {
    const weeks = weeklyBuckets(
      [
        line({ occurredDate: MONDAY, amountPence: 4000 }),
        line({ occurredDate: '2026-09-20', amountPence: 1000 }), // Sunday, same week
        line({ occurredDate: '2026-09-13', amountPence: 2500 }), // previous week's Sunday
      ],
      { today: TODAY, weeks: 4 },
    );
    assert.deepEqual(
      weeks.map((week) => [week.weekStart, week.weekEnd, week.amountPence, week.complete]),
      [
        ['2026-08-24', '2026-08-30', 0, true],
        ['2026-08-31', '2026-09-06', 0, true],
        ['2026-09-07', '2026-09-13', 2500, true],
        ['2026-09-14', '2026-09-20', 5000, false],
      ],
    );
  });

  it('ignores anything outside the window and never invents a bucket', () => {
    const weeks = weeklyBuckets([line({ occurredDate: '2026-01-05', amountPence: 9999 })], {
      today: TODAY,
      weeks: 3,
    });
    assert.equal(weeks.length, 3);
    assert.equal(
      weeks.reduce((sum, week) => sum + week.amountPence, 0),
      0,
    );
  });

  it('averages complete weeks only — the week being lived never counts', () => {
    const lines = [
      line({ occurredDate: '2026-08-31', amountPence: 8000 }),
      line({ occurredDate: '2026-09-07', amountPence: 10000 }),
      // This week, in progress and enormous: it must not move the average.
      line({ occurredDate: '2026-09-14', amountPence: 100000 }),
    ];
    const series = groceriesSeries(lines, {
      today: TODAY,
      weeks: 4,
      configuredWeeklyPence: 7500,
      averageWeeks: 3,
      recordedFrom: RECORDING_ALWAYS_ON,
    });
    assert.equal(series.averageWeeks, 3);
    assert.equal(series.averagePence, 6000); // (0 + 8000 + 10000) / 3
    assert.equal(series.driftPence, -1500);
    assert.match(series.headline, /£60\.00 a week over the last 3 complete weeks/);
    assert.match(series.headline, /£15\.00 a week under the £75\.00 configured/);
  });

  it('says so plainly when nothing is configured, and when nothing is recorded', () => {
    const configured = groceriesSeries([line({ occurredDate: '2026-09-07', amountPence: 8000 })], {
      today: TODAY,
      weeks: 4,
      configuredWeeklyPence: null,
      recordedFrom: RECORDING_ALWAYS_ON,
    });
    assert.equal(configured.driftPence, null);
    assert.match(configured.headline, /No weekly grocery figure is configured yet/);

    const nothing = groceriesSeries([], {
      today: TODAY,
      weeks: 1,
      configuredWeeklyPence: 7500,
      recordedFrom: RECORDING_ALWAYS_ON,
    });
    assert.equal(nothing.averageWeeks, 0);
    assert.match(nothing.headline, /No complete week of shopping recorded yet/);
  });

  it('nets refunds off the week they land in', () => {
    const series = groceriesSeries(
      [
        line({ occurredDate: '2026-09-07', amountPence: 9000 }),
        line({ occurredDate: '2026-09-09', amountPence: -1500 }),
      ],
      { today: TODAY, weeks: 2, configuredWeeklyPence: null, recordedFrom: RECORDING_ALWAYS_ON },
    );
    assert.equal(series.weeks[0]?.amountPence, 7500);
  });
});

describe('chart series: groceries before recording began (B)', () => {
  it('leaves weeks that begin before the recording date out of the average', () => {
    // Recording began on Monday 7 Sep: the five weeks before it are not zero weeks.
    const series = groceriesSeries(
      [
        line({ occurredDate: '2026-09-07', amountPence: 6000 }),
        line({ occurredDate: '2026-09-14', amountPence: 3000 }),
      ],
      { today: TODAY, weeks: 8, configuredWeeklyPence: 9000, recordedFrom: '2026-09-07' },
    );
    assert.equal(series.averageWeeks, 1); // 7 Sep week only; 14 Sep is the week being lived
    assert.equal(series.averagePence, 6000);
    assert.equal(series.weeks.find((week) => week.weekStart === '2026-08-31')?.recorded, false);
    assert.equal(series.weeks.find((week) => week.weekStart === '2026-09-07')?.recorded, true);
  });

  it('a week that began before recording did is kept out even when it held a purchase', () => {
    // Recording began Thursday 10 Sep, so the week of 7 Sep was only part recorded.
    const series = groceriesSeries(
      [
        line({ occurredDate: '2026-09-09', amountPence: 5000 }), // before recording began: a partial week
        line({ occurredDate: '2026-09-15', amountPence: 4000 }), // the following week
      ],
      { today: '2026-09-22', weeks: 4, configuredWeeklyPence: null, recordedFrom: '2026-09-10' },
    );
    const partial = series.weeks.find((week) => week.weekStart === '2026-09-07');
    assert.equal(partial?.recorded, false);
    assert.equal(partial?.amountPence, 5000); // what was recorded is still shown…
    assert.equal(series.averageWeeks, 1); // …but only the 14 Sep week is averaged
    assert.equal(series.averagePence, 4000);
  });

  it('counts an empty week once recording has begun', () => {
    const series = groceriesSeries([line({ occurredDate: '2026-09-07', amountPence: 8000 })], {
      today: '2026-09-22',
      weeks: 3,
      configuredWeeklyPence: null,
      recordedFrom: '2026-08-31',
    });
    // Weeks of 31 Aug (empty), 7 Sep (8000): (0 + 8000) / 2.
    assert.equal(series.averageWeeks, 2);
    assert.equal(series.averagePence, 4000);
  });
});

describe('chart series: monthly buckets', () => {
  it('ends with the in-progress month and keeps quiet months at zero', () => {
    const months = monthlyBuckets(
      [
        line({ occurredDate: '2026-07-15', amountPence: 1000 }),
        line({ occurredDate: '2026-09-02', amountPence: 2000 }),
      ],
      { today: TODAY, months: 3 },
    );
    assert.deepEqual(
      months.map((month) => [month.label, month.amountPence, month.complete]),
      [
        ['July 2026', 1000, true],
        ['August 2026', 0, true],
        ['September 2026', 2000, false],
      ],
    );
    assert.equal(months[2]?.from, '2026-09-01');
    assert.equal(months[2]?.to, '2026-09-30');
  });
});

describe('chart series: personal spending (C)', () => {
  const people = [
    { id: 1, label: 'Alex' },
    { id: 2, label: 'Sam' },
  ];
  const parentNames = ['Personal', 'Entertainment & Eating Out'];
  const lines = [
    line({
      occurredDate: '2026-09-03',
      amountPence: 4500,
      parentName: 'Personal',
      childName: 'Clothing & Shoes',
      targetKind: 'person',
      targetId: 1,
    }),
    line({
      occurredDate: '2026-09-05',
      amountPence: 2000,
      parentName: 'Personal',
      childName: 'Hobbies',
      targetKind: 'person',
      targetId: 2,
    }),
    line({
      occurredDate: '2026-09-06',
      amountPence: 3000,
      parentName: 'Entertainment & Eating Out',
      childName: 'Dining Out & Takeaways',
      targetKind: 'household',
    }),
    // In scope for Alex: a line marked for a person counts whatever parent it
    // sits under — clothing bought inside a grocery shop is still theirs
    // (issue #25)…
    line({
      occurredDate: '2026-09-07',
      amountPence: 8000,
      parentName: 'Groceries',
      childName: 'Weekly Shop',
      targetKind: 'person',
      targetId: 1,
    }),
    // …and a vehicle-targeted line belongs to the vehicle.
    line({
      occurredDate: '2026-09-08',
      amountPence: 1200,
      parentName: 'Personal',
      childName: 'Hobbies',
      targetKind: 'vehicle',
      targetId: 9,
    }),
  ];

  it('attributes by "For: person" and keeps household spending as its own series', () => {
    const series = personalSpendSeries(lines, people, { today: TODAY, months: 1, parentNames });
    assert.deepEqual(
      series.series.map((ref) => ref.key),
      ['person:1', 'person:2', 'household'],
    );
    // Alex: clothing plus the grocery line marked for them (issue #25).
    assert.deepEqual(
      series.totals.map((total) => total.amountPence),
      [4500 + 8000, 2000, 3000],
    );
    assert.deepEqual(series.totals[0]?.children, [
      { child: 'Groceries / Weekly Shop', amountPence: 8000 },
      { child: 'Personal / Clothing & Shoes', amountPence: 4500 },
    ]);
    assert.equal(series.months[0]?.totalPence, 4500 + 8000 + 2000 + 3000);
    assert.match(series.headline, /Alex £125\.00, Sam £20\.00, Household £30\.00/);
  });

  it('never splits a household line across person series', () => {
    const series = personalSpendSeries(lines, people, { today: TODAY, months: 1, parentNames });
    const household = series.totals.find((total) => total.key === 'household');
    assert.equal(household?.amountPence, 3000);
    assert.deepEqual(household?.children, [
      { child: 'Entertainment & Eating Out / Dining Out & Takeaways', amountPence: 3000 },
    ]);
  });

  it("counts a person's lines under any parent, while the household series keeps the parent scope", () => {
    const withNewChild = [
      ...lines,
      line({
        occurredDate: '2026-09-09',
        amountPence: 999,
        parentName: 'Personal',
        childName: 'Book Club',
        targetKind: 'person',
        targetId: 1,
      }),
      // Subscriptions & Streaming, marked for the household as agreed.
      line({
        occurredDate: '2026-09-10',
        amountPence: 1499,
        parentName: 'Entertainment & Eating Out',
        childName: 'Subscriptions & Streaming',
        targetKind: 'household',
      }),
      // A household line outside the discretionary parents stays out: the
      // joint grocery shop is not the household's discretionary bar.
      line({
        occurredDate: '2026-09-11',
        amountPence: 5000,
        parentName: 'Groceries',
        childName: 'Weekly Shop',
        targetKind: 'household',
      }),
    ];
    const series = personalSpendSeries(withNewChild, people, {
      today: TODAY,
      months: 1,
      parentNames,
    });
    // Alex: clothing, the grocery line marked for them, and the new child.
    assert.equal(series.totals[0]?.amountPence, 4500 + 8000 + 999);
    // Household: dining plus the shared subscription; the grocery shop stays out.
    assert.equal(series.totals[2]?.amountPence, 3000 + 1499);
  });

  it('honours the filter chips, headline and totals included', () => {
    const series = personalSpendSeries(lines, people, {
      today: TODAY,
      months: 1,
      parentNames,
      include: ['person:2'],
    });
    assert.deepEqual(
      series.series.map((ref) => ref.label),
      ['Sam'],
    );
    assert.equal(series.months[0]?.totalPence, 2000);
    assert.match(series.headline, /^Over 1 month: Sam £20\.00\.$/);
  });

  it('lists a person with nothing spent as an honest zero', () => {
    const series = personalSpendSeries([], people, { today: TODAY, months: 2, parentNames });
    assert.equal(series.series.length, 3);
    assert.deepEqual(
      series.totals.map((total) => total.amountPence),
      [0, 0, 0],
    );
  });
});

describe('chart series: fixed commitments (D)', () => {
  const tracked = [10, 11];
  const lines = [
    commitmentLine({
      occurredDate: '2026-06-04',
      amountPence: 5000,
      categoryId: 10,
      parentName: 'Utilities',
      childName: 'Energy',
      scheduleConverted: true,
    }),
    commitmentLine({
      occurredDate: '2026-07-04',
      amountPence: 4800,
      categoryId: 10,
      parentName: 'Utilities',
      childName: 'Energy',
      scheduleConverted: true,
    }),
    commitmentLine({
      occurredDate: '2026-08-04',
      amountPence: 4600,
      categoryId: 10,
      parentName: 'Utilities',
      childName: 'Energy',
      scheduleConverted: true,
    }),
    // Same month, same tracked set, but typed in by hand.
    commitmentLine({
      occurredDate: '2026-08-12',
      amountPence: 1200,
      categoryId: 11,
      parentName: 'Vehicle Running',
      childName: 'Insurance',
      scheduleConverted: false,
    }),
    // Untracked: the household left Fuel unticked on purpose.
    commitmentLine({
      occurredDate: '2026-08-15',
      amountPence: 6000,
      categoryId: 12,
      parentName: 'Vehicle Running',
      childName: 'Fuel',
      scheduleConverted: false,
    }),
  ];

  it('counts only the tracked child categories', () => {
    const series = commitmentSeries(lines, {
      today: TODAY,
      months: 4,
      trackedCategoryIds: tracked,
    });
    assert.deepEqual(
      series.months.map((month) => [month.label, month.amountPence]),
      [
        ['June 2026', 5000],
        ['July 2026', 4800],
        ['August 2026', 5800],
        ['September 2026', 0],
      ],
    );
    assert.deepEqual(
      series.byCategory.map((entry) => [entry.child, entry.amountPence]),
      [
        ['Energy', 14400],
        ['Insurance', 1200],
      ],
    );
  });

  it('narrows to schedule-converted purchases when the toggle is on', () => {
    const series = commitmentSeries(lines, {
      today: TODAY,
      months: 4,
      trackedCategoryIds: tracked,
      scheduleOnly: true,
    });
    assert.equal(series.months[2]?.amountPence, 4600);
    assert.match(series.headline, /schedule-converted only/);
  });

  it('compares the latest complete month with the complete month before it', () => {
    const series = commitmentSeries(lines, {
      today: TODAY,
      months: 5,
      trackedCategoryIds: tracked,
    });
    assert.equal(series.latestCompleteLabel, 'August 2026');
    assert.equal(series.comparedLabel, 'July 2026');
    assert.equal(series.comparedPence, 4800);
    assert.equal(series.deltaPence, 1000);
    assert.match(series.headline, /up £10\.00 on July 2026/);
  });

  it('states the latest complete month alone when it has no predecessor', () => {
    const series = commitmentSeries([lines[0] as ChartSpendingLine], {
      // June 2026 alone: one complete month, nothing before it to compare.
      today: '2026-07-15',
      months: 2,
      trackedCategoryIds: tracked,
    });
    assert.equal(series.latestCompleteLabel, 'June 2026');
    assert.equal(series.comparedLabel, null);
    assert.equal(series.deltaPence, null);
    assert.match(series.headline, /£50\.00 in June 2026\.$/);
  });

  it('says what to do when nothing is tracked yet', () => {
    const series = commitmentSeries(lines, {
      today: TODAY,
      months: 4,
      trackedCategoryIds: [],
    });
    assert.equal(
      series.months.every((month) => month.amountPence === 0),
      true,
    );
    assert.match(series.headline, /No categories are tracked.*Settings/);
  });
});

describe('chart drill-down links', () => {
  it('builds a /purchases URL the review page already understands', () => {
    assert.equal(
      purchasesHref({ from: '2026-09-08', to: '2026-09-14', categoryIds: [3] }),
      '/purchases?from=2026-09-08&to=2026-09-14&categoryId=3',
    );
    assert.equal(
      purchasesHref({
        from: '2026-07-01',
        to: '2026-07-31',
        categoryIds: [6, 7],
        targetKind: 'person',
        targetId: 2,
      }),
      '/purchases?from=2026-07-01&to=2026-07-31&categoryId=6&categoryId=7&targetKind=person&targetId=2',
    );
    assert.equal(
      purchasesHref({ from: '2026-07-01', to: '2026-07-31', categoryIds: [9], scheduleOnly: true }),
      '/purchases?from=2026-07-01&to=2026-07-31&categoryId=9&scheduleOnly=1',
    );
    assert.equal(purchasesHref({}), '/purchases');
  });
});

describe('chart geometry', () => {
  it('always includes zero, so no chart of money floats off the baseline', () => {
    const domain = chartDomain([120000, 125000, 123000]);
    assert.equal(domain.min, 0);
    assert.equal(domain.ticks.includes(0), true);
    assert.equal(domain.max >= 125000, true);
  });

  it('gives the below-zero half real room instead of a sliver', () => {
    const domain = chartDomain([100000, 50000, -2000]);
    const share = (0 - domain.min) / (domain.max - domain.min);
    assert.equal(share >= 0.15, true, `sub-zero share was ${share}`);
    assert.equal(domain.ticks.includes(0), true);
  });

  it('handles an all-negative series and a single point', () => {
    const negative = chartDomain([-5000, -12000]);
    assert.equal(negative.min <= -12000, true);
    assert.equal(negative.max >= 0, true);

    const single = chartDomain([4200]);
    assert.equal(single.min, 0);
    assert.equal(single.max > 4200, true);

    const empty = chartDomain([]);
    assert.equal(empty.min, 0);
    assert.equal(empty.max > 0, true);
    assert.equal(empty.ticks.length >= 2, true);
  });

  it('places values inside the plot box, top to bottom', () => {
    const domain = chartDomain([0, 10000]);
    const plot = { left: 40, top: 10, width: 200, height: 100 };
    const bottom = yFor(domain.min, domain, plot);
    const top = yFor(domain.max, domain, plot);
    assert.equal(bottom, 110);
    assert.equal(top, 10);
    assert.equal(yFor(999999, domain, plot), top, 'values above the domain clamp to the top');
  });

  it('rounds steps and axis labels to figures a person can read', () => {
    assert.equal(niceStep(230), 250);
    assert.equal(niceStep(1100), 2000);
    assert.equal(niceStep(0), 1);
    assert.equal(formatAxisPence(0), '£0');
    assert.equal(formatAxisPence(8500), '£85');
    assert.equal(formatAxisPence(-250000), '-£2.5k');
    assert.equal(formatAxisPence(123456), '£1.2k');
  });
});

describe('chart series: spending pace (G)', () => {
  it('names the first qualifying month from the earliest entry', () => {
    assert.deepEqual(firstQualifyingMonth('2026-08-15'), { year: 2026, month: 9 });
    assert.deepEqual(firstQualifyingMonth('2026-08-01'), { year: 2026, month: 8 });
    assert.deepEqual(firstQualifyingMonth('2026-12-31'), { year: 2027, month: 1 });
  });

  it('lists qualifying months oldest first, the lived month incomplete', () => {
    const months = qualifyingMonths('2026-08-15', '2026-10-11');
    assert.deepEqual(
      months.map((month) => month.key),
      ['2026-09', '2026-10'],
    );
    assert.equal(months[0]?.complete, true);
    assert.equal(months[0]?.label, 'September 2026');
    assert.equal(months[1]?.complete, false);
    // While the first qualifying month is still being lived there is no
    // completed month to compare against.
    const early = qualifyingMonths('2026-08-15', '2026-09-20');
    assert.deepEqual(
      early.map((month) => month.key),
      ['2026-09'],
    );
    assert.equal(
      early.some((month) => month.complete),
      false,
    );
    assert.deepEqual(qualifyingMonths(null, '2026-10-11'), []);
  });

  it('round-trips month keys and refuses the ones that name no month', () => {
    assert.equal(monthKey({ year: 2026, month: 9 }), '2026-09');
    assert.deepEqual(parseMonthKey('2026-09'), { year: 2026, month: 9 });
    assert.equal(parseMonthKey('2026-13'), null);
    assert.equal(parseMonthKey('2026-9'), null);
    assert.equal(parseMonthKey('garbage'), null);
  });

  it('adds spending up day by day, carrying quiet days forward flat', () => {
    const series = cumulativeMonthSeries(
      [
        line({ occurredDate: '2026-09-01', amountPence: 1000, categoryId: 1 }),
        line({ occurredDate: '2026-09-03', amountPence: 500, categoryId: 2 }),
        // A refund lands as a negative line and can pull the day backwards.
        line({ occurredDate: '2026-09-03', amountPence: -200, categoryId: 1 }),
        line({ occurredDate: '2026-09-30', amountPence: 100, categoryId: 2 }),
        // Outside the month: ignored.
        line({ occurredDate: '2026-08-31', amountPence: 9999 }),
      ],
      { month: { year: 2026, month: 9 }, today: '2026-10-11' },
    );
    assert.equal(series.days.length, 30);
    assert.equal(series.complete, true);
    assert.equal(series.drawnTo, '2026-09-30');
    assert.deepEqual(series.days[0], {
      day: 1,
      date: '2026-09-01',
      spentPence: 1000,
      cumulativePence: 1000,
    });
    assert.equal(series.days[1]?.spentPence, 0);
    assert.equal(series.days[1]?.cumulativePence, 1000);
    assert.equal(series.days[2]?.spentPence, 300);
    assert.equal(series.days[2]?.cumulativePence, 1300);
    assert.equal(series.totalPence, 1400);
  });

  it('counts only the chosen categories when a scope is given', () => {
    const series = cumulativeMonthSeries(
      [
        line({ occurredDate: '2026-09-01', amountPence: 1000, categoryId: 1 }),
        line({ occurredDate: '2026-09-03', amountPence: 500, categoryId: 2 }),
        line({ occurredDate: '2026-09-03', amountPence: -200, categoryId: 1 }),
      ],
      { month: { year: 2026, month: 9 }, today: '2026-10-11', categoryIds: [1] },
    );
    assert.equal(series.totalPence, 800);
  });

  it('stops the month being lived at today, and draws nothing for a future month', () => {
    const current = cumulativeMonthSeries(
      [
        line({ occurredDate: '2026-10-02', amountPence: 500 }),
        // Dated later this month but not yet reached: never counted early.
        line({ occurredDate: '2026-10-12', amountPence: 700 }),
      ],
      { month: { year: 2026, month: 10 }, today: '2026-10-11' },
    );
    assert.equal(current.days.length, 11);
    assert.equal(current.complete, false);
    assert.equal(current.drawnTo, '2026-10-11');
    assert.equal(current.totalPence, 500);

    const future = cumulativeMonthSeries([], {
      month: { year: 2026, month: 11 },
      today: '2026-10-11',
    });
    assert.equal(future.days.length, 0);
    assert.equal(future.totalPence, 0);
    assert.equal(future.complete, false);
  });

  it('gives February its real length, leap years included', () => {
    assert.equal(
      cumulativeMonthSeries([], { month: { year: 2026, month: 2 }, today: '2026-10-11' }).days
        .length,
      28,
    );
    assert.equal(
      cumulativeMonthSeries([], { month: { year: 2024, month: 2 }, today: '2026-10-11' }).days
        .length,
      29,
    );
  });

  it('compares at the last common day, then states the finished total', () => {
    const october = cumulativeMonthSeries(
      [line({ occurredDate: '2026-10-01', amountPence: 184200 })],
      { month: { year: 2026, month: 10 }, today: '2026-10-20' },
    );
    const september = cumulativeMonthSeries(
      [
        line({ occurredDate: '2026-09-01', amountPence: 162900 }),
        line({ occurredDate: '2026-09-25', amountPence: 98100 }),
      ],
      { month: { year: 2026, month: 9 }, today: '2026-10-20' },
    );
    const comparison = cumulativeComparison(october, september);
    assert.equal(comparison.commonDay, 20);
    assert.equal(comparison.primaryAtCommonPence, 184200);
    assert.equal(comparison.comparisonAtCommonPence, 162900);
    assert.equal(comparison.deltaPence, 21300);
    assert.equal(
      comparison.headline,
      'By day 20, October 2026 has spent £1,842.00 — £213.00 more than September 2026 at the same point. September 2026 finished at £2,610.00.',
    );
  });

  it('reads two finished months as finished, and equal pace as equal', () => {
    const july = cumulativeMonthSeries(
      [line({ occurredDate: '2026-07-02', amountPence: 100000 })],
      {
        month: { year: 2026, month: 7 },
        today: '2026-10-11',
      },
    );
    const august = cumulativeMonthSeries(
      [line({ occurredDate: '2026-08-02', amountPence: 90000 })],
      { month: { year: 2026, month: 8 }, today: '2026-10-11' },
    );
    assert.equal(
      cumulativeComparison(july, august).headline,
      'July 2026 finished at £1,000.00 — £100.00 more than August 2026 (£900.00).',
    );

    const current = cumulativeMonthSeries(
      [line({ occurredDate: '2026-10-01', amountPence: 5000 })],
      { month: { year: 2026, month: 10 }, today: '2026-10-05' },
    );
    const earlier = cumulativeMonthSeries(
      [
        line({ occurredDate: '2026-09-01', amountPence: 5000 }),
        line({ occurredDate: '2026-09-20', amountPence: 3000 }),
      ],
      { month: { year: 2026, month: 9 }, today: '2026-10-05' },
    );
    const level = cumulativeComparison(current, earlier);
    assert.equal(level.deltaPence, 0);
    assert.match(level.headline, /exactly the same as September 2026 at the same point/);
    assert.match(level.headline, /September 2026 finished at £80\.00\./);
  });
});
