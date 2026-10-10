import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { POST } from '../src/app/api/backup/route';
import { closeDbHandles } from '../src/lib/db/client';
import { householdDatabasePath } from '../src/lib/registry/paths';
import { makeTempDir, seedTestRegistry } from './helpers';

/**
 * Household-scoped backup/restore is a later implementation step. Pin the
 * route's authentication and same-origin checks, and prove the fail-closed
 * response does not open, create or snapshot any household finance database.
 */
describe('POST /api/backup (route handler)', () => {
  let dataDir: string;
  let householdId: string;

  before(async () => {
    dataDir = await makeTempDir('sf-api-backup-');
    process.env.DATA_DIR = dataDir;
    process.env.AUTH_DEV_BYPASS = 'false';
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

  function request(body: unknown, headers: Record<string, string> = {}): Request {
    return new Request('http://localhost:3000/api/backup', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  }

  it('rejects unauthenticated requests', async () => {
    const response = await POST(request({ password: 'anything' }));
    assert.equal(response.status, 401);
  });

  it('rejects cross-origin requests before reporting the feature unavailable', async () => {
    process.env.AUTH_DEV_BYPASS = 'true';
    process.env.AUTH_DEV_IDENTITY_EMAIL = 'dev@example.com';
    try {
      const response = await POST(
        request({ password: 'anything' }, { origin: 'https://attacker.example' }),
      );
      assert.equal(response.status, 403);
    } finally {
      process.env.AUTH_DEV_BYPASS = 'false';
    }
  });

  it('fails closed for authenticated same-origin requests without touching tenant data', async () => {
    process.env.AUTH_DEV_BYPASS = 'true';
    process.env.AUTH_DEV_IDENTITY_EMAIL = 'dev@example.com';
    try {
      for (const body of [{ password: 'backup-passphrase-1' }, {}, { password: '' }]) {
        const response = await POST(request(body, { origin: 'http://localhost:3000' }));
        assert.equal(response.status, 501);
        assert.equal(response.headers.get('cache-control'), 'private, no-store');
        assert.deepEqual(await response.json(), {
          error: 'household_scoped_backup_not_implemented',
        });
      }

      assert.equal(existsSync(householdDatabasePath(dataDir, householdId)), false);
      assert.equal(existsSync(path.join(dataDir, 'simple-finance.sqlite')), false);
    } finally {
      process.env.AUTH_DEV_BYPASS = 'false';
    }
  });
});
