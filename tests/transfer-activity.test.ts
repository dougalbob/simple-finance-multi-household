import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  defaultActivityPot,
  listPotActivity,
  transferActivityOrder,
  transferActivityRow,
  type ActivityEntry,
  type ActivityRow,
} from '../src/lib/records/activity';
import { createExternalMovement } from '../src/lib/records/external-movements';
import { listPotsIncludingArchived } from '../src/lib/records/pots';
import { createPurchase } from '../src/lib/records/purchases';
import {
  activityWindowContaining,
  parseOpenTransferId,
  pinnedTransferLinks,
  pinnedTransferReason,
  transferActivityHref,
  transferInPlaceHref,
  transferViewPotId,
  withPinnedTransfer,
  type PinnedTransferEntry,
} from '../src/lib/records/transfer-activity';
import {
  createTransfer,
  editTransfer,
  findTransfer,
  voidTransfer,
} from '../src/lib/records/transfers';
import { createHouseholdFixture } from './household';

/**
 * A transfer between the household's own pots opens in place on All
 * Transactions (decision 225, GitHub issue #55). The pots page's "Transfers
 * between pots" card is gone; these tests pin the pure rules the page and the
 * old deep link lean on — which transfer is open, which window and pot a link
 * opens, why an open transfer is pinned after a save took it out of the list,
 * and where the pinned row sits — plus the wiring that keeps purchases on
 * their own page.
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

function pinned(date: string, time?: string): PinnedTransferEntry {
  return {
    kind: 'pinned-transfer',
    reason: 'voided',
    row: { key: 'transfer-9', date, family: 'transfer', recordId: 9 } as unknown as ActivityRow,
    order: { at: instant(date, time), familyRank: 1, recordId: 9, key: 'transfer-9' },
  };
}

const keysOf = (entries: ReturnType<typeof withPinnedTransfer>) =>
  entries.map((entry) =>
    entry.kind === 'checkpoint' ? `checkpoint ${entry.checkpoint.date}` : entry.row.key,
  );

describe('transfers open in place: the URL names one open transfer', () => {
  it('reads ?transfer= as a plain positive id and ignores anything else', () => {
    assert.equal(parseOpenTransferId('12'), 12);
    assert.equal(parseOpenTransferId(['3', '7']), 7, 'a repeated parameter takes its last value');
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
      assert.equal(parseOpenTransferId(ignored), null, `${JSON.stringify(ignored)} names nothing`);
    }
  });

  it('opens a transfer on one pot and window, landing on its row', () => {
    assert.equal(
      transferInPlaceHref(4, { dateFrom: '2026-09-16', dateTo: TODAY }, 12),
      '/transactions?potId=4&from=2026-09-16&to=2026-10-15&transfer=12#transfer-12',
    );
  });

  it('picks the page’s own last-30-days window whenever it holds the date', () => {
    const lastThirty = { dateFrom: '2026-09-16', dateTo: TODAY };
    assert.deepEqual(activityWindowContaining(TODAY, TODAY), lastThirty);
    assert.deepEqual(activityWindowContaining('2026-10-14', TODAY), lastThirty);
    assert.deepEqual(activityWindowContaining('2026-09-16', TODAY), lastThirty, 'first day of 30');
  });

  it('otherwise opens about a month around the date, never past today', () => {
    assert.deepEqual(activityWindowContaining('2026-09-15', TODAY), {
      dateFrom: '2026-09-01',
      dateTo: '2026-09-30',
    });
    assert.deepEqual(activityWindowContaining('2026-03-01', TODAY), {
      dateFrom: '2026-02-15',
      dateTo: '2026-03-16',
    });
    // Never a future end: the page refuses one (§9.1), so a link must not ask.
    for (let offset = 0; offset <= 400; offset += 1) {
      const date = new Date(Date.UTC(2026, 9, 15 - offset)).toISOString().slice(0, 10);
      const window = activityWindowContaining(date, TODAY);
      assert.ok(window.dateFrom <= date && date <= window.dateTo, `${date} is inside its window`);
      assert.ok(window.dateTo <= TODAY, `${date}'s window ends by today`);
    }
  });

  it('builds the old deep link’s destination from the transfer’s own date', () => {
    assert.equal(
      transferActivityHref({ id: 5, occurredDate: '2026-08-20' }, 1, TODAY),
      '/transactions?potId=1&from=2026-08-06&to=2026-09-04&transfer=5#transfer-5',
    );
    assert.equal(
      transferActivityHref({ id: 1, occurredDate: '2026-10-14' }, 1, TODAY),
      '/transactions?potId=1&from=2026-09-16&to=2026-10-15&transfer=1#transfer-1',
    );
  });

  it('opens on the pot the household usually reviews when the transfer touches it', () => {
    const transfer = { fromPotId: 2, toPotId: 1 };
    assert.equal(transferViewPotId(transfer, 1), 1, 'usual pot received the money');
    assert.equal(transferViewPotId({ fromPotId: 1, toPotId: 3 }, 1), 1, 'usual pot sent it');
    assert.equal(transferViewPotId(transfer, 4), 2, 'otherwise the pot the money left');
    assert.equal(transferViewPotId(transfer, null), 2);
  });

  it('resolves the usual pot the way All Transactions always has (issue #44)', () => {
    const pots = [
      { id: 1, label: 'Salary account' },
      { id: 2, label: 'Main account' },
      { id: 3, label: "Alex's cash" },
    ];
    assert.equal(defaultActivityPot(pots, 3)?.id, 3, 'the saved default wins');
    assert.equal(defaultActivityPot(pots, 99)?.id, 2, 'then the pot labelled Main account');
    assert.equal(defaultActivityPot(pots, null)?.id, 2);
    assert.equal(defaultActivityPot([pots[0]!, pots[2]!], null)?.id, 1, 'then the first pot');
    assert.equal(defaultActivityPot([], null), null);
  });
});

describe('an open transfer a save took out of the list is pinned, and says why', () => {
  const view = (entries: ActivityEntry[] = []) => ({
    potId: 1,
    dateFrom: '2026-09-16',
    dateTo: TODAY,
    entries,
  });
  const standing = {
    id: 9,
    fromPotId: 1,
    toPotId: 2,
    occurredDate: '2026-10-01',
    voidedAt: null,
  };

  it('is not pinned while it is one of the live rows', () => {
    const listed: ActivityEntry = {
      kind: 'row',
      row: { key: 'transfer-9', family: 'transfer', recordId: 9 } as unknown as ActivityRow,
      order: { at: 0, familyRank: 1, recordId: 9, key: 'transfer-9' },
    };
    assert.equal(pinnedTransferReason(standing, view([listed])), null);
    // A purchase with the same id is not the transfer.
    const samePurchaseId: ActivityEntry = {
      kind: 'row',
      row: { key: 'purchase-9', family: 'purchase', recordId: 9 } as unknown as ActivityRow,
      order: { at: 0, familyRank: 0, recordId: 9, key: 'purchase-9' },
    };
    assert.equal(pinnedTransferReason(standing, view([samePurchaseId])), 'hidden');
  });

  it('names the reason: voided first, then other pots, then the dates, then the row cap', () => {
    const voidedAt = new Date('2026-10-15T09:00:00Z');
    assert.equal(pinnedTransferReason({ ...standing, voidedAt }, view()), 'voided');
    assert.equal(
      pinnedTransferReason({ ...standing, fromPotId: 3, toPotId: 4, voidedAt }, view()),
      'voided',
      'a void outranks every other reason',
    );
    assert.equal(
      pinnedTransferReason({ ...standing, fromPotId: 3, toPotId: 4 }, view()),
      'elsewhere',
    );
    assert.equal(
      pinnedTransferReason(
        { ...standing, fromPotId: 3, toPotId: 4, occurredDate: '2026-01-01' },
        view(),
      ),
      'elsewhere',
      'another pot outranks the dates',
    );
    assert.equal(
      pinnedTransferReason({ ...standing, occurredDate: '2026-09-15' }, view()),
      'outside-window',
    );
    assert.equal(
      pinnedTransferReason(
        { ...standing, occurredDate: '2026-10-10' },
        { ...view(), dateTo: '2026-10-09' },
      ),
      'outside-window',
    );
    assert.equal(pinnedTransferReason(standing, view()), 'hidden', 'in the window yet missing');
  });

  it('links a moved transfer to where it is a live row again — live pots only', () => {
    const livePots = [
      { id: 1, label: 'Main account' },
      { id: 2, label: 'Salary account' },
      { id: 3, label: "Alex's cash" },
    ];
    const context = { potId: 1, livePots, today: TODAY };
    const moved = { id: 9, fromPotId: 2, toPotId: 3, occurredDate: '2026-10-01' };
    assert.deepEqual(pinnedTransferLinks(moved, 'elsewhere', context), [
      {
        href: '/transactions?potId=2&from=2026-09-16&to=2026-10-15&transfer=9#transfer-9',
        label: 'See it in Salary account',
      },
      {
        href: '/transactions?potId=3&from=2026-09-16&to=2026-10-15&transfer=9#transfer-9',
        label: "See it in Alex's cash",
      },
    ]);
    assert.deepEqual(
      pinnedTransferLinks({ ...moved, toPotId: 77 }, 'elsewhere', context).map(
        (link) => link.label,
      ),
      ['See it in Salary account'],
      'a pot that cannot be selected has no activity to open',
    );
    assert.deepEqual(
      pinnedTransferLinks(
        { ...moved, fromPotId: 1, occurredDate: '2026-08-20' },
        'outside-window',
        context,
      ),
      [
        {
          href: '/transactions?potId=1&from=2026-08-06&to=2026-09-04&transfer=9#transfer-9',
          label: 'Show Main account around 2026-08-20',
        },
      ],
    );
    assert.deepEqual(pinnedTransferLinks(moved, 'voided', context), [], 'a live row nowhere');
    assert.deepEqual(pinnedTransferLinks(moved, 'hidden', context), []);
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
    assert.deepEqual(keysOf(withPinnedTransfer(entries, pinned('2026-10-10'))), [
      'a',
      'transfer-9',
      'b',
      'c',
      'checkpoint 2026-10-03',
      'd',
    ]);
    // Within its own day it keeps its time order — between b and c here —
    // and it never drops below that day's checkpoint divider, which sits
    // under its own date's rows.
    assert.deepEqual(keysOf(withPinnedTransfer(entries, pinned('2026-10-03', '12:00:00'))), [
      'a',
      'b',
      'transfer-9',
      'c',
      'checkpoint 2026-10-03',
      'd',
    ]);
    assert.deepEqual(keysOf(withPinnedTransfer(entries, pinned('2026-10-03', '08:00:00'))), [
      'a',
      'b',
      'c',
      'transfer-9',
      'checkpoint 2026-10-03',
      'd',
    ]);
    assert.equal(keysOf(withPinnedTransfer(entries, pinned('2026-10-15'))).at(0), 'transfer-9');
    assert.equal(keysOf(withPinnedTransfer(entries, pinned('2026-08-20'))).at(-1), 'transfer-9');
    assert.deepEqual(keysOf(withPinnedTransfer([], pinned('2026-08-20'))), ['transfer-9']);
    assert.deepEqual(keysOf(withPinnedTransfer(entries, null)), [
      'a',
      'b',
      'c',
      'checkpoint 2026-10-03',
      'd',
    ]);
    assert.equal(JSON.stringify(entries), snapshot, 'the projection itself is never changed');
  });

  it('keeps its place among records sharing its instant (date-only entries on one day)', () => {
    // The browser run that caught this: three boundary movements and the
    // transfer all recorded "today" without a time, so they share the
    // end-of-day instant. Live, the transfer is listed first — transfers
    // rank ahead of boundary money — and pinned it must stay first, not drop
    // below them and pull the open panel down the screen.
    const sameDay = [
      movement('2026-10-15', 'purchase-4', { familyRank: 0, recordId: 4 }),
      movement('2026-10-15', 'external-7', { familyRank: 2, recordId: 7 }),
      movement('2026-10-15', 'external-6', { familyRank: 2, recordId: 6 }),
      movement('2026-10-14', 'purchase-3', { familyRank: 0, recordId: 3 }),
    ];
    assert.deepEqual(keysOf(withPinnedTransfer(sameDay, pinned('2026-10-15'))), [
      'purchase-4',
      'transfer-9',
      'external-7',
      'external-6',
      'purchase-3',
    ]);
  });
});

describe('the pinned row is projected from the record, voided or not', () => {
  it('keeps a voided transfer’s facts and reason, outside the view it left', async () => {
    const fx = await createHouseholdFixture('alex@example.com', new Date('2026-10-01T12:00:00Z'));
    try {
      const window = { dateFrom: '2026-09-16', dateTo: TODAY };
      // Three date-only records on one day share its end-of-day instant.
      const shop = createPurchase(fx.db, {
        supplierName: 'Corner Shop',
        potId: fx.pots.main.id,
        totalPence: 1_200,
        occurredDate: '2026-10-14',
        lines: [
          {
            amountPence: 1_200,
            categoryId: fx.categoryId('Groceries', 'Weekly Shop'),
            targetKind: 'household',
          },
        ],
        actor: 'alex@example.com',
        now: new Date('2026-10-14T09:00:00Z'),
      });
      const gift = createExternalMovement(fx.db, {
        potId: fx.pots.main.id,
        direction: 'in',
        kind: 'other',
        amountPence: 2_000,
        occurredDate: '2026-10-14',
        counterparty: 'Aunt Jo',
        note: 'Birthday money',
        actor: 'alex@example.com',
        now: new Date('2026-10-14T10:00:00Z'),
      });
      const transfer = createTransfer(fx.db, {
        fromPotId: fx.pots.samCash.id,
        toPotId: fx.pots.main.id,
        amountPence: 110_000,
        occurredDate: '2026-10-14',
        note: '1st bridging payment plus £100 of charity donation',
        actor: 'alex@example.com',
        now: new Date('2026-10-14T18:00:00Z'),
      });
      const live = listPotActivity(fx.db, { potId: fx.pots.main.id, ...window });
      assert.equal(
        pinnedTransferReason(transfer, {
          potId: fx.pots.main.id,
          ...window,
          entries: live.entries,
        }),
        null,
        'listed: the panel opens under its own row',
      );

      voidTransfer(fx.db, {
        id: transfer.id,
        expectedVersion: transfer.version,
        actor: 'sam@example.com',
        reason: 'Recorded twice',
        now: new Date('2026-10-15T08:00:00Z'),
      });
      const after = listPotActivity(fx.db, { potId: fx.pots.main.id, ...window });
      const voided = findTransfer(fx.db, transfer.id);
      assert.ok(voided !== null);
      assert.equal(after.totals.rowCount, live.totals.rowCount - 1, 'voids never count');
      const reason = pinnedTransferReason(voided, {
        potId: fx.pots.main.id,
        ...window,
        entries: after.entries,
      });
      assert.equal(reason, 'voided');

      const labels = new Map(listPotsIncludingArchived(fx.db).map((pot) => [pot.id, pot.label]));
      const row = transferActivityRow(voided, fx.pots.main.id, labels, window);
      assert.equal(row.key, `transfer-${transfer.id}`, 'the same key as its live row');
      assert.equal(row.code, 'TX<');
      assert.equal(row.source, "Sam's cash");
      assert.equal(row.transfer?.voidReason, 'Recorded twice');
      assert.equal(row.transfer?.version, 2);
      assert.equal(row.transfer?.enteredBy, 'alex@example.com', 'entered-by never changes');

      // Pinned in the very position it held while live — between the
      // same-day purchase (listed first) and the same-day boundary money.
      const display = withPinnedTransfer(after.entries, {
        kind: 'pinned-transfer',
        row,
        order: transferActivityOrder(voided),
        reason,
      });
      assert.equal(display.length, after.entries.length + 1);
      const keyAt = (list: ReadonlyArray<{ kind: string; row?: { key: string } }>) =>
        list.map((entry) => (entry.kind === 'checkpoint' ? 'checkpoint' : entry.row?.key));
      assert.equal(
        keyAt(display).indexOf(`transfer-${transfer.id}`),
        keyAt(live.entries).indexOf(`transfer-${transfer.id}`),
      );
      assert.deepEqual(keyAt(display).slice(0, 3), [
        `purchase-${shop.purchase.id}`,
        `transfer-${transfer.id}`,
        `external-${gift.id}`,
      ]);
      assert.equal(findTransfer(fx.db, 999_999), null, 'an id that names nothing');
    } finally {
      fx.close();
    }
  });

  it('a correction onto two other pots leaves the view, and is pinned as elsewhere', async () => {
    const fx = await createHouseholdFixture('alex@example.com', new Date('2026-10-01T12:00:00Z'));
    try {
      const window = { dateFrom: '2026-09-16', dateTo: TODAY };
      const transfer = createTransfer(fx.db, {
        fromPotId: fx.pots.main.id,
        toPotId: fx.pots.alexCash.id,
        amountPence: 6_000,
        occurredDate: '2026-10-10',
        actor: 'alex@example.com',
        now: new Date('2026-10-10T18:00:00Z'),
      });
      const moved = editTransfer(fx.db, {
        id: transfer.id,
        expectedVersion: transfer.version,
        actor: 'alex@example.com',
        patch: { fromPotId: fx.pots.salary.id },
        now: new Date('2026-10-15T08:00:00Z'),
      });
      const view = listPotActivity(fx.db, { potId: fx.pots.main.id, ...window });
      assert.equal(
        pinnedTransferReason(moved, { potId: fx.pots.main.id, ...window, entries: view.entries }),
        'elsewhere',
      );
      const salaryView = listPotActivity(fx.db, { potId: fx.pots.salary.id, ...window });
      assert.equal(
        pinnedTransferReason(moved, {
          potId: fx.pots.salary.id,
          ...window,
          entries: salaryView.entries,
        }),
        null,
        'a live row on the pot it moved to',
      );
    } finally {
      fx.close();
    }
  });
});

describe('the wiring: transfers open here, purchases keep their page', () => {
  it('renders internal transfers through the in-place row and nothing else', () => {
    const page = repoFile('src/app/transactions/page.tsx');
    assert.ok(page.includes("entry.row.family === 'transfer' ?"), 'transfer rows branch out');
    assert.ok(page.includes('<TransferActivityRow'), 'through the in-place row');
    assert.ok(page.includes('<OpenTransferProvider>'), 'sharing one open transfer');
    assert.ok(page.includes('<ActivityTableRow'), 'every other family keeps its linked row');
  });

  it('removes the pots page’s transfer card and redirects its old deep link', () => {
    const pots = repoFile('src/app/pots/page.tsx');
    assert.equal(pots.includes('transfers-heading'), false, 'no "Transfers between pots" card');
    assert.equal(pots.includes('TransferEditForm'), false);
    assert.match(pots, /redirect\(\s*transferActivityHref\(/, 'old ?transfer= links redirect');
  });

  it('keeps the corrected pot on screen after a save (React resets uncontrolled selects)', () => {
    const forms = repoFile('src/components/record-forms.tsx');
    assert.ok(forms.includes('key={fromPotId}'), 'From pot re-mounts on its saved value');
    assert.ok(forms.includes('key={toPotId}'), 'To pot re-mounts on its saved value');
  });

  it('opens and closes through the router without scrolling, one transfer at a time', () => {
    const row = repoFile('src/components/transfer-activity-row.tsx');
    assert.ok(row.includes('router.replace('), 'the router owns the URL, so a save stays put');
    assert.ok(row.includes('scroll: false'));
    assert.doesNotMatch(row, /history\.replaceState\(/, 'never behind the router’s back');
    assert.ok(row.includes('useOptimistic'), 'a click opens at once');
    assert.ok(row.includes('data-transfer-ready'), 'the decision 131 ready signal');
    assert.ok(row.includes('aria-expanded'), 'a disclosure, announced as one');
  });
});
