import { headers } from 'next/headers';
import { loadAppConfig } from '../config';
import { householdContextFromHeaders, type HouseholdContext } from './household-context';
import { describeSession, getCurrentUser, type SessionState, type User } from './current-user';

/**
 * Next.js adapter: resolve the signed-in user inside server components and
 * server actions. Route handlers receive a Request and should call
 * `householdContextFromHeaders(request.headers, loadAppConfig())` for finance
 * data — every entry point guards itself. Both paths run the same
 * fail-closed session gate.
 */
export async function currentUserFromRequest(): Promise<User | null> {
  return getCurrentUser(await headers(), loadAppConfig());
}

/**
 * Resolve the active request's immutable household context for any page or
 * server action that reads or writes finance data. The household ID is taken
 * from the registry assignment by `describeSession`, never from route, form or
 * query input.
 */
export async function householdContextFromRequest(): Promise<HouseholdContext | null> {
  return householdContextFromHeaders(await headers(), loadAppConfig());
}

/**
 * The same decision as `currentUserFromRequest`, with the reason attached —
 * for the denial page and `/admin`, which a platform administrator must still
 * be able to reach while their own household is deactivated so they can
 * restore it. Platform administration is operational metadata only and does
 * not need a finance-database context.
 */
export async function appSessionFromRequest(): Promise<SessionState> {
  return describeSession(await headers(), loadAppConfig());
}
