import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadAppConfig } from '../src/lib/config';
import { closeDbHandles } from '../src/lib/db/client';
import { householdContextFromHeaders } from '../src/lib/auth/household-context';
import { openRegistry } from '../src/lib/registry/db';
import { assignIdentity, createHousehold } from '../src/lib/registry/domain';
import {
  householdDatabasePath,
  householdDocumentsDir,
  systemRegistryPath,
} from '../src/lib/registry/paths';
import { createPot, listPots } from '../src/lib/records/pots';
import { headerSource, makeTempDir } from './helpers';

describe('request household context', () => {
  it('uses only the active registry assignment and keeps concurrent tenant contexts isolated', async () => {
    const dataDir = await makeTempDir('sf-household-context-');
    closeDbHandles();
    const registry = openRegistry(systemRegistryPath(dataDir));
    try {
      const householdA = createHousehold(registry, {
        displayName: 'Alex household',
        actor: 'system',
      });
      const householdB = createHousehold(registry, {
        displayName: 'Sam household',
        actor: 'system',
      });
      assignIdentity(registry, {
        email: 'alex@example.com',
        householdId: householdA.id,
        actor: 'system',
      });
      assignIdentity(registry, {
        email: 'sam@example.com',
        householdId: householdB.id,
        actor: 'system',
      });

      const configA = loadAppConfig({
        NODE_ENV: 'test',
        DATA_DIR: dataDir,
        AUTH_DEV_BYPASS: 'true',
        AUTH_DEV_IDENTITY_EMAIL: 'alex@example.com',
      });
      const configB = loadAppConfig({
        NODE_ENV: 'test',
        DATA_DIR: dataDir,
        AUTH_DEV_BYPASS: 'true',
        AUTH_DEV_IDENTITY_EMAIL: 'sam@example.com',
      });

      const alex = await householdContextFromHeaders(
        headerSource({ 'x-household-id': householdB.id }),
        configA,
        registry,
      );
      const sam = await householdContextFromHeaders(headerSource({}), configB, registry);
      const alexAgain = await householdContextFromHeaders(headerSource({}), configA, registry);

      assert.ok(alex !== null);
      assert.ok(sam !== null);
      assert.ok(alexAgain !== null);
      assert.equal(alex.householdId, householdA.id, 'a supplied tenant header cannot select B');
      assert.equal(sam.householdId, householdB.id, 'Sam resolves through his registry assignment');
      assert.equal(alex.documentsDir, householdDocumentsDir(dataDir, householdA.id));
      assert.equal(sam.documentsDir, householdDocumentsDir(dataDir, householdB.id));
      assert.equal(alex.dbHandle.raw.name, householdDatabasePath(dataDir, householdA.id));
      assert.equal(sam.dbHandle.raw.name, householdDatabasePath(dataDir, householdB.id));
      assert.equal(alexAgain.dbHandle, alex.dbHandle, 'A keeps its cached handle after B resolves');
      assert.equal(alex.dbHandle.raw.open, true);
      assert.equal(sam.dbHandle.raw.open, true);
      assert.ok(Object.isFrozen(alex), 'request context is immutable');

      createPot(alex.db, { label: 'Alex-only pot', kind: 'cash', actor: alex.email });
      createPot(sam.db, { label: 'Sam-only pot', kind: 'bank', actor: sam.email });
      assert.deepEqual(
        listPots(alex.db).map((pot) => pot.label),
        ['Alex-only pot'],
      );
      assert.deepEqual(
        listPots(sam.db).map((pot) => pot.label),
        ['Sam-only pot'],
      );
    } finally {
      closeDbHandles();
      registry.close();
    }
  });
});
