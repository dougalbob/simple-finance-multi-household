import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createHouseholdFixture, type HouseholdFixture } from './household';
import {
  createPurchase,
  createRefund,
  listPurchases,
  voidPurchase,
} from '../src/lib/records/purchases';
import { createSchedule } from '../src/lib/records/schedules';
import { addCheckpoint } from '../src/lib/records/pots';
import {
  PIE_SPLIT_PARENTS,
  getSpendingMixView,
  paydayCycleWindows,
  spendingMixLines,
} from '../src/lib/records/charts-view';
import { summarizeSpending } from '../src/lib/records/insights';
import { categories } from '../src/lib/db/schema';
import type { Db } from '../src/lib/db/client';

/**
 * Where the money goes (SPEC §16.7 E) reconciled with the purchase history.
 * The pie's figures are checked against an INDEPENDENT sum over listPurchases,
 * the same contract as tests/charts-view.test.ts, and against the Insights
 * roll-up for the same window — so the pie cannot disagree with the tables.
 */

const ACTOR = 'alex@example.com';
// Friday 9 October 2026, evening: the current payday cycle runs 25 Sept to 26 Oct.
const NOW = new Date('2026-10-09T17:00:00Z');

describe('charts-view: where the money goes (E)', () => {
  let fixture: HouseholdFixture;

  before(async () => {
    fixture = await createHouseholdFixture(ACTOR, NOW);
    seed(fixture);
  });
  after(() => fixture.close());

  const db = (): Db => fixture.db;

  it('defaults to the payday cycle: last payday up to the day before the next', () => {
    const view = getSpendingMixView(db(), {}, NOW);
    assert.equal(view.window.kind, 'payday');
    // The 27th of September is a Sunday, so payday is the Friday before (the
    // income weekend shift, decision 7): the cycle runs 25 Sept to 26 Oct.
    assert.equal(view.window.from, '2026-09-25');
    assert.equal(view.window.to, '2026-10-26');
    assert.equal(view.notice, null);
  });

  it('finds the previous payday cycle as the one before it', () => {
    const cycles = paydayCycleWindows(db(), '2026-10-09');
    assert.deepEqual(cycles.previousPayday, {
      kind: 'previous-payday',
      from: '2026-08-27',
      to: '2026-09-24',
    });
  });

  it('draws the same net total as an independent sum over listPurchases', () => {
    const view = getSpendingMixView(db(), {}, NOW);
    const expected = independentNet(db(), view.window.from, view.window.to);
    assert.equal(view.mix.totalPence, expected);
  });

  it('agrees slice by slice with the Insights roll-up for the same window', () => {
    const view = getSpendingMixView(db(), {}, NOW);
    const insights = summarizeSpending(
      spendingMixLines(db(), view.window.from, view.window.to),
      view.window.from,
      view.window.to,
    );
    for (const parent of insights.byParent) {
      if (PIE_SPLIT_PARENTS.includes(parent.parent as never)) {
        const split = view.mix.slices
          .filter((slice) => slice.parentName === parent.parent)
          .reduce((sum, slice) => sum + slice.amountPence, 0);
        assert.equal(split, parent.amountPence, `${parent.parent} split sums to its total`);
      } else {
        const slice = view.mix.slices.find((entry) => entry.parentName === parent.parent);
        assert.equal(slice?.amountPence, parent.amountPence, `${parent.parent}`);
      }
    }
  });

  it('splits Personal into each person, with household personal spending apart', () => {
    const view = getSpendingMixView(db(), {}, NOW);
    const personal = view.mix.slices.filter((slice) => slice.parentName === 'Personal');
    const labels = personal.map((slice) => slice.label).sort();
    assert.deepEqual(labels, ['Personal — Alex', 'Personal — Sam', 'Personal — household']);
    const alex = personal.find(
      (slice) => slice.kind === 'person' && slice.personId === fixture.people.alex.id,
    );
    const alexTotal = independentTargetNet(
      db(),
      'person',
      fixture.people.alex.id,
      'Personal',
      view.window,
    );
    assert.equal(alex?.amountPence, alexTotal);
  });

  it('counts a category exclusion out of both the pie and the total', () => {
    const everything = getSpendingMixView(db(), {}, NOW);
    const groceriesId = parentId(db(), 'Groceries');
    const without = getSpendingMixView(
      db(),
      {
        from: everything.window.from,
        to: everything.window.to,
        includedParentIds: everything.parents
          .map((parent) => parent.id)
          .filter((id) => id !== groceriesId),
      },
      NOW,
    );
    assert.equal(without.allParentsIncluded, false);
    assert.ok(without.mix.slices.every((slice) => slice.parentId !== groceriesId));
    const groceriesNet = everything.mix.slices
      .filter((slice) => slice.parentId === groceriesId)
      .reduce((sum, slice) => sum + slice.amountPence, 0);
    assert.equal(without.mix.totalPence, everything.mix.totalPence - groceriesNet);
  });

  it('uses a custom window only when both bounds are given and run forwards', () => {
    const custom = getSpendingMixView(db(), { from: '2026-10-01', to: '2026-10-05' }, NOW);
    assert.equal(custom.window.kind, 'custom');
    assert.equal(custom.mix.totalPence, independentNet(db(), '2026-10-01', '2026-10-05'));

    const backwards = getSpendingMixView(db(), { from: '2026-10-05', to: '2026-10-01' }, NOW);
    assert.equal(backwards.window.kind, 'payday');
    assert.match(backwards.notice ?? '', /not a valid window/);

    const halfGiven = getSpendingMixView(db(), { from: '2026-10-01' }, NOW);
    assert.equal(halfGiven.window.kind, 'payday');
  });

  it('leaves voided purchases out of the pie', () => {
    const extra = createPurchase(db(), {
      potId: fixture.pots.main.id,
      totalPence: 7777,
      paidByPersonId: fixture.people.alex.id,
      occurredDate: '2026-10-06',
      lines: [
        {
          amountPence: 7777,
          categoryId: fixture.categoryId('Household Goods', 'Cleaning & Consumables'),
          targetKind: 'household',
        },
      ],
      actor: ACTOR,
      now: NOW,
    });
    const before = getSpendingMixView(db(), {}, NOW).mix.totalPence;
    voidPurchase(db(), {
      id: extra.purchase.id,
      expectedVersion: extra.purchase.version,
      actor: ACTOR,
      now: NOW,
    });
    const after = getSpendingMixView(db(), {}, NOW).mix.totalPence;
    assert.equal(before - after, 7777);
  });

  it('gives each slice line items that add back to the slice', () => {
    const view = getSpendingMixView(db(), {}, NOW);
    for (const slice of view.mix.slices) {
      const sum = slice.lines.reduce((total, entry) => total + entry.amountPence, 0);
      assert.equal(sum, slice.amountPence, `${slice.label} lines add to its figure`);
    }
  });
});

