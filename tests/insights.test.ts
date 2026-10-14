import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ANNUAL_COVER_MONTHS,
  GROCERIES_PARENT,
  FUEL_CHILD,
  compareCalendarMonths,
  computeHonestyLoop,
  honestyBand,
  honestyDriftPercent,
  personalSpending,
  spreadOverCoverMonths,
  startOfWeekLocal,
  summarizeSpending,
  vehicleRunningCosts,
  type SpendingLineInput,
} from '../src/lib/records/insights';

/**
 * Insights v1 pure engine (docs/SPEC.md §16, decision 63–67). No DB here —
 * the engine eats flat typed rows; the DB assembly is covered in
 * tests/insights-view.test.ts. All money is integer pence.
 */

/** Unit fixtures that predate any recording rule: recording has always been on. */
const RECORDING_ALWAYS_ON = '2000-01-01';

/**
 * A fixture line. Category ids are assigned per parent/child pair — like the
 * real tree, where every leaf has its own id — so roll-ups keyed by category
 * cannot merge two different children.
 */
const fixtureCategoryIds = new Map<string, number>();
let nextFixtureCategoryId = 1;

function line(
  partial: Partial<SpendingLineInput> & Pick<SpendingLineInput, 'occurredDate' | 'amountPence'>,
): SpendingLineInput {
  const parentName = partial.parentName ?? 'Other';
  const childName = partial.childName ?? 'Other';
  const key = `${parentName}/${childName}`;
  let categoryId = fixtureCategoryIds.get(key);
  if (categoryId === undefined) {
    categoryId = nextFixtureCategoryId;
    nextFixtureCategoryId += 1;
    fixtureCategoryIds.set(key, categoryId);
  }
  return {
    categoryId,
    parentName,
    childName,
    targetKind: 'household',
    targetId: null,
    ...partial,
  };
}

