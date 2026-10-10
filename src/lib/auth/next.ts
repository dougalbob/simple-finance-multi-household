import { headers } from 'next/headers';
import { loadAppConfig } from '../config';
import { describeSession, getCurrentUser, type SessionState, type User } from './current-user';

/**
 * Next.js adapter: resolve the signed-in user inside server components and
 * server actions. Route handlers receive a Request and should call
 * getCurrentUser(request.headers, loadAppConfig()) directly — every entry
 * point guards itself (blueprint §4.4). Both paths run the same fail-closed
 * gate: authentication plus an active registry assignment.
 */
export async function currentUserFromRequest(): Promise<User | null> {
  return getCurrentUser(await headers(), loadAppConfig());
}

/**
 * The same decision as `currentUserFromRequest`, with the reason attached —
 * for the denial page (signed in but unassigned, or a deactivated household)
 * and for `/admin`, which a platform administrator must still be able to
 * reach while their own household is deactivated so they can restore it.
 */
export async function appSessionFromRequest(): Promise<SessionState> {
  return describeSession(await headers(), loadAppConfig());
}
