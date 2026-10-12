import Link from 'next/link';
import { formatPence } from '@/lib/money';
import type { ProjectionView } from '@/lib/records/money-view';
import { paydaySummaryFromView } from '@/lib/records/payday-summary';

/**
 * Overview keeps the payday figures and pot watch, while Horizon owns the
 * dated forecast, expansions and day-by-day table. All figures come from the
 * pure projection engine — nothing here recomputes anything.
 */
export function ProjectionSection({ projection }: { projection: ProjectionView }) {
  const { result } = projection;
  const summary = paydaySummaryFromView(projection);
  const tier = result.tier;
  const tierStyles =
    tier === 'warning'
      ? 'border-danger-200 bg-danger-50 text-danger-800'
      : tier === 'heads-up'
        ? 'border-warning-200 bg-warning-50 text-warning'
        : 'border-positive-200 bg-positive-50 text-positive-800';
  const tierText =
    tier === 'warning'
      ? `Liquid funds would reach ${formatPence(result.projectedLowPence ?? 0)} — below the configured bank warning threshold of ${formatPence(result.warningThresholdPence ?? 0)}. Review before pay day.`
      : tier === 'heads-up'
        ? `This week’s low would reach ${formatPence(result.projectedLowPence ?? 0)} before pay lands — you would be below £0. No overdraft expected if nothing else changes.`
        : `Projected to stay above zero until pay day (lowest ${result.projectedLowPence !== null ? formatPence(result.projectedLowPence) : '—'}).`;
  return (
    <section
      aria-labelledby="projection-heading"
      className="rounded-xl border border-border bg-surface p-4 shadow-sm"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
            Payday projection
          </p>
          <h2 id="projection-heading" className="text-xl font-semibold">
            To pay day · {result.paydayDate} ({result.days} days)
          </h2>
        </div>
        <span className="text-xs text-ink-muted">
          Liquidity projection — bank and cash pots; card debt is in the household total above
        </span>
      </div>

      <p className={`rounded-lg border px-3 py-2 text-sm font-medium ${tierStyles}`}>{tierText}</p>

      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-2">
          <dt className="text-ink-soft">Household total now (net)</dt>
          <dd className="font-semibold tabular-nums">
            {projection.snapshot.householdAvailablePence === null
              ? '—'
              : formatPence(projection.snapshot.householdAvailablePence)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-ink-soft">Liquid funds now (bank + cash)</dt>
          <dd className="font-semibold tabular-nums">{formatPence(result.availableNowPence)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-ink-soft">Projected day-to-day ({result.days}d)</dt>
          <dd className="tabular-nums">
            −{formatPence(result.dayToDayPence)}
            <span className="text-xs text-ink-muted">
              {' '}
              (groceries {formatPence(result.groceriesPence)} + fuel {formatPence(result.fuelPence)}
              )
            </span>
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-ink-soft">Upcoming commitments</dt>
          <dd className="tabular-nums">−{formatPence(result.totalCommitmentsPence)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-ink-soft">Expected receipts</dt>
          <dd className="tabular-nums">+{formatPence(result.totalReceiptsPence)}</dd>
        </div>
      </dl>

      {summary !== null && summary.transfers.length > 0 ? (
        <div className="mt-4 space-y-2">
          {summary.transfers.map((transfer) => (
            <p
              key={transfer.potId}
              className="rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-900"
            >
              <span className="font-semibold">Plan a transfer?</span> {transfer.text}
            </p>
          ))}
        </div>
      ) : null}

      {summary !== null ? (
        <p className="mt-4 text-sm text-ink-body">
          Full dated forecast and day-by-day detail on{' '}
          <Link href={`/horizon?through=${summary.horizonThroughDate}`} className="sf-link-arrow">
            Horizon →
          </Link>
        </p>
      ) : null}
    </section>
  );
}
