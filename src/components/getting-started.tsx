import Link from 'next/link';
import { IncomeScheduleForm } from '@/components/income-forms';
import { AddCheckpointForm, CreatePotForm } from '@/components/pot-forms';
import { ProjectionSettingsForm } from '@/components/recurring';
import { AddVehicleForm, PaydaySettingForm } from '@/components/settings-forms';
import { AddPersonForm } from '@/components/setup-forms';
import {
  SETUP_PHASE_TITLES,
  SETUP_STEP_COPY,
  type SetupFormData,
  type SetupPathView,
  type SetupStepId,
  type SetupStepState,
  type SetupStepStatus,
} from '@/lib/records/setup-path';

/**
 * The setup path's two surfaces (docs/ONBOARDING_PLAN.md, Slice 1):
 *
 * - `GettingStartedCard` — the one first-run element on the home page. It
 *   shows the next incomplete step only, with its inline form, so a phone
 *   opening at the till is not buried under a checklist. It disappears the
 *   moment Phase A is complete, and becomes a one-line strip while Phase B
 *   is outstanding.
 * - `GettingStartedPath` — /start: every step, why it matters, what appears
 *   when it is done, and what to look at afterwards.
 *
 * Both render the same server-derived `SetupPathView`; neither stores anything
 * of its own. The inline fields reuse the canonical forms (pots, checkpoints,
 * income, projection figures, vehicles) so there is one implementation of each
 * action, not a wizard copy that can drift.
 */

export function GettingStartedCard({ view, forms }: { view: SetupPathView; forms: SetupFormData }) {
  if (view.phaseA.complete && view.phaseBOutstanding === 0) return null;

  if (view.phaseA.complete) {
    return (
      <section
        aria-labelledby="getting-started-strip"
        className="rounded-xl border border-border bg-surface px-4 py-3 shadow-sm"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p id="getting-started-strip" className="text-sm text-ink-soft">
            <span className="font-semibold text-ink">Getting started:</span>{' '}
            {view.phaseBOutstanding === 1
              ? 'one more step'
              : `${view.phaseBOutstanding} more steps`}{' '}
            — your bills, the projection figures and the first purchase make Insights and Charts
            complete.
          </p>
          <Link href="/start" className="text-sm sf-link-arrow">
            Finish setting up →
          </Link>
        </div>
      </section>
    );
  }

  const next = view.steps.find((step) => step.id === view.nextStepId) ?? null;
  if (next === null) return null;
  return (
    <section
      aria-labelledby="getting-started-heading"
      className="rounded-xl border border-accent-200 bg-accent-50 p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="getting-started-heading" className="text-lg font-semibold text-ink">
          Getting started
        </h2>
        <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-ink-soft">
          Step {view.phaseA.done + 1} of {view.phaseA.total} to your first projection
        </span>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        Nothing here is required and nothing is hidden behind it — the till works on its own. The
        four steps below are what makes the payday projection possible.
      </p>
      <ol className="mt-3">
        <StepCard step={next} forms={forms} compact />
      </ol>
      <p className="mt-2 text-sm">
        <Link href="/start" className="sf-link-arrow">
          See all the steps →
        </Link>
      </p>
    </section>
  );
}

