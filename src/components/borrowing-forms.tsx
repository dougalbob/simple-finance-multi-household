'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { startBorrowingAction } from '@/app/actions';
import { initialActionState } from '@/lib/action-state';
import { penceInput } from '@/lib/money';
import { lastOccurrenceDate } from '@/lib/records/dates';
import type { DebtOption } from '@/components/external-forms';

interface PotOption {
  id: number;
  label: string;
}

const inputClass =
  'rounded border border-border-strong bg-surface px-2.5 py-1.5 text-sm focus:border-border-emphasis focus:outline-none';
const labelClass = 'text-xs font-medium text-ink-soft';
const submitClass =
  'rounded bg-till px-3 py-1.5 text-sm font-medium text-till-ink disabled:opacity-60';

function FormMessage({ status, message }: { status: string; message: string | null }) {
  if (message === null) return null;
  return (
    <p
      role="status"
      aria-live="polite"
      className={status === 'error' ? 'text-sm text-danger' : 'text-sm text-positive'}
    >
      {message}
    </p>
  );
}

/** 1 → "st", 2 → "nd", 3 → "rd", 11–13 and everything else → "th". */
function suffixOf(count: number): string {
  const lastTwo = count % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return 'th';
  const last = count % 10;
  if (last === 1) return 'st';
  if (last === 2) return 'nd';
  if (last === 3) return 'rd';
  return 'th';
}

/**
 * The Borrowing page's setup card (GitHub issue #60): one flow that sets up
 * informal borrowing or lending. Select someone already tracked — the card
 * becomes a movement form for their arrangement — or someone new, and then
 * say whether this is a **recurring** arrangement (£X on day N until D, or
 * N payments with Fill the end date — the fields DebtEditForm already had,
 * surfaced at creation) or a **one-off** (amount, the pot it came out of,
 * note). Posts `startBorrowingAction`.
 */
