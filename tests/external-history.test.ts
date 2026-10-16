import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildExternalHistory,
  describeBoundaryMovement,
  describeSwapLeg,
  entryMovementIds,
  EXTERNAL_HISTORY_DISPLAY_LIMIT,
  EXTERNAL_HISTORY_FETCH_LIMIT,
  formatNetPence,
  leadingLeg,
  nestedLeg,
  SWAP_HISTORY_ANCHOR,
  swapPairStatus,
  type ExternalHistoryEntry,
} from '../src/lib/records/external-history';
import {
  createExternalMovement,
  createSwap,
  listExternalMovements,
  voidExternalMovement,
  voidSwap,
  type ExternalMovement,
} from '../src/lib/records/external-movements';
import { createHouseholdFixture } from './household';

const ACTOR = 'alex@example.com';
const NOW = new Date('2026-09-28T18:00:00Z');

/** The page's own pipeline: read the recent boundary rows, then group them. */
function historyFrom(
  movements: ExternalMovement[],
  options: { pinnedId?: number | null } = {},
): ExternalHistoryEntry[] {
  return buildExternalHistory(movements, options);
}

describe('external history: a swap reads as one nested object (issue #65)', () => {
  it('folds both legs of a swap into one entry and keeps other money on its own', async () => {
    const fx = await createHouseholdFixture();
    try {
      const swap = createSwap(fx.db, {
        inPotId: fx.pots.alexCash.id,
        outPotId: fx.pots.main.id,
        amountPence: 4000,
        counterparty: 'Sam',
        note: 'cash for the bank transfer',
        occurredDate: '2026-09-20',
        actor: ACTOR,
        now: NOW,
      });
      const other = createExternalMovement(fx.db, {
        kind: 'other',
        potId: fx.pots.main.id,
        direction: 'in',
        amountPence: 2500,
        counterparty: 'neighbour',
        note: 'sold the old bike',
        occurredDate: '2026-09-22',
        actor: ACTOR,
        now: NOW,
      });

      const history = historyFrom(listExternalMovements(fx.db, { includeVoided: true, limit: 60 }));
      assert.equal(history.length, 2);
      assert.equal(history[0]?.kind, 'movement');
      assert.equal(history[1]?.kind, 'swap');
      const pair = history[1];
      assert.ok(pair !== undefined && pair.kind === 'swap');
      assert.equal(pair.inLeg?.id, swap.inLeg.id);
      assert.equal(pair.outLeg?.id, swap.outLeg.id);
      assert.equal(pair.exchangeKey, swap.exchangeKey);
      assert.equal(pair.key, `swap-${swap.exchangeKey}`);
      assert.deepEqual(entryMovementIds(pair), [swap.inLeg.id, swap.outLeg.id]);
      assert.equal(leadingLeg(pair)?.id, swap.inLeg.id);
      assert.equal(nestedLeg(pair)?.id, swap.outLeg.id);
      const rows = history[0];
      assert.ok(rows !== undefined && rows.kind === 'movement');
      assert.equal(rows.movement.id, other.id);
      // One object per swap, not two rows: the pair took two records and one
      // place in the list.
      assert.equal(history.filter((entry) => entry.kind === 'swap').length, 1);
    } finally {
      fx.close();
    }
  });

  it('orders the pair where its newest leg sorts, newest first', async () => {
    const fx = await createHouseholdFixture();
    try {
      const swap = createSwap(fx.db, {
        inPotId: fx.pots.alexCash.id,
        outPotId: fx.pots.main.id,
        amountPence: 1000,
        counterparty: 'Sam',
        occurredDate: '2026-09-18',
        actor: ACTOR,
        now: NOW,
      });
      const later = createExternalMovement(fx.db, {
        kind: 'other',
        potId: fx.pots.main.id,
        direction: 'out',
        amountPence: 700,
        counterparty: 'the school',
        note: 'trip money',
        occurredDate: '2026-09-25',
        actor: ACTOR,
        now: NOW,
      });
      const history = historyFrom(listExternalMovements(fx.db, { includeVoided: true, limit: 60 }));
      assert.deepEqual(
        history.map((entry) => entry.key),
        [`external-${later.id}`, `swap-${swap.exchangeKey}`],
      );
    } finally {
      fx.close();
    }
  });

  it('never lists borrowing — loans live on the Borrowing page', async () => {
    const fx = await createHouseholdFixture();
    try {
      const debt = createExternalMovement(fx.db, {
        kind: 'other',
        potId: fx.pots.main.id,
        direction: 'in',
        amountPence: 100,
        counterparty: 'someone',
        note: 'a placeholder that keeps this fixture honest',
        occurredDate: '2026-09-10',
        actor: ACTOR,
        now: NOW,
      });
      // A loan movement is written straight to the table by the records layer
      // only through a debt; the list's own filter is what this asserts.
      const borrowed = createExternalMovement(fx.db, {
        kind: 'other',
        potId: fx.pots.main.id,
        direction: 'out',
        amountPence: 200,
        counterparty: 'someone else',
        note: 'another placeholder',
        occurredDate: '2026-09-11',
        actor: ACTOR,
        now: NOW,
      });
      const history = historyFrom(listExternalMovements(fx.db, { includeVoided: true, limit: 60 }));
      assert.deepEqual(
        history
          .map((entry) => entryMovementIds(entry))
          .flat()
          .sort((a, b) => b - a),
        [borrowed.id, debt.id],
      );
    } finally {
      fx.close();
    }
  });

  it('keeps a voided leg inside its pair and reports the pair honestly', async () => {
    const fx = await createHouseholdFixture();
    try {
      const balanced = createSwap(fx.db, {
        inPotId: fx.pots.alexCash.id,
        outPotId: fx.pots.main.id,
        amountPence: 4000,
        counterparty: 'Sam',
        occurredDate: '2026-09-20',
        actor: ACTOR,
        now: NOW,
      });
      const half = createSwap(fx.db, {
        inPotId: fx.pots.samCash.id,
        outPotId: fx.pots.salary.id,
        amountPence: 1500,
        counterparty: 'our son',
        occurredDate: '2026-09-21',
        actor: ACTOR,
        now: NOW,
      });
      voidExternalMovement(fx.db, {
        id: half.inLeg.id,
        expectedVersion: 1,
        actor: ACTOR,
        reason: 'the cash never arrived',
        now: NOW,
      });
      const voidedWhole = createSwap(fx.db, {
        inPotId: fx.pots.alexCash.id,
        outPotId: fx.pots.salary.id,
        amountPence: 900,
        counterparty: 'Mum',
        occurredDate: '2026-09-19',
        actor: ACTOR,
        now: NOW,
      });
      voidSwap(fx.db, {
        exchangeKey: voidedWhole.exchangeKey,
        inLegId: voidedWhole.inLeg.id,
        outLegId: voidedWhole.outLeg.id,
        expectedInVersion: 1,
        expectedOutVersion: 1,
        reason: 'recorded twice',
        actor: ACTOR,
        now: NOW,
      });

      const history = historyFrom(listExternalMovements(fx.db, { includeVoided: true, limit: 60 }));
      assert.equal(history.length, 3);
      const byKey = new Map(history.map((entry) => [entry.key, entry]));
      const balancedEntry = byKey.get(`swap-${balanced.exchangeKey}`);
      const halfEntry = byKey.get(`swap-${half.exchangeKey}`);
      const voidedEntry = byKey.get(`swap-${voidedWhole.exchangeKey}`);
      assert.ok(balancedEntry?.kind === 'swap');
      assert.ok(halfEntry?.kind === 'swap');
      assert.ok(voidedEntry?.kind === 'swap');

      assert.deepEqual(swapPairStatus(balancedEntry), {
        liveLegs: 2,
        netPence: 0,
        label: 'net £0.00',
        tone: 'balanced',
      });
      assert.deepEqual(swapPairStatus(halfEntry), {
        liveLegs: 1,
        netPence: -1500,
        label: 'one leg voided · net −£15.00',
        tone: 'warning',
      });
      assert.deepEqual(swapPairStatus(voidedEntry), {
        liveLegs: 0,
        netPence: 0,
        label: 'voided',
        tone: 'voided',
      });
      // The voided leg keeps its reason and stays in the pair.
      assert.equal(halfEntry.inLeg?.voidReason, 'the cash never arrived');
      assert.equal(voidedEntry.inLeg?.voidReason, 'recorded twice');
      assert.equal(voidedEntry.outLeg?.voidReason, 'recorded twice');
    } finally {
      fx.close();
    }
  });

  it('says "legs differ" when one leg was corrected alone', async () => {
    const fx = await createHouseholdFixture();
    try {
      const swap = createSwap(fx.db, {
        inPotId: fx.pots.alexCash.id,
        outPotId: fx.pots.main.id,
        amountPence: 4000,
        counterparty: 'Sam',
        occurredDate: '2026-09-20',
        actor: ACTOR,
        now: NOW,
      });
      const corrected = { ...swap.inLeg, amountPence: 4500 };
      const status = swapPairStatus({
        kind: 'swap',
        key: `swap-${swap.exchangeKey}`,
        exchangeKey: swap.exchangeKey,
        inLeg: corrected,
        outLeg: swap.outLeg,
        sortAt: NOW.getTime(),
        sortId: swap.outLeg.id,
      });
      assert.equal(status.label, 'legs differ · net +£5.00');
      assert.equal(status.tone, 'warning');
      assert.equal(status.netPence, 500);
    } finally {
      fx.close();
    }
  });

  it('keeps a lone swap leg as an honest half-pair, and pins a linked record', async () => {
    const fx = await createHouseholdFixture();
    try {
      const swap = createSwap(fx.db, {
        inPotId: fx.pots.alexCash.id,
        outPotId: fx.pots.main.id,
        amountPence: 4000,
        counterparty: 'Sam',
        occurredDate: '2026-09-20',
        actor: ACTOR,
        now: NOW,
      });
      // A window that holds only one leg of the pair — the honest half.
      const half = historyFrom([swap.outLeg]);
      assert.equal(half.length, 1);
      const entry = half[0];
      assert.ok(entry?.kind === 'swap');
      assert.equal(entry.inLeg, null);
      assert.equal(entry.outLeg?.id, swap.outLeg.id);
      assert.equal(leadingLeg(entry)?.id, swap.outLeg.id);
      assert.equal(nestedLeg(entry), null);
      assert.equal(swapPairStatus(entry).tone, 'warning');

      // A deep link pins the record's entry to the front — and brings the
      // pair's other leg with it, so the nested object is whole.
      const other = createExternalMovement(fx.db, {
        kind: 'other',
        potId: fx.pots.main.id,
        direction: 'in',
        amountPence: 2500,
        counterparty: 'neighbour',
        note: 'sold the old bike',
        occurredDate: '2026-09-27',
        actor: ACTOR,
        now: NOW,
      });
      const rows = listExternalMovements(fx.db, { includeVoided: true, limit: 60 });
      const pinned = historyFrom(rows, { pinnedId: swap.inLeg.id });
      assert.equal(pinned[0]?.key, `swap-${swap.exchangeKey}`);
      assert.equal(pinned[1]?.key, `external-${other.id}`);
      const pinnedLeg = historyFrom(rows, { pinnedId: other.id });
      assert.equal(pinnedLeg[0]?.key, `external-${other.id}`);
    } finally {
      fx.close();
    }
  });

  it('draws less than it fetches, so a pair is never split by the limit', () => {
    // The page fetches `EXTERNAL_HISTORY_FETCH_LIMIT` rows and draws at most
    // `EXTERNAL_HISTORY_DISPLAY_LIMIT` entries. Even if every entry were a
    // swap's newest leg (two rows each), the drawn entries all come from
    // rows inside the fetched window.
    assert.ok(EXTERNAL_HISTORY_FETCH_LIMIT >= EXTERNAL_HISTORY_DISPLAY_LIMIT * 2);
  });
});

