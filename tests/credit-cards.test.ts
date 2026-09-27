import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { createHouseholdFixture, type HouseholdFixture } from './household';
import { addCheckpoint, createPot, editPot } from '../src/lib/records/pots';
import { createPurchase } from '../src/lib/records/purchases';
import { createSchedule } from '../src/lib/records/schedules';
import { createTransfer } from '../src/lib/records/transfers';
import {
  getCycleOutlook,
  getHorizonProjectionView,
  getKeyDateAlerts,
  getMoneySnapshot,
  getProjectionView,
} from '../src/lib/records/money-view';
import { getForecastChartView } from '../src/lib/records/charts-view';
import { keyDateMessage } from '../src/lib/records/keydates';
import { creditCardPaymentReminderDate } from '../src/lib/records/credit-cards';

const p = (pounds: number) => Math.round(pounds * 100);
const actor = 'alex@example.com';
const now = new Date('2026-10-01T09:00:00+01:00');

async function addCard(fixture: HouseholdFixture) {
  const card = createPot(fixture.db, {
    label: 'Everyday card',
    kind: 'credit-card',
    overdraftLimitPence: p(1200),
    warningThresholdPence: p(900),
    actor,
    now,
  });
  return card;
}

describe('credit-card pots', () => {
  let fixture: HouseholdFixture;
  after(() => fixture.close());

  it('treats card purchases as spending and a bank payment as a net-zero transfer', async () => {
    fixture = await createHouseholdFixture(actor, now);
    const { db, pots, people } = fixture;
    const card = await addCard(fixture);
    addCheckpoint(db, { potId: pots.main.id, amountPence: p(500), actor, now });
    addCheckpoint(db, { potId: card.id, amountPence: -p(1000), actor, now });

    createPurchase(db, {
      supplierId: null,
      potId: card.id,
      totalPence: p(50),
      paidByPersonId: people.alex.id,
      occurredAt: new Date('2026-10-01T10:00:00+01:00'),
      occurredDate: '2026-10-01',
      lines: [
        {
          amountPence: p(50),
          categoryId: fixture.categoryId('Groceries', 'Weekly Shop'),
          targetKind: 'household',
        },
      ],
      actor,
      now: new Date('2026-10-01T10:00:00+01:00'),
    });
    let snapshot = getMoneySnapshot(db, new Date('2026-10-01T11:00:00+01:00'));
    assert.equal(snapshot.pots.find((entry) => entry.pot.id === card.id)?.estimatePence, -p(1050));
    assert.equal(snapshot.householdAvailablePence, -p(550));

    createTransfer(db, {
      fromPotId: pots.main.id,
      toPotId: card.id,
      amountPence: p(200),
      occurredAt: new Date('2026-10-01T12:00:00+01:00'),
      occurredDate: '2026-10-01',
      actor,
      now: new Date('2026-10-01T12:00:00+01:00'),
    });
    snapshot = getMoneySnapshot(db, new Date('2026-10-01T13:00:00+01:00'));
    assert.equal(
      snapshot.pots.find((entry) => entry.pot.id === pots.main.id)?.estimatePence,
      p(300),
    );
    assert.equal(snapshot.pots.find((entry) => entry.pot.id === card.id)?.estimatePence, -p(850));
    assert.equal(
      snapshot.householdAvailablePence,
      -p(550),
      'card repayment is internal, not spending',
    );
  });

  it('keeps card debt in net total but out of payday, horizon, overdraft and pot-shortfall projections', async () => {
    fixture = await createHouseholdFixture(actor, now);
    const { db, pots } = fixture;
    const card = await addCard(fixture);
    addCheckpoint(db, { potId: pots.main.id, amountPence: p(500), actor, now });
    addCheckpoint(db, { potId: pots.salary.id, amountPence: p(200), actor, now });
    addCheckpoint(db, { potId: card.id, amountPence: -p(1000), actor, now });

    createSchedule(db, {
      name: 'Salary',
      kind: 'receipt',
      frequency: 'monthly',
      dueDayOfMonth: 26,
      amountPence: p(100),
      potId: pots.salary.id,
      activeFrom: '2026-09-01',
      actor,
      now,
    });
    createSchedule(db, {
      name: 'Bank bill',
      kind: 'dd',
      frequency: 'monthly',
      dueDayOfMonth: 5,
      amountPence: p(800),
      potId: pots.main.id,
      categoryId: fixture.categoryId('Housing', 'Council Tax'),
      supplierName: 'Local Council',
      targetKind: 'household',
      activeFrom: '2026-09-01',
      actor,
      now,
    });
    createSchedule(db, {
      name: 'Card subscription',
      kind: 'dd',
      frequency: 'monthly',
      dueDayOfMonth: 6,
      amountPence: p(1000),
      potId: card.id,
      categoryId: fixture.categoryId('Utilities', 'Mobile Phones'),
      supplierName: 'Mobile Provider',
      targetKind: 'household',
      activeFrom: '2026-09-01',
      actor,
      now,
    });
    createSchedule(db, {
      name: 'Card refund expectation',
      kind: 'receipt',
      frequency: 'monthly',
      dueDayOfMonth: 7,
      amountPence: p(500),
      potId: card.id,
      activeFrom: '2026-09-01',
      actor,
      now,
    });

    const snapshot = getMoneySnapshot(db, now);
    assert.equal(snapshot.householdAvailablePence, -p(300));

    const payday = getProjectionView(db, now);
    assert.ok(payday);
    assert.equal(payday.result.paydayDate, '2026-10-26', 'a card receipt cannot anchor payday');
    assert.equal(payday.paydayScheduleName, 'Salary');
    assert.equal(payday.result.availableNowPence, p(700));
    assert.equal(payday.result.totalCommitmentsPence, p(800));
    assert.equal(payday.result.totalReceiptsPence, p(100));
    assert.equal(payday.result.warningThresholdPence, p(250));
    assert.equal(payday.result.tier, 'heads-up');
    assert.deepEqual(
      payday.result.potWatches.map((watch) => watch.potId),
      [pots.main.id],
    );
    assert.ok(!payday.commitmentLines.some((line) => line.potId === card.id));
    assert.ok(!payday.receiptLines.some((line) => line.potId === card.id));

    const horizon = getHorizonProjectionView(db, '2026-10-31', [], false, now);
    assert.equal(horizon.availableNowPence, p(700));
    assert.ok(horizon.selection.every((entry) => entry.pot.kind !== 'credit-card'));
    assert.equal(horizon.result.totalCommitmentsPence, p(800));
    assert.equal(horizon.result.totalReceiptsPence, p(100));

    const cycle = getCycleOutlook(db, now, snapshot);
    const cardWatch = cycle.pots.find((entry) => entry.potId === card.id);
    assert.ok(cardWatch);
    assert.equal(cardWatch.spendablePence, null);
    assert.equal(cardWatch.shortfallPence, null);
    assert.equal(cycle.householdAvailablePence, -p(300));
  });

  it('does not start a liquidity projection from a card checkpoint alone', async () => {
    fixture = await createHouseholdFixture(actor, now);
    const card = await addCard(fixture);
    addCheckpoint(fixture.db, { potId: card.id, amountPence: -p(500), actor, now });
    assert.equal(getMoneySnapshot(fixture.db, now).householdAvailablePence, -p(500));
    assert.equal(getProjectionView(fixture.db, now), null);
    const horizon = getHorizonProjectionView(fixture.db, '2026-10-26', [], false, now);
    assert.equal(horizon.hasSelectedCheckpoint, false);
    assert.equal(getForecastChartView(fixture.db, now).unavailable, true);
  });

  it('uses copied statement dates and minima plus a separate configured promo-end alert', async () => {
    fixture = await createHouseholdFixture(actor, now);
    const card = await addCard(fixture);
    const configured = editPot(fixture.db, {
      id: card.id,
      expectedVersion: card.version,
      actor,
      now,
      patch: {
        creditCardPaymentDayOfMonth: 25,
        creditCardWarningDays: 3,
        creditCardStatementDueDate: '2026-10-04',
        creditCardStatementMinimumPence: p(35),
        creditCardPromotionalEndDate: '2026-10-10',
      },
    });
    assert.equal(creditCardPaymentReminderDate(configured, '2026-10-01'), '2026-10-04');

    const alerts = getKeyDateAlerts(fixture.db, now).filter((alert) => alert.potId === card.id);
    const payment = alerts.find((alert) => alert.kind === 'credit-card-payment');
    assert.ok(payment);
    assert.equal(payment.daysUntil, 3);
    assert.match(keyDateMessage(payment), /statement minimum £35\.00/);
    assert.match(keyDateMessage(payment), /check the statement and choose an amount/);

    const promo = getKeyDateAlerts(fixture.db, new Date('2026-10-07T09:00:00+01:00')).find(
      (alert) => alert.kind === 'credit-card-promo-end' && alert.potId === card.id,
    );
    assert.ok(promo);
    assert.equal(promo.daysUntil, 3);

    const past = getKeyDateAlerts(fixture.db, new Date('2026-10-05T09:00:00+01:00')).find(
      (alert) => alert.kind === 'credit-card-payment' && alert.potId === card.id,
    );
    assert.ok(past);
    assert.match(keyDateMessage(past), /app cannot verify payment/);
  });

  it('clamps monthly reminder days into short months and rolls forward after this month', () => {
    assert.equal(
      creditCardPaymentReminderDate(
        { creditCardPaymentDayOfMonth: 31, creditCardStatementDueDate: null },
        '2026-02-27',
      ),
      '2026-02-28',
    );
    assert.equal(
      creditCardPaymentReminderDate(
        { creditCardPaymentDayOfMonth: 10, creditCardStatementDueDate: null },
        '2026-10-11',
      ),
      '2026-11-10',
    );
  });
});
