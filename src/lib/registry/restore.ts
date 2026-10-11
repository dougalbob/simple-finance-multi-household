import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { AppConfig } from '../config';
import { closeRegistry, getRegistry } from './db';

/**
 * Registry backup restore (admin panel, MULTI_HOUSEHOLD_PLAN §4).
 *
 * `POST /admin/restore` is a whole-file replace of the single live registry
 * (`<dataDir>/system/registry.sqlite`). Because it is destructive, this module
 * refuses to touch the live file until the upload has proven itself, and it
 * keeps the bytes it replaced so a wrong upload can be recovered by hand:
 *
 *  1. A size cap — the registry is membership metadata only; no legitimate
 *     backup approaches it.
 *  2. The SQLite magic header (first 16 bytes).
 *  3. `PRAGMA integrity_check` on a throwaway copy — never on the live file.
 *  4. Presence of the registry's own tables, so a *valid but unrelated*
 *     SQLite database (a household database, an imported file) is refused
 *     instead of wiping the roster.
 *
 * Only then does it snapshot the live registry, swap the uploaded file in
 * atomically, and reopen. Every restore logs its outcome — path, byte length,
 * sha256, row counts before and after, and the pre-restore copy — so a live
 * installation can prove from its container logs whether a restore landed.
 */

/**
 * Bounded upload for a registry restore. The registry holds the household
 * roster, identity assignments, support grants and audit log — metadata only,
 * kilobytes in practice. The cap is defence against a hostile or mistaken
 * multi-gigabyte upload, not a sizing judgement.
 */
export const MAX_REGISTRY_RESTORE_BYTES = 64 * 1024 * 1024;

/** Every SQLite database file begins with this 16-byte header. */
export const SQLITE_MAGIC_HEADER = Buffer.from('SQLite format 3\0', 'ascii');

/**
 * Tables that make a SQLite database *this* installation's system registry
 * (drizzle/registry/0001_initial.sql). A backup missing them would leave the
 * app without a roster, so it is refused before the live file is touched.
 */
const REQUIRED_REGISTRY_TABLES = ['households', 'identities'] as const;

/** A refused upload: the message is safe to show the administrator. */
export class RegistryRestoreError extends Error {}

export function sha256Hex(bytes: Buffer): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

/**
 * Validate uploaded bytes before they may replace the live registry. Throws
 * `RegistryRestoreError` with an administrator-safe message on any refusal.
 */
export function validateRegistryBackupBytes(bytes: Buffer): void {
  if (bytes.length === 0) {
    throw new RegistryRestoreError('The uploaded file is empty.');
  }
  if (bytes.length > MAX_REGISTRY_RESTORE_BYTES) {
    throw new RegistryRestoreError('That file is larger than a registry backup can be.');
  }
  if (!bytes.subarray(0, SQLITE_MAGIC_HEADER.length).equals(SQLITE_MAGIC_HEADER)) {
    throw new RegistryRestoreError(
      'That file is not a SQLite database. Choose the registry backup you downloaded.',
    );
  }

  // Integrity-check a throwaway copy: the live registry must never be opened
  // against untrusted bytes, and a read-only open cannot repair or rewrite
  // the upload.
  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-restore-'));
  const scratchDb = path.join(scratchDir, 'upload.sqlite');
  fs.writeFileSync(scratchDb, bytes);
  let probe: Database.Database | null = null;
  try {
    // Any failure anywhere in the probe — open, integrity check, table scan —
    // means the same thing for the live registry: refuse the upload. SQLite
    // reports some corruption only at query time, not at open time.
    try {
      probe = new Database(scratchDb, { readonly: true, fileMustExist: true });
      const rows = probe.pragma('integrity_check') as Array<{ integrity_check: string }>;
      const ok = rows.length === 1 && rows[0]?.integrity_check === 'ok';
      if (!ok) {
        throw new RegistryRestoreError('That SQLite database failed its integrity check.');
      }
      const tables = new Set(
        probe
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
          .all()
          .map((row) => (row as { name: string }).name),
      );
      for (const required of REQUIRED_REGISTRY_TABLES) {
        if (!tables.has(required)) {
          throw new RegistryRestoreError(
            'That database is not a system registry backup — the household roster is missing.',
          );
        }
      }
    } catch (error) {
      if (error instanceof RegistryRestoreError) throw error;
      throw new RegistryRestoreError(
        'That file has a SQLite header but is not a readable database.',
      );
    }
  } finally {
    if (probe !== null) probe.close();
    fs.rmSync(scratchDir, { recursive: true, force: true });
  }
}

/** Row counts the outcome log reports, so a restore is provable after the fact. */
export interface RegistryRowCounts {
  readonly households: number;
  readonly identities: number;
}

export function registryRowCounts(db: Database.Database): RegistryRowCounts {
  const households = (db.prepare('SELECT count(*) AS n FROM households').get() as { n: number }).n;
  const identities = (db.prepare('SELECT count(*) AS n FROM identities').get() as { n: number }).n;
  return { households, identities };
}

/**
 * The pre-restore copy's filename for a given instant:
 * `registry.sqlite.pre-restore-2026-10-11T12-00-00-000Z`. Timestamps sort
 * lexicographically, and colons/dots are replaced so the name is safe on any
 * filesystem the container may meet.
 */
