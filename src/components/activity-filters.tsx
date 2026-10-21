'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react';
import { activityRangePresets, matchedActivityRangePreset } from '@/lib/records/activity-range';
import { ACTIVITY_SEARCH_MAX_LENGTH } from '@/lib/records/activity-search';
import { normalizeSearchText } from '@/lib/search';

export interface ActivityFiltersProps {
  /** The household's live pots, in display order. */
  pots: Array<{ id: number; label: string }>;
  potId: number;
  /** The household's local calendar date — every preset ends here. */
  today: string;
  dateFrom: string;
  dateTo: string;
  query: string;
}

interface FilterState {
  potId: number;
  from: string;
  to: string;
  query: string;
}

/** The page's own URL, from the filter state — the dates stay the real state. */
function activityHref({ potId, from, to, query }: FilterState): string {
  const params = new URLSearchParams({
    potId: String(potId),
    from,
    to,
  });
  const trimmed = query.trim();
  if (trimmed !== '') params.set('q', trimmed);
  return `/transactions?${params.toString()}`;
}

/**
 * The All Transactions filter bar (SPEC §15.3, GitHub issue #98).
 *
 * The household's three quick-pick links became the **Range** drop-down:
 * Last 30 days, This month, Last Month, This Year, All. Choosing one applies
 * it at once, exactly as a quick pick did; hand-editing either date puts the
 * select on a "Custom dates" entry rather than pretending a preset is still
 * selected. "Since last checkpoint" is deliberately gone — it was never used.
 *
 * The **search** box is the second half of the issue: one box matching the
 * Supplier / transfer / loan column and Notes together, as the household
 * types. A keystroke debounces into a router `replace` (no history entry, no
 * scroll jump) and the server filters the projection itself, so the row
 * counts, totals and "hidden" note all describe what is actually shown —
 * unlike a browser-side hide, which would only filter the newest pageful.
 *
 * Everything the household can change lives in one form, so it still works as
 * an ordinary GET while React catches up: before hydration the form is
 * `inert` and says so with `data-filters-ready` (decision 131), and the Show
 * activity button carries the whole state. With React, Show activity and the
 * range picker are soft navigations; the search is the only one that replaces
 * the URL rather than pushing it, because one history entry per typed word
 * would make Back useless.
 */
