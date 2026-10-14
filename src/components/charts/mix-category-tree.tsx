'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { MixParentChoice } from '@/lib/records/charts-view';

export interface MixCategoryTreeProps {
  parents: readonly MixParentChoice[];
  includedParentIds: readonly number[];
  includedCategoryIds: readonly number[];
  allCategoriesIncluded: boolean;
  resetHref: string;
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
  allCategoriesIncluded,
  resetHref,
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

  const totalChildren = parents.reduce((sum, parent) => sum + parent.children.length, 0);
  const hasPartialParent = parents.some((parent) => {
    if (parent.children.length === 0) return false;
    const count = parent.children.filter((child) => includedCategoryIds.includes(child.id)).length;
    return count > 0 && count < parent.children.length;
  });

  const summaryText = allCategoriesIncluded
    ? 'Every category counts.'
    : hasPartialParent
      ? `${includedCategoryIds.length} of ${totalChildren} child categories counted.`
      : `${includedParentIds.length} of ${parents.length} counted.`;

  return (
    <fieldset>
      <legend className="mb-1 text-xs font-medium text-ink-soft">
        Which categories count? <span className="font-normal text-ink-faint">{summaryText}</span>
      </legend>
      <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-1">
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
      {allCategoriesIncluded ? null : (
        <Link href={resetHref} className="mt-2 inline-block text-xs sf-link">
          Count every category
        </Link>
      )}
    </fieldset>
  );
}
