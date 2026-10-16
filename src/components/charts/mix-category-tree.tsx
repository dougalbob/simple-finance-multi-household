'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import type { MixParentChoice, MixWindow, MixWindowKind } from '@/lib/records/charts-view';

export interface MixCategoryTreeProps {
  parents: readonly MixParentChoice[];
  includedParentIds: readonly number[];
  includedCategoryIds: readonly number[];
  allCategoriesIncluded?: boolean;
  resetHref?: string;
}

export interface MixScopesProps {
  today: string;
  window: MixWindow;
  presets: {
    payday: MixWindow | null;
    previousPayday: MixWindow | null;
    month: MixWindow;
  };
  parents: readonly MixParentChoice[];
  includedParentIds: readonly number[];
  includedCategoryIds: readonly number[];
  allCategoriesIncluded: boolean;
}

interface PresetOption {
  key: MixWindowKind;
  label: string;
  window: MixWindow;
}

function ParentCheckbox({
  checked,
  indeterminate,
  name,
  value,
  onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  name?: string;
  value?: number;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (ref.current !== null) {
      ref.current.indeterminate = indeterminate;
    }
  }, [indeterminate, checked]);

  return (
    <input
      ref={ref}
      type="checkbox"
      name={name}
      value={value}
      checked={checked}
      onChange={onChange}
      className="h-4 w-4 shrink-0 rounded border-border-strong"
    />
  );
}

/**
 * Expandable parent/child category tree for the Spending Mix selector
 * (SPEC §16.7 E). Starts collapsed showing only parent categories, with a
 * tiny drop-down arrow beside each parent to reveal its indented child
 * categories. Ticking or unticking a parent cascades to all of its children,
 * and partial child selection sets the parent checkbox's indeterminate state.
 */
