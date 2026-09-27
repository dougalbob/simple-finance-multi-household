'use client';

import Link from 'next/link';
import { useActionState, useEffect, useRef, useState } from 'react';
import {
  completeTaskAction,
  createTaskAction,
  editTaskAction,
  reopenTaskAction,
} from '@/app/actions';
import { initialActionState, type ActionState } from '@/lib/action-state';
import type { TaskRowView } from '@/lib/records/tasks-view';
import type { TaskDueState } from '@/lib/records/tasks';

/**
 * Tasks on every page that shows them (SPEC §25, decision 175): the Tasks
 * page, the supplier card and the purchase row share these controls, so a
 * task ticks, reopens and reschedules the same way wherever it is met.
 *
 * The due state is always printed as words ("Overdue by 3 days", "Due today",
 * "In 12 days", "No due date"); the colour behind it only repeats what the
 * words already say (SPEC §16.7).
 *
 * v0.26.0: a task can be for everyone (default) or only for me (decision
 * 176). The task stays visible to both; the bell filters by assigned_to.
 */

const FIELD_CLASS =
  'w-full rounded border border-border-strong bg-surface px-2 py-1 text-sm focus:border-border-emphasis focus:outline-none';

const DUE_CLASS: Record<TaskDueState, string> = {
  overdue: 'bg-danger-50 text-danger-800 border-danger-300',
  today: 'bg-warning-50 text-warning-900 border-warning-200',
  upcoming: 'bg-surface-muted text-ink-body border-border',
  undated: 'bg-surface text-ink-muted border-border',
};

function Status({ state }: { state: ActionState }) {
  if (state.message === null) return null;
  return (
    <span
      role="status"
      className={`text-xs ${state.status === 'error' ? 'text-danger' : 'text-positive'}`}
    >
      {state.message}
    </span>
  );
}

