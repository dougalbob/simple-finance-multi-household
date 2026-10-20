import { isAuthConfigComplete, type AppConfig } from '../config';
import { getRegistry, type RegistryDb } from '../registry/db';
import { resolveIdentity } from '../registry/domain';
import { isEmailOnEnvAllowlist, verifyAccessJwt } from './verify';

/**
 * Framework-free identity resolution — testable without Next.js.
 * Next-specific adapters live in ./next.ts.
 *
 * Two separate checks, deliberately (SPEC §3, §19; MULTI_HOUSEHOLD_PLAN §2):
 *
 *  1. Authentication: the Cloudflare Access JWT is verified. Since issue #91
 *     the env allowlist is a fallback — any email that already has a registry
 *     assignment is considered allowlisted, so adding a user is Cloudflare
 *     rule + `/admin` assignment, no duplicate comma list.
 *  2. Assignment: the verified email must already have an active
 *     identity-to-household assignment in the system registry. Cloudflare
 *     deciding someone may reach the hostname is NOT application access — the
 *     app's roster is. An authenticated but unassigned identity is denied
 *     here, at the single choke point every page, server action and route
 *     handler already calls. There is no self-sign-up.
 *
 * Any failure — missing token, bad signature, wrong issuer/audience, expired,
 * not on the combined allowlist, unassigned, household deactivated, registry
 * unreadable, or auth not configured at all — resolves to null. Fail closed,
 * always. `describeSession` reports the same decisions with the reason, for
 * the sign-in/denial pages and platform administration.
 */
export interface User {
  email: string;
  /** Opaque household id from the registry assignment — never from the browser. */
  householdId: string;
  role: 'member' | 'platform_admin';
}

export type SessionState =
  | { status: 'ok'; user: User }
  | { status: 'not-signed-in' }
  /** Authenticated, but the roster has no assignment for this email. */
  | { status: 'unassigned'; email: string }
  | { status: 'household-deactivated'; user: User }
  | { status: 'registry-unavailable' };

export interface HeaderSource {
  get(name: string): string | null;
}

/**
 * Step 1 only: verify the request's identity. Returns the normalised email of
 * a verified (or development-bypass) identity, or null. Registry assignment
 * and allowlist are checked separately — see `describeSession`.
 */
async function authenticateRequest(
  headerSource: HeaderSource,
  config: AppConfig,
  registry?: RegistryDb,
): Promise<{ email: string } | null> {
  if (config.auth.devBypass && config.auth.devIdentityEmail !== null) {
    return { email: config.auth.devIdentityEmail };
  }
  if (!isAuthConfigComplete(config.auth)) {
    return null;
  }
  const token = headerSource.get('cf-access-jwt-assertion');
  if (token === null || token === '') {
    return null;
  }
  try {
    const identity = await verifyAccessJwt(token, config.auth);
    // Combined allowlist (issue #91): env fallback OR any assigned identity.
    // If the registry is readable and already knows this email, it is
    // considered allowlisted even when AUTH_ALLOWED_EMAILS does not list it.
    if (isEmailOnEnvAllowlist(identity.email, config.auth)) {
      return { email: identity.email };
    }
    try {
      const raw = registry ?? getRegistry(config);
      const match = resolveIdentity(raw, identity.email);
      // A roster row allows the identity even when its household is
      // deactivated (recovery is a later gate) — resolveIdentity returns the
      // row regardless of household status.
      if (match !== null) return { email: identity.email };
    } catch {
      // Registry unreadable → fall back to env allowlist only.
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Full session decision: authentication plus registry assignment. The
 * optional `registry` parameter is for tests; production resolves it from the
 * config's data root.
 */
export async function describeSession(
  headerSource: HeaderSource,
  config: AppConfig,
  registry?: RegistryDb,
): Promise<SessionState> {
  const authenticated = await authenticateRequest(headerSource, config, registry);
  if (authenticated === null) return { status: 'not-signed-in' };

  let match: ReturnType<typeof resolveIdentity>;
  try {
    match = resolveIdentity(registry ?? getRegistry(config), authenticated.email);
  } catch {
    // A missing, unreadable or half-created registry denies everyone.
    return { status: 'registry-unavailable' };
  }
  if (match === null) return { status: 'unassigned', email: authenticated.email };

  const user: User = {
    email: match.identity.email,
    householdId: match.household.id,
    role: match.identity.role,
  };
  if (match.household.status !== 'active') {
    return { status: 'household-deactivated', user };
  }
  return { status: 'ok', user };
}

/**
 * Resolve the current user, or null when the request may not use the app.
 *
 * Order of trust:
 * 1. Development bypass — only when loadAppConfig computed it as active
 *    (explicit flag AND non-production AND identity configured). Production
 *    can never reach this branch.
 * 2. Verified Cloudflare Access JWT from the Cf-Access-Jwt-Assertion header.
 * 3. An active identity-to-household assignment in the system registry, for a
 *    household that is not deactivated.
 *
 * Any failure resolves to null. Fail closed, always.
 */
export async function getCurrentUser(
  headerSource: HeaderSource,
  config: AppConfig,
): Promise<User | null> {
  const state = await describeSession(headerSource, config);
  return state.status === 'ok' ? state.user : null;
}

/**
 * Strict admin-menu gate for issue #91: only the bootstrap env email
 * (`REGISTRY_ADMIN_EMAIL`) sees the Admin link. This is intentionally
 * strict — a promoted `platform_admin` does not get the menu unless the
 * env email matches. Change this to `role === 'platform_admin'` if the
 * policy ever relaxes.
 */
export function isRegistryAdminSession(session: SessionState, config: AppConfig): boolean {
  const adminEmail = config.registryBootstrap.adminEmail;
  if (adminEmail === null) return false;
  if (session.status === 'ok' || session.status === 'household-deactivated') {
    return session.user.email.toLowerCase() === adminEmail.toLowerCase();
  }
  return false;
}
