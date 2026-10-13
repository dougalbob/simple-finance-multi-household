'use client';

import { useActionState, useState } from 'react';
import { addTrackedAgreementAction, editTrackedAgreementAction } from '@/app/actions';
import { initialActionState } from '@/lib/action-state';
import type { TrackedAgreement } from '@/lib/records/agreements';

const inputClass =
  'w-full rounded-lg border border-border-strong bg-surface px-3 py-2.5 text-sm text-ink-body focus:border-border-emphasis focus:outline-none';
const labelClass = 'block text-sm font-medium text-ink-body';
const helperClass = 'mt-1 block text-xs leading-5 text-ink-muted';

export interface AgreementFormData {
  suppliers: Array<{ id: number; name: string }>;
  people: Array<{ id: number; label: string }>;
  vehicles: Array<{ id: number; label: string }>;
  schedules: Array<{
    id: number;
    name: string;
    kind: 'dd' | 'so';
    frequency: 'monthly' | 'annual';
    amountPence: number;
    supplierName: string | null;
    cancelled: boolean;
  }>;
}

export function TrackedAgreementForm({
  data,
  agreement,
}: {
  data: AgreementFormData;
  agreement?: TrackedAgreement;
}) {
  const [type, setType] = useState<TrackedAgreement['type']>(agreement?.type ?? 'insurance');
  const [target, setTarget] = useState(() =>
    agreement === undefined || agreement.targetKind === 'household' || agreement.targetId === null
      ? 'household'
      : `${agreement.targetKind}-${agreement.targetId}`,
  );
  const action = agreement ? editTrackedAgreementAction : addTrackedAgreementAction;
  const [state, formAction, pending] = useActionState(action, initialActionState);
  const prefix = agreement === undefined ? 'agreement-new' : `agreement-${agreement.id}`;

  return (
    <form
      action={(formData) => {
        formData.set('target', target);
        formAction(formData);
      }}
      className="space-y-4"
    >
      {agreement !== undefined ? (
        <>
          <input type="hidden" name="agreementId" value={agreement.id} />
          <input type="hidden" name="version" value={agreement.version} />
        </>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelClass} htmlFor={`${prefix}-name`}>
          Name
          <input
            id={`${prefix}-name`}
            name="name"
            required
            maxLength={100}
            defaultValue={agreement?.name ?? ''}
            placeholder="e.g. Buildings & contents — Acme Insurance"
            className={`${inputClass} mt-1`}
          />
        </label>
        <label className={labelClass} htmlFor={`${prefix}-type`}>
          What are you tracking?
          <select
            id={`${prefix}-type`}
            name="type"
            className={`${inputClass} mt-1`}
            value={type}
            onChange={(event) => setType(event.target.value as TrackedAgreement['type'])}
          >
            <option value="insurance">Insurance policy</option>
            <option value="service">Service contract</option>
            <option value="other">Other renewal or agreement</option>
          </select>
        </label>
        <label className={labelClass} htmlFor={`${prefix}-supplier`}>
          Provider (optional)
          <select
            id={`${prefix}-supplier`}
            name="supplierId"
            defaultValue={
              agreement?.supplierId === null || agreement === undefined
                ? ''
                : String(agreement.supplierId)
            }
            className={`${inputClass} mt-1`}
          >
            <option value="">No provider linked</option>
            {data.suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass} htmlFor={`${prefix}-target`}>
          For
          <select
            id={`${prefix}-target`}
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            className={`${inputClass} mt-1`}
          >
            <option value="household">Household</option>
            {data.people.map((person) => (
              <option key={`person-${person.id}`} value={`person-${person.id}`}>
                Person — {person.label}
              </option>
            ))}
            {data.vehicles.map((vehicle) => (
              <option key={`vehicle-${vehicle.id}`} value={`vehicle-${vehicle.id}`}>
                Vehicle — {vehicle.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {type === 'insurance' ? (
        <div className="grid gap-3 rounded-xl border border-border-hairline bg-canvas p-3 sm:grid-cols-2">
          <label className={labelClass} htmlFor={`${prefix}-auto-renew`}>
            Does the provider auto-renew this policy?
            <select
              id={`${prefix}-auto-renew`}
              name="autoRenew"
              defaultValue={agreement?.autoRenew ?? 'unknown'}
              className={`${inputClass} mt-1`}
            >
              <option value="yes">Yes — I’ve asked them to renew it</option>
              <option value="no">No — I need to arrange cover</option>
              <option value="unknown">Not sure / not checked</option>
            </select>
          </label>
          <label className={labelClass} htmlFor={`${prefix}-renewal-date`}>
            Next renewal / cover-end date
            <input
              id={`${prefix}-renewal-date`}
              name="renewalDate"
              type="date"
              defaultValue={agreement?.renewalDate ?? ''}
              className={`${inputClass} mt-1`}
            />
            <span className={helperClass}>
              The date to review the price or make sure replacement cover is arranged.
            </span>
          </label>
          <ReminderField
            id={`${prefix}-renewal-reminder`}
            enabledName="renewalReminderEnabled"
            leadName="renewalReminderLeadDays"
            label="Remind me before the renewal date"
            leadDays={agreement?.renewalReminderLeadDays ?? 21}
            enabled={agreement?.renewalReminderLeadDays !== null && agreement !== undefined}
          />
          <div className="flex flex-col justify-end gap-2 pb-1">
            <label className="flex items-start gap-2 text-sm font-medium text-ink-body">
              <input
                type="checkbox"
                name="renewalRepeatsAnnually"
                defaultChecked={agreement?.renewalRepeatsAnnually ?? true}
                className="mt-0.5 h-4 w-4 rounded border-border-strong"
              />
              The policy date repeats annually
            </label>
            <p className={helperClass}>
              This is separate from provider auto-renewal. The app only moves the date forward
              automatically when provider auto-renew is set to Yes.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 rounded-xl border border-border-hairline bg-canvas p-3 sm:grid-cols-2">
          <label className={labelClass} htmlFor={`${prefix}-renewal-date`}>
            Renewal or review date (optional)
            <input
              id={`${prefix}-renewal-date`}
              name="renewalDate"
              type="date"
              defaultValue={agreement?.renewalDate ?? ''}
              className={`${inputClass} mt-1`}
            />
          </label>
          <ReminderField
            id={`${prefix}-renewal-reminder`}
            enabledName="renewalReminderEnabled"
            leadName="renewalReminderLeadDays"
            label="Remind me before this date"
            leadDays={agreement?.renewalReminderLeadDays ?? 21}
            enabled={agreement?.renewalReminderLeadDays !== null && agreement !== undefined}
          />
        </div>
      )}

      <div className="grid gap-3 rounded-xl border border-border-hairline bg-canvas p-3 sm:grid-cols-2">
        <label className={labelClass} htmlFor={`${prefix}-switch-date`}>
          Can switch or cancel without an exit fee from (optional)
          <input
            id={`${prefix}-switch-date`}
            name="switchDate"
            type="date"
            defaultValue={agreement?.switchDate ?? ''}
            className={`${inputClass} mt-1`}
          />
          <span className={helperClass}>
            The service may continue after this date. This is the earliest penalty-free switch date,
            not a payment stop date.
          </span>
        </label>
        <ReminderField
          id={`${prefix}-switch-reminder`}
          enabledName="switchReminderEnabled"
          leadName="switchReminderLeadDays"
          label="Remind me before I can switch"
          leadDays={agreement?.switchReminderLeadDays ?? 21}
          enabled={agreement?.switchReminderLeadDays !== null && agreement !== undefined}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelClass} htmlFor={`${prefix}-schedule`}>
          Link a recurring payment (optional)
          <select
            id={`${prefix}-schedule`}
            name="scheduleId"
            defaultValue={
              agreement?.scheduleId === null || agreement === undefined
                ? ''
                : String(agreement.scheduleId)
            }
            className={`${inputClass} mt-1`}
          >
            <option value="">No recurring schedule linked</option>
            {data.schedules.map((schedule) => (
              <option key={schedule.id} value={schedule.id}>
                {schedule.name}
                {schedule.cancelled ? ' (cancelled)' : ''} · {schedule.frequency} ·{' '}
                {schedule.supplierName ?? schedule.kind}
              </option>
            ))}
          </select>
          <span className={helperClass}>
            The payment amount and cadence stay on Recurring. Linking is optional; it doesn’t change
            the bank instruction.
          </span>
        </label>
        <label className={labelClass} htmlFor={`${prefix}-notes`}>
          Notes (optional)
          <textarea
            id={`${prefix}-notes`}
            name="notes"
            maxLength={500}
            rows={3}
            defaultValue={agreement?.notes ?? ''}
            className={`${inputClass} mt-1`}
            placeholder="Policy number, notice period, or anything useful when reviewing"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-till px-4 py-2.5 text-sm font-semibold text-till-ink disabled:opacity-60"
        >
          {pending ? 'Saving…' : agreement === undefined ? 'Add to the register' : 'Save changes'}
        </button>
        {state.message !== null ? (
          <p
            role="status"
            aria-live="polite"
            className={state.status === 'error' ? 'text-sm text-danger' : 'text-sm text-positive'}
          >
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}

function ReminderField({
  id,
  enabledName,
  leadName,
  label,
  leadDays,
  enabled,
}: {
  id: string;
  enabledName: string;
  leadName: string;
  label: string;
  leadDays: number;
  enabled: boolean;
}) {
  return (
    <fieldset className="flex flex-col justify-end gap-2">
      <legend className={labelClass}>{label}</legend>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="checkbox"
          name={enabledName}
          defaultChecked={enabled}
          className="h-4 w-4 rounded border-border-strong"
        />
        <label htmlFor={id} className="text-sm text-ink-body">
          In-app reminder
        </label>
        <label className="sr-only" htmlFor={`${id}-days`}>
          Days before
        </label>
        <input
          id={`${id}-days`}
          type="number"
          name={leadName}
          min={0}
          max={365}
          defaultValue={leadDays}
          className="w-20 rounded-lg border border-border-strong bg-surface px-2 py-2 text-sm text-ink-body"
        />
        <span className="text-sm text-ink-soft">days before</span>
      </div>
      <p className={helperClass}>Only shown inside the app when you open it.</p>
    </fieldset>
  );
}
