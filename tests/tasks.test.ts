import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { and, eq } from 'drizzle-orm';
import { auditEntries, supplierInteractions, tasks } from '../src/lib/db/schema';
import { VersionConflictError } from '../src/lib/records/errors';
import { keyDateHref } from '../src/lib/records/keydates';
import { createPurchase, voidPurchase } from '../src/lib/records/purchases';
import { createRenewal } from '../src/lib/records/renewals';
import { addSupplierInteraction } from '../src/lib/records/supplier-details';
import { createSupplier } from '../src/lib/records/suppliers';
import {
  subjectLabel,
  targetLabel,
  targetNames,
  type SubjectNames,
} from '../src/lib/records/targets';
import {
  InvalidTaskInputError,
  TaskNotFoundError,
  TaskStateError,
  completeTask,
  countOpenTasks,
  createTask,
  editTask,
  getTask,
  groupTasksByDue,
  listTasks,
  reopenTask,
  sortTasksByDue,
  taskDue,
  tasksByInteraction,
} from '../src/lib/records/tasks';
import {
  getNoticedItems,
  getTasksBySubject,
  getTasksPageView,
  loadTaskViewContext,
  taskRowView,
} from '../src/lib/records/tasks-view';
import { formatShortLocalDateWithYear } from '../src/lib/time';
import { createHouseholdFixture } from './household';

/**
 * Tasks (SPEC §25, decision 175). The defect they fix: a follow-up dated
 * 2026-11-01 did nothing — every list filtered follow-ups to `>= today`, so on
 * 2 November the promise vanished, and nothing could close or move it. A task
 * is a record: it stays listed (overdue first) until someone closes it, every
 * change is versioned and audited, and it is never deleted.
 */

const ALEX = 'alex@example.com';
const SAM = 'sam@example.com';
const NOW = new Date('2026-09-27T10:00:00Z');
const TODAY = '2026-09-27';

function auditFor(fx: { db: import('../src/lib/db/client').Db }, taskId: number) {
  return fx.db
    .select()
    .from(auditEntries)
    .where(and(eq(auditEntries.entity, 'task'), eq(auditEntries.entityId, String(taskId))))
    .all();
}

describe('task due state and order (pure)', () => {
  it('says where a due date stands in words', () => {
    assert.deepEqual(taskDue('2026-09-24', TODAY), {
      state: 'overdue',
      days: -3,
      label: 'Overdue by 3 days',
    });
    assert.equal(taskDue('2026-09-26', TODAY).label, 'Overdue by 1 day');
    assert.deepEqual(taskDue(TODAY, TODAY), { state: 'today', days: 0, label: 'Due today' });
    assert.equal(taskDue('2026-09-28', TODAY).label, 'Due tomorrow');
    assert.deepEqual(taskDue('2026-10-09', TODAY), {
      state: 'upcoming',
      days: 12,
      label: 'In 12 days',
    });
    assert.deepEqual(taskDue(null, TODAY), { state: 'undated', days: null, label: 'No due date' });
    // Only a hand-edited database could hold these; they must not break a page.
    assert.equal(taskDue('2026-02-30', TODAY).state, 'undated');
    assert.equal(taskDue('next week', TODAY).state, 'undated');
  });

  it('orders overdue → today → later → undated, ties in creation order', () => {
    const items = [
      { id: 1, dueDate: null },
      { id: 2, dueDate: '2026-10-09' },
      { id: 3, dueDate: TODAY },
      { id: 4, dueDate: '2026-09-01' },
      { id: 5, dueDate: '2026-09-26' },
      { id: 6, dueDate: '2026-09-28' },
      { id: 7, dueDate: null },
      { id: 8, dueDate: '2026-10-09' },
    ];
    assert.deepEqual(
      sortTasksByDue(items, TODAY).map((item) => item.id),
      [4, 5, 3, 6, 2, 8, 1, 7],
    );
    const groups = groupTasksByDue(items, TODAY);
    assert.deepEqual(
      {
        overdue: groups.overdue.map((item) => item.id),
        today: groups.today.map((item) => item.id),
        upcoming: groups.upcoming.map((item) => item.id),
        undated: groups.undated.map((item) => item.id),
      },
      { overdue: [4, 5], today: [3], upcoming: [6, 2, 8], undated: [1, 7] },
    );
    assert.deepEqual(
      countOpenTasks(
        [
          { dueDate: '2026-09-01', completedAt: null },
          { dueDate: '2026-09-01', completedAt: NOW },
          { dueDate: null, completedAt: null },
        ],
        TODAY,
      ),
      { open: 2, overdue: 1 },
    );
  });

  it('adds the year to a date outside this one', () => {
    assert.equal(formatShortLocalDateWithYear('2026-11-01', TODAY), 'Sun 1 Nov');
    assert.equal(formatShortLocalDateWithYear('2027-01-05', TODAY), 'Tue 5 Jan 2027');
    assert.equal(formatShortLocalDateWithYear('2025-12-31', TODAY), 'Wed 31 Dec 2025');
  });

  it('links each kind of key date to where it is dealt with', () => {
    assert.equal(keyDateHref({ kind: 'renewal', id: 4 }), '/contracts#renewal-4');
    assert.equal(
      keyDateHref({ kind: 'contract-end', id: 9, scheduleId: 9 }),
      '/recurring#schedule-edit-9',
    );
    assert.equal(
      keyDateHref({ kind: 'credit-card-payment', id: 2, potId: 2 }),
      '/pots#pot-2-heading',
    );
  });
});

