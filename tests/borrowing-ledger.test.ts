import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildBorrowingLedger,
  describeLoanMovement,
  formatSignedBalancePence,
  potLandingPhrase,
  signedBalancePence,
  type BorrowingExpectedRow,
  type BorrowingMovementRow,
} from '../src/lib/records/borrowing';
import { evaluateOutflowSanityCheck } from '../src/components/borrowing-forms';
import { createDebt, editDebt } from '../src/lib/records/debts';
import {
  createExternalMovement,
  voidExternalMovement,
} from '../src/lib/records/external-movements';
import { createHouseholdFixture } from './household';

const ACTOR = 'alex@example.com';
const NOW = new Date('2026-09-20T17:00:00Z');
// Movements in these stories are dated after NOW; a record cannot be dated in
// the future of the moment it is entered (SPEC §7.1), so they are entered
// later than the dates they carry.
const RECORD_NOW = new Date('2026-11-25T17:00:00Z');

function movementRows(rows: readonly { kind: string }[]): BorrowingMovementRow[] {
  return rows.filter((row): row is BorrowingMovementRow => row.kind === 'movement');
}

function expectedRows(rows: readonly { kind: string }[]): BorrowingExpectedRow[] {
  return rows.filter((row): row is BorrowingExpectedRow => row.kind === 'expected');
}

