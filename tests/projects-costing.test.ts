import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addVatPence,
  budgetComparison,
  deliveryCost,
  hasUsablePricing,
  lineCost,
  orderBreakdown,
  requiredPacks,
  type CostingItem,
  type CostingQuote,
  type CostingSupplier,
} from '../src/lib/projects/costing';

/**
 * The pure costing module (PROJECTS_IMPLEMENTATION.MD §6): line costs with
 * pack rounding, per-supplier delivery evaluation (one fee per used supplier,
 * free-delivery thresholds, click &amp; collect, "£X away" shortfalls) and the
 * grouped order totals. Every figure here is exact integer pence.
 */

const RULE = {
  deliveryFeePence: 1500,
  freeDeliveryThresholdPence: 50000,
  clickAndCollectAvailable: true,
  fulfilmentChoice: 'delivery',
} as const;

function supplier(id: number, name: string, patch: Partial<CostingSupplier> = {}): CostingSupplier {
  return {
    supplierId: id,
    name,
    phone: null,
    websiteUrl: null,
    deliveryFeePence: RULE.deliveryFeePence,
    freeDeliveryThresholdPence: RULE.freeDeliveryThresholdPence,
    clickAndCollectAvailable: true,
    fulfilmentChoice: 'delivery',
    ...patch,
  };
}

function item(
  id: number,
  name: string,
  quantity: number,
  selectedSupplierId: number | null,
): CostingItem {
  return { itemId: id, name, quantity, unit: 'each', selectedSupplierId };
}

function quote(
  itemId: number,
  supplierId: number,
  unitPricePence: number | null,
  patch: Partial<CostingQuote> = {},
): CostingQuote {
  return {
    itemId,
    supplierId,
    unitPricePence,
    packSize: null,
    packPricePence: null,
    productUrl: null,
    inStock: true,
    ...patch,
  };
}

describe('requiredPacks', () => {
  it('rounds up to whole packs', () => {
    assert.equal(requiredPacks(1, 10), 1);
    assert.equal(requiredPacks(10, 10), 1);
    assert.equal(requiredPacks(11, 10), 2);
    assert.equal(requiredPacks(120, 10), 12);
    assert.equal(requiredPacks(99, 100), 1);
    assert.equal(requiredPacks(101, 1), 101);
  });

  it('rejects non-whole or non-positive inputs', () => {
    assert.throws(() => requiredPacks(0, 10), /whole quantity/);
    assert.throws(() => requiredPacks(10, 0), /whole packSize/);
    assert.throws(() => requiredPacks(1.5, 10), /whole quantity/);
  });
});

describe('lineCost', () => {
  it('multiplies whole units by the unit price', () => {
    assert.deepEqual(lineCost(10, { unitPricePence: 2850, packSize: null, packPricePence: null }), {
      kind: 'units',
      packs: null,
      lineCostPence: 28500,
    });
  });

  it('pack pricing wins and buys whole packs', () => {
    // 120 boards needed, packs of 10 at £29.50 → 12 packs = £354.00.
    assert.deepEqual(lineCost(120, { unitPricePence: null, packSize: 10, packPricePence: 2950 }), {
      kind: 'packs',
      packs: 12,
      lineCostPence: 35400,
    });
    // 101 of something sold in packs of 10 still buys 11 packs.
    assert.deepEqual(lineCost(101, { unitPricePence: 250, packSize: 10, packPricePence: 2400 }), {
      kind: 'packs',
      packs: 11,
      lineCostPence: 26400,
    });
  });

  it('returns null for a price-less quote', () => {
    assert.equal(
      lineCost(10, { unitPricePence: null, packSize: null, packPricePence: null }),
      null,
    );
  });

  it('zero is a valid unit price (a free sample line)', () => {
    assert.deepEqual(lineCost(3, { unitPricePence: 0, packSize: null, packPricePence: null }), {
      kind: 'units',
      packs: null,
      lineCostPence: 0,
    });
  });

  it('hasUsablePricing mirrors lineCost', () => {
    assert.equal(
      hasUsablePricing({ unitPricePence: 1, packSize: null, packPricePence: null }),
      true,
    );
    assert.equal(
      hasUsablePricing({ unitPricePence: null, packSize: 5, packPricePence: 500 }),
      true,
    );
    assert.equal(
      hasUsablePricing({ unitPricePence: null, packSize: null, packPricePence: null }),
      false,
    );
    assert.equal(
      hasUsablePricing({ unitPricePence: null, packSize: 5, packPricePence: null }),
      false,
    );
  });
});

