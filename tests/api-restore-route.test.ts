import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { POST as restorePOST } from '../src/app/api/restore/route';
import { loadAppConfig } from '../src/lib/config';
import { createHouseholdBackup } from '../src/lib/backup/household';
import { closeDbHandles, getHouseholdDbHandle } from '../src/lib/db/client';
import { openRegistry } from '../src/lib/registry/db';
import { assignIdentity, createHousehold } from '../src/lib/registry/domain';
import { grantSupportAccess } from '../src/lib/registry/support';
import { householdDocumentsDir, systemRegistryPath } from '../src/lib/registry/paths';
import { createPot, listPots } from '../src/lib/records/pots';
import { SUPPORT_VIEW_COOKIE } from '../src/lib/auth/support';
import { makeTempDir, seedTestRegistry } from './helpers';

/**
 * POST /api/restore: replaces only the caller's own household, and only with an
 * archive made for that household (MULTI_HOUSEHOLD_PLAN §5). Refusals happen
 * before any tenant byte changes.
 */
describe('POST /api/restore (route handler)', () => {
  const PASSWORD = 'restore-passphrase-1';
  let dataDir: string;
  let householdId: string;
  let leeId: string;
  let leeGrantId: number;
  let backupBytes: Buffer = Buffer.alloc(0);
  let leeArchive: Buffer = Buffer.alloc(0);
  let config: ReturnType<typeof loadAppConfig>;

  before(async () => {
    dataDir = await makeTempDir('sf-api-restore-');
    process.env.DATA_DIR = dataDir;
    process.env.AUTH_DEV_BYPASS = 'false';
    delete process.env.AUTH_DEV_IDENTITY_EMAIL;
    householdId = await seedTestRegistry(dataDir, [
      { email: 'dev@example.com', role: 'platform_admin' },
    ]);
    config = loadAppConfig({ NODE_ENV: 'test', DATA_DIR: dataDir });
    const registry = openRegistry(systemRegistryPath(dataDir));
    try {
      const lee = createHousehold(registry, { displayName: 'Lee household', actor: 'system' });
      assignIdentity(registry, { email: 'lee@example.com', householdId: lee.id, actor: 'system' });
      leeId = lee.id;
      leeGrantId = grantSupportAccess(registry, {
        householdId: lee.id,
        grantorEmail: 'lee@example.com',
        supportEmail: 'dev@example.com',
        durationMinutes: 60,
      }).id;
    } finally {
      registry.close();
    }
    // Dev household: one pot, backed up, then a second pot that a restore must remove.
    const handle = getHouseholdDbHandle(householdId, config);
    createPot(handle.db, {
      label: 'Saved pot',
      kind: 'bank',
      sortOrder: 0,
      actor: 'dev@example.com',
    });
    backupBytes = (
      await createHouseholdBackup({
        householdId,
        handle,
        documentsDir: householdDocumentsDir(dataDir, householdId),
        password: PASSWORD,
      })
    ).bytes;
    createPot(handle.db, {
      label: 'Added later',
      kind: 'bank',
      sortOrder: 1,
      actor: 'dev@example.com',
    });
    closeDbHandles();
    // Lee household's archive, to prove it cannot be restored into dev's household.
    const leeHandle = getHouseholdDbHandle(leeId, config);
    createPot(leeHandle.db, {
      label: 'Lee pot',
      kind: 'bank',
      sortOrder: 0,
      actor: 'lee@example.com',
    });
    leeArchive = (
      await createHouseholdBackup({
        householdId: leeId,
        handle: leeHandle,
        documentsDir: householdDocumentsDir(dataDir, leeId),
        password: PASSWORD,
      })
    ).bytes;
    closeDbHandles();
  });

  after(() => {
    closeDbHandles();
    delete process.env.DATA_DIR;
    delete process.env.AUTH_DEV_BYPASS;
    delete process.env.AUTH_DEV_IDENTITY_EMAIL;
  });

  function signedIn(email: string): void {
    process.env.AUTH_DEV_BYPASS = 'true';
    process.env.AUTH_DEV_IDENTITY_EMAIL = email;
  }

  function blobOf(bytes: Buffer): Blob {
    return new Blob([new Uint8Array(bytes)]);
  }

  function form(fields: Record<string, string | Blob | null>): Request {
    const body = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      if (value !== null) body.set(key, value);
    }
    return new Request('http://localhost:3000/api/restore', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000' },
      body,
    });
  }

  function labels(id: string): string[] {
    const handle = getHouseholdDbHandle(id, config);
    const result = listPots(handle.db)
      .map((pot) => pot.label)
      .sort();
    closeDbHandles();
    return result;
  }

  it('rejects unauthenticated and cross-origin requests', async () => {
    process.env.AUTH_DEV_BYPASS = 'false';
    assert.equal((await restorePOST(form({ confirm: 'RESTORE' }))).status, 401);
    signedIn('dev@example.com');
    try {
      const response = await restorePOST(
        new Request('http://localhost:3000/api/restore', {
          method: 'POST',
          headers: { origin: 'https://attacker.example' },
          body: new FormData(),
        }),
      );
      assert.equal(response.status, 403);
    } finally {
      process.env.AUTH_DEV_BYPASS = 'false';
    }
  });

  it('refuses a support view, which can restore nothing', async () => {
    signedIn('dev@example.com');
    try {
      const request = form({
        archive: blobOf(backupBytes),
        password: PASSWORD,
        confirm: 'RESTORE',
      });
      request.headers.set('cookie', `${SUPPORT_VIEW_COOKIE}=${leeGrantId}`);
      const response = await restorePOST(request);
      assert.equal(response.status, 403);
      assert.deepEqual(labels(householdId), ['Added later', 'Saved pot']);
    } finally {
      process.env.AUTH_DEV_BYPASS = 'false';
    }
  });

  it('requires the archive, the passphrase and the typed confirmation word', async () => {
    signedIn('dev@example.com');
    try {
      const cases: Array<[Record<string, string | Blob | null>, RegExp]> = [
        [{ password: PASSWORD, confirm: 'RESTORE' }, /Choose a backup archive/],
        [{ archive: blobOf(backupBytes), confirm: 'RESTORE' }, /passphrase/],
        [{ archive: blobOf(backupBytes), password: PASSWORD, confirm: 'yes' }, /Type RESTORE/],
        [{ archive: blobOf(backupBytes), password: PASSWORD, confirm: null }, /Type RESTORE/],
      ];
      for (const [fields, message] of cases) {
        const response = await restorePOST(form(fields));
        assert.equal(response.status, 400);
        assert.match(((await response.json()) as { error: string }).error, message);
      }
      assert.deepEqual(labels(householdId), ['Added later', 'Saved pot']);
    } finally {
      process.env.AUTH_DEV_BYPASS = 'false';
    }
  });

  it('refuses a wrong passphrase, and changes nothing', async () => {
    signedIn('dev@example.com');
    try {
      const response = await restorePOST(
        form({ archive: blobOf(backupBytes), password: 'not-the-passphrase', confirm: 'RESTORE' }),
      );
      assert.equal(response.status, 400);
      assert.deepEqual(labels(householdId), ['Added later', 'Saved pot']);
    } finally {
      process.env.AUTH_DEV_BYPASS = 'false';
    }
  });

  it('refuses another household’s archive, and changes nothing in either household', async () => {
    signedIn('dev@example.com');
    try {
      const response = await restorePOST(
        form({ archive: blobOf(leeArchive), password: PASSWORD, confirm: 'RESTORE' }),
      );
      assert.equal(response.status, 400);
      assert.match(((await response.json()) as { error: string }).error, /household/i);
      assert.deepEqual(labels(householdId), ['Added later', 'Saved pot']);
      assert.deepEqual(labels(leeId), ['Lee pot']);
    } finally {
      process.env.AUTH_DEV_BYPASS = 'false';
    }
  });

  it('restores the caller’s own household from its own archive', async () => {
    signedIn('dev@example.com');
    try {
      const response = await restorePOST(
        form({ archive: blobOf(backupBytes), password: PASSWORD, confirm: 'restore' }),
      );
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      const body = (await response.json()) as {
        ok: boolean;
        personLinksCleared: number;
        documentsRestored: number;
      };
      assert.equal(body.ok, true);
      assert.equal(body.personLinksCleared, 0);
      assert.equal(body.documentsRestored, 0);
      assert.deepEqual(labels(householdId), ['Saved pot']);
      assert.deepEqual(labels(leeId), ['Lee pot'], 'Lee household is untouched');
    } finally {
      process.env.AUTH_DEV_BYPASS = 'false';
    }
  });
});