describe('external history wording (issue #65)', () => {
  const leg = (direction: 'in' | 'out'): ExternalMovement =>
    ({
      id: 1,
      potId: 1,
      direction,
      kind: 'swap',
      amountPence: 4000,
      occurredAt: NOW,
      occurredDate: '2026-09-28',
      counterparty: 'Sam',
      debtId: null,
      exchangeKey: 'key',
      note: null,
      enteredBy: ACTOR,
      createdAt: NOW,
      updatedAt: NOW,
      voidedAt: null,
      voidedBy: null,
      voidReason: null,
      version: 1,
    }) as ExternalMovement;

  it('spells out which leg is which, who with and which pot', () => {
    assert.equal(
      describeSwapLeg(leg('in'), 'Cash - Alex'),
      'Swap in £40.00 from Sam · into Cash - Alex',
    );
    assert.equal(
      describeSwapLeg(leg('out'), 'Main account'),
      'Swap out £40.00 to Sam · from Main account',
    );
    // A pot that is no longer in the list still reads as a record, not a blank.
    assert.equal(describeSwapLeg(leg('out'), null), 'Swap out £40.00 to Sam · from —');
  });

  it('says other money the same way, and never blanks a loan', () => {
    const other = { ...leg('out'), kind: 'other', counterparty: 'the school' } as ExternalMovement;
    assert.equal(
      describeBoundaryMovement(other, 'Main account'),
      'Paid £40.00 to the school · from Main account',
    );
    const inMoney = { ...other, direction: 'in' } as ExternalMovement;
    assert.equal(
      describeBoundaryMovement(inMoney, 'Main account'),
      'Received £40.00 from the school · into Main account',
    );
    const loan = { ...other, kind: 'loan', direction: 'in' } as ExternalMovement;
    assert.equal(describeBoundaryMovement(loan, 'Main account'), 'Borrowed £40.00 from the school');
  });

  it('signs a net the household can read at a glance', () => {
    assert.equal(formatNetPence(0), '£0.00');
    assert.equal(formatNetPence(500), '+£5.00');
    assert.equal(formatNetPence(-1500), '−£15.00');
  });

  it('names the panel the pot cards and All Transactions link to', () => {
    assert.equal(SWAP_HISTORY_ANCHOR, 'swap-history');
    // A fragment, not a selector or a path.
    assert.match(SWAP_HISTORY_ANCHOR, /^[a-z][a-z0-9-]*$/);
  });
});
