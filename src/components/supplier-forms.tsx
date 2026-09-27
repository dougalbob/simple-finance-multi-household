'use client';

import { useActionState, useEffect } from 'react';
import {
  addSupplierInteractionAction,
  addSupplierReferenceAction,
  saveSupplierContactAction,
} from '@/app/actions';
import { initialActionState } from '@/lib/action-state';

const FIELD_CLASS =
  'w-full rounded border border-border-strong px-2 py-1 text-sm focus:border-border-emphasis focus:outline-none';

function Status({ state }: { state: { status: string; message: string | null } }) {
  if (state.message === null) return null;
  return (
    <span
      role="status"
      className={`text-xs ${state.status === 'error' ? 'text-danger' : 'text-positive'}`}
    >
      {state.message}
    </span>
  );
}

export interface SupplierContactValues {
  id: number;
  name: string;
  version: number;
  contactPhone: string | null;
  contactEmail: string | null;
  website: string | null;
  address: string | null;
  notes: string | null;
}

/**
 * The contact card editor (SPEC §21.1). Phone, email, website, address and
 * notes — the details you need when something has gone wrong and the paperwork
 * is in a drawer. Empty fields clear a value; the audit trail keeps the
 * before/after.
 */
export function SupplierContactForm({ supplier }: { supplier: SupplierContactValues }) {
  const [state, formAction, pending] = useActionState(
    saveSupplierContactAction,
    initialActionState,
  );
  return (
    <details className="mt-3 rounded-lg border border-border bg-canvas p-3">
      <summary className="cursor-pointer text-sm font-medium text-ink-body">
        Edit contact card
      </summary>
      <form action={formAction} className="mt-3 grid gap-2 sm:grid-cols-2">
        <input type="hidden" name="id" value={supplier.id} />
        <input type="hidden" name="expectedVersion" value={supplier.version} />
        <label className="text-xs font-medium text-ink-soft">
          Phone
          <input
            name="contactPhone"
            type="tel"
            defaultValue={supplier.contactPhone ?? ''}
            className={FIELD_CLASS}
          />
        </label>
        <label className="text-xs font-medium text-ink-soft">
          Email
          <input
            name="contactEmail"
            type="email"
            defaultValue={supplier.contactEmail ?? ''}
            className={FIELD_CLASS}
          />
        </label>
        <label className="text-xs font-medium text-ink-soft">
          Website
          <input name="website" defaultValue={supplier.website ?? ''} className={FIELD_CLASS} />
        </label>
        <label className="text-xs font-medium text-ink-soft">
          Postal address
          <input name="address" defaultValue={supplier.address ?? ''} className={FIELD_CLASS} />
        </label>
        <label className="text-xs font-medium text-ink-soft sm:col-span-2">
          Notes
          <textarea
            name="notes"
            rows={2}
            defaultValue={supplier.notes ?? ''}
            className={FIELD_CLASS}
          />
        </label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-till px-3 py-1.5 text-sm font-medium text-till-ink disabled:opacity-60"
          >
            {pending ? 'Saving…' : 'Save contact card'}
          </button>
          <Status state={state} />
        </div>
      </form>
    </details>
  );
}

/** Label→value reference pair, e.g. "Policy number" → "ABC123" (SPEC §21.1). */
export function SupplierReferenceForm({ supplierId }: { supplierId: number }) {
  const [state, formAction, pending] = useActionState(
    addSupplierReferenceAction,
    initialActionState,
  );
  return (
    <form action={formAction} className="my-2 space-y-1">
      <input type="hidden" name="supplierId" value={supplierId} />
      <div className="flex flex-wrap gap-1">
        <label className="sr-only" htmlFor={`reference-label-${supplierId}`}>
          Reference label
        </label>
        <input
          id={`reference-label-${supplierId}`}
          name="label"
          placeholder="Label (e.g. Policy number)"
          required
          className="w-40 rounded border border-border-strong px-2 py-1 text-xs"
        />
        <label className="sr-only" htmlFor={`reference-value-${supplierId}`}>
          Reference value
        </label>
        <input
          id={`reference-value-${supplierId}`}
          name="value"
          placeholder="Value"
          required
          className="w-36 rounded border border-border-strong px-2 py-1 text-xs"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-till-inset px-2 py-1 text-xs text-till-ink disabled:opacity-60"
        >
          Add reference
        </button>
      </div>
      <Status state={state} />
    </form>
  );
}

