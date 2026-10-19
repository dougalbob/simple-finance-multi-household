/**
 * In-page search ranking for the two searchable pickers (GitHub issues #76
 * and #78): the till's parent/child category list and the Recurring page's
 * supplier list.
 *
 * Both lists are already in the browser with the page — there is no request
 * and no index. The household types a word and the same list filters as they
 * type. Pure and framework-free so the ranking is unit-tested without a
 * browser; the picker itself is `src/components/search-picker.tsx`.
 */

/** The text a picker option offers to the search. */
export interface SearchableText {
  /** The primary label the household reads (a child category, a supplier). */
  label: string;
  /**
   * Extra text that should match but is not the primary label — the parent
   * category's name for the till's `Parent / Child` list.
   */
  searchText?: string;
}

/** Collapse whitespace and case so `Corner  Foods` matches `corner foods`. */
export function normalizeSearchText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function haystackOf(option: SearchableText): string {
  return normalizeSearchText(`${option.label} ${option.searchText ?? ''}`);
}

/**
 * Filter and rank the options for what was typed.
 *
 * - An empty query keeps the order the server handed over (A–Z suppliers,
 *   tree order for categories) and shows everything.
 * - Every whitespace-separated word must appear somewhere in the option's
 *   label or search text, in any order. That is what lets `groc shop` find
 *   `Groceries / Weekly Shop` without the household remembering which side
 *   of the slash a word sits on.
 * - Matches beginning with the whole query come first, then matches that
 *   only contain the words scattered; equal ranks turn shortest-first and
 *   then by the caller's own order, so the ranking is stable.
 */
export function rankSearchMatches<T extends SearchableText>(
  options: readonly T[],
  query: string,
): T[] {
  const normalized = normalizeSearchText(query);
  if (normalized === '') return [...options];
  const tokens = normalized.split(' ');
  const ranked: Array<{
    option: T;
    index: number;
    rank: number;
    length: number;
  }> = [];

  options.forEach((option, index) => {
    const haystack = haystackOf(option);
    if (!tokens.every((token) => haystack.includes(token))) return;
    const phraseAt = haystack.indexOf(normalized);
    ranked.push({
      option,
      index,
      rank: phraseAt === 0 ? 0 : phraseAt > 0 ? 1 : 2,
      length: haystack.length,
    });
  });

  ranked.sort(
    (left, right) =>
      left.rank - right.rank || left.length - right.length || left.index - right.index,
  );
  return ranked.map((entry) => entry.option);
}
