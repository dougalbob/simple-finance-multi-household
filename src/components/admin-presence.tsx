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
        className="rounded-xl border border-border bg-surface p-4 shadow-sm"
      >
        <h2 id="admin-presence-heading" className="mb-1 text-lg font-semibold">
          Who is connected
        </h2>
        <p className="mb-1 text-sm" data-testid="presence-summary">
          {summary(view)}
        </p>
        <p className="mb-3 text-xs text-ink-muted">
          Presence is inferred from activity: someone counts as active for{' '}
          {view.activeWindowMinutes} minutes after they last used the app, then as idle, and their
          visit ends after {view.idleTimeoutMinutes} minutes of silence. A phone that locks or a tab
          the browser suspends stops being seen — that is why this says “last seen”, never
          “connected”. Refreshes every 30 seconds
          {stale ? ' — the last refresh failed, so this may be out of date.' : '.'}
        </p>

        {/* A plain list, not `article`/`h3`: `article` with an `h3` is the
            roster's household card, and the admin page (and its browser tests)
            must keep exactly one of those per household. */}
        <ul className="space-y-4">
          {view.households.map((household) => (
            <li key={household.householdId} className="rounded-lg bg-canvas p-3">
              <p className="text-sm font-semibold">
                {household.displayName}
                {household.status === 'deactivated' ? (
                  <span className="ml-2 text-xs font-normal text-ink-muted">Deactivated</span>
                ) : null}
              </p>
              <ul className="mt-2 space-y-1">
                {household.people.map((person) => (
                  <li
                    key={person.email}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm"
                  >
                    <span
                      aria-hidden="true"
                      className={`inline-block h-2 w-2 rounded-full ${
                        person.state === 'active' ? 'bg-accent' : 'bg-border'
                      }`}
                    />
                    <span>{person.email}</span>
                    {person.email === me.toLowerCase() ? (
                      <span className="text-xs text-ink-muted">(you)</span>
                    ) : null}
                    <span className="text-xs text-ink-muted">
                      {person.role === 'platform_admin' ? 'Platform administrator' : 'Member'}
                      {' · '}
                      {stateWords(person.state)}
                      {' · '}
                      {person.state === 'active'
                        ? `since ${formatInstantLocal(new Date(person.since))}`
                        : `last seen ${formatInstantLocal(new Date(person.lastSeenAt))}`}
                      {person.tabs > 1 ? ` · ${person.tabs} tabs` : ''}
                    </span>
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
        className="rounded-xl border border-border bg-surface p-4 shadow-sm"
      >
        <h2 id="admin-presence-history-heading" className="mb-1 text-lg font-semibold">
          Connection history
        </h2>
        <p className="mb-3 text-xs text-ink-muted">
          Visits that have ended, newest first, kept for {view.retentionDays} days. A visit ends
          when it goes quiet rather than when the tab is closed — a closed tab cannot tell the
          server anything — so the end time is the last activity plus {view.idleTimeoutMinutes}{' '}
          minutes. Identities and times only: never which pages were open or what was recorded.
        </p>
        <ol className="space-y-1">
          {view.history.map((entry) => (
            <li key={entry.id} className="text-sm">
              <span className="text-ink-muted">
                {formatInstantLocal(new Date(entry.startedAt))}
              </span>
              {' · '}
              <span>{entry.email}</span>
              {entry.householdName !== null ? (
                <span className="text-ink-muted"> · {entry.householdName}</span>
              ) : null}
              <span className="text-ink-muted">
                {' · '}
                {durationLabel(entry.startedAt, entry.endedAt)}, ended{' '}
                {formatInstantLocal(new Date(entry.endedAt))} after an idle timeout
              </span>
            </li>
          ))}
          {view.history.length === 0 ? (
            <li className="text-sm text-ink-muted">No visits have ended yet.</li>
          ) : null}
        </ol>
      </section>
    </>
  );
}
