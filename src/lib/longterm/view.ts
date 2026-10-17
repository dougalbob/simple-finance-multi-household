/**
 * The long-term forecast's read model (LONGTERM_FORECASTING.md §4, slice 2).
 *
 * Pure presentation arithmetic on top of the engine: the three comparison
 * runs, the year table in future and today's money, the pension
 * drawdown-versus-annuity comparison, and the warnings the honesty rule
 * demands (a £0 "everything else" line, an unfilled pension pot, a £0
 * drawdown). No database, no React — so the numbers the page shows are the
 * numbers the tests pin.
 */

import { roundHalfUpDivide } from '../money';
import { growMonthlyPence, runForecast, todayMoneyPence } from './model';
import {
  ageInYear,
  COMPARISON_LABELS,
  comparisonKey,
  type ComparisonIndex,
  type LongTermPlanDocument,
} from './plan';
import { UK_2026_27, type TaxRateCard } from './rates';
import type { BasisPoints, ForecastResult, LongTermPlan, PensionPotPlan, YearRow } from './types';

/** One of the three investment-return comparison runs (§5.3). */
export interface ComparisonRun {
  index: ComparisonIndex;
  key: ReturnType<typeof comparisonKey>;
  label: string;
  rateBp: BasisPoints;
  result: ForecastResult;
}

/**
 * Run the same plan at each of the household's comparison rates. The rate
 * replaces the **investments'** growth only (the engine's documented
 * override); pension pots keep their own rates, which is what the assumptions
 * panel says and the page repeats beside the comparison.
 */
export function runComparison(
  document: LongTermPlanDocument,
  startDate: string,
  taxCard: TaxRateCard = UK_2026_27,
): ComparisonRun[] {
  return document.comparisonRatesBp.map((rateBp, index) => ({
    index: index as ComparisonIndex,
    key: comparisonKey(index as ComparisonIndex),
    label: COMPARISON_LABELS[index] as string,
    rateBp,
    result: runForecast(document.plan, startDate, { overrideInvestmentGrowthBp: rateBp }, taxCard),
  }));
}

export interface Sustainability {
  /**
   * The first year spending went unmet — a warning even when later years are
   * covered again (a windfall can arrive after a gap).
   */
  firstShortfallYear: number | null;
  /**
   * The first year of the **trailing** run of unmet spending — the point the
   * plan no longer recovers. Null when the forecast's last year is covered.
   * A first-shortfall rule is right for a monotone spend-down but calls a
   * temporary pre-windfall gap "runs out", which the page must not say, so
   * the view distinguishes the two.
   */
  runsOutInYear: number | null;
  /** True only when no year has unmet spending. */
  coversWholeForecast: boolean;
  /** The last year before the trailing run; the horizon's last year when covered. */
  lastsToYear: number | null;
  /** Unmet years before the trailing run (a temporary gap). */
  gapYears: number[];
  /** The first year after the last gap, when there is no trailing run. */
  firstCoveredAfterGapYear: number | null;
  endYear: number;
}

export function sustainabilityOf(result: ForecastResult): Sustainability {
  const rows = result.years;
  const last = rows[rows.length - 1];
  const endYear = last ? last.year : Number(result.endDate.slice(0, 4));
  const shortfalls = rows.map((row) => row.shortfallPence > 0);
  const firstShortfallIndex = shortfalls.indexOf(true);
  let trailingStart = -1;
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (shortfalls[index] === true) trailingStart = index;
    else break;
  }
  const runsOutInYear = trailingStart === -1 ? null : (rows[trailingStart]?.year ?? null);
  const previous = trailingStart > 0 ? rows[trailingStart - 1] : undefined;
  const lastsToYear = runsOutInYear === null ? endYear : (previous?.year ?? null);
  const gapYears = rows
    .filter(
      (row, index) =>
        shortfalls[index] === true && (runsOutInYear === null || row.year < runsOutInYear),
    )
    .map((row) => row.year);
  const lastGap = gapYears[gapYears.length - 1] ?? null;
  return {
    firstShortfallYear:
      firstShortfallIndex === -1 ? null : (rows[firstShortfallIndex]?.year ?? null),
    runsOutInYear,
    coversWholeForecast: firstShortfallIndex === -1,
    lastsToYear,
    gapYears,
    firstCoveredAfterGapYear: lastGap === null ? null : lastGap + 1,
    endYear,
  };
}

