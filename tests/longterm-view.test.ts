import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { growMonthlyPence } from '../src/lib/longterm/model';
import {
  ageYearLabel,
  annuityAnnualPence,
  pensionComparisons,
  planWarnings,
  projectedPensionPotPence,
  runComparison,
  sustainabilityOf,
  yearTableRows,
} from '../src/lib/longterm/view';
import type { LongTermPlanDocument } from '../src/lib/longterm/plan';
import type {
  InvestmentPlan,
  LongTermPerson,
  LongTermPlan,
  PensionPotPlan,
} from '../src/lib/longterm/types';

const START = '2026-01-01';

function pot(overrides: Partial<PensionPotPlan> = {}): PensionPotPlan {
  return {
    id: 'pension-1',
    label: 'Pension A',
    currentPence: 0,
    growthBp: 0,
    startDate: '2030-01-01',
    takeUp: 'drawdown',
    annuityPencePer100k: 550_000,
    annuityEscalationBp: 0,
    drawdownAnnualPence: 0,
    ...overrides,
  };
}

function person(overrides: Partial<LongTermPerson> = {}): LongTermPerson {
  return {
    id: 'p1',
    label: 'Alex',
    birthYear: 1970,
    earnings: null,
    statePension: null,
    pensionPots: [],
    ...overrides,
  };
}

function document(
  overrides: Partial<LongTermPlan> = {},
  comparisonRatesBp: [number, number, number] = [400, 600, 800],
): LongTermPlanDocument {
  return {
    plan: {
      people: [person()],
      investments: [],
      windfalls: [],
      spending: { monthlyPence: 100_000, otherAnnualPence: 0 },
      commitments: [],
      inflationBp: 250,
      isaShelterAnnualPence: 0,
      horizonEndDate: '2070-12-31',
      ...overrides,
    },
    comparisonRatesBp,
  };
}

function gia(valuePence: number): InvestmentPlan {
  return {
    id: 'gia',
    label: 'General investment account',
    ownerPersonId: 'p1',
    wrapper: 'gia',
    currentPence: valuePence,
    costBasisPence: valuePence,
    growthBp: 600,
    incomeShareBp: 0,
    incomeKind: 'dividends',
  };
}

describe('long-term view: the three comparison runs (LONGTERM_FORECASTING.md §5.3)', () => {
  it('runs the same plan at the three rates and a higher rate leaves more capital', () => {
    const runs = runComparison(
      document({
        investments: [gia(10_000_000)],
        spending: { monthlyPence: 0, otherAnnualPence: 0 },
      }),
      START,
    );
    assert.deepEqual(
      runs.map((run) => run.rateBp),
      [400, 600, 800],
    );
    assert.deepEqual(
      runs.map((run) => run.key),
      ['cautious', 'middle', 'optimistic'],
    );
    const end = runs.map((run) => run.result.years[run.result.years.length - 1]?.capitalPence ?? 0);
    assert.ok((end[0] as number) < (end[1] as number));
    assert.ok((end[1] as number) < (end[2] as number));
  });

  it('reports whether the money covers the whole forecast', () => {
    const covered = runComparison(
      document({
        investments: [gia(100_000_000)],
        spending: { monthlyPence: 0, otherAnnualPence: 0 },
      }),
      START,
    )[1];
    assert.ok(covered);
    assert.deepEqual(sustainabilityOf(covered.result), {
      firstShortfallYear: null,
      runsOutInYear: null,
      coversWholeForecast: true,
      lastsToYear: 2070,
      gapYears: [],
      firstCoveredAfterGapYear: null,
      endYear: 2070,
    });

    const exhausted = runComparison(
      document(
        {
          investments: [gia(2_460_000)],
          spending: { monthlyPence: 100_000, otherAnnualPence: 0 },
          horizonEndDate: '2028-12-31',
        },
        [0, 0, 0],
      ),
      START,
    )[1];
    assert.ok(exhausted);
    assert.deepEqual(sustainabilityOf(exhausted.result), {
      firstShortfallYear: 2028,
      runsOutInYear: 2028,
      coversWholeForecast: false,
      lastsToYear: 2027,
      gapYears: [],
      firstCoveredAfterGapYear: null,
      endYear: 2028,
    });
  });
});