/** Net spending in [from, to] from listPurchases: the independent check. */
function independentNet(db: Db, from: string, to: string): number {
  const categoryParent = parentNameById(db);
  let total = 0;
  for (const { allocations } of listPurchases(db, { dateFrom: from, dateTo: to })) {
    for (const allocation of allocations) {
      if (categoryParent.has(allocation.categoryId)) total += allocation.amountPence;
    }
  }
  return total;
}

function independentTargetNet(
  db: Db,
  targetKind: 'person' | 'household',
  targetId: number,
  parent: string,
  window: { from: string; to: string },
): number {
  const parents = parentNameById(db);
  let total = 0;
  for (const { allocations } of listPurchases(db, {
    dateFrom: window.from,
    dateTo: window.to,
  })) {
    for (const allocation of allocations) {
      if (parents.get(allocation.categoryId) !== parent) continue;
      if (allocation.targetKind !== targetKind || allocation.targetId !== targetId) continue;
      total += allocation.amountPence;
    }
  }
  return total;
}

/** Child category id → parent name, from the live tree. */
function parentNameById(db: Db): Map<number, string> {
  const rows = db.select().from(categories).all();
  const byId = new Map(rows.map((row) => [row.id, row]));
  const out = new Map<number, string>();
  for (const row of rows) {
    if (row.parentId === null) continue;
    const parent = byId.get(row.parentId);
    if (parent !== undefined) out.set(row.id, parent.name);
  }
  return out;
}