export function GettingStartedPath({
  view,
  forms,
  readOnly = false,
}: {
  view: SetupPathView;
  forms: SetupFormData;
  readOnly?: boolean;
}) {
  const phaseA = view.steps.filter((step) => step.phase === 'A');
  const phaseB = view.steps.filter((step) => step.phase === 'B');
  return (
    <div className="space-y-6">
      {readOnly ? (
        <p className="rounded-xl border border-border bg-surface-muted p-3 text-sm text-ink-soft">
          This is a read-only support view, so the forms below are hidden. The steps still show what
          is recorded.
        </p>
      ) : null}

      <section aria-labelledby="phase-a-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="phase-a-heading" className="text-xl font-semibold tracking-tight">
            First: {SETUP_PHASE_TITLES.A}
          </h2>
          <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-ink-soft ring-1 ring-border">
            {view.phaseA.done} of {view.phaseA.total} done
          </span>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-ink-soft">
          Four short steps — household people, a bank or cash pot, its checkpoint and the household
          payday. A recurring income schedule is separate and optional: the projection works without
          one, and scheduled receipts still count on their due dates.
        </p>
        <ol className="mt-3 space-y-3">
          {phaseA.map((step) => (
            <StepCard key={step.id} step={step} forms={forms} readOnly={readOnly} />
          ))}
        </ol>
      </section>

      <section aria-labelledby="phase-b-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="phase-b-heading" className="text-xl font-semibold tracking-tight">
            Then: {SETUP_PHASE_TITLES.B}
          </h2>
          <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-ink-soft ring-1 ring-border">
            {view.phaseBOutstanding} left
          </span>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-ink-soft">
          The projection works without these, but it guesses less usefully: the bills and the
          figures are what turn it from arithmetic into a plan. Add them as you go.
        </p>
        <ol className="mt-3 space-y-3">
          {phaseB.map((step) => (
            <StepCard key={step.id} step={step} forms={forms} readOnly={readOnly} />
          ))}
        </ol>
      </section>

      <section
        aria-labelledby="review-rhythm-heading"
        className="rounded-xl border border-border bg-surface p-4 shadow-sm"
      >
        <h2 id="review-rhythm-heading" className="text-xl font-semibold tracking-tight">
          What to look at, and when
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          Nothing here needs doing every day. This is the shape of the app once the records are in.
        </p>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          {REVIEW_RHYTHM.map((item) => (
            <div key={item.id} className="rounded-lg bg-canvas p-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {item.when}
              </dt>
              <dd className="mt-1 text-sm text-ink-body">
                {item.where !== null ? (
                  <>
                    <Link href={item.where.href} className="sf-link">
                      {item.where.label}
                    </Link>{' '}
                    — {item.what}
                  </>
                ) : (
                  item.what
                )}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-sm text-ink-soft">
          The vocabulary behind all of it — checkpoints, estimates, transfers, the projection — is
          on the guide:{' '}
          <Link href="/guide" className="sf-link-arrow">
            How this app thinks →
          </Link>
        </p>
      </section>
    </div>
  );
}

const REVIEW_RHYTHM: Array<{
  /** Unique key: "Monthly" is the right heading for two different pages. */
  id: string;
  when: string;
  where: { href: string; label: string } | null;
  what: string;
}> = [
  {
    id: 'till',
    when: 'Each time it happens',
    where: { href: '/#quick-entry', label: 'Quick Entry' },
    what: 'the till records a purchase, fuel, a checkpoint or money moving — then attach the receipt on Purchases.',
  },
  {
    id: 'recurring',
    when: 'Weekly',
    where: { href: '/recurring', label: 'Recurring' },
    what: 'what is coming and the month calendar; review provider terms on Contracts & Renewals.',
  },
  {
    id: 'insights',
    when: 'Monthly',
    where: { href: '/insights', label: 'Insights' },
    what: 'where the money went, who spent what, vehicle running costs — and whether the figures you configured are honest.',
  },
  {
    id: 'charts',
    when: 'Monthly',
    where: { href: '/charts', label: 'Charts' },
    what: 'the same figures drawn: the month ahead, the weekly shop, personal spending and the fixed bills.',
  },
  {
    id: 'horizon',
    when: 'When money is tight',
    where: { href: '/horizon', label: 'Horizon' },
    what: 'how far the money would go, and the lowest point before payday.',
  },
  {
    id: 'tasks',
    when: 'Whenever the bell shows a dot',
    where: { href: '/tasks', label: 'Tasks' },
    what: 'what the app has noticed — a renewal due, a follow-up you promised — and what needs a look.',
  },
];

function StepCard({
  step,
  forms,
  compact = false,
  readOnly = false,
}: {
  step: SetupStepStatus;
  forms: SetupFormData;
  compact?: boolean;
  readOnly?: boolean;
}) {
  const copy = SETUP_STEP_COPY[step.id];
  const done = step.state === 'done';
  return (
    <li
      id={`setup-${step.id}`}
      className="sf-anchor rounded-xl border border-border bg-surface p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className={compact ? 'text-base font-semibold' : 'text-lg font-semibold'}>
          {copy.title}
        </h3>
        <StateBadge state={step.state} optional={step.optional} />
      </div>
      <p className="mt-1 max-w-3xl text-sm text-ink-soft">{copy.why}</p>
      <p className="mt-1 text-xs text-ink-muted">{step.detail}</p>
      {done ? (
        <p className="mt-2 text-sm text-positive">
          <span aria-hidden="true">✓ </span>
          {copy.payoff}
        </p>
      ) : (
        <>
          {!readOnly ? (
            <div className="mt-3">
              <StepAction id={step.id} forms={forms} />
            </div>
          ) : null}
          <p className="mt-2 text-xs text-ink-muted">When this is done: {copy.payoff}</p>
        </>
      )}
    </li>
  );
}

function StateBadge({ state, optional }: { state: SetupStepState; optional: boolean }) {
  if (state === 'done') {
    return (
      <span className="rounded-full bg-positive-50 px-3 py-1 text-xs font-semibold text-positive-800 ring-1 ring-positive-200">
        Done
      </span>
    );
  }
  if (state === 'partly') {
    return (
      <span className="rounded-full bg-warning-50 px-3 py-1 text-xs font-semibold text-warning-900 ring-1 ring-warning-200">
        Partly
      </span>
    );
  }
  return (
    <span className="rounded-full bg-surface-muted px-3 py-1 text-xs font-semibold text-ink-muted ring-1 ring-border">
      {optional ? 'If you have one' : 'To do'}
    </span>
  );
}

/** The action for a step: an inline form, or the door to the page that owns it. */
function StepAction({ id, forms }: { id: SetupStepId; forms: SetupFormData }) {
  const liquidPots = forms.pots.filter((pot) => pot.kind !== 'credit-card');
  switch (id) {
    case 'people':
      return (
        <div className="grid gap-3 md:grid-cols-2">
          <AddPersonForm />
          <details className="rounded-lg border border-border bg-canvas p-3">
            <summary className="cursor-pointer text-sm font-semibold text-ink-body">
              Add a vehicle (optional)
            </summary>
            <div className="mt-2">
              <AddVehicleForm people={forms.people} />
            </div>
            <p className="mt-2 text-xs text-ink-muted">
              A vehicle carries its own fuel, insurance and running costs on Insights and charts.
            </p>
          </details>
        </div>
      );
    case 'pots':
      return <CreatePotForm people={forms.people} />;
    case 'checkpoints':
      return <AddCheckpointForm pots={liquidPots} />;
    case 'payday':
      return <PaydaySettingForm dayOfMonth={forms.paydayDayOfMonth} />;
    case 'income':
      return (
        <div className="space-y-2">
          <IncomeScheduleForm idPrefix="setup-income" pots={liquidPots} today={forms.today} />
          <p className="text-sm text-ink-muted">
            A one-off windfall or sale is not recurring — record it on{' '}
            <StepLink href="/income">Income →</StepLink>
          </p>
        </div>
      );
    case 'bills':
      return (
        <StepLink href="/recurring">Add a direct debit or standing order on Recurring →</StepLink>
      );
    case 'figures':
      return (
        <ProjectionSettingsForm
          data={{
            weeklyGroceriesPence: forms.weeklyGroceriesPence,
            monthlyFuelPence: forms.monthlyFuelPence,
          }}
        />
      );
    case 'cards':
      return (
        <div className="space-y-1 text-sm">
          <p>
            <StepLink href="/pots">
              Add a credit card on Accounts, Pots &amp; Checkpoints →
            </StepLink>
          </p>
          <p>
            <StepLink href="/contracts">
              Add a policy or contract on Contracts &amp; Renewals →
            </StepLink>
          </p>
        </div>
      );
    case 'purchases':
      return <StepLink href="/#quick-entry">Record it at the till →</StepLink>;
  }
}

function StepLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="sf-link-arrow">
      {children}
    </Link>
  );
}
