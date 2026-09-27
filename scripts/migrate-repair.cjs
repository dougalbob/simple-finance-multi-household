#!/usr/bin/env node
'use strict';

/**
 * Production twin of src/lib/db/migrate-repair.ts (see that file for the full
 * rationale). Kept in plain CJS with production dependencies only because the
 * container entrypoint runs `scripts/migrate.cjs` without a TypeScript
 * toolchain (AGENT_APP_BLUEPRINT.md §7). tests/migrate-upgrade.test.ts runs
 * both implementations against identical fixtures and asserts they agree —
 * change one, change both.
 *
 * Aligns each `__drizzle_migrations` row's `created_at` with the checked-in
 * journal (matched by sha256 of the migration .sql — the same value drizzle
 * stores). v0.23.0 shipped with an out-of-order journal stamp that made
 * drizzle's migrator silently skip migration 0012 on every upgraded database;
 * this repair converges databases that recorded the old stamp. It never
 * touches application data.
 */

const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function repairMigrationJournal(raw, migrationsFolder) {
  const journalPath = path.join(migrationsFolder, 'meta', '_journal.json');
  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));

  const expected = new Map();
  for (const entry of journal.entries) {
    const sql = fs.readFileSync(path.join(migrationsFolder, `${entry.tag}.sql`), 'utf8');
    expected.set(createHash('sha256').update(sql).digest('hex'), entry);
  }

  const table = raw
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'",
    )
    .get();
  if (table === undefined) return [];

  const rows = raw.prepare('SELECT hash, created_at FROM __drizzle_migrations').all();

  const reDates = [];
  const updates = [];
  for (const row of rows) {
    const entry = expected.get(row.hash);
    if (entry === undefined) continue;
    const recorded = row.created_at === null ? null : Number(row.created_at);
    if (recorded === null || recorded !== entry.when) {
      reDates.push({ tag: entry.tag, from: recorded, to: entry.when });
      updates.push({ when: entry.when, hash: row.hash });
    }
  }
  if (updates.length === 0) return [];

  const update = raw.prepare('UPDATE __drizzle_migrations SET created_at = ? WHERE hash = ?');
  raw.transaction(() => {
    for (const { when, hash } of updates) update.run(when, hash);
  })();
  return reDates;
}

module.exports = { repairMigrationJournal };
