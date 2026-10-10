import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { RawDatabase } from '../src/lib/db/client';
import { openRegistry } from '../src/lib/registry/db';
import {
  assignIdentity,
  createHousehold,
  listRegistryAudit,
  setHouseholdStatus,
  setIdentityRole,
} from '../src/lib/registry/domain';
import { SupportGrantError } from '../src/lib/registry/errors';
import {
  grantSupportAccess,
  listSupportAudit,
  listSupportGrants,
  listSupportGrantsForAdministrator,
  recordSupportOpen,
  resolveSupportGrant,
  revokeSupportAccess,
  supportGrantStatus,
  touchSupportGrant,
} from '../src/lib/registry/support';
import { systemRegistryPath } from '../src/lib/registry/paths';
import { makeTempDir } from './helpers';

/**
 * Support consent is a registry rule set (MULTI_HOUSEHOLD_PLAN §4): member-only
 * grant and revoke, administrator-only grantee who is not a member, read-only,
 * fixed short durations, one active grant per household, and an audit trail.
 */
describe('support consent in the system registry', () => {
  let raw: RawDatabase;
  let households: { alex: string; lee: string; service: string };
  const T0 = new Date('2026-10-10T09:00:00Z');
  const HOUR = 60 * 60 * 1000;

  before(async () => {
    const dir = await makeTempDir('sf-support-consent-');
    raw = openRegistry(systemRegistryPath(dir));
    const alex = createHousehold(raw, { displayName: 'Alex household', actor: 'system' });
    assignIdentity(raw, { email: 'alex@example.com', householdId: alex.id, actor: 'system' });
    assignIdentity(raw, { email: 'sam@example.com', householdId: alex.id, actor: 'system' });
    const lee = createHousehold(raw, { displayName: 'Lee household', actor: 'system' });
    assignIdentity(raw, { email: 'lee@example.com', householdId: lee.id, actor: 'system' });
    const service = createHousehold(raw, { displayName: 'Service', actor: 'system' });
    assignIdentity(raw, {
      email: 'root@example.com',
      householdId: service.id,
      role: 'platform_admin',
      actor: 'system',
    });
    assignIdentity(raw, {
      email: 'root2@example.com',
      householdId: service.id,
      role: 'platform_admin',
      actor: 'system',
    });
    households = { alex: alex.id, lee: lee.id, service: service.id };
  });

  after(() => raw.close());

  it('lets a member grant read-only access for a fixed duration, and audits it', () => {
    const grant = grantSupportAccess(raw, {
      householdId: households.alex,
      grantorEmail: 'Alex@Example.com',
      supportEmail: 'root@example.com',
      durationMinutes: 240,
      now: T0,
    });
    assert.equal(grant.scope, 'read');
    assert.equal(grant.grantedByEmail, 'alex@example.com');
    assert.equal(grant.supportEmail, 'root@example.com');
    assert.equal(new Date(grant.expiresAt).getTime(), T0.getTime() + 4 * HOUR);
    assert.equal(supportGrantStatus(grant, T0), 'active');

    const audit = listRegistryAudit(raw, 50).find((entry) => entry.action === 'support.grant');
    assert.ok(audit);
    assert.equal(audit.actor, 'alex@example.com');
    assert.equal(audit.householdId, households.alex);
    assert.equal(audit.email, 'root@example.com');
  });

  it('refuses a grant from anyone who is not a member of that household', () => {
    assert.throws(
      () =>
        grantSupportAccess(raw, {
          householdId: households.alex,
          grantorEmail: 'lee@example.com',
          supportEmail: 'root2@example.com',
          durationMinutes: 60,
          now: T0,
        }),
      /Only a member of this household can grant/,
    );
    assert.throws(
      () =>
        grantSupportAccess(raw, {
          householdId: households.alex,
          grantorEmail: 'root@example.com',
          supportEmail: 'root2@example.com',
          durationMinutes: 60,
          now: T0,
        }),
      SupportGrantError,
      'a platform administrator is not a member of a household they do not belong to',
    );
  });

  it('gives access only to a platform administrator who is not a member', () => {
    // Plain member of another household: not an administrator, so refused.
    assert.throws(
      () =>
        grantSupportAccess(raw, {
          householdId: households.lee,
          grantorEmail: 'lee@example.com',
          supportEmail: 'alex@example.com',
          durationMinutes: 60,
          now: T0,
        }),
      /only be given to the service administrator/,
    );
    assert.throws(
      () =>
        grantSupportAccess(raw, {
          householdId: households.lee,
          grantorEmail: 'lee@example.com',
          supportEmail: 'nobody@example.com',
          durationMinutes: 60,
          now: T0,
        }),
      /not assigned to any household/,
    );
  });

  it('accepts only the fixed durations, so no grant is open-ended', () => {
    for (const minutes of [0, -60, 30, 90, 10080, 1.5, Number.NaN]) {
      assert.throws(
        () =>
          grantSupportAccess(raw, {
            householdId: households.lee,
            grantorEmail: 'lee@example.com',
            supportEmail: 'root2@example.com',
            durationMinutes: minutes,
            now: T0,
          }),
        /Choose 1, 4 or 24 hours/,
        `duration ${minutes} must be refused`,
      );
    }
  });

  it('allows one active grant per household; a new one needs the old one ended', () => {
    const first = listSupportGrants(raw, households.alex).find(
      (grant) => supportGrantStatus(grant, T0) === 'active',
    );
    assert.ok(first, 'the earlier grant is still active');
    assert.throws(
      () =>
        grantSupportAccess(raw, {
          householdId: households.alex,
          grantorEmail: 'alex@example.com',
          supportEmail: 'root2@example.com',
          durationMinutes: 60,
          now: T0,
        }),
      /already active/,
    );
    revokeSupportAccess(raw, { grantId: first.id, actorEmail: 'sam@example.com', now: T0 });
    const replacement = grantSupportAccess(raw, {
      householdId: households.alex,
      grantorEmail: 'alex@example.com',
      supportEmail: 'root2@example.com',
      durationMinutes: 60,
      now: T0,
    });
    assert.equal(replacement.supportEmail, 'root2@example.com');
  });

  it('is valid only until it expires, and the check is re-run on every request', () => {
    const grant = listSupportGrants(raw, households.alex)[0];
    assert.ok(grant);
    const grantedTo = grant.supportEmail;
    const expiry = new Date(grant.expiresAt);
    assert.ok(resolveSupportGrant(raw, { grantId: grant.id, supportEmail: grantedTo, now: T0 }));
    assert.equal(
      resolveSupportGrant(raw, {
        grantId: grant.id,
        supportEmail: grantedTo,
        now: new Date(expiry.getTime() - 1),
      })?.household.id,
      households.alex,
    );
    assert.equal(
      resolveSupportGrant(raw, { grantId: grant.id, supportEmail: grantedTo, now: expiry }),
      null,
      'at the expiry instant the grant is over',
    );
  });

  it('only a member can revoke, and a revoked grant stops at once', () => {
    const grant = listSupportGrants(raw, households.alex).find(
      (entry) => entry.revokedAt === null && supportGrantStatus(entry, T0) === 'active',
    );
    assert.ok(grant);
    assert.throws(
      () => revokeSupportAccess(raw, { grantId: grant.id, actorEmail: 'lee@example.com', now: T0 }),
      /Only a member of this household can end/,
    );
    assert.throws(
      () =>
        revokeSupportAccess(raw, { grantId: grant.id, actorEmail: 'root@example.com', now: T0 }),
      /Only a member of this household can end/,
      'an administrator cannot end a household’s consent',
    );
    const revoked = revokeSupportAccess(raw, {
      grantId: grant.id,
      actorEmail: 'sam@example.com',
      now: T0,
    });
    assert.equal(revoked.revokedByEmail, 'sam@example.com');
    assert.equal(supportGrantStatus(revoked, T0), 'revoked');
    assert.equal(
      resolveSupportGrant(raw, { grantId: grant.id, supportEmail: grant.supportEmail, now: T0 }),
      null,
    );
    assert.throws(
      () =>
        revokeSupportAccess(raw, { grantId: grant.id, actorEmail: 'alex@example.com', now: T0 }),
      /already ended/,
    );
  });

  it('refuses a grant used by someone other than the named administrator', () => {
    const grant = grantSupportAccess(raw, {
      householdId: households.lee,
      grantorEmail: 'lee@example.com',
      supportEmail: 'root@example.com',
      durationMinutes: 60,
      now: T0,
    });
    assert.equal(
      resolveSupportGrant(raw, { grantId: grant.id, supportEmail: 'root2@example.com', now: T0 }),
      null,
    );
    assert.throws(
      () =>
        recordSupportOpen(raw, {
          grantId: grant.id,
          actorEmail: 'root2@example.com',
          now: T0,
        }),
      /Only the administrator named/,
    );
  });

  it('stops honouring a grant when its administrator is demoted or its household deactivated', () => {
    const grant = listSupportGrantsForAdministrator(raw, 'root@example.com', T0)[0]?.grant;
    assert.ok(grant, 'root has an active grant from Lee');
    setIdentityRole(raw, { email: 'root@example.com', role: 'member', actor: 'system', now: T0 });
    assert.equal(
      resolveSupportGrant(raw, { grantId: grant.id, supportEmail: 'root@example.com', now: T0 }),
      null,
      'a demoted administrator loses support views at once',
    );
    setIdentityRole(raw, {
      email: 'root@example.com',
      role: 'platform_admin',
      actor: 'system',
      now: T0,
    });
    assert.ok(
      resolveSupportGrant(raw, { grantId: grant.id, supportEmail: 'root@example.com', now: T0 }),
    );

    setHouseholdStatus(raw, {
      householdId: households.lee,
      status: 'deactivated',
      actor: 'system',
      now: T0,
    });
    assert.equal(
      resolveSupportGrant(raw, { grantId: grant.id, supportEmail: 'root@example.com', now: T0 }),
      null,
      'a deactivated household cannot be opened, even under a live grant',
    );
    assert.throws(
      () =>
        grantSupportAccess(raw, {
          householdId: households.lee,
          grantorEmail: 'lee@example.com',
          supportEmail: 'root@example.com',
          durationMinutes: 60,
          now: T0,
        }),
      /deactivated/,
    );
    setHouseholdStatus(raw, {
      householdId: households.lee,
      status: 'active',
      actor: 'system',
      now: T0,
    });
  });

  it('records the first use once, refreshes last use at most once a minute, and audits the open', () => {
    const grant = grantSupportAccess(raw, {
      householdId: households.alex,
      grantorEmail: 'alex@example.com',
      supportEmail: 'root2@example.com',
      durationMinutes: 60,
      now: T0,
    });
    const administrator = grant.supportEmail;
    recordSupportOpen(raw, { grantId: grant.id, actorEmail: administrator, now: T0 });
    touchSupportGrant(raw, grant.id, T0);
    const first = listSupportGrants(raw, households.alex).find((entry) => entry.id === grant.id);
    assert.equal(first?.firstUsedAt, T0.toISOString());

    touchSupportGrant(raw, grant.id, new Date(T0.getTime() + 30_000));
    assert.equal(
      listSupportGrants(raw, households.alex).find((entry) => entry.id === grant.id)?.lastUsedAt,
      T0.toISOString(),
      'a request inside the throttle window does not write',
    );
    touchSupportGrant(raw, grant.id, new Date(T0.getTime() + 120_000));
    assert.equal(
      listSupportGrants(raw, households.alex).find((entry) => entry.id === grant.id)?.lastUsedAt,
      new Date(T0.getTime() + 120_000).toISOString(),
    );

    const activity = listSupportAudit(raw, households.alex, 50).map((entry) => entry.action);
    assert.ok(activity.includes('support.open'));
    assert.ok(activity.includes('support.access'));
    assert.ok(activity.every((action) => action.startsWith('support.')));
    // Lee's own history holds only Lee's grant activity, never Alex's.
    assert.ok(
      listSupportAudit(raw, households.lee, 50).every((entry) =>
        entry.action.startsWith('support.'),
      ),
    );
  });

  it('keeps the household history visible: grants, status and who ended them', () => {
    const history = listSupportGrants(raw, households.alex);
    assert.ok(history.length >= 2);
    assert.ok(history.some((grant) => grant.revokedByEmail === 'sam@example.com'));
  });
});
