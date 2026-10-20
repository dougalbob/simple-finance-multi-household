import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildPaydaySummary,
  commitmentKindsByPot,
  paydaySummaryFromView,
  TRANSFER_LEAD_DAYS,
  type PaydaySummaryInput,
  type PaydayTransferWatch,
} from '../src/lib/records/payday-summary';
import type { ProjectionView } from '../src/lib/records/money-view';

/**
 * The payday summary (v0.37.0 follow-up, decision 187): a short, plain-English card
 * with the configured-payday projection, the household low, the worst
 * bills-only pot shortfall and a qualified day-to-day-inclusive guide. Payday
 * is the 26th; Natwest's direct debits are due on the 21st, so the five-day
 * transfer lead is the 16th.
 */

const NATWEST_BILLS = [
  { name: 'Council tax', amountPence: 17842 },
  { name: 'Mortgage', amountPence: 68500 },
  { name: 'Water Bill', amountPence: 3200 },
];

function watch(overrides: Partial<PaydayTransferWatch> = {}): PaydayTransferWatch {
  return {
    potId: 1,
    potLabel: 'Natwest',
    shortfallPence: 85000,
    estimatePence: 31200,
    earliestDueDate: '2026-10-21',
    earliestCommitments: NATWEST_BILLS,
    commitmentKinds: ['dd'],
    ...overrides,
  };
}

function input(overrides: Partial<PaydaySummaryInput> = {}): PaydaySummaryInput {
  return {
    today: '2026-10-08',
    paydayDate: '2026-10-26',
    paydayDays: 18,
    availableNowPence: 24222,
    projectedLowPence: -16525,
    dayToDayPence: 0,
    transfers: [],
    ...overrides,
  };
}

describe('payday summary: the household’s worked example', () => {
  it('states payday, the liquid low and the day-before-payday Horizon date', () => {
    const summary = buildPaydaySummary(input());
    assert.equal(summary.paydayLine, 'Next pay day is 26th October (18 days from today)');
    assert.equal(
      summary.lowLine,
      'Based on a current household balance of £242.22 in bank and cash pots and no additional ' +
        'unplanned spending, the household low would reach -£165.25.',
    );
    assert.equal(summary.horizonThroughDate, '2026-10-25');
    assert.equal('overdraftLine' in summary, false);
  });

  it('asks for the bills-only transfer five days before the earliest bill', () => {
    assert.equal(TRANSFER_LEAD_DAYS, 5);
    const summary = buildPaydaySummary(input({ transfers: [watch()] }));
    assert.deepEqual(summary.transfers, [
      {
        potId: 1,
        text:
          'Natwest has the worst bills-only shortfall: £850.00 (upcoming Direct Debits next due ' +
          '21st October — Council tax, Mortgage and Water Bill). Aim to transfer at least £850.00 ' +
          'into Natwest by 16th October.',
      },
    ]);
  });

  it('keeps a negative low in the conventional -£96.35 order', () => {
    const summary = buildPaydaySummary(input({ projectedLowPence: -9635 }));
    assert.match(summary.lowLine ?? '', /household low would reach -£96\.35\.$/);
  });
});

describe('payday summary: the pay day line', () => {
  it('says "1 day", not "1 days"', () => {
    const summary = buildPaydaySummary(input({ paydayDate: '2026-10-09', paydayDays: 1 }));
    assert.equal(summary.paydayLine, 'Next pay day is 9th October (1 day from today)');
  });

  it('carries the year when payday is not in this year', () => {
    const summary = buildPaydaySummary(
      input({
        today: '2026-12-30',
        paydayDate: '2027-01-26',
        paydayDays: 27,
        projectedLowPence: 12000,
      }),
    );
    assert.equal(summary.paydayLine, 'Next pay day is 26th January 2027 (27 days from today)');
    assert.equal(summary.horizonThroughDate, '2027-01-25');
  });

  it('has no low sentence when there is no window to project', () => {
    const summary = buildPaydaySummary(input({ projectedLowPence: null }));
    assert.equal(summary.lowLine, null);
  });
});

