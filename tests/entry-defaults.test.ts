import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { eq } from 'drizzle-orm';
import { auditEntries } from '../src/lib/db/schema';
import { signInEmailChoices } from '../src/lib/auth/sign-in-choices';
import { loadAppConfig } from '../src/lib/config';
import { listPotActivity } from '../src/lib/records/activity';
import { buildEntryData, entryDefaults } from '../src/lib/records/entry-view';
import { listFuelSupplierIds } from '../src/lib/records/fuel';
import {
  findPersonByEmail,
  getPerson,
  InvalidPersonEmailError,
  setPersonEmail,
} from '../src/lib/records/people';
import { addCheckpoint } from '../src/lib/records/pots';
import { createPurchase, voidPurchase } from '../src/lib/records/purchases';
import { createHouseholdFixture, type HouseholdFixture } from './household';

/**
 * v0.11.0 (decisions 145–146): the till starts on whoever is signed in, and
 * the Fuel form's supplier list is fuel suppliers only. Fictional emails only.
 */

describe('entryDefaults — viewer → person → vehicle', () => {
  const people = [
    { id: 1, email: 'alex@example.com' },
    { id: 2, email: 'sam@example.com' },
  ];
  const vehicles = [
    { id: 10, ownerPersonId: 1 },
    { id: 20, ownerPersonId: 2 },
  ];

  it('starts on the linked person and the vehicle they own', () => {
    assert.deepEqual(entryDefaults({ people, vehicles, viewerEmail: 'sam@example.com' }), {
      personId: 2,
      vehicleId: 20,
    });
  });

  it('matches the sign-in case-insensitively', () => {
    assert.equal(entryDefaults({ people, vehicles, viewerEmail: ' Sam@Example.com ' }).personId, 2);
  });

  it('falls back to the first person when the sign-in is not linked', () => {
    assert.deepEqual(entryDefaults({ people, vehicles, viewerEmail: 'guest@example.com' }), {
      personId: 1,
      vehicleId: 10,
    });
    assert.deepEqual(entryDefaults({ people, vehicles, viewerEmail: null }), {
      personId: 1,
      vehicleId: 10,
    });
  });

  it('falls back to the first vehicle when the person owns none', () => {
    assert.deepEqual(
      entryDefaults({
        people,
        vehicles: [
          { id: 10, ownerPersonId: 1 },
          { id: 30, ownerPersonId: null },
        ],
        viewerEmail: 'sam@example.com',
      }),
      { personId: 2, vehicleId: 10 },
    );
  });

  it('copes with an empty household', () => {
    assert.deepEqual(entryDefaults({ people: [], vehicles: [], viewerEmail: 'x@example.com' }), {
      personId: null,
      vehicleId: null,
    });
  });
});

describe('Signs in as — in the database', () => {
  let fx: HouseholdFixture;
  before(async () => {
    fx = await createHouseholdFixture();
  });
  after(() => fx.close());
  const allowed = ['alex@example.com', 'sam@example.com'];

  it('links an allowlisted sign-in, audited, and the till follows it', () => {
    const before = buildEntryData(fx.db, new Date('2026-09-20T17:00:00Z'), 'sam@example.com');
    assert.equal(before.defaultPersonId, fx.people.alex.id, 'unlinked: first person');

    setPersonEmail(fx.db, {
      id: fx.people.sam.id,
      email: 'SAM@example.com',
      allowedEmails: allowed,
      actor: 'alex@example.com',
    });
    assert.equal(findPersonByEmail(fx.db, 'sam@example.com')?.id, fx.people.sam.id);
    const data = buildEntryData(fx.db, new Date('2026-09-20T17:00:00Z'), 'sam@example.com');
    assert.equal(data.defaultPersonId, fx.people.sam.id);
    assert.equal(data.defaultVehicleId, fx.vehicles.vehicleB.id);

    const audits = fx.db
      .select()
      .from(auditEntries)
      .where(eq(auditEntries.action, 'person.email'))
      .all();
    assert.equal(audits.length, 1);
    assert.equal(audits[0]?.entityId, String(fx.people.sam.id));
  });

  it('refuses an email that is not allowed in', () => {
    assert.throws(
      () =>
        setPersonEmail(fx.db, {
          id: fx.people.alex.id,
          email: 'stranger@example.com',
          allowedEmails: allowed,
          actor: 'alex@example.com',
        }),
      InvalidPersonEmailError,
    );
  });

  it('moves an email already linked to someone else, and unlinks', () => {
    setPersonEmail(fx.db, {
      id: fx.people.alex.id,
      email: 'sam@example.com',
      allowedEmails: allowed,
      actor: 'alex@example.com',
    });
    assert.equal(getPerson(fx.db, fx.people.sam.id).email, null);
    assert.equal(getPerson(fx.db, fx.people.alex.id).email, 'sam@example.com');
    setPersonEmail(fx.db, {
      id: fx.people.alex.id,
      email: null,
      allowedEmails: allowed,
      actor: 'alex@example.com',
    });
    assert.equal(findPersonByEmail(fx.db, 'sam@example.com'), null);
  });
});

describe('signInEmailChoices', () => {
  it('offers the allowlist, the dev identity when bypassing, and stored links', () => {
    const config = loadAppConfig({
      AUTH_ALLOWED_EMAILS: 'Alex@example.com, sam@example.com',
      AUTH_DEV_BYPASS: 'true',
      AUTH_DEV_IDENTITY_EMAIL: 'dev@example.com',
    });
    assert.deepEqual(signInEmailChoices(config, [{ email: 'old@example.com' }, { email: null }]), [
      'alex@example.com',
      'sam@example.com',
      'dev@example.com',
      'old@example.com',
    ]);
  });
});

