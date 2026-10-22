import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectCloudflare } from '../src/lib/cloudflare/inspect';

const env = {
  CLOUDFLARE_ACCOUNT_ID: 'account',
  CLOUDFLARE_APPLICATION_ID: 'app',
  CLOUDFLARE_POLICY_ID: 'policy',
  CLOUDFLARE_API_TOKEN: 'secret-token',
  AUTH_AUDIENCE: 'aud',
};
function mock(app: unknown, policy: unknown, status = 200): typeof fetch {
  return (async (url, options) => {
    assert.equal(options?.method, 'GET');
    assert.equal(options?.cache, 'no-store');
    assert.equal(options?.redirect, 'error');
    assert.ok(
      String(url).startsWith(
        'https://api.cloudflare.com/client/v4/accounts/account/access/apps/app',
      ),
    );
    return new Response(
      JSON.stringify({
        success: true,
        result: String(url).endsWith('/policies/policy') ? policy : app,
      }),
      { status },
    );
  }) as typeof fetch;
}
const app = { id: 'app', name: 'Finance', aud: 'aud', policies: [{ id: 'policy' }] };
const policy = {
  id: 'policy',
  name: 'Finance emails',
  decision: 'allow',
  include: [{ email: { email: 'Alex@example.com' } }],
};
test('missing configuration makes no request', async () => {
  assert.equal(
    (
      await inspectCloudflare({}, (() => {
        throw Error('must not fetch');
      }) as typeof fetch)
    ).status,
    'unconfigured',
  );
});
test('reads and normalises direct emails without writes', async () => {
  assert.deepEqual(await inspectCloudflare(env, mock(app, policy)), {
    status: 'ok',
    application: 'Finance',
    policy: 'Finance emails',
    emails: ['alex@example.com'],
    complex: false,
  });
});
test('flags groups and additional constraints rather than claiming effective access', async () => {
  const result = await inspectCloudflare(
    env,
    mock(app, {
      ...policy,
      include: [...policy.include, { everyone: {} }],
      require: [{ email_domain: { domain: 'example.com' } }],
    }),
  );
  assert.ok(result.status === 'ok' && result.complex);
});
test('rejects audience, association, decision and schema mismatches', async () => {
  for (const [application, rule] of [
    [{ ...app, aud: 'other' }, policy],
    [{ ...app, policies: [] }, policy],
    [app, { ...policy, decision: 'bypass' }],
    [app, { ...policy, id: 'other' }],
    [app, {}],
  ]) {
    assert.equal((await inspectCloudflare(env, mock(application, rule))).status, 'error');
  }
});
test('provider failures never expose response bodies or credentials', async () => {
  const result = await inspectCloudflare(env, mock({ secret: env.CLOUDFLARE_API_TOKEN }, {}, 403));
  assert.equal(result.status, 'error');
  assert.ok(!JSON.stringify(result).includes('secret-token'));
});
test('network failures are unknown and secrets are redacted', async () => {
  const result = await inspectCloudflare(env, (async () => {
    throw Error('secret-token');
  }) as typeof fetch);
  assert.equal(result.status, 'error');
  assert.ok(!JSON.stringify(result).includes('secret-token'));
});
