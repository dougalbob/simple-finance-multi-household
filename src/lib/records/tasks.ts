import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import { recordAudit, type DbTx } from '../audit';
import type { Db } from '../db/client';
import { purchases, supplierInteractions, suppliers, tasks, vehicles } from '../db/schema';
import { isValidLocalDate } from '../time';
import { daysBetween } from './dates';
import { VersionConflictError } from './errors';

/**
 * Tasks (docs/SPEC.md §25, decision 175): what the household has said it will
 * do — "Research cheaper tariffs", "Chase the refund", "Ring the broker back".
 *
 * Before v0.25.0 a promise was a nullable follow-up date on the supplier
 * interaction log. Three pages read it three ways, all of them `>= today`, so
 * the day after the date the promise vanished from every list, and nothing
 * could close or move it. A task is a record instead:
 *
 * - it is **about** something (a supplier, a purchase, a vehicle or the
 *   household) — a `subject`, deliberately not the SPEC §9.2 `target` "who was
 *   this spend for" vocabulary, whose label helper prints `household` for any
 *   kind it does not know;
 * - it may have a due date, and an **overdue task stays listed** — first — until
 *   someone closes it;
 * - it is closed (with an optional note) and can be reopened, never deleted;
 * - every change presents the version the person saw (a stale form fails
 *   visibly, `VersionConflictError`) and writes an audit entry in the same
 *   transaction — the renewals shape.
 *
 * There is no recurrence: the yearly case is renewals and key dates, which
 * already roll themselves forward. Tasks are in-app only — nothing here sends
 * an email, a push or a browser notification (decision 19, SPEC §21.2).
 */

export type Task = typeof tasks.$inferSelect;

export const TASK_SUBJECT_KINDS = ['supplier', 'purchase', 'vehicle', 'household'] as const;
export type TaskSubjectKind = (typeof TASK_SUBJECT_KINDS)[number];

/** "Follow up with " plus a 120-character supplier name still fits. */
export const MAX_TASK_TITLE_LENGTH = 200;
export const MAX_TASK_DETAIL_LENGTH = 2000;
export const MAX_TASK_COMPLETION_NOTE_LENGTH = 500;

export class TaskNotFoundError extends Error {
  constructor(taskId: number) {
    super(`No task with id ${taskId}. It may have been changed elsewhere — refresh the page.`);
    this.name = 'TaskNotFoundError';
  }
}

export class InvalidTaskInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTaskInputError';
  }
}

/**
 * Completing a task that is already done, reopening one that is open, or
 * editing a closed one — explicit, never a silent no-op (the AlreadyVoidError
 * rule). Two people ticking the same box get one success and one sentence.
 */
export class TaskStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaskStateError';
  }
}