describe('insights: month comparison (panel 1)', () => {
  const lines: SpendingLineInput[] = [
    line({
      occurredDate: '2026-08-01',
      amountPence: 10000,
      parentName: 'Housing',
      childName: 'Council Tax',
    }),
    line({
      occurredDate: '2026-08-31',
      amountPence: 500,
      parentName: 'Groceries',
      childName: 'Weekly Shop',
    }),
    line({
      occurredDate: '2026-09-01',
      amountPence: 9000,
      parentName: 'Groceries',
      childName: 'Weekly Shop',
    }),
    line({
      occurredDate: '2026-09-20',
      amountPence: 2149,
      parentName: 'Personal',
      childName: 'Clothing',
    }),
    // A refund that nets against September groceries.
    line({
      occurredDate: '2026-09-18',
      amountPence: -500,
      parentName: 'Groceries',
      childName: 'Weekly Shop',
    }),
    // Outside both months — must be ignored.
    line({
      occurredDate: '2026-07-31',
      amountPence: 77777,
      parentName: 'Other',
      childName: 'Other',
    }),
  ];

  it('splits lines into full calendar months on local-date boundaries', () => {
    const view = compareCalendarMonths(lines, '2026-09-20');
    assert.equal(view.previous.summary.totalPence, 10500); // 1st + 31st August
    assert.equal(view.current.summary.totalPence, 10649); // 9000 + 2149 − 500
    assert.equal(view.current.deltaPence, 10649 - 10500);
    const groceries = view.current.summary.byParent.find((entry) => entry.parent === 'Groceries');
    assert.equal(groceries?.amountPence, 8500); // refund netted
  });

  it('shows three months oldest-first, each change against the month before', () => {
    const view = compareCalendarMonths(lines, '2026-09-20');
    // September looks back over July, August, September — so two complete
    // months compare even on the 20th (the whole point of the third column).
    assert.deepEqual(
      view.months.map((month) => month.label),
      ['July 2026', 'August 2026', 'September 2026'],
    );
    // The July fixture line now lands in the oldest column, not "outside".
    assert.equal(view.months[0]?.summary.totalPence, 77777);
    assert.equal(view.months[0]?.deltaPence, null); // nothing to compare against
    assert.equal(view.months[1]?.deltaPence, 10500 - 77777);
    assert.equal(view.months[2]?.deltaPence, 10649 - 10500);
  });

  it('honours an explicit month count', () => {
    const view = compareCalendarMonths(lines, '2026-09-20', { months: 2 });
    assert.deepEqual(
      view.months.map((month) => month.label),
      ['August 2026', 'September 2026'],
    );
    assert.equal(view.months[0]?.summary.totalPence, 10500);
    assert.equal(view.months[0]?.deltaPence, null);
  });

  it('flags the in-progress current month and reports deltas per parent', () => {
    const midMonth = compareCalendarMonths(lines, '2026-09-20');
    assert.equal(midMonth.current.inProgress, true);
    const housing = midMonth.byParent.find((row) => row.parent === 'Housing');
    // July, August, September — aligned with the month columns.
    assert.deepEqual(housing?.amountsPence, [0, 10000, 0]);
    assert.deepEqual(housing?.deltasPence, [null, 10000, -10000]);
    // On the last day of the month the current month is complete.
    const monthEnd = compareCalendarMonths(lines, '2026-09-30');
    assert.equal(monthEnd.current.inProgress, false);
  });

  it('keeps month ranges inclusive and DST-adjacent (UK spring-forward boundary)', () => {
    const linesDST: SpendingLineInput[] = [
      line({
        occurredDate: '2026-03-28',
        amountPence: 111,
        parentName: 'Groceries',
        childName: 'Weekly Shop',
      }),
      line({
        occurredDate: '2026-03-29',
        amountPence: 222,
        parentName: 'Groceries',
        childName: 'Weekly Shop',
      }),
      line({
        occurredDate: '2026-03-31',
        amountPence: 333,
        parentName: 'Groceries',
        childName: 'Weekly Shop',
      }),
      line({
        occurredDate: '2026-04-01',
        amountPence: 444,
        parentName: 'Groceries',
        childName: 'Weekly Shop',
      }),
    ];
    const view = compareCalendarMonths(linesDST, '2026-04-01');
    // March is previous (complete), April is current (in progress, 1 day in).
    assert.equal(view.previous.summary.totalPence, 111 + 222 + 333);
    assert.equal(view.current.summary.totalPence, 444);
    assert.equal(view.current.inProgress, true);
  });
});

describe('insights: personal spending (panel 2)', () => {
  const people = [
    { id: 1, label: 'Alex' },
    { id: 2, label: 'Sam' },
  ];
  const lines: SpendingLineInput[] = [
    line({
      occurredDate: '2026-09-05',
      amountPence: 2000,
      parentName: 'Personal',
      childName: 'Clothing',
      targetKind: 'person',
      targetId: 2,
    }),
    line({
      occurredDate: '2026-09-06',
      amountPence: 1500,
      parentName: 'Personal',
      childName: 'Hobbies',
      targetKind: 'person',
      targetId: 2,
    }),
    line({
      occurredDate: '2026-09-07',
      amountPence: 9000,
      parentName: 'Groceries',
      childName: 'Weekly Shop',
      // Household lines are NEVER attributed to the payer (decision 65).
    }),
    line({
      occurredDate: '2026-08-01',
      amountPence: 9999,
      parentName: 'Personal',
      childName: 'Clothing',
      targetKind: 'person',
      targetId: 1,
    }),
    line({
      occurredDate: '2026-09-08',
      amountPence: 4000,
      parentName: 'Vehicle Running',
      childName: 'Fuel',
      targetKind: 'vehicle',
      targetId: 7,
    }),
  ];

  it('attributes only explicit person lines within the window', () => {
    const result = personalSpending(lines, people, '2026-09-01', '2026-09-30');
    const alex = result.find((row) => row.personId === 1);
    const sam = result.find((row) => row.personId === 2);
    assert.equal(alex?.totalPence, 0); // August line is outside the window
    assert.equal(sam?.totalPence, 3500);
    assert.equal(sam?.byParent[0]?.parent, 'Personal');
    assert.equal(sam?.byParent[0]?.amountPence, 3500);
  });

  it('lists every person, including zero-activity ones', () => {
    const result = personalSpending([], people, '2026-09-01', '2026-09-30');
    assert.deepEqual(
      result.map((row) => row.person),
      ['Alex', 'Sam'],
    );
    assert.ok(result.every((row) => row.totalPence === 0));
  });
});

