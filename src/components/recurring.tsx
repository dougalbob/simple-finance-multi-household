'use client';

import { ScheduleMonths } from './schedule-months';

import { useState } from 'react';
import { useActionState } from 'react';
import {
  addScheduleAction,
  cancelScheduleAction,
  restoreScheduleAction,
  saveProjectionSettingsAction,
} from '@/app/actions';
import { initialActionState, type ActionState } from '@/lib/action-state';

/**
 * How many confirmation steps a cancel needs. The household asked for
 * double-confirmation before a schedule is cancelled (two deliberate clicks).
 */
const CANCEL_CONFIRM_STEPS = 2;

/**
 * Recurring payment schedules and the configured projection figures.
 * Contracts and renewals are managed separately in the agreement register.
 */

export interface RecurringPotOption {
  id: number;
  label: string;
}

export interface RecurringCategoryOption {
  id: number;
  parentName: string;
  childName: string;
}

export interface RecurringScheduleOption {
  id: number;
  name: string;
  kind: string;
  frequency: string;
  amountPence: number;
  dueDayOfMonth: number;
  dueMonth: number | null;
  potLabel: string;
  nextDueDate: string | null;
  version: number;
  cancelledEffectiveOn: string | null;
  contractEndsOn: string | null;
  supplierId: number | null;
  supplierName: string | null;
}

export interface RecurringData {
  pots: RecurringPotOption[];
  categories: RecurringCategoryOption[];
  people: Array<{ id: number; label: string }>;
  vehicles: Array<{ id: number; label: string }>;
  suppliers: Array<{ id: number; name: string }>;
  today: string;
  schedules: RecurringScheduleOption[];
  projectionSettings: {
    weeklyGroceriesPence: number | null;
    monthlyFuelPence: Array<{ vehicleId: number; label: string; pence: number | null }>;
  };
}

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

const inputClass = 'rounded border border-border-strong bg-surface px-3 py-2 text-base';
const labelClass = 'block text-sm font-medium text-ink-body';
const buttonClass =
  'rounded bg-till px-4 py-2 text-sm font-medium text-till-ink disabled:opacity-60';
const submitDangerClass =
  'rounded bg-danger px-3 py-1.5 text-sm font-medium text-fill-ink disabled:opacity-60 hover:bg-danger-800';

