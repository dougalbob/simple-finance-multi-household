import Link from 'next/link';
import type { ProjectionView } from '@/lib/records/money-view';
import { paydaySummaryFromView } from '@/lib/records/payday-summary';

/**
 * The phone home's payday card (v0.36.0, decision 186): four facts and a door
 * to Horizon. The household's verdict on the old projection panel was that it
 * was too much for the other user — the day-by-day table, the projected shops
 * and fills, the expected support list and the weekly pace all live on
 * Horizon, on the same engine, so this card just says:
 *
 * - when the next pay day is;
 * - what the household low would be, from the liquid balance the projection
 *   actually starts from (bank and cash — never the card-debt net total);
 * - whether that low would cost overdraft fees;
 * - which pot would run short of its own bills, and by when the money should
 *   move — kept in the amber transfer treatment it has always had.
 *
 * Every sentence comes from the pure builder (`payday-summary.ts`), so the
 * wording and the numbers are pinned by tests rather than by this file.
 */
export function PaydaySummary({ projection }: { projection: ProjectionView }) {
  const summary = paydaySummaryFromView(projection);
  if (summary === null) return null;

  return (
    <section
      aria-labelledby="payday-summary-heading"
      className="rounded-xl border border-border bg-surface p-4 shadow-sm"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
        Payday projection
      </p>
      <h2 id="payday-summary-heading" className="mt-1 text-lg font-semibold">
        {summary.paydayLine}
      </h2>

      {summary.lowLine !== null ? (
        <p className="mt-2 text-sm text-ink-body">
          {summary.lowLine}
          {summary.overdraftLine !== null ? ` ${summary.overdraftLine}` : ''}
        </p>
      ) : null}

      {summary.transfers.length > 0 ? (
        <div className="mt-3 space-y-2">
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

      <p className="mt-3 text-sm text-ink-body">
        See full projection detail in the{' '}
        <Link
          href={`/horizon?through=${summary.horizonThroughDate}`}
          className="font-medium text-accent hover:underline"
        >
          Horizon
        </Link>{' '}
        page.
      </p>
    </section>
  );
}
