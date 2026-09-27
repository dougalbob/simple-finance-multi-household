import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { attentionView, isTaskRelevantToUser } from '../src/lib/records/attention';
import type { Task } from '../src/lib/records/tasks';
import type { KeyDateAlert } from '../src/lib/records/keydates';
import type { AuditEntry } from '../src/lib/audit';

const TODAY = '2026-09-27';
const NOW = new Date('2026-09-27T10:00:00Z');
const ALEX = 'alex@example.com';
const SAM = 'sam@example.com';

function makeTask(overrides: Partial<Task> & { id: number; title: string }): Task {
  return {
    id: overrides.id,
    title: overrides.title,
    detail: null,
    dueDate: overrides.dueDate ?? null,
    subjectKind: 'household',
    subjectId: null,
    relatedInteractionId: null,
    completedAt: null,
    completedBy: null,
    completionNote: null,
    assignedTo: overrides.assignedTo ?? null,
    createdBy: overrides.createdBy ?? ALEX,
    createdAt: overrides.createdAt ?? NOW,
    updatedAt: overrides.updatedAt ?? NOW,
    version: 1,
  } as Task;
}

function makeAlert(
  overrides: Partial<KeyDateAlert> & {
    id: number;
    kind: KeyDateAlert['kind'];
    state: KeyDateAlert['state'];
    date: string;
    daysUntil: number;
  },
): KeyDateAlert {
  return {
    label: overrides.label ?? 'Test',
    leadDays: 21,
    ...overrides,
  } as KeyDateAlert;
}

function makeAudit(
  overrides: Partial<AuditEntry> & {
    id: number;
    actor: string;
    action: string;
    entityId: string;
    createdAt: Date;
  },
): AuditEntry {
  return {
    id: overrides.id,
    actor: overrides.actor,
    action: overrides.action,
    entity: 'task',
    entityId: overrides.entityId,
    summary: overrides.summary ?? 'test',
    before: null,
    after: null,
    createdAt: overrides.createdAt,
  } as AuditEntry;
}

describe('attentionView — what counts', () => {
  it('overdue and today tasks count, upcoming and undated do not', () => {
    const tasks = [
      makeTask({ id: 1, title: 'Overdue', dueDate: '2026-09-24' }),
      makeTask({ id: 2, title: 'Today', dueDate: TODAY }),
      makeTask({ id: 3, title: 'Tomorrow', dueDate: '2026-09-28' }),
      makeTask({ id: 4, title: 'Undated', dueDate: null }),
      makeTask({ id: 5, title: 'In 10 days', dueDate: '2026-10-07' }),
    ];
    const view = attentionView({
      tasks,
      keyDateAlerts: [],
      auditRows: [],
      me: ALEX,
      seenAt: null,
      today: TODAY,
      now: NOW,
    });
    assert.equal(view.counts.needsAttention, 2);
    assert.equal(view.counts.overdue, 1);
    assert.equal(view.counts.today, 1);
    assert.equal(view.needsAttentionTasks.length, 2);
    assert.deepEqual(
      view.needsAttentionTasks.map((t) => t.id),
      [1, 2],
    );
    // Coming up in next 7 days: tomorrow counts, 10 days does not
    assert.equal(view.comingUpTasks.length, 1);
    assert.equal(view.comingUpTasks[0]!.id, 3);
  });

  it('key dates: today, past, rolled count; in-window does not', () => {
    const alerts = [
      makeAlert({ id: 1, kind: 'renewal', state: 'today', date: TODAY, daysUntil: 0 }),
      makeAlert({ id: 2, kind: 'renewal', state: 'past', date: '2026-09-20', daysUntil: -7 }),
      makeAlert({
        id: 3,
        kind: 'contract-end',
        state: 'rolled-awaiting-review',
        date: '2026-09-10',
        daysUntil: -17,
      }),
      makeAlert({ id: 4, kind: 'renewal', state: 'in-window', date: '2026-10-05', daysUntil: 8 }),
    ];
    const view = attentionView({
      tasks: [],
      keyDateAlerts: alerts,
      auditRows: [],
      me: ALEX,
      seenAt: null,
      today: TODAY,
      now: NOW,
    });
    assert.equal(view.counts.needsAttention, 3);
    assert.equal(view.counts.keyDateToday, 1);
    assert.equal(view.counts.keyDatePast, 1);
    assert.equal(view.counts.keyDateRolled, 1);
    assert.equal(view.needsAttentionKeyDates.length, 3);
    assert.equal(view.comingUpKeyDates.length, 1);
    assert.equal(view.comingUpKeyDates[0]!.id, 4);
  });

  it('assigned_to filtering: personal tasks only count for owner', () => {
    const tasks = [
      makeTask({ id: 1, title: 'Shared overdue', dueDate: '2026-09-24', assignedTo: null }),
      makeTask({ id: 2, title: 'Mine overdue', dueDate: '2026-09-24', assignedTo: ALEX }),
      makeTask({ id: 3, title: 'Sam overdue', dueDate: '2026-09-24', assignedTo: SAM }),
      makeTask({ id: 4, title: 'Shared today', dueDate: TODAY, assignedTo: null }),
      makeTask({ id: 5, title: 'Mine today', dueDate: TODAY, assignedTo: ALEX }),
    ];
    const viewAlex = attentionView({
      tasks,
      keyDateAlerts: [],
      auditRows: [],
      me: ALEX,
      seenAt: null,
      today: TODAY,
      now: NOW,
    });
    // Alex should see shared + mine = 4
    assert.equal(viewAlex.counts.needsAttention, 4);
    assert.deepEqual(viewAlex.needsAttentionTasks.map((t) => t.id).sort(), [1, 2, 4, 5]);

    const viewSam = attentionView({
      tasks,
      keyDateAlerts: [],
      auditRows: [],
      me: SAM,
      seenAt: null,
      today: TODAY,
      now: NOW,
    });
    // Sam should see shared + Sam's = 3
    assert.equal(viewSam.counts.needsAttention, 3);
    assert.deepEqual(viewSam.needsAttentionTasks.map((t) => t.id).sort(), [1, 3, 4]);
  });

  it('isTaskRelevantToUser helper', () => {
    assert.equal(isTaskRelevantToUser({ assignedTo: null }, ALEX), true);
    assert.equal(isTaskRelevantToUser({ assignedTo: '' }, ALEX), true);
    assert.equal(isTaskRelevantToUser({ assignedTo: ALEX }, ALEX), true);
    assert.equal(isTaskRelevantToUser({ assignedTo: ALEX.toUpperCase() }, ALEX), true);
    assert.equal(isTaskRelevantToUser({ assignedTo: SAM }, ALEX), false);
  });
});

