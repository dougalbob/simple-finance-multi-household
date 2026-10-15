import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  listPotActivity,
  purchaseActivityOrder,
  purchaseActivityRow,
  type ActivityEntry,
  type ActivityRow,
} from '../src/lib/records/activity';
import { activityWindowContaining, parseOpenRowParams } from '../src/lib/records/in-place-activity';
import {
  createPurchase,
  createRefund,
  editPurchase,
  findPurchaseWithLines,
  voidPurchase,
} from '../src/lib/records/purchases';
import {
  OPEN_PURCHASE_PARAM,
  parseOpenPurchaseId,
  pinnedPurchaseLinks,
  pinnedPurchaseReason,
  purchaseActivityHref,
  purchaseInPlaceHref,
  withPinnedPurchase,
  type PinnedPurchaseEntry,
} from '../src/lib/records/purchase-activity';
import { createSchedule, materializeAndConvert } from '../src/lib/records/schedules';
import { createHouseholdFixture } from './household';

/**
 * A purchase opens in place on All Transactions (decision 226, GitHub issue
 * #57): `PUR`, `DD` and `SO` rows correct and void beneath their own row, a
 * refund keeps its Purchases link, and an open purchase a save took out of the
 * list stays pinned, saying why — the transfer contract (decision 225) applied
 * to the record the household most often needs to put right.
 *
 * These tests pin the pure rules the page and the row lean on — which purchase
 * is open, which window and pot a link opens, why an open purchase is pinned
 * after a save, where the pinned row sits — plus the wiring that gives a
 * purchase the Purchases page's own forms.
 */

const repoFile = (relativePath: string) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const TODAY = '2026-10-15';

/** Epoch ms of a local date's end-of-day marker (or a given time) — a row's sort instant. */
const instant = (date: string, time = '22:59:59') => new Date(`${date}T${time}Z`).getTime();

/** A minimal movement row for placement tests: only its date and sort position matter. */
function movement(
  date: string,
  key: string,
  {
    time,
    familyRank = 0,
    recordId = 1,
  }: { time?: string; familyRank?: number; recordId?: number } = {},
): ActivityEntry {
  return {
    kind: 'row',
    row: { key, date, family: 'purchase', recordId } as unknown as ActivityRow,
    order: { at: instant(date, time), familyRank, recordId, key },
  };
}

function checkpoint(date: string): ActivityEntry {
  return {
    kind: 'checkpoint',
    checkpoint: { key: `checkpoint-${date}`, date, amountPence: 0, note: '' },
  };
}

function pinned(date: string, time?: string): PinnedPurchaseEntry {
  return {
    kind: 'pinned-purchase',
    reason: 'voided',
    row: { key: 'purchase-9', date, family: 'purchase', recordId: 9 } as unknown as ActivityRow,
    order: { at: instant(date, time), familyRank: 0, recordId: 9, key: 'purchase-9' },
  };
}

const keysOf = (entries: Array<ActivityEntry | PinnedPurchaseEntry>) =>
  entries.map((entry) =>
    entry.kind === 'checkpoint' ? `checkpoint ${entry.checkpoint.date}` : entry.row.key,
  );

