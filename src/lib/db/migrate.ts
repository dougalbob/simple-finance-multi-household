import path from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { Db, RawDatabase } from './client';
import { repairMigrationJournal } from './migrate-repair';

/**
 * Apply pending checked-in migrations from ./drizzle.
 * Idempotent: drizzle's journal table tracks what has been applied.
 * Called by scripts/migrate.cjs (production entrypoint), by the dev server's
 * first database open, and by tests against isolated databases.
 */
export function applyMigrations(
  db: Db,
  migrationsFolder: string = path.resolve(process.cwd(), 'drizzle'),
): void {
  // Repair migration bookkeeping BEFORE the migrator runs: drizzle orders by
  // the single newest recorded stamp, so a stale stamp (see v0.23.0's silently
  // skipped 0012) must be re-dated first. See src/lib/db/migrate-repair.ts.
  // drizzle's typings expose `$client` only on the driver class; Db is that
  // same class at runtime, so cast once at this boundary.
  const raw = (db as unknown as { $client: RawDatabase }).$client;
  const reDates = repairMigrationJournal(raw, migrationsFolder);
  for (const reDate of reDates) {
    console.info(
      `[migrate-repair] re-dated ${reDate.tag}: ${reDate.from ?? 'null'} -> ${reDate.to}` +
        ' (journal stamp correction; see docs/RELEASE_NOTES_v0.23.1.md)',
    );
  }
  migrate(db, { migrationsFolder });
}
