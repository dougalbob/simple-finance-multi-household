import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { auditEntries } from '../src/lib/db/schema';
import { openDatabase, type DbHandle } from '../src/lib/db/client';
import { applyMigrations } from '../src/lib/db/migrate';
import {
  cheapestCombination,
  deliveryCost,
  lineCost,
  selectionMatchesPlan,
  type CostingItem,
  type CostingQuote,
  type CostingSupplier,
} from '../src/lib/projects/costing';
import { seedFenceDemoProject } from '../src/lib/projects/demo';
import {
  applyProjectSelections,
  createProject,
  createProjectItem,
  createProjectSupplier,
  InvalidProjectInputError,
  listProjectItems,
  saveProjectQuote,
  selectProjectItemSupplier,
} from '../src/lib/projects/projects';
import {
  computeProjectOptimiser,
  getProjectWorkspaceView,
  planForKind,
} from '../src/lib/projects/projects-view';
import { makeTempDir } from './helpers';

/**
 * Projects Phase 2 — the Cheapest Combination optimiser
 * (PROJECTS_IMPLEMENTATION.MD §7). Pure solver cases first (split vs single
 * supplier, threshold cross-over, unstocked and out-of-stock items, Click &
 * Collect, pack pricing, ties, the node budget, and a brute-force cross-check
 * on random matrices), then the apply flow and the figure-exact fence demo.
 */

const ACTOR = 'alex@example.com';
const NOW = new Date('2026-10-01T09:00:00Z');

function supplier(id: number, name: string, patch: Partial<CostingSupplier> = {}): CostingSupplier {
  return {
    supplierId: id,
    name,
    phone: null,
    websiteUrl: null,
    deliveryFeePence: 1000,
    freeDeliveryThresholdPence: null,
    clickAndCollectAvailable: false,
    fulfilmentChoice: 'delivery',
    ...patch,
  };
}

function item(id: number, quantity = 1, selectedSupplierId: number | null = null): CostingItem {
  return { itemId: id, name: `Item ${id}`, quantity, unit: 'each', selectedSupplierId };
}

function quote(itemId: number, supplierId: number, unitPricePence: number, inStock = true) {
  return {
    itemId,
    supplierId,
    unitPricePence,
    packSize: null,
    packPricePence: null,
    productUrl: null,
    inStock,
  } satisfies CostingQuote;
}

