import assert from 'node:assert/strict';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { openDatabase, type Db } from '../src/lib/db/client';
import { applyMigrations } from '../src/lib/db/migrate';
import { findChildCategory } from '../src/lib/records/categories';
import { createPerson } from '../src/lib/records/people';
import { addCheckpoint, createPot } from '../src/lib/records/pots';
import { createPurchase } from '../src/lib/records/purchases';
import { createRenewal } from '../src/lib/records/renewals';
import { cancelSchedule, createSchedule } from '../src/lib/records/schedules';
import { getSetupPath, SETUP_STEP_COPY, type SetupStepId } from '../src/lib/records/setup-path';
import {
  setMonthlyFuelPence,
  setPaydayDayOfMonth,
  setWeeklyGroceriesPence,
} from '../src/lib/records/settings';
import { createVehicle } from '../src/lib/records/vehicles';
import { makeTempDir } from './helpers';

/**
 * The first-run setup path (docs/ONBOARDING_PLAN.md): every state derives from
 * the household's own records, so these tests drive real records through the
 * domain APIs and read the path back. No onboarding flag exists to assert —
 * that is the point.
 */
const ACTOR = 'alex@example.com';

async function freshHousehold(): Promise<{ db: Db; close(): void }> {
  const dir = await makeTempDir('sf-setup-path-');
  const handle = openDatabase(path.join(dir, 'household.sqlite'));
  applyMigrations(handle.db);
  return { db: handle.db, close: () => handle.raw.close() };
}

/** The state of one step, by id — the shape every assertion below uses. */
function step(db: Db, id: SetupStepId, now?: Date) {
  const found = getSetupPath(db, now).steps.find((entry) => entry.id === id);
  assert.ok(found, `no setup step ${id}`);
  return found;
}

