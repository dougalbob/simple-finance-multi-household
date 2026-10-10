import { randomBytes } from 'node:crypto';
import { InvalidDisplayNameError, InvalidEmailError, InvalidHouseholdIdError } from './errors';

/**
 * Opaque household identifiers and normalised sign-in emails.
 *
 * Household IDs are 128 random bits as lower-case hex: stable, opaque, and
 * restricted to a filesystem-safe charset so a registry value can never
 * smuggle a path segment. Path builders in `./paths.ts` re-validate whatever
 * they are handed — the browser never supplies an ID at all (the assignment in
 * the registry is the only authority), and this is the second lock behind
 * that rule.
 */

export const HOUSEHOLD_ID_PATTERN = /^[a-f0-9]{32}$/;

export function newHouseholdId(): string {
  return randomBytes(16).toString('hex');
}

export function isSafeHouseholdId(householdId: string): boolean {
  return HOUSEHOLD_ID_PATTERN.test(householdId);
}

export function assertSafeHouseholdId(householdId: string): string {
  if (!isSafeHouseholdId(householdId)) throw new InvalidHouseholdIdError(householdId);
  return householdId;
}

/**
 * One normalised form per identity: trimmed and lower-cased. Every write and
 * every lookup goes through here, so `Alex@Example.com` and `alex@example.com`
 * can never become two different memberships.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;

export function assertAssignableEmail(raw: string): string {
  const email = normalizeEmail(raw);
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    throw new InvalidEmailError(raw.trim());
  }
  return email;
}

export const MAX_DISPLAY_NAME_LENGTH = 80;

export function assertDisplayName(raw: string): string {
  const name = raw.trim();
  if (name.length === 0) {
    throw new InvalidDisplayNameError('Give the household a short name.');
  }
  if (name.length > MAX_DISPLAY_NAME_LENGTH) {
    throw new InvalidDisplayNameError(
      `Household names are at most ${MAX_DISPLAY_NAME_LENGTH} characters.`,
    );
  }
  return name;
}
