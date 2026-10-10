import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import * as tar from 'tar';
import { loadAppConfig, type AppConfig } from '../src/lib/config';
import {
  createEncryptedBackup,
  BackupIncompleteError,
  inspectDocuments,
} from '../src/lib/backup/backup';
import { createHouseholdBackup, restoreHouseholdBackup } from '../src/lib/backup/household';
import { BackupPasswordError, decryptBackupPayload } from '../src/lib/backup/crypto';
import { RestoreError } from '../src/lib/backup/restore';
import {
  closeDbHandles,
  getHouseholdDbHandle,
  HouseholdUnavailableError,
  withHouseholdMaintenance,
} from '../src/lib/db/client';
import { openRegistry, type RegistryDb } from '../src/lib/registry/db';
import { assignIdentity, createHousehold } from '../src/lib/registry/domain';
import { householdDocumentsDir, systemRegistryPath } from '../src/lib/registry/paths';
import { createPerson, listPeople, setPersonEmail } from '../src/lib/records/people';
import { createPot, listPots } from '../src/lib/records/pots';
import { createPurchase } from '../src/lib/records/purchases';
import { storeAttachment } from '../src/lib/records/attachments';
import { findChildCategory } from '../src/lib/records/categories';
import { makeTempDir } from './helpers';

/**
 * Household backup and restore (MULTI_HOUSEHOLD_PLAN §5). An archive is one
 * household's records and attachments, named for that household. A restore can
 * replace only that same household; anything else is refused before a byte of
 * the target changes.
 */

