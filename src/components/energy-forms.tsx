'use client';

import { useActionState } from 'react';
import { saveEnergySetupAction, saveEnergyTariffAction } from '@/app/actions';
import { initialActionState } from '@/lib/action-state';
import type { EnergySetup } from '@/lib/records/settings';
import type { EnergyTariff } from '@/lib/records/energy-usage';
import { formatStandingCharge, formatUnitRate } from '@/lib/records/energy-usage';
import { penceInput } from '@/lib/money';

/**
 * The Energy page's two forms (issue 118, v1.44.0; SPEC §29): the household's
 * meters, and one tariff per fuel.
 *
 * Both are plain server-action forms inside native `<details>` disclosures —
 * the pattern every other inline editor in the app uses — so the page needs no
 * client state to stay usable, and a phone closes the panel by tapping the
 * summary again.
 */

const inputClass =
  'rounded border border-border-strong bg-surface px-2.5 py-1.5 text-sm tabular-nums focus:border-border-emphasis focus:outline-none';
const labelClass = 'flex flex-col gap-1 text-xs font-medium text-ink-soft';
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

export interface EnergySetupFormProps {
  setup: EnergySetup;
  /** Every leaf category, for the household that renamed Utilities / Energy. */
  categoryOptions: Array<{ id: number; label: string }>;
  energyCategoryLabel: string | null;
}

export function EnergySetupForm({
  setup,
  categoryOptions,
  energyCategoryLabel,
}: EnergySetupFormProps) {
  const [state, formAction, pending] = useActionState(saveEnergySetupAction, initialActionState);
  return (
    <details className="mt-2" data-energy-setup>
      <summary className="cursor-pointer text-sm font-medium text-accent hover:text-accent-900">
        Your meters{energyCategoryLabel === null ? '' : ` · ${energyCategoryLabel}`}
      </summary>
      <form action={formAction} className="mt-3 flex max-w-xl flex-col gap-3">
        <p className="text-xs text-ink-muted">
          A smart meter shows the readings the bill prints, so the app asks for them. Without one,
          the bill&apos;s estimated usage drifts until somebody reads the meter — so the boxes stay
          out of the way.
        </p>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-xs font-medium text-ink-soft">Smart meters</legend>
          <label className="flex min-h-[44px] items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="gasSmart"
              value="1"
              defaultChecked={setup.gasSmart}
              className="h-4 w-4 accent-ink"
            />
            The gas meter is smart
          </label>
          <label className="flex min-h-[44px] items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="electricSmart"
              value="1"
              defaultChecked={setup.electricSmart}
              className="h-4 w-4 accent-ink"
            />
            The electricity meter is smart
          </label>
        </fieldset>
        <label className={labelClass}>
          What the gas meter prints
          <select name="gasReadingUnit" defaultValue={setup.gasReadingUnit} className={inputClass}>
            <option value="m3">m³ (most gas meters)</option>
            <option value="kwh">kWh (some in-home displays)</option>
          </select>
        </label>
        <label className={labelClass}>
          Which category means energy
          <select
            name="categoryId"
            defaultValue={setup.categoryId === null ? '' : String(setup.categoryId)}
            className={inputClass}
          >
            <option value="">Utilities / Energy (the default)</option>
            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="showOnPurchases"
            value="1"
            defaultChecked={setup.showOnPurchases}
            className="h-4 w-4 accent-ink"
          />
          Show the energy block on Purchases
        </label>
        <button type="submit" disabled={pending} className={`${submitClass} self-start`}>
          {pending ? 'Saving…' : 'Save meters'}
        </button>
        <FormMessage status={state.status} message={state.message} />
      </form>
    </details>
  );
}

export interface EnergyTariffFormProps {
  fuel: 'gas' | 'electric';
  tariff: EnergyTariff | null;
  /* Rates are shown ex VAT, as the bill prints them. */
  label: string;
}

export function EnergyTariffForm({ fuel, tariff, label }: EnergyTariffFormProps) {
  const [state, formAction, pending] = useActionState(saveEnergyTariffAction, initialActionState);
  return (
    <details className="mt-2" data-energy-tariff={fuel}>
      <summary className="cursor-pointer text-sm font-medium text-accent hover:text-accent-900">
        {tariff === null ? `Add the ${label.toLowerCase()} tariff` : 'Change the tariff'}
      </summary>
      <form action={formAction} className="mt-3 flex flex-col gap-2">
        <input type="hidden" name="fuel" value={fuel} />
        <p className="text-xs text-ink-muted">
          Copy the figures from the bill — they are quoted without VAT, and the app adds the 5%
          itself.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className={labelClass}>
            Supplier
            <input
              name="supplier"
              defaultValue={tariff?.supplier ?? ''}
              placeholder="e.g. Octopus Energy"
              required
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Tariff name
            <input
              name="tariffName"
              defaultValue={tariff?.tariffName ?? ''}
              placeholder="e.g. Simply Fixed Oct26v12"
              required
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Unit rate (p/kWh)
            <input
              name="unitRate"
              defaultValue={
                tariff === null
                  ? ''
                  : formatUnitRate(tariff.unitRateMilliPencePerKwh).replace('p', '')
              }
              inputMode="decimal"
              placeholder="e.g. 4.748"
              required
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Standing charge (p/day)
            <input
              name="standingCharge"
              defaultValue={
                tariff === null
                  ? ''
                  : formatStandingCharge(tariff.standingChargeMilliPencePerDay).replace('p', '')
              }
              inputMode="decimal"
              placeholder="e.g. 25.902"
              required
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Price guaranteed until
            <input
              name="fixedUntil"
              type="date"
              defaultValue={tariff?.fixedUntil ?? ''}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Early exit fee (£)
            <input
              name="exitFee"
              defaultValue={tariff?.exitFeePence == null ? '' : penceInput(tariff.exitFeePence)}
              inputMode="decimal"
              placeholder="e.g. 50"
              className={inputClass}
            />
          </label>
        </div>
        <label className={labelClass}>
          Notes (optional)
          <input name="notes" defaultValue={tariff?.notes ?? ''} className={inputClass} />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={pending} className={submitClass}>
            {pending ? 'Saving…' : 'Save tariff'}
          </button>
          {tariff === null ? null : (
            <button
              type="submit"
              name="clear"
              value="1"
              formNoValidate
              disabled={pending}
              className="rounded border border-border-strong px-3 py-1.5 text-sm font-medium text-ink-soft hover:bg-canvas"
            >
              Remove this tariff
            </button>
          )}
        </div>
        <FormMessage status={state.status} message={state.message} />
      </form>
    </details>
  );
}
