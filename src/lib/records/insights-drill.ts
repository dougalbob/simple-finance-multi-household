import { addMonthsClamped } from './dates';
import {
  firstOfLocalMonth,
  monthOfLocalDate,
  previousLocalMonth,
  monthRange,
  spreadOverCoverMonths,
  type SpendingLineInput,
} from './insights';

/**
 * The inline line-item drill-down behind the Insights figures (SPEC §16.1):
 * clicking a monthly total, a person's total or a vehicle figure opens the
 * transactions that the figure is made of, in place, as a real link
 * (`?show=…#panel-drill`) — so it works with JavaScript off and can be sent
 * to the other person, the same rule the Charts drill-downs keep (decision
 * 155).
 *
 * Pure and framework-free like the rest of the insights engine: it takes the
 * flat typed lines the DB assembly already read and returns the rows plus a
 * total that reconciles with the figure that was clicked. The only wrinkle is
 * the vehicle spread (decision 190): an annual payment counts as ÷ 12 in each
 * month it covers, so a vehicle row reports the amount that counts toward the
 * figure (its share) beside the payment as recorded, and is labelled
 * "(annual ÷ 12)".
 */

/** A spending line with the purchase it came from (for the line-item tables). */
export interface InsightLine extends SpendingLineInput {
  parentId: number;
  purchaseId: number;
  supplierName: string | null;
  note: string | null;
}

export type DrillSelection =
  /** A month-comparison figure: the whole month, or one parent category in it. */
  | { kind: 'month'; month: string; parentId: number | null }
  /** A "By person" figure: the person's month, or one parent category in it. */
  | { kind: 'person'; personId: number; month: string; parentId: number | null }
  /** A vehicle figure: this month, the previous month, or the rolling 12. */
  | {
      kind: 'vehicle';
      vehicleId: number;
      window: 'month' | 'previous' | 'rolling';
      childCategoryId: number | null;
    };

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

/** A positive integer id, or null for "no further scope". */
function parseId(raw: string | undefined): number | null {
  if (raw === undefined || raw === '') return null;
  if (!/^[1-9][0-9]*$/.test(raw)) return NaN;
  return Number(raw);
}

/**
 * The stable key for a drill selection, shared by the links and the `show=`
 * URL parameter — the same contract as `mixSliceKey` on the spending-mix pie.
 */
export function drillKey(selection: DrillSelection): string {
  switch (selection.kind) {
    case 'month':
      return selection.parentId === null
        ? `m:${selection.month}`
        : `m:${selection.month}:${selection.parentId}`;
    case 'person':
      return selection.parentId === null
        ? `p:${selection.personId}:${selection.month}`
        : `p:${selection.personId}:${selection.month}:${selection.parentId}`;
    case 'vehicle':
      return selection.childCategoryId === null
        ? `v:${selection.vehicleId}:${selection.window}`
        : `v:${selection.vehicleId}:${selection.window}:${selection.childCategoryId}`;
  }
}

/** Parse a `show=` value back into a selection; null when it is not one. */
export function parseDrillKey(raw: string | null | undefined): DrillSelection | null {
  if (typeof raw !== 'string' || raw === '') return null;
  const parts = raw.split(':');
  switch (parts[0]) {
    case 'm': {
      const month = parts[1];
      if (month === undefined || !MONTH_KEY.test(month)) return null;
      const parentId = parseId(parts[2]);
      if (Number.isNaN(parentId)) return null;
      return { kind: 'month', month, parentId };
    }
    case 'p': {
      const personId = parseId(parts[1]);
      const month = parts[2];
      if (Number.isNaN(personId) || personId === null) return null;
      if (month === undefined || !MONTH_KEY.test(month)) return null;
      const parentId = parseId(parts[3]);
      if (Number.isNaN(parentId)) return null;
      return { kind: 'person', personId, month, parentId };
    }
    case 'v': {
      const vehicleId = parseId(parts[1]);
      if (Number.isNaN(vehicleId) || vehicleId === null) return null;
      const window = parts[2];
      if (window !== 'month' && window !== 'previous' && window !== 'rolling') return null;
      const childCategoryId = parseId(parts[3]);
      if (Number.isNaN(childCategoryId)) return null;
      return { kind: 'vehicle', vehicleId, window, childCategoryId };
    }
    default:
      return null;
  }
}

/** One transaction behind a figure. */
export interface DrillRow {
  purchaseId: number;
  /** The payment's own date — even when a spread share counts in another month. */
  occurredDate: string;
  supplierName: string | null;
  note: string | null;
  parentName: string;
  childName: string;
  targetKind: 'household' | 'person' | 'vehicle';
  targetId: number | null;
  /** The amount that counts toward the figure clicked (÷ 12 shares for annual vehicle payments). */
  countedPence: number;
  /** The payment as recorded. Equals countedPence except for spread rows. */
  paidPence: number;
  /** True when an annual vehicle payment counts here as ÷ 12 (decision 190). */
  spread: boolean;
}

