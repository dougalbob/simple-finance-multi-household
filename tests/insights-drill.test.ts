import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  drillKey,
  drillMonth,
  drillPerson,
  drillVehicle,
  parseDrillKey,
  vehicleDrillWindow,
  type InsightLine,
} from '../src/lib/records/insights-drill';
import { vehicleRunningCosts, type SpendingLineInput } from '../src/lib/records/insights';

/**
 * The inline line-item drill-down (decision 197): every figure on Insights
 * opens the transactions it is made of. Pure tests — the key round-trips the
 * URL depends on, and the rows/total reconciling with the very figures they
 * drill into (including the annual ÷ 12 vehicle spread, decision 190).
 */

function line(
  partial: Partial<InsightLine> & Pick<InsightLine, 'occurredDate' | 'amountPence'>,
): InsightLine {
  return {
    categoryId: 1,
    parentId: 10,
    parentName: 'Groceries',
    childName: 'Weekly Shop',
    targetKind: 'household',
    targetId: null,
    purchaseId: 100,
    supplierName: 'Greenfield Market',
    note: 'Weekly shop',
    ...partial,
  };
}

describe('insights drill: the show= key', () => {
  it('round-trips every selection shape', () => {
    const selections = [
      { kind: 'month', month: '2026-10', parentId: null },
      { kind: 'month', month: '2026-10', parentId: 4 },
      { kind: 'person', personId: 3, month: '2026-09', parentId: null },
      { kind: 'person', personId: 3, month: '2026-09', parentId: 12 },
      { kind: 'vehicle', vehicleId: 2, window: 'month', childCategoryId: null },
      { kind: 'vehicle', vehicleId: 2, window: 'previous', childCategoryId: null },
      { kind: 'vehicle', vehicleId: 2, window: 'rolling', childCategoryId: null },
      { kind: 'vehicle', vehicleId: 2, window: 'rolling', childCategoryId: 15 },
    ] as const;
    for (const selection of selections) {
      assert.deepEqual(parseDrillKey(drillKey(selection)), selection, drillKey(selection));
    }
  });

  it('rejects anything that is not a selection', () => {
    for (const raw of [
      undefined,
      null,
      '',
      'x:2026-10',
      'm:2026-13',
      'm:26-10',
      'm:2026-10:abc',
      'p:0:2026-10',
      'p:3',
      'p:3:2026-10:xyz',
      'v:2:someday',
      'v:2:rolling:0',
      'v:-1:month',
    ]) {
      assert.equal(parseDrillKey(raw as string | null | undefined), null, String(raw));
    }
  });
});

describe('insights drill: month and person rows are cash-basis', () => {
  const lines: InsightLine[] = [
    line({ occurredDate: '2026-10-03', amountPence: 5820, purchaseId: 1 }),
    line({ occurredDate: '2026-10-11', amountPence: 2149, purchaseId: 2, childName: 'Treats' }),
    // A refund in the same category: it nets off but still has its own row.
    line({ occurredDate: '2026-10-12', amountPence: -500, purchaseId: 3 }),
    // Last month and next door's category: not this figure's business.
    line({ occurredDate: '2026-09-30', amountPence: 4000, purchaseId: 4 }),
    line({
      occurredDate: '2026-10-05',
      amountPence: 999,
      purchaseId: 5,
      parentId: 11,
      parentName: 'Personal',
      childName: 'Clothing',
      targetKind: 'person',
      targetId: 7,
    }),
    line({
      occurredDate: '2026-10-06',
      amountPence: 333,
      purchaseId: 6,
      parentId: 11,
      parentName: 'Personal',
      childName: 'Clothing',
      targetKind: 'person',
      targetId: 8,
    }),
  ];

  it('drills a category-month figure, and the rows sum to it', () => {
    const table = drillMonth(lines, '2026-10', 10);
    assert.equal(table.rows.length, 3);
    assert.equal(table.totalPence, 5820 + 2149 - 500);
    assert.equal(table.purchaseCount, 3);
    assert.equal(table.hasSpreadRows, false);
    // Newest payment first.
    assert.deepEqual(
      table.rows.map((row) => row.purchaseId),
      [3, 2, 1],
    );
    assert.equal(table.rows[0]?.countedPence, -500);
  });

  it('drills the whole month when no category is given', () => {
    const table = drillMonth(lines, '2026-10', null);
    assert.equal(table.rows.length, 5);
    assert.equal(table.totalPence, 5820 + 2149 - 500 + 999 + 333);
  });

  it('drills a person figure to that person alone', () => {
    const table = drillPerson(lines, '2026-10', 7, null);
    assert.equal(table.rows.length, 1);
    assert.equal(table.totalPence, 999);
    assert.equal(table.rows[0]?.purchaseId, 5);
    const scoped = drillPerson(lines, '2026-10', 7, 11);
    assert.equal(scoped.totalPence, 999);
    const other = drillPerson(lines, '2026-10', 8, 11);
    assert.equal(other.totalPence, 333);
    // Nothing in September for this person — an honest empty table.
    assert.equal(drillPerson(lines, '2026-09', 7, null).rows.length, 0);
  });
});