export function MixCategoryTree({
  parents,
  includedParentIds,
  includedCategoryIds,
}: MixCategoryTreeProps) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() => new Set());
  const [tickedChildIds, setTickedChildIds] = useState<Set<number>>(
    () => new Set(includedCategoryIds),
  );
  const [tickedChildlessParentIds, setTickedChildlessParentIds] = useState<Set<number>>(
    () =>
      new Set(
        includedParentIds.filter((id) =>
          parents.some((parent) => parent.id === id && parent.children.length === 0),
        ),
      ),
  );

  const childKey = includedCategoryIds.join(',');
  const parentKey = includedParentIds.join(',');
  useEffect(() => {
    setTickedChildIds(new Set(includedCategoryIds));
    setTickedChildlessParentIds(
      new Set(
        includedParentIds.filter((id) =>
          parents.some((parent) => parent.id === id && parent.children.length === 0),
        ),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childKey, parentKey]);

  const toggleExpand = (parentId: number): void => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) {
        next.delete(parentId);
      } else {
        next.add(parentId);
      }
      return next;
    });
  };

  const toggleParent = (parent: MixParentChoice): void => {
    if (parent.children.length === 0) {
      setTickedChildlessParentIds((prev) => {
        const next = new Set(prev);
        if (next.has(parent.id)) {
          next.delete(parent.id);
        } else {
          next.add(parent.id);
        }
        return next;
      });
      return;
    }
    setTickedChildIds((prev) => {
      const next = new Set(prev);
      const allTicked = parent.children.every((child) => next.has(child.id));
      for (const child of parent.children) {
        if (allTicked) {
          next.delete(child.id);
        } else {
          next.add(child.id);
        }
      }
      return next;
    });
  };

  const toggleChild = (childId: number): void => {
    setTickedChildIds((prev) => {
      const next = new Set(prev);
      if (next.has(childId)) {
        next.delete(childId);
      } else {
        next.add(childId);
      }
      return next;
    });
  };

  const checkAllCategories = (): void => {
    setTickedChildIds(new Set(parents.flatMap((parent) => parent.children.map((c) => c.id))));
    setTickedChildlessParentIds(
      new Set(parents.filter((parent) => parent.children.length === 0).map((parent) => parent.id)),
    );
  };

  const totalChildren = parents.reduce((sum, parent) => sum + parent.children.length, 0);
  const childlessParents = parents.filter((parent) => parent.children.length === 0);
  const countedParentCount = parents.filter((parent) =>
    parent.children.length === 0
      ? tickedChildlessParentIds.has(parent.id)
      : parent.children.some((child) => tickedChildIds.has(child.id)),
  ).length;
  const hasPartialParent = parents.some((parent) => {
    if (parent.children.length === 0) return false;
    const count = parent.children.filter((child) => tickedChildIds.has(child.id)).length;
    return count > 0 && count < parent.children.length;
  });
  const liveAllIncluded =
    tickedChildIds.size === totalChildren &&
    tickedChildlessParentIds.size === childlessParents.length;

  const summaryText = liveAllIncluded
    ? 'Every category counts.'
    : hasPartialParent
      ? `${tickedChildIds.size} of ${totalChildren} child categories counted.`
      : `${countedParentCount} of ${parents.length} counted.`;

  return (
    <fieldset>
      <legend className="mb-1 text-xs font-medium text-ink-soft">
        Which categories count? <span className="font-normal text-ink-faint">{summaryText}</span>
      </legend>
      <ul className="grid gap-1 sm:grid-cols-2">
        {parents.map((parent) => {
          const hasChildren = parent.children.length > 0;
          const tickedCount = hasChildren
            ? parent.children.filter((child) => tickedChildIds.has(child.id)).length
            : tickedChildlessParentIds.has(parent.id)
              ? 1
              : 0;
          const allTicked = hasChildren
            ? tickedCount === parent.children.length
            : tickedCount === 1;
          const someTicked = hasChildren && tickedCount > 0 && !allTicked;
          const isExpanded = expandedIds.has(parent.id);

          return (
            <li key={parent.id} className="min-w-0">
              <div className="flex min-w-0 items-center gap-1">
                <label className="flex min-w-0 items-center gap-2 text-sm text-ink-body">
                  <ParentCheckbox
                    checked={allTicked}
                    indeterminate={someTicked}
                    name={hasChildren ? undefined : 'cat'}
                    value={hasChildren ? undefined : parent.id}
                    onChange={() => toggleParent(parent)}
                  />
                  <span className="truncate">{parent.name}</span>
                  {parent.retired ? (
                    <span className="text-xs text-ink-faint">(retired)</span>
                  ) : null}
                  {someTicked ? (
                    <span className="text-xs tabular-nums text-ink-muted">
                      ({tickedCount}/{parent.children.length})
                    </span>
                  ) : null}
                </label>
                {hasChildren ? (
                  <button
                    type="button"
                    onClick={() => toggleExpand(parent.id)}
                    aria-expanded={isExpanded}
                    aria-controls={`mix-children-${parent.id}`}
                    aria-label={`${isExpanded ? 'Hide' : 'Show'} ${parent.name} child categories`}
                    title={`${isExpanded ? 'Hide' : 'Show'} ${parent.name} child categories`}
                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-ink-muted hover:bg-canvas hover:text-ink-body"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      className={`transition-transform duration-150 ${isExpanded ? 'rotate-180' : ''}`}
                    >
                      <path d="M2.5 4.5L6 8L9.5 4.5" />
                    </svg>
                  </button>
                ) : null}
              </div>
              {hasChildren ? (
                <ul
                  id={`mix-children-${parent.id}`}
                  aria-label={`${parent.name} child categories`}
                  className={
                    isExpanded ? 'mt-1 ml-2 space-y-1 border-l border-border-strong pl-3' : 'hidden'
                  }
                >
                  {parent.children.map((child) => (
                    <li key={child.id} className="min-w-0">
                      <label className="flex min-w-0 items-center gap-2 text-xs text-ink-soft hover:text-ink-body">
                        <input
                          type="checkbox"
                          name="cat"
                          value={child.id}
                          checked={tickedChildIds.has(child.id)}
                          onChange={() => toggleChild(child.id)}
                          className="h-3.5 w-3.5 shrink-0 rounded border-border-strong"
                        />
                        <span className="truncate">{child.name}</span>
                        {child.retired ? (
                          <span className="text-xs text-ink-faint">(retired)</span>
                        ) : null}
                      </label>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
      {liveAllIncluded ? null : (
        <button
          type="button"
          onClick={checkAllCategories}
          className="mt-2 inline-block text-xs sf-link"
        >
          Count every category
        </button>
      )}
    </fieldset>
  );
}

/**
 * Header and collapsible scope selector for Chart E ("Where the money went",
 * issue #61). Hidden by default behind the top-right "Change chart scopes"
 * button; quick-window pills and category ticks update the form in place and
 * only refresh the chart when the user explicitly presses Show, keeping the
 * panel open across Show submissions until the user closes it or leaves the
 * page.
 */
export function MixScopes({
  today,
  window,
  presets,
  parents,
  includedParentIds,
  includedCategoryIds,
  allCategoriesIncluded,
}: MixScopesProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fromDate, setFromDate] = useState(window.from);
  const [toDate, setToDate] = useState(window.to);
  const [activePresetKey, setActivePresetKey] = useState<MixWindowKind>(window.kind);

  const presetOptions: PresetOption[] = [];
  if (presets.payday !== null) {
    presetOptions.push({ key: 'payday', label: 'Since last payday', window: presets.payday });
  }
  if (presets.previousPayday !== null) {
    presetOptions.push({
      key: 'previous-payday',
      label: 'Last full payday cycle',
      window: presets.previousPayday,
    });
  }
  presetOptions.push({ key: 'month', label: 'Month to date', window: presets.month });

  useEffect(() => {
    setFromDate(window.from);
    setToDate(window.to);
    setActivePresetKey(window.kind);
  }, [window.from, window.to, window.kind]);

  const matchPreset = (nextFrom: string, nextTo: string): MixWindowKind => {
    const matched = presetOptions.find(
      (preset) => preset.window.from === nextFrom && preset.window.to === nextTo,
    );
    return matched?.key ?? 'custom';
  };

  const handleFromChange = (nextFrom: string): void => {
    setFromDate(nextFrom);
    setActivePresetKey(matchPreset(nextFrom, toDate));
  };

  const handleToChange = (nextTo: string): void => {
    setToDate(nextTo);
    setActivePresetKey(matchPreset(fromDate, nextTo));
  };

  const handlePresetClick = (preset: PresetOption): void => {
    setFromDate(preset.window.from);
    setToDate(preset.window.to);
    setActivePresetKey(preset.key);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const from = String(formData.get('from') ?? fromDate);
    const to = String(formData.get('to') ?? toDate);
    const query = new URLSearchParams();
    query.set('from', from);
    query.set('to', to);

    const catValues = formData.getAll('cat').map((value) => String(value));
    const totalSelectable = parents.reduce(
      (sum, parent) => sum + (parent.children.length === 0 ? 1 : parent.children.length),
      0,
    );
    if (catValues.length < totalSelectable) {
      query.set('catset', '1');
      for (const cat of catValues) {
        query.append('cat', cat);
      }
    }
    router.push(`/charts?${query.toString()}#mix`, { scroll: false });
  };

  return (
    <>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
            E · Spending mix
          </p>
          <h2 id="mix-heading" className="text-lg font-semibold sm:text-xl">
            Where the money went
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-controls="mix-controls"
          className="inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-surface px-2.5 py-1.5 text-xs font-medium text-ink-body hover:bg-canvas"
        >
          <span>Change chart scopes</span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          >
            <path d="M2.5 4.5L6 8L9.5 4.5" />
          </svg>
        </button>
      </div>

      <div
        id="mix-controls"
        role="region"
        aria-label="Change chart scopes"
        hidden={!open}
        className="mb-4 rounded-lg border border-border bg-canvas p-3"
      >
        <form method="get" action="/charts#mix" onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs text-ink-soft">
              From
              <input
                type="date"
                name="from"
                required
                max={today}
                value={fromDate}
                onChange={(event) => handleFromChange(event.target.value)}
                className="w-full min-w-0 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-ink-body"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-soft">
              To
              <input
                type="date"
                name="to"
                required
                max={today}
                value={toDate}
                onChange={(event) => handleToChange(event.target.value)}
                className="w-full min-w-0 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-ink-body"
              />
            </label>
            <div className="col-span-2">
              <button
                type="submit"
                className="rounded bg-till px-3 py-1.5 text-sm font-medium text-till-ink"
              >
                Show
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick windows">
            {presetOptions.map((preset) => {
              const on = activePresetKey === preset.key;
              return (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => handlePresetClick(preset)}
                  aria-pressed={on}
                  aria-current={on ? 'true' : undefined}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${
                    on
                      ? 'border-till bg-till text-till-ink'
                      : 'border-border-strong bg-surface text-ink-soft hover:bg-canvas'
                  }`}
                >
                  {on ? '✓ ' : ''}
                  {preset.label}
                </button>
              );
            })}
          </div>

          <input type="hidden" name="catset" value="1" />

          <MixCategoryTree
            parents={parents}
            includedParentIds={includedParentIds}
            includedCategoryIds={includedCategoryIds}
            allCategoriesIncluded={allCategoriesIncluded}
          />
        </form>
      </div>
    </>
  );
}
