import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { loadAppConfig } from '../src/lib/config';
import { openDatabase } from '../src/lib/db/client';
import { applyMigrations } from '../src/lib/db/migrate';
import { storeAttachment } from '../src/lib/records/attachments';
import { findChildCategory } from '../src/lib/records/categories';
import { createPerson, setPersonEmail } from '../src/lib/records/people';
import { addCheckpoint, createPot } from '../src/lib/records/pots';
import { createPurchase } from '../src/lib/records/purchases';
import { createSupplier } from '../src/lib/records/suppliers';
import { openRegistry } from '../src/lib/registry/db';
import { assignIdentity, createHousehold } from '../src/lib/registry/domain';
import {
  householdDatabasePath,
  householdDocumentsDir,
  systemRegistryPath,
} from '../src/lib/registry/paths';
import { createHouseholdBackup, restoreHouseholdBackup } from '../src/lib/backup/household';
import { RestoreError } from '../src/lib/backup/restore';
import { BackupPasswordError } from '../src/lib/backup/crypto';

/**
 * Import rehearsal (MULTI_HOUSEHOLD_PLAN §5, plan step 5).
 *
 * Everything this script touches is FICTIONAL and lives under a git-ignored
 * scratch folder (`.import-rehearsal/`). It does three things:
 *
 *   1. Builds a fictional "legacy" single-household installation: one
 *      `simple-finance.sqlite` plus a `documents/` folder, created with the
 *      same checked-in migrations the original app used (drizzle/0000–0016).
 *   2. Imports a copy of it into an isolated multi-household data root, the
 *      way the new container would see it: registry assignments, a WAL-
 *      consistent database copy, the documents folder, then the production
 *      startup migration scripts (`scripts/registry-migrate.cjs` and
 *      `scripts/migrate.cjs`).
 *   3. Verifies the result (integrity, foreign keys, record counts, attachment
 *      hashes, sign-in links), then round-trips the household's own encrypted
 *      backup and restore, and checks that a restore into another household is
 *      refused without changing anything.
 *
 * It never reads or writes a real appdata path. It refuses to run under
 * `/mnt/` at all. Run it with: `npm run rehearse:import`.
 */

const ROOT = path.resolve(process.cwd(), '.import-rehearsal');
const LEGACY_DIR = path.join(ROOT, 'legacy');
const NEW_DATA_DIR = path.join(ROOT, 'new-appdata');
const PASSPHRASE = 'rehearsal-passphrase-only';
const ALEX = 'alex@example.com';
const SAM = 'sam@example.com';
const FORMER = 'former-lodger@example.com';
const ACTOR = ALEX;
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}
const checks: Check[] = [];
function check(name: string, ok: boolean, detail = ''): void {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function sha256File(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function userTables(file: string): string[] {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    return (
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY name",
        )
        .all() as { name: string }[]
    ).map((row) => row.name);
  } finally {
    db.close();
  }
}

function tableCounts(file: string): Record<string, number> {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const counts: Record<string, number> = {};
    for (const table of userTables(file)) {
      const row = db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as { n: number };
      counts[table] = row.n;
    }
    return counts;
  } finally {
    db.close();
  }
}

function integrity(file: string): { integrity: string; foreignKeyViolations: number } {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const integrityRow = db.pragma('integrity_check', { simple: true }) as string;
    const fkRows = db.pragma('foreign_key_check') as unknown[];
    return { integrity: integrityRow, foreignKeyViolations: fkRows.length };
  } finally {
    db.close();
  }
}

function sameCounts(a: Record<string, number>, b: Record<string, number>): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys]
    .filter((key) => a[key] !== b[key])
    .map((key) => `${key}: ${a[key]} vs ${b[key]}`);
}

interface AttachmentRow {
  file_key: string;
  sha256: string;
}

function attachmentRows(file: string): AttachmentRow[] {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    return db
      .prepare('SELECT file_key, sha256 FROM attachments ORDER BY id')
      .all() as AttachmentRow[];
  } finally {
    db.close();
  }
}