describe('subjectLabel (pure) — what a task is about', () => {
  const names: SubjectNames = {
    suppliers: new Map([[3, 'EnergyCo']]),
    vehicles: new Map([[2, 'Vehicle A']]),
    purchases: new Map([[17, '£84.20 at EnergyCo on Tue 1 Sept']]),
  };

  it('names each kind, and degrades to the bare kind when the subject has gone', () => {
    assert.equal(subjectLabel({ subjectKind: 'supplier', subjectId: 3 }, names), 'EnergyCo');
    assert.equal(subjectLabel({ subjectKind: 'vehicle', subjectId: 2 }, names), 'Vehicle A');
    assert.equal(
      subjectLabel({ subjectKind: 'purchase', subjectId: 17 }, names),
      '£84.20 at EnergyCo on Tue 1 Sept',
    );
    assert.equal(subjectLabel({ subjectKind: 'household', subjectId: null }, names), 'household');
    // A voided purchase is left out of the names: its task reads "purchase".
    assert.equal(subjectLabel({ subjectKind: 'purchase', subjectId: 18 }, names), 'purchase');
    assert.equal(subjectLabel({ subjectKind: 'supplier', subjectId: 99 }, names), 'supplier');
  });

  it('never calls an unknown kind "household" — the trap in targetLabel()', () => {
    assert.equal(subjectLabel({ subjectKind: 'debt', subjectId: 5 }, names), 'debt');
    assert.equal(subjectLabel({ subjectKind: '', subjectId: 5 }, names), 'unknown');
    // Why tasks do not reuse targetKind/targetId: the spend helper answers
    // "household" for anything it does not recognise.
    const spendNames = targetNames({ people: [], vehicles: [] });
    assert.equal(targetLabel({ targetKind: 'supplier', targetId: 3 }, spendNames), 'household');
  });
});

