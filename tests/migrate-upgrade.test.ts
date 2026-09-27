import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { describe, it } from 'node:test';
import { repairMigrationJournal } from '../src/lib/db/migrate-repair';

/**
 * The v0.23.0 incident, pinned forever.
 *
 * drizzle's migrator applies a journal entry only when its `when` stamp is
 * newer than the newest stamp recorded in `__drizzle_migrations`. 0011 had
 * been hand-stamped 1790600000000 (a round number in the future) and 0012
 * carried its real generation stamp 1790506141836, so every database upgraded
 * from v0.20.0+ silently skipped 0012 and failed at runtime with
 * `no such column: credit_card_payment_day_of_month` — while fresh databases
 * applied everything and every CI check stayed green. The only thing missing
 * was a test that upgrades an existing database through the real production
 * runner. These are those tests. See docs/RELEASE_NOTES_v0.23.1.md.
 */

// Historical journal stamps that shipped in published releases. They are
// deliberately hardcoded: real databases in the field recorded them, and the
// repair has to converge from exactly these values.
const OLD_0011_WHEN = 1790600000000; // shipped v0.20.0–v0.23.0 (hand-stamped, future-dated)

const CREDIT_CARD_COLUMNS = [
  'credit_card_payment_day_of_month',
  'credit_card_warning_days',
  'credit_card_promotional_end_date',
  'credit_card_statement_due_date',
  'credit_card_statement_minimum_pence',
];

interface JournalEntry {
  idx: number;
  tag: string;
  when: number;
}

function readRepoJournal(): JournalEntry[] {
  const journal = JSON.parse(readFileSync(path.resolve('drizzle/meta/_journal.json'), 'utf8')) as {
    entries: JournalEntry[];
  };
  return journal.entries;
}

/**
 * A throwaway drizzle folder whose journal ends at `entryCount` entries, with
 * 0011 stamped at its historical (broken) value — i.e. exactly the migration
 * history a real database upgraded from the corresponding release carries.
 */
function legacyMigrationsFolder(entryCount: number): string {
  const dir = path.join(mkdtempSync(path.join(os.tmpdir(), 'sf-legacy-drizzle-')), 'drizzle');
  mkdirSync(path.join(dir, 'meta'), { recursive: true });
  const repoFolder = path.resolve('drizzle');
  const entries = readRepoJournal()
    .slice(0, entryCount)
    .map((entry) => ({ ...entry }));
  for (const entry of entries) {
    cpSync(path.join(repoFolder, `${entry.tag}.sql`), path.join(dir, `${entry.tag}.sql`));
    if (entry.tag === '0011_schedule_excluded_months') entry.when = OLD_0011_WHEN;
  }
  const legacy = { entries };
  writeFileSync(path.join(dir, 'meta/_journal.json'), JSON.stringify(legacy, null, 2));
  return dir;
}

function buildDatabase(databasePath: string, migrationsFolder: string): void {
  const raw = new Database(databasePath);
  raw.pragma('journal_mode = WAL');
  try {
    migrate(drizzle(raw), { migrationsFolder });
  } finally {
    raw.close();
  }
}

/** The exact production path: what docker-entrypoint.sh runs. */
function runProductionRunner(dataDir: string): string {
  const script = path.resolve('scripts/migrate.cjs');
  return execFileSync('node', [script], {
    env: { ...process.env, DATA_DIR: dataDir, DATABASE_PATH: path.join(dataDir, 'db.sqlite') },
    encoding: 'utf8',
  });
}

function migrationRows(databasePath: string): Map<string, number> {
  const raw = new Database(databasePath, { readonly: true });
  try {
    const rows = raw.prepare('SELECT hash, created_at FROM __drizzle_migrations').all() as Array<{
      hash: string;
      created_at: number | string;
    }>;
    return new Map(rows.map((row) => [row.hash, Number(row.created_at)]));
  } finally {
    raw.close();
  }
}

function potColumns(databasePath: string): string[] {
  const raw = new Database(databasePath, { readonly: true });
  try {
    return (raw.pragma('table_info(pots)') as Array<{ name: string }>).map((column) => column.name);
  } finally {
    raw.close();
  }
}

function journalHashToWhen(): Map<string, { tag: string; when: number }> {
  const map = new Map<string, { tag: string; when: number }>();
  for (const entry of readRepoJournal()) {
    const sql = readFileSync(path.resolve('drizzle', `${entry.tag}.sql`), 'utf8');
    map.set(createHash('sha256').update(sql).digest('hex'), { tag: entry.tag, when: entry.when });
  }
  return map;
}

function assertEveryJournalEntryAppliedExactlyOnce(databasePath: string): void {
  const rows = migrationRows(databasePath);
  const expected = journalHashToWhen();
  assert.equal(rows.size, expected.size, 'one __drizzle_migrations row per journal entry');
  for (const [hash, { tag, when }] of expected) {
    const recorded = rows.get(hash);
    assert.ok(recorded !== undefined, `journal entry ${tag} is not recorded as applied`);
    assert.equal(
      recorded,
      when,
      `journal entry ${tag} is recorded at stamp ${recorded}, want ${when}`,
    );
  }
}

