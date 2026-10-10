import Database from 'better-sqlite3';
import type { AppConfig } from '../config';
import { withHouseholdMaintenance, type DbHandle } from '../db/client';
import { assertSafeHouseholdId } from '../registry/ids';
import { householdDatabasePath, householdDocumentsDir } from '../registry/paths';
import { createEncryptedBackup, type CreatedBackup } from './backup';
import { restoreEncryptedBackup, type RestoreSummary } from './restore';

/**
 * Household-scoped backup and restore (MULTI_HOUSEHOLD_PLAN §5). Both
 * operations take their database and documents paths from the household ID
 * they are given — which the caller must have taken from a verified request
 * context — and never from the request body or the archive.
 *
 * What a household archive contains: its own WAL-consistent database snapshot,
 * its own attachments, and a manifest that names this household. It never
 * contains the registry, the environment file, or any other household.
 */

export interface CreateHouseholdBackupInput {
  householdId: string;
  /** The household's own handle from the verified context. */
  handle: DbHandle;
  /** The household's own documents directory from the verified context. */
  documentsDir: string;
  password: string;
  now?: Date;
}

export async function createHouseholdBackup(
  input: CreateHouseholdBackupInput,
): Promise<CreatedBackup> {
  return createEncryptedBackup({
    handle: input.handle,
    documentsDir: input.documentsDir,
    householdId: assertSafeHouseholdId(input.householdId),
    password: input.password,
    now: input.now,
  });
}

export interface RestoreHouseholdBackupInput {
  config: AppConfig;
  householdId: string;
  archive: Buffer;
  password: string;
  /**
   * The sign-in emails the registry currently assigns to this household. Any
   * `people` link in the archive that names an address outside this list is
   * dropped from the restored copy, because it can no longer be verified.
   */
  assignedEmails: readonly string[];
  now?: Date;
}

export interface HouseholdRestoreResult extends RestoreSummary {
  /** Sign-in links removed from the restored copy because they were not verifiable. */
  personLinksCleared: number;
}

/**
 * Replace one household's database and documents with an archive made for that
 * same household. Refuses (before touching anything) an archive for another
 * household, a legacy archive, a tampered archive, or a newer-format archive.
 * The household is under maintenance for the swap, so no request can observe a
 * half-replaced database.
 */
export async function restoreHouseholdBackup(
  input: RestoreHouseholdBackupInput,
): Promise<HouseholdRestoreResult> {
  const householdId = assertSafeHouseholdId(input.householdId);
  const databasePath = householdDatabasePath(input.config.dataDir, householdId);
  const documentsDir = householdDocumentsDir(input.config.dataDir, householdId);
  let personLinksCleared = 0;
  const summary = await withHouseholdMaintenance(householdId, input.config, () =>
    restoreEncryptedBackup({
      archive: input.archive,
      password: input.password,
      targetDatabasePath: databasePath,
      targetDocumentsDir: documentsDir,
      expectedHouseholdId: householdId,
      now: input.now,
      beforeSwap: (stagedPath) => {
        personLinksCleared = clearUnverifiedPersonLinks(stagedPath, input.assignedEmails);
      },
    }),
  );
  return { ...summary, personLinksCleared };
}

/**
 * Remove sign-in links from a staged database copy when the address is not one
 * the registry assigns to the household. Runs only on the staged copy, before
 * the swap. Returns how many links were removed.
 */
export function clearUnverifiedPersonLinks(
  stagedDatabasePath: string,
  assignedEmails: readonly string[],
): number {
  const allowed = new Set(assignedEmails.map((email) => email.trim().toLowerCase()));
  const raw = new Database(stagedDatabasePath);
  try {
    const linked = raw
      .prepare('SELECT id, email FROM people WHERE email IS NOT NULL')
      .all() as Array<{ id: number; email: string }>;
    const stale = linked.filter((row) => !allowed.has(row.email.trim().toLowerCase()));
    const clear = raw.prepare('UPDATE people SET email = NULL WHERE id = ?');
    for (const row of stale) clear.run(row.id);
    return stale.length;
  } finally {
    raw.close();
  }
}
