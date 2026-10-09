import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createHouseholdFixture, type HouseholdFixture } from './household';
import { createPurchase, createRefund, listPurchases } from '../src/lib/records/purchases';
import { createTransfer } from '../src/lib/records/transfers';
import { createSchedule } from '../src/lib/records/schedules';
import {
  getHonestyLoopView,
  getMonthComparisonView,
  getPersonalMonthView,
  getVehicleCostsView,
} from '../src/lib/records/insights-view';
import { addMonthsClamped, addDaysLocal } from '../src/lib/records/dates';
import {
  firstOfLocalMonth,
  startOfWeekLocal,
  GROCERIES_PARENT,
  FUEL_CHILD,
} from '../src/lib/records/insights';
import { setMonthlyFuelPence, setWeeklyGroceriesPence } from '../src/lib/records/settings';
import { categories } from '../src/lib/db/schema';
import type { Db } from '../src/lib/db/client';

/**
 * Phase 4a exit criterion (decision 63): the insights figures reconcile with
 * the purchase history. Every view is cross-checked against an INDEPENDENT
 * computation over listPurchases + the categories table — the same rows the
 * review table shows — so a UI that "shows one number" and history that
 * "holds another" is impossible. Transfers are asserted to have NO effect.
 */

const NOW = new Date('2026-09-20T17:00:00Z');
const TODAY = '2026-09-20';

function parentNames(db: Db): Map<number, string> {
  const all = db.select().from(categories).all();
  const byId = new Map(all.map((row) => [row.id, row]));
  const parentOf = new Map<number, string>();
  for (const row of all) {
    if (row.parentId === null) continue;
    const parent = byId.get(row.parentId);
    if (parent !== undefined) parentOf.set(row.id, parent.name);
  }
  return parentOf;
}

function childNames(db: Db): Map<number, string> {
  const all = db.select().from(categories).all();
  return new Map(all.filter((row) => row.parentId !== null).map((row) => [row.id, row.name]));
}

/** Independent net spending for a window, straight from the review rows. */
function historyTotalPence(db: Db, from: string, to: string): number {
  return listPurchases(db, { dateFrom: from, dateTo: to }).reduce(
    (sum, row) => sum + row.purchase.totalPence,
    0,
  );
}

function seedSpending(fixture: HouseholdFixture) {
  const { db, pots, people, vehicles } = fixture;
  const groceries = fixture.categoryId('Groceries', 'Weekly Shop');
  const fuelA = fixture.categoryId('Vehicle Running', 'Fuel');
  const clothing = fixture.categoryId('Personal', 'Clothing & Shoes');
  const council = fixture.categoryId('Housing', 'Council Tax');

  createPurchase(db, {
    potId: pots.main.id,
    totalPence: 9000,
    paidByPersonId: people.alex.id,
    occurredDate: '2026-09-10',
    lines: [{ amountPence: 9000, categoryId: groceries, targetKind: 'household' }],
    actor: 'alex@example.com',
    now: NOW,
  });
  createPurchase(db, {
    potId: pots.main.id,
    totalPence: 2149,
    paidByPersonId: people.alex.id,
    occurredDate: '2026-09-11',
    lines: [
      { amountPence: 2149, categoryId: clothing, targetKind: 'person', targetId: people.sam.id },
    ],
    actor: 'alex@example.com',
    now: NOW,
  });
  createPurchase(db, {
    potId: pots.main.id,
    totalPence: 5820,
    paidByPersonId: people.alex.id,
    occurredDate: '2026-09-05',
    lines: [
      {
        amountPence: 5820,
        categoryId: fuelA,
        targetKind: 'vehicle',
        targetId: vehicles.vehicleA.id,
      },
    ],
    actor: 'alex@example.com',
    now: NOW,
  });
  const refunded = createPurchase(db, {
    potId: pots.main.id,
    totalPence: 500,
    paidByPersonId: people.sam.id,
    occurredDate: '2026-09-12',
    lines: [{ amountPence: 500, categoryId: groceries, targetKind: 'household' }],
    actor: 'sam@example.com',
    now: NOW,
  });
  createRefund(db, {
    refundOfPurchaseId: refunded.purchase.id,
    totalPence: -500,
    lines: [{ amountPence: -500, categoryId: groceries, targetKind: 'household' }],
    actor: 'sam@example.com',
    now: NOW,
  });
  createPurchase(db, {
    potId: pots.main.id,
    totalPence: 100000,
    paidByPersonId: people.sam.id,
    occurredDate: '2026-08-01',
    lines: [{ amountPence: 100000, categoryId: council, targetKind: 'household' }],
    actor: 'sam@example.com',
    now: NOW,
  });
  createPurchase(db, {
    potId: pots.main.id,
    totalPence: 4000,
    paidByPersonId: people.sam.id,
    occurredDate: '2026-08-15',
    lines: [
      {
        amountPence: 4000,
        categoryId: fuelA,
        targetKind: 'vehicle',
        targetId: vehicles.vehicleA.id,
      },
    ],
    actor: 'sam@example.com',
    now: NOW,
  });
  // A transfer between the household's own pots — must NOT appear anywhere.
  createTransfer(db, {
    fromPotId: pots.salary.id,
    toPotId: pots.main.id,
    amountPence: 40000,
    occurredDate: '2026-09-19',
    actor: 'alex@example.com',
    now: NOW,
  });
}

