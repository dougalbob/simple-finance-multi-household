import { isAuthConfigComplete, type AppConfig } from '../config';
import { getRegistry, type RegistryDb } from '../registry/db';
import { resolveIdentity } from '../registry/domain';
import { verifyAccessJwt } from './verify';

/**
 * Framework-free identity resolution — testable without Next.js.
 * Next-specific adapters live in ./next.ts.
 *
 * Two separate checks, deliberately (SPEC §3, §19; MULTI_HOUSEHOLD_PLAN §2):
 *
 *  1. Authentication: the Cloudflare Access JWT is verified and its email must
 *     be on the Access allowlist (Cloudflare's own policy, mirrored).
 *  2. Assignment: the verified email must already have an active
 *     identity-to-household assignment in the system registry. Cloudflare
 *     deciding someone may reach the hostname is NOT application access — the
 *     app's roster is. An authenticated but unassigned identity is denied
 *     here, at the single choke point every page, server action and route
 *     handler already calls. There is no self-sign-up.
 *
 * Any failure — missing token, bad signature, wrong issuer/audience, expired,
 * identity not on the allowlist, unassigned, household deactivated, registry
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
 * a verified (or development-bypass) identity, or null. Registry assignment is
 * checked separately — see `describeSession`.
 */
async function authenticateRequest(
  headerSource: HeaderSource,
  config: AppConfig,
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
    return { email: identity.email };
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
  const authenticated = await authenticateRequest(headerSource, config);
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