export function isTaskSubjectKind(value: unknown): value is TaskSubjectKind {
  return typeof value === 'string' && (TASK_SUBJECT_KINDS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface CreateTaskInput {
  title: string;
  detail?: string | null;
  /** 'YYYY-MM-DD' (local), or null/'' for an undated task. */
  dueDate?: string | null;
  subjectKind?: TaskSubjectKind;
  /** Required for every kind except 'household', which must have none. */
  subjectId?: number | null;
  /** Set by `addSupplierInteraction`: the logged call this promise came from. */
  relatedInteractionId?: number | null;
  actor: string;
  now?: Date;
}

/**
 * Create a task inside a transaction the caller already holds — the path
 * `addSupplierInteraction` uses so an interaction and the follow-up it
 * promised are saved together or not at all.
 */
export function createTaskInTransaction(tx: DbTx, input: CreateTaskInput): Task {
  const now = input.now ?? new Date();
  const actor = checkedActor(input.actor);
  const title = checkedTitle(input.title);
  const detail = checkedDetail(input.detail ?? null);
  const dueDate = checkedDueDate(input.dueDate ?? null);
  const subjectKind = input.subjectKind ?? 'household';
  const subjectId = input.subjectId ?? null;
  const subject = checkedSubjectForNewTask(tx, subjectKind, subjectId);
  const relatedInteractionId = checkedRelatedInteraction(
    tx,
    input.relatedInteractionId ?? null,
    subjectKind,
    subjectId,
  );

  const inserted = tx
    .insert(tasks)
    .values({
      title,
      detail,
      dueDate,
      subjectKind,
      subjectId,
      relatedInteractionId,
      createdBy: actor,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  if (inserted === undefined) throw new Error('insert task returned no row');
  recordAudit(tx, {
    actor,
    action: 'task.create',
    entity: 'task',
    entityId: inserted.id,
    summary:
      `Added task “${title}”` +
      (dueDate === null ? ' (no due date)' : ` due ${dueDate}`) +
      (subject === null ? '' : ` about ${subject}`),
    after: inserted,
    now,
  });
  return inserted;
}

export function createTask(db: Db, input: CreateTaskInput): Task {
  return db.transaction((tx) => createTaskInTransaction(tx, input));
}

export interface EditTaskPatch {
  title?: string;
  /** undefined = unchanged; null or '' = clear. */
  detail?: string | null;
  /** undefined = unchanged; null or '' = no due date. Moving it is rescheduling. */
  dueDate?: string | null;
}

export interface TaskVersionInput {
  id: number;
  expectedVersion: number;
  actor: string;
  now?: Date;
}

/**
 * Change the words or the due date of an open task. The subject is fixed: a
 * task about the wrong thing is closed with a note and a new one added, so
 * the history of each stays honest. A closed task is reopened first.
 */
export function editTask(db: Db, input: TaskVersionInput & { patch: EditTaskPatch }): Task {
  const now = input.now ?? new Date();
  const actor = checkedActor(input.actor);
  const patch = input.patch;
  return db.transaction((tx) => {
    const current = currentAtVersion(tx, input.id, input.expectedVersion);
    if (current.completedAt !== null) {
      throw new TaskStateError(`“${current.title}” is already done. Reopen it to change it.`);
    }
    const title = patch.title === undefined ? current.title : checkedTitle(patch.title);
    const detail = patch.detail === undefined ? current.detail : checkedDetail(patch.detail);
    const dueDate = patch.dueDate === undefined ? current.dueDate : checkedDueDate(patch.dueDate);
    const updated = tx
      .update(tasks)
      .set({ title, detail, dueDate, updatedAt: now, version: current.version + 1 })
      .where(eq(tasks.id, current.id))
      .returning()
      .get();
    if (updated === undefined) throw new Error('update task returned no row');
    const moved =
      current.dueDate === dueDate
        ? ''
        : ` — due date ${current.dueDate ?? 'none'} → ${dueDate ?? 'none'}`;
    recordAudit(tx, {
      actor,
      action: 'task.edit',
      entity: 'task',
      entityId: current.id,
      summary: `Edited task “${current.title}”${moved}`,
      before: current,
      after: updated,
      now,
    });
    return updated;
  });
}

/** Tick the box: the task is done, by whom, when, and optionally why. */
export function completeTask(
  db: Db,
  input: TaskVersionInput & { note?: string | null },
): Task {
  const now = input.now ?? new Date();
  const actor = checkedActor(input.actor);
  const note = checkedCompletionNote(input.note ?? null);
  return db.transaction((tx) => {
    const current = currentAtVersion(tx, input.id, input.expectedVersion);
    if (current.completedAt !== null) {
      throw new TaskStateError(
        `“${current.title}” was already marked done by ${current.completedBy ?? 'someone'}.`,
      );
    }
    const updated = tx
      .update(tasks)
      .set({
        completedAt: now,
        completedBy: actor,
        completionNote: note,
        updatedAt: now,
        version: current.version + 1,
      })
      .where(eq(tasks.id, current.id))
      .returning()
      .get();
    if (updated === undefined) throw new Error('complete task returned no row');
    recordAudit(tx, {
      actor,
      action: 'task.complete',
      entity: 'task',
      entityId: current.id,
      summary: `Completed task “${current.title}”${note === null ? '' : ` — ${note}`}`,
      before: current,
      after: updated,
      now,
    });
    return updated;
  });
}

/**
 * Untick it: the task is open again with its original due date, which may
 * now be overdue. The completion is not lost — it stays in the audit trail.
 */
export function reopenTask(db: Db, input: TaskVersionInput): Task {
  const now = input.now ?? new Date();
  const actor = checkedActor(input.actor);
  return db.transaction((tx) => {
    const current = currentAtVersion(tx, input.id, input.expectedVersion);
    if (current.completedAt === null) {
      throw new TaskStateError(`“${current.title}” is already open.`);
    }
    const updated = tx
      .update(tasks)
      .set({
        completedAt: null,
        completedBy: null,
        completionNote: null,
        updatedAt: now,
        version: current.version + 1,
      })
      .where(eq(tasks.id, current.id))
      .returning()
      .get();
    if (updated === undefined) throw new Error('reopen task returned no row');
    recordAudit(tx, {
      actor,
      action: 'task.reopen',
      entity: 'task',
      entityId: current.id,
      summary: `Reopened task “${current.title}”`,
      before: current,
      after: updated,
      now,
    });
    return updated;
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function getTask(db: Db, taskId: number): Task {
  const row = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
  if (row === undefined) throw new TaskNotFoundError(taskId);
  return row;
}

export interface ListTasksFilter {
  /** Default 'open'. */
  status?: 'open' | 'done';
  subjectKind?: TaskSubjectKind;
  /** With `subjectKind`: one subject's tasks. */
  subjectId?: number;
  /** Done tasks closed at or after this instant. */
  completedSince?: Date;
  limit?: number;
}

/**
 * Open tasks come back soonest-due first with undated ones last (sort them
 * with `sortTasksByDue` for the page order); done tasks newest-closed first.
 */
export function listTasks(db: Db, filter: ListTasksFilter = {}): Task[] {
  const status = filter.status ?? 'open';
  const conditions: SQL[] = [
    status === 'open' ? isNull(tasks.completedAt) : isNotNull(tasks.completedAt),
  ];
  if (filter.subjectKind !== undefined) {
    conditions.push(eq(tasks.subjectKind, filter.subjectKind));
    if (filter.subjectId !== undefined) conditions.push(eq(tasks.subjectId, filter.subjectId));
  }
  if (status === 'done' && filter.completedSince !== undefined) {
    conditions.push(gte(tasks.completedAt, filter.completedSince));
  }
  const query = db
    .select()
    .from(tasks)
    .where(and(...conditions))
    .orderBy(
      ...(status === 'open'
        ? [sql`${tasks.dueDate} IS NULL`, asc(tasks.dueDate), asc(tasks.id)]
        : [desc(tasks.completedAt), desc(tasks.id)]),
    );
  const limit = filter.limit === undefined ? 500 : Math.min(Math.max(filter.limit, 1), 500);
  return query.limit(limit).all();
}

/** The task each logged interaction produced, keyed by interaction id. */
export function tasksByInteraction(db: Db, interactionIds: readonly number[]): Map<number, Task> {
  const byInteraction = new Map<number, Task>();
  if (interactionIds.length === 0) return byInteraction;
  const rows = db
    .select()
    .from(tasks)
    .where(inArray(tasks.relatedInteractionId, [...new Set(interactionIds)]))
    .orderBy(asc(tasks.id))
    .all();
  for (const row of rows) {
    if (row.relatedInteractionId !== null) byInteraction.set(row.relatedInteractionId, row);
  }
  return byInteraction;
}

// ---------------------------------------------------------------------------
// Pure: due state, words and order (SPEC §25.3)
// ---------------------------------------------------------------------------

export type TaskDueState = 'overdue' | 'today' | 'upcoming' | 'undated';

export interface TaskDue {
  state: TaskDueState;
  /** Days from today to the due date (negative when overdue); null if undated. */
  days: number | null;
  /**
   * The state in words — "Overdue by 3 days", "Due today", "Due tomorrow",
   * "In 12 days", "No due date". Always printed: colour is never the only
   * signal (SPEC §16.7).
   */
  label: string;
}

/**
 * Where a due date stands against today. A value that is not a real calendar
 * date (only a hand-edited database could hold one) reads as undated rather
 * than breaking the page.
 */
export function taskDue(dueDate: string | null, today: string): TaskDue {
  if (dueDate === null || !isValidLocalDate(dueDate)) {
    return { state: 'undated', days: null, label: 'No due date' };
  }
  const days = daysBetween(today, dueDate);
  if (days < 0) {
    const late = -days;
    return { state: 'overdue', days, label: `Overdue by ${late} ${late === 1 ? 'day' : 'days'}` };
  }
  if (days === 0) return { state: 'today', days, label: 'Due today' };
  if (days === 1) return { state: 'upcoming', days, label: 'Due tomorrow' };
  return { state: 'upcoming', days, label: `In ${days} days` };
}

const DUE_RANK: Record<TaskDueState, number> = { overdue: 0, today: 1, upcoming: 2, undated: 3 };

/**
 * Overdue (the longest-overdue first) → due today → later (soonest first) →
 * undated (oldest first). Ties keep creation order.
 */
export function compareTasksByDue(
  a: { id: number; dueDate: string | null },
  b: { id: number; dueDate: string | null },
  today: string,
): number {
  const dueA = taskDue(a.dueDate, today);
  const dueB = taskDue(b.dueDate, today);
  if (DUE_RANK[dueA.state] !== DUE_RANK[dueB.state]) {
    return DUE_RANK[dueA.state] - DUE_RANK[dueB.state];
  }
  if (dueA.days !== null && dueB.days !== null && dueA.days !== dueB.days) {
    return dueA.days - dueB.days;
  }
  return a.id - b.id;
}

export function sortTasksByDue<T extends { id: number; dueDate: string | null }>(
  items: readonly T[],
  today: string,
): T[] {
  return [...items].sort((a, b) => compareTasksByDue(a, b, today));
}

export interface TaskGroups<T> {
  overdue: T[];
  today: T[];
  upcoming: T[];
  undated: T[];
}

/** The /tasks page groups, each already in order. */
export function groupTasksByDue<T extends { id: number; dueDate: string | null }>(
  items: readonly T[],
  today: string,
): TaskGroups<T> {
  const groups: TaskGroups<T> = { overdue: [], today: [], upcoming: [], undated: [] };
  for (const item of sortTasksByDue(items, today)) {
    groups[taskDue(item.dueDate, today).state].push(item);
  }
  return groups;
}

/** "2 open · 1 overdue" on a supplier card header. */
export function countOpenTasks(
  items: readonly { dueDate: string | null; completedAt: Date | null }[],
  today: string,
): { open: number; overdue: number } {
  let open = 0;
  let overdue = 0;
  for (const item of items) {
    if (item.completedAt !== null) continue;
    open += 1;
    if (taskDue(item.dueDate, today).state === 'overdue') overdue += 1;
  }
  return { open, overdue };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function currentAtVersion(tx: DbTx, taskId: number, expectedVersion: number): Task {
  const current = tx.select().from(tasks).where(eq(tasks.id, taskId)).get();
  if (current === undefined) throw new TaskNotFoundError(taskId);
  if (current.version !== expectedVersion) {
    throw new VersionConflictError('task', taskId, expectedVersion, current.version);
  }
  return current;
}

function checkedActor(raw: string): string {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new InvalidTaskInputError('Every task change records who made it.');
  }
  return raw.trim();
}

function checkedTitle(raw: string): string {
  const title = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
  if (title === '') throw new InvalidTaskInputError('Say what needs doing.');
  if (title.length > MAX_TASK_TITLE_LENGTH) {
    throw new InvalidTaskInputError(
      `Keep the task to ${MAX_TASK_TITLE_LENGTH} characters — put the rest in the detail.`,
    );
  }
  return title;
}

function checkedDetail(raw: string | null): string | null {
  if (raw === null) return null;
  // Line breaks are kept (a reference number on its own line); runs of spaces
  // and blank lines are not.
  const detail = raw
    .split('\n')
    .map((line) => line.replace(/[ \t\r]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (detail === '') return null;
  if (detail.length > MAX_TASK_DETAIL_LENGTH) {
    throw new InvalidTaskInputError(
      `Keep the detail to ${MAX_TASK_DETAIL_LENGTH} characters.`,
    );
  }
  return detail;
}

function checkedCompletionNote(raw: string | null): string | null {
  if (raw === null) return null;
  const note = raw.replace(/\s+/g, ' ').trim();
  if (note === '') return null;
  if (note.length > MAX_TASK_COMPLETION_NOTE_LENGTH) {
    throw new InvalidTaskInputError(
      `Keep the note to ${MAX_TASK_COMPLETION_NOTE_LENGTH} characters.`,
    );
  }
  return note;
}

function checkedDueDate(raw: string | null): string | null {
  if (raw === null) return null;
  const value = raw.trim();
  if (value === '') return null;
  if (!isValidLocalDate(value)) {
    throw new InvalidTaskInputError('Enter the due date as a calendar date, or leave it empty.');
  }
  return value;
}

/**
 * A new task must be about something that exists now; returns the words used
 * in the audit entry. (An existing task whose subject has since gone keeps
 * listing — `subjectLabel()` degrades to the bare kind.)
 */
function checkedSubjectForNewTask(
  tx: DbTx,
  kind: unknown,
  subjectId: number | null,
): string | null {
  if (!isTaskSubjectKind(kind)) {
    throw new InvalidTaskInputError('Choose what the task is about.');
  }
  if (kind === 'household') {
    if (subjectId !== null) {
      throw new InvalidTaskInputError('A household task is not about one record.');
    }
    return null;
  }
  if (subjectId === null || !Number.isInteger(subjectId) || subjectId <= 0) {
    throw new InvalidTaskInputError(`Choose which ${kind} the task is about.`);
  }
  if (kind === 'supplier') {
    const row = tx
      .select({ name: suppliers.name })
      .from(suppliers)
      .where(eq(suppliers.id, subjectId))
      .get();
    if (row === undefined) throw new InvalidTaskInputError('That supplier no longer exists.');
    return row.name;
  }
  if (kind === 'vehicle') {
    const row = tx
      .select({ label: vehicles.label })
      .from(vehicles)
      .where(eq(vehicles.id, subjectId))
      .get();
    if (row === undefined) throw new InvalidTaskInputError('That vehicle no longer exists.');
    return row.label;
  }
  const row = tx
    .select({ voidedAt: purchases.voidedAt, occurredDate: purchases.occurredDate })
    .from(purchases)
    .where(eq(purchases.id, subjectId))
    .get();
  if (row === undefined) throw new InvalidTaskInputError('That purchase no longer exists.');
  if (row.voidedAt !== null) {
    throw new InvalidTaskInputError(
      'That purchase has been voided, so there is nothing left to chase on it.',
    );
  }
  return `the purchase of ${row.occurredDate}`;
}

function checkedRelatedInteraction(
  tx: DbTx,
  interactionId: number | null,
  kind: TaskSubjectKind,
  subjectId: number | null,
): number | null {
  if (interactionId === null) return null;
  const row = tx
    .select({ supplierId: supplierInteractions.supplierId })
    .from(supplierInteractions)
    .where(eq(supplierInteractions.id, interactionId))
    .get();
  if (row === undefined || kind !== 'supplier' || row.supplierId !== subjectId) {
    throw new InvalidTaskInputError('That follow-up does not belong to this supplier.');
  }
  return interactionId;
}