describe('insights: vehicle running costs (panel 3)', () => {
  const vehicles = [
    { id: 1, label: 'Vehicle A' },
    { id: 2, label: 'Vehicle B' },
  ];

  it('computes current month, previous month and the rolling 12-month window', () => {
    const today = '2026-09-20';
    const lines: SpendingLineInput[] = [
      line({
        occurredDate: '2026-09-05',
        amountPence: 5820,
        parentName: 'Vehicle Running',
        childName: FUEL_CHILD,
        targetKind: 'vehicle',
        targetId: 1,
      }),
      line({
        occurredDate: '2026-08-15',
        amountPence: 4000,
        parentName: 'Vehicle Running',
        childName: FUEL_CHILD,
        targetKind: 'vehicle',
        targetId: 1,
      }),
      // First day of the rolling window — included.
      line({
        occurredDate: '2025-10-01',
        amountPence: 1200,
        parentName: 'Vehicle Running',
        childName: 'Insurance',
        targetKind: 'vehicle',
        targetId: 1,
      }),
      // One day before the rolling window — excluded.
      line({
        occurredDate: '2025-09-30',
        amountPence: 80000,
        parentName: 'Vehicle Running',
        childName: 'Insurance',
        targetKind: 'vehicle',
        targetId: 1,
      }),
      // Someone else's vehicle.
      line({
        occurredDate: '2026-09-01',
        amountPence: 6000,
        parentName: 'Vehicle Running',
        childName: FUEL_CHILD,
        targetKind: 'vehicle',
        targetId: 2,
      }),
      // Household-targeted vehicle-adjacent spending is not a running cost.
      line({
        occurredDate: '2026-09-01',
        amountPence: 7000,
        parentName: 'Vehicle Running',
        childName: 'Fuel',
      }),
    ];
    const result = vehicleRunningCosts(lines, vehicles, today);
    const a = result.find((row) => row.vehicleId === 1);
    const b = result.find((row) => row.vehicleId === 2);
    assert.equal(a?.rolling12From, '2025-10-01');
    assert.equal(a?.monthPence, 5820);
    assert.equal(a?.previousMonthPence, 4000);
    assert.equal(a?.rolling12Pence, 5820 + 4000 + 1200);
    const insurance = a?.byChild.find((row) => row.child === 'Insurance');
    assert.equal(insurance?.amountPence, 1200);
    assert.equal(b?.monthPence, 6000);
    assert.equal(b?.rolling12Pence, 6000);
  });

  it('reports zero for vehicles with no lines, and spans year boundaries (DST + year edge)', () => {
    const lines: SpendingLineInput[] = [
      line({
        occurredDate: '2025-12-31',
        amountPence: 100,
        parentName: 'Vehicle Running',
        childName: FUEL_CHILD,
        targetKind: 'vehicle',
        targetId: 1,
      }),
    ];
    // 2026-01-05: current month January 2026, previous December 2025,
    // rolling window starts 2025-02-01.
    const result = vehicleRunningCosts(lines, vehicles, '2026-01-05');
    const a = result.find((row) => row.vehicleId === 1);
    assert.equal(a?.rolling12From, '2025-02-01');
    assert.equal(a?.monthPence, 0);
    assert.equal(a?.previousMonthPence, 100);
    assert.equal(a?.rolling12Pence, 100);
    const b = result.find((row) => row.vehicleId === 2);
    assert.equal(b?.rolling12Pence, 0);
  });
});

