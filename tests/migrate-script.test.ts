import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { describe, it } from 'node:test';
import { householdDatabasePath } from '../src/lib/registry/paths';
import { seedTestRegistry } from './helpers';

/**
 * Proves the exact production path: docker-entrypoint.sh migrates the registry
 * first, then `scripts/migrate.cjs` must create/upgrade every registered
 * tenant database and exit zero. The inherited root-level database path is
 * deliberately not created or migrated.
 */
describe('scripts/migrate.cjs (production tenant migration runner)', () => {
  it('migrates every registered household and is idempotent on re-run', async () => {
    const dir = path.join(
      tmpdir(),
      `sf-migrate-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    mkdirSync(dir, { recursive: true });
    const householdId = await seedTestRegistry(dir, [{ email: 'alex@example.com' }]);
    const databasePath = householdDatabasePath(dir, householdId);
    const unregisteredDatabasePath = householdDatabasePath(dir, 'b'.repeat(32));
    mkdirSync(path.dirname(unregisteredDatabasePath), { recursive: true });
    const script = path.resolve('scripts/migrate.cjs');

    for (let run = 1; run <= 2; run += 1) {
      const output = execFileSync('node', [script], {
        env: { ...process.env, DATA_DIR: dir, DATABASE_PATH: path.join(dir, 'wrong.sqlite') },
        encoding: 'utf8',
      });
      assert.match(output, /\[migrate\] database is up to date/);
    }

    assert.equal(existsSync(path.join(dir, 'simple-finance.sqlite')), false);
    assert.equal(existsSync(path.join(dir, 'wrong.sqlite')), false);
    assert.equal(
      existsSync(unregisteredDatabasePath),
      false,
      'a household directory absent from the registry is not migrated',
    );
    const db = new Database(databasePath, { readonly: true });
    try {
      const tables = new Set(
        (
          db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
            name: string;
          }>
        ).map((row) => row.name),
      );
      for (const expected of ['pots', 'checkpoints', 'audit_entries', '__drizzle_migrations']) {
        assert.ok(tables.has(expected), `expected table ${expected}`);
      }
    } finally {
      db.close();
    }
  });

  it('does not create a root-level finance database when the registry is empty', () => {
    const dir = path.join(
      tmpdir(),
      `sf-migrate-empty-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    mkdirSync(path.join(dir, 'system'), { recursive: true });
    const output = execFileSync('node', [path.resolve('scripts/migrate.cjs')], {
      env: { ...process.env, DATA_DIR: dir },
      encoding: 'utf8',
    });
    assert.match(output, /no registered households/);
    assert.equal(existsSync(path.join(dir, 'simple-finance.sqlite')), false);
  });
});
