'use client';

import { useActionState, useEffect, useState } from 'react';
import {
  addVehicleAction,
  editPotAction,
  renameTargetAction,
  saveCategoryAction,
  savePaydaySettingAction,
  savePersonEmailAction,
  savePotDefaultUsesAction,
  saveWarningLeadsAction,
} from '@/app/actions';
import { initialActionState } from '@/lib/action-state';

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

export interface TargetRenameFormProps {
  kind: 'person' | 'vehicle';
  targetId: number;
  version: number;
  currentLabel: string;
}

/** Rename a person or vehicle (names stay short and unique — SPEC §3). */
export function TargetRenameForm(props: TargetRenameFormProps) {
  const [state, formAction, pending] = useActionState(renameTargetAction, initialActionState);
  return (
    <form
      action={formAction}
      className="flex flex-col gap-2"
      id={`rename-${props.kind}-${props.targetId}`}
    >
      <input type="hidden" name="kind" value={props.kind} />
      <input type="hidden" name="targetId" value={props.targetId} />
      <input type="hidden" name="version" value={props.version} />
      <div className="flex flex-col gap-1">
        <label htmlFor={`rename-${props.kind}-${props.targetId}-label`} className={labelClass}>
          Name
        </label>
        <input
          id={`rename-${props.kind}-${props.targetId}-label`}
          name="label"
          type="text"
          required
          minLength={2}
          maxLength={60}
          defaultValue={props.currentLabel}
          className={inputClass}
        />
      </div>
      <button type="submit" disabled={pending} className={`${submitClass} self-start`}>
        {pending ? 'Saving…' : 'Save name'}
      </button>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}

export interface AddVehicleFormProps {
  people: Array<{ id: number; label: string }>;
}

/** Add another vehicle without leaving Settings (the same fields as Home). */
export function AddVehicleForm({ people }: AddVehicleFormProps) {
  const [state, formAction, pending] = useActionState(addVehicleAction, initialActionState);
  return (
    <form
      action={formAction}
      aria-label="Add vehicle"
      className="rounded-lg border border-accent-100 bg-surface p-3"
    >
      <p className="mb-2 text-sm font-semibold text-ink-body">Add vehicle</p>
      <div className="flex flex-col gap-1">
        <label htmlFor="settings-add-vehicle-label" className={labelClass}>
          Name
        </label>
        <input
          id="settings-add-vehicle-label"
          name="label"
          type="text"
          required
          maxLength={60}
          placeholder="e.g. Vehicle B"
          className={inputClass}
        />
      </div>
      <div className="mt-2 flex flex-col gap-1">
        <label htmlFor="settings-add-vehicle-owner" className={labelClass}>
          Owner (optional)
        </label>
        <select id="settings-add-vehicle-owner" name="ownerPersonId" className={inputClass}>
          <option value="">Shared / not assigned</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.label}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={pending} className={`${submitClass} mt-3`}>
        {pending ? 'Saving…' : 'Add vehicle'}
      </button>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}

export function PaydaySettingForm({ dayOfMonth }: { dayOfMonth: number | null }) {
  const [state, formAction, pending] = useActionState(savePaydaySettingAction, initialActionState);
  return (
    <form action={formAction} aria-label="Household payday" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="household-payday-day" className={labelClass}>
          Payday day of month
        </label>
        <input
          id="household-payday-day"
          name="dayOfMonth"
          type="number"
          inputMode="numeric"
          min={1}
          max={31}
          step={1}
          defaultValue={dayOfMonth ?? ''}
          className={`${inputClass} w-28`}
          aria-describedby="household-payday-help"
        />
        <p id="household-payday-help" className="text-xs text-ink-muted">
          Use a day from 1 to 31. Shorter months clamp to their last day; a Saturday or Sunday
          payday moves back to Friday. Leave blank and save to clear the setting.
        </p>
      </div>
      <button type="submit" disabled={pending} className={`${submitClass} self-start`}>
        {pending ? 'Saving…' : 'Save payday'}
      </button>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}

export interface PotEditFormProps {
  potId: number;
  version: number;
  label: string;
  kind: 'bank' | 'cash' | 'credit-card';
  ownerPersonId: number | null;
  people: Array<{ id: number; label: string }>;
  overdraftLimitPence: number | null;
  warningThresholdPence: number | null;
  creditCardPaymentDayOfMonth: number | null;
  creditCardWarningDays: number;
  creditCardPromotionalEndDate: string | null;
  creditCardStatementDueDate: string | null;
  creditCardStatementMinimumPence: number | null;
}

const penceToPounds = (pence: number | null) => (pence === null ? '' : (pence / 100).toFixed(2));

/**
 * Pot editor (label, type, owner — decision 178 — overdraft limit and
 * warning threshold — decision 68). Blank limit/threshold clears the value;
 * the domain layer enforces “threshold requires a limit, threshold ≤ limit”.
 * Cash pots show no limit/threshold fields: those datapoints describe a bank
 * facility or a credit line, not counted notes, and the domain clears them
 * for cash (decision 178). Changing the type select does not reveal the
 * fields in this render — save the kind change first and edit again.
 */
export function PotEditForm(props: PotEditFormProps) {
  const [state, formAction, pending] = useActionState(editPotAction, initialActionState);
  const cashPot = props.kind === 'cash';
  return (
    <form action={formAction} className="flex flex-col gap-2" id={`pot-edit-${props.potId}`}>
      <input type="hidden" name="potId" value={props.potId} />
      <input type="hidden" name="version" value={props.version} />
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`pot-${props.potId}-label`} className={labelClass}>
            Pot name
          </label>
          <input
            id={`pot-${props.potId}-label`}
            name="label"
            type="text"
            required
            minLength={2}
            maxLength={60}
            defaultValue={props.label}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`pot-${props.potId}-kind`} className={labelClass}>
            Type
          </label>
          <select
            id={`pot-${props.potId}-kind`}
            name="kind"
            defaultValue={props.kind}
            className={inputClass}
          >
            <option value="bank">Bank account</option>
            <option value="cash">Cash</option>
            <option value="credit-card">Credit card</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`pot-${props.potId}-owner`} className={labelClass}>
            Owner
          </label>
          <select
            id={`pot-${props.potId}-owner`}
            name="ownerPersonId"
            defaultValue={props.ownerPersonId?.toString() ?? ''}
            className={inputClass}
          >
            <option value="">Shared / not assigned</option>
            {props.people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.label}
              </option>
            ))}
          </select>
        </div>
        {cashPot ? (
          <div className="flex flex-col gap-1">
            <span className={`${labelClass} opacity-70`}>Overdraft / threshold</span>
            <span className="rounded-lg bg-canvas px-3 py-2 text-xs text-ink-muted">
              Not used for cash — counted notes have no overdraft or warning threshold.
            </span>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <label htmlFor={`pot-${props.potId}-limit`} className={labelClass}>
                {props.kind === 'credit-card'
                  ? 'Credit limit (£, blank clears)'
                  : 'Overdraft limit (£, blank clears)'}
              </label>
              <input
                id={`pot-${props.potId}-limit`}
                name="overdraftLimit"
                type="text"
                inputMode="decimal"
                defaultValue={penceToPounds(props.overdraftLimitPence)}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`pot-${props.potId}-threshold`} className={labelClass}>
                {props.kind === 'credit-card'
                  ? 'Warn when card balance reaches (£, blank clears)'
                  : 'Warning threshold (£, blank clears)'}
              </label>
              <input
                id={`pot-${props.potId}-threshold`}
                name="warningThreshold"
                type="text"
                inputMode="decimal"
                defaultValue={penceToPounds(props.warningThresholdPence)}
                className={inputClass}
              />
            </div>
          </>
        )}
      </div>
      {props.kind === 'credit-card' ? (
        <fieldset className="rounded-lg border border-border-hairline p-3">
          <legend className="px-1 text-sm font-semibold">Card payment reminders</legend>
          <p className="mb-3 text-xs text-ink-muted">
            Set the usual due day and enter the minimum and exact due date from each statement. The
            app does not calculate the provider&apos;s minimum. Clear the statement fields when that
            statement has been dealt with.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor={`pot-${props.potId}-payment-day`} className={labelClass}>
                Usual payment due day (1–31)
              </label>
              <input
                id={`pot-${props.potId}-payment-day`}
                name="creditCardPaymentDayOfMonth"
                type="number"
                min="1"
                max="31"
                defaultValue={props.creditCardPaymentDayOfMonth ?? ''}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`pot-${props.potId}-warning-days`} className={labelClass}>
                Reminder lead (days)
              </label>
              <input
                id={`pot-${props.potId}-warning-days`}
                name="creditCardWarningDays"
                type="number"
                min="0"
                max="365"
                defaultValue={props.creditCardWarningDays}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`pot-${props.potId}-promo-end`} className={labelClass}>
                0% promotional end date (optional)
              </label>
              <input
                id={`pot-${props.potId}-promo-end`}
                name="creditCardPromotionalEndDate"
                type="date"
                defaultValue={props.creditCardPromotionalEndDate ?? ''}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`pot-${props.potId}-statement-date`} className={labelClass}>
                Current statement due date
              </label>
              <input
                id={`pot-${props.potId}-statement-date`}
                name="creditCardStatementDueDate"
                type="date"
                defaultValue={props.creditCardStatementDueDate ?? ''}
                className={inputClass}
              />
            </div>
            <div className="col-span-2 flex flex-col gap-1">
              <label htmlFor={`pot-${props.potId}-statement-minimum`} className={labelClass}>
                Minimum payment shown on that statement (£)
              </label>
              <input
                id={`pot-${props.potId}-statement-minimum`}
                name="creditCardStatementMinimum"
                type="text"
                inputMode="decimal"
                defaultValue={penceToPounds(props.creditCardStatementMinimumPence)}
                className={inputClass}
              />
            </div>
          </div>
        </fieldset>
      ) : null}
      <button type="submit" disabled={pending} className={`${submitClass} self-start`}>
        {pending ? 'Saving…' : 'Save pot'}
      </button>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}

