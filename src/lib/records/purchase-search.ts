/**
 * The Purchases search (the follow-up to GitHub issue #98): one box that
 * matches the **Supplier** column, the **Category** column and **Notes** at
 * the same time, replacing the old Supplier and Category drop-downs.
 *
 * It reads a purchase the way the review table shows it: the supplier's name
 * in the directory (with the optional bank payee printed beside it), the
 * `Parent / Child` label of every allocation line — a split purchase carries
 * all of its lines, as the receipt-style row does — and the record's own note.
 * Matching follows the same rules as the other in-page searches
 * (`src/lib/search.ts`): case and repeated whitespace are normalised, and
 * every whitespace-separated word must appear somewhere across those columns,
 * in any order. So `groceries weekly` finds a Groceries / Weekly Shop line and
 * `greenfield top-up` finds Greenfield Market's top-up shop.
 */

import { normalizeSearchText } from '../search';

/** A longer search is treated as this prefix — no query needs more than a sentence. */
export const PURCHASE_SEARCH_MAX_LENGTH = 120;

/** The text a purchase offers to the search, as the review table shows it. */
export interface PurchaseSearchFields {
  /** The supplier directory name ('' when the record has none). */
  supplierName: string;
  /** The optional bank payee printed after the supplier, when there is one. */
  paidVia?: string | null;
  /** One `Parent / Child` label per allocation line, in the record's own order. */
  categoryLabels: readonly string[];
  note: string;
}

/** The query as the matcher sees it: trimmed, whitespace-collapsed, lower-case, capped. */
export function normalizePurchaseSearch(query: string): string {
  return normalizeSearchText(query).slice(0, PURCHASE_SEARCH_MAX_LENGTH);
}

/**
 * Whether `purchase` belongs in a search for `query`. An empty query matches
 * every record, so the caller can apply it unconditionally. A category is
 * matched by its parent or its child name, on any one of the purchase's lines.
 */
export function purchaseMatchesSearch(purchase: PurchaseSearchFields, query: string): boolean {
  const normalized = normalizePurchaseSearch(query);
  if (normalized === '') return true;
  const haystack = normalizeSearchText(
    [purchase.supplierName, purchase.paidVia ?? '', ...purchase.categoryLabels, purchase.note].join(
      ' ',
    ),
  );
  return normalized.split(' ').every((token) => haystack.includes(token));
}
