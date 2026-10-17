import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  capitalTrajectory,
  incomeAtAge,
  incomeForYear,
  moneyLastsTo,
  runForecast,
  todayMoneyPence,
} from '../src/lib/longterm/model';
import type {
  LongTermPerson,
  LongTermPlan,
  PensionPotPlan,
  SpendingPlan,
} from '../src/lib/longterm/types';

const ZERO_SPENDING: SpendingPlan = { monthlyPence: 0, otherAnnualPence: 0 };

function person(
  overrides: Partial<LongTermPerson> & Pick<LongTermPerson, 'id' | 'birthYear'>,
): LongTermPerson {
  return {
    label: overrides.id,
    earnings: null,
    statePension: null,
    pensionPots: [],
    ...overrides,
  };
}

function pot(
  overrides: Partial<PensionPotPlan> & Pick<PensionPotPlan, 'id' | 'startDate'>,
): PensionPotPlan {
  return {
    label: overrides.id,
    currentPence: 10_000_000,
    growthBp: 0,
    takeUp: 'drawdown',
    annuityPencePer100k: 550_000,
    annuityEscalationBp: 0,
    drawdownAnnualPence: 1_200_000,
    ...overrides,
  };
}

function plan(overrides: Partial<LongTermPlan>): LongTermPlan {
  return {
    people: [],
    investments: [],
    windfalls: [],
    spending: ZERO_SPENDING,
    commitments: [],
    inflationBp: 0,
    isaShelterAnnualPence: 0,
    horizonEndDate: '2030-12-31',
    ...overrides,
  };
}

describe('long-term forecast engine: penny-exact spend-down and run-out (LONGTERM_FORECASTING.md §5)', () => {
  it('a covered year spends capital; the first unmet year is when the money runs out', () => {
    const result = runForecast(
      plan({
        people: [person({ id: 'p1', birthYear: 1970 })],
        investments: [
          {
            id: 'gia',
            label: 'General investing',
            ownerPersonId: 'p1',
            wrapper: 'gia',
            currentPence: 2_400_000,
            costBasisPence: 2_400_000,
            growthBp: 0,
            incomeShareBp: 0,
            incomeKind: 'dividends',
          },
        ],
        spending: { monthlyPence: 100_000, otherAnnualPence: 0 },
        horizonEndDate: '2029-12-31',
      }),
      '2026-01-01',
    );

    const [y2026, y2027, y2028, y2029] = result.years;
    assert.equal(y2026?.spendingPence, 1_200_000);
    assert.equal(y2026?.capitalPence, 1_200_000);
    assert.equal(y2026?.surplusPence, -1_200_000);
    assert.equal(y2027?.capitalPence, 0);
    assert.equal(y2027?.shortfallPence, 0, 'capital to exactly zero is a covered year');
    assert.equal(y2028?.shortfallPence, 1_200_000);
    assert.equal(y2029?.shortfallPence, 1_200_000);
    assert.deepEqual(moneyLastsTo(result), { lastsToYear: 2027, runsOutInYear: 2028 });
  });

  it('a GIA drawdown spends basis first and records no gain while basis remains', () => {
    const result = runForecast(
      plan({
        people: [person({ id: 'p1', birthYear: 1970 })],
        investments: [
          {
            id: 'gia',
            label: 'General investing',
            ownerPersonId: 'p1',
            wrapper: 'gia',
            currentPence: 1_200_000,
            costBasisPence: 1_200_000,
            growthBp: 0,
            incomeShareBp: 0,
            incomeKind: 'dividends',
          },
        ],
        spending: { monthlyPence: 100_000, otherAnnualPence: 0 },
        horizonEndDate: '2026-12-31',
      }),
      '2026-01-01',
    );
    const row = result.years[0];
    assert.ok(row);
    assert.equal(row.capitalGainsTaxPence, 0, 'pure basis spend-down realises no gain');
  });

  it("spending inflates at the single best-guess rate and today's money deflates it back", () => {
    const result = runForecast(
      plan({
        people: [person({ id: 'p1', birthYear: 1970 })],
        spending: { monthlyPence: 100_000, otherAnnualPence: 0 },
        inflationBp: 250,
        horizonEndDate: '2028-12-31',
      }),
      '2026-01-01',
    );
    const [y2026, y2027] = result.years;
    assert.ok(y2026 && y2027);
    assert.equal(y2026.spendingPence, 1_200_000, 'first year is the un-inflated baseline');
    assert.ok(y2027.spendingPence > 1_225_000 && y2027.spendingPence < 1_235_000);
    // Today's money on the inflated figure lands back within 1% of £12,000.
    const today = todayMoneyPence(y2027.spendingPence, y2027.priceIndexMillionths);
    assert.ok(today > 1_188_000 && today < 1_212_000);
    assert.equal(todayMoneyPence(1_200_000, 1_000_000), 1_200_000);
  });
});

