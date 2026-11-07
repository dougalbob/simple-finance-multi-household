'use client';

import Link from 'next/link';
import { useActionState, useEffect, useRef, useState } from 'react';
import {
  attachClaimPurchasesAction,
  createClaimAction,
  detachClaimPurchaseAction,
  editClaimAction,
  settleClaimDirectAction,
  settleClaimIntoPotAction,
  voidClaimAction,
  voidSettlementAction,
} from '@/app/actions';
import { initialActionState } from '@/lib/action-state';
import { formatPence, penceInput } from '@/lib/money';
import type { ClaimWithDetails, ClaimablePurchase } from '@/lib/records/claims';
import type { PotKind } from '@/lib/records/pots';

export interface ClaimPotOption {
  id: number;
  label: string;
  kind: PotKind;
}

export interface ReducibleDebtOption {
  id: number;
  counterparty: string;
  direction: 'we_owe' | 'they_owe';
  /** Derived outstanding owed on that IOU, for the sanity check the domain enforces again. */
  balancePence: number;
}

const inputClass =
  'rounded border border-border-strong bg-surface px-2.5 py-1.5 text-sm focus:border-border-emphasis focus:outline-none';
const labelClass = 'text-xs font-medium text-ink-soft';
const submitClass =
  'rounded bg-till px-3 py-1.5 text-sm font-medium text-till-ink disabled:opacity-60';
const quietSubmitClass =
  'rounded border border-border-strong bg-surface px-3 py-1.5 text-sm font-medium text-ink-body disabled:opacity-60';
const dangerSubmitClass =
  'rounded border border-danger bg-surface px-3 py-1.5 text-sm font-medium text-danger disabled:opacity-60';

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

/** Reset a form after a successful save, the borrowed way (remount on ok). */
function useResetOnSuccess(state: { status: string }): number {
  const [formKey, setFormKey] = useState(0);
  const seen = useRef(state);
  useEffect(() => {
    if (state !== seen.current) {
      seen.current = state;
      if (state.status === 'ok') setFormKey((prev) => prev + 1);
    }
  }, [state]);
  return formKey;
}

interface ClaimsSectionProps {
  openClaims: ClaimWithDetails[];
  closedClaims: ClaimWithDetails[];
  candidates: ClaimablePurchase[];
  pots: ClaimPotOption[];
  reducibleDebts: ReducibleDebtOption[];
  counterpartySuggestions: string[];
  /** The current page search for the purchase picker (?claimQ=), blank when unset. */
  claimQ: string;
  today: string;
}

/**
 * The "Money owed to us" card (issue 124, SPEC §10.3): money the household
 * fronted and expects back from a third party. Everything derives from the
 * claims and their linked purchases — nothing here moves a pot.
 */
export function ClaimsSection({
  openClaims,
  closedClaims,
  candidates,
  pots,
  reducibleDebts,
  counterpartySuggestions,
  claimQ,
  today,
}: ClaimsSectionProps) {
  const openOutstanding = openClaims.reduce(
    (sum, entry) => sum + Math.max(0, entry.outstandingPence),
    0,
  );
  return (
    <section
      id="claims"
      aria-labelledby="claims-heading"
      className="sf-anchor mt-6 rounded-xl border border-border bg-surface p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="claims-heading" className="text-lg font-semibold">
          Money owed to us — expected back
        </h2>
        {openClaims.length > 0 ? (
          <span className="text-sm font-semibold tabular-nums">
            {formatPence(openOutstanding)} awaited
          </span>
        ) : null}
      </div>
      <p className="mt-1 max-w-3xl text-sm text-ink-soft">
        Costs you fronted for somebody else — an estate, an insurer, an employer — that they have
        promised to repay. The spending stays in your charts; this remembers what is still owed to
        you, and closes it when the money arrives or is paid directly elsewhere.
      </p>

      <ul className="mt-3 divide-y divide-border-hairline">
        {openClaims.map((entry) => (
          <OpenClaimCard
            key={entry.claim.id}
            entry={entry}
            pots={pots}
            reducibleDebts={reducibleDebts}
            candidates={candidates}
            today={today}
          />
        ))}
        {openClaims.length === 0 ? (
          <li className="py-3 text-sm text-ink-muted">
            Nothing awaited right now — track one below when a third party owes you money back.
          </li>
        ) : null}
      </ul>

      <ClaimSetupSection
        candidates={candidates}
        counterpartySuggestions={counterpartySuggestions}
        claimQ={claimQ}
      />

      {closedClaims.length > 0 ? <SettledClaimsList claims={closedClaims} /> : null}
    </section>
  );
}

