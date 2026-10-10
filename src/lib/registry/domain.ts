import type { RawDatabase } from '../db/client';
import {
  assertAssignableEmail,
  assertDisplayName,
  assertSafeHouseholdId,
  newHouseholdId,
  normalizeEmail,
} from './ids';
import {
  DuplicateIdentityError,
  HouseholdFullError,
  HouseholdNotFoundError,
  IdentityNotFoundError,
  LastAdministratorError,
} from './errors';

/**
 * System registry (control-plane) domain — the household roster and the
 * secure identity-to-household assignment (docs/MULTI_HOUSEHOLD_PLAN.md §2,
 * docs/SPEC.md §3). Rules enforced here, on every write path:
 *
 *  - One or two assigned sign-in identities per household; one person is a
 *    complete household, a third is refused.
 *  - One household per identity: an email is normalised (trimmed, lower-cased)
 *    and globally unique in the roster. There is no self-sign-up — every row
 *    is created by an administrator operation (or the one-time bootstrap).
 *  - Platform administrators are identities too (`role = 'platform_admin'`)
 *    and count toward their household's two. The last administrator can never
 *    be unassigned or demoted, so the registry cannot become unadministrable.
 *  - Households are never deleted: deactivation is the recovery-safe removal.
 *
 * Every mutation writes a `registry_audit` row in the same transaction. The
 * registry holds membership/admin metadata only — never finance records.
 */

export type HouseholdStatus = 'active' | 'deactivated';
export type IdentityRole = 'member' | 'platform_admin';

export interface Household {
  id: string;
  displayName: string;
  status: HouseholdStatus;
  createdAt: string;
  updatedAt: string;
}

export interface RegistryIdentity {
  id: number;
  email: string;
  householdId: string;
  role: IdentityRole;
  createdAt: string;
  updatedAt: string;
}

export interface RegistryAuditEntry {
  id: number;
  at: string;
  actor: string;
  action: string;
  email: string | null;
  householdId: string | null;
  detail: string | null;
}

export const MAX_IDENTITIES_PER_HOUSEHOLD = 2;

type AuditInput = {
  actor: string;
  action: string;
  email?: string | null;
  householdId?: string | null;
  detail?: Record<string, unknown>;
  now: Date;
};

function recordAudit(raw: RawDatabase, input: AuditInput): void {
  raw
    .prepare(
      'INSERT INTO registry_audit (at, actor, action, email, household_id, detail) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(
      input.now.toISOString(),
      input.actor,
      input.action,
      input.email ?? null,
      input.householdId ?? null,
      input.detail === undefined ? null : JSON.stringify(input.detail),
    );
}

