import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  householdSliceKey,
  mixSliceKey,
  spendingMix,
  type MixLine,
  type MixOptions,
} from '../src/lib/records/spending-mix';

/**
 * The pie's arithmetic (SPEC §16.7 E), with no database: parent roll-up,
 * the per-person split of Personal, refunds netting off, zero and negative
 * slices staying honest, and the window and category filters.
 */

const GROCERIES = 3;
const PERSONAL = 6;
const ENTERTAINMENT = 7;
const VEHICLE = 5;
const ALEX = 1;
const SAM = 2;

let nextPurchase = 1;
function line(
  occurredDate: string,
  parentId: number,
  parentName: string,
  amountPence: number,
  target: { kind: 'household' | 'person' | 'vehicle'; id?: number | null } = { kind: 'household' },
  extra: { supplierName?: string | null; note?: string | null } = {},
): MixLine {
  return {
    occurredDate,
    categoryId: parentId * 10 + 1,
    parentId,
    parentName,
    childName: 'Child',
    targetKind: target.kind,
    targetId: target.id ?? null,
    amountPence,
    purchaseId: nextPurchase++,
    supplierName: extra.supplierName ?? null,
    note: extra.note ?? null,
  };
}

const PEOPLE = [
  { id: ALEX, label: 'Alex' },
  { id: SAM, label: 'Sam' },
];
const SPLIT = [{ id: PERSONAL, name: 'Personal' }];

function options(overrides: Partial<MixOptions> = {}): MixOptions {
  return {
    from: '2026-09-27',
    to: '2026-10-26',
    includedParentIds: null,
    people: PEOPLE,
    splitParents: SPLIT,
    ...overrides,
  };
}

const LINES: MixLine[] = [
  line(
    '2026-09-28',
    GROCERIES,
    'Groceries',
    8000,
    { kind: 'household' },
    { supplierName: 'Tesco' },
  ),
  line('2026-10-02', GROCERIES, 'Groceries', 2000, { kind: 'household' }, { supplierName: 'Aldi' }),
  line('2026-10-03', GROCERIES, 'Groceries', -500, { kind: 'household' }, { note: 'Returned' }),
  line('2026-10-04', VEHICLE, 'Vehicle Running', 4000, { kind: 'vehicle', id: 1 }),
  line(
    '2026-10-05',
    PERSONAL,
    'Personal',
    3000,
    { kind: 'person', id: ALEX },
    { supplierName: 'Hillside' },
  ),
  line('2026-10-06', PERSONAL, 'Personal', 1500, { kind: 'person', id: SAM }),
  line('2026-10-07', PERSONAL, 'Personal', 900, { kind: 'household' }, { note: 'Joint takeaway' }),
  line('2026-10-08', ENTERTAINMENT, 'Entertainment & Eating Out', 1200, { kind: 'household' }),
  // Outside the window: ignored by every figure.
  line('2026-09-26', GROCERIES, 'Groceries', 99999, { kind: 'household' }),
  line('2026-10-27', GROCERIES, 'Groceries', 99999, { kind: 'household' }),
];

describe('spendingMix: the parent roll-up', () => {
  it('nets refunds into their category and totals every counted line', () => {
    const mix = spendingMix(LINES, options());
    const groceries = mix.slices.find((slice) => slice.key === String(GROCERIES));
    assert.equal(groceries?.amountPence, 9500); // 8000 + 2000 − 500
    // Net total = groceries 9500 + vehicle 4000 + personal 3000+1500+900 + entertainment 1200
    assert.equal(mix.totalPence, 9500 + 4000 + 5400 + 1200);
  });

  it('draws shares that add up to the drawn total', () => {
    const mix = spendingMix(LINES, options());
    const drawn = mix.slices.filter((slice) => slice.drawn);
    assert.equal(
      drawn.reduce((sum, slice) => sum + slice.amountPence, 0),
      mix.drawnTotalPence,
    );
    const shareSum = drawn.reduce((sum, slice) => sum + slice.share, 0);
    assert.ok(Math.abs(shareSum - 1) < 1e-9, `shares sum to ${shareSum}`);
  });

  it('lists drawn slices largest first', () => {
    const mix = spendingMix(LINES, options());
    const amounts = mix.slices.filter((slice) => slice.drawn).map((slice) => slice.amountPence);
    assert.deepEqual(
      amounts,
      [...amounts].sort((a, b) => b - a),
    );
  });

  it('ignores lines outside the window on both edges', () => {
    const mix = spendingMix(LINES, options());
    const allLines = mix.slices.flatMap((slice) => slice.lines);
    assert.ok(allLines.every((entry) => entry.occurredDate >= '2026-09-27'));
    assert.ok(allLines.every((entry) => entry.occurredDate <= '2026-10-26'));
  });
});

