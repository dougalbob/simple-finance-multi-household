import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { loadAppConfig, type AppConfig } from '../config';
import { bootstrapRegistryAdmin } from './domain';
import { systemRegistryPath } from './paths';
import { applyRegistryMigrations } from './schema';

/**
 * Opens and caches the system registry handle
 * (`<dataDir>/system/registry.sqlite`, docs/SPEC.md §18.1).
 *
 * The registry is a single control-plane database per installation — unlike
 * household finance data, a process-wide handle is correct here. What is
 * forbidden is a process-wide *current-household* pointer (plan §3); this
 * module never selects household data.
 *
 * Opening applies pending registry migrations (idempotent; the production
 * entrypoint also runs `scripts/registry-migrate.cjs` first so a failure
 * still refuses startup, blueprint §7) and then performs the one-time
 * administrator bootstrap when the roster is empty and `REGISTRY_ADMIN_EMAIL`
 * is configured.
 */

export type RegistryDb = Database.Database;

interface DatabaseFileIdentity {
  dev: number;
  ino: number;
}

interface RegistryHandle {
  raw: RegistryDb;
  registryPath: string;
  fileIdentity: DatabaseFileIdentity;
}

export function openRegistry(registryPath: string): RegistryDb {
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  const raw = new Database(registryPath);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');
  raw.pragma('busy_timeout = 5000');
  applyRegistryMigrations(raw);
  return raw;
}

let handle: RegistryHandle | null = null;

export function getRegistry(config: AppConfig = loadAppConfig()): RegistryDb {
  const registryPath = config.registryPath;
  if (
    handle === null ||
    path.resolve(handle.registryPath) !== path.resolve(registryPath) ||
    !sameDatabaseFile(handle.fileIdentity, registryPath)
  ) {
    const previous = handle;
    handle = null;
    if (previous !== null) previous.raw.close();
    // Open first, cache after: if the open throws (unwritable path, missing
    // directory), the next call must retry cleanly instead of finding a
    // closed handle that still points at the right path.
    const raw = openRegistry(registryPath);
    handle = { raw, registryPath, fileIdentity: databaseFileIdentity(registryPath) };
    maybeBootstrap(raw, config);
  }
  return handle.raw;
}

/**
 * While the roster is completely empty and the trusted environment names a
 * bootstrap administrator, create that administrator's household and
 * assignment together. Consumed once: the last-administrator guard keeps the
 * roster non-empty afterwards, so no later restart can bootstrap a second one.
 */
function maybeBootstrap(raw: RegistryDb, config: AppConfig): void {
  const adminEmail = config.registryBootstrap.adminEmail;
  if (adminEmail === null) return;
  const result = bootstrapRegistryAdmin(raw, {
    email: adminEmail,
    householdName: config.registryBootstrap.householdName,
  });
  if (result !== null) {
    console.info(
      `[registry] bootstrapped platform administrator ${result.identity.email} ` +
        `with household ${result.household.id}`,
    );
  }
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

/** Close the shared handle (used by tests to switch isolated registries). */
export function closeRegistry(): void {
  if (handle !== null) {
    handle.raw.close();
    handle = null;
  }
}
