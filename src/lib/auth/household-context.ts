import type { AppConfig } from '../config';
import type { Db, DbHandle } from '../db/client';
import { getHouseholdDbHandle } from '../db/client';
import { householdDocumentsDir } from '../registry/paths';
import type { RegistryDb } from '../registry/db';
import { assertSafeHouseholdId } from '../registry/ids';
import { describeSession, type HeaderSource, type User } from './current-user';

/**
 * Immutable per-request data context. Its household identity comes only from
 * `describeSession`'s verified registry assignment; callers never supply a
 * household ID or filesystem path. The contained database handle is cached by
 * its derived tenant path, not as a mutable process-wide current database.
 */
export type HouseholdContext = Readonly<
  User & {
    readonly dbHandle: DbHandle;
    readonly db: Db;
    readonly documentsDir: string;
  }
>;

/**
 * Resolve an authenticated request to its assigned household and open that
 * household's independent finance database. Authentication, allowlist,
 * assignment and active-household checks all remain in the existing single
 * `describeSession` choke point. Any database/path failure throws and therefore
 * fails closed; no alternate or browser-supplied tenant selection exists.
 *
 * `registry` is an optional test seam matching `describeSession`'s existing
 * test seam; production always reads the configured system registry.
 */
export async function householdContextFromHeaders(
  headerSource: HeaderSource,
  config: AppConfig,
  registry?: RegistryDb,
): Promise<HouseholdContext | null> {
  const session = await describeSession(headerSource, config, registry);
  if (session.status !== 'ok') return null;

  const householdId = assertSafeHouseholdId(session.user.householdId);
  const dbHandle = getHouseholdDbHandle(householdId, config);
  const context: HouseholdContext = {
    ...session.user,
    householdId,
    dbHandle,
    db: dbHandle.db,
    documentsDir: householdDocumentsDir(config.dataDir, householdId),
  };
  return Object.freeze(context);
}
