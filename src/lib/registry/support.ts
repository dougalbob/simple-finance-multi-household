import type { RawDatabase } from '../db/client';
import { assertSafeHouseholdId, normalizeEmail } from './ids';
import { SupportGrantError } from './errors';
import { getHousehold, type Household } from './domain';
import { SUPPORT_GRANT_DURATIONS_MINUTES } from './support-durations';

/**
 * Support consent (docs/MULTI_HOUSEHOLD_PLAN.md §4, docs/SPEC.md §18.5).
 *
 * Rules, enforced here on every path:
 *  - Only a member of the household may grant or revoke support for it.
 *    Platform administration alone can never open a household.
 *  - The grantee must be a platform administrator who is NOT a member of that
 *    household (a member already has ordinary access).
 *  - Read-only is the only scope; a grant is time-limited to one of a fixed set
 *    of durations, so nothing is open-ended.
 *  - At most one active grant per household: a new one needs the old one ended.
 *  - A grant is honoured only while it is unrevoked, unexpired, the grantee is
 *    still a platform administrator, and the household is active. These checks
 *    run on every request (see `resolveSupportGrant`), so expiry and revocation
 *    block access immediately.
 *  - Every grant, revoke and open is written to `registry_audit`.
 *
 * The grant row holds consent metadata only — never finance data.
 */

export {
  SUPPORT_GRANT_DURATIONS_MINUTES,
  type SupportGrantDurationMinutes,
} from './support-durations';

/** Touching the grant row for "last used" is throttled to this interval. */
export const SUPPORT_TOUCH_INTERVAL_MS = 60 * 1000;

export type SupportGrantStatus = 'active' | 'expired' | 'revoked';

export interface SupportGrant {
  id: number;
  householdId: string;
  supportEmail: string;
  grantedByEmail: string;
  scope: 'read';
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revokedByEmail: string | null;
  firstUsedAt: string | null;
  lastUsedAt: string | null;
}

export interface SupportAuditEntry {
  id: number;
  at: string;
  actor: string;
  action: string;
  email: string | null;
  detail: string | null;
}

interface SupportGrantRow {
  id: number;
  household_id: string;
  support_email: string;
  granted_by_email: string;
  scope: 'read';
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  revoked_by_email: string | null;
  first_used_at: string | null;
  last_used_at: string | null;
}

function grantFromRow(row: unknown): SupportGrant {
  const r = row as SupportGrantRow;
  return {
    id: r.id,
    householdId: r.household_id,
    supportEmail: r.support_email,
    grantedByEmail: r.granted_by_email,
    scope: r.scope,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    revokedAt: r.revoked_at,
    revokedByEmail: r.revoked_by_email,
    firstUsedAt: r.first_used_at,
    lastUsedAt: r.last_used_at,
  };
}

export function supportGrantStatus(grant: SupportGrant, now: Date): SupportGrantStatus {
  if (grant.revokedAt !== null) return 'revoked';
  if (Date.parse(grant.expiresAt) <= now.getTime()) return 'expired';
  return 'active';
}

function audit(
  raw: RawDatabase,
  input: {
    at: Date;
    actor: string;
    action: string;
    email?: string | null;
    householdId: string;
    detail?: Record<string, unknown>;
  },
): void {
  raw
    .prepare(
      'INSERT INTO registry_audit (at, actor, action, email, household_id, detail) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(
      input.at.toISOString(),
      input.actor,
      input.action,
      input.email ?? null,
      input.householdId,
      input.detail === undefined ? null : JSON.stringify(input.detail),
    );
}

function identityRow(
  raw: RawDatabase,
  email: string,
): { household_id: string; role: string } | null {
  const row = raw
    .prepare('SELECT household_id, role FROM identities WHERE email = ?')
    .get(normalizeEmail(email));
  return (row as { household_id: string; role: string } | undefined) ?? null;
}

function requireActiveHousehold(raw: RawDatabase, householdId: string): Household {
  const household = getHousehold(raw, householdId);
  if (household.status !== 'active') {
    throw new SupportGrantError('This household is deactivated, so support access cannot change.');
  }
  return household;
}

export interface GrantSupportAccessInput {
  householdId: string;
  /** The signed-in household member granting access. */
  grantorEmail: string;
  /** The platform administrator being given read-only access. */
  supportEmail: string;
  durationMinutes: number;
  now?: Date;
}

