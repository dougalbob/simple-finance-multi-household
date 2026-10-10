import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { loadAppConfig, type AppConfig } from '../src/lib/config';
import { SUPPORT_VIEW_COOKIE, supportBannerState } from '../src/lib/auth/support';
import { householdContextFromHeaders } from '../src/lib/auth/household-context';
import { closeDbHandles, getHouseholdDbHandle } from '../src/lib/db/client';
import { openRegistry, type RegistryDb } from '../src/lib/registry/db';
import { assignIdentity, createHousehold, setHouseholdStatus } from '../src/lib/registry/domain';
import { grantSupportAccess, revokeSupportAccess } from '../src/lib/registry/support';
import { householdDatabasePath, systemRegistryPath } from '../src/lib/registry/paths';
import { createPot, listPots } from '../src/lib/records/pots';
import { headerSource, makeTempDir } from './helpers';

/**
 * Support view at the request boundary (MULTI_HOUSEHOLD_PLAN §4). The administrator
 * sees a household only through a live grant named to them, read-only, and any
 * other request — a member, a stale cookie, a forged or malformed cookie, a
 * revoked or expired grant — falls back to the caller's own household.
 */
describe('support view at the request boundary', () => {
  const T0 = new Date('2026-10-10T09:00:00Z');
  const HOUR = 60 * 60 * 1000;

  let dataDir: string;
  let registry: RegistryDb;
  let ids: { alex: string; lee: string; service: string; ghost: string };
  let grantIds: { lee: number; leeRevoked: number };

  const cfg = (email: string): AppConfig =>
    loadAppConfig({
      NODE_ENV: 'test',
      DATA_DIR: dataDir,
      AUTH_DEV_BYPASS: 'true',
      AUTH_DEV_IDENTITY_EMAIL: email,
    });

  const withCookie = (email: string, grantId: number | string) =>
    headerSource({ cookie: `${SUPPORT_VIEW_COOKIE}=${grantId}` });

  before(async () => {
    dataDir = await makeTempDir('sf-support-context-');
    closeDbHandles();
    registry = openRegistry(systemRegistryPath(dataDir));
    const alex = createHousehold(registry, { displayName: 'Alex household', actor: 'system' });
    assignIdentity(registry, { email: 'alex@example.com', householdId: alex.id, actor: 'system' });
    assignIdentity(registry, { email: 'sam@example.com', householdId: alex.id, actor: 'system' });
    const lee = createHousehold(registry, { displayName: 'Lee household', actor: 'system' });
    assignIdentity(registry, { email: 'lee@example.com', householdId: lee.id, actor: 'system' });
    const service = createHousehold(registry, { displayName: 'Service', actor: 'system' });
    assignIdentity(registry, {
      email: 'root@example.com',
      householdId: service.id,
      role: 'platform_admin',
      actor: 'system',
    });
    assignIdentity(registry, {
      email: 'root2@example.com',
      householdId: service.id,
      role: 'platform_admin',
      actor: 'system',
    });
    // Household with no database file yet: a support view must not create it.
    const ghost = createHousehold(registry, { displayName: 'Never opened', actor: 'system' });
    assignIdentity(registry, {
      email: 'ghost@example.com',
      householdId: ghost.id,
      actor: 'system',
    });
    ids = { alex: alex.id, lee: lee.id, service: service.id, ghost: ghost.id };

    // Lee's database holds one pot the administrator should see, read-only.
    const leeHandle = getHouseholdDbHandle(lee.id, cfg('lee@example.com'));
    createPot(leeHandle.db, {
      label: 'Lee main account',
      kind: 'bank',
      sortOrder: 0,
      actor: 'lee@example.com',
      now: T0,
    });
    closeDbHandles();

    const live = grantSupportAccess(registry, {
      householdId: lee.id,
      grantorEmail: 'lee@example.com',
      supportEmail: 'root@example.com',
      durationMinutes: 60,
      now: T0,
    });
    grantIds = { lee: live.id, leeRevoked: 0 };
  });

  after(() => {
    closeDbHandles();
    registry.close();
  });

  it('gives a live grant holder a read-only view of exactly the granting household', async () => {
    const admin = await householdContextFromHeaders(
      withCookie('root@example.com', grantIds.lee),
      cfg('root@example.com'),
      registry,
      T0,
    );
    assert.ok(admin);
    assert.equal(admin.householdId, ids.lee);
    assert.equal(admin.readOnly, true);
    assert.equal(admin.role, 'platform_admin');
    assert.equal(admin.email, 'root@example.com');
    assert.equal(admin.support?.householdName, 'Lee household');
    assert.deepEqual(
      listPots(admin.db).map((pot) => pot.label),
      ['Lee main account'],
    );
    assert.throws(
      () =>
        createPot(admin.db, {
          label: 'Injected',
          kind: 'bank',
          sortOrder: 9,
          actor: 'root@example.com',
          now: T0,
        }),
      /readonly|READONLY/i,
      'the engine itself refuses writes from a support view',
    );
    assert.ok(Object.isFrozen(admin), 'the context is immutable');
    closeDbHandles();
  });

  it('records first use once when the view is used', async () => {
    const at = new Date(T0.getTime() + 2 * 60 * 1000);
    await householdContextFromHeaders(
      withCookie('root@example.com', grantIds.lee),
      cfg('root@example.com'),
      registry,
      at,
    );
    closeDbHandles();
    const audit = registry
      .prepare("SELECT action, actor FROM registry_audit WHERE action = 'support.access'")
      .all() as Array<{ action: string; actor: string }>;
    assert.ok(audit.length >= 1);
    assert.equal(audit[0]?.actor, 'root@example.com');
  });

  it('gives nothing when the cookie is malformed, zero, negative, fractional or oversized', async () => {
    for (const bad of ['abc', '0', '-1', '1.5', '99999999999999999999', '1 2', '01x', '']) {
      const admin = await householdContextFromHeaders(
        headerSource({ cookie: `${SUPPORT_VIEW_COOKIE}=${bad}` }),
        cfg('root@example.com'),
        registry,
        T0,
      );
      assert.ok(admin, `signed in still gets their own household for cookie "${bad}"`);
      assert.equal(admin.householdId, ids.service, `cookie "${bad}" must not select a household`);
      assert.equal(admin.readOnly, false);
    }
    closeDbHandles();
  });

  it('gives a member no view of another household, whatever cookie they hold', async () => {
    const sam = await householdContextFromHeaders(
      withCookie('sam@example.com', grantIds.lee),
      cfg('sam@example.com'),
      registry,
      T0,
    );
    assert.ok(sam);
    assert.notEqual(sam.householdId, ids.lee);
    assert.equal(sam.readOnly, false);
    assert.equal(sam.support, null);
    assert.deepEqual(listPots(sam.db), [], 'Sam sees only Alex household, which has no pots');
    closeDbHandles();
  });

  it('falls back to the administrator’s own household when the grant is expired, revoked or unknown', async () => {
    const expired = await householdContextFromHeaders(
      withCookie('root@example.com', grantIds.lee),
      cfg('root@example.com'),
      registry,
      new Date(T0.getTime() + HOUR),
    );
    assert.equal(expired?.householdId, ids.service);
    assert.equal(expired?.readOnly, false);

    const unknown = await householdContextFromHeaders(
      withCookie('root@example.com', 999999),
      cfg('root@example.com'),
      registry,
      T0,
    );
    assert.equal(unknown?.householdId, ids.service);
    closeDbHandles();
  });

  it('falls back when a different administrator presents the grant', async () => {
    const other = await householdContextFromHeaders(
      withCookie('root2@example.com', grantIds.lee),
      cfg('root2@example.com'),
      registry,
      T0,
    );
    assert.equal(other?.householdId, ids.service);
    assert.equal(other?.readOnly, false);
    closeDbHandles();
  });

  it('falls back at once when the household revokes the grant, and the banner goes', async () => {
    const throwaway = grantSupportAccess(registry, {
      householdId: ids.ghost,
      grantorEmail: 'ghost@example.com',
      supportEmail: 'root@example.com',
      durationMinutes: 60,
      now: T0,
    });
    revokeSupportAccess(registry, {
      grantId: throwaway.id,
      actorEmail: 'ghost@example.com',
      now: T0,
    });
    const ctx = await householdContextFromHeaders(
      withCookie('root@example.com', throwaway.id),
      cfg('root@example.com'),
      registry,
      T0,
    );
    assert.equal(ctx?.householdId, ids.service);
    const banner = await supportBannerState(
      withCookie('root@example.com', throwaway.id),
      cfg('root@example.com'),
      registry,
      T0,
    );
    assert.equal(banner.viewing, null);
    closeDbHandles();
  });

  it('never creates a database for a household that has none', async () => {
    const ghostGrant = grantSupportAccess(registry, {
      householdId: ids.ghost,
      grantorEmail: 'ghost@example.com',
      supportEmail: 'root2@example.com',
      durationMinutes: 60,
      now: T0,
    });
    await assert.rejects(
      householdContextFromHeaders(
        withCookie('root2@example.com', ghostGrant.id),
        cfg('root2@example.com'),
        registry,
        T0,
      ),
    );
    assert.equal(existsSync(householdDatabasePath(dataDir, ids.ghost)), false);
    closeDbHandles();
  });

  it('gives nothing while the household is deactivated, even under a live grant', async () => {
    setHouseholdStatus(registry, {
      householdId: ids.lee,
      status: 'deactivated',
      actor: 'system',
      now: T0,
    });
    try {
      const ctx = await householdContextFromHeaders(
        withCookie('root@example.com', grantIds.lee),
        cfg('root@example.com'),
        registry,
        T0,
      );
      assert.notEqual(ctx?.householdId, ids.lee);
      closeDbHandles();
    } finally {
      setHouseholdStatus(registry, {
        householdId: ids.lee,
        status: 'active',
        actor: 'system',
        now: T0,
      });
    }
  });

  it('shows the banner to the administrator while viewing, and to the household while sharing', async () => {
    const viewing = await supportBannerState(
      withCookie('root@example.com', grantIds.lee),
      cfg('root@example.com'),
      registry,
      T0,
    );
    assert.equal(viewing.viewing?.householdName, 'Lee household');
    assert.equal(viewing.shared, null);

    const shared = await supportBannerState(headerSource({}), cfg('lee@example.com'), registry, T0);
    assert.equal(shared.viewing, null);
    assert.equal(shared.shared?.supportEmail, 'root@example.com');

    const none = await supportBannerState(headerSource({}), cfg('alex@example.com'), registry, T0);
    assert.deepEqual(none, { viewing: null, shared: null });
  });

  it('keeps concurrent requests isolated: an administrator view never leaks into a member’s context', async () => {
    const [view, lee, alex] = await Promise.all([
      householdContextFromHeaders(
        withCookie('root@example.com', grantIds.lee),
        cfg('root@example.com'),
        registry,
        T0,
      ),
      householdContextFromHeaders(headerSource({}), cfg('lee@example.com'), registry, T0),
      householdContextFromHeaders(headerSource({}), cfg('alex@example.com'), registry, T0),
    ]);
    assert.equal(view?.householdId, ids.lee);
    assert.equal(view?.readOnly, true);
    assert.equal(lee?.householdId, ids.lee);
    assert.equal(lee?.readOnly, false);
    assert.equal(alex?.householdId, ids.alex);
    assert.equal(alex?.readOnly, false);
    closeDbHandles();
  });
});