const PASSWORD = 'a-long-enough-passphrase';
const T0 = new Date('2026-10-10T09:00:00Z');
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('household-scoped backup and restore', () => {
  let dataDir: string;
  let registry: RegistryDb;
  let ids: { alex: string; lee: string };

  const cfg = (email: string): AppConfig =>
    loadAppConfig({
      NODE_ENV: 'test',
      DATA_DIR: dataDir,
      AUTH_DEV_BYPASS: 'true',
      AUTH_DEV_IDENTITY_EMAIL: email,
    });

  /** Alex household's own handle and documents directory, as the verified context would supply them. */
  function openAlex() {
    const handle = getHouseholdDbHandle(ids.alex, cfg('alex@example.com'));
    const documentsDir = householdDocumentsDir(dataDir, ids.alex);
    return { handle, documentsDir };
  }

  before(async () => {
    dataDir = await makeTempDir('sf-household-backup-');
    closeDbHandles();
    registry = openRegistry(systemRegistryPath(dataDir));
    const alex = createHousehold(registry, { displayName: 'Alex household', actor: 'system' });
    assignIdentity(registry, { email: 'alex@example.com', householdId: alex.id, actor: 'system' });
    assignIdentity(registry, { email: 'sam@example.com', householdId: alex.id, actor: 'system' });
    const lee = createHousehold(registry, { displayName: 'Lee household', actor: 'system' });
    assignIdentity(registry, { email: 'lee@example.com', householdId: lee.id, actor: 'system' });
    ids = { alex: alex.id, lee: lee.id };

    // Alex household: a person linked to a registry-assigned sign-in, a pot,
    // a purchase, and a receipt attachment.
    const handle = getHouseholdDbHandle(ids.alex, cfg('alex@example.com'));
    const documentsDir = householdDocumentsDir(dataDir, ids.alex);
    const pot = createPot(handle.db, {
      label: 'Alex main account',
      kind: 'bank',
      sortOrder: 0,
      actor: 'alex@example.com',
      now: T0,
    });
    const person = createPerson(handle.db, { label: 'Alex', actor: 'alex@example.com', now: T0 });
    setPersonEmail(handle.db, {
      id: person.id,
      email: 'alex@example.com',
      allowedEmails: ['alex@example.com', 'sam@example.com'],
      actor: 'alex@example.com',
      now: T0,
    });
    const saved = createPurchase(handle.db, {
      potId: pot.id,
      totalPence: 4210,
      occurredAt: T0,
      paidByPersonId: person.id,
      supplierName: 'Tesco',
      actor: 'alex@example.com',
      lines: [
        {
          amountPence: 4210,
          categoryId: findChildCategory(handle.db, 'Groceries', 'Weekly Shop')!.id,
          targetKind: 'household',
        },
      ],
      now: T0,
    });
    await storeAttachment({
      db: handle.db,
      purchaseId: saved.purchase.id,
      originalName: 'receipt.png',
      bytes: PNG,
      actor: 'alex@example.com',
      documentsDir,
      now: T0,
    });

    // Lee household: its own pot, to prove an Alex restore never touches it.
    const leeHandle = getHouseholdDbHandle(lee.id, cfg('lee@example.com'));
    createPot(leeHandle.db, {
      label: 'Lee main account',
      kind: 'bank',
      sortOrder: 0,
      actor: 'lee@example.com',
      now: T0,
    });
    closeDbHandles();
  });

  after(() => {
    closeDbHandles();
    registry.close();
  });

  function labelsOf(householdId: string): {
    pots: string[];
    people: Array<{ label: string; email: string | null }>;
    receipts: string[];
  } {
    const handle = getHouseholdDbHandle(householdId, cfg('alex@example.com'));
    const pots = listPots(handle.db)
      .map((p) => p.label)
      .sort();
    const people = listPeople(handle.db).map((p) => ({ label: p.label, email: p.email }));
    const documents = householdDocumentsDir(dataDir, householdId);
    const receipts = existsSync(documents) ? readdirSync(documents).sort() : [];
    closeDbHandles();
    return { pots, people, receipts };
  }

  it('makes an archive that names its household and holds only that household', async () => {
    const { handle, documentsDir } = openAlex();
    const backup = await createHouseholdBackup({
      householdId: ids.alex,
      handle,
      documentsDir,
      password: PASSWORD,
      now: T0,
    });
    closeDbHandles();

    assert.equal(backup.manifest.formatVersion, 3);
    assert.equal(backup.manifest.household?.id, ids.alex);
    assert.match(backup.filename, /\.simple-finance-backup$/);

    const plain = decryptBackupPayload(backup.bytes, PASSWORD);
    const tmp = path.join(dataDir, 'inspect-archive.tar.gz');
    writeFileSync(tmp, plain);
    const members: string[] = [];
    await tar.t({ file: tmp, onentry: (entry) => members.push(entry.path) });
    assert.ok(
      members.some((name) => name.startsWith('documents/')),
      'attachments are in the archive',
    );
    assert.ok(
      members.every(
        (name) =>
          !name.includes(ids.lee) && !name.includes('registry') && !name.includes('households/'),
      ),
      `no other household, registry or tenant path: ${members.join(', ')}`,
    );
    rmSync(tmp);
  });

  it('restores only the named household, leaving every other household byte-for-byte the same', async () => {
    const { handle, documentsDir } = openAlex();
    const backup = await createHouseholdBackup({
      householdId: ids.alex,
      handle,
      documentsDir,
      password: PASSWORD,
      now: T0,
    });
    closeDbHandles();

    // Change Alex's data after the backup; the restore must roll it back.
    const later = openAlex();
    createPot(later.handle.db, {
      label: 'Added after the backup',
      kind: 'bank',
      sortOrder: 9,
      actor: 'alex@example.com',
      now: T0,
    });
    closeDbHandles();
    const beforeLee = labelsOf(ids.lee);
    const beforeAlex = labelsOf(ids.alex);
    assert.ok(beforeAlex.pots.includes('Added after the backup'));

    const summary = await restoreHouseholdBackup({
      config: cfg('alex@example.com'),
      householdId: ids.alex,
      archive: backup.bytes,
      password: PASSWORD,
      assignedEmails: ['alex@example.com', 'sam@example.com'],
      now: T0,
    });
    closeDbHandles();

    assert.equal(summary.documentsRestored, 1);
    assert.equal(summary.personLinksCleared, 0);
    const afterAlex = labelsOf(ids.alex);
    assert.ok(
      !afterAlex.pots.includes('Added after the backup'),
      'Alex’s later pot is rolled back',
    );
    assert.deepEqual(afterAlex.pots, ['Alex main account']);
    assert.equal(afterAlex.receipts.length, 1, 'the receipt file comes back');

    assert.deepEqual(labelsOf(ids.lee), beforeLee, 'Lee household is untouched');
  });

  it('refuses an archive made for another household before changing anything', async () => {
    const { handle, documentsDir } = openAlex();
    const backup = await createHouseholdBackup({
      householdId: ids.alex,
      handle,
      documentsDir,
      password: PASSWORD,
      now: T0,
    });
    closeDbHandles();

    const leeBefore = labelsOf(ids.lee);
    await assert.rejects(
      restoreHouseholdBackup({
        config: cfg('lee@example.com'),
        householdId: ids.lee,
        archive: backup.bytes,
        password: PASSWORD,
        assignedEmails: ['lee@example.com'],
      }),
      (error: unknown) => error instanceof RestoreError && /household/i.test(error.message),
    );
    closeDbHandles();
    assert.deepEqual(labelsOf(ids.lee), leeBefore);
  });

  it('refuses a legacy format 2 archive and a tampered archive, and leaves data unchanged', async () => {
    const { handle, documentsDir } = openAlex();
    const legacy = await createEncryptedBackup({
      handle,
      documentsDir,
      password: PASSWORD,
      now: T0,
    });
    const current = await createHouseholdBackup({
      householdId: ids.alex,
      handle,
      documentsDir,
      password: PASSWORD,
      now: T0,
    });
    closeDbHandles();

    const before = labelsOf(ids.alex);
    await assert.rejects(
      restoreHouseholdBackup({
        config: cfg('alex@example.com'),
        householdId: ids.alex,
        archive: legacy.bytes,
        password: PASSWORD,
        assignedEmails: [],
      }),
      RestoreError,
    );
    const tampered = Buffer.from(current.bytes);
    const flipAt = tampered.length - 9;
    tampered[flipAt] = (tampered[flipAt] ?? 0) ^ 0xff;
    await assert.rejects(
      restoreHouseholdBackup({
        config: cfg('alex@example.com'),
        householdId: ids.alex,
        archive: tampered,
        password: PASSWORD,
        assignedEmails: [],
      }),
    );
    closeDbHandles();
    assert.deepEqual(labelsOf(ids.alex), before);
  });

  it('refuses a wrong passphrase with the password error and changes nothing', async () => {
    const { handle, documentsDir } = openAlex();
    const backup = await createHouseholdBackup({
      householdId: ids.alex,
      handle,
      documentsDir,
      password: PASSWORD,
      now: T0,
    });
    closeDbHandles();
    await assert.rejects(
      restoreHouseholdBackup({
        config: cfg('alex@example.com'),
        householdId: ids.alex,
        archive: backup.bytes,
        password: 'the-wrong-passphrase',
        assignedEmails: [],
      }),
      BackupPasswordError,
    );
    closeDbHandles();
  });

  it('drops a sign-in link the registry no longer assigns to the household, and reports how many', async () => {
    const { handle, documentsDir } = openAlex();
    const backup = await createHouseholdBackup({
      householdId: ids.alex,
      handle,
      documentsDir,
      password: PASSWORD,
      now: T0,
    });
    closeDbHandles();

    const summary = await restoreHouseholdBackup({
      config: cfg('alex@example.com'),
      householdId: ids.alex,
      archive: backup.bytes,
      password: PASSWORD,
      // Alex's address is no longer assigned to this household (e.g. reassigned).
      assignedEmails: ['sam@example.com'],
    });
    closeDbHandles();
    assert.equal(summary.personLinksCleared, 1);
    const people = labelsOf(ids.alex).people;
    assert.deepEqual(
      people.map((p) => p.email),
      [null],
    );
  });

  it('refuses a backup when an attachment file is missing, rather than leaving it out silently', async () => {
    const { handle, documentsDir } = openAlex();
    const files = readdirSync(documentsDir);
    assert.ok(files.length > 0);
    const first = files[0];
    assert.ok(first !== undefined);
    const documentFile = path.join(documentsDir, first);
    const saved = readFileSync(documentFile);
    rmSync(documentFile);
    try {
      await assert.rejects(
        createHouseholdBackup({
          householdId: ids.alex,
          handle,
          documentsDir,
          password: PASSWORD,
          now: T0,
        }),
        BackupIncompleteError,
      );
    } finally {
      writeFileSync(documentFile, saved);
      closeDbHandles();
    }
    const status = await inspectDocuments(
      getHouseholdDbHandle(ids.alex, cfg('alex@example.com')),
      documentsDir,
    );
    closeDbHandles();
    assert.deepEqual(status.missing, []);
  });

  it('keeps a household out of reach for the length of a restore, and refuses a second restore meanwhile', async () => {
    const config = cfg('alex@example.com');
    await withHouseholdMaintenance(ids.alex, config, async () => {
      assert.throws(() => getHouseholdDbHandle(ids.alex, config), HouseholdUnavailableError);
      await assert.rejects(
        withHouseholdMaintenance(ids.alex, config, async () => undefined),
        HouseholdUnavailableError,
      );
    });
    assert.ok(getHouseholdDbHandle(ids.alex, config));
    closeDbHandles();
  });
});