describe('insights: annual payments spread ÷ 12 (decision 190)', () => {
  const vehicles = [
    { id: 1, label: 'Vehicle A' },
    { id: 2, label: 'Vehicle B' },
  ];
  /** An annual premium on Vehicle A's insurance (cover = 12 months, as the DB assembly sets it). */
  const premium = (
    occurredDate: string,
    amountPence: number,
    partial: Partial<SpendingLineInput> = {},
  ): SpendingLineInput =>
    line({
      occurredDate,
      amountPence,
      parentName: 'Vehicle Running',
      childName: 'Insurance',
      targetKind: 'vehicle',
      targetId: 1,
      coversMonths: ANNUAL_COVER_MONTHS,
      ...partial,
    });

  it('splits a payment into twelve shares, one per month from the payment month', () => {
    const shares = spreadOverCoverMonths(premium('2026-08-24', 61500));
    assert.deepEqual(
      shares.map((share) => share.occurredDate),
      [
        '2026-08-01',
        '2026-09-01',
        '2026-10-01',
        '2026-11-01',
        '2026-12-01',
        '2027-01-01',
        '2027-02-01',
        '2027-03-01',
        '2027-04-01',
        '2027-05-01',
        '2027-06-01',
        '2027-07-01',
      ],
    );
    assert.ok(shares.every((share) => share.amountPence === 5125));
    assert.ok(shares.every((share) => share.coversMonths === 1));
  });

  it('gives the leftover pence to the earliest months, so the shares always sum to the premium', () => {
    const shares = spreadOverCoverMonths(premium('2026-08-24', 100));
    assert.deepEqual(
      shares.map((share) => share.amountPence),
      [9, 9, 9, 9, 8, 8, 8, 8, 8, 8, 8, 8],
    );
    assert.equal(
      shares.reduce((sum, share) => sum + share.amountPence, 0),
      100,
    );
  });

  it('keeps the sum exact and the shares within one penny of each other, including refunds and odd totals', () => {
    for (const amount of [0, 1, 11, 12, 13, 61499, 61500, 61501, 99999, -1, -13, -100, -61501]) {
      const shares = spreadOverCoverMonths(premium('2026-08-24', amount));
      assert.equal(
        shares.reduce((sum, share) => sum + share.amountPence, 0),
        amount,
        `sum for ${amount}`,
      );
      const values = shares.map((share) => share.amountPence);
      assert.ok(Math.max(...values) - Math.min(...values) <= 1, `spread for ${amount}`);
    }
    const refund = spreadOverCoverMonths(premium('2026-08-24', -100));
    assert.deepEqual(
      refund.map((share) => share.amountPence),
      [-8, -8, -8, -8, -8, -8, -8, -8, -9, -9, -9, -9],
    );
  });

  it('leaves a monthly payment or an ordinary purchase unchanged', () => {
    const monthly = line({
      occurredDate: '2026-09-24',
      amountPence: 5125,
      targetKind: 'vehicle',
      targetId: 1,
    });
    assert.deepEqual(spreadOverCoverMonths(monthly), [monthly]);
  });

  it('rejects a cover length outside 1–12 instead of inventing a spread', () => {
    for (const months of [0, 13, 1.5, -12]) {
      assert.throws(
        () => spreadOverCoverMonths(premium('2026-08-24', 61500, { coversMonths: months })),
        /covering 1–12 months/,
      );
    }
  });

  it('shows a yearly premium as one twelfth in each month it covers; the in-progress month counts in full', () => {
    // Paid 24 Aug 2026. Today is 20 Sep 2026, so September's share is in progress.
    const [a] = vehicleRunningCosts([premium('2026-08-24', 61500)], vehicles, '2026-09-20');
    assert.equal(a?.previousMonthPence, 5125); // August
    assert.equal(a?.monthPence, 5125); // September (partial)
    assert.equal(a?.rolling12From, '2025-10-01');
    // Only August and September have started; later shares are not yet due.
    assert.equal(a?.rolling12Pence, 10250);
    assert.equal(a?.annualSpreadPence, 10250);
  });

  it('a window edge: a payment whose cover reaches the window counts from its first month; one that ends before it counts nothing', () => {
    // Covers Oct 2025 – Sep 2026: the whole window (opens 1 Oct 2025).
    const covering = vehicleRunningCosts([premium('2025-10-15', 61500)], vehicles, '2026-09-20')[0];
    assert.equal(covering?.rolling12Pence, 61500);
    // Covers Oct 2024 – Sep 2025: ends the month before the window opens.
    const ended = vehicleRunningCosts([premium('2024-10-15', 61500)], vehicles, '2026-09-20')[0];
    assert.equal(ended?.rolling12Pence, 0);
    // Covers Sep 2025 – Aug 2026: only Oct 2025 – Aug 2026 (eleven shares) fall in the window.
    const partial = vehicleRunningCosts([premium('2025-09-15', 61500)], vehicles, '2026-09-20')[0];
    assert.equal(partial?.rolling12Pence, 11 * 5125);
  });

  it('a share dated after today is outside every figure', () => {
    // Paid 1 Oct 2026: nothing of it has started by 20 Sep 2026.
    const [a] = vehicleRunningCosts([premium('2026-10-01', 61500)], vehicles, '2026-09-20');
    assert.equal(a?.monthPence, 0);
    assert.equal(a?.previousMonthPence, 0);
    assert.equal(a?.rolling12Pence, 0);
  });

  it('a steady year: two annual payments in the window total exactly one premium', () => {
    const lines = [premium('2025-08-24', 60000), premium('2026-08-24', 60000)];
    const [a] = vehicleRunningCosts(lines, vehicles, '2026-10-09');
    assert.equal(a?.rolling12From, '2025-11-01');
    assert.equal(a?.rolling12Pence, 60000);
    assert.equal(a?.monthPence, 5000); // October 2026
    assert.equal(a?.previousMonthPence, 5000); // September 2026
  });

  it('reports the spread apart from the rest in each child category, and per vehicle', () => {
    const lines = [
      premium('2025-08-24', 60000), // Vehicle A: Oct 2025 – Jul 2026 in the window = 10 shares
      line({
        occurredDate: '2026-09-05',
        amountPence: 5820,
        parentName: 'Vehicle Running',
        childName: FUEL_CHILD,
        targetKind: 'vehicle',
        targetId: 1,
      }),
      // Vehicle B pays monthly: nothing spread.
      line({
        occurredDate: '2026-09-01',
        amountPence: 5000,
        parentName: 'Vehicle Running',
        childName: 'Insurance',
        targetKind: 'vehicle',
        targetId: 2,
      }),
    ];
    const [a, b] = vehicleRunningCosts(lines, vehicles, '2026-09-20');
    const insurance = a?.byChild.find((row) => row.child === 'Insurance');
    assert.equal(insurance?.amountPence, 50000);
    assert.equal(insurance?.spreadPence, 50000);
    const fuel = a?.byChild.find((row) => row.child === FUEL_CHILD);
    assert.equal(fuel?.amountPence, 5820);
    assert.equal(fuel?.spreadPence, 0);
    assert.equal(a?.rolling12Pence, 55820);
    assert.equal(a?.annualSpreadPence, 50000);
    assert.equal(b?.annualSpreadPence, 0);
    assert.equal(b?.rolling12Pence, 5000);
  });

  it('leaves every cash-basis summary on the payment date', () => {
    const lines = [premium('2026-08-24', 61500)];
    assert.equal(summarizeSpending(lines, '2026-08-01', '2026-08-31').totalPence, 61500);
    assert.equal(summarizeSpending(lines, '2026-09-01', '2026-09-30').totalPence, 0);
  });
});