describe('long-term view: the year table in both monies (§5.5)', () => {
  it('shows future money and today’s money, identical in the baseline year', () => {
    const rows = yearTableRows(
      runComparison(
        document({
          investments: [gia(10_000_000)],
          inflationBp: 250,
          horizonEndDate: '2028-12-31',
        }),
        START,
      )[1]!.result,
    );
    assert.equal(rows[0]?.year, 2026);
    assert.equal(rows[0]?.incomePence, rows[0]?.incomeTodayPence);
    assert.equal(rows[0]?.capitalPence, rows[0]?.capitalTodayPence);
    const second = rows[1];
    assert.ok(second);
    assert.equal(second.year, 2027);
    assert.ok(second.spendingTodayPence < second.spendingPence);
    assert.ok(second.capitalTodayPence <= second.capitalPence);
    assert.deepEqual(second.ages, [{ personId: 'p1', label: 'Alex', age: 57 }]);
  });

  it('calls a pre-windfall gap a gap, not a permanent run-out', () => {
    const run = runComparison(
      document(
        {
          investments: [],
          windfalls: [{ label: 'Windfall', date: '2027-01-01', amountPence: 3_000_000 }],
          spending: { monthlyPence: 100_000, otherAnnualPence: 0 },
          horizonEndDate: '2028-12-31',
        },
        [0, 0, 0],
      ),
      START,
    )[1];
    assert.ok(run);
    assert.deepEqual(sustainabilityOf(run.result), {
      firstShortfallYear: 2026,
      runsOutInYear: null,
      coversWholeForecast: false,
      lastsToYear: 2028,
      gapYears: [2026],
      firstCoveredAfterGapYear: 2027,
      endYear: 2028,
    });
    const rows = yearTableRows(run.result);
    assert.equal(rows[0]?.unmet, true);
    assert.equal(rows[0]?.ranOut, false);
    assert.equal(rows[1]?.unmet, false);
  });

  it('marks the first year spending goes unmet', () => {
    const rows = yearTableRows(
      runComparison(
        document(
          {
            investments: [gia(2_460_000)],
            spending: { monthlyPence: 100_000, otherAnnualPence: 0 },
            horizonEndDate: '2028-12-31',
          },
          [0, 0, 0],
        ),
        START,
      )[1]!.result,
    );
    assert.equal(rows.find((row) => row.ranOut)?.year, 2028);
    assert.equal(rows.filter((row) => row.ranOut).length, 1);
    assert.equal(rows.filter((row) => row.unmet).length, 1);
  });
});

