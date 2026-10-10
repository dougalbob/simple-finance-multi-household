import type { AppConfig } from '../config';
import type { Db, DbHandle } from '../db/client';
import { getHouseholdDbHandle, getHouseholdReadOnlyDbHandle } from '../db/client';
import { getRegistry, type RegistryDb } from '../registry/db';
import { assertSafeHouseholdId } from '../registry/ids';
import { householdDocumentsDir } from '../registry/paths';
import { describeSession, type HeaderSource, type User } from './current-user';
import { resolveSupportSelection, supportGrantIdFromHeaders } from './support';

/**
 * Immutable per-request data context. Its household identity comes only from
 * the verified registry, never from callers: a member's own assignment, or —
 * for a platform administrator with a live support grant — the grant's
 * household, which is then read-only. Callers never supply a household ID or
 * filesystem path. The contained database handle is cached by its derived
 * tenant path, not as a mutable process-wide current database.
 */
export interface SupportViewSummary {
  grantId: number;
  /** The administrator who holds the view (the signed-in identity). */
  supportEmail: string;
  householdName: string;
  expiresAt: string;
}

export type HouseholdContext = Readonly<
  User & {
    readonly dbHandle: DbHandle;
    readonly db: Db;
    readonly documentsDir: string;
    /** True for a support view: every write and every archive is refused. */
    readonly readOnly: boolean;
    readonly support: SupportViewSummary | null;
  }
>;

/**
 * Resolve an authenticated request to its household context. Authentication,
 * allowlist, assignment and active-household checks all stay in the single
 * `describeSession` choke point; a support selection is then layered on top
 * only through a live registry grant. Any database/path failure throws and
 * therefore fails closed; no browser-supplied tenant selection exists.
 *
 * `registry` is an optional test seam matching `describeSession`'s existing
 * test seam; production always reads the configured system registry.
 */
export async function householdContextFromHeaders(
  headerSource: HeaderSource,
  config: AppConfig,
  registry?: RegistryDb,
  now: Date = new Date(),
): Promise<HouseholdContext | null> {
  const session = await describeSession(headerSource, config, registry);

  const grantId = supportGrantIdFromHeaders(headerSource);
  if (grantId !== null) {
    const raw = registry ?? safeRegistry(config);
    if (raw !== null) {
      const selected = resolveSupportSelection(session, grantId, raw, now);
      if (selected !== null) {
        const householdId = assertSafeHouseholdId(selected.grant.householdId);
        const dbHandle = getHouseholdReadOnlyDbHandle(householdId, config);
        const context: HouseholdContext = {
          // The signed-in administrator: the grant was matched to this exact address.
          email: selected.grant.supportEmail,
          householdId,
          role: 'platform_admin',
          dbHandle,
          db: dbHandle.db,
          documentsDir: householdDocumentsDir(config.dataDir, householdId),
          readOnly: true,
          support: {
            grantId,
            supportEmail: selected.grant.supportEmail,
            householdName: selected.household.displayName,
            expiresAt: selected.grant.expiresAt,
          },
        };
        return Object.freeze(context);
      }
    }
    // An invalid, expired or revoked support selection grants nothing: fall
    // through to the administrator's own household (never the old one).
  }

  if (session.status !== 'ok') return null;

  const householdId = assertSafeHouseholdId(session.user.householdId);
  const dbHandle = getHouseholdDbHandle(householdId, config);
  const context: HouseholdContext = {
    ...session.user,
    householdId,
    dbHandle,
    db: dbHandle.db,
    documentsDir: householdDocumentsDir(config.dataDir, householdId),
    readOnly: false,
    support: null,
  };
  return Object.freeze(context);
}

function safeRegistry(config: AppConfig): RegistryDb | null {
  try {
    return getRegistry(config);
  } catch {
    return null;
  }
}
