import { roundHalfUpDivide } from '../money';
import {
  addDaysLocal,
  addMonthsClamped,
  checkedLocalDate,
  daysInMonth,
  toDateString,
} from './dates';

/**
 * The Insights v1 engine (docs/SPEC.md §16, panels 1–4): month comparisons,
 * personal-vs-personal spending, per-vehicle running costs, and the
 * projection honesty loop (configured figures vs recent actuals).
 *
 * Pure, framework-free, integer-pence — shared by the Insights UI and the
 * tests ("insights figures reconcile with the pure engines", Phase 4 exit).
 *
 * Conventions:
 * - Every input row is a flat, typed spending line (a date, its category
 *   parent/child names, one target, signed pence). Purchases add, refunds
 *   subtract, so a summary is NET spending. Transfers never appear here
 *   (SPEC §10 — excluded from every spending insight); the DB assembly
 *   (insights-view.ts) is the only place that queries the database.
 * - All arithmetic is over local 'YYYY-MM-DD' dates (dates.ts), so DST
 *   transitions cannot leak in. Calendar months are calendar months
 *   (decision 4: payday cycle for projections, calendar month for Insights).
 */

/** Category names the honesty loop tracks (SPEC §12 seed tree). */
export const GROCERIES_PARENT = 'Groceries';
export const FUEL_CHILD = 'Fuel';

/** Months an annual schedule payment covers, counted from its own month (decision 190). */
export const ANNUAL_COVER_MONTHS = 12;

export interface SpendingLineInput {
  occurredDate: string; // 'YYYY-MM-DD'
  categoryId: number;
  parentName: string;
  childName: string;
  targetKind: 'household' | 'person' | 'vehicle';
  targetId: number | null;
  /** Signed: purchases positive, refunds negative (net spending). */
  amountPence: number;
  /**
   * Calendar months this amount pays for, starting in its own month (decision
   * 190). Ordinary purchases and monthly payments are 1 (the default). An
   * annual schedule payment is 12. Only the vehicle running-costs view spreads
   * it (÷ 12 per month); every other view keeps the cash-basis date.
   */
  coversMonths?: number;
}

export interface ChildSum {
  child: string;
  amountPence: number;
}

/** A parent-category roll-up with its child drill-down (SPEC §12, §16.1). */
export interface ParentSum {
  parent: string;
  amountPence: number;
  children: ChildSum[];
}

/** Net spending over an inclusive local-date window, rolled up to parents. */
export interface SpendingSummary {
  from: string;
  to: string;
  totalPence: number;
  byParent: ParentSum[];
}