describe('setup path: derived from the records, never ticked', () => {
  const households: Array<{ close(): void }> = [];
  const open = async () => {
    const household = await freshHousehold();
    households.push(household);
    return household;
  };
  after(() => {
    for (const household of households) household.close();
  });

  it('a brand-new household has every step open and starts at the people', async () => {
    const { db } = await open();
    const view = getSetupPath(db);
    assert.equal(view.steps.length, 9);
    assert.deepEqual(
      view.steps.map((entry) => entry.state),
      ['todo', 'todo', 'todo', 'todo', 'todo', 'todo', 'todo', 'todo', 'todo'],
    );
    assert.deepEqual(view.phaseA, { done: 0, total: 4, complete: false });
    assert.equal(view.nextStepId, 'people');
    // Phase B's outstanding count excludes the optional credit-card step.
    assert.equal(view.phaseBOutstanding, 3);
    assert.equal(step(db, 'checkpoints').detail, 'No bank or cash pot to record yet');
  });

  it('one person is a complete household — the people step closes at one', async () => {
    const { db } = await open();
    createPerson(db, { label: 'Alex', actor: ACTOR });
    assert.equal(step(db, 'people').state, 'done');
    assert.equal(step(db, 'people').detail, 'Alex named');
    assert.equal(getSetupPath(db).nextStepId, 'pots');
  });

  it('a credit-card-only household is partly there on pots and has nothing to checkpoint', async () => {
    const { db } = await open();
    createPot(db, { label: 'Card', kind: 'credit-card', actor: ACTOR });
    assert.equal(step(db, 'pots').state, 'partly');
    assert.match(step(db, 'pots').detail, /credit card only/i);
    assert.equal(step(db, 'checkpoints').state, 'todo');
  });

  it('closes the checkpoint step only when every bank and cash pot is anchored', async () => {
    const { db } = await open();
    const main = createPot(db, { label: 'Main account', kind: 'bank', actor: ACTOR });
    const cash = createPot(db, { label: 'Alex cash', kind: 'cash', actor: ACTOR });
    assert.equal(step(db, 'checkpoints').state, 'todo');
    addCheckpoint(db, { potId: main.id, amountPence: 41235, actor: ACTOR });
    assert.equal(step(db, 'checkpoints').state, 'partly');
    assert.equal(step(db, 'checkpoints').detail, '1 of 2 pots have a checkpoint');
    addCheckpoint(db, { potId: cash.id, amountPence: 4210, actor: ACTOR });
    assert.equal(step(db, 'checkpoints').state, 'done');
    // A credit card is not a liquid anchor: it never blocks Phase A.
    createPot(db, { label: 'Card', kind: 'credit-card', actor: ACTOR });
    assert.equal(step(db, 'checkpoints').state, 'done');
  });

  it('completes Phase A at the configured payday without a receipt schedule', async () => {
    const { db } = await open();
    const now = new Date('2026-10-11T12:00:00Z');
    createPerson(db, { label: 'Alex', actor: ACTOR });
    const main = createPot(db, { label: 'Main account', kind: 'bank', actor: ACTOR });
    addCheckpoint(db, { potId: main.id, amountPence: 41235, actor: ACTOR, now });

    assert.equal(step(db, 'income', now).optional, true);
    assert.equal(getSetupPath(db, now).nextStepId, 'payday');
    setPaydayDayOfMonth(db, 28, ACTOR, now);
    const view = getSetupPath(db, now);
    assert.deepEqual(view.phaseA, { done: 4, total: 4, complete: true });
    assert.equal(view.nextStepId, null);
    assert.equal(step(db, 'payday', now).detail, 'Household payday set to day 28');
    assert.equal(
      step(db, 'income', now).detail,
      'No recurring income scheduled — add it only if predictable',
    );
    assert.equal(view.phaseBOutstanding, 3, 'recurring income is optional for the planning cycle');

    const salary = createSchedule(db, {
      name: 'Salary',
      kind: 'receipt',
      frequency: 'monthly',
      dueDayOfMonth: 28,
      amountPence: 245000,
      potId: main.id,
      activeFrom: '2026-10-01',
      actor: ACTOR,
      now,
    }).schedule;
    assert.equal(step(db, 'income', now).detail, 'Salary scheduled');
    cancelSchedule(db, {
      id: salary.id,
      expectedVersion: salary.version,
      effectiveOn: '2026-10-01',
      actor: ACTOR,
      now,
    });
    assert.equal(step(db, 'income', now).state, 'todo');
    assert.equal(getSetupPath(db, now).phaseA.complete, true);

    setPaydayDayOfMonth(db, null, ACTOR, now);
    assert.equal(getSetupPath(db, now).phaseA.complete, false);
    assert.equal(getSetupPath(db, now).nextStepId, 'payday');
  });

  it('separates bills from income when counting schedules', async () => {
    const { db } = await open();
    const now = new Date('2026-10-11T12:00:00Z');
    const main = createPot(db, { label: 'Main account', kind: 'bank', actor: ACTOR });
    const categoryId = findChildCategory(db, 'Housing', 'Council Tax')?.id;
    assert.ok(categoryId);
    createSchedule(db, {
      name: 'Council tax',
      kind: 'dd',
      frequency: 'monthly',
      dueDayOfMonth: 5,
      amountPence: 17500,
      potId: main.id,
      categoryId,
      supplierName: 'Council',
      activeFrom: '2026-10-01',
      actor: ACTOR,
      now,
    });
    assert.equal(step(db, 'bills', now).state, 'done');
    assert.equal(step(db, 'income', now).state, 'todo');
    assert.equal(step(db, 'bills', now).detail, '1 scheduled');
  });

  it('counts the projection figures across the shop and every vehicle', async () => {
    const { db } = await open();
    const vehicleA = createVehicle(db, { label: 'Vehicle A', actor: ACTOR });
    const vehicleB = createVehicle(db, { label: 'Vehicle B', actor: ACTOR });
    assert.equal(step(db, 'figures').state, 'todo');
    setWeeklyGroceriesPence(db, 8500, ACTOR);
    assert.equal(step(db, 'figures').state, 'partly');
    assert.match(step(db, 'figures').detail, /0 of 2 vehicles/);
    setMonthlyFuelPence(db, vehicleA.id, 6000, ACTOR);
    assert.equal(step(db, 'figures').state, 'partly');
    setMonthlyFuelPence(db, vehicleB.id, 4500, ACTOR);
    assert.equal(step(db, 'figures').state, 'done');
    assert.match(step(db, 'figures').detail, /2 of 2 vehicles/);
  });

  it('treats a household with no vehicle as complete on the fuel half', async () => {
    const { db } = await open();
    setWeeklyGroceriesPence(db, 8500, ACTOR);
    assert.equal(step(db, 'figures').state, 'done');
    assert.match(step(db, 'figures').detail, /no vehicles/);
  });

  it('closes the optional step on a credit card or a renewal, and never counts it outstanding', async () => {
    const { db } = await open();
    assert.equal(step(db, 'cards').optional, true);
    assert.equal(step(db, 'cards').state, 'todo');
    assert.equal(getSetupPath(db).phaseBOutstanding, 3);
    createRenewal(db, {
      label: 'Home insurance',
      nextRenewalDate: '2027-04-01',
      actor: ACTOR,
    });
    assert.equal(step(db, 'cards').state, 'done');
    assert.match(step(db, 'cards').detail, /1 renewal/);
    // Closing the optional step never moves the outstanding count: bills,
    // figures and the first purchase are what the home card counts down.
    assert.equal(getSetupPath(db).phaseBOutstanding, 3);
  });

  it('closes the purchase step on the first recorded purchase', async () => {
    const { db } = await open();
    const main = createPot(db, { label: 'Main account', kind: 'bank', actor: ACTOR });
    const person = createPerson(db, { label: 'Alex', actor: ACTOR });
    const categoryId = findChildCategory(db, 'Groceries', 'Weekly Shop')?.id;
    assert.ok(categoryId);
    assert.equal(step(db, 'purchases').state, 'todo');
    createPurchase(db, {
      potId: main.id,
      totalPence: 349,
      occurredAt: new Date('2026-10-11T10:00:00Z'),
      paidByPersonId: person.id,
      supplierName: 'The Corner Cafe',
      actor: ACTOR,
      lines: [{ amountPence: 349, categoryId, targetKind: 'household' }],
    });
    assert.equal(step(db, 'purchases').state, 'done');
    assert.equal(step(db, 'purchases').detail, 'The till has been used');
  });

  it('gives every step copy, and every phase its title', () => {
    const ids: SetupStepId[] = [
      'people',
      'pots',
      'checkpoints',
      'payday',
      'income',
      'bills',
      'figures',
      'cards',
      'purchases',
    ];
    for (const id of ids) {
      const copy = SETUP_STEP_COPY[id];
      assert.ok(copy.title.length > 0, `${id} has no title`);
      assert.ok(copy.why.length > 40, `${id} has no real explanation`);
      assert.ok(copy.payoff.length > 0, `${id} has no payoff`);
    }
  });
});
