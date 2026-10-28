import { roundHalfUpDivide } from '../money';

/**
 * Energy usage and tariffs (issue 118, v1.44.0; SPEC §29). Everything here is
 * pure: numbers in, numbers out, no database and no clock. `energy.ts` finds
 * the bills and writes them; this module decides what they mean.
 *
 * Units follow the **bill**, never a convenient approximation:
 *
 * - usage is **watt-hours** (755.23 kWh = 755 230), the energy twin of fuel's
 *   millilitres;
 * - a meter reading is **ten-thousandths of the meter's own unit**
 *   (13 770.4660 m³ = 137 704 660), because that is what a UK bill prints;
 * - a tariff rate is **thousandths of a penny** (4.748p = 4748), because a UK
 *   bill prints three decimals and rounding the rate first would move the
 *   total.
 *
 * The app never converts m³ to kWh: the factor depends on the gas's calorific
 * value, so `impliedGasKwhPerCubicMetre` checks the bill's own arithmetic
 * instead of inventing a number (§8 of the plan).
 */

/** UK domestic energy VAT, added to every figure the app quotes. */
export const ENERGY_VAT_PERCENT = 5;

/** Ofgem's typical-medium-household annual figures — a yardstick, not a target. */
export const TYPICAL_ANNUAL_KWH = { gas: 11_500, electric: 2_700 } as const;

/** The plan's honest band for kWh ÷ m³ on a gas bill (usually ~11.2). */
export const GAS_FACTOR_BAND = { low: 9, high: 13 } as const;

export type EnergyFuel = 'gas' | 'electric';
export const ENERGY_FUELS: readonly EnergyFuel[] = ['gas', 'electric'];

export const FUEL_LABEL: Record<EnergyFuel, string> = { gas: 'Gas', electric: 'Electricity' };

export class InvalidEnergyInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidEnergyInputError';
  }
}

/* ------------------------------------------------------------------ parsing */

/**
 * A decimal typed by a person, scaled to a whole integer. `decimals` is the
 * number of places stored — 3 for kWh (watt-hours), 4 for meter readings, 3
 * for tariff rates in thousandths of a penny.
 */
export function parseScaledDecimal(
  raw: string | null | undefined,
  decimals: number,
  label: string,
): number | null {
  const text = (raw ?? '').trim().replace(/,/g, '');
  if (text === '') return null;
  const pattern = decimals === 0 ? /^\d+$/ : new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`);
  if (!pattern.test(text)) {
    throw new InvalidEnergyInputError(
      `${label} should be a number with at most ${decimals} decimal place${decimals === 1 ? '' : 's'}.`,
    );
  }
  const [whole, fraction = ''] = text.split('.');
  const scaled = Number(whole + fraction.padEnd(decimals, '0'));
  if (!Number.isSafeInteger(scaled)) {
    throw new InvalidEnergyInputError(`${label} is too large.`);
  }
  return scaled;
}

/** Usage in kWh, typed to at most three decimals, held as whole watt-hours. */
export function parseKwh(raw: string | null | undefined, label: string): number | null {
  return parseScaledDecimal(raw, 3, label);
}

/** A meter reading, typed to at most four decimals, held in ten-thousandths. */
export function parseReading(raw: string | null | undefined, label: string): number | null {
  return parseScaledDecimal(raw, 4, label);
}

/** A tariff rate, typed to at most three decimals, held in thousandths of a penny. */
export function parseRate(raw: string | null | undefined, label: string): number | null {
  return parseScaledDecimal(raw, 3, label);
}

/* --------------------------------------------------------------- formatting */

/** Drops trailing zeros so 755230 Wh prints as `755.23` and 268000 as `268`. */
function trimDecimal(scaled: number, decimals: number): string {
  if (scaled === 0) return '0';
  const negative = scaled < 0;
  const digits = String(Math.abs(scaled)).padStart(decimals + 1, '0');
  const whole = digits.slice(0, digits.length - decimals) || '0';
  const fraction = digits.slice(digits.length - decimals).replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${fraction === '' ? '' : `.${fraction}`}`;
}

export function formatKwh(wh: number): string {
  return trimDecimal(wh, 3);
}

export function formatKwhLabel(wh: number): string {
  return `${formatKwh(wh)} kWh`;
}

export function formatReading(tenThousandths: number): string {
  return trimDecimal(tenThousandths, 4);
}

export function formatUnitRate(milliPence: number): string {
  return `${trimDecimal(milliPence, 3)}p`;
}

