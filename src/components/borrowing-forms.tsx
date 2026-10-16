'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useActionState, useEffect, useRef, useState } from 'react';
import { addExternalMovementAction, startBorrowingAction } from '@/app/actions';
import { initialActionState } from '@/lib/action-state';
import { formatPence, parsePence, penceInput } from '@/lib/money';
import { lastOccurrenceDate } from '@/lib/records/dates';
import type { PotKind } from '@/lib/records/pots';

export interface BorrowingPotOption {
  id: number;
  label: string;
  kind: PotKind;
  estimatePence: number | null;
}

const AUTO_COLLAPSE_MS = 2000;

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

/**
 * Sanity check for movements on the Borrowing page:
 * - Overpayment on a repayment (we_owe + out, or they_owe + in): hard-blocked
 *   when the proposed repayment exceeds what is currently owed.
 * - Cash pot outflow: hard-blocked when the payment exceeds the cash pot's
 *   estimated balance.
 * - Bank account outflow: warns when the payment will take the account's
 *   estimated balance below zero, while still allowing the user to record it.
 */
export function evaluateOutflowSanityCheck(
  pot: BorrowingPotOption | undefined,
  movementDirection: 'in' | 'out',
  amountText: string,
  options?: {
    debtDirection: 'we_owe' | 'they_owe';
    balancePence: number;
  },
): {
  blocked: boolean;
  kind: 'overpay-blocked' | 'cash-blocked' | 'bank-warning' | null;
  message: string | null;
} {
  const amountPence = parsePence(amountText);
  if (amountPence === null || amountPence <= 0) {
    return { blocked: false, kind: null, message: null };
  }
  if (options !== undefined) {
    const isRepayment =
      (options.debtDirection === 'we_owe' && movementDirection === 'out') ||
      (options.debtDirection === 'they_owe' && movementDirection === 'in');
    const outstandingPence = Math.max(0, options.balancePence);
    if (isRepayment && amountPence > outstandingPence) {
      return {
        blocked: true,
        kind: 'overpay-blocked',
        message:
          outstandingPence === 0
            ? `Nothing is currently owed on this arrangement, so a repayment of ${formatPence(amountPence)} cannot be recorded.`
            : `This ${formatPence(amountPence)} repayment exceeds the ${formatPence(outstandingPence)} currently owed (by ${formatPence(amountPence - outstandingPence)}). Enter at most ${formatPence(outstandingPence)}.`,
      };
    }
  }
  if (movementDirection !== 'out' || pot === undefined) {
    return { blocked: false, kind: null, message: null };
  }
  if (pot.kind === 'cash') {
    const availablePence = pot.estimatePence ?? 0;
    if (amountPence > availablePence) {
      const shortfallPence = amountPence - availablePence;
      return {
        blocked: true,
        kind: 'cash-blocked',
        message: `${pot.label} only has ${formatPence(availablePence)} available — ${formatPence(shortfallPence)} short of this ${formatPence(amountPence)} payment. Choose another pot, or record a transfer or checkpoint on Accounts, Pots & Checkpoints first.`,
      };
    }
  }
  if (pot.kind === 'bank' && pot.estimatePence !== null && pot.estimatePence - amountPence < 0) {
    const deficitPence = amountPence - pot.estimatePence;
    return {
      blocked: false,
      kind: 'bank-warning',
      message: `Warning: this ${formatPence(amountPence)} payment will take ${pot.label} (currently ${formatPence(pot.estimatePence)}) below zero to −${formatPence(deficitPence)}.`,
    };
  }
  return { blocked: false, kind: null, message: null };
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

function actionHeading(direction: 'we_owe' | 'they_owe', movementDirection: 'in' | 'out'): string {
  if (direction === 'we_owe') {
    return movementDirection === 'in' ? 'Record borrowing' : 'Record a repayment';
  }
  return movementDirection === 'out' ? 'Record a loan out' : 'Record what they repaid';
}

/**
 * Inline record links and collapsible movement form inside a Person's card on
 * the Borrowing page (GitHub issue #63). Selecting "Record borrowing" or
 * "Record a repayment" (or the "they_owe" equivalents, or a ledger expected
 * row's "Record this month's £…" link) expands a compact inline section with
 * only the fields needed for that movement (Pot, Amount, When, Note), then
 * collapses after a brief 2000ms confirmation on save.
 */
export function PersonDebtRecord({
  debtId,
  direction,
  balancePence,
  pots,
  today,
  presetDirection = null,
  presetAmountPence = null,
}: {
  debtId: number;
  direction: 'we_owe' | 'they_owe';
  balancePence: number;
  pots: BorrowingPotOption[];
  today: string;
  presetDirection?: 'in' | 'out' | null;
  presetAmountPence?: number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeDirection, setActiveDirection] = useState<'in' | 'out' | null>(presetDirection);
  const [prefillPence, setPrefillPence] = useState<number | null>(presetAmountPence);
  const [formKey, setFormKey] = useState(0);
  const [justSucceeded, setJustSucceeded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    return () => clearTimer();
  }, []);

  useEffect(() => {
    if (presetDirection !== null) {
      clearTimer();
      setActiveDirection(presetDirection);
      setPrefillPence(presetAmountPence);
      setJustSucceeded(false);
      setFormKey((prev) => prev + 1);
    }
  }, [presetDirection, presetAmountPence]);

  const clearUrlPresets = () => {
    if (
      !searchParams.has('debt') &&
      !searchParams.has('what') &&
      !searchParams.has('amountPence')
    ) {
      return;
    }
    const next = new URLSearchParams(searchParams.toString());
    next.delete('debt');
    next.delete('what');
    next.delete('amountPence');
    const query = next.toString();
    router.replace(query === '' ? pathname : `${pathname}?${query}`, { scroll: false });
  };

  const handleSelectAction = (nextDirection: 'in' | 'out') => {
    clearTimer();
    if (activeDirection === nextDirection && !justSucceeded) {
      setActiveDirection(null);
      setPrefillPence(null);
      clearUrlPresets();
      return;
    }
    setActiveDirection(nextDirection);
    setPrefillPence(null);
    setJustSucceeded(false);
    setFormKey((prev) => prev + 1);
  };

  const handleClose = () => {
    clearTimer();
    setActiveDirection(null);
    setPrefillPence(null);
    setJustSucceeded(false);
    clearUrlPresets();
  };

  const handleSuccess = () => {
    clearTimer();
    setJustSucceeded(true);
    timerRef.current = setTimeout(() => {
      setActiveDirection(null);
      setPrefillPence(null);
      setJustSucceeded(false);
      clearUrlPresets();
    }, AUTO_COLLAPSE_MS);
  };

  const actions: ReadonlyArray<{ what: 'in' | 'out'; label: string }> =
    direction === 'we_owe'
      ? [
          { what: 'in', label: 'Record borrowing' },
          { what: 'out', label: 'Record a repayment' },
        ]
      : [
          { what: 'out', label: 'Record a loan out' },
          { what: 'in', label: 'Record what they repaid' },
        ];

  return (
    <div>
      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
        {actions.map((action) => {
          const isOpen = activeDirection === action.what;
          return (
            <a
              key={action.what}
              href={`?debt=${debtId}&what=${action.what}#debt-${debtId}`}
              aria-expanded={isOpen}
              onClick={(event) => {
                event.preventDefault();
                handleSelectAction(action.what);
              }}
              className={`sf-link ${isOpen ? 'font-semibold text-ink-body' : ''}`}
            >
              {action.label}
            </a>
          );
        })}
      </div>

      {activeDirection !== null ? (
        <div
          data-inline-record={debtId}
          className="mt-2 rounded-lg border border-border bg-canvas p-3"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
              {actionHeading(direction, activeDirection)}
            </h3>
            <button
              type="button"
              onClick={handleClose}
              className="text-xs font-medium text-ink-soft hover:text-ink-body"
            >
              Close
            </button>
          </div>
          <InlineDebtMovementForm
            key={`inline-${debtId}-${activeDirection}-${formKey}`}
            idPrefix={`debt-record-${debtId}`}
            debtId={debtId}
            debtDirection={direction}
            balancePence={balancePence}
            movementDirection={activeDirection}
            pots={pots}
            today={today}
            presetAmountPence={prefillPence}
            onSuccess={handleSuccess}
          />
        </div>
      ) : null}
    </div>
  );
}