describe('spendingMix: Personal is split per person', () => {
  it('gives each person their own slice, named for them', () => {
    const mix = spendingMix(LINES, options());
    const alex = mix.slices.find((slice) => slice.key === mixSliceKey(PERSONAL, ALEX));
    const sam = mix.slices.find((slice) => slice.key === mixSliceKey(PERSONAL, SAM));
    assert.equal(alex?.label, 'Personal — Alex');
    assert.equal(alex?.amountPence, 3000);
    assert.equal(alex?.kind, 'person');
    assert.equal(sam?.label, 'Personal — Sam');
    assert.equal(sam?.amountPence, 1500);
  });

  it('keeps household-marked personal spending apart, never split between people', () => {
    const mix = spendingMix(LINES, options());
    const household = mix.slices.find((slice) => slice.key === householdSliceKey(PERSONAL));
    assert.equal(household?.label, 'Personal — household');
    assert.equal(household?.amountPence, 900);
    assert.equal(household?.kind, 'household');
    assert.equal(household?.lines[0]?.note, 'Joint takeaway');
  });

  it('leaves unsplit parents as one slice even when their lines name a person', () => {
    const mix = spendingMix(
      [line('2026-10-05', GROCERIES, 'Groceries', 1000, { kind: 'person', id: ALEX })],
      options(),
    );
    const groceries = mix.slices.filter((slice) => slice.parentId === GROCERIES);
    assert.equal(groceries.length, 1);
    assert.equal(groceries[0]?.kind, 'category');
  });

  it('shows an honest £0.00 row for each person in a split parent with no spending', () => {
    const mix = spendingMix(
      [line('2026-10-05', PERSONAL, 'Personal', 3000, { kind: 'person', id: ALEX })],
      options(),
    );
    const sam = mix.slices.find((slice) => slice.key === mixSliceKey(PERSONAL, SAM));
    assert.ok(sam, 'Sam still has a row');
    assert.equal(sam?.amountPence, 0);
    assert.equal(sam?.drawn, false);
  });

  it('shows the zero rows even when Personal has no lines at all in the window', () => {
    const mix = spendingMix([], options());
    assert.deepEqual(mix.slices.map((slice) => slice.label).sort(), [
      'Personal — Alex',
      'Personal — Sam',
    ]);
    assert.equal(mix.drawnTotalPence, 0);
  });
});

describe('spendingMix: honest drawing', () => {
  it('does not draw a category that nets to zero or below, but keeps it in the table', () => {
    const mix = spendingMix(
      [
        line('2026-10-02', GROCERIES, 'Groceries', 5000, { kind: 'household' }),
        line('2026-10-03', VEHICLE, 'Vehicle Running', -2000, { kind: 'vehicle', id: 1 }),
      ],
      options(),
    );
    const vehicle = mix.slices.find((slice) => slice.parentId === VEHICLE);
    assert.equal(vehicle?.amountPence, -2000);
    assert.equal(vehicle?.drawn, false);
    assert.equal(vehicle?.share, 0);
    assert.equal(mix.drawnTotalPence, 5000);
    assert.equal(mix.totalPence, 3000, 'the total still nets the refund off');
  });

  it('sorts undrawn slices after the drawn ones', () => {
    const mix = spendingMix(
      [
        line('2026-10-02', VEHICLE, 'Vehicle Running', -100, { kind: 'vehicle', id: 1 }),
        line('2026-10-03', GROCERIES, 'Groceries', 100, { kind: 'household' }),
      ],
      options(),
    );
    assert.equal(mix.slices[0]?.drawn, true);
    assert.equal(mix.slices[mix.slices.length - 1]?.drawn, false);
  });

  it('draws nothing from an empty window', () => {
    const mix = spendingMix([], options());
    assert.equal(mix.drawnTotalPence, 0);
    assert.ok(mix.slices.every((slice) => slice.share === 0));
  });
});

describe('spendingMix: the category selector', () => {
  it('counts only the parents ticked, and the total follows them', () => {
    const mix = spendingMix(LINES, options({ includedParentIds: new Set([GROCERIES]) }));
    assert.deepEqual(
      mix.slices.map((slice) => slice.parentId),
      [GROCERIES],
    );
    assert.equal(mix.totalPence, 9500);
  });

  it('keeps Personal’s person rows when Personal is ticked and drops them when it is not', () => {
    const ticked = spendingMix(LINES, options({ includedParentIds: new Set([PERSONAL]) }));
    assert.equal(ticked.slices.filter((slice) => slice.parentId === PERSONAL).length, 3);
    const unticked = spendingMix(LINES, options({ includedParentIds: new Set([GROCERIES]) }));
    assert.equal(unticked.slices.filter((slice) => slice.parentId === PERSONAL).length, 0);
  });

  it('counts nothing when no category is ticked', () => {
    const mix = spendingMix(LINES, options({ includedParentIds: new Set() }));
    assert.equal(mix.slices.length, 0);
    assert.equal(mix.totalPence, 0);
  });

  it('filters individual child categories when includedCategoryIds is provided', () => {
    const weeklyShop = GROCERIES * 10 + 1;
    const topUpShop = GROCERIES * 10 + 2;
    const childLines: MixLine[] = [
      {
        ...line('2026-09-28', GROCERIES, 'Groceries', 8000),
        categoryId: weeklyShop,
        childName: 'Weekly Shop',
      },
      {
        ...line('2026-10-02', GROCERIES, 'Groceries', 2000),
        categoryId: topUpShop,
        childName: 'Top-up Shops',
      },
    ];
    const mix = spendingMix(
      childLines,
      options({
        includedParentIds: new Set([GROCERIES]),
        includedCategoryIds: new Set([weeklyShop]),
      }),
    );
    const groceries = mix.slices.find((slice) => slice.parentId === GROCERIES);
    assert.equal(groceries?.amountPence, 8000);
    assert.equal(groceries?.lines.length, 1);
    assert.equal(groceries?.lines[0]?.childName, 'Weekly Shop');
    assert.equal(mix.totalPence, 8000);
  });
});

describe('spendingMix: guards and ordering', () => {
  it('rejects a window that is not YYYY-MM-DD', () => {
    assert.throws(() => spendingMix([], options({ from: '26/09/2026' })), /YYYY-MM-DD/);
  });

  it('lists a slice’s lines newest first', () => {
    const mix = spendingMix(LINES, options());
    const groceries = mix.slices.find((slice) => slice.parentId === GROCERIES);
    const dates = groceries?.lines.map((entry) => entry.occurredDate) ?? [];
    assert.deepEqual(dates, [...dates].sort().reverse());
  });
});
