/**
 * Estimated UK tax for one person for one calendar year
 * (LONGTERM_FORECASTING.md §5.4). Pure integer pence; every figure the UI
 * shows from here is labelled **estimated**.
 *
 * What this models honestly: the personal allowance (with its taper), the
 * 20/40/45 bands applied in HMRC order — non-savings income first, then
 * savings (0% starting rate and the personal savings allowance), then
 * dividends (£500 allowance at 10.75/35.75/39.35) stacked on top — employee
 * NI on earnings, and capital gains on realised GIA gains above the annual
 * exempt amount at 18/24 according to the band the gain falls in.
 *
 * What it deliberately does not pretend to know: the tax code of 2041, the
 * Scottish rates, marriage allowance transfers, or self-assessment detail.
 * The rate card is data (rates.ts); this file is only the arithmetic.
 */

import { roundHalfUpDivide } from '../money';
import type { TaxRateCard } from './rates';

export interface PersonTaxComponents {
  /** Gross earnings (income tax + employee NI). */
  employmentPence: number;
  /** State pension + taxable pension withdrawals + annuity income. */
  pensionIncomePence: number;
  /** Interest from the GIA's income share. */
  savingsInterestPence: number;
  /** Dividends from the GIA's income share. */
  dividendPence: number;
  /** Realised gains this year (before the annual exempt amount). */
  capitalGainsPence: number;
}

export interface PersonTaxResult {
  incomeTaxPence: number;
  nationalInsurancePence: number;
  capitalGainsTaxPence: number;
}

/** The personal allowance after the £1-per-£2 taper above the income limit. */
export function personalAllowanceFor(totalIncomePence: number, card: TaxRateCard): number {
  const excess = Math.max(0, totalIncomePence - card.paTaperFromPence);
  return Math.max(0, card.personalAllowancePence - Math.floor(excess / 2));
}

/**
 * Tax on an income slice occupying [stackStartPence, stackStartPence + slice)
 * of the taxable-income stack: basic band to `basicRateLimitPence`, higher to
 * `higherRateLimitPence` (the additional-rate threshold in taxable terms —
 * `additionalRateFromPence − allowance`), additional above.
 */
function sliceTaxPence(
  slicePence: number,
  stackStartPence: number,
  basicRateLimitPence: number,
  higherRateLimitPence: number,
  rates: { basicBp: number; higherBp: number; additionalBp: number },
): number {
  if (slicePence <= 0) return 0;
  const end = stackStartPence + slicePence;
  const basicPart = Math.max(0, Math.min(end, basicRateLimitPence) - stackStartPence);
  const higherPart = Math.max(
    0,
    Math.min(end, higherRateLimitPence) - Math.max(stackStartPence, basicRateLimitPence),
  );
  const additionalPart = Math.max(0, end - Math.max(stackStartPence, higherRateLimitPence));
  return (
    roundHalfUpDivide(basicPart * rates.basicBp, 10_000) +
    roundHalfUpDivide(higherPart * rates.higherBp, 10_000) +
    roundHalfUpDivide(additionalPart * rates.additionalBp, 10_000)
  );
}

/**
 * Employee National Insurance on annualised earnings (a documented
 * simplification: annual earnings against the annual thresholds — the
 * monthly-precise NI thresholds do not move a decades forecast).
 */
export function nationalInsurancePence(employmentPence: number, card: TaxRateCard): number {
  const abovePrimary = Math.max(0, employmentPence - card.niPrimaryThresholdPence);
  const main = Math.min(
    abovePrimary,
    card.niUpperEarningsLimitPence - card.niPrimaryThresholdPence,
  );
  const upper = Math.max(0, employmentPence - card.niUpperEarningsLimitPence);
  return (
    roundHalfUpDivide(main * card.niMainRateBp, 10_000) +
    roundHalfUpDivide(upper * card.niUpperRateBp, 10_000)
  );
}

/**
 * Estimated tax for one person for one year. The stacking order is HMRC's:
 * non-savings (earnings + pensions) fills the bands first, then savings, then
 * dividends; the allowance is consumed in the same order.
 */
