import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { getCurrentUser } from '../src/lib/auth/current-user';
import { loadAppConfig } from '../src/lib/config';
import { openRegistry } from '../src/lib/registry/db';
import { assignIdentity, createHousehold } from '../src/lib/registry/domain';
import { systemRegistryPath } from '../src/lib/registry/paths';
import {
  headerSource,
  makeTempDir,
  startMockAccessAuthority,
  type MockAccessAuthority,
} from './helpers';

/**
 * Fail-closed identity resolution. Two gates stand in series (SPEC §3, §19):
 * Cloudflare JWT verification plus the allowlist, then an active
 * registry assignment. Anything failing anywhere resolves to null.
 * `session-gate.test.ts` covers the assignment gate in depth; these pin the
 * authentication half and the combined choke point.
 */
describe('getCurrentUser (fail-closed resolution)', () => {
  let authority: MockAccessAuthority;
  let dataDir: string;
  let householdId: string;

  before(async () => {
    authority = await startMockAccessAuthority();
    dataDir = await makeTempDir('sf-current-user-');
    // The registry every success case below is resolved against. Anything not
    // assigned here is denied even when Cloudflare verified it.
    const registry = openRegistry(systemRegistryPath(dataDir));
    try {
      const household = createHousehold(registry, {
        displayName: 'Test household',
        actor: 'system',
      });
      householdId = household.id;
      assignIdentity(registry, {
        email: 'dev@example.com',
        householdId,
        actor: 'system',
      });
      assignIdentity(registry, {
        email: 'sam@example.com',
        householdId,
        actor: 'system',
      });
    } finally {
      registry.close();
    }
  });

  after(async () => {
    await authority.close();
  });

  it('uses the dev identity only when the bypass is active', async () => {
    const config = loadAppConfig({
      NODE_ENV: 'development',
      DATA_DIR: dataDir,
      AUTH_DEV_BYPASS: 'true',
      AUTH_DEV_IDENTITY_EMAIL: 'Dev@Example.com',
    });
    const user = await getCurrentUser(headerSource({}), config);
    assert.deepEqual(user, { email: 'dev@example.com', householdId, role: 'member' });
  });

  it('returns null with no token when auth is incomplete (fail closed)', async () => {
    const config = loadAppConfig({ NODE_ENV: 'production', DATA_DIR: dataDir });
    assert.equal(await getCurrentUser(headerSource({}), config), null);
  });

  it('returns null in production even when bypass flags are set in the environment', async () => {
    const config = loadAppConfig({
      NODE_ENV: 'production',
      DATA_DIR: dataDir,
      AUTH_DEV_BYPASS: 'true',
      AUTH_DEV_IDENTITY_EMAIL: 'dev@example.com',
      AUTH_ISSUER: authority.issuer,
      AUTH_AUDIENCE: authority.audience,
      AUTH_CERTS_URL: authority.certsUrl,
      AUTH_ALLOWED_EMAILS: 'alex@example.com',
    });
    assert.equal(await getCurrentUser(headerSource({}), config), null);
  });

  it('returns null when a token is present but invalid', async () => {
    const config = loadAppConfig({
      NODE_ENV: 'production',
      DATA_DIR: dataDir,
      AUTH_ISSUER: authority.issuer,
      AUTH_AUDIENCE: authority.audience,
      AUTH_CERTS_URL: authority.certsUrl,
      AUTH_ALLOWED_EMAILS: 'alex@example.com',
    });
    assert.equal(
      await getCurrentUser(headerSource({ 'cf-access-jwt-assertion': 'garbage' }), config),
      null,
    );
    const expired = await authority.mintToken({ expiresInSeconds: -60 });
    assert.equal(
      await getCurrentUser(headerSource({ 'cf-access-jwt-assertion': expired }), config),
      null,
    );
  });

  it('resolves a verified, assigned token to its household user', async () => {
    const config = loadAppConfig({
      NODE_ENV: 'production',
      DATA_DIR: dataDir,
      AUTH_ISSUER: authority.issuer,
      AUTH_AUDIENCE: authority.audience,
      AUTH_CERTS_URL: authority.certsUrl,
      AUTH_ALLOWED_EMAILS: 'alex@example.com,sam@example.com',
    });
    const token = await authority.mintToken({ email: 'sam@example.com' });
    const user = await getCurrentUser(headerSource({ 'cf-access-jwt-assertion': token }), config);
    assert.deepEqual(user, { email: 'sam@example.com', householdId, role: 'member' });
  });

  it('returns null for a verified token whose identity is not allowlisted', async () => {
    const config = loadAppConfig({
      NODE_ENV: 'production',
      DATA_DIR: dataDir,
      AUTH_ISSUER: authority.issuer,
      AUTH_AUDIENCE: authority.audience,
      AUTH_CERTS_URL: authority.certsUrl,
      AUTH_ALLOWED_EMAILS: 'alex@example.com',
    });
    const token = await authority.mintToken({ email: 'stranger@example.com' });
    assert.equal(
      await getCurrentUser(headerSource({ 'cf-access-jwt-assertion': token }), config),
      null,
    );
  });

  it('returns null for a verified allowlisted token with no registry assignment', async () => {
    // alex@example.com clears Cloudflare's gates but the roster has no row.
    const config = loadAppConfig({
      NODE_ENV: 'production',
      DATA_DIR: dataDir,
      AUTH_ISSUER: authority.issuer,
      AUTH_AUDIENCE: authority.audience,
      AUTH_CERTS_URL: authority.certsUrl,
      AUTH_ALLOWED_EMAILS: 'alex@example.com',
    });
    const token = await authority.mintToken({ email: 'alex@example.com' });
    assert.equal(
      await getCurrentUser(headerSource({ 'cf-access-jwt-assertion': token }), config),
      null,
    );
  });
});
