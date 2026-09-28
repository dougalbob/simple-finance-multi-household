'use client';

import { useActionState } from 'react';
import { addCheckpointAction, createPotAction } from '@/app/actions';
import { initialActionState } from '@/lib/action-state';

/**
 * Phase 1 entry forms (mobile-friendly; the real "walking out of Tesco"
 * quick-entry flows arrive in Phase 2/3 per docs/IMPLEMENTATION_PLAN.md).
 * Messages are announced with aria-live and always carry text, never colour
 * alone (blueprint §5 accessibility rule).
 */

function FormMessage({ status, message }: { status: string; message: string | null }) {
  if (message === null) return null;
  return (
    <p
      role="status"
      aria-live="polite"
      className={
        status === 'error'
          ? 'text-sm text-danger'
          : status === 'ok'
            ? 'text-sm text-positive'
            : 'text-sm text-ink-soft'
      }
    >
      {message}
    </p>
  );
}

export function CreatePotForm({ people }: { people: Array<{ id: number; label: string }> }) {
  const [state, formAction, pending] = useActionState(createPotAction, initialActionState);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="pot-label" className="text-sm font-medium">
          Pot name
        </label>
        <input
          id="pot-label"
          name="label"
          type="text"
          required
          maxLength={60}
          placeholder="e.g. Main account"
          className="rounded border border-border-strong bg-surface px-3 py-2 text-base"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="pot-kind" className="text-sm font-medium">
          Type
        </label>
        <select
          id="pot-kind"
          name="kind"
          className="rounded border border-border-strong bg-surface px-3 py-2 text-base"
        >
          <option value="bank">Bank account</option>
          <option value="cash">Cash</option>
          <option value="credit-card">Credit card</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="pot-owner" className="text-sm font-medium">
          Owner (optional)
        </label>
        <select
          id="pot-owner"
          name="ownerPersonId"
          className="rounded border border-border-strong bg-surface px-3 py-2 text-base"
        >
          <option value="">Shared / not assigned</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-ink-muted">
          A cash pot with an owner opens for that person in Quick Entry → Checkpoint cash.
        </p>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-till px-4 py-2 font-medium text-till-ink disabled:opacity-60"
      >
        {pending ? 'Saving…' : 'Add pot'}
      </button>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}

export function AddCheckpointForm({
  pots,
}: {
  pots: Array<{ id: number; label: string; kind: 'bank' | 'cash' | 'credit-card' }>;
}) {
  const [state, formAction, pending] = useActionState(addCheckpointAction, initialActionState);
  if (pots.length === 0) {
    return (
      <p className="text-sm text-ink-soft">
        Create a pot first, then you can record what it currently holds.
      </p>
    );
  }
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="checkpoint-pot" className="text-sm font-medium">
          Pot
        </label>
        <select
          id="checkpoint-pot"
          name="potId"
          className="rounded border border-border-strong bg-surface px-3 py-2 text-base"
        >
          {pots.map((pot) => (
            <option key={pot.id} value={pot.id}>
              {pot.kind === 'credit-card' ? `${pot.label} (credit card)` : pot.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="checkpoint-amount" className="text-sm font-medium">
          Balance right now
        </label>
        <input
          id="checkpoint-amount"
          name="amount"
          type="text"
          inputMode="decimal"
          required
          placeholder="e.g. 412.35"
          className="rounded border border-border-strong bg-surface px-3 py-2 text-base"
        />
        <p className="text-xs text-ink-muted">
          Enter the bank&apos;s current/ledger balance, or counted cash. For a credit card, enter
          the amount owed as a negative figure (for example, -123.45).
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="checkpoint-note" className="text-sm font-medium">
          Note (optional)
        </label>
        <input
          id="checkpoint-note"
          name="note"
          type="text"
          maxLength={280}
          placeholder="e.g. counted the cash"
          className="rounded border border-border-strong bg-surface px-3 py-2 text-base"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-till px-4 py-2 font-medium text-till-ink disabled:opacity-60"
      >
        {pending ? 'Saving…' : 'Save checkpoint'}
      </button>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}