export function formatStandingCharge(milliPencePerDay: number): string {
  return `${trimDecimal(milliPencePerDay, 3)}p`;
}

/** Whole pounds-and-pence parts of a milli-penny figure, for the money formatter. */
export function milliPenceToPence(milliPence: number): number {
  return roundHalfUpDivide(milliPence, 1000);
}

/* -------------------------------------------------------------- the periods */

/**
 * Days in a billing period, counting both ends: 18 Sep – 18 Oct 2026 is 31
 * days, which is the figure the standing charge is worked out on. Local
 * calendar dates only — no timezone arithmetic, no daylight saving surprises.
 */
export function billingDays(start: string, end: string): number {
  const from = Date.parse(`${start}T00:00:00Z`);
  const to = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) {
    throw new InvalidEnergyInputError('The billing period ends before it starts.');
  }
  return Math.round((to - from) / 86_400_000) + 1;
}

/** True when two periods share a day, so the page can say so instead of adding them. */
export function periodsOverlap(
  a: { start: string; end: string },
  b: { start: string; end: string },
): boolean {
  return a.start <= b.end && b.start <= a.end;
}

/**
 * The month a bill is drawn in: the month its period **ends** in — a
 * 18 Sep–18 Oct bill is October's — falling back to the purchase date when the
 * household did not record a period.
 */
export function billMonth(bill: { periodEnd: string | null; occurredDate: string }): string {
  return (bill.periodEnd ?? bill.occurredDate).slice(0, 7);
}

/* ------------------------------------------------------------------- tariffs */

export interface EnergyTariff {
  supplier: string;
  tariffName: string;
  /** Thousandths of a penny per kWh, excluding VAT — as the bill prints it. */
  unitRateMilliPencePerKwh: number;
  /** Thousandths of a penny per day, excluding VAT. */
  standingChargeMilliPencePerDay: number;
  /** The day the price stops being guaranteed; the exit fee is live until then. */
  fixedUntil: string | null;
  exitFeePence: number | null;
  notes: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Validates one tariff as read from settings, or refuses to show it at all. */
export function parseEnergyTariff(raw: string | null | undefined): EnergyTariff | null {
  const text = (raw ?? '').trim();
  if (text === '') return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new InvalidEnergyInputError('The saved tariff is not readable. Enter it again.');
  }
  if (typeof value !== 'object' || value === null) {
    throw new InvalidEnergyInputError('The saved tariff is not readable. Enter it again.');
  }
  const record = value as Record<string, unknown>;
  const string = (key: string): string => (typeof record[key] === 'string' ? record[key] : '');
  const positiveInteger = (key: string): number => {
    const n = record[key];
    if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0) {
      throw new InvalidEnergyInputError('The saved tariff has a rate that is not a number.');
    }
    return n;
  };
  const supplier = string('supplier').trim();
  const tariffName = string('tariffName').trim();
  if (supplier === '' || tariffName === '') {
    throw new InvalidEnergyInputError('A saved tariff needs a supplier and a tariff name.');
  }
  const fixedUntil = string('fixedUntil').trim();
  if (fixedUntil !== '' && !ISO_DATE.test(fixedUntil)) {
    throw new InvalidEnergyInputError('The saved tariff has an unreadable fixed-until date.');
  }
  const exitFee = record.exitFeePence;
  if (exitFee !== null && exitFee !== undefined) {
    if (typeof exitFee !== 'number' || !Number.isSafeInteger(exitFee) || exitFee < 0) {
      throw new InvalidEnergyInputError('The saved tariff has an unreadable exit fee.');
    }
  }
  return {
    supplier,
    tariffName,
    unitRateMilliPencePerKwh: positiveInteger('unitRateMilliPencePerKwh'),
    standingChargeMilliPencePerDay: positiveInteger('standingChargeMilliPencePerDay'),
    fixedUntil: fixedUntil === '' ? null : fixedUntil,
    exitFeePence: typeof exitFee === 'number' ? exitFee : null,
    notes: string('notes'),
  };
}

export function serialiseEnergyTariff(tariff: EnergyTariff): string {
  return JSON.stringify(tariff);
}

/** The exit fee only applies while the price is still guaranteed. */
export function exitFeeLive(tariff: EnergyTariff, today: string): number {
  if (tariff.exitFeePence === null || tariff.exitFeePence === 0) return 0;
  if (tariff.fixedUntil === null) return tariff.exitFeePence;
  return today < tariff.fixedUntil ? tariff.exitFeePence : 0;
}

