'use client';

import { useActionState, useEffect, useId, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { resetLongTermPlanAction, saveLongTermPlanAction } from '@/app/actions';
import { initialActionState } from '@/lib/action-state';
import {
  formatRateInput,
  nextEntityId,
  parsePercentBp,
  type LongTermPlanDocument,
} from '@/lib/longterm/plan';
import type {
  CommitmentPlan,
  InvestmentPlan,
  LongTermPerson,
  PensionPotPlan,
  WindfallPlan,
} from '@/lib/longterm/types';
import { LIFE_EXPECTANCY_AGE, PLAN_TO_MARGIN_YEARS } from '@/lib/longterm/rates';
import { parsePence, penceInput } from '@/lib/money';

const inputClass =
  'rounded border border-border-strong bg-surface px-2.5 py-1.5 text-sm focus:border-border-emphasis focus:outline-none disabled:opacity-60';
const labelClass = 'text-xs font-medium text-ink-soft';
const submitClass =
  'rounded bg-till px-3 py-1.5 text-sm font-medium text-till-ink disabled:opacity-60';
const secondaryButtonClass =
  'rounded border border-border-strong bg-surface px-3 py-1.5 text-sm font-medium text-ink-body disabled:opacity-60';
const removeButtonClass = 'text-xs sf-link';

const HINT_CLASS = 'text-[11px] text-ink-muted';

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

/**
 * Money as a text field: the household types pounds, the plan stores pence.
 * The local string is what the household sees while typing ("12." stays
 * "12."); once it parses exactly, the draft updates. A blank or malformed
 * value is restored to the last valid figure on blur, so an invalid plan can
 * never be submitted from a half-typed field.
 */
function PenceField({
  id,
  label,
  value,
  onValue,
  hint,
  disabled,
}: {
  id: string;
  label: string;
  value: number;
  onValue: (pence: number) => void;
  hint?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(() => penceInput(value));
  const [valid, setValid] = useState(true);
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className="flex items-center gap-1">
        <span className="text-sm text-ink-muted">£</span>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={text}
          disabled={disabled}
          aria-invalid={!valid}
          onChange={(event) => {
            const raw = event.target.value;
            setText(raw);
            const parsed = parsePence(raw);
            if (parsed !== null && parsed >= 0) {
              setValid(true);
              onValue(parsed);
            } else {
              setValid(false);
            }
          }}
          onBlur={() => {
            const parsed = parsePence(text);
            if (parsed === null || parsed < 0) {
              setText(penceInput(value));
              setValid(true);
            } else {
              setText(penceInput(parsed));
            }
          }}
          className={`${inputClass} w-full ${valid ? '' : 'border-danger'}`}
        />
      </div>
      {hint === undefined ? null : <p className={HINT_CLASS}>{hint}</p>}
    </div>
  );
}

/** A percentage field in basis points (600 ↔ "6.00"). */
function RateField({
  id,
  label,
  valueBp,
  onValue,
  hint,
  disabled,
}: {
  id: string;
  label: string;
  valueBp: number;
  onValue: (bp: number) => void;
  hint?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(() => formatRateInput(valueBp));
  const [valid, setValid] = useState(true);
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className="flex items-center gap-1">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={text}
          disabled={disabled}
          aria-invalid={!valid}
          onChange={(event) => {
            const raw = event.target.value;
            setText(raw);
            const parsed = parsePercentBp(raw);
            if (parsed !== null) {
              setValid(true);
              onValue(parsed);
            } else {
              setValid(false);
            }
          }}
          onBlur={() => {
            const parsed = parsePercentBp(text);
            if (parsed === null) {
              setText(formatRateInput(valueBp));
              setValid(true);
            } else {
              setText(formatRateInput(parsed));
            }
          }}
          className={`${inputClass} w-full ${valid ? '' : 'border-danger'}`}
        />
        <span className="text-sm text-ink-muted">%</span>
      </div>
      {hint === undefined ? null : <p className={HINT_CLASS}>{hint}</p>}
    </div>
  );
}

/** A whole-number field with the same local-text guard as the money fields. */
function NumberField({
  id,
  label,
  value,
  onValue,
  min,
  max,
  disabled,
}: {
  id: string;
  label: string;
  value: number;
  onValue: (value: number) => void;
  min: number;
  max: number;
  disabled?: boolean;
}) {
  const [text, setText] = useState(() => String(value));
  const [valid, setValid] = useState(true);
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        step={1}
        value={text}
        disabled={disabled}
        aria-invalid={!valid}
        onChange={(event) => {
          const raw = event.target.value;
          setText(raw);
          if (/^\d{1,4}$/.test(raw)) {
            const number = Number(raw);
            if (number >= min && number <= max) {
              setValid(true);
              onValue(number);
              return;
            }
          }
          setValid(false);
        }}
        onBlur={() => {
          if (!valid) {
            setText(String(value));
            setValid(true);
          }
        }}
        className={`${inputClass} w-full ${valid ? '' : 'border-danger'}`}
      />
    </div>
  );
}