describe('insights-view: reconciliation with the purchase history', () => {
  let fixture: HouseholdFixture;
  before(async () => {
    fixture = await createHouseholdFixture();
    seedSpending(fixture);
  });
  after(() => fixture.close());
  const db = () => fixture.db;

  it('panel 1 totals match the review rows for both months and month-to-date', () => {
    const view = getMonthComparisonView(db(), NOW);
    assert.equal(
      view.current.summary.totalPence,
      historyTotalPence(db(), '2026-09-01', '2026-09-30'),
    );
    assert.equal(
      view.previous.summary.totalPence,
      historyTotalPence(db(), '2026-08-01', '2026-08-31'),
    );
    assert.equal(
      view.monthToDate.totalPence,
      historyTotalPence(db(), firstOfLocalMonth(TODAY), TODAY),
    );
    // Known ground truth (incl. the refund netting and the transfer excluded):
    assert.equal(view.current.summary.totalPence, 9000 + 2149 + 5820 + 500 - 500);
    assert.equal(view.previous.summary.totalPence, 104000);
  });

  it('panel 1 per-parent rows match independent line-level sums', () => {
    const view = getMonthComparisonView(db(), NOW);
    const parents = parentNames(db());
    const lines = listPurchases(db(), { dateFrom: '2026-09-01', dateTo: '2026-09-30' }).flatMap(
      (row) => row.allocations,
    );
    const independent = new Map<string, number>();
    for (const line of lines) {
      const parent = parents.get(line.categoryId);
      if (parent === undefined) continue;
      independent.set(parent, (independent.get(parent) ?? 0) + line.amountPence);
    }
    for (const row of view.current.summary.byParent) {
      assert.equal(row.amountPence, independent.get(row.parent) ?? 0, row.parent);
    }
    for (const [parent, amountPence] of independent) {
      const row = view.current.summary.byParent.find((entry) => entry.parent === parent);
      assert.equal(row?.amountPence, amountPence, parent);
    }
  });

  it('panel 2 attributes exactly the person-target lines, and nothing else', () => {
    const view = getPersonalMonthView(db(), { year: 2026, month: 9 }, NOW);
    const { people } = fixture;
    const lines = listPurchases(db(), { dateFrom: '2026-09-01', dateTo: '2026-09-30' }).flatMap(
      (row) => row.allocations,
    );
    const independent = (personId: number) =>
      lines
        .filter((line) => line.targetKind === 'person' && line.targetId === personId)
        .reduce((sum, line) => sum + line.amountPence, 0);
    for (const row of view.people) {
      assert.equal(row.totalPence, independent(row.personId), row.person);
    }
    // Both people are listed; Sam's line is attributed, Alex's zero stays zero.
    assert.equal(view.people.find((row) => row.personId === people.sam.id)?.totalPence, 2149);
    assert.equal(view.people.find((row) => row.personId === people.alex.id)?.totalPence, 0);
  });

  it('panel 3 rolling-12 matches the window sum over history lines', () => {
    const view = getVehicleCostsView(db(), NOW);
    const windowFrom = addMonthsClamped(firstOfLocalMonth(TODAY), -11);
    const lines = listPurchases(db(), { dateFrom: windowFrom, dateTo: TODAY }).flatMap(
      (row) => row.allocations,
    );
    for (const vehicle of view) {
      const independent = lines
        .filter((line) => line.targetKind === 'vehicle' && line.targetId === vehicle.vehicleId)
        .reduce((sum, line) => sum + line.amountPence, 0);
      assert.equal(vehicle.rolling12Pence, independent, vehicle.label);
    }
    const a = view.find((row) => row.vehicleId === fixture.vehicles.vehicleA.id);
    assert.equal(a?.rolling12Pence, 5820 + 4000);
    assert.equal(a?.rolling12From, windowFrom);
  });

  it('panel 4 windows match line-level sums (complete periods only) and the transfer never leaks in', () => {
    setWeeklyGroceriesPence(db(), 9000, 'alex@example.com', NOW);
    setMonthlyFuelPence(db(), fixture.vehicles.vehicleA.id, 7500, 'alex@example.com', NOW);
    const loop = getHonestyLoopView(db(), NOW);

    const thisMonday = startOfWeekLocal(TODAY);
    const weekStart = addDaysLocal(thisMonday, -7 * 8);
    const weekEnd = addDaysLocal(thisMonday, -1);
    const parents = parentNames(db());
    const groceryLines = listPurchases(db(), { dateFrom: weekStart, dateTo: weekEnd })
      .flatMap((row) => row.allocations)
      .filter((line) => parents.get(line.categoryId) === GROCERIES_PARENT);
    const expectedWeekly = groceryLines.reduce((sum, line) => sum + line.amountPence, 0);
    assert.equal(
      loop.groceries.weeks.reduce((sum, week) => sum + week.actualPence, 0),
      expectedWeekly,
    );

    // Exactly the engine's window: the last three COMPLETE calendar months
    // (the partial current month is excluded, so September fuel is out).
    const fuelWindowFrom = addMonthsClamped(firstOfLocalMonth(TODAY), -3);
    const fuelWindowTo = addDaysLocal(firstOfLocalMonth(TODAY), -1);
    const fuelChildNames = childNames(db());
    const fuelLines = listPurchases(db(), { dateFrom: fuelWindowFrom, dateTo: fuelWindowTo })
      .flatMap((row) => row.allocations)
      .filter(
        (line) =>
          fuelChildNames.get(line.categoryId) === FUEL_CHILD &&
          line.targetKind === 'vehicle' &&
          line.targetId === fixture.vehicles.vehicleA.id,
      );
    const fuelTotal = fuelLines.reduce((sum, line) => sum + line.amountPence, 0);
    const fuelA = loop.fuel.find((row) => row.vehicleId === fixture.vehicles.vehicleA.id);
    assert.equal(
      fuelA?.months.reduce((sum, month) => sum + month.actualPence, 0),
      fuelTotal,
    );
    assert.equal(fuelA?.configuredPence, 7500);

    // The £400 transfer must not have entered any window.
    assert.equal(
      loop.groceries.weeks.reduce((sum, week) => sum + week.actualPence, 0),
      expectedWeekly,
    );
  });
});