describe('attentionView — since you last looked', () => {
  it('excludes own and system activity', () => {
    const auditRows = [
      makeAudit({
        id: 3,
        actor: SAM,
        action: 'task.create',
        entityId: '1',
        createdAt: new Date('2026-09-27T09:00:00Z'),
      }),
      makeAudit({
        id: 2,
        actor: ALEX,
        action: 'task.create',
        entityId: '2',
        createdAt: new Date('2026-09-27T09:05:00Z'),
      }),
      makeAudit({
        id: 1,
        actor: 'system',
        action: 'task.migrate',
        entityId: '3',
        createdAt: new Date('2026-09-27T09:10:00Z'),
      }),
    ];
    const view = attentionView({
      tasks: [],
      keyDateAlerts: [],
      auditRows,
      me: ALEX,
      seenAt: new Date('2026-09-27T08:00:00Z'),
      today: TODAY,
      now: NOW,
    });
    assert.equal(view.newSinceLastSeen.length, 1);
    assert.equal(view.newSinceLastSeen[0]!.actor, SAM);
  });

  it('respects seen_at and 7-day look-back when no row', () => {
    const auditRows = [
      makeAudit({
        id: 2,
        actor: SAM,
        action: 'task.create',
        entityId: '1',
        createdAt: new Date('2026-09-27T09:00:00Z'),
      }),
      makeAudit({
        id: 1,
        actor: SAM,
        action: 'task.complete',
        entityId: '1',
        createdAt: new Date('2026-09-20T09:00:00Z'),
      }),
    ];
    // Seen at 08:30 today: only 09:00 today is new
    const viewSeen = attentionView({
      tasks: [],
      keyDateAlerts: [],
      auditRows,
      me: ALEX,
      seenAt: new Date('2026-09-27T08:30:00Z'),
      today: TODAY,
      now: NOW,
    });
    assert.equal(viewSeen.newSinceLastSeen.length, 1);
    assert.equal(viewSeen.newSinceLastSeen[0]!.id, 2);

    // No seen row: look back 7 days at most, so 09:00 today is new, 20th is at exactly 7 days -> should be included? Now is 27th 10:00, 20th 09:00 is 7d 1h ago, so outside 7d window? We use now-7d = 20th 10:00, so 20th 09:00 is before cutoff, excluded.
    const viewNoSeen = attentionView({
      tasks: [],
      keyDateAlerts: [],
      auditRows,
      me: ALEX,
      seenAt: null,
      today: TODAY,
      now: NOW,
    });
    assert.equal(viewNoSeen.newSinceLastSeen.length, 1);
    assert.equal(viewNoSeen.newSinceLastSeen[0]!.id, 2);
  });

  it('caps at 20 entries', () => {
    const auditRows = Array.from({ length: 25 }, (_, i) =>
      makeAudit({
        id: 25 - i,
        actor: SAM,
        action: 'task.create',
        entityId: String(i + 1),
        createdAt: new Date(NOW.getTime() - i * 1000),
      }),
    );
    const view = attentionView({
      tasks: [],
      keyDateAlerts: [],
      auditRows,
      me: ALEX,
      seenAt: new Date('2026-09-20T00:00:00Z'),
      today: TODAY,
      now: NOW,
    });
    assert.equal(view.newSinceLastSeen.length, 20);
  });

  it('accessible name includes counts and new dot', () => {
    const tasks = [makeTask({ id: 1, title: 'Overdue', dueDate: '2026-09-24' })];
    const auditRows = [
      makeAudit({
        id: 1,
        actor: SAM,
        action: 'task.create',
        entityId: '1',
        createdAt: new Date('2026-09-27T09:00:00Z'),
      }),
    ];
    const view = attentionView({
      tasks,
      keyDateAlerts: [],
      auditRows,
      me: ALEX,
      seenAt: new Date('2026-09-27T08:00:00Z'),
      today: TODAY,
      now: NOW,
    });
    assert.match(view.accessibleName, /Needs attention: 1/);
    assert.match(view.accessibleName, /1 overdue/);
    assert.match(view.accessibleName, /1 new since you last looked/);
    assert.equal(view.newDotLabel, '1 new since you last looked');
  });

  it('zero means no badge', () => {
    const view = attentionView({
      tasks: [],
      keyDateAlerts: [],
      auditRows: [],
      me: ALEX,
      seenAt: null,
      today: TODAY,
      now: NOW,
    });
    assert.equal(view.counts.needsAttention, 0);
    assert.equal(view.accessibleName, 'Nothing needs attention');
    assert.equal(view.newDotLabel, null);
  });
});
