import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ProjectedDayToDayEvent } from '../src/lib/records/day-to-day';
import {
  buildHorizonDayDetails,
  describeDayToDayBasis,
  scheduleKindLabel,
} from '../src/lib/records/horizon-days';
import type { ProjectionLine } from '../src/lib/records/money-view';

/** Narrow an indexed element that the test has just asserted exists. */
function must<T>(value: T | undefined): T {
  assert.notEqual(value, undefined);
  return value as T;
}

const line = (overrides: Partial<ProjectionLine>): ProjectionLine => ({
  scheduleId: 1,
  name: 'Council tax',
  potId: 1,
  amountPence: 9500,
  dueDate: '2026-10-14',
  potLabel: 'Bills',
  scheduleKind: 'dd',
  ...overrides,
});

const event = (overrides: Partial<ProjectedDayToDayEvent>): ProjectedDayToDayEvent => ({
  kind: 'groceries',
  name: 'Weekly shop (projected)',
  amountPence: 9000,
  dueDate: '2026-10-14',
  vehicleId: null,
  basis: 'anchor',
  anchorDate: '2026-10-07',
  cadenceDays: 7,
  ...overrides,
});

describe('horizon day detail: per-day breakdown behind the Day by day table', () => {
  it('groups commitments, expected money in and day-to-day by due date', () => {
    const details = buildHorizonDayDetails({
      commitmentLines: [
        line({ name: 'Netflix', amountPence: 1099 }),
        line({ name: 'Council tax', amountPence: 9500 }),
        line({ name: 'Gym', amountPence: 3631, scheduleKind: 'so', dueDate: '2026-10-15' }),
      ],
      receiptLines: [
        line({
          name: 'Salary',
          amountPence: 215000,
          scheduleKind: 'receipt',
          dueDate: '2026-10-26',
        }),
        line({
          name: 'Support from Sam',
          amountPence: 20000,
          scheduleKind: null,
          expected: true,
          dueDate: '2026-10-26',
        }),
      ],
      dayToDayEvents: [
        event({ dueDate: '2026-10-14' }),
        event({
          kind: 'fuel',
          name: 'Fuel — Audi (projected)',
          amountPence: 6000,
          vehicleId: 3,
          basis: 'never',
          anchorDate: null,
          dueDate: '2026-10-14',
          cadenceDays: 30,
        }),
      ],
    });

    assert.deepEqual(
      details.map((detail) => detail.date),
      ['2026-10-14', '2026-10-15', '2026-10-26'],
    );

    const first = must(details[0]);
    assert.equal(first.commitmentsPence, 1099 + 9500);
    assert.deepEqual(
      first.commitments.map((item) => item.name),
      ['Council tax', 'Netflix'],
    );
    assert.equal(must(first.commitments[0]).subtitle, 'Bills · direct debit');
    assert.equal(first.dayToDayPence, 9000 + 6000);
    assert.equal(first.dayToDay.length, 2);

    const last = must(details[2]);
    assert.equal(last.receiptsPence, 215000 + 20000);
    const support = last.receipts.find((item) => item.name === 'Support from Sam');
    assert.equal(support?.expected, true);
    assert.equal(support?.subtitle, 'Bills · expected — never received');
    assert.equal(last.receipts.find((item) => item.name === 'Salary')?.expected, false);
  });

  it('keeps two schedules with the same name and date as separate rows', () => {
    const details = buildHorizonDayDetails({
      commitmentLines: [line({ amountPence: 500 }), line({ amountPence: 700 })],
      receiptLines: [],
      dayToDayEvents: [],
    });
    const detail = must(details[0]);
    assert.equal(detail.commitments.length, 2);
    assert.equal(new Set(detail.commitments.map((item) => item.key)).size, 2);
    assert.equal(detail.commitmentsPence, 1200);
  });

  it('returns nothing for quiet days and no lines', () => {
    assert.deepEqual(
      buildHorizonDayDetails({ commitmentLines: [], receiptLines: [], dayToDayEvents: [] }),
      [],
    );
  });

  it('names the schedule kinds the household reads', () => {
    assert.equal(scheduleKindLabel('dd'), 'direct debit');
    assert.equal(scheduleKindLabel('so'), 'standing order');
    assert.equal(scheduleKindLabel('receipt'), 'income');
    assert.equal(scheduleKindLabel(null), 'expected support');
  });
});

describe('horizon day detail: basis explanations for projected shops and fills', () => {
  it('anchored shop names the last weekly shop and the Settings figure', () => {
    assert.equal(
      describeDayToDayBasis(event({})),
      'Projected every 7 days from the last weekly shop on 2026-10-07, at the figure set in Settings.',
    );
  });

  it("anchored fill names the vehicle's last recorded fill", () => {
    const text = describeDayToDayBasis(
      event({ kind: 'fuel', cadenceDays: 30, anchorDate: '2026-09-20', vehicleId: 2 }),
    );
    assert.match(text, /last recorded fill for this vehicle on 2026-09-20/);
    assert.match(text, /every 30 days/);
  });

  it('overdue series say the anchor is old and the projection starts tomorrow', () => {
    const text = describeDayToDayBasis(event({ basis: 'overdue', anchorDate: '2026-09-01' }));
    assert.match(text, /last weekly shop was on 2026-09-01, more than 7 days ago/);
    assert.match(text, /projected from tomorrow/);
  });

  it('never-recorded series say so and start tomorrow', () => {
    const text = describeDayToDayBasis(event({ basis: 'never', anchorDate: null }));
    assert.match(text, /No weekly shop has been recorded yet/);
    assert.match(text, /projected from tomorrow/);
  });
});
