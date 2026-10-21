/**
 * The All Transactions search (GitHub issue #98): one box that matches the
 * **Supplier / transfer / loan** column and the **Notes** column at the same
 * time, as the household types.
 *
 * The search is applied to the rows the projection builds, not to raw table
 * columns: "Supplier" is the row's own `source` — a purchase's supplier or
 * schedule name, the other pot's label on a transfer, a counterparty on a
 * loan or swap, an income receipt's source — so every family is searched the
 * same way, in the column the household is reading. `note` is the record's
 * own note (the same string the Notes cell shows).
 *
 * Matching reuses the in-page search rules decision 246's picker search
 * settled on (`src/lib/search.ts`): case and repeated whitespace are
 * normalised, and every whitespace-separated word must appear somewhere in
 * the two columns, in any order. `corner weekly` therefore finds Corner
 * Foods' weekly shop, and a single word is an ordinary substring match.
 */

import { normalizeSearchText } from '../search';

/** A longer search is treated as this prefix — no query needs more than a sentence. */
export const ACTIVITY_SEARCH_MAX_LENGTH = 120;

/** The query as the matcher sees it: trimmed, whitespace-collapsed, lower-case. */
export function normalizeActivitySearch(query: string): string {
  return normalizeSearchText(query).slice(0, ACTIVITY_SEARCH_MAX_LENGTH);
}

/**
 * Whether `row` belongs in a search for `query`. An empty query matches every
 * row, so the caller can apply this unconditionally; the two columns are read
 * exactly as the table shows them.
 */
export function activityRowMatchesSearch(
  row: { source: string; note: string },
  query: string,
): boolean {
  const normalized = normalizeActivitySearch(query);
  if (normalized === '') return true;
  const haystack = normalizeSearchText(`${row.source} ${row.note}`);
  return normalized.split(' ').every((token) => haystack.includes(token));
}
