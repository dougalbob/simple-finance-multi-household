'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { changeSpendingPresetAction } from '@/app/actions';
import { initialActionState, type ActionState } from '@/lib/action-state';
import type { SpendingPresets } from '@/lib/records/spending-presets';
import type { CommitmentCategoryGroup } from '@/lib/records/charts-view';

const inputClass =
  'min-w-0 max-w-full rounded border border-border-strong bg-surface px-3 py-2 text-sm';
const buttonClass = 'rounded border border-border-strong px-3 py-2 text-sm disabled:opacity-50';

function useReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready;
}

export function SpendingPresetSelect({
  presets,
  selectedId,
}: {
  presets: SpendingPresets['presets'];
  selectedId: string;
}) {
  const ready = useReady();
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  return (
    <label className="flex min-w-0 max-w-full flex-col gap-1 text-xs text-ink-soft">
      Category preset
      <select
        aria-label="Category preset"
        className={`${inputClass} max-w-full`}
        value={selectedId}
        disabled={!ready || pending || !presets.length}
        onChange={(event) => {
          const next = new URLSearchParams(params.toString());
          next.set('preset', event.target.value);
          next.delete('scheduleOnly');
          startTransition(() =>
            router.push(`/charts?${next.toString()}#commitments`, { scroll: false }),
          );
        }}
      >
        {!presets.length ? <option value="">No presets yet</option> : null}
        {presets.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.name}
          </option>
        ))}
      </select>
      <span role="status" className="sr-only">
        {pending ? 'Updating spending trends…' : ''}
      </span>
    </label>
  );
}

function ParentTick({
  checked,
  partial,
  onChange,
  label,
}: {
  checked: boolean;
  partial: boolean;
  onChange: () => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = partial;
  }, [partial, checked]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={label}
      className="h-4 w-4"
    />
  );
}

