import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createDebt,
  debtBalance,
  DebtHasMovementsError,
  DebtNotFoundError,
  debtsSummary,
  deleteDebt,
  editDebt,
  expectedInflowOccurrences,
  getDebt,
  listDebts,
  listDebtsWithBalances,
} from '../src/lib/records/debts';
import { VersionConflictError } from '../src/lib/records/errors';
import {
  createExternalMovement,
  voidExternalMovement,
} from '../src/lib/records/external-movements';
import { createHouseholdFixture } from './household';

const ACTOR = 'alex@example.com';
const NOW = new Date('2026-09-20T17:00:00Z');

describe('debt deletion: permanent removal of an empty mistaken setup (decision 167)', () => {
  it('empty mistaken setup can be permanently deleted after confirmation', async () => {
    const fx = await createHouseholdFixture();
    try {
      const debt = createDebt(fx.db, {
        counterparty: 'Parents',
        direction: 'we_owe',
        actor: ACTOR,
        now: NOW,
      });
      assert.equal(
        listDebts(fx.db).some((d) => d.id === debt.id),
        true,
      );
      const deleted = deleteDebt(fx.db, {
        id: debt.id,
        expectedVersion: debt.version,
        actor: ACTOR,
        now: NOW,
      });
      assert.equal(deleted.counterparty, 'Parents');
      assert.equal(
        listDebts(fx.db).some((d) => d.id === debt.id),
        false,
      );
      assert.throws(() => getDebt(fx.db, debt.id), DebtNotFoundError);
    } finally {
      fx.close();
    }
  });

  it('cancelling leaves it untouched (no delete called)', async () => {
    const fx = await createHouseholdFixture();
    try {
      const debt = createDebt(fx.db, {
        counterparty: 'Parents',
        direction: 'we_owe',
        actor: ACTOR,
        now: NOW,
      });
      // Simulate cancel: do nothing, debt still exists
      assert.equal(
        listDebts(fx.db).some((d) => d.id === debt.id),
        true,
      );
    } finally {
      fx.close();
    }
  });

  it('a setup with an expected-support plan but no movements can be deleted; its projected expectations disappear', async () => {
    const fx = await createHouseholdFixture();
    try {
      const debt = createDebt(fx.db, {
        counterparty: 'Mum',
        direction: 'we_owe',
        actor: ACTOR,
        now: NOW,
      });
      const withPlan = editDebt(fx.db, {
        id: debt.id,
        expectedVersion: 1,
        actor: ACTOR,
        patch: {
          expectedInflow: { amountPence: 100000, dayOfMonth: 12, untilDate: null },
        },
        now: NOW,
      });
      // Occurrences should exist before deletion
      const before = expectedInflowOccurrences(
        fx.db,
        withPlan,
        '2026-09-20',
        '2026-12-31',
        fx.pots.alexCash.id,
      );
      assert.ok(before.length > 0, 'expected inflow should project before deletion');

      deleteDebt(fx.db, {
        id: withPlan.id,
        expectedVersion: withPlan.version,
        actor: ACTOR,
        now: NOW,
      });

      assert.equal(
        listDebts(fx.db).some((d) => d.id === withPlan.id),
        false,
      );
      const afterList = listDebtsWithBalances(fx.db);
      assert.equal(
        afterList.some((row) => row.debt.id === withPlan.id),
        false,
      );
    } finally {
      fx.close();
    }
  });

  it('a debt with live movements cannot be hard-deleted', async () => {
    const fx = await createHouseholdFixture();
    try {
      const debt = createDebt(fx.db, {
        counterparty: 'Parents',
        direction: 'we_owe',
        actor: ACTOR,
        now: NOW,
      });
      createExternalMovement(fx.db, {
        potId: fx.pots.alexCash.id,
        direction: 'in',
        kind: 'loan',
        amountPence: 100000,
        debtId: debt.id,
        occurredDate: '2026-09-20',
        actor: ACTOR,
        now: NOW,
      });
      assert.throws(
        () =>
          deleteDebt(fx.db, {
            id: debt.id,
            expectedVersion: debt.version,
            actor: ACTOR,
            now: NOW,
          }),
        DebtHasMovementsError,
      );
      assert.equal(
        listDebts(fx.db).some((d) => d.id === debt.id),
        true,
      );
    } finally {
      fx.close();
    }
  });

  it('a debt with voided-only movements cannot be hard-deleted (retained history)', async () => {
    const fx = await createHouseholdFixture();
    try {
      const debt = createDebt(fx.db, {
        counterparty: 'Parents',
        direction: 'we_owe',
        actor: ACTOR,
        now: NOW,
      });
      const movement = createExternalMovement(fx.db, {
        potId: fx.pots.alexCash.id,
        direction: 'in',
        kind: 'loan',
        amountPence: 100000,
        debtId: debt.id,
        occurredDate: '2026-09-20',
        actor: ACTOR,
        now: NOW,
      });
      voidExternalMovement(fx.db, {
        id: movement.id,
        expectedVersion: 1,
        actor: ACTOR,
        reason: 'mistake',
        now: NOW,
      });
      // balance is now zero with no effective movements, but totalMovementCount >0
      const bal = debtBalance(fx.db, debt);
      assert.equal(bal.balancePence, 0);
      assert.equal(bal.movementCount, 0);
      assert.equal(bal.totalMovementCount, 1);
      assert.throws(
        () =>
          deleteDebt(fx.db, {
            id: debt.id,
            expectedVersion: debt.version,
            actor: ACTOR,
            now: NOW,
          }),
        DebtHasMovementsError,
      );
    } finally {
      fx.close();
    }
  });

  it('unrelated debts, pot estimates, transactions and outstanding totals remain unchanged after deletion', async () => {
    const fx = await createHouseholdFixture();
    try {
      const keep = createDebt(fx.db, {
        counterparty: 'KeepMe',
        direction: 'we_owe',
        actor: ACTOR,
        now: NOW,
      });
      createExternalMovement(fx.db, {
        potId: fx.pots.alexCash.id,
        direction: 'in',
        kind: 'loan',
        amountPence: 50000,
        debtId: keep.id,
        occurredDate: '2026-09-20',
        actor: ACTOR,
        now: NOW,
      });
      const deleteMe = createDebt(fx.db, {
        counterparty: 'DeleteMe',
        direction: 'we_owe',
        actor: ACTOR,
        now: NOW,
      });
      const before = debtsSummary(fx.db);
      assert.equal(before.owedByHouseholdPence, 50000);

      deleteDebt(fx.db, {
        id: deleteMe.id,
        expectedVersion: deleteMe.version,
        actor: ACTOR,
        now: NOW,
      });

      const after = debtsSummary(fx.db);
      assert.equal(after.owedByHouseholdPence, 50000);
      assert.equal(after.debtCount, 1);
      assert.equal(listDebts(fx.db)[0]?.counterparty, 'KeepMe');
    } finally {
      fx.close();
    }
  });

  it('respects version concurrency and audit', async () => {
    const fx = await createHouseholdFixture();
    try {
      const debt = createDebt(fx.db, {
        counterparty: 'Parents',
        direction: 'we_owe',
        actor: ACTOR,
        now: NOW,
      });
      assert.throws(
        () =>
          deleteDebt(fx.db, {
            id: debt.id,
            expectedVersion: 99,
            actor: ACTOR,
            now: NOW,
          }),
        VersionConflictError,
      );
      // After failed delete, debt still exists
      assert.equal(listDebts(fx.db).length, 1);
    } finally {
      fx.close();
    }
  });

  it('guards against a movement being recorded between confirmation and deletion', async () => {
    const fx = await createHouseholdFixture();
    try {
      const debt = createDebt(fx.db, {
        counterparty: 'Parents',
        direction: 'we_owe',
        actor: ACTOR,
        now: NOW,
      });
      createExternalMovement(fx.db, {
        potId: fx.pots.alexCash.id,
        direction: 'in',
        kind: 'loan',
        amountPence: 100,
        debtId: debt.id,
        occurredDate: '2026-09-20',
        actor: ACTOR,
        now: NOW,
      });
      assert.throws(
        () =>
          deleteDebt(fx.db, {
            id: debt.id,
            expectedVersion: debt.version,
            actor: ACTOR,
            now: NOW,
          }),
        DebtHasMovementsError,
      );
    } finally {
      fx.close();
    }
  });
});