export function ActivityFilters({
  pots,
  potId: initialPotId,
  today,
  dateFrom: initialDateFrom,
  dateTo: initialDateTo,
  query: initialQuery,
}: ActivityFiltersProps) {
  const router = useRouter();
  const presets = activityRangePresets(today);
  const [potId, setPotId] = useState(initialPotId);
  const [dateFrom, setDateFrom] = useState(initialDateFrom);
  const [dateTo, setDateTo] = useState(initialDateTo);
  const [query, setQuery] = useState(initialQuery);
  const [ready, setReady] = useState(false);
  const [pending, startTransition] = useTransition();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * The query the current URL was rendered from, and the query this island is
   * already navigating to. They keep a server round trip from overwriting
   * words typed while it was in flight: when the new prop is the value we
   * asked for, there is nothing to sync.
   */
  const appliedQuery = useRef(initialQuery);
  const lastRequestedQuery = useRef<string | null>(null);
  /** The controls as they stand *now*, for callbacks that fire after a delay. */
  const current = useRef<FilterState>({ potId, from: dateFrom, to: dateTo, query });
  appliedQuery.current = initialQuery;
  current.current = { potId, from: dateFrom, to: dateTo, query };

  useEffect(() => setReady(true), []);
  useEffect(() => setPotId(initialPotId), [initialPotId]);
  useEffect(() => {
    setDateFrom(initialDateFrom);
    setDateTo(initialDateTo);
  }, [initialDateFrom, initialDateTo]);
  useEffect(() => {
    if (
      lastRequestedQuery.current !== null &&
      normalizeSearchText(initialQuery) === normalizeSearchText(lastRequestedQuery.current)
    ) {
      // Our own navigation came back; the box already holds what was typed.
      lastRequestedQuery.current = null;
      return;
    }
    lastRequestedQuery.current = null;
    setQuery(initialQuery);
  }, [initialQuery]);
  useEffect(
    () => () => {
      if (searchTimer.current !== null) clearTimeout(searchTimer.current);
    },
    [],
  );

  const cancelSearch = () => {
    if (searchTimer.current !== null) {
      clearTimeout(searchTimer.current);
      searchTimer.current = null;
    }
  };

  const navigate = (next: FilterState, mode: 'push' | 'replace') => {
    const href = activityHref(next);
    startTransition(() => {
      if (mode === 'push') router.push(href, { scroll: false });
      else router.replace(href, { scroll: false });
    });
  };

  /** A query that differs only by case or spacing is already the applied one. */
  const isAlreadyShowing = (value: string) =>
    normalizeSearchText(value) === normalizeSearchText(appliedQuery.current);

  const changeSearch = (value: string) => {
    setQuery(value);
    cancelSearch();
    if (isAlreadyShowing(value)) return;
    searchTimer.current = setTimeout(() => {
      searchTimer.current = null;
      lastRequestedQuery.current = value.trim();
      navigate({ ...current.current, query: value }, 'replace');
    }, 300);
  };

  const clearSearch = () => {
    cancelSearch();
    setQuery('');
    lastRequestedQuery.current = '';
    navigate({ ...current.current, query: '' }, 'replace');
  };

  const changePreset = (id: string) => {
    const preset = presets.find((candidate) => candidate.id === id);
    if (preset === undefined) return;
    cancelSearch();
    setDateFrom(preset.from);
    setDateTo(preset.to);
    lastRequestedQuery.current = query.trim();
    navigate({ potId, from: preset.from, to: preset.to, query }, 'push');
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    cancelSearch();
    lastRequestedQuery.current = query.trim();
    navigate({ potId, from: dateFrom, to: dateTo, query }, 'push');
  };

  const activePreset = matchedActivityRangePreset(today, dateFrom, dateTo);
  const inputClass =
    'w-full min-w-0 rounded border border-border-strong bg-surface px-2.5 py-1.5 text-sm focus:border-border-emphasis focus:outline-none';
  const labelClass = 'text-xs font-medium text-ink-soft';

  return (
    <form
      method="GET"
      aria-label="Activity filters"
      aria-busy={pending}
      data-filters-ready={ready ? 'true' : 'false'}
      inert={!ready}
      onSubmit={submit}
      className="rounded-xl border border-border bg-surface p-4 shadow-sm"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_1fr_auto] lg:items-end">
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="activity-pot" className={labelClass}>
            Target
          </label>
          <select
            id="activity-pot"
            name="potId"
            value={String(potId)}
            onChange={(event) => setPotId(Number(event.target.value))}
            className={inputClass}
          >
            {pots.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="activity-range" className={labelClass}>
            Range
          </label>
          <select
            id="activity-range"
            name="range"
            value={activePreset?.id ?? 'custom'}
            onChange={(event) => changePreset(event.target.value)}
            className={inputClass}
          >
            {activePreset === null ? (
              <option value="custom" disabled>
                Custom dates
              </option>
            ) : null}
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="activity-from" className={labelClass}>
            Start date
          </label>
          <input
            id="activity-from"
            name="from"
            type="date"
            value={dateFrom}
            max={today}
            onChange={(event) => setDateFrom(event.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="activity-to" className={labelClass}>
            End date
          </label>
          <input
            id="activity-to"
            name="to"
            type="date"
            value={dateTo}
            max={today}
            onChange={(event) => setDateTo(event.target.value)}
            className={inputClass}
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-till px-4 py-2 text-sm font-semibold text-till-ink hover:bg-till-hover"
        >
          Show activity
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-1 border-t border-border-hairline pt-3 sm:max-w-2xl">
        <label htmlFor="activity-search" className={labelClass}>
          Search supplier or notes
        </label>
        <div className="flex min-w-0 items-center gap-2">
          <input
            id="activity-search"
            name="q"
            type="search"
            value={query}
            maxLength={ACTIVITY_SEARCH_MAX_LENGTH}
            autoComplete="off"
            placeholder="Search the supplier / transfer / loan column and notes…"
            onChange={(event) => changeSearch(event.target.value)}
            className={inputClass}
          />
          {query !== '' ? (
            <button
              type="button"
              onClick={clearSearch}
              className="shrink-0 rounded border border-border-strong px-2.5 py-1 text-xs font-medium text-ink-body hover:bg-canvas"
            >
              Clear search
            </button>
          ) : null}
          {pending ? (
            <span role="status" className="shrink-0 text-xs text-ink-muted">
              Searching…
            </span>
          ) : null}
        </div>
        <p className="text-xs text-ink-muted">
          Matches the supplier / transfer / loan column and Notes together — every word, in any
          order — and updates as you type.
        </p>
      </div>
    </form>
  );
}
