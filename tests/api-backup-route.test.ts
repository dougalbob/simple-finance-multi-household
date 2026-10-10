import assert from 'node:assert/strict';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import * as tar from 'tar';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { POST } from '../src/app/api/backup/route';
import { loadAppConfig } from '../src/lib/config';
import { decryptBackupPayload } from '../src/lib/backup/crypto';
import { closeDbHandles, getHouseholdDbHandle } from '../src/lib/db/client';
import { openRegistry } from '../src/lib/registry/db';
import { assignIdentity, createHousehold } from '../src/lib/registry/domain';
import { grantSupportAccess } from '../src/lib/registry/support';
import { systemRegistryPath } from '../src/lib/registry/paths';
import { SUPPORT_VIEW_COOKIE } from '../src/lib/auth/support';
import { makeTempDir, seedTestRegistry } from './helpers';

/**
 * POST /api/backup: the household's own encrypted archive (MULTI_HOUSEHOLD_PLAN
 * §5). Authentication and same-origin checks come first; a support view may not
 * take an archive; the archive is named for the caller's household only.
 */
describe('POST /api/backup (route handler)', () => {
  const PASSWORD = 'backup-passphrase-1';
  let dataDir: string;
  let householdId: string;
  let leeGrantId: number;

  before(async () => {
    dataDir = await makeTempDir('sf-api-backup-');
    process.env.DATA_DIR = dataDir;
    process.env.AUTH_DEV_BYPASS = 'false';
    delete process.env.AUTH_DEV_IDENTITY_EMAIL;
    householdId = await seedTestRegistry(dataDir, [
      { email: 'dev@example.com', role: 'platform_admin' },
    ]);
    // Another household that has granted this administrator a live support view.
    // Its database exists (a support view never creates one).
    const registry = openRegistry(systemRegistryPath(dataDir));
    try {
      const lee = createHousehold(registry, { displayName: 'Lee household', actor: 'system' });
      assignIdentity(registry, { email: 'lee@example.com', householdId: lee.id, actor: 'system' });
      getHouseholdDbHandle(lee.id, loadAppConfig({ NODE_ENV: 'test', DATA_DIR: dataDir }));
      closeDbHandles();
      leeGrantId = grantSupportAccess(registry, {
        householdId: lee.id,
        grantorEmail: 'lee@example.com',
        supportEmail: 'dev@example.com',
        durationMinutes: 60,
      }).id;
    } finally {
      registry.close();
    }
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

  function signedIn(email: string): void {
    process.env.AUTH_DEV_BYPASS = 'true';
    process.env.AUTH_DEV_IDENTITY_EMAIL = email;
  }

  async function manifestOf(archive: Buffer): Promise<Record<string, unknown>> {
    const tmp = path.join(dataDir, `inspect-${Date.now()}.tar.gz`);
    writeFileSync(tmp, decryptBackupPayload(archive, PASSWORD));
    const extractDir = path.join(dataDir, `inspect-${Date.now()}`);
    mkdirSync(extractDir, { recursive: true });
    await tar.x({ file: tmp, cwd: extractDir, filter: (name) => name === 'manifest.json' });
    const manifest = JSON.parse(
      readFileSync(path.join(extractDir, 'manifest.json'), 'utf8'),
    ) as Record<string, unknown>;
    rmSync(tmp);
    rmSync(extractDir, { recursive: true, force: true });
    return manifest;
  }

  it('rejects unauthenticated requests', async () => {
    process.env.AUTH_DEV_BYPASS = 'false';
    const response = await POST(request({ password: PASSWORD }));
    assert.equal(response.status, 401);
  });

  it('rejects cross-origin requests before doing any work', async () => {
    signedIn('dev@example.com');
    try {
      const response = await POST(
        request({ password: PASSWORD }, { origin: 'https://attacker.example' }),
      );
      assert.equal(response.status, 403);
    } finally {
      process.env.AUTH_DEV_BYPASS = 'false';
    }
  });

  it('requires a passphrase of the minimum length', async () => {
    signedIn('dev@example.com');
    try {
      for (const body of [{}, { password: '' }, { password: 'too-short' }]) {
        const response = await POST(request(body, { origin: 'http://localhost:3000' }));
        assert.equal(response.status, 400);
        assert.match(
          ((await response.json()) as { error: string }).error,
          /at least 12 characters/,
        );
      }
    } finally {
      process.env.AUTH_DEV_BYPASS = 'false';
    }
  });

  it('returns an encrypted archive named for the caller’s own household', async () => {
    signedIn('dev@example.com');
    try {
      const response = await POST(
        request({ password: PASSWORD }, { origin: 'http://localhost:3000' }),
      );
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.equal(response.headers.get('content-type'), 'application/octet-stream');
      assert.match(
        response.headers.get('content-disposition') ?? '',
        /^attachment; filename="simple-finance-backup-.*\.simple-finance-backup"$/,
      );
      const archive = Buffer.from(await response.arrayBuffer());
      const manifest = await manifestOf(archive);
      assert.equal(manifest.formatVersion, 3);
      assert.deepEqual(manifest.household, { id: householdId });
    } finally {
      process.env.AUTH_DEV_BYPASS = 'false';
    }
  });

  it('refuses an archive to a support view, so another household cannot be copied out', async () => {
    signedIn('dev@example.com');
    try {
      const response = await POST(
        request(
          { password: PASSWORD },
          {
            origin: 'http://localhost:3000',
            cookie: `${SUPPORT_VIEW_COOKIE}=${leeGrantId}`,
          },
        ),
      );
      assert.equal(response.status, 403);
      const body = (await response.json()) as { error: string };
      assert.match(body.error, /read-only/);
      assert.equal(response.headers.get('content-disposition'), null);
    } finally {
      process.env.AUTH_DEV_BYPASS = 'false';
    }
  });
});
