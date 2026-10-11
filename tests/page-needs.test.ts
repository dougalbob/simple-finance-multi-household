import assert from 'node:assert/strict';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { openDatabase, type Db } from '../src/lib/db/client';
import { applyMigrations } from '../src/lib/db/migrate';
import { GUIDE_ANCHORS } from '../src/lib/guide';
import { findChildCategory } from '../src/lib/records/categories';
import { createPerson, listPeople } from '../src/lib/records/people';
import { addCheckpoint, createPot, listPots } from '../src/lib/records/pots';
import { createPurchase } from '../src/lib/records/purchases';
import { cancelSchedule, createSchedule, listSchedules } from '../src/lib/records/schedules';
import { setWeeklyGroceriesPence } from '../src/lib/records/settings';
import { getPageNeeds, NEEDS_FIRST_TITLE, type PayoffPageId } from '../src/lib/records/page-needs';
import { makeTempDir } from './helpers';

/**
 * “What this page needs first” (docs/ONBOARDING_PLAN.md §5, Slice 2). The
 * needs are the setup path's own derivation seen from one payoff surface, so
 * these tests drive real records through the domain APIs — the same shape as
 * tests/setup-path.test.ts — and read each page's needs back. A need exists
 * exactly while its step is open; nothing here can be ticked or dismissed.
 */
const ACTOR = 'alex@example.com';

async function freshHousehold(): Promise<{ db: Db; close(): void }> {
  const dir = await makeTempDir('sf-page-needs-');
  const handle = openDatabase(path.join(dir, 'household.sqlite'));
  applyMigrations(handle.db);
  return { db: handle.db, close: () => handle.raw.close() };
}

const ids = (db: Db, page: PayoffPageId, now?: Date) =>
  getPageNeeds(db, page, now).map((need) => need.id);

/** Phase A, recorded the way the /start inline forms record it. */
function completePhaseA(db: Db, now: Date): void {
  createPerson(db, { label: 'Alex', actor: ACTOR, now });
  const main = createPot(db, { label: 'Main account', kind: 'bank', actor: ACTOR, now });
  addCheckpoint(db, { potId: main.id, amountPence: 41235, actor: ACTOR, now });
  createSchedule(db, {
    name: 'Salary',
    kind: 'receipt',
    frequency: 'monthly',
    dueDayOfMonth: 28,
    amountPence: 245000,
    potId: main.id,
    activeFrom: '2026-10-01',
    actor: ACTOR,
    now,
  });
}

/**
 * The first purchase at the till. Reuses a pot and a person when the
 * household already has them, so completing the path in stages never opens
 * the checkpoint step again through a stray second pot.
 */
function recordFirstPurchase(db: Db, now: Date): void {
  const pot =
    listPots(db)[0] ?? createPot(db, { label: 'Till pot', kind: 'cash', actor: ACTOR, now });
  const person = listPeople(db)[0] ?? createPerson(db, { label: 'Sam', actor: ACTOR, now });
  const categoryId = findChildCategory(db, 'Groceries', 'Weekly Shop')?.id;
  assert.ok(categoryId);
  createPurchase(db, {
    potId: pot.id,
    totalPence: 349,
    occurredAt: now,
    paidByPersonId: person.id,
    supplierName: 'The Corner Cafe',
    actor: ACTOR,
    now,
    lines: [{ amountPence: 349, categoryId, targetKind: 'household' }],
  });
}

