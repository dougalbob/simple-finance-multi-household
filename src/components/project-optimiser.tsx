'use client';

import { useActionState } from 'react';
import { applyProjectPlanAction } from '@/app/actions';
import { initialActionState } from '@/lib/action-state';
import type { OptimiserCardView, OptimiserView } from '@/lib/projects/projects-view';

/**
 * The optimiser action bar (SPEC §27.6, PROJECTS_IMPLEMENTATION.MD §7): the
 * household's manual selection beside the cheapest split and the best single
 * supplier, each with its total, who the order goes to, and a plain comparison.
 * One click applies a plan to the matrix; the server recomputes it first, so
 * nothing here is trusted for money. Display only — every figure arrives
 * precomputed from the pure costing module.
 */

const APPLY_CLASS =
  'rounded bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink hover:bg-accent-strong disabled:opacity-60';

function ApplyButton({
  projectId,
  card,
}: {
  projectId: number;
  card: OptimiserCardView & { totalPence: number };
}) {
  const [state, formAction, pending] = useActionState(applyProjectPlanAction, initialActionState);
  const plan = card.kind === 'split' ? 'split' : 'single-supplier';
  return (
    <form action={formAction} className="mt-3">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="plan" value={plan} />
      <input type="hidden" name="expectedTotalPence" value={card.totalPence} />
      {card.isCurrent ? (
        <p className="text-sm font-medium text-positive">
          Applied — this is your current selection.
        </p>
      ) : (
        <button type="submit" disabled={pending} className={APPLY_CLASS}>
          {pending
            ? 'Applying…'
            : card.kind === 'split'
              ? 'Apply the cheapest split'
              : 'Apply the single supplier'}
        </button>
      )}
      {state.message === null ? null : (
        <p
          role="status"
          className={`mt-1 text-xs ${state.status === 'error' ? 'text-danger' : 'text-positive'}`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}

function PlanCard({
  projectId,
  card,
  icon,
}: {
  projectId: number;
  card: OptimiserCardView;
  icon: string;
}) {
  const highlighted = card.isCurrent && card.kind !== 'manual';
  return (
    <li
      data-optimiser-card={card.kind}
      className={`flex flex-col rounded-xl border p-4 shadow-sm ${
        highlighted ? 'border-accent bg-accent-50/60' : 'border-border bg-surface'
      }`}
    >
      <h3 className="text-sm font-semibold text-ink">
        <span aria-hidden="true">{icon} </span>
        {card.title}
      </h3>
      {!card.available ? (
        <p className="mt-2 text-sm text-ink-muted">{card.unavailableReason}</p>
      ) : (
        <>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-ink">
            {card.grandTotalLabel}
          </p>
          <p className="text-xs text-ink-soft">{card.summaryLabel}</p>
          <p className="mt-1 text-sm font-medium text-ink-body">
            {card.supplierCountLabel}
            {card.headline === null ? '' : ` — ${card.headline}`}
          </p>
          <ul className="mt-2 space-y-1 text-xs text-ink-soft">
            {card.lines.map((line) => (
              <li key={line.supplierName} className="flex justify-between gap-2">
                <span>
                  <span className="font-medium text-ink-body">{line.supplierName}</span> ·{' '}
                  {line.detail}
                </span>
                <span className="font-medium text-ink-body">{line.totalLabel}</span>
              </li>
            ))}
          </ul>
          {card.notes.length === 0 ? null : (
            <ul className="mt-2 space-y-1 text-xs text-ink-body">
              {card.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
          <div className="mt-auto">
            {card.kind === 'manual' || card.totalPence === null ? null : (
              <ApplyButton projectId={projectId} card={{ ...card, totalPence: card.totalPence }} />
            )}
          </div>
        </>
      )}
    </li>
  );
}

export function ProjectOptimiserBar({
  projectId,
  optimiser,
}: {
  projectId: number;
  optimiser: OptimiserView;
}) {
  return (
    <div className="mt-3" data-testid="optimiser-bar">
      <ul className="grid gap-3 lg:grid-cols-3">
        <PlanCard projectId={projectId} card={optimiser.manual} icon="✋" />
        <PlanCard projectId={projectId} card={optimiser.split} icon="⚡" />
        <PlanCard projectId={projectId} card={optimiser.single} icon="🚚" />
      </ul>
      {optimiser.caveats.length === 0 ? null : (
        <ul className="mt-2 space-y-1 text-xs text-warning-900">
          {optimiser.caveats.map((caveat) => (
            <li key={caveat}>{caveat}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