describe('long-term forecast engine: income streams (§5.1, project-wide)', () => {
  it('state pension starts on its date, uses the full-rate default maths, and uprates each January', () => {
    const result = runForecast(
      plan({
        people: [
          person({
            id: 'p1',
            birthYear: 1960,
            statePension: { weeklyPence: 24_130, startDate: '2027-01-15', upratingBp: 350 },
          }),
        ],
        horizonEndDate: '2029-12-31',
      }),
      '2026-06-01',
    );
    const [y2026, y2027, y2028] = result.years;
    assert.ok(y2026 && y2027 && y2028);
    assert.equal(y2026.people[0]?.income.statePensionPence, 0, 'nothing before the start date');
    // £241.30 × 52 = £12,547.60 = 1,254,760p; monthly 104,563p (half-up), ×12.
    assert.equal(y2027.people[0]?.income.statePensionPence, 1_254_756);
    assert.equal(y2027.people[0]?.income.incomeTaxPence, 0, 'under the £12,570 allowance');
    // 3.5% uprating: 1,254,760 + 43,917 = 1,298,677 → monthly 108,223p, ×12.
    assert.equal(y2028.people[0]?.income.statePensionPence, 1_298_676);
    // Taxed on the £41,676 above the allowance at 20% = 8,335p.
    assert.equal(y2028.people[0]?.income.incomeTaxPence, 8_335);
  });

  it('a drawdown pot takes 25% tax-free cash, then pays its annual draw while the fund lasts', () => {
    const result = runForecast(
      plan({
        people: [
          person({
            id: 'p1',
            birthYear: 1970,
            pensionPots: [pot({ id: 'a', startDate: '2027-06-01' })],
          }),
        ],
        horizonEndDate: '2028-12-31',
      }),
      '2027-01-01',
    );
    const [y2027, y2028] = result.years;
    assert.ok(y2027 && y2028);
    // June–December = 7 × £1,000 (drawdown £12,000/yr).
    assert.equal(y2027.people[0]?.income.pensionDrawdownPence, 700_000);
    assert.equal(y2028.people[0]?.income.pensionDrawdownPence, 1_200_000);
    // £25,000 tax-free cash re-invested + £7,000 drawn and re-spent (spending
    // is zero) = £32,000 in the GIA; fund left = £100,000 − £25,000 − £7,000.
    assert.equal(y2027.giaPence, 3_200_000);
    assert.equal(y2027.pensionFundsPence, 6_800_000);
    // Money conservation at 0% growth and 0 tax: the pot simply moves to the GIA.
    assert.equal(y2028.capitalPence, 10_000_000);
  });

  it('an annuity converts the whole fund to guaranteed income at the entered rate', () => {
    const result = runForecast(
      plan({
        people: [
          person({
            id: 'p1',
            birthYear: 1970,
            pensionPots: [pot({ id: 'a', startDate: '2027-06-01', takeUp: 'annuity' })],
          }),
        ],
        horizonEndDate: '2027-12-31',
      }),
      '2027-01-01',
    );
    const row = result.years[0];
    assert.ok(row);
    // £100,000 pot at £5,500 per £100k = 550,000p/yr; June–December = 7 months.
    assert.equal(row.people[0]?.income.pensionAnnuityPence, 7 * 45_833);
    assert.equal(row.pensionFundsPence, 0, 'the fund is gone by construction');
    assert.equal(row.people[0]?.income.pensionDrawdownPence, 0);
  });

  it('the take-up override re-runs the same plan as the other route (the comparison aid)', () => {
    const base = plan({
      people: [
        person({
          id: 'p1',
          birthYear: 1970,
          pensionPots: [pot({ id: 'a', startDate: '2027-06-01' })],
        }),
      ],
      horizonEndDate: '2027-12-31',
    });
    const annuity = runForecast(base, '2027-01-01', { pensionTakeUpOverride: 'annuity' });
    const drawdown = runForecast(base, '2027-01-01', { pensionTakeUpOverride: 'drawdown' });
    assert.equal(annuity.years[0]?.pensionFundsPence, 0);
    assert.ok((drawdown.years[0]?.pensionFundsPence ?? 0) > 0);
    assert.equal(annuity.years[0]?.people[0]?.income.pensionAnnuityPence, 7 * 45_833);
  });

  it('two working people with stop dates model the ordinary working household (project-wide)', () => {
    const result = runForecast(
      plan({
        people: [
          person({
            id: 'p1',
            birthYear: 1980,
            earnings: { monthlyPence: 300_000, untilDate: '2036-06-30' },
          }),
          person({
            id: 'p2',
            birthYear: 1982,
            earnings: { monthlyPence: 200_000, untilDate: '2040-12-31' },
          }),
        ],
        horizonEndDate: '2037-12-31',
      }),
      '2036-01-01',
    );
    const y2036 = result.years.find((row) => row.year === 2036);
    const y2037 = result.years.find((row) => row.year === 2037);
    assert.ok(y2036 && y2037);
    // p1 works Jan–Jun only; p2 works all of both years.
    assert.equal(y2036.people[0]?.income.earningsPence, 6 * 300_000);
    assert.equal(y2036.people[1]?.income.earningsPence, 12 * 200_000);
    assert.equal(y2037.people[0]?.income.earningsPence, 0);
    assert.equal(y2037.people[1]?.income.earningsPence, 12 * 200_000);
  });

  it('answer queries: "income in 2030" and "income at age 62" land on the same year row', () => {
    const result = runForecast(
      plan({
        people: [
          person({
            id: 'p1',
            birthYear: 1970,
            earnings: { monthlyPence: 250_000, untilDate: '2035-12-31' },
          }),
        ],
        horizonEndDate: '2035-12-31',
      }),
      '2026-01-01',
    );
    const in2030 = incomeForYear(result, 2030);
    const at62 = incomeAtAge(result, 'p1', 62, 1970);
    assert.ok(in2030 && at62);
    assert.equal(at62.row.year, 2032);
    assert.equal(in2030.people[0]?.age, 60);
    assert.equal(in2030.people[0]?.income.earningsPence, 12 * 250_000);
    // £30,000: income tax £3,486 + NI £1,394.40 → net below gross, above £25k.
    assert.ok(in2030.netIncomePence < 3_000_000 && in2030.netIncomePence > 2_500_000);
    assert.equal(incomeForYear(result, 1999), null);
  });
});

