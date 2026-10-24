/**
 * The app-wide document search (v1.41.0): one box that finds any stored
 * attachment — a purchase receipt, an income payslip or a supplier letter —
 * and shows it **in the context of the record it belongs to**.
 *
 * The household's problem this solves is that a photographed MOT arrives as
 * `IMG_4821.jpg` and is impossible to find later. A friendly label fixes what
 * the document *is*; this search fixes *where it lives*. A result therefore
 * carries both the document's own name (label, falling back to the file name)
 * and the owning record — the supplier, the purchase date and its categories,
 * or the income source and date — plus a link that opens that page.
 *
 * Matching follows the same rules as the Purchases search
 * (`src/lib/search.ts`): case and repeated whitespace are normalised, and
 * every whitespace-separated word must appear somewhere across the document's
 * label, its file name and its owner's context, in any order. So
 * `vehicle mot` finds a supplier document even when the file is `IMG_4821.jpg`.
 *
 * Pure and framework-free so the ranking is unit-tested without a database;
 * the database read lives in `searchAttachments`.
 */

import { asc, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client';
import { allocations, attachments, categories, purchases, receipts, suppliers } from '../db/schema';
import { normalizeSearchText } from '../search';

/** A longer search is treated as this prefix — no query needs more than a sentence. */
export const ATTACHMENT_SEARCH_MAX_LENGTH = 120;
/** The Documents page shows at most this many results. */
export const ATTACHMENT_SEARCH_RESULT_LIMIT = 100;

export type AttachmentOwnerKind = 'purchase' | 'receipt' | 'supplier';

/** What the matcher needs: the document's own text and its owner's context. */
export interface AttachmentSearchFields {
  /** The label, or the file name when there is no label. */
  displayName: string;
  /** The stored file name, always searchable even when a label is set. */
  originalName: string;
  /** The context line, e.g. "Purchase · Sainsbury's · 2026-10-01 · Groceries / Weekly Shop". */
  context: string;
}

export interface AttachmentSearchResult extends AttachmentSearchFields {
  id: number;
  fileKey: string;
  label: string | null;
  mime: string;
  sizeBytes: number;
  createdAt: Date;
  ownerKind: AttachmentOwnerKind;
  /** The owning record's name (a supplier, an income source), for the result heading. */
  ownerLabel: string;
  /** Where the document can be opened in the app. */
  href: string;
  /** Normalised match haystack (`displayName originalName context`). */
  haystack: string;
}

/** The query as the matcher sees it: trimmed, whitespace-collapsed, lower-case, capped. */
export function normalizeAttachmentSearch(query: string): string {
  return normalizeSearchText(query).slice(0, ATTACHMENT_SEARCH_MAX_LENGTH);
}

/** The searchable text of one document: its own name (both forms) and its context. */
export function attachmentSearchHaystack(fields: AttachmentSearchFields): string {
  return normalizeSearchText(`${fields.displayName} ${fields.originalName} ${fields.context}`);
}

/**
 * Whether `fields` belongs in a search for `query`. An empty query matches
 * every document, so the caller can apply it unconditionally.
 */
export function attachmentMatchesSearch(fields: AttachmentSearchFields, query: string): boolean {
  const normalized = normalizeAttachmentSearch(query);
  if (normalized === '') return true;
  const haystack = attachmentSearchHaystack(fields);
  return normalized.split(' ').every((token) => haystack.includes(token));
}

/**
 * Filter and rank documents for what was typed, newest first within a rank.
 *
 * - An empty query keeps the order the database handed over (newest first).
 * - Matches beginning with the whole query come first, then matches that only
 *   contain the words scattered; equal ranks turn shortest-first, and the
 *   database order breaks any remaining tie, so the ranking is stable.
 */
export function rankAttachmentMatches(
  results: readonly AttachmentSearchResult[],
  query: string,
): AttachmentSearchResult[] {
  const normalized = normalizeAttachmentSearch(query);
  if (normalized === '') return results.slice(0, ATTACHMENT_SEARCH_RESULT_LIMIT);
  const tokens = normalized.split(' ');
  const ranked = results
    .filter((result) => tokens.every((token) => result.haystack.includes(token)))
    .map((result, index) => {
      const phraseAt = result.haystack.indexOf(normalized);
      return {
        result,
        index,
        rank: phraseAt === 0 ? 0 : phraseAt > 0 ? 1 : 2,
        length: result.haystack.length,
      };
    });
  ranked.sort(
    (left, right) =>
      left.rank - right.rank ||
      left.length - right.length ||
      right.result.createdAt.getTime() - left.result.createdAt.getTime() ||
      left.index - right.index,
  );
  return ranked.map((entry) => entry.result).slice(0, ATTACHMENT_SEARCH_RESULT_LIMIT);
}

/** Read every stored attachment, with its owner's context, newest first. */
export function searchAttachments(db: Db, query: string): AttachmentSearchResult[] {
  const rows = db
    .select()
    .from(attachments)
    .where(eq(attachments.state, 'stored'))
    .orderBy(desc(attachments.createdAt), asc(attachments.id))
    .all();

  const purchaseIds = uniqueIds(rows.map((row) => row.purchaseId));
  const receiptIds = uniqueIds(rows.map((row) => row.receiptId));
  const supplierIds = uniqueIds(rows.map((row) => row.supplierId));

  const supplierNames = fetchSupplierNames(db, supplierIds);
  const purchaseDetails = fetchPurchaseDetails(db, purchaseIds);
  const receiptDetails = fetchReceiptDetails(db, receiptIds);
  const purchaseCategories = fetchPurchaseCategories(db, purchaseIds);

  const results = rows.map((row) => {
    if (row.purchaseId !== null) {
      const detail = purchaseDetails.get(row.purchaseId);
      const supplierName =
        detail?.supplierId !== null && detail?.supplierId !== undefined
          ? (supplierNames.get(detail.supplierId) ?? 'Unknown supplier')
          : 'Unknown supplier';
      const categories = purchaseCategories.get(row.purchaseId) ?? [];
      const context = [
        'Purchase',
        supplierName,
        detail?.occurredDate ?? '',
        categories.join(' · '),
        detail?.note ?? '',
      ]
        .filter((part) => part !== '')
        .join(' · ');
      return buildResult(row, {
        ownerKind: 'purchase',
        ownerLabel: supplierName,
        context,
        href: `/purchases?attachment=${row.id}#purchase-${row.purchaseId}`,
      });
    }
    if (row.supplierId !== null) {
      const name = supplierNames.get(row.supplierId) ?? 'Unknown supplier';
      const supplier = db
        .select({ notes: suppliers.notes })
        .from(suppliers)
        .where(eq(suppliers.id, row.supplierId))
        .get();
      const context = ['Supplier', name, supplier?.notes ?? ''].filter((p) => p !== '').join(' · ');
      return buildResult(row, {
        ownerKind: 'supplier',
        ownerLabel: name,
        context,
        href: `/suppliers?attachment=${row.id}#supplier-${row.supplierId}`,
      });
    }
    // The CHECK constraint guarantees exactly one owner is set.
    const detail = receiptDetails.get(row.receiptId as number);
    const source = detail?.source ?? 'Income';
    const context = ['Income', source, detail?.occurredDate ?? '', detail?.note ?? '']
      .filter((part) => part !== '')
      .join(' · ');
    return buildResult(row, {
      ownerKind: 'receipt',
      ownerLabel: source,
      context,
      href: `/income?attachment=${row.id}`,
    });
  });

  return rankAttachmentMatches(results, query);
}

function buildResult(
  row: {
    id: number;
    fileKey: string;
    originalName: string;
    label: string | null;
    mime: string;
    sizeBytes: number;
    createdAt: Date;
  },
  extra: {
    ownerKind: AttachmentOwnerKind;
    ownerLabel: string;
    context: string;
    href: string;
  },
): AttachmentSearchResult {
  const displayName = row.label ?? row.originalName;
  return {
    ...row,
    displayName,
    ownerKind: extra.ownerKind,
    ownerLabel: extra.ownerLabel,
    context: extra.context,
    href: extra.href,
    haystack: attachmentSearchHaystack({
      displayName,
      originalName: row.originalName,
      context: extra.context,
    }),
  };
}

function uniqueIds(values: readonly (number | null)[]): number[] {
  return [...new Set(values.filter((value): value is number => value !== null))];
}

function fetchSupplierNames(db: Db, ids: readonly number[]): Map<number, string> {
  const map = new Map<number, string>();
  if (ids.length === 0) return map;
  const rows = db
    .select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers)
    .where(inArray(suppliers.id, [...ids]))
    .all();
  for (const row of rows) map.set(row.id, row.name);
  return map;
}