export interface MonthRef {
  year: number;
  month: number; // 1–12
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function checkedMonthRef(ref: MonthRef): MonthRef {
  if (!Number.isInteger(ref.year) || ref.year < 1 || ref.year > 9999) {
    throw new Error(`Expected a calendar month, received year ${ref.year}`);
  }
  if (!Number.isInteger(ref.month) || ref.month < 1 || ref.month > 12) {
    throw new Error(`Expected a calendar month, received month ${ref.month}`);
  }
  return ref;
}

export function monthOfLocalDate(date: string): MonthRef {
  const d = checkedLocalDate(date);
  return { year: d.year, month: d.month };
}

export function firstOfLocalMonth(date: string): string {
  const d = checkedLocalDate(date);
  return toDateString({ year: d.year, month: d.month, day: 1 });
}

export function lastOfLocalMonth(date: string): string {
  const d = checkedLocalDate(date);
  return toDateString({ year: d.year, month: d.month, day: daysInMonth(d.year, d.month) });
}

/** The calendar month before the month containing `date` (handles January). */
export function previousLocalMonth(date: string): MonthRef {
  const d = checkedLocalDate(date);
  return d.month === 1 ? { year: d.year - 1, month: 12 } : { year: d.year, month: d.month - 1 };
}

export function monthRange(ref: MonthRef): { from: string; to: string } {
  checkedMonthRef(ref);
  return {
    from: toDateString({ year: ref.year, month: ref.month, day: 1 }),
    to: toDateString({ year: ref.year, month: ref.month, day: daysInMonth(ref.year, ref.month) }),
  };
}

export function formatMonthLabel(ref: MonthRef): string {
  checkedMonthRef(ref);
  return `${MONTH_NAMES[ref.month - 1]} ${ref.year}`;
}

/**
 * Panel 1 building block: net spending over [from, to] (inclusive local
 * dates), total plus parent roll-up with child drill-down. Lines outside
 * the window are ignored; a parent with activity that nets to zero is still
 * shown (an honest "spent and refunded" is not a hidden month).
 */
export function summarizeSpending(
  lines: readonly SpendingLineInput[],
  from: string,
  to: string,
): SpendingSummary {
  checkedLocalDate(from);
  checkedLocalDate(to);
  const parents = new Map<string, { amountPence: number; children: Map<string, number> }>();
  let total = 0;
  for (const line of lines) {
    if (line.occurredDate < from || line.occurredDate > to) continue;
    total += line.amountPence;
    const parent = parents.get(line.parentName) ?? { amountPence: 0, children: new Map() };
    parent.amountPence += line.amountPence;
    parent.children.set(
      line.childName,
      (parent.children.get(line.childName) ?? 0) + line.amountPence,
    );
    parents.set(line.parentName, parent);
  }
  const byParent: ParentSum[] = [...parents.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([parent, value]) => ({
      parent,
      amountPence: value.amountPence,
      children: [...value.children.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([child, amountPence]) => ({ child, amountPence })),
    }));
  return { from, to, totalPence: total, byParent };
}

/** How many calendar months the comparison shows side by side (SPEC §16.1). */
export const COMPARED_MONTHS = 3;

/** One calendar month of the comparison, with its change against the month before. */
export interface MonthColumn {
  month: MonthRef;
  label: string;
  /** True while this calendar month is still running (label it as such). */
  inProgress: boolean;
  summary: SpendingSummary;
  /**
   * Change in the month's total against the month before it. Null in the
   * oldest column — there is no earlier month in the table to compare with.
   */
  deltaPence: number | null;
}

export interface MonthParentRow {
  parent: string;
  /** Net spending in each month, aligned with `months` (oldest first). */
  amountsPence: number[];
  /** Change against the month before; null in the first column. */
  deltasPence: Array<number | null>;
}

export interface MonthComparison {
  today: string;
  /**
   * The last `months` calendar months, oldest first. The newest is the
   * current month, in progress until month end — and the months before it
   * still compare complete-to-complete however early in the month the
   * household looks (the whole point of showing three).
   */
  months: MonthColumn[];
  /** Per parent category, alphabetical, aligned with `months`. */
  byParent: MonthParentRow[];
  /** The newest column (`months[months.length - 1]`). */
  current: MonthColumn;
  /** The second-newest column: `current`'s comparison partner. */
  previous: MonthColumn;
}

/**
 * Panel 1 (SPEC §16.1): the last few calendar months side by side, by parent
 * category, each month with its change against the month before. Pure over
 * the window's lines; the view layer decides which dates to query (from the
 * oldest month's first day through today). Defaults to three months, so two
 * complete months always compare even while the current month is days old.
 */
export function compareCalendarMonths(
  lines: readonly SpendingLineInput[],
  today: string,
  options: { months?: number } = {},
): MonthComparison {
  checkedLocalDate(today);
  const count = Math.min(Math.max(options.months ?? COMPARED_MONTHS, 2), 24);
  const monthRefs: MonthRef[] = [];
  for (let back = count - 1; back >= 0; back -= 1) {
    monthRefs.push(monthOfLocalDate(addMonthsClamped(firstOfLocalMonth(today), -back)));
  }
  const summaries = monthRefs.map((ref) => {
    const range = monthRange(ref);
    return summarizeSpending(lines, range.from, range.to);
  });

  const months: MonthColumn[] = monthRefs.map((ref, index) => {
    const summary = summaries[index] as SpendingSummary;
    return {
      month: ref,
      label: formatMonthLabel(ref),
      inProgress: index === count - 1 && today < lastOfLocalMonth(today),
      summary,
      deltaPence:
        index === 0
          ? null
          : summary.totalPence - (summaries[index - 1] as SpendingSummary).totalPence,
    };
  });

  const parentNames = new Set<string>();
  const perMonth = summaries.map((summary) => {
    const map = new Map(summary.byParent.map((entry) => [entry.parent, entry.amountPence]));
    for (const entry of summary.byParent) parentNames.add(entry.parent);
    return map;
  });
  const byParent: MonthParentRow[] = [...parentNames]
    .sort((a, b) => a.localeCompare(b))
    .map((parent) => {
      const amountsPence = perMonth.map((map) => map.get(parent) ?? 0);
      return {
        parent,
        amountsPence,
        deltasPence: amountsPence.map((amount, index) =>
          index === 0 ? null : amount - (amountsPence[index - 1] as number),
        ),
      };
    });

  return {
    today,
    months,
    byParent,
    current: months[count - 1] as MonthColumn,
    previous: months[count - 2] as MonthColumn,
  };
}

export interface PersonRef {
  id: number;
  label: string;
}

/** One person's for-person spending for a window (SPEC §16.2). */
export interface PersonSpend {
  personId: number;
  person: string;
  totalPence: number;
  byParent: ParentSum[];
}

/**
 * Panel 2 (SPEC §16.2): each person's for-person allocations, side by side,
 * per month. Only lines with a person target are attributed — household
 * allocations are NEVER attributed to whoever happened to pay, and vehicle
 * lines stay with the vehicle (SPEC §13). A person with no for-person lines
 * in the window is still listed (an honest zero, not a missing person).
 */
export function personalSpending(
  lines: readonly SpendingLineInput[],
  people: readonly PersonRef[],
  from: string,
  to: string,
): PersonSpend[] {
  checkedLocalDate(from);
  checkedLocalDate(to);
  const groups = new Map<
    number,
    { amountPence: number; parents: Map<string, Map<string, number>> }
  >();
  for (const line of lines) {
    if (line.targetKind !== 'person' || line.targetId === null) continue;
    if (line.occurredDate < from || line.occurredDate > to) continue;
    const group = groups.get(line.targetId) ?? { amountPence: 0, parents: new Map() };
    group.amountPence += line.amountPence;
    const parent = group.parents.get(line.parentName) ?? new Map<string, number>();
    parent.set(line.childName, (parent.get(line.childName) ?? 0) + line.amountPence);
    group.parents.set(line.parentName, parent);
    groups.set(line.targetId, group);
  }
  return people.map((person) => {
    const group = groups.get(person.id);
    return {
      personId: person.id,
      person: person.label,
      totalPence: group?.amountPence ?? 0,
      byParent: group
        ? [...group.parents.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([parent, children]) => ({
              parent,
              amountPence: [...children.values()].reduce((sum, value) => sum + value, 0),
              children: [...children.entries()]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([child, amountPence]) => ({ child, amountPence })),
            }))
        : [],
    };
  });
}

