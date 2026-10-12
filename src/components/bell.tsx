'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TaskCheckbox, TaskDueBadge } from '@/components/task-forms';
import type { TaskRowView } from '@/lib/records/tasks-view';

type KeyDateView = {
  id: number;
  kind: string;
  label: string;
  date: string;
  daysUntil: number;
  state: string;
  message: string;
  stateWords: string;
  href: string;
};

type NewSinceView = {
  id: number;
  actor: string;
  actorEmail: string;
  action: string;
  taskId: number;
  taskTitle: string;
  message: string;
  createdAt: string;
};

type AttentionResponse = {
  counts: {
    needsAttention: number;
    overdue: number;
    today: number;
    keyDateToday: number;
    keyDatePast: number;
    keyDateRolled: number;
    comingUpTasks: number;
    comingUpKeyDates: number;
    noticed: number;
    newSinceLastSeen: number;
  };
  accessibleName: string;
  newDotLabel: string | null;
  needsAttention: {
    tasks: TaskRowView[];
    keyDates: KeyDateView[];
  };
  comingUp: {
    tasks: TaskRowView[];
    keyDates: KeyDateView[];
  };
  noticedCount: number;
  newSinceLastSeen: NewSinceView[];
};

function BellIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth="2"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
      />
    </svg>
  );
}