describe('purchases open in place: the URL names one open purchase', () => {
  it('reads ?purchase= as a plain positive id and ignores anything else', () => {
    assert.equal(parseOpenPurchaseId('12'), 12);
    assert.equal(parseOpenPurchaseId(['3', '7']), 7, 'a repeated parameter takes its last value');
    for (const ignored of [
      undefined,
      '',
      '0',
      '-3',
      '1.5',
      '1e3',
      'abc',
      '012',
      ' 4',
      '1234567890123456',
    ]) {
      assert.equal(parseOpenPurchaseId(ignored), null, `${JSON.stringify(ignored)} names nothing`);
    }
  });

  it('resolves one open record from the page’s two parameters', () => {
    assert.deepEqual(parseOpenRowParams({ purchase: '7' }), { kind: 'purchase', id: 7 });
    assert.deepEqual(parseOpenRowParams({ transfer: '3' }), { kind: 'transfer', id: 3 });
    assert.equal(parseOpenRowParams({}), null);
    assert.equal(parseOpenRowParams({ purchase: 'abc' }), null);
    // Both at once can only come from a hand-typed URL: the older contract,
    // the transfer, keeps its meaning.
    assert.deepEqual(parseOpenRowParams({ transfer: '3', purchase: '7' }), {
      kind: 'transfer',
      id: 3,
    });
    assert.deepEqual(
      parseOpenRowParams({ transfer: 'nonsense', purchase: '7' }),
      { kind: 'purchase', id: 7 },
      'a transfer parameter that names nothing does not shadow a purchase',
    );
  });

  it('opens a purchase on one pot and window, landing on its row', () => {
    assert.equal(
      purchaseInPlaceHref(4, { dateFrom: '2026-09-16', dateTo: TODAY }, 12),
      '/transactions?potId=4&from=2026-09-16&to=2026-10-15&purchase=12#purchase-12',
    );
    assert.equal(OPEN_PURCHASE_PARAM, 'purchase');
  });

  it('builds a pinned row’s link from the purchase’s own date', () => {
    assert.equal(
      purchaseActivityHref({ id: 5, occurredDate: '2026-08-20' }, 1, TODAY),
      '/transactions?potId=1&from=2026-08-06&to=2026-09-04&purchase=5#purchase-5',
    );
    assert.deepEqual(activityWindowContaining('2026-08-20', TODAY), {
      dateFrom: '2026-08-06',
      dateTo: '2026-09-04',
    });
  });
});

describe('an open purchase a save took out of the list is pinned, and says why', () => {
  const view = (entries: ActivityEntry[] = []) => ({
    dateFrom: '2026-09-16',
    dateTo: TODAY,
    entries,
  });
  const standing = { id: 9, occurredDate: '2026-10-01', voidedAt: null };

  it('is not pinned while it is one of the live rows', () => {
    const listed: ActivityEntry = {
      kind: 'row',
      row: { key: 'purchase-9', family: 'purchase', recordId: 9 } as unknown as ActivityRow,
      order: { at: 0, familyRank: 0, recordId: 9, key: 'purchase-9' },
    };
    assert.equal(pinnedPurchaseReason(standing, view([listed])), null);
    // A transfer with the same id is not this purchase.
    const sameTransferId: ActivityEntry = {
      kind: 'row',
      row: { key: 'transfer-9', family: 'transfer', recordId: 9 } as unknown as ActivityRow,
      order: { at: 0, familyRank: 1, recordId: 9, key: 'transfer-9' },
    };
    assert.equal(pinnedPurchaseReason(standing, view([sameTransferId])), 'hidden');
  });

  it('names the reason: voided first, then the dates, then the row cap', () => {
    const voidedAt = new Date('2026-10-15T09:00:00Z');
    assert.equal(pinnedPurchaseReason({ ...standing, voidedAt }, view()), 'voided');
    assert.equal(
      pinnedPurchaseReason({ ...standing, voidedAt, occurredDate: '2026-01-01' }, view()),
      'voided',
      'a void outranks every other reason',
    );
    assert.equal(
      pinnedPurchaseReason({ ...standing, occurredDate: '2026-09-15' }, view()),
      'outside-window',
    );
    assert.equal(
      pinnedPurchaseReason(
        { ...standing, occurredDate: '2026-10-10' },
        { ...view(), dateTo: '2026-10-09' },
      ),
      'outside-window',
    );
    assert.equal(pinnedPurchaseReason(standing, view()), 'hidden', 'in the window yet missing');
  });

  it('links a re-dated purchase to a window that holds its date, and a void to Purchases', () => {
    const context = {
      potId: 1,
      livePots: [
        { id: 1, label: 'Main account' },
        { id: 2, label: 'Salary account' },
      ],
      today: TODAY,
    };
    const moved = { id: 9, occurredDate: '2026-08-20' };
    assert.deepEqual(pinnedPurchaseLinks(moved, 'outside-window', context), [
      {
        href: '/transactions?potId=1&from=2026-08-06&to=2026-09-04&purchase=9#purchase-9',
        label: 'Show Main account around 2026-08-20',
      },
    ]);
    // A voided purchase is listed nowhere on this page — but the Purchases
    // page still shows it under its Voided toggle, with its reason.
    assert.deepEqual(pinnedPurchaseLinks(moved, 'voided', context), [
      { href: '/purchases?voidedOnly=1#purchase-9', label: 'See it on Purchases' },
    ]);
    assert.deepEqual(pinnedPurchaseLinks(moved, 'hidden', context), []);
    assert.deepEqual(
      pinnedPurchaseLinks(moved, 'outside-window', { ...context, livePots: [] }),
      [
        {
          href: '/transactions?potId=1&from=2026-08-06&to=2026-09-04&purchase=9#purchase-9',
          label: 'Show this pot around 2026-08-20',
        },
      ],
      'a pot the household can no longer select still names the window',
    );
  });

  it('places the pinned row exactly where the projection would list it, adding nothing else', () => {
    const entries = [
      movement('2026-10-14', 'a'),
      movement('2026-10-03', 'b', { time: '18:00:00' }),
      movement('2026-10-03', 'c', { time: '09:00:00' }),
      checkpoint('2026-10-03'),
      movement('2026-09-30', 'd'),
    ];
    const snapshot = JSON.stringify(entries);
    assert.deepEqual(keysOf(withPinnedPurchase(entries, pinned('2026-10-10'))), [
      'a',
      'purchase-9',
      'b',
      'c',
      'checkpoint 2026-10-03',
      'd',
    ]);
    // Within its own day it keeps its time order — between b and c here — and
    // it never drops below that day's checkpoint divider.
    assert.deepEqual(keysOf(withPinnedPurchase(entries, pinned('2026-10-03', '12:00:00'))), [
      'a',
      'b',
      'purchase-9',
      'c',
      'checkpoint 2026-10-03',
      'd',
    ]);
    assert.equal(keysOf(withPinnedPurchase(entries, pinned('2026-10-15'))).at(0), 'purchase-9');
    assert.equal(keysOf(withPinnedPurchase(entries, pinned('2026-08-20'))).at(-1), 'purchase-9');
    assert.deepEqual(keysOf(withPinnedPurchase([], pinned('2026-08-20'))), ['purchase-9']);
    assert.equal(keysOf(withPinnedPurchase(entries, null)).length, entries.length);
    assert.equal(JSON.stringify(entries), snapshot, 'the projection itself is never changed');
  });
});