export function estimatePersonTax(
  components: PersonTaxComponents,
  card: TaxRateCard,
): PersonTaxResult {
  const nonSavings = Math.max(
    0,
    Math.floor(components.employmentPence) + Math.floor(components.pensionIncomePence),
  );
  const savings = Math.max(0, Math.floor(components.savingsInterestPence));
  const dividends = Math.max(0, Math.floor(components.dividendPence));
  const gains = Math.max(0, Math.floor(components.capitalGainsPence));
  const totalIncome = nonSavings + savings + dividends;

  const allowance = personalAllowanceFor(totalIncome, card);
  const higherRateLimitPence = card.additionalRateFromPence - allowance;

  // Allowance consumed by non-savings first, then savings, then dividends.
  const nonSavingsTaxable = Math.max(0, nonSavings - allowance);
  const allowanceAfterNonSavings = Math.max(0, allowance - nonSavings);
  const savingsTaxable = Math.max(0, savings - allowanceAfterNonSavings);
  const allowanceAfterSavings = Math.max(0, allowanceAfterNonSavings - savings);
  const dividendTaxable = Math.max(0, dividends - allowanceAfterSavings);

  // Non-savings income: 20/40/45.
  let incomeTax = sliceTaxPence(
    nonSavingsTaxable,
    0,
    card.basicRateLimitPence,
    higherRateLimitPence,
    {
      basicBp: card.basicRateBp,
      higherBp: card.higherRateBp,
      additionalBp: card.additionalRateBp,
    },
  );

  // Savings: 0% starting-rate band (reduced by non-savings income above the
  // allowance), then the personal savings allowance at 0%, then 20/40/45.
  const startingRate = Math.min(
    savingsTaxable,
    Math.max(0, card.savingsStartingRateBandPence - nonSavingsTaxable),
  );
  const totalTaxable = nonSavingsTaxable + savingsTaxable + dividendTaxable;
  const personalSavingsAllowance =
    totalTaxable > higherRateLimitPence
      ? 0
      : totalTaxable > card.basicRateLimitPence
        ? card.personalSavingsAllowanceHigherPence
        : card.personalSavingsAllowanceBasicPence;
  const taxedSavings = Math.max(0, savingsTaxable - startingRate - personalSavingsAllowance);
  incomeTax += sliceTaxPence(
    taxedSavings,
    nonSavingsTaxable + startingRate,
    card.basicRateLimitPence,
    higherRateLimitPence,
    {
      basicBp: card.savingsBasicRateBp,
      higherBp: card.savingsHigherRateBp,
      additionalBp: card.savingsAdditionalRateBp,
    },
  );

  // Dividends sit on top of everything else: £500 at 0%, then dividend rates.
  const taxedDividends = Math.max(0, dividendTaxable - card.dividendAllowancePence);
  incomeTax += sliceTaxPence(
    taxedDividends,
    nonSavingsTaxable + savingsTaxable + card.dividendAllowancePence,
    card.basicRateLimitPence,
    higherRateLimitPence,
    {
      basicBp: card.dividendBasicRateBp,
      higherBp: card.dividendHigherRateBp,
      additionalBp: card.dividendAdditionalRateBp,
    },
  );

  // CGT: gains stack on top of taxable income; exempt amount, then 18/24.
  const taxableGains = Math.max(0, gains - card.cgtAnnualExemptPence);
  const capitalGainsTax = sliceTaxPence(
    taxableGains,
    totalTaxable,
    card.basicRateLimitPence,
    higherRateLimitPence,
    {
      basicBp: card.cgtBasicRateBp,
      higherBp: card.cgtHigherRateBp,
      additionalBp: card.cgtHigherRateBp,
    },
  );

  return {
    incomeTaxPence: incomeTax,
    nationalInsurancePence: nationalInsurancePence(components.employmentPence, card),
    capitalGainsTaxPence: capitalGainsTax,
  };
}
