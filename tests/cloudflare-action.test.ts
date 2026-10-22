import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { closeRegistry, openRegistry } from '../src/lib/registry/db';
import { assignIdentity, createHousehold } from '../src/lib/registry/domain';

// Supply a real request context without a running Next server. The action still
// resolves authentication/registry itself; no injected browser identity is used.
Object.assign(globalThis, { AsyncLocalStorage });
test('direct server-action calls reject signed-out, unassigned and promoted administrators', async () => {
  const { workUnitAsyncStorage } =
    await import('next/dist/server/app-render/work-unit-async-storage.external');
  const { workAsyncStorage } =
    await import('next/dist/server/app-render/work-async-storage.external');
  const { changeCloudflareAccessAction } = await import('../src/app/admin/cloudflare-actions');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-cf-action-'));
  const saved = { ...process.env };
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    throw Error('must not call Cloudflare');
  };
  try {
    process.env.DATA_DIR = directory;
    process.env.REGISTRY_ADMIN_EMAIL = 'admin@example.com';
    Object.assign(process.env, { NODE_ENV: 'test' });
    const raw = openRegistry(path.join(directory, 'system', 'registry.sqlite'));
    const house = createHousehold(raw, { displayName: 'Fictional', actor: 'system' });
    assignIdentity(raw, {
      email: 'promoted@example.com',
      householdId: house.id,
      actor: 'system',
      role: 'platform_admin',
    });
    raw.close();
    for (const identity of [null, 'unassigned@example.com', 'promoted@example.com']) {
      process.env.AUTH_DEV_BYPASS = identity === null ? 'false' : 'true';
      process.env.AUTH_DEV_IDENTITY_EMAIL = identity ?? '';
      for (const operation of ['grant', 'remove']) {
        const form = new FormData();
        for (const [key, value] of Object.entries({
          operation,
          email: 'target@example.com',
          exclusiveEdit: 'on',
          confirmRemoval: 'on',
          actor: 'admin@example.com',
          assigned: 'true',
        }))
          form.set(key, value);
        const result = await workAsyncStorage.run(
          { route: '/admin' } as Parameters<typeof workAsyncStorage.run>[0],
          () =>
            workUnitAsyncStorage.run(
              {
                type: 'request',
                phase: 'action',
                headers: new Headers(),
              } as unknown as Parameters<typeof workUnitAsyncStorage.run>[0],
              () => changeCloudflareAccessAction({ status: 'idle', message: null }, form),
            ),
        );
        assert.equal(result.status, 'error');
        assert.match(result.message!, /REGISTRY_ADMIN_EMAIL/);
      }
    }
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = original;
    closeRegistry();
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
