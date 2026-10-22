'use client';

import { useActionState, useState } from 'react';
import { changeCloudflareAccessAction } from '@/app/admin/cloudflare-actions';
import { initialActionState } from '@/lib/action-state';

export function CloudflareControls({
  emails,
  assigned,
  administrator,
}: {
  emails: string[];
  assigned: string[];
  administrator: string;
}) {
  const [state, action, pending] = useActionState(changeCloudflareAccessAction, initialActionState);
  const [email, setEmail] = useState('');
  const [removalConfirmed, setRemovalConfirmed] = useState(false);
  return (
    <form
      action={action}
      onReset={(event) => event.preventDefault()}
      className="mt-4 space-y-3 rounded-lg border border-border p-3"
    >
      <p className="text-sm">
        Explicit operations only — saving registry assignments or deactivating households never
        changes Cloudflare. Only supported reusable Allow policies used by this application alone
        can be edited. Unknown settings or rules are refused safely.
      </p>
      <label className="block text-sm">
        Email to manage
        <select
          name="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setRemovalConfirmed(false);
          }}
          required
          className="ml-2 rounded border border-border bg-surface p-1"
          disabled={pending}
        >
          <option value="">Select an email</option>
          {emails.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
          {email && !emails.includes(email) ? (
            <option value={email}>{email} (no longer listed)</option>
          ) : null}
        </select>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="exclusiveEdit" required disabled={pending} />
        <span>
          I confirm nobody is editing this policy or its application associations in Cloudflare or
          another installation until this operation finishes. Cloudflare provides no atomic
          protection against concurrent external edits.
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="confirmRemoval"
          checked={removalConfirmed}
          onChange={(event) => setRemovalConfirmed(event.target.checked)}
          disabled={pending}
        />
        <span>
          I confirm removal of the selected direct email entry from this policy only. This does not
          unassign the identity, deactivate a household, revoke existing sessions, or guarantee
          denial through other policies.
        </span>
      </label>
      <div className="flex flex-wrap gap-3">
        <button
          name="operation"
          value="grant"
          disabled={pending || !assigned.includes(email)}
          className="rounded bg-till px-3 py-1.5 text-sm text-till-ink disabled:opacity-50"
        >
          Grant Cloudflare access
        </button>
        <button
          name="operation"
          value="remove"
          disabled={pending || !email || email === administrator}
          className="rounded border border-border px-3 py-1.5 text-sm disabled:opacity-50"
        >
          Remove from Cloudflare
        </button>
      </div>
      <p className="text-xs text-ink-soft">
        Grant needs a current registry assignment. The configured administrator cannot be removed.
        An already-present grant or already-absent removal makes no change. After any error, review
        refreshed inspection before deliberately retrying; onboarding is not complete until the
        direct entry is verified, and effective access still depends on other conditions.
      </p>
      {pending ? <p role="status">Checking and updating Cloudflare…</p> : null}
      {!pending && state.message ? (
        <p
          role="status"
          aria-live="polite"
          className={state.status === 'error' ? 'text-sm text-danger' : 'text-sm text-positive'}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
