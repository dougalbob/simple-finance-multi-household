import { MAX_ABS_PENCE, parsePence, penceInput } from '../money';

/**
 * Quick Entry Line 1 following the payment amount (mobile flow, SPEC §15.1).
 *
 * The household types the till amount once. Line 1 of the allocation mirrors
 * it until they take that line over, so Save can light up from the amount
 * alone; the category dropdown stays where it always was, in the details
 * panel above Save (and, since v0.9.0, on the swipe panels' second screen). Pure and framework-free, so the mirroring rule is testable
 * without a browser — the takeover flag itself is client state in
 * `PurchaseForm` and is covered in the Playwright suite.
 */
export type FollowedLineAmount =
  /** Write this amount into Line 1. */
  | { action: 'set'; amount: string }
  /** The total was deleted or is zero: the mirrored amount must not linger. */
  | { action: 'clear' }
  /**
   * The total is half-typed ("85.") or negative, so it is not a number yet:
   * leave Line 1 at its last valid mirrored value. Save stays disabled anyway —
   * `balanced` already requires a positive parsed total.
   */
  | { action: 'hold' };

/**
 * What the followed Line 1 amount should become when the Quick Entry amount
 * changes. `parsePence("8")` is already £8.00, so every valid intermediate
 * keystroke is mirrored (typing "8" then "5" ends at £85.00, never frozen on
 * the first valid number) and a correction from 85 to 84.50 arrives too.
 */
export function followedLineAmount(total: string): FollowedLineAmount {
  const parsed = parsePence(total);
  if (parsed === null) {
    // An empty total is a deletion; anything else unparseable is a keystroke
    // in flight ("85.", "12.345", "12."), which must not clear the line.
    return total.trim() === '' ? { action: 'clear' } : { action: 'hold' };
  }
  if (parsed === 0) return { action: 'clear' };
  if (parsed < 0) return { action: 'hold' };
  return { action: 'set', amount: penceInput(parsed) };
}

/* ------------------------------------------------------------------ */
/* Supplier typeahead (SPEC §15.1, v0.9.0)                             */
/* ------------------------------------------------------------------ */

/**
 * The supplier field's matching rules. The old `<datalist>` opened a
 * browser-native popup that is fiddly on a phone, so the list is rendered
 * inline and filtered here instead — same data, same "recents first"
 * ordering, no library and no round trip. Pure, so the ranking is covered by
 * `tests/quick-entry.test.ts` rather than only by the browser suite.
 */
export function normalizeSupplierQuery(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * The visible suggestions. An empty field shows the first `limit` entries in
 * the order the server handed them over (`listSuppliersForEntry`: most recent
 * non-void use first, then alphabetical) — the "what did I spend at last
 * week" list. A typed query keeps only name matches: a name that *starts*
 * with the query outranks one that merely contains it, then shorter names
 * first, so "co" offers "Corner Foods" before "The Corner Cafe".
 */
export function rankSupplierMatches<T extends { name: string }>(
  suppliers: T[],
  query: string,
  limit = 6,
): T[] {
  const normalized = normalizeSupplierQuery(query);
  if (normalized === '') return suppliers.slice(0, limit);
  const matches = suppliers.flatMap((supplier) => {
    const name = normalizeSupplierQuery(supplier.name);
    const index = name.indexOf(normalized);
    return index === -1 ? [] : [{ supplier, rank: index === 0 ? 0 : 1, name }];
  });
  matches.sort(
    (left, right) =>
      left.rank - right.rank ||
      left.name.length - right.name.length ||
      left.name.localeCompare(right.name),
  );
  return matches.slice(0, limit).map((match) => match.supplier);
}

/**
 * The light "Did you mean …?" prompt (SPEC §15.1): the closest existing
 * supplier within an edit distance of 2, or null. An exact match is never
 * suggested back at the user, and an empty field suggests nothing.
 */
export function nearestSupplierName<T extends { name: string }>(
  suppliers: T[],
  query: string,
): T | null {
  const normalized = normalizeSupplierQuery(query);
  if (normalized === '') return null;
  const candidates = suppliers.filter(
    (supplier) => normalizeSupplierQuery(supplier.name) !== normalized,
  );
  let best: T | null = null;
  let bestDistance = 3;
  for (const candidate of candidates) {
    const distance = editDistance(normalizeSupplierQuery(candidate.name), normalized);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/** Levenshtein distance, iterative and allocation-light (≤ ~40 char names). */
export function editDistance(left: string, right: string): number {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = row[0] ?? 0;
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = row[j] ?? 0;
      row[j] =
        left[i - 1] === right[j - 1]
          ? diagonal
          : Math.min(above + 1, (row[j - 1] ?? 0) + 1, diagonal + 1);
      diagonal = above;
    }
  }
  return row[right.length] ?? 99;
}

/**
 * Add one receipt item into a split line (GitHub issue #46, decision 221).
 *
 * The household is standing at a till with several items of the same
 * category — four clothing lines on one Amazon order — and should not have
 * to leave the app for a calculator. This sums in integer pence and writes
 * the running total back into the *same* allocation line (same category,
 * same target). It never creates a second split.
 *
 * Empty or zero current starts the line at the addend. A half-typed current
 * ("11."), a negative current, a non-positive addend, or a sum past the
 * representable range holds so an in-flight keystroke is never destroyed.
 */
export function addToLineAmount(current: string, addend: string): FollowedLineAmount {
  const extra = parsePence(addend);
  if (extra === null || extra <= 0) return { action: 'hold' };
  const trimmed = current.trim();
  const base = trimmed === '' ? 0 : parsePence(current);
  if (base === null || base < 0) return { action: 'hold' };
  const total = base + extra;
  if (!Number.isSafeInteger(total) || total > MAX_ABS_PENCE) return { action: 'hold' };
  return { action: 'set', amount: penceInput(total) };
}

/** Empty split drafts count as zero; invalid in-flight input holds the last remainder. */
export function remainderLineAmount(total: string, others: readonly string[]): FollowedLineAmount {
  const base = followedLineAmount(total);
  if (base.action !== 'set') return base;
  let allocated = 0;
  for (const amount of others) {
    if (amount.trim() === '') continue;
    const parsed = parsePence(amount);
    if (parsed === null || parsed < 0) return { action: 'hold' };
    allocated += parsed;
  }
  return { action: 'set', amount: penceInput(Math.max(0, parsePence(total)! - allocated)) };
}
