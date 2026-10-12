'use client';

import { Fragment, useId, useState } from 'react';
import { formatPence } from '@/lib/money';
import type { HorizonDayDetail, HorizonDayLine } from '@/lib/records/horizon-days';
import type { ProjectionDay } from '@/lib/records/projection';

/**
 * The Horizon "Day by day" table. Tapping (or clicking) a commitments,
 * expected-money-in or day-to-day amount opens an inline panel directly
 * beneath that date's row, listing what the figure is made of. Only one
 * panel is open at a time; tapping the same amount again closes it.
 *
 * The panel sits under the date it describes, so on a phone the date never
 * has to be remembered once the summary card has scrolled away.
 */

type Column = 'commitments' | 'receipts' | 'dayToDay';

const COLUMN_TITLE: Record<Column, string> = {
  commitments: 'Commitments',
  receipts: 'Expected money in',
  dayToDay: 'Day-to-day',
};

interface DayByDayTableProps {
  rows: ProjectionDay[];
  details: HorizonDayDetail[];
  dayToDayIncluded: boolean;
}

export function DayByDayTable({ rows, details, dayToDayIncluded }: DayByDayTableProps) {
  const [openCell, setOpenCell] = useState<{ date: string; column: Column } | null>(null);
  const idPrefix = useId();
  const detailByDate = new Map(details.map((detail) => [detail.date, detail]));
  const columnCount = dayToDayIncluded ? 5 : 4;

  const toggle = (date: string, column: Column) => {
    setOpenCell((current) =>
      current !== null && current.date === date && current.column === column
        ? null
        : { date, column },
    );
  };

  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full min-w-[420px] text-sm">
        <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-ink-muted">
          <tr>
            <th className="px-3 py-1.5">Date</th>
            <th className="px-3 py-1.5 text-right">Commitments</th>
            {dayToDayIncluded ? <th className="px-3 py-1.5 text-right">Day-to-day</th> : null}
            <th className="px-3 py-1.5 text-right">Expected money in</th>
            <th className="px-3 py-1.5 text-right">End of day</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((day) => {
            const detail = detailByDate.get(day.date);
            const isOpen = (column: Column) =>
              openCell !== null && openCell.date === day.date && openCell.column === column;
            const panelId = (column: Column) => `${idPrefix}-${day.date}-${column}`;
            const openColumn =
              openCell !== null && openCell.date === day.date ? openCell.column : null;

            return (
              <Fragment key={day.date}>
                <tr className="border-t border-border-hairline">
                  <td className="px-3 py-1.5">{day.date}</td>
                  <AmountCell
                    show={day.commitmentsPence > 0}
                    negative
                    pence={day.commitmentsPence}
                    expanded={isOpen('commitments')}
                    controls={panelId('commitments')}
                    onToggle={() => toggle(day.date, 'commitments')}
                    label={`Commitments on ${day.date}`}
                  />
                  {dayToDayIncluded ? (
                    <AmountCell
                      show={day.dayToDayPence > 0}
                      negative
                      pence={day.dayToDayPence}
                      expanded={isOpen('dayToDay')}
                      controls={panelId('dayToDay')}
                      onToggle={() => toggle(day.date, 'dayToDay')}
                      label={`Projected shops and fills on ${day.date}`}
                    />
                  ) : null}
                  <AmountCell
                    show={day.receiptsPence > 0}
                    negative={false}
                    pence={day.receiptsPence}
                    expanded={isOpen('receipts')}
                    controls={panelId('receipts')}
                    onToggle={() => toggle(day.date, 'receipts')}
                    label={`Expected money in on ${day.date}`}
                  />
                  <td
                    className={`px-3 py-1.5 text-right font-medium tabular-nums ${day.runningPence < 0 ? 'text-danger' : ''}`}
                  >
                    {formatPence(day.runningPence)}
                  </td>
                </tr>
                {openColumn !== null && detail !== undefined ? (
                  <tr className="bg-surface-muted/60">
                    <td colSpan={columnCount} className="px-3 pb-3 pt-1">
                      {/* Pinned to the visible width: the table scrolls sideways on a phone,
                          and the panel must not run off the right-hand edge. */}
                      <div className="sticky left-0 w-[min(calc(100vw-6rem),36rem)]">
                        <BreakdownPanel
                          id={panelId(openColumn)}
                          date={day.date}
                          column={openColumn}
                          detail={detail}
                          onClose={() => setOpenCell(null)}
                        />
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AmountCell({
  show,
  negative,
  pence,
  expanded,
  controls,
  onToggle,
  label,
}: {
  show: boolean;
  negative: boolean;
  pence: number;
  expanded: boolean;
  controls: string;
  onToggle: () => void;
  label: string;
}) {
  if (!show) {
    return <td className="px-3 py-1.5 text-right tabular-nums">—</td>;
  }
  return (
    <td className="px-3 py-1.5 text-right tabular-nums">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={controls}
        aria-label={`${label}: ${negative ? '−' : '+'}${formatPence(pence)}. ${expanded ? 'Hide' : 'Show'} details`}
        // Decision 203: the amount is the way in, so it is drawn like a link —
        // the familiar blue and a permanent underline — with the dotted line
        // kept to say "this opens here, under the row" rather than "this
        // navigates away".
        className="sf-link -my-1 min-h-9 whitespace-nowrap rounded px-1 py-1 text-right tabular-nums decoration-dotted focus-visible:outline-2 focus-visible:outline-accent aria-expanded:font-semibold"
      >
        {negative ? `−${formatPence(pence)}` : `+${formatPence(pence)}`}
      </button>
    </td>
  );
}

const COLUMN_SIGN: Record<Column, string> = {
  commitments: '−',
  dayToDay: '−',
  receipts: '+',
};

function BreakdownPanel({
  id,
  date,
  column,
  detail,
  onClose,
}: {
  id: string;
  date: string;
  column: Column;
  detail: HorizonDayDetail;
  onClose: () => void;
}) {
  const total =
    column === 'commitments'
      ? detail.commitmentsPence
      : column === 'receipts'
        ? detail.receiptsPence
        : detail.dayToDayPence;

  return (
    <section
      id={id}
      aria-label={`${COLUMN_TITLE[column]} on ${date}`}
      className="rounded-lg border border-border bg-surface p-3 text-sm shadow-sm"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-medium text-ink-body">
          {date} · {COLUMN_TITLE[column]}{' '}
          <span className="tabular-nums">
            {COLUMN_SIGN[column]}
            {formatPence(total)}
          </span>
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-2 py-1 text-xs text-ink-muted underline decoration-dotted underline-offset-4 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
        >
          Close
        </button>
      </div>

      {column === 'dayToDay' ? (
        <ul className="mt-2 divide-y divide-border-hairline">
          {detail.dayToDay.map((item) => (
            <li key={item.key} className="py-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{item.name}</span>
                <span className="tabular-nums">−{formatPence(item.amountPence)}</span>
              </div>
              <p className="mt-0.5 text-xs text-ink-muted">{item.basis}</p>
            </li>
          ))}
        </ul>
      ) : (
        <LineList
          lines={column === 'commitments' ? detail.commitments : detail.receipts}
          column={column}
        />
      )}
    </section>
  );
}

function LineList({
  lines,
  column,
}: {
  lines: HorizonDayLine[];
  column: 'commitments' | 'receipts';
}) {
  return (
    <ul className="mt-2 divide-y divide-border-hairline">
      {lines.map((line) => (
        <li key={line.key} className="flex items-baseline justify-between gap-2 py-1.5">
          <span>
            <span className="font-medium">{line.name}</span>{' '}
            <span className="text-xs text-ink-muted">{line.subtitle}</span>
          </span>
          <span
            className={`tabular-nums ${column === 'receipts' && line.expected ? 'text-ink-muted' : column === 'receipts' ? 'text-positive' : ''}`}
          >
            {column === 'receipts' ? (line.expected ? '≈' : '+') : '−'}
            {formatPence(line.amountPence)}
          </span>
        </li>
      ))}
    </ul>
  );
}