function runStartupScript(script: string, dataDir: string): void {
  const result = spawnSync('node', [path.join('scripts', script)], {
    cwd: process.cwd(),
    env: { ...process.env, DATA_DIR: dataDir },
    encoding: 'utf8',
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  if (output)
    console.log(
      output
        .split('\n')
        .map((line) => `      ${line}`)
        .join('\n'),
    );
  check(`startup script ${script} exits cleanly`, result.status === 0, `exit ${result.status}`);
}

async function buildLegacyInstallation(): Promise<{ counts: Record<string, number> }> {
  mkdirSync(LEGACY_DIR, { recursive: true });
  const dbPath = path.join(LEGACY_DIR, 'simple-finance.sqlite');
  const documentsDir = path.join(LEGACY_DIR, 'documents');
  mkdirSync(documentsDir, { recursive: true });

  const handle = openDatabase(dbPath);
  applyMigrations(handle.db);
  const db = handle.db;
  const now = new Date('2026-09-01T10:00:00Z');
  const allowed = [ALEX, SAM, FORMER];

  const alex = createPerson(db, { label: 'Alex', actor: ACTOR, now });
  const sam = createPerson(db, { label: 'Sam', actor: ACTOR, now });
  createPerson(db, { label: 'Lodger', actor: ACTOR, now });
  setPersonEmail(db, { id: alex.id, email: ALEX, allowedEmails: allowed, actor: ACTOR, now });
  setPersonEmail(db, { id: sam.id, email: SAM, allowedEmails: allowed, actor: ACTOR, now });
  // A sign-in that was valid in the old installation but is not assigned to
  // this household any more. The restore step must clear it.
  const lodger = handle.raw.prepare("SELECT id FROM people WHERE label = 'Lodger'").get() as {
    id: number;
  };
  setPersonEmail(db, { id: lodger.id, email: FORMER, allowedEmails: allowed, actor: ACTOR, now });

  const main = createPot(db, { label: 'Main account', kind: 'bank', actor: ACTOR, now });
  const alexCash = createPot(db, {
    label: "Alex's cash",
    kind: 'cash',
    ownerPersonId: alex.id,
    actor: ACTOR,
    now,
  });
  addCheckpoint(db, { potId: main.id, amountPence: 150000, actor: ACTOR, now });
  addCheckpoint(db, { potId: alexCash.id, amountPence: 4200, actor: ACTOR, now });

  const groceries = findChildCategory(db, 'Groceries', 'Weekly Shop');
  if (groceries === null) throw new Error('rehearsal: category tree is missing Weekly Shop');
  const cornerFoods = createSupplier(db, { name: 'Corner Foods', actor: ACTOR, now });
  const purchase = createPurchase(db, {
    potId: main.id,
    totalPence: 6347,
    occurredAt: new Date('2026-08-20T12:00:00Z'),
    paidByPersonId: alex.id,
    supplierId: cornerFoods.id,
    note: 'Fictional weekly shop',
    actor: ACTOR,
    lines: [{ amountPence: 6347, categoryId: groceries.id, targetKind: 'household' }],
    now,
  });
  createPurchase(db, {
    potId: main.id,
    totalPence: 1299,
    occurredAt: new Date('2026-08-25T12:00:00Z'),
    paidByPersonId: sam.id,
    supplierName: 'Greenfield Market',
    actor: SAM,
    lines: [{ amountPence: 1299, categoryId: groceries.id, targetKind: 'household' }],
    now,
  });

  const pdf = Buffer.from(
    '%PDF-1.4\n% fictional rehearsal receipt\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n',
    'latin1',
  );
  await storeAttachment({
    db,
    purchaseId: purchase.purchase.id,
    originalName: 'fictional-receipt.pdf',
    bytes: pdf,
    actor: ACTOR,
    documentsDir,
    now,
  });
  await storeAttachment({
    db,
    supplierId: cornerFoods.id,
    originalName: 'fictional-letter.png',
    bytes: PNG_1X1,
    actor: ACTOR,
    documentsDir,
    now,
  });

  handle.raw.close();
  return { counts: tableCounts(dbPath) };
}

async function main(): Promise<void> {
  if (ROOT.startsWith('/mnt/'))
    throw new Error('refusing to run under /mnt/: this is a fictional rehearsal only');
  console.log('Import rehearsal — FICTIONAL DATA ONLY. Scratch folder: ' + ROOT);
  rmSync(ROOT, { recursive: true, force: true });

  // ---- 1. Legacy installation ------------------------------------------------
  const legacy = await buildLegacyInstallation();
  const legacyDb = path.join(LEGACY_DIR, 'simple-finance.sqlite');
  const legacyDocs = path.join(LEGACY_DIR, 'documents');
  const legacyAttachments = attachmentRows(legacyDb);
  check(
    'legacy: fictional installation built',
    legacyAttachments.length === 2,
    `${Object.values(legacy.counts).reduce((a, b) => a + b, 0)} rows, ${legacyAttachments.length} attachments`,
  );

  // ---- 2. Isolated new installation -----------------------------------------
  const registry = openRegistry(systemRegistryPath(NEW_DATA_DIR));
  let householdId = '';
  let otherHouseholdId = '';
  try {
    householdId = createHousehold(registry, {
      displayName: 'Alex & Sam (rehearsal)',
      actor: 'system',
    }).id;
    assignIdentity(registry, { email: ALEX, householdId, role: 'platform_admin', actor: 'system' });
    assignIdentity(registry, { email: SAM, householdId, actor: 'system' });
    otherHouseholdId = createHousehold(registry, {
      displayName: 'Other (rehearsal)',
      actor: 'system',
    }).id;
    assignIdentity(registry, {
      email: 'other@example.com',
      householdId: otherHouseholdId,
      role: 'platform_admin',
      actor: 'system',
    });
  } finally {
    registry.close();
  }

  const newDbPath = householdDatabasePath(NEW_DATA_DIR, householdId);
  const newDocs = householdDocumentsDir(NEW_DATA_DIR, householdId);
  mkdirSync(path.dirname(newDbPath), { recursive: true });
  const source = new Database(legacyDb, { readonly: true, fileMustExist: true });
  await source.backup(newDbPath);
  source.close();
  cpSync(legacyDocs, newDocs, { recursive: true });

  // The other household starts empty, as a new household would.
  const otherHandle = openDatabase(householdDatabasePath(NEW_DATA_DIR, otherHouseholdId));
  applyMigrations(otherHandle.db);
  otherHandle.raw.close();
  const otherDb = householdDatabasePath(NEW_DATA_DIR, otherHouseholdId);
  const otherHashBefore = sha256File(otherDb);

  runStartupScript('registry-migrate.cjs', NEW_DATA_DIR);
  runStartupScript('migrate.cjs', NEW_DATA_DIR);

  // ---- 3. Verify the import --------------------------------------------------
  const newCounts = tableCounts(newDbPath);
  const diffs = sameCounts(legacy.counts, newCounts);
  check(
    'import: record counts match the legacy copy',
    diffs.length === 0,
    diffs.join('; ') || 'all tables equal',
  );
  const { integrity: integrityResult, foreignKeyViolations } = integrity(newDbPath);
  check('import: SQLite integrity_check is ok', integrityResult === 'ok', integrityResult);
  check('import: no foreign-key violations', foreignKeyViolations === 0, `${foreignKeyViolations}`);

  const newRows = attachmentRows(newDbPath);
  const newFiles = readdirSync(newDocs);
  const hashProblems: string[] = [];
  for (const row of newRows) {
    const file = path.join(newDocs, row.file_key);
    if (!existsSync(file)) {
      hashProblems.push(`${row.file_key} missing`);
      continue;
    }
    const actual = sha256File(file);
    const original = sha256File(path.join(legacyDocs, row.file_key));
    if (actual !== row.sha256 || actual !== original)
      hashProblems.push(`${row.file_key} hash mismatch`);
  }
  check(
    'import: every attachment file matches its recorded hash and the legacy copy',
    hashProblems.length === 0 && newRows.length === legacyAttachments.length,
    hashProblems.join('; ') || `${newRows.length} files`,
  );
  check(
    'import: no unreferenced document files',
    newFiles.length === newRows.length,
    `${newFiles.length} files, ${newRows.length} rows`,
  );

  const newDb = new Database(newDbPath, { readonly: true, fileMustExist: true });
  const links = newDb
    .prepare('SELECT label, email FROM people WHERE email IS NOT NULL ORDER BY label')
    .all() as { label: string; email: string }[];
  newDb.close();
  check(
    'import: sign-in links for Alex and Sam carried over',
    links.some((l) => l.label === 'Alex' && l.email === ALEX) &&
      links.some((l) => l.label === 'Sam' && l.email === SAM),
    links.map((l) => `${l.label}=${l.email}`).join(', '),
  );

  // ---- 4. Household backup and restore round-trip ---------------------------
  const config = loadAppConfig({ DATA_DIR: NEW_DATA_DIR, NODE_ENV: 'development' });
  const handle = openDatabase(newDbPath);
  const created = await createHouseholdBackup({
    householdId,
    handle,
    documentsDir: newDocs,
    password: PASSPHRASE,
  });
  handle.raw.close();
  const archivePath = path.join(ROOT, created.filename);
  writeFileSync(archivePath, created.bytes);
  check(
    'backup: household archive created',
    created.manifest.household?.id === householdId && created.manifest.formatVersion === 3,
    `${created.filename}, ${created.bytes.length} bytes`,
  );

  let refusedOther = false;
  let refusalReason = 'no error raised';
  try {
    await restoreHouseholdBackup({
      config,
      householdId: otherHouseholdId,
      archive: created.bytes,
      password: PASSPHRASE,
      assignedEmails: ['other@example.com'],
    });
  } catch (err) {
    refusedOther = err instanceof RestoreError;
    refusalReason = err instanceof Error ? err.message : String(err);
  }
  check(
    'restore: another household’s archive is refused',
    refusedOther && sha256File(otherDb) === otherHashBefore,
    `${refusalReason}; other household database unchanged`,
  );

  let refusedWrongPassphrase = false;
  const beforeWrong = sha256File(newDbPath);
  try {
    await restoreHouseholdBackup({
      config,
      householdId,
      archive: created.bytes,
      password: 'not-the-passphrase',
      assignedEmails: [ALEX, SAM],
    });
  } catch (err) {
    refusedWrongPassphrase = err instanceof BackupPasswordError || err instanceof RestoreError;
  }
  check(
    'restore: wrong passphrase is refused without changes',
    refusedWrongPassphrase && sha256File(newDbPath) === beforeWrong,
    '',
  );

  const restored = await restoreHouseholdBackup({
    config,
    householdId,
    archive: created.bytes,
    password: PASSPHRASE,
    assignedEmails: [ALEX, SAM],
  });
  check(
    'restore: same-household archive restored',
    restored.personLinksCleared === 1,
    `personLinksCleared=${restored.personLinksCleared}, documentsRestored=${restored.documentsRestored}`,
  );
  const afterCounts = tableCounts(newDbPath);
  const afterDiffs = sameCounts(legacy.counts, afterCounts);
  check(
    'restore: record counts match the legacy copy again',
    afterDiffs.length === 0,
    afterDiffs.join('; ') || 'all tables equal',
  );
  const afterIntegrity = integrity(newDbPath);
  check(
    'restore: integrity and foreign keys still clean',
    afterIntegrity.integrity === 'ok' && afterIntegrity.foreignKeyViolations === 0,
    afterIntegrity.integrity,
  );
  const restoredRows = attachmentRows(newDbPath);
  const restoredHashOk = restoredRows.every(
    (row) => sha256File(path.join(newDocs, row.file_key)) === row.sha256,
  );
  check(
    'restore: attachment hashes still match',
    restoredHashOk && restoredRows.length === legacyAttachments.length,
    `${restoredRows.length} files`,
  );
  const restoredDb = new Database(newDbPath, { readonly: true, fileMustExist: true });
  const former = restoredDb.prepare("SELECT email FROM people WHERE label = 'Lodger'").get() as {
    email: string | null;
  };
  restoredDb.close();
  check(
    'restore: unassigned sign-in link cleared',
    former.email === null,
    `Lodger email=${former.email ?? 'none'}`,
  );

  const failed = checks.filter((c) => !c.ok);
  console.log(
    `\n${checks.length - failed.length} of ${checks.length} checks passed. ` +
      (failed.length === 0 ? 'Rehearsal succeeded (fictional data).' : `${failed.length} failed.`),
  );
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error('rehearsal stopped:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
