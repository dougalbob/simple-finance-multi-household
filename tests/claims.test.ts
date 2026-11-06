import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { and, eq, isNull } from 'drizzle-orm';
import {
  auditEntries,
  claimSettlements,
  purchases as purchasesTable,
  receipts,
} from '../src/lib/db/schema';
import {
  attachClaimPurchases,
  ClaimNotFoundError,
  ClaimNotOpenError,
  ClaimOverSettledError,
  createClaim,
  detachClaimPurchase,
  editClaim,
  listClaimablePurchases,
  listClaims,
  claimsSummary,
  settleClaim,
  voidClaim,
  voidSettlement,
  InvalidClaimInputError,
} from '../src/lib/records/claims';
import { createDebt, debtBalance } from '../src/lib/records/debts';
import { createExternalMovement } from '../src/lib/records/external-movements';
import { createPurchase, createRefund } from '../src/lib/records/purchases';
import { VersionConflictError } from '../src/lib/records/errors';
import { createHouseholdFixture, type HouseholdFixture } from './household';

const ACTOR = 'alex@example.com';
// Purchases dated 15–27.09; every write is entered later than the dates it
// carries (records cannot be dated in the future — SPEC §7.1).
const ENTRY_NOW = new Date('2026-11-25T17:00:00Z');
const P1 = new Date('2026-09-15T12:00:00Z');
const P2 = new Date('2026-09-22T12:00:00Z');
const P3 = new Date('2026-09-27T12:00:00Z');

function buy(
  fx: HouseholdFixture,
  totalPence: number,
  occurredAt: Date,
  supplierName = 'The Crown',
) {
  return createPurchase(fx.db, {
    supplierName,
    potId: fx.pots.main.id,
    totalPence,
    paidByPersonId: fx.people.alex.id,
    occurredAt,
    lines: [
      {
        amountPence: totalPence,
        categoryId: fx.categoryId('Groceries', 'Weekly Shop'),
        targetKind: 'household',
      },
    ],
    actor: ACTOR,
    now: ENTRY_NOW,
  }).purchase;
}

function everyoneOwesClaim(fx: HouseholdFixture, purchaseIds: number[]) {
  return createClaim(fx.db, {
    counterparty: "Mum's estate",
    note: 'wake costs',
    purchaseIds,
    actor: ACTOR,
    now: ENTRY_NOW,
  });
}