export function Bell() {
  const pathname = usePathname();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<AttentionResponse | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchAttention = useCallback(async () => {
    try {
      const res = await fetch('/api/attention', { cache: 'no-store' });
      if (res.status === 401) {
        setHidden(true);
        setData(null);
        return;
      }
      if (!res.ok) {
        // Keep previous data on error, don't hide
        return;
      }
      const json = (await res.json()) as AttentionResponse;
      setData(json);
      setHidden(false);
    } catch {
      // Network error: keep previous data
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch and on pathname change
  useEffect(() => {
    if (pathname === '/unauthorized') {
      setHidden(true);
      return;
    }
    setHidden(false);
    fetchAttention();
  }, [pathname, fetchAttention]);

  // Visibility change
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchAttention();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [fetchAttention]);

  // Custom event from task forms
  useEffect(() => {
    const handleTasksChanged = () => {
      fetchAttention();
    };
    window.addEventListener('sf:tasks-changed', handleTasksChanged as EventListener);
    return () =>
      window.removeEventListener('sf:tasks-changed', handleTasksChanged as EventListener);
  }, [fetchAttention]);

  // Gentle refresh every 5 minutes while visible
  useEffect(() => {
    const id = setInterval(
      () => {
        if (document.visibilityState === 'visible') {
          fetchAttention();
        }
      },
      5 * 60 * 1000,
    );
    return () => clearInterval(id);
  }, [fetchAttention]);

  // Close on Escape and return focus
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        panelRef.current &&
        !panelRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen]);

  const handleToggle = useCallback(async () => {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (nextOpen) {
      // Mark seen after opening, but keep current new list visible while open
      // Fire and forget, but don't clear data
      try {
        await fetch('/api/attention/seen', { method: 'POST', cache: 'no-store' });
      } catch {
        // ignore
      }
    }
  }, [isOpen]);

  if (hidden) return null;
  if (pathname === '/unauthorized') return null;

  const needsAttentionCount = data?.counts.needsAttention ?? 0;
  const newCount = data?.counts.newSinceLastSeen ?? 0;
  const accessibleName =
    data?.accessibleName ?? (loading ? 'Loading attention' : 'Nothing needs attention');

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={accessibleName}
        aria-expanded={isOpen}
        aria-controls="bell-panel"
        onClick={handleToggle}
        className="relative flex h-10 w-10 items-center justify-center rounded-lg text-ink-body hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
      >
        <BellIcon className="h-6 w-6" />
        {needsAttentionCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-xs font-bold text-fill-ink">
            {needsAttentionCount > 99 ? '99+' : needsAttentionCount}
          </span>
        ) : null}
        {newCount > 0 ? (
          <span
            className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-surface"
            aria-hidden="true"
          />
        ) : null}
      </button>

      {isOpen ? (
        <div
          id="bell-panel"
          ref={panelRef}
          className="fixed left-0 right-0 top-14 z-40 max-h-[calc(100vh-3.5rem)] overflow-y-auto border-t border-border bg-surface shadow-xl lg:absolute lg:left-auto lg:right-0 lg:top-full lg:mt-2 lg:max-h-[80vh] lg:w-[28rem] lg:max-w-[90vw] lg:rounded-xl lg:border"
        >
          <div className="p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Needs attention</h2>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  buttonRef.current?.focus();
                }}
                className="rounded p-1 text-ink-muted hover:bg-surface-muted hover:text-ink"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {newCount > 0 && data?.newSinceLastSeen ? (
              <section aria-labelledby="bell-new-heading" className="mt-3">
                <h3
                  id="bell-new-heading"
                  className="text-xs font-semibold uppercase tracking-wide text-ink-muted"
                >
                  New since you last looked ({newCount})
                </h3>
                <ul className="mt-1 space-y-1">
                  {data.newSinceLastSeen.map((item) => (
                    <li key={item.id} className="text-sm text-ink-body">
                      {item.message}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section aria-labelledby="bell-needs-heading" className="mt-4">
              <h3
                id="bell-needs-heading"
                className="text-xs font-semibold uppercase tracking-wide text-ink-muted"
              >
                Needs attention now {needsAttentionCount > 0 ? `(${needsAttentionCount})` : ''}
              </h3>
              {needsAttentionCount === 0 ? (
                <p className="mt-1 text-sm text-ink-muted">Nothing needs attention right now.</p>
              ) : (
                <div className="mt-2 space-y-3">
                  {data?.needsAttention.tasks.length ? (
                    <ul className="space-y-2">
                      {data.needsAttention.tasks.map((task) => (
                        <li
                          key={`need-task-${task.id}`}
                          className="rounded-lg border border-border-hairline bg-canvas p-2"
                        >
                          <div className="flex items-start gap-2">
                            <TaskCheckbox task={task} />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                <span className="text-sm font-medium text-ink">{task.title}</span>
                                <TaskDueBadge task={task} />
                              </div>
                              <p className="mt-0.5 text-xs text-ink-soft">
                                About:{' '}
                                {task.subjectHref ? (
                                  <Link href={task.subjectHref} className="sf-link">
                                    {task.subjectLabel}
                                  </Link>
                                ) : (
                                  task.subjectLabel
                                )}
                                {task.assignedToLabel ? ` · ${task.assignedToLabel}` : ''}
                              </p>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {data?.needsAttention.keyDates.length ? (
                    <ul className="space-y-1">
                      {data.needsAttention.keyDates.map((kd) => (
                        <li key={`need-kd-${kd.kind}-${kd.id}`} className="text-sm">
                          <span className="mr-2 inline-flex rounded-full border border-border bg-surface-muted px-2 py-0.5 text-xs font-semibold text-ink-body">
                            {kd.stateWords}
                          </span>
                          <span className="text-ink-body">{kd.message}</span>{' '}
                          <Link href={kd.href} className="whitespace-nowrap sf-link-arrow">
                            Open →
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              )}
            </section>

            <section aria-labelledby="bell-coming-heading" className="mt-5">
              <h3
                id="bell-coming-heading"
                className="text-xs font-semibold uppercase tracking-wide text-ink-muted"
              >
                Coming up in the next 7 days
              </h3>
              {!data ||
              (data.comingUp.tasks.length === 0 && data.comingUp.keyDates.length === 0) ? (
                <p className="mt-1 text-sm text-ink-muted">Nothing coming up in the next 7 days.</p>
              ) : (
                <div className="mt-2 space-y-3">
                  {data.comingUp.tasks.length ? (
                    <ul className="space-y-1.5">
                      {data.comingUp.tasks.map((task) => (
                        <li
                          key={`up-task-${task.id}`}
                          className="flex flex-wrap items-baseline gap-x-2 text-sm"
                        >
                          <span className="font-medium text-ink">{task.title}</span>
                          <TaskDueBadge task={task} />
                          <span className="text-xs text-ink-soft">
                            {task.subjectHref ? (
                              <Link href={task.subjectHref} className="sf-link">
                                {task.subjectLabel}
                              </Link>
                            ) : (
                              task.subjectLabel
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {data.comingUp.keyDates.length ? (
                    <ul className="space-y-1">
                      {data.comingUp.keyDates.map((kd) => (
                        <li key={`up-kd-${kd.kind}-${kd.id}`} className="text-sm">
                          <span className="mr-2 inline-flex rounded-full border border-border bg-surface-muted px-2 py-0.5 text-xs font-semibold text-ink-body">
                            {kd.stateWords}
                          </span>
                          <span className="text-ink-body">{kd.message}</span>{' '}
                          <Link href={kd.href} className="whitespace-nowrap sf-link-arrow">
                            Open →
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              )}
            </section>

            <section className="mt-5 border-t border-border-hairline pt-3 text-sm">
              <Link
                href="/tasks#noticed-heading"
                className="sf-link-arrow"
                onClick={() => setIsOpen(false)}
              >
                {data?.noticedCount ?? 0} things the app has noticed →
              </Link>
              <span className="mx-2 text-ink-faint">·</span>
              <Link href="/tasks" className="sf-link-arrow" onClick={() => setIsOpen(false)}>
                All tasks →
              </Link>
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
