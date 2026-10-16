'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Fragment, startTransition, useEffect, useOptimistic, useRef, type ReactNode } from 'react';
import { ActivityPanel, useRowToggleReady } from '@/components/activity-open-row';
import { ExternalMovementEditForm, type EditableMovement } from '@/components/external-forms';
import { VoidForm } from '@/components/record-forms';
import { formatPence } from '@/lib/money';
import {
  describeLoanMovement,
  formatSignedBalancePence,
  potLandingPhrase,
  type BorrowingLedgerRow,
  type BorrowingMovementRow,
} from '@/lib/records/borrowing';
import { describeExternalMovement } from '@/lib/records/external-movements';
import { activityWindowContaining, parseOpenRecordId } from '@/lib/records/in-place-activity';
import { formatInstantLocal } from '@/lib/time';

/** The Borrowing ledger's column count — a panel row spans all of them. */
const LEDGER_COLUMN_COUNT = 5;

/** `?external=` on the Borrowing page: the one movement whose detail panel is open. */
export const OPEN_EXTERNAL_PARAM = 'external';

interface PotOption {
  id: number;
  label: string;
  kind: 'bank' | 'cash' | 'credit-card';
}

/**
 * The Borrowing page's transaction-style ledger (GitHub issue #60): one
 * history, oldest first, with each row's running balance and — for a
 * movement — a detail panel that opens **beneath its row** when the amount is
 * clicked (the same in-place contract as All Transactions' transfers and
 * purchases, decisions 225/226: the open record lives in `?external=`, the
 * URL is rewritten through the router with `scroll: false`, one panel at a
 * time, never `history.replaceState`).
 */
