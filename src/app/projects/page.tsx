import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ProjectCreateForm } from '@/components/project-forms';
import { currentUserFromRequest } from '@/lib/auth/next';
import { getDbHandle } from '@/lib/db/client';
import { getProjectsPageView, type ProjectListRow } from '@/lib/projects/projects-view';

export const dynamic = 'force-dynamic';

/**
 * Projects — the Project Costing &amp; Supplier Optimiser (SPEC §27, decision
 * 181): plan a purchase or a project against real quotes from several
 * suppliers before spending anything. The list page starts a project and
 * shows where each one stands; the workspace lives at /projects/[id].
 */

const BUDGET_STATE_CLASS: Record<ProjectListRow['budgetState'], string> = {
  none: 'text-ink-muted',
  under: 'text-positive',
  on: 'text-positive',
  over: 'text-danger',
};

export default async function ProjectsPage() {
  const user = await currentUserFromRequest();
  if (user === null) redirect('/unauthorized');

  const view = getProjectsPageView(getDbHandle().db);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          Plan before you buy
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Projects</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-soft">
          Cost a future purchase or a whole project against real quotes: a bill of materials down
          the side, suppliers across the top, and delivery rules that know one fee covers the whole
          order. Click the cheapest cells yourself — the shopping list groups everything by
          supplier, ready to order.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section
          aria-labelledby="new-project-heading"
          className="rounded-xl border border-border bg-surface p-5 shadow-sm"
        >
          <h2 id="new-project-heading" className="text-lg font-semibold">
            Start a project
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Name it, set an optional target budget, and the matrix is ready for materials and
            suppliers.
          </p>
          <div className="mt-3">
            <ProjectCreateForm />
          </div>
        </section>

        <section
          aria-labelledby="project-list-heading"
          className="rounded-xl border border-border bg-surface p-5 shadow-sm"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="project-list-heading" className="text-lg font-semibold">
              Your projects
            </h2>
            <p className="text-sm text-ink-soft">
              {view.rows.length === 0
                ? 'Nothing yet'
                : `${view.rows.length} ${view.rows.length === 1 ? 'project' : 'projects'}`}
            </p>
          </div>

          {view.rows.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">
              No projects yet. Start one above — the demo idea is a garden fence: materials down the
              side, Wickes / Jewson / the local timber yard across the top.
            </p>
          ) : (
            <ul className="mt-3 grid gap-3">
              {view.rows.map((row) => (
                <li key={row.id}>
                  <Link
                    href={`/projects/${row.id}`}
                    className="block rounded-xl border border-border bg-canvas p-4 shadow-sm hover:border-accent-300 hover:bg-accent-50/40"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-base font-semibold text-ink">{row.name}</p>
                      <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-xs font-semibold text-ink-soft">
                        {row.statusLabel}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-ink-muted">
                      {row.sizeLabel} · {row.modeLabel}
                    </p>
                    <p className="mt-1 text-sm">
                      <span className="font-semibold text-ink">{row.grandTotalLabel}</span>
                      <span
                        className={`ml-2 text-xs font-medium ${BUDGET_STATE_CLASS[row.budgetState]}`}
                      >
                        {row.budgetNote ??
                          (row.targetBudgetLabel === null ? 'No target budget' : '')}
                      </span>
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
