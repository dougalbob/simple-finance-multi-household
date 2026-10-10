#!/usr/bin/env node
/**
 * Per-household finance migration runner — production startup twin for
 * `src/lib/db/client.ts` (AGENT_APP_BLUEPRINT.md §7). It discovers household
 * IDs from the trusted system registry and derives each tenant path as
 * `<DATA_DIR>/households/<opaque-id>/simple-finance.sqlite`; it deliberately
 * ignores legacy DATABASE_PATH overrides and never opens
 * `<DATA_DIR>/simple-finance.sqlite`.
 *
 * docker-entrypoint.sh runs the registry migrator first, then this script.
 * Migration failure exits non-zero so the container refuses to start. A new
 * household created while the app is running is migrated on its first request
 * by `getHouseholdDbHandle` (idempotently, from the same checked-in drizzle
 * migrations). Uses production dependencies only.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { drizzle } = require('drizzle-orm/better-sqlite3');
const { migrate } = require('drizzle-orm/better-sqlite3/migrator');
const { repairMigrationJournal } = require('./migrate-repair.cjs');

const HOUSEHOLD_ID_PATTERN = /^[a-f0-9]{32}$/;

function dataDirectory() {
  const configured = process.env.DATA_DIR?.trim();
  return configured || (process.env.NODE_ENV === 'production' ? '/data' : './data');
}

function registeredHouseholds(registryPath) {
  if (!fs.existsSync(registryPath)) {
    console.log(
      `[migrate] no system registry yet; no household databases to migrate: ${registryPath}`,
    );
    return [];
  }

  const registry = new Database(registryPath, { readonly: true, fileMustExist: true });
  try {
    return registry
      .prepare('SELECT id FROM households ORDER BY id')
      .all()
      .map((row) => {
        if (typeof row.id !== 'string' || !HOUSEHOLD_ID_PATTERN.test(row.id)) {
          throw new Error(`registry contains an invalid household ID: ${String(row.id)}`);
        }
        return row.id;
      });
  } finally {
    registry.close();
  }
}

function migrateHousehold(databasePath, migrationsFolder) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const raw = new Database(databasePath);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');
  raw.pragma('busy_timeout = 5000');

  try {
    // Repair migration bookkeeping BEFORE the migrator runs: it orders by the
    // newest recorded stamp, so stale stamps must be re-dated first (v0.23.0
    // incident; see docs/RELEASE_NOTES_v0.23.1.md). This changes no finance rows.
    const reDates = repairMigrationJournal(raw, migrationsFolder);
    for (const reDate of reDates) {
      console.log(
        `[migrate-repair] re-dated ${reDate.tag}: ${reDate.from ?? 'null'} -> ${reDate.to}` +
          ' (journal stamp correction; see docs/RELEASE_NOTES_v0.23.1.md)',
      );
    }

    migrate(drizzle(raw), { migrationsFolder });
    console.log(`[migrate] database is up to date: ${databasePath}`);
  } finally {
    raw.close();
  }
}

const dataDir = dataDirectory();
const registryPath = path.join(dataDir, 'system', 'registry.sqlite');
const migrationsFolder = path.join(__dirname, '..', 'drizzle');

try {
  const households = registeredHouseholds(registryPath);
  for (const householdId of households) {
    const databasePath = path.join(dataDir, 'households', householdId, 'simple-finance.sqlite');
    migrateHousehold(databasePath, migrationsFolder);
  }
  if (households.length === 0) {
    console.log('[migrate] no registered households; skipped finance migrations');
  }
} catch (err) {
  console.error('[migrate] FAILED:', err && err.message ? err.message : err);
  process.exitCode = 1;
}
