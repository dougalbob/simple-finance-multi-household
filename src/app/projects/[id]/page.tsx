import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { CostingMatrix } from '@/components/project-matrix';
import { OrderBreakdown } from '@/components/project-breakdown';
import { ProjectOptimiserBar } from '@/components/project-optimiser';
import {
  ProjectDeleteButton,
  ProjectEditForm,
  ProjectItemCreateForm,
  ProjectSupplierCreateForm,
  ProjectSupplierDeleteButton,
  ProjectSupplierEditForm,
} from '@/components/project-forms';
import { currentUserFromRequest } from '@/lib/auth/next';
import { getDbHandle } from '@/lib/db/client';
import { getProjectWorkspaceView } from '@/lib/projects/projects-view';

export const dynamic = 'force-dynamic';

/**
 * The project workspace (SPEC §27, PROJECTS_IMPLEMENTATION.MD §5): suppliers
 * and their delivery rules on top, the costing matrix in the middle (click a
 * quote cell to pick that supplier for the row), and the supplier-grouped
 * shopping list with the grand total below. Above the matrix, the optimiser
 * bar (Phase 2) sets the manual selection beside the cheapest split and the
 * best single supplier, one click to apply.
 */
export default async function ProjectWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await currentUserFromRequest();
  if (user === null) redirect('/unauthorized');

  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId) || projectId < 1) notFound();

  const view = getProjectWorkspaceView(getDbHandle().db, projectId);
  if (view === null) notFound();

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link href="/projects" className="font-medium text-accent hover:underline">
          ← All projects
        </Link>
      </nav>

      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">{view.project.name}</h1>
          <span className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs font-semibold text-ink-soft">
            {view.project.statusLabel}
          </span>
          {view.project.projectMode === 'compare_options' ? (
            <span className="rounded-full border border-warning-200 bg-warning-50 px-2.5 py-0.5 text-xs font-semibold text-warning-900">
              Compare options — column totals arrive in a later phase
            </span>
          ) : null}
        </div>
        {view.project.notes === null ? null : (
          <p className="mt-1 max-w-3xl text-sm text-ink-soft">{view.project.notes}</p>
        )}
        <p className="mt-1 text-sm text-ink-soft">
          {view.project.targetBudgetLabel === null ? (
            'No target budget set.'
          ) : (
            <>
              Target budget {view.project.targetBudgetLabel}
              {view.totals.budgetNote === null ? '' : ` — ${view.totals.budgetNote}`}.
            </>
          )}
        </p>
      </header>

      <section
        aria-labelledby="suppliers-heading"
        className="rounded-xl border border-border bg-surface p-5 shadow-sm"
      >
        <h2 id="suppliers-heading" className="text-lg font-semibold">
          Suppliers &amp; delivery
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          One delivery fee covers every item ordered from a supplier, and the free-delivery
          threshold is checked against that supplier&apos;s materials subtotal. Setting an order to
          Click &amp; Collect makes its delivery £0.
        </p>

        <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {view.suppliers.map((supplier) => (
            <li key={supplier.id} className="rounded-xl border border-border bg-canvas p-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-semibold text-ink">{supplier.name}</p>
                <span className="text-xs font-medium text-ink-muted">
                  {supplier.fulfilmentChoice === 'collect' ? 'Click & Collect' : 'Delivery'}
                </span>
              </div>
              <p className="mt-1 text-sm text-ink-soft">
                Delivery {supplier.deliveryFeeLabel}
                {supplier.freeDeliveryThresholdLabel === null
                  ? ''
                  : ` · free over ${supplier.freeDeliveryThresholdLabel}`}
                {supplier.clickAndCollectAvailable ? ' · Click & Collect available' : ''}
              </p>
              {supplier.phone === null ? null : (
                <p className="text-sm">
                  <a
                    href={`tel:${supplier.phone.replace(/\s+/g, '')}`}
                    className="font-medium text-accent hover:underline"
                  >
                    {supplier.phone}
                  </a>
                </p>
              )}
              {supplier.websiteUrl === null ? null : (
                <p className="text-sm">
                  <a
                    href={supplier.websiteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-accent hover:underline"
                  >
                    {supplier.websiteUrl}
                  </a>
                </p>
              )}
              {supplier.notes === null ? null : (
                <p className="mt-1 text-xs text-ink-muted">{supplier.notes}</p>
              )}
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-medium text-ink-soft hover:text-ink">
                  Edit supplier &amp; delivery rules
                </summary>
                <div className="mt-2">
                  <ProjectSupplierEditForm supplier={supplier} />
                  <div className="mt-2">
                    <ProjectSupplierDeleteButton projectId={view.project.id} supplier={supplier} />
                  </div>
                </div>
              </details>
            </li>
          ))}
          <li className="rounded-xl border border-dashed border-border p-4">
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-ink hover:text-accent">
                + Add a supplier
              </summary>
              <div className="mt-3">
                <ProjectSupplierCreateForm projectId={view.project.id} />
              </div>
            </details>
          </li>
        </ul>
      </section>

      {view.optimiser === null ? null : (
        <section aria-labelledby="optimiser-heading" className="mt-6">
          <h2 id="optimiser-heading" className="text-lg font-semibold">
            Cheapest combination
          </h2>
          <p className="text-sm text-ink-soft">
            Your own picks beside what the numbers say, delivery fees and free-delivery thresholds
            included. Applying a plan fills in the matrix below; you can still change any cell by
            hand afterwards.
          </p>
          <ProjectOptimiserBar projectId={view.project.id} optimiser={view.optimiser} />
        </section>
      )}

      <section aria-labelledby="matrix-heading" className="mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="matrix-heading" className="text-lg font-semibold">
            The costing matrix
          </h2>
          <p className="text-sm text-ink-soft">
            Click a quote cell to choose that supplier for the material. The first column clears a
            choice.
          </p>
        </div>

        {view.isEmpty ? (
          <div className="mt-3 rounded-xl border border-border bg-surface p-5 shadow-sm">
            <p className="text-sm text-ink-soft">
              The matrix fills itself: add the materials you need and the suppliers you are quoting,
              then type the quotes into the cells.
            </p>
          </div>
        ) : (
          <div className="mt-3">
            <CostingMatrix
              projectId={view.project.id}
              suppliers={view.suppliers}
              rows={view.rows}
            />
          </div>
        )}

        <details className="mt-4 rounded-xl border border-border bg-surface p-4 shadow-sm">
          <summary className="cursor-pointer text-sm font-semibold text-ink hover:text-accent">
            + Add a material row
          </summary>
          <div className="mt-3">
            <ProjectItemCreateForm projectId={view.project.id} />
          </div>
        </details>
      </section>

      <section aria-labelledby="breakdown-heading" className="mt-6">
        <h2 id="breakdown-heading" className="text-lg font-semibold">
          Shopping list &amp; order breakdown by supplier
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          Everything chosen, grouped by where it comes from — phone the order through, or take the
          list to the trade counter.
        </p>
        <div className="mt-3">
          <OrderBreakdown view={view} />
        </div>
      </section>

      <section
        aria-labelledby="project-settings-heading"
        className="mt-6 rounded-xl border border-border bg-surface p-5 shadow-sm"
      >
        <h2 id="project-settings-heading" className="text-lg font-semibold">
          Edit this project
        </h2>
        <div className="mt-3">
          <ProjectEditForm project={view.project} />
        </div>
        <div className="mt-4 border-t border-border-hairline pt-3">
          <p className="text-xs text-ink-muted">
            Deleting removes the project with all its materials, suppliers and quotes.
          </p>
          <div className="mt-2">
            <ProjectDeleteButton project={view.project} />
          </div>
        </div>
      </section>
    </main>
  );
}