export interface VehicleRef {
  id: number;
  label: string;
}

/** Per-vehicle running costs for the current view (SPEC §16.3). */
export interface VehicleCosts {
  vehicleId: number;
  label: string;
  /**
   * Current calendar month (partial until month end — labelled in the UI). An
   * annual payment contributes its ÷ 12 share to each month it covers (decision 190).
   */
  monthPence: number;
  previousMonthPence: number;
  /**
   * Twelve calendar months including the (partial) current one: from the
   * first day of (current month − 11) through today. "Everything Vehicle A
   * cost us" — fuel, insurance, maintenance, road tax, parking (SPEC §13).
   */
  rolling12Pence: number;
  rolling12From: string;
  /** The part of rolling12Pence that comes from annual payments spread ÷ 12 (decision 190). */
  annualSpreadPence: number;
  /** By child category over the rolling window (fuel/insurance/…). */
  byChild: Array<{
    categoryId: number;
    parent: string;
    child: string;
    amountPence: number;
    /** The part of amountPence that comes from annual payments spread ÷ 12 (decision 190). */
    spreadPence: number;
  }>;
}

/**
 * Spread one payment evenly over the calendar months it covers, starting in its
 * own month (decision 190). A monthly payment or ordinary purchase covers one
 * month and comes back unchanged. For an annual payment, `amountPence / months`
 * may not divide exactly, so the leftover pence go one each to the earliest
 * months: the pieces always sum to the original amount. Each piece is dated on
 * the first of its month, so the month and window rules treat it exactly as they
 * treat a purchase. A piece dated after `today` falls outside every window.
 */
export function spreadOverCoverMonths(line: SpendingLineInput): SpendingLineInput[] {
  const months = line.coversMonths ?? 1;
  if (!Number.isInteger(months) || months < 1 || months > ANNUAL_COVER_MONTHS) {
    throw new Error(
      `Expected a payment covering 1–${ANNUAL_COVER_MONTHS} months, received ${months}`,
    );
  }
  if (months === 1) return [line];
  const base = Math.floor(line.amountPence / months);
  const leftover = line.amountPence - base * months; // 0 ≤ leftover < months
  const first = firstOfLocalMonth(line.occurredDate);
  return Array.from({ length: months }, (_, index) => ({
    ...line,
    occurredDate: addMonthsClamped(first, index),
    amountPence: index < leftover ? base + 1 : base,
    coversMonths: 1,
  }));
}