export function grantSupportAccess(raw: RawDatabase, input: GrantSupportAccessInput): SupportGrant {
  const now = input.now ?? new Date();
  const householdId = assertSafeHouseholdId(input.householdId);
  const grantor = normalizeEmail(input.grantorEmail);
  const supportEmail = normalizeEmail(input.supportEmail);

  const duration = SUPPORT_GRANT_DURATIONS_MINUTES.find(
    (minutes) => minutes === input.durationMinutes,
  );
  if (duration === undefined) {
    throw new SupportGrantError('Choose 1, 4 or 24 hours of support access.');
  }

  return raw.transaction(() => {
    requireActiveHousehold(raw, householdId);

    const grantorIdentity = identityRow(raw, grantor);
    if (grantorIdentity === null || grantorIdentity.household_id !== householdId) {
      throw new SupportGrantError('Only a member of this household can grant support access.');
    }

    const supporter = identityRow(raw, supportEmail);
    if (supporter === null) {
      throw new SupportGrantError(`${supportEmail} is not assigned to any household.`);
    }
    if (supporter.role !== 'platform_admin') {
      throw new SupportGrantError('Support access can only be given to the service administrator.');
    }
    if (supporter.household_id === householdId) {
      throw new SupportGrantError(
        'That address is a member of this household already, so it does not need support access.',
      );
    }

    const active = listSupportGrants(raw, householdId).find(
      (grant) => supportGrantStatus(grant, now) === 'active',
    );
    if (active !== undefined) {
      throw new SupportGrantError(
        `Support access is already active for ${active.supportEmail}. End it before granting another.`,
      );
    }

    const expiresAt = new Date(now.getTime() + duration * 60 * 1000);
    const inserted = raw
      .prepare(
        'INSERT INTO support_grants (household_id, support_email, granted_by_email, scope, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(householdId, supportEmail, grantor, 'read', now.toISOString(), expiresAt.toISOString());
    const grantId = Number(inserted.lastInsertRowid);
    audit(raw, {
      at: now,
      actor: grantor,
      action: 'support.grant',
      email: supportEmail,
      householdId,
      detail: {
        grantId,
        scope: 'read',
        durationMinutes: duration,
        expiresAt: expiresAt.toISOString(),
      },
    });
    return getSupportGrant(raw, grantId);
  })();
}

export interface RevokeSupportAccessInput {
  grantId: number;
  /** The signed-in household member ending access. */
  actorEmail: string;
  now?: Date;
}

export function revokeSupportAccess(
  raw: RawDatabase,
  input: RevokeSupportAccessInput,
): SupportGrant {
  const now = input.now ?? new Date();
  const actor = normalizeEmail(input.actorEmail);
  return raw.transaction(() => {
    const grant = getSupportGrant(raw, input.grantId);
    const actorIdentity = identityRow(raw, actor);
    if (actorIdentity === null || actorIdentity.household_id !== grant.householdId) {
      throw new SupportGrantError('Only a member of this household can end support access.');
    }
    if (supportGrantStatus(grant, now) !== 'active') {
      throw new SupportGrantError('That support access has already ended.');
    }
    raw
      .prepare('UPDATE support_grants SET revoked_at = ?, revoked_by_email = ? WHERE id = ?')
      .run(now.toISOString(), actor, grant.id);
    audit(raw, {
      at: now,
      actor,
      action: 'support.revoke',
      email: grant.supportEmail,
      householdId: grant.householdId,
      detail: { grantId: grant.id },
    });
    return getSupportGrant(raw, grant.id);
  })();
}

export function getSupportGrant(raw: RawDatabase, grantId: number): SupportGrant {
  const row = raw.prepare('SELECT * FROM support_grants WHERE id = ?').get(grantId);
  if (row === undefined) throw new SupportGrantError('That support access no longer exists.');
  return grantFromRow(row);
}

/** Every grant for a household, newest first — the household's own view. */
export function listSupportGrants(raw: RawDatabase, householdId: string): SupportGrant[] {
  return raw
    .prepare('SELECT * FROM support_grants WHERE household_id = ? ORDER BY id DESC')
    .all(assertSafeHouseholdId(householdId))
    .map(grantFromRow);
}

/** Support-related audit rows for one household, newest first. */
export function listSupportAudit(
  raw: RawDatabase,
  householdId: string,
  limit = 20,
): SupportAuditEntry[] {
  return raw
    .prepare(
      "SELECT id, at, actor, action, email, detail FROM registry_audit WHERE household_id = ? AND action LIKE 'support.%' ORDER BY id DESC LIMIT ?",
    )
    .all(assertSafeHouseholdId(householdId), limit)
    .map((row) => {
      const r = row as {
        id: number;
        at: string;
        actor: string;
        action: string;
        email: string | null;
        detail: string | null;
      };
      return {
        id: r.id,
        at: r.at,
        actor: r.actor,
        action: r.action,
        email: r.email,
        detail: r.detail,
      };
    });
}

/** Active grants naming this administrator, with their household's name. */
export function listSupportGrantsForAdministrator(
  raw: RawDatabase,
  supportEmail: string,
  now: Date = new Date(),
): Array<{ grant: SupportGrant; householdName: string }> {
  const rows = raw
    .prepare('SELECT * FROM support_grants WHERE support_email = ? ORDER BY id DESC')
    .all(normalizeEmail(supportEmail))
    .map(grantFromRow);
  const result: Array<{ grant: SupportGrant; householdName: string }> = [];
  for (const grant of rows) {
    if (supportGrantStatus(grant, now) !== 'active') continue;
    const household = getHousehold(raw, grant.householdId);
    if (household.status !== 'active') continue;
    result.push({ grant, householdName: household.displayName });
  }
  return result;
}

export interface ResolvedSupportGrant {
  grant: SupportGrant;
  household: Household;
}

/**
 * The per-request check: is `grantId` a live grant that `supportEmail` may use
 * right now? Returns null for anything that is not — unknown, revoked, expired,
 * wrong grantee, grantee no longer a platform administrator (or now a member of
 * the household), or a deactivated household. Read-only; never throws for a
 * simply-invalid grant.
 */
export function resolveSupportGrant(
  raw: RawDatabase,
  input: { grantId: number; supportEmail: string; now?: Date },
): ResolvedSupportGrant | null {
  const now = input.now ?? new Date();
  const row = raw.prepare('SELECT * FROM support_grants WHERE id = ?').get(input.grantId);
  if (row === undefined) return null;
  const grant = grantFromRow(row);
  if (grant.supportEmail !== normalizeEmail(input.supportEmail)) return null;
  if (supportGrantStatus(grant, now) !== 'active') return null;

  const supporter = identityRow(raw, grant.supportEmail);
  if (supporter === null || supporter.role !== 'platform_admin') return null;
  if (supporter.household_id === grant.householdId) return null;

  const household = getHousehold(raw, grant.householdId);
  if (household.status !== 'active') return null;
  return { grant, household };
}

/**
 * Record that a grant was used: the first use is audited and stamped, later
 * uses refresh `last_used_at` at most once per SUPPORT_TOUCH_INTERVAL_MS, so
 * reading a page does not turn into a write on every request.
 */
export function touchSupportGrant(raw: RawDatabase, grantId: number, now: Date = new Date()): void {
  raw.transaction(() => {
    const grant = getSupportGrant(raw, grantId);
    if (grant.firstUsedAt === null) {
      raw
        .prepare('UPDATE support_grants SET first_used_at = ?, last_used_at = ? WHERE id = ?')
        .run(now.toISOString(), now.toISOString(), grantId);
      audit(raw, {
        at: now,
        actor: grant.supportEmail,
        action: 'support.access',
        email: grant.supportEmail,
        householdId: grant.householdId,
        detail: { grantId },
      });
      return;
    }
    const last = grant.lastUsedAt === null ? 0 : Date.parse(grant.lastUsedAt);
    if (now.getTime() - last >= SUPPORT_TOUCH_INTERVAL_MS) {
      raw
        .prepare('UPDATE support_grants SET last_used_at = ? WHERE id = ?')
        .run(now.toISOString(), grantId);
    }
  })();
}

/** Audit that an administrator opened the support view for a grant. */
export function recordSupportOpen(
  raw: RawDatabase,
  input: { grantId: number; actorEmail: string; now?: Date },
): void {
  const now = input.now ?? new Date();
  raw.transaction(() => {
    const grant = getSupportGrant(raw, input.grantId);
    const actor = normalizeEmail(input.actorEmail);
    if (actor !== grant.supportEmail) {
      throw new SupportGrantError('Only the administrator named in this grant can open it.');
    }
    audit(raw, {
      at: now,
      actor,
      action: 'support.open',
      email: actor,
      householdId: grant.householdId,
      detail: { grantId: grant.id },
    });
  })();
}
