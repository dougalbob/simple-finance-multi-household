import type { AppConfig } from '../config';
import { getRegistry, type RegistryDb } from '../registry/db';
import { getHousehold } from '../registry/domain';
import {
  resolveSupportGrant,
  listSupportGrants,
  supportGrantStatus,
  touchSupportGrant,
  type ResolvedSupportGrant,
} from '../registry/support';
import { describeSession, type HeaderSource, type SessionState } from './current-user';

/**
 * Support view selection (MULTI_HOUSEHOLD_PLAN §4). A platform administrator
 * who has been given a live grant selects it with an httpOnly cookie that holds
 * only the grant's registry ID — never a household ID or a path. The grant is
 * re-validated against the verified sign-in and the registry on every request,
 * so a revoked, expired or otherwise invalid grant selects nothing: the request
 * falls back to the administrator's own household and the household is never
 * reached.
 */
export const SUPPORT_VIEW_COOKIE = 'sf_support_view';

/** Seconds a support cookie may live: the longest grant the household can choose. */
export const SUPPORT_VIEW_MAX_AGE_SECONDS = 24 * 60 * 60;

const GRANT_ID_PATTERN = /^[1-9][0-9]{0,9}$/;

export function supportGrantIdFromHeaders(headerSource: HeaderSource): number | null {
  const cookieHeader = headerSource.get('cookie');
  if (cookieHeader === null || cookieHeader === '') return null;
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(`${SUPPORT_VIEW_COOKIE}=`)) continue;
    const value = trimmed.slice(SUPPORT_VIEW_COOKIE.length + 1);
    if (!GRANT_ID_PATTERN.test(value)) return null;
    const id = Number(value);
    return Number.isSafeInteger(id) ? id : null;
  }
  return null;
}

/** Only a verified platform administrator session may select a support view. */
function administratorEmail(session: SessionState): string | null {
  if (session.status !== 'ok' && session.status !== 'household-deactivated') return null;
  return session.user.role === 'platform_admin' ? session.user.email : null;
}

/**
 * Resolve a support selection for this session, or null. Read-only apart from
 * the throttled first/last-used stamp. Never throws for an ordinary invalid
 * grant; database failures propagate so the caller fails closed.
 */
export function resolveSupportSelection(
  session: SessionState,
  grantId: number,
  registry: RegistryDb,
  now: Date,
): ResolvedSupportGrant | null {
  const supportEmail = administratorEmail(session);
  if (supportEmail === null) return null;
  const resolved = resolveSupportGrant(registry, { grantId, supportEmail, now });
  if (resolved === null) return null;
  touchSupportGrant(registry, grantId, now);
  return resolved;
}

export interface SupportBannerState {
  /** An administrator is looking at a household's data read-only. */
  viewing: {
    grantId: number;
    householdName: string;
    supportEmail: string;
    expiresAt: string;
  } | null;
  /** A household member can see that support access is currently granted. */
  shared: {
    householdName: string;
    supportEmail: string;
    expiresAt: string;
  } | null;
}

/**
 * What the layout banner should say for this request. Fails quiet: any problem
 * reading the registry yields no banner, never an access change.
 */
export async function supportBannerState(
  headerSource: HeaderSource,
  config: AppConfig,
  registry?: RegistryDb,
  now: Date = new Date(),
): Promise<SupportBannerState> {
  const none: SupportBannerState = { viewing: null, shared: null };
  const session = await describeSession(headerSource, config, registry);
  if (session.status !== 'ok' && session.status !== 'household-deactivated') return none;

  let raw: RegistryDb;
  try {
    raw = registry ?? getRegistry(config);
  } catch {
    return none;
  }

  const grantId = supportGrantIdFromHeaders(headerSource);
  if (grantId !== null && session.user.role === 'platform_admin') {
    const resolved = resolveSupportGrant(raw, {
      grantId,
      supportEmail: session.user.email,
      now,
    });
    if (resolved !== null) {
      return {
        viewing: {
          grantId,
          householdName: resolved.household.displayName,
          supportEmail: session.user.email,
          expiresAt: resolved.grant.expiresAt,
        },
        shared: null,
      };
    }
  }

  if (session.status !== 'ok') return none;
  const active = listSupportGrants(raw, session.user.householdId).find(
    (grant) => supportGrantStatus(grant, now) === 'active',
  );
  if (active === undefined) return none;
  // Show only what the server would honour: the same check the support view
  // itself runs (grantee still an administrator, household still active).
  if (
    resolveSupportGrant(raw, { grantId: active.id, supportEmail: active.supportEmail, now }) ===
    null
  ) {
    return none;
  }
  return {
    viewing: null,
    shared: {
      householdName: getHousehold(raw, session.user.householdId).displayName,
      supportEmail: active.supportEmail,
      expiresAt: active.expiresAt,
    },
  };
}
