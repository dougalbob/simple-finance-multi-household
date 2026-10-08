import type { ProjectionLine } from './money-view';
import type { ProjectedDayToDayEvent } from './day-to-day';

/**
 * Per-day detail for the Horizon "Day by day" card (tap an amount to see
 * what it comprises). Pure: it reshapes the lines the view already holds, so
 * the panel can never disagree with the table's totals.
 *
 * Commitments, expected money in and day-to-day are each grouped by their
 * due date. Expected money in is generic over any future income schedule:
 * a line is shown as received or as expected from its `expected` flag alone.
 */

export interface HorizonDayLine {
  /** Stable key within the day. */
  key: string;
  name: string;
  /** Secondary text, e.g. the pot and the schedule type. */
  subtitle: string;
  amountPence: number;
  /** True for expected-but-never-received money (debt support). */
  expected: boolean;
}

export interface HorizonDayToDayItem {
  key: string;
  name: string;
  amountPence: number;
  /** Plain-English reason the event falls on this date. */
  basis: string;
}

export interface HorizonDayDetail {
  date: string;
  commitments: HorizonDayLine[];
  commitmentsPence: number;
  receipts: HorizonDayLine[];
  receiptsPence: number;
  dayToDay: HorizonDayToDayItem[];
  dayToDayPence: number;
}

/** Schedule kinds as the household reads them. */
export function scheduleKindLabel(kind: ProjectionLine['scheduleKind']): string {
  switch (kind) {
    case 'dd':
      return 'direct debit';
    case 'so':
      return 'standing order';
    case 'receipt':
      return 'income';
    default:
      return 'expected support';
  }
}

/**
 * One sentence explaining why a projected shop or fill is on its date, in
 * the household's terms. The amount is always the figure set in Settings.
 */
export function describeDayToDayBasis(event: ProjectedDayToDayEvent): string {
  const isGroceries = event.kind === 'groceries';
  const repeat = `every ${event.cadenceDays} days`;
  switch (event.basis) {
    case 'anchor':
      return isGroceries
        ? `Projected ${repeat} from the last weekly shop on ${event.anchorDate}, at the figure set in Settings.`
        : `Projected ${repeat} from the last recorded fill for this vehicle on ${event.anchorDate}, at the figure set in Settings.`;
    case 'overdue':
      return isGroceries
        ? `The last weekly shop was on ${event.anchorDate}, more than ${event.cadenceDays} days ago, so this is projected from tomorrow and repeats ${repeat}.`
        : `The last recorded fill for this vehicle was on ${event.anchorDate}, more than ${event.cadenceDays} days ago, so this is projected from tomorrow and repeats ${repeat}.`;
    case 'never':
      return isGroceries
        ? `No weekly shop has been recorded yet, so this is projected from tomorrow and repeats ${repeat}.`
        : `No fill has been recorded for this vehicle yet, so this is projected from tomorrow and repeats ${repeat}.`;
  }
}

function compareByName<T extends { name: string }>(a: T, b: T): number {
  return a.name.localeCompare(b.name);
}

/**
 * Group every dated line by its due date. Only dates with something in them
 * appear; the caller pairs these with the day-by-day rows by `date`.
 */
export function buildHorizonDayDetails(input: {
  commitmentLines: readonly ProjectionLine[];
  receiptLines: readonly ProjectionLine[];
  dayToDayEvents: readonly ProjectedDayToDayEvent[];
}): HorizonDayDetail[] {
  const byDate = new Map<string, HorizonDayDetail>();
  const detailFor = (date: string): HorizonDayDetail => {
    let detail = byDate.get(date);
    if (detail === undefined) {
      detail = {
        date,
        commitments: [],
        commitmentsPence: 0,
        receipts: [],
        receiptsPence: 0,
        dayToDay: [],
        dayToDayPence: 0,
      };
      byDate.set(date, detail);
    }
    return detail;
  };

  // Keys are positional: two schedules can share a name and date.
  for (const [index, line] of input.commitmentLines.entries()) {
    const detail = detailFor(line.dueDate);
    detail.commitments.push({
      key: `c-${index}`,
      name: line.name,
      subtitle: `${line.potLabel} · ${scheduleKindLabel(line.scheduleKind)}`,
      amountPence: line.amountPence,
      expected: false,
    });
    detail.commitmentsPence += line.amountPence;
  }

  for (const [index, line] of input.receiptLines.entries()) {
    const detail = detailFor(line.dueDate);
    const expected = line.expected === true;
    detail.receipts.push({
      key: `r-${index}`,
      name: line.name,
      subtitle: expected
        ? `${line.potLabel} · expected — never received`
        : `${line.potLabel} · ${scheduleKindLabel(line.scheduleKind)}`,
      amountPence: line.amountPence,
      expected,
    });
    detail.receiptsPence += line.amountPence;
  }

  for (const [index, event] of input.dayToDayEvents.entries()) {
    const detail = detailFor(event.dueDate);
    detail.dayToDay.push({
      key: `d-${index}`,
      name: event.name,
      amountPence: event.amountPence,
      basis: describeDayToDayBasis(event),
    });
    detail.dayToDayPence += event.amountPence;
  }

  const details = [...byDate.values()];
  for (const detail of details) {
    detail.commitments.sort(compareByName);
    detail.receipts.sort(compareByName);
    detail.dayToDay.sort(compareByName);
  }
  details.sort((a, b) => a.date.localeCompare(b.date));
  return details;
}
