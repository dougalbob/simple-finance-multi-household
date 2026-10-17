import { roundHalfUpDivide } from '../money';

/**
 * UK tax rate card as **data** (LONGTERM_FORECASTING.md §5.4): never hard-coded
 * into the engine, versioned by tax year, editable per plan. This is the
 * published **2026/27** card (England/Wales/NI) the forecast is seeded with —
 * figures checked against GOV.UK and HMRC publications for 2026/27:
 *
 * - Personal allowance £12,570 (frozen to April 2031), tapered £1 per £2 of
 *   income above £100,000, gone at £125,140.
 * - Basic 20% on the first £37,700 of taxable income; higher 40% to £125,140
 *   of total income; additional 45% above.
 * - Savings: 0% starting rate on up to £5,000 (reduced by non-savings income
 *   above the allowance); personal savings allowance £1,000 basic / £500
 *   higher / nil additional.
 * - Dividends: £500 allowance; 10.75% / 35.75% / 39.35% (rates rose 2 points
 *   from April 2026).
 * - Capital gains (shares & funds included): £3,000 annual exempt amount;
 *   18% within the basic rate band, 24% above.
 * - Employee National Insurance: 8% to the upper earnings limit, 2% above.
 * - Full new State Pension 2026/27: £241.30 per week (≈ £12,547.60 a year).
 *
 * Every tax figure this card produces is labelled **estimated** in the UI.
 * When thresholds move, this file (or a newer card) is the only edit.
 */

/** Version label for the honesty line: "estimated with 2026/27 rules". */
export const RATE_CARD_YEAR = '2026/27';

export interface TaxRateCard {
  personalAllowancePence: number;
  /** Income where the allowance starts tapering away. */
  paTaperFromPence: number;
  /** Taxable non-savings income up to this is basic rate. */
  basicRateLimitPence: number;
  /** Total income where additional rate starts (allowance is zero by here). */
  additionalRateFromPence: number;
  /** 0% starting rate for savings, reduced by non-savings income above PA. */
  savingsStartingRateBandPence: number;
  personalSavingsAllowanceBasicPence: number;
  personalSavingsAllowanceHigherPence: number;
  dividendAllowancePence: number;
  cgtAnnualExemptPence: number;
  /** Employee NI: main rate to the upper earnings limit, then the additional rate. */
  niPrimaryThresholdPence: number;
  niUpperEarningsLimitPence: number;

  /** Rates in basis points. */
  basicRateBp: number;
  higherRateBp: number;
  additionalRateBp: number;
  savingsBasicRateBp: number;
  savingsHigherRateBp: number;
  savingsAdditionalRateBp: number;
  dividendBasicRateBp: number;
  dividendHigherRateBp: number;
  dividendAdditionalRateBp: number;
  cgtBasicRateBp: number;
  cgtHigherRateBp: number;
  niMainRateBp: number;
  niUpperRateBp: number;
}

export const UK_2026_27: TaxRateCard = {
  personalAllowancePence: 1_257_000,
  paTaperFromPence: 10_000_000,
  basicRateLimitPence: 3_770_000,
  additionalRateFromPence: 12_514_000,
  savingsStartingRateBandPence: 500_000,
  personalSavingsAllowanceBasicPence: 100_000,
  personalSavingsAllowanceHigherPence: 50_000,
  dividendAllowancePence: 50_000,
  cgtAnnualExemptPence: 300_000,
  niPrimaryThresholdPence: 1_257_000,
  niUpperEarningsLimitPence: 5_027_000,

  basicRateBp: 2_000,
  higherRateBp: 4_000,
  additionalRateBp: 4_500,
  savingsBasicRateBp: 2_000,
  savingsHigherRateBp: 4_000,
  savingsAdditionalRateBp: 4_500,
  dividendBasicRateBp: 1_075,
  dividendHigherRateBp: 3_575,
  dividendAdditionalRateBp: 3_935,
  cgtBasicRateBp: 1_800,
  cgtHigherRateBp: 2_400,
  niMainRateBp: 800,
  niUpperRateBp: 200,
};

/** The calendar year the card's figures describe (2026/27). */
export const CARD_BASE_YEAR = 2026;

/** Every money figure on the card — indexed together so the card stays consistent. */
const MONEY_FIELDS = [
  'personalAllowancePence',
  'paTaperFromPence',
  'basicRateLimitPence',
  'additionalRateFromPence',
  'savingsStartingRateBandPence',
  'personalSavingsAllowanceBasicPence',
  'personalSavingsAllowanceHigherPence',
  'dividendAllowancePence',
  'cgtAnnualExemptPence',
  'niPrimaryThresholdPence',
  'niUpperEarningsLimitPence',
] as const satisfies readonly (keyof TaxRateCard)[];

/**
 * The card for a calendar year when thresholds and allowances rise each
 * January at `indexBp` (issue #73, option B). Year `CARD_BASE_YEAR` and before
 * are the published card; each later January compounds one step, every money
 * figure rounded half-up to the penny at each step. Rates never move.
 * This is an approximation: UK tax years start on 6 April, the forecast's rows
 * are calendar years (LONGTERM_FORECASTING.md §5.4).
 */
export function taxCardForYear(card: TaxRateCard, indexBp: number, year: number): TaxRateCard {
  const steps = Math.max(0, year - CARD_BASE_YEAR);
  if (steps === 0 || indexBp === 0) return card;
  const indexed: TaxRateCard = { ...card };
  for (const field of MONEY_FIELDS) {
    let amount = card[field];
    for (let step = 0; step < steps; step += 1) {
      amount = roundHalfUpDivide(amount * (10_000 + indexBp), 10_000);
    }
    indexed[field] = amount;
  }
  return indexed;
}

/**
 * The household's own reference figures from the grill (§11A) — kept together
 * so the defaults a plan is seeded with are one reviewable block. Not baked
 * into any calculation: plans carry their own values.
 */
export const HOUSEHOLD_DEFAULTS = {
  inflationBp: 250,
  /** Tax thresholds and allowances rise a year (issue #73, option B): ~1%. */
  taxThresholdsBp: 100,
  /** "Not sure — suggest": a fixed 3.50% (not inflation + 1%). */
  statePensionUpratingBp: 350,
  /** Chosen comparison rates (§11A), read as net of charges. */
  cautiousGrowthBp: 400,
  middleGrowthBp: 600,
  optimisticGrowthBp: 800,
  /** Full new State Pension 2026/27: £241.30 per week. */
  fullStatePensionWeeklyPence: 24_130,
  /** "£5,500 a year per £100k" — the illustrative annuity rate offered in the grill. */
  annuityPencePer100k: 550_000,
  /**
   * The household's birth years from the grill (§11A), used only to seed a
   * new plan's draft — never inside the engine. Every household edits them in
   * the assumptions panel; a second household simply starts from these and
   * corrects them. No calculation reads this constant.
   */
  birthYears: [1970, 1980] as const,
  /** The two pension pots' rough start dates from the grill (his, ages 60 and 65). */
  pensionPotStartDates: ['2030-01-01', '2035-01-01'] as const,
  /** The inheritance: start of 2027, £250,000 after the mortgage is paid off. */
  inheritanceDate: '2027-01-01',
  inheritancePence: 25_000_000,
  /** The household's ISA plan default: the couple's combined £20,000 caps. */
  isaShelterAnnualPence: 4_000_000,
} as const;
