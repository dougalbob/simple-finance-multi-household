import assert from 'node:assert/strict';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { eq } from 'drizzle-orm';
import { openDatabase } from '../src/lib/db/client';
import { applyMigrations } from '../src/lib/db/migrate';
import { auditEntries, renewals, schedules, trackedAgreements } from '../src/lib/db/schema';
import {
  createAgreement,
  editAgreement,
  advanceDueAgreementRenewals,
} from '../src/lib/records/agreements';
import { findChildCategory } from '../src/lib/records/categories';
import {
  computeKeyDateAlerts,
  keyDateHref,
  keyDateMessage,
  keyDateStateWords,
} from '../src/lib/records/keydates';
import { VersionConflictError } from '../src/lib/records/errors';
import { createPerson } from '../src/lib/records/people';
import { createPot } from '../src/lib/records/pots';
import { createRenewal, listRenewals } from '../src/lib/records/renewals';
import { cancelSchedule, createSchedule, getSchedule } from '../src/lib/records/schedules';
import { createHouseholdFixture, type HouseholdFixture } from './household';
import { makeTempDir, migrationsFolderBefore } from './helpers';
import { getKeyDateAlerts } from '../src/lib/records/money-view';

const ACTOR = 'alex@example.com';

describe('tracked agreements', () => {
  const fixtures: HouseholdFixture[] = [];
  after(() => fixtures.forEach((fixture) => fixture.close()));

  it('creates and edits a policy with separate dates, provider behaviour and audit history', async () => {
    const fixture = await createHouseholdFixture();
    fixtures.push(fixture);
    const { db } = fixture;
    const now = new Date('2026-09-20T12:00:00Z');
    const policy = createAgreement(db, {
      name: 'Vehicle A insurance',
      type: 'insurance',
      targetKind: 'vehicle',
      targetId: fixture.vehicles.vehicleA.id,
      autoRenew: 'unknown',
      renewalDate: '2026-10-12',
      switchDate: '2026-10-20',
      renewalReminderLeadDays: 21,
      switchReminderLeadDays: 14,
      renewalRepeatsAnnually: true,
      actor: ACTOR,
      now,
    });

    assert.equal(policy.type, 'insurance');
    assert.equal(policy.autoRenew, 'unknown');
    assert.equal(policy.renewalDate, '2026-10-12');
    assert.equal(policy.switchDate, '2026-10-20');
    assert.equal(policy.renewalReminderLeadDays, 21);
    assert.equal(policy.switchReminderLeadDays, 14);
    assert.equal(policy.targetId, fixture.vehicles.vehicleA.id);

    const edited = editAgreement(db, {
      id: policy.id,
      expectedVersion: policy.version,
      actor: ACTOR,
      now: new Date('2026-09-21T12:00:00Z'),
      patch: { autoRenew: 'no', renewalDate: '2026-11-12' },
    });
    assert.equal(edited.autoRenew, 'no');
    assert.equal(edited.renewalDate, '2026-11-12');
    assert.equal(edited.switchDate, '2026-10-20');
    assert.equal(edited.version, policy.version + 1);

    assert.throws(
      () =>
        editAgreement(db, {
          id: policy.id,
          expectedVersion: policy.version,
          actor: ACTOR,
          patch: { name: 'stale edit' },
        }),
      VersionConflictError,
    );

    const audit = db
      .select()
      .from(auditEntries)
      .all()
      .filter((entry) => entry.entity === 'agreement' && entry.entityId === String(policy.id));
    assert.deepEqual(
      audit.map((entry) => entry.action),
      ['agreement.create', 'agreement.edit'],
    );
  });

  it('advances only annual insurance reminders with provider auto-renew explicitly yes', async () => {
    const fixture = await createHouseholdFixture();
    fixtures.push(fixture);
    const { db } = fixture;
    const due = '2026-10-12';
    const createPolicy = (
      name: string,
      autoRenew: 'yes' | 'no' | 'unknown',
      repeatsAnnually: boolean,
    ) =>
      createAgreement(db, {
        name,
        type: 'insurance',
        autoRenew,
        renewalDate: due,
        renewalReminderLeadDays: 21,
        renewalRepeatsAnnually: repeatsAnnually,
        actor: ACTOR,
        now: new Date('2026-09-20T12:00:00Z'),
      });

    const yes = createPolicy('Auto-renew yes', 'yes', true);
    const no = createPolicy('Auto-renew no', 'no', true);
    const unknown = createPolicy('Auto-renew unknown', 'unknown', true);
    const notAnnual = createPolicy('One-off policy date', 'yes', false);

    assert.equal(advanceDueAgreementRenewals(db, new Date('2026-10-12T12:00:00Z')), 1);
    const rows = new Map(
      db
        .select()
        .from(trackedAgreements)
        .all()
        .map((agreement) => [agreement.id, agreement]),
    );
    assert.equal(rows.get(yes.id)?.renewalDate, '2027-10-12');
    assert.equal(rows.get(yes.id)?.renewalAdvancedFrom, due);
    assert.equal(rows.get(no.id)?.renewalDate, due);
    assert.equal(rows.get(unknown.id)?.renewalDate, due);
    assert.equal(rows.get(notAnnual.id)?.renewalDate, due);
    assert.equal(advanceDueAgreementRenewals(db, new Date('2026-10-12T18:00:00Z')), 0);
  });

  it('emits one agreement alert for linked schedule dates, with a usable deep link', async () => {
    const fixture = await createHouseholdFixture();
    fixtures.push(fixture);
    const { db } = fixture;
    const category = findChildCategory(db, 'Utilities', 'Energy');
    assert.ok(category);
    const schedule = createSchedule(db, {
      name: 'Fictional broadband',
      kind: 'dd',
      frequency: 'monthly',
      dueDayOfMonth: 2,
      amountPence: 4200,
      potId: fixture.pots.main.id,
      categoryId: category.id,
      supplierName: 'Fictional Fibre Co',
      targetKind: 'household',
      contractEndsOn: '2026-10-15',
      activeFrom: '2026-10-01',
      actor: ACTOR,
      now: new Date('2026-10-01T12:00:00Z'),
    });
    const agreement = createAgreement(db, {
      name: 'Fictional broadband',
      type: 'service',
      supplierId: schedule.schedule.supplierId,
      switchDate: '2026-10-15',
      switchReminderLeadDays: 21,
      scheduleId: schedule.schedule.id,
      actor: ACTOR,
      now: new Date('2026-10-01T12:00:00Z'),
    });

    cancelSchedule(db, {
      id: schedule.schedule.id,
      expectedVersion: schedule.schedule.version,
      effectiveOn: '2026-10-05',
      actor: ACTOR,
      now: new Date('2026-10-02T12:00:00Z'),
    });
    const editedAfterScheduleCancellation = editAgreement(db, {
      id: agreement.id,
      expectedVersion: agreement.version,
      actor: ACTOR,
      patch: { notes: 'The payment arrangement has ended; keep the review date.' },
    });
    assert.equal(editedAfterScheduleCancellation.scheduleId, schedule.schedule.id);

    const alerts = getKeyDateAlerts(db, new Date('2026-10-01T12:00:00Z'));
    const matching = alerts.filter(
      (alert) => alert.scheduleId === schedule.schedule.id || alert.agreementId === agreement.id,
    );
    assert.equal(matching.length, 1);
    assert.equal(matching[0]?.kind, 'switch-date');
    assert.equal(matching[0]?.state, 'in-window');
    assert.equal(keyDateHref(matching[0]!), `/contracts#agreement-${agreement.id}`);

    const available = computeKeyDateAlerts(
      [
        {
          id: agreement.id,
          agreementId: agreement.id,
          kind: 'switch-date',
          label: agreement.name,
          date: '2026-10-15',
          leadDays: 21,
        },
      ],
      '2026-10-20',
    )[0];
    assert.equal(available?.state, 'available');
    assert.equal(keyDateStateWords(available!), 'Available now');
    assert.match(keyDateMessage(available!), /available since 2026-10-15/);
  });
});

