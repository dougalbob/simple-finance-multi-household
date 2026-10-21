import Link from 'next/link';
import { formatPence } from '@/lib/money';
import { formatShortLocalDate } from '@/lib/time';

/**
 * The line-items panel behind a figure on Charts (issue #94, decision 250,
 * SPEC §16.7) — the same block Chart E has shown beneath its pie since
 * v1.11.0, shared by Charts B, C and F so all four reported charts read the
 * same way.
 *
 * It is a real, server-rendered section: the panel is URL state, so it works
 * with JavaScript off and can be sent to the other person. “Open these
 * purchases →” is the document link to the filtered purchases list, and
 * “Close line items” is the same-page link back to the chart (a soft
 * navigation, so closing never scrolls the page away).
 *
 * No client JavaScript, no hydration — the same rule as every other chart
 * (decision 155).
 */

export interface LineItemRow {
  /** Stable React key: one purchase can contribute several lines. */
  key: string;
  occurredDate: string;
  supplierName: string | null;
  note: string | null;
  /** “Weekly Shop”, “Personal · Clothing & Shoes”, … */
  category: string;
  /** “Household”, a person's name, or a vehicle's label. */
  forLabel: string;
  amountPence: number;
}

export interface LineItemsPanelProps {
  /** Document-unique id — the anchor a no-JavaScript visit lands on. */
  id: string;
  heading: string;
  /** Newest first. Their sum is `totalPence`, the figure the reader tapped. */
  rows: readonly LineItemRow[];
  totalPence: number;
  emptyText: string;
  /** `/purchases?...` — the filtered list behind the same figure. */
  openHref: string;
  /** The `/charts` URL with this panel closed, landing back on its chart. */
  closeHref: string;
}

export function LineItemsPanel({
  id,
  heading,
  rows,
  totalPence,
  emptyText,
  openHref,
  closeHref,
}: LineItemsPanelProps) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="mt-4 rounded-xl border border-border bg-canvas p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={`${id}-heading`} className="text-sm font-semibold">
          {heading}
        </h3>
        <p className="text-sm tabular-nums text-ink-soft">
          {formatPence(totalPence)} · {rows.length} {rows.length === 1 ? 'line' : 'lines'}
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">{emptyText}</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-[11px] uppercase tracking-wide text-ink-muted">
              <tr>
                <th scope="col" className="py-1 pr-3 font-medium">
                  Date
                </th>
                <th scope="col" className="py-1 pr-3 font-medium">
                  Where
                </th>
                <th scope="col" className="py-1 pr-3 font-medium">
                  Category
                </th>
                <th scope="col" className="py-1 pr-3 font-medium">
                  For
                </th>
                <th scope="col" className="py-1 pr-0 text-right font-medium">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-t border-border-hairline align-top">
                  <td className="whitespace-nowrap py-1 pr-3">
                    {formatShortLocalDate(row.occurredDate)}
                  </td>
                  <td className="py-1 pr-3">{row.supplierName ?? row.note ?? '—'}</td>
                  <td className="py-1 pr-3 text-ink-soft">{row.category}</td>
                  <td className="py-1 pr-3 text-ink-soft">{row.forLabel}</td>
                  <td className="py-1 pr-0 text-right tabular-nums">
                    {formatPence(row.amountPence)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <Link href={openHref} className="sf-link-arrow">
          Open these purchases →
        </Link>
        <Link href={closeHref} scroll={false} prefetch={false} className="sf-link">
          Close line items
        </Link>
        <span className="text-ink-muted">
          A matching purchase comes back whole, with all of its lines.
        </span>
      </div>
    </section>
  );
}
