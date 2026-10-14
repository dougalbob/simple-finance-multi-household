'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ScheduleEditForm } from '@/components/schedule-forms';
import {
  AddScheduleForm,
  CancelScheduleForm,
  RestoreScheduleForm,
  type RecurringCategoryOption,
  type RecurringData,
  type RecurringPotOption,
} from '@/components/recurring';
import { formatPence } from '@/lib/money';
import {
  filterScheduleVisibility,
  recurringHref,
  SCHEDULE_HIDE_CANCELLED_COOKIE,
  SCHEDULE_HIDE_CANCELLED_COOKIE_MAX_AGE,
} from '@/lib/records/schedule-visibility';
import { supplierCardHref } from '@/lib/records/supplier-focus';

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

export interface ScheduleListRow {
  id: number;
  name: string;
  kind: 'dd' | 'so' | 'receipt';
  frequency: 'monthly' | 'annual';
  dueDayOfMonth: number;
  dueMonth: number | null;
  excludedMonths: number[];
  amountPence: number;
  potId: number;
  potLabel: string;
  categoryId: number | null;
  supplierId: number | null;
  supplierName: string | null;
  targetKind: 'household' | 'person' | 'vehicle';
  targetId: number | null;
  contractEndsOn: string | null;
  activeFrom: string;
  activeUntil: string | null;
  isCancelled: boolean;
  cancelledEffectiveOn: string | null;
  version: number;
  nextDueDate: string | null;
  agreement: { id: number; name: string } | null;
}

export interface RecurringScheduleSectionProps {
  schedules: ScheduleListRow[];
  pots: RecurringPotOption[];
  categories: RecurringCategoryOption[];
  suppliers: Array<{ id: number; name: string }>;
  people: Array<{ id: number; label: string }>;
  vehicles: Array<{ id: number; label: string }>;
  recurringData: RecurringData;
  month: string;
  initialHideCancelled: boolean;
  initialQuery?: string;
  today: string;
}