describe('insights drill: vehicle rows count ÷ 12 shares (decision 190)', () => {
  const premium: InsightLine = line({
    occurredDate: '2026-08-24',
    amountPence: 60000,
    purchaseId: 50,
    categoryId: 2,
    parentId: 20,
    parentName: 'Vehicle Running',
    childName: 'Insurance',
    targetKind: 'vehicle',
    targetId: 1,
    supplierName: 'Playwright Insurer',
    coversMonths: 12,
  });
  const fuel: InsightLine = line({
    occurredDate: '2026-09-05',
    amountPence: 5820,
    purchaseId: 51,
    categoryId: 3,
    parentId: 20,
    parentName: 'Vehicle Running',
    childName: 'Fuel',
    targetKind: 'vehicle',
    targetId: 1,
    supplierName: 'Filling Station',
    coversMonths: 1,
  });
  const otherVehicle: InsightLine = line({
    occurredDate: '2026-09-06',
    amountPence: 4500,
    purchaseId: 52,
    categoryId: 3,
    parentId: 20,
    parentName: 'Vehicle Running',
    childName: 'Fuel',
    targetKind: 'vehicle',
    targetId: 2,
    coversMonths: 1,
  });
  const lines: InsightLine[] = [premium, fuel, otherVehicle];
  const today = '2026-09-20';

  it('the month figure shows this month’s shares, and they sum to the engine’s total', () => {
    const table = drillVehicle(lines, 1, 'month', null, today);
    // September: the fuel purchase and the premium's September share.
    assert.equal(table.rows.length, 2);
    const share = table.rows.find((row) => row.purchaseId === 50);
    assert.equal(share?.countedPence, 5000); // £600.00 ÷ 12
    assert.equal(share?.paidPence, 60000);
    assert.equal(share?.spread, true);
    assert.equal(table.hasSpreadRows, true);
    assert.equal(table.totalPence, 5820 + 5000);

    // Reconciliation: the pure engine's figure for the same window.
    const [costs] = vehicleRunningCosts(
      lines as readonly SpendingLineInput[],
      [{ id: 1, label: 'Vehicle A' }],
      today,
    );
    assert.equal(costs?.monthPence, table.totalPence);
  });

  it('the rolling figure counts only the shares inside the window', () => {
    const table = drillVehicle(lines, 1, 'rolling', null, today);
    // Premium paid 24 Aug: Aug and Sep shares are in the window (2 × £50).
    const share = table.rows.find((row) => row.purchaseId === 50);
    assert.equal(share?.countedPence, 10000);
    assert.equal(share?.paidPence, 60000);
    assert.equal(table.totalPence, 5820 + 10000);

    const [costs] = vehicleRunningCosts(
      lines as readonly SpendingLineInput[],
      [{ id: 1, label: 'Vehicle A' }],
      today,
    );
    assert.equal(costs?.rolling12Pence, table.totalPence);
  });

  it('narrows to one child category, and to one vehicle', () => {
    const fuelOnly = drillVehicle(lines, 1, 'rolling', 3, today);
    assert.equal(fuelOnly.rows.length, 1);
    assert.equal(fuelOnly.totalPence, 5820);
    const vehicleTwo = drillVehicle(lines, 2, 'rolling', null, today);
    assert.equal(vehicleTwo.totalPence, 4500);
    const previous = drillVehicle(lines, 1, 'previous', null, today);
    assert.equal(previous.rows.length, 1); // the premium’s August share
    assert.equal(previous.totalPence, 5000);
  });

  it('a cash payment outside the window is not a row', () => {
    const old = line({
      occurredDate: '2026-07-15',
      amountPence: 2500,
      purchaseId: 53,
      categoryId: 3,
      parentId: 20,
      parentName: 'Vehicle Running',
      childName: 'Fuel',
      targetKind: 'vehicle',
      targetId: 1,
      coversMonths: 1,
    });
    // July is inside the rolling 12-month window but not inside September:
    // the month drill shows the month's own rows only.
    const table = drillVehicle([old, ...lines], 1, 'month', null, today);
    assert.equal(table.rows.length, 2); // the share and the fuel — no July payment
    assert.equal(table.totalPence, 5820 + 5000);
  });

  it('the window bounds match the figures’ own windows', () => {
    assert.deepEqual(vehicleDrillWindow('month', today), {
      from: '2026-09-01',
      to: '2026-09-30',
    });
    assert.deepEqual(vehicleDrillWindow('previous', today), {
      from: '2026-08-01',
      to: '2026-08-31',
    });
    assert.deepEqual(vehicleDrillWindow('rolling', today), {
      from: '2025-10-01',
      to: '2026-09-20',
    });
  });
});
