import fs from 'node:fs';
import path from 'node:path';
import type { RawDatabase } from '../db/client';

/**
 * Versioned migration runner for the system registry
 * (`<dataDir>/system/registry.sqlite`). The SQL itself lives in
 * `drizzle/registry/*.sql`; a file's four-digit prefix is its ordering key and
 * `registry_migrations` records what has been applied. `scripts/registry-migrate.cjs`
 * is the production twin (no TypeScript toolchain in the image) and
 * `tests/registry-migrations.test.ts` pins that both runners agree.
 *
 * Deliberately not the drizzle journal: the finance journal at `./drizzle` is
 * one per household database, while this schema is a single control-plane
 * database with its own lifecycle. A shipped migration file's SQL is frozen
 * (decision 172's rule) — add a new numbered file to change the schema.
 */

const MIGRATIONS_TABLE = 'registry_migrations';

export interface RegistryMigrationFile {
  /** Numeric ordering key parsed from the filename prefix (`0001_…` → 1). */
  version: number;
  name: string;
  sql: string;
}

export function registryMigrationsFolder(): string {
  return path.resolve(process.cwd(), 'drizzle', 'registry');
}

/** Load `NNNN_name.sql` files, ordered by version. Throws on a malformed name. */
export function loadRegistryMigrations(
  folder: string = registryMigrationsFolder(),
): RegistryMigrationFile[] {
  const entries = fs.readdirSync(folder).sort();
  const migrations: RegistryMigrationFile[] = [];
  for (const entry of entries) {
    const match = /^(\d{4})_[a-z0-9_]+\.sql$/.exec(entry);
    if (match === null) {
      if (entry.endsWith('.sql')) {
        throw new Error(
          `registry migration filename is malformed: ${entry} (expected NNNN_name.sql)`,
        );
      }
      continue;
    }
    migrations.push({
      version: Number(match[1]),
      name: entry,
      sql: fs.readFileSync(path.join(folder, entry), 'utf8'),
    });
  }
  for (let i = 1; i < migrations.length; i += 1) {
    const previous = migrations[i - 1];
    const current = migrations[i];
    if (previous === undefined || current === undefined) continue;
    if (current.version <= previous.version) {
      throw new Error(
        `registry migration versions must strictly increase: ${previous.name}, ${current.name}`,
      );
    }
  }
  return migrations;
}

/**
 * Apply every pending registry migration. Idempotent: each file runs exactly
 * once, in one transaction, recorded in `registry_migrations`. The transaction
 * is IMMEDIATE so two first-requests racing on a fresh file cannot both apply
 * the same migration.
 */
export function applyRegistryMigrations(
  raw: RawDatabase,
  folder: string = registryMigrationsFolder(),
): void {
  raw.exec(
    `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (` +
      'version INTEGER PRIMARY KEY,' +
      'name TEXT NOT NULL,' +
      'applied_at TEXT NOT NULL' +
      ')',
  );
  const applied = new Set(
    raw
      .prepare(`SELECT version FROM ${MIGRATIONS_TABLE}`)
      .all()
      .map((row) => (row as { version: number }).version),
  );
  for (const migration of loadRegistryMigrations(folder)) {
    if (applied.has(migration.version)) continue;
    raw.exec('BEGIN IMMEDIATE');
    try {
      raw.exec(migration.sql);
      raw
        .prepare(`INSERT INTO ${MIGRATIONS_TABLE} (version, name, applied_at) VALUES (?, ?, ?)`)
        .run(migration.version, migration.name, new Date().toISOString());
      raw.exec('COMMIT');
    } catch (error) {
      raw.exec('ROLLBACK');
      throw error;
    }
  }
}