export interface YearTableRow {
  year: number;
  ages: { personId: string; label: string; age: number }[];
  incomePence: number;
  incomeTodayPence: number;
  taxPence: number;
  taxTodayPence: number;
  spendingPence: number;
  spendingTodayPence: number;
  surplusPence: number;
  surplusTodayPence: number;
  capitalPence: number;
  capitalTodayPence: number;
  shortfallPence: number;
  /** This year has unmet spending (a gap or the run-out). */
  unmet: boolean;
  /** The first year of the trailing run — the "money ran out" row. */
  ranOut: boolean;
}

/** The calendar-year table, every money figure in both monies (§5.5). */
export function yearTableRows(result: ForecastResult): YearTableRow[] {
  const sustainability = sustainabilityOf(result);
  return result.years.map((row: YearRow) => {
    const deflate = (pence: number): number => todayMoneyPence(pence, row.priceIndexMillionths);
    return {
      year: row.year,
      ages: row.people.map((person) => ({
        personId: person.personId,
        label: person.label,
        age: ageInYear(person.birthYear, row.year),
      })),
      incomePence: row.totalIncomePence,
      incomeTodayPence: deflate(row.totalIncomePence),
      taxPence: row.totalTaxPence,
      taxTodayPence: deflate(row.totalTaxPence),
      spendingPence: row.spendingPence + row.commitmentsPence,
      spendingTodayPence: deflate(row.spendingPence + row.commitmentsPence),
      surplusPence: row.surplusPence,
      surplusTodayPence: deflate(row.surplusPence),
      capitalPence: row.capitalPence,
      capitalTodayPence: deflate(row.capitalPence),
      shortfallPence: row.shortfallPence,
      unmet: row.shortfallPence > 0,
      ranOut: row.year === sustainability.runsOutInYear,
    };
  });
}

/** One pension pot's value at its start date, compounded with the engine's monthly rounding. */
export function projectedPensionPotPence(
  pot: Pick<PensionPotPlan, 'currentPence' | 'growthBp' | 'startDate'>,
  forecastStartDate: string,
): number {
  let value = pot.currentPence;
  let year = Number(forecastStartDate.slice(0, 4));
  let month = Number(forecastStartDate.slice(5, 7));
  const startYear = Number(pot.startDate.slice(0, 4));
  const startMonth = Number(pot.startDate.slice(5, 7));
  while (year < startYear || (year === startYear && month < startMonth)) {
    value = growMonthlyPence(value, pot.growthBp);
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }
  return value;
}

/** The indicative annuity income for a pot, from the household's own rate. */
export function annuityAnnualPence(
  pot: Pick<PensionPotPlan, 'currentPence' | 'growthBp' | 'startDate' | 'annuityPencePer100k'>,
  forecastStartDate: string,
): number {
  const projected = projectedPensionPotPence(pot, forecastStartDate);
  // annuityPencePer100k is pence of yearly income per £100,000 of pot
  // (10,000,000p) — the engine's own unit.
  return roundHalfUpDivide(projected * pot.annuityPencePer100k, 10_000_000);
}

export interface PensionComparison {
  potId: string;
  potLabel: string;
  ownerPersonId: string;
  ownerLabel: string;
  startYear: number;
  startAge: number;
  projectedPotPence: number;
  /** What the household's plan currently says this pot will do. */
  takeUp: 'drawdown' | 'annuity';
  drawdown: {
    /** The 25% pension commencement lump sum, re-invested by the engine. */
    taxFreeCashPence: number;
    /** The remaining fund still invested after the tax-free cash is taken. */
    fundAfterCashPence: number;
    /** The household's chosen annual withdrawal, capped at the fund. */
    taxableAnnualPence: number;
  };
  annuity: {
    annualPence: number;
    escalationBp: BasisPoints;
  };
}

/**
 * Side by side on the same pot (§5.2, §11A Q2): the arithmetic of flexible
 * drawdown and an indicative guaranteed income. The tool compares and never
 * recommends — a real annuity is a provider's quote, not this sum.
 */