describe('the borrowing ledger reshape (GitHub issue #60)', () => {
  it('draws the running balance per debt, signed as the household’s tables: − we owe, + owed to us', async () => {
    const fx = await createHouseholdFixture();
    try {
      const mum = createDebt(fx.db, {
        counterparty: 'Dave and Maggie',
        direction: 'we_owe',
        actor: ACTOR,
        now: NOW,
      });
      const son = createDebt(fx.db, {
        counterparty: 'Our son',
        direction: 'they_owe',
        actor: ACTOR,
        now: NOW,
      });
      // Dave and Maggie's £1,000 on the 15.08, £1,000 on 15.09, then £500 repaid on 25.10.
      for (const [date, direction, pence] of [
        ['2026-08-15', 'in', 100000],
        ['2026-09-15', 'in', 100000],
        ['2026-10-25', 'out', 50000],
      ] as const) {
        createExternalMovement(fx.db, {
          potId: fx.pots.main.id,
          direction,
          kind: 'loan',
          amountPence: pence,
          debtId: mum.id,
          occurredDate: date,
          occurredAt: new Date(`${date}T12:00:00Z`),
          actor: ACTOR,
          now: RECORD_NOW,
        });
      }
      // Our son borrows £75 on 22.08 and repays £25 on 26.10.
      createExternalMovement(fx.db, {
        potId: fx.pots.alexCash.id,
        direction: 'out',
        kind: 'loan',
        amountPence: 7500,
        debtId: son.id,
        occurredDate: '2026-08-22',
        occurredAt: new Date('2026-08-22T12:00:00Z'),
        actor: ACTOR,
        now: RECORD_NOW,
      });
      createExternalMovement(fx.db, {
        potId: fx.pots.alexCash.id,
        direction: 'in',
        kind: 'loan',
        amountPence: 2500,
        debtId: son.id,
        occurredDate: '2026-10-26',
        occurredAt: new Date('2026-10-26T12:00:00Z'),
        actor: ACTOR,
        now: RECORD_NOW,
      });

      const { rows } = buildBorrowingLedger(fx.db, { today: '2026-10-27', order: 'oldest' });
      assert.deepEqual(
        movementRows(rows).map((row) => [row.date, row.counterparty, row.runningBalancePence]),
        [
          ['2026-08-15', 'Dave and Maggie', -100000],
          ['2026-08-22', 'Our son', 7500],
          ['2026-09-15', 'Dave and Maggie', -200000],
          ['2026-10-25', 'Dave and Maggie', -150000],
          ['2026-10-26', 'Our son', 5000],
        ],
      );
      // Newest first is the default (issue #68) and reverses the display
      // order, never the balances.
      const newest = buildBorrowingLedger(fx.db, { today: '2026-10-27' });
      assert.deepEqual(
        movementRows(newest.rows).map((row) => row.date),
        ['2026-10-26', '2026-10-25', '2026-09-15', '2026-08-22', '2026-08-15'],
      );
      assert.equal(movementRows(newest.rows)[0]?.runningBalancePence, 5000);
    } finally {
      fx.close();
    }
  });

  it('the From/To filter keeps one person’s rows and every chip keeps its position', async () => {
    const fx = await createHouseholdFixture();
    try {
      const mum = createDebt(fx.db, {
        counterparty: 'Dave and Maggie',
        direction: 'we_owe',
        actor: ACTOR,
        now: NOW,
      });
      createDebt(fx.db, { counterparty: 'Our son', direction: 'they_owe', actor: ACTOR, now: NOW });
      createExternalMovement(fx.db, {
        potId: fx.pots.main.id,
        direction: 'in',
        kind: 'loan',
        amountPence: 100000,
        debtId: mum.id,
        occurredDate: '2026-08-15',
        occurredAt: new Date('2026-08-15T12:00:00Z'),
        actor: ACTOR,
        now: RECORD_NOW,
      });
      const all = buildBorrowingLedger(fx.db, { today: '2026-10-27' });
      assert.deepEqual(
        all.people.map((person) => [person.label, person.positionLabel]),
        [
          ['Dave and Maggie', 'we owe £1,000.00'],
          ['Our son', 'Awaiting first loan'],
        ],
      );
      const filtered = buildBorrowingLedger(fx.db, { today: '2026-10-27', who: 'Our son' });
      // The chips still list everyone; only the rows filter.
      assert.deepEqual(
        filtered.people.map((person) => person.label),
        ['Dave and Maggie', 'Our son'],
      );
      assert.equal(filtered.rows.length, 0);
    } finally {
      fx.close();
    }
  });

  it('a voided row keeps its place in the history and moves no balance', async () => {
    const fx = await createHouseholdFixture();
    try {
      const mum = createDebt(fx.db, {
        counterparty: 'Dave and Maggie',
        direction: 'we_owe',
        actor: ACTOR,
        now: NOW,
      });
      const borrowed = createExternalMovement(fx.db, {
        potId: fx.pots.main.id,
        direction: 'in',
        kind: 'loan',
        amountPence: 100000,
        debtId: mum.id,
        occurredDate: '2026-08-15',
        occurredAt: new Date('2026-08-15T12:00:00Z'),
        actor: ACTOR,
        now: RECORD_NOW,
      });
      const twice = createExternalMovement(fx.db, {
        potId: fx.pots.main.id,
        direction: 'in',
        kind: 'loan',
        amountPence: 40000,
        debtId: mum.id,
        occurredDate: '2026-09-15',
        occurredAt: new Date('2026-09-15T12:00:00Z'),
        actor: ACTOR,
        now: RECORD_NOW,
      });
      voidExternalMovement(fx.db, {
        id: twice.id,
        expectedVersion: twice.version,
        reason: 'recorded twice',
        actor: ACTOR,
        now: NOW,
      });
      const { rows } = buildBorrowingLedger(fx.db, { today: '2026-10-27' });
      const rowsById = movementRows(rows);
      assert.equal(rowsById.length, 2);
      const voidedRow = rowsById.find((row) => row.id === twice.id);
      assert.ok(voidedRow);
      assert.equal(voidedRow.voided, true);
      assert.equal(voidedRow.runningBalancePence, null);
      // The live row before it keeps its own balance, not the voided one's.
      const liveRow = rowsById.find((row) => row.id === borrowed.id);
      assert.ok(liveRow);
      assert.equal(liveRow.runningBalancePence, -100000);
    } finally {
      fx.close();
    }
  });

  it('projects a plan’s next expected row strictly after today, silenced by the real Borrow and ended by settling', async () => {
    const fx = await createHouseholdFixture();
    try {
      const mum = createDebt(fx.db, {
        counterparty: 'Dave and Maggie',
        direction: 'we_owe',
        actor: ACTOR,
        now: NOW,
      });
      editDebt(fx.db, {
        id: mum.id,
        expectedVersion: mum.version,
        actor: ACTOR,
        now: NOW,
        patch: {
          expectedInflow: { amountPence: 100000, dayOfMonth: 13, untilDate: '2026-12-31' },
        },
      });
      // Today is the 27.10: November projects; October does not. The ledger
      // shows only the **next** expected occurrence (issue #68) — the plan
      // itself still projects every remaining payment into the money views.
      const before = buildBorrowingLedger(fx.db, { today: '2026-10-27' });
      assert.deepEqual(
        expectedRows(before.rows).map((row) => row.date),
        ['2026-11-13'],
      );
      assert.equal(before.people[0]?.nextExpected?.dueDate, '2026-11-13');

      // Record the real Borrow on November's expected date: that month is
      // answered and silences itself — no manual tidy-up.
      createExternalMovement(fx.db, {
        potId: fx.pots.main.id,
        direction: 'in',
        kind: 'loan',
        amountPence: 100000,
        debtId: mum.id,
        occurredDate: '2026-11-13',
        occurredAt: new Date('2026-11-13T12:00:00Z'),
        actor: ACTOR,
        now: RECORD_NOW,
      });
      const answered = buildBorrowingLedger(fx.db, { today: '2026-11-13' });
      assert.deepEqual(
        expectedRows(answered.rows).map((row) => row.date),
        ['2026-12-11'],
      );

      // Repay in full: a settled debt expects nothing at all.
      createExternalMovement(fx.db, {
        potId: fx.pots.main.id,
        direction: 'out',
        kind: 'loan',
        amountPence: 100000,
        debtId: mum.id,
        occurredDate: '2026-11-20',
        occurredAt: new Date('2026-11-20T12:00:00Z'),
        actor: ACTOR,
        now: RECORD_NOW,
      });
      const settled = buildBorrowingLedger(fx.db, { today: '2026-11-20' });
      assert.equal(expectedRows(settled.rows).length, 0);
    } finally {
      fx.close();
    }
  });

  it('groups two IOUs under one person without netting them', async () => {
    const fx = await createHouseholdFixture();
    try {
      const weOwe = createDebt(fx.db, {
        counterparty: 'Dave and Maggie',
        direction: 'we_owe',
        actor: ACTOR,
        now: NOW,
      });
      const theyOwe = createDebt(fx.db, {
        counterparty: 'Dave and Maggie',
        direction: 'they_owe',
        actor: ACTOR,
        now: NOW,
      });
      createExternalMovement(fx.db, {
        potId: fx.pots.main.id,
        direction: 'in',
        kind: 'loan',
        amountPence: 100000,
        debtId: weOwe.id,
        occurredDate: '2026-08-15',
        occurredAt: new Date('2026-08-15T12:00:00Z'),
        actor: ACTOR,
        now: RECORD_NOW,
      });
      createExternalMovement(fx.db, {
        potId: fx.pots.main.id,
        direction: 'out',
        kind: 'loan',
        amountPence: 40000,
        debtId: theyOwe.id,
        occurredDate: '2026-08-20',
        occurredAt: new Date('2026-08-20T12:00:00Z'),
        actor: ACTOR,
        now: RECORD_NOW,
      });
      const { people, rows } = buildBorrowingLedger(fx.db, { today: '2026-10-27' });
      assert.equal(people.length, 1);
      assert.equal(people[0]?.lines.length, 2);
      // "we owe £1,000.00 · owed to us £400.00" — two promises, never £600.
      assert.equal(people[0]?.positionLabel, 'we owe £1,000.00 · owed to us £400.00');
      const balances = movementRows(rows).map((row) => row.runningBalancePence);
      // Newest first is the default (issue #68), so the newer leg reads first.
      assert.deepEqual(balances, [40000, -100000]);
    } finally {
      fx.close();
    }
  });

  it('formats the balance and detail phrases the way the panel speaks', () => {
    assert.equal(signedBalancePence('we_owe', 100000), -100000);
    assert.equal(signedBalancePence('they_owe', 7500), 7500);
    assert.equal(formatSignedBalancePence(null), '—');
    assert.equal(formatSignedBalancePence(0), '£0.00');
    assert.equal(formatSignedBalancePence(-100000), '−£1,000.00');
    assert.equal(formatSignedBalancePence(7500), '£75.00 (owed)');
    assert.equal(
      describeLoanMovement({ direction: 'in', counterparty: 'Dave and Maggie' }, 'we_owe'),
      'Borrowed from Dave and Maggie',
    );
    assert.equal(
      describeLoanMovement({ direction: 'out', counterparty: 'Dave and Maggie' }, 'we_owe'),
      'Repaid Dave and Maggie',
    );
    assert.equal(
      describeLoanMovement({ direction: 'out', counterparty: 'Our son' }, 'they_owe'),
      'Lent to Our son',
    );
    assert.equal(
      describeLoanMovement({ direction: 'in', counterparty: 'Our son' }, 'they_owe'),
      'Our son repaid us',
    );
    assert.equal(
      potLandingPhrase({ label: 'Cash pot', kind: 'cash' }, 'in'),
      'Came in as cash to Cash pot.',
    );
    assert.equal(
      potLandingPhrase({ label: 'Main account', kind: 'bank' }, 'in'),
      'Came in to Main account.',
    );
    assert.equal(
      potLandingPhrase({ label: 'Cash pot', kind: 'cash' }, 'out'),
      'Went out as cash from Cash pot.',
    );
  });

  it('evaluates repayment and outflow sanity checks (overpayment block, cash pot block, bank below-zero warning)', () => {
    const cashPot = { id: 1, label: "Alex's cash", kind: 'cash' as const, estimatePence: 5000 };
    const bankPot = { id: 2, label: 'Main account', kind: 'bank' as const, estimatePence: 75000 };

    // Overpayment on a we_owe repayment (£1,000 against £750 owed) is blocked.
    const overpayWeOwe = evaluateOutflowSanityCheck(bankPot, 'out', '1000.00', {
      debtDirection: 'we_owe',
      balancePence: 75000,
    });
    assert.equal(overpayWeOwe.blocked, true);
    assert.equal(overpayWeOwe.kind, 'overpay-blocked');
    assert.match(overpayWeOwe.message ?? '', /exceeds the £750\.00 currently owed/);

    // Overpayment on a settled debt (£0 owed) is blocked.
    const overpaySettled = evaluateOutflowSanityCheck(bankPot, 'out', '10.00', {
      debtDirection: 'we_owe',
      balancePence: 0,
    });
    assert.equal(overpaySettled.blocked, true);
    assert.equal(overpaySettled.kind, 'overpay-blocked');
    assert.match(overpaySettled.message ?? '', /Nothing is currently owed/);

    // Overpayment on a they_owe repayment (£100 against £50 owed to us) is blocked.
    const overpayTheyOwe = evaluateOutflowSanityCheck(bankPot, 'in', '100.00', {
      debtDirection: 'they_owe',
      balancePence: 5000,
    });
    assert.equal(overpayTheyOwe.blocked, true);
    assert.equal(overpayTheyOwe.kind, 'overpay-blocked');

    // Borrowing more on a we_owe arrangement (direction: 'in') is never an overpayment.
    const borrowMore = evaluateOutflowSanityCheck(bankPot, 'in', '1000.00', {
      debtDirection: 'we_owe',
      balancePence: 75000,
    });
    assert.equal(borrowMore.blocked, false);
    assert.equal(borrowMore.kind, null);

    // Cash pot outflow exceeding estimated cash balance is blocked.
    const cashShortfall = evaluateOutflowSanityCheck(cashPot, 'out', '500.00', {
      debtDirection: 'we_owe',
      balancePence: 75000,
    });
    assert.equal(cashShortfall.blocked, true);
    assert.equal(cashShortfall.kind, 'cash-blocked');
    assert.match(cashShortfall.message ?? '', /only has £50\.00 available — £450\.00 short/);

    // Bank account outflow exceeding estimated bank balance warns without blocking.
    const bankBelowZero = evaluateOutflowSanityCheck(bankPot, 'out', '800.00', {
      debtDirection: 'we_owe',
      balancePence: 100000,
    });
    assert.equal(bankBelowZero.blocked, false);
    assert.equal(bankBelowZero.kind, 'bank-warning');
    assert.match(bankBelowZero.message ?? '', /will take Main account.*below zero to −£50\.00/);
  });
});
