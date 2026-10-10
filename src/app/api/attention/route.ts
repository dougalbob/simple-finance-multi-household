import { desc, eq, inArray } from 'drizzle-orm';
import { householdContextFromHeaders } from '@/lib/auth/household-context';
import { loadAppConfig } from '@/lib/config';
import { auditEntries, tasks as tasksTable } from '@/lib/db/schema';
import { getKeyDateAlerts } from '@/lib/records/money-view';
import { listTasks } from '@/lib/records/tasks';
import { getNoticedItems, loadTaskViewContext, taskRowView } from '@/lib/records/tasks-view';
import { getBellSeenAt, setBellSeenAt } from '@/lib/records/bell-seen';
import { attentionView, isTaskRelevantToUser } from '@/lib/records/attention';
import { toLocalDateString } from '@/lib/time';
import { keyDateHref, keyDateMessage, keyDateStateWords } from '@/lib/records/keydates';
import { actorLabel } from '@/lib/records/tasks-view';
import { listPeople } from '@/lib/records/people';

export const dynamic = 'force-dynamic';

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * GET /api/attention — the bell's data (SPEC §26, decision 176).
 *
 * - 401 JSON when signed out.
 * - Returns counts and panel items, filtered by assigned_to (shared or
 *   assigned to me count in the bell; personal tasks for other user do not).
 * - The "since you last looked" list is derived from audit_entries.
 * - No-store, force-dynamic: the root layout persists across client
 *   navigation, so the client must refetch on mount, pathname change,
 *   visibilitychange and sf:tasks-changed.
 */
