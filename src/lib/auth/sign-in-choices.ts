import type { RegistryDb } from '../registry/db';
import { listIdentities } from '../registry/domain';

/**
 * The emails a person can be linked to in Settings → "Signs in as"
 * (decision 146, MULTI_HOUSEHOLD_PLAN §2): the sign-in identities the registry
 * assigns to THIS household, plus any address already stored on this
 * household's people (so a link survives a roster change and can be cleared).
 *
 * Never the installation-wide Cloudflare allowlist: that list names every
 * household's members, and showing it here would disclose other households.
 * Lower case, de-duplicated, in that order.
 */
export function signInEmailChoices(
  householdEmails: ReadonlyArray<string>,
  people: ReadonlyArray<{ email: string | null }> = [],
): string[] {
  const all = [
    ...householdEmails,
    ...people.map((person) => person.email).filter((email): email is string => email !== null),
  ].map((email) => email.trim().toLowerCase());
  return [...new Set(all)].filter((email) => email !== '');
}

/**
 * The sign-in emails the registry assigns to one household — the only addresses
 * a person in that household may be linked to. Read from the registry, so a
 * household's Settings can never offer or accept another household's address.
 */
export function householdSignInEmails(raw: RegistryDb, householdId: string): string[] {
  return listIdentities(raw, householdId).map((identity) => identity.email);
}