describe('the purchase row carries the forms’ own facts', () => {
  const window = { dateFrom: '2026-09-16', dateTo: TODAY };

  it('projects a hand-recorded purchase as PUR with its lines, note and actor', async () => {
    const fx = await createHouseholdFixture('alex@example.com', new Date('2026-10-01T12:00:00Z'));
    try {
      const groceries = fx.categoryId('Groceries', 'Weekly Shop');
      const fuel = fx.categoryId('Vehicle Running', 'Fuel');
      const shop = createPurchase(fx.db, {
        supplierName: 'Corner Foods',
        potId: fx.pots.main.id,
        totalPence: 6_347,
        occurredDate: '2026-10-14',
        note: 'Weekly shop',
        lines: [
          { amountPence: 4_198, categoryId: groceries, targetKind: 'household' },
          {
            amountPence: 2_149,
            categoryId: fuel,
            targetKind: 'vehicle',
            targetId: fx.vehicles.vehicleA.id,
          },
        ],
        actor: 'alex@example.com',
        now: new Date('2026-10-14T18:00:00Z'),
      });

      const view = listPotActivity(fx.db, { potId: fx.pots.main.id, ...window });
      const entry = view.entries.find(
        (candidate) =>
          candidate.kind === 'row' &&
          candidate.row.family === 'purchase' &&
          candidate.row.recordId === shop.purchase.id,
      );
      assert.ok(entry !== undefined && entry.kind === 'row');
      const row = entry.row;
      assert.equal(row.key, `purchase-${shop.purchase.id}`);
      assert.equal(row.code, 'PUR');
      assert.equal(row.source, 'Corner Foods');
      assert.equal(row.category, 'Groceries / Weekly Shop (household)');
      assert.equal(row.extraLines, 1, 'the second line is counted, not listed');
      assert.match(
        row.link.href,
        /^\/purchases\?potId=\d+&from=2026-09-16&to=2026-10-15#purchase-\d+$/,
      );
      assert.equal(row.secondaryLink, null, 'nothing scheduled made this one');
      assert.equal(row.transfer, null);

      // The facts the panel's editor starts from: the record as saved.
      assert.equal(row.purchase?.version, 1);
      assert.equal(row.purchase?.note, 'Weekly shop');
      assert.equal(row.purchase?.enteredBy, 'alex@example.com');
      assert.equal(row.purchase?.voidReason, null);
      assert.deepEqual(
        row.purchase?.lines.map((line) => [
          line.amountPence,
          line.categoryId,
          line.targetKind,
          line.targetId,
        ]),
        [
          [4_198, groceries, 'household', null],
          [2_149, fuel, 'vehicle', fx.vehicles.vehicleA.id],
        ],
        'the lines in the order they were recorded — the order the editor shows',
      );

      // The pinned-row projector reads the same record the same way.
      const projected = purchaseActivityRow(fx.db, shop.purchase, fx.pots.main.id, window);
      assert.deepEqual(projected, row, 'live and pinned rows are one projection');
      assert.equal(
        purchaseActivityOrder(shop.purchase).key,
        row.key,
        'and sort by the same position',
      );
    } finally {
      fx.close();
    }
  });

  it('gives a converted schedule purchase its DD code, its schedule link and its form facts', async () => {
    const fx = await createHouseholdFixture('alex@example.com', new Date('2026-10-01T12:00:00Z'));
    try {
      const schedule = createSchedule(fx.db, {
        name: 'Energy DD',
        kind: 'dd',
        frequency: 'monthly',
        dueDayOfMonth: 12,
        amountPence: 8_455,
        potId: fx.pots.main.id,
        categoryId: fx.categoryId('Utilities', 'Energy'),
        supplierName: 'EnergyCo',
        targetKind: 'household',
        activeFrom: '2026-10-01',
        actor: 'alex@example.com',
        now: new Date('2026-10-01T12:00:00Z'),
      });
      // Local midnight of the 12th has arrived: the instance converts.
      materializeAndConvert(fx.db, new Date('2026-10-12T00:30:00+01:00'));

      const view = listPotActivity(fx.db, { potId: fx.pots.main.id, ...window });
      const entry = view.entries.find(
        (candidate) =>
          candidate.kind === 'row' &&
          candidate.row.family === 'purchase' &&
          candidate.row.code === 'DD',
      );
      assert.ok(entry !== undefined && entry.kind === 'row', 'the conversion is a DD row');
      assert.equal(entry.row.source, 'EnergyCo');
      assert.equal(entry.row.amountPence, 8_455);
      assert.equal(entry.row.secondaryLink?.href, `/recurring#schedule-${schedule.schedule.id}`);
      assert.equal(entry.row.purchase?.version, 1, 'a converted record is editable in place');
      assert.equal(entry.row.purchase?.lines.length, 1);
    } finally {
      fx.close();
    }
  });

  it('keeps a refund on its Purchases link — no in-place facts, its own REF code', async () => {
    const fx = await createHouseholdFixture('alex@example.com', new Date('2026-10-01T12:00:00Z'));
    try {
      const groceries = fx.categoryId('Groceries', 'Weekly Shop');
      const shop = createPurchase(fx.db, {
        supplierName: 'Corner Foods',
        potId: fx.pots.main.id,
        totalPence: 2_000,
        occurredDate: '2026-10-10',
        lines: [{ amountPence: 2_000, categoryId: groceries, targetKind: 'household' }],
        actor: 'alex@example.com',
        now: new Date('2026-10-10T10:00:00Z'),
      });
      const refund = createRefund(fx.db, {
        refundOfPurchaseId: shop.purchase.id,
        totalPence: -500,
        occurredDate: '2026-10-12',
        note: 'Returned the milk',
        lines: [{ amountPence: -500, categoryId: groceries, targetKind: 'household' }],
        actor: 'alex@example.com',
        now: new Date('2026-10-12T10:00:00Z'),
      });

      const view = listPotActivity(fx.db, { potId: fx.pots.main.id, ...window });
      const refundRow = view.entries.find(
        (candidate) =>
          candidate.kind === 'row' &&
          candidate.row.family === 'purchase' &&
          candidate.row.recordId === refund.purchase.id,
      );
      assert.ok(refundRow !== undefined && refundRow.kind === 'row');
      assert.equal(refundRow.row.code, 'REF');
      assert.equal(refundRow.row.direction, 'in', 'money coming back');
      assert.equal(refundRow.row.purchase, null, 'a refund keeps its link to Purchases');
      assert.match(refundRow.row.link.href, /^\/purchases\?potId=/);
      // The original it was refunded against still opens in place.
      const originalRow = view.entries.find(
        (candidate) =>
          candidate.kind === 'row' &&
          candidate.row.family === 'purchase' &&
          candidate.row.recordId === shop.purchase.id,
      );
      assert.ok(originalRow !== undefined && originalRow.kind === 'row');
      assert.notEqual(originalRow.row.purchase, null);
    } finally {
      fx.close();
    }
  });

  it('keeps a voided purchase pinned in the position it held while live', async () => {
    const fx = await createHouseholdFixture('alex@example.com', new Date('2026-10-01T12:00:00Z'));
    try {
      const groceries = fx.categoryId('Groceries', 'Weekly Shop');
      const shop = createPurchase(fx.db, {
        supplierName: 'Corner Foods',
        potId: fx.pots.main.id,
        totalPence: 1_200,
        occurredDate: '2026-10-14',
        lines: [{ amountPence: 1_200, categoryId: groceries, targetKind: 'household' }],
        actor: 'alex@example.com',
        now: new Date('2026-10-14T09:00:00Z'),
      });
      const later = createPurchase(fx.db, {
        supplierName: 'Greenfield Market',
        potId: fx.pots.main.id,
        totalPence: 3_000,
        occurredDate: '2026-10-14',
        lines: [{ amountPence: 3_000, categoryId: groceries, targetKind: 'household' }],
        actor: 'alex@example.com',
        now: new Date('2026-10-14T11:00:00Z'),
      });

      const key = `purchase-${shop.purchase.id}`;
      const live = listPotActivity(fx.db, { potId: fx.pots.main.id, ...window });
      const liveIndex = live.entries.findIndex(
        (candidate) => candidate.kind === 'row' && candidate.row.key === key,
      );
      assert.ok(liveIndex >= 0, 'the purchase is one of the live rows');
      assert.equal(
        pinnedPurchaseReason(shop.purchase, { ...window, entries: live.entries }),
        null,
        'listed: the panel opens under its own row',
      );

      voidPurchase(fx.db, {
        id: shop.purchase.id,
        expectedVersion: shop.purchase.version,
        reason: 'Entered twice',
        actor: 'sam@example.com',
        now: new Date('2026-10-15T08:00:00Z'),
      });
      const after = listPotActivity(fx.db, { potId: fx.pots.main.id, ...window });
      const voided = after.entries.some(
        (candidate) => candidate.kind === 'row' && candidate.row.key === key,
      );
      assert.equal(voided, false, 'voids are never movements');
      const refetched = findPurchaseWithLines(fx.db, shop.purchase.id);
      assert.ok(refetched !== null);
      const voidedPurchase = refetched.purchase;
      const reason = pinnedPurchaseReason(voidedPurchase, { ...window, entries: after.entries });
      assert.equal(reason, 'voided');

      const pinnedRow = purchaseActivityRow(fx.db, voidedPurchase, fx.pots.main.id, window);
      assert.equal(pinnedRow.key, key, 'the same key as its live row');
      assert.equal(pinnedRow.code, 'PUR');
      assert.equal(pinnedRow.source, 'Corner Foods');
      assert.equal(pinnedRow.purchase?.voidReason, 'Entered twice');
      assert.equal(pinnedRow.purchase?.version, 2, 'the version the void left behind');

      const display = withPinnedPurchase(after.entries, {
        kind: 'pinned-purchase',
        row: pinnedRow,
        order: purchaseActivityOrder(voidedPurchase),
        reason,
      });
      assert.equal(display.length, after.entries.length + 1);
      const displayIndex = display.findIndex((candidate) =>
        candidate.kind === 'pinned-purchase'
          ? candidate.row.key === key
          : candidate.kind === 'row' && candidate.row.key === key,
      );
      assert.equal(displayIndex, liveIndex, 'pinned exactly where it stood while live');
    } finally {
      fx.close();
    }
  });

  it('pins a purchase re-dated out of the window, and offers the window that holds it', async () => {
    const fx = await createHouseholdFixture('alex@example.com', new Date('2026-10-01T12:00:00Z'));
    try {
      const groceries = fx.categoryId('Groceries', 'Weekly Shop');
      const shop = createPurchase(fx.db, {
        supplierName: 'Corner Foods',
        potId: fx.pots.main.id,
        totalPence: 1_000,
        occurredDate: '2026-10-14',
        lines: [{ amountPence: 1_000, categoryId: groceries, targetKind: 'household' }],
        actor: 'alex@example.com',
        now: new Date('2026-10-14T09:00:00Z'),
      });
      const moved = editPurchase(fx.db, {
        id: shop.purchase.id,
        expectedVersion: shop.purchase.version,
        actor: 'alex@example.com',
        patch: { occurredDate: '2026-08-20' },
        now: new Date('2026-10-15T08:00:00Z'),
      });
      const after = listPotActivity(fx.db, { potId: fx.pots.main.id, ...window });
      assert.equal(
        pinnedPurchaseReason(moved.purchase, { ...window, entries: after.entries }),
        'outside-window',
      );
      assert.deepEqual(
        pinnedPurchaseLinks(moved.purchase, 'outside-window', {
          potId: fx.pots.main.id,
          livePots: [{ id: fx.pots.main.id, label: 'Main account' }],
          today: TODAY,
        }),
        [
          {
            href: `/transactions?potId=${fx.pots.main.id}&from=2026-08-06&to=2026-09-04&purchase=${shop.purchase.id}#purchase-${shop.purchase.id}`,
            label: 'Show Main account around 2026-08-20',
          },
        ],
      );
      // The pinned row reads the record as it now stands — its date moved with it.
      const pinnedRow = purchaseActivityRow(fx.db, moved.purchase, fx.pots.main.id, window);
      assert.equal(pinnedRow.date, '2026-08-20');
      assert.equal(pinnedRow.purchase?.version, 2);
    } finally {
      fx.close();
    }
  });
});