describe('tasks — create, complete, reopen, edit (versioned and audited)', () => {
  it('creates a household task and audits it', async () => {
    const fx = await createHouseholdFixture(ALEX, NOW);
    try {
      const task = createTask(fx.db, {
        title: '  Research   cheaper tariffs ',
        detail: 'Compare fixed deals\n\n\n\nbefore the winter',
        dueDate: '2026-10-15',
        actor: ALEX,
        now: NOW,
      });
      assert.equal(task.title, 'Research cheaper tariffs');
      assert.equal(task.detail, 'Compare fixed deals\n\nbefore the winter');
      assert.equal(task.dueDate, '2026-10-15');
      assert.equal(task.subjectKind, 'household');
      assert.equal(task.subjectId, null);
      assert.equal(task.version, 1);
      assert.equal(task.completedAt, null);
      const audit = auditFor(fx, task.id);
      assert.equal(audit.length, 1);
      assert.equal(audit[0]!.action, 'task.create');
      assert.equal(audit[0]!.actor, ALEX);
      assert.match(audit[0]!.summary, /Research cheaper tariffs.*2026-10-15/);

      const undated = createTask(fx.db, { title: 'Sort the loft', dueDate: '', actor: SAM });
      assert.equal(undated.dueDate, null);
    } finally {
      fx.close();
    }
  });

  it('refuses a task with no words, bad dates or a subject that does not fit', async () => {
    const fx = await createHouseholdFixture(ALEX, NOW);
    try {
      const refuse = (input: Partial<Parameters<typeof createTask>[1]>) =>
        assert.throws(
          () => createTask(fx.db, { title: 'Something', actor: ALEX, ...input }),
          InvalidTaskInputError,
        );
      refuse({ title: '   ' });
      refuse({ title: 'x'.repeat(201) });
      refuse({ detail: 'y'.repeat(2001) });
      refuse({ dueDate: '2026-02-30' });
      refuse({ dueDate: '1 Nov' });
      refuse({ actor: ' ' });
      refuse({ subjectKind: 'household', subjectId: 4 });
      refuse({ subjectKind: 'supplier', subjectId: null });
      refuse({ subjectKind: 'supplier', subjectId: 999 });
      refuse({ subjectKind: 'vehicle', subjectId: 999 });
      refuse({ subjectKind: 'purchase', subjectId: 999 });
      refuse({ subjectKind: 'debt' as never, subjectId: 1 });
      assert.equal(fx.db.select().from(tasks).all().length, 0);
    } finally {
      fx.close();
    }
  });

  it('completes with who, when and a note; a second tick is refused, not repeated', async () => {
    const fx = await createHouseholdFixture(ALEX, NOW);
    try {
      const task = createTask(fx.db, { title: 'Chase the refund', actor: ALEX, now: NOW });
      const later = new Date('2026-09-28T08:30:00Z');
      const done = completeTask(fx.db, {
        id: task.id,
        expectedVersion: task.version,
        actor: SAM,
        note: '  Refund landed  ',
        now: later,
      });
      assert.equal(done.completedAt?.toISOString(), later.toISOString());
      assert.equal(done.completedBy, SAM);
      assert.equal(done.completionNote, 'Refund landed');
      assert.equal(done.version, 2);
      assert.equal(listTasks(fx.db).length, 0);
      assert.deepEqual(
        listTasks(fx.db, { status: 'done' }).map((row) => row.id),
        [task.id],
      );

      assert.throws(
        () => completeTask(fx.db, { id: task.id, expectedVersion: 2, actor: ALEX }),
        TaskStateError,
      );
      const audit = auditFor(fx, task.id).map((entry) => entry.action);
      assert.deepEqual(audit.sort(), ['task.complete', 'task.create']);
      assert.throws(
        () => completeTask(fx.db, { id: 999, expectedVersion: 1, actor: ALEX }),
        TaskNotFoundError,
      );
    } finally {
      fx.close();
    }
  });

  it('refuses a stale version — the second person to tick sees why', async () => {
    const fx = await createHouseholdFixture(ALEX, NOW);
    try {
      const task = createTask(fx.db, { title: 'Ring the broker', actor: ALEX, now: NOW });
      editTask(fx.db, {
        id: task.id,
        expectedVersion: 1,
        actor: SAM,
        patch: { dueDate: '2026-10-02' },
      });
      assert.throws(
        () => completeTask(fx.db, { id: task.id, expectedVersion: 1, actor: ALEX }),
        (error: unknown) =>
          error instanceof VersionConflictError &&
          error.entity === 'task' &&
          error.expectedVersion === 1 &&
          error.actualVersion === 2,
      );
      assert.throws(
        () => reopenTask(fx.db, { id: task.id, expectedVersion: 1, actor: ALEX }),
        VersionConflictError,
      );
      assert.throws(
        () =>
          editTask(fx.db, {
            id: task.id,
            expectedVersion: 1,
            actor: ALEX,
            patch: { title: 'Overwrite' },
          }),
        VersionConflictError,
      );
      const current = getTask(fx.db, task.id);
      assert.equal(current.completedAt, null, 'nothing was saved');
      assert.equal(current.title, 'Ring the broker');
      assert.equal(current.version, 2);
    } finally {
      fx.close();
    }
  });

  it('reopens a closed task (audited) and refuses to reopen an open one', async () => {
    const fx = await createHouseholdFixture(ALEX, NOW);
    try {
      const task = createTask(fx.db, {
        title: 'Cancel the old policy',
        dueDate: '2026-09-20',
        actor: ALEX,
        now: NOW,
      });
      const done = completeTask(fx.db, {
        id: task.id,
        expectedVersion: 1,
        actor: ALEX,
        note: 'Rang them',
      });
      const reopened = reopenTask(fx.db, {
        id: task.id,
        expectedVersion: done.version,
        actor: SAM,
      });
      assert.equal(reopened.completedAt, null);
      assert.equal(reopened.completedBy, null);
      assert.equal(reopened.completionNote, null);
      assert.equal(reopened.version, 3);
      assert.equal(reopened.dueDate, '2026-09-20', 'the original date comes back');
      assert.equal(taskDue(reopened.dueDate, TODAY).state, 'overdue');
      assert.throws(
        () => reopenTask(fx.db, { id: task.id, expectedVersion: 3, actor: SAM }),
        TaskStateError,
      );
      const reopenAudit = auditFor(fx, task.id).find((entry) => entry.action === 'task.reopen');
      assert.ok(reopenAudit !== undefined);
      assert.equal(reopenAudit.actor, SAM);
      assert.match(reopenAudit.before ?? '', /Rang them/, 'the completion stays in the history');
    } finally {
      fx.close();
    }
  });

  it('reschedules an open task, clears a date, and will not edit a closed one', async () => {
    const fx = await createHouseholdFixture(ALEX, NOW);
    try {
      const task = createTask(fx.db, {
        title: 'Follow up with EnergyCo',
        dueDate: '2026-11-01',
        actor: ALEX,
        now: NOW,
      });
      const moved = editTask(fx.db, {
        id: task.id,
        expectedVersion: 1,
        actor: SAM,
        patch: { dueDate: '2026-11-15', detail: 'They promised a call back' },
      });
      assert.equal(moved.dueDate, '2026-11-15');
      assert.equal(moved.detail, 'They promised a call back');
      assert.equal(moved.title, 'Follow up with EnergyCo');
      const edit = auditFor(fx, task.id).find((entry) => entry.action === 'task.edit');
      assert.match(edit?.summary ?? '', /2026-11-01 → 2026-11-15/);

      const undated = editTask(fx.db, {
        id: task.id,
        expectedVersion: 2,
        actor: SAM,
        patch: { dueDate: '' },
      });
      assert.equal(undated.dueDate, null);

      completeTask(fx.db, { id: task.id, expectedVersion: 3, actor: ALEX });
      assert.throws(
        () =>
          editTask(fx.db, {
            id: task.id,
            expectedVersion: 4,
            actor: ALEX,
            patch: { title: 'Changed my mind' },
          }),
        TaskStateError,
      );
    } finally {
      fx.close();
    }
  });
});