function tmpDataDir(prefix: string): string {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('migration upgrade path (v0.23.0 incident regression)', () => {
  it('a v0.22.1-era database (0011 at the old future stamp) applies 0012 on upgrade', () => {
    // Exactly the household's database: upgraded through v0.22.1, so 0011 is
    // recorded at the hand-stamped future value and 0012 does not exist.
    const dir = tmpDataDir('sf-upgrade-a-');
    const databasePath = path.join(dir, 'db.sqlite');
    buildDatabase(databasePath, legacyMigrationsFolder(12));
    assert.ok(!potColumns(databasePath).includes('credit_card_payment_day_of_month'));

    const output = runProductionRunner(dir);
    assert.match(output, /\[migrate\] database is up to date/);
    assert.match(
      output,
      /\[migrate-repair\] re-dated 0011_schedule_excluded_months: 1790600000000 -> 1790504000000/,
    );
    for (const column of CREDIT_CARD_COLUMNS) {
      assert.ok(potColumns(databasePath).includes(column), `pots.${column} missing after upgrade`);
    }
    assertEveryJournalEntryAppliedExactlyOnce(databasePath);

    // Idempotent: a second start re-dates nothing and changes nothing.
    const second = runProductionRunner(dir);
    assert.doesNotMatch(second, /\[migrate-repair\]/);
    assertEveryJournalEntryAppliedExactlyOnce(databasePath);
    rmSync(dir, { recursive: true, force: true });
  });

  it('a database created fresh by v0.23.0 upgrades cleanly (no duplicate columns)', () => {
    // Fresh v0.23.0 installs applied 0012 in journal order; their 0011 row
    // still carries the old future stamp, which would make the corrected
    // journal re-apply 0012 and crash with "duplicate column name" if the
    // repair did not re-date it first.
    const dir = tmpDataDir('sf-upgrade-b-');
    const databasePath = path.join(dir, 'db.sqlite');
    buildDatabase(databasePath, legacyMigrationsFolder(13));
    assert.ok(potColumns(databasePath).includes('credit_card_payment_day_of_month'));

    const output = runProductionRunner(dir);
    assert.match(output, /\[migrate\] database is up to date/);
    assert.match(
      output,
      /\[migrate-repair\] re-dated 0011_schedule_excluded_months: 1790600000000 -> 1790504000000/,
    );
    for (const column of CREDIT_CARD_COLUMNS) {
      assert.ok(potColumns(databasePath).includes(column), `pots.${column} lost on re-upgrade`);
    }
    assertEveryJournalEntryAppliedExactlyOnce(databasePath);
    rmSync(dir, { recursive: true, force: true });
  });

  it('a fresh database on the current journal applies everything once', () => {
    const dir = tmpDataDir('sf-upgrade-c-');
    const databasePath = path.join(dir, 'db.sqlite');
    runProductionRunner(dir);
    assert.ok(potColumns(databasePath).includes('credit_card_payment_day_of_month'));
    assertEveryJournalEntryAppliedExactlyOnce(databasePath);
    runProductionRunner(dir); // idempotent
    assertEveryJournalEntryAppliedExactlyOnce(databasePath);
    rmSync(dir, { recursive: true, force: true });
  });

  it('the CJS (production) and TS (dev) repair implementations agree', async () => {
    const cjsUrl = new URL('../scripts/migrate-repair.cjs', import.meta.url);
    const imported = (await import(cjsUrl.href)) as unknown as {
      repairMigrationJournal?: typeof repairMigrationJournal;
      default?: { repairMigrationJournal: typeof repairMigrationJournal };
    };
    assert.ok(
      imported.repairMigrationJournal ?? imported.default?.repairMigrationJournal,
      'scripts/migrate-repair.cjs did not export its function',
    );

    for (const entryCount of [12, 13]) {
      const cjsDir = tmpDataDir('sf-parity-cjs-');
      const tsDir = tmpDataDir('sf-parity-ts-');
      for (const dir of [cjsDir, tsDir]) {
        buildDatabase(path.join(dir, 'db.sqlite'), legacyMigrationsFolder(entryCount));
      }

      // Production path: scripts/migrate.cjs runs the CJS repair, then drizzle.
      runProductionRunner(cjsDir);
      // Dev path: the TS repair, then drizzle, against an identical fixture.
      const tsRaw = new Database(path.join(tsDir, 'db.sqlite'));
      tsRaw.pragma('journal_mode = WAL');
      try {
        repairMigrationJournal(tsRaw, path.resolve('drizzle'));
        migrate(drizzle(tsRaw), { migrationsFolder: path.resolve('drizzle') });
      } finally {
        tsRaw.close();
      }

      assert.deepEqual(
        [...migrationRows(path.join(cjsDir, 'db.sqlite')).entries()].sort(),
        [...migrationRows(path.join(tsDir, 'db.sqlite')).entries()].sort(),
        `CJS and TS repairs disagree for a ${entryCount}-entry legacy database`,
      );
      assert.deepEqual(
        potColumns(path.join(cjsDir, 'db.sqlite')).sort(),
        potColumns(path.join(tsDir, 'db.sqlite')).sort(),
      );
      rmSync(cjsDir, { recursive: true, force: true });
      rmSync(tsDir, { recursive: true, force: true });
    }
  });
});
