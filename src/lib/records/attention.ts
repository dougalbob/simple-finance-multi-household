import { toLocalDateString } from '../time';
import { daysBetween } from './dates';
import type { KeyDateAlert } from './keydates';
import type { Task, TaskDueState } from './tasks';
import { taskDue } from './tasks';
import type { AuditEntry } from '../audit';

/**
 * Bell / attention view (SPEC §26, decision 176): what needs attention now,
 * what is coming up, and what the other person did since you last looked.
 *
 * Pure: no DB, no side effects, fully unit-testable. The route is a thin
 * wrapper that loads tasks, key-date alerts, audit rows and the seen_at
 * timestamp, then calls this.
 */

export interface AttentionViewInput {
  /** Open tasks (status=open). */
  tasks: readonly Task[];
  /** Key-date alerts from getKeyDateAlerts (today, in-window, rolled, past). */
  keyDateAlerts: readonly KeyDateAlert[];
  /** Audit rows where entity='task' and action in create/complete/reopen, newest first. */
  auditRows: readonly AuditEntry[];
  /** Current user's email, lower-cased for comparison. */
  me: string;
  /** When this person last opened the bell, or null if never. */
  seenAt: Date | null;
  /** Today as 'YYYY-MM-DD' local. */
  today: string;
  /** Now, for the 7-day look-back when there is no seen row. */
  now: Date;
}

export interface AttentionTaskRef {
  id: number;
  title: string;
  dueDate: string | null;
  assignedTo: string | null;
}

export interface AttentionCounts {
  /** Total that needs attention now (tasks overdue/today relevant to me + key dates today/past/rolled). */
  needsAttention: number;
  overdue: number;
  today: number;
  keyDateToday: number;
  keyDatePast: number;
  keyDateRolled: number;
  /** Tasks and key dates coming up (not counted). */
  comingUpTasks: number;
  comingUpKeyDates: number;
  /** How many things the app has noticed (derived items count, passed in separately). */
  // noticed is handled outside this pure function, but we keep count for completeness
  /** New activity by other person since last seen. */
  newSinceLastSeen: number;
}

export interface AttentionView {
  counts: AttentionCounts;
  /** Tasks that need attention now (overdue or today, relevant to me). */
  needsAttentionTasks: Task[];
  /** Key dates that need attention now (today, past, rolled). */
  needsAttentionKeyDates: KeyDateAlert[];
  /** Tasks due in next 7 days (upcoming, 1..7, relevant to me). */
  comingUpTasks: Task[];
  /** Key dates in-window (listed but not counted). */
  comingUpKeyDates: KeyDateAlert[];
  /** Audit rows that are new since last seen, filtered and capped at 20. */
  newSinceLastSeen: AuditEntry[];
  /** Accessible name for the bell button. */
  accessibleName: string;
  /** Words for the new dot, or null if none. */
  newDotLabel: string | null;
}

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isTaskRelevantToUser(task: { assignedTo: string | null }, me: string): boolean {
  const assigned = task.assignedTo;
  if (assigned === null || assigned.trim() === '') return true;
  return normalizedEmail(assigned) === normalizedEmail(me);
}

function taskDueState(task: { dueDate: string | null }, today: string): TaskDueState {
  return taskDue(task.dueDate, today).state;
}

