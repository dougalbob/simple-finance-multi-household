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

/** A household's database is being replaced (restore); requests must wait or fail. */
export class HouseholdUnavailableError extends Error {
  constructor() {
    super('Household data is being restored. Try again in a moment.');
    this.name = 'HouseholdUnavailableError';
  }
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
 * Process caches of independent tenant handles. The key is the absolute path
 * derived from the validated registry household ID, never an ID/path received
 * from the browser. There is intentionally no process-wide "current" handle:
 * simultaneous requests keep their own immutable context and use the handle
 * for that context's database.
 */
const handlesByPath = new Map<string, DbHandle>();
const readOnlyHandlesByPath = new Map<string, DbHandle>();

/**
 * Households whose files are being replaced right now (a restore). While a
 * household is listed, every handle request for it throws instead of opening
 * a file that is mid-swap — a missing file must never be silently created.
 */
const householdsUnderMaintenance = new Set<string>();

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
  assertNotUnderMaintenance(householdId);
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

/**
 * A read-only connection to a household's database, for support views
 * (MULTI_HOUSEHOLD_PLAN §4). The engine itself refuses writes (`readonly` plus
 * `query_only`), so a support session cannot change a household's records even
 * if a code path forgot to check. It shares the migration step above, so the
 * schema is always current before it is opened, and it is cached separately so
 * it never becomes a writable handle by accident.
 */
export function getHouseholdReadOnlyDbHandle(
  householdId: string,
  config: AppConfig = loadAppConfig(),
): DbHandle {
  assertNotUnderMaintenance(householdId);
  const databasePath = householdDatabasePath(config.dataDir, householdId);
  // A support view never creates a household's database: a household that has
  // not yet been opened by a member has nothing to read.
  if (!fs.existsSync(databasePath)) throw new HouseholdUnavailableError();
  // Migrates through the writable path (idempotent, cached) before reading.
  getHouseholdDbHandle(householdId, config);
  const key = path.resolve(databasePath);
  const previous = readOnlyHandlesByPath.get(key);
  if (
    previous !== undefined &&
    previous.raw.open &&
    path.resolve(previous.raw.name) === key &&
    sameDatabaseFile(previous.fileIdentity, databasePath)
  ) {
    return previous;
  }
  if (previous !== undefined) {
    readOnlyHandlesByPath.delete(key);
    if (previous.raw.open) previous.raw.close();
  }

  const raw = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    raw.pragma('query_only = ON');
    raw.pragma('busy_timeout = 5000');
  } catch (error) {
    raw.close();
    throw error;
  }
  const handle: DbHandle = {
    db: drizzle(raw, { schema }),
    raw,
    fileIdentity: databaseFileIdentity(databasePath),
  };
  readOnlyHandlesByPath.set(key, handle);
  return handle;
}

/** Close and forget every cached handle for one household (both kinds). */
export function closeHouseholdDbHandles(householdId: string, config: AppConfig): void {
  const key = path.resolve(householdDatabasePath(config.dataDir, householdId));
  for (const cache of [handlesByPath, readOnlyHandlesByPath]) {
    const handle = cache.get(key);
    cache.delete(key);
    if (handle !== undefined && handle.raw.open) handle.raw.close();
  }
}

/**
 * Run `work` while a household's files may be replaced: its cached handles are
 * closed, new requests for it fail with HouseholdUnavailableError, and the
 * handles reopen cleanly afterwards. Other households are untouched.
 */
export async function withHouseholdMaintenance<T>(
  householdId: string,
  config: AppConfig,
  work: () => Promise<T>,
): Promise<T> {
  if (householdsUnderMaintenance.has(householdId)) throw new HouseholdUnavailableError();
  householdsUnderMaintenance.add(householdId);
  try {
    closeHouseholdDbHandles(householdId, config);
    return await work();
  } finally {
    closeHouseholdDbHandles(householdId, config);
    householdsUnderMaintenance.delete(householdId);
  }
}

function assertNotUnderMaintenance(householdId: string): void {
  if (householdsUnderMaintenance.has(householdId)) throw new HouseholdUnavailableError();
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
  const openHandles = [...handlesByPath.values(), ...readOnlyHandlesByPath.values()];
  handlesByPath.clear();
  readOnlyHandlesByPath.clear();
  for (const handle of openHandles) {
    if (handle.raw.open) handle.raw.close();
  }
}