/**
 * Panel 3 (SPEC §16.3, §13): per-vehicle monthly totals and the rolling
 * 12-month total, by child category. Costs stay with the vehicle regardless
 * of who paid or drove; only lines whose target is the vehicle count.
 *
 * An annual payment (a yearly premium, say) is shown as ÷ 12 in each of the
 * twelve months it covers, from its payment month (decision 190). That makes it
 * comparable with a monthly direct debit. The spread is derived here and never
 * stored: the schedule and the purchase still record the single payment on its
 * date, and cash-basis views never see it.
 */
export function vehicleRunningCosts(
  lines: readonly SpendingLineInput[],
  vehicles: readonly VehicleRef[],
  today: string,
): VehicleCosts[] {
  checkedLocalDate(today);
  const current = monthOfLocalDate(today);
  const previous = previousLocalMonth(today);
  const currentRange = monthRange(current);
  const previousRange = monthRange(previous);
  const rolling12From = addMonthsClamped(firstOfLocalMonth(today), -11);

  const inRange = (line: SpendingLineInput, from: string, to: string): boolean =>
    line.occurredDate >= from && line.occurredDate <= to;

  return vehicles.map((vehicle) => {
    // Each piece remembers whether it came from an annual payment, so the
    // spread can be reported separately from the rest.
    const mine = lines
      .filter((line) => line.targetKind === 'vehicle' && line.targetId === vehicle.id)
      .flatMap((line) => {
        const annual = (line.coversMonths ?? 1) > 1;
        return spreadOverCoverMonths(line).map((piece) => ({ piece, annual }));
      });
    const sumOf = (entries: readonly { piece: SpendingLineInput }[]): number =>
      entries.reduce((sum, entry) => sum + entry.piece.amountPence, 0);
    const inMonth = (range: { from: string; to: string }) =>
      mine.filter((entry) => inRange(entry.piece, range.from, range.to));
    const rollingEntries = mine.filter((entry) => inRange(entry.piece, rolling12From, today));
    const byChild = new Map<
      number,
      {
        categoryId: number;
        parent: string;
        child: string;
        amountPence: number;
        spreadPence: number;
      }
    >();
    for (const { piece, annual } of rollingEntries) {
      const entry = byChild.get(piece.categoryId) ?? {
        categoryId: piece.categoryId,
        parent: piece.parentName,
        child: piece.childName,
        amountPence: 0,
        spreadPence: 0,
      };
      entry.amountPence += piece.amountPence;
      if (annual) entry.spreadPence += piece.amountPence;
      byChild.set(piece.categoryId, entry);
    }
    return {
      vehicleId: vehicle.id,
      label: vehicle.label,
      monthPence: sumOf(inMonth(currentRange)),
      previousMonthPence: sumOf(inMonth(previousRange)),
      rolling12Pence: sumOf(rollingEntries),
      rolling12From,
      annualSpreadPence: sumOf(rollingEntries.filter((entry) => entry.annual)),
      byChild: [...byChild.values()].sort(
        (a, b) => a.parent.localeCompare(b.parent) || a.child.localeCompare(b.child),
      ),
    };
  });
}

export interface HonestyFuelConfig {
  vehicleId: number;
  label: string;
  configuredPence: number | null;
}

export interface HonestyConfig {
  /** SPEC §7.3 configured weekly groceries; null = not configured yet. */
  weeklyGroceriesPence: number | null;
  /** SPEC §7.3 configured monthly fuel per vehicle; null = not configured. */
  monthlyFuelPence: readonly HonestyFuelConfig[];
}

export interface GroceriesWeek {
  weekStart: string; // Monday (local)
  weekEnd: string; // Sunday (local)
  actualPence: number;
}

export interface HonestyGroceries {
  parent: string;
  /**
   * Up to 8 COMPLETE Monday–Sunday weeks, oldest first, all on or after
   * `recordedFrom`. Fewer (or none) while recording is young.
   */
  weeks: GroceriesWeek[];
  /** The first date anything was recorded; weeks before it are not counted. */
  recordedFrom: string;
  /**
   * Mean per-week actual over `weeks` (empty recorded weeks included, as zero
   * weeks; weeks before recording began excluded). Zero when there are none.
   */
  averageWeeklyPence: number;
  configuredPence: number | null;
  /** averageWeeklyPence − configuredPence; null when nothing is configured. */
  driftPence: number | null;
}

