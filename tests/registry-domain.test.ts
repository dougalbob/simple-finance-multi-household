import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { RawDatabase } from '../src/lib/db/client';
import { openRegistry } from '../src/lib/registry/db';
import {
  assignIdentity,
  bootstrapRegistryAdmin,
  createHousehold,
  getHousehold,
  listHouseholds,
  listIdentities,
  listRegistryAudit,
  MAX_IDENTITIES_PER_HOUSEHOLD,
  renameHousehold,
  resolveIdentity,
  setHouseholdStatus,
  setIdentityRole,
  unassignIdentity,
} from '../src/lib/registry/domain';
import {
  DuplicateIdentityError,
  HouseholdFullError,
  HouseholdNotFoundError,
  IdentityNotFoundError,
  InvalidDisplayNameError,
  InvalidEmailError,
  InvalidHouseholdIdError,
  LastAdministratorError,
} from '../src/lib/registry/errors';
import { systemRegistryPath } from '../src/lib/registry/paths';
import { makeTempDir } from './helpers';

/**
 * System registry rules (MULTI_HOUSEHOLD_PLAN §2, SPEC §3): one or two
 * sign-in identities per household, one household per identity, no
 * self-sign-up, administrator-only writes with an audit row for each, and the
 * last administrator can never be removed.
 */
describe('registry domain (households and identity assignment)', () => {
  let raw: RawDatabase;

  before(async () => {
    raw = openRegistry(systemRegistryPath(await makeTempDir('sf-registry-')));
  });

  after(() => {
    raw.close();
  });

  it('creates, lists and renames households with an audit row each', () => {
    const household = createHousehold(raw, {
      displayName: '  The Wilsons  ',
      actor: 'admin@example.com',
      now: new Date('2026-10-10T09:00:00Z'),
    });
    assert.match(household.id, /^[a-f0-9]{32}$/);
    assert.equal(household.displayName, 'The Wilsons');
    assert.equal(household.status, 'active');

    const renamed = renameHousehold(raw, {
      householdId: household.id,
      displayName: 'Wilson household',
      actor: 'admin@example.com',
    });
    assert.equal(renamed.displayName, 'Wilson household');
    assert.equal(getHousehold(raw, household.id).displayName, 'Wilson household');
    assert.ok(listHouseholds(raw).some((h) => h.id === household.id));

    const audit = listRegistryAudit(raw, 10);
    assert.ok(audit.some((a) => a.action === 'household.create' && a.householdId === household.id));
    assert.ok(audit.some((a) => a.action === 'household.rename'));
  });

  it('rejects empty or over-long display names and malformed household ids', () => {
    assert.throws(
      () => createHousehold(raw, { displayName: '   ', actor: 'a' }),
      InvalidDisplayNameError,
    );
    assert.throws(
      () => createHousehold(raw, { displayName: 'x'.repeat(81), actor: 'a' }),
      InvalidDisplayNameError,
    );
    assert.throws(() => getHousehold(raw, 'not-a-valid-id'), InvalidHouseholdIdError);
  });

  it('assigns one or two identities per household and refuses a third', () => {
    const household = createHousehold(raw, { displayName: 'Pair', actor: 'admin' });
    const first = assignIdentity(raw, {
      email: 'One@Example.com',
      householdId: household.id,
      actor: 'admin',
    });
    assert.equal(first.email, 'one@example.com'); // normalised
    assignIdentity(raw, { email: 'two@example.com', householdId: household.id, actor: 'admin' });
    assert.equal(MAX_IDENTITIES_PER_HOUSEHOLD, 2);
    assert.equal(listIdentities(raw, household.id).length, 2);
    assert.throws(
      () =>
        assignIdentity(raw, {
          email: 'three@example.com',
          householdId: household.id,
          actor: 'admin',
        }),
      HouseholdFullError,
    );
  });

  it('keeps one household per identity: a second assignment of the same email is refused', () => {
    const first = createHousehold(raw, { displayName: 'First', actor: 'admin' });
    const second = createHousehold(raw, { displayName: 'Second', actor: 'admin' });
    assignIdentity(raw, { email: 'moved@example.com', householdId: first.id, actor: 'admin' });
    assert.throws(
      () =>
        assignIdentity(raw, { email: 'MOVED@example.com', householdId: second.id, actor: 'admin' }),
      DuplicateIdentityError,
    );
    // Unassign (an audited roster delete) then reassign is the supported move.
    unassignIdentity(raw, { email: 'moved@example.com', actor: 'admin' });
    assert.equal(resolveIdentity(raw, 'moved@example.com'), null);
    const moved = assignIdentity(raw, {
      email: 'moved@example.com',
      householdId: second.id,
      actor: 'admin',
    });
    assert.equal(moved.householdId, second.id);
  });

  it('validates emails before they reach the roster', () => {
    const household = createHousehold(raw, { displayName: 'Validation', actor: 'admin' });
    for (const bad of [
      '',
      '   ',
      'not-an-email',
      'a b@example.com',
      'x@y',
      `${'a'.repeat(250)}@example.com`,
    ]) {
      assert.throws(
        () => assignIdentity(raw, { email: bad, householdId: household.id, actor: 'admin' }),
        InvalidEmailError,
        `expected ${JSON.stringify(bad)} to be rejected`,
      );
    }
  });

  it('resolves an assignment to its identity and household (the first-login lookup)', () => {
    const household = createHousehold(raw, { displayName: 'Resolve', actor: 'admin' });
    assignIdentity(raw, { email: 'finder@example.com', householdId: household.id, actor: 'admin' });
    const match = resolveIdentity(raw, '  FINDER@Example.COM ');
    assert.ok(match !== null);
    assert.equal(match.identity.email, 'finder@example.com');
    assert.equal(match.household.id, household.id);
    assert.equal(resolveIdentity(raw, 'stranger@example.com'), null);
  });

  it('deactivation denies membership without deleting anything, and reactivation restores it', () => {
    const household = createHousehold(raw, { displayName: 'Paused', actor: 'admin' });
    assignIdentity(raw, { email: 'paused@example.com', householdId: household.id, actor: 'admin' });
    setHouseholdStatus(raw, {
      householdId: household.id,
      status: 'deactivated',
      actor: 'admin',
    });
    const match = resolveIdentity(raw, 'paused@example.com');
    assert.ok(match !== null);
    assert.equal(match.household.status, 'deactivated'); // the gate denies on this
    assert.equal(listIdentities(raw, household.id).length, 1); // roster intact
    setHouseholdStatus(raw, { householdId: household.id, status: 'active', actor: 'admin' });
    assert.equal(resolveIdentity(raw, 'paused@example.com')?.household.status, 'active');
    assert.throws(
      () => setHouseholdStatus(raw, { householdId: 'f'.repeat(32), status: 'active', actor: 'a' }),
      HouseholdNotFoundError,
    );
  });

  it('audits every roster change with actor, action and before/after detail', () => {
    const audit = listRegistryAudit(raw, 50);
    const assignRow = audit.find((a) => a.action === 'identity.assign');
    assert.ok(assignRow !== undefined);
    assert.equal(typeof assignRow.actor, 'string');
    assert.ok(assignRow.detail !== null && assignRow.detail.includes('role'));
    const unassignRow = audit.find((a) => a.action === 'identity.unassign');
    assert.ok(unassignRow !== undefined);
  });
});