/* --------------------------------------------------------------------- costs */

export interface FuelCost {
  unitsPence: number;
  standingPence: number;
  exVatPence: number;
  vatPence: number;
  totalPence: number;
}

/**
 * What a period of one fuel costs on a tariff. Each product is rounded
 * half-up into whole pence exactly once, VAT is added per fuel (each fuel is
 * its own account, on its own bill) and rounded once.
 */
export function fuelCost(input: {
  wh: number;
  days: number;
  tariff: Pick<EnergyTariff, 'unitRateMilliPencePerKwh' | 'standingChargeMilliPencePerDay'>;
}): FuelCost {
  const unitsPence = roundHalfUpDivide(input.tariff.unitRateMilliPencePerKwh * input.wh, 1_000_000);
  const standingPence = roundHalfUpDivide(
    input.tariff.standingChargeMilliPencePerDay * input.days,
    1000,
  );
  const exVatPence = unitsPence + standingPence;
  const vatPence = roundHalfUpDivide(exVatPence * ENERGY_VAT_PERCENT, 100);
  return { unitsPence, standingPence, exVatPence, vatPence, totalPence: exVatPence + vatPence };
}

/** A year on one tariff for one fuel, VAT included — what the tariff card quotes. */
export function annualCost(wh: number, tariff: EnergyTariff): FuelCost {
  return fuelCost({ wh, days: 365, tariff });
}

/**
 * The true average price of a unit: what left the bank ÷ the kWh it bought,
 * standing charge included. Said as such wherever it is shown.
 */
export function effectiveMilliPencePerKwh(pence: number, wh: number): number | null {
  if (wh <= 0) return null;
  return roundHalfUpDivide(pence * 1_000_000, wh);
}

/* ------------------------------------------------------------------- usage */

export interface EnergyBillLike {
  purchaseId: number;
  occurredDate: string;
  periodStart: string | null;
  periodEnd: string | null;
  gasWh: number | null;
  electricWh: number | null;
  gasReadingStart: number | null;
  gasReadingEnd: number | null;
  electricReadingStart: number | null;
  electricReadingEnd: number | null;
  gasEstimateWh: number | null;
  electricEstimateWh: number | null;
}

export interface RecordedUsage {
  gasWh: number;
  electricWh: number;
  /** Days of bills that recorded a period — the only honest denominator. */
  daysCovered: number;
  /** Bills with usage but no period: counted in the totals, never in the days. */
  billsWithoutPeriod: number;
  gasEstimateWh: number | null;
  electricEstimateWh: number | null;
}

/**
 * Everything the household has recorded. Usage without a period still counts
 * towards what was used, but it cannot count towards the days, so the
 * annualised figure says which bills it rests on.
 */
export function recordedUsage(bills: readonly EnergyBillLike[]): RecordedUsage {
  let gasWh = 0;
  let electricWh = 0;
  let daysCovered = 0;
  let billsWithoutPeriod = 0;
  let gasEstimateWh: number | null = null;
  let electricEstimateWh: number | null = null;
  for (const bill of bills) {
    gasWh += bill.gasWh ?? 0;
    electricWh += bill.electricWh ?? 0;
    if (bill.periodStart !== null && bill.periodEnd !== null) {
      daysCovered += billingDays(bill.periodStart, bill.periodEnd);
    } else {
      billsWithoutPeriod += 1;
    }
    if (bill.gasEstimateWh !== null) gasEstimateWh = bill.gasEstimateWh;
    if (bill.electricEstimateWh !== null) electricEstimateWh = bill.electricEstimateWh;
  }
  return { gasWh, electricWh, daysCovered, billsWithoutPeriod, gasEstimateWh, electricEstimateWh };
}

/** A year's usage from a shorter run of bills, half-up to whole kWh. */
export function annualiseWh(wh: number, days: number): number | null {
  if (days <= 0) return null;
  return roundHalfUpDivide(wh * 365, days);
}

/**
 * The usage figure the comparison is worked on, and where it came from.
 *
 * The household's own bills win once there are at least 30 days of them —
 * below that, scaling one bill up to a year would be a guess. The supplier's
 * own "estimated annual usage" is the fallback, because it is the number a
 * comparison site would use and the household already has it printed. With
 * neither, the comparison refuses.
 */