export interface HonestyFuelMonth {
  month: string; // 'YYYY-MM' of the COMPLETE calendar month
  from: string;
  to: string;
  actualPence: number;
}

export interface HonestyFuel {
  vehicleId: number;
  label: string;
  /**
   * Up to `months` COMPLETE calendar months, oldest first, all containing or
   * following the recording date (the first month may be only part recorded).
   * Fewer (or none) while recording is young.
   */
  months: HonestyFuelMonth[];
  averageMonthlyPence: number;
  configuredPence: number | null;
  driftPence: number | null;
}

export interface HonestyLoop {
  today: string;
  groceries: HonestyGroceries;
  fuel: HonestyFuel[];
}

/**
 * A week was recorded in full when it begins on or after the recording date
 * (`recordedFrom`, the first recorded purchase — decision 183). A week that
 * starts before it was not recorded, so it is neither a zero week nor a full
 * one, and it is kept out of every average. Null means recording has always
 * been on.
 */
export function isRecordedWeek(weekStart: string, recordedFrom: string | null): boolean {
  return recordedFrom === null || weekStart >= recordedFrom;
}

/**
 * A calendar month counts for the fuel comparison when it contains or follows
 * the recording date, so the first, part-recorded month is counted (the
 * household's choice, decision 184). Months that ended before recording began
 * are left out.
 */
export function isRecordedMonth(monthEnd: string, recordedFrom: string | null): boolean {
  return recordedFrom === null || monthEnd >= recordedFrom;
}

/** The Monday (local) starting the week that contains `date`. */
export function startOfWeekLocal(date: string): string {
  const d = checkedLocalDate(date);
  const dayOfWeek = new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay(); // 0 = Sunday
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  return addDaysLocal(date, -daysSinceMonday);
}

/**
 * Panel 4 — the projection honesty loop (SPEC §7.3, §16.4): configured
 * weekly groceries and per-vehicle monthly fuel vs recent actuals, so drift
 * is visible and the config can be corrected from Settings.
 *
 * Windows are complete periods only — the partial current week/month is
 * excluded, so the comparison never mixes a 3-day week with a 7-day one:
 * - groceries: the last 8 complete Monday–Sunday weeks, counting only weeks
 *   on or after `recordedFrom` (decision 183). Weeks before recording began
 *   are not zero weeks and are not averaged in;
 * - fuel (per vehicle): the last 3 complete calendar months that contain or
 *   follow `recordedFrom` (decision 184 — the first month may be part recorded);
 *
 * Actuals are NET signed spending in the tracked categories (Groceries
 * parent for groceries; Vehicle Running / Fuel lines targeted at the
 * vehicle for fuel), so refunds net off honestly. Averages round once,
 * half-up, at the period level (SPEC §6) — no floating-point money.
 */
