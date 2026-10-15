import { getSpendingPresets, type SpendingPresets, type SpendingPreset } from './spending-presets';
import { and, eq, gte, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { allocations, categories, purchases, schedules, suppliers } from '../db/schema';
import { toLocalDateString } from '../time';
import { addDaysLocal, addMonthsClamped } from './dates';
import { categoryTree, findParentCategory } from './categories';
import {
  commitmentSeries,
  forecastSeries,
  groceriesSeries,
  personalSpendSeries,
  type ChartSpendingLine,
  type CommitmentSeries,
  type ForecastSeries,
  type GroceriesSeries,
  type PersonalSeries,
} from './chart-series';
import { firstOfLocalMonth, startOfWeekLocal, GROCERIES_PARENT, type PersonRef } from './insights';
import { ensureScheduleState, getHorizonProjectionView, recentPaydayDates } from './money-view';
import { getMonthComparisonView } from './insights-view';
import { spendingMix, type MixLine, type SpendingMix } from './spending-mix';
import { listVehicles } from './vehicles';
import { firstRecordedPurchaseDate } from './recording';
import { listPeople } from './people';
import { getCommitmentCategoryIds, getWeeklyGroceriesPence } from './settings';

/**
 * The DB assembly layer for the Charts page (docs/SPEC.md §16.7, v0.14.0).
 *
 * Same shape and same discipline as `insights-view.ts`: every read runs the
 * lazy due pass first (a converted schedule purchase is ordinary spending
 * and belongs in its month), then hands flat typed rows to the pure
 * resolvers in `chart-series.ts`. **No arithmetic lives here** — which is
 * what lets `tests/charts-view.test.ts` sum `listPurchases` independently
 * and demand the same figures, and what keeps `/charts` and `/insights`
 * telling the same story.
 *
 * Transfers never reach a chart (SPEC §10) and income is not spending
 * (SPEC §6): the join over `allocations` enforces both by construction.
 */

/**
 * Parent categories the personal chart's Household series treats as
 * discretionary (§16.7 C). A person's series counts every line marked for
 * them, whatever its parent (issue #25) — only the household column keeps
 * this scope.
 */
export const PERSONAL_PARENTS = ['Personal', 'Entertainment & Eating Out'] as const;

/* ------------------------------------------------------------------ */
/* A. Forecast                                                         */
/* ------------------------------------------------------------------ */

export interface ForecastDayDetail {
  date: string;
  commitments: Array<{ name: string; amountPence: number; potLabel: string }>;
  receipts: Array<{ name: string; amountPence: number; potLabel: string; expected: boolean }>;
  dayToDay: Array<{ name: string; amountPence: number }>;
}

export interface ForecastChartView {
  asOf: Date;
  today: string;
  throughDate: string;
  series: ForecastSeries;
  /** Which pots carry an overdraft, and their combined room. */
  overdraftPots: Array<{ label: string; limitPence: number }>;
  overdraftLabel: string | null;
  /** What lands on each day that has anything — the laptop drill-down. */
  details: ForecastDayDetail[];
  /** True when no pot has a checkpoint, so there is nothing honest to draw. */
  unavailable: boolean;
}

/**
 * Liquid bank-and-cash funds from today to one month ahead (decision 152: no
 * per-pot lines — the per-pot question is answered by the pot watch on
 * /overview, and one line stays readable at 320px). Card liabilities remain
 * in the separate household net total, not this forecast.
 *
 * Today's point is the reported liquid estimate; every later point is
 * projected from liquid-pot schedules and the day-to-day model. Empty
 * `potIds` selects every bank and cash pot.
 */
export function getForecastChartView(db: Db, nowArg?: Date): ForecastChartView {
  const now = nowArg ?? new Date();
  const today = toLocalDateString(now);
  const throughDate = addMonthsClamped(today, 1);
  const view = getHorizonProjectionView(db, throughDate, [], true, now);

  const overdraftPots = view.selection
    .filter(
      (entry) =>
        entry.selected && entry.pot.kind === 'bank' && entry.pot.overdraftLimitPence !== null,
    )
    .map((entry) => ({
      label: entry.pot.label,
      limitPence: entry.pot.overdraftLimitPence as number,
    }));
  const overdraftTotal = overdraftPots.reduce((sum, pot) => sum + pot.limitPence, 0);
  const overdraftLabel =
    overdraftPots.length === 0
      ? null
      : overdraftPots.length === 1
        ? `${(overdraftPots[0] as { label: string }).label} overdraft limit`
        : `Overdraft room across ${overdraftPots.length} pots`;

  const series = forecastSeries({
    today,
    availableNowPence: view.availableNowPence,
    perDay: view.result.perDay,
    overdraftLimitPence: overdraftTotal > 0 ? overdraftTotal : null,
    warningThresholdPence: view.result.warningThresholdPence,
  });

  const byDate = new Map<string, ForecastDayDetail>();
  const detailFor = (date: string): ForecastDayDetail => {
    const existing = byDate.get(date);
    if (existing !== undefined) return existing;
    const created: ForecastDayDetail = { date, commitments: [], receipts: [], dayToDay: [] };
    byDate.set(date, created);
    return created;
  };
  for (const line of view.commitmentLines) {
    detailFor(line.dueDate).commitments.push({
      name: line.name,
      amountPence: line.amountPence,
      potLabel: line.potLabel,
    });
  }
  for (const line of view.receiptLines) {
    detailFor(line.dueDate).receipts.push({
      name: line.name,
      amountPence: line.amountPence,
      potLabel: line.potLabel,
      expected: line.expected,
    });
  }
  for (const event of view.dayToDayEvents) {
    detailFor(event.dueDate).dayToDay.push({ name: event.name, amountPence: event.amountPence });
  }

  return {
    asOf: now,
    today,
    throughDate,
    series,
    overdraftPots,
    overdraftLabel,
    details: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
    unavailable: !view.hasSelectedCheckpoint,
  };
}

/* ------------------------------------------------------------------ */
/* B. Groceries                                                        */
/* ------------------------------------------------------------------ */

export interface GroceriesChartView {
  today: string;
  /** Last 12 Monday–Sunday weeks. */
  phone: GroceriesSeries;
  /** Last 26 Monday–Sunday weeks. */
  laptop: GroceriesSeries;
  parentName: string;
  /** The Groceries parent id — the drill-down link's category filter. */
  parentCategoryId: number | null;
  configuredWeeklyPence: number | null;
  /**
   * The first date anything was recorded (SPEC §16.7 B). Weeks before it are
   * not counted in the average. Null while nothing has been recorded yet.
   */
  recordingStartedOn: string | null;
}

export interface GroceriesChartOptions {
  phoneWeeks?: number;
  laptopWeeks?: number;
}

export function getGroceriesChartView(
  db: Db,
  options: GroceriesChartOptions = {},
  nowArg?: Date,
): GroceriesChartView {
  const now = nowArg ?? new Date();
  ensureScheduleState(db, now);
  const today = toLocalDateString(now);
  const phoneWeeks = options.phoneWeeks ?? 12;
  const laptopWeeks = options.laptopWeeks ?? 26;
  const windowFrom = startOfWeekLocal(
    addDaysLocal(today, -7 * (Math.max(phoneWeeks, laptopWeeks) - 1)),
  );
  const lines = chartSpendingLines(db, windowFrom, today).filter(
    (line) => line.parentName === GROCERIES_PARENT,
  );
  const configuredWeeklyPence = getWeeklyGroceriesPence(db);
  const parent = findParentCategory(db, GROCERIES_PARENT);
  const recordingStartedOn = firstRecordedPurchaseDate(db);
  // Nothing recorded yet: no complete week can have been recorded, so `today`
  // (which no complete week reaches) is the honest stand-in.
  const recordedFrom = recordingStartedOn ?? today;
  return {
    today,
    phone: groceriesSeries(lines, {
      today,
      weeks: phoneWeeks,
      configuredWeeklyPence,
      recordedFrom,
    }),
    laptop: groceriesSeries(lines, {
      today,
      weeks: laptopWeeks,
      configuredWeeklyPence,
      recordedFrom,
    }),
    parentName: GROCERIES_PARENT,
    parentCategoryId: parent?.id ?? null,
    configuredWeeklyPence,
    recordingStartedOn,
  };
}

/* ------------------------------------------------------------------ */
/* C. Personal spending                                                */
/* ------------------------------------------------------------------ */

export interface PersonalChartView {
  today: string;
  /** Everyone in the household, chips included, whatever the filter says. */
  people: Array<{ id: number; label: string }>;
  /** Last 6 calendar months. */
  phone: PersonalSeries;
  /** Last 12 calendar months. */
  laptop: PersonalSeries;
  /** Parent ids in scope — the household drill-down link's category filter. */
  parentCategoryIds: number[];
  parentNames: string[];
  /** Children in scope for the Household series (they come from the live tree). */
  childNames: string[];
}

export interface PersonalChartOptions {
  phoneMonths?: number;
  laptopMonths?: number;
  /** Series keys the filter chips have left switched on. */
  include?: readonly string[];
}

/**
 * Spending per person per month, plus the Household series. A person's
 * series counts every line marked for them, whatever its category (issue
 * #25, decision 209) — the lines below are deliberately NOT pre-filtered to
 * the discretionary parents; the engine scopes only the Household series.
 * That scope is the two parent categories, resolved from the **live** tree
 * rather than a hard-coded list of children (decision 154): the tree is
 * user-editable, so a new child under Personal is in scope the day it is
 * created — and a household-marked line such as a shared subscription lands
 * in the Household series, exactly as the household asked, without anything
 * being hard-coded.
 */
export function getPersonalChartView(
  db: Db,
  options: PersonalChartOptions = {},
  nowArg?: Date,
): PersonalChartView {
  const now = nowArg ?? new Date();
  ensureScheduleState(db, now);
  const today = toLocalDateString(now);
  const phoneMonths = options.phoneMonths ?? 6;
  const laptopMonths = options.laptopMonths ?? 12;
  const windowFrom = addMonthsClamped(
    firstOfLocalMonth(today),
    -(Math.max(phoneMonths, laptopMonths) - 1),
  );
  const parentNames: string[] = [...PERSONAL_PARENTS];
  // No parent pre-filter: a person's series counts their lines wherever they
  // sit, and the engine applies the parent scope to the Household series
  // itself (issue #25). Filtering here would silently re-impose the old
  // person scope the household just asked to lift.
  const lines = chartSpendingLines(db, windowFrom, today);
  const people = listPeople(db).map((person) => ({ id: person.id, label: person.label }));
  const tree = categoryTree(db).filter((parent) => parentNames.includes(parent.name));
  const include = options.include;
  return {
    today,
    phone: personalSpendSeries(lines, people, {
      today,
      months: phoneMonths,
      parentNames,
      include,
    }),
    laptop: personalSpendSeries(lines, people, {
      today,
      months: laptopMonths,
      parentNames,
      include,
    }),
    people,
    parentCategoryIds: tree.map((parent) => parent.id),
    parentNames,
    childNames: tree.flatMap((parent) =>
      parent.children.filter((child) => child.retiredAt === null).map((child) => child.name),
    ),
  };
}

/* ------------------------------------------------------------------ */
/* D. Fixed commitments                                                */
/* ------------------------------------------------------------------ */

export interface CommitmentTracking {
  categoryIds: number[];
  /** 'configured' = ticked in Settings; 'schedules' = the useful default. */
  source: 'configured' | 'schedules';
}

/** Child categories already used by a direct debit or standing order. */
export function scheduleCommitmentCategoryIds(db: Db): number[] {
  const rows = db
    .select({ categoryId: schedules.categoryId })
    .from(schedules)
    .where(and(isNotNull(schedules.categoryId), sql`${schedules.kind} in ('dd','so')`))
    .all();
  return [
    ...new Set(rows.flatMap((row) => (row.categoryId === null ? [] : [row.categoryId]))),
  ].sort((a, b) => a - b);
}

/**
 * What the chart tracks today: the household's ticked set when they have
 * saved one, otherwise the children already used by schedules — so the
 * chart says something true on first open, before anyone visits Settings.
 */
export function effectiveCommitmentCategoryIds(db: Db): CommitmentTracking {
  const configured = getCommitmentCategoryIds(db);
  if (configured !== null) return { categoryIds: configured, source: 'configured' };
  return { categoryIds: scheduleCommitmentCategoryIds(db), source: 'schedules' };
}

export interface CommitmentCategoryChoice {
  id: number;
  name: string;
  ticked: boolean;
  usedBySchedule: boolean;
  retired: boolean;
}

export interface CommitmentCategoryGroup {
  parentId: number;
  parent: string;
  children: CommitmentCategoryChoice[];
}

export interface CommitmentCategoryPicker {
  groups: CommitmentCategoryGroup[];
  source: 'configured' | 'schedules';
  tickedCount: number;
}

/** The Settings checkbox list: every child, grouped by parent, pre-ticked. */
export function getCommitmentCategoryPicker(
  db: Db,
  includeRetired = false,
): CommitmentCategoryPicker {
  const tracking = effectiveCommitmentCategoryIds(db);
  const ticked = new Set(tracking.categoryIds);
  const used = new Set(scheduleCommitmentCategoryIds(db));
  const groups = categoryTree(db)
    .map((parent) => ({
      parentId: parent.id,
      parent: parent.name,
      children: parent.children
        .filter(
          (child) =>
            includeRetired ||
            child.retiredAt === null ||
            ticked.has(child.id) ||
            used.has(child.id),
        )
        .map((child) => ({
          id: child.id,
          name: child.name,
          ticked: ticked.has(child.id),
          usedBySchedule: used.has(child.id),
          retired: child.retiredAt !== null,
        })),
    }))
    .filter((group) => group.children.length > 0);
  return { groups, source: tracking.source, tickedCount: ticked.size };
}

export interface CommitmentChartView {
  today: string;
  series: CommitmentSeries;
  tracking: CommitmentTracking;
  scheduleOnly: boolean;
  /** Tracked categories with their names, for the laptop list. */
  trackedCategories: Array<{ id: number; parent: string; child: string; retired: boolean }>;
}

export interface CommitmentChartOptions {
  categoryIds?: number[];
  months?: number;
  scheduleOnly?: boolean;
}

export function getCommitmentChartView(
  db: Db,
  options: CommitmentChartOptions = {},
  nowArg?: Date,
): CommitmentChartView {
  const now = nowArg ?? new Date();
  ensureScheduleState(db, now);
  const today = toLocalDateString(now);
  const months = options.months ?? 12;
  const scheduleOnly = options.scheduleOnly === true;
  const tracking: CommitmentTracking =
    options.categoryIds === undefined
      ? effectiveCommitmentCategoryIds(db)
      : { categoryIds: options.categoryIds, source: 'configured' };
  const windowFrom = addMonthsClamped(firstOfLocalMonth(today), -(months - 1));
  const lines = chartSpendingLines(db, windowFrom, today);
  const names = new Map(
    categoryTree(db).flatMap((parent) =>
      parent.children.map(
        (child) =>
          [
            child.id,
            { parent: parent.name, child: child.name, retired: child.retiredAt !== null },
          ] as const,
      ),
    ),
  );
  return {
    today,
    series: commitmentSeries(lines, {
      today,
      months,
      trackedCategoryIds: tracking.categoryIds,
      scheduleOnly,
    }),
    tracking,
    scheduleOnly,
    trackedCategories: tracking.categoryIds.map((id) => ({
      id,
      parent: names.get(id)?.parent ?? 'Unknown',
      child: names.get(id)?.child ?? `Category ${id}`,
      retired: names.get(id)?.retired ?? false,
    })),
  };
}

export interface SpendingTrendsView extends CommitmentChartView {
  presets: SpendingPresets;
  selectedPreset: SpendingPreset | null;
}

export function getSpendingTrendsView(db: Db, presetId?: string, now?: Date): SpendingTrendsView {
  const presets = getSpendingPresets(db);
  const selectedPreset =
    presets.presets.find((preset) => preset.id === presetId) ?? presets.presets[0] ?? null;
  return {
    ...getCommitmentChartView(db, { categoryIds: selectedPreset?.categoryIds ?? [] }, now),
    presets,
    selectedPreset,
  };
}

/* ------------------------------------------------------------------ */
/* The one query every chart reads                                     */
/* ------------------------------------------------------------------ */

/**
 * Non-void allocation lines whose purchase falls inside [from, to], with the
 * category parent/child names joined in and the schedule-converted flag
 * carried through (`purchases.scheduleInstanceId`). Allocations always point
 * at a leaf, so the parent join is total.
 */
export function chartSpendingLines(db: Db, from: string, to: string): ChartSpendingLine[] {
  const rows = db
    .select({
      occurredDate: purchases.occurredDate,
      categoryId: allocations.categoryId,
      childName: categories.name,
      parentName: sql<string>`(select p.name from categories p where p.id = ${categories.parentId})`,
      targetKind: allocations.targetKind,
      targetId: allocations.targetId,
      amountPence: allocations.amountPence,
      scheduleInstanceId: purchases.scheduleInstanceId,
    })
    .from(allocations)
    .innerJoin(purchases, eq(purchases.id, allocations.purchaseId))
    .innerJoin(categories, eq(categories.id, allocations.categoryId))
    .where(
      and(
        isNull(purchases.voidedAt),
        gte(purchases.occurredDate, from),
        lte(purchases.occurredDate, to),
      ),
    )
    .all();
  return rows.map((row) => ({
    occurredDate: row.occurredDate,
    categoryId: row.categoryId,
    parentName: row.parentName,
    childName: row.childName,
    targetKind: row.targetKind as 'household' | 'person' | 'vehicle',
    targetId: row.targetId,
    amountPence: row.amountPence,
    scheduleConverted: row.scheduleInstanceId !== null,
  }));
}

/* ------------------------------------------------------------------ */
/* E. Where the money went — the spending-mix pie                     */
/* ------------------------------------------------------------------ */

/**
 * The parent whose spending is split per person in the pie (§16.7 E). Only
 * Personal: Entertainment & Eating Out stays one slice, as the household asked.
 */
export const PIE_SPLIT_PARENTS = ['Personal'] as const;

export type MixWindowKind = 'payday' | 'previous-payday' | 'month' | 'custom';

export interface MixWindow {
  kind: MixWindowKind;
  from: string;
  to: string;
}

export interface MixChildChoice {
  id: number;
  name: string;
  retired: boolean;
}

export interface MixParentChoice {
  id: number;
  name: string;
  retired: boolean;
  children: MixChildChoice[];
}

export interface SpendingMixView {
  today: string;
  window: MixWindow;
  /**
   * The quick windows the selector links to (issue #24): since last payday,
   * the last full payday cycle, and month to date. None ends after today. The
   * payday ones are null when no payday is scheduled.
   */
  presets: {
    payday: MixWindow | null;
    previousPayday: MixWindow | null;
    month: MixWindow;
  };
  /** Plain words for why the window is what it is, when it is a fallback. */
  notice: string | null;
  parents: MixParentChoice[];
  /** Parent ids counted (parents with at least one counted child, or counted if childless). */
  includedParentIds: number[];
  /** Child (leaf) category ids counted. Every child unless the selector says otherwise. */
  includedCategoryIds: number[];
  allParentsIncluded: boolean;
  allCategoriesIncluded: boolean;
  mix: SpendingMix;
  /** Who or what a line was for: `person:3`, `vehicle:1`, `household`. */
  targetLabels: Map<string, string>;
  people: PersonRef[];
}

export interface SpendingMixOptions {
  /** Both bounds, or neither: a half-given window falls back to the default. */
  from?: string | null;
  to?: string | null;
  /**
   * Parent or child category ids to count. When a parent id is given without
   * any of its child ids, all of that parent's children are counted. Null (the
   * default) counts every category.
   */
  includedParentIds?: readonly number[] | null;
  /** Child category ids to count; merged with `includedParentIds` when given. */
  includedCategoryIds?: readonly number[] | null;
}

function isLocalDateText(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/**
 * The lines behind the pie: non-void allocation lines in [from, to] with
 * their parent id, purchase id, supplier and note. The same join as
 * `chartSpendingLines`, widened so a slice can show its own line items.
 */
export function spendingMixLines(db: Db, from: string, to: string): MixLine[] {
  const rows = db
    .select({
      occurredDate: purchases.occurredDate,
      purchaseId: purchases.id,
      supplierName: suppliers.name,
      note: purchases.note,
      categoryId: allocations.categoryId,
      childName: categories.name,
      parentId: categories.parentId,
      parentName: sql<string>`(select p.name from categories p where p.id = ${categories.parentId})`,
      targetKind: allocations.targetKind,
      targetId: allocations.targetId,
      amountPence: allocations.amountPence,
    })
    .from(allocations)
    .innerJoin(purchases, eq(purchases.id, allocations.purchaseId))
    .innerJoin(categories, eq(categories.id, allocations.categoryId))
    .leftJoin(suppliers, eq(suppliers.id, purchases.supplierId))
    .where(
      and(
        isNull(purchases.voidedAt),
        gte(purchases.occurredDate, from),
        lte(purchases.occurredDate, to),
      ),
    )
    .all();
  const lines: MixLine[] = [];
  for (const row of rows) {
    // Allocations always point at a leaf, so the parent is always present.
    if (row.parentId === null) continue;
    lines.push({
      occurredDate: row.occurredDate,
      categoryId: row.categoryId,
      parentId: row.parentId,
      parentName: row.parentName,
      childName: row.childName,
      targetKind: row.targetKind as 'household' | 'person' | 'vehicle',
      targetId: row.targetId,
      amountPence: row.amountPence,
      purchaseId: row.purchaseId,
      supplierName: row.supplierName ?? null,
      note: row.note ?? null,
    });
  }
  return lines;
}

/**
 * The selector's payday windows (issue #24). The pie counts money already
 * spent, never a projection, so no window runs past today:
 *
 * - **Since last payday** (`payday`) runs from the most recent payday up to
 *   today.
 * - **Last full payday cycle** (`previous-payday`) runs from the payday before
 *   that up to the day before the most recent one — a whole cycle, finished.
 *
 * The paydays come from `recentPaydayDates`, which works earlier paydays out
 * from the salary's cadence when the schedule is too new to have recorded
 * them, so the full cycle is offered from the first day. Both are null only
 * when no payday is scheduled at all.
 */
export function paydayCycleWindows(
  db: Db,
  today: string,
): { payday: MixWindow | null; previousPayday: MixWindow | null } {
  const [latest, previous] = recentPaydayDates(db, today, 2);
  if (latest === undefined) return { payday: null, previousPayday: null };
  const payday: MixWindow = { kind: 'payday', from: latest, to: today };
  const previousPayday: MixWindow | null =
    previous === undefined
      ? null
      : { kind: 'previous-payday', from: previous, to: addDaysLocal(latest, -1) };
  return { payday, previousPayday };
}

/**
 * Where the money went (§16.7 E). The default window is since last payday; a
 * custom window must have both bounds, run forwards and start no later than
 * today, and an end date after today is brought back to today — the chart
 * counts spending that has happened, not spending that is projected. Every
 * figure comes from `spendingMix`, the engine the Insights totals also read.
 */
export function getSpendingMixView(
  db: Db,
  options: SpendingMixOptions = {},
  nowArg?: Date,
): SpendingMixView {
  const now = nowArg ?? new Date();
  ensureScheduleState(db, now);
  const today = toLocalDateString(now);
  // Month to date: the 1st up to today, never the rest of the month.
  const month: MixWindow = { kind: 'month', from: firstOfLocalMonth(today), to: today };
  const cycles = paydayCycleWindows(db, today);

  let notice: string | null = null;
  let window: MixWindow;
  const askedFrom = options.from ?? null;
  const askedTo = options.to ?? null;
  if (askedFrom !== null || askedTo !== null) {
    if (
      askedFrom !== null &&
      askedTo !== null &&
      isLocalDateText(askedFrom) &&
      isLocalDateText(askedTo) &&
      askedFrom <= askedTo &&
      askedFrom <= today
    ) {
      const to = askedTo > today ? today : askedTo;
      if (askedTo > today) {
        notice =
          'This chart counts money already spent, so the window stops at today rather than the end date asked for.';
      }
      // A custom window with exactly a preset's dates is that preset, so its
      // button lights up whether it was pressed or typed.
      const presetMatch = [cycles.payday, cycles.previousPayday, month].find(
        (preset) => preset !== null && preset.from === askedFrom && preset.to === to,
      );
      window = presetMatch ?? { kind: 'custom', from: askedFrom, to };
    } else {
      window = cycles.payday ?? month;
      notice = 'Those dates were not a valid window, so the default window is shown.';
    }
  } else if (cycles.payday !== null) {
    window = cycles.payday;
  } else {
    window = month;
    notice =
      'No payday is scheduled yet, so this shows the month to date. Add the salary on the Money coming in page (/income) for payday windows.';
  }

  const parentTree = categoryTree(db);
  const parents: MixParentChoice[] = parentTree.map((parent) => ({
    id: parent.id,
    name: parent.name,
    retired: parent.retiredAt !== null,
    children: parent.children.map((child) => ({
      id: child.id,
      name: child.name,
      retired: child.retiredAt !== null,
    })),
  }));
  const allParentIds = parents.map((parent) => parent.id);
  const allChildIds = parents.flatMap((parent) => parent.children.map((child) => child.id));
  const hasSelection =
    (options.includedParentIds !== undefined && options.includedParentIds !== null) ||
    (options.includedCategoryIds !== undefined && options.includedCategoryIds !== null);

  let includedParentIds: number[];
  let includedCategoryIds: number[];
  if (!hasSelection) {
    includedParentIds = allParentIds;
    includedCategoryIds = allChildIds;
  } else {
    const requested = new Set<number>([
      ...(options.includedParentIds ?? []),
      ...(options.includedCategoryIds ?? []),
    ]);
    includedParentIds = [];
    includedCategoryIds = [];
    for (const parent of parents) {
      if (parent.children.length === 0) {
        if (requested.has(parent.id)) {
          includedParentIds.push(parent.id);
        }
        continue;
      }
      const matchingChildren = parent.children.filter((child) => requested.has(child.id));
      if (matchingChildren.length > 0) {
        includedParentIds.push(parent.id);
        for (const child of matchingChildren) {
          includedCategoryIds.push(child.id);
        }
      } else if (requested.has(parent.id)) {
        includedParentIds.push(parent.id);
        for (const child of parent.children) {
          includedCategoryIds.push(child.id);
        }
      }
    }
  }
  const allParentsIncluded = includedParentIds.length === allParentIds.length;
  const allCategoriesIncluded =
    allParentsIncluded && includedCategoryIds.length === allChildIds.length;

  const people = listPeople(db).map((person) => ({ id: person.id, label: person.label }));
  const lines = spendingMixLines(db, window.from, window.to);
  const mix = spendingMix(lines, {
    from: window.from,
    to: window.to,
    includedParentIds: allCategoriesIncluded ? null : new Set(includedParentIds),
    includedCategoryIds: allCategoriesIncluded ? null : new Set(includedCategoryIds),
    people,
    splitParents: parents
      .filter((parent) => (PIE_SPLIT_PARENTS as readonly string[]).includes(parent.name))
      .map((parent) => ({ id: parent.id, name: parent.name })),
  });

  const targetLabels = new Map<string, string>([['household', 'Household']]);
  for (const person of people) targetLabels.set(`person:${person.id}`, person.label);
  for (const vehicle of listVehicles(db)) targetLabels.set(`vehicle:${vehicle.id}`, vehicle.label);

  return {
    today,
    window,
    presets: { payday: cycles.payday, previousPayday: cycles.previousPayday, month },
    notice,
    parents,
    includedParentIds,
    includedCategoryIds,
    allParentsIncluded,
    allCategoriesIncluded,
    mix,
    targetLabels,
    people,
  };
}

/* ------------------------------------------------------------------ */
/* F. Three months by category                                         */
/* ------------------------------------------------------------------ */

/**
 * The parent category the exclude toggle takes out (§16.7 F). Housing is
 * resolved from the live tree by name — the same rule as PIE_SPLIT_PARENTS —
 * so a household that renamed or removed it simply sees no toggle.
 */
export const HEAVY_PARENT = 'Housing';

export interface CategoryMonthsMonth {
  label: string;
  from: string;
  /** Never past today: the figure counts recorded lines only. */
  to: string;
  /** False while the month is still running ("so far", drawn hatched). */
  complete: boolean;
}

export interface CategoryMonthsCategory {
  parentId: number;
  name: string;
  /** Net spending per month, aligned with `months` (oldest first). */
  amountsPence: number[];
  /** The months' total. */
  totalPence: number;
}

export interface CategoryMonthsView {
  today: string;
  /** The last three calendar months, oldest first. */
  months: CategoryMonthsMonth[];
  /** Categories by their total, largest first (the drawn order). */
  categories: CategoryMonthsCategory[];
  /** Total across the drawn categories and months. */
  totalPence: number;
  /** The Housing parent's id when the tree has one; the exclude toggle's scope. */
  heavyParentId: number | null;
  excludeHeavy: boolean;
}

/**
 * Three months by parent category (§16.7 F) — the month-comparison table
 * from `/insights`, drawn. It reads `getMonthComparisonView`, so the chart
 * and the table cannot disagree; the only addition is the parent ids (for
 * the bar links) and the exclude-Housing toggle (a category that dwarfs the
 * rest flattens every other bar).
 */
export function getCategoryMonthsView(
  db: Db,
  options: { excludeHeavy?: boolean } = {},
  nowArg?: Date,
): CategoryMonthsView {
  const comparison = getMonthComparisonView(db, nowArg);
  const parentIdByName = new Map<string, number>();
  for (const line of comparison.lines) parentIdByName.set(line.parentName, line.parentId);

  const heavyParent = findParentCategory(db, HEAVY_PARENT);
  const excludeHeavy = options.excludeHeavy === true && heavyParent !== null;

  const months: CategoryMonthsMonth[] = comparison.months.map((month) => ({
    label: month.label + (month.inProgress ? ' (so far)' : ''),
    from: month.summary.from,
    to: month.summary.to > comparison.today ? comparison.today : month.summary.to,
    complete: !month.inProgress,
  }));

  const categories: CategoryMonthsCategory[] = comparison.byParent
    .filter((row) => {
      if (!excludeHeavy || heavyParent === null) return true;
      return parentIdByName.get(row.parent) !== heavyParent.id;
    })
    .map((row) => ({
      parentId: parentIdByName.get(row.parent) ?? 0,
      name: row.parent,
      amountsPence: row.amountsPence,
      totalPence: row.amountsPence.reduce((sum, amount) => sum + amount, 0),
    }))
    .sort((a, b) => b.totalPence - a.totalPence || a.name.localeCompare(b.name));

  return {
    today: comparison.today,
    months,
    categories,
    totalPence: categories.reduce((sum, category) => sum + category.totalPence, 0),
    heavyParentId: heavyParent === null ? null : heavyParent.id,
    excludeHeavy,
  };
}