describe('tasks about records — suppliers, vehicles, purchases', () => {
  it('a voided purchase takes no new task; its existing tasks still list and close', async () => {
    const fx = await createHouseholdFixture(ALEX, NOW);
    try {
      const energyCo = createSupplier(fx.db, { name: 'EnergyCo', actor: ALEX });
      const purchase = createPurchase(fx.db, {
        potId: fx.pots.main.id,
        totalPence: 8420,
        occurredAt: new Date('2026-09-01T09:00:00Z'),
        supplierId: energyCo.id,
        actor: ALEX,
        lines: [
          {
            amountPence: 8420,
            categoryId: fx.categoryId('Utilities', 'Energy'),
            targetKind: 'household',
            targetId: null,
          },
        ],
      });
      const chase = createTask(fx.db, {
        title: 'Chase the refund',
        dueDate: '2026-10-01',
        subjectKind: 'purchase',
        subjectId: purchase.purchase.id,
        actor: ALEX,
        now: NOW,
      });

      let context = loadTaskViewContext(fx.db, [chase], TODAY);
      let row = taskRowView(chase, context);
      assert.equal(row.subjectLabel, '£84.20 at EnergyCo on Tue 1 Sept');
      assert.equal(
        row.subjectHref,
        '/purchases?from=2026-09-01&to=2026-09-01#purchase-' + purchase.purchase.id,
      );
      assert.equal(row.subjectNote, null);

      voidPurchase(fx.db, {
        id: purchase.purchase.id,
        expectedVersion: purchase.purchase.version,
        actor: SAM,
        reason: 'Entered twice',
      });
      assert.throws(
        () =>
          createTask(fx.db, {
            title: 'Another chase',
            subjectKind: 'purchase',
            subjectId: purchase.purchase.id,
            actor: ALEX,
          }),
        /voided/,
      );

      // The existing task survives the void: still listed, still closable,
      // and it reads "purchase" — the bare kind, never "household".
      const open = listTasks(fx.db);
      assert.deepEqual(
        open.map((task) => task.id),
        [chase.id],
      );
      context = loadTaskViewContext(fx.db, open, TODAY);
      row = taskRowView(open[0]!, context);
      assert.equal(row.subjectLabel, 'purchase');
      assert.equal(row.subjectNote, 'voided');
      assert.match(row.subjectHref ?? '', /voidedOnly=1/);
      const closed = completeTask(fx.db, {
        id: chase.id,
        expectedVersion: chase.version,
        actor: ALEX,
        note: 'Purchase was a duplicate',
      });
      assert.ok(closed.completedAt !== null);
    } finally {
      fx.close();
    }
  });

  it('groups tasks by subject for the supplier cards, overdue first', async () => {
    const fx = await createHouseholdFixture(ALEX, NOW);
    try {
      const energyCo = createSupplier(fx.db, { name: 'EnergyCo', actor: ALEX });
      const insurerCo = createSupplier(fx.db, { name: 'InsurerCo', actor: ALEX });
      const later = createTask(fx.db, {
        title: 'Read the new terms',
        dueDate: '2026-10-20',
        subjectKind: 'supplier',
        subjectId: energyCo.id,
        actor: ALEX,
      });
      const late = createTask(fx.db, {
        title: 'Send the meter reading',
        dueDate: '2026-09-25',
        subjectKind: 'supplier',
        subjectId: energyCo.id,
        actor: ALEX,
      });
      const other = createTask(fx.db, {
        title: 'Ask for a quote',
        subjectKind: 'supplier',
        subjectId: insurerCo.id,
        actor: SAM,
      });
      createTask(fx.db, {
        title: 'Book the MOT',
        subjectKind: 'vehicle',
        subjectId: fx.vehicles.vehicleA.id,
        actor: SAM,
      });
      completeTask(fx.db, { id: other.id, expectedVersion: 1, actor: SAM, now: NOW });

      const bySupplier = getTasksBySubject(fx.db, 'supplier', NOW);
      const energy = bySupplier.get(energyCo.id)!;
      assert.deepEqual(
        energy.open.map((task) => task.id),
        [late.id, later.id],
      );
      assert.equal(energy.openCount, 2);
      assert.equal(energy.overdueCount, 1);
      assert.equal(energy.open[0]!.due.label, 'Overdue by 2 days');
      assert.equal(energy.open[0]!.subjectHref, `/suppliers?supplierId=${energyCo.id}`);
      const insurer = bySupplier.get(insurerCo.id)!;
      assert.equal(insurer.openCount, 0);
      assert.deepEqual(
        insurer.doneRecently.map((task) => task.id),
        [other.id],
      );

      const page = getTasksPageView(fx.db, NOW);
      assert.deepEqual(
        page.open.overdue.map((task) => task.title),
        ['Send the meter reading'],
      );
      assert.deepEqual(
        page.open.undated.map((task) => `${task.title} · ${task.subjectLabel}`),
        ['Book the MOT · Vehicle A'],
      );
      assert.equal(
        page.open.undated[0]!.subjectHref,
        `/insights#vehicle-${fx.vehicles.vehicleA.id}`,
      );
      assert.equal(page.openCount, 3);
      assert.equal(page.overdueCount, 1);
      assert.deepEqual(
        page.doneRecently.map((task) => task.title),
        ['Ask for a quote'],
      );
      assert.ok(
        page.subjectOptions.suppliers.some((option) => option.value === `supplier:${energyCo.id}`),
      );
    } finally {
      fx.close();
    }
  });
});

