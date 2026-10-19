/**
 * The Chart D → Chart E sync (issue #81, decision 241, SPEC §16.7 D/E).
 *
 * One-way by design: a toggle on Spending trends ("Sync to Spending mix")
 * turns its month bars — and the table twin's month names, the keyboard
 * path — into links that set the Spending mix's window to that whole
 * calendar month with the preset's categories ticked. There is no
 * Chart E → Chart D sync; the household dropped it as likely to get messy.
 *
 * Everything is URL state, so a synced view is shareable and works without
 * JavaScript exactly as it does with it:
 *
 * - `mixsync=1` — the toggle. Engaging it is inert: nothing on Chart E
 *   changes until a bar is tapped. Disengaging (or Chart E's "Return to
 *   since last payday") removes every Chart-E filter, restoring its default
 *   payday window and every category.
 * - `mixvia=1` — provenance, carried only by links a synced bar produced.
 *   It is what lights Chart E's "set from Spending trends" signpost. Chart
 *   E's own Show keeps it only when it re-submits exactly what the sync
 *   set; anything else and the household took control of the window.
 *
 * The one builder here (`chartsQuery`) is the page's and the scopes panel's
 * shared way to rewrite `/charts` query parameters without dropping the
 * other charts' state (`preset`, `who`, `noHousing`, the sync params) —
 * the mistake Chart E's own links made before this slice, silently
 * resetting Chart D's preset on every slice click and Show.
 */

/** A value to set: a scalar, a repeated key's values, or undefined to remove. */
export type ChartQueryValue = string | readonly string[] | undefined;

export interface ChartsQueryOptions {
  /**
   * Keys to set or replace. A key present here is never copied from the
   * current entries first, so `cat` can be rewritten wholesale; `undefined`
   * removes the key.
   */
  set?: Readonly<Record<string, ChartQueryValue>>;
  /** Keys to remove outright, before any `set` is applied. */
  drop?: readonly string[];
}

/**
 * The `/charts` query with other charts' state preserved. `entries` is any
 * iterable of `[key, value]` pairs — the page's parsed search params flat
 * mapped, or `[...searchParams.entries()]` in the scopes panel — so repeated
 * keys (`cat=1&cat=2`) survive. The dead `scheduleOnly` param is never
 * carried forward, matching the page's existing `hrefWith`.
 */
export function chartsQuery(
  entries: Iterable<readonly [string, string]>,
  options: ChartsQueryOptions = {},
): URLSearchParams {
  const set = new Map(Object.entries(options.set ?? {}));
  const drop = new Set(options.drop ?? []);
  const query = new URLSearchParams();
  for (const [key, value] of entries) {
    if (key === 'scheduleOnly' || drop.has(key) || set.has(key)) continue;
    query.append(key, value);
  }
  for (const [key, value] of set) {
    if (value === undefined) continue;
    if (typeof value === 'string') {
      query.append(key, value);
    } else {
      for (const item of value) query.append(key, item);
    }
  }
  return query;
}

/** `chartsQuery` as an href, with the fragment the link should land on. */
export function chartsHref(
  entries: Iterable<readonly [string, string]>,
  options: ChartsQueryOptions = {},
  anchor = '',
): string {
  const text = chartsQuery(entries, options).toString();
  return text === '' ? `/charts${anchor}` : `/charts?${text}${anchor}`;
}

/**
 * Everything a disengaged sync leaves behind: Chart E's window, its
 * category ticks, its slice selection, the provenance mark and the toggle
 * itself. Disengaging the chip on Chart D and pressing "Return to since
 * last payday" on Chart E are two doors to this same removal — the full
 * reset the household asked for, back to the payday default and every
 * category.
 */
export const MIX_RESET_KEYS = [
  'from',
  'to',
  'cat',
  'catset',
  'slice',
  'mixvia',
  'mixsync',
] as const;

/**
 * The window a synced bar hands Chart E: the whole calendar month the bar
 * stands for. The month being lived is not complete, so it ends today —
 * which is exactly Chart E's existing "Month to date" quick window, and
 * that pill lights up on its own. A completed month runs to its last day.
 */
export function syncMonthWindow(
  month: { from: string; to: string; complete: boolean },
  today: string,
): { from: string; to: string } {
  return { from: month.from, to: month.complete ? month.to : today };
}

/** Order-insensitive comparison of two category-id sets (strings or numbers). */
export function sameIdSet(
  a: readonly (string | number)[],
  b: readonly (string | number)[],
): boolean {
  const key = (ids: readonly (string | number)[]): string => [...ids].map(String).sort().join(',');
  return key(a) === key(b);
}

/**
 * Whether pressing Show in Chart E's own panel re-submits exactly what the
 * sync set (decision 241: "Show takes control of the window" — unless it
 * changes nothing). `null` cats mean "every category": an unticked tree on
 * one side and an explicit all-children list on the other are the same
 * selection, so both normalise through `allCategoryIds` before comparing.
 */
export function mixShowReconfirms(args: {
  currentFrom: string | null;
  currentTo: string | null;
  /** The URL's ticked ids, or null when `catset` is absent (every category). */
  currentCats: readonly string[] | null;
  submittedFrom: string;
  submittedTo: string;
  /** The form's ticked ids, or null when every category is ticked. */
  submittedCats: readonly string[] | null;
  /** Every selectable id in the tree, for normalising "every category". */
  allCategoryIds: readonly string[];
}): boolean {
  if (args.currentFrom === null || args.currentTo === null) return false;
  if (args.currentFrom !== args.submittedFrom || args.currentTo !== args.submittedTo) {
    return false;
  }
  const normalise = (cats: readonly string[] | null): string =>
    sameIdSet(cats ?? args.allCategoryIds, args.allCategoryIds)
      ? '*'
      : [...(cats ?? [])].map(String).sort().join(',');
  return normalise(args.currentCats) === normalise(args.submittedCats);
}
