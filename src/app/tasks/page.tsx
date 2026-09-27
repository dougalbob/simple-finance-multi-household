import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DoneTaskList, OpenTaskList, TaskCreateForm } from '@/components/task-forms';
import { currentUserFromRequest } from '@/lib/auth/next';
import { getDbHandle } from '@/lib/db/client';
import {
  getTasksPageView,
  TASKS_DONE_RECENTLY_DAYS,
  type NoticedItem,
  type TaskRowView,
} from '@/lib/records/tasks-view';

export const dynamic = 'force-dynamic';

/**
 * Tasks (SPEC §25, decision 175): everything the household has said it will
 * do, overdue first, and — kept visibly apart — what the app has worked out
 * needs a look. Your tasks carry a checkbox; the app's items do not, because
 * they go away by fixing the thing itself (adding the litres, reviewing the
 * renewal). Nothing on this page sends an email, a push or a browser
 * notification (decision 19).
 */
export default async function TasksPage() {
  const user = await currentUserFromRequest();
  if (user === null) redirect('/unauthorized');

  const { db } = getDbHandle();
  const view = getTasksPageView(db, new Date());
  const groups: Array<{ id: string; title: string; tasks: TaskRowView[] }> = [
    { id: 'overdue', title: 'Overdue', tasks: view.open.overdue },
    { id: 'today', title: 'Due today', tasks: view.open.today },
    { id: 'upcoming', title: 'Coming up', tasks: view.open.upcoming },
    { id: 'undated', title: 'No due date', tasks: view.open.undated },
  ];

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Plan ahead</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Tasks</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-soft">
          What we have said we will do, and what the app has noticed needs a look. An overdue task
          stays at the top until one of us ticks it. Everything here is in the app only — nothing is
          emailed, pushed or sent.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section
          aria-labelledby="your-tasks-heading"
          className="rounded-xl border border-border bg-surface p-5 shadow-sm"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="your-tasks-heading" className="text-lg font-semibold">
              Your tasks
            </h2>
            <p className="text-sm text-ink-soft">
              {view.openCount === 0
                ? 'Nothing open'
                : `${view.openCount} open${view.overdueCount > 0 ? ` · ${view.overdueCount} overdue` : ''}`}
            </p>
          </div>

          <div className="mt-3 rounded-lg border border-border-hairline bg-canvas p-3">
            <h3 className="mb-2 text-sm font-semibold text-ink-body">Add a task</h3>
            <TaskCreateForm idPrefix="tasks-new" choices={view.subjectOptions} />
            <p className="mt-2 text-xs text-ink-muted">
              A follow-up promised on a call is added from the supplier card&apos;s interaction log,
              and a task about a purchase (“Chase the refund”) from its row on{' '}
              <Link className="text-accent hover:underline" href="/purchases">
                Purchases
              </Link>
              .
            </p>
          </div>

          {view.openCount === 0 ? (
            <p className="mt-4 text-sm text-ink-muted">
              No open tasks. Add one above, or log a follow-up date on a{' '}
              <Link className="text-accent hover:underline" href="/suppliers">
                supplier card
              </Link>
              .
            </p>
          ) : (
            groups
              .filter((group) => group.tasks.length > 0)
              .map((group) => (
                <section
                  key={group.id}
                  aria-labelledby={`tasks-${group.id}-heading`}
                  className="mt-5"
                >
                  <h3
                    id={`tasks-${group.id}-heading`}
                    className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted"
                  >
                    {group.title} ({group.tasks.length})
                  </h3>
                  <OpenTaskList tasks={group.tasks} />
                </section>
              ))
          )}

          <details className="mt-6">
            <summary className="cursor-pointer text-sm font-medium text-ink-soft hover:text-ink">
              Done in the last {TASKS_DONE_RECENTLY_DAYS} days ({view.doneRecently.length})
            </summary>
            <div className="mt-2">
              {view.doneRecently.length === 0 ? (
                <p className="text-sm text-ink-muted">Nothing closed recently.</p>
              ) : (
                <DoneTaskList tasks={view.doneRecently} />
              )}
            </div>
          </details>
        </section>

        <section
          aria-labelledby="noticed-heading"
          className="self-start rounded-xl border border-border bg-surface p-5 shadow-sm"
        >
          <h2 id="noticed-heading" className="text-lg font-semibold">
            The app has noticed
          </h2>
          <p className="mt-1 text-xs text-ink-muted">
            Worked out from the records, so there is nothing to tick: each item goes away when the
            thing itself is dealt with — a renewal reviewed, a fill&apos;s litres added.
          </p>
          {view.noticed.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">Nothing needs a look right now.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border-hairline">
              {view.noticed.map((item) => (
                <NoticedRow key={item.key} item={item} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function NoticedRow({ item }: { item: NoticedItem }) {
  return (
    <li className="py-2 text-sm">
      <span className="mr-2 inline-flex rounded-full border border-border bg-surface-muted px-2 py-0.5 text-xs font-semibold text-ink-body">
        {item.stateWords}
      </span>
      <span className="text-ink-body">{item.message}</span>{' '}
      <Link href={item.href} className="whitespace-nowrap text-accent hover:underline">
        {item.linkLabel} →
      </Link>
    </li>
  );
}
