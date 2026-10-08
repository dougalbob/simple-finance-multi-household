import { formatPence } from '@/lib/money';
import type { ProjectionView } from '@/lib/records/money-view';
import { paydaySummaryFromView } from '@/lib/records/payday-summary';

/**
 * The Overview's projection panel (decision 74; trimmed in decision 186): the
 * tier banner, the figures, and the “what's in this forecast” expansions —
 * the lists and the day-by-day table, which is where the arithmetic is
 * checked. The prose the panel used to repeat around them (the weekly pace
 * line, which the till on this same page already carries, and the footnotes
 * under the expansions) now lives only on Horizon. The pot watch is the same
 * sentence the home card shows, from the same pure builder. All figures come
 * from the pure projection engine — nothing here recomputes anything.
 */
export function ProjectionSection({ projection }: { projection: ProjectionView }) {
  const { result } = projection;
  const summary = paydaySummaryFromView(projection);
  // Debt expectations ride in the receipt list flagged `expected` (SPEC §10.2,
  // v0.7.0): the panel lists them under their own heading so a £1,000 support
  // payment is never mistaken for salary.
  const expectedSupportLines = projection.receiptLines.filter((line) => line.expected === true);
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

      {expectedSupportLines.length > 0 ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-ink-body">
            Expected support in this forecast ({expectedSupportLines.length})
          </summary>
          <ul className="mt-2 divide-y divide-border-hairline">
            {expectedSupportLines.map((line) => (
              <li
                key={`${line.dueDate}-${line.scheduleId}-expected`}
                className="flex items-baseline justify-between gap-2 py-1.5 text-sm"
              >
                <span>
                  <span className="font-medium">{line.name}</span>{' '}
                  <span className="text-xs text-ink-muted">
                    {line.dueDate} · {line.potLabel} · expected — never received
                  </span>
                </span>
                <span className="tabular-nums text-ink-muted">
                  ≈{formatPence(line.amountPence)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {projection.dayToDayEvents.length > 0 ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-ink-body">
            Projected shops and fills ({projection.dayToDayEvents.length})
          </summary>
          <ul className="mt-2 divide-y divide-border-hairline">
            {projection.dayToDayEvents.map((event) => (
              <li
                key={`${event.dueDate}-${event.name}`}
                className="flex items-baseline justify-between gap-2 py-1.5 text-sm"
              >
                <span>
                  <span className="font-medium">{event.name}</span>{' '}
                  <span className="text-xs text-ink-muted">{event.dueDate}</span>
                </span>
                <span className="tabular-nums">−{formatPence(event.amountPence)}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {result.perDay.length > 0 ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-ink-body">
            What’s in this forecast — day-by-day ({result.perDay.length} days)
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-3 py-1.5">Date</th>
                  <th className="px-3 py-1.5 text-right">Commitments</th>
                  {result.dayToDayPence > 0 ? (
                    <th className="px-3 py-1.5 text-right">Day-to-day</th>
                  ) : null}
                  <th className="px-3 py-1.5 text-right">Receipts</th>
                  <th className="px-3 py-1.5 text-right">End of day</th>
                </tr>
              </thead>
              <tbody>
                {result.perDay.map((day) => (
                  <tr key={day.date} className="border-t border-border-hairline">
                    <td className="px-3 py-1.5">{day.date}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {day.commitmentsPence > 0 ? `−${formatPence(day.commitmentsPence)}` : '—'}
                    </td>
                    {result.dayToDayPence > 0 ? (
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {day.dayToDayPence > 0 ? `−${formatPence(day.dayToDayPence)}` : '—'}
                      </td>
                    ) : null}
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {day.receiptsPence > 0 ? `+${formatPence(day.receiptsPence)}` : '—'}
                    </td>
                    <td
                      className={`px-3 py-1.5 text-right font-medium tabular-nums ${day.runningPence < 0 ? 'text-danger' : ''}`}
                    >
                      {formatPence(day.runningPence)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}

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
    </section>
  );
}
