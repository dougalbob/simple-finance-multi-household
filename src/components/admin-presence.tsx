'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PresenceState, PresenceView } from '@/lib/registry/presence';
import { formatInstantLocal } from '@/lib/time';

/**
 * "Who is connected" and the connection log (GitHub issue 105).
 *
 * The server renders the first view, so the card is readable with JavaScript
 * off and the first client render is identical (no relative times, no clock
 * read at render — the only figures are absolute instants from the payload).
 * Afterwards it refreshes every 30 seconds while the tab is visible, the same
 * shape as the bell's existing polling.
 *
 * The wording is deliberately careful. There is no server-side session and no
 * socket: a person is "active now" because they did something in the last two
 * minutes, and a vanished tab is "last seen", never "disconnected at".
 */

const REFRESH_MS = 30 * 1000;

function durationLabel(fromIso: string, toIso: string): string {
  const ms = Date.parse(toIso) - Date.parse(fromIso);
  if (Number.isNaN(ms) || ms < 0) return 'under a minute';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'under a minute';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours} hour${hours === 1 ? '' : 's'}${rest === 0 ? '' : ` ${rest} minute${rest === 1 ? '' : 's'}`}`;
}

function stateWords(state: PresenceState): string {
  return state === 'active' ? 'Active now' : 'Idle';
}

function summary(view: PresenceView): string {
  const { active, idle, people } = view.counts;
  if (people === 0) return 'Nobody is connected right now.';
  if (active === 0) {
    return `Nobody is actively using the app. ${people === 1 ? 'One person' : `${people} people`} idle with ${idle === 1 ? 'a tab' : 'tabs'} open.`;
  }
  return `${active === 1 ? 'One person is' : `${active} people are`} active now — hold off restarting or updating the container while someone is using the app.`;
}

export function AdminPresence({ initial, me }: { initial: PresenceView; me: string }) {
  const [view, setView] = useState<PresenceView>(initial);
  const [stale, setStale] = useState(false);
  const hidden = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/presence', { cache: 'no-store' });
      if (response.status === 401 || response.status === 403) {
        // No longer allowed to see this: stop polling rather than retrying.
        hidden.current = true;
        return;
      }
      if (!response.ok) {
        setStale(true);
        return;
      }
      setView((await response.json()) as PresenceView);
      setStale(false);
    } catch {
      // Keep the last good view; say so quietly.
      setStale(true);
    }
  }, []);

  useEffect(() => {
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible' && !hidden.current) void refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !hidden.current) void refresh();
    }, REFRESH_MS);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh]);

  if (hidden.current) return null;

  return (
    <>
      <section
        aria-labelledby="admin-presence-heading"
        className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm"
      >
        <div className="px-5 pt-4">
          <div className="flex items-center justify-between gap-3">
            <h2 id="admin-presence-heading" className="text-lg font-semibold text-ink">
              Who is connected
            </h2>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-positive-50 px-2.5 py-1 text-xs font-medium text-positive-800">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-positive" />
              {view.counts.active} active
            </span>
          </div>
          <p className="mt-2 text-sm leading-5" data-testid="presence-summary">
            {summary(view)}
          </p>
          {stale ? (
            <p role="status" className="mt-2 text-xs text-warning">
              The last refresh failed, so this view may be out of date.
            </p>
          ) : null}
          <details className="group mt-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-1 text-xs font-medium text-ink-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
              How presence is measured
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                fill="none"
                className="h-3.5 w-3.5 transition-transform duration-150 group-open:rotate-180"
              >
                <path
                  d="m5 7.5 5 5 5-5"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </summary>
            <p className="pb-3 pt-2 text-xs leading-5 text-ink-muted">
              Someone counts as active for {view.activeWindowMinutes} minutes after they last used
              the app, then as idle. Their visit ends after {view.idleTimeoutMinutes} minutes of
              silence. A locked phone or suspended tab stops being seen, so this says “last seen”,
              never “connected”. Refreshes every 30 seconds.
            </p>
          </details>
        </div>

        {/* A plain list, not `article`/`h3`: `article` with an `h3` is the
            roster's household card, and the admin page (and its browser tests)
            must keep exactly one of those per household. */}
        <ul className="mt-3 max-h-72 space-y-3 overflow-y-auto border-t border-border-hairline px-5 py-4">
          {view.households.map((household) => (
            <li key={household.householdId}>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {household.displayName}
                {household.status === 'deactivated' ? ' · Deactivated' : ''}
              </p>
              <ul className="mt-2 space-y-3">
                {household.people.map((person) => (
                  <li key={person.email} className="text-sm">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span
                        aria-hidden="true"
                        className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                          person.state === 'active' ? 'bg-positive' : 'bg-border-strong'
                        }`}
                      />
                      <span className="break-all font-medium text-ink-body">{person.email}</span>
                      {person.email === me.toLowerCase() ? (
                        <span className="text-xs text-ink-muted">(you)</span>
                      ) : null}
                    </div>
                    <p className="ml-4 mt-0.5 text-xs leading-5 text-ink-muted">
                      {person.role === 'platform_admin' ? 'Platform administrator' : 'Member'}
                      {' · '}
                      {stateWords(person.state)}
                      {' · '}
                      {person.state === 'active'
                        ? `since ${formatInstantLocal(new Date(person.since))}`
                        : `last seen ${formatInstantLocal(new Date(person.lastSeenAt))}`}
                      {person.tabs > 1 ? ` · ${person.tabs} tabs` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            </li>
          ))}
          {view.households.length === 0 ? (
            <li className="text-sm text-ink-muted">
              No open sessions. Any member who arrives will appear here within a minute.
            </li>
          ) : null}
        </ul>
      </section>

      <section
        aria-labelledby="admin-presence-history-heading"
        className="rounded-2xl border border-border bg-surface p-5 shadow-sm"
      >
        <h2 id="admin-presence-history-heading" className="text-lg font-semibold text-ink">
          Connection history
        </h2>
        <p className="mt-1 text-xs leading-5 text-ink-muted">
          Ended visits are kept for {view.retentionDays} days. Identities and times only — never
          pages visited or records entered.
        </p>
        <details className="group mt-3">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg border border-border bg-canvas px-3 py-2 text-xs font-semibold text-ink-soft hover:border-border-strong hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
            <span>View ended visits</span>
            <span className="flex items-center gap-2">
              <span className="rounded-full bg-surface-muted px-2 py-0.5 font-medium text-ink-muted">
                {view.history.length}
              </span>
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                fill="none"
                className="h-3.5 w-3.5 transition-transform duration-150 group-open:rotate-180"
              >
                <path
                  d="m5 7.5 5 5 5-5"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </summary>
          <div className="pt-3">
            <p className="text-xs leading-5 text-ink-muted">
              A visit ends when it goes quiet, not when the tab closes. Its end time is the last
              activity plus {view.idleTimeoutMinutes} minutes.
            </p>
            <ol className="mt-3 max-h-72 space-y-3 overflow-y-auto pr-1">
              {view.history.map((entry) => (
                <li key={entry.id} className="border-b border-border-hairline pb-3 last:border-0">
                  <p className="break-all text-sm font-medium text-ink-body">{entry.email}</p>
                  <p className="mt-0.5 text-xs leading-5 text-ink-muted">
                    {entry.householdName !== null ? `${entry.householdName} · ` : ''}
                    {formatInstantLocal(new Date(entry.startedAt))}
                  </p>
                  <p className="mt-0.5 text-xs leading-5 text-ink-muted">
                    {durationLabel(entry.startedAt, entry.endedAt)}, ended{' '}
                    {formatInstantLocal(new Date(entry.endedAt))} after an idle timeout
                  </p>
                </li>
              ))}
              {view.history.length === 0 ? (
                <li className="text-sm text-ink-muted">No visits have ended yet.</li>
              ) : null}
            </ol>
          </div>
        </details>
      </section>
    </>
  );
}
