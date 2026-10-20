import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { createHouseholdFixture, type HouseholdFixture } from './household';
import { addCheckpoint } from '../src/lib/records/pots';
import { createSchedule } from '../src/lib/records/schedules';
import { getProjectionView, nextPaydayDate } from '../src/lib/records/money-view';
import { setPaydayDayOfMonth } from '../src/lib/records/settings';
import {
  defaultHorizonThrough,
  resolveHorizonThrough,
  type HorizonThroughInput,
} from '../src/lib/records/horizon-default';

/**
 * Horizon defaults to the day before the next configured household payday.
 * Receipt schedules never define that boundary. The five-week fallback is
 * used only when the household has not set a payday, while an explicit valid
 * in-range `?through=` always wins.
 */

const TODAY = '2026-09-23';
const NOW = new Date('2026-09-23T19:30:00+01:00');
const ACTOR = 'alex@example.com';
const base: HorizonThroughInput = {
  today: TODAY,
  requested: null,
  nextPaydayDate: null,
  minDate: '2026-09-24', // today + 1
  maxDate: '2027-10-28', // today + 400
  fallbackDays: 35,
};
const resolve = (patch: Partial<HorizonThroughInput>) =>
  resolveHorizonThrough({ ...base, ...patch });

describe('horizon default date — the configured-payday clamp table', () => {
  it('ordinary case: the day before the next configured payday', () => {
    assert.deepEqual(resolve({ nextPaydayDate: '2026-10-25' }), {
      date: '2026-10-24',
      source: 'day-before-payday',
    });
  });

  it('crosses month boundaries with local-calendar arithmetic', () => {
    assert.equal(resolve({ nextPaydayDate: '2026-11-01' }).date, '2026-10-31');
    assert.equal(
      resolve({
        today: '2028-02-10',
        minDate: '2028-02-11',
        maxDate: '2029-03-16',
        nextPaydayDate: '2028-03-01',
      }).date,
      '2028-02-29',
    );
  });

  it('a payday tomorrow clamps up to today + 1', () => {
    assert.deepEqual(resolve({ nextPaydayDate: '2026-09-24' }), {
      date: '2026-09-24',
      source: 'day-before-payday',
    });
  });

  it('a payday the day after tomorrow uses its preceding day', () => {
    assert.equal(resolve({ nextPaydayDate: '2026-09-25' }).date, '2026-09-24');
  });

  it('a payday beyond the 400-day cap clamps down to today + 400', () => {
    assert.deepEqual(resolve({ nextPaydayDate: '2027-12-01' }), {
      date: '2027-10-28',
      source: 'day-before-payday',
    });
    assert.equal(resolve({ nextPaydayDate: '2027-10-29' }).date, '2027-10-28');
  });

  it('only an unset payday uses the five-week fallback', () => {
    assert.deepEqual(resolve({ nextPaydayDate: null }), {
      date: '2026-10-28',
      source: 'fallback',
    });
  });

  it('ignores an invalid or non-future resolver input and falls back defensively', () => {
    assert.equal(resolve({ nextPaydayDate: 'soon' }).source, 'fallback');
    assert.equal(resolve({ nextPaydayDate: TODAY }).source, 'fallback');
    assert.equal(resolve({ nextPaydayDate: '2026-09-01' }).source, 'fallback');
  });

  it('an explicit in-range ?through= wins unchanged', () => {
    assert.deepEqual(resolve({ requested: '2026-12-01', nextPaydayDate: '2026-10-25' }), {
      date: '2026-12-01',
      source: 'requested',
    });
    assert.equal(resolve({ requested: '2026-09-24' }).source, 'requested');
    assert.equal(resolve({ requested: '2027-10-28' }).source, 'requested');
  });

  it('an invalid or out-of-range ?through= falls to the configured-payday default', () => {
    for (const requested of ['', 'tomorrow', '2026-02-30', TODAY, '2026-09-01', '2027-10-29']) {
      assert.deepEqual(
        resolve({ requested, nextPaydayDate: '2026-10-25' }),
        { date: '2026-10-24', source: 'day-before-payday' },
        `requested=${JSON.stringify(requested)}`,
      );
    }
  });

  it('defaultHorizonThrough ignores the request entirely', () => {
    assert.equal(
      defaultHorizonThrough({ ...base, nextPaydayDate: '2026-10-25' }).date,
      '2026-10-24',
    );
  });

  it('the default always sits inside [min, max]', () => {
    const candidates = [null, '2026-09-24', '2026-09-25', '2026-10-25', '2027-10-29', '2030-01-01'];
    for (const nextPaydayDate of candidates) {
      const { date } = resolve({ nextPaydayDate });
      assert.ok(date >= base.minDate && date <= base.maxDate, `${nextPaydayDate} → ${date}`);
    }
  });
});

