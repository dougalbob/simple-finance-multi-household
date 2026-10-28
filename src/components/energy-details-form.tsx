'use client';

import { useActionState, useState } from 'react';
import { editEnergyDetailsAction } from '@/app/actions';
import { initialActionState } from '@/lib/action-state';
import type { EnergyRowDetailsProps } from '@/lib/records/energy';
import { formatKwh, formatReading, formatUnitRate, parseKwh } from '@/lib/records/energy-usage';
import { formatPence } from '@/lib/money';

/**
 * The optional energy block under an energy purchase (issue 118, v1.44.0;
 * SPEC §29).
 *
 * Hidden by default in the only way that matters: a collapsed `<details>`
 * under the row, like "Fuel details", so a household that tracks nothing sees
 * one line and a household that tracks everything gets its figures a click
 * away. The reading boxes appear **only** for a meter the household has told
 * the app is smart — an estimated reading drifts away from reality, so nothing
 * asks for one until the household says a real one exists.
 */
export function EnergyDetailsForm(props: EnergyRowDetailsProps) {
  const [state, formAction, pending] = useActionState(editEnergyDetailsAction, initialActionState);
  const { details, setup } = props;
  const [gasKwh, setGasKwh] = useState(details.gasWh === null ? '' : formatKwh(details.gasWh));
  const [electricKwh, setElectricKwh] = useState(
    details.electricWh === null ? '' : formatKwh(details.electricWh),
  );

  const gasUnit = setup.gasReadingUnit === 'kwh' ? 'kWh' : 'm³';
  const missing = [
    details.gasWh === null && details.electricWh === null ? 'the kWh from the bill' : null,
    details.periodStart === null ? 'the billing period' : null,
  ].filter((entry): entry is string => entry !== null);

  const label = props.recorded ? 'Energy details' : 'Energy details — add this period’s kWh';

  return (
    <div className="mt-1 text-xs" data-energy-details={props.purchaseId}>
      {props.summary !== null ? (
        <p className="text-ink-soft">
          <span aria-hidden="true">⚡ </span>
          <span className="font-medium text-ink-body">Energy</span> · {props.summary}
          {props.energyPence !== null ? (
            <>
              {' · '}
              {formatPence(props.energyPence)} paid
              {props.effectivePencePerKwh !== null ? (
                <span className="text-ink-muted">
                  {' '}
                  ({formatUnitRate(props.effectivePencePerKwh)}/kWh including standing charge)
                </span>
              ) : null}
            </>
          ) : null}
        </p>
      ) : null}
      {props.notes.length > 0 ? (
        <ul className="mt-1 space-y-0.5 text-ink-muted">
          {props.notes.map((note) => (
            <li key={`${note.kind}-${note.message}`}>{note.message}</li>
          ))}
        </ul>
      ) : null}
      {props.editable ? (
        <details className="mt-1">
          <summary className="cursor-pointer font-medium text-accent hover:text-accent-900">
            {props.recorded ? 'Correct the energy details' : label}
          </summary>
          <form action={formAction} className="mt-2 flex max-w-lg flex-col gap-2" data-energy-form>
            <input type="hidden" name="purchaseId" value={props.purchaseId} />
            <input type="hidden" name="expectedVersion" value={props.expectedVersion} />
            <p className="font-normal text-ink-muted">
              The bill&apos;s own figures — from the statement, not the direct debit.
            </p>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 font-medium text-ink-body">Billing period</legend>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 font-medium text-ink-body">
                  From
                  <input
                    type="date"
                    name="periodStart"
                    defaultValue={details.periodStart ?? props.suggestedPeriodStart ?? ''}
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1 font-medium text-ink-body">
                  To
                  <input
                    type="date"
                    name="periodEnd"
                    defaultValue={details.periodEnd ?? props.suggestedPeriodEnd ?? ''}
                    className={inputClass}
                  />
                </label>
              </div>
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label className="flex flex-col gap-1 font-medium text-ink-body">
                  Gas used (kWh)
                  <input
                    name="gasKwh"
                    value={gasKwh}
                    onChange={(event) => setGasKwh(event.target.value)}
                    inputMode="decimal"
                    placeholder="e.g. 755.23"
                    className={inputClass}
                  />
                </label>
                <p className="font-normal text-ink-muted">{gasHint(gasKwh)}</p>
                {setup.gasSmart ? (
                  <fieldset className="flex flex-col gap-1">
                    <legend className="mb-1 font-medium text-ink-body">
                      Gas meter reading ({gasUnit})
                    </legend>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        name="gasReadingStart"
                        defaultValue={
                          details.gasReadingStart === null
                            ? props.suggestedGasReadingStart === null
                              ? ''
                              : formatReading(props.suggestedGasReadingStart)
                            : formatReading(details.gasReadingStart)
                        }
                        inputMode="decimal"
                        placeholder="opening"
                        aria-label="Gas opening reading"
                        className={inputClass}
                      />
                      <input
                        name="gasReadingEnd"
                        defaultValue={
                          details.gasReadingEnd === null ? '' : formatReading(details.gasReadingEnd)
                        }
                        inputMode="decimal"
                        placeholder="closing"
                        aria-label="Gas closing reading"
                        className={inputClass}
                      />
                    </div>
                  </fieldset>
                ) : null}
              </div>

              <div className="flex flex-col gap-2">
                <label className="flex flex-col gap-1 font-medium text-ink-body">
                  Electricity used (kWh)
                  <input
                    name="electricKwh"
                    value={electricKwh}
                    onChange={(event) => setElectricKwh(event.target.value)}
                    inputMode="decimal"
                    placeholder="e.g. 268.4"
                    className={inputClass}
                  />
                </label>
                <p className="font-normal text-ink-muted">
                  {setup.electricSmart
                    ? 'Blank? It is worked out from the two readings below.'
                    : 'From the bill. Leave blank if this bill was gas only.'}
                </p>
                {setup.electricSmart ? (
                  <fieldset className="flex flex-col gap-1">
                    <legend className="mb-1 font-medium text-ink-body">
                      Electricity meter reading (kWh)
                    </legend>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        name="electricReadingStart"
                        defaultValue={
                          details.electricReadingStart === null
                            ? props.suggestedElectricReadingStart === null
                              ? ''
                              : formatReading(props.suggestedElectricReadingStart)
                            : formatReading(details.electricReadingStart)
                        }
                        inputMode="decimal"
                        placeholder="opening"
                        aria-label="Electricity opening reading"
                        className={inputClass}
                      />
                      <input
                        name="electricReadingEnd"
                        defaultValue={
                          details.electricReadingEnd === null
                            ? ''
                            : formatReading(details.electricReadingEnd)
                        }
                        inputMode="decimal"
                        placeholder="closing"
                        aria-label="Electricity closing reading"
                        className={inputClass}
                      />
                    </div>
                  </fieldset>
                ) : null}
              </div>
            </div>

            <details className="font-normal">
              <summary className="cursor-pointer font-medium text-accent hover:text-accent-900">
                Estimated annual usage (optional)
              </summary>
              <p className="mt-1 text-ink-muted">
                Printed on the bill. The switching comparison uses it until you have 30 days of your
                own bills to go on.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 font-medium text-ink-body">
                  Gas (kWh a year)
                  <input
                    name="gasEstimateKwh"
                    defaultValue={
                      details.gasEstimateWh === null ? '' : formatKwh(details.gasEstimateWh)
                    }
                    inputMode="decimal"
                    placeholder="e.g. 21699"
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1 font-medium text-ink-body">
                  Electricity (kWh a year)
                  <input
                    name="electricEstimateKwh"
                    defaultValue={
                      details.electricEstimateWh === null
                        ? ''
                        : formatKwh(details.electricEstimateWh)
                    }
                    inputMode="decimal"
                    placeholder="e.g. 2700"
                    className={inputClass}
                  />
                </label>
              </div>
            </details>

            <label className="flex flex-col gap-1 font-medium text-ink-body">
              Note (optional)
              <input
                name="note"
                defaultValue={details.note ?? ''}
                placeholder="e.g. includes the cold snap"
                className={inputClass}
              />
            </label>

            <button
              type="submit"
              disabled={pending}
              className="self-start rounded-lg bg-till px-3 py-2 font-semibold text-till-ink disabled:opacity-60"
            >
              {pending ? 'Saving…' : 'Save energy details'}
            </button>
            {missing.length > 0 && !props.recorded ? (
              <p className="text-ink-muted">Worth adding: {missing.join(' and ')}.</p>
            ) : null}
            {state.message !== null ? (
              <p
                role="status"
                className={state.status === 'error' ? 'text-danger' : 'text-positive'}
              >
                {state.message}
              </p>
            ) : null}
          </form>
        </details>
      ) : null}
    </div>
  );
}

/** What to expect in the kWh box, worked out from the readings as they are typed. */
function gasHint(gasKwh: string): string {
  const parsed = parseKwh(gasKwh, 'Gas usage');
  if (parsed === null)
    return 'The “Energy used” figure on the bill. Gas is never converted from m³.';
  return `= ${formatKwh(parsed)} kWh on the bill.`;
}

const inputClass =
  'rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-sm font-normal tabular-nums text-ink focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200';
