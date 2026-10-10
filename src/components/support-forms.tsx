'use client';

import { useActionState } from 'react';
import {
  grantSupportAccessAction,
  leaveSupportViewAction,
  openSupportViewAction,
  revokeSupportAccessAction,
} from '@/app/support/actions';
import { initialActionState } from '@/lib/action-state';
import { SUPPORT_GRANT_DURATIONS_MINUTES } from '@/lib/registry/support-durations';

const inputClass =
  'rounded border border-border-strong bg-surface px-2.5 py-1.5 text-sm focus:border-border-emphasis focus:outline-none';
const labelClass = 'text-xs font-medium text-ink-soft';
const submitClass =
  'rounded bg-till px-3 py-1.5 text-sm font-medium text-till-ink disabled:opacity-60';
const quietSubmitClass =
  'rounded border border-border-strong px-3 py-1.5 text-sm font-medium disabled:opacity-60';

const DURATION_WORDS: Record<number, string> = {
  60: '1 hour',
  240: '4 hours',
  1440: '24 hours',
};

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

/** A member chooses an administrator and how long read-only access lasts. */
export function GrantSupportForm({
  administrators,
}: {
  administrators: ReadonlyArray<{ email: string }>;
}) {
  const [state, formAction, pending] = useActionState(grantSupportAccessAction, initialActionState);
  if (administrators.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        No platform administrator is available to grant access to.
      </p>
    );
  }
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <div className="flex flex-col gap-1">
          <label htmlFor="support-grant-email" className={labelClass}>
            Administrator
          </label>
          <select id="support-grant-email" name="supportEmail" required className={inputClass}>
            {administrators.map((admin) => (
              <option key={admin.email} value={admin.email}>
                {admin.email}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="support-grant-duration" className={labelClass}>
            Lasts
          </label>
          <select
            id="support-grant-duration"
            name="durationMinutes"
            defaultValue="240"
            className={inputClass}
          >
            {SUPPORT_GRANT_DURATIONS_MINUTES.map((minutes) => (
              <option key={minutes} value={minutes}>
                {DURATION_WORDS[minutes] ?? `${minutes} minutes`}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button type="submit" disabled={pending} className={`${submitClass} self-start`}>
        {pending ? 'Granting…' : 'Grant read-only access'}
      </button>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}

/** A member ends an active grant at once. */
export function RevokeSupportForm({
  grantId,
  supportEmail,
}: {
  grantId: number;
  supportEmail: string;
}) {
  const [state, formAction, pending] = useActionState(
    revokeSupportAccessAction,
    initialActionState,
  );
  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="grantId" value={grantId} />
      <button type="submit" disabled={pending} className={`${quietSubmitClass} self-start`}>
        {pending ? 'Ending…' : `End access for ${supportEmail}`}
      </button>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}

/** An administrator enters a live grant's read-only view. */
export function OpenSupportViewForm({
  grantId,
  householdName,
}: {
  grantId: number;
  householdName: string;
}) {
  const [state, formAction, pending] = useActionState(openSupportViewAction, initialActionState);
  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="grantId" value={grantId} />
      <button type="submit" disabled={pending} className={`${submitClass} self-start`}>
        {pending ? 'Opening…' : `Open read-only view of ${householdName}`}
      </button>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}

/** Ends the support selection on this device (the administrator's own household returns). */
export function LeaveSupportViewForm() {
  return (
    <form action={leaveSupportViewAction}>
      <button type="submit" className={quietSubmitClass}>
        Leave support view
      </button>
    </form>
  );
}
