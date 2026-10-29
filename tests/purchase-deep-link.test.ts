import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseOpenRecordId } from '../src/lib/records/in-place-activity';
import {
  createPurchase,
  createRefund,
  editPurchase,
  listPurchases,
  sumListedPurchasesPence,
  voidPurchase,
} from '../src/lib/records/purchases';
import { createHouseholdFixture } from './household';

const actor = 'alex@example.com';
const now = new Date('2026-09-20T17:00:00Z');

describe('a supplier purchase deep link (issue #120)', () => {
  it('finds the exact older record before the row cap, even with same-day purchases', async () => {
    const fx = await createHouseholdFixture(actor, now);
    try {
      const categoryId = fx.categoryId('Groceries', 'Weekly Shop');
      const common = {
        potId: fx.pots.main.id,
        supplierName: 'Example Market',
        occurredDate: '2026-01-15',
        actor,
        now,
      };
      const older = createPurchase(fx.db, {
        ...common,
        totalPence: 5000,
        note: 'Original receipt',
        lines: [
          { amountPence: 3000, categoryId, targetKind: 'household' },
          { amountPence: 2000, categoryId, targetKind: 'person', targetId: fx.people.sam.id },
        ],
      });
      const newer = createPurchase(fx.db, {
        ...common,
        totalPence: 7000,
        lines: [{ amountPence: 7000, categoryId, targetKind: 'household' }],
      });

      assert.equal(listPurchases(fx.db, { limit: 1 })[0]?.purchase.id, newer.purchase.id);
      const focused = listPurchases(fx.db, { purchaseId: older.purchase.id, limit: 1 });
      assert.equal(focused.length, 1);
      assert.equal(focused[0]?.purchase.id, older.purchase.id);
      assert.equal(focused[0]?.purchase.note, 'Original receipt');
      assert.equal(focused[0]?.allocations.length, 2, 'the whole split receipt is retained');
      assert.equal(sumListedPurchasesPence(focused), 5000);

      // The exact ID composes with the ordinary page filters; clearing the
      // purchase chip is what broadens the view, not a hidden date heuristic.
      assert.equal(
        listPurchases(fx.db, { purchaseId: older.purchase.id, search: 'original receipt' }).length,
        1,
      );
      assert.equal(
        listPurchases(fx.db, { purchaseId: older.purchase.id, search: 'missing' }).length,
        0,
      );
      assert.equal(
        listPurchases(fx.db, { purchaseId: older.purchase.id, potId: fx.pots.salary.id }).length,
        0,
      );
      assert.deepEqual(listPurchases(fx.db, { purchaseId: 999999 }), []);

      editPurchase(fx.db, {
        id: older.purchase.id,
        expectedVersion: older.purchase.version,
        actor,
        now,
        patch: { occurredDate: '2026-02-16' },
      });
      assert.equal(
        listPurchases(fx.db, { purchaseId: older.purchase.id })[0]?.purchase.occurredDate,
        '2026-02-16',
      );
    } finally {
      fx.close();
    }
  });

  it('can show a refund or a subsequently voided record without changing its accounting', async () => {
    const fx = await createHouseholdFixture(actor, now);
    try {
      const categoryId = fx.categoryId('Groceries', 'Weekly Shop');
      const original = createPurchase(fx.db, {
        potId: fx.pots.main.id,
        supplierName: 'Example Market',
        totalPence: 5000,
        lines: [{ amountPence: 5000, categoryId, targetKind: 'household' }],
        actor,
        now,
      });
      const refund = createRefund(fx.db, {
        refundOfPurchaseId: original.purchase.id,
        totalPence: -1000,
        lines: [{ amountPence: -1000, categoryId, targetKind: 'household' }],
        actor,
        now,
      });
      const focusedRefund = listPurchases(fx.db, {
        purchaseId: refund.purchase.id,
        includeVoided: true,
      });
      assert.equal(focusedRefund[0]?.purchase.refundOfPurchaseId, original.purchase.id);
      assert.equal(sumListedPurchasesPence(focusedRefund), -1000);
      assert.equal(
        listPurchases(fx.db, { purchaseId: refund.purchase.id, excludeRefunds: true }).length,
        0,
      );

      voidPurchase(fx.db, {
        id: refund.purchase.id,
        expectedVersion: 1,
        actor,
        now,
        reason: 'Duplicate',
      });
      assert.deepEqual(listPurchases(fx.db, { purchaseId: refund.purchase.id }), []);
      const voided = listPurchases(fx.db, { purchaseId: refund.purchase.id, includeVoided: true });
      assert.equal(voided[0]?.purchase.voidReason, 'Duplicate');
      assert.equal(sumListedPurchasesPence(voided), 0);
    } finally {
      fx.close();
    }
  });

  it('uses only the requested household database and safely ignores malformed IDs', async () => {
    const first = await createHouseholdFixture(actor, now);
    const second = await createHouseholdFixture('sam@example.com', now);
    try {
      const categoryId = first.categoryId('Groceries', 'Weekly Shop');
      const purchase = createPurchase(first.db, {
        potId: first.pots.main.id,
        totalPence: 500,
        lines: [{ amountPence: 500, categoryId, targetKind: 'household' }],
        actor,
        now,
      });
      assert.equal(listPurchases(first.db, { purchaseId: purchase.purchase.id }).length, 1);
      assert.deepEqual(listPurchases(second.db, { purchaseId: purchase.purchase.id }), []);
      for (const value of ['', '0', '-1', '1.5', '1e3', 'abc', '9999999999999999']) {
        assert.equal(parseOpenRecordId(value), null);
      }
      assert.equal(parseOpenRecordId(['2', '3']), 3);
    } finally {
      first.close();
      second.close();
    }
  });
});