export function computeHonestyLoop(
  lines: readonly SpendingLineInput[],
  config: HonestyConfig,
  today: string,
  options: { weeks?: number; months?: number; recordedFrom: string },
): HonestyLoop {
  checkedLocalDate(today);
  const weekCount = Math.min(Math.max(options.weeks ?? 8, 1), 52);
  const monthCount = Math.min(Math.max(options.months ?? 3, 1), 24);
  const recordedFrom = options.recordedFrom;

  const thisMonday = startOfWeekLocal(today);
  const groceryLines = lines.filter((line) => line.parentName === GROCERIES_PARENT);
  const weeks: GroceriesWeek[] = [];
  for (let i = weekCount; i >= 1; i -= 1) {
    const weekStart = addDaysLocal(thisMonday, -7 * i);
    // Before recording began is not a zero week: leave it out entirely.
    if (!isRecordedWeek(weekStart, recordedFrom)) continue;
    const weekEnd = addDaysLocal(weekStart, 6);
    const actualPence = groceryLines
      .filter((line) => line.occurredDate >= weekStart && line.occurredDate <= weekEnd)
      .reduce((sum, line) => sum + line.amountPence, 0);
    weeks.push({ weekStart, weekEnd, actualPence });
  }
  const groceryTotal = weeks.reduce((sum, week) => sum + week.actualPence, 0);
  const averageWeeklyPence = weeks.length === 0 ? 0 : roundHalfUpDivide(groceryTotal, weeks.length);
  // No recorded complete week means no average to compare against.
  const groceryDrift =
    config.weeklyGroceriesPence === null || weeks.length === 0
      ? null
      : averageWeeklyPence - config.weeklyGroceriesPence;

  const firstOfCurrent = firstOfLocalMonth(today);
  const fuel: HonestyFuel[] = config.monthlyFuelPence.map((vehicle) => {
    const fuelLines = lines.filter(
      (line) =>
        line.childName === FUEL_CHILD &&
        line.targetKind === 'vehicle' &&
        line.targetId === vehicle.vehicleId,
    );
    const months: HonestyFuelMonth[] = [];
    for (let k = monthCount; k >= 1; k -= 1) {
      const monthStart = addMonthsClamped(firstOfCurrent, -k);
      const { from, to } = monthRange(monthOfLocalDate(monthStart));
      // A month that ended before recording began is not a zero month: leave it out.
      if (!isRecordedMonth(to, recordedFrom)) continue;
      const actualPence = fuelLines
        .filter((line) => line.occurredDate >= from && line.occurredDate <= to)
        .reduce((sum, line) => sum + line.amountPence, 0);
      months.push({ month: `${from.slice(0, 4)}-${from.slice(5, 7)}`, from, to, actualPence });
    }
    const total = months.reduce((sum, entry) => sum + entry.actualPence, 0);
    // Averaged over the recorded months only; none recorded means no average.
    const averageMonthlyPence = months.length === 0 ? 0 : roundHalfUpDivide(total, months.length);
    const driftPence =
      vehicle.configuredPence === null || months.length === 0
        ? null
        : averageMonthlyPence - vehicle.configuredPence;
    return {
      vehicleId: vehicle.vehicleId,
      label: vehicle.label,
      months,
      averageMonthlyPence,
      configuredPence: vehicle.configuredPence,
      driftPence,
    };
  });

  return {
    today,
    groceries: {
      parent: GROCERIES_PARENT,
      weeks,
      recordedFrom,
      averageWeeklyPence,
      configuredPence: config.weeklyGroceriesPence,
      driftPence: groceryDrift,
    },
    fuel,
  };
}

/* ------------------------------------------------------------------ */
/* Honesty verdicts — the tolerance band (issue #27, decision 211)     */
/* ------------------------------------------------------------------ */

/**
 * Drift within −15%…+10% of the configured figure reads as normal life, not
 * a failing: the household asked for a gentler loop, with stronger wording
 * only once the drift leaves this band (SPEC §16.4).
 */
export const HONESTY_TOLERANCE_UNDER_PCT = 15;
export const HONESTY_TOLERANCE_OVER_PCT = 10;

/** Where a drift reading sits against the tolerance band. */
export type HonestyBand = 'within-tolerance' | 'above-tolerance' | 'below-tolerance';

/**
 * Which tolerance band a drift reading falls in. The band edges test the
 * EXACT ratio, not the rounded percent the sentence shows: +10.4% is
 * already above the band even though it displays as "10% over". A null
 * drift (nothing configured) has no band; a zero configured figure cannot
 * take a percentage, so any drift there is out of band on its own side.
 */
export function honestyBand(
  driftPence: number | null,
  configuredPence: number | null,
): HonestyBand | null {
  if (driftPence === null || configuredPence === null) return null;
  if (configuredPence <= 0) {
    if (driftPence === 0) return 'within-tolerance';
    return driftPence > 0 ? 'above-tolerance' : 'below-tolerance';
  }
  const ratio = driftPence / configuredPence;
  if (ratio > HONESTY_TOLERANCE_OVER_PCT / 100) return 'above-tolerance';
  if (ratio < -HONESTY_TOLERANCE_UNDER_PCT / 100) return 'below-tolerance';
  return 'within-tolerance';
}

/**
 * The drift as a whole signed percent of the configured figure, rounded
 * half-up, for the verdict sentence ("12% over"). Null when there is no
 * configured figure to measure against (null or zero), in which case the
 * sentence shows pounds only.
 */
export function honestyDriftPercent(
  driftPence: number,
  configuredPence: number | null,
): number | null {
  if (configuredPence === null || configuredPence <= 0) return null;
  return roundHalfUpDivide(driftPence * 100, configuredPence);
}
