/**
 * The saved shape of a long-term forecast (LONGTERM_FORECASTING.md §9, slice
 * 2). The engine's `LongTermPlan` is the arithmetic; this document adds the
 * household's three comparison rates and is what `longterm_plans.payload`
 * stores as JSON.
 *
 * A plan is a **draft the household owns**: the store seeds it from records
 * where records exist (people, recurring commitments, the groceries/fuel
 * basis) and from the reviewed defaults in `rates.ts` where they do not
 * (birth years, pension pot start dates, the inheritance). Nothing here is
 * baked into a calculation — the page's assumptions panel edits every field.
 *
 * Framework-free and client-safe: the assumptions form imports the types and
 * the percent helpers, so this module must not import the database or zod.
 */

import { HOUSEHOLD_DEFAULTS } from './rates';
import type { BasisPoints, LongTermPlan } from './types';

/** One saved plan: the engine's plan plus the rates the household compares. */
export interface LongTermPlanDocument {
  plan: LongTermPlan;
  /**
   * Cautious / middle / optimistic investment return rates, in basis points.
   * They override the investments' own growth rates for each comparison run
   * (§5.3); pension pots keep their own rates.
   */
  comparisonRatesBp: [BasisPoints, BasisPoints, BasisPoints];
}

/** The single row name v1 uses. Named scenarios are a later slice. */
export const LONGTERM_PLAN_NAME = 'Household plan';

/** In display order: cautious, middle, optimistic. */
export const COMPARISON_LABELS = ['Cautious', 'Middle', 'Optimistic'] as const;
export type ComparisonIndex = 0 | 1 | 2;
export const DEFAULT_COMPARISON_INDEX: ComparisonIndex = 1;

/** The URL value of each comparison run (`?rate=middle`). */
export const COMPARISON_KEYS = ['cautious', 'middle', 'optimistic'] as const;
export type ComparisonKey = (typeof COMPARISON_KEYS)[number];

/** The seeded comparison set from the grill: 4% / 6% / 8%, net of charges. */
export function defaultComparisonRates(): [BasisPoints, BasisPoints, BasisPoints] {
  return [
    HOUSEHOLD_DEFAULTS.cautiousGrowthBp,
    HOUSEHOLD_DEFAULTS.middleGrowthBp,
    HOUSEHOLD_DEFAULTS.optimisticGrowthBp,
  ];
}

/** `?rate=` → a comparison index; anything else gets the middle run. */
export function comparisonIndexFromParam(value: string | undefined): ComparisonIndex {
  const index = COMPARISON_KEYS.indexOf((value ?? '') as ComparisonKey);
  return index === -1 ? DEFAULT_COMPARISON_INDEX : (index as ComparisonIndex);
}

export function comparisonKey(index: ComparisonIndex): ComparisonKey {
  return COMPARISON_KEYS[index];
}

/**
 * Parse a user-typed annual percentage into integer basis points.
 * Accepts a trailing `%`, optional decimals (up to two places) and surrounding
 * whitespace: "4" → 400, "2.5%" → 250, "0.25" → 25. Negative rates are not
 * offered (a plan is not the place to model a permanent market fall); a value
 * above 100% is rejected. Returns null when the text is not an exact rate.
 */
export function parsePercentBp(text: string): number | null {
  const cleaned = text.replace(/[%\s]/g, '');
  if (cleaned === '' || !/^\d{1,4}(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ''] = cleaned.split('.');
  const bp = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(bp) || bp < 0 || bp > 10_000) return null;
  return bp;
}

/** The exact decimal string a rate field shows: 600 → "6.00", 250 → "2.50". */
export function formatRateInput(bp: number): string {
  if (!Number.isSafeInteger(bp) || bp < 0) {
    throw new Error(`formatRateInput expects non-negative integer basis points, received ${bp}`);
  }
  const whole = Math.floor(bp / 100);
  const fraction = String(bp % 100).padStart(2, '0');
  return `${whole}.${fraction}`;
}

/** A display label with the percent sign: 600 → "6.00%". */
export function formatRateLabel(bp: number): string {
  return `${formatRateInput(bp)}%`;
}

/** The year a person turns `age` (calendar-year arithmetic, as the grill asked). */
export function yearAtAge(birthYear: number, age: number): number {
  return birthYear + age;
}

/** `year − birthYear`; ages are shown beside every year in the output. */
export function ageInYear(birthYear: number, year: number): number {
  return year - birthYear;
}

/**
 * The default State Pension start year for a birth year under current law:
 * 67 for people born before 6 April 1978, 68 from that cohort on (the design
 * record's §5.7 flag: her 1980 birth year defaults to 68). The household can
 * set any start date in the assumptions; this only seeds a draft and never
 * predicts future legislation.
 */
export function statePensionStartYear(birthYear: number): number {
  return birthYear + (birthYear >= 1978 ? 68 : 67);
}

/**
 * The seeded forecast end: the end of the year the **younger** person turns
 * 90 (LONGTERM_FORECASTING.md §5.7 — flagged for confirmation; editable).
 * With no people, fall back to 45 years beyond the current year.
 */
export function defaultHorizonYear(birthYears: readonly number[], currentYear: number): number {
  const youngest = birthYears.length === 0 ? null : Math.max(...birthYears);
  return youngest === null ? currentYear + 45 : youngest + 90;
}

/** `2070-12-31` — the last day of a horizon year. */
export function endOfYearDate(year: number): string {
  return `${year}-12-31`;
}

/**
 * A collision-free id for a new row in the assumptions editor. Ids are local
 * to the payload (they never reach a table), so a stable prefix plus the
 * smallest free number is enough — and deterministic, which keeps tests sane.
 */
export function nextEntityId(prefix: string, existingIds: readonly string[]): string {
  const base = prefix.endsWith('-') ? prefix : `${prefix}-`;
  const used = new Set(existingIds);
  let counter = 1;
  while (used.has(`${base}${counter}`)) counter += 1;
  return `${base}${counter}`;
}

/** The plan's youngest person's birth year, or null when nobody is set up. */
export function youngerBirthYear(plan: LongTermPlan): number | null {
  if (plan.people.length === 0) return null;
  return Math.max(...plan.people.map((person) => person.birthYear));
}