export function comparisonUsage(
  usage: RecordedUsage,
  fuel: EnergyFuel,
): { wh: number; basis: 'bills' | 'estimate'; days: number | null } | null {
  const est = fuel === 'gas' ? usage.gasEstimateWh : usage.electricEstimateWh;
  if (usage.daysCovered >= 30) {
    const wh = fuel === 'gas' ? usage.gasWh : usage.electricWh;
    if (wh > 0) {
      const annual = annualiseWh(wh, usage.daysCovered);
      if (annual !== null && annual > 0) {
        return { wh: annual, basis: 'bills', days: usage.daysCovered };
      }
    }
  }
  if (est !== null && est > 0) return { wh: est, basis: 'estimate', days: null };
  return null;
}

/* ----------------------------------------------------------------- the chart */

export interface EnergyMonth {
  /** 'YYYY-MM'. */
  month: string;
  /** Gas usage, or null for a month with no bill — a gap, never a zero bar. */
  gasWh: number | null;
  electricWh: number | null;
  /** What the energy lines cost that month, when any bill recorded a cost. */
  pence: number | null;
  bills: number;
}

export interface EnergyBillFigures extends EnergyBillLike {
  /** The energy category's allocation lines on that purchase, in pence. */
  energyPence: number | null;
}

/**
 * The last `count` calendar months, ending with `today`'s month, oldest first.
 * A month with no bill carries nulls: the chart draws a gap and the table says
 * "no bill" rather than a zero the household never recorded.
 */
export function summariseMonths(
  bills: readonly EnergyBillFigures[],
  today: string,
  count = 12,
): EnergyMonth[] {
  const byMonth = new Map<string, EnergyBillFigures[]>();
  for (const bill of bills) {
    const key = billMonth(bill);
    const list = byMonth.get(key) ?? [];
    list.push(bill);
    byMonth.set(key, list);
  }
  const months: EnergyMonth[] = [];
  const [year, month] = today.slice(0, 7).split('-').map(Number) as [number, number];
  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(Date.UTC(year, month - 1 - index, 1));
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    const entries = byMonth.get(key) ?? [];
    const gas = entries.some((entry) => entry.gasWh !== null);
    const electric = entries.some((entry) => entry.electricWh !== null);
    const priced = entries.filter((entry) => entry.energyPence !== null);
    months.push({
      month: key,
      gasWh: gas ? entries.reduce((total, entry) => total + (entry.gasWh ?? 0), 0) : null,
      electricWh: electric
        ? entries.reduce((total, entry) => total + (entry.electricWh ?? 0), 0)
        : null,
      pence:
        priced.length === 0
          ? null
          : priced.reduce((total, entry) => total + (entry.energyPence ?? 0), 0),
      bills: entries.length,
    });
  }
  return months;
}

/* ------------------------------------------------------------ honest checks */

/**
 * The bill's own m³ → kWh factor. A UK gas bill lands near 11.2; well outside
 * 9–13 the usual cause is kWh typed into the m³ box, so the page says "worth
 * checking" rather than quietly working on a figure it does not believe.
 */
export function impliedGasKwhPerCubicMetre(
  gasWh: number | null,
  start: number | null,
  end: number | null,
): number | null {
  if (gasWh === null || start === null || end === null) return null;
  const cubicMetres = (end - start) / 10_000;
  if (cubicMetres <= 0) return null;
  return gasWh / 1000 / cubicMetres;
}

export function gasFactorWorthChecking(factor: number | null): boolean {
  if (factor === null) return false;
  return factor < GAS_FACTOR_BAND.low || factor > GAS_FACTOR_BAND.high;
}

export interface BillNote {
  kind: 'overlap' | 'readings' | 'factor' | 'no-period';
  message: string;
}

/**
 * What the page says beside a bill. Nothing here blocks a save: the household
 * knows about meter exchanges, estimated bills and the two bills that arrived
 * a week apart, and the app's job is to name it, not to refuse it.
 */
