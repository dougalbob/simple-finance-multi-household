import type { RawDatabase } from '../db/client';
import { type HouseholdStatus, type IdentityRole, listHouseholds, listIdentities } from './domain';
import { normalizeEmail } from './ids';

/**
 * Presence and connection history (GitHub issue 105).
 *
 * This app has **no server-side session**. Every request re-verifies the
 * Cloudflare Access assertion and resolves the registry assignment
 * (`src/lib/auth/current-user.ts`), and Cloudflare owns signing out — there is
 * no sign-out route to hook. "Who is connected" is therefore an *inference
 * from recent activity*, never a live socket. The wording in the UI follows
 * that: "active now", "idle", "last seen", never "online" or "disconnected at".
 *
 * Two thresholds, agreed with the product owner:
 *
 *  - **active** — seen within `PRESENCE_ACTIVE_WINDOW_MS` (2 minutes).
 *  - **idle** — seen within `PRESENCE_IDLE_TIMEOUT_MS` (15 minutes) but not
 *    the last 2: the tab is open, nobody is using it.
 *  - **ended** — nothing for 15 minutes. The visit is closed lazily, by the
 *    next read or the next touch from that tab; there is no background timer
 *    and no cron, so a restart cannot leave a visit half-recorded.
 *
 * What a row holds, and what it deliberately does not, is documented on
 * `drizzle/registry/0003_presence.sql`: identity, own household, an opaque
 * per-tab key and timestamps. No page paths, no finance data, no support-grant
 * target household, no IP address and no user agent.
 *
 * Failures are never allowed to affect access: callers use
 * `safeRecordPresence`, which swallows any error (a read-only or half-migrated
 * registry must not deny a page).
 */

/** Seen within this window ⇒ "active now". */
export const PRESENCE_ACTIVE_WINDOW_MS = 2 * 60 * 1000;
/** Silent for this long ⇒ the visit is over. */
export const PRESENCE_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
/** A tab beating more often than this is not written again. */
export const PRESENCE_TOUCH_INTERVAL_MS = 60 * 1000;
/** Closed visits are kept this long, then pruned on the next read. */
export const PRESENCE_RETENTION_DAYS = 30;
/** Closed visits listed on `/admin` (newest first). */
export const PRESENCE_HISTORY_LIMIT = 50;
/** Hard ceiling on stored closed visits, whatever their age. */
export const PRESENCE_MAX_STORED_SESSIONS = 2000;

/** Header the browser heartbeat uses to name its tab. */
export const PRESENCE_KEY_HEADER = 'x-sf-presence-key';

/**
 * The key a request without a heartbeat is filed under — a server-rendered
 * page from a browser with JavaScript disabled, or a direct API call. It is
 * not a credential: the verified session decides *who* is present, and this
 * only decides *which visit* to extend.
 */
export const UNATTRIBUTED_SESSION_KEY = 'unattributed';

const SESSION_KEY_PATTERN = /^[a-z0-9]{16,64}$/;

/**
 * Accept only the shape the heartbeat generates. Anything else — a missing
 * header, a blocked `sessionStorage`, a hand-written value — becomes `null`,
 * meaning "this request names no tab". A browser cannot use its key to reach
 * another identity's rows (the email always comes from the verified session)
 * or to widen a visit.
 */
export function normalizeSessionKey(raw: string | null | undefined): string | null {
  const value = raw?.trim().toLowerCase() ?? '';
  return SESSION_KEY_PATTERN.test(value) ? value : null;
}

export type PresenceState = 'active' | 'idle';
export type PresenceEndReason = 'idle-timeout';

interface PresenceRow {
  id: number;
  email: string;
  household_id: string;
  session_key: string;
  first_seen_at: string;
  last_seen_at: string;
  ended_at: string | null;
  ended_reason: string | null;
}

export interface PresencePerson {
  email: string;
  role: IdentityRole;
  state: PresenceState;
  /** First activity of the visit(s) still open. */
  since: string;
  lastSeenAt: string;
  /** Open tabs for this identity (phone + laptop shows 2). */
  tabs: number;
}

export interface PresenceHousehold {
  householdId: string;
  displayName: string;
  status: HouseholdStatus;
  people: PresencePerson[];
}

export interface PresenceHistoryEntry {
  id: number;
  email: string;
  /** The identity's own household name, or null once it was unassigned. */
  householdName: string | null;
  startedAt: string;
  lastSeenAt: string;
  endedAt: string;
  endedReason: PresenceEndReason;
}

export interface PresenceView {
  generatedAt: string;
  activeWindowMinutes: number;
  idleTimeoutMinutes: number;
  retentionDays: number;
  counts: { active: number; idle: number; people: number };
  /** Households with at least one open visit, busiest first. */
  households: PresenceHousehold[];
  /** Closed visits, newest first. Open ones are in `households`. */
  history: PresenceHistoryEntry[];
}

/** Compare ISO instants without trusting flag order in the database. */
function isStale(lastSeenAt: string, now: Date, windowMs: number): boolean {
  const last = Date.parse(lastSeenAt);
  return Number.isNaN(last) || now.getTime() - last >= windowMs;
}