describe('deliveryCost', () => {
  it('charges the flat fee once per used supplier below the threshold', () => {
    assert.deepEqual(deliveryCost(12800, RULE), {
      deliveryPence: 1500,
      status: 'charged',
      shortfallToFreeDeliveryPence: 50000 - 12800,
    });
  });

  it('waives the fee at or above the free-delivery threshold', () => {
    assert.deepEqual(deliveryCost(50000, RULE), {
      deliveryPence: 0,
      status: 'free-threshold',
      shortfallToFreeDeliveryPence: null,
    });
    assert.equal(deliveryCost(50001, RULE).status, 'free-threshold');
  });

  it('a threshold exactly one penny over the subtotal shows that penny as the shortfall', () => {
    const result = deliveryCost(49999, RULE);
    assert.equal(result.status, 'charged');
    assert.equal(result.shortfallToFreeDeliveryPence, 1);
  });

  it('collect forces £0 whatever the rules say', () => {
    assert.deepEqual(deliveryCost(0, { ...RULE, fulfilmentChoice: 'collect' }), {
      deliveryPence: 0,
      status: 'collect',
      shortfallToFreeDeliveryPence: null,
    });
  });

  it('a zero fee is free delivery, with no shortfall hint', () => {
    assert.deepEqual(deliveryCost(100, { ...RULE, deliveryFeePence: 0 }), {
      deliveryPence: 0,
      status: 'free',
      shortfallToFreeDeliveryPence: null,
    });
  });

  it('no threshold means no shortfall hint', () => {
    assert.deepEqual(deliveryCost(100, { ...RULE, freeDeliveryThresholdPence: null }), {
      deliveryPence: 1500,
      status: 'charged',
      shortfallToFreeDeliveryPence: null,
    });
  });

  it('rejects negative subtotals', () => {
    assert.throws(() => deliveryCost(-1, RULE), /non-negative/);
  });
});

