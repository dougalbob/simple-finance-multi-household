#!/usr/bin/env node
/**
 * Simple Finance migration runner (AGENT_APP_BLUEPRINT.md §7).
 * Invoked by docker-entrypoint.sh before the server starts, and available as
 * `npm run db:migrate`. Uses production dependencies only — no TypeScript
 * toolchain needed in the container. Migration failure exits non-zero so the
 * entrypoint refuses to start the server.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { drizzle } = require('drizzle-orm/better-sqlite3');
const { migrate } = require('drizzle-orm/better-sqlite3/migrator');
const { repairMigrationJournal } = require('./migrate-repair.cjs');

function resolveDatabasePath() {
  const dataDir = (
    process.env.DATA_DIR || (process.env.NODE_ENV === 'production' ? '/data' : './data')
  ).trim();
  return (process.env.DATABASE_PATH || path.join(dataDir, 'simple-finance.sqlite')).trim();
}

const databasePath = resolveDatabasePath();
fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const raw = new Database(databasePath);
raw.pragma('journal_mode = WAL');
raw.pragma('foreign_keys = ON');

const migrationsFolder = path.join(__dirname, '..', 'drizzle');

// Repair migration bookkeeping BEFORE the migrator runs: it orders by the
// single newest recorded stamp, so a stale stamp (see v0.23.0's skipped 0012)
// must be re-dated first or the pending migration is silently skipped again.
const reDates = repairMigrationJournal(raw, migrationsFolder);
for (const reDate of reDates) {
  console.log(
    `[migrate-repair] re-dated ${reDate.tag}: ${reDate.from ?? 'null'} -> ${reDate.to}` +
      ' (journal stamp correction; see docs/RELEASE_NOTES_v0.23.1.md)',
  );
}

try {
  const db = drizzle(raw);
  migrate(db, { migrationsFolder });
  console.log(`[migrate] database is up to date: ${databasePath}`);
} catch (err) {
  console.error('[migrate] FAILED:', err && err.message ? err.message : err);
  process.exitCode = 1;
} finally {
  raw.close();
}