/** "Overdue by 3 days · was due Sun 1 Nov" — words first, colour second. */
export function TaskDueBadge({ task }: { task: Pick<TaskRowView, 'due' | 'dueDateLabel'> }) {
  const dateWords =
    task.dueDateLabel === null
      ? null
      : task.due.state === 'overdue'
        ? `was due ${task.dueDateLabel}`
        : task.due.state === 'today'
          ? null
          : task.dueDateLabel;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${DUE_CLASS[task.due.state]}`}
    >
      {task.due.label}
      {dateWords === null ? null : <span className="font-normal">· {dateWords}</span>}
    </span>
  );
}

/**
 * The checkbox: ticking it closes the task. It stays ticked while the save is
 * in flight and unticks itself if the save is refused (someone else closed or
 * moved it first) — a box never looks done when it is not.
 */
export function TaskCheckbox({ task }: { task: Pick<TaskRowView, 'id' | 'version' | 'title'> }) {
  const [state, formAction, pending] = useActionState(completeTaskAction, initialActionState);
  const [ticked, setTicked] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === 'error') setTicked(false);
  }, [state]);
  useEffect(() => {
    if (state.status === 'ok') {
      window.dispatchEvent(new CustomEvent('sf:tasks-changed'));
    }
  }, [state]);
  return (
    <form ref={formRef} action={formAction} className="inline-flex items-start gap-2">
      <input type="hidden" name="id" value={task.id} />
      <input type="hidden" name="expectedVersion" value={task.version} />
      <input
        type="checkbox"
        aria-label={`Mark done: ${task.title}`}
        checked={ticked || pending}
        disabled={pending}
        onChange={(event) => {
          if (!event.currentTarget.checked) return;
          setTicked(true);
          formRef.current?.requestSubmit();
        }}
        className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-accent"
      />
      {pending ? <span className="text-xs text-ink-muted">Saving…</span> : null}
      <Status state={state} />
    </form>
  );
}

export function TaskReopenButton({
  task,
}: {
  task: Pick<TaskRowView, 'id' | 'version' | 'title'>;
}) {
  const [state, formAction, pending] = useActionState(reopenTaskAction, initialActionState);
  useEffect(() => {
    if (state.status === 'ok') {
      window.dispatchEvent(new CustomEvent('sf:tasks-changed'));
    }
  }, [state]);
  return (
    <form action={formAction} className="inline-flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={task.id} />
      <input type="hidden" name="expectedVersion" value={task.version} />
      <button
        type="submit"
        disabled={pending}
        aria-label={`Reopen: ${task.title}`}
        className="rounded border border-border-strong px-2 py-0.5 text-xs font-medium text-ink-soft hover:bg-surface-muted disabled:opacity-60"
      >
        {pending ? 'Reopening…' : 'Reopen'}
      </button>
      <Status state={state} />
    </form>
  );
}

/** Reword, reschedule, or close with a note — tucked away until needed. */
function TaskChangeControls({ task }: { task: TaskRowView }) {
  const [editState, editAction, editPending] = useActionState(editTaskAction, initialActionState);
  const [doneState, doneAction, donePending] = useActionState(
    completeTaskAction,
    initialActionState,
  );
  const idPrefix = `task-${task.id}`;
  useEffect(() => {
    if (editState.status === 'ok' || doneState.status === 'ok') {
      window.dispatchEvent(new CustomEvent('sf:tasks-changed'));
    }
  }, [editState, doneState]);
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs font-medium text-ink-soft hover:text-ink">
        Reschedule, edit or close with a note
      </summary>
      <div className="mt-2 grid gap-3 rounded-lg border border-border bg-canvas p-3 sm:grid-cols-2">
        <form action={editAction} className="space-y-1.5">
          <input type="hidden" name="id" value={task.id} />
          <input type="hidden" name="expectedVersion" value={task.version} />
          <label className="block text-xs font-medium text-ink-soft" htmlFor={`${idPrefix}-title`}>
            Task
          </label>
          <input
            id={`${idPrefix}-title`}
            name="title"
            defaultValue={task.title}
            required
            maxLength={200}
            className={FIELD_CLASS}
          />
          <label className="block text-xs font-medium text-ink-soft" htmlFor={`${idPrefix}-due`}>
            Due by (leave empty for no date)
          </label>
          <input
            id={`${idPrefix}-due`}
            name="dueDate"
            type="date"
            defaultValue={task.dueDate ?? ''}
            className={FIELD_CLASS}
          />
          <label
            className="block text-xs font-medium text-ink-soft"
            htmlFor={`${idPrefix}-assigned`}
          >
            For
          </label>
          <select
            id={`${idPrefix}-assigned`}
            name="assignedTo"
            defaultValue={task.assignedTo === null ? 'household' : 'me'}
            className={FIELD_CLASS}
          >
            <option value="household">Everyone</option>
            <option value="me">Only me</option>
          </select>
          <label className="block text-xs font-medium text-ink-soft" htmlFor={`${idPrefix}-detail`}>
            Detail
          </label>
          <textarea
            id={`${idPrefix}-detail`}
            name="detail"
            rows={2}
            maxLength={2000}
            defaultValue={task.detail ?? ''}
            className={FIELD_CLASS}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={editPending}
              className="rounded bg-accent px-2.5 py-1 text-xs font-medium text-fill-ink disabled:opacity-60"
            >
              {editPending ? 'Saving…' : 'Save changes'}
            </button>
            <Status state={editState} />
          </div>
        </form>
        <form action={doneAction} className="space-y-1.5">
          <input type="hidden" name="id" value={task.id} />
          <input type="hidden" name="expectedVersion" value={task.version} />
          <label className="block text-xs font-medium text-ink-soft" htmlFor={`${idPrefix}-note`}>
            Close with a note (optional)
          </label>
          <input
            id={`${idPrefix}-note`}
            name="note"
            maxLength={500}
            placeholder="e.g. Switched tariff — no longer needed"
            className={FIELD_CLASS}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={donePending}
              className="rounded border border-border-strong px-2.5 py-1 text-xs font-medium text-ink-body hover:bg-surface-muted disabled:opacity-60"
            >
              {donePending ? 'Saving…' : 'Mark done'}
            </button>
            <Status state={doneState} />
          </div>
        </form>
      </div>
    </details>
  );
}

/** Open tasks, one row each: tick box, words, due state, subject link. */
export function OpenTaskList({
  tasks,
  showSubject = true,
  emptyText,
}: {
  tasks: readonly TaskRowView[];
  /** False on a subject's own card, where "About: EnergyCo" would repeat the heading. */
  showSubject?: boolean;
  emptyText?: string;
}) {
  if (tasks.length === 0) {
    return emptyText === undefined ? null : <p className="text-sm text-ink-muted">{emptyText}</p>;
  }
  return (
    <ul className="space-y-2">
      {tasks.map((task) => (
        <li
          key={task.id}
          id={`task-${task.id}`}
          className="scroll-mt-24 rounded-lg border border-border-hairline bg-surface p-2.5"
        >
          <div className="flex items-start gap-2">
            <TaskCheckbox task={task} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="font-medium text-ink">{task.title}</span>
                <TaskDueBadge task={task} />
                {task.assignedToLabel !== null ? (
                  <span className="inline-flex rounded-full border border-border bg-surface-muted px-2 py-0.5 text-xs font-medium text-ink-soft">
                    {task.assignedToLabel}
                  </span>
                ) : null}
              </div>
              {showSubject ? (
                <p className="mt-0.5 text-xs text-ink-soft">
                  About:{' '}
                  {task.subjectHref === null ? (
                    task.subjectLabel
                  ) : (
                    <Link href={task.subjectHref} className="text-accent hover:underline">
                      {task.subjectLabel}
                    </Link>
                  )}
                  {task.subjectNote === null ? null : ` (${task.subjectNote})`}
                </p>
              ) : null}
              {task.detail !== null ? (
                <p className="mt-0.5 whitespace-pre-line text-sm text-ink-soft">{task.detail}</p>
              ) : null}
              <p className="mt-0.5 text-xs text-ink-muted">
                Added by {task.createdBy} on {task.createdOnLabel}
                {task.fromInteraction ? ' · from a logged interaction' : ''}
                {task.assignedToLabel !== null ? ` · ${task.assignedToLabel}` : ''}
              </p>
              <TaskChangeControls task={task} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Closed tasks from the last few weeks, with who closed them and a way back. */
export function DoneTaskList({
  tasks,
  showSubject = true,
}: {
  tasks: readonly TaskRowView[];
  showSubject?: boolean;
}) {
  if (tasks.length === 0) return null;
  return (
    <ul className="space-y-1.5 text-sm">
      {tasks.map((task) => (
        <li key={task.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-ink-muted">
            <span aria-hidden="true">✓ </span>
            <span className="line-through">{task.title}</span>
          </span>
          <span className="text-xs text-ink-muted">
            Done by {task.completedBy ?? 'someone'} on {task.completedOnLabel ?? '—'}
            {task.completionNote === null ? '' : ` — ${task.completionNote}`}
            {task.assignedToLabel !== null ? ` · ${task.assignedToLabel}` : ''}
            {showSubject ? (
              <>
                {' · About: '}
                {task.subjectHref === null ? (
                  task.subjectLabel
                ) : (
                  <Link href={task.subjectHref} className="text-accent hover:underline">
                    {task.subjectLabel}
                  </Link>
                )}
              </>
            ) : null}
          </span>
          <TaskReopenButton task={task} />
        </li>
      ))}
    </ul>
  );
}

export interface TaskSubjectChoices {
  suppliers: readonly { value: string; label: string }[];
  vehicles: readonly { value: string; label: string }[];
}

/**
 * Add a task. On a subject's own page the subject is fixed (`subject` =
 * `supplier:3`, `purchase:17`); on the Tasks page the household chooses what
 * it is about, or leaves it as the household.
 *
 * v0.26.0: a task can be for everyone (default, both people count it in the
 * bell) or only for me (only my bell counts it). The task itself stays
 * visible to both (SPEC §3 — full mutual visibility); the bell filters by
 * assigned_to.
 */
export function TaskCreateForm({
  idPrefix,
  subject,
  choices,
  titlePlaceholder = 'What needs doing?',
  submitLabel = 'Add task',
}: {
  idPrefix: string;
  subject?: string;
  choices?: TaskSubjectChoices;
  titlePlaceholder?: string;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(createTaskAction, initialActionState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === 'ok') formRef.current?.reset();
  }, [state]);
  useEffect(() => {
    if (state.status === 'ok') {
      window.dispatchEvent(new CustomEvent('sf:tasks-changed'));
    }
  }, [state]);
  return (
    <form ref={formRef} action={formAction} className="space-y-1.5">
      {subject !== undefined ? <input type="hidden" name="subject" value={subject} /> : null}
      <div className="grid gap-1.5 sm:grid-cols-[1fr_auto]">
        <div>
          <label className="sr-only" htmlFor={`${idPrefix}-title`}>
            Task
          </label>
          <input
            id={`${idPrefix}-title`}
            name="title"
            required
            maxLength={200}
            placeholder={titlePlaceholder}
            className={FIELD_CLASS}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="whitespace-nowrap text-xs text-ink-soft" htmlFor={`${idPrefix}-due`}>
            Due by
          </label>
          <input id={`${idPrefix}-due`} name="dueDate" type="date" className={FIELD_CLASS} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {subject === undefined && choices !== undefined ? (
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-ink-soft" htmlFor={`${idPrefix}-subject`}>
              About
            </label>
            <select
              id={`${idPrefix}-subject`}
              name="subject"
              defaultValue="household"
              className={`${FIELD_CLASS} w-auto`}
            >
              <option value="household">The household</option>
              {choices.suppliers.length > 0 ? (
                <optgroup label="Suppliers">
                  {choices.suppliers.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {choices.vehicles.length > 0 ? (
                <optgroup label="Vehicles">
                  {choices.vehicles.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </div>
        ) : null}
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-ink-soft" htmlFor={`${idPrefix}-assigned`}>
            For
          </label>
          <select
            id={`${idPrefix}-assigned`}
            name="assignedTo"
            defaultValue="household"
            className={`${FIELD_CLASS} w-auto`}
          >
            <option value="household">Everyone</option>
            <option value="me">Only me</option>
          </select>
        </div>
      </div>
      <label className="sr-only" htmlFor={`${idPrefix}-detail`}>
        Detail
      </label>
      <textarea
        id={`${idPrefix}-detail`}
        name="detail"
        rows={1}
        maxLength={2000}
        placeholder="Detail (optional)"
        className={FIELD_CLASS}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-accent px-2.5 py-1 text-xs font-medium text-fill-ink disabled:opacity-60"
        >
          {pending ? 'Adding…' : submitLabel}
        </button>
        <Status state={state} />
      </div>
    </form>
  );
}
