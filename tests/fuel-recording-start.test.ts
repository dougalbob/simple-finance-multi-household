import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createHouseholdFixture, type HouseholdFixture } from './household';
import { createPurchase } from '../src/lib/records/purchases';
import { getHonestyLoopView } from '../src/lib/records/insights-view';
import {
  computeHonestyLoop,
  FUEL_CHILD,
  type SpendingLineInput,
} from '../src/lib/records/insights';
import { setMonthlyFuelPence } from '../src/lib/records/settings';

/**
 * The fuel comparison averages the last three complete calendar months per
 * vehicle. A month before the household started recording was never recorded,
 * so it is not a zero month and must not be averaged in (SPEC §16.4, decision
 * 183 — the same rule the groceries card uses).
 */

const ACTOR = 'alex@example.com';
const NOW = new Date('2026-10-08T12:00:00Z');
const TODAY = '2026-10-08';

function fuelLine(occurredDate: string, amountPence: number, vehicleId = 1): SpendingLineInput {
  return {
    occurredDate,
    categoryId: 1,
    parentName: 'Vehicle Running',
    childName: FUEL_CHILD,
    targetKind: 'vehicle',
    targetId: vehicleId,
    amountPence,
  };
}

describe('fuel comparison averages recorded months only (unit)', () => {
  it('a single recorded month is the average, not a third of it', () => {
    // The user's case: one month of fuel (£50.00 in September), recording from September.
    const loop = computeHonestyLoop(
      [fuelLine('2026-09-12', 5000)],
      {
        weeklyGroceriesPence: null,
        monthlyFuelPence: [{ vehicleId: 1, label: 'Vehicle A', configuredPence: 7500 }],
      },
      TODAY,
      { recordedFrom: '2026-09-01' },
    );
    const vehicle = loop.fuel[0];
    assert.equal(vehicle?.months.length, 1);
    assert.equal(vehicle?.months[0]?.month, '2026-09');
    assert.equal(vehicle?.averageMonthlyPence, 5000);
    assert.equal(vehicle?.driftPence, 5000 - 7500);
  });

  it('a part-recorded first month counts (decision 184)', () => {
    // Recording began on 17 September: September is part recorded, and it counts.
    const loop = computeHonestyLoop(
      [fuelLine('2026-09-20', 5000)],
      {
        weeklyGroceriesPence: null,
        monthlyFuelPence: [{ vehicleId: 1, label: 'Vehicle A', configuredPence: 7500 }],
      },
      TODAY,
      { recordedFrom: '2026-09-17' },
    );
    const vehicle = loop.fuel[0];
    assert.equal(vehicle?.months.length, 1);
    assert.equal(vehicle?.averageMonthlyPence, 5000);
    assert.equal(vehicle?.driftPence, 5000 - 7500);
  });

  it('a month that ended before recording began is left out, even if it is in the window', () => {
    // Recording began on 1 September: August ended before it, so it is not a zero month.
    const loop = computeHonestyLoop(
      [fuelLine('2026-09-12', 5000)],
      {
        weeklyGroceriesPence: null,
        monthlyFuelPence: [{ vehicleId: 1, label: 'Vehicle A', configuredPence: null }],
      },
      TODAY,
      { recordedFrom: '2026-09-01' },
    );
    assert.deepEqual(
      loop.fuel[0]?.months.map((month) => month.month),
      ['2026-09'],
    );
    assert.equal(loop.fuel[0]?.averageMonthlyPence, 5000);
  });

  it('once recording has begun, quiet months are zero months', () => {
    // Recording from 1 July: July and August are real zero months, so they count.
    const loop = computeHonestyLoop(
      [fuelLine('2026-09-12', 5000)],
      {
        weeklyGroceriesPence: null,
        monthlyFuelPence: [{ vehicleId: 1, label: 'Vehicle A', configuredPence: null }],
      },
      TODAY,
      { recordedFrom: '2026-07-01' },
    );
    const vehicle = loop.fuel[0];
    assert.equal(vehicle?.months.length, 3);
    assert.equal(vehicle?.averageMonthlyPence, 1667); // 5000 / 3 = 1666.67, half-up
    assert.equal(vehicle?.driftPence, null);
  });
});

describe('fuel comparison, from the recorded purchases (integration)', () => {
  let fixture: HouseholdFixture;
  before(async () => {
    fixture = await createHouseholdFixture(ACTOR, NOW);
    const fuel = fixture.categoryId('Vehicle Running', 'Fuel');
    const shop = fixture.categoryId('Groceries', 'Weekly Shop');
    const vehicleId = fixture.vehicles.vehicleA.id;
    // Recording starts on Thursday 17 September with a shop, then one fill-up in September.
    createPurchase(fixture.db, {
      potId: fixture.pots.main.id,
      totalPence: 10000,
      paidByPersonId: fixture.people.alex.id,
      occurredDate: '2026-09-17',
      lines: [{ amountPence: 10000, categoryId: shop, targetKind: 'household' }],
      actor: ACTOR,
      now: NOW,
    });
    createPurchase(fixture.db, {
      potId: fixture.pots.main.id,
      totalPence: 5000,
      paidByPersonId: fixture.people.alex.id,
      occurredDate: '2026-09-20',
      lines: [{ amountPence: 5000, categoryId: fuel, targetKind: 'vehicle', targetId: vehicleId }],
      actor: ACTOR,
      now: NOW,
    });
    setMonthlyFuelPence(fixture.db, vehicleId, 7500, ACTOR, NOW);
  });
  after(() => fixture.close());

  it('the September fill-up is the average, the two months never recorded are not', () => {
    // Recording began on 17 September: September counts (part recorded), July and August do not.
    const loop = getHonestyLoopView(fixture.db, NOW);
    const vehicle = loop.fuel.find((row) => row.label === 'Vehicle A');
    assert.equal(loop.groceries.recordedFrom, '2026-09-17');
    assert.deepEqual(
      vehicle?.months.map((month) => month.month),
      ['2026-09'],
    );
    assert.equal(vehicle?.averageMonthlyPence, 5000);
    assert.equal(vehicle?.driftPence, 5000 - 7500);
  });
});

describe('fuel comparison with a full recorded month (integration)', () => {
  let fixture: HouseholdFixture;
  before(async () => {
    fixture = await createHouseholdFixture(ACTOR, NOW);
    const fuel = fixture.categoryId('Vehicle Running', 'Fuel');
    const vehicleId = fixture.vehicles.vehicleA.id;
    // Recording starts on 1 September; the only fill-up is in September.
    createPurchase(fixture.db, {
      potId: fixture.pots.main.id,
      totalPence: 5000,
      paidByPersonId: fixture.people.alex.id,
      occurredDate: '2026-09-01',
      lines: [{ amountPence: 5000, categoryId: fuel, targetKind: 'vehicle', targetId: vehicleId }],
      actor: ACTOR,
      now: NOW,
    });
    setMonthlyFuelPence(fixture.db, vehicleId, 7500, ACTOR, NOW);
  });
  after(() => fixture.close());

  it('one recorded month gives a one-month average, and the other two months do not drag it down', () => {
    const loop = getHonestyLoopView(fixture.db, NOW);
    const vehicle = loop.fuel.find((row) => row.label === 'Vehicle A');
    assert.deepEqual(
      vehicle?.months.map((month) => month.month),
      ['2026-09'],
    );
    assert.equal(vehicle?.averageMonthlyPence, 5000);
    assert.equal(vehicle?.driftPence, 5000 - 7500);
  });
});
