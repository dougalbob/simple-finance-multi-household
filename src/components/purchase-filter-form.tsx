'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from 'react';
import { dateRangePresets, matchedDateRangePreset } from '@/lib/records/date-range-presets';
import { PURCHASE_SEARCH_MAX_LENGTH } from '@/lib/records/purchase-search';
import { normalizeSearchText } from '@/lib/search';

export interface PurchaseFilterValues {
  from?: string;
  to?: string;
  /** The supplier / category / notes search, as typed (follow-up to issue #98). */
  q?: string;
  targetKind?: string;
  targetId?: string;
  /** Show toggles (decision 205): '0' hides that kind; anything else (incl. absent) shows it. */
  showSchedule?: string;
  showPurchases?: string;
  showRefunds?: string;
  showVoided?: string;
}

interface ShowToggles {
  showSchedule: boolean;
  showPurchases: boolean;
  showRefunds: boolean;
  showVoided: boolean;
}

interface FilterState {
  from: string;
  to: string;
  q: string;
  targetKind: string;
  targetId: string;
  show: ShowToggles;
}

const SHOW_KEYS = ['showSchedule', 'showPurchases', 'showRefunds', 'showVoided'] as const;

/** The server's view of the filters, as the island's starting state. */
function fromValues(active: PurchaseFilterValues): FilterState {
  const kind =
    active.targetKind === 'person' ||
    active.targetKind === 'vehicle' ||
    active.targetKind === 'household'
      ? active.targetKind
      : '';
  return {
    from: active.from ?? '',
    to: active.to ?? '',
    q: active.q ?? '',
    targetKind: kind,
    targetId: active.targetId ?? '',
    show: {
      showSchedule: active.showSchedule !== '0',
      showPurchases: active.showPurchases !== '0',
      showRefunds: active.showRefunds !== '0',
      showVoided: active.showVoided !== '0',
    },
  };
}

/**
 * Purchases-page filters (decision 92). On a phone the fields sit inside a
 * collapsible panel so the list is the first thing on screen; tablet and
 * desktop keep the form always open. Native date/select controls are forced
 * to shrink (`min-w-0 w-full`) so they cannot spill out of the card.
 *
 * The household's follow-up to GitHub issue #98 reshaped the fields:
 *
 * - the **Pot** and **Paid by** drop-downs are gone — they were never used;
 * - the two date inputs gained the All Transactions **Range** drop-down above
 *   them (Last 30 days, This month, Last Month, This Year, All), and the
 *   dates themselves stay editable underneath. On this page "All" is the
 *   default and simply means no date filter at all;
 * - the **Supplier** and **Category** drop-downs are replaced by one
 *   **search** box that reads the Supplier column, every line's category and
 *   the Notes together as the household types.
 *
 * The search is the only control that applies itself: a keystroke debounces
 * into a router `replace` (no history entry per word, no scroll jump) and the
 * server filters the history, so the count and the total describe what is
 * shown. Everything else waits for **Apply filters**, exactly as before.
 *
 * Links still carry the removed filters — a chart's category, All
 * Transactions' pot, a refund's pot — and the page shows each one as a chip
 * above the results rather than silently applying a filter with no control.
 * Those chips are the page's business (`page.tsx`), not the form's.
 */
