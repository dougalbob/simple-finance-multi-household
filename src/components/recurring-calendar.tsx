'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { CalendarDay } from '@/lib/records/recurring-calendar';
import { scheduleEditorHref } from '@/lib/records/schedule-visibility';
import { formatPence } from '@/lib/money';
import { formatDayMonthLocalDate, formatShortLocalDate } from '@/lib/time';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function RecurringCalendarGrid({
  days,
  month,
  today,
  hideCancelled,
}: {
  days: CalendarDay[];
  month: string;
  today: string;
  hideCancelled: boolean;
}) {
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const selectedDay = days.find((day) => day.date === expandedDate && day.instances.length > 0);

  const closeDetails = () => {
    const date = expandedDate;
    setExpandedDate(null);
    if (date !== null) {
      window.requestAnimationFrame(() => {
        document
          .querySelector<HTMLButtonElement>(`button[data-calendar-day-button="${date}"]`)
          ?.focus();
      });
    }
  };

  return (
    <>
      <div className="grid grid-cols-7 gap-px rounded-lg border border-border bg-border">
        {WEEKDAYS.map((name) => (
          <div
            key={name}
            className="bg-canvas py-1.5 text-center text-xs font-semibold text-ink-muted"
          >
            {name}
          </div>
        ))}
        {days.map((day) => {
          const hasItems = day.instances.length > 0;
          const isExpanded = expandedDate === day.date && hasItems;
          return (
            <div
              key={day.date}
              data-date={day.date}
              className={`min-h-[70px] min-w-0 px-0.5 py-1 transition-colors max-[360px]:px-0 sm:min-h-[85px] sm:p-1.5 ${
                day.inMonth ? 'bg-surface' : 'bg-surface-faint text-ink-faint'
              } ${day.isToday ? 'ring-2 ring-accent ring-inset' : ''}`}
            >
              <span
                className={`inline-flex text-xs ${
                  day.isToday
                    ? 'h-5 w-5 items-center justify-center rounded-full bg-accent font-semibold text-accent-ink'
                    : 'font-medium'
                }`}
              >
                {Number(day.date.slice(8, 10))}
              </span>
              {hasItems ? (
                <button
                  type="button"
                  data-calendar-day-button={day.date}
                  aria-expanded={isExpanded}
                  aria-controls="calendar-day-details"
                  aria-label={`${day.instances.length} scheduled ${day.instances.length === 1 ? 'item' : 'items'}, combined amount ${formatPence(day.totalPence)}, for ${formatDayMonthLocalDate(day.date, today)}`}
                  title={`${day.instances.length} ${day.instances.length === 1 ? 'item' : 'items'} · ${formatPence(day.totalPence)}`}
                  onClick={() => setExpandedDate(isExpanded ? null : day.date)}
                  className={`mt-1 block w-full min-w-0 rounded-sm text-left leading-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    isExpanded ? 'bg-canvas ring-1 ring-accent' : 'hover:bg-canvas'
                  } ${day.inMonth ? 'text-ink-body' : 'text-ink-faint'}`}
                >
                  <span className="block truncate text-[9px] font-semibold sm:text-[10px]">
                    {day.instances.length} {day.instances.length === 1 ? 'item' : 'items'}
                  </span>
                  <span className="block truncate font-mono text-[8px] tabular-nums max-[360px]:text-[7px] sm:text-[10px]">
                    {formatPence(day.totalPence).replaceAll(',', '')}
                  </span>
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      <section
        id="calendar-day-details"
        role="region"
        aria-label={
          selectedDay === undefined
            ? 'Scheduled day details'
            : `Scheduled items for ${formatDayMonthLocalDate(selectedDay.date, today)}`
        }
        hidden={selectedDay === undefined}
        className="mt-3 rounded-lg border border-border bg-canvas p-3 sm:p-4"
      >
        {selectedDay !== undefined ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-ink-emphasis">
                  Scheduled items — {formatDayMonthLocalDate(selectedDay.date, today)}
                </h3>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {selectedDay.instances.length}{' '}
                  {selectedDay.instances.length === 1 ? 'item' : 'items'} ·{' '}
                  {formatPence(selectedDay.totalPence)} combined amount
                </p>
              </div>
              <button
                type="button"
                onClick={closeDetails}
                className="rounded border border-border-strong px-2.5 py-1 text-xs font-medium text-ink-body hover:bg-surface"
              >
                Close details
              </button>
            </div>
            <p className="mt-2 text-xs text-ink-muted">
              Income is included in the combined amount and is not offset against payments.
            </p>
            <ul className="mt-2 divide-y divide-border-hairline rounded-md border border-border-hairline bg-surface">
              {selectedDay.instances.map((instance) => {
                const isReceipt = instance.kind === 'receipt';
                const dotClass = isReceipt ? 'bg-positive-500' : 'bg-marker-muted';
                const typeLabel = isReceipt
                  ? 'Expected income'
                  : instance.kind === 'dd'
                    ? 'Direct debit'
                    : 'Standing order';
                const stateLabel =
                  instance.state === 'converted' ? 'Converted' : 'Not converted yet';
                return (
                  <li
                    key={instance.instanceId}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5"
                  >
                    <div className="flex min-w-0 items-start gap-2">
                      <span
                        aria-hidden="true"
                        className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${
                          instance.state === 'converted'
                            ? dotClass
                            : 'border border-marker-muted bg-surface'
                        }`}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink-emphasis">
                          {instance.scheduleName}
                        </span>
                        <span className="block text-xs text-ink-muted">
                          {typeLabel} · {stateLabel}
                        </span>
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="whitespace-nowrap text-sm font-semibold tabular-nums text-ink-body">
                        {isReceipt ? '+' : '−'}
                        {formatPence(instance.amountPence)}
                      </p>
                      <Link
                        href={scheduleEditorHref(
                          { id: instance.scheduleId, name: instance.scheduleName },
                          { month, hideCancelled },
                        )}
                        aria-label={`Edit schedule: ${instance.scheduleName}`}
                        className="sf-link text-xs"
                      >
                        Edit schedule
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
              <span>Due {formatShortLocalDate(selectedDay.date)}</span>
              <span>Each link opens this schedule's Edit section.</span>
            </div>
          </>
        ) : null}
      </section>
    </>
  );
}