export function SpendingPresetManager({
  state: saved,
  groups,
  readOnly,
}: {
  state: SpendingPresets;
  groups: CommitmentCategoryGroup[];
  readOnly: boolean;
}) {
  const ready = useReady();
  const [selectedId, setSelectedId] = useState(saved.presets[0]?.id ?? '');
  const [name, setName] = useState(saved.presets[0]?.name ?? '');
  const [ticked, setTicked] = useState(new Set(saved.presets[0]?.categoryIds ?? []));
  const [expanded, setExpanded] = useState(new Set<number>());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [state, action, pending] = useActionState<ActionState & { presetId?: string }, FormData>(
    changeSpendingPresetAction,
    initialActionState,
  );
  useEffect(() => {
    if (state.status === 'ok' && state.presetId !== undefined) setSelectedId(state.presetId);
  }, [state]);
  useEffect(() => {
    const preset = saved.presets.find((entry) => entry.id === selectedId);
    setName(preset?.name ?? '');
    setTicked(new Set(preset?.categoryIds ?? []));
    setConfirmDelete(false);
  }, [selectedId, saved]);
  const allIds = groups.flatMap((group) => group.children.map((child) => child.id));
  const toggle = (ids: number[]) =>
    setTicked((previous) => {
      const next = new Set(previous);
      const remove = ids.every((id) => next.has(id));
      for (const id of ids) {
        if (remove) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  return (
    <form
      action={action}
      className="space-y-4"
      inert={!ready}
      data-presets-ready={ready ? 'true' : 'false'}
    >
      <input type="hidden" name="presetId" value={selectedId} />
      <input type="hidden" name="version" value={saved.version} />
      {[...ticked].map((id) => (
        <input key={id} type="hidden" name="categoryId" value={id} />
      ))}
      {saved.source !== 'saved' ? (
        <p className="rounded bg-accent-50 px-3 py-2 text-sm text-accent-900">
          {saved.source === 'legacy'
            ? 'Your existing tracked categories are preserved as “Fixed commitments”.'
            : '“Fixed commitments” starts with categories used by your direct debits and standing orders.'}{' '}
          Save a preset to keep these selections fixed.
        </p>
      ) : null}
      {readOnly ? (
        <p className="text-sm text-ink-muted">
          Read-only support view — presets cannot be changed.
        </p>
      ) : null}
      <fieldset disabled={pending || readOnly} className="space-y-4">
        <legend className="sr-only">Create or edit a category preset</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex min-w-0 flex-col gap-1 text-sm">
            Create/Edit preset
            <select
              className={inputClass}
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {saved.presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
              <option value="">Create a new preset…</option>
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-sm">
            Preset name
            <input
              name="name"
              required
              maxLength={60}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Everyday essentials"
              className={inputClass}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={buttonClass} onClick={() => setTicked(new Set(allIds))}>
            Select all categories
          </button>
          <button
            type="button"
            className={buttonClass}
            onClick={() =>
              setTicked(
                new Set(
                  groups.flatMap((group) =>
                    group.children.filter((child) => child.usedBySchedule).map((child) => child.id),
                  ),
                ),
              )
            }
          >
            Select categories used by schedules
          </button>
          <button type="button" className={buttonClass} onClick={() => setTicked(new Set())}>
            Clear selection
          </button>
        </div>
        <p className="text-xs text-ink-muted">
          {ticked.size} categories selected. Parent ticks select their current children. Saved
          presets do not automatically add new categories or follow schedule changes.
        </p>
        <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => {
            const ids = group.children.map((child) => child.id);
            const count = ids.filter((id) => ticked.has(id)).length;
            const open = expanded.has(group.parentId);
            return (
              <div key={group.parentId} className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <ParentTick
                    checked={count === ids.length}
                    partial={count > 0 && count < ids.length}
                    onChange={() => toggle(ids)}
                    label={`Select all ${group.parent}`}
                  />
                  <button
                    type="button"
                    className="flex flex-1 items-center justify-between gap-2 text-left text-sm font-medium"
                    aria-expanded={open}
                    aria-controls={`preset-children-${group.parentId}`}
                    onClick={() =>
                      setExpanded((previous) => {
                        const next = new Set(previous);
                        if (open) next.delete(group.parentId);
                        else next.add(group.parentId);
                        return next;
                      })
                    }
                  >
                    {group.parent}
                    <span className="text-xs text-ink-muted">
                      {count}/{ids.length} {open ? '▴' : '▾'}
                    </span>
                  </button>
                </div>
                <ul
                  id={`preset-children-${group.parentId}`}
                  hidden={!open}
                  className="mt-3 space-y-2 border-l border-border pl-3"
                >
                  {group.children.map((child) => (
                    <li key={child.id}>
                      <label className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={ticked.has(child.id)}
                          onChange={() => toggle([child.id])}
                          className="mt-1"
                        />
                        <span>
                          {child.name}
                          {child.usedBySchedule ? (
                            <span className="block text-xs text-ink-muted">used by a schedule</span>
                          ) : null}
                          {child.retired ? (
                            <span className="text-xs text-ink-muted"> (retired)</span>
                          ) : null}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            name="operation"
            value="save"
            className="rounded bg-till px-4 py-2 text-sm font-medium text-till-ink disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Save preset'}
          </button>
          {selectedId && !confirmDelete ? (
            <button
              type="button"
              className={`${buttonClass} text-danger`}
              onClick={() => setConfirmDelete(true)}
            >
              Delete preset
            </button>
          ) : null}
          {confirmDelete ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>Delete this preset? Purchases are not changed.</span>
              <button
                type="submit"
                name="operation"
                value="delete"
                formNoValidate
                className={`${buttonClass} text-danger`}
              >
                Confirm delete
              </button>
              <button type="button" className={buttonClass} onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
            </div>
          ) : null}
        </div>
      </fieldset>
      {state.message ? (
        <p
          role="status"
          className={`text-sm ${state.status === 'error' ? 'text-danger' : 'text-positive'}`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
