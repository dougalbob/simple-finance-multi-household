'use client';

import { useActionState } from 'react';
import { addPersonAction } from '@/app/actions';
import { initialActionState } from '@/lib/action-state';

/**
 * The first step of the setup path (docs/ONBOARDING_PLAN.md, Slice 1): one
 * field and the same server action the old home card used, which already
 * enforces the one-or-two rule and audits the change. The form only adds the
 * "where am I" context — a household of one is complete, so it never asks for
 * a second person as though one were missing.
 */
export function AddPersonForm() {
  const [state, formAction, pending] = useActionState(addPersonAction, initialActionState);
  return (
    <form
      action={formAction}
      aria-label="Add person"
      className="rounded-lg border border-accent-100 bg-surface p-3"
    >
      <p className="mb-2 text-sm font-semibold text-ink-body">Add person</p>
      <label htmlFor="setup-add-person-label" className="block text-xs text-ink-muted">
        Name (up to 60 characters)
      </label>
      <input
        id="setup-add-person-label"
        name="label"
        type="text"
        required
        maxLength={60}
        placeholder="e.g. Alex"
        className={inputClass}
      />
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? 'Saving…' : 'Add person'}
      </button>
      <Message status={state.status} message={state.message} />
    </form>
  );
}

function Message({ status, message }: { status: string; message: string | null }) {
  if (message === null) return null;
  return (
    <p
      role="status"
      className={`mt-2 text-sm ${status === 'error' ? 'text-danger' : 'text-positive'}`}
    >
      {message}
    </p>
  );
}

const inputClass =
  'mt-1 block w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-faint focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200';
const buttonClass =
  'mt-3 rounded-lg bg-till px-4 py-2 font-semibold text-till-ink disabled:opacity-50';