describe('payday summary: the transfer sentence', () => {
  it('adds a qualified guide when projected day-to-day spending is positive', () => {
    const summary = buildPaydaySummary(input({ transfers: [watch()], dayToDayPence: 4750 }));
    assert.equal(
      summary.transfers[0]?.text,
      'Natwest has the worst bills-only shortfall: £850.00 (upcoming Direct Debits next due ' +
        '21st October — Council tax, Mortgage and Water Bill). If projected day-to-day spending ' +
        'also comes from Natwest, the guide shortfall is about £897.50 — a guide, not a strict ' +
        'pot allocation. Aim to transfer at least £850.00 into Natwest by 16th October.',
    );
  });

  it('uses the day-to-day guide only for the named pot, not a household allocation', () => {
    const summary = buildPaydaySummary(
      input({
        transfers: [watch({ potLabel: 'Main account' })],
        dayToDayPence: 12345,
      }),
    );
    assert.match(summary.transfers[0]?.text ?? '', /also comes from Main account/);
    assert.match(summary.transfers[0]?.text ?? '', /guide, not a strict pot allocation/);
    assert.doesNotMatch(summary.transfers[0]?.text ?? '', /across the household/);
  });

  it('names the pot with the greatest bills-only shortfall, not the greatest guide', () => {
    const natwest = watch({ shortfallPence: 85000 });
    const main = watch({
      potId: 2,
      potLabel: 'Main account',
      shortfallPence: 70000,
      estimatePence: 5000,
    });
    const summary = buildPaydaySummary(input({ transfers: [main, natwest], dayToDayPence: 30000 }));
    assert.equal(summary.transfers.length, 1);
    assert.equal(summary.transfers[0]?.potId, 1);
    assert.match(summary.transfers[0]?.text ?? '', /^Natwest has the worst bills-only shortfall/);
  });

  it('does not show the day-to-day guide when there is no projected spending', () => {
    const summary = buildPaydaySummary(input({ transfers: [watch()], dayToDayPence: 0 }));
    assert.doesNotMatch(summary.transfers[0]?.text ?? '', /guide shortfall/);
    assert.doesNotMatch(summary.transfers[0]?.text ?? '', /strict pot allocation/);
  });

  it('names standing orders when that is what the pot has', () => {
    const summary = buildPaydaySummary(input({ transfers: [watch({ commitmentKinds: ['so'] })] }));
    assert.match(summary.transfers[0]?.text ?? '', /upcoming standing orders next due/);
  });

  it('names both when the pot has both kinds of bill', () => {
    const summary = buildPaydaySummary(
      input({ transfers: [watch({ commitmentKinds: ['dd', 'so'] })] }),
    );
    assert.match(summary.transfers[0]?.text ?? '', /upcoming Direct Debits and standing orders/);
  });

  it('counts the bills it does not name', () => {
    const summary = buildPaydaySummary(
      input({
        transfers: [
          watch({
            earliestCommitments: [
              { name: 'Council tax', amountPence: 100 },
              { name: 'Mortgage', amountPence: 100 },
              { name: 'Water Bill', amountPence: 100 },
              { name: 'Energy', amountPence: 100 },
              { name: 'Broadband', amountPence: 100 },
            ],
          }),
        ],
      }),
    );
    assert.match(
      summary.transfers[0]?.text ?? '',
      /— Council tax, Mortgage, Water Bill and 2 more\)/,
    );
  });

  it('drops the bill list when there is nothing to name', () => {
    const summary = buildPaydaySummary(input({ transfers: [watch({ earliestCommitments: [] })] }));
    assert.match(
      summary.transfers[0]?.text ?? '',
      /\(upcoming Direct Debits next due 21st October\)\./,
    );
  });

  it('names the day while the five-day lead is still ahead', () => {
    const summary = buildPaydaySummary(
      input({ today: '2026-10-05', transfers: [watch({ earliestDueDate: '2026-10-11' })] }),
    );
    assert.match(summary.transfers[0]?.text ?? '', /into Natwest by 6th October\.$/);
  });

  it('says "as soon as you can" once the five-day lead has arrived or passed', () => {
    for (const today of ['2026-10-06', '2026-10-08']) {
      const summary = buildPaydaySummary(
        input({ today, transfers: [watch({ earliestDueDate: '2026-10-11' })] }),
      );
      assert.match(summary.transfers[0]?.text ?? '', /into Natwest as soon as you can\.$/);
    }
  });

  it('gives an already-negative pot with no upcoming bills an immediate transfer plan', () => {
    const summary = buildPaydaySummary(
      input({
        transfers: [
          watch({
            potLabel: 'Main account',
            estimatePence: -44365,
            shortfallPence: 44365,
            earliestDueDate: null,
            earliestCommitments: [],
            commitmentKinds: [],
          }),
        ],
      }),
    );
    assert.equal(
      summary.transfers[0]?.text,
      'Main account has the worst bills-only shortfall: £443.65. It is already £443.65 overdrawn, ' +
        'with no bills left in this window. Aim to transfer at least £443.65 into Main account as ' +
        'soon as you can.',
    );
  });

  it('returns no transfer lines when no pot is short', () => {
    const summary = buildPaydaySummary(input());
    assert.deepEqual(summary.transfers, []);
  });
});

describe('commitmentKindsByPot', () => {
  it('groups the kinds each pot has in the window and skips kind-less lines', () => {
    const kinds = commitmentKindsByPot([
      { potId: 1, scheduleKind: 'dd' },
      { potId: 1, scheduleKind: 'so' },
      { potId: 2, scheduleKind: 'dd' },
      { potId: 2, scheduleKind: null },
    ]);
    assert.deepEqual(kinds.get(1), ['dd', 'so']);
    assert.deepEqual(kinds.get(2), ['dd']);
    assert.equal(kinds.get(3), undefined);
  });
});

describe('paydaySummaryFromView', () => {
  it('reads today from the snapshot, day-to-day spend and labels from the view', () => {
    const view = {
      result: {
        paydayDate: '2026-10-26',
        days: 18,
        availableNowPence: 24222,
        projectedLowPence: -16525,
        dayToDayPence: 4750,
        potWatches: [
          {
            potId: 7,
            estimatePence: 31200,
            commitmentsPence: 85000,
            watchPence: -53800,
            shortfallPence: 85000,
            earliestDueDate: '2026-10-21',
            earliestCommitments: NATWEST_BILLS,
          },
        ],
      },
      snapshot: { asOf: new Date('2026-10-08T12:00:00Z') },
      potLabels: new Map([[7, 'Natwest']]),
      commitmentLines: [
        { potId: 7, scheduleKind: 'dd' },
        { potId: 7, scheduleKind: 'so' },
      ],
    } as unknown as ProjectionView;

    const summary = paydaySummaryFromView(view);
    assert.equal(summary?.paydayLine, 'Next pay day is 26th October (18 days from today)');
    assert.match(
      summary?.transfers[0]?.text ?? '',
      /Natwest has the worst bills-only shortfall: £850\.00.*guide shortfall is about £897\.50/,
    );
  });

  it('returns null when there is no payday to talk about', () => {
    const view = { result: { paydayDate: null } } as unknown as ProjectionView;
    assert.equal(paydaySummaryFromView(view), null);
  });
});