describe('the interaction → task transaction (decision 175)', () => {
  it('saves the call and its follow-up together, linked both ways', async () => {
    const fx = await createHouseholdFixture(ALEX, NOW);
    try {
      const energyCo = createSupplier(fx.db, { name: 'EnergyCo', actor: ALEX });
      const { interaction, followUpTask } = addSupplierInteraction(fx.db, {
        supplierId: energyCo.id,
        channel: 'call',
        summary: 'Asked about a cheaper tariff',
        followUpDate: '2026-11-01',
        followUpTitle: 'Ring back about the fixed deal',
        actor: ALEX,
        now: NOW,
      });
      assert.ok(followUpTask !== null);
      assert.equal(followUpTask.title, 'Ring back about the fixed deal');
      assert.equal(followUpTask.relatedInteractionId, interaction.id);
      assert.equal(
        tasksByInteraction(fx.db, [interaction.id]).get(interaction.id)?.id,
        followUpTask.id,
      );

      // Words with no date still make a task: an undated promise is a promise.
      const undated = addSupplierInteraction(fx.db, {
        supplierId: energyCo.id,
        channel: 'email',
        summary: 'They will post the new terms',
        followUpTitle: 'Check the new terms arrived',
        actor: SAM,
      });
      assert.equal(undated.followUpTask?.dueDate, null);
    } finally {
      fx.close();
    }
  });

  it('a follow-up that cannot be saved takes the interaction with it', async () => {
    const fx = await createHouseholdFixture(ALEX, NOW);
    try {
      const energyCo = createSupplier(fx.db, { name: 'EnergyCo', actor: ALEX });
      // Make every task insert fail at the database, after the interaction
      // row has been written inside the same transaction.
      fx.handle.raw.exec(
        "CREATE TRIGGER refuse_tasks BEFORE INSERT ON tasks BEGIN SELECT RAISE(ABORT, 'no tasks today'); END;",
      );
      assert.throws(
        () =>
          addSupplierInteraction(fx.db, {
            supplierId: energyCo.id,
            channel: 'call',
            summary: 'Asked about a cheaper tariff',
            followUpDate: '2026-11-01',
            actor: ALEX,
          }),
        /no tasks today/,
      );
      assert.equal(fx.db.select().from(supplierInteractions).all().length, 0);
      assert.equal(
        fx.db
          .select()
          .from(auditEntries)
          .where(eq(auditEntries.action, 'supplier.interaction'))
          .all().length,
        0,
      );

      // Without a follow-up nothing touches `tasks`, so the call still logs.
      fx.handle.raw.exec('DROP TRIGGER refuse_tasks;');
      const { followUpTask } = addSupplierInteraction(fx.db, {
        supplierId: energyCo.id,
        channel: 'call',
        summary: 'Asked about a cheaper tariff',
        actor: ALEX,
      });
      assert.equal(followUpTask, null);
      assert.equal(fx.db.select().from(supplierInteractions).all().length, 1);
    } finally {
      fx.close();
    }
  });
});