export function RecurringScheduleSection({
  schedules,
  pots,
  categories,
  suppliers,
  people,
  vehicles,
  recurringData,
  month,
  initialHideCancelled,
  initialQuery = '',
  today,
}: RecurringScheduleSectionProps) {
  const [query, setQuery] = useState(initialQuery);
  const [hideCancelled, setHideCancelled] = useState(initialHideCancelled);
  /**
   * SPEC §15.1 (decision 131, the rule the till, the Purchases filters, the
   * theme gallery and the category editor all follow): the filter box is
   * controlled React state, so a keystroke that lands before hydration is
   * wiped by the hydration render and the household watches their typing
   * disappear. The filter row says whether it is listening and stays `inert`
   * until it is, so nothing can be silently swallowed.
   */
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  const updateHideCancelled = (next: boolean) => {
    setHideCancelled(next);
    document.cookie = `${SCHEDULE_HIDE_CANCELLED_COOKIE}=${next ? '1' : '0'}; path=/; max-age=${SCHEDULE_HIDE_CANCELLED_COOKIE_MAX_AGE}; SameSite=Lax`;
  };

  useEffect(() => {
    setHideCancelled(initialHideCancelled);
  }, [initialHideCancelled]);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  const visibility = useMemo(() => {
    return filterScheduleVisibility(schedules, (row) => row.isCancelled, hideCancelled, query);
  }, [schedules, hideCancelled, query]);

  return (
    <section
      aria-labelledby="schedules-heading"
      className="order-2 flex flex-col rounded-xl border border-border bg-surface p-4 shadow-sm lg:col-start-2 lg:row-start-1 lg:h-0 lg:min-h-full lg:overflow-hidden"
    >
      <div className="mb-3 flex shrink-0 flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="schedules-heading" className="text-lg font-semibold">
            Schedules
          </h2>
          {visibility.cancelledCount > 0 ? (
            <Link
              href={recurringHref({
                month,
                hideCancelled: !hideCancelled,
                q: query.trim() !== '' ? query.trim() : undefined,
              })}
              onClick={() => updateHideCancelled(!hideCancelled)}
              className="inline-flex items-center gap-1.5 rounded border border-border-strong px-2.5 py-1 text-xs font-medium text-ink-body hover:bg-canvas"
            >
              {hideCancelled ? 'Show cancelled' : 'Hide cancelled'}
              {hideCancelled && visibility.hiddenCount > 0 ? (
                <span
                  data-testid="hidden-cancelled-count"
                  className="rounded-full bg-danger-50 px-1.5 py-0.5 text-[11px] font-semibold text-danger"
                >
                  {visibility.hiddenCount} hidden
                </span>
              ) : null}
            </Link>
          ) : null}
        </div>
        <span className="text-xs text-ink-muted">
          edits apply from the next instance — history is never rewritten; a start date moved
          earlier backfills the dates the app was never told about
        </span>
      </div>

      <div
        className="mb-3 flex shrink-0 items-center gap-2"
        data-schedules-ready={ready ? 'true' : 'false'}
        inert={!ready}
      >
        <div className="relative flex-1">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter schedules…"
            aria-label="Filter schedules"
            className="w-full rounded border border-border-strong bg-surface px-2.5 py-1 text-xs text-ink placeholder:text-ink-muted focus:border-border-emphasis focus:outline-none"
          />
        </div>
        {query.trim() !== '' ? (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="shrink-0 rounded border border-border-strong px-2.5 py-1 text-xs font-medium text-ink-body hover:bg-canvas"
          >
            Clear filter
          </button>
        ) : null}
      </div>

      {schedules.length === 0 ? (
        <p className="mb-3 text-sm text-ink-muted">
          No schedules yet. Add one below — each converts into a normal record at local midnight on
          its due date.
        </p>
      ) : query.trim() !== '' && visibility.visible.length === 0 ? (
        <div className="mb-3 rounded-lg border border-dashed border-border p-4 text-center text-sm text-ink-muted">
          No schedules match &ldquo;{query}&rdquo;.
          <button
            type="button"
            onClick={() => setQuery('')}
            className="ml-2 font-medium text-ink underline hover:text-ink-emphasis"
          >
            Clear filter
          </button>
        </div>
      ) : query.trim() === '' && visibility.visible.length === 0 ? (
        <p className="mb-3 text-sm text-ink-muted">
          Every schedule is cancelled and hidden.{' '}
          <Link
            href={recurringHref({ month, hideCancelled: false })}
            onClick={() => updateHideCancelled(false)}
            className="sf-link"
          >
            show them
          </Link>{' '}
          to see the cancelled ones.
        </p>
      ) : (
        <ul
          data-schedule-scroller
          className="mb-3 divide-y divide-border-hairline lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-y-contain"
        >
          {visibility.visible.map((schedule, rowIndex) => {
            const fallbackOption = {
              id: schedule.id,
              name: schedule.name,
              kind: schedule.kind,
              frequency: schedule.frequency,
              amountPence: schedule.amountPence,
              dueDayOfMonth: schedule.dueDayOfMonth,
              dueMonth: schedule.dueMonth,
              potLabel: schedule.potLabel,
              nextDueDate: schedule.nextDueDate,
              version: schedule.version,
              cancelledEffectiveOn: schedule.cancelledEffectiveOn,
              contractEndsOn: schedule.contractEndsOn,
              supplierId: schedule.supplierId,
              supplierName: schedule.supplierName,
            };
            const scheduleOption =
              recurringData.schedules.find((entry) => entry.id === schedule.id) ?? fallbackOption;

            return (
              <li
                key={schedule.id}
                id={`schedule-${schedule.id}`}
                // `sf-anchor`, not a fixed `scroll-mt-*`: the landing has to
                // clear the sticky header's *measured* height (re-opened
                // issue #34 — see globals.css and records/anchor-scroll.ts).
                className={`sf-anchor py-2.5 ${rowIndex % 2 === 1 ? 'bg-canvas' : ''}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm">
                    <span
                      className={
                        schedule.isCancelled
                          ? 'font-medium text-ink-faint line-through'
                          : 'font-medium text-ink-emphasis'
                      }
                    >
                      {schedule.name}
                    </span>{' '}
                    {schedule.isCancelled ? (
                      <span className="rounded bg-danger-50 px-1.5 py-0.5 text-xs font-medium text-danger">
                        Cancelled
                      </span>
                    ) : null}{' '}
                    <span className="text-xs text-ink-muted">
                      {schedule.kind === 'receipt'
                        ? 'income'
                        : schedule.kind === 'dd'
                          ? 'direct debit'
                          : 'standing order'}
                      {schedule.frequency === 'annual'
                        ? ` · every year, ${MONTH_NAMES[(schedule.dueMonth ?? 1) - 1]}`
                        : ` · monthly`}{' '}
                      · {schedule.potLabel}
                      {schedule.supplierName !== null ? ` · ${schedule.supplierName}` : ''}
                    </span>
                  </span>
                  <span className="text-sm font-semibold tabular-nums">
                    {schedule.kind === 'receipt' ? '+' : '−'}
                    {formatPence(schedule.amountPence)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {schedule.isCancelled ? (
                    <>Cancelled from {schedule.cancelledEffectiveOn} — history kept</>
                  ) : (
                    <>Next due: {schedule.nextDueDate ?? '—'}</>
                  )}
                  {` · active from ${schedule.activeFrom}`}
                  {schedule.agreement !== null ? (
                    <>
                      {' · '}
                      <Link
                        href={`/contracts#agreement-${schedule.agreement.id}`}
                        className="sf-link"
                      >
                        Agreement: {schedule.agreement.name}
                      </Link>
                    </>
                  ) : null}
                  {schedule.supplierId !== null ? (
                    <>
                      {' · '}
                      <Link href={supplierCardHref(schedule.supplierId)} className="sf-link">
                        Supplier card
                      </Link>
                    </>
                  ) : null}
                </p>
                <details className="mt-1.5">
                  <summary className="cursor-pointer text-xs font-medium text-ink-soft hover:text-ink">
                    {schedule.isCancelled ? 'Schedule options' : 'Edit schedule'}
                  </summary>
                  <div className="mt-2 max-w-2xl">
                    {!schedule.isCancelled ? (
                      <>
                        <ScheduleEditForm
                          scheduleId={schedule.id}
                          version={schedule.version}
                          name={schedule.name}
                          kind={schedule.kind}
                          frequency={schedule.frequency}
                          dueDayOfMonth={schedule.dueDayOfMonth}
                          dueMonth={schedule.dueMonth}
                          excludedMonths={schedule.excludedMonths}
                          amountPence={schedule.amountPence}
                          contractEndsOn={schedule.contractEndsOn}
                          activeFrom={schedule.activeFrom}
                          activeUntil={schedule.activeUntil}
                          potId={schedule.potId}
                          potOptions={pots}
                          categoryId={schedule.categoryId}
                          categoryOptions={categories}
                          supplierId={schedule.supplierId}
                          supplierOptions={suppliers.map((s) => ({ id: s.id, label: s.name }))}
                          targetKind={schedule.targetKind}
                          targetId={schedule.targetId}
                          people={people}
                          vehicles={vehicles}
                        />
                        <hr className="my-3 border-border-hairline" />
                        <CancelScheduleForm schedule={scheduleOption} today={today} />
                      </>
                    ) : (
                      <RestoreScheduleForm schedule={scheduleOption} />
                    )}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}

      <details className="shrink-0 lg:max-h-[45%] lg:overflow-y-auto lg:border-t lg:border-border-hairline lg:pt-3">
        <summary className="cursor-pointer text-sm font-medium text-ink-body">
          Add a schedule
        </summary>
        <div className="mt-3">
          <AddScheduleForm data={recurringData} />
        </div>
      </details>
    </section>
  );
}