export interface CategoryNodeData {
  id: number;
  name: string;
  version: number;
  retired: boolean;
  children: Array<{ id: number; name: string; version: number; retired: boolean }>;
}

/**
 * Category tree editor (SPEC §12, decision 73): add parent/child, rename,
 * retire children. History is never rewritten — retirement only blocks new
 * assignments. One shared action (saveCategoryAction) handles every op; this
 * component only picks the op and the row it applies to.
 */
export function CategoryTreeEditor({ tree }: { tree: CategoryNodeData[] }) {
  const [state, formAction, pending] = useActionState(saveCategoryAction, initialActionState);
  const [op, setOp] = useState<'add-parent' | 'add-child' | 'rename' | 'retire'>('add-parent');
  const [parentId, setParentId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [categoryKind, setCategoryKind] = useState<'parent' | 'child' | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);

  const pick = (
    nextOp: typeof op,
    nextParentId: number | null,
    nextCategoryId: number | null,
    nextKind: 'parent' | 'child' | null,
    nextVersion: number | null,
  ) => {
    setOp(nextOp);
    setParentId(nextParentId);
    setCategoryId(nextCategoryId);
    setCategoryKind(nextKind);
    setVersion(nextVersion);
  };

  // Keep the optimistic version in sync when the tree updates (e.g. after a
  // rename). Without this, save → rename again without refresh would hit a
  // stale version conflict.
  useEffect(() => {
    if (categoryId === null || categoryKind === null) return;
    if (categoryKind === 'parent') {
      const parent = tree.find((entry) => entry.id === categoryId);
      if (parent && parent.version !== version) {
        setVersion(parent.version);
      }
    } else {
      const child = tree.flatMap((p) => p.children).find((entry) => entry.id === categoryId);
      if (child && child.version !== version) {
        setVersion(child.version);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync version on tree change only
  }, [tree, categoryId, categoryKind]);

  const needsParent = op === 'add-child';
  const needsCategory = op === 'rename' || op === 'retire';

  const categorySelectValue =
    categoryId === null || categoryKind === null ? '' : `${categoryKind}:${categoryId}`;

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3"
      data-category-ready={ready ? 'true' : 'false'}
      inert={!ready ? true : undefined}
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="category-op" className={labelClass}>
            Operation
          </label>
          <select
            id="category-op"
            value={op}
            onChange={(event) => pick(event.target.value as typeof op, null, null, null, null)}
            className={inputClass}
          >
            <option value="add-parent">Add a parent category</option>
            <option value="add-child">Add a child category</option>
            <option value="rename">Rename a category</option>
            <option value="retire">Retire a child category</option>
          </select>
        </div>
        {needsParent ? (
          <div className="flex flex-col gap-1">
            <label htmlFor="category-parent" className={labelClass}>
              Under which parent
            </label>
            <select
              id="category-parent"
              value={parentId === null ? '' : String(parentId)}
              onChange={(event) =>
                pick(
                  'add-child',
                  event.target.value === '' ? null : Number(event.target.value),
                  null,
                  null,
                  null,
                )
              }
              className={inputClass}
            >
              <option value="" disabled>
                Choose…
              </option>
              {tree.map((parent) => (
                <option key={parent.id} value={parent.id}>
                  {parent.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {needsCategory ? (
          <div className="flex flex-col gap-1">
            <label htmlFor="category-which" className={labelClass}>
              Which category
            </label>
            <select
              id="category-which"
              value={categorySelectValue}
              onChange={(event) => {
                const value = event.target.value;
                if (value === '') {
                  pick(op, null, null, null, null);
                  return;
                }
                const [kind, id] = value.split(':');
                const numId = Number(id);
                const parsedKind = kind === 'parent' ? 'parent' : 'child';
                if (parsedKind === 'parent') {
                  const parent = tree.find((entry) => entry.id === numId);
                  pick(op, null, numId, 'parent', parent?.version ?? null);
                } else {
                  const child = tree
                    .flatMap((parent) => parent.children)
                    .find((entry) => entry.id === numId);
                  pick(op, null, numId, 'child', child?.version ?? null);
                }
              }}
              className={inputClass}
            >
              <option value="" disabled>
                Choose…
              </option>
              {tree.map((parent) => (
                <optgroup key={parent.id} label={parent.name}>
                  <option value={`parent:${parent.id}`}>{parent.name} (parent)</option>
                  {parent.children.map((child) => (
                    <option key={child.id} value={`child:${child.id}`}>
                      {child.name}
                      {child.retired ? ' (retired)' : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        ) : null}
      </div>
      <input type="hidden" name="op" value={op} />
      {needsParent ? <input type="hidden" name="parentId" value={parentId ?? ''} /> : null}
      {needsCategory ? <input type="hidden" name="categoryId" value={categoryId ?? ''} /> : null}
      {needsCategory && version !== null ? (
        <input type="hidden" name="version" value={version} />
      ) : null}
      {op === 'rename' || op === 'add-parent' || op === 'add-child' ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="category-name" className={labelClass}>
            Name
          </label>
          <input
            id="category-name"
            name="name"
            type="text"
            required
            minLength={2}
            maxLength={60}
            placeholder={op === 'add-parent' ? 'e.g. Home Improvement' : 'e.g. Pet Care'}
            className={inputClass}
          />
        </div>
      ) : null}
      <button type="submit" disabled={pending} className={`${submitClass} self-start`}>
        {pending ? 'Saving…' : 'Apply'}
      </button>
      <FormMessage status={state.status} message={state.message} />

      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {tree.map((parent) => (
          <li key={parent.id} className="rounded-lg border border-border bg-canvas p-2.5">
            <p className="text-sm font-semibold text-ink-emphasis">{parent.name}</p>
            <ul className="mt-1.5 space-y-0.5 text-sm">
              {parent.children.map((child) => (
                <li
                  key={child.id}
                  className={child.retired ? 'text-ink-faint line-through' : 'text-ink-soft'}
                >
                  {child.name}
                </li>
              ))}
              {parent.children.length === 0 ? (
                <li className="text-xs text-ink-faint">No children yet</li>
              ) : null}
            </ul>
          </li>
        ))}
      </ul>
    </form>
  );
}

export interface WarningLeadsFormProps {
  renewalLeadDays: number;
  contractEndLeadDays: number;
}

/** Key-date warning windows (SPEC §21) — how many days ahead to warn. */
export function WarningLeadsForm({ renewalLeadDays, contractEndLeadDays }: WarningLeadsFormProps) {
  const [state, formAction, pending] = useActionState(saveWarningLeadsAction, initialActionState);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:max-w-md">
        <div className="flex flex-col gap-1">
          <label htmlFor="warning-renewals" className={labelClass}>
            Renewals — warn days before
          </label>
          <input
            id="warning-renewals"
            name="renewalLeadDays"
            type="number"
            required
            min={0}
            max={365}
            defaultValue={renewalLeadDays}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="warning-contracts" className={labelClass}>
            Contract ends — warn days before
          </label>
          <input
            id="warning-contracts"
            name="contractEndLeadDays"
            type="number"
            required
            min={0}
            max={365}
            defaultValue={contractEndLeadDays}
            className={inputClass}
          />
        </div>
      </div>
      <button type="submit" disabled={pending} className={`${submitClass} self-start`}>
        {pending ? 'Saving…' : 'Save warning leads'}
      </button>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}

export interface PotDefaultUsesFormProps {
  potId: number;
  potLabel: string;
  till: boolean;
  transactions: boolean;
  schedule: boolean;
}

/**
 * The three "Set as default account for" ticks on a pot's own card (GitHub
 * issue #79). They replace the detached Quick entry and All Transactions
 * cards: the household picks the account where the default belongs, and the
 * new-schedule default joins them. One account per use — ticking here moves
 * the use from whichever pot held it before.
 *
 * Controlled, so a save that moves a default between pots is reflected on
 * both cards after the server refresh; a failed save leaves the ticks as
 * they were.
 */
export function PotDefaultUsesForm({
  potId,
  potLabel,
  till,
  transactions,
  schedule,
}: PotDefaultUsesFormProps) {
  const [state, formAction, pending] = useActionState(savePotDefaultUsesAction, initialActionState);
  const [ticks, setTicks] = useState({ till, transactions, schedule });
  /**
   * The tick boxes are controlled React state (decision 131): a click that
   * lands before hydration is undone by the hydration render, so the form
   * says whether it is listening and stays `inert` until it is.
   */
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  useEffect(() => {
    setTicks({ till, transactions, schedule });
  }, [till, transactions, schedule]);

  return (
    <form
      action={formAction}
      className="mt-3 flex flex-col gap-2 border-t border-border-hairline pt-3"
      data-pot-defaults-ready={ready ? 'true' : 'false'}
      inert={!ready ? true : undefined}
    >
      <input type="hidden" name="potId" value={potId} />
      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-xs font-medium text-ink-soft">Set as default account for:</legend>
        <p className="text-xs text-ink-muted">
          One account per use — ticking here moves the default from any other pot.
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          <label className="flex min-h-9 items-center gap-2 text-sm text-ink-body">
            <input
              type="checkbox"
              name="uses"
              value="till"
              checked={ticks.till}
              onChange={(event) =>
                setTicks((current) => ({ ...current, till: event.target.checked }))
              }
              aria-label={`${potLabel} — default for Till`}
              className="h-4 w-4 rounded border-border-strong"
            />
            Till
          </label>
          <label className="flex min-h-9 items-center gap-2 text-sm text-ink-body">
            <input
              type="checkbox"
              name="uses"
              value="transactions"
              checked={ticks.transactions}
              onChange={(event) =>
                setTicks((current) => ({ ...current, transactions: event.target.checked }))
              }
              aria-label={`${potLabel} — default for Transactions`}
              className="h-4 w-4 rounded border-border-strong"
            />
            Transactions
          </label>
          <label className="flex min-h-9 items-center gap-2 text-sm text-ink-body">
            <input
              type="checkbox"
              name="uses"
              value="schedule"
              checked={ticks.schedule}
              onChange={(event) =>
                setTicks((current) => ({ ...current, schedule: event.target.checked }))
              }
              aria-label={`${potLabel} — default for New DD/SO`}
              className="h-4 w-4 rounded border-border-strong"
            />
            New DD/SO
          </label>
        </div>
      </fieldset>
      <button type="submit" disabled={pending} className={`${submitClass} self-start`}>
        {pending ? 'Saving…' : 'Save default uses'}
      </button>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}

export interface PersonSignInFormProps {
  personId: number;
  personLabel: string;
  email: string | null;
  choices: string[];
}

/**
 * "Signs in as" (SPEC §15.2, decision 146): which allowlisted sign-in is this
 * person. The till then starts Paid by — and the Fuel form's vehicle — on
 * whoever is signed in, instead of on the first person for everyone.
 */
export function PersonSignInForm({ personId, personLabel, email, choices }: PersonSignInFormProps) {
  const [state, formAction, pending] = useActionState(savePersonEmailAction, initialActionState);
  const id = `person-email-${personId}`;
  return (
    <form action={formAction} className="mt-3 flex flex-col gap-1">
      <input type="hidden" name="personId" value={personId} />
      <label htmlFor={id} className={labelClass}>
        Signs in as
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <select
          id={id}
          name="email"
          defaultValue={email ?? ''}
          aria-label={`${personLabel} signs in as`}
          className={`${inputClass} min-w-0 max-w-full flex-1`}
        >
          <option value="">Not linked</option>
          {choices.map((choice) => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
        </select>
        <button type="submit" disabled={pending} className={submitClass}>
          {pending ? 'Saving…' : 'Save sign-in'}
        </button>
      </div>
      <p className="text-xs text-ink-muted">
        When this sign-in opens the till, Paid by starts on {personLabel} and Fuel starts on the
        vehicle {personLabel} owns.
      </p>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}