export function billNotes(bill: EnergyBillLike, previous: EnergyBillLike | null): BillNote[] {
  const notes: BillNote[] = [];
  if (bill.periodStart === null || bill.periodEnd === null) {
    notes.push({
      kind: 'no-period',
      message: 'No billing period recorded — counted in the month it was paid.',
    });
  } else if (previous !== null && previous.periodStart !== null && previous.periodEnd !== null) {
    if (
      periodsOverlap(
        { start: bill.periodStart, end: bill.periodEnd },
        { start: previous.periodStart, end: previous.periodEnd },
      )
    ) {
      notes.push({
        kind: 'overlap',
        message: 'This period overlaps the previous bill — check before comparing months.',
      });
    }
  }

  const fuelChecks: Array<{
    fuel: EnergyFuel;
    wh: number | null;
    start: number | null;
    end: number | null;
  }> = [
    { fuel: 'gas', wh: bill.gasWh, start: bill.gasReadingStart, end: bill.gasReadingEnd },
    {
      fuel: 'electric',
      wh: bill.electricWh,
      start: bill.electricReadingStart,
      end: bill.electricReadingEnd,
    },
  ];
  for (const check of fuelChecks) {
    if (check.start === null || check.end === null) continue;
    if (check.end < check.start) {
      notes.push({
        kind: 'readings',
        message: `${FUEL_LABEL[check.fuel]} readings go backwards — usually a meter exchange.`,
      });
    }
  }
  const previousGasEnd = previous?.gasReadingEnd ?? null;
  if (
    bill.gasReadingStart !== null &&
    previousGasEnd !== null &&
    bill.gasReadingStart !== previousGasEnd
  ) {
    notes.push({
      kind: 'readings',
      message: `Gas opening reading ${formatReading(bill.gasReadingStart)} does not follow the previous bill's ${formatReading(previousGasEnd)}.`,
    });
  }
  const previousElectricEnd = previous?.electricReadingEnd ?? null;
  if (
    bill.electricReadingStart !== null &&
    previousElectricEnd !== null &&
    bill.electricReadingStart !== previousElectricEnd
  ) {
    notes.push({
      kind: 'readings',
      message: `Electricity opening reading ${formatReading(bill.electricReadingStart)} does not follow the previous bill's ${formatReading(previousElectricEnd)}.`,
    });
  }

  const factor = impliedGasKwhPerCubicMetre(bill.gasWh, bill.gasReadingStart, bill.gasReadingEnd);
  if (gasFactorWorthChecking(factor)) {
    notes.push({
      kind: 'factor',
      message: `Gas works out at ${factor?.toFixed(1)} kWh per m³ — worth checking the readings or the kWh.`,
    });
  }
  return notes;
}

/* ------------------------------------------------------- the switching maths */

export interface ComparisonInput {
  fuel: EnergyFuel;
  usageWh: number;
  basis: 'bills' | 'estimate';
  days: number | null;
  current: EnergyTariff;
  candidate: Pick<
    EnergyTariff,
    'supplier' | 'tariffName' | 'unitRateMilliPencePerKwh' | 'standingChargeMilliPencePerDay'
  >;
  /** The candidate's own exit fee, if it has one. */
  candidateExitFeePence?: number | null;
  today: string;
}

export interface ComparisonResult {
  fuel: EnergyFuel;
  usageWh: number;
  basis: 'bills' | 'estimate';
  days: number | null;
  currentAnnual: FuelCost;
  candidateAnnual: FuelCost;
  /** candidate − current: negative means the candidate is cheaper. */
  differencePence: number;
  /** The household's current exit fee, if leaving today would cost one. */
  currentExitFeePence: number;
  /** Months for the saving to cover that exit fee; null when there is no fee. */
  paybackMonths: number | null;
}

/**
 * One fuel, the same usage both sides, so only the tariff changes. Nothing is
 * recommended: this is arithmetic on the household's own numbers.
 */
export function compareTariffs(input: ComparisonInput): ComparisonResult {
  const currentAnnual = annualCost(input.usageWh, input.current);
  const candidateAnnual = annualCost(input.usageWh, {
    ...input.current,
    ...input.candidate,
  });
  const differencePence = candidateAnnual.totalPence - currentAnnual.totalPence;
  const currentExitFeePence = exitFeeLive(input.current, input.today);
  const monthlySaving = roundHalfUpDivide(-differencePence, 12);
  const paybackMonths =
    currentExitFeePence > 0 && monthlySaving > 0
      ? Math.ceil(currentExitFeePence / monthlySaving)
      : null;
  return {
    fuel: input.fuel,
    usageWh: input.usageWh,
    basis: input.basis,
    days: input.days,
    currentAnnual,
    candidateAnnual,
    differencePence,
    currentExitFeePence,
    paybackMonths,
  };
}

/** "from your own 217 days of bills" / "from the supplier's estimate". */
export function usageBasisLabel(result: Pick<ComparisonResult, 'basis' | 'days'>): string {
  if (result.basis === 'bills') {
    return `from your own ${result.days ?? 0} days of bills`;
  }
  return "from the supplier's estimated annual usage";
}