describe('migration 0017: tracked agreement backfill', () => {
  it('copies legacy reminder and schedule dates without removing their sources or duplicating alerts', async () => {
    const dir = await makeTempDir('sf-mig0017-');
    const before = await migrationsFolderBefore('0017_tracked_agreements');
    const handle = openDatabase(path.join(dir, 'upgrade.sqlite'));
    try {
      applyMigrations(handle.db, before);
      const { db } = handle;
      const now = new Date('2026-10-01T12:00:00Z');
      const person = createPerson(db, { label: 'Alex', actor: ACTOR, now });
      const pot = createPot(db, { label: 'Main account', kind: 'bank', actor: ACTOR, now });
      const category = findChildCategory(db, 'Utilities', 'Energy');
      assert.ok(category);
      const legacyRenewal = createRenewal(db, {
        label: 'Annual equipment cover',
        targetKind: 'person',
        targetId: person.id,
        nextRenewalDate: '2026-10-15',
        warnDaysBefore: 14,
        repeatsAnnually: true,
        actor: ACTOR,
        now,
      });
      const legacySchedule = createSchedule(db, {
        name: 'Old broadband agreement',
        kind: 'dd',
        frequency: 'monthly',
        dueDayOfMonth: 2,
        amountPence: 4200,
        potId: pot.id,
        categoryId: category.id,
        supplierName: 'Example Fibre',
        targetKind: 'household',
        contractEndsOn: '2026-10-16',
        activeFrom: '2026-10-01',
        actor: ACTOR,
        now,
      });

      applyMigrations(handle.db);

      const backfilled = db.select().from(trackedAgreements).all();
      const renewalAgreement = backfilled.find(
        (agreement) => agreement.legacyRenewalId === legacyRenewal.id,
      );
      const serviceAgreement = backfilled.find(
        (agreement) => agreement.scheduleId === legacySchedule.schedule.id,
      );
      assert.ok(renewalAgreement);
      assert.equal(renewalAgreement.type, 'other');
      assert.equal(renewalAgreement.name, legacyRenewal.label);
      assert.equal(renewalAgreement.renewalDate, legacyRenewal.nextRenewalDate);
      assert.equal(renewalAgreement.renewalReminderLeadDays, legacyRenewal.warnDaysBefore);
      assert.equal(renewalAgreement.renewalRepeatsAnnually, true);
      assert.equal(renewalAgreement.targetId, person.id);
      assert.ok(serviceAgreement);
      assert.equal(serviceAgreement.type, 'service');
      assert.equal(serviceAgreement.switchDate, '2026-10-16');
      assert.equal(serviceAgreement.switchReminderLeadDays, 21);
      assert.equal(serviceAgreement.scheduleId, legacySchedule.schedule.id);
      assert.equal(serviceAgreement.legacyScheduleId, legacySchedule.schedule.id);

      // Source rows and their ids remain present for old domain callers.
      assert.equal(
        listRenewals(db).find((row) => row.id === legacyRenewal.id)?.id,
        legacyRenewal.id,
      );
      assert.equal(getSchedule(db, legacySchedule.schedule.id).contractEndsOn, '2026-10-16');
      assert.equal(
        db.select().from(renewals).where(eq(renewals.id, legacyRenewal.id)).get()?.id,
        legacyRenewal.id,
      );
      assert.equal(
        db.select().from(schedules).where(eq(schedules.id, legacySchedule.schedule.id)).get()?.id,
        legacySchedule.schedule.id,
      );

      const unlinked = editAgreement(db, {
        id: serviceAgreement.id,
        expectedVersion: serviceAgreement.version,
        actor: ACTOR,
        now,
        patch: { scheduleId: null },
      });
      assert.equal(unlinked.scheduleId, null);
      assert.equal(unlinked.legacyScheduleId, legacySchedule.schedule.id);

      const alerts = getKeyDateAlerts(db, now);
      assert.equal(alerts.filter((alert) => alert.kind === 'renewal').length, 0);
      assert.equal(alerts.filter((alert) => alert.kind === 'contract-end').length, 0);
      assert.equal(alerts.filter((alert) => alert.kind === 'agreement-renewal').length, 1);
      assert.equal(alerts.filter((alert) => alert.kind === 'switch-date').length, 1);
    } finally {
      handle.raw.close();
    }
  });
});