describe('Money owed to us — tracked reimbursement claims (issue #124)', () => {
  it('derives the outstanding from the linked purchases and never stores it', async () => {
    const fx = await createHouseholdFixture();
    try {
      const p1 = buy(fx, 12500, P1);
      const p2 = buy(fx, 24999, P2, 'The Swan');
      const claim = everyoneOwesClaim(fx, [p1.id, p2.id]);

      assert.equal(claim.claim.status, 'open');
      assert.equal(claim.claimedPence, 37499);
      assert.equal(claim.settledPence, 0);
      assert.equal(claim.outstandingPence, 37499);
      assert.equal(claim.purchases.length, 2);
      assert.equal(claim.settlements.length, 0);

      // The spend itself is untouched — the claim is a second record, not a
      // rewrite of history.
      const spendTotal = fx.db
        .select()
        .from(purchasesTable)
        .all()
        .filter((row) => row.voidedAt === null)
        .reduce((sum, row) => sum + row.totalPence, 0);
      assert.equal(spendTotal, 37499);
    } finally {
      fx.close();
    }
  });

  it('keeps claimed purchases out of the picker, refunds out too, and releases them on void', async () => {
    const fx = await createHouseholdFixture();
    try {
      const p1 = buy(fx, 9375, P1);
      const p2 = buy(fx, 8000, P2);
      // A refund of p2 — never claimable (the household is not owed its own
      // money twice).
      createRefund(fx.db, {
        refundOfPurchaseId: p2.id,
        totalPence: -2000,
        lines: [
          {
            amountPence: -2000,
            categoryId: fx.categoryId('Groceries', 'Weekly Shop'),
            targetKind: 'household',
          },
        ],
        actor: ACTOR,
        now: ENTRY_NOW,
      });

      let claimable = listClaimablePurchases(fx.db).map((row) => row.id);
      assert.deepEqual(
        claimable.sort((a, b) => a - b),
        [p1.id, p2.id].sort((a, b) => a - b),
      );

      const claim = everyoneOwesClaim(fx, [p1.id]);
      claimable = listClaimablePurchases(fx.db).map((row) => row.id);
      assert.deepEqual(claimable, [p2.id]);

      voidClaim(fx.db, {
        id: claim.claim.id,
        expectedVersion: claim.claim.version,
        reason: 'wrong purchase',
        actor: ACTOR,
        now: ENTRY_NOW,
      });
      claimable = listClaimablePurchases(fx.db).map((row) => row.id);
      assert.deepEqual(
        claimable.sort((a, b) => a - b),
        [p1.id, p2.id].sort((a, b) => a - b),
      );
    } finally {
      fx.close();
    }
  });

  it('refuses a purchase already on a live claim (one claim per purchase)', async () => {
    const fx = await createHouseholdFixture();
    try {
      const p1 = buy(fx, 5000, P1);
      everyoneOwesClaim(fx, [p1.id]);
      assert.throws(() => everyoneOwesClaim(fx, [p1.id]), /another live claim/i);
    } finally {
      fx.close();
    }
  });

  it('settles into a pot in one action: audited one-off income, claim auto-closes', async () => {
    const fx = await createHouseholdFixture();
    try {
      const p1 = buy(fx, 15000, P1);
      const p2 = buy(fx, 22500, P2);
      const claim = everyoneOwesClaim(fx, [p1.id, p2.id]);
      const beforeReceipts = fx.db.select().from(receipts).all().length;

      const result = settleClaim(fx.db, {
        id: claim.claim.id,
        kind: 'pot',
        potId: fx.pots.main.id,
        expectedVersion: claim.claim.version,
        amountPence: claim.outstandingPence,
        note: 'estate paid into the main account',
        actor: ACTOR,
        now: ENTRY_NOW,
        occurredDate: '2026-11-20',
        occurredAt: new Date('2026-11-20T12:00:00Z'),
      });

      assert.equal(result.claim.claim.status, 'closed');
      assert.equal(result.claim.claim.closedReason, 'settled');
      assert.equal(result.claim.settledPence, 37500);
      assert.equal(result.receiptId === null, false);

      // One new receipt, linked by source to the counterparty — income, not spending.
      const after = fx.db.select().from(receipts).all();
      assert.equal(after.length, beforeReceipts + 1);
      const income = after.find((row) => row.id === result.receiptId);
      assert.equal(income?.amountPence, 37500);
      assert.equal(income?.source, "Mum's estate");

      // The receipt is audited like any other income.
      const receiptAudit = fx.db
        .select()
        .from(auditEntries)
        .where(eq(auditEntries.entity, 'receipt'))
        .all()
        .filter((row) => row.entityId === String(result.receiptId));
      assert.equal(receiptAudit.length, 1);
    } finally {
      fx.close();
    }
  });

  it('settles outside the pots: IOU drops by the same amount, no receipt is recorded', async () => {
    const fx = await createHouseholdFixture();
    try {
      const sis = createDebt(fx.db, {
        counterparty: 'Sam',
        direction: 'we_owe',
        actor: ACTOR,
        now: NOW_PAST(),
      });
      createExternalMovement(fx.db, {
        potId: fx.pots.alexCash.id,
        direction: 'in',
        kind: 'loan',
        amountPence: 37500,
        debtId: sis.id,
        occurredDate: '2026-08-10',
        occurredAt: new Date('2026-08-10T12:00:00Z'),
        actor: ACTOR,
        now: ENTRY_NOW,
      });
      const p1 = buy(fx, 37500, P1);
      const claim = everyoneOwesClaim(fx, [p1.id]);
      const beforeReceipts = fx.db.select().from(receipts).all().length;

      const result = settleClaim(fx.db, {
        id: claim.claim.id,
        kind: 'direct',
        reduceDebtId: sis.id,
        note: 'estate paid Sam directly — she fronted the money',
        expectedVersion: claim.claim.version,
        actor: ACTOR,
        now: ENTRY_NOW,
        occurredDate: '2026-11-20',
        occurredAt: new Date('2026-11-20T12:00:00Z'),
      });

      assert.equal(result.receiptId, null);
      assert.equal(fx.db.select().from(receipts).all().length, beforeReceipts);
      // The claim is closed and the IOU is cancelled by the same amount.
      assert.equal(result.claim.claim.status, 'closed');
      const balance = debtBalance(fx.db, { ...sis, version: sis.version });
      assert.equal(balance.balancePence, 0);
      // Settlement reduces it in the derived figure, not a stored one.
      const settlement = result.settlement;
      assert.equal(settlement.reducesDebtId, sis.id);
    } finally {
      fx.close();
    }
  });

  it('refuses to settle outside the pots without a destination note', async () => {
    const fx = await createHouseholdFixture();
    try {
      const p1 = buy(fx, 5000, P1);
      const claim = everyoneOwesClaim(fx, [p1.id]);
      assert.throws(
        () =>
          settleClaim(fx.db, {
            id: claim.claim.id,
            kind: 'direct',
            note: '',
            expectedVersion: claim.claim.version,
            actor: ACTOR,
            now: ENTRY_NOW,
          }),
        InvalidClaimInputError,
      );
    } finally {
      fx.close();
    }
  });

  it('refuses over-settlement and settling a closed claim', async () => {
    const fx = await createHouseholdFixture();
    try {
      const p1 = buy(fx, 5000, P1);
      const claim = everyoneOwesClaim(fx, [p1.id]);
      assert.throws(
        () =>
          settleClaim(fx.db, {
            id: claim.claim.id,
            kind: 'pot',
            potId: fx.pots.main.id,
            expectedVersion: claim.claim.version,
            amountPence: 5001,
            actor: ACTOR,
            now: ENTRY_NOW,
          }),
        ClaimOverSettledError,
      );
      settleClaim(fx.db, {
        id: claim.claim.id,
        kind: 'pot',
        potId: fx.pots.main.id,
        expectedVersion: claim.claim.version,
        actor: ACTOR,
        now: ENTRY_NOW,
        occurredDate: '2026-11-20',
        occurredAt: new Date('2026-11-20T12:00:00Z'),
      });
      const reloaded = listClaims(fx.db, { status: 'closed' })[0];
      assert.ok(reloaded !== undefined);
      assert.throws(
        () =>
          settleClaim(fx.db, {
            id: reloaded.claim.id,
            kind: 'pot',
            potId: fx.pots.main.id,
            expectedVersion: reloaded.claim.version,
            actor: ACTOR,
            now: ENTRY_NOW,
            occurredDate: '2026-11-21',
            occurredAt: new Date('2026-11-21T12:00:00Z'),
          }),
        ClaimNotOpenError,
      );
    } finally {
      fx.close();
    }
  });

  it('voiding a settlement reopens the claim and restores the IOU balance', async () => {
    const fx = await createHouseholdFixture();
    try {
      const sis = createDebt(fx.db, {
        counterparty: 'Sam',
        direction: 'we_owe',
        actor: ACTOR,
        now: NOW_PAST(),
      });
      createExternalMovement(fx.db, {
        potId: fx.pots.alexCash.id,
        direction: 'in',
        kind: 'loan',
        amountPence: 10000,
        debtId: sis.id,
        occurredDate: '2026-08-10',
        occurredAt: new Date('2026-08-10T12:00:00Z'),
        actor: ACTOR,
        now: ENTRY_NOW,
      });
      const p1 = buy(fx, 10000, P1);
      const claim = everyoneOwesClaim(fx, [p1.id]);
      const settled = settleClaim(fx.db, {
        id: claim.claim.id,
        kind: 'direct',
        reduceDebtId: sis.id,
        note: 'paid her directly',
        expectedVersion: claim.claim.version,
        actor: ACTOR,
        now: ENTRY_NOW,
        occurredDate: '2026-11-20',
        occurredAt: new Date('2026-11-20T12:00:00Z'),
      });
      assert.equal(settled.claim.claim.status, 'closed');

      const restored = voidSettlement(fx.db, {
        settlementId: settled.settlement.id,
        expectedVersion: settled.settlement.version,
        reason: 'wrong IOU chosen',
        actor: ACTOR,
        now: ENTRY_NOW,
      });
      assert.equal(restored.claim.status, 'open');
      assert.equal(restored.settledPence, 0);
      const balance = debtBalance(fx.db, { ...sis, version: sis.version });
      assert.equal(balance.balancePence, 10000);
    } finally {
      fx.close();
    }
  });

  it('voiding a claim keeps linked income, releases purchases, voids settlements', async () => {
    const fx = await createHouseholdFixture();
    try {
      const p1 = buy(fx, 6000, P1);
      const claim = everyoneOwesClaim(fx, [p1.id]);
      const settled = settleClaim(fx.db, {
        id: claim.claim.id,
        kind: 'pot',
        potId: fx.pots.main.id,
        expectedVersion: claim.claim.version,
        amountPence: 6000,
        actor: ACTOR,
        now: ENTRY_NOW,
        occurredDate: '2026-11-20',
        occurredAt: new Date('2026-11-20T12:00:00Z'),
      });
      const receiptId = settled.receiptId;

      const voided = voidClaim(fx.db, {
        id: claim.claim.id,
        expectedVersion: settled.claim.claim.version,
        reason: 'tracked against the wrong shop',
        actor: ACTOR,
        now: ENTRY_NOW,
      });
      assert.equal(voided.voidedAt !== null, true);

      // Income stayed recorded — the money really arrived.
      const income = fx.db
        .select()
        .from(receipts)
        .all()
        .find((row) => row.id === receiptId);
      assert.equal(income?.voidedAt === null || income?.voidedAt === undefined, true);

      // Settlements voided, purchase released, claim gone from open lists.
      const settlementRows = fx.db
        .select()
        .from(claimSettlements)
        .where(eq(claimSettlements.claimId, claim.claim.id))
        .all();
      assert.equal(
        settlementRows.every((row) => row.voidedAt !== null),
        true,
      );
      assert.deepEqual(
        listClaimablePurchases(fx.db).map((row) => row.id),
        [p1.id],
      );
      assert.equal(listClaims(fx.db, { status: 'open' }).length, 0);
      assert.equal(claimsSummary(fx.db).openCount, 0);
    } finally {
      fx.close();
    }
  });

  it('refuses to detach the last purchase; detaching one of several is fine', async () => {
    const fx = await createHouseholdFixture();
    try {
      const p1 = buy(fx, 4000, P1);
      const p2 = buy(fx, 3000, P2);
      const claim = everyoneOwesClaim(fx, [p1.id, p2.id]);
      const afterDetach = detachClaimPurchase(fx.db, {
        id: claim.claim.id,
        expectedVersion: claim.claim.version,
        purchaseId: p1.id,
        actor: ACTOR,
        now: ENTRY_NOW,
      });
      assert.equal(afterDetach.purchases.length, 1);
      assert.equal(afterDetach.outstandingPence, 3000);
      assert.throws(
        () =>
          detachClaimPurchase(fx.db, {
            id: afterDetach.claim.id,
            expectedVersion: afterDetach.claim.version,
            purchaseId: p2.id,
            actor: ACTOR,
            now: ENTRY_NOW,
          }),
        InvalidClaimInputError,
      );
    } finally {
      fx.close();
    }
  });

  it('attach grows a claim; wrong versions conflict; audit entries record the story', async () => {
    const fx = await createHouseholdFixture();
    try {
      const p1 = buy(fx, 4000, P1);
      const p2 = buy(fx, 3000, P2);
      const claim = everyoneOwesClaim(fx, [p1.id]);

      assert.throws(
        () =>
          attachClaimPurchases(fx.db, {
            id: claim.claim.id,
            expectedVersion: claim.claim.version + 1,
            purchaseIds: [p2.id],
            actor: ACTOR,
            now: ENTRY_NOW,
          }),
        VersionConflictError,
      );

      const grown = attachClaimPurchases(fx.db, {
        id: claim.claim.id,
        expectedVersion: claim.claim.version,
        purchaseIds: [p2.id],
        actor: ACTOR,
        now: ENTRY_NOW,
      });
      assert.equal(grown.outstandingPence, 7000);

      const actions = fx.db
        .select()
        .from(auditEntries)
        .where(eq(auditEntries.entity, 'claim'))
        .all()
        .map((row) => row.action);
      assert.deepEqual(actions.sort(), ['claim-purchase.attach', 'claim.create'].sort());
    } finally {
      fx.close();
    }
  });

  it('editing a claim bumps its version and conflicts on stale writers', async () => {
    const fx = await createHouseholdFixture();
    try {
      const p1 = buy(fx, 4000, P1);
      const claim = everyoneOwesClaim(fx, [p1.id]);
      const edited = editClaim(fx.db, {
        id: claim.claim.id,
        expectedVersion: claim.claim.version,
        patch: { counterparty: 'The estate of Margaret', note: 'invoice 12' },
        actor: ACTOR,
        now: ENTRY_NOW,
      });
      assert.equal(edited.claim.counterparty, 'The estate of Margaret');
      assert.equal(edited.claim.note, 'invoice 12');
      assert.equal(edited.claim.version, claim.claim.version + 1);
      assert.throws(
        () =>
          editClaim(fx.db, {
            id: claim.claim.id,
            expectedVersion: claim.claim.version,
            patch: { note: 'stale' },
            actor: ACTOR,
            now: ENTRY_NOW,
          }),
        VersionConflictError,
      );
      assert.throws(
        () =>
          editClaim(fx.db, {
            id: 999999,
            expectedVersion: 1,
            patch: { note: 'ghost' },
            actor: ACTOR,
            now: ENTRY_NOW,
          }),
        ClaimNotFoundError,
      );
    } finally {
      fx.close();
    }
  });

  it('summary counts only open claims at their true outstanding', async () => {
    const fx = await createHouseholdFixture();
    try {
      const p1 = buy(fx, 10000, P1);
      const p2 = buy(fx, 5000, P3);
      everyoneOwesClaim(fx, [p1.id]);
      const second = createClaim(fx.db, {
        counterparty: 'The insurer',
        purchaseIds: [p2.id],
        actor: ACTOR,
        now: ENTRY_NOW,
      });
      settleClaim(fx.db, {
        id: second.claim.id,
        kind: 'pot',
        potId: fx.pots.main.id,
        expectedVersion: second.claim.version,
        actor: ACTOR,
        now: ENTRY_NOW,
        occurredDate: '2026-11-20',
        occurredAt: new Date('2026-11-20T12:00:00Z'),
      });
      const summary = claimsSummary(fx.db);
      assert.equal(summary.openCount, 1);
      assert.equal(summary.openOutstandingPence, 10000);
    } finally {
      fx.close();
    }
  });
});

/** Fixture-time for debt creation, before any purchases were made. */
function NOW_PAST(): Date {
  return new Date('2026-09-01T17:00:00Z');
}
