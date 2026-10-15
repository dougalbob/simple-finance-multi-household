import { addDaysLocal, daysInMonth } from './dates';
import { startOfWeekLocal } from './insights';

export type CalendarScheduleKind = 'dd' | 'so' | 'receipt';
export type CalendarInstanceState = 'upcoming' | 'converted';

export interface CalendarInstance {
  instanceId: number;
  scheduleId: number;
  scheduleName: string;
  kind: CalendarScheduleKind;
  amountPence: number;
  state: CalendarInstanceState;
  dueDate: string;
}

export interface CalendarDay {
  date: string;
  inMonth: boolean;
  isToday: boolean;
  instances: CalendarInstance[];
  /** Sum of the listed amounts in whole pence; receipts are not netted against outgoings. */
  totalPence: number;
}

export interface CalendarMonthRef {
  year: number;
  month: number; // 1–12
}

export interface CalendarInstanceRow {
  instance: {
    id: number;
    scheduleId: number;
    dueDate: string;
    state: CalendarInstanceState;
  };
  scheduleName: string;
  scheduleKind: CalendarScheduleKind;
  amountPence: number;
}

/** Build the 42-cell, Monday-first month view from the schedule instance rows. */
export function buildRecurringCalendar(
  ref: CalendarMonthRef,
  today: string,
  rows: readonly CalendarInstanceRow[],
): CalendarDay[] {
  const first = `${ref.year}-${String(ref.month).padStart(2, '0')}-01`;
  const last = addDaysLocal(first, daysInMonth(ref.year, ref.month) - 1);
  const gridStart = startOfWeekLocal(first);
  const byDate = new Map<string, CalendarInstance[]>();

  for (const row of rows) {
    const list = byDate.get(row.instance.dueDate) ?? [];
    list.push({
      instanceId: row.instance.id,
      scheduleId: row.instance.scheduleId,
      scheduleName: row.scheduleName,
      kind: row.scheduleKind,
      amountPence: row.amountPence,
      state: row.instance.state,
      dueDate: row.instance.dueDate,
    });
    byDate.set(row.instance.dueDate, list);
  }

  return Array.from({ length: 42 }, (_, index) => {
    const date = addDaysLocal(gridStart, index);
    const instances = (byDate.get(date) ?? []).sort(
      (a, b) => a.scheduleName.localeCompare(b.scheduleName) || a.scheduleId - b.scheduleId,
    );
    return {
      date,
      inMonth: date >= first && date <= last,
      isToday: date === today,
      instances,
      totalPence: instances.reduce((sum, instance) => sum + instance.amountPence, 0),
    };
  });
}