function DateField({
  id,
  label,
  value,
  onValue,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onValue: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input
        id={id}
        type="date"
        value={value}
        disabled={disabled}
        onChange={(event) => onValue(event.target.value)}
        className={inputClass}
      />
    </div>
  );
}

function TextField({
  id,
  label,
  value,
  onValue,
  disabled,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onValue: (value: string) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        disabled={disabled}
        maxLength={80}
        onChange={(event) => onValue(event.target.value)}
        className={inputClass}
      />
      {hint === undefined ? null : <p className={HINT_CLASS}>{hint}</p>}
    </div>
  );
}

function CheckField({
  id,
  label,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="rounded-lg border border-border-hairline p-3">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      {description === undefined ? null : (
        <p className="mb-2 text-xs text-ink-soft">{description}</p>
      )}
      <div className="space-y-3">{children}</div>
    </fieldset>
  );
}

export interface LongTermAssumptionsFormProps {
  initialDocument: LongTermPlanDocument;
  version: number;
  readOnly: boolean;
  /** Today's local date, so a new earning's default stop date is ten years on. */
  today: string;
  /** Open on first render while a warning is asking for a figure. */
  defaultOpen: boolean;
  /** `formatInstantLocal(record.updatedAt)` — shown above the fields. */
  lastSavedLabel: string;
}

/**
 * The assumptions editor (LONGTERM_FORECASTING.md slice 2): every pot value,
 * rate, amount and date in the plan, editable in one form.
 *
 * The draft is held in client state so rows can be added and removed without
 * a round trip; submit posts the whole plan as validated JSON. The server
 * re-validates and saves behind the row's version — a stale tab gets a visible
 * conflict rather than overwriting newer figures.
 */
