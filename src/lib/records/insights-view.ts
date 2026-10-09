import { and, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { allocations, categories, purchases, scheduleInstances, schedules } from '../db/schema';
import { toLocalDateString } from '../time';
import { addMonthsClamped } from './dates';
import {
  ANNUAL_COVER_MONTHS,
  compareCalendarMonths,
  computeHonestyLoop,
  firstOfLocalMonth,
  formatMonthLabel,
  monthRange,
  monthOfLocalDate,
  previousLocalMonth,
  personalSpending,
  summarizeSpending,
  vehicleRunningCosts,
  type MonthComparison,
  type MonthRef,
  type PersonSpend,
  type SpendingLineInput,
  type SpendingSummary,
  type VehicleCosts,
  type HonestyLoop,
} from './insights';
import { listPeople } from './people';
import { listVehicles } from './vehicles';
import { firstRecordedPurchaseDate } from './recording';
import { getMonthlyFuelByVehicle, getWeeklyGroceriesPence } from './settings';
import { ensureScheduleState } from './money-view';

/**
 * The DB assembly layer for Insights v1 (docs/SPEC.md §16): every read runs
 * the lazy due pass first (converted schedule purchases are ordinary
 * spending and belong in the month), then maps non-void purchase allocation
 * lines to the flat typed rows the pure engine (insights.ts) consumes.
 *
 * Transfers never reach the engine (SPEC §10) and receipts never do (income
 * is not spending, SPEC §6) — the join over `allocations` enforces that by
 * construction. No arithmetic lives here: sums, windows and drifts are the
 * pure engine's, so the UI and the tests share one code path.
 */

export interface MonthComparisonView extends MonthComparison {
  /** This month, first day through today (Overview "month-to-date" bars). */
  monthToDate: SpendingSummary;
}

export function getMonthComparisonView(db: Db, nowArg?: Date): MonthComparisonView {
  const now = nowArg ?? new Date();
  ensureScheduleState(db, now);
  const today = toLocalDateString(now);
  // Window: previous month's first day through today (both months + MTD).
  const windowFrom = monthRange(previousLocalMonth(today)).from;
  const lines = spendingLinesBetween(db, windowFrom, today);
  const comparison = compareCalendarMonths(lines, today);
  const monthToDate = summarizeSpending(lines, firstOfLocalMonth(today), today);
  return { ...comparison, monthToDate };
}

export interface PersonalMonthView {
  month: MonthRef;
  label: string;
  people: PersonSpend[];
}

export function getPersonalMonthView(db: Db, ref: MonthRef, nowArg?: Date): PersonalMonthView {
  const now = nowArg ?? new Date();
  ensureScheduleState(db, now);
  const { from, to } = monthRange(ref);
  const lines = spendingLinesBetween(db, from, to);
  const people = listPeople(db);
  return {
    month: ref,
    label: formatMonthLabel(ref),
    people: personalSpending(lines, people, from, to),
  };
}

export function getVehicleCostsView(db: Db, nowArg?: Date): VehicleCosts[] {
  const now = nowArg ?? new Date();
  ensureScheduleState(db, now);
  const today = toLocalDateString(now);
  // The rolling window starts 11 months back (before the previous month). An
  // annual payment covers twelve months from its own month (decision 190), so
  // one made up to 22 months back can still reach the window: query that far.
  // Lines outside the window are dropped by the engine, so the wider read
  // changes no figure that is not spread.
  const windowFrom = addMonthsClamped(firstOfLocalMonth(today), -22);
  const lines = spendingLinesBetween(db, windowFrom, today);
  const vehicles = listVehicles(db);
  return vehicleRunningCosts(lines, vehicles, today);
}

export function getHonestyLoopView(db: Db, nowArg?: Date): HonestyLoop {
  const now = nowArg ?? new Date();
  ensureScheduleState(db, now);
  const today = toLocalDateString(now);
  // The fuel window reaches three full calendar months back; the 8-week
  // groceries window fits inside that, so one window covers both.
  const windowFrom = addMonthsClamped(firstOfLocalMonth(today), -3);
  const lines = spendingLinesBetween(db, windowFrom, today);
  const vehicles = listVehicles(db);
  const fuelByVehicle = getMonthlyFuelByVehicle(db);
  // Nothing recorded yet: no complete week can have been recorded, so `today`
  // is the honest stand-in (the same rule as the Charts card).
  const recordedFrom = firstRecordedPurchaseDate(db) ?? today;
  return computeHonestyLoop(
    lines,
    {
      weeklyGroceriesPence: getWeeklyGroceriesPence(db),
      monthlyFuelPence: vehicles.map((vehicle) => ({
        vehicleId: vehicle.id,
        label: vehicle.label,
        configuredPence: fuelByVehicle.get(vehicle.id) ?? null,
      })),
    },
    today,
    { recordedFrom },
  );
}

/**
 * Non-void allocation lines whose purchase's local date falls inside
 * [from, to] (inclusive), flattened to the engine's input shape with the
 * category parent/child names joined in. Allocations always point at leaf
 * categories, so the parent join is total.
 */
function spendingLinesBetween(db: Db, from: string, to: string): SpendingLineInput[] {
  const rows = db
    .select({
      occurredDate: purchases.occurredDate,
      categoryId: allocations.categoryId,
      childName: categories.name,
      // Parent name via correlated subquery (allocations always point at a
      // leaf, so the parent row always exists).
      parentName: sql<string>`(select p.name from categories p where p.id = ${categories.parentId})`,
      targetKind: allocations.targetKind,
      targetId: allocations.targetId,
      amountPence: allocations.amountPence,
      // Cadence of the schedule a converted payment came from, if any (decision 190).
      scheduleFrequency: schedules.frequency,
    })
    .from(allocations)
    .innerJoin(purchases, eq(purchases.id, allocations.purchaseId))
    .innerJoin(categories, eq(categories.id, allocations.categoryId))
    .leftJoin(scheduleInstances, eq(scheduleInstances.id, purchases.scheduleInstanceId))
    .leftJoin(schedules, eq(schedules.id, scheduleInstances.scheduleId))
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
    coversMonths: row.scheduleFrequency === 'annual' ? ANNUAL_COVER_MONTHS : 1,
  }));
}
