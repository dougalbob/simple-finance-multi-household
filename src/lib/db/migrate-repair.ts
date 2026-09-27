import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { RawDatabase } from './client';

/**
 * Repair migration bookkeeping before drizzle's migrator runs.
 *
 * drizzle's better-sqlite3 migrator decides what to apply by comparing each
 * journal entry's `when` stamp against ONLY the newest `created_at` recorded
 * in `__drizzle_migrations` (it selects `ORDER BY created_at DESC LIMIT 1`).
 * A journal entry stamped earlier than an already-recorded entry is therefore
 * silently skipped on every upgraded database, while fresh databases — which
 * have no rows yet — apply everything in order.
 *
 * That is exactly how v0.23.0 shipped broken: `0011_schedule_excluded_months`
 * had been hand-stamped with the round, future-dated `1790600000000`
 * (2026-09-28 13:06 UTC) while `0012_credit_card_pots` carried its real
 * generation stamp `1790506141836` (2026-09-27 10:49 UTC). Every installation
 * upgraded from v0.20.0+ silently skipped 0012 and failed at runtime with
 * `no such column: credit_card_payment_day_of_month`. The journal entry for
 * 0011 is re-dated in this repo (see docs/RELEASE_NOTES_v0.23.1.md); this
 * repair converges databases that recorded the old stamp.
 *
 * What it does: aligns each `__drizzle_migrations` row's `created_at` with
 * the checked-in journal, matched by content hash (sha256 of the `.sql` file —
 * the same value drizzle stores). Rows that already agree are untouched; rows
 * whose hash is not in the journal (foreign migration history) are left alone
 * and still participate in the migrator's ordering. It never touches
 * application data, only migration bookkeeping.
 *
 * Matching is by hash, never by row id: drizzle declares the table with
 * `id SERIAL PRIMARY KEY`, which in SQLite is not an INTEGER PRIMARY KEY, so
 * every row's id is NULL.
 *
 * This module is the canonical implementation; `scripts/migrate-repair.cjs`
 * is its production-dependency-only twin for the container entrypoint (no
 * TypeScript toolchain in the image), and `tests/migrate-upgrade.test.ts`
 * proves the two agree.
 */
export interface JournalReDate {
  tag: string;
  from: number | null;
  to: number;
}

interface JournalEntry {
  tag: string;
  when: number;
}

interface JournalFile {
  entries: JournalEntry[];
}

interface MigrationRow {
  hash: string;
  created_at: number | string | null;
}

export function repairMigrationJournal(
  raw: RawDatabase,
  migrationsFolder: string,
): JournalReDate[] {
  const journalPath = path.join(migrationsFolder, 'meta', '_journal.json');
  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as JournalFile;

  const expected = new Map<string, JournalEntry>();
  for (const entry of journal.entries) {
    const sql = fs.readFileSync(path.join(migrationsFolder, `${entry.tag}.sql`), 'utf8');
    expected.set(createHash('sha256').update(sql).digest('hex'), entry);
  }

  const table = raw
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'",
    )
    .get();
  if (table === undefined) {
    // Fresh database: drizzle's migrator creates the table and applies
    // everything in journal order; there is nothing to repair.
    return [];
  }

  const rows = raw
    .prepare('SELECT hash, created_at FROM __drizzle_migrations')
    .all() as MigrationRow[];

  const reDates: JournalReDate[] = [];
  const updates: Array<{ when: number; hash: string }> = [];
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