export function BorrowSetupForm({
  idPrefix,
  debts,
  pots,
  today,
}: {
  idPrefix: string;
  debts: DebtOption[];
  pots: PotOption[];
  today: string;
}) {
  const [state, formAction, pending] = useActionState(startBorrowingAction, initialActionState);
  const [trackMode, setTrackMode] = useState<'existing' | 'new'>(
    debts.length === 0 ? 'new' : 'existing',
  );
  const [debtId, setDebtId] = useState(debts[0] !== undefined ? String(debts[0].id) : '');
  const [direction, setDirection] = useState<'we_owe' | 'they_owe'>('we_owe');
  const [plan, setPlan] = useState<'recurring' | 'one-off' | 'none'>('recurring');
  const [movementDirection, setMovementDirection] = useState<'in' | 'out' | null>(null);
  const [dayOfMonth, setDayOfMonth] = useState('13');
  const [untilDate, setUntilDate] = useState('');
  const [paymentCount, setPaymentCount] = useState('5');
  const [helperNote, setHelperNote] = useState<string | null>(null);

  const fillEndDate = () => {
    const count = Number(paymentCount);
    const last = lastOccurrenceDate(Number(dayOfMonth), today, count);
    if (last === null) {
      setHelperNote('Enter a day between 1 and 31 and a whole number of payments.');
      return;
    }
    setUntilDate(last);
    setHelperNote(`Set to ${last} — the ${count}${suffixOf(count)} expected payment, inclusive.`);
  };

  const selectedDebt = debts.find((debt) => String(debt.id) === debtId) ?? debts[0];
  const weOwe =
    trackMode === 'new'
      ? direction === 'we_owe'
      : (selectedDebt?.direction ?? 'we_owe') === 'we_owe';
  const effectiveMovementDirection = movementDirection ?? (weOwe ? 'in' : 'out');
  const changeDirection = (next: 'we_owe' | 'they_owe') => {
    setDirection(next);
    setMovementDirection(null);
  };

  if (pots.length === 0) {
    return (
      <p className="text-sm text-ink-soft">
        Create a pot first, then set up borrowing — add one on{' '}
        <Link href="/pots" className="sf-link">
          Accounts, Pots &amp; Checkpoints
        </Link>
        .
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="trackMode" value={trackMode} />
      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-who`} className={labelClass}>
          Who is this with?
        </label>
        <select
          id={`${idPrefix}-who`}
          className={inputClass}
          value={trackMode === 'new' ? 'new' : debtId}
          onChange={(event) => {
            if (event.target.value === 'new') {
              setTrackMode('new');
              return;
            }
            setTrackMode('existing');
            setDebtId(event.target.value);
            setMovementDirection(null);
          }}
        >
          {debts.map((debt) => (
            <option key={debt.id} value={debt.id}>
              {debt.counterparty} ({debt.direction === 'we_owe' ? 'we owe' : 'owed to us'})
            </option>
          ))}
          <option value="new">Someone new…</option>
        </select>
      </div>

      {trackMode === 'new' ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor={`${idPrefix}-counterparty`} className={labelClass}>
                Their name
              </label>
              <input
                id={`${idPrefix}-counterparty`}
                name="counterparty"
                type="text"
                required
                maxLength={120}
                placeholder="e.g. Dave and Maggie"
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${idPrefix}-direction`} className={labelClass}>
                Which way round?
              </label>
              <select
                id={`${idPrefix}-direction`}
                name="direction"
                className={inputClass}
                value={direction}
                onChange={(event) => changeDirection(event.target.value as 'we_owe' | 'they_owe')}
              >
                <option value="we_owe">We owe them</option>
                <option value="they_owe">They owe us</option>
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${idPrefix}-plan`} className={labelClass}>
              Is this a recurring arrangement?
            </label>
            <select
              id={`${idPrefix}-plan`}
              name="plan"
              className={inputClass}
              value={plan}
              onChange={(event) => setPlan(event.target.value as 'recurring' | 'one-off' | 'none')}
            >
              <option value="recurring">Yes — the same amount on a day each month</option>
              <option value="one-off">No — a one-off payment</option>
              <option value="none">Not yet — just track the person</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${idPrefix}-debt-note`} className={labelClass}>
              What is it for? (optional)
            </label>
            <input
              id={`${idPrefix}-debt-note`}
              name="debtNote"
              type="text"
              maxLength={280}
              placeholder="e.g. helping with the bills until spring"
              className={inputClass}
            />
          </div>
        </>
      ) : null}

      {trackMode === 'new' && plan === 'recurring' ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor={`${idPrefix}-expected-amount`} className={labelClass}>
                Expected each month
              </label>
              <input
                id={`${idPrefix}-expected-amount`}
                name="expectedInflowAmount"
                type="text"
                inputMode="decimal"
                required
                placeholder="e.g. 1000.00"
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${idPrefix}-expected-day`} className={labelClass}>
                On day
              </label>
              <input
                id={`${idPrefix}-expected-day`}
                name="expectedInflowDay"
                type="number"
                min={1}
                max={31}
                required
                value={dayOfMonth}
                onChange={(event) => setDayOfMonth(event.target.value)}
                className={inputClass}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor={`${idPrefix}-expected-until`} className={labelClass}>
                Until (optional, inclusive)
              </label>
              <input
                id={`${idPrefix}-expected-until`}
                name="expectedInflowUntil"
                type="date"
                value={untilDate}
                onChange={(event) => setUntilDate(event.target.value)}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${idPrefix}-payment-count`} className={labelClass}>
                Or continuing for this many payments
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={`${idPrefix}-payment-count`}
                  type="number"
                  min={1}
                  max={600}
                  value={paymentCount}
                  onChange={(event) => setPaymentCount(event.target.value)}
                  className={`${inputClass} w-20`}
                />
                <button
                  type="button"
                  onClick={fillEndDate}
                  className="rounded border border-border-strong bg-surface px-2.5 py-1.5 text-xs font-medium text-ink-body hover:bg-canvas"
                >
                  Fill the end date
                </button>
              </div>
            </div>
          </div>
          {helperNote !== null ? <p className="text-xs text-ink-muted">{helperNote}</p> : null}
          <p className="text-xs text-ink-muted">
            Leave the until date blank and the arrangement runs until you stop it. A weekend day
            lands on the Friday before. Expected, never received — the pot moves only when the money
            really lands and you record it.
          </p>
        </>
      ) : null}

      {trackMode === 'existing' || (trackMode === 'new' && plan === 'one-off') ? (
        <>
          {trackMode === 'existing' ? <input type="hidden" name="debtId" value={debtId} /> : null}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor={`${idPrefix}-movement-direction`} className={labelClass}>
                What happened?
              </label>
              <select
                id={`${idPrefix}-movement-direction`}
                name="movementDirection"
                className={inputClass}
                value={effectiveMovementDirection}
                onChange={(event) => setMovementDirection(event.target.value as 'in' | 'out')}
              >
                {weOwe ? (
                  <>
                    <option value="in">Borrowed — money in</option>
                    <option value="out">Repaid — money out</option>
                  </>
                ) : (
                  <>
                    <option value="out">Lent — money out</option>
                    <option value="in">Repayment received — money in</option>
                  </>
                )}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${idPrefix}-pot`} className={labelClass}>
                Which pot?
              </label>
              <select id={`${idPrefix}-pot`} name="potId" required className={inputClass}>
                {pots.map((pot) => (
                  <option key={pot.id} value={pot.id}>
                    {pot.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor={`${idPrefix}-amount`} className={labelClass}>
                Amount
              </label>
              <input
                id={`${idPrefix}-amount`}
                name="amount"
                type="text"
                inputMode="decimal"
                required
                placeholder="e.g. 50.00"
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${idPrefix}-occurred`} className={labelClass}>
                When
              </label>
              <input
                id={`${idPrefix}-occurred`}
                name="occurredDate"
                type="date"
                required
                defaultValue={today}
                max={today}
                className={inputClass}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${idPrefix}-note`} className={labelClass}>
              Note (optional)
            </label>
            <input
              id={`${idPrefix}-note`}
              name="note"
              type="text"
              maxLength={280}
              placeholder="e.g. cash handed over — banked 16th"
              className={inputClass}
            />
          </div>
        </>
      ) : null}

      <button type="submit" disabled={pending} className={`${submitClass} self-start`}>
        {pending
          ? 'Saving…'
          : trackMode === 'existing'
            ? 'Record it'
            : plan === 'recurring'
              ? 'Start tracking'
              : plan === 'none'
                ? 'Start tracking'
                : 'Start tracking and record it'}
      </button>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}
