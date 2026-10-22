import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { mutateCloudflare } from '../src/lib/cloudflare/mutate';
import { fingerprint, writablePolicy } from '../src/lib/cloudflare/policy';
import { loadAppConfig } from '../src/lib/config';
import type { SessionState } from '../src/lib/auth/current-user';
import { openRegistry } from '../src/lib/registry/db';
import {
  assignIdentity,
  createHousehold,
  listRegistryAudit,
  resolveIdentity,
  unassignIdentity,
} from '../src/lib/registry/domain';

const admin = 'admin@example.com';
const email = 'new@example.com';
const env = {
  CLOUDFLARE_ACCOUNT_ID: 'account',
  CLOUDFLARE_APPLICATION_ID: 'app',
  CLOUDFLARE_POLICY_ID: 'policy',
  CLOUDFLARE_API_TOKEN: 'fictional-secret-token',
  AUTH_AUDIENCE: 'aud',
};
const app = { id: 'app', name: 'Finance', aud: 'aud', policies: [{ id: 'policy', precedence: 1 }] };
const policy = {
  id: 'policy',
  account_id: 'account',
  reusable: true as const,
  app_count: 1 as const,
  name: 'Finance',
  decision: 'allow' as const,
  created_at: '2026-10-22',
  updated_at: '2026-10-22',
  include: [
    { email: { email: admin } },
    { email: { email: 'other@example.com' } },
    { group: { id: 'group' } },
  ],
  require: [{ email_domain: { domain: 'example.com' } }],
  exclude: [{ email: { email: 'excluded@example.com' } }],
  approval_required: false,
  approval_groups: [{ approvals_needed: 1, email_addresses: [admin] }],
  isolation_required: true,
  purpose_justification_required: true,
  purpose_justification_prompt: 'Why?',
  session_duration: '12h',
  mfa_config: { allowed_authenticators: ['totp' as const], mfa_disabled: false },
  connection_rules: { rdp: { allowed_clipboard_local_to_remote_formats: ['text' as const] } },
};
function fixture(t: TestContext) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-cf-'));
  const config = loadAppConfig({ DATA_DIR: dir, REGISTRY_ADMIN_EMAIL: admin });
  const registry = openRegistry(config.registryPath);
  t.after(() => {
    registry.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const household = createHousehold(registry, { displayName: 'Fictional', actor: admin });
  assignIdentity(registry, { email, householdId: household.id, actor: admin });
  const session: SessionState = {
    status: 'ok',
    user: { email: admin, householdId: household.id, role: 'platform_admin' },
  };
  let currentApp: unknown = structuredClone(app);
  let currentPolicy: unknown = structuredClone(policy);
  const calls: Array<{ method: string; body?: any }> = [];
  let hook: ((method: string, number: number) => void | Promise<void>) | undefined;
  const request = (async (url, options) => {
    const method = options?.method ?? 'GET';
    assert.equal(options?.cache, 'no-store');
    assert.equal(options?.redirect, 'error');
    assert.ok(options?.signal);
    assert.equal(
      new Headers(options?.headers).get('authorization'),
      `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
    );
    assert.ok(
      String(url).startsWith('https://api.cloudflare.com/client/v4/accounts/account/access/'),
    );
    calls.push({ method, ...(options?.body ? { body: JSON.parse(String(options.body)) } : {}) });
    await hook?.(method, calls.length);
    if (method === 'PUT')
      currentPolicy = { ...(currentPolicy as object), ...calls.at(-1)!.body, updated_at: 'later' };
    return Response.json({
      success: true,
      result: String(url).endsWith('/apps/app') ? currentApp : currentPolicy,
    });
  }) as typeof fetch;
  const trusted = { session, config, registry: () => registry, env, request };
  const input = { operation: 'grant', email, exclusiveEdit: true, confirmRemoval: false };
  return {
    dir,
    config,
    registry,
    trusted,
    input,
    calls,
    household,
    hook: (value: typeof hook) => {
      hook = value;
    },
    app: (value: unknown) => {
      currentApp = value;
    },
    policy: (value: unknown) => {
      currentPolicy = value;
    },
  };
}

test('direct mutation calls deny every non-bootstrap session before registry/API access', async (t) => {
  const f = fixture(t);
  const sessions: SessionState[] = [
    { status: 'not-signed-in' },
    { status: 'unassigned', email: admin },
    { status: 'registry-unavailable' },
    {
      status: 'ok',
      user: { email: 'promoted@example.com', householdId: 'house', role: 'platform_admin' },
    },
    { status: 'household-deactivated', user: { email, householdId: 'house', role: 'member' } },
  ];
  for (const session of sessions) {
    for (const operation of ['grant', 'remove']) {
      const result = await mutateCloudflare(
        { ...f.input, operation, actor: admin, assigned: true },
        {
          ...f.trusted,
          session,
          registry: () => {
            throw Error('must not open');
          },
        },
      );
      assert.equal(result.status, 'error');
    }
  }
  assert.equal(
    (await mutateCloudflare(f.input, { ...f.trusted, config: loadAppConfig({ DATA_DIR: f.dir }) }))
      .status,
    'error',
  );
  assert.equal(f.calls.length, 0);
});

test('grant preserves all unrelated rules/settings and audits actor, intent and verified outcome', async (t) => {
  const f = fixture(t);
  const result = await mutateCloudflare(
    { ...f.input, email: ' NEW@Example.com ', account: 'attacker', policy: {} },
    f.trusted,
  );
  assert.equal(result.status, 'ok');
  assert.match(result.message!, /added and verified/);
  assert.equal(f.calls.filter((c) => c.method === 'PUT').length, 1);
  const body = f.calls.find((c) => c.method === 'PUT')!.body;
  assert.equal(
    fingerprint(body),
    fingerprint({ ...writablePolicy(policy), include: [...policy.include, { email: { email } }] }),
  );
  for (const key of ['id', 'account_id', 'reusable', 'app_count', 'created_at', 'updated_at'])
    assert.ok(!(key in body));
  const audit = listRegistryAudit(f.registry).filter((a) => a.action === 'cloudflare.grant');
  assert.equal(audit.length, 2);
  assert.ok(audit.every((a) => a.actor === admin && a.email === email));
  assert.deepEqual(audit.map((a) => JSON.parse(a.detail!).outcome).sort(), ['changed', 'pending']);
  assert.ok(!JSON.stringify(audit).includes(env.CLOUDFLARE_API_TOKEN));
  assert.ok(resolveIdentity(f.registry, email));
});

test('removal cleans policy-only emails, removes case-insensitive duplicates and preserves conditions', async (t) => {
  const f = fixture(t);
  f.policy({ ...policy, include: [...policy.include, { email: { email: 'OTHER@example.com' } }] });
  const result = await mutateCloudflare(
    { ...f.input, operation: 'remove', email: 'other@example.com', confirmRemoval: true },
    f.trusted,
  );
  assert.equal(result.status, 'ok');
  assert.match(result.message!, /sessions are not revoked/);
  const body = f.calls.find((c) => c.method === 'PUT')!.body;
  assert.deepEqual(body.include, [policy.include[0], policy.include[2]]);
  assert.deepEqual(body.require, policy.require);
  assert.deepEqual(body.exclude, policy.exclude);
});

test('already present/absent are verified safe no-ops', async (t) => {
  const f = fixture(t);
  f.policy({ ...policy, include: [...policy.include, { email: { email: 'NEW@example.com' } }] });
  assert.equal((await mutateCloudflare(f.input, f.trusted)).status, 'ok');
  f.policy(policy);
  assert.equal(
    (await mutateCloudflare({ ...f.input, operation: 'remove', confirmRemoval: true }, f.trusted))
      .status,
    'ok',
  );
  assert.equal(f.calls.filter((c) => c.method === 'PUT').length, 0);
});

test('self-removal, missing assignment, invalid input and missing confirmations fail before API', async (t) => {
  const f = fixture(t);
  for (const input of [
    { ...f.input, operation: 'remove', email: 'ADMIN@example.com', confirmRemoval: true },
    { ...f.input, operation: 'remove' },
    { ...f.input, email: 'unassigned@example.com', assigned: true },
    { ...f.input, email: 'bad' },
    { ...f.input, exclusiveEdit: false },
    { ...f.input, operation: 'replace' },
  ])
    assert.equal((await mutateCloudflare(input, f.trusted)).status, 'error');
  assert.equal(f.calls.length, 0);
});

test('rejects wrong application/AUD/binding, sharing, legacy, decision and unknown schema', async (t) => {
  const f = fixture(t);
  for (const application of [
    { ...app, id: 'wrong' },
    { ...app, aud: 'wrong' },
    { ...app, policies: [] },
  ]) {
    f.app(application);
    assert.equal((await mutateCloudflare(f.input, f.trusted)).status, 'error');
  }
  f.app(app);
  for (const changes of [
    { id: 'wrong' },
    { account_id: 'wrong' },
    { decision: 'bypass' },
    { reusable: false },
    { reusable: undefined },
    { app_count: 2 },
    { app_count: undefined },
    { surprise: true },
    { include: [{ surprise_selector: {} }] },
    { require: [{ email: { email: admin, surprise: true } }] },
    { mfa_config: { surprise: true } },
    { include: 'malformed' },
  ]) {
    f.policy({ ...policy, ...changes });
    assert.equal((await mutateCloudflare(f.input, f.trusted)).status, 'error');
  }
  assert.ok(f.calls.every((c) => c.method === 'GET'));
});

test('last Include rule removal is refused rather than inventing an empty-policy meaning', async (t) => {
  const f = fixture(t);
  f.policy({ ...policy, include: [{ email: { email } }] });
  const result = await mutateCloudflare(
    { ...f.input, operation: 'remove', confirmRemoval: true },
    f.trusted,
  );
  assert.match(result.message!, /last Include/);
  assert.equal(result.status, 'error');
  assert.ok(f.calls.every((c) => c.method === 'GET'));
});

test('reread detects dashboard policy/binding/audience/sharing changes before PUT', async (t) => {
  const f = fixture(t);
  for (const change of [
    () => f.policy({ ...policy, name: 'Edited' }),
    () => f.policy({ ...policy, app_count: 2 }),
    () => f.policy({ ...policy, decision: 'deny' }),
    () => f.app({ ...app, aud: 'changed' }),
    () => f.app({ ...app, policies: [] }),
  ]) {
    f.calls.length = 0;
    f.app(app);
    f.policy(policy);
    f.hook((_, count) => {
      if (count === 3) change();
    });
    assert.equal((await mutateCloudflare(f.input, f.trusted)).status, 'error');
    assert.ok(f.calls.every((c) => c.method === 'GET'));
  }
});

test('grant rechecks registry assignment after provider reads', async (t) => {
  const f = fixture(t);
  f.hook((_, count) => {
    if (count === 4) unassignIdentity(f.registry, { email, actor: admin });
  });
  assert.equal((await mutateCloudflare(f.input, f.trusted)).status, 'error');
  assert.ok(f.calls.every((c) => c.method === 'GET'));
});

test('safety lock rejects a concurrent call and is released for deliberate retry', async (t) => {
  const f = fixture(t);
  let release!: () => void;
  let started!: () => void;
  const waiting = new Promise<void>((resolve) => {
    started = resolve;
  });
  f.hook(async (_, count) => {
    if (count === 1) {
      started();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    }
  });
  const first = mutateCloudflare(f.input, f.trusted);
  await waiting;
  const second = await mutateCloudflare(f.input, f.trusted);
  assert.match(second.message!, /safety lock/);
  assert.equal(f.calls.length, 1);
  release();
  assert.equal((await first).status, 'ok');
  assert.equal((await mutateCloudflare(f.input, f.trusted)).status, 'ok');
  assert.equal(f.calls.filter((c) => c.method === 'PUT').length, 1);
});

test('orphan safety locks are never stolen automatically', async (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.dir, 'system/cloudflare-policy.lock'), '');
  assert.match((await mutateCloudflare(f.input, f.trusted)).message!, /operator review/);
  assert.equal(f.calls.length, 0);
});

test('rejection, timeout, invalid JSON/envelopes are sanitised unknown status; roster remains', async (t) => {
  const f = fixture(t);
  for (const request of [
    async () => new Response(env.CLOUDFLARE_API_TOKEN, { status: 403 }),
    async () => {
      throw new DOMException(env.CLOUDFLARE_API_TOKEN, 'TimeoutError');
    },
    async () => new Response('malformed ' + env.CLOUDFLARE_API_TOKEN),
    async () => Response.json({ success: false, errors: [env.CLOUDFLARE_API_TOKEN] }),
    async () => Response.json({ success: true, result: null }),
  ]) {
    for (const atWrite of [false, true]) {
      const result = await mutateCloudflare(f.input, {
        ...f.trusted,
        request: (async (url, options) =>
          atWrite && options?.method !== 'PUT'
            ? f.trusted.request(url, options)
            : request()) as typeof fetch,
      });
      assert.equal(result.status, 'error');
      assert.match(result.message!, /unknown|malformed/);
      assert.ok(!JSON.stringify(result).includes(env.CLOUDFLARE_API_TOKEN));
      assert.ok(resolveIdentity(f.registry, email));
    }
  }
  assert.ok(!JSON.stringify(listRegistryAudit(f.registry, 100)).includes(env.CLOUDFLARE_API_TOKEN));
});

test('post-write drift is unknown, never automatically rolls back or retries', async (t) => {
  const f = fixture(t);
  f.hook((_, count) => {
    if (count === 6) f.app({ ...app, policies: [] });
  });
  const result = await mutateCloudflare(f.input, f.trusted);
  assert.equal(result.status, 'error');
  assert.match(result.message!, /write outcome is unknown/);
  assert.equal(f.calls.filter((c) => c.method === 'PUT').length, 1);
  assert.ok(listRegistryAudit(f.registry).some((a) => a.detail?.includes('unknown')));
});

test('bootstrap admin recovery session may mutate without changing household status', async (t) => {
  const f = fixture(t);
  assert.equal(
    (
      await mutateCloudflare(f.input, {
        ...f.trusted,
        session: { ...f.trusted.session, status: 'household-deactivated' } as SessionState,
      })
    ).status,
    'ok',
  );
});

test('invalid connection settings never send provider requests', async (t) => {
  const f = fixture(t);
  for (const changes of [
    { CLOUDFLARE_API_TOKEN: '' },
    { CLOUDFLARE_ACCOUNT_ID: '../other' },
    { AUTH_AUDIENCE: '' },
  ]) {
    assert.equal(
      (await mutateCloudflare(f.input, { ...f.trusted, env: { ...env, ...changes } })).status,
      'error',
    );
  }
  assert.equal(f.calls.length, 0);
});

test('audit failure before provider calls prevents writing', async (t) => {
  const f = fixture(t);
  f.registry.exec(
    "CREATE TRIGGER fail_cf_audit BEFORE INSERT ON registry_audit WHEN NEW.action = 'cloudflare.grant' BEGIN SELECT RAISE(FAIL, 'fictional-secret-token'); END;",
  );
  const result = await mutateCloudflare(f.input, f.trusted);
  assert.equal(result.status, 'error');
  assert.equal(f.calls.length, 0);
  assert.ok(!JSON.stringify(result).includes(env.CLOUDFLARE_API_TOKEN));
});

test('audit failure after a write does not claim completion or retry', async (t) => {
  const f = fixture(t);
  f.registry.exec(
    "CREATE TRIGGER fail_cf_outcome BEFORE INSERT ON registry_audit WHEN NEW.action = 'cloudflare.grant' AND json_extract(NEW.detail, '$.outcome') <> 'pending' BEGIN SELECT RAISE(FAIL, 'fictional-secret-token'); END;",
  );
  const result = await mutateCloudflare(f.input, f.trusted);
  assert.equal(result.status, 'error');
  assert.match(result.message!, /audit could not be completed/);
  assert.equal(f.calls.filter((c) => c.method === 'PUT').length, 1);
  assert.ok(resolveIdentity(f.registry, email));
});

test('post-write policy drift is unknown; no replacement rollback is attempted', async (t) => {
  const f = fixture(t);
  f.hook((_, count) => {
    if (count === 7) f.policy({ ...policy, name: 'Concurrent edit after write' });
  });
  const result = await mutateCloudflare(f.input, f.trusted);
  assert.equal(result.status, 'error');
  assert.match(result.message!, /write outcome is unknown/);
  assert.equal(f.calls.filter((c) => c.method === 'PUT').length, 1);
});

test('a successful envelope with an unverified write body never reports success', async (t) => {
  const f = fixture(t);
  const result = await mutateCloudflare(f.input, {
    ...f.trusted,
    request: (async (url, options) => {
      const response = await f.trusted.request(url, options);
      return options?.method === 'PUT'
        ? Response.json({ success: true, result: policy })
        : response;
    }) as typeof fetch,
  });
  assert.equal(result.status, 'error');
  assert.match(result.message!, /write outcome is unknown/);
  assert.equal(f.calls.filter((c) => c.method === 'PUT').length, 1);
});

test('application embedded policy bodies are not mistaken for association edits after our own write', async (t) => {
  const f = fixture(t);
  f.hook((_, count) => {
    if (count === 6)
      f.app({
        ...app,
        updated_at: 'later',
        policies: [{ id: 'policy', include: [...policy.include, { email: { email } }] }],
      });
  });
  assert.equal((await mutateCloudflare(f.input, f.trusted)).status, 'ok');
});
