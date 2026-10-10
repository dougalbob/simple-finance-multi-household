#!/usr/bin/env node
/**
 * System registry migration runner — production twin of
 * `src/lib/registry/schema.ts` (the canonical implementation; this image has
 * no TypeScript toolchain, blueprint §7). Both read the same SQL at
 * `drizzle/registry/*.sql` and record applications in the same
 * `registry_migrations` table; `tests/registry-migrations.test.ts` pins that
 * the two runners produce identical schemas.
 *
 * Invoked by docker-entrypoint.sh before the server starts (migration failure
 * exits non-zero so the entrypoint refuses to start), and available as
 * `npm run db:migrate:registry`. Uses production dependencies only.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

function resolveRegistryPath() {
  const configuredDataDir = process.env.DATA_DIR?.trim();
  const dataDir = configuredDataDir || (process.env.NODE_ENV === 'production' ? '/data' : './data');
  return path.join(dataDir, 'system', 'registry.sqlite');
}

function loadMigrations(folder) {
  const migrations = [];
  for (const entry of fs.readdirSync(folder).sort()) {
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
    if (migrations[i].version <= migrations[i - 1].version) {
      throw new Error(
        `registry migration versions must strictly increase: ${migrations[i - 1].name}, ${migrations[i].name}`,
      );
    }
  }
  return migrations;
}

const registryPath = resolveRegistryPath();
fs.mkdirSync(path.dirname(registryPath), { recursive: true });

const raw = new Database(registryPath);
raw.pragma('journal_mode = WAL');
raw.pragma('foreign_keys = ON');

try {
  raw.exec(
    'CREATE TABLE IF NOT EXISTS registry_migrations (' +
      'version INTEGER PRIMARY KEY,' +
      'name TEXT NOT NULL,' +
      'applied_at TEXT NOT NULL' +
      ')',
  );
  const applied = new Set(
    raw
      .prepare('SELECT version FROM registry_migrations')
      .all()
      .map((row) => row.version),
  );
  for (const migration of loadMigrations(path.join(__dirname, '..', 'drizzle', 'registry'))) {
    if (applied.has(migration.version)) continue;
    raw.exec('BEGIN IMMEDIATE');
    try {
      raw.exec(migration.sql);
      raw
        .prepare('INSERT INTO registry_migrations (version, name, applied_at) VALUES (?, ?, ?)')
        .run(migration.version, migration.name, new Date().toISOString());
      raw.exec('COMMIT');
    } catch (error) {
      raw.exec('ROLLBACK');
      throw error;
    }
    console.log(`[registry-migrate] applied ${migration.name}`);
  }
  console.log(`[registry-migrate] registry is up to date: ${registryPath}`);
} catch (err) {
  console.error('[registry-migrate] FAILED:', err && err.message ? err.message : err);
  process.exitCode = 1;
} finally {
  raw.close();
}
