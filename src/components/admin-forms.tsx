'use client';

import { useActionState } from 'react';
import {
  assignIdentityAction,
  createHouseholdAction,
  renameHouseholdAction,
  setHouseholdStatusAction,
  unassignIdentityAction,
} from '@/app/admin/actions';
import { initialActionState } from '@/lib/action-state';

const inputClass =
  'rounded border border-border-strong bg-surface px-2.5 py-1.5 text-sm focus:border-border-emphasis focus:outline-none';
const labelClass = 'text-xs font-medium text-ink-soft';
const submitClass =
  'rounded bg-till px-3 py-1.5 text-sm font-medium text-till-ink disabled:opacity-60';
const quietSubmitClass =
  'rounded border border-border-strong px-3 py-1.5 text-sm font-medium disabled:opacity-60';

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

/** Create a household (identity assignments follow on its card). */
export function CreateHouseholdForm() {
  const [state, formAction, pending] = useActionState(createHouseholdAction, initialActionState);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <label htmlFor="admin-new-household-name" className={labelClass}>
          Household name
        </label>
        <input
          id="admin-new-household-name"
          name="displayName"
          type="text"
          required
          minLength={1}
          maxLength={80}
          placeholder="e.g. The Smiths"
          className={inputClass}
        />
      </div>
      <button type="submit" disabled={pending} className={`${submitClass} self-start`}>
        {pending ? 'Creating…' : 'Create household'}
      </button>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}

export interface RenameHouseholdFormProps {
  householdId: string;
  currentName: string;
}

export function RenameHouseholdForm({ householdId, currentName }: RenameHouseholdFormProps) {
  const [state, formAction, pending] = useActionState(renameHouseholdAction, initialActionState);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="householdId" value={householdId} />
      <div className="flex flex-col gap-1">
        <label htmlFor={`admin-rename-${householdId}`} className={labelClass}>
          Name
        </label>
        <input
          id={`admin-rename-${householdId}`}
          name="displayName"
          type="text"
          required
          minLength={1}
          maxLength={80}
          defaultValue={currentName}
          className={inputClass}
        />
      </div>
      <button type="submit" disabled={pending} className={`${quietSubmitClass} self-start`}>
        {pending ? 'Saving…' : 'Save name'}
      </button>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}

export interface AssignIdentityFormProps {
  householdId: string;
  slotsLeft: number;
}

export function AssignIdentityForm({ householdId, slotsLeft }: AssignIdentityFormProps) {
  const [state, formAction, pending] = useActionState(assignIdentityAction, initialActionState);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="householdId" value={householdId} />
      <div className="flex flex-col gap-1">
        <label htmlFor={`admin-assign-${householdId}`} className={labelClass}>
          Sign-in email to assign ({slotsLeft} of 2 places left)
        </label>
        <input
          id={`admin-assign-${householdId}`}
          name="email"
          type="email"
          required
          maxLength={254}
          placeholder="person@example.com"
          className={inputClass}
        />
      </div>
      <button type="submit" disabled={pending} className={`${submitClass} self-start`}>
        {pending ? 'Assigning…' : 'Assign to this household'}
      </button>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}

export interface UnassignIdentityFormProps {
  email: string;
}

export function UnassignIdentityForm({ email }: UnassignIdentityFormProps) {
  const [state, formAction, pending] = useActionState(unassignIdentityAction, initialActionState);
  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="email" value={email} />
      <button
        type="submit"
        disabled={pending}
        aria-label={`Unassign ${email}`}
        className={`${quietSubmitClass} shrink-0 self-start whitespace-nowrap`}
      >
        {pending ? 'Removing…' : 'Unassign'}
      </button>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}

export interface SetHouseholdStatusFormProps {
  householdId: string;
  status: 'active' | 'deactivated';
  displayName: string;
}

export function SetHouseholdStatusForm({
  householdId,
  status,
  displayName,
}: SetHouseholdStatusFormProps) {
  const [state, formAction, pending] = useActionState(setHouseholdStatusAction, initialActionState);
  const deactivating = status === 'active';
  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="status" value={deactivating ? 'deactivated' : 'active'} />
      <button type="submit" disabled={pending} className={`${quietSubmitClass} self-start`}>
        {pending
          ? 'Working…'
          : deactivating
            ? `Deactivate “${displayName}”`
            : `Reactivate “${displayName}”`}
      </button>
      {deactivating ? (
        <p className="text-xs text-ink-muted">
          Deactivating denies every member sign-in until the household is reactivated. Records are
          never deleted.
        </p>
      ) : null}
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}