describe('configured payday drives the projection and Horizon independently of receipts', () => {
  let fixture: HouseholdFixture | undefined;
  after(() => fixture?.close());

  it('enables the projection with no receipts and keeps multiple receipt dates inside the window', async () => {
    fixture = await createHouseholdFixture(ACTOR, NOW);
    const { db, pots } = fixture;
    addCheckpoint(db, { potId: pots.main.id, amountPence: 100000, actor: ACTOR, now: NOW });
    setPaydayDayOfMonth(db, 27, ACTOR, NOW); // Sunday 27 September → Friday 25 September

    assert.equal(nextPaydayDate(db, TODAY), '2026-09-25');
    const emptyReceipts = getProjectionView(db, NOW);
    assert.ok(emptyReceipts, 'a household payday plus a liquid checkpoint is enough');
    assert.equal(emptyReceipts.result.paydayDate, '2026-09-25');
    assert.deepEqual(emptyReceipts.receiptLines, []);
    assert.equal(emptyReceipts.result.totalReceiptsPence, 0);

    for (const [name, day, amountPence] of [
      ['Benefit', 24, 5000],
      ['Second receipt', 25, 7000],
      ['After payday', 28, 9000],
    ] as const) {
      createSchedule(db, {
        name,
        kind: 'receipt',
        frequency: 'monthly',
        dueDayOfMonth: day,
        amountPence,
        potId: pots.main.id,
        activeFrom: '2026-09-01',
        actor: ACTOR,
        now: NOW,
      });
    }

    const withReceipts = getProjectionView(db, NOW);
    assert.ok(withReceipts);
    assert.equal(withReceipts.result.paydayDate, '2026-09-25');
    assert.deepEqual(
      withReceipts.receiptLines.map((line) => [line.name, line.dueDate]),
      [
        ['Benefit', '2026-09-24'],
        ['Second receipt', '2026-09-25'],
      ],
    );
    assert.equal(withReceipts.result.totalReceiptsPence, 12000);

    const horizonDefault = resolve({ nextPaydayDate: nextPaydayDate(db, TODAY) });
    assert.deepEqual(horizonDefault, { date: '2026-09-24', source: 'day-before-payday' });
  });

  it('receipt schedules do not replace the no-payday fallback', async () => {
    fixture = await createHouseholdFixture(ACTOR, NOW);
    const { db, pots } = fixture;
    addCheckpoint(db, { potId: pots.main.id, amountPence: 100000, actor: ACTOR, now: NOW });
    createSchedule(db, {
      name: 'Regular receipt',
      kind: 'receipt',
      frequency: 'monthly',
      dueDayOfMonth: 25,
      amountPence: 215000,
      potId: pots.main.id,
      activeFrom: '2026-09-01',
      actor: ACTOR,
      now: NOW,
    });

    assert.equal(nextPaydayDate(db, TODAY), null);
    assert.equal(
      getProjectionView(db, NOW),
      null,
      'a receipt schedule alone does not configure payday',
    );
    assert.deepEqual(resolve({ nextPaydayDate: nextPaydayDate(db, TODAY) }), {
      date: '2026-10-28',
      source: 'fallback',
    });
  });
});