describe('orderBreakdown', () => {
  it('groups selected lines by supplier and applies delivery once per used supplier', () => {
    const items = [item(1, 'Posts', 10, 1), item(2, 'Rails', 20, 1), item(3, 'Boards', 120, 2)];
    const suppliers = [supplier(1, 'Jewson'), supplier(2, 'Timber Yard')];
    const quotes = [quote(1, 1, 2675), quote(2, 1, 820), quote(3, 2, 310)];
    const totals = orderBreakdown(items, suppliers, quotes);

    assert.equal(totals.groups.length, 2);
    assert.equal(totals.selectedCount, 3);
    assert.equal(totals.unselected.length, 0);

    const jewson = totals.groups[0];
    assert.equal(jewson?.supplier.supplierId, 1);
    assert.equal(jewson?.materialsSubtotalPence, 26750 + 16400); // £431.50
    assert.equal(jewson?.delivery.status, 'charged'); // £431.50 is under the £500 threshold
    assert.equal(jewson?.delivery.deliveryPence, 1500);
    assert.equal(jewson?.supplierTotalPence, 43150 + 1500);

    const timber = totals.groups[1];
    assert.equal(timber?.materialsSubtotalPence, 37200);
    assert.equal(timber?.delivery.deliveryPence, 1500);

    assert.equal(totals.materialsTotalPence, 43150 + 37200);
    assert.equal(totals.deliveryTotalPence, 3000);
    assert.equal(totals.grandTotalPence, 43150 + 37200 + 3000);
  });

  it('a second item from the same supplier still pays one delivery fee', () => {
    const items = [item(1, 'A', 1, 1), item(2, 'B', 1, 1)];
    const totals = orderBreakdown(
      items,
      [supplier(1, 'One', { deliveryFeePence: 4500, freeDeliveryThresholdPence: null })],
      [quote(1, 1, 1000), quote(2, 1, 2000)],
    );
    assert.equal(totals.groups.length, 1);
    assert.equal(totals.groups[0]?.delivery.deliveryPence, 4500);
    assert.equal(totals.grandTotalPence, 1000 + 2000 + 4500);
  });

  it('unused suppliers get no group and no fee', () => {
    const totals = orderBreakdown(
      [item(1, 'A', 1, 1)],
      [supplier(1, 'Used'), supplier(2, 'Not used')],
      [quote(1, 1, 500), quote(1, 2, 400)],
    );
    assert.equal(totals.groups.length, 1);
    assert.equal(totals.groups[0]?.supplier.supplierId, 1);
    assert.equal(totals.deliveryTotalPence, 1500);
  });

  it('unselected rows (and selections with no quote) stay uncounted', () => {
    const totals = orderBreakdown(
      [item(1, 'Chosen', 1, 1), item(2, 'No pick', 1, null), item(3, 'Stale pick', 1, 2)],
      [supplier(1, 'One'), supplier(2, 'Two')],
      [quote(1, 1, 1000), quote(3, 1, 500)],
    );
    assert.equal(totals.selectedCount, 1);
    assert.deepEqual(
      totals.unselected.map((row) => row.itemName),
      ['No pick', 'Stale pick'],
    );
    assert.equal(totals.grandTotalPence, 1000 + 1500);
  });

  it('pack quotes cost whole packs in the breakdown', () => {
    const totals = orderBreakdown(
      [item(1, 'Boards', 120, 1)],
      [supplier(1, 'Wickes', { deliveryFeePence: 1000, freeDeliveryThresholdPence: 25000 })],
      [
        {
          ...quote(1, 1, null),
          packSize: 10,
          packPricePence: 2950,
        },
      ],
    );
    const line = totals.groups[0]?.lines[0];
    assert.equal(line?.cost.kind, 'packs');
    assert.equal(line?.cost.packs, 12);
    assert.equal(line?.lineCostPence, 35400);
  });
});

describe('budgetComparison', () => {
  it('reports under, on and over against the target', () => {
    assert.deepEqual(budgetComparison(120000, 108350), {
      state: 'under',
      deltaPence: -11650,
    });
    assert.deepEqual(budgetComparison(120000, 120000), { state: 'on', deltaPence: 0 });
    assert.deepEqual(budgetComparison(120000, 130000), { state: 'over', deltaPence: 10000 });
  });

  it('a missing budget is state none', () => {
    assert.deepEqual(budgetComparison(null, 1), { state: 'none', deltaPence: null });
  });
});

describe('addVatPence (the +20% typing helper)', () => {
  it('adds 20% with exact integer maths', () => {
    assert.equal(addVatPence(1000), 1200); // £10.00 → £12.00
    assert.equal(addVatPence(2850), 3420); // £28.50 → £34.20
    assert.equal(addVatPence(0), 0);
    assert.equal(addVatPence(1), 1); // 1.2p rounds half-up to 1p
    assert.equal(addVatPence(5), 6); // 6p exactly
    assert.equal(addVatPence(123), 148); // 147.6p rounds half-up to 148p
  });

  it('rejects negative or fractional pence', () => {
    assert.throws(() => addVatPence(-1), /non-negative/);
    assert.throws(() => addVatPence(1.5), /whole pence/);
  });
});