export function pensionComparisons(
  document: LongTermPlanDocument,
  forecastStartDate: string,
): PensionComparison[] {
  const rows: PensionComparison[] = [];
  for (const person of document.plan.people) {
    for (const pot of person.pensionPots) {
      const projectedPotPence = projectedPensionPotPence(pot, forecastStartDate);
      const taxFreeCashPence = roundHalfUpDivide(projectedPotPence, 4);
      const fundAfterCashPence = projectedPotPence - taxFreeCashPence;
      rows.push({
        potId: pot.id,
        potLabel: pot.label,
        ownerPersonId: person.id,
        ownerLabel: person.label,
        startYear: Number(pot.startDate.slice(0, 4)),
        startAge: ageInYear(person.birthYear, Number(pot.startDate.slice(0, 4))),
        projectedPotPence,
        takeUp: pot.takeUp,
        drawdown: {
          taxFreeCashPence,
          fundAfterCashPence,
          taxableAnnualPence: Math.min(fundAfterCashPence, pot.drawdownAnnualPence),
        },
        annuity: {
          annualPence: annuityAnnualPence(pot, forecastStartDate),
          escalationBp: pot.annuityEscalationBp,
        },
      });
    }
  }
  return rows;
}

export type PlanWarningKind =
  'other-spending' | 'pension-values' | 'drawdown' | 'capital' | 'state-pension' | 'inflation';

export interface PlanWarning {
  kind: PlanWarningKind;
  message: string;
}

/**
 * The visible flags the design record requires. They are warnings, not
 * setup gates: the page still answers every question, but it says where the
 * arithmetic is being flattered.
 */
export function planWarnings(document: LongTermPlanDocument): PlanWarning[] {
  const plan: LongTermPlan = document.plan;
  const warnings: PlanWarning[] = [];

  if (plan.spending.otherAnnualPence === 0) {
    warnings.push({
      kind: 'other-spending',
      message:
        'Other spending is £0.00 a year. Holidays, house repairs, a car, gifts and — as the design record says — the classic forecast lie are not in this picture. Set an annual figure in the assumptions to make it honest.',
    });
  }

  const pots = plan.people.flatMap((person) => person.pensionPots);
  const emptyPots = pots.filter((pot) => pot.currentPence === 0);
  if (pots.length === 0) {
    warnings.push({
      kind: 'pension-values',
      message:
        'No pension pots are on the plan. Add one for each pot you hold, with its value and start date, or this forecast has no pension income to show.',
    });
  } else if (emptyPots.length > 0) {
    const names = emptyPots.map((pot) => pot.label).join(', ');
    warnings.push({
      kind: 'pension-values',
      message: `${names} ${emptyPots.length === 1 ? 'has' : 'have'} no value yet. Enter ${
        emptyPots.length === 1 ? 'its' : 'their'
      } current value in the assumptions — the forecast is showing £0.00 of pension income until you do.`,
    });
  }

  const zeroDrawdown = pots.filter(
    (pot) => pot.currentPence > 0 && pot.takeUp === 'drawdown' && pot.drawdownAnnualPence === 0,
  );
  if (zeroDrawdown.length > 0) {
    warnings.push({
      kind: 'drawdown',
      message: `${zeroDrawdown
        .map((pot) => pot.label)
        .join(
          ', ',
        )} ${zeroDrawdown.length === 1 ? 'draws' : 'draw'} £0.00 a year. Set the annual withdrawal in the assumptions, or compare the annuity route below.`,
    });
  }

  const capitalNow =
    plan.investments.reduce((sum, investment) => sum + investment.currentPence, 0) +
    plan.windfalls.reduce((sum, windfall) => sum + windfall.amountPence, 0);
  if (capitalNow === 0 && pots.every((pot) => pot.currentPence === 0)) {
    warnings.push({
      kind: 'capital',
      message:
        'No invested capital and no windfall are set, so there is nothing to grow or draw on yet. Add an account balance or a windfall in the assumptions.',
    });
  }

  const noStatePension = plan.people.filter((person) => person.statePension === null);
  if (noStatePension.length > 0) {
    warnings.push({
      kind: 'state-pension',
      message: `${noStatePension
        .map((person) => person.label)
        .join(' and ')} ${noStatePension.length === 1 ? 'has' : 'have'} no State Pension set. ${
        noStatePension.length === 1 ? 'It is' : 'They are'
      } usually the largest guaranteed income in later life — add the forecast figure in the assumptions.`,
    });
  }

  if (plan.inflationBp === 0) {
    warnings.push({
      kind: 'inflation',
      message:
        "Inflation is 0% — every year in this forecast is quoted at today's prices. A best guess (the household's own is 2.5%) is usually more honest.",
    });
  }

  return warnings;
}

/** The headline's age-anchored sentence: `age 90 — 2070`. */
export function ageYearLabel(birthYear: number, year: number): string {
  return `age ${ageInYear(birthYear, year)} · ${year}`;
}