/* ------------------------------------------------- the details on one bill */

export interface EnergyDetails {
  periodStart: string | null;
  periodEnd: string | null;
  gasWh: number | null;
  electricWh: number | null;
  gasReadingStart: number | null;
  gasReadingEnd: number | null;
  electricReadingStart: number | null;
  electricReadingEnd: number | null;
  gasEstimateWh: number | null;
  electricEstimateWh: number | null;
  note: string | null;
}

export interface CheckedEnergyDetails extends EnergyDetails {
  /** True when the electricity figure came from the household's two readings. */
  electricFromReadings: boolean;
}

/**
 * The rules a saved bill must keep, applied before anything is written.
 *
 * Only the usage is required — the household is asked for "this month's kWh",
 * and the rest of the bill is worth recording only when it is to hand. A
 * period is both dates or neither, so a half-typed period can never claim a
 * month it does not cover. Readings that go backwards are **allowed**: a meter
 * exchange does exactly that, and the page names it rather than refusing the
 * bill (§8 of the plan).
 */
export function checkEnergyDetails(
  details: EnergyDetails,
  options: { allowEmpty?: boolean } = {},
): CheckedEnergyDetails {
  const optionalPositive = (value: number | null, label: string): number | null => {
    if (value === null) return null;
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new InvalidEnergyInputError(`${label} must be a whole number, not negative.`);
    }
    return value === 0 ? null : value;
  };

  const gasWh = optionalPositive(details.gasWh, 'Gas usage');
  let electricWh = optionalPositive(details.electricWh, 'Electricity usage');
  const periodStart = details.periodStart?.trim() || null;
  const periodEnd = details.periodEnd?.trim() || null;
  if ((periodStart === null) !== (periodEnd === null)) {
    throw new InvalidEnergyInputError('Enter both dates of the billing period, or neither.');
  }
  if (periodStart !== null && periodEnd !== null) {
    if (!ISO_DATE.test(periodStart) || !ISO_DATE.test(periodEnd)) {
      throw new InvalidEnergyInputError('The billing period needs two real dates.');
    }
    billingDays(periodStart, periodEnd);
  }

  const gasReadingStart = optionalPositive(details.gasReadingStart, 'Gas opening reading');
  const gasReadingEnd = optionalPositive(details.gasReadingEnd, 'Gas closing reading');
  const electricReadingStart = optionalPositive(
    details.electricReadingStart,
    'Electricity opening reading',
  );
  const electricReadingEnd = optionalPositive(
    details.electricReadingEnd,
    'Electricity closing reading',
  );

  // Electricity from the readings when the bill's own kWh box is blank: a
  // tenth-of-a-Wh per reading unit, rounded half-up to a whole watt-hour.
  let electricFromReadings = false;
  if (
    electricWh === null &&
    electricReadingStart !== null &&
    electricReadingEnd !== null &&
    electricReadingEnd > electricReadingStart
  ) {
    const derived = roundHalfUpDivide(electricReadingEnd - electricReadingStart, 10);
    if (derived > 0) {
      electricWh = derived;
      electricFromReadings = true;
    }
  }

  if (gasWh === null && electricWh === null && options.allowEmpty !== true) {
    throw new InvalidEnergyInputError(
      'Enter the gas or the electricity usage from the bill — that is the one figure to keep.',
    );
  }

  return {
    periodStart,
    periodEnd,
    gasWh,
    electricWh,
    gasReadingStart,
    gasReadingEnd,
    electricReadingStart,
    electricReadingEnd,
    gasEstimateWh: optionalPositive(details.gasEstimateWh, 'Estimated gas usage'),
    electricEstimateWh: optionalPositive(details.electricEstimateWh, 'Estimated electricity usage'),
    note: details.note?.trim() || null,
    electricFromReadings,
  };
}

/** The audit line: what was recorded, in the household's own figures. */
export function describeEnergyDetails(details: EnergyDetails): string {
  const parts: string[] = [];
  if (details.gasWh !== null) parts.push(`gas ${formatKwhLabel(details.gasWh)}`);
  if (details.electricWh !== null) parts.push(`electric ${formatKwhLabel(details.electricWh)}`);
  if (details.periodStart !== null && details.periodEnd !== null) {
    parts.push(`${details.periodStart} to ${details.periodEnd}`);
  }
  return parts.length === 0 ? 'cleared' : parts.join(' · ');
}