export function attentionView(input: AttentionViewInput): AttentionView {
  const meNorm = normalizedEmail(input.me);
  const today = input.today;
  const now = input.now;

  // Filter tasks relevant to me (shared or assigned to me)
  const relevantTasks = input.tasks.filter((task) => isTaskRelevantToUser(task, meNorm));

  const needsAttentionTasks: Task[] = [];
  const comingUpTasks: Task[] = [];

  let overdue = 0;
  let todayCount = 0;

  for (const task of relevantTasks) {
    const due = taskDue(task.dueDate, today);
    if (due.state === 'overdue') {
      needsAttentionTasks.push(task);
      overdue += 1;
    } else if (due.state === 'today') {
      needsAttentionTasks.push(task);
      todayCount += 1;
    } else if (due.state === 'upcoming' && due.days !== null && due.days >= 1 && due.days <= 7) {
      comingUpTasks.push(task);
    }
  }

  // Key dates: split by state
  const needsAttentionKeyDates: KeyDateAlert[] = [];
  const comingUpKeyDates: KeyDateAlert[] = [];
  let keyDateToday = 0;
  let keyDatePast = 0;
  let keyDateRolled = 0;

  for (const alert of input.keyDateAlerts) {
    if (alert.state === 'today') {
      needsAttentionKeyDates.push(alert);
      keyDateToday += 1;
    } else if (alert.state === 'past') {
      needsAttentionKeyDates.push(alert);
      keyDatePast += 1;
    } else if (alert.state === 'rolled-awaiting-review') {
      needsAttentionKeyDates.push(alert);
      keyDateRolled += 1;
    } else if (alert.state === 'in-window') {
      comingUpKeyDates.push(alert);
    }
  }

  // Sort needs attention tasks: overdue longest first, then today, then by id
  needsAttentionTasks.sort((a, b) => {
    const dueA = taskDue(a.dueDate, today);
    const dueB = taskDue(b.dueDate, today);
    if (dueA.state !== dueB.state) {
      // overdue before today
      return dueA.state === 'overdue' ? -1 : 1;
    }
    if (dueA.days !== null && dueB.days !== null && dueA.days !== dueB.days) {
      return dueA.days - dueB.days;
    }
    return a.id - b.id;
  });

  comingUpTasks.sort((a, b) => {
    const dueA = taskDue(a.dueDate, today);
    const dueB = taskDue(b.dueDate, today);
    if (dueA.days !== null && dueB.days !== null && dueA.days !== dueB.days) {
      return dueA.days - dueB.days;
    }
    return a.id - b.id;
  });

  needsAttentionKeyDates.sort((a, b) => a.date.localeCompare(b.date));
  comingUpKeyDates.sort((a, b) => a.date.localeCompare(b.date));

  const needsAttention = needsAttentionTasks.length + needsAttentionKeyDates.length;

  // New since last looked: audit rows where actor != me, actor != system, createdAt > seenAt (or > now-7d if no seenAt)
  const seenCutoff = input.seenAt ?? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  // If there is no seen row, we already limited to 7 days via seenCutoff, but also ensure we don't go further than 7 days
  // (the cutoff is now-7d). If there is a seen row, use it directly.

  const filteredAudit: AuditEntry[] = [];
  for (const row of input.auditRows) {
    const actorNorm = normalizedEmail(row.actor);
    if (actorNorm === '') continue;
    if (actorNorm === 'system') continue;
    if (actorNorm === meNorm) continue;
    if (row.createdAt < seenCutoff) continue;
    // Only create, complete, reopen — but caller should already filter, we double-check
    if (!['task.create', 'task.complete', 'task.reopen'].includes(row.action)) continue;
    filteredAudit.push(row);
    if (filteredAudit.length >= 20) break;
  }

  const newSinceLastSeen = filteredAudit.length;

  // Accessible name
  let accessibleName: string;
  if (needsAttention === 0) {
    accessibleName = 'Nothing needs attention';
  } else {
    const parts: string[] = [];
    if (overdue > 0) parts.push(`${overdue} overdue`);
    if (todayCount > 0) parts.push(`${todayCount} due today`);
    if (keyDateToday > 0)
      parts.push(`${keyDateToday} key date${keyDateToday === 1 ? '' : 's'} today`);
    if (keyDatePast > 0) parts.push(`${keyDatePast} past due`);
    if (keyDateRolled > 0) parts.push(`${keyDateRolled} awaiting review`);
    // If only tasks, the breakdown is already overdue/today; if only key dates, show their breakdown
    // If mixed, show all parts
    const breakdown = parts.length > 0 ? ` — ${parts.join(', ')}` : '';
    accessibleName = `Needs attention: ${needsAttention}${breakdown}`;
  }

  let newDotLabel: string | null = null;
  if (newSinceLastSeen > 0) {
    newDotLabel = `${newSinceLastSeen} new since you last looked`;
    accessibleName += ` — ${newDotLabel}`;
  }

  return {
    counts: {
      needsAttention,
      overdue,
      today: todayCount,
      keyDateToday,
      keyDatePast,
      keyDateRolled,
      comingUpTasks: comingUpTasks.length,
      comingUpKeyDates: comingUpKeyDates.length,
      newSinceLastSeen,
    },
    needsAttentionTasks,
    needsAttentionKeyDates,
    comingUpTasks,
    comingUpKeyDates,
    newSinceLastSeen: filteredAudit,
    accessibleName,
    newDotLabel,
  };
}