describe('long-term view: drawdown and annuity on the same pot (§5.2)', () => {
  it('projects the pot at its start with the engine’s own monthly rounding', () => {
    const flat = pot({ currentPence: 10_000_000, growthBp: 0, startDate: '2030-01-01' });
    assert.equal(projectedPensionPotPence(flat, START), 10_000_000);
    assert.equal(
      projectedPensionPotPence({ ...flat, startDate: '2026-01-01' }, START),
      10_000_000,
      'a pot starting in the forecast’s first month has not grown yet',
    );
    let compounded = 10_000_000;
    for (let month = 0; month < 12; month += 1) {
      compounded = growMonthlyPence(compounded, 600);
    }
    assert.equal(
      projectedPensionPotPence({ ...flat, growthBp: 600, startDate: '2027-01-01' }, START),
      compounded,
    );
  });

  it('compares the 25% tax-free cash and drawdown with the indicative annuity', () => {
    const comparisons = pensionComparisons(
      document({
        people: [
          person({
            pensionPots: [
              pot({
                currentPence: 10_000_000,
                growthBp: 0,
                startDate: '2030-01-01',
                drawdownAnnualPence: 1_200_000,
              }),
            ],
          }),
        ],
      }),
      START,
    );
    assert.equal(comparisons.length, 1);
    const comparison = comparisons[0];
    assert.ok(comparison);
    assert.equal(comparison.startYear, 2030);
    assert.equal(comparison.startAge, 60);
    assert.equal(comparison.projectedPotPence, 10_000_000);
    assert.deepEqual(comparison.drawdown, {
      taxFreeCashPence: 2_500_000,
      fundAfterCashPence: 7_500_000,
      taxableAnnualPence: 1_200_000,
    });
    assert.equal(comparison.annuity.annualPence, 550_000);
    assert.equal(
      annuityAnnualPence(
        pot({ currentPence: 10_000_000, growthBp: 0, startDate: '2030-01-01' }),
        START,
      ),
      550_000,
    );
  });

  it('caps a drawdown withdrawal at the fund and respects the household’s annuity rate', () => {
    const comparisons = pensionComparisons(
      document({
        people: [
          person({
            pensionPots: [
              pot({
                currentPence: 10_000_000,
                startDate: '2026-01-01',
                drawdownAnnualPence: 90_000_000,
                annuityPencePer100k: 400_000,
              }),
            ],
          }),
        ],
      }),
      START,
    );
    const comparison = comparisons[0];
    assert.ok(comparison);
    assert.equal(comparison.drawdown.taxableAnnualPence, 7_500_000);
    assert.equal(comparison.annuity.annualPence, 400_000);
  });
});

describe('long-term view: the warnings the honesty rule requires (§5.6)', () => {
  it('flags £0 other spending, an unfilled pot and a £0 drawdown', () => {
    const warnings = planWarnings(
      document({
        people: [
          person({
            pensionPots: [
              pot({ id: 'pension-1', label: 'Pension A', currentPence: 0 }),
              pot({
                id: 'pension-2',
                label: 'Pension B',
                currentPence: 5_000_000,
                drawdownAnnualPence: 0,
              }),
            ],
          }),
        ],
        investments: [gia(1)],
      }),
    );
    const kinds = warnings.map((warning) => warning.kind);
    assert.ok(kinds.includes('other-spending'));
    assert.ok(kinds.includes('pension-values'));
    assert.ok(kinds.includes('drawdown'));
    const drawdown = warnings.find((warning) => warning.kind === 'drawdown');
    assert.match(drawdown?.message ?? '', /Pension B/);
  });

  it('flags nothing invested, no State Pension and 0% inflation', () => {
    const warnings = planWarnings(
      document({
        spending: { monthlyPence: 100_000, otherAnnualPence: 1_000 },
        inflationBp: 0,
      }),
    );
    const kinds = warnings.map((warning) => warning.kind);
    assert.deepEqual(kinds.sort(), ['capital', 'inflation', 'pension-values', 'state-pension']);
    const state = warnings.find((warning) => warning.kind === 'state-pension');
    assert.match(state?.message ?? '', /Alex/);
  });

  it('says nothing when the plan is complete and honest', () => {
    const warnings = planWarnings(
      document({
        people: [
          person({
            statePension: {
              weeklyPence: 24_130,
              startDate: '2037-01-01',
              upratingBp: 350,
            },
            pensionPots: [
              pot({
                currentPence: 10_000_000,
                drawdownAnnualPence: 1_200_000,
              }),
            ],
          }),
        ],
        spending: { monthlyPence: 100_000, otherAnnualPence: 500_000 },
        windfalls: [{ label: 'Inheritance', date: '2027-01-01', amountPence: 25_000_000 }],
      }),
    );
    assert.deepEqual(warnings, []);
  });

  it('labels an age and a year together', () => {
    assert.equal(ageYearLabel(1970, 2032), 'age 62 · 2032');
  });
});