function householdFromRow(row: unknown): Household {
  const r = row as {
    id: string;
    display_name: string;
    status: HouseholdStatus;
    created_at: string;
    updated_at: string;
  };
  return {
    id: r.id,
    displayName: r.display_name,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function identityFromRow(row: unknown): RegistryIdentity {
  const r = row as {
    id: number;
    email: string;
    household_id: string;
    role: IdentityRole;
    created_at: string;
    updated_at: string;
  };
  return {
    id: r.id,
    email: r.email,
    householdId: r.household_id,
    role: r.role,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function listHouseholds(raw: RawDatabase): Household[] {
  return raw
    .prepare('SELECT * FROM households ORDER BY created_at, id')
    .all()
    .map(householdFromRow);
}

export function getHousehold(raw: RawDatabase, householdId: string): Household {
  const row = raw
    .prepare('SELECT * FROM households WHERE id = ?')
    .get(assertSafeHouseholdId(householdId));
  if (row === undefined) throw new HouseholdNotFoundError(householdId);
  return householdFromRow(row);
}

export function listIdentities(raw: RawDatabase, householdId?: string): RegistryIdentity[] {
  if (householdId === undefined) {
    return raw.prepare('SELECT * FROM identities ORDER BY email').all().map(identityFromRow);
  }
  return raw
    .prepare('SELECT * FROM identities WHERE household_id = ? ORDER BY email')
    .all(assertSafeHouseholdId(householdId))
    .map(identityFromRow);
}

export function resolveIdentity(
  raw: RawDatabase,
  email: string,
): { identity: RegistryIdentity; household: Household } | null {
  const row = raw.prepare('SELECT * FROM identities WHERE email = ?').get(normalizeEmail(email));
  if (row === undefined) return null;
  const identity = identityFromRow(row);
  return { identity, household: getHousehold(raw, identity.householdId) };
}

export function listRegistryAudit(raw: RawDatabase, limit = 25): RegistryAuditEntry[] {
  return raw
    .prepare('SELECT * FROM registry_audit ORDER BY id DESC LIMIT ?')
    .all(limit)
    .map((row) => {
      const r = row as {
        id: number;
        at: string;
        actor: string;
        action: string;
        email: string | null;
        household_id: string | null;
        detail: string | null;
      };
      return {
        id: r.id,
        at: r.at,
        actor: r.actor,
        action: r.action,
        email: r.email,
        householdId: r.household_id,
        detail: r.detail,
      };
    });
}

export interface CreateHouseholdInput {
  displayName: string;
  actor: string;
  now?: Date;
}

export function createHousehold(raw: RawDatabase, input: CreateHouseholdInput): Household {
  const now = input.now ?? new Date();
  const displayName = assertDisplayName(input.displayName);
  const id = newHouseholdId();
  const at = now.toISOString();
  return raw.transaction(() => {
    raw
      .prepare(
        'INSERT INTO households (id, display_name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(id, displayName, 'active', at, at);
    recordAudit(raw, {
      actor: input.actor,
      action: 'household.create',
      householdId: id,
      detail: { displayName },
      now,
    });
    return getHousehold(raw, id);
  })();
}

export interface RenameHouseholdInput {
  householdId: string;
  displayName: string;
  actor: string;
  now?: Date;
}

export function renameHousehold(raw: RawDatabase, input: RenameHouseholdInput): Household {
  const now = input.now ?? new Date();
  const displayName = assertDisplayName(input.displayName);
  const before = getHousehold(raw, input.householdId);
  return raw.transaction(() => {
    raw
      .prepare('UPDATE households SET display_name = ?, updated_at = ? WHERE id = ?')
      .run(displayName, now.toISOString(), before.id);
    recordAudit(raw, {
      actor: input.actor,
      action: 'household.rename',
      householdId: before.id,
      detail: { from: before.displayName, to: displayName },
      now,
    });
    return getHousehold(raw, before.id);
  })();
}

export interface SetHouseholdStatusInput {
  householdId: string;
  status: HouseholdStatus;
  actor: string;
  now?: Date;
}

export function setHouseholdStatus(raw: RawDatabase, input: SetHouseholdStatusInput): Household {
  const now = input.now ?? new Date();
  const before = getHousehold(raw, input.householdId);
  return raw.transaction(() => {
    raw
      .prepare('UPDATE households SET status = ?, updated_at = ? WHERE id = ?')
      .run(input.status, now.toISOString(), before.id);
    recordAudit(raw, {
      actor: input.actor,
      action: 'household.status',
      householdId: before.id,
      detail: { from: before.status, to: input.status },
      now,
    });
    return getHousehold(raw, before.id);
  })();
}

export interface AssignIdentityInput {
  email: string;
  householdId: string;
  role?: IdentityRole;
  actor: string;
  now?: Date;
}

export function assignIdentity(raw: RawDatabase, input: AssignIdentityInput): RegistryIdentity {
  const now = input.now ?? new Date();
  const email = assertAssignableEmail(input.email);
  const household = getHousehold(raw, input.householdId);
  const role = input.role ?? 'member';
  return raw.transaction(() => {
    const existing = raw.prepare('SELECT * FROM identities WHERE email = ?').get(email);
    if (existing !== undefined) throw new DuplicateIdentityError(email);
    const count = raw
      .prepare('SELECT COUNT(*) AS n FROM identities WHERE household_id = ?')
      .get(household.id) as { n: number };
    if (count.n >= MAX_IDENTITIES_PER_HOUSEHOLD) throw new HouseholdFullError();
    raw
      .prepare(
        'INSERT INTO identities (email, household_id, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(email, household.id, role, now.toISOString(), now.toISOString());
    recordAudit(raw, {
      actor: input.actor,
      action: 'identity.assign',
      email,
      householdId: household.id,
      detail: { role },
      now,
    });
    return resolveIdentity(raw, email)!.identity;
  })();
}

export interface UnassignIdentityInput {
  email: string;
  actor: string;
  now?: Date;
}

export function unassignIdentity(raw: RawDatabase, input: UnassignIdentityInput): void {
  const now = input.now ?? new Date();
  const email = normalizeEmail(input.email);
  raw.transaction(() => {
    const match = resolveIdentity(raw, email);
    if (match === null) throw new IdentityNotFoundError(email);
    if (match.identity.role === 'platform_admin') {
      const admins = raw
        .prepare("SELECT COUNT(*) AS n FROM identities WHERE role = 'platform_admin'")
        .get() as { n: number };
      if (admins.n <= 1) throw new LastAdministratorError();
    }
    raw.prepare('DELETE FROM identities WHERE id = ?').run(match.identity.id);
    recordAudit(raw, {
      actor: input.actor,
      action: 'identity.unassign',
      email,
      householdId: match.household.id,
      detail: { role: match.identity.role },
      now,
    });
  })();
}

export interface SetIdentityRoleInput {
  email: string;
  role: IdentityRole;
  actor: string;
  now?: Date;
}

export function setIdentityRole(raw: RawDatabase, input: SetIdentityRoleInput): RegistryIdentity {
  const now = input.now ?? new Date();
  const email = normalizeEmail(input.email);
  return raw.transaction(() => {
    const match = resolveIdentity(raw, email);
    if (match === null) throw new IdentityNotFoundError(email);
    if (match.identity.role === 'platform_admin' && input.role !== 'platform_admin') {
      const admins = raw
        .prepare("SELECT COUNT(*) AS n FROM identities WHERE role = 'platform_admin'")
        .get() as { n: number };
      if (admins.n <= 1) throw new LastAdministratorError();
    }
    raw
      .prepare('UPDATE identities SET role = ?, updated_at = ? WHERE id = ?')
      .run(input.role, now.toISOString(), match.identity.id);
    recordAudit(raw, {
      actor: input.actor,
      action: 'identity.role',
      email,
      householdId: match.household.id,
      detail: { from: match.identity.role, to: input.role },
      now,
    });
    return resolveIdentity(raw, email)!.identity;
  })();
}

export interface BootstrapAdminInput {
  email: string;
  householdName: string;
  now?: Date;
}

/**
 * One-time bootstrap for a brand-new registry: creates the first platform
 * administrator's household and assignment together. Runs only while the
 * roster is completely empty (the last-administrator guard keeps it non-empty
 * afterwards), so it is safe to retry and can never hand out a second
 * administrator by accident. Returns null when the roster already has any
 * identity. The normal flow afterwards is in-app at /admin.
 */
export function bootstrapRegistryAdmin(
  raw: RawDatabase,
  input: BootstrapAdminInput,
): { household: Household; identity: RegistryIdentity } | null {
  const now = input.now ?? new Date();
  const email = assertAssignableEmail(input.email);
  return raw.transaction(() => {
    const count = raw.prepare('SELECT COUNT(*) AS n FROM identities').get() as { n: number };
    if (count.n > 0) return null;
    const household = createHousehold(raw, {
      displayName: input.householdName,
      actor: 'system',
      now,
    });
    const identity = assignIdentity(raw, {
      email,
      householdId: household.id,
      role: 'platform_admin',
      actor: 'system',
      now,
    });
    recordAudit(raw, {
      actor: 'system',
      action: 'system.bootstrap',
      email,
      householdId: household.id,
      detail: { role: 'platform_admin' },
      now,
    });
    return { household, identity };
  })();
}
