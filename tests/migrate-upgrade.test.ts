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
import { openDatabase } from '../src/lib/db/client';
import { repairMigrationJournal } from '../src/lib/db/migrate-repair';
import { completeTask, listTasks, taskDue } from '../src/lib/records/tasks';
import { migrationsFolderBefore } from './helpers';

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

describe('migration 0013: follow-up dates become tasks (decision 175)', () => {
  const T0 = Date.UTC(2026, 8, 20, 9, 0, 0); // 2026-09-20T09:00:00Z

  function tableColumns(raw: Database.Database, table: string): string[] {
    return (raw.pragma(`table_info(${table})`) as Array<{ name: string }>).map(
      (column) => column.name,
    );
  }

  it('a v0.24.0 database upgrades: dated follow-ups become open tasks, the column goes', async () => {
    const dir = tmpDataDir('sf-upgrade-0013-');
    const databasePath = path.join(dir, 'db.sqlite');
    buildDatabase(databasePath, await migrationsFolderBefore('0013_tasks_and_supplier_documents'));

    // Seed it the way the household's looks: one interaction carrying a
    // follow-up date, plus the shapes the old free column could hold.
    const seed = new Database(databasePath);
    try {
      assert.ok(tableColumns(seed, 'supplier_interactions').includes('follow_up_date'));
      assert.ok(!tableColumns(seed, 'attachments').includes('supplier_id'));
      seed
        .prepare(
          'INSERT INTO suppliers (id, name, normalized_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run(1, 'EnergyCo', 'energyco', T0, T0);
      const interaction = seed.prepare(
        `INSERT INTO supplier_interactions
           (id, supplier_id, occurred_at, channel, summary, follow_up_date, created_by, created_at)
         VALUES (?, 1, ?, ?, ?, ?, ?, ?)`,
      );
      interaction.run(
        1,
        T0,
        'call',
        'Asked about a cheaper tariff',
        '2026-11-01',
        'alex@example.com',
        T0,
      );
      interaction.run(
        2,
        T0 + 1000,
        'email',
        'Sent the meter reading',
        null,
        'sam@example.com',
        T0 + 1000,
      );
      interaction.run(
        3,
        T0 + 2000,
        'letter',
        'Old note',
        'next week',
        'alex@example.com',
        T0 + 2000,
      );
      interaction.run(4, T0 + 3000, 'other', 'Blank follow-up', '', 'alex@example.com', T0 + 3000);
      seed
        .prepare(
          'INSERT INTO pots (id, label, kind, created_at, updated_at) VALUES (1, ?, ?, ?, ?)',
        )
        .run('Main', 'bank', T0, T0);
      seed
        .prepare(
          `INSERT INTO purchases (id, pot_id, total_pence, occurred_at, occurred_date, entered_by, created_at, updated_at)
           VALUES (7, 1, 8420, ?, '2026-09-20', 'alex@example.com', ?, ?)`,
        )
        .run(T0, T0, T0);
      seed
        .prepare(
          `INSERT INTO attachments (id, purchase_id, file_key, original_name, mime, size_bytes, sha256, created_by, created_at)
           VALUES (5, 7, 'receipts/abc.pdf', 'receipt.pdf', 'application/pdf', 1234, ?, 'alex@example.com', ?)`,
        )
        .run('a'.repeat(64), T0);
    } finally {
      seed.close();
    }

    const output = runProductionRunner(dir);
    assert.match(output, /\[migrate\] database is up to date/);
    assertEveryJournalEntryAppliedExactlyOnce(databasePath);

    const raw = new Database(databasePath);
    try {
      assert.ok(
        !tableColumns(raw, 'supplier_interactions').includes('follow_up_date'),
        'follow_up_date is dropped',
      );
      assert.equal(
        (raw.prepare('SELECT COUNT(*) AS n FROM supplier_interactions').get() as { n: number }).n,
        4,
        'every interaction survives',
      );
      const migrated = raw
        .prepare(
          `SELECT title, detail, due_date, subject_kind, subject_id, related_interaction_id,
                  created_by, created_at, completed_at, version
             FROM tasks ORDER BY related_interaction_id`,
        )
        .all();
      assert.deepEqual(migrated, [
        {
          title: 'Follow up with EnergyCo',
          detail: 'Asked about a cheaper tariff',
          due_date: '2026-11-01',
          subject_kind: 'supplier',
          subject_id: 1,
          related_interaction_id: 1,
          created_by: 'alex@example.com',
          created_at: T0,
          completed_at: null,
          version: 1,
        },
        {
          // Not a date: kept as an undated task rather than dropped.
          title: 'Follow up with EnergyCo',
          detail: 'Old note',
          due_date: null,
          subject_kind: 'supplier',
          subject_id: 1,
          related_interaction_id: 3,
          created_by: 'alex@example.com',
          created_at: T0 + 2000,
          completed_at: null,
          version: 1,
        },
      ]);
      const audit = raw
        .prepare("SELECT actor, entity, action FROM audit_entries WHERE action = 'task.migrate'")
        .all();
      assert.deepEqual(audit, [
        { actor: 'system', entity: 'task', action: 'task.migrate' },
        { actor: 'system', entity: 'task', action: 'task.migrate' },
      ]);

      // The rebuilt attachments table kept the receipt, and now takes a
      // supplier owner — but still exactly one owner.
      assert.deepEqual(
        raw.prepare('SELECT id, purchase_id, receipt_id, supplier_id FROM attachments').all(),
        [{ id: 5, purchase_id: 7, receipt_id: null, supplier_id: null }],
      );
      const attach = raw.prepare(
        `INSERT INTO attachments (purchase_id, supplier_id, file_key, original_name, mime, size_bytes, sha256, created_by, created_at)
         VALUES (?, ?, ?, 'terms.pdf', 'application/pdf', 10, ?, 'alex@example.com', ?)`,
      );
      attach.run(null, 1, 'suppliers/terms.pdf', 'b'.repeat(64), T0);
      assert.throws(() => attach.run(7, 1, 'x/both.pdf', 'c'.repeat(64), T0), /CHECK constraint/);
      assert.throws(
        () => attach.run(null, null, 'x/none.pdf', 'd'.repeat(64), T0),
        /CHECK constraint/,
      );
      assert.deepEqual(raw.pragma('foreign_key_check'), []);
      assert.equal(raw.pragma('integrity_check', { simple: true }), 'ok');
    } finally {
      raw.close();
    }

    // Through the app: the household's follow-up is an open task that is
    // overdue on 2 November — the day the old list silently dropped it — and
    // it can be closed like any other.
    const handle = openDatabase(databasePath);
    try {
      const open = listTasks(handle.db);
      const followUp = open.find((task) => task.dueDate === '2026-11-01');
      assert.ok(followUp !== undefined);
      assert.equal(taskDue(followUp.dueDate, '2026-11-02').label, 'Overdue by 1 day');
      const done = completeTask(handle.db, {
        id: followUp.id,
        expectedVersion: followUp.version,
        actor: 'alex@example.com',
      });
      assert.equal(done.version, 2);
    } finally {
      handle.raw.close();
    }

    // Idempotent: a second start applies nothing and migrates nothing twice.
    const second = runProductionRunner(dir);
    assert.match(second, /\[migrate\] database is up to date/);
    assertEveryJournalEntryAppliedExactlyOnce(databasePath);
    const again = new Database(databasePath, { readonly: true });
    try {
      assert.equal((again.prepare('SELECT COUNT(*) AS n FROM tasks').get() as { n: number }).n, 2);
    } finally {
      again.close();
    }
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('migration 0014: bell_seen and task assignee (decision 176)', () => {
  const T0 = Date.UTC(2026, 8, 20, 9, 0, 0);

  function tableColumns(raw: Database.Database, table: string): string[] {
    return (raw.pragma(`table_info(${table})`) as Array<{ name: string }>).map(
      (column) => column.name,
    );
  }

  it('a v0.25.0 database upgrades: bell_seen table and tasks.assigned_to column', async () => {
    const dir = tmpDataDir('sf-upgrade-0014-');
    const databasePath = path.join(dir, 'db.sqlite');
    buildDatabase(databasePath, await migrationsFolderBefore('0014_bell_and_task_assignee'));

    const seed = new Database(databasePath);
    try {
      assert.ok(!tableColumns(seed, 'tasks').includes('assigned_to'), 'assigned_to not yet');
      assert.equal(
        seed.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='bell_seen'").all()
          .length,
        0,
        'bell_seen not yet',
      );
      seed
        .prepare(
          'INSERT INTO suppliers (id, name, normalized_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run(1, 'EnergyCo', 'energyco', T0, T0);
      seed
        .prepare(
          `INSERT INTO tasks (id, title, subject_kind, created_by, created_at, updated_at, version)
           VALUES (1, 'Old task', 'household', 'alex@example.com', ?, ?, 1)`,
        )
        .run(T0, T0);
    } finally {
      seed.close();
    }

    const output = runProductionRunner(dir);
    assert.match(output, /\[migrate\] database is up to date/);
    assertEveryJournalEntryAppliedExactlyOnce(databasePath);

    const raw = new Database(databasePath);
    try {
      assert.ok(tableColumns(raw, 'tasks').includes('assigned_to'), 'assigned_to added');
      const tables = raw
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='bell_seen'")
        .all() as Array<{ name: string }>;
      assert.equal(tables.length, 1, 'bell_seen exists');
      const tasks = raw.prepare('SELECT id, assigned_to FROM tasks').all() as Array<{
        id: number;
        assigned_to: string | null;
      }>;
      assert.deepEqual(tasks, [{ id: 1, assigned_to: null }]);

      // Can insert a task with assigned_to and a bell_seen row
      raw
        .prepare(
          `INSERT INTO tasks (title, subject_kind, assigned_to, created_by, created_at, updated_at, version) VALUES (?, 'household', ?, 'sam@example.com', ?, ?, 1)`,
        )
        .run('Personal', 'sam@example.com', T0, T0);
      raw
        .prepare(`INSERT INTO bell_seen (email, seen_at) VALUES (?, ?)`)
        .run('alex@example.com', T0);
      const seen = raw.prepare('SELECT email, seen_at FROM bell_seen').all();
      assert.equal(seen.length, 1);
      assert.equal((seen[0] as { email: string }).email, 'alex@example.com');
    } finally {
      raw.close();
    }

    // Through the app: can create a personal task and set seen
    const handle = openDatabase(databasePath);
    try {
      const { createTask } = await import('../src/lib/records/tasks');
      const { getBellSeenAt, setBellSeenAt } = await import('../src/lib/records/bell-seen');
      const personal = createTask(handle.db, {
        title: 'Only mine',
        actor: 'alex@example.com',
        assignedTo: 'alex@example.com',
      });
      assert.equal(personal.assignedTo, 'alex@example.com');
      setBellSeenAt(handle.db, 'alex@example.com', new Date(T0 + 1000));
      const seenAt = getBellSeenAt(handle.db, 'alex@example.com');
      assert.ok(seenAt !== null);
    } finally {
      handle.raw.close();
    }

    const second = runProductionRunner(dir);
    assert.match(second, /\[migrate\] database is up to date/);
    assertEveryJournalEntryAppliedExactlyOnce(databasePath);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('migration 0015: pot owner and cash-pot normalisation (decision 178)', () => {
  const T0 = Date.UTC(2026, 8, 20, 9, 0, 0);

  function tableColumns(raw: Database.Database, table: string): string[] {
    return (raw.pragma(`table_info(${table})`) as Array<{ name: string }>).map(
      (column) => column.name,
    );
  }

  it('a v0.27.0 database upgrades: pots.owner_person_id, cash limits cleared', async () => {
    const dir = tmpDataDir('sf-upgrade-0015-');
    const databasePath = path.join(dir, 'db.sqlite');
    buildDatabase(databasePath, await migrationsFolderBefore('0015_pot_owner'));

    const seed = new Database(databasePath);
    try {
      assert.ok(!tableColumns(seed, 'pots').includes('owner_person_id'), 'owner_person_id not yet');
      // A pre-0015 cash pot could carry overdraft context (it was never
      // meaningful, and nothing stopped it). The migration must clear it.
      seed
        .prepare(
          `INSERT INTO pots (label, kind, overdraft_limit_pence, warning_threshold_pence, created_at, updated_at, version)
           VALUES ('Alex''s cash', 'cash', 5000, 1000, ?, ?, 1)`,
        )
        .run(T0, T0);
      seed
        .prepare(
          `INSERT INTO pots (label, kind, overdraft_limit_pence, warning_threshold_pence, created_at, updated_at, version)
           VALUES ('Main account', 'bank', 80000, 25000, ?, ?, 1)`,
        )
        .run(T0, T0);
    } finally {
      seed.close();
    }

    const output = runProductionRunner(dir);
    assert.match(output, /\[migrate\] database is up to date/);
    assertEveryJournalEntryAppliedExactlyOnce(databasePath);

    const raw = new Database(databasePath);
    try {
      assert.ok(tableColumns(raw, 'pots').includes('owner_person_id'), 'owner_person_id added');
      const rows = raw
        .prepare('SELECT label, kind, owner_person_id, overdraft_limit_pence FROM pots ORDER BY id')
        .all() as Array<{
        label: string;
        kind: string;
        owner_person_id: number | null;
        overdraft_limit_pence: number | null;
      }>;
      assert.deepEqual(rows, [
        { label: "Alex's cash", kind: 'cash', owner_person_id: null, overdraft_limit_pence: null },
        {
          label: 'Main account',
          kind: 'bank',
          owner_person_id: null,
          overdraft_limit_pence: 80000,
        },
      ]);
    } finally {
      raw.close();
    }

    // Through the app: an owner can be set on a pot, and a cash pot still
    // refuses to carry overdraft context.
    const handle = openDatabase(databasePath);
    try {
      const { createPot, editPot } = await import('../src/lib/records/pots');
      const { createPerson } = await import('../src/lib/records/people');
      const alex = createPerson(handle.db, {
        label: 'Alex',
        actor: 'alex@example.com',
        now: new Date(T0),
      });
      const cashPot = createPot(handle.db, {
        label: 'Pocket cash',
        kind: 'cash',
        ownerPersonId: alex.id,
        actor: 'alex@example.com',
        now: new Date(T0),
      });
      assert.equal(cashPot.ownerPersonId, alex.id);
      const owned = editPot(handle.db, {
        id: cashPot.id,
        expectedVersion: cashPot.version,
        actor: 'alex@example.com',
        patch: { ownerPersonId: null },
      });
      assert.equal(owned.ownerPersonId, null);
    } finally {
      handle.raw.close();
    }

    const second = runProductionRunner(dir);
    assert.match(second, /\[migrate\] database is up to date/);
    assertEveryJournalEntryAppliedExactlyOnce(databasePath);
    rmSync(dir, { recursive: true, force: true });
  });
});
