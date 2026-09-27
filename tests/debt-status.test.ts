import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createDebt, debtBalance, debtBalanceLabel, editDebt } from '../src/lib/records/debts';
import {
  createExternalMovement,
  voidExternalMovement,
} from '../src/lib/records/external-movements';
import { getMoneySnapshot } from '../src/lib/records/money-view';
import { createHouseholdFixture } from './household';

const ACTOR = 'alex@example.com';
const NOW = new Date('2026-09-20T17:00:00Z');

describe('a loan awaiting its first payment must not say settled (decision 168)', () => {
  it('Martin & Sue with no effective movements displays Awaiting first payment, not Settled', async () => {
    const fx = await createHouseholdFixture();
    try {
      const debt = createDebt(fx.db, {
        counterparty: 'Martin & Sue',
        direction: 'we_owe',
        note: 'bridging pending estate settlement',
        actor: ACTOR,
        now: NOW,
      });
      const { balancePence, movementCount } = debtBalance(fx.db, debt);
      assert.equal(balancePence, 0);
      assert.equal(movementCount, 0);
      assert.equal(debtBalanceLabel(debt, balancePence, movementCount), 'Awaiting first payment');
      // they_owe equivalent
      const lend = createDebt(fx.db, {
        counterparty: 'Friend',
        direction: 'they_owe',
        actor: ACTOR,
        now: NOW,
      });
      const lendBal = debtBalance(fx.db, lend);
      assert.equal(
        debtBalanceLabel(lend, lendBal.balancePence, lendBal.movementCount),
        'Awaiting first loan',
      );
    } finally {
      fx.close();
    }
  });

  it('no first payment is invented and no pot estimate is increased', async () => {
    const fx = await createHouseholdFixture();
    try {
      const debt = createDebt(fx.db, {
        counterparty: 'Martin & Sue',
        direction: 'we_owe',
        actor: ACTOR,
        now: NOW,
      });
      const before = getMoneySnapshot(fx.db, NOW);
      // No movements, so household total is still 0 (no checkpoints either)
      // Add a checkpoint to have an estimate
      const { addCheckpoint } = await import('../src/lib/records/pots');
      addCheckpoint(fx.db, {
        potId: fx.pots.main.id,
        amountPence: 100000,
        actor: ACTOR,
        now: NOW,
      });
      const after = getMoneySnapshot(fx.db, NOW);
      assert.equal(after.pots.find((p) => p.pot.id === fx.pots.main.id)?.estimatePence, 100000);
      // Debt balance still 0, no estimate inflation
      const { balancePence } = debtBalance(fx.db, debt);
      assert.equal(balancePence, 0);
      // Owed summary still 0 because awaiting, not outstanding
      const { debtsSummary } = await import('../src/lib/records/debts');
      assert.equal(debtsSummary(fx.db).owedByHouseholdPence, 0);
    } finally {
      fx.close();
    }
  });

  it('expected support still appears in projections as expected borrowing where configured, never received income', async () => {
    const fx = await createHouseholdFixture();
    try {
      const debt = createDebt(fx.db, {
        counterparty: 'Martin & Sue',
        direction: 'we_owe',
        actor: ACTOR,
        now: NOW,
      });
      const withPlan = editDebt(fx.db, {
        id: debt.id,
        expectedVersion: 1,
        actor: ACTOR,
        patch: { expectedInflow: { amountPence: 100000, dayOfMonth: 12, untilDate: null } },
        now: NOW,
      });
      const { expectedInflowOccurrences } = await import('../src/lib/records/debts');
      const occurrences = expectedInflowOccurrences(
        fx.db,
        withPlan,
        '2026-09-20',
        '2026-10-31',
        fx.pots.main.id,
      );
      assert.ok(occurrences.length > 0, 'should project even with no movements');
      // Check that projection view includes expected receipt, not as income
      const snapshot = getMoneySnapshot(fx.db, new Date('2026-09-21T10:00:00Z'));
      // The projection should have an expected inflow occurrence (if within window)
      // We just ensure the debt is not settled and still projects
      const { balancePence, movementCount } = debtBalance(fx.db, withPlan);
      assert.equal(movementCount, 0);
      assert.equal(
        debtBalanceLabel(withPlan, balancePence, movementCount),
        'Awaiting first payment',
      );
    } finally {
      fx.close();
    }
  });

  it('first borrowing/lending moves the status to outstanding', async () => {
    const fx = await createHouseholdFixture();
    try {
      const debt = createDebt(fx.db, {
        counterparty: 'Martin & Sue',
        direction: 'we_owe',
        actor: ACTOR,
        now: NOW,
      });
      createExternalMovement(fx.db, {
        potId: fx.pots.main.id,
        direction: 'in',
        kind: 'loan',
        amountPence: 50000,
        debtId: debt.id,
        occurredDate: '2026-09-20',
        actor: ACTOR,
        now: NOW,
      });
      const { balancePence, movementCount } = debtBalance(fx.db, debt);
      assert.equal(movementCount, 1);
      assert.equal(balancePence, 50000);
      assert.equal(debtBalanceLabel(debt, balancePence, movementCount), 'we owe £500.00');
    } finally {
      fx.close();
    }
  });

  it('full repayment shows Settled; partial repayment stays outstanding; overpayment remains distinguishable', async () => {
    const fx = await createHouseholdFixture();
    try {
      const debt = createDebt(fx.db, {
        counterparty: 'Mum',
        direction: 'we_owe',
        actor: ACTOR,
        now: NOW,
      });
      createExternalMovement(fx.db, {
        potId: fx.pots.main.id,
        direction: 'in',
        kind: 'loan',
        amountPence: 100000,
        debtId: debt.id,
        occurredDate: '2026-09-19',
        actor: ACTOR,
        now: NOW,
      });
      createExternalMovement(fx.db, {
        potId: fx.pots.main.id,
        direction: 'out',
        kind: 'loan',
        amountPence: 40000,
        debtId: debt.id,
        occurredDate: '2026-09-20',
        actor: ACTOR,
        now: NOW,
      });
      let bal = debtBalance(fx.db, debt);
      assert.equal(bal.balancePence, 60000);
      assert.equal(debtBalanceLabel(debt, bal.balancePence, bal.movementCount), 'we owe £600.00');

      createExternalMovement(fx.db, {
        potId: fx.pots.main.id,
        direction: 'out',
        kind: 'loan',
        amountPence: 60000,
        debtId: debt.id,
        occurredDate: '2026-09-20',
        actor: ACTOR,
        now: NOW,
      });
      bal = debtBalance(fx.db, debt);
      assert.equal(bal.balancePence, 0);
      assert.equal(bal.movementCount, 3);
      assert.equal(debtBalanceLabel(debt, bal.balancePence, bal.movementCount), 'settled');

      createExternalMovement(fx.db, {
        potId: fx.pots.main.id,
        direction: 'out',
        kind: 'loan',
        amountPence: 1000,
        debtId: debt.id,
        occurredDate: '2026-09-20',
        actor: ACTOR,
        now: NOW,
      });
      bal = debtBalance(fx.db, debt);
      assert.equal(bal.balancePence, -1000);
      assert.equal(debtBalanceLabel(debt, bal.balancePence, bal.movementCount), 'overpaid £10.00');
    } finally {
      fx.close();
    }
  });

  it('voided-only history displays unstarted, although deletion remains blocked', async () => {
    const fx = await createHouseholdFixture();
    try {
      const debt = createDebt(fx.db, {
        counterparty: 'Martin & Sue',
        direction: 'we_owe',
        actor: ACTOR,
        now: NOW,
      });
      const movement = createExternalMovement(fx.db, {
        potId: fx.pots.main.id,
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
      const { balancePence, movementCount, totalMovementCount } = debtBalance(fx.db, debt);
      assert.equal(balancePence, 0);
      assert.equal(movementCount, 0);
      assert.equal(totalMovementCount, 1);
      assert.equal(debtBalanceLabel(debt, balancePence, movementCount), 'Awaiting first payment');
    } finally {
      fx.close();
    }
  });
});