describe('cheapestCombination — the pure optimiser', () => {
  it('splits across suppliers when each is cheapest on different rows and delivery is free', () => {
    const suppliers = [
      supplier(1, 'A', { deliveryFeePence: 0 }),
      supplier(2, 'B', { deliveryFeePence: 0 }),
    ];
    const result = cheapestCombination([item(1), item(2)], suppliers, [
      quote(1, 1, 1000),
      quote(1, 2, 1200),
      quote(2, 1, 900),
      quote(2, 2, 700),
    ]);
    assert.deepEqual(result.split?.assignments, [
      { itemId: 1, supplierId: 1 },
      { itemId: 2, supplierId: 2 },
    ]);
    assert.equal(result.split?.totals.grandTotalPence, 1700);
    assert.equal(result.split?.supplierCount, 2);
    // Single supplier is dearer: A = 1900, B = 1900 (tie → earlier column).
    assert.equal(result.singleSupplier?.totals.grandTotalPence, 1900);
    assert.equal(result.singleSupplier?.assignments[0]?.supplierId, 1);
    assert.equal(result.exact, true);
    assert.equal(result.subsetsEvaluated, 3); // 2^2 − 1
  });

  it('prefers one supplier when two delivery fees outweigh the per-row saving', () => {
    const suppliers = [supplier(1, 'A', { deliveryFeePence: 1000 }), supplier(2, 'B')];
    const result = cheapestCombination([item(1), item(2)], suppliers, [
      quote(1, 1, 3000),
      quote(1, 2, 2900),
      quote(2, 1, 2000),
      quote(2, 2, 2100),
    ]);
    // Splitting saves £1.00 + … nothing like the second £10.00 fee: A alone = 5000 + 1000.
    assert.equal(result.cheapestPerItem?.totals.grandTotalPence, 2900 + 2000 + 1000 + 1000);
    assert.equal(result.split?.totals.grandTotalPence, 6000);
    assert.equal(result.split?.supplierCount, 1);
    assert.equal(result.split?.totals.groups[0]?.supplier.name, 'A');
  });

  it('pays slightly more at one supplier to cross its free-delivery threshold', () => {
    // Y is only at A, Z is only at B. X is cheaper at A (3000 vs 3300), but
    // moving X to B lifts B's subtotal to 7300 ≥ 6000 and waives B's fee.
    const suppliers = [
      supplier(1, 'A', { deliveryFeePence: 1000 }),
      supplier(2, 'B', { deliveryFeePence: 1000, freeDeliveryThresholdPence: 6000 }),
    ];
    const result = cheapestCombination([item(1), item(2), item(3)], suppliers, [
      quote(1, 1, 3000),
      quote(1, 2, 3300),
      quote(2, 1, 1000),
      quote(3, 2, 4000),
    ]);
    const naive = result.cheapestPerItem;
    assert.equal(naive?.totals.grandTotalPence, 10000); // X at A, both fees paid
    assert.equal(result.split?.totals.grandTotalPence, 9300);
    assert.deepEqual(result.split?.assignments, [
      { itemId: 1, supplierId: 2 },
      { itemId: 2, supplierId: 1 },
      { itemId: 3, supplierId: 2 },
    ]);
    const groupB = result.split?.totals.groups.find((group) => group.supplier.supplierId === 2);
    assert.equal(groupB?.delivery.status, 'free-threshold');
    assert.equal(result.exact, true);
  });

  it('names the single supplier only if it stocks every item, and ranks the others', () => {
    const suppliers = [
      supplier(1, 'A', { deliveryFeePence: 0 }),
      supplier(2, 'B', { deliveryFeePence: 0 }),
      supplier(3, 'C', { deliveryFeePence: 0 }),
    ];
    const result = cheapestCombination([item(1), item(2)], suppliers, [
      quote(1, 1, 100), // A lacks item 2 (unstocked)
      quote(1, 2, 500),
      quote(2, 2, 500),
      quote(1, 3, 400),
      quote(2, 3, 400),
    ]);
    assert.deepEqual(
      result.singleSupplierOptions.map((option) => [option.name, option.grandTotalPence]),
      [
        ['C', 800],
        ['B', 1000],
      ],
    );
    assert.equal(result.singleSupplier?.assignments[0]?.supplierId, 3);
    assert.equal(result.split?.totals.grandTotalPence, 100 + 400);
  });

  it('has no single supplier when nobody stocks everything', () => {
    const result = cheapestCombination(
      [item(1), item(2)],
      [supplier(1, 'A'), supplier(2, 'B')],
      [quote(1, 1, 100), quote(2, 2, 100)],
    );
    assert.equal(result.singleSupplier, null);
    assert.deepEqual(result.singleSupplierOptions, []);
    assert.equal(result.split?.supplierCount, 2);
  });

  it('skips out-of-stock quotes (OQ-P3) and reports an item only they supply as uncoverable', () => {
    const suppliers = [
      supplier(1, 'A', { deliveryFeePence: 0 }),
      supplier(2, 'B', { deliveryFeePence: 0 }),
    ];
    const items = [item(1), item(2)];
    const quotes = [
      quote(1, 1, 500, false), // cheapest, but out of stock
      quote(1, 2, 650),
      quote(2, 1, 900, false), // only source of item 2, out of stock
    ];
    const strict = cheapestCombination(items, suppliers, quotes);
    assert.deepEqual(strict.split?.assignments, [{ itemId: 1, supplierId: 2 }]);
    assert.equal(strict.split?.totals.grandTotalPence, 650);
    assert.deepEqual(
      strict.uncoverable.map((line) => line.itemId),
      [2],
    );
    assert.equal(strict.skippedOutOfStockCount, 2);
    // The uncoverable item neither blocks nor breaks the single-supplier plan.
    assert.equal(strict.singleSupplier?.assignments.length, 1);

    const relaxed = cheapestCombination(items, suppliers, quotes, { includeOutOfStock: true });
    assert.equal(relaxed.uncoverable.length, 0);
    assert.equal(relaxed.split?.totals.grandTotalPence, 500 + 900);
    assert.equal(relaxed.skippedOutOfStockCount, 0);
  });

  it('returns nothing to plan when no item is coverable or there are no suppliers', () => {
    const none = cheapestCombination([item(1)], [supplier(1, 'A')], []);
    assert.equal(none.split, null);
    assert.equal(none.singleSupplier, null);
    assert.equal(none.uncoverable.length, 1);
    const noSuppliers = cheapestCombination([item(1)], [], []);
    assert.equal(noSuppliers.split, null);
    const noItems = cheapestCombination([], [supplier(1, 'A')], []);
    assert.equal(noItems.split, null);
    assert.equal(noItems.exact, true);
  });

  it("respects a supplier's Click & Collect choice — delivery is £0 there", () => {
    const suppliers = [
      supplier(1, 'Cheap but far', { deliveryFeePence: 5000 }),
      supplier(2, 'Collect', { deliveryFeePence: 5000, fulfilmentChoice: 'collect' }),
    ];
    const result = cheapestCombination([item(1), item(2)], suppliers, [
      quote(1, 1, 1000),
      quote(1, 2, 1100),
      quote(2, 1, 1000),
      quote(2, 2, 1100),
    ]);
    // The collect supplier costs £1 more per row but no £50 fee.
    assert.equal(result.split?.totals.grandTotalPence, 2200);
    assert.equal(result.split?.totals.groups[0]?.delivery.status, 'collect');
    assert.equal(result.singleSupplier?.assignments[0]?.supplierId, 2);
  });

  it('prices pack-only quotes by whole packs', () => {
    // 25 needed: A sells packs of 10 @ £20 → 3 packs = £60; B sells each @ £2.50 = £62.50.
    const packQuote: CostingQuote = {
      itemId: 1,
      supplierId: 1,
      unitPricePence: null,
      packSize: 10,
      packPricePence: 2000,
      productUrl: null,
      inStock: true,
    };
    const result = cheapestCombination(
      [item(1, 25)],
      [supplier(1, 'A', { deliveryFeePence: 0 }), supplier(2, 'B', { deliveryFeePence: 0 })],
      [packQuote, quote(1, 2, 250)],
    );
    assert.equal(result.split?.totals.grandTotalPence, 6000);
    assert.equal(result.split?.totals.groups[0]?.lines[0]?.cost.packs, 3);
  });

  it('breaks ties toward fewer suppliers, then the earlier column', () => {
    const suppliers = [
      supplier(1, 'A', { deliveryFeePence: 0 }),
      supplier(2, 'B', { deliveryFeePence: 0 }),
    ];
    const result = cheapestCombination([item(1), item(2)], suppliers, [
      quote(1, 1, 500),
      quote(1, 2, 500),
      quote(2, 1, 700),
      quote(2, 2, 700),
    ]);
    assert.equal(result.split?.supplierCount, 1);
    assert.deepEqual(
      result.split?.assignments.map((a) => a.supplierId),
      [1, 1],
    );
  });

  it('is deterministic: the same matrix always gives the same plan', () => {
    const items = [item(1, 3), item(2, 7), item(3, 2)];
    const suppliers = [
      supplier(1, 'A', { freeDeliveryThresholdPence: 4000 }),
      supplier(2, 'B', { freeDeliveryThresholdPence: 3000 }),
      supplier(3, 'C'),
    ];
    const quotes = [
      quote(1, 1, 450),
      quote(1, 2, 470),
      quote(2, 2, 300),
      quote(2, 3, 290),
      quote(3, 1, 800),
      quote(3, 3, 700),
    ];
    const first = cheapestCombination(items, suppliers, quotes);
    const second = cheapestCombination(items, suppliers, quotes);
    assert.deepEqual(first, second);
  });

  it('flags an inexact answer when the node budget runs out, still returning a valid plan', () => {
    // Four suppliers with a threshold each over ten items: stage 2 has real work.
    const suppliers = [1, 2, 3, 4].map((id) =>
      supplier(id, `S${id}`, {
        deliveryFeePence: 700,
        freeDeliveryThresholdPence: 2500 + id * 100,
      }),
    );
    const items = Array.from({ length: 10 }, (_, i) => item(i + 1, 1 + (i % 3)));
    const quotes: CostingQuote[] = [];
    for (const it of items) {
      for (const s of suppliers)
        quotes.push(quote(it.itemId, s.supplierId, 300 + ((it.itemId * s.supplierId * 37) % 90)));
    }
    const starved = cheapestCombination(items, suppliers, quotes, { nodeBudget: 3 });
    const full = cheapestCombination(items, suppliers, quotes);
    assert.equal(starved.exact, false);
    assert.equal(full.exact, true);
    assert.equal(starved.split?.assignments.length, 10);
    assert.ok(
      (starved.split?.totals.grandTotalPence ?? 0) >= (full.split?.totals.grandTotalPence ?? 0),
    );
  });

  it('matches an exhaustive search on random matrices (the optimum is really optimal)', () => {
    let seed = 20261001;
    const next = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const pick = (n: number): number => Math.floor(next() * n);

    for (let trial = 0; trial < 150; trial += 1) {
      const supplierCount = 2 + pick(3); // 2–4
      const itemCount = 2 + pick(5); // 2–6
      const suppliers = Array.from({ length: supplierCount }, (_, i) =>
        supplier(i + 1, `S${i + 1}`, {
          deliveryFeePence: pick(4) * 500,
          freeDeliveryThresholdPence: pick(2) === 0 ? null : 1500 + pick(6) * 500,
          fulfilmentChoice: pick(8) === 0 ? 'collect' : 'delivery',
        }),
      );
      const items = Array.from({ length: itemCount }, (_, i) => item(i + 1, 1 + pick(4)));
      const quotes: CostingQuote[] = [];
      for (const it of items) {
        for (const s of suppliers) {
          if (pick(4) === 0) continue; // sparse
          quotes.push(quote(it.itemId, s.supplierId, 100 + pick(900), pick(6) !== 0));
        }
      }
      const result = cheapestCombination(items, suppliers, quotes);

      // Exhaustive: every item→supplier assignment over orderable quotes.
      const orderable = items
        .map((it) =>
          suppliers.filter((s) =>
            quotes.some(
              (q) => q.itemId === it.itemId && q.supplierId === s.supplierId && q.inStock,
            ),
          ),
        )
        .map((list, i) => ({ it: items[i] as CostingItem, list }))
        .filter((entry) => entry.list.length > 0);
      if (orderable.length === 0) {
        assert.equal(result.split, null);
        continue;
      }
      let bestTotal = Number.POSITIVE_INFINITY;
      const walk = (index: number, picks: number[]): void => {
        if (index === orderable.length) {
          const subtotal = new Map<number, number>();
          picks.forEach((supplierId, i) => {
            const entry = orderable[i] as (typeof orderable)[number];
            const q = quotes.find(
              (candidate) =>
                candidate.itemId === entry.it.itemId && candidate.supplierId === supplierId,
            ) as CostingQuote;
            const cost = lineCost(entry.it.quantity, q)?.lineCostPence ?? 0;
            subtotal.set(supplierId, (subtotal.get(supplierId) ?? 0) + cost);
          });
          let total = 0;
          for (const [supplierId, materials] of subtotal) {
            const rule = suppliers.find((s) => s.supplierId === supplierId) as CostingSupplier;
            total += materials + deliveryCost(materials, rule).deliveryPence;
          }
          bestTotal = Math.min(bestTotal, total);
          return;
        }
        for (const option of (orderable[index] as (typeof orderable)[number]).list) {
          walk(index + 1, [...picks, option.supplierId]);
        }
      };
      walk(0, []);
      assert.equal(
        result.split?.totals.grandTotalPence,
        bestTotal,
        `trial ${trial}: optimiser total differs from exhaustive search`,
      );
      assert.equal(result.exact, true);
      // A plan is never worse than the naive baseline or any single supplier.
      assert.ok(
        (result.split?.totals.grandTotalPence ?? 0) <=
          (result.cheapestPerItem?.totals.grandTotalPence ?? 0),
      );
      for (const option of result.singleSupplierOptions) {
        assert.ok((result.split?.totals.grandTotalPence ?? 0) <= option.grandTotalPence);
      }
    }
  });

  it('selectionMatchesPlan is true only when every planned item is picked at the plan supplier', () => {
    const suppliers = [supplier(1, 'A', { deliveryFeePence: 0 })];
    const quotes = [quote(1, 1, 100), quote(2, 1, 100)];
    const plan = cheapestCombination([item(1), item(2)], suppliers, quotes).split;
    assert.ok(plan);
    assert.equal(selectionMatchesPlan([item(1, 1, 1), item(2, 1, 1)], plan), true);
    assert.equal(selectionMatchesPlan([item(1, 1, 1), item(2, 1, null)], plan), false);
  });
});

