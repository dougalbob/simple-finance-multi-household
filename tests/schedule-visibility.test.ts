import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  filterScheduleVisibility,
  parseHideCancelled,
  recurringHref,
} from '../src/lib/records/schedule-visibility';

/** Issue #28: hide-cancelled filter for the Recurring Schedules list. */

const rows = [
  { id: 1, cancelled: false },
  { id: 2, cancelled: true },
  { id: 3, cancelled: false },
  { id: 4, cancelled: true },
];
const isCancelled = (row: { cancelled: boolean }) => row.cancelled;

describe('parseHideCancelled', () => {
  it('hides only for the exact value 1', () => {
    assert.equal(parseHideCancelled('1'), true);
    assert.equal(parseHideCancelled('0'), false);
    assert.equal(parseHideCancelled('true'), false);
    assert.equal(parseHideCancelled(''), false);
    assert.equal(parseHideCancelled(undefined), false);
  });
});

describe('filterScheduleVisibility', () => {
  it('shows every row by default, with the cancelled count and nothing hidden', () => {
    const view = filterScheduleVisibility(rows, isCancelled, false);
    assert.deepEqual(
      view.visible.map((row) => row.id),
      [1, 2, 3, 4],
    );
    assert.equal(view.cancelledCount, 2);
    assert.equal(view.hiddenCount, 0);
  });

  it('hides cancelled rows and reports how many, keeping the original order', () => {
    const view = filterScheduleVisibility(rows, isCancelled, true);
    assert.deepEqual(
      view.visible.map((row) => row.id),
      [1, 3],
    );
    assert.equal(view.cancelledCount, 2);
    assert.equal(view.hiddenCount, 2);
  });

  it('handles a list with no cancelled schedules and an empty list', () => {
    const active = rows.filter((row) => !row.cancelled);
    const none = filterScheduleVisibility(active, isCancelled, true);
    assert.equal(none.visible.length, 2);
    assert.equal(none.cancelledCount, 0);
    assert.equal(none.hiddenCount, 0);

    const empty = filterScheduleVisibility([], isCancelled, true);
    assert.deepEqual(empty, { visible: [], cancelledCount: 0, hiddenCount: 0 });
  });

  it('does not mutate the input list', () => {
    const copy = [...rows];
    filterScheduleVisibility(rows, isCancelled, true);
    assert.deepEqual(rows, copy);
  });
});

describe('recurringHref', () => {
  it('keeps the month and the hide choice together', () => {
    assert.equal(recurringHref({ hideCancelled: false }), '/recurring');
    assert.equal(recurringHref({ hideCancelled: true }), '/recurring?hideCancelled=1');
    assert.equal(
      recurringHref({ month: '2026-11', hideCancelled: true }),
      '/recurring?month=2026-11&hideCancelled=1',
    );
    assert.equal(
      recurringHref({ month: '2026-11', hideCancelled: false }),
      '/recurring?month=2026-11',
    );
  });
});
