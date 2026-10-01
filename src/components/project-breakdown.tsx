import type { ProjectWorkspaceView, SupplierGroupView } from '@/lib/projects/projects-view';

/**
 * The Supplier Shopping List &amp; Order Breakdown (SPEC §27,
 * PROJECTS_IMPLEMENTATION.MD §5): every selected line grouped by the supplier
 * it buys from — an order checklist per merchant — with the materials
 * subtotal, the delivery verdict (fee, free-delivery confirmation, "£X away
 * from free delivery", or Click &amp; Collect) and the supplier total. The
 * project grand total footer compares it all against the target budget.
 * Display only: all figures arrive precomputed from the pure costing module.
 */

function SupplierGroupCard({ group }: { group: SupplierGroupView }) {
  return (
    <li className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-ink">{group.supplierName}</h3>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {group.phone === null ? null : (
            <a
              href={`tel:${group.phone.replace(/\s+/g, '')}`}
              className="font-medium text-accent hover:underline"
            >
              {group.phone}
            </a>
          )}
          {group.websiteUrl === null ? null : (
            <a
              href={group.websiteUrl}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-accent hover:underline"
            >
              Website
            </a>
          )}
        </div>
      </div>

      <ul className="mt-3 divide-y divide-border-hairline">
        {group.lines.map((line) => (
          <li
            key={line.itemId}
            className="flex flex-wrap items-baseline justify-between gap-2 py-1.5"
          >
            <span className="text-sm text-ink-body">
              {line.quantityLabel} × {line.itemName}
              {line.inStock ? null : (
                <span className="ml-2 rounded-full border border-warning-200 bg-warning-50 px-2 py-0.5 text-xs font-semibold text-warning-900">
                  Out of stock
                </span>
              )}
              {line.productUrl === null ? null : (
                <a
                  href={line.productUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open the product page for ${line.itemName} at ${group.supplierName}`}
                  className="ml-2 text-xs font-medium text-accent hover:underline"
                >
                  Product ↗
                </a>
              )}
            </span>
            <span className="text-sm font-semibold text-ink">{line.lineCostLabel}</span>
          </li>
        ))}
      </ul>

      <dl className="mt-3 space-y-1 border-t border-border-hairline pt-2 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-ink-soft">Materials subtotal</dt>
          <dd className="font-medium text-ink-body">{group.materialsSubtotalLabel}</dd>
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          <dt className="text-ink-soft">Delivery</dt>
          <dd className="font-medium text-ink-body">
            {group.deliveryLabel}
            {group.deliveryHint === null ? null : (
              <span className="ml-2 text-xs text-ink-muted">({group.deliveryHint})</span>
            )}
          </dd>
        </div>
        <div className="flex justify-between gap-2 border-t border-border-hairline pt-1">
          <dt className="font-semibold text-ink">Supplier total</dt>
          <dd className="font-semibold text-ink">{group.supplierTotalLabel}</dd>
        </div>
      </dl>
    </li>
  );
}

export function OrderBreakdown({ view }: { view: ProjectWorkspaceView }) {
  return (
    <div>
      {view.groups.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-4 text-sm text-ink-muted shadow-sm">
          {view.rows.length === 0
            ? 'Add some materials above, then quote them from a supplier or two.'
            : 'Nothing chosen yet — click a quote cell in the matrix to pick where each material comes from.'}
        </p>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {view.groups.map((group) => (
            <SupplierGroupCard key={group.supplierId} group={group} />
          ))}
        </ul>
      )}

      <div className="mt-4 rounded-xl border border-border bg-canvas p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Project grand total
        </h3>
        <dl className="mt-2 space-y-1 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-ink-soft">Total materials</dt>
            <dd className="font-medium text-ink-body">{view.totals.materialsTotalLabel}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-ink-soft">Total delivery</dt>
            <dd className="font-medium text-ink-body">{view.totals.deliveryTotalLabel}</dd>
          </div>
          <div className="flex justify-between gap-2 border-t border-border pt-1">
            <dt className="text-base font-semibold text-ink">Grand total</dt>
            <dd className="text-base font-semibold text-ink">{view.totals.grandTotalLabel}</dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-ink-muted">{view.totals.summaryLabel}</p>
        {view.totals.budgetNote === null ? (
          <p className="mt-1 text-xs text-ink-muted">
            No target budget set — add one in “Edit this project” to see under/over status.
          </p>
        ) : (
          <p
            className={`mt-1 text-sm font-medium ${
              view.totals.budgetState === 'over' ? 'text-danger' : 'text-positive'
            }`}
          >
            {view.totals.budgetNote}
            {view.project.targetBudgetLabel === null
              ? ''
              : ` (target ${view.project.targetBudgetLabel})`}
          </p>
        )}
        {view.unselectedCount === 0 ? null : (
          <p className="mt-1 text-xs text-warning-900">
            {view.unselectedCount} {view.unselectedCount === 1 ? 'item is' : 'items are'} not chosen
            yet and not counted above.
          </p>
        )}
      </div>
    </div>
  );
}