export function PurchaseFilterForm({
  people,
  vehicles,
  active,
  today,
}: {
  people: Array<{ id: number; label: string }>;
  vehicles: Array<{ id: number; label: string }>;
  active: PurchaseFilterValues;
  /** The household's local calendar date — every range preset ends here. */
  today: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // The server's values as primitives, so each effect below depends on the
  // value it syncs rather than on a prop object rebuilt on every render.
  const {
    from: serverFrom = '',
    to: serverTo = '',
    q: serverQuery = '',
    targetKind: serverTargetKind = '',
    targetId: serverTargetId = '',
    showSchedule: serverShowSchedule = '1',
    showPurchases: serverShowPurchases = '1',
    showRefunds: serverShowRefunds = '1',
    showVoided: serverShowVoided = '1',
  } = active;
  const [open, setOpen] = useState(filtersAreActive(active));
  // The server's view of the filters, as primitives, so each effect below
  // depends on the value it syncs rather than on a prop object rebuilt on
  // every render.
  const server = fromValues(active);
  const serverShow = server.show;
  const [state, setState] = useState<FilterState>(server);
  /**
   * Until React has hydrated this island, a change in a controlled control is
   * swallowed by the hydration render and the dependent Target picker never
   * populates (SPEC §15.1 · the decision 131 rule, applied to this form). The
   * form says whether it is listening: `data-filters-ready` is its signal, and
   * `inert` keeps it from silently discarding input it cannot act on yet.
   */
  const [ready, setReady] = useState(false);
  const [pending, startTransition] = useTransition();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * The query the current URL was rendered from, and the query this island is
   * already navigating to. They keep a server round trip from overwriting
   * words typed while it was in flight: when the new prop is the value we
   * asked for, there is nothing to sync.
   */
  const appliedQuery = useRef(server.q);
  const lastRequestedQuery = useRef<string | null>(null);
  /** The controls as they stand *now*, for the debounced search callback. */
  const current = useRef(state);
  appliedQuery.current = server.q;
  current.current = state;

  useEffect(() => setReady(true), []);
  // Each field syncs from the server one at a time, so a value the household
  // has not touched is never rewound by a save elsewhere on the page.
  useEffect(() => {
    setState((s) => (s.from === server.from ? s : { ...s, from: server.from }));
  }, [server.from]);
  useEffect(() => {
    setState((s) => (s.to === server.to ? s : { ...s, to: server.to }));
  }, [server.to]);
  useEffect(() => {
    setState((s) => (sameShow(s.show, serverShow) ? s : { ...s, show: serverShow }));
  }, [
    // The object itself is rebuilt each render; its four values are the signal.
    serverShow.showSchedule,
    serverShow.showPurchases,
    serverShow.showRefunds,
    serverShow.showVoided,
  ]);
  useEffect(() => {
    setState((s) =>
      s.targetKind === server.targetKind && s.targetId === server.targetId
        ? s
        : { ...s, targetKind: server.targetKind, targetId: server.targetId },
    );
  }, [server.targetKind, server.targetId]);
  useEffect(() => {
    if (
      lastRequestedQuery.current !== null &&
      normalizeSearchText(server.q) === normalizeSearchText(lastRequestedQuery.current)
    ) {
      // Our own navigation came back; the box already holds what was typed.
      lastRequestedQuery.current = null;
      return;
    }
    lastRequestedQuery.current = null;
    setState((s) => (s.q === server.q ? s : { ...s, q: server.q }));
  }, [server.q]);
  useEffect(
    () => () => {
      if (searchTimer.current !== null) clearTimeout(searchTimer.current);
    },
    [],
  );

  const panelId = useId();
  const targetOptions =
    state.targetKind === 'person' ? people : state.targetKind === 'vehicle' ? vehicles : [];
  const inputClass =
    'w-full min-w-0 max-w-full rounded border border-border-strong bg-surface px-2.5 py-1.5 text-sm focus:border-border-emphasis focus:outline-none';
  const labelClass = 'text-xs font-medium text-ink-soft';
  const fieldClass = 'flex min-w-0 flex-col gap-1';
  const fullRowClass = `${fieldClass} col-span-2 sm:col-span-1`;
  // The range takes two columns everywhere: a whole phone row, so the two dates
  // keep sharing theirs (the layout the phone spec has guarded since decision
  // 92), and beside them on a laptop the From/To pair, so the target pair
  // sits together on the second row instead of Target type trailing the row.
  const rangeFieldClass = `${fieldClass} col-span-2`;

  const cancelSearch = () => {
    if (searchTimer.current !== null) {
      clearTimeout(searchTimer.current);
      searchTimer.current = null;
    }
  };

  /**
   * The same URL the browser would submit, built from the current state and
   * the parameters this form does not own (a chart's category, a pot from a
   * link) so a soft navigation never drops a filter it cannot show.
   */
  const hrefFor = (next: FilterState): string => {
    const params = new URLSearchParams(searchParams.toString());
    const setOrDelete = (key: string, value: string) => {
      if (value === '') params.delete(key);
      else params.set(key, value);
    };
    setOrDelete('from', next.from);
    setOrDelete('to', next.to);
    setOrDelete('q', next.q.trim());
    setOrDelete('targetKind', next.targetKind);
    setOrDelete(
      'targetId',
      next.targetKind === 'person' || next.targetKind === 'vehicle' ? next.targetId : '',
    );
    // The show boxes replace the legacy …Only links completely, so applying
    // the form cannot leave one of them filtering invisibly behind a tick.
    params.delete('scheduleOnly');
    params.delete('refundsOnly');
    params.delete('voidedOnly');
    if (SHOW_KEYS.every((key) => next.show[key])) {
      for (const key of SHOW_KEYS) params.delete(key);
    } else {
      for (const key of SHOW_KEYS) params.set(key, next.show[key] ? '1' : '0');
    }
    const query = params.toString();
    return query === '' ? pathname : `${pathname}?${query}`;
  };

  const navigate = (next: FilterState, mode: 'push' | 'replace') => {
    const href = hrefFor(next);
    startTransition(() => {
      if (mode === 'push') router.push(href, { scroll: false });
      else router.replace(href, { scroll: false });
    });
  };

  const changeQuery = (value: string) => {
    setState((s) => ({ ...s, q: value }));
    cancelSearch();
    if (normalizeSearchText(value) === normalizeSearchText(appliedQuery.current)) return;
    searchTimer.current = setTimeout(() => {
      searchTimer.current = null;
      lastRequestedQuery.current = value.trim();
      navigate({ ...current.current, q: value }, 'replace');
    }, 300);
  };

  const changeRange = (id: string) => {
    const preset = dateRangePresets(today).find((candidate) => candidate.id === id);
    if (preset === undefined) return;
    cancelSearch();
    // "All" on this page is no date filter at all — the history starts where
    // it starts, so there is nothing to gain from a sentinel start date.
    const next: FilterState =
      preset.id === 'all'
        ? { ...state, from: '', to: '' }
        : { ...state, from: preset.from, to: preset.to };
    setState(next);
    lastRequestedQuery.current = state.q.trim();
    navigate(next, 'push');
  };

  const changeTargetKind = (kind: string) => {
    setState((s) => ({ ...s, targetKind: kind, targetId: '' }));
  };

  const toggleShow = (key: (typeof SHOW_KEYS)[number], checked: boolean) => {
    setState((s) => ({ ...s, show: { ...s.show, [key]: checked } }));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    cancelSearch();
    lastRequestedQuery.current = state.q.trim();
    navigate(state, 'push');
  };

  const activeRangeId =
    state.from === '' && state.to === ''
      ? 'all'
      : (matchedDateRangePreset(today, state.from, state.to)?.id ?? 'custom');

  return (
    <form
      method="GET"
      aria-label="Purchase filters"
      aria-busy={pending}
      data-filters-ready={ready ? 'true' : 'false'}
      inert={!ready}
      onSubmit={submit}
      className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
    >
      <button
        type="button"
        className="flex w-full items-center justify-center bg-canvas px-4 py-2.5 text-sm font-medium text-ink-emphasis hover:bg-surface-muted sm:hidden"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? 'Hide filters' : 'Show filters'}
      </button>
      <div
        id={panelId}
        className={open ? 'border-t border-border p-4 sm:border-t-0' : 'hidden p-4 sm:block'}
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className={rangeFieldClass}>
            <label htmlFor="f-range" className={labelClass}>
              Range
            </label>
            <select
              id="f-range"
              value={activeRangeId}
              onChange={(event) => changeRange(event.target.value)}
              className={inputClass}
            >
              {activeRangeId === 'custom' ? (
                <option value="custom" disabled>
                  Custom dates
                </option>
              ) : null}
              {dateRangePresets(today).map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </div>
          <div className={fieldClass}>
            <label htmlFor="f-from" className={labelClass}>
              From date
            </label>
            <input
              id="f-from"
              name="from"
              type="date"
              value={state.from}
              onChange={(event) => setState((s) => ({ ...s, from: event.target.value }))}
              className={inputClass}
            />
          </div>
          <div className={fieldClass}>
            <label htmlFor="f-to" className={labelClass}>
              To date
            </label>
            <input
              id="f-to"
              name="to"
              type="date"
              value={state.to}
              onChange={(event) => setState((s) => ({ ...s, to: event.target.value }))}
              className={inputClass}
            />
          </div>
          <div className={fullRowClass}>
            <label htmlFor="f-target-kind" className={labelClass}>
              Target type
            </label>
            <select
              id="f-target-kind"
              name="targetKind"
              value={state.targetKind}
              onChange={(event) => changeTargetKind(event.target.value)}
              className={inputClass}
            >
              <option value="">Any target</option>
              <option value="person">Person</option>
              <option value="vehicle">Vehicle</option>
              <option value="household">Household</option>
            </select>
          </div>
          <div className={fullRowClass}>
            <label htmlFor="f-target-id" className={labelClass}>
              Target
            </label>
            <select
              id="f-target-id"
              name="targetId"
              value={state.targetId}
              onChange={(event) => setState((s) => ({ ...s, targetId: event.target.value }))}
              disabled={state.targetKind === '' || state.targetKind === 'household'}
              className={inputClass}
            >
              <option value="">
                {state.targetKind === 'household'
                  ? 'Household lines have no target'
                  : `Any ${state.targetKind === 'vehicle' ? 'vehicle' : 'person'}`}
              </option>
              {targetOptions.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-1 border-t border-border-hairline pt-3 sm:max-w-2xl">
          <label htmlFor="f-search" className={labelClass}>
            Search supplier, category or notes
          </label>
          <div className="flex min-w-0 items-center gap-2">
            <input
              id="f-search"
              name="q"
              type="text"
              enterKeyHint="search"
              value={state.q}
              maxLength={PURCHASE_SEARCH_MAX_LENGTH}
              autoComplete="off"
              placeholder="Search the supplier, every category and the notes…"
              onChange={(event) => changeQuery(event.target.value)}
              className={inputClass}
            />
            {state.q !== '' ? (
              <button
                type="button"
                onClick={() => {
                  cancelSearch();
                  setState((s) => ({ ...s, q: '' }));
                  lastRequestedQuery.current = '';
                  navigate({ ...current.current, q: '' }, 'replace');
                }}
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
            Matches the supplier column (with any bank payee), every category on the record and the
            notes together — every word, in any order — and updates as you type.
          </p>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
          {(
            [
              ['showPurchases', 'Purchases'],
              ['showSchedule', 'From schedule'],
              ['showRefunds', 'Refunds'],
              ['showVoided', 'Voided'],
            ] as const
          ).map(([name, label]) => (
            <label key={name} className="flex items-center gap-1.5 text-sm text-ink-body">
              {/* An unchecked box submits nothing, which would read as the
                  "show" default — so a hidden 0 goes first and the box's 1,
                  when ticked, follows it; the page reads the last value. */}
              <input type="hidden" name={name} value="0" />
              <input
                type="checkbox"
                name={name}
                value="1"
                checked={state.show[name]}
                onChange={(event) => toggleShow(name, event.target.checked)}
                className="h-4 w-4 rounded border-border-strong"
              />
              {label}
            </label>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="submit"
              className="rounded bg-till px-4 py-1.5 text-sm font-medium text-till-ink"
            >
              Apply filters
            </button>
            <a href="/purchases" className="text-sm sf-link">
              Clear
            </a>
          </div>
        </div>
      </div>
    </form>
  );
}

function sameShow(left: ShowToggles, right: ShowToggles): boolean {
  return SHOW_KEYS.every((key) => left[key] === right[key]);
}

function filtersAreActive(active: PurchaseFilterValues): boolean {
  return (
    Boolean(active.from) ||
    Boolean(active.to) ||
    Boolean(active.q) ||
    Boolean(active.targetKind) ||
    Boolean(active.targetId) ||
    active.showSchedule === '0' ||
    active.showPurchases === '0' ||
    active.showRefunds === '0' ||
    active.showVoided === '0'
  );
}