const CHANNELS: Array<{ value: string; label: string }> = [
  { value: 'call', label: 'Phone call' },
  { value: 'email', label: 'Email' },
  { value: 'letter', label: 'Letter' },
  { value: 'in_person', label: 'In person' },
  { value: 'other', label: 'Other' },
];

/**
 * "+ Create interaction" (SPEC §21.2): what was said and the optional
 * outcome. A promised follow-up — a date, some words, or both — becomes a
 * task about the supplier, saved in the same transaction as the interaction
 * (decision 175), so it stays listed until someone ticks it, even after the
 * date has passed.
 */
export function SupplierInteractionForm({
  supplierId,
  supplierName,
}: {
  supplierId: number;
  supplierName: string;
}) {
  const [state, formAction, pending] = useActionState(
    addSupplierInteractionAction,
    initialActionState,
  );
  useEffect(() => {
    if (state.status === 'ok') {
      window.dispatchEvent(new CustomEvent('sf:tasks-changed'));
    }
  }, [state]);
  return (
    <form action={formAction} className="my-2 space-y-1">
      <input type="hidden" name="supplierId" value={supplierId} />
      <div className="flex flex-wrap gap-1">
        <label className="sr-only" htmlFor={`interaction-channel-${supplierId}`}>
          Channel
        </label>
        <select
          id={`interaction-channel-${supplierId}`}
          name="channel"
          className="rounded border border-border-strong px-2 py-1 text-xs"
        >
          {CHANNELS.map((channel) => (
            <option key={channel.value} value={channel.value}>
              {channel.label}
            </option>
          ))}
        </select>
      </div>
      <label className="sr-only" htmlFor={`interaction-summary-${supplierId}`}>
        Summary
      </label>
      <input
        id={`interaction-summary-${supplierId}`}
        name="summary"
        placeholder="What happened?"
        required
        className="w-full rounded border border-border-strong px-2 py-1 text-xs"
      />
      <label className="sr-only" htmlFor={`interaction-outcome-${supplierId}`}>
        Outcome
      </label>
      <input
        id={`interaction-outcome-${supplierId}`}
        name="outcome"
        placeholder="Outcome (optional)"
        className="w-full rounded border border-border-strong px-2 py-1 text-xs"
      />
      <fieldset className="rounded border border-border-hairline px-2 pb-2 pt-1">
        <legend className="px-1 text-xs text-ink-soft">
          Promised to follow up? It becomes a task you can tick off.
        </legend>
        <div className="flex flex-wrap items-center gap-1.5">
          <label className="text-xs text-ink-soft" htmlFor={`interaction-follow-up-${supplierId}`}>
            Follow up by
          </label>
          <input
            id={`interaction-follow-up-${supplierId}`}
            name="followUpDate"
            type="date"
            className="rounded border border-border-strong px-2 py-1 text-xs"
          />
          <label className="sr-only" htmlFor={`interaction-follow-up-title-${supplierId}`}>
            Follow-up task (optional)
          </label>
          <input
            id={`interaction-follow-up-title-${supplierId}`}
            name="followUpTitle"
            maxLength={200}
            placeholder={`Follow up with ${supplierName}`}
            className="min-w-0 flex-1 rounded border border-border-strong px-2 py-1 text-xs"
          />
        </div>
      </fieldset>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-note px-2 py-1 text-xs text-fill-ink disabled:opacity-60"
        >
          {pending ? 'Logging…' : 'Log interaction'}
        </button>
        <Status state={state} />
      </div>
    </form>
  );
}
