import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { POST as restorePOST } from '../src/app/api/restore/route';
import { closeDbHandles } from '../src/lib/db/client';
import { householdDatabasePath } from '../src/lib/registry/paths';
import { makeTempDir, seedTestRegistry } from './helpers';

/**
 * Household-scoped restore is a later implementation step. Exercise the live
 * route's auth/origin boundary and pin its fail-closed behavior: archive fields
 * are not parsed and no tenant database is opened or replaced.
 */
describe('POST /api/restore (route handler)', () => {
  let dataDir: string;
  let householdId: string;

  before(async () => {
    dataDir = await makeTempDir('sf-api-restore-');
    process.env.DATA_DIR = dataDir;
    process.env.AUTH_DEV_BYPASS = 'false';
    delete process.env.AUTH_DEV_IDENTITY_EMAIL;
    householdId = await seedTestRegistry(dataDir, [
      { email: 'dev@example.com', role: 'platform_admin' },
    ]);
  });

  after(() => {
    closeDbHandles();
    delete process.env.DATA_DIR;
    delete process.env.AUTH_DEV_BYPASS;
    delete process.env.AUTH_DEV_IDENTITY_EMAIL;
  });

  function restoreRequest(headers: Record<string, string> = {}): Request {
    return new Request('http://localhost:3000/api/restore', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', ...headers },
      body: 'not a parsed restore archive',
    });
  }

  it('rejects an unauthenticated request', async () => {
    const response = await restorePOST(restoreRequest());
    assert.equal(response.status, 401);
  });

  it('rejects a cross-origin request even when authenticated', async () => {
    process.env.AUTH_DEV_BYPASS = 'true';
    process.env.AUTH_DEV_IDENTITY_EMAIL = 'dev@example.com';
    try {
      const response = await restorePOST(restoreRequest({ origin: 'https://attacker.example' }));
      assert.equal(response.status, 403);
    } finally {
      process.env.AUTH_DEV_BYPASS = 'false';
    }
  });

  it('returns unavailable without parsing input or touching household data', async () => {
    process.env.AUTH_DEV_BYPASS = 'true';
    process.env.AUTH_DEV_IDENTITY_EMAIL = 'dev@example.com';
    try {
      const response = await restorePOST(restoreRequest());
      assert.equal(response.status, 501);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.deepEqual(await response.json(), {
        error: 'household_scoped_restore_not_implemented',
      });
      assert.equal(existsSync(householdDatabasePath(dataDir, householdId)), false);
    } finally {
      process.env.AUTH_DEV_BYPASS = 'false';
    }
  });
});