describe('registry bootstrap and last-administrator guard (isolated registries)', () => {
  it('bootstraps exactly one platform administrator on an empty roster', async () => {
    const raw = openRegistry(systemRegistryPath(await makeTempDir('sf-registry-boot-')));
    try {
      const result = bootstrapRegistryAdmin(raw, {
        email: 'First@Example.com',
        householdName: 'Main household',
      });
      assert.ok(result !== null);
      assert.equal(result.identity.email, 'first@example.com');
      assert.equal(result.identity.role, 'platform_admin');
      assert.equal(result.household.displayName, 'Main household');
      // Consumed: a later call can never bootstrap a second administrator.
      assert.equal(
        bootstrapRegistryAdmin(raw, { email: 'other@example.com', householdName: 'Other' }),
        null,
      );
      assert.equal(listIdentities(raw).length, 1);
    } finally {
      raw.close();
    }
  });

  it('keeps at least one platform administrator at all times', async () => {
    const raw = openRegistry(systemRegistryPath(await makeTempDir('sf-registry-admin-')));
    try {
      const boot = bootstrapRegistryAdmin(raw, {
        email: 'admin@example.com',
        householdName: 'Admin household',
      });
      assert.ok(boot !== null);
      assignIdentity(raw, {
        email: 'member@example.com',
        householdId: boot.household.id,
        actor: 'admin@example.com',
      });
      assert.throws(
        () => unassignIdentity(raw, { email: 'admin@example.com', actor: 'admin@example.com' }),
        LastAdministratorError,
      );
      assert.throws(
        () =>
          setIdentityRole(raw, {
            email: 'admin@example.com',
            role: 'member',
            actor: 'admin@example.com',
          }),
        LastAdministratorError,
      );
      // With a second administrator, the first can step down or leave.
      setIdentityRole(raw, {
        email: 'member@example.com',
        role: 'platform_admin',
        actor: 'admin@example.com',
      });
      setIdentityRole(raw, {
        email: 'admin@example.com',
        role: 'member',
        actor: 'admin@example.com',
      });
      unassignIdentity(raw, { email: 'admin@example.com', actor: 'member@example.com' });
      assert.equal(resolveIdentity(raw, 'admin@example.com'), null);
      assert.throws(
        () => unassignIdentity(raw, { email: 'ghost@example.com', actor: 'member@example.com' }),
        IdentityNotFoundError,
      );
    } finally {
      raw.close();
    }
  });
});