describe('insights-view: converted schedule purchases count as spending', () => {
  it('the lazy due pass converts the due instance before the views read', async () => {
    const fixture = await createHouseholdFixture();
    try {
      const { db, pots } = fixture;
      const groceries = fixture.categoryId('Groceries', 'Weekly Shop');
      createSchedule(db, {
        name: 'ShopCo weekly direct debit',
        kind: 'dd',
        frequency: 'monthly',
        dueDayOfMonth: 15,
        amountPence: 8455,
        potId: pots.main.id,
        categoryId: groceries,
        supplierName: 'Northern Power Co',
        targetKind: 'household',
        activeFrom: '2026-09-01',
        actor: 'alex@example.com',
        now: new Date('2026-09-02T09:00:00Z'),
      });
      // Read at a time when the 15th instance is due — the view must convert
      // it (one fact, no double count) and include it in the month.
      const readTime = new Date('2026-09-16T00:30:00Z');
      const before = listPurchases(db, { dateFrom: '2026-09-01', dateTo: '2026-09-30' }).length;
      assert.equal(before, 0);
      const view = getMonthComparisonView(db, readTime);
      assert.equal(view.current.summary.totalPence, 8455);
      const after = listPurchases(db, { dateFrom: '2026-09-01', dateTo: '2026-09-30' });
      assert.equal(after.length, 1);
      assert.equal(after[0]?.purchase.totalPence, 8455);
      // The converted purchase is tagged with the instance it came from —
      // one fact, never two records for the same outgo.
      assert.equal(after[0]?.purchase.scheduleInstanceId, 1);
      // Reading again does not double-count.
      const again = getMonthComparisonView(db, readTime);
      assert.equal(again.current.summary.totalPence, 8455);
    } finally {
      fixture.close();
    }
  });
});

