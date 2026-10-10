import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { loadAppConfig, type AppConfig } from '../config';
import { householdDatabasePath } from '../registry/paths';
import { applyMigrations } from './migrate';
import * as schema from './schema';

export type Db = BetterSQLite3Database<typeof schema>;
export type RawDatabase = Database.Database;

export interface DbHandle {
  db: Db;
  raw: RawDatabase;
  fileIdentity: DatabaseFileIdentity;
}

interface DatabaseFileIdentity {
  dev: number;
  ino: number;
}

/**
 * Open one SQLite database with the pragmas this app depends on: WAL for safe
 * concurrent reads, foreign keys enforced, bounded lock waits.
 */
export function openDatabase(databasePath: string): DbHandle {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const raw = new Database(databasePath);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');
  raw.pragma('busy_timeout = 5000');
  return { db: drizzle(raw, { schema }), raw, fileIdentity: databaseFileIdentity(databasePath) };
}

/**
 * Process cache of independent tenant handles. The key is the absolute path
 * derived from the validated registry household ID, never an ID/path received
 * from the browser. There is intentionally no process-wide "current" handle:
 * simultaneous requests keep their own immutable context and use the handle
 * for that context's database.
 */
const handlesByPath = new Map<string, DbHandle>();

/**
 * Resolve a finance handle for a household already verified by the request
 * session gate. Callers must pass the household ID from `describeSession`'s
 * active registry assignment; do not take one from request data.
 *
 * The path is derived only through `householdDatabasePath`, which validates
 * the opaque hex32 ID. Open and migrate before caching, so a failed open or
 * migration can never leave a closed/stale connection answering path checks.
 * Migrations are idempotent; production also migrates all registered tenants
 * at container startup, while this covers tenants created during app uptime.
 */
export function getHouseholdDbHandle(
  householdId: string,
  config: AppConfig = loadAppConfig(),
): DbHandle {
  const databasePath = householdDatabasePath(config.dataDir, householdId);
  const key = path.resolve(databasePath);
  const previous = handlesByPath.get(key);

  if (
    previous !== undefined &&
    path.resolve(previous.raw.name) === key &&
    sameDatabaseFile(previous.fileIdentity, databasePath)
  ) {
    return previous;
  }

  if (previous !== undefined) {
    handlesByPath.delete(key);
    if (previous.raw.open) previous.raw.close();
  }

  const opened = openDatabase(databasePath);
  try {
    // Existing registered households are also migrated by scripts/migrate.cjs
    // during container startup. Re-running here is safe and is required for a
    // household created after startup or a new installation's first login.
    applyMigrations(opened.db);
  } catch (error) {
    opened.raw.close();
    throw error;
  }

  handlesByPath.set(key, opened);
  return opened;
}

function databaseFileIdentity(databasePath: string): DatabaseFileIdentity {
  const stat = fs.statSync(databasePath);
  return { dev: stat.dev, ino: stat.ino };
}

function sameDatabaseFile(identity: DatabaseFileIdentity, databasePath: string): boolean {
  try {
    const current = databaseFileIdentity(databasePath);
    return current.dev === identity.dev && current.ino === identity.ino;
  } catch {
    return false;
  }
}

/** Close cached tenant handles (used by isolated tests and process shutdown). */
export function closeDbHandles(): void {
  const openHandles = [...handlesByPath.values()];
  handlesByPath.clear();
  for (const handle of openHandles) {
    if (handle.raw.open) handle.raw.close();
  }
}