describe('the wiring: the page gives a purchase the Purchases page’s own forms', () => {
  it('branches purchase rows into the in-place row and leaves the rest linked', () => {
    const page = repoFile('src/app/transactions/page.tsx');
    assert.ok(page.includes('<PurchaseActivityRow'), 'through the in-place row');
    assert.ok(
      page.includes('entry.row.purchase !== null ?'),
      'on exactly the rows that carry the forms’ facts',
    );
    assert.ok(page.includes('<ActivityOpenRowProvider>'), 'sharing one open record with transfers');
    assert.ok(page.includes('<ActivityTableRow'), 'every other family keeps its linked row');
    assert.ok(
      page.includes('leafCategoryOptions(db)'),
      'the same live leaf categories the Purchases editor offers',
    );
    assert.ok(page.includes('findPurchaseWithLines(db,'), 'the ?purchase= id is read, not assumed');
  });

  it('opens through the shared open-record state, ready before it can hear', () => {
    const row = repoFile('src/components/purchase-activity-row.tsx');
    assert.ok(row.includes("openRow('purchase'"), 'the shared state names the purchase it opens');
    assert.ok(row.includes('data-purchase-ready'), 'the decision 131 ready signal');
    assert.ok(row.includes('aria-expanded'), 'a disclosure, announced as one');
    assert.ok(row.includes('PurchaseEditForm'), 'the Purchases page’s edit form');
    assert.ok(row.includes('VoidForm'), 'and its void form');
    assert.ok(row.includes('kind="purchase"'), 'the void form tells the domain it is a purchase');
    assert.doesNotMatch(row, /history\.replaceState\(/, 'never behind the router’s back');
  });

  it('keeps a refund out of the panel in the projection itself', () => {
    const projection = repoFile('src/lib/records/activity.ts');
    assert.ok(
      projection.includes("detail.code === 'REF'"),
      'the refund rule lives in the projection, not only the page',
    );
    assert.ok(projection.includes('purchaseActivityRowFrom'), 'one builder for live and pinned');
    assert.ok(projection.includes('purchaseActivityRow('), 'and a reader for the pinned row');
  });
});
