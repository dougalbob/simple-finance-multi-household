import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { after, before, describe, it } from 'node:test';
import { describeSession, getCurrentUser } from '../src/lib/auth/current-user';
import { loadAppConfig, type AppConfig, type EnvSource } from '../src/lib/config';
import type { RawDatabase } from '../src/lib/db/client';
import { openRegistry } from '../src/lib/registry/db';
import { assignIdentity, createHousehold, setHouseholdStatus } from '../src/lib/registry/domain';
import { systemRegistryPath } from '../src/lib/registry/paths';
import {
  headerSource,
  makeTempDir,
  startMockAccessAuthority,
  type MockAccessAuthority,
} from './helpers';

/**
 * The app-side first-login gate (MULTI_HOUSEHOLD_PLAN §2, SPEC §3): a verified
 * Cloudflare identity is NOT application access. Until the administrator has
 * pre-assigned the email to a household, every page, action and route handler
 * denies it — the choke point is `getCurrentUser`, which they all call. A
 * deactivated household is denied too, and a missing or unreadable registry
 * denies everyone (fail closed).
 */
describe('session gate: authentication plus registry assignment', () => {
  let authority: MockAccessAuthority;
  let dataDir: string;
  let registry: RawDatabase;
  let householdId: string;

  function config(env: EnvSource = {}): AppConfig {
    return loadAppConfig({
      NODE_ENV: 'production',
      DATA_DIR: dataDir,
      AUTH_ISSUER: authority.issuer,
      AUTH_AUDIENCE: authority.audience,
      AUTH_CERTS_URL: authority.certsUrl,
      AUTH_ALLOWED_EMAILS: 'alex@example.com,sam@example.com,root@example.com',
      ...env,
    });
  }

  async function signInAs(email: string): Promise<{ get(name: string): string | null }> {
    const token = await authority.mintToken({ email });
    return headerSource({ 'cf-access-jwt-assertion': token });
  }

  before(async () => {
    authority = await startMockAccessAuthority();
    dataDir = await makeTempDir('sf-session-gate-');
    registry = openRegistry(systemRegistryPath(dataDir));
    const household = createHousehold(registry, {
      displayName: 'Assigned household',
      actor: 'admin@example.com',
    });
    householdId = household.id;
    assignIdentity(registry, {
      email: 'alex@example.com',
      householdId,
      actor: 'admin@example.com',
    });
    assignIdentity(registry, {
      email: 'sam@example.com',
      householdId,
      role: 'platform_admin',
      actor: 'admin@example.com',
    });
  });

  after(async () => {
    registry.close();
    await authority.close();
  });

  it('denies an authenticated identity the administrator has not assigned', async () => {
    // root@example.com passes Cloudflare (allowlisted) but has no roster row.
    const state = await describeSession(await signInAs('root@example.com'), config(), registry);
    assert.deepEqual(state, { status: 'unassigned', email: 'root@example.com' });
    assert.equal(await getCurrentUser(await signInAs('root@example.com'), config()), null);
  });

  it('resolves an assigned identity to its household and role', async () => {
    const state = await describeSession(await signInAs('alex@example.com'), config(), registry);
    assert.ok(state.status === 'ok');
    assert.deepEqual(state.user, {
      email: 'alex@example.com',
      householdId,
      role: 'member',
    });
    const adminState = await describeSession(await signInAs('sam@example.com'), config(), registry);
    assert.ok(adminState.status === 'ok');
    assert.equal(adminState.user.role, 'platform_admin');
  });

  it('still denies a deactivated household but remembers the role for recovery', async () => {
    setHouseholdStatus(registry, {
      householdId,
      status: 'deactivated',
      actor: 'sam@example.com',
    });
    try {
      const state = await describeSession(await signInAs('alex@example.com'), config(), registry);
      assert.ok(state.status === 'household-deactivated');
      assert.equal(state.user.householdId, householdId);
      // Ordinary pages deny the user entirely…
      assert.equal(await getCurrentUser(await signInAs('alex@example.com'), config()), null);
      // …while the session state still names an administrator so /admin can
      // reactivate the household (no lockout).
      const adminState = await describeSession(
        await signInAs('sam@example.com'),
        config(),
        registry,
      );
      assert.ok(adminState.status === 'household-deactivated');
      assert.equal(adminState.user.role, 'platform_admin');
    } finally {
      setHouseholdStatus(registry, { householdId, status: 'active', actor: 'sam@example.com' });
    }
  });

  it('denies unauthenticated requests with a distinct state', async () => {
    const state = await describeSession(headerSource({}), config(), registry);
    assert.deepEqual(state, { status: 'not-signed-in' });
  });

  it('gates the development identity through the registry as well', async () => {
    const devConfig = config({
      NODE_ENV: 'development',
      AUTH_DEV_BYPASS: 'true',
      AUTH_DEV_IDENTITY_EMAIL: 'dev@example.com',
    });
    // The bypass authenticates, but nothing assigned them: denied.
    assert.equal(await getCurrentUser(headerSource({}), devConfig), null);
    const state = await describeSession(headerSource({}), devConfig, registry);
    assert.deepEqual(state, { status: 'unassigned', email: 'dev@example.com' });
  });

  it('fails closed when the registry cannot answer', async () => {
    // A database without the registry schema: every lookup throws, nobody is
    // let in.
    const broken = new Database(path.join(dataDir, 'not-the-registry.sqlite'));
    try {
      const state = await describeSession(await signInAs('alex@example.com'), config(), broken);
      assert.equal(state.status, 'registry-unavailable');
    } finally {
      broken.close();
    }

    // And when the registry cannot even be opened (its path is a file), the
    // choke-point getCurrentUser still resolves to nobody.
    const blockedDir = await makeTempDir('sf-session-blocked-');
    fs.writeFileSync(path.join(blockedDir, 'system'), 'not a directory');
    const blocked = loadAppConfig({
      NODE_ENV: 'production',
      DATA_DIR: blockedDir,
      AUTH_ISSUER: authority.issuer,
      AUTH_AUDIENCE: authority.audience,
      AUTH_CERTS_URL: authority.certsUrl,
      AUTH_ALLOWED_EMAILS: 'alex@example.com',
    });
    assert.equal(await getCurrentUser(await signInAs('alex@example.com'), blocked), null);
  });

  it('resolves the registry from the config when none is injected (choke point)', async () => {
    // Same dataDir as `registry` — getCurrentUser opens it via getRegistry.
    const user = await getCurrentUser(await signInAs('alex@example.com'), config());
    assert.ok(user !== null);
    assert.equal(user.householdId, householdId);
  });
});