function InlineDebtMovementForm({
  idPrefix,
  debtId,
  debtDirection,
  balancePence,
  movementDirection,
  pots,
  today,
  presetAmountPence,
  onSuccess,
}: {
  idPrefix: string;
  debtId: number;
  debtDirection: 'we_owe' | 'they_owe';
  balancePence: number;
  movementDirection: 'in' | 'out';
  pots: BorrowingPotOption[];
  today: string;
  presetAmountPence: number | null;
  onSuccess: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    addExternalMovementAction,
    initialActionState,
  );
  const [selectedPotId, setSelectedPotId] = useState<string>(
    pots[0] !== undefined ? String(pots[0].id) : '',
  );
  const [amountText, setAmountText] = useState<string>(
    presetAmountPence === null ? '' : penceInput(presetAmountPence),
  );
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  useEffect(() => {
    if (state.status === 'ok') {
      onSuccessRef.current();
    }
  }, [state]);

  if (pots.length === 0) {
    return (
      <p className="text-sm text-ink-soft">
        Create a pot first, then record borrowing — add one on{' '}
        <Link href="/pots" className="sf-link">
          Accounts, Pots &amp; Checkpoints
        </Link>
        .
      </p>
    );
  }

  const selectedPot = pots.find((pot) => String(pot.id) === selectedPotId) ?? pots[0];
  const sanityCheck = evaluateOutflowSanityCheck(selectedPot, movementDirection, amountText, {
    debtDirection,
    balancePence,
  });

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (sanityCheck.blocked) {
          event.preventDefault();
        }
      }}
      className="flex flex-col gap-2.5"
    >
      <input type="hidden" name="kind" value="loan" />
      <input type="hidden" name="debtId" value={debtId} />
      <input type="hidden" name="direction" value={movementDirection} />
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idPrefix}-pot`} className={labelClass}>
            Pot
          </label>
          <select
            id={`${idPrefix}-pot`}
            name="potId"
            required
            value={selectedPotId}
            onChange={(event) => setSelectedPotId(event.target.value)}
            className={inputClass}
          >
            {pots.map((pot) => (
              <option key={pot.id} value={pot.id}>
                {pot.label}
              </option>
            ))}
          </select>
        </div>
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
            placeholder="e.g. 200.00"
            value={amountText}
            onChange={(event) => setAmountText(event.target.value)}
            className={inputClass}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idPrefix}-date`} className={labelClass}>
            When
          </label>
          <input
            id={`${idPrefix}-date`}
            name="occurredDate"
            type="date"
            required
            defaultValue={today}
            max={today}
            className={inputClass}
          />
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
            className={inputClass}
          />
        </div>
      </div>
      {sanityCheck.message !== null ? (
        <p
          role={sanityCheck.blocked ? 'alert' : 'status'}
          aria-live="polite"
          className={
            sanityCheck.blocked
              ? 'rounded-md border border-danger bg-surface px-2.5 py-1.5 text-xs text-danger'
              : 'rounded-md border border-border-strong bg-warning-50 px-2.5 py-1.5 text-xs text-warning-900'
          }
        >
          {sanityCheck.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending || sanityCheck.blocked}
        className={`${submitClass} self-start`}
      >
        {pending ? 'Saving…' : 'Record it'}
      </button>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}

/**
 * Collapsible "Setup new Borrowing or lending" card below the ledger on the
 * Borrowing page (GitHub issue #63). Starts collapsed with a down arrow to
 * expand it, sets up new people only, and collapses 2000ms after a successful
 * save.
 */
export function BorrowSetupSection({
  idPrefix,
  pots,
  today,
}: {
  idPrefix: string;
  pots: BorrowingPotOption[];
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    return () => clearTimer();
  }, []);

  const handleToggle = () => {
    clearTimer();
    setOpen((prev) => !prev);
  };

  const handleSuccess = () => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      setOpen(false);
      setFormKey((prev) => prev + 1);
    }, AUTO_COLLAPSE_MS);
  };

  return (
    <section
      aria-labelledby="setup-heading"
      className="mt-6 rounded-xl border border-border bg-surface p-4 shadow-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="setup-heading" className="text-lg font-semibold">
          <button
            type="button"
            onClick={handleToggle}
            aria-expanded={open}
            aria-controls={`${idPrefix}-panel`}
            className="inline-flex items-center gap-2 text-left hover:text-accent"
          >
            <span>Setup new Borrowing or lending</span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className={`shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
            >
              <path d="M2.5 4.5L6 8L9.5 4.5" />
            </svg>
          </button>
        </h2>
      </div>
      <div id={`${idPrefix}-panel`} hidden={!open} className="mt-3">
        <p className="mb-3 text-sm text-ink-soft">
          Add someone new to track borrowing or lending with them — either as a recurring monthly
          arrangement, a one-off payment, or just tracking the person first.
        </p>
        <BorrowSetupForm
          key={`${idPrefix}-${formKey}`}
          idPrefix={idPrefix}
          pots={pots}
          today={today}
          onSuccess={handleSuccess}
        />
      </div>
    </section>
  );
}

/**
 * The Borrowing page's setup form (GitHub issues #60, #63): sets up a new
 * informal borrowing or lending arrangement. Posts `startBorrowingAction`.
 */
export function BorrowSetupForm({
  idPrefix,
  pots,
  today,
  onSuccess,
}: {
  idPrefix: string;
  pots: BorrowingPotOption[];
  today: string;
  onSuccess?: () => void;
}) {
  const [state, formAction, pending] = useActionState(startBorrowingAction, initialActionState);
  const [direction, setDirection] = useState<'we_owe' | 'they_owe'>('we_owe');
  const [plan, setPlan] = useState<'recurring' | 'one-off' | 'none'>('recurring');
  const [movementDirection, setMovementDirection] = useState<'in' | 'out' | null>(null);
  const [selectedPotId, setSelectedPotId] = useState<string>(
    pots[0] !== undefined ? String(pots[0].id) : '',
  );
  const [oneOffAmountText, setOneOffAmountText] = useState<string>('');
  const [dayOfMonth, setDayOfMonth] = useState('13');
  const [untilDate, setUntilDate] = useState('');
  const [paymentCount, setPaymentCount] = useState('5');
  const [helperNote, setHelperNote] = useState<string | null>(null);

  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  useEffect(() => {
    if (state.status === 'ok') {
      onSuccessRef.current?.();
    }
  }, [state]);

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

  const weOwe = direction === 'we_owe';
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

  const selectedPot = pots.find((pot) => String(pot.id) === selectedPotId) ?? pots[0];
  const oneOffSanityCheck =
    plan === 'one-off'
      ? evaluateOutflowSanityCheck(selectedPot, effectiveMovementDirection, oneOffAmountText)
      : { blocked: false, kind: null, message: null };

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (oneOffSanityCheck.blocked) {
          event.preventDefault();
        }
      }}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="trackMode" value="new" />
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

      {plan === 'recurring' ? (
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

      {plan === 'one-off' ? (
        <>
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
              <select
                id={`${idPrefix}-pot`}
                name="potId"
                required
                value={selectedPotId}
                onChange={(event) => setSelectedPotId(event.target.value)}
                className={inputClass}
              >
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
                value={oneOffAmountText}
                onChange={(event) => setOneOffAmountText(event.target.value)}
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
          {oneOffSanityCheck.message !== null ? (
            <p
              role={oneOffSanityCheck.kind === 'cash-blocked' ? 'alert' : 'status'}
              aria-live="polite"
              className={
                oneOffSanityCheck.kind === 'cash-blocked'
                  ? 'rounded-md border border-danger bg-surface px-2.5 py-1.5 text-xs text-danger'
                  : 'rounded-md border border-border-strong bg-warning-50 px-2.5 py-1.5 text-xs text-warning-900'
              }
            >
              {oneOffSanityCheck.message}
            </p>
          ) : null}
        </>
      ) : null}

      <button
        type="submit"
        disabled={pending || oneOffSanityCheck.blocked}
        className={`${submitClass} self-start`}
      >
        {pending
          ? 'Saving…'
          : plan === 'one-off'
            ? 'Start tracking and record it'
            : 'Start tracking'}
      </button>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}