export async function GET(request: Request) {
  const config = loadAppConfig();
  let user;
  try {
    user = await householdContextFromHeaders(request.headers, config);
  } catch {
    return Response.json(
      { error: 'household_data_unavailable' },
      { status: 503, headers: { 'cache-control': 'private, no-store' } },
    );
  }
  if (user === null) {
    return Response.json(
      { error: 'unauthorised' },
      { status: 401, headers: { 'cache-control': 'private, no-store' } },
    );
  }

  const { db } = user;
  const now = new Date();
  const today = toLocalDateString(now);

  const openTasks = listTasks(db, { status: 'open' });
  const keyAlerts = getKeyDateAlerts(db, now);
  const noticed = getNoticedItems(db, now);

  // Audit rows for tasks: create, complete, reopen, newest first, limit 100
  const auditRows = db
    .select()
    .from(auditEntries)
    .where(eq(auditEntries.entity, 'task'))
    .orderBy(desc(auditEntries.createdAt), desc(auditEntries.id))
    .limit(100)
    .all()
    .filter((row) => ['task.create', 'task.complete', 'task.reopen'].includes(row.action));

  const seenAt = getBellSeenAt(db, user.email);

  const view = attentionView({
    tasks: openTasks,
    keyDateAlerts: keyAlerts,
    auditRows,
    me: user.email,
    seenAt,
    today,
    now,
  });

  // Build TaskRowViews for the filtered tasks
  const allRelevantTasksForView = [...view.needsAttentionTasks, ...view.comingUpTasks];
  // For display we need context for all relevant tasks
  const context = loadTaskViewContext(db, allRelevantTasksForView, today);

  const actorNames = new Map<string, string>();
  for (const person of listPeople(db)) {
    if (person.email !== null && person.email !== '') {
      actorNames.set(person.email.toLowerCase(), person.label);
    }
  }

  const needsAttentionTaskViews = view.needsAttentionTasks.map((t) => taskRowView(t, context));
  const comingUpTaskViews = view.comingUpTasks.map((t) => taskRowView(t, context));

  // For "since you last looked", we need task titles for display. Load tasks for those audit entityIds.
  const auditTaskIds = [
    ...new Set(
      view.newSinceLastSeen.map((r) => Number(r.entityId)).filter((n) => !Number.isNaN(n)),
    ),
  ];
  const auditTasks =
    auditTaskIds.length === 0
      ? []
      : db.select().from(tasksTable).where(inArray(tasksTable.id, auditTaskIds)).all();
  const auditTaskMap = new Map(auditTasks.map((t) => [t.id, t]));

  const newSinceLastSeenDisplay = view.newSinceLastSeen.map((row) => {
    const taskId = Number(row.entityId);
    const task = auditTaskMap.get(taskId);
    const title =
      task?.title ??
      (() => {
        try {
          const after = row.after ? JSON.parse(row.after) : null;
          return after?.title ?? `task ${taskId}`;
        } catch {
          return `task ${taskId}`;
        }
      })();
    const actor = actorLabel(row.actor, actorNames);
    let actionWord = 'changed';
    if (row.action === 'task.create') actionWord = 'added';
    else if (row.action === 'task.complete') actionWord = 'ticked';
    else if (row.action === 'task.reopen') actionWord = 'reopened';
    return {
      id: row.id,
      actor,
      actorEmail: row.actor,
      action: row.action,
      taskId,
      taskTitle: title,
      message: `${actor} ${actionWord} “${title}”`,
      createdAt: row.createdAt.toISOString(),
    };
  });

  // Filter newSinceLastSeen display by assignment relevance? We decided to show all, but we could filter to relevant tasks.
  // For now, include all, but also provide assignedTo info.
  // If you want to hide personal tasks of other user from my new list, uncomment filtering:
  // const filteredNew = newSinceLastSeenDisplay.filter((item) => {
  //   const task = auditTaskMap.get(item.taskId);
  //   if (!task) return true;
  //   return isTaskRelevantToUser(task, user.email);
  // });

  return Response.json(
    {
      counts: {
        needsAttention: view.counts.needsAttention,
        overdue: view.counts.overdue,
        today: view.counts.today,
        keyDateToday: view.counts.keyDateToday,
        keyDatePast: view.counts.keyDatePast,
        keyDateRolled: view.counts.keyDateRolled,
        comingUpTasks: view.counts.comingUpTasks,
        comingUpKeyDates: view.counts.comingUpKeyDates,
        noticed: noticed.length,
        newSinceLastSeen: view.counts.newSinceLastSeen,
      },
      accessibleName: view.accessibleName,
      newDotLabel: view.newDotLabel,
      needsAttention: {
        tasks: needsAttentionTaskViews,
        keyDates: view.needsAttentionKeyDates.map((alert) => ({
          id: alert.id,
          kind: alert.kind,
          label: alert.label,
          date: alert.date,
          daysUntil: alert.daysUntil,
          state: alert.state,
          message: keyDateMessage(alert),
          stateWords: keyDateStateWords(alert),
          href: keyDateHref(alert),
        })),
      },
      comingUp: {
        tasks: comingUpTaskViews,
        keyDates: view.comingUpKeyDates.map((alert) => ({
          id: alert.id,
          kind: alert.kind,
          label: alert.label,
          date: alert.date,
          daysUntil: alert.daysUntil,
          state: alert.state,
          message: keyDateMessage(alert),
          stateWords: keyDateStateWords(alert),
          href: keyDateHref(alert),
        })),
      },
      noticedCount: noticed.length,
      newSinceLastSeen: newSinceLastSeenDisplay,
    },
    { headers: { 'cache-control': 'private, no-store' } },
  );
}

/**
 * POST /api/attention/seen — mark bell as seen now (SPEC §26).
 * Fired when the panel is opened, after the GET has been used to compute
 * the "new" list, so the list stays visible while open.
 */
export async function POST(request: Request) {
  const config = loadAppConfig();
  let user;
  try {
    user = await householdContextFromHeaders(request.headers, config);
  } catch {
    return Response.json(
      { error: 'household_data_unavailable' },
      { status: 503, headers: { 'cache-control': 'private, no-store' } },
    );
  }
  if (user === null) {
    return Response.json(
      { error: 'unauthorised' },
      { status: 401, headers: { 'cache-control': 'private, no-store' } },
    );
  }
  setBellSeenAt(user.db, user.email, new Date());
  return Response.json({ ok: true }, { headers: { 'cache-control': 'private, no-store' } });
}
