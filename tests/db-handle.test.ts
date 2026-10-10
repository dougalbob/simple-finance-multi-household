import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cpSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { loadAppConfig } from '../src/lib/config';
import { closeDbHandles, getHouseholdDbHandle, openDatabase } from '../src/lib/db/client';
import { applyMigrations } from '../src/lib/db/migrate';
import { householdDatabasePath } from '../src/lib/registry/paths';
import { createPot, listPots } from '../src/lib/records/pots';
import { makeTempDir } from './helpers';

const HOUSEHOLD_A = 'a'.repeat(32);
const HOUSEHOLD_B = 'b'.repeat(32);

describe('per-household database handle cache', () => {
  it('returns the same live tenant handle twice for a relative data root', async () => {
    const originalCwd = process.cwd();
    const dir = await makeTempDir('sf-db-handle-');
    cpSync(path.join(originalCwd, 'drizzle'), path.join(dir, 'drizzle'), { recursive: true });
    process.chdir(dir);
    closeDbHandles();
    try {
      const config = loadAppConfig({ NODE_ENV: 'development', DATA_DIR: 'relative-data' });
      const first = getHouseholdDbHandle(HOUSEHOLD_A, config);
      createPot(first.db, { label: 'Main account', kind: 'bank', actor: 'alex@example.com' });

      const second = getHouseholdDbHandle(HOUSEHOLD_A, config);
      assert.equal(second, first, 'the same tenant path returns the cached handle');
      assert.equal(first.raw.open, true, 'the first connection remains open');
      assert.deepEqual(
        listPots(first.db).map((pot) => pot.label),
        ['Main account'],
      );
    } finally {
      closeDbHandles();
      process.chdir(originalCwd);
    }
  });

  it('keeps simultaneous household handles and data independent', async () => {
    const dir = await makeTempDir('sf-db-tenants-');
    const config = loadAppConfig({ NODE_ENV: 'test', DATA_DIR: dir });
    closeDbHandles();
    try {
      const handleA = getHouseholdDbHandle(HOUSEHOLD_A, config);
      const handleB = getHouseholdDbHandle(HOUSEHOLD_B, config);
      createPot(handleA.db, { label: 'A only', kind: 'cash', actor: 'alex@example.com' });
      createPot(handleB.db, { label: 'B only', kind: 'bank', actor: 'sam@example.com' });

      assert.notEqual(handleA, handleB);
      assert.equal(handleA.raw.open, true, 'opening B must not close A');
      assert.equal(handleB.raw.open, true);
      assert.deepEqual(
        listPots(handleA.db).map((pot) => pot.label),
        ['A only'],
      );
      assert.deepEqual(
        listPots(handleB.db).map((pot) => pot.label),
        ['B only'],
      );
      assert.equal(handleA.raw.name, householdDatabasePath(dir, HOUSEHOLD_A));
      assert.equal(handleB.raw.name, householdDatabasePath(dir, HOUSEHOLD_B));
    } finally {
      closeDbHandles();
    }
  });

  it('reopens only the replaced tenant file while retaining other tenant handles', async () => {
    const dir = await makeTempDir('sf-live-swap-');
    const config = loadAppConfig({ NODE_ENV: 'test', DATA_DIR: dir });
    closeDbHandles();
    try {
      const liveA = getHouseholdDbHandle(HOUSEHOLD_A, config);
      const liveB = getHouseholdDbHandle(HOUSEHOLD_B, config);
      createPot(liveA.db, { label: 'Before replacement', kind: 'cash', actor: 'alex@example.com' });
      createPot(liveB.db, { label: 'B stays live', kind: 'bank', actor: 'sam@example.com' });

      const replacementPath = path.join(dir, 'replacement.sqlite');
      const replacement = openDatabase(replacementPath);
      try {
        applyMigrations(replacement.db);
        createPot(replacement.db, {
          label: 'After replacement',
          kind: 'bank',
          actor: 'alex@example.com',
        });
        replacement.raw.pragma('wal_checkpoint(TRUNCATE)');
      } finally {
        replacement.raw.close();
      }

      const tenantPath = householdDatabasePath(dir, HOUSEHOLD_A);
      fs.renameSync(tenantPath, `${tenantPath}.before-replacement`);
      for (const suffix of ['-wal', '-shm']) {
        const current = `${tenantPath}${suffix}`;
        if (fs.existsSync(current)) fs.renameSync(current, `${current}.before-replacement`);
      }
      fs.renameSync(replacementPath, tenantPath);

      const reopenedA = getHouseholdDbHandle(HOUSEHOLD_A, config);
      const stillLiveB = getHouseholdDbHandle(HOUSEHOLD_B, config);
      assert.notEqual(reopenedA, liveA, 'the changed file identity reopens only tenant A');
      assert.equal(stillLiveB, liveB);
      assert.equal(liveA.raw.open, false);
      assert.equal(liveB.raw.open, true);
      assert.deepEqual(
        listPots(reopenedA.db).map((pot) => pot.label),
        ['After replacement'],
      );
      assert.deepEqual(
        listPots(stillLiveB.db).map((pot) => pot.label),
        ['B stays live'],
      );
    } finally {
      closeDbHandles();
    }
  });

  it('refuses malformed IDs before creating a database path', async () => {
    const dir = await makeTempDir('sf-invalid-household-');
    const config = loadAppConfig({ NODE_ENV: 'test', DATA_DIR: dir });
    assert.throws(() => getHouseholdDbHandle('../outside', config), /household ID/i);
    assert.deepEqual(fs.readdirSync(dir), []);
  });
});
