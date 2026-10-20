import { redirect } from 'next/navigation';
import { GettingStartedPath } from '@/components/getting-started';
import { householdContextFromRequest } from '@/lib/auth/next';
import { getSetupFormData, getSetupPath } from '@/lib/records/setup-path';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Getting started' };

/**
 * Getting started (docs/ONBOARDING_PLAN.md, Slice 1).
 *
 * The one place that states the dependency chain a brand-new household
 * otherwise has to infer from fourteen empty pages: people → pots →
 * checkpoints → household payday, then optional recurring income, bills,
 * figures and the first purchase. Every
 * state is derived from the household's records, so nothing here can drift
 * from what is actually stored, and the page stays useful after setup as the
 * place that says what to look at, and when.
 *
 * A support view sees the same steps without the forms: the actions refuse a
 * read-only context anyway (support-readonly-guard), and the page is honest
 * about why the fields are missing.
 */
export default async function StartPage() {
  const user = await householdContextFromRequest();
  if (user === null) redirect('/unauthorized');

  const now = new Date();
  const view = getSetupPath(user.db, now);
  const forms = getSetupFormData(user.db, now);

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:py-8">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          Getting started
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Set up this household</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-soft">
          {view.phaseA.complete
            ? 'The projection is live. These are the records behind it, and what is still worth adding.'
            : 'Four short steps and the payday projection appears. Nothing on this page is required, and nothing in the app is hidden behind it — it is the order the records depend on, not a gate.'}
        </p>
        <p className="mt-2 max-w-3xl text-xs text-ink-muted">
          Every step below is worked out from what the household has already recorded — there is no
          checklist to keep and nothing to mark as done. Undo a record and its step reopens.
        </p>
      </header>

      <GettingStartedPath view={view} forms={forms} readOnly={user.readOnly} />
    </main>
  );
}