describe('"The app has noticed" (derived, never stored)', () => {
  it('lists key dates in their window and fuel fills missing details, each with a link', async () => {
    const fx = await createHouseholdFixture(ALEX, NOW);
    try {
      const renewal = createRenewal(fx.db, {
        label: 'Vehicle A insurance',
        nextRenewalDate: '2026-10-09',
        actor: ALEX,
        now: NOW,
      });
      const fill = createPurchase(fx.db, {
        potId: fx.pots.main.id,
        totalPence: 6000,
        occurredAt: new Date('2026-09-20T09:00:00Z'),
        actor: ALEX,
        lines: [
          {
            amountPence: 6000,
            categoryId: fx.categoryId('Vehicle Running', 'Fuel'),
            targetKind: 'vehicle',
            targetId: fx.vehicles.vehicleA.id,
          },
        ],
      });

      const noticed = getNoticedItems(fx.db, NOW);
      const keyDate = noticed.find((item) => item.source === 'key-date');
      assert.ok(keyDate !== undefined);
      assert.equal(keyDate.message, 'Vehicle A insurance renews in 12 days');
      assert.equal(keyDate.stateWords, 'In 12 days');
      assert.equal(keyDate.href, `/contracts#renewal-${renewal.id}`);

      const fuel = noticed.find((item) => item.source === 'fuel-missing');
      assert.ok(fuel !== undefined);
      assert.match(fuel.message, /^Vehicle A: the £60\.00 fuel fill on Sun 20 Sept is missing/);
      assert.match(fuel.message, /the litres/);
      assert.equal(
        fuel.href,
        `/purchases?from=2026-09-20&to=2026-09-20#purchase-${fill.purchase.id}`,
      );
      // Derived items are never written down as tasks.
      assert.equal(fx.db.select().from(tasks).all().length, 0);
    } finally {
      fx.close();
    }
  });
});