/**
 * Record that this identity — and, when the request names one, this tab —
 * was just seen.
 *
 * Throttled to `PRESENCE_TOUCH_INTERVAL_MS` per open visit, so a busy page
 * cannot turn every render into a write. A tab that comes back after the idle
 * timeout ends its previous visit at the moment it was last seen plus the
 * timeout (the honest end of that visit, not the moment of return) and starts
 * a new one, so the history keeps both.
 *
 * A request with no tab key (a server render, where the browser cannot send
 * our own header, or a blocked `sessionStorage`) refreshes that identity's
 * most recently seen open visit instead of starting a second one — otherwise
 * one browser would show up as two "connections".
 */
export function recordPresence(
  raw: RawDatabase,
  input: {
    email: string;
    householdId: string;
    sessionKey?: string | null;
    now?: Date;
  },
): void {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const email = normalizeEmail(input.email);
  const sessionKey = normalizeSessionKey(input.sessionKey);

  const insert = (): void => {
    raw
      .prepare(
        'INSERT INTO presence_sessions (email, household_id, session_key, first_seen_at, last_seen_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(email, input.householdId, sessionKey ?? UNATTRIBUTED_SESSION_KEY, nowIso, nowIso);
  };

  raw.transaction(() => {
    // `sessionKey === null` means "no tab named": extend whatever this person
    // already has open rather than creating a phantom second connection.
    const open = (
      sessionKey === null
        ? raw
            .prepare(
              'SELECT id, last_seen_at FROM presence_sessions WHERE email = ? AND ended_at IS NULL ORDER BY last_seen_at DESC, id DESC LIMIT 1',
            )
            .get(email)
        : raw
            .prepare(
              'SELECT id, last_seen_at FROM presence_sessions WHERE email = ? AND session_key = ? AND ended_at IS NULL',
            )
            .get(email, sessionKey)
    ) as { id: number; last_seen_at: string } | undefined;

    if (open === undefined) {
      insert();
      return;
    }
    const last = Date.parse(open.last_seen_at);
    if (Number.isNaN(last) || now.getTime() - last < PRESENCE_TOUCH_INTERVAL_MS) return;

    if (now.getTime() - last >= PRESENCE_IDLE_TIMEOUT_MS) {
      raw
        .prepare(
          'UPDATE presence_sessions SET ended_at = ?, ended_reason = ? WHERE id = ? AND ended_at IS NULL',
        )
        .run(new Date(last + PRESENCE_IDLE_TIMEOUT_MS).toISOString(), 'idle-timeout', open.id);
      insert();
      return;
    }
    raw.prepare('UPDATE presence_sessions SET last_seen_at = ? WHERE id = ?').run(nowIso, open.id);
  })();
}

/**
 * Presence must never decide access. A registry that is read-only, locked by
 * a restore or missing the presence table (half-migrated) loses the record
 * and nothing else.
 */
export function safeRecordPresence(
  raw: RawDatabase,
  input: {
    email: string;
    householdId: string;
    sessionKey?: string | null;
    now?: Date;
  },
): void {
  try {
    recordPresence(raw, input);
  } catch {
    // Deliberately silent: presence is operational metadata, not authorisation.
  }
}

/**
 * Close every visit that has gone quiet, ending it at the moment it was last
 * seen plus the timeout. Runs on read paths (the admin card and
 * `GET /api/presence`), which is what makes expiry lazy rather than scheduled.
 * Returns how many visits were closed.
 */
export function closeIdleSessions(raw: RawDatabase, now: Date = new Date()): number {
  const cutoff = new Date(now.getTime() - PRESENCE_IDLE_TIMEOUT_MS).toISOString();
  const stale = raw
    .prepare(
      'SELECT id, last_seen_at FROM presence_sessions WHERE ended_at IS NULL AND last_seen_at <= ?',
    )
    .all(cutoff) as Array<{ id: number; last_seen_at: string }>;
  if (stale.length === 0) return 0;

  const update = raw.prepare(
    'UPDATE presence_sessions SET ended_at = ?, ended_reason = ? WHERE id = ? AND ended_at IS NULL',
  );
  raw.transaction(() => {
    for (const row of stale) {
      const last = Date.parse(row.last_seen_at);
      const endedAt = Number.isNaN(last)
        ? now.toISOString()
        : new Date(Math.min(last + PRESENCE_IDLE_TIMEOUT_MS, now.getTime())).toISOString();
      update.run(endedAt, 'idle-timeout', row.id);
    }
  })();
  return stale.length;
}

/**
 * Drop closed visits older than the retention window and keep the stored
 * history under its hard ceiling. Open visits are never pruned.
 */
export function prunePresenceHistory(raw: RawDatabase, now: Date = new Date()): number {
  const cutoff = new Date(
    now.getTime() - PRESENCE_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const removed = raw
    .prepare('DELETE FROM presence_sessions WHERE ended_at IS NOT NULL AND last_seen_at < ?')
    .run(cutoff).changes;

  const overflow = raw
    .prepare(
      'SELECT COUNT(*) AS n FROM presence_sessions WHERE ended_at IS NOT NULL AND last_seen_at >= ?',
    )
    .get(cutoff) as { n: number };
  const excess = overflow.n - PRESENCE_MAX_STORED_SESSIONS;
  if (excess > 0) {
    raw
      .prepare(
        `DELETE FROM presence_sessions WHERE id IN (
           SELECT id FROM presence_sessions
            WHERE ended_at IS NOT NULL AND last_seen_at >= ?
            ORDER BY last_seen_at ASC
            LIMIT ?
         )`,
      )
      .run(cutoff, excess);
  }
  return removed + Math.max(0, excess);
}

export function presenceState(lastSeenAt: string, now: Date): PresenceState {
  return isStale(lastSeenAt, now, PRESENCE_ACTIVE_WINDOW_MS) ? 'idle' : 'active';
}

/**
 * The whole picture for `/admin`: open visits grouped by household, plus the
 * closed-visit log. Household and identity metadata comes from the registry
 * roster so a visit is always attributed to a named household; a visit whose
 * identity has since been unassigned keeps its email and loses the name.
 *
 * Closing and pruning happen here (idempotent, cheap) so the card is accurate
 * even when nobody has touched the app recently.
 */
export function buildPresenceView(raw: RawDatabase, now: Date = new Date()): PresenceView {
  closeIdleSessions(raw, now);
  prunePresenceHistory(raw, now);

  const households = listHouseholds(raw);
  const identities = listIdentities(raw);
  const householdName = new Map(households.map((h) => [h.id, h.displayName]));
  const identityRole = new Map(identities.map((i) => [i.email, i.role]));

  const openRows = raw
    .prepare(
      'SELECT * FROM presence_sessions WHERE ended_at IS NULL ORDER BY last_seen_at DESC, id DESC',
    )
    .all() as PresenceRow[];

  const byHousehold = new Map<string, PresencePerson[]>();
  const people = new Map<
    string,
    { email: string; householdId: string; since: string; lastSeenAt: string; tabs: number }
  >();

  for (const row of openRows) {
    const existing = people.get(row.email);
    if (existing === undefined) {
      people.set(row.email, {
        email: row.email,
        householdId: row.household_id,
        since: row.first_seen_at,
        lastSeenAt: row.last_seen_at,
        tabs: 1,
      });
      continue;
    }
    existing.tabs += 1;
    if (Date.parse(row.first_seen_at) < Date.parse(existing.since))
      existing.since = row.first_seen_at;
    if (Date.parse(row.last_seen_at) > Date.parse(existing.lastSeenAt)) {
      existing.lastSeenAt = row.last_seen_at;
    }
  }

  for (const person of people.values()) {
    const list = byHousehold.get(person.householdId) ?? [];
    list.push({
      email: person.email,
      // A roster row that vanished leaves the visit visible with a plain role.
      role: identityRole.get(person.email) ?? 'member',
      state: presenceState(person.lastSeenAt, now),
      since: person.since,
      lastSeenAt: person.lastSeenAt,
      tabs: person.tabs,
    });
    byHousehold.set(person.householdId, list);
  }

  const grouped: PresenceHousehold[] = [];
  for (const household of households) {
    const members = byHousehold.get(household.id);
    if (members === undefined || members.length === 0) continue;
    grouped.push({
      householdId: household.id,
      displayName: household.displayName,
      status: household.status,
      people: members.sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt)),
    });
  }
  // A visit whose household row is somehow unknown still shows, last.
  for (const [householdId, members] of byHousehold) {
    if (grouped.some((g) => g.householdId === householdId)) continue;
    grouped.push({
      householdId,
      displayName: 'Unknown household',
      status: 'deactivated',
      people: members,
    });
  }

  const allPeople = grouped.flatMap((g) => g.people);

  const historyRows = raw
    .prepare(
      'SELECT * FROM presence_sessions WHERE ended_at IS NOT NULL ORDER BY last_seen_at DESC, id DESC LIMIT ?',
    )
    .all(PRESENCE_HISTORY_LIMIT) as PresenceRow[];

  return {
    generatedAt: now.toISOString(),
    activeWindowMinutes: PRESENCE_ACTIVE_WINDOW_MS / 60_000,
    idleTimeoutMinutes: PRESENCE_IDLE_TIMEOUT_MS / 60_000,
    retentionDays: PRESENCE_RETENTION_DAYS,
    counts: {
      active: allPeople.filter((p) => p.state === 'active').length,
      idle: allPeople.filter((p) => p.state === 'idle').length,
      people: allPeople.length,
    },
    households: grouped,
    history: historyRows.map((row) => ({
      id: row.id,
      email: row.email,
      householdName: householdName.get(row.household_id) ?? null,
      startedAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      endedAt: row.ended_at ?? row.last_seen_at,
      endedReason: 'idle-timeout',
    })),
  };
}
