import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { GET as attentionGet } from '../src/app/api/attention/route';
import { POST as seenPost } from '../src/app/api/attention/seen/route';
import { SUPPORT_VIEW_COOKIE } from '../src/lib/auth/support';
import { closeDbHandles, getHouseholdDbHandle } from '../src/lib/db/client';
import { getBellSeenAt } from '../src/lib/records/bell-seen';
import { loadAppConfig } from '../src/lib/config';
import { openRegistry } from '../src/lib/registry/db';
import { assignIdentity, createHousehold } from '../src/lib/registry/domain';
import { systemRegistryPath } from '../src/lib/registry/paths';
import { grantSupportAccess } from '../src/lib/registry/support';
import { makeTempDir } from './helpers';

/**
 * A support view is read-only (MULTI_HOUSEHOLD_PLAN §4). The engine refuses
 * writes at the database handle, and these tests pin the layers above it: the
 * bell's seen-time is never written from a view, and every household server
 * action refuses a read-only context unless it is a device preference.
 */
describe('read-only support view guards', () => {
  let dataDir: string;
  let leeId: string;
  let leeGrantId: number;
  const ALEX = 'alex@example.com';
  const ADMIN = 'dev@example.com';

  before(async () => {
    dataDir = await makeTempDir('sf-support-readonly-');
    process.env.DATA_DIR = dataDir;
    process.env.AUTH_DEV_BYPASS = 'false';
    delete process.env.AUTH_DEV_IDENTITY_EMAIL;
    const config = loadAppConfig({ NODE_ENV: 'test', DATA_DIR: dataDir });
    const registry = openRegistry(systemRegistryPath(dataDir));
    try {
      const lee = createHousehold(registry, { displayName: 'Lee household', actor: 'system' });
      assignIdentity(registry, { email: 'lee@example.com', householdId: lee.id, actor: 'system' });
      leeId = lee.id;
      const alex = createHousehold(registry, { displayName: 'Alex household', actor: 'system' });
      assignIdentity(registry, { email: ALEX, householdId: alex.id, actor: 'system' });
      assignIdentity(registry, {
        email: ADMIN,
        householdId: alex.id,
        role: 'platform_admin',
        actor: 'system',
      });
      getHouseholdDbHandle(lee.id, config);
      closeDbHandles();
      leeGrantId = grantSupportAccess(registry, {
        householdId: lee.id,
        grantorEmail: 'lee@example.com',
        supportEmail: ADMIN,
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

  function signedIn(email: string, headers: Record<string, string> = {}): Request {
    process.env.AUTH_DEV_BYPASS = 'true';
    process.env.AUTH_DEV_IDENTITY_EMAIL = email;
    return new Request('http://localhost:3000/api/attention/seen', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', ...headers },
    });
  }

  it('refuses to mark the bell seen from a support view, and writes nothing', async () => {
    try {
      const request = signedIn(ADMIN, { cookie: `${SUPPORT_VIEW_COOKIE}=${leeGrantId}` });
      const response = await seenPost(request);
      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), { error: 'read_only_support_view' });
      closeDbHandles();
    } finally {
      process.env.AUTH_DEV_BYPASS = 'false';
    }
  });

  it('serves the attention list from a support view without writing the bell', async () => {
    try {
      process.env.AUTH_DEV_BYPASS = 'true';
      process.env.AUTH_DEV_IDENTITY_EMAIL = ADMIN;
      const response = await attentionGet(
        new Request('http://localhost:3000/api/attention', {
          headers: { cookie: `${SUPPORT_VIEW_COOKIE}=${leeGrantId}` },
        }),
      );
      assert.equal(response.status, 200);
      closeDbHandles();
    } finally {
      process.env.AUTH_DEV_BYPASS = 'false';
    }
  });

  it('keeps the bell seen-time of the household untouched by a view', async () => {
    const config = loadAppConfig({ NODE_ENV: 'test', DATA_DIR: dataDir });
    const handle = getHouseholdDbHandle(leeId, config);
    const before = getBellSeenAt(handle.db, 'lee@example.com');
    closeDbHandles();
    try {
      process.env.AUTH_DEV_BYPASS = 'true';
      process.env.AUTH_DEV_IDENTITY_EMAIL = ADMIN;
      await attentionGet(
        new Request('http://localhost:3000/api/attention', {
          headers: { cookie: `${SUPPORT_VIEW_COOKIE}=${leeGrantId}` },
        }),
      );
      await seenPost(
        new Request('http://localhost:3000/api/attention/seen', {
          method: 'POST',
          headers: {
            origin: 'http://localhost:3000',
            cookie: `${SUPPORT_VIEW_COOKIE}=${leeGrantId}`,
          },
        }),
      );
    } finally {
      process.env.AUTH_DEV_BYPASS = 'false';
    }
    const after = getBellSeenAt(getHouseholdDbHandle(leeId, config).db, 'lee@example.com');
    closeDbHandles();
    assert.equal(after, before);
  });

  it('gives every household server action a read-only refusal, except the device theme preference', () => {
    const source = readFileSync(path.join(process.cwd(), 'src/app/actions.ts'), 'utf8');
    const chunks = source.split(/^export async function /m).slice(1);
    const EXEMPT = new Set(['saveThemeAction']);
    const unguarded: string[] = [];
    let checked = 0;
    for (const chunk of chunks) {
      const name = /^(\w+)/.exec(chunk)?.[1] ?? '?';
      if (!chunk.includes('householdContextFromRequest(')) continue;
      checked += 1;
      if (EXEMPT.has(name)) continue;
      if (!chunk.includes('user.readOnly')) unguarded.push(name);
    }
    assert.ok(checked >= 60, `expected the household actions to be scanned, found ${checked}`);
    assert.deepEqual(unguarded, []);
    assert.ok(EXEMPT.has('saveThemeAction'));
  });
});
