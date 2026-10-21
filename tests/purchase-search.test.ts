import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  normalizePurchaseSearch,
  purchaseMatchesSearch,
  PURCHASE_SEARCH_MAX_LENGTH,
} from '../src/lib/records/purchase-search';
import { createPurchase, listPurchases } from '../src/lib/records/purchases';
import { createSupplier } from '../src/lib/records/suppliers';
import { createHouseholdFixture } from './household';

/**
 * The Purchases search (the follow-up to GitHub issue #98): one box in place
 * of the Supplier and Category drop-downs, reading the supplier column (with
 * the optional bank payee), every allocation line's `Parent / Child` label and
 * the notes together. The matching rules are pure, so they are pinned here;
 * the projection half proves the search runs before the row cap.
 */
describe('Purchases search — supplier, category and notes (issue #98 follow-up)', () => {
  const weeklyShop = {
    supplierName: 'Tesco',
    paidVia: null,
    categoryLabels: ['Groceries / Weekly Shop', 'Personal / Clothing & Shoes'],
    note: 'Mixed receipt',
  };

  it('matches everything when nothing is typed', () => {
    assert.equal(purchaseMatchesSearch(weeklyShop, ''), true);
    assert.equal(purchaseMatchesSearch(weeklyShop, '   '), true);
    assert.equal(normalizePurchaseSearch('  Corner   Foods '), 'corner foods');
  });

  it('finds a supplier, case-insensitively and on any part of the name', () => {
    assert.equal(purchaseMatchesSearch(weeklyShop, 'tesco'), true);
    assert.equal(purchaseMatchesSearch(weeklyShop, 'TESCO'), true);
    assert.equal(purchaseMatchesSearch(weeklyShop, 'sainsbury'), false);
  });

  it('finds any category on the record — parent or child, first line or later', () => {
    assert.equal(purchaseMatchesSearch(weeklyShop, 'groceries'), true);
    assert.equal(purchaseMatchesSearch(weeklyShop, 'weekly shop'), true);
    // The second line of a split purchase is searched too.
    assert.equal(purchaseMatchesSearch(weeklyShop, 'clothing'), true);
    assert.equal(purchaseMatchesSearch(weeklyShop, 'shoes'), true);
    assert.equal(purchaseMatchesSearch(weeklyShop, 'fuel'), false);
  });

  it('finds the notes', () => {
    assert.equal(purchaseMatchesSearch(weeklyShop, 'mixed'), true);
    assert.equal(purchaseMatchesSearch(weeklyShop, 'receipt'), true);
  });

  it('reads the three columns together: every word somewhere, in any order', () => {
    assert.equal(purchaseMatchesSearch(weeklyShop, 'tesco groceries mixed'), true);
    assert.equal(purchaseMatchesSearch(weeklyShop, 'mixed tesco'), true);
    // A word in none of the three is still a miss.
    assert.equal(purchaseMatchesSearch(weeklyShop, 'tesco mixed 63'), false);
  });

  it('finds a record by its bank payee, printed beside the supplier', () => {
    const paidVia = { ...weeklyShop, paidVia: 'James' };
    assert.equal(purchaseMatchesSearch(paidVia, 'james'), true);
    assert.equal(purchaseMatchesSearch({ ...weeklyShop, paidVia: null }, 'james'), false);
  });

  it('caps an over-long query at the same prefix the page sends', () => {
    const long = 'a'.repeat(PURCHASE_SEARCH_MAX_LENGTH + 20);
    assert.equal(normalizePurchaseSearch(long).length, PURCHASE_SEARCH_MAX_LENGTH);
  });
});

describe('Purchases search in the projection (issue #98 follow-up)', () => {
  it('filters the history by supplier, category and notes before the row cap', async () => {
    const fx = await createHouseholdFixture();
    try {
      const groceries = fx.categoryId('Groceries', 'Weekly Shop');
      const fuel = fx.categoryId('Vehicle Running', 'Fuel');
      const cornerFoods = createSupplier(fx.db, {
        name: 'Corner Foods',
        actor: 'alex@example.com',
      });
      const at = (date: string) => new Date(`${date}T12:00:00Z`);

      createPurchase(fx.db, {
        supplierName: 'Tesco',
        potId: fx.pots.main.id,
        totalPence: 6347,
        occurredDate: '2026-09-27',
        note: 'Mixed receipt',
        lines: [
          { amountPence: 4198, categoryId: groceries, targetKind: 'household' },
          { amountPence: 2149, categoryId: fuel, targetKind: 'household' },
        ],
        actor: 'alex@example.com',
        now: at('2026-09-27'),
      });
      createPurchase(fx.db, {
        supplierId: cornerFoods.id,
        potId: fx.pots.main.id,
        totalPence: 1200,
        occurredDate: '2026-09-21',
        note: 'Top up',
        lines: [{ amountPence: 1200, categoryId: groceries, targetKind: 'household' }],
        actor: 'alex@example.com',
        now: at('2026-09-21'),
      });

      const supplier = listPurchases(fx.db, { search: 'corner' });
      assert.deepEqual(
        supplier.map(({ purchase }) => purchase.totalPence),
        [1200],
      );
      // The category matches either purchase, through either one of a
      // split's lines — the whole record comes back receipt-style.
      assert.equal(listPurchases(fx.db, { search: 'fuel' }).length, 1);
      assert.equal(listPurchases(fx.db, { search: 'groceries' }).length, 2);
      assert.equal(listPurchases(fx.db, { search: 'top up' }).length, 1);
      assert.equal(listPurchases(fx.db, { search: 'nothing here' }).length, 0);

      // Two words from two different columns still find the record.
      assert.deepEqual(
        listPurchases(fx.db, { search: 'tesco fuel' }).map(({ purchase }) => purchase.totalPence),
        [6347],
      );

      // The cap applies to the matches: a one-row page finds the older
      // purchase the newest-row page would have hidden.
      const capped = listPurchases(fx.db, { search: 'corner', limit: 1 });
      assert.deepEqual(
        capped.map(({ purchase }) => purchase.totalPence),
        [1200],
      );
    } finally {
      fx.close();
    }
  });
});