export function preRestoreCopyPath(registryPath: string, instant: Date = new Date()): string {
  const stamp = instant.toISOString().replace(/[:.]/g, '-');
  return `${registryPath}.pre-restore-${stamp}`;
}

export interface RegistryReplaceOutcome {
  readonly registryPath: string;
  readonly bytesWritten: number;
  readonly sha256: string;
  /** null when there was no live registry file to preserve. */
  readonly preRestoreCopy: string | null;
  readonly rowsBefore: RegistryRowCounts;
  readonly rowsAfter: RegistryRowCounts;
}

/**
 * Replace the live registry with validated bytes. The caller must have
 * validated them first (`validateRegistryBackupBytes`); this function
 * re-checks defensively, then performs the swap.
 *
 * The swap is an atomic inode replacement, not an in-place overwrite:
 *
 *  1. a consistent pre-restore snapshot is taken with SQLite's own backup API
 *     (a byte copy of the main file could miss un-checkpointed WAL frames);
 *  2. the uploaded bytes are written to a temporary file in the same
 *     directory and fsynced;
 *  3. the shared handle is closed and the temp file is renamed over the live
 *     path — rename(2) swaps the inode atomically, so no reader ever sees a
 *     half-written registry, even if the process dies mid-restore;
 *  4. the WAL/SHM sidecar names that belonged to the OLD inode are removed so
 *     the new database cannot resurrect stale frames during recovery, and the
 *     registry is reopened (migrations + bootstrap run).
 *
 * Any other connection still holding the old inode (development mode evaluates
 * pages and route handlers as separate module graphs, each with its own
 * cached handle) keeps a consistent descriptor on the orphaned old files and
 * reopens the new file the next time it calls `getRegistry` — the dev/ino
 * identity check there exists precisely for a replaced file.
 *
 * If the reopened registry cannot be opened, the pre-restore snapshot is
 * swapped back in so the installation keeps working, and the original error
 * is rethrown for the caller to report.
 */
export async function replaceRegistryFile(
  config: AppConfig,
  bytes: Buffer,
): Promise<RegistryReplaceOutcome> {
  validateRegistryBackupBytes(bytes);

  const registryPath = config.registryPath;
  const systemDir = path.dirname(registryPath);
  const dbBefore = getRegistry(config);
  const rowsBefore = registryRowCounts(dbBefore);

  // Snapshot the live registry through SQLite itself while the handle lives:
  // a consistent copy even with un-checkpointed WAL frames, and the rollback
  // source if the reopened upload misbehaves.
  let preRestoreCopy: string | null = null;
  if (fs.existsSync(registryPath)) {
    preRestoreCopy = preRestoreCopyPath(registryPath);
    await dbBefore.backup(preRestoreCopy);
  }

  const uploadTmp = path.join(systemDir, 'registry.sqlite.upload-tmp');
  try {
    fs.writeFileSync(uploadTmp, bytes);
    const fd = fs.openSync(uploadTmp, 'r+');
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    closeRegistry();
    fs.renameSync(uploadTmp, registryPath);
  } finally {
    if (fs.existsSync(uploadTmp)) fs.unlinkSync(uploadTmp);
  }

  // The sidecar names on disk now belong to the orphaned old inode. Remove
  // the names before the new database opens so its recovery cannot apply
  // stale frames; any other live connection keeps its own descriptors on the
  // old files and heals via getRegistry's dev/ino check.
  if (fs.existsSync(`${registryPath}-wal`)) fs.unlinkSync(`${registryPath}-wal`);
  if (fs.existsSync(`${registryPath}-shm`)) fs.unlinkSync(`${registryPath}-shm`);

  try {
    getRegistry(config);
  } catch (error) {
    // The uploaded bytes opened as a database during validation, but the live
    // reopen failed (for example a backup written by a newer schema). Swap
    // the previous registry back so the app stays usable, then report.
    if (preRestoreCopy !== null) {
      try {
        closeRegistry();
        const rollbackTmp = path.join(systemDir, 'registry.sqlite.rollback-tmp');
        fs.copyFileSync(preRestoreCopy, rollbackTmp);
        fs.renameSync(rollbackTmp, registryPath);
        if (fs.existsSync(`${registryPath}-wal`)) fs.unlinkSync(`${registryPath}-wal`);
        if (fs.existsSync(`${registryPath}-shm`)) fs.unlinkSync(`${registryPath}-shm`);
        getRegistry(config);
      } catch {
        // Nothing more we can do here; the original error is the report.
      }
    }
    throw error;
  }

  const rowsAfter = registryRowCounts(getRegistry(config));
  const outcome: RegistryReplaceOutcome = {
    registryPath,
    bytesWritten: bytes.length,
    sha256: sha256Hex(bytes),
    preRestoreCopy,
    rowsBefore,
    rowsAfter,
  };
  console.info(
    `[registry-restore] replaced ${outcome.registryPath} ` +
      `(${outcome.bytesWritten} bytes, sha256 ${outcome.sha256}); ` +
      `households ${rowsBefore.households}→${rowsAfter.households}, ` +
      `identities ${rowsBefore.identities}→${rowsAfter.identities}; ` +
      `pre-restore copy: ${preRestoreCopy ?? 'none (no previous registry file)'}`,
  );
  return outcome;
}