describe('insights-view: annual vehicle payments are spread ÷ 12 in running costs only (decision 190)', () => {
  it('an annual premium reads as one twelfth a month in running costs, and stays on its payment date in the monthly comparison', async () => {
    const fixture = await createHouseholdFixture();
    try {
      const { db, pots, vehicles } = fixture;
      createSchedule(db, {
        name: 'Fictional car insurance',
        kind: 'dd',
        frequency: 'annual',
        dueMonth: 8,
        dueDayOfMonth: 24,
        amountPence: 61500,
        potId: pots.main.id,
        categoryId: fixture.categoryId('Vehicle Running', 'Insurance'),
        supplierName: 'Fictional Insurer Ltd',
        targetKind: 'vehicle',
        targetId: vehicles.vehicleA.id,
        activeFrom: '2025-08-24',
        actor: 'alex@example.com',
        now: NOW,
      });
      // Two payments have fallen due (24 Aug 2025 and 24 Aug 2026); the next is in 2027.
      const view = getVehicleCostsView(db, NOW);
      const a = view.find((row) => row.vehicleId === vehicles.vehicleA.id);
      assert.equal(a?.previousMonthPence, 5125, 'August 2026: one twelfth of the premium');
      assert.equal(a?.monthPence, 5125, 'September 2026 (in progress): one twelfth');
      // Oct 2025 – Jul 2026 from the 2025 payment (10 shares) + Aug – Sep 2026 from this year's (2 shares).
      assert.equal(a?.rolling12Pence, 61500);
      assert.equal(a?.annualSpreadPence, 61500);
      assert.equal(a?.rolling12From, '2025-10-01');
      const insurance = a?.byChild.find((row) => row.child === 'Insurance');
      assert.equal(insurance?.amountPence, 61500);
      assert.equal(insurance?.spreadPence, 61500);

      // Cash basis elsewhere: the whole premium is in August 2026 — the spike is still the truth
      // for the month's outgoings, and the purchase history still shows one payment.
      const comparison = getMonthComparisonView(db, NOW);
      assert.equal(comparison.previous.summary.totalPence, 61500);
      assert.equal(comparison.current.summary.totalPence, 0);
      const history = listPurchases(db, { dateFrom: '2026-08-01', dateTo: '2026-08-31' });
      assert.equal(history.length, 1);
      assert.equal(history[0]?.purchase.totalPence, 61500);
    } finally {
      fixture.close();
    }
  });

  it('after a year of payments, an annual and a monthly vehicle compare like for like', async () => {
    const fixture = await createHouseholdFixture();
    try {
      const { db, pots, vehicles } = fixture;
      const insurance = fixture.categoryId('Vehicle Running', 'Insurance');
      createSchedule(db, {
        name: 'Fictional car insurance',
        kind: 'dd',
        frequency: 'annual',
        dueMonth: 8,
        dueDayOfMonth: 24,
        amountPence: 61500,
        potId: pots.main.id,
        categoryId: insurance,
        supplierName: 'Fictional Insurer Ltd',
        targetKind: 'vehicle',
        targetId: vehicles.vehicleA.id,
        activeFrom: '2025-08-24',
        actor: 'alex@example.com',
        now: NOW,
      });
      createSchedule(db, {
        name: 'Fictional monthly insurance',
        kind: 'dd',
        frequency: 'monthly',
        dueDayOfMonth: 1,
        amountPence: 5125,
        potId: pots.main.id,
        categoryId: insurance,
        supplierName: 'Fictional Insurer Ltd',
        targetKind: 'vehicle',
        targetId: vehicles.vehicleB.id,
        activeFrom: '2025-10-01',
        actor: 'sam@example.com',
        now: NOW,
      });
      const readAt = new Date('2026-10-09T09:00:00Z');
      const view = getVehicleCostsView(db, readAt);
      const a = view.find((row) => row.vehicleId === vehicles.vehicleA.id);
      const b = view.find((row) => row.vehicleId === vehicles.vehicleB.id);
      // Nov 2025 – Oct 2026 is the window. Both vehicles pay 61500 over it.
      assert.equal(a?.rolling12From, '2025-11-01');
      assert.equal(a?.rolling12Pence, 61500);
      assert.equal(b?.rolling12Pence, 61500);
      assert.equal(a?.annualSpreadPence, 61500);
      assert.equal(b?.annualSpreadPence, 0, 'the monthly direct debit is not spread');
      assert.equal(a?.monthPence, 5125);
      assert.equal(b?.monthPence, 5125);
    } finally {
      fixture.close();
    }
  });

  it('a premium paid more than eleven months back still reaches the rolling window', async () => {
    const fixture = await createHouseholdFixture();
    try {
      const { db, pots, vehicles } = fixture;
      // Paid 15 Nov 2024 and 15 Nov 2025 (both fall due by 20 Sep 2026). The 2024
      // payment covers Nov 2024 – Oct 2025: only its October 2025 share is in the window.
      createSchedule(db, {
        name: 'Fictional car insurance (November renewal)',
        kind: 'dd',
        frequency: 'annual',
        dueMonth: 11,
        dueDayOfMonth: 15,
        amountPence: 61500,
        potId: pots.main.id,
        categoryId: fixture.categoryId('Vehicle Running', 'Insurance'),
        supplierName: 'Fictional Insurer Ltd',
        targetKind: 'vehicle',
        targetId: vehicles.vehicleA.id,
        activeFrom: '2024-11-15',
        actor: 'alex@example.com',
        now: NOW,
      });
      const a = getVehicleCostsView(db, NOW).find((row) => row.vehicleId === vehicles.vehicleA.id);
      // Oct 2025 (1 share, from the 2024 payment) + Nov 2025 – Sep 2026 (11 shares, from the 2025 payment).
      assert.equal(a?.rolling12From, '2025-10-01');
      assert.equal(a?.rolling12Pence, 5125 + 11 * 5125);
      assert.equal(a?.rolling12Pence, 61500, 'steady state: exactly one premium');
    } finally {
      fixture.close();
    }
  });
});