async function fixture(): Promise<DbHandle> {
  const dir = await makeTempDir('sf-optimiser-');
  const handle = openDatabase(path.join(dir, 'optimiser.sqlite'));
  applyMigrations(handle.db);
  return handle;
}

describe('the optimiser against the Back Garden Fence demo (figure-exact)', () => {
  it('finds the £1,061.50 split and the £1,152.00 best single supplier', async () => {
    const handle = await fixture();
    const project = seedFenceDemoProject(handle.db, ACTOR, NOW);
    const computed = computeProjectOptimiser(handle.db, project.id);
    assert.ok(computed);
    const { result } = computed;

    // Jewson (in stock): posts 26750 + arris 16400 + featheredge 35400 + post mix 11900
    // = 90450 → free over £300. Gravel boards: Jewson's are out of stock, so the
    // Timber Yard's 10 × 1420 = 14200 + its £15.00 fee beats Wickes' 16000 + £10.00.
    // Total 90450 + 14200 + 1500 = 106150.
    assert.equal(result.split?.totals.grandTotalPence, 106150);
    assert.deepEqual(
      result.split?.totals.groups.map((group) => [
        group.supplier.name,
        group.materialsSubtotalPence,
        group.delivery.deliveryPence,
      ]),
      [
        ['Local Timber Yard', 14200, 1500],
        ['Jewson', 90450, 0],
      ],
    );
    assert.equal(result.exact, true);

    // Only Wickes stocks all five items in stock: 32000 + 19000 + 35400 + 16000 + 12800.
    assert.equal(result.singleSupplier?.totals.grandTotalPence, 115200);
    assert.equal(result.singleSupplier?.totals.groups[0]?.supplier.name, 'Wickes');
    assert.equal(result.singleSupplier?.totals.groups[0]?.delivery.status, 'free-threshold');
    assert.deepEqual(
      result.singleSupplierOptions.map((option) => option.name),
      ['Wickes'],
    );

    // Jewson's gravel quote is the one out-of-stock quote passed over.
    assert.equal(result.skippedOutOfStockCount, 1);
    assert.equal(result.uncoverable.length, 0);
  });

  it('shows the bar: manual £1,083.50 vs split £1,061.50 vs single £1,152.00', async () => {
    const handle = await fixture();
    const project = seedFenceDemoProject(handle.db, ACTOR, NOW);
    const view = getProjectWorkspaceView(handle.db, project.id);
    const bar = view?.optimiser;
    assert.ok(bar);
    assert.equal(bar.manual.grandTotalLabel, '£1,083.50');
    assert.equal(bar.split.grandTotalLabel, '£1,061.50');
    assert.equal(bar.split.supplierCountLabel, '2 suppliers');
    assert.ok(bar.split.notes.includes('£22.00 cheaper than your manual selection.'));
    assert.equal(bar.single.grandTotalLabel, '£1,152.00');
    assert.ok(
      bar.single.notes.some((note) =>
        note.startsWith('£90.50 more than the cheapest split, but one order from one supplier'),
      ),
    );
    assert.equal(bar.split.isCurrent, false);
    assert.ok(bar.caveats.some((caveat) => caveat.includes('1 out-of-stock quote was skipped')));
  });

  it('applies the split in one audited transaction, then reports it as current', async () => {
    const handle = await fixture();
    const project = seedFenceDemoProject(handle.db, ACTOR, NOW);
    const computed = computeProjectOptimiser(handle.db, project.id);
    const plan = planForKind(computed!.result, 'split');
    assert.ok(plan);

    const before = listProjectItems(handle.db, project.id);
    const auditBefore = handle.db.select().from(auditEntries).all().length;
    const later = new Date('2026-10-02T10:00:00Z');
    const applied = applyProjectSelections(handle.db, {
      projectId: project.id,
      plan: 'split',
      selections: plan.assignments,
      actor: ACTOR,
      now: later,
    });
    // Manual: posts+arris Jewson (same), featheredge Timber→Jewson, gravel Timber (same),
    // post mix Wickes→Jewson: two rows change.
    assert.equal(applied.changedItemIds.length, 2);

    const after = listProjectItems(handle.db, project.id);
    for (const row of after) {
      const was = before.find((candidate) => candidate.id === row.id)!;
      const changed = applied.changedItemIds.includes(row.id);
      assert.equal(row.version, was.version + (changed ? 1 : 0));
    }
    const audits = handle.db.select().from(auditEntries).all();
    assert.equal(audits.length, auditBefore + 1);
    const entry = audits[audits.length - 1]!;
    assert.equal(entry.action, 'project.apply-plan');
    assert.equal(entry.entity, 'project');
    assert.equal(entry.entityId, String(project.id));
    assert.match(entry.summary, /cheapest split/);
    assert.match(entry.summary, /2 items changed/);

    const view = getProjectWorkspaceView(handle.db, project.id);
    assert.equal(view?.totals.grandTotalLabel, '£1,061.50');
    assert.equal(view?.optimiser?.split.isCurrent, true);
    assert.equal(view?.optimiser?.manual.grandTotalLabel, '£1,061.50');

    // Re-applying is a no-op: no version bump, no audit entry.
    const again = applyProjectSelections(handle.db, {
      projectId: project.id,
      plan: 'split',
      selections: plan.assignments,
      actor: ACTOR,
      now: later,
    });
    assert.deepEqual(again.changedItemIds, []);
    assert.equal(handle.db.select().from(auditEntries).all().length, auditBefore + 1);
  });

  it('applies the single-supplier plan and refuses selections that break the rules', async () => {
    const handle = await fixture();
    const project = seedFenceDemoProject(handle.db, ACTOR, NOW);
    const computed = computeProjectOptimiser(handle.db, project.id);
    const single = planForKind(computed!.result, 'single-supplier');
    assert.ok(single);
    applyProjectSelections(handle.db, {
      projectId: project.id,
      plan: 'single-supplier',
      selections: single.assignments,
      actor: ACTOR,
      now: NOW,
    });
    const view = getProjectWorkspaceView(handle.db, project.id);
    assert.equal(view?.totals.grandTotalLabel, '£1,152.00');
    assert.equal(view?.optimiser?.single.isCurrent, true);
    assert.equal(view?.optimiser?.split.isCurrent, false);

    // No quote → refused, and nothing is half-applied.
    const items = listProjectItems(handle.db, project.id);
    const postMix = items.find((row) => row.name.startsWith('Post Mix'))!;
    const suppliers = computed!.result.split!.totals.groups.map((group) => group.supplier);
    const timberYard = suppliers.find((s) => s.name === 'Local Timber Yard')!;
    assert.throws(
      () =>
        applyProjectSelections(handle.db, {
          projectId: project.id,
          plan: 'split',
          selections: [{ itemId: postMix.id, supplierId: timberYard.supplierId }],
          actor: ACTOR,
        }),
      InvalidProjectInputError,
    );
    assert.throws(
      () =>
        applyProjectSelections(handle.db, {
          projectId: project.id,
          plan: 'split',
          selections: [
            { itemId: postMix.id, supplierId: timberYard.supplierId },
            { itemId: postMix.id, supplierId: timberYard.supplierId },
          ],
          actor: ACTOR,
        }),
      InvalidProjectInputError,
    );
  });

  it('only fills in mix-and-match projects and shows no bar for compare options', async () => {
    const handle = await fixture();
    const project = createProject(handle.db, {
      name: 'Pick a car',
      projectMode: 'compare_options',
      targetBudgetPence: null,
      status: 'researching',
      notes: null,
      actor: ACTOR,
      now: NOW,
    });
    const car = createProjectSupplier(handle.db, {
      projectId: project.id,
      name: 'Car A',
      phone: null,
      websiteUrl: null,
      notes: null,
      deliveryFeePence: 0,
      freeDeliveryThresholdPence: null,
      clickAndCollectAvailable: false,
      fulfilmentChoice: 'delivery',
      actor: ACTOR,
      now: NOW,
    });
    const price = createProjectItem(handle.db, {
      projectId: project.id,
      name: 'Purchase price',
      quantity: 1,
      unit: 'each',
      actor: ACTOR,
      now: NOW,
    });
    saveProjectQuote(handle.db, {
      projectId: project.id,
      itemId: price.id,
      supplierId: car.id,
      unitPricePence: 1500000,
      packSize: null,
      packPricePence: null,
      actor: ACTOR,
      now: NOW,
    });
    assert.equal(getProjectWorkspaceView(handle.db, project.id)?.optimiser, null);
    assert.throws(
      () =>
        applyProjectSelections(handle.db, {
          projectId: project.id,
          plan: 'split',
          selections: [{ itemId: price.id, supplierId: car.id }],
          actor: ACTOR,
        }),
      InvalidProjectInputError,
    );
    // Manual selection still works as before.
    selectProjectItemSupplier(handle.db, { itemId: price.id, supplierId: car.id, actor: ACTOR });
  });
});