describe('long-term forecast engine: windfalls, sheltering and commitments (§5.2, §5.7)', () => {
  it('the inheritance lands on its date, is invested, and shelters into ISAs each January', () => {
    const result = runForecast(
      plan({
        people: [person({ id: 'p1', birthYear: 1970 })],
        windfalls: [{ label: 'Inheritance', date: '2027-01-05', amountPence: 25_000_000 }],
        investments: [
          {
            id: 'gia',
            label: 'General investing',
            ownerPersonId: 'p1',
            wrapper: 'gia',
            currentPence: 0,
            costBasisPence: 0,
            growthBp: 0,
            incomeShareBp: 0,
            incomeKind: 'dividends',
          },
          {
            id: 'isa',
            label: 'ISAs',
            ownerPersonId: 'p1',
            wrapper: 'isa',
            currentPence: 0,
            costBasisPence: 0,
            growthBp: 0,
            incomeShareBp: 0,
            incomeKind: 'dividends',
          },
        ],
        isaShelterAnnualPence: 4_000_000,
        horizonEndDate: '2028-12-31',
      }),
      '2026-06-01',
    );
    const y2027 = result.years.find((row) => row.year === 2027);
    const y2028 = result.years.find((row) => row.year === 2028);
    assert.ok(y2027 && y2028);
    // January 2027 shelters before the windfall lands (both are January
    // events, sheltering runs first) — so the shelter waits for January 2028.
    assert.equal(y2027.giaPence, 25_000_000);
    assert.equal(y2027.isaPence, 0);
    assert.equal(y2028.isaPence, 4_000_000);
    assert.equal(y2028.giaPence, 21_000_000);
  });

  it('an end-dated commitment stops on schedule and is never inflated', () => {
    const result = runForecast(
      plan({
        people: [person({ id: 'p1', birthYear: 1970 })],
        investments: [
          {
            id: 'gia',
            label: 'General investing',
            ownerPersonId: 'p1',
            wrapper: 'gia',
            currentPence: 10_000_000,
            costBasisPence: 10_000_000,
            growthBp: 0,
            incomeShareBp: 0,
            incomeKind: 'dividends',
          },
        ],
        commitments: [{ label: 'Mortgage', monthlyPence: 50_000, endDate: '2027-03-15' }],
        inflationBp: 250,
        horizonEndDate: '2027-12-31',
      }),
      '2027-01-01',
    );
    const row = result.years[0];
    assert.ok(row);
    assert.equal(row.commitmentsPence, 3 * 50_000, 'January–March only, at the fixed amount');
    assert.equal(row.capitalPence, 10_000_000 - 150_000);
  });
});

describe('long-term forecast engine: the three-rate comparison (§5.3)', () => {
  it('the same plan at 4% and 8% separates, and the trajectory is exposed for the chart', () => {
    const base = plan({
      people: [person({ id: 'p1', birthYear: 1970 })],
      investments: [
        {
          id: 'gia',
          label: 'General investing',
          ownerPersonId: 'p1',
          wrapper: 'gia',
          currentPence: 25_000_000,
          costBasisPence: 25_000_000,
          growthBp: 600,
          incomeShareBp: 0,
          incomeKind: 'dividends',
        },
      ],
      horizonEndDate: '2035-12-31',
    });
    const cautious = runForecast(base, '2026-01-01', { overrideInvestmentGrowthBp: 400 });
    const optimistic = runForecast(base, '2026-01-01', { overrideInvestmentGrowthBp: 800 });
    const middle = runForecast(base, '2026-01-01');

    const cautiousEnd = cautious.years.at(-1)?.capitalPence ?? 0;
    const middleEnd = middle.years.at(-1)?.capitalPence ?? 0;
    const optimisticEnd = optimistic.years.at(-1)?.capitalPence ?? 0;
    assert.ok(cautiousEnd < middleEnd && middleEnd < optimisticEnd);

    const trajectory = capitalTrajectory(optimistic);
    assert.equal(trajectory.length, 10);
    assert.ok((trajectory[0]?.capitalPence ?? 0) > 25_000_000, 'year one already grows');
  });
});