describe('Quick Entry current account balance from All Transactions', () => {
  let fx: HouseholdFixture;
  before(async () => {
    fx = await createHouseholdFixture();
  });
  after(() => fx.close());

  it('keeps the checkpoint separate from the latest running balance', () => {
    const now = new Date('2026-09-20T17:00:00Z');
    const potId = fx.pots.main.id;
    addCheckpoint(fx.db, {
      potId,
      amountPence: 31200,
      effectiveDate: '2026-09-18',
      actor: 'alex@example.com',
      now,
    });
    createPurchase(fx.db, {
      potId,
      totalPence: 4000,
      supplierName: 'Test shop',
      occurredDate: '2026-09-19',
      lines: [
        {
          amountPence: 4000,
          categoryId: fx.categoryId('Groceries', 'Weekly Shop'),
          targetKind: 'household',
        },
      ],
      actor: 'alex@example.com',
      now,
    });

    const pot = buildEntryData(fx.db, now).pots.find((entry) => entry.id === potId);
    assert.ok(pot);
    assert.equal(pot.checkpoint?.amountPence, 31200);

    const activity = listPotActivity(fx.db, {
      potId,
      dateFrom: '2026-09-01',
      dateTo: '2026-09-20',
    });
    const latestMovement = activity.entries.find(
      (entry) => entry.kind === 'row' && entry.row.runningBalancePence !== null,
    );
    assert.ok(latestMovement?.kind === 'row');
    assert.equal(latestMovement.row.runningBalancePence, 27200);
    assert.equal(pot.currentAccountBalancePence, latestMovement.row.runningBalancePence);
    assert.notEqual(pot.currentAccountBalancePence, pot.checkpoint?.amountPence);
  });
});

describe('fuel suppliers for the Fuel form', () => {
  let fx: HouseholdFixture;
  before(async () => {
    fx = await createHouseholdFixture();
  });
  after(() => fx.close());

  function buy(supplierName: string, parent: string, child: string, day: string) {
    const categoryId = fx.categoryId(parent, child);
    return createPurchase(fx.db, {
      potId: fx.pots.main.id,
      totalPence: 4000,
      paidByPersonId: fx.people.alex.id,
      supplierName,
      occurredDate: day,
      lines: [
        {
          amountPence: 4000,
          categoryId,
          ...(parent === 'Vehicle Running'
            ? { targetKind: 'vehicle' as const, targetId: fx.vehicles.vehicleA.id }
            : { targetKind: 'household' as const }),
        },
      ],
      actor: 'alex@example.com',
      now: new Date('2026-09-20T17:00:00Z'),
    }).purchase;
  }

  it('lists only suppliers with a fuel purchase, most recent fill first', () => {
    buy('Costa Coffee', 'Groceries', 'Weekly Shop', '2026-09-19');
    buy('Petrol Station', 'Vehicle Running', 'Fuel', '2026-09-01');
    buy('Motorway Services', 'Vehicle Running', 'Fuel', '2026-09-10');
    const voided = buy('Voided Garage', 'Vehicle Running', 'Fuel', '2026-09-15');
    voidPurchase(fx.db, {
      id: voided.id,
      expectedVersion: voided.version,
      reason: 'test',
      actor: 'alex@example.com',
    });

    const data = buildEntryData(fx.db, new Date('2026-09-20T17:00:00Z'));
    assert.deepEqual(
      data.fuelSuppliers.map((supplier) => supplier.name),
      ['Motorway Services', 'Petrol Station'],
    );
    assert.ok(data.suppliers.some((supplier) => supplier.name === 'Costa Coffee'));
    assert.equal(listFuelSupplierIds(fx.db).length, 2);
  });
});

describe('buildEntryData — cash pot ownership and the counted label (decision 178)', () => {
  let fx: HouseholdFixture;
  before(async () => {
    fx = await createHouseholdFixture();
  });
  after(() => fx.close());
  const NOW = new Date('2026-09-20T17:00:00Z');

  it('pots carry their owner; cash keeps the age of its last count, never the amount', () => {
    const data = buildEntryData(fx.db, NOW, 'alex@example.com');
    const alexCash = data.pots.find((pot) => pot.label === "Alex's cash");
    const samCash = data.pots.find((pot) => pot.label === "Sam's cash");
    const main = data.pots.find((pot) => pot.label === 'Main account');
    assert.ok(alexCash && samCash && main);
    assert.equal(alexCash.ownerPersonId, fx.people.alex.id);
    assert.equal(samCash.ownerPersonId, fx.people.sam.id);
    assert.equal(main.ownerPersonId, null);
    assert.equal(alexCash.cashLastCountedLabel, null, 'never counted yet');
    assert.equal(main.cashLastCountedLabel, null, 'bank pots do not need it');
    assert.equal(alexCash.checkpoint, null, 'cash still hides the balance at the till');

    addCheckpoint(fx.db, {
      potId: fx.pots.alexCash.id,
      amountPence: 4210,
      actor: 'alex@example.com',
      now: NOW,
    });
    const recounted = buildEntryData(fx.db, NOW, 'alex@example.com');
    const countedCash = recounted.pots.find((pot) => pot.label === "Alex's cash");
    assert.ok(countedCash);
    assert.equal(countedCash.checkpoint, null, 'still no balance shown');
    assert.equal(countedCash.cashLastCountedLabel, 'just now');
  });
});