export interface DrillTable {
  /** Newest payment first. */
  rows: DrillRow[];
  /** Sum of `countedPence` — reconciles exactly with the figure clicked. */
  totalPence: number;
  /** Distinct purchases behind the rows, for the heading. */
  purchaseCount: number;
  /** True when any row is an annual payment counted ÷ 12. */
  hasSpreadRows: boolean;
}

function finish(rows: DrillRow[]): DrillTable {
  rows.sort((a, b) => b.occurredDate.localeCompare(a.occurredDate) || a.purchaseId - b.purchaseId);
  return {
    rows,
    totalPence: rows.reduce((sum, row) => sum + row.countedPence, 0),
    purchaseCount: new Set(rows.map((row) => row.purchaseId)).size,
    hasSpreadRows: rows.some((row) => row.spread),
  };
}

/** A plain cash-basis row: what was recorded is what counts. */
function cashRow(line: InsightLine): DrillRow {
  return {
    purchaseId: line.purchaseId,
    occurredDate: line.occurredDate,
    supplierName: line.supplierName,
    note: line.note,
    parentName: line.parentName,
    childName: line.childName,
    targetKind: line.targetKind,
    targetId: line.targetId,
    countedPence: line.amountPence,
    paidPence: line.amountPence,
    spread: false,
  };
}

/** The 'YYYY-MM' bounds, as calendar-month lines always use. */
function monthBounds(month: string): { from: string; to: string } {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  return monthRange({ year, month: monthNumber });
}

/**
 * The lines behind a month-comparison figure: one row per allocation line in
 * the month, optionally narrowed to one parent category. Cash basis — the
 * month comparison keeps every payment on its date (decision 190).
 */
export function drillMonth(
  lines: readonly InsightLine[],
  month: string,
  parentId: number | null,
): DrillTable {
  const { from, to } = monthBounds(month);
  return finish(
    lines
      .filter(
        (line) =>
          line.occurredDate >= from &&
          line.occurredDate <= to &&
          (parentId === null || line.parentId === parentId),
      )
      .map(cashRow),
  );
}

/**
 * The lines behind a "By person" figure: the person's for-person lines in the
 * displayed month, optionally narrowed to one parent category. Household
 * spending is never attributed to whoever happened to pay (SPEC §16.2), so
 * only lines explicitly targeted at the person appear.
 */
export function drillPerson(
  lines: readonly InsightLine[],
  month: string,
  personId: number,
  parentId: number | null,
): DrillTable {
  const { from, to } = monthBounds(month);
  return finish(
    lines
      .filter(
        (line) =>
          line.occurredDate >= from &&
          line.occurredDate <= to &&
          line.targetKind === 'person' &&
          line.targetId === personId &&
          (parentId === null || line.parentId === parentId),
      )
      .map(cashRow),
  );
}

/** The window a vehicle figure counts over, given `today`. */
export function vehicleDrillWindow(
  window: 'month' | 'previous' | 'rolling',
  today: string,
): { from: string; to: string } {
  const current = monthOfLocalDate(today);
  switch (window) {
    case 'month':
      return monthRange(current);
    case 'previous':
      return monthRange(previousLocalMonth(today));
    case 'rolling':
      return { from: addMonthsClamped(firstOfLocalMonth(today), -11), to: today };
  }
}

/**
 * The lines behind a vehicle figure. Annual payments are spread ÷ 12 (decision
 * 190), so a row counts only its share of the window — one row per payment,
 * with `countedPence` summing the shares that fall inside and `paidPence` the
 * payment as recorded. A spread payment with no share in the window is not
 * part of the figure and does not appear.
 */
export function drillVehicle(
  lines: readonly InsightLine[],
  vehicleId: number,
  window: 'month' | 'previous' | 'rolling',
  childCategoryId: number | null,
  today: string,
): DrillTable {
  const { from, to } = vehicleDrillWindow(window, today);
  const rows: DrillRow[] = [];
  for (const line of lines) {
    if (line.targetKind !== 'vehicle' || line.targetId !== vehicleId) continue;
    if (childCategoryId !== null && line.categoryId !== childCategoryId) continue;
    const spread = (line.coversMonths ?? 1) > 1;
    let countedPence = 0;
    for (const piece of spreadOverCoverMonths(line)) {
      if (piece.occurredDate >= from && piece.occurredDate <= to) countedPence += piece.amountPence;
    }
    // A cash line counts only on its own date; a spread payment only through
    // the shares that fall inside the window. Nothing in the window: not part
    // of this figure, so not a row.
    const inWindow = line.occurredDate >= from && line.occurredDate <= to;
    if (spread ? countedPence === 0 : !inWindow) continue;
    rows.push({
      purchaseId: line.purchaseId,
      occurredDate: line.occurredDate,
      supplierName: line.supplierName,
      note: line.note,
      parentName: line.parentName,
      childName: line.childName,
      targetKind: line.targetKind,
      targetId: line.targetId,
      countedPence,
      paidPence: line.amountPence,
      spread,
    });
  }
  return finish(rows);
}