export function BorrowingLedger({
  rows,
  pots,
  today,
  inLabel,
  outLabel,
}: {
  rows: BorrowingLedgerRow[];
  pots: PotOption[];
  today: string;
  /** Column captions: "Money in / Money out", or the person-filtered wording. */
  inLabel: string;
  outLabel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlOpen = parseOpenRecordId(searchParams.get(OPEN_EXTERNAL_PARAM) ?? undefined);
  const [open, setOptimisticOpen] = useOptimistic(urlOpen);
  const setOpen = (next: number | null) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(OPEN_EXTERNAL_PARAM);
    if (next !== null) params.set(OPEN_EXTERNAL_PARAM, String(next));
    const query = params.toString();
    // The fragment lets a refresh (or a shared link) land on the open row.
    const fragment = next === null ? '' : `#external-${next}`;
    startTransition(() => {
      setOptimisticOpen(next);
      router.replace(`${pathname}${query === '' ? '' : `?${query}`}${fragment}`, {
        scroll: false,
      });
    });
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-ink-muted">
          <tr>
            <th className="px-3 py-1.5">Date</th>
            <th className="px-3 py-1.5">From / To</th>
            <th className="px-3 py-1.5 text-right">{inLabel}</th>
            <th className="px-3 py-1.5 text-right">{outLabel}</th>
            <th className="px-3 py-1.5 text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <LedgerRow
              key={row.key}
              row={row}
              pots={pots}
              today={today}
              striped={index % 2 === 1}
              open={row.kind === 'movement' ? open === row.id : false}
              onToggle={() => row.kind === 'movement' && setOpen(open === row.id ? null : row.id)}
            />
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={LEDGER_COLUMN_COUNT} className="px-3 py-4 text-sm text-ink-muted">
                Nothing recorded yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function LedgerRow({
  row,
  pots,
  today,
  striped,
  open,
  onToggle,
}: {
  row: BorrowingLedgerRow;
  pots: PotOption[];
  today: string;
  striped: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  if (row.kind === 'expected') {
    return (
      <tr
        className={`border-t border-border-hairline align-top text-ink-muted ${striped ? 'bg-canvas' : ''}`}
      >
        <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">
          {row.date}
          {row.shifted ? <span className="mt-0.5 block text-xs">moved off the weekend</span> : null}
        </td>
        <td className="px-3 py-2.5">
          {row.counterparty}
          <span className="mt-0.5 block text-xs">expected — not recorded yet</span>
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums">
          {formatPence(row.amountPence)}
          <Link
            href={`?debt=${row.debtId}&what=in&amountPence=${row.amountPence}#record`}
            className="mt-0.5 block text-xs sf-link"
          >
            Record this month&apos;s {formatPence(row.amountPence)}
          </Link>
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums">—</td>
        <td className="px-3 py-2.5 text-right tabular-nums">—</td>
      </tr>
    );
  }
  return (
    <MovementLedgerRow
      row={row}
      pots={pots}
      today={today}
      striped={striped}
      open={open}
      onToggle={onToggle}
    />
  );
}

function MovementLedgerRow({
  row,
  pots,
  today,
  striped,
  open,
  onToggle,
}: {
  row: BorrowingMovementRow;
  pots: PotOption[];
  today: string;
  striped: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const ready = useRowToggleReady();
  const panelRef = useRef<HTMLElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const { movement } = row;
  const pot = pots.find((candidate) => candidate.id === movement.potId);
  const panelId = `external-${movement.id}-panel`;
  const amount = `${row.moneyIn ? '+' : '−'}${formatPence(movement.amountPence)}`;

  // A row near the bottom of the screen would open its panel out of sight;
  // `nearest` scrolls only as far as needed (the purchase rows' rule).
  useEffect(() => {
    if (open) panelRef.current?.scrollIntoView({ block: 'nearest' });
  }, [open]);

  const close = () => {
    onToggle();
    toggleRef.current?.focus();
  };

  const amountCell = (
    <button
      ref={toggleRef}
      type="button"
      onClick={() => {
        if (open) {
          close();
          return;
        }
        onToggle();
      }}
      aria-expanded={open}
      aria-controls={open ? panelId : undefined}
      data-borrowing-ready={ready ? 'true' : 'false'}
      inert={!ready}
      className={`sf-link -mx-1 rounded px-1 tabular-nums decoration-dotted focus-visible:outline-2 focus-visible:outline-accent aria-expanded:font-semibold ${
        row.voided ? 'line-through' : ''
      }`}
    >
      {amount}
      {/* inline-block: the link underline does not run under the marker. */}
      <span aria-hidden="true" className="ml-1 inline-block text-[0.7em] no-underline">
        {open ? '▾' : '▸'}
      </span>
      <span className="sr-only">
        {' '}
        — {open ? 'Close this row' : 'Open this row for the detail, correction and void'}
      </span>
    </button>
  );

  return (
    <Fragment>
      <tr
        id={`external-${movement.id}`}
        className={`sf-anchor border-t border-border-hairline align-top ${
          open ? 'bg-accent-50' : striped ? 'bg-canvas' : ''
        } ${row.voided ? 'text-ink-faint' : ''}`}
      >
        <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-ink-body">{row.date}</td>
        <td className="px-3 py-2.5">
          <span className={row.voided ? 'line-through' : undefined}>{row.counterparty}</span>
          {row.voided ? (
            <span className="mt-0.5 block text-xs">
              voided{movement.voidReason ? ` — ${movement.voidReason}` : ''}
            </span>
          ) : null}
        </td>
        <td className="px-3 py-2.5 text-right">
          {row.moneyIn ? amountCell : <span className="text-ink-faint">—</span>}
        </td>
        <td className="px-3 py-2.5 text-right">
          {row.moneyIn ? <span className="text-ink-faint">—</span> : amountCell}
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums">
          {formatSignedBalancePence(row.runningBalancePence)}
        </td>
      </tr>
      {open ? (
        <ActivityPanel
          id={panelId}
          columnCount={LEDGER_COLUMN_COUNT}
          title={describeLoanMovement(movement, row.direction)}
          subtitle={
            <>
              {amount} · {row.date}
            </>
          }
          onClose={close}
          muted={row.voided}
          panelRef={panelRef}
        >
          <div className="mt-2 space-y-1 text-sm text-ink-body">
            <p>{pot === undefined ? 'Pot unknown.' : potLandingPhrase(pot, movement.direction)}</p>
            <p>
              {movement.note !== null && movement.note !== ''
                ? `Note: ${movement.note}`
                : 'No note.'}
            </p>
            <p className="text-xs text-ink-muted">
              Recorded by {movement.enteredBy} · {formatInstantLocal(movement.createdAt)}
            </p>
            {pot !== undefined ? (
              <p>
                <Link
                  href={`/transactions?potId=${pot.id}&from=${
                    activityWindowContaining(row.date, today).dateFrom
                  }&to=${activityWindowContaining(row.date, today).dateTo}`}
                  className="sf-link"
                >
                  Show {pot.label} around {row.date}
                </Link>
              </p>
            ) : null}
          </div>
          {row.voided ? (
            <p className="mt-3 rounded-lg bg-surface-muted px-3 py-2 text-sm text-ink-muted">
              Voided{movement.voidReason ? ` — ${movement.voidReason}` : ''}. History keeps: the row
              stays and moves no balance.
            </p>
          ) : (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <ExternalMovementEditForm
                idPrefix={`borrowing-edit-${movement.id}`}
                movement={movement as EditableMovement}
                pots={pots}
                today={today}
              />
              <div className="border-t border-border-hairline pt-3 md:border-l md:border-t-0 md:pl-3 md:pt-0">
                <VoidForm
                  kind="external"
                  recordId={movement.id}
                  expectedVersion={movement.version}
                  summary={describeExternalMovement(movement)}
                />
              </div>
            </div>
          )}
        </ActivityPanel>
      ) : null}
    </Fragment>
  );
}

/** Small muted line under a section heading. */
export function LedgerNote({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-xs text-ink-muted">{children}</p>;
}