function fetchPurchaseDetails(
  db: Db,
  ids: readonly number[],
): Map<number, { supplierId: number | null; occurredDate: string; note: string | null }> {
  const map = new Map<
    number,
    { supplierId: number | null; occurredDate: string; note: string | null }
  >();
  if (ids.length === 0) return map;
  const rows = db
    .select({
      id: purchases.id,
      supplierId: purchases.supplierId,
      occurredDate: purchases.occurredDate,
      note: purchases.note,
    })
    .from(purchases)
    .where(inArray(purchases.id, [...ids]))
    .all();
  for (const row of rows) map.set(row.id, row);
  return map;
}

function fetchReceiptDetails(
  db: Db,
  ids: readonly number[],
): Map<number, { source: string | null; occurredDate: string; note: string | null }> {
  const map = new Map<
    number,
    { source: string | null; occurredDate: string; note: string | null }
  >();
  if (ids.length === 0) return map;
  const rows = db
    .select({
      id: receipts.id,
      source: receipts.source,
      occurredDate: receipts.occurredDate,
      note: receipts.note,
    })
    .from(receipts)
    .where(inArray(receipts.id, [...ids]))
    .all();
  for (const row of rows) map.set(row.id, row);
  return map;
}

/** `Parent / Child` label per category id, for the whole household. */
function categoryLabelsById(db: Db): Map<number, string> {
  const rows = db
    .select({ id: categories.id, parentId: categories.parentId, name: categories.name })
    .from(categories)
    .all();
  const nameById = new Map<number, string>(rows.map((row) => [row.id, row.name]));
  return new Map(
    rows.map((row) => [
      row.id,
      row.parentId !== null ? `${nameById.get(row.parentId) ?? ''} / ${row.name}` : row.name,
    ]),
  );
}

/** The category labels of every requested purchase, in allocation order. */
function fetchPurchaseCategories(db: Db, purchaseIds: readonly number[]): Map<number, string[]> {
  const map = new Map<number, string[]>();
  if (purchaseIds.length === 0) return map;
  const rows = db
    .select({ purchaseId: allocations.purchaseId, categoryId: allocations.categoryId })
    .from(allocations)
    .where(inArray(allocations.purchaseId, [...purchaseIds]))
    .orderBy(asc(allocations.id))
    .all();
  const labels = categoryLabelsById(db);
  for (const row of rows) {
    if (row.purchaseId === null) continue;
    const list = map.get(row.purchaseId) ?? [];
    const label = labels.get(row.categoryId);
    if (label !== undefined) list.push(label);
    map.set(row.purchaseId, list);
  }
  return map;
}