describe('insights: honesty loop (panel 4)', () => {
  it('uses only complete Monday–Sunday weeks, even across the UK spring-forward', () => {
    // 2026-03-29 is the last Sunday of March — the clocks go forward on it.
    const today = '2026-03-29';
    assert.equal(startOfWeekLocal(today), '2026-03-23'); // this (incomplete) week's Monday
    const lines: SpendingLineInput[] = [
      // Inside the last COMPLETE week (ends 2026-03-22).
      line({
        occurredDate: '2026-03-16',
        amountPence: 9500,
        parentName: GROCERIES_PARENT,
        childName: 'Weekly Shop',
      }),
      // Inside the INCOMPLETE current week (2026-03-23 → 2026-03-29) — excluded.
      line({
        occurredDate: '2026-03-25',
        amountPence: 12345,
        parentName: GROCERIES_PARENT,
        childName: 'Weekly Shop',
      }),
      // Before the 8-week window (window starts 2026-01-26) — excluded.
      line({
        occurredDate: '2026-01-25',
        amountPence: 77777,
        parentName: GROCERIES_PARENT,
        childName: 'Weekly Shop',
      }),
      // A refund in the window nets off.
      line({
        occurredDate: '2026-03-18',
        amountPence: -500,
        parentName: GROCERIES_PARENT,
        childName: 'Weekly Shop',
      }),
    ];
    const loop = computeHonestyLoop(
      lines,
      { weeklyGroceriesPence: 9000, monthlyFuelPence: [] },
      today,
      { recordedFrom: RECORDING_ALWAYS_ON },
    );
    assert.equal(loop.groceries.weeks.length, 8);
    assert.equal(loop.groceries.weeks[loop.groceries.weeks.length - 1]?.weekStart, '2026-03-16');
    assert.equal(loop.groceries.weeks[loop.groceries.weeks.length - 1]?.actualPence, 9000); // 9500 − 500
    // Only one of the eight weeks has activity: 9000 / 8 = 1125 exactly.
    assert.equal(loop.groceries.averageWeeklyPence, 1125);
    assert.equal(loop.groceries.driftPence, 1125 - 9000); // running ~£8k under config
  });

  it('rounds weekly averages half-up and leaves drift null when unconfigured', () => {
    // 2026-09-10 sits in the complete week of 2026-09-07 (today's week,
    // 2026-09-14 → 2026-09-20, is excluded by the engine).
    const lines: SpendingLineInput[] = [
      line({
        occurredDate: '2026-09-10',
        amountPence: 9500,
        parentName: GROCERIES_PARENT,
        childName: 'Weekly Shop',
      }),
    ];
    const loop = computeHonestyLoop(
      lines,
      { weeklyGroceriesPence: null, monthlyFuelPence: [] },
      '2026-09-20',
      { recordedFrom: RECORDING_ALWAYS_ON },
    );
    // 9500 / 8 = 1187.5 → half-up 1188.
    assert.equal(loop.groceries.averageWeeklyPence, 1188);
    assert.equal(loop.groceries.driftPence, null);
  });

  it('uses the last three COMPLETE calendar months for fuel per vehicle', () => {
    const today = '2026-09-20';
    const lines: SpendingLineInput[] = [
      line({
        occurredDate: '2026-06-10',
        amountPence: 1000,
        parentName: 'Vehicle Running',
        childName: FUEL_CHILD,
        targetKind: 'vehicle',
        targetId: 1,
      }),
      line({
        occurredDate: '2026-07-10',
        amountPence: 2000,
        parentName: 'Vehicle Running',
        childName: FUEL_CHILD,
        targetKind: 'vehicle',
        targetId: 1,
      }),
      line({
        occurredDate: '2026-08-10',
        amountPence: 4000,
        parentName: 'Vehicle Running',
        childName: FUEL_CHILD,
        targetKind: 'vehicle',
        targetId: 1,
      }),
      // The partial current month (September) must NOT enter the average.
      line({
        occurredDate: '2026-09-15',
        amountPence: 88888,
        parentName: 'Vehicle Running',
        childName: FUEL_CHILD,
        targetKind: 'vehicle',
        targetId: 1,
      }),
    ];
    const loop = computeHonestyLoop(
      lines,
      {
        weeklyGroceriesPence: null,
        monthlyFuelPence: [
          { vehicleId: 1, label: 'Vehicle A', configuredPence: 3000 },
          { vehicleId: 2, label: 'Vehicle B', configuredPence: null },
        ],
      },
      today,
      { recordedFrom: RECORDING_ALWAYS_ON },
    );
    const a = loop.fuel.find((row) => row.vehicleId === 1);
    assert.deepEqual(
      a?.months.map((month) => month.month),
      ['2026-06', '2026-07', '2026-08'],
    );
    // (1000 + 2000 + 4000) / 3 = 2333.33 → half-up 2333.
    assert.equal(a?.averageMonthlyPence, 2333);
    assert.equal(a?.driftPence, 2333 - 3000);
    const b = loop.fuel.find((row) => row.vehicleId === 2);
    assert.equal(b?.averageMonthlyPence, 0);
    assert.equal(b?.driftPence, null);
  });

  it('reads drift within −15%…+10% as normal, stronger bands outside it (issue #27)', () => {
    // Configured £85.00 throughout: the edges belong to the band itself.
    assert.equal(honestyBand(0, 8500), 'within-tolerance');
    assert.equal(honestyBand(850, 8500), 'within-tolerance'); // +10% exactly
    assert.equal(honestyBand(851, 8500), 'above-tolerance');
    assert.equal(honestyBand(-1275, 8500), 'within-tolerance'); // −15% exactly
    assert.equal(honestyBand(-1276, 8500), 'below-tolerance');
    assert.equal(honestyBand(2000, 8500), 'above-tolerance');
    assert.equal(honestyBand(-2000, 8500), 'below-tolerance');
    // The edges test the EXACT ratio, not the rounded display percent:
    // +10.4% is above the band even though it shows as "10% over".
    assert.equal(honestyBand(884, 8500), 'above-tolerance');
    assert.equal(honestyDriftPercent(884, 8500), 10);
  });

  it('has no band without a configured figure, and no percent off a zero one', () => {
    assert.equal(honestyBand(null, 8500), null);
    assert.equal(honestyBand(500, null), null);
    assert.equal(honestyBand(null, null), null);
    // A zero configured figure cannot take a percentage: any drift is out
    // of band on its own side, and the sentence shows pounds only.
    assert.equal(honestyBand(0, 0), 'within-tolerance');
    assert.equal(honestyBand(500, 0), 'above-tolerance');
    assert.equal(honestyBand(-500, 0), 'below-tolerance');
    assert.equal(honestyDriftPercent(500, null), null);
    assert.equal(honestyDriftPercent(500, 0), null);
    assert.equal(honestyDriftPercent(0, 8500), 0);
  });

  it('reports the drift as a whole signed percent, rounded half-up', () => {
    assert.equal(honestyDriftPercent(1020, 8500), 12);
    assert.equal(honestyDriftPercent(-1275, 8500), -15);
    assert.equal(honestyDriftPercent(893, 8500), 11); // 10.5…% rounds up
    assert.equal(honestyDriftPercent(840, 8000), 11); // exactly 10.5% → 11
    assert.equal(honestyDriftPercent(-840, 8000), -11);
  });
});

describe('insights: summarizeSpending window math', () => {
  it('is inclusive at both ends', () => {
    const lines: SpendingLineInput[] = [
      line({ occurredDate: '2026-09-01', amountPence: 100 }),
      line({ occurredDate: '2026-09-15', amountPence: 200 }),
      line({ occurredDate: '2026-09-30', amountPence: 300 }),
      line({ occurredDate: '2026-08-31', amountPence: 11111 }),
    ];
    const summary = summarizeSpending(lines, '2026-09-01', '2026-09-30');
    assert.equal(summary.totalPence, 600);
  });
});