function CandidateList({
  candidates,
  idPrefix,
  limit = 50,
}: {
  candidates: ClaimablePurchase[];
  idPrefix: string;
  limit?: number;
}) {
  if (candidates.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border-strong bg-canvas px-3 py-2 text-sm text-ink-muted">
        No claimable purchases match — every purchase is either already on a claim, voided, a
        refund, or hidden by the search.
      </p>
    );
  }
  return (
    <fieldset className="max-h-64 overflow-y-auto rounded-lg border border-border-hairline">
      <legend className="sr-only">Purchases this claim covers</legend>
      <ul className="divide-y divide-border-hairline">
        {candidates.slice(0, limit).map((candidate) => (
          <li key={candidate.id}>
            <label
              htmlFor={`${idPrefix}-purchase-${candidate.id}`}
              className="flex cursor-pointer items-baseline gap-2 px-3 py-2 text-sm hover:bg-canvas"
            >
              <input
                id={`${idPrefix}-purchase-${candidate.id}`}
                type="checkbox"
                name="purchaseId"
                value={candidate.id}
                className="mt-0.5 self-center"
              />
              <span className="whitespace-nowrap tabular-nums text-ink-muted">
                {candidate.occurredDate}
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-medium">
                  {candidate.supplierName ?? 'Unspecified supplier'}
                </span>
                {candidate.note === null ? null : (
                  <span className="block truncate text-xs text-ink-muted">{candidate.note}</span>
                )}
                <span className="block text-xs text-ink-muted">{candidate.potLabel}</span>
              </span>
              <span className="whitespace-nowrap tabular-nums">
                {formatPence(candidate.totalPence)}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

function PurchaseSearchForm({ claimQ }: { claimQ: string }) {
  return (
    <form method="get" action="/borrowing" className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1">
        <label htmlFor="claim-search" className={labelClass}>
          Search the purchases the claim covers
        </label>
        <input
          id="claim-search"
          type="search"
          name="claimQ"
          defaultValue={claimQ}
          placeholder="supplier, note or date"
          className={inputClass}
        />
      </div>
      <button type="submit" className={quietSubmitClass}>
        Search
      </button>
    </form>
  );
}

function ClaimSetupSection({
  candidates,
  counterpartySuggestions,
  claimQ,
}: {
  candidates: ClaimablePurchase[];
  counterpartySuggestions: string[];
  claimQ: string;
}) {
  const [state, formAction, pending] = useActionState(createClaimAction, initialActionState);
  const formKey = useResetOnSuccess(state);
  return (
    <details className="mt-3 rounded-lg border border-border-hairline bg-canvas">
      <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-ink-body">
        Track money you expect back
      </summary>
      <div className="border-t border-border-hairline p-4">
        <PurchaseSearchForm claimQ={claimQ} />
        <form key={formKey} action={formAction} className="mt-3 flex flex-col gap-3">
          <div className="flex flex-wrap gap-3">
            <div className="flex min-w-56 flex-1 flex-col gap-1">
              <label htmlFor="claim-counterparty" className={labelClass}>
                Who owes you the money?
              </label>
              <input
                id="claim-counterparty"
                name="counterparty"
                required
                list="claim-counterparties"
                placeholder="e.g. Mum's estate"
                className={inputClass}
              />
              <datalist id="claim-counterparties">
                {counterpartySuggestions.map((suggestion) => (
                  <option key={suggestion} value={suggestion} />
                ))}
              </datalist>
            </div>
            <div className="flex min-w-56 flex-1 flex-col gap-1">
              <label htmlFor="claim-note" className={labelClass}>
                What for? (optional)
              </label>
              <input
                id="claim-note"
                name="note"
                placeholder="e.g. wake costs"
                className={inputClass}
              />
            </div>
          </div>
          <CandidateList candidates={candidates} idPrefix="new-claim" />
          <div>
            <button type="submit" disabled={pending} className={submitClass}>
              {pending ? 'Saving…' : 'Start tracking'}
            </button>
          </div>
          <FormMessage status={state.status} message={state.message} />
        </form>
      </div>
    </details>
  );
}

function OpenClaimCard({
  entry,
  pots,
  reducibleDebts,
  candidates,
  today,
}: {
  entry: ClaimWithDetails;
  pots: ClaimPotOption[];
  reducibleDebts: ReducibleDebtOption[];
  candidates: ClaimablePurchase[];
  today: string;
}) {
  const { claim } = entry;
  return (
    <li id={`claim-${claim.id}`} className="sf-anchor py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="font-medium">{claim.counterparty}</span>
          {claim.note === null ? null : (
            <span className="block text-xs text-ink-muted">{claim.note}</span>
          )}
        </div>
        <span className="tabular-nums text-sm font-semibold">
          {formatPence(entry.outstandingPence)} awaited
        </span>
      </div>
      <ul className="mt-1.5 divide-y divide-border-hairline rounded-lg border border-border-hairline text-sm">
        {entry.purchases.map((purchase) => (
          <li
            key={purchase.purchaseId}
            className="flex flex-wrap items-baseline gap-2 border-border-hairline px-3 py-1.5"
          >
            <span className="whitespace-nowrap text-xs tabular-nums text-ink-muted">
              {purchase.occurredDate}
            </span>
            <Link
              href={`/purchases?purchaseId=${purchase.purchaseId}#purchase-${purchase.purchaseId}`}
              className="min-w-0 flex-1 sf-link"
            >
              {purchase.supplierName ?? 'Unspecified supplier'}
            </Link>
            <span className="whitespace-nowrap tabular-nums">
              {formatPence(purchase.totalPence)}
            </span>
            <DetachPurchaseForm
              claimId={claim.id}
              purchaseId={purchase.purchaseId}
              version={claim.version}
            />
          </li>
        ))}
      </ul>
      <ClaimSettlements entry={entry} />
      <div className="mt-2 flex flex-wrap items-start gap-2">
        <SettleIntoPotForm
          claimId={claim.id}
          version={claim.version}
          outstandingPence={entry.outstandingPence}
          pots={pots}
          today={today}
        />
        <SettleDirectForm
          claimId={claim.id}
          version={claim.version}
          outstandingPence={entry.outstandingPence}
          reducibleDebts={reducibleDebts}
          today={today}
        />
        <AttachPurchasesForm claimId={claim.id} version={claim.version} candidates={candidates} />
        <EditClaimForm
          claimId={claim.id}
          version={claim.version}
          counterparty={claim.counterparty}
          note={claim.note}
        />
        <VoidClaimForm
          claimId={claim.id}
          version={claim.version}
          counterparty={claim.counterparty}
        />
      </div>
    </li>
  );
}

function DetachPurchaseForm({
  claimId,
  purchaseId,
  version,
}: {
  claimId: number;
  purchaseId: number;
  version: number;
}) {
  const [state, formAction, pending] = useActionState(
    detachClaimPurchaseAction,
    initialActionState,
  );
  const [confirming, setConfirming] = useState(false);
  if (state.status === 'ok' || confirming) {
    return (
      <form action={formAction} className="flex flex-wrap items-center gap-1">
        <input type="hidden" name="claimId" value={claimId} />
        <input type="hidden" name="purchaseId" value={purchaseId} />
        <input type="hidden" name="expectedVersion" value={version} />
        {state.status === 'ok' ? (
          <span className="text-xs text-positive">Detached</span>
        ) : (
          <>
            <button
              type="submit"
              disabled={pending}
              className="text-xs font-medium text-danger sf-link"
            >
              Detach
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-xs text-ink-muted"
            >
              keep
            </button>
          </>
        )}
      </form>
    );
  }
  return (
    <button type="button" onClick={() => setConfirming(true)} className="text-xs text-ink-muted">
      Detach
    </button>
  );
}

function AttachPurchasesForm({
  claimId,
  version,
  candidates,
}: {
  claimId: number;
  version: number;
  candidates: ClaimablePurchase[];
}) {
  const [state, formAction, pending] = useActionState(
    attachClaimPurchasesAction,
    initialActionState,
  );
  const formKey = useResetOnSuccess(state);
  return (
    <details className="rounded-lg border border-border-hairline">
      <summary className="cursor-pointer px-3 py-1.5 text-xs font-medium text-ink-soft">
        Attach more costs
      </summary>
      <form
        key={formKey}
        action={formAction}
        className="flex flex-col gap-2 border-t border-border-hairline p-3"
      >
        <input type="hidden" name="claimId" value={claimId} />
        <input type="hidden" name="expectedVersion" value={version} />
        <CandidateList candidates={candidates} idPrefix={`attach-${claimId}`} limit={8} />
        <div>
          <button type="submit" disabled={pending} className={quietSubmitClass}>
            {pending ? 'Attaching…' : 'Attach'}
          </button>
        </div>
        <FormMessage status={state.status} message={state.message} />
      </form>
    </details>
  );
}

function ClaimSettlements({ entry }: { entry: ClaimWithDetails }) {
  const settlements = entry.settlements;
  if (settlements.length === 0) return null;
  return (
    <ul className="mt-1.5 divide-y divide-border-hairline rounded-lg border border-border-hairline bg-canvas text-xs">
      {settlements.map((settlement) => (
        <li key={settlement.id} className="flex flex-wrap items-baseline gap-2 px-3 py-1.5">
          <span className="whitespace-nowrap tabular-nums text-ink-muted">
            {settlement.occurredDate}
          </span>
          <span className="min-w-0 flex-1">
            {settlement.kind === 'pot'
              ? 'Settled into a pot — recorded as income'
              : 'Settled outside the pots'}
            {settlement.reducesDebtId === null ? null : ' · clears an informal IOU'}
            {settlement.note === null ? null : (
              <span className="block text-ink-muted">{settlement.note}</span>
            )}
          </span>
          <span className="whitespace-nowrap tabular-nums">
            {formatPence(settlement.amountPence)}
          </span>
          <VoidSettlementForm settlementId={settlement.id} settlementVersion={settlement.version} />
        </li>
      ))}
    </ul>
  );
}

function VoidSettlementForm({
  settlementId,
  settlementVersion,
}: {
  settlementId: number;
  settlementVersion: number;
}) {
  const [state, formAction, pending] = useActionState(voidSettlementAction, initialActionState);
  if (state.status === 'ok') {
    return <span className="whitespace-nowrap text-xs text-positive">Voided</span>;
  }
  return (
    <details>
      <summary className="cursor-pointer text-xs text-ink-muted">Void</summary>
      <form action={formAction} className="mt-1 flex flex-wrap items-center gap-1">
        <input type="hidden" name="settlementId" value={settlementId} />
        <input type="hidden" name="expectedVersion" value={settlementVersion} />
        <label className="sr-only" htmlFor={`void-settlement-${settlementId}`}>
          Why is this being voided?
        </label>
        <input
          id={`void-settlement-${settlementId}`}
          name="reason"
          required
          placeholder="why?"
          className={`${inputClass} w-40`}
        />
        <button type="submit" disabled={pending} className="text-xs font-medium text-danger">
          Void it
        </button>
        <FormMessage status={state.status} message={state.message} />
      </form>
    </details>
  );
}

function SettleIntoPotForm({
  claimId,
  version,
  outstandingPence,
  pots,
  today,
}: {
  claimId: number;
  version: number;
  outstandingPence: number;
  pots: ClaimPotOption[];
  today: string;
}) {
  const [state, formAction, pending] = useActionState(settleClaimIntoPotAction, initialActionState);
  const formKey = useResetOnSuccess(state);
  return (
    <details className="rounded-lg border border-accent">
      <summary className="cursor-pointer px-3 py-1.5 text-xs font-medium text-accent-800">
        The money arrived
      </summary>
      <form
        key={formKey}
        action={formAction}
        className="flex flex-col gap-2 border-t border-border-hairline p-3"
      >
        <input type="hidden" name="claimId" value={claimId} />
        <input type="hidden" name="expectedVersion" value={version} />
        <div className="flex flex-wrap gap-2">
          <div className="flex min-w-44 flex-col gap-1">
            <label htmlFor={`settle-pot-${claimId}`} className={labelClass}>
              Which pot did it land in?
            </label>
            <select id={`settle-pot-${claimId}`} name="potId" required className={inputClass}>
              {pots.map((pot) => (
                <option key={pot.id} value={pot.id}>
                  {pot.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-32 flex-col gap-1">
            <label htmlFor={`settle-amount-${claimId}`} className={labelClass}>
              Amount
            </label>
            <input
              id={`settle-amount-${claimId}`}
              name="amount"
              inputMode="decimal"
              defaultValue={penceInput(outstandingPence)}
              className={inputClass}
            />
          </div>
          <div className="flex min-w-36 flex-col gap-1">
            <label htmlFor={`settle-date-${claimId}`} className={labelClass}>
              When?
            </label>
            <input
              id={`settle-date-${claimId}`}
              type="date"
              name="occurredDate"
              defaultValue={today}
              max={today}
              className={inputClass}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`settle-note-${claimId}`} className={labelClass}>
            Note (optional)
          </label>
          <input
            id={`settle-note-${claimId}`}
            name="note"
            placeholder="e.g. estate paid into the main account"
            className={inputClass}
          />
        </div>
        <div>
          <button type="submit" disabled={pending} className={submitClass}>
            {pending ? 'Saving…' : 'Record the income and settle'}
          </button>
        </div>
        <p className="text-xs text-ink-muted">
          Saves one-off income in the same step — never spending, and never invented money.
        </p>
        <FormMessage status={state.status} message={state.message} />
      </form>
    </details>
  );
}

function SettleDirectForm({
  claimId,
  version,
  outstandingPence,
  reducibleDebts,
  today,
}: {
  claimId: number;
  version: number;
  outstandingPence: number;
  reducibleDebts: ReducibleDebtOption[];
  today: string;
}) {
  const [state, formAction, pending] = useActionState(settleClaimDirectAction, initialActionState);
  const formKey = useResetOnSuccess(state);
  return (
    <details className="rounded-lg border border-border-hairline">
      <summary className="cursor-pointer px-3 py-1.5 text-xs font-medium text-ink-soft">
        Paid directly, not into a pot
      </summary>
      <form
        key={formKey}
        action={formAction}
        className="flex flex-col gap-2 border-t border-border-hairline p-3"
      >
        <input type="hidden" name="claimId" value={claimId} />
        <input type="hidden" name="expectedVersion" value={version} />
        <div className="flex flex-wrap gap-2">
          <div className="flex min-w-32 flex-col gap-1">
            <label htmlFor={`direct-amount-${claimId}`} className={labelClass}>
              Amount
            </label>
            <input
              id={`direct-amount-${claimId}`}
              name="amount"
              inputMode="decimal"
              defaultValue={penceInput(outstandingPence)}
              className={inputClass}
            />
          </div>
          <div className="flex min-w-36 flex-col gap-1">
            <label htmlFor={`direct-date-${claimId}`} className={labelClass}>
              When?
            </label>
            <input
              id={`direct-date-${claimId}`}
              type="date"
              name="occurredDate"
              defaultValue={today}
              max={today}
              className={inputClass}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`direct-note-${claimId}`} className={labelClass}>
            Where did the money go?
          </label>
          <input
            id={`direct-note-${claimId}`}
            name="note"
            required
            placeholder="e.g. estate paid Sam directly — she fronted the money"
            className={inputClass}
          />
        </div>
        {reducibleDebts.length > 0 ? (
          <div className="flex flex-col gap-1">
            <label htmlFor={`direct-debt-${claimId}`} className={labelClass}>
              Also clear an informal IOU? (optional)
            </label>
            <select
              id={`direct-debt-${claimId}`}
              name="reduceDebtId"
              className={inputClass}
              defaultValue=""
            >
              <option value="">(leave the IOUs alone)</option>
              {reducibleDebts.map((debt) => (
                <option key={debt.id} value={debt.id}>
                  {debt.counterparty} —{' '}
                  {debt.direction === 'we_owe'
                    ? `we owe ${formatPence(debt.balancePence)}`
                    : `owed to us ${formatPence(debt.balancePence)}`}
                </option>
              ))}
            </select>
            <p className="text-xs text-ink-muted">
              The IOU drops by the settled amount — one audited step, no pot movement.
            </p>
          </div>
        ) : null}
        <div>
          <button type="submit" disabled={pending} className={quietSubmitClass}>
            {pending ? 'Saving…' : 'Settle without moving money'}
          </button>
        </div>
        <FormMessage status={state.status} message={state.message} />
      </form>
    </details>
  );
}

function EditClaimForm({
  claimId,
  version,
  counterparty,
  note,
}: {
  claimId: number;
  version: number;
  counterparty: string;
  note: string | null;
}) {
  const [state, formAction, pending] = useActionState(editClaimAction, initialActionState);
  return (
    <details className="rounded-lg border border-border-hairline">
      <summary className="cursor-pointer px-3 py-1.5 text-xs font-medium text-ink-soft">
        Edit
      </summary>
      <form action={formAction} className="flex flex-col gap-2 border-t border-border-hairline p-3">
        <input type="hidden" name="claimId" value={claimId} />
        <input type="hidden" name="expectedVersion" value={version} />
        <div className="flex flex-col gap-1">
          <label htmlFor={`edit-claim-${claimId}`} className={labelClass}>
            Who owes you the money?
          </label>
          <input
            id={`edit-claim-${claimId}`}
            name="counterparty"
            required
            defaultValue={counterparty}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`edit-note-${claimId}`} className={labelClass}>
            Note
          </label>
          <input
            id={`edit-note-${claimId}`}
            name="note"
            defaultValue={note ?? ''}
            className={inputClass}
          />
        </div>
        <div>
          <button type="submit" disabled={pending} className={quietSubmitClass}>
            {pending ? 'Saving…' : 'Save'}
          </button>
        </div>
        <FormMessage status={state.status} message={state.message} />
      </form>
    </details>
  );
}

function VoidClaimForm({
  claimId,
  version,
  counterparty,
}: {
  claimId: number;
  version: number;
  counterparty: string;
}) {
  const [state, formAction, pending] = useActionState(voidClaimAction, initialActionState);
  const [confirming, setConfirming] = useState(false);
  if (state.status === 'ok') {
    return <span className="px-3 py-1.5 text-xs text-positive">Voided</span>;
  }
  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className={dangerSubmitClass}>
        Void
      </button>
    );
  }
  return (
    <form
      action={formAction}
      className="flex w-full flex-col gap-2 rounded-lg border border-danger p-3"
    >
      <input type="hidden" name="claimId" value={claimId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <p className="text-sm font-medium text-ink-body">Void the claim on “{counterparty}”?</p>
      <p className="text-xs text-ink-soft">
        The claim and any settlements linked to it are voided. Income that already arrived stays
        recorded — the money really moved. The purchases are released for a future claim. History is
        kept.
      </p>
      <label className="flex flex-col gap-1">
        <span className={labelClass}>Why?</span>
        <input
          name="reason"
          required
          placeholder="e.g. tracked against the wrong purchase"
          className={inputClass}
        />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={dangerSubmitClass}>
          {pending ? 'Voiding…' : 'Yes, void the claim'}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className={quietSubmitClass}>
          Keep it
        </button>
      </div>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}

function SettledClaimsList({ claims }: { claims: ClaimWithDetails[] }) {
  return (
    <details className="mt-3 rounded-lg border border-border-hairline">
      <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-ink-soft">
        Settled and closed ({claims.length})
      </summary>
      <ul className="divide-y divide-border-hairline border-t border-border-hairline">
        {claims.map((entry) => (
          <li
            key={entry.claim.id}
            className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2 text-sm"
          >
            <span>
              <span className="font-medium">{entry.claim.counterparty}</span>
              {entry.claim.closedReason === 'cancelled' ? (
                <span className="ml-2 text-xs text-ink-muted">cancelled</span>
              ) : null}
              {entry.claim.note === null ? null : (
                <span className="mt-0.5 block text-xs text-ink-muted">{entry.claim.note}</span>
              )}
            </span>
            <span className="text-xs tabular-nums text-ink-muted">
              {formatPence(entry.claimedPence)} ·{' '}
              {entry.claim.closedAt === null
                ? ''
                : new Intl.DateTimeFormat('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  }).format(entry.claim.closedAt)}
            </span>
            {entry.settlements.length > 0 ? (
              <span className="w-full text-xs text-ink-muted">
                Void a settlement to reopen the claim and settle again.
              </span>
            ) : null}
            <ClaimSettlements entry={entry} />
          </li>
        ))}
      </ul>
    </details>
  );
}