describe('page needs: the payoff pages name the records they read', () => {
  const households: Array<{ close(): void }> = [];
  const open = async () => {
    const household = await freshHousehold();
    households.push(household);
    return household;
  };
  after(() => {
    for (const household of households) household.close();
  });

  it('has the shared heading the surfaces and the browser suite use', () => {
    assert.equal(NEEDS_FIRST_TITLE, 'What this page needs first');
  });

  it('a brand-new household: every payoff names its missing records', async () => {
    const { db } = await open();
    // The checkpoint need hides behind the pots need: there is nothing to
    // record a checkpoint against yet, and the pots step says what to do
    // first. Income and purchases are independent and stay listed.
    assert.deepEqual(ids(db, 'projection'), ['pots', 'income']);
    assert.deepEqual(ids(db, 'horizon'), ['pots']);
    assert.deepEqual(ids(db, 'charts'), ['pots', 'purchases']);
    assert.deepEqual(ids(db, 'insights'), ['purchases', 'figures']);
  });

  it('every need points at its setup step, and only at real guide anchors', async () => {
    const { db } = await open();
    for (const page of ['projection', 'horizon', 'charts', 'insights'] as const) {
      for (const need of getPageNeeds(db, page)) {
        assert.equal(need.actionHref, `/start#setup-${need.id}`);
        assert.ok(need.actionLabel.length > 0, `${page}/${need.id} has no action label`);
        assert.ok(need.sentence.length > 40, `${page}/${need.id} has no real sentence`);
        if (need.guideAnchor !== null) {
          assert.ok(
            (GUIDE_ANCHORS as readonly string[]).includes(need.guideAnchor),
            `${page}/${need.id} cites an unknown guide anchor`,
          );
        }
      }
    }
  });

  it('with pots but no checkpoint, the checkpoint need takes over from pots', async () => {
    const { db } = await open();
    createPot(db, { label: 'Main account', kind: 'bank', actor: ACTOR });
    assert.deepEqual(ids(db, 'projection'), ['checkpoints', 'income']);
    assert.deepEqual(ids(db, 'horizon'), ['checkpoints']);
    assert.deepEqual(ids(db, 'charts'), ['checkpoints', 'purchases']);
    // A credit card is not a liquid anchor: it never closes the pots step and
    // never satisfies Horizon, so the chain still waits on a checkpoint.
    createPot(db, { label: 'Card', kind: 'credit-card', actor: ACTOR });
    assert.deepEqual(ids(db, 'horizon'), ['checkpoints']);
  });

  it('a card-only household is told the payoff needs a bank or cash pot', async () => {
    const { db } = await open();
    createPot(db, { label: 'Card', kind: 'credit-card', actor: ACTOR });
    assert.deepEqual(ids(db, 'projection'), ['pots', 'income']);
    assert.deepEqual(ids(db, 'horizon'), ['pots']);
    assert.match(getPageNeeds(db, 'horizon')[0]!.sentence, /bank and cash pots only/);
  });

  it('closes the projection and Horizon needs at the end of Phase A', async () => {
    const { db } = await open();
    const now = new Date('2026-10-11T12:00:00Z');
    completePhaseA(db, now);
    assert.deepEqual(ids(db, 'projection', now), []);
    assert.deepEqual(ids(db, 'horizon', now), []);
    // The forecast half of Charts is satisfied; the reported charts still
    // wait on the till.
    assert.deepEqual(ids(db, 'charts', now), ['purchases']);
    assert.deepEqual(ids(db, 'insights', now), ['purchases', 'figures']);
  });

  it('the first purchase closes the reported charts; the figures close Insights', async () => {
    const { db } = await open();
    const now = new Date('2026-10-11T12:00:00Z');
    recordFirstPurchase(db, now);
    // The purchase came with its own cash pot, so the forecast half of Charts
    // now waits on that pot's checkpoint — the reported half is satisfied.
    assert.deepEqual(ids(db, 'charts', now), ['checkpoints']);
    assert.deepEqual(ids(db, 'insights', now), ['figures']);
    // A no-vehicle household is complete on figures at one setting — the
    // car-free household is never nagged (Slice 1's fix, seen from Insights).
    setWeeklyGroceriesPence(db, 8500, ACTOR);
    assert.deepEqual(ids(db, 'insights', now), []);
  });

  it('a fully set-up household sees no needs on any payoff page', async () => {
    const { db } = await open();
    const now = new Date('2026-10-11T12:00:00Z');
    completePhaseA(db, now);
    recordFirstPurchase(db, now);
    setWeeklyGroceriesPence(db, 8500, ACTOR);
    for (const page of ['projection', 'horizon', 'charts', 'insights'] as const) {
      assert.deepEqual(ids(db, page, now), [], `${page} still lists needs`);
    }
  });

  it('never lists an optional or Phase B bill step: they are nobody’s prerequisite', async () => {
    const { db } = await open();
    const now = new Date('2026-10-11T12:00:00Z');
    for (const page of ['projection', 'horizon', 'charts', 'insights'] as const) {
      for (const need of getPageNeeds(db, page, now)) {
        assert.notEqual(need.id, 'cards');
        assert.notEqual(need.id, 'bills');
        assert.notEqual(need.id, 'people');
      }
    }
  });

  it('undoing a record reopens the need — derivation, never a dismissed flag', async () => {
    const { db } = await open();
    const now = new Date('2026-10-11T12:00:00Z');
    completePhaseA(db, now);
    assert.deepEqual(ids(db, 'projection', now), []);
    // Cancelling the salary reopens the income need, exactly as the setup
    // path reopens the step (tests/setup-path.test.ts pins the step side).
    const [salary] = listSchedules(db, now).filter(({ schedule }) => schedule.kind === 'receipt');
    assert.ok(salary);
    cancelSchedule(db, {
      id: salary.schedule.id,
      expectedVersion: salary.schedule.version,
      effectiveOn: '2026-10-01',
      actor: ACTOR,
      now,
    });
    assert.deepEqual(ids(db, 'projection', now), ['income']);
  });
});
