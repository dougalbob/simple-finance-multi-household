import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it, mock } from 'node:test';
import Database from 'better-sqlite3';
import { POST as restorePOST } from '../src/app/admin/restore/route';
import { closeRegistry, getRegistry, openRegistry } from '../src/lib/registry/db';
import { assignIdentity, createHousehold, listHouseholds } from '../src/lib/registry/domain';
import { systemRegistryPath } from '../src/lib/registry/paths';
import {
  MAX_REGISTRY_RESTORE_BYTES,
  sha256Hex,
  SQLITE_MAGIC_HEADER,
} from '../src/lib/registry/restore';
import { makeTempDir, seedTestRegistry } from './helpers';

/**
 * POST /admin/restore: the platform administrator's whole-file replace of the
 * system registry (MULTI_HOUSEHOLD_PLAN §4). Regression pin for the live
 * v1.0.1 breakage: the success response must be a **303** whose Location is
 * exactly the relative path `/admin` — never an absolute URL derived from
 * `request.url` (which behind `next start -H 0.0.0.0` is the bind address, not
 * the public URL) and never a 307 (which would re-POST the upload). The
 * Location value itself is asserted because a test that merely *follows* the
 * redirect can be masked by a same-host follower.
 */
describe('POST /admin/restore (route handler)', () => {
  const ADMIN = 'dev@example.com';
  const MEMBER = 'member@example.com';
  let dataDir: string;
  let registryPath: string;
  let backupBytes: Buffer = Buffer.alloc(0);

  before(async () => {
    dataDir = await makeTempDir('sf-admin-restore-');
    process.env.DATA_DIR = dataDir;
    registryPath = systemRegistryPath(dataDir);
    // Administrator household plus a member household (for the 403 check).
    await seedTestRegistry(dataDir, [{ email: ADMIN, role: 'platform_admin' }]);
    const registry = openRegistry(registryPath);
    try {
      const memberHousehold = createHousehold(registry, {
        displayName: 'Member household',
        actor: 'system',
      });
      assignIdentity(registry, {
        email: MEMBER,
        householdId: memberHousehold.id,
        actor: 'system',
      });
    } finally {
      registry.close();
    }
    // The backup, taken the same way GET /admin/backup takes it: a consistent
    // snapshot of the live database.
    const live = openRegistry(registryPath);
    const snapshotPath = path.join(dataDir, 'snapshot.sqlite');
    try {
      await live.backup(snapshotPath);
    } finally {
      live.close();
    }
    backupBytes = fs.readFileSync(snapshotPath);
    fs.unlinkSync(snapshotPath);
    // The mutation a restore must undo: a household added after the backup.
    const mutator = openRegistry(registryPath);
    try {
      createHousehold(mutator, { displayName: 'Temporary household', actor: 'system' });
    } finally {
      mutator.close();
    }
  });

  after(() => {
    closeRegistry();
    delete process.env.DATA_DIR;
    delete process.env.AUTH_DEV_BYPASS;
    delete process.env.AUTH_DEV_IDENTITY_EMAIL;
  });

  function signedInAs(email: string): void {
    process.env.AUTH_DEV_BYPASS = 'true';
    process.env.AUTH_DEV_IDENTITY_EMAIL = email;
  }

  function signedOut(): void {
    process.env.AUTH_DEV_BYPASS = 'false';
    delete process.env.AUTH_DEV_IDENTITY_EMAIL;
  }

  function form(fields: Record<string, string | Blob | null>): Request {
    const body = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      if (value === null) continue;
      if (value instanceof Blob) body.set(key, value, 'registry.sqlite');
      else body.set(key, value);
    }
    return new Request('http://localhost:3000/admin/restore', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000' },
      body,
    });
  }

  function blobOf(bytes: Buffer): Blob {
    return new Blob([new Uint8Array(bytes)]);
  }

  function householdNames(): string[] {
    const registry = openRegistry(registryPath);
    try {
      return listHouseholds(registry)
        .map((household) => household.displayName)
        .sort();
    } finally {
      registry.close();
    }
  }

  it('refuses signed-out, unassigned and registry-unavailable requests with 401', async () => {
    signedOut();
    assert.equal((await restorePOST(form({ file: blobOf(backupBytes) }))).status, 401);

    // Authenticated but with no roster assignment: still 401 — there is no
    // self sign-up.
    signedInAs('stranger@example.com');
    assert.equal((await restorePOST(form({ file: blobOf(backupBytes) }))).status, 401);

    // An unreadable registry denies everyone, including restore attempts.
    const blockerParent = await makeTempDir('sf-admin-restore-blocked-');
    const blocker = path.join(blockerParent, 'blocker');
    fs.writeFileSync(blocker, 'not a directory');
    const savedDataDir = process.env.DATA_DIR;
    process.env.DATA_DIR = path.join(blocker, 'nested');
    try {
      signedInAs(ADMIN);
      assert.equal((await restorePOST(form({ file: blobOf(backupBytes) }))).status, 401);
    } finally {
      process.env.DATA_DIR = savedDataDir;
    }
  });

  it('refuses a signed-in member (only platform administrators restore)', async () => {
    signedInAs(MEMBER);
    try {
      const response = await restorePOST(form({ file: blobOf(backupBytes) }));
      assert.equal(response.status, 403);
      assert.deepEqual(householdNames(), [
        'Member household',
        'Temporary household',
        'Test household',
      ]);
    } finally {
      signedOut();
    }
  });

  it('refuses a cross-origin form post', async () => {
    signedInAs(ADMIN);
    try {
      const body = new FormData();
      body.set('file', blobOf(backupBytes), 'registry.sqlite');
      const response = await restorePOST(
        new Request('http://localhost:3000/admin/restore', {
          method: 'POST',
          headers: { origin: 'https://attacker.example' },
          body,
        }),
      );
      assert.equal(response.status, 403);
      assert.deepEqual(householdNames(), [
        'Member household',
        'Temporary household',
        'Test household',
      ]);
    } finally {
      signedOut();
    }
  });

  it('requires a file and refuses invalid uploads without touching the live registry', async () => {
    signedInAs(ADMIN);
    try {
      // No file at all.
      assert.equal((await restorePOST(form({}))).status, 400);
      // Not a form the route can parse.
      assert.equal(
        (
          await restorePOST(
            new Request('http://localhost:3000/admin/restore', {
              method: 'POST',
              headers: { origin: 'http://localhost:3000', 'content-type': 'text/plain' },
              body: 'not multipart',
            }),
          )
        ).status,
        400,
      );
      // Not a SQLite database.
      assert.equal(
        (await restorePOST(form({ file: blobOf(Buffer.from('not a sqlite file at all')) }))).status,
        400,
      );
      // SQLite magic but a torn file: header bytes plus noise.
      const torn = Buffer.concat([SQLITE_MAGIC_HEADER, crypto.randomBytes(8192)]);
      assert.equal((await restorePOST(form({ file: blobOf(torn) }))).status, 400);
      // A valid, intact SQLite database that is NOT a registry (household
      // database or any unrelated file) must be refused, not installed.
      const unrelatedPath = path.join(dataDir, 'unrelated.sqlite');
      const unrelated = new Database(unrelatedPath);
      unrelated.exec('CREATE TABLE foo (bar INTEGER)');
      unrelated.close();
      const unrelatedBytes = fs.readFileSync(unrelatedPath);
      fs.unlinkSync(unrelatedPath);
      assert.equal((await restorePOST(form({ file: blobOf(unrelatedBytes) }))).status, 400);
      // Declared size over the cap: refused before the bytes are even read.
      const oversized = new Blob([new Uint8Array(MAX_REGISTRY_RESTORE_BYTES + 1)]);
      assert.equal((await restorePOST(form({ file: oversized }))).status, 413);

      // Every refusal left the roster exactly as it was.
      assert.deepEqual(householdNames(), [
        'Member household',
        'Temporary household',
        'Test household',
      ]);
    } finally {
      signedOut();
    }
  });

  it('restores the registry from its own backup: 303 to /admin, bytes replaced, pre-restore copy kept', async () => {
    signedInAs(ADMIN);
    const info = mock.method(console, 'info');
    try {
      const response = await restorePOST(form({ file: blobOf(backupBytes) }));

      // The v1.0.1 regression pins: status 303 (not the 307 default, which
      // would re-POST the upload) and a *relative* Location (never
      // `request.url`-derived, which emitted https://0.0.0.0:3000/admin live).
      assert.equal(response.status, 303);
      assert.equal(response.headers.get('location'), '/admin');

      // The upload's bytes landed: the registry file is byte-for-byte the
      // backup (no merge, no rewrite).
      assert.equal(sha256Hex(fs.readFileSync(registryPath)), sha256Hex(backupBytes));

      // The roster is back to the backup's state: the household added after
      // the backup is gone, the original two remain.
      assert.deepEqual(householdNames(), ['Member household', 'Test household']);

      // The shared handle the next /admin request reuses sees the same rows.
      const live = getRegistry();
      assert.equal(
        (live.prepare('SELECT count(*) AS n FROM households').get() as { n: number }).n,
        2,
      );

      // A timestamped pre-restore copy preserved the overwritten (mutated)
      // registry, including the temporary household.
      const systemDir = path.dirname(registryPath);
      const preRestore = fs
        .readdirSync(systemDir)
        .filter((name) => /^registry\.sqlite\.pre-restore-/.test(name))
        .sort();
      assert.equal(preRestore.length, 1);
      const preRestoreDb = new Database(path.join(systemDir, preRestore[0] ?? ''), {
        readonly: true,
      });
      try {
        const names = preRestoreDb
          .prepare('SELECT display_name FROM households ORDER BY display_name')
          .all()
          .map((row) => (row as { display_name: string }).display_name);
        assert.deepEqual(names, ['Member household', 'Temporary household', 'Test household']);
      } finally {
        preRestoreDb.close();
      }

      // The outcome log names the path, byte length, sha256 and row counts —
      // what a live installation needs to prove a restore landed.
      const logged = info.mock.calls.map((call) => call.arguments.join(' ')).join('\n');
      assert.match(logged, /\[registry-restore\]/);
      assert.ok(logged.includes(registryPath), 'log names the registry path');
      assert.ok(logged.includes(String(backupBytes.length)), 'log names the byte length');
      assert.ok(logged.includes(sha256Hex(backupBytes).slice(0, 16)), 'log names the sha256');
      assert.match(logged, /households 3→2/);
    } finally {
      info.mock.restore();
      signedOut();
    }
  });
});