export function LongTermAssumptionsForm({
  initialDocument,
  version,
  readOnly,
  today,
  defaultOpen,
  lastSavedLabel,
}: LongTermAssumptionsFormProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<LongTermPlanDocument>(initialDocument);
  // The panel stays where the household put it: a save that clears the last
  // warning must not collapse the form (and its success message) underneath
  // them. `defaultOpen` is only the first render's position.
  const [open, setOpen] = useState(defaultOpen);
  const [state, formAction, pending] = useActionState(saveLongTermPlanAction, initialActionState);
  const [resetState, resetFormAction, resetPending] = useActionState(
    resetLongTermPlanAction,
    initialActionState,
  );

  // A successful save re-renders the server page (new version, fresh figures);
  // the reset rebuilds the whole draft, so both replace the local copy.
  useEffect(() => {
    if (state.status === 'ok') router.refresh();
  }, [state.status, router]);
  useEffect(() => {
    if (resetState.status === 'ok') router.refresh();
  }, [resetState.status, router]);
  useEffect(() => {
    setDraft(initialDocument);
  }, [initialDocument]);

  function editPlan(mutator: (plan: LongTermPlanDocument['plan']) => void): void {
    setDraft((current) => {
      const next = structuredClone(current);
      mutator(next.plan);
      return next;
    });
  }

  function editRates(index: 0 | 1 | 2, bp: number): void {
    setDraft((current) => {
      const next = structuredClone(current);
      next.comparisonRatesBp[index] = bp;
      return next;
    });
  }

  const startYear = Number(today.slice(0, 4));
  const allPotIds = draft.plan.people.flatMap((person) => person.pensionPots.map((pot) => pot.id));

  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="rounded-xl border border-border bg-surface shadow-sm"
    >
      <summary className="cursor-pointer px-4 py-3 text-lg font-semibold">
        The assumptions — every figure is editable
      </summary>
      <p className="px-4 text-xs text-ink-muted">
        Last saved {lastSavedLabel}. The draft started from your records and the reviewed defaults;
        nothing below is baked in.
      </p>
      <div className="space-y-4 px-4 pb-4 pt-3">
        <form action={formAction} className="space-y-4" key={version}>
          <input type="hidden" name="payload" value={JSON.stringify(draft)} />
          <input type="hidden" name="expectedVersion" value={version} />
          <fieldset disabled={readOnly} className="space-y-4">
            <Section
              title="The people"
              description="Each person is their own taxpayer. Birth years place every age-anchored answer and the forecast's end."
            >
              {draft.plan.people.map((person, personIndex) => (
                <PersonEditor
                  key={person.id}
                  person={person}
                  personIndex={personIndex}
                  canRemove={draft.plan.people.length > 1}
                  readOnly={readOnly}
                  today={today}
                  onEdit={(mutator, syncHorizon) =>
                    editPlan((plan) => {
                      const target = plan.people.find((entry) => entry.id === person.id);
                      if (target !== undefined) mutator(target);
                      if (syncHorizon) plan.horizonEndDate = laterPlanToEnd(plan);
                    })
                  }
                  onRemove={() =>
                    editPlan((plan) => {
                      plan.people = plan.people.filter((entry) => entry.id !== person.id);
                      const owner = plan.people[0]?.id;
                      if (owner !== undefined) {
                        for (const investment of plan.investments) {
                          if (investment.ownerPersonId === person.id) {
                            investment.ownerPersonId = owner;
                          }
                        }
                      }
                    })
                  }
                  onAddPot={() =>
                    editPlan((plan) => {
                      const target = plan.people.find((entry) => entry.id === person.id);
                      if (target === undefined) return;
                      const pot: PensionPotPlan = {
                        id: nextEntityId('pension', [
                          ...plan.people.flatMap((entry) =>
                            entry.pensionPots.map((candidate) => candidate.id),
                          ),
                        ]),
                        label: `Pension ${String.fromCharCode(65 + allPotIds.length)}`,
                        currentPence: 0,
                        growthBp: 600,
                        startDate: `${startYear + 5}-01-01`,
                        takeUp: 'drawdown',
                        annuityPencePer100k: 550_000,
                        annuityEscalationBp: 0,
                        drawdownAnnualPence: 0,
                      };
                      target.pensionPots.push(pot);
                    })
                  }
                  onRemovePot={(potId) =>
                    editPlan((plan) => {
                      const target = plan.people.find((entry) => entry.id === person.id);
                      if (target === undefined) return;
                      target.pensionPots = target.pensionPots.filter((pot) => pot.id !== potId);
                    })
                  }
                />
              ))}
              {draft.plan.people.length < 4 ? (
                <button
                  type="button"
                  className={secondaryButtonClass}
                  onClick={() =>
                    editPlan((plan) => {
                      const id = nextEntityId(
                        'person',
                        plan.people.map((person) => person.id),
                      );
                      plan.people.push({
                        id,
                        label: `Person ${plan.people.length + 1}`,
                        birthYear: 1985,
                        earnings: null,
                        statePension: null,
                        pensionPots: [],
                      });
                    })
                  }
                >
                  Add a person
                </button>
              ) : null}
            </Section>

            <Section
              title="Investments"
              description="Where the invested money lives decides its tax. ISA returns and withdrawals are untaxed; the GIA pays tax on dividends or interest and on realised gains. The inheritance lands in the GIA unless you say otherwise."
            >
              {draft.plan.investments.map((investment) => (
                <InvestmentEditor
                  key={investment.id}
                  investment={investment}
                  people={draft.plan.people}
                  readOnly={readOnly}
                  onEdit={(mutator) =>
                    editPlan((plan) => {
                      const target = plan.investments.find((entry) => entry.id === investment.id);
                      if (target !== undefined) mutator(target);
                    })
                  }
                  onRemove={() =>
                    editPlan((plan) => {
                      plan.investments = plan.investments.filter(
                        (entry) => entry.id !== investment.id,
                      );
                    })
                  }
                />
              ))}
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() =>
                  editPlan((plan) => {
                    const owner = plan.people[0]?.id;
                    if (owner === undefined) return;
                    plan.investments.push({
                      id: nextEntityId(
                        'investment',
                        plan.investments.map((investment) => investment.id),
                      ),
                      label: 'Investment account',
                      ownerPersonId: owner,
                      wrapper: 'gia',
                      currentPence: 0,
                      costBasisPence: 0,
                      growthBp: 600,
                      incomeShareBp: 0,
                      incomeKind: 'dividends',
                    });
                  })
                }
              >
                Add an investment account
              </button>
            </Section>

            <Section
              title="Windfalls"
              description="One-off money landing on a date and becoming invested capital — the inheritance, a house sale, a gift."
            >
              {draft.plan.windfalls.map((windfall, index) => (
                <WindfallEditor
                  key={`${windfall.label}-${index}`}
                  windfall={windfall}
                  readOnly={readOnly}
                  onEdit={(mutator) =>
                    editPlan((plan) => {
                      const target = plan.windfalls[index];
                      if (target !== undefined) mutator(target);
                    })
                  }
                  onRemove={() =>
                    editPlan((plan) => {
                      plan.windfalls.splice(index, 1);
                    })
                  }
                />
              ))}
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() =>
                  editPlan((plan) => {
                    plan.windfalls.push({
                      label: 'One-off money',
                      date: `${startYear + 1}-01-01`,
                      amountPence: 0,
                    });
                  })
                }
              >
                Add a windfall
              </button>
            </Section>

            <Section
              title="Spending"
              description="Recurring commitments plus the groceries and fuel basis, inflated each year. The end-dated commitments below are charged separately and never inflated."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <PenceField
                  id="longterm-spending-monthly"
                  label="Spending baseline, a month"
                  value={draft.plan.spending.monthlyPence}
                  onValue={(pence) =>
                    editPlan((plan) => {
                      plan.spending.monthlyPence = pence;
                    })
                  }
                  hint="Direct debits and standing orders without an end date, plus the weekly shop and fuel habit."
                />
                <PenceField
                  id="longterm-spending-other"
                  label="Everything else, a year"
                  value={draft.plan.spending.otherAnnualPence}
                  onValue={(pence) =>
                    editPlan((plan) => {
                      plan.spending.otherAnnualPence = pence;
                    })
                  }
                  hint={
                    draft.plan.spending.otherAnnualPence === 0
                      ? '£0.00 — the forecast flags this as flattering until a figure is set.'
                      : 'Holidays, house upkeep, cars, gifts, hobbies.'
                  }
                />
              </div>
            </Section>

            <Section
              title="End-dated commitments"
              description="A fixed monthly amount that stops on its end date — the mortgage, a car loan, a contract. Never inflated, because the payment is fixed. Records' schedules with an end date were drafted here."
            >
              {draft.plan.commitments.length === 0 ? (
                <p className="text-xs text-ink-muted">
                  None — no end-dated commitment is being modelled.
                </p>
              ) : null}
              {draft.plan.commitments.map((commitment, index) => (
                <CommitmentEditor
                  key={`${commitment.label}-${index}`}
                  commitment={commitment}
                  readOnly={readOnly}
                  onEdit={(mutator) =>
                    editPlan((plan) => {
                      const target = plan.commitments[index];
                      if (target !== undefined) mutator(target);
                    })
                  }
                  onRemove={() =>
                    editPlan((plan) => {
                      plan.commitments.splice(index, 1);
                    })
                  }
                />
              ))}
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() =>
                  editPlan((plan) => {
                    plan.commitments.push({
                      label: 'Commitment',
                      monthlyPence: 0,
                      endDate: `${startYear + 1}-12-31`,
                    });
                  })
                }
              >
                Add an end-dated commitment
              </button>
            </Section>

            <Section
              title="Inflation, sheltering and the forecast's end"
              description="Inflation is one figure per year, applied to all spending each January. The ISA shelter moves money from the GIA into the ISA each January, up to the yearly amount."
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <RateField
                  id="longterm-inflation"
                  label="Inflation, a year"
                  valueBp={draft.plan.inflationBp}
                  onValue={(bp) =>
                    editPlan((plan) => {
                      plan.inflationBp = bp;
                    })
                  }
                />
                <RateField
                  id="longterm-tax-thresholds"
                  label="Tax thresholds rise a year"
                  valueBp={draft.plan.taxThresholdsBp ?? 0}
                  hint="Allowances and tax bands rise each January from 2027, at this rate. The 2026/27 rates stay the basis."
                  onValue={(bp) =>
                    editPlan((plan) => {
                      plan.taxThresholdsBp = bp;
                    })
                  }
                />
                <PenceField
                  id="longterm-isa-shelter"
                  label="Move into ISAs, a year"
                  value={draft.plan.isaShelterAnnualPence}
                  onValue={(pence) =>
                    editPlan((plan) => {
                      plan.isaShelterAnnualPence = pence;
                    })
                  }
                  hint="The couple's combined £20,000 ISA caps are £40,000."
                />
                <DateField
                  id="longterm-horizon-end"
                  label="Forecast ends on"
                  value={draft.plan.horizonEndDate}
                  onValue={(date) =>
                    editPlan((plan) => {
                      plan.horizonEndDate = date;
                    })
                  }
                />
                <div className="rounded border border-dashed border-border-strong p-2 text-[11px] text-ink-muted">
                  The default end is the later of the people's plan-to years, and moves when a
                  plan-to age changes. Change it here if you want a different end.
                </div>
              </div>
            </Section>

            <Section
              title="The comparison rates"
              description="Cautious, middle and optimistic annual returns, treated as net of charges. They replace the investments' own growth in the three comparison runs; pension pots keep their own rates."
            >
              <div className="grid gap-3 sm:grid-cols-3">
                {(['Cautious', 'Middle', 'Optimistic'] as const).map((label, index) => (
                  <RateField
                    key={label}
                    id={`longterm-rate-${index}`}
                    label={label}
                    valueBp={draft.comparisonRatesBp[index] as number}
                    onValue={(bp) => editRates(index as 0 | 1 | 2, bp)}
                  />
                ))}
              </div>
            </Section>
          </fieldset>

          <div className="flex flex-wrap items-center gap-3">
            {readOnly ? (
              <p className="text-sm text-ink-soft">
                This is a read-only support view. Nothing can be changed from here.
              </p>
            ) : (
              <button type="submit" disabled={pending} className={submitClass}>
                {pending ? 'Saving…' : 'Save assumptions'}
              </button>
            )}
            <FormMessage status={state.status} message={state.message} />
          </div>
        </form>

        {readOnly ? null : (
          <form
            action={resetFormAction}
            onSubmit={(event) => {
              const confirmed = window.confirm(
                'Rebuild the draft from today’s records? Every assumption you have edited will be replaced.',
              );
              if (!confirmed) event.preventDefault();
            }}
            className="flex flex-wrap items-center gap-3 border-t border-border-hairline pt-3"
          >
            <input type="hidden" name="expectedVersion" value={version} />
            <button type="submit" disabled={resetPending} className={secondaryButtonClass}>
              {resetPending ? 'Rebuilding…' : 'Reset to a draft from records'}
            </button>
            <p className={HINT_CLASS}>
              Replaces the whole plan with a fresh draft: people and active commitments from
              records, plus the reviewed defaults. The audit trail keeps the old values.
            </p>
            <FormMessage status={resetState.status} message={resetState.message} />
          </form>
        )}
      </div>
    </details>
  );
}

