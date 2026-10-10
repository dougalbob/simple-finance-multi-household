import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import type { RawDatabase } from '../src/lib/db/client';
import { openRegistry } from '../src/lib/registry/db';
import {
  applyRegistryMigrations,
  loadRegistryMigrations,
  registryMigrationsFolder,
} from '../src/lib/registry/schema';
import { systemRegistryPath } from '../src/lib/registry/paths';
import { makeTempDir } from './helpers';

/**
 * Registry migrations: the SQL at `drizzle/registry/*.sql` applies exactly
 * once per registry, is safe to re-run, and the production CJS twin
 * (`scripts/registry-migrate.cjs`, what the container entrypoint runs) builds
 * a byte-identical schema to the canonical TypeScript runner.
 */
describe('registry migrations', () => {
  let dataDir: string;
  let raw: RawDatabase;

  before(async () => {
    dataDir = await makeTempDir('sf-registry-migrate-');
    raw = openRegistry(systemRegistryPath(dataDir));
  });

  after(() => {
    raw.close();
  });

  function schemaSql(db: RawDatabase): string {
    return db
      .prepare(
        "SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
      )
      .all()
      .map((row) => {
        const r = row as { type: string; name: string; sql: string | null };
        return `${r.type} ${r.name}\n${r.sql ?? ''}`;
      })
      .join('\n---\n');
  }

  it('ships ordered NNNN_name.sql migrations and applies them exactly once', () => {
    const migrations = loadRegistryMigrations(registryMigrationsFolder());
    assert.ok(migrations.length >= 1);
    assert.equal(migrations[0]?.name, '0001_initial.sql');
    // Idempotent: a second run applies nothing and changes no schema.
    const before = schemaSql(raw);
    applyRegistryMigrations(raw);
    applyRegistryMigrations(raw);
    assert.equal(schemaSql(raw), before);
    const applied = raw
      .prepare('SELECT version FROM registry_migrations ORDER BY version')
      .all() as Array<{
      version: number;
    }>;
    assert.deepEqual(
      applied.map((r) => r.version),
      migrations.map((m) => m.version),
    );
  });

  it('creates the roster tables with their uniqueness and check constraints', () => {
    const tables = raw
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((r) => (r as { name: string }).name);
    for (const table of ['households', 'identities', 'registry_audit', 'registry_migrations']) {
      assert.ok(tables.includes(table), `missing table ${table}`);
    }
    const unique = raw
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'identities_email_unique'",
      )
      .get() as { sql: string } | undefined;
    assert.ok(unique !== undefined && unique.sql.includes('email'));
  });

  it('the production CJS twin builds the same schema', () => {
    const twinDir = path.join(dataDir, 'twin');
    execFileSync(process.execPath, [path.join(process.cwd(), 'scripts', 'registry-migrate.cjs')], {
      env: { ...process.env, DATA_DIR: twinDir },
      stdio: 'pipe',
    });
    const twin = openRegistry(systemRegistryPath(twinDir));
    try {
      // Same objects (names + SQL), allowing only for the runner's own
      // bookkeeping rows to differ in applied_at timestamps.
      assert.equal(schemaSql(twin), schemaSql(raw));
    } finally {
      twin.close();
    }
  });

  it('refuses a malformed migration filename', () => {
    const dir = path.join(dataDir, 'bad-migrations');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'oops.sql'), 'SELECT 1;');
    assert.throws(() => loadRegistryMigrations(dir), /malformed/);
  });
});
