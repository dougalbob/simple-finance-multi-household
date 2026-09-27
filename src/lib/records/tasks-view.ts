import { eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client';
import { purchases, suppliers as suppliersTable } from '../db/schema';
import { formatPence } from '../money';
import { formatShortLocalDateWithYear, startOfLocalDate, toLocalDateString } from '../time';
import { addDaysLocal } from './dates';
import { getFuelCategoryId, getFuelEconomyView } from './fuel';
import { keyDateHref, keyDateMessage, keyDateStateWords } from './keydates';
import { getKeyDateAlerts } from './money-view';
import { listPeople } from './people';
import { supplierCardHref } from './supplier-focus';
import { listSuppliers } from './suppliers';
import { subjectLabel, type SubjectNames } from './targets';
import {
  countOpenTasks,
  groupTasksByDue,
  listTasks,
  taskDue,
  type Task,
  type TaskDue,
  type TaskGroups,
} from './tasks';
import { listVehicles } from './vehicles';

/**
 * Tasks as the pages show them (SPEC §25): each row with its subject in
 * words, a deep link to that subject, its due state in words, and who did
 * what. Kept apart from `tasks.ts` so the write path (which
 * `addSupplierInteraction` imports) never drags in the key-date and fuel
 * engines this module reads for "The app has noticed".
 */

/** One task, ready to render. Plain data: safe to hand to a client component. */
export interface TaskRowView {
  id: number;
  version: number;
  title: string;
  detail: string | null;
  dueDate: string | null;
  /** "Sun 1 Nov" (with the year when it is not this year), or null when undated. */
  dueDateLabel: string | null;
  due: TaskDue;
  subjectKind: string;
  subjectId: number | null;
  /** `EnergyCo`, `Vehicle A`, `£84.20 at EnergyCo on Tue 1 Sept`, `household`. */
  subjectLabel: string;
  /** Where the subject lives — null for the household. */
  subjectHref: string | null;
  /** Set when the subject has changed since the task was written, e.g. 'voided'. */
  subjectNote: string | null;
  /** The person's name when their sign-in email is linked, else the email. */
  createdBy: string;
  createdOnLabel: string;
  /** True when a logged supplier interaction created this task. */
  fromInteraction: boolean;
  completedOnLabel: string | null;
  completedBy: string | null;
  completionNote: string | null;
}

export interface TaskViewContext {
  today: string;
  names: SubjectNames;
  purchaseFacts: ReadonlyMap<number, { occurredDate: string; voided: boolean }>;
  actorNames: ReadonlyMap<string, string>;
}

/** "£84.20 at EnergyCo on Tue 1 Sept" — the words a purchase task is about. */
export function purchaseSubjectName(
  purchase: { totalPence: number; occurredDate: string; supplierName: string | null },
  today: string,
): string {
  const when = formatShortLocalDateWithYear(purchase.occurredDate, today);
  const amount = formatPence(purchase.totalPence);
  return purchase.supplierName === null
    ? `${amount} on ${when}`
    : `${amount} at ${purchase.supplierName} on ${when}`;
}

/**
 * Everything needed to put words and links on a set of tasks, in a handful of
 * queries however many tasks there are.
 */
export function loadTaskViewContext(
  db: Db,
  taskList: readonly Pick<Task, 'subjectKind' | 'subjectId'>[],
  today: string,
): TaskViewContext {
  const purchaseIds = [
    ...new Set(
      taskList.flatMap((task) =>
        task.subjectKind === 'purchase' && task.subjectId !== null ? [task.subjectId] : [],
      ),
    ),
  ];
  const purchaseRows =
    purchaseIds.length === 0
      ? []
      : db
          .select({
            id: purchases.id,
            totalPence: purchases.totalPence,
            occurredDate: purchases.occurredDate,
            voidedAt: purchases.voidedAt,
            supplierName: suppliersTable.name,
          })
          .from(purchases)
          .leftJoin(suppliersTable, eq(suppliersTable.id, purchases.supplierId))
          .where(inArray(purchases.id, purchaseIds))
          .all();
  const livePurchases = new Map<number, string>();
  const purchaseFacts = new Map<number, { occurredDate: string; voided: boolean }>();
  for (const row of purchaseRows) {
    purchaseFacts.set(row.id, { occurredDate: row.occurredDate, voided: row.voidedAt !== null });
    // A voided purchase is left out of the names on purpose: its tasks read
    // "purchase", the bare kind (decision 175).
    if (row.voidedAt === null) livePurchases.set(row.id, purchaseSubjectName(row, today));
  }
  const actorNames = new Map<string, string>();
  for (const person of listPeople(db)) {
    if (person.email !== null && person.email !== '') {
      actorNames.set(person.email.toLowerCase(), person.label);
    }
  }
  return {
    today,
    names: {
      suppliers: new Map(listSuppliers(db).map((supplier) => [supplier.id, supplier.name])),
      vehicles: new Map(listVehicles(db).map((vehicle) => [vehicle.id, vehicle.label])),
      purchases: livePurchases,
    },
    purchaseFacts,
    actorNames,
  };
}

/** `/purchases?from=…&to=…#purchase-17` — filtered to its day, so the row is on the page. */
export function purchaseRowHref(
  purchaseId: number,
  facts: { occurredDate: string; voided: boolean } | undefined,
): string {
  if (facts === undefined) return `/purchases#purchase-${purchaseId}`;
  const query = new URLSearchParams({ from: facts.occurredDate, to: facts.occurredDate });
  if (facts.voided) query.set('voidedOnly', '1');
  return `/purchases?${query.toString()}#purchase-${purchaseId}`;
}

/**
 * The deep link for a task's subject. Suppliers go through
 * `supplierCardHref()` — the one place a supplier card link is built.
 */
export function taskSubjectHref(
  subject: Pick<Task, 'subjectKind' | 'subjectId'>,
  context: Pick<TaskViewContext, 'purchaseFacts'>,
): string | null {
  const id = subject.subjectId;
  if (id === null) return null;
  switch (subject.subjectKind) {
    case 'supplier':
      return supplierCardHref(id);
    case 'purchase':
      return purchaseRowHref(id, context.purchaseFacts.get(id));
    case 'vehicle':
      return `/insights#vehicle-${id}`;
    default:
      return null;
  }
}

export function actorLabel(actor: string, actorNames: ReadonlyMap<string, string>): string {
  return actorNames.get(actor.trim().toLowerCase()) ?? actor;
}

export function taskRowView(task: Task, context: TaskViewContext): TaskRowView {
  const { today } = context;
  const facts =
    task.subjectKind === 'purchase' && task.subjectId !== null
      ? context.purchaseFacts.get(task.subjectId)
      : undefined;
  return {
    id: task.id,
    version: task.version,
    title: task.title,
    detail: task.detail,
    dueDate: task.dueDate,
    dueDateLabel: task.dueDate === null ? null : formatShortLocalDateWithYear(task.dueDate, today),
    due: taskDue(task.dueDate, today),
    subjectKind: task.subjectKind,
    subjectId: task.subjectId,
    subjectLabel: subjectLabel(task, context.names),
    subjectHref: taskSubjectHref(task, context),
    subjectNote: facts?.voided === true ? 'voided' : null,
    createdBy: actorLabel(task.createdBy, context.actorNames),
    createdOnLabel: formatShortLocalDateWithYear(toLocalDateString(task.createdAt), today),
    fromInteraction: task.relatedInteractionId !== null,
    completedOnLabel:
      task.completedAt === null
        ? null
        : formatShortLocalDateWithYear(toLocalDateString(task.completedAt), today),
    completedBy:
      task.completedBy === null ? null : actorLabel(task.completedBy, context.actorNames),
    completionNote: task.completionNote,
  };
}

// ---------------------------------------------------------------------------
// "The app has noticed" (SPEC §25.4): derived, links only, never ticked
// ---------------------------------------------------------------------------

export interface NoticedItem {
  key: string;
  source: 'key-date' | 'fuel-missing' | 'fuel-full-tank';
  /** The sentence, state included ("… renews in 12 days"). */
  message: string;
  /** The state as a word or two, printed beside it — never colour alone. */
  stateWords: string;
  href: string;
  linkLabel: string;
}

const MISSING_WORDS: Record<'odometer' | 'litres', string> = {
  odometer: 'the mileage',
  litres: 'the litres',
};

/**
 * Things the household has not written down as a task but the app can see
 * need attention: key dates inside their warning window, recent fuel fills
 * missing details, and a run of fills with no full tank marked. Each one goes
 * away by fixing the thing itself — there is nothing to tick.
 */
export function getNoticedItems(db: Db, now: Date): NoticedItem[] {
  const today = toLocalDateString(now);
  const items: NoticedItem[] = [];
  for (const alert of getKeyDateAlerts(db, now)) {
    items.push({
      key: `key-date-${alert.kind}-${alert.id}`,
      source: 'key-date',
      message: keyDateMessage(alert),
      stateWords: keyDateStateWords(alert),
      href: keyDateHref(alert),
      linkLabel:
        alert.kind === 'renewal'
          ? 'Open the renewal'
          : alert.kind === 'contract-end'
            ? 'Open the schedule'
            : 'Open the card',
    });
  }
  const fuelCategoryId = getFuelCategoryId(db);
  for (const vehicle of getFuelEconomyView(db, now)) {
    for (const entry of vehicle.missing) {
      items.push({
        key: `fuel-missing-${entry.purchaseId}`,
        source: 'fuel-missing',
        message:
          `${vehicle.label}: the ${formatPence(entry.fuelPence)} fuel fill on ` +
          `${formatShortLocalDateWithYear(entry.occurredDate, today)} is missing ` +
          entry.missing.map((word) => MISSING_WORDS[word]).join(' and '),
        stateWords: 'Missing details',
        href: purchaseRowHref(entry.purchaseId, {
          occurredDate: entry.occurredDate,
          voided: false,
        }),
        linkLabel: 'Add them on the purchase',
      });
    }
    if (vehicle.fillsWithoutFullTank !== null) {
      const query = new URLSearchParams({
        targetKind: 'vehicle',
        targetId: String(vehicle.vehicleId),
      });
      if (fuelCategoryId !== null) query.set('categoryId', String(fuelCategoryId));
      items.push({
        key: `fuel-full-tank-${vehicle.vehicleId}`,
        source: 'fuel-full-tank',
        message:
          `${vehicle.label}: no full tank marked in the last ${vehicle.fillsWithoutFullTank} ` +
          'fills — mpg needs one. Tick “Filled to full” next time, or fix a past fill.',
        stateWords: 'No full tank',
        href: `/purchases?${query.toString()}`,
        linkLabel: 'See the fills',
      });
    }
  }
  return items;
}

// ---------------------------------------------------------------------------
// Page views
// ---------------------------------------------------------------------------

/** How far back the "Done recently" list reaches, so a mis-tick can be undone. */
export const TASKS_DONE_RECENTLY_DAYS = 30;

export interface SubjectOption {
  value: string;
  label: string;
}

export interface TasksPageView {
  today: string;
  open: TaskGroups<TaskRowView>;
  openCount: number;
  overdueCount: number;
  doneRecently: TaskRowView[];
  noticed: NoticedItem[];
  /** The "About" choices for a new task: the household, then suppliers and vehicles. */
  subjectOptions: { suppliers: SubjectOption[]; vehicles: SubjectOption[] };
}

export function getTasksPageView(db: Db, now: Date = new Date()): TasksPageView {
  const today = toLocalDateString(now);
  const open = listTasks(db, { status: 'open' });
  const done = listTasks(db, {
    status: 'done',
    completedSince: startOfLocalDate(addDaysLocal(today, -TASKS_DONE_RECENTLY_DAYS)),
    limit: 50,
  });
  const context = loadTaskViewContext(db, [...open, ...done], today);
  const counts = countOpenTasks(open, today);
  return {
    today,
    open: groupTasksByDue(
      open.map((task) => taskRowView(task, context)),
      today,
    ),
    openCount: counts.open,
    overdueCount: counts.overdue,
    doneRecently: done.map((task) => taskRowView(task, context)),
    noticed: getNoticedItems(db, now),
    subjectOptions: {
      suppliers: [...context.names.suppliers].map(([id, name]) => ({
        value: `supplier:${id}`,
        label: name,
      })),
      vehicles: [...context.names.vehicles].map(([id, label]) => ({
        value: `vehicle:${id}`,
        label,
      })),
    },
  };
}

export interface SubjectTasksView {
  open: TaskRowView[];
  doneRecently: TaskRowView[];
  openCount: number;
  overdueCount: number;
}

/**
 * Every subject's tasks of one kind at once — the Suppliers page builds all
 * its cards in one request, and the Purchases page all its rows.
 */
export function getTasksBySubject(
  db: Db,
  subjectKind: 'supplier' | 'purchase' | 'vehicle',
  now: Date = new Date(),
): Map<number, SubjectTasksView> {
  const today = toLocalDateString(now);
  const open = listTasks(db, { status: 'open', subjectKind });
  const done = listTasks(db, {
    status: 'done',
    subjectKind,
    completedSince: startOfLocalDate(addDaysLocal(today, -TASKS_DONE_RECENTLY_DAYS)),
    limit: 200,
  });
  const context = loadTaskViewContext(db, [...open, ...done], today);
  const bySubject = new Map<number, SubjectTasksView>();
  const entry = (id: number): SubjectTasksView => {
    let view = bySubject.get(id);
    if (view === undefined) {
      view = { open: [], doneRecently: [], openCount: 0, overdueCount: 0 };
      bySubject.set(id, view);
    }
    return view;
  };
  const openGroups = groupTasksByDue(open, today);
  for (const task of [
    ...openGroups.overdue,
    ...openGroups.today,
    ...openGroups.upcoming,
    ...openGroups.undated,
  ]) {
    if (task.subjectId === null) continue;
    const view = entry(task.subjectId);
    view.open.push(taskRowView(task, context));
    view.openCount += 1;
    if (taskDue(task.dueDate, today).state === 'overdue') view.overdueCount += 1;
  }
  for (const task of done) {
    if (task.subjectId === null) continue;
    entry(task.subjectId).doneRecently.push(taskRowView(task, context));
  }
  return bySubject;
}

/**
 * Every open task about a supplier, overdue first — the Contracts & Renewals
 * "Follow-ups you promised" list. Until v0.25.0 this was the interaction
 * log's follow-up dates filtered to `>= today`, so a promise disappeared the
 * day after it fell due; now an overdue one leads the list.
 */
export function getOpenSupplierTaskRows(db: Db, now: Date = new Date()): TaskRowView[] {
  const today = toLocalDateString(now);
  const open = listTasks(db, { status: 'open', subjectKind: 'supplier' });
  const context = loadTaskViewContext(db, open, today);
  const groups = groupTasksByDue(open, today);
  return [...groups.overdue, ...groups.today, ...groups.upcoming, ...groups.undated].map((task) =>
    taskRowView(task, context),
  );
}