export function AddScheduleForm({ data }: { data: RecurringData }) {
  const [state, formAction, pending] = useActionState(addScheduleAction, initialActionState);
  const [kind, setKind] = useState<'dd' | 'so' | 'receipt'>('dd');
  const [frequency, setFrequency] = useState<'monthly' | 'annual'>('monthly');
  /** '' = pick existing; '__new__' = type a new name; for SO also allow no supplier. */
  const [supplierMode, setSupplierMode] = useState<string>('');
  const isReceipt = kind === 'receipt';
  const needsSupplier = kind === 'dd' || kind === 'so';

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          Schedule name
          <input
            name="name"
            required
            maxLength={60}
            placeholder="e.g. Electricity bill"
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Amount
          <input
            name="amount"
            required
            inputMode="decimal"
            placeholder="e.g. 84.55"
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Type
          <select
            name="kind"
            className={inputClass}
            value={kind}
            onChange={(event) => {
              const next = event.target.value as 'dd' | 'so' | 'receipt';
              setKind(next);
              if (next === 'receipt') setSupplierMode('');
            }}
          >
            <option value="dd">Direct debit</option>
            <option value="so">Standing order</option>
            <option value="receipt">Expected receipt (income)</option>
          </select>
        </label>
        <label className={labelClass}>
          Frequency
          <select
            name="frequency"
            className={inputClass}
            value={frequency}
            onChange={(event) => setFrequency(event.target.value as 'monthly' | 'annual')}
          >
            <option value="monthly">Monthly</option>
            <option value="annual">Annual</option>
          </select>
        </label>
        <label className={labelClass}>
          Due day of month
          <input
            name="dueDayOfMonth"
            type="number"
            min={1}
            max={31}
            defaultValue={1}
            required
            className={inputClass}
          />
        </label>
        {frequency === 'annual' ? (
          <label className={labelClass}>
            Due month
            <select name="dueMonth" required className={inputClass}>
              <option value="" disabled>
                Choose the month
              </option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                <option key={month} value={month}>
                  {month}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {frequency === 'monthly' ? (
          <div className="sm:col-span-2">
            <ScheduleMonths />
          </div>
        ) : null}
        <label className={labelClass}>
          Pot
          <select name="potId" required className={inputClass}>
            {data.pots.map((pot) => (
              <option key={pot.id} value={pot.id}>
                {pot.label}
              </option>
            ))}
          </select>
        </label>
        {!isReceipt ? (
          <label className={labelClass}>
            Category (child)
            <select name="categoryId" required className={inputClass}>
              <option value="" disabled>
                Choose a category
              </option>
              {data.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.parentName} / {category.childName}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {needsSupplier ? (
          <div className="flex flex-col gap-2 sm:col-span-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="schedule-supplier" className={labelClass}>
                Supplier
              </label>
              <select
                id="schedule-supplier"
                // Always post supplierId; "__new__" is stripped by the action when
                // supplierName is present. An empty value is the standing-order
                // household-transfer option.
                name="supplierId"
                required={kind === 'dd'}
                className={inputClass}
                value={supplierMode}
                onChange={(event) => setSupplierMode(event.target.value)}
              >
                <option value="" disabled={kind === 'dd'}>
                  {kind === 'dd' ? 'Choose a supplier…' : 'No supplier / household transfer'}
                </option>
                {data.suppliers.map((supplier) => (
                  <option key={supplier.id} value={String(supplier.id)}>
                    {supplier.name}
                  </option>
                ))}
                <option value="__new__">Add a new supplier…</option>
              </select>
            </div>
            {supplierMode === '__new__' ? (
              <div className="flex flex-col gap-1">
                <label htmlFor="schedule-supplier-name" className={labelClass}>
                  New supplier name
                </label>
                <input
                  id="schedule-supplier-name"
                  name="supplierName"
                  required
                  maxLength={120}
                  placeholder="e.g. Northern Power Co"
                  className={inputClass}
                />
                <span className="mt-1 block text-xs text-ink-muted">
                  Creates the same supplier record used on Purchases, Contracts & Renewals, and
                  Suppliers. Add contact details there afterwards.
                </span>
              </div>
            ) : null}
            {kind === 'so' && supplierMode === '' ? (
              <p className="text-xs text-ink-muted">
                Standing orders that are household transfers need no supplier. Supplier payments
                should pick one so converted purchases land on the right card.
              </p>
            ) : null}
          </div>
        ) : null}
        <label className={labelClass}>
          For
          <select name="target" className={inputClass} defaultValue="household">
            <option value="household">Household</option>
            {data.people.map((person) => (
              <option key={person.id} value={`person-${person.id}`}>
                Person — {person.label}
              </option>
            ))}
            {data.vehicles.map((vehicle) => (
              <option key={vehicle.id} value={`vehicle-${vehicle.id}`}>
                Vehicle — {vehicle.label}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Active from
          <input
            name="activeFrom"
            type="date"
            defaultValue={data.today}
            required
            className={inputClass}
          />
        </label>
      </div>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? 'Saving…' : 'Add schedule'}
      </button>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}

export function CancelScheduleForm({
  schedule,
  today,
}: {
  schedule: RecurringScheduleOption;
  today: string;
}) {
  const [state, formAction, pending] = useActionState(cancelScheduleAction, initialActionState);
  // Double-confirmation steps: 0 = idle, 1 = first click (show warning + date picker),
  // 2 = confirmed (submit button live).
  const [confirmStep, setConfirmStep] = useState(0);
  const [effectiveOn, setEffectiveOn] = useState(today);
  const reset = () => setConfirmStep(0);
  return (
    <div className="mt-2 rounded-lg bg-canvas p-2">
      {confirmStep === 0 ? (
        <button
          type="button"
          onClick={() => setConfirmStep(1)}
          className="rounded border border-danger bg-surface px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger-50"
        >
          Cancel schedule
        </button>
      ) : (
        <form
          action={(formData) => {
            if (confirmStep < CANCEL_CONFIRM_STEPS) {
              setConfirmStep(confirmStep + 1);
              return;
            }
            formData.set('effectiveOn', effectiveOn);
            formAction(formData);
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <div className="flex flex-col gap-1">
            <label className="block text-xs font-medium text-ink-soft">
              Cancel from (local date)
              <input
                name="effectiveOn"
                type="date"
                value={effectiveOn}
                onChange={(e) => setEffectiveOn(e.target.value)}
                required
                className="ml-2 rounded border border-border-strong bg-surface px-2 py-1 text-sm"
              />
            </label>
            <p className="text-xs text-danger">
              Instances from that date stop; converted history is kept. This cannot be undone from
              the edit panel — a Restore option appears after cancellation if you change your mind.
            </p>
            {confirmStep >= CANCEL_CONFIRM_STEPS ? (
              <p className="text-xs font-medium text-danger">
                Confirm again to cancel — press Cancel schedule once more.
              </p>
            ) : null}
          </div>
          <input type="hidden" name="scheduleId" value={schedule.id} />
          <input type="hidden" name="version" value={schedule.version} />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={reset}
              className="rounded border border-border-strong bg-surface px-3 py-1.5 text-sm font-medium text-ink-body hover:bg-canvas"
            >
              Keep schedule
            </button>
            <button
              type="submit"
              disabled={pending}
              className={`${submitDangerClass} ${confirmStep < CANCEL_CONFIRM_STEPS ? '' : 'ring-2 ring-danger/40'}`}
            >
              {pending
                ? 'Cancelling…'
                : confirmStep < CANCEL_CONFIRM_STEPS
                  ? 'Cancel schedule'
                  : 'Yes, cancel it'}
            </button>
          </div>
          <FormMessage status={state.status} message={state.message} />
        </form>
      )}
    </div>
  );
}

/**
 * Restore a cancelled schedule (decision 206). The user is warned that any
 * payment dates missed while the schedule was cancelled will be back-filled as
 * upcoming instances (they convert into ordinary schedule-tagged records,
 * just like moving a start date earlier under decision 162) and must tick an
 * explicit confirmation before the button will submit.
 */
export function RestoreScheduleForm({ schedule }: { schedule: RecurringScheduleOption }) {
  const [state, formAction, pending] = useActionState(restoreScheduleAction, initialActionState);
  const [confirmed, setConfirmed] = useState(false);
  return (
    <form action={formAction} className="mt-2 rounded-lg bg-canvas p-2">
      <p className="text-xs text-ink-muted">
        Restoring resumes this schedule. Any scheduled payment dates that were missed while it was
        cancelled will be <span className="font-medium text-ink-body">back-filled by the app</span>{' '}
        as ordinary {'"'}from schedule{'"'} records (converted history is never rewritten).
      </p>
      <label className="mt-2 flex items-start gap-2 text-xs text-ink-body">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          name="confirmBackfill"
          value="true"
          className="mt-0.5 h-4 w-4 rounded border-border-strong"
        />
        <span>
          I understand — back-fill any missed scheduled dates and restore this schedule going
          forward.
        </span>
      </label>
      <input type="hidden" name="scheduleId" value={schedule.id} />
      <input type="hidden" name="version" value={schedule.version} />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="submit"
          disabled={pending || !confirmed}
          className="rounded border border-positive bg-surface px-3 py-1.5 text-sm font-medium text-positive hover:bg-positive-50 disabled:opacity-60"
        >
          {pending ? 'Restoring…' : 'Restore schedule'}
        </button>
        <FormMessage status={state.status} message={state.message} />
      </div>
    </form>
  );
}

/** Slim props (decision 73): the settings page reuses this form without
 *  assembling the full recurring dataset. */
export interface ProjectionSettingsData {
  weeklyGroceriesPence: number | null;
  monthlyFuelPence: Array<{ vehicleId: number; label: string; pence: number | null }>;
}

export function ProjectionSettingsForm({ data }: { data: ProjectionSettingsData }) {
  const [state, formAction, pending] = useActionState(
    saveProjectionSettingsAction,
    initialActionState,
  );
  const toPounds = (pence: number | null) => (pence === null ? '' : (pence / 100).toFixed(2));
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          Weekly shop (projected)
          <input
            name="weeklyGroceries"
            inputMode="decimal"
            defaultValue={toPounds(data.weeklyGroceriesPence)}
            placeholder="e.g. 90.00"
            className={inputClass}
          />
        </label>
        {data.monthlyFuelPence.map((vehicle) => (
          <label key={vehicle.vehicleId} className={labelClass}>
            Monthly fuel — {vehicle.label}
            <input
              name={`fuel_${vehicle.vehicleId}`}
              inputMode="decimal"
              defaultValue={toPounds(vehicle.pence)}
              placeholder="e.g. 75.00"
              className={inputClass}
            />
          </label>
        ))}
      </div>
      <p className="text-xs text-ink-muted">
        Blank clears a figure. Each number is one projected event — a weekly shop every 7 days, a
        fill every 30 days per vehicle — counted from when you last recorded one (the Insights
        honesty loop compares them with recent actuals).
      </p>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? 'Saving…' : 'Save figures'}
      </button>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}

/** Convenience: parse a "kind-id" composite from the For select (parent form submits it). */
export function splitCompositeTarget(value: string): { kind: string; id: number | null } {
  const dash = value.indexOf('-');
  if (dash === -1) return { kind: 'household', id: null };
  return { kind: value.slice(0, dash), id: Number(value.slice(dash + 1)) };
}
