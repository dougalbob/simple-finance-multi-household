import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  filterScheduleVisibility,
  parseHideCancelled,
  recurringHref,
  resolveHideCancelled,
  scheduleRecurringHref,
  SCHEDULE_HIDE_CANCELLED_COOKIE,
} from '../src/lib/records/schedule-visibility';

/** Issues #28, #34, #35: schedule visibility, filtering, persistence, and supplier links. */

const rows = [
  { id: 1, name: 'Council Tax', supplierName: 'City Council', cancelled: false },
  { id: 2, name: 'Water Bill', supplierName: 'South Staffs Water', cancelled: true },
  { id: 3, name: 'Broadband', supplierName: 'Meadow Telecom', cancelled: false },
  { id: 4, name: 'Gas & Electric', supplierName: 'Northern Power', cancelled: true },
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

describe('resolveHideCancelled (issue #35 cookie persistence)', () => {
  it('prefers explicit search parameter over cookie', () => {
    assert.equal(resolveHideCancelled('1', '0'), true);
    assert.equal(resolveHideCancelled('0', '1'), false);
    assert.equal(resolveHideCancelled('1', undefined), true);
    assert.equal(resolveHideCancelled('0', undefined), false);
  });

  it('falls back to cookie when search parameter is omitted', () => {
    assert.equal(resolveHideCancelled(undefined, '1'), true);
    assert.equal(resolveHideCancelled(undefined, '0'), false);
    assert.equal(resolveHideCancelled(undefined, 'invalid'), false);
  });

  it('defaults to false when neither search parameter nor cookie is present', () => {
    assert.equal(resolveHideCancelled(undefined, undefined), false);
  });

  it('exports the expected cookie constant name', () => {
    assert.equal(SCHEDULE_HIDE_CANCELLED_COOKIE, 'sf_hide_cancelled_schedules');
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

  it('filters by schedule name query and shows matching cancelled schedules even when hideCancelled is true (issue #34)', () => {
    // Water Bill is cancelled; hideCancelled is true. Under search, Water Bill MUST be visible!
    const view = filterScheduleVisibility(rows, isCancelled, true, 'Water');
    assert.deepEqual(
      view.visible.map((row) => row.id),
      [2],
    );
    assert.equal(view.cancelledCount, 2);
    assert.equal(view.hiddenCount, 0);
  });

  it('filters by supplier name query', () => {
    const view = filterScheduleVisibility(rows, isCancelled, false, 'Northern Power');
    assert.deepEqual(
      view.visible.map((row) => row.id),
      [4],
    );
  });

  it('returns empty visible list when query matches nothing', () => {
    const view = filterScheduleVisibility(rows, isCancelled, false, 'NonExistent');
    assert.equal(view.visible.length, 0);
    assert.equal(view.cancelledCount, 2);
  });

  it('supports nested schedule object shapes', () => {
    const nested = [
      { schedule: { name: 'Water Rates' }, supplierName: 'WaterCo', isCancelled: false },
      { schedule: { name: 'Council Tax' }, supplierName: 'City', isCancelled: false },
    ];
    const view = filterScheduleVisibility(nested, (r) => r.isCancelled, false, 'rates');
    assert.equal(view.visible.length, 1);
    assert.equal(view.visible[0]!.schedule.name, 'Water Rates');
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

  it('includes search query and hash when provided', () => {
    assert.equal(
      recurringHref({ q: 'Water Bill', hash: 'schedule-2' }),
      '/recurring?q=Water+Bill#schedule-2',
    );
    assert.equal(
      recurringHref({ month: '2026-11', hideCancelled: true, q: 'Tax' }),
      '/recurring?month=2026-11&hideCancelled=1&q=Tax',
    );
  });
});

describe('scheduleRecurringHref (issue #34)', () => {
  it('generates the deep link with search query and schedule row anchor', () => {
    assert.equal(
      scheduleRecurringHref({ id: 5, name: 'Water Bill' }),
      '/recurring?q=Water+Bill#schedule-5',
    );
    assert.equal(
      scheduleRecurringHref({ id: 12, name: 'South Staffs Water' }),
      '/recurring?q=South+Staffs+Water#schedule-12',
    );
  });
});
