import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { RawDatabase } from '../src/lib/db/client';
import { openRegistry } from '../src/lib/registry/db';
import { assignIdentity, createHousehold, unassignIdentity } from '../src/lib/registry/domain';
import {
  buildPresenceView,
  closeIdleSessions,
  normalizeSessionKey,
  PRESENCE_ACTIVE_WINDOW_MS,
  PRESENCE_IDLE_TIMEOUT_MS,
  PRESENCE_MAX_STORED_SESSIONS,
  PRESENCE_RETENTION_DAYS,
  PRESENCE_TOUCH_INTERVAL_MS,
  presenceState,
  prunePresenceHistory,
  recordPresence,
  safeRecordPresence,
  UNATTRIBUTED_SESSION_KEY,
} from '../src/lib/registry/presence';
import { systemRegistryPath } from '../src/lib/registry/paths';
import { makeTempDir } from './helpers';

/**
 * Presence and the connection log (GitHub issue #105).
 *
 * There is no server-side session, so these rules are the whole definition of
 * "connected": a visit opens on activity, is throttled, falls to idle, ends
 * after a silent fifteen minutes, and is pruned after thirty days. None of it
 * may ever hold finance data or affect access.
 */
describe('presence and connection history', () => {
  let raw: RawDatabase;
  let households: { alex: string; lee: string };
  const T0 = new Date('2026-10-23T09:00:00Z');
  const MINUTE = 60 * 1000;
  const KEY_A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  const KEY_B = 'bbbbbbbbbbbbbbbbbbbbbbbb';

  before(async () => {
    const dir = await makeTempDir('sf-presence-');
    raw = openRegistry(systemRegistryPath(dir));
    const alex = createHousehold(raw, { displayName: 'Alex household', actor: 'system' });
    assignIdentity(raw, { email: 'alex@example.com', householdId: alex.id, actor: 'system' });
    assignIdentity(raw, { email: 'sam@example.com', householdId: alex.id, actor: 'system' });
    const lee = createHousehold(raw, { displayName: 'Lee household', actor: 'system' });
    assignIdentity(raw, {
      email: 'lee@example.com',
      householdId: lee.id,
      role: 'platform_admin',
      actor: 'system',
    });
    households = { alex: alex.id, lee: lee.id };
  });

  after(() => {
    raw.close();
  });

  beforeEach(() => {
    raw.prepare('DELETE FROM presence_sessions').run();
  });

  function rows(): Array<{
    email: string;
    session_key: string;
    first_seen_at: string;
    last_seen_at: string;
    ended_at: string | null;
    ended_reason: string | null;
  }> {
    return raw.prepare('SELECT * FROM presence_sessions ORDER BY id').all() as ReturnType<
      typeof rows
    >;
  }

  it('migrates a presence table that holds operational metadata only', () => {
    const columns = (
      raw.prepare('PRAGMA table_info(presence_sessions)').all() as Array<{ name: string }>
    ).map((c) => c.name);
    assert.deepEqual(columns, [
      'id',
      'email',
      'household_id',
      'session_key',
      'first_seen_at',
      'last_seen_at',
      'ended_at',
      'ended_reason',
    ]);
    // Nothing that could describe what a person was doing.
    for (const forbidden of ['path', 'url', 'user_agent', 'ip', 'detail', 'data']) {
      assert.equal(columns.includes(forbidden), false, `unexpected column ${forbidden}`);
    }
  });

  it('opens a visit on first activity and normalises the email', () => {
    recordPresence(raw, {
      email: ' Alex@Example.com ',
      householdId: households.alex,
      sessionKey: KEY_A,
      now: T0,
    });
    const [visit] = rows();
    assert.equal(rows().length, 1);
    assert.equal(visit?.email, 'alex@example.com');
    assert.equal(visit?.session_key, KEY_A);
    assert.equal(visit?.first_seen_at, T0.toISOString());
    assert.equal(visit?.last_seen_at, T0.toISOString());
    assert.equal(visit?.ended_at, null);
  });

  it('throttles touches, then extends the same visit', () => {
    recordPresence(raw, {
      email: 'alex@example.com',
      householdId: households.alex,
      sessionKey: KEY_A,
      now: T0,
    });
    recordPresence(raw, {
      email: 'alex@example.com',
      householdId: households.alex,
      sessionKey: KEY_A,
      now: new Date(T0.getTime() + PRESENCE_TOUCH_INTERVAL_MS - 1),
    });
    assert.equal(rows().length, 1);
    assert.equal(rows()[0]?.last_seen_at, T0.toISOString());

    const later = new Date(T0.getTime() + PRESENCE_TOUCH_INTERVAL_MS);
    recordPresence(raw, {
      email: 'alex@example.com',
      householdId: households.alex,
      sessionKey: KEY_A,
      now: later,
    });
    assert.equal(rows().length, 1);
    assert.equal(rows()[0]?.last_seen_at, later.toISOString());
  });

  it('keeps one visit per tab, so two tabs are two connections', () => {
    recordPresence(raw, {
      email: 'alex@example.com',
      householdId: households.alex,
      sessionKey: KEY_A,
      now: T0,
    });
    recordPresence(raw, {
      email: 'alex@example.com',
      householdId: households.alex,
      sessionKey: KEY_B,
      now: T0,
    });
    assert.equal(rows().length, 2);

    const view = buildPresenceView(raw, new Date(T0.getTime() + MINUTE));
    const alex = view.households.find((h) => h.householdId === households.alex);
    assert.equal(alex?.people.length, 1, 'one person, not two');
    assert.equal(alex?.people[0]?.tabs, 2);
    assert.equal(view.counts.people, 1);
    assert.equal(view.counts.active, 1);
  });

  it('extends the open visit when the request names no tab', () => {
    recordPresence(raw, {
      email: 'alex@example.com',
      householdId: households.alex,
      sessionKey: KEY_A,
      now: T0,
    });
    // A server render cannot send the browser's tab key. It must not create a
    // phantom second connection for the same browser.
    recordPresence(raw, {
      email: 'alex@example.com',
      householdId: households.alex,
      sessionKey: null,
      now: new Date(T0.getTime() + PRESENCE_TOUCH_INTERVAL_MS),
    });
    assert.equal(rows().length, 1);
    assert.equal(
      rows()[0]?.last_seen_at,
      new Date(T0.getTime() + PRESENCE_TOUCH_INTERVAL_MS).toISOString(),
    );
  });

  it('files a visit as unattributed when there is no tab and nothing open', () => {
    recordPresence(raw, { email: 'alex@example.com', householdId: households.alex, now: T0 });
    assert.equal(rows()[0]?.session_key, UNATTRIBUTED_SESSION_KEY);
  });

  it('ends a silent visit and starts a new one when the tab comes back', () => {
    recordPresence(raw, {
      email: 'alex@example.com',
      householdId: households.alex,
      sessionKey: KEY_A,
      now: T0,
    });
    const returnAt = new Date(T0.getTime() + 60 * MINUTE);
    recordPresence(raw, {
      email: 'alex@example.com',
      householdId: households.alex,
      sessionKey: KEY_A,
      now: returnAt,
    });

    const [first, second] = rows();
    assert.equal(rows().length, 2);
    // The old visit ends when it actually went quiet, not when the person
    // happened to come back — the log must not claim an hour of use.
    assert.equal(first?.ended_at, new Date(T0.getTime() + PRESENCE_IDLE_TIMEOUT_MS).toISOString());
    assert.equal(first?.ended_reason, 'idle-timeout');
    assert.equal(second?.ended_at, null);
    assert.equal(second?.first_seen_at, returnAt.toISOString());
  });

  it('closes idle visits lazily and leaves recent ones open', () => {
    recordPresence(raw, {
      email: 'alex@example.com',
      householdId: households.alex,
      sessionKey: KEY_A,
      now: T0,
    });
    recordPresence(raw, {
      email: 'sam@example.com',
      householdId: households.alex,
      sessionKey: KEY_B,
      now: new Date(T0.getTime() + 20 * MINUTE),
    });

    const closed = closeIdleSessions(raw, new Date(T0.getTime() + 21 * MINUTE));
    assert.equal(closed, 1);
    const [alex, sam] = rows();
    assert.notEqual(alex?.ended_at, null);
    assert.equal(alex?.ended_reason, 'idle-timeout');
    assert.equal(sam?.ended_at, null);
    // Re-running is a no-op, so every read path can call it.
    assert.equal(closeIdleSessions(raw, new Date(T0.getTime() + 25 * MINUTE)), 0);
  });

  it('reports active within two minutes and idle after that', () => {
    recordPresence(raw, {
      email: 'alex@example.com',
      householdId: households.alex,
      sessionKey: KEY_A,
      now: T0,
    });
    assert.equal(presenceState(T0.toISOString(), T0), 'active');
    assert.equal(
      presenceState(T0.toISOString(), new Date(T0.getTime() + PRESENCE_ACTIVE_WINDOW_MS - 1)),
      'active',
    );
    assert.equal(
      presenceState(T0.toISOString(), new Date(T0.getTime() + PRESENCE_ACTIVE_WINDOW_MS)),
      'idle',
    );

    const view = buildPresenceView(raw, new Date(T0.getTime() + 5 * MINUTE));
    assert.equal(view.counts.active, 0);
    assert.equal(view.counts.idle, 1);
    assert.equal(view.activeWindowMinutes, 2);
    assert.equal(view.idleTimeoutMinutes, 15);
  });

  it('groups the live view by household and names each person', () => {
    recordPresence(raw, {
      email: 'alex@example.com',
      householdId: households.alex,
      sessionKey: KEY_A,
      now: T0,
    });
    recordPresence(raw, {
      email: 'lee@example.com',
      householdId: households.lee,
      sessionKey: KEY_B,
      now: T0,
    });

    const view = buildPresenceView(raw, new Date(T0.getTime() + MINUTE));
    assert.deepEqual(view.households.map((h) => h.displayName).sort(), [
      'Alex household',
      'Lee household',
    ]);
    const lee = view.households.find((h) => h.householdId === households.lee);
    assert.equal(lee?.people[0]?.role, 'platform_admin');
    assert.equal(lee?.people[0]?.state, 'active');
    assert.equal(view.counts.people, 2);
  });

  it('keeps a visit visible after its identity is unassigned, without a household name', () => {
    recordPresence(raw, {
      email: 'sam@example.com',
      householdId: households.alex,
      sessionKey: KEY_A,
      now: T0,
    });
    unassignIdentity(raw, { email: 'sam@example.com', actor: 'root@example.com' });

    const view = buildPresenceView(raw, new Date(T0.getTime() + 30 * MINUTE));
    assert.equal(view.history.length, 1);
    assert.equal(view.history[0]?.email, 'sam@example.com');
    assert.equal(view.history[0]?.householdName, 'Alex household');
    // Re-assign so later tests see the roster they expect.
    assignIdentity(raw, {
      email: 'sam@example.com',
      householdId: households.alex,
      actor: 'root@example.com',
    });
  });

  it('lists ended visits newest first, with the honest end time', () => {
    recordPresence(raw, {
      email: 'alex@example.com',
      householdId: households.alex,
      sessionKey: KEY_A,
      now: T0,
    });
    recordPresence(raw, {
      email: 'lee@example.com',
      householdId: households.lee,
      sessionKey: KEY_B,
      now: new Date(T0.getTime() + 30 * MINUTE),
    });

    const view = buildPresenceView(raw, new Date(T0.getTime() + 90 * MINUTE));
    assert.equal(view.counts.people, 0);
    assert.equal(view.households.length, 0);
    assert.deepEqual(
      view.history.map((h) => h.email),
      ['lee@example.com', 'alex@example.com'],
    );
    const [lee, alex] = view.history;
    assert.equal(alex?.endedAt, new Date(T0.getTime() + PRESENCE_IDLE_TIMEOUT_MS).toISOString());
    assert.equal(
      lee?.endedAt,
      new Date(T0.getTime() + 30 * MINUTE + PRESENCE_IDLE_TIMEOUT_MS).toISOString(),
    );
    assert.equal(lee?.endedReason, 'idle-timeout');
  });

  it('prunes visits older than the retention window', () => {
    recordPresence(raw, {
      email: 'alex@example.com',
      householdId: households.alex,
      sessionKey: KEY_A,
      now: T0,
    });
    closeIdleSessions(raw, new Date(T0.getTime() + 20 * MINUTE));

    const justInside = new Date(T0.getTime() + (PRESENCE_RETENTION_DAYS - 1) * 24 * 60 * MINUTE);
    assert.equal(prunePresenceHistory(raw, justInside), 0);
    assert.equal(rows().length, 1);

    const pastRetention = new Date(T0.getTime() + (PRESENCE_RETENTION_DAYS + 1) * 24 * 60 * MINUTE);
    assert.equal(prunePresenceHistory(raw, pastRetention), 1);
    assert.equal(rows().length, 0);
  });

  it('never prunes a visit that is still open', () => {
    recordPresence(raw, {
      email: 'alex@example.com',
      householdId: households.alex,
      sessionKey: KEY_A,
      now: T0,
    });
    // Even far in the future, an open row is the reader's business, not the
    // pruner's; `closeIdleSessions` ends it first, and then it can go.
    assert.equal(prunePresenceHistory(raw, new Date(T0.getTime() + 400 * 24 * 60 * MINUTE)), 0);
    assert.equal(rows().length, 1);
  });

  it('caps stored history so the registry cannot grow without bound', () => {
    const insert = raw.prepare(
      "INSERT INTO presence_sessions (email, household_id, session_key, first_seen_at, last_seen_at, ended_at, ended_reason) VALUES (?, ?, ?, ?, ?, ?, 'idle-timeout')",
    );
    for (let i = 0; i < PRESENCE_MAX_STORED_SESSIONS + 25; i += 1) {
      const at = new Date(T0.getTime() + i * MINUTE).toISOString();
      insert.run('alex@example.com', households.alex, `${i}`.padStart(24, 'a'), at, at, at);
    }
    const removed = prunePresenceHistory(raw, new Date(T0.getTime() + 2000 * MINUTE));
    assert.ok(removed >= 25);
    const remaining = raw.prepare('SELECT COUNT(*) AS n FROM presence_sessions').get() as {
      n: number;
    };
    assert.ok(remaining.n <= PRESENCE_MAX_STORED_SESSIONS, `stored ${remaining.n}`);
  });

  it('accepts only a heartbeat-shaped tab key', () => {
    assert.equal(normalizeSessionKey('aaaaaaaaaaaaaaaaaaaaaaaa'), 'aaaaaaaaaaaaaaaaaaaaaaaa');
    assert.equal(normalizeSessionKey('AAAAAAAAAAAAAAAAAAAAAAAA'), 'aaaaaaaaaaaaaaaaaaaaaaaa');
    assert.equal(normalizeSessionKey(null), null);
    assert.equal(normalizeSessionKey(''), null);
    assert.equal(normalizeSessionKey('short'), null);
    assert.equal(normalizeSessionKey('../../../etc/passwd'), null);
    assert.equal(normalizeSessionKey(`${'a'.repeat(65)}`), null);
  });

  it('cannot be used to write a row for another identity', () => {
    // The tab key is not a claim about who is present: two identities using
    // the same key stay separate visits.
    recordPresence(raw, {
      email: 'alex@example.com',
      householdId: households.alex,
      sessionKey: KEY_A,
      now: T0,
    });
    recordPresence(raw, {
      email: 'lee@example.com',
      householdId: households.lee,
      sessionKey: KEY_A,
      now: T0,
    });
    assert.deepEqual(
      rows().map((r) => r.email),
      ['alex@example.com', 'lee@example.com'],
    );
  });

  it('refuses a household that is not in the registry', () => {
    assert.throws(() =>
      recordPresence(raw, {
        email: 'ghost@example.com',
        householdId: 'f'.repeat(32),
        sessionKey: KEY_A,
        now: T0,
      }),
    );
  });

  it('never denies access when the record cannot be written', () => {
    // A registry without the presence table (half-migrated, or a read-only
    // handle): the safe wrapper must swallow the failure.
    const broken = {
      transaction: () => () => undefined,
      prepare: () => {
        throw new Error('no such table: presence_sessions');
      },
    } as unknown as RawDatabase;
    assert.doesNotThrow(() =>
      safeRecordPresence(broken, {
        email: 'alex@example.com',
        householdId: households.alex,
        sessionKey: KEY_A,
        now: T0,
      }),
    );
    assert.equal(rows().length, 0);
  });
});