/** The forecast ends on the later of the people's plan-to years (issue #73). */
function laterPlanToEnd(plan: LongTermPlanDocument['plan']): string {
  const ends = plan.people
    .filter((person) => person.planToAge !== undefined)
    .map((person) => `${person.birthYear + (person.planToAge ?? 0)}-12-31`);
  return ends.length === 0 ? plan.horizonEndDate : ends.reduce((a, b) => (a > b ? a : b));
}

function PersonEditor({
  person,
  personIndex,
  canRemove,
  readOnly,
  today,
  onEdit,
  onRemove,
  onAddPot,
  onRemovePot,
}: {
  person: LongTermPerson;
  personIndex: number;
  canRemove: boolean;
  readOnly: boolean;
  today: string;
  onEdit: (mutator: (person: LongTermPerson) => void, syncHorizon?: boolean) => void;
  onRemove: () => void;
  onAddPot: () => void;
  onRemovePot: (potId: string) => void;
}) {
  const currentYear = Number(today.slice(0, 4));
  return (
    <div className="rounded-lg border border-border-hairline p-3">
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`longterm-person-${personIndex}-sex`}
            className="text-xs font-medium text-ink-soft"
          >
            Sex
          </label>
          <select
            id={`longterm-person-${personIndex}-sex`}
            value={person.sex ?? ''}
            disabled={readOnly}
            className={inputClass}
            onChange={(event) => {
              const sex = event.target.value === 'man' ? 'man' : 'woman';
              onEdit((target) => {
                target.sex = sex;
                target.lifeExpectancyAge = LIFE_EXPECTANCY_AGE[sex];
                target.planToAge = LIFE_EXPECTANCY_AGE[sex] + PLAN_TO_MARGIN_YEARS;
              }, true);
            }}
          >
            <option value="" disabled>
              Choose
            </option>
            <option value="woman">Woman</option>
            <option value="man">Man</option>
          </select>
        </div>
        {person.lifeExpectancyAge === undefined ? null : (
          <NumberField
            id={`longterm-person-${personIndex}-life-expectancy`}
            label="Life expectancy (age)"
            value={person.lifeExpectancyAge}
            min={1}
            max={120}
            onValue={(value) =>
              onEdit((target) => {
                target.lifeExpectancyAge = value;
                target.planToAge = value + PLAN_TO_MARGIN_YEARS;
              }, true)
            }
            disabled={readOnly}
          />
        )}
        <NumberField
          id={`longterm-person-${personIndex}-plan-to`}
          label="Plan to age"
          value={person.planToAge ?? 0}
          min={1}
          max={120}
          onValue={(value) => onEdit((target) => (target.planToAge = value), true)}
          disabled={readOnly}
        />
        <p className={`sm:col-span-3 ${HINT_CLASS}`}>
          Life expectancy is an average — about half of people live longer. Plan to is the age this
          forecast runs to for this person; it defaults five years beyond life expectancy so the
          plan does not stop where half the population is still alive. The forecast ends on the
          later plan-to year. Both can be edited, including downwards.
        </p>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <TextField
          id={`longterm-person-${personIndex}-label`}
          label="Name"
          value={person.label}
          onValue={(value) => onEdit((target) => (target.label = value))}
          disabled={readOnly}
        />
        <NumberField
          id={`longterm-person-${personIndex}-birth-year`}
          label="Birth year"
          value={person.birthYear}
          min={1900}
          max={2100}
          onValue={(value) => onEdit((target) => (target.birthYear = value), true)}
          disabled={readOnly}
        />
        {canRemove ? (
          <div className="flex items-end">
            <button type="button" className={removeButtonClass} onClick={onRemove}>
              Remove this person
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded border border-border-hairline p-2">
          <CheckField
            id={`longterm-person-${personIndex}-earning`}
            label="Still earning"
            checked={person.earnings !== null}
            disabled={readOnly}
            onChange={(checked) =>
              onEdit((target) => {
                target.earnings = checked
                  ? {
                      monthlyPence: 300_000,
                      untilDate: `${currentYear + 10}-12-31`,
                      risesWithInflation: true,
                      risesBp: 350,
                    }
                  : null;
              })
            }
          />
          {person.earnings === null ? (
            <p className={`mt-1 ${HINT_CLASS}`}>
              No earnings modelled. Add them if this person is still working — the stop date is when
              the pay ends, not a retirement guess.
            </p>
          ) : (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <PenceField
                id={`longterm-person-${personIndex}-earnings`}
                label="Pay a month, today (gross)"
                value={person.earnings.monthlyPence}
                onValue={(pence) =>
                  onEdit((target) => {
                    if (target.earnings !== null) target.earnings.monthlyPence = pence;
                  })
                }
                disabled={readOnly}
              />
              <DateField
                id={`longterm-person-${personIndex}-earnings-until`}
                label="Last paid"
                value={person.earnings.untilDate}
                onValue={(date) =>
                  onEdit((target) => {
                    if (target.earnings !== null) target.earnings.untilDate = date;
                  })
                }
                disabled={readOnly}
              />
            </div>
          )}
          {person.earnings === null ? null : (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <CheckField
                id={`longterm-person-${personIndex}-earnings-inflation`}
                label="Rises with inflation"
                checked={person.earnings.risesWithInflation !== false}
                disabled={readOnly}
                onChange={(checked) =>
                  onEdit((target) => {
                    if (target.earnings !== null) target.earnings.risesWithInflation = checked;
                  })
                }
              />
              {person.earnings.risesWithInflation === false ? (
                <RateField
                  id={`longterm-person-${personIndex}-earnings-rises`}
                  label="Rises a year (override)"
                  valueBp={person.earnings.risesBp ?? 0}
                  onValue={(bp) =>
                    onEdit((target) => {
                      if (target.earnings !== null) target.earnings.risesBp = bp;
                    })
                  }
                  disabled={readOnly}
                />
              ) : null}
            </div>
          )}
          {person.earnings === null ? null : (
            <p className={`mt-1 ${HINT_CLASS}`}>
              Pay rises each January from today — with inflation while the box is ticked, or at the
              percentage you enter when it is not — and stops on the last day of pay.
            </p>
          )}
          {person.earnings === null ? null : (
            <p className={`mt-1 ${HINT_CLASS}`}>
              The stop date is the last day of pay. A draft fills it from your records, so correct
              it if the work stops earlier.
            </p>
          )}
        </div>

        <div className="rounded border border-border-hairline p-2">
          <CheckField
            id={`longterm-person-${personIndex}-state-pension`}
            label="State Pension"
            checked={person.statePension !== null}
            disabled={readOnly}
            onChange={(checked) =>
              onEdit((target) => {
                target.statePension = checked
                  ? {
                      weeklyPence: 24_130,
                      startDate: `${target.birthYear + (target.birthYear >= 1978 ? 68 : 67)}-01-01`,
                      upratingBp: 350,
                    }
                  : null;
              })
            }
          />
          {person.statePension === null ? (
            <p className={`mt-1 ${HINT_CLASS}`}>
              No State Pension modelled. The full new State Pension is about £241.30 a week in
              2026/27.
            </p>
          ) : (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <PenceField
                id={`longterm-person-${personIndex}-state-pension-weekly`}
                label="A week, today's rate (gross)"
                value={person.statePension.weeklyPence}
                onValue={(pence) =>
                  onEdit((target) => {
                    if (target.statePension !== null) target.statePension.weeklyPence = pence;
                  })
                }
                disabled={readOnly}
              />
              <DateField
                id={`longterm-person-${personIndex}-state-pension-start`}
                label="Starts"
                value={person.statePension.startDate}
                onValue={(date) =>
                  onEdit((target) => {
                    if (target.statePension !== null) target.statePension.startDate = date;
                  })
                }
                disabled={readOnly}
              />
              <RateField
                id={`longterm-person-${personIndex}-state-pension-uprating`}
                label="Rises a year (from today)"
                valueBp={person.statePension.upratingBp}
                onValue={(bp) =>
                  onEdit((target) => {
                    if (target.statePension !== null) target.statePension.upratingBp = bp;
                  })
                }
                disabled={readOnly}
              />
            </div>
          )}
          {person.statePension === null ? null : (
            <p className={`mt-2 ${HINT_CLASS}`}>
              The weekly figure is today&apos;s rate, not the rate when payments begin: the app
              grows it each January from today, through the start date. Rises a year defaults to a
              fixed 3.50%; it does not follow the plan&apos;s inflation rate. The State Pension
              triple lock is the highest of inflation, 2.5% or earnings growth; 3.50% is a mid
              assumption you can change.
            </p>
          )}
        </div>
      </div>

      <div className="mt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Pension pots</p>
        <div className="mt-2 space-y-3">
          {person.pensionPots.map((pot, potIndex) => (
            <PensionPotEditor
              key={pot.id}
              pot={pot}
              idPrefix={`longterm-person-${personIndex}-pot-${potIndex}`}
              readOnly={readOnly}
              onEdit={(mutator) =>
                onEdit((target) => {
                  const found = target.pensionPots.find((entry) => entry.id === pot.id);
                  if (found !== undefined) mutator(found);
                })
              }
              onRemove={() => onRemovePot(pot.id)}
            />
          ))}
          {person.pensionPots.length === 0 ? (
            <p className={HINT_CLASS}>No pension pot on this person.</p>
          ) : null}
          <button type="button" className={secondaryButtonClass} onClick={onAddPot}>
            Add a pension pot
          </button>
        </div>
      </div>
    </div>
  );
}

function PensionPotEditor({
  pot,
  idPrefix,
  readOnly,
  onEdit,
  onRemove,
}: {
  pot: PensionPotPlan;
  idPrefix: string;
  readOnly: boolean;
  onEdit: (mutator: (pot: PensionPotPlan) => void) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded border border-border-hairline bg-surface-muted/40 p-2">
      <div className="grid gap-2 sm:grid-cols-3">
        <TextField
          id={`${idPrefix}-label`}
          label="Pot name"
          value={pot.label}
          onValue={(value) => onEdit((target) => (target.label = value))}
          disabled={readOnly}
        />
        <PenceField
          id={`${idPrefix}-value`}
          label="Current value"
          value={pot.currentPence}
          onValue={(pence) => onEdit((target) => (target.currentPence = pence))}
          disabled={readOnly}
        />
        <RateField
          id={`${idPrefix}-growth`}
          label="Growth a year"
          valueBp={pot.growthBp}
          onValue={(bp) => onEdit((target) => (target.growthBp = bp))}
          disabled={readOnly}
        />
        <DateField
          id={`${idPrefix}-start`}
          label="Starts paying out"
          value={pot.startDate}
          onValue={(date) => onEdit((target) => (target.startDate = date))}
          disabled={readOnly}
        />
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idPrefix}-take-up`} className={labelClass}>
            Take it as
          </label>
          <select
            id={`${idPrefix}-take-up`}
            value={pot.takeUp}
            disabled={readOnly}
            onChange={(event) =>
              onEdit(
                (target) =>
                  (target.takeUp = event.target.value === 'annuity' ? 'annuity' : 'drawdown'),
              )
            }
            className={inputClass}
          >
            <option value="drawdown">Flexible drawdown</option>
            <option value="annuity">Annuity</option>
          </select>
        </div>
        <PenceField
          id={`${idPrefix}-drawdown`}
          label="Drawdown, a year (before tax)"
          value={pot.drawdownAnnualPence}
          onValue={(pence) => onEdit((target) => (target.drawdownAnnualPence = pence))}
          hint="A £0 withdrawal is flagged: a pot with a value but no withdrawal produces no pension income."
          disabled={readOnly}
        />
        <PenceField
          id={`${idPrefix}-annuity-rate`}
          label="Annuity income per £100,000 pot, a year"
          value={pot.annuityPencePer100k}
          onValue={(pence) => onEdit((target) => (target.annuityPencePer100k = pence))}
          hint="A comparison rate you enter — £5,500 is the design record's suggestion, not a quote."
          disabled={readOnly}
        />
        <RateField
          id={`${idPrefix}-annuity-escalation`}
          label="Annuity rises a year"
          valueBp={pot.annuityEscalationBp}
          onValue={(bp) => onEdit((target) => (target.annuityEscalationBp = bp))}
          disabled={readOnly}
        />
        <div className="flex items-end">
          <button type="button" className={removeButtonClass} onClick={onRemove}>
            Remove this pot
          </button>
        </div>
      </div>
    </div>
  );
}

function InvestmentEditor({
  investment,
  people,
  readOnly,
  onEdit,
  onRemove,
}: {
  investment: InvestmentPlan;
  people: LongTermPerson[];
  readOnly: boolean;
  onEdit: (mutator: (investment: InvestmentPlan) => void) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-lg border border-border-hairline p-2">
      <div className="grid gap-2 sm:grid-cols-3">
        <TextField
          id={`longterm-investment-${investment.id}-label`}
          label="Name"
          value={investment.label}
          onValue={(value) => onEdit((target) => (target.label = value))}
          disabled={readOnly}
        />
        <div className="flex flex-col gap-1">
          <label htmlFor={`longterm-investment-${investment.id}-owner`} className={labelClass}>
            Whose tax affairs
          </label>
          <select
            id={`longterm-investment-${investment.id}-owner`}
            value={investment.ownerPersonId}
            disabled={readOnly}
            onChange={(event) => onEdit((target) => (target.ownerPersonId = event.target.value))}
            className={inputClass}
          >
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`longterm-investment-${investment.id}-wrapper`} className={labelClass}>
            Wrapper
          </label>
          <select
            id={`longterm-investment-${investment.id}-wrapper`}
            value={investment.wrapper}
            disabled={readOnly}
            onChange={(event) =>
              onEdit((target) => (target.wrapper = event.target.value === 'isa' ? 'isa' : 'gia'))
            }
            className={inputClass}
          >
            <option value="isa">ISA — tax-free</option>
            <option value="gia">General investment account — taxed</option>
          </select>
        </div>
        <PenceField
          id={`longterm-investment-${investment.id}-value`}
          label="Current value"
          value={investment.currentPence}
          onValue={(pence) => onEdit((target) => (target.currentPence = pence))}
          disabled={readOnly}
        />
        <PenceField
          id={`longterm-investment-${investment.id}-basis`}
          label="What it cost (for gains)"
          value={investment.costBasisPence}
          onValue={(pence) => onEdit((target) => (target.costBasisPence = pence))}
          hint="Only a GIA's gains are taxed when units are sold."
          disabled={readOnly}
        />
        <RateField
          id={`longterm-investment-${investment.id}-growth`}
          label="Growth a year"
          valueBp={investment.growthBp}
          onValue={(bp) => onEdit((target) => (target.growthBp = bp))}
          hint="Overridden by the three comparison rates on the page."
          disabled={readOnly}
        />
        <RateField
          id={`longterm-investment-${investment.id}-income-share`}
          label="Share of growth paid out"
          valueBp={investment.incomeShareBp}
          onValue={(bp) => onEdit((target) => (target.incomeShareBp = bp))}
          hint="0% keeps it all invested; a natural-yield plan would raise this."
          disabled={readOnly}
        />
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`longterm-investment-${investment.id}-income-kind`}
            className={labelClass}
          >
            Income taxed as
          </label>
          <select
            id={`longterm-investment-${investment.id}-income-kind`}
            value={investment.incomeKind}
            disabled={readOnly}
            onChange={(event) =>
              onEdit(
                (target) =>
                  (target.incomeKind =
                    event.target.value === 'interest' ? 'interest' : 'dividends'),
              )
            }
            className={inputClass}
          >
            <option value="dividends">Dividends</option>
            <option value="interest">Interest</option>
          </select>
        </div>
        <div className="flex items-end">
          <button type="button" className={removeButtonClass} onClick={onRemove}>
            Remove this account
          </button>
        </div>
      </div>
    </div>
  );
}

function WindfallEditor({
  windfall,
  readOnly,
  onEdit,
  onRemove,
}: {
  windfall: WindfallPlan;
  readOnly: boolean;
  onEdit: (mutator: (windfall: WindfallPlan) => void) => void;
  onRemove: () => void;
}) {
  const baseId = useId();
  const id = `longterm-windfall-${baseId}`;
  return (
    <div className="grid gap-2 rounded-lg border border-border-hairline p-2 sm:grid-cols-4">
      <TextField
        id={`${id}-label`}
        label="Name"
        value={windfall.label}
        onValue={(value) => onEdit((target) => (target.label = value))}
        disabled={readOnly}
      />
      <DateField
        id={`${id}-date`}
        label="Lands on"
        value={windfall.date}
        onValue={(date) => onEdit((target) => (target.date = date))}
        disabled={readOnly}
      />
      <PenceField
        id={`${id}-amount`}
        label="Amount"
        value={windfall.amountPence}
        onValue={(pence) => onEdit((target) => (target.amountPence = pence))}
        disabled={readOnly}
      />
      <div className="flex items-end">
        <button type="button" className={removeButtonClass} onClick={onRemove}>
          Remove this windfall
        </button>
      </div>
    </div>
  );
}

function CommitmentEditor({
  commitment,
  readOnly,
  onEdit,
  onRemove,
}: {
  commitment: CommitmentPlan;
  readOnly: boolean;
  onEdit: (mutator: (commitment: CommitmentPlan) => void) => void;
  onRemove: () => void;
}) {
  const baseId = useId();
  const id = `longterm-commitment-${baseId}`;
  return (
    <div className="grid gap-2 rounded-lg border border-border-hairline p-2 sm:grid-cols-4">
      <TextField
        id={`${id}-label`}
        label="Name"
        value={commitment.label}
        onValue={(value) => onEdit((target) => (target.label = value))}
        disabled={readOnly}
      />
      <PenceField
        id={`${id}-monthly`}
        label="A month"
        value={commitment.monthlyPence}
        onValue={(pence) => onEdit((target) => (target.monthlyPence = pence))}
        disabled={readOnly}
      />
      <DateField
        id={`${id}-end`}
        label="Last payment"
        value={commitment.endDate}
        onValue={(date) => onEdit((target) => (target.endDate = date))}
        disabled={readOnly}
      />
      <div className="flex items-end">
        <button type="button" className={removeButtonClass} onClick={onRemove}>
          Remove this commitment
        </button>
      </div>
    </div>
  );
}