function parentId(db: Db, name: string): number {
  const row = db
    .select()
    .from(categories)
    .all()
    .find((entry) => entry.parentId === null && entry.name === name);
  if (row === undefined) throw new Error(`no parent ${name}`);
  return row.id;
}

function seed(fixture: HouseholdFixture): void {
  const { db, people, pots } = fixture;
  const groceries = fixture.categoryId('Groceries', 'Weekly Shop');
  const topUp = fixture.categoryId('Groceries', 'Top-up Shops');
  const clothing = fixture.categoryId('Personal', 'Clothing & Shoes');
  const hobbies = fixture.categoryId('Personal', 'Hobbies');
  const fuel = fixture.categoryId('Vehicle Running', 'Fuel');
  const dining = fixture.categoryId('Entertainment & Eating Out', 'Dining Out & Takeaways');

  const buy = (
    occurredDate: string,
    amountPence: number,
    categoryId: number,
    target: { kind: 'household' | 'person' | 'vehicle'; id?: number } = { kind: 'household' },
  ) =>
    createPurchase(db, {
      potId: pots.main.id,
      totalPence: amountPence,
      paidByPersonId: people.alex.id,
      occurredDate,
      lines: [
        {
          amountPence,
          categoryId,
          targetKind: target.kind,
          ...(target.id === undefined ? {} : { targetId: target.id }),
        },
      ],
      actor: ACTOR,
      now: NOW,
    });

  // A salary every month on the 27th, from June: June–September convert, and
  // the 27th of October is the next payday.
  createSchedule(db, {
    name: 'Salary',
    kind: 'receipt',
    frequency: 'monthly',
    dueDayOfMonth: 27,
    amountPence: 215000,
    potId: pots.main.id,
    targetKind: 'household',
    activeFrom: '2026-06-01',
    actor: ACTOR,
    now: NOW,
  });

  // Previous cycle (27 Aug – 26 Sept).
  buy('2026-08-28', 6400, groceries);
  buy('2026-09-03', 2100, fuel, { kind: 'vehicle', id: fixture.vehicles.vehicleA.id });
  buy('2026-09-10', 3300, clothing, { kind: 'person', id: people.alex.id });

  // Current cycle (27 Sept – 26 Oct).
  buy('2026-09-28', 9250, groceries);
  buy('2026-10-02', 2600, topUp);
  buy('2026-10-04', 4500, dining);
  buy('2026-10-05', 1899, clothing, { kind: 'person', id: people.sam.id });
  buy('2026-10-06', 1250, hobbies, { kind: 'person', id: people.alex.id });
  buy('2026-10-07', 800, clothing); // household-marked personal spending
  buy('2026-10-08', 5400, fuel, { kind: 'vehicle', id: fixture.vehicles.vehicleB.id });

  // A refund nets off its own category.
  const returned = buy('2026-10-03', 1200, topUp);
  createRefund(db, {
    refundOfPurchaseId: returned.purchase.id,
    totalPence: -1200,
    lines: [{ amountPence: -1200, categoryId: topUp, targetKind: 'household' }],
    actor: ACTOR,
    now: NOW,
  });

  addCheckpoint(db, { potId: pots.main.id, amountPence: 180000, actor: ACTOR, now: NOW });
}
