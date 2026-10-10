import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { POST as seenPost } from '../src/app/api/attention/seen/route';
import { householdContextFromHeaders } from '../src/lib/auth/household-context';
import { loadAppConfig } from '../src/lib/config';
import { closeDbHandles } from '../src/lib/db/client';
import { getBellSeenAt } from '../src/lib/records/bell-seen';
import { closeRegistry, openRegistry } from '../src/lib/registry/db';
import { assignIdentity, createHousehold } from '../src/lib/registry/domain';
import { systemRegistryPath } from '../src/lib/registry/paths';
import { headerSource, makeTempDir } from './helpers';

describe('POST /api/attention/seen tenant isolation', () => {
  let dataDir: string;
  let householdA: string;
  let householdB: string;

  before(async () => {
    dataDir = await makeTempDir('sf-attention-route-');
    process.env.DATA_DIR = dataDir;
    process.env.AUTH_DEV_BYPASS = 'true';

    const registry = openRegistry(systemRegistryPath(dataDir));
    try {
      const a = createHousehold(registry, { displayName: 'Alex test household', actor: 'system' });
      const b = createHousehold(registry, { displayName: 'Sam test household', actor: 'system' });
      householdA = a.id;
      householdB = b.id;
      assignIdentity(registry, { email: 'alex@example.com', householdId: a.id, actor: 'system' });
      assignIdentity(registry, { email: 'sam@example.com', householdId: b.id, actor: 'system' });
    } finally {
      registry.close();
    }
  });

  after(() => {
    closeDbHandles();
    closeRegistry();
    delete process.env.DATA_DIR;
    delete process.env.AUTH_DEV_BYPASS;
    delete process.env.AUTH_DEV_IDENTITY_EMAIL;
  });

  function seenRequest(selectedHouseholdId: string): Request {
    return new Request('http://localhost:3000/api/attention/seen', {
      method: 'POST',
      headers: { 'x-household-id': selectedHouseholdId },
    });
  }

  it('writes only to the assigned tenant even when a different ID is supplied', async () => {
    process.env.AUTH_DEV_IDENTITY_EMAIL = 'alex@example.com';
    const responseA = await seenPost(seenRequest(householdB));
    assert.equal(responseA.status, 200);
    assert.equal(responseA.headers.get('cache-control'), 'private, no-store');

    const alexConfig = loadAppConfig({
      NODE_ENV: 'test',
      DATA_DIR: dataDir,
      AUTH_DEV_BYPASS: 'true',
      AUTH_DEV_IDENTITY_EMAIL: 'alex@example.com',
    });
    const samConfig = loadAppConfig({
      NODE_ENV: 'test',
      DATA_DIR: dataDir,
      AUTH_DEV_BYPASS: 'true',
      AUTH_DEV_IDENTITY_EMAIL: 'sam@example.com',
    });
    const alex = await householdContextFromHeaders(headerSource({}), alexConfig);
    const sam = await householdContextFromHeaders(headerSource({}), samConfig);
    assert.ok(alex !== null);
    assert.ok(sam !== null);
    const alexSeenAt = getBellSeenAt(alex.db, alex.email);
    assert.ok(alexSeenAt instanceof Date);
    assert.equal(getBellSeenAt(sam.db, sam.email), null, 'A cannot mark B as seen');

    process.env.AUTH_DEV_IDENTITY_EMAIL = 'sam@example.com';
    const responseB = await seenPost(seenRequest(householdA));
    assert.equal(responseB.status, 200);
    assert.ok(getBellSeenAt(sam.db, sam.email) instanceof Date);
    assert.equal(getBellSeenAt(alex.db, alex.email)?.getTime(), alexSeenAt.getTime());
  });
});
