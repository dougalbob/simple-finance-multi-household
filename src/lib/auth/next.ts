import { headers } from 'next/headers';
import { loadAppConfig } from '../config';
import { getRegistry } from '../registry/db';
import { PRESENCE_KEY_HEADER, safeRecordPresence } from '../registry/presence';
import { householdContextFromHeaders, type HouseholdContext } from './household-context';
import { describeSession, type SessionState, type User } from './current-user';

/**
 * Every authenticated server render passes through here, so a page view is
 * itself evidence of presence (issue 105). The write is throttled per tab and
 * can never fail a request: a registry that is read-only, locked or missing
 * the presence table loses the record and nothing else.
 */
async function sessionWithPresence(): Promise<SessionState> {
  const config = loadAppConfig();
  const headerSource = await headers();
  const session = await describeSession(headerSource, config);
  if (session.status === 'ok') {
    try {
      safeRecordPresence(getRegistry(config), {
        email: session.user.email,
        // The identity's own assignment — never a support grant's household.
        householdId: session.user.householdId,
        sessionKey: headerSource.get(PRESENCE_KEY_HEADER),
      });
    } catch {
      // `getRegistry` itself can fail (unmounted data directory, mid-restore
      // swap). Presence must never turn a readable page into an error.
    }
  }
  return session;
}

/**
 * Next.js adapter: resolve the signed-in user inside server components and
 * server actions. Route handlers receive a Request and should call
 * `householdContextFromHeaders(request.headers, loadAppConfig())` for finance
 * data — every entry point guards itself. Both paths run the same
 * fail-closed session gate.
 */
export async function currentUserFromRequest(): Promise<User | null> {
  const session = await sessionWithPresence();
  return session.status === 'ok' ? session.user : null;
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
  return sessionWithPresence();
}
