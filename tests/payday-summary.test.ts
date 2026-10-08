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
 * The payday summary (v0.36.0, decision 186): the household's own worked
 * example, pinned to the character. Today is 8 October 2026; the next salary
 * lands on the 26th (18 days); the household's liquid balance is £242.22; the
 * projection's low is −£165.25 (below zero, inside the £250 threshold, so no
 * fee); and Natwest is £850.00 short of its direct debits due on the 21st, so
 * the money should move by the 16th (five days early, TRANSFER_LEAD_DAYS).
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
    tier: 'heads-up',
    warningThresholdPence: 25000,
    transfers: [],
    ...overrides,
  };
}

describe('payday summary: the household’s worked example', () => {
  it('states the pay day, the low and the fee verdict', () => {
    const summary = buildPaydaySummary(input());
    assert.equal(summary.paydayLine, 'Next pay day is 26th October (18 days from today)');
    assert.equal(
      summary.lowLine,
      'Based on a current household balance of £242.22 in bank and cash pots and no additional ' +
        'unplanned spending, the household low would reach -£165.25.',
    );
    assert.equal(summary.overdraftLine, 'No overdraft fees would be incurred.');
    assert.equal(summary.horizonThroughDate, '2026-10-25');
  });

  it('asks for the transfer by five days before the earliest bill', () => {
    assert.equal(TRANSFER_LEAD_DAYS, 5);
    const summary = buildPaydaySummary(input({ transfers: [watch()] }));
    assert.deepEqual(summary.transfers, [
      {
        potId: 1,
        text:
          'Natwest will run about £850.00 short of its upcoming Direct Debits (next due 21st ' +
          'October — Council tax, Mortgage and Water Bill). Aim to transfer at least £850.00 into ' +
          'Natwest by 16th October.',
      },
    ]);
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
        tier: 'none',
      }),
    );
    assert.equal(summary.paydayLine, 'Next pay day is 26th January 2027 (27 days from today)');
    // The horizon date is payday − 1, whatever the year.
    assert.equal(summary.horizonThroughDate, '2027-01-25');
  });
});

describe('payday summary: the fee verdict follows the tier', () => {
  it('heads-up inside the threshold: no fee', () => {
    const summary = buildPaydaySummary(input({ tier: 'heads-up', projectedLowPence: -1000 }));
    assert.equal(summary.overdraftLine, 'No overdraft fees would be incurred.');
  });

  it('above zero throughout: no fee', () => {
    const summary = buildPaydaySummary(input({ tier: 'none', projectedLowPence: 45000 }));
    assert.equal(summary.overdraftLine, 'No overdraft fees would be incurred.');
  });

  it('past the configured threshold: says so, with the threshold figure', () => {
    const summary = buildPaydaySummary(
      input({ tier: 'warning', projectedLowPence: -57126, warningThresholdPence: 25000 }),
    );
    assert.equal(
      summary.overdraftLine,
      'Overdraft fees are likely — the low passes the configured £250.00 bank warning threshold.',
    );
  });

  it('past the threshold with nothing configured still says fees are likely', () => {
    const summary = buildPaydaySummary(
      input({ tier: 'warning', projectedLowPence: -57126, warningThresholdPence: null }),
    );
    assert.equal(summary.overdraftLine, 'Overdraft fees are likely.');
  });

  it('no window to project: no low sentence and no fee sentence', () => {
    const summary = buildPaydaySummary(input({ projectedLowPence: null, tier: 'none' }));
    assert.equal(summary.lowLine, null);
    assert.equal(summary.overdraftLine, null);
  });
});

describe('payday summary: the transfer sentence', () => {
  it('names standing orders when that is what the pot has', () => {
    const summary = buildPaydaySummary(input({ transfers: [watch({ commitmentKinds: ['so'] })] }));
    assert.match(summary.transfers[0]!.text, /short of its upcoming standing orders \(next due/);
  });

  it('names both when the pot has both', () => {
    const summary = buildPaydaySummary(
      input({ transfers: [watch({ commitmentKinds: ['dd', 'so'] })] }),
    );
    assert.match(
      summary.transfers[0]!.text,
      /short of its upcoming Direct Debits and standing orders \(next due/,
    );
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
    assert.match(summary.transfers[0]!.text, /— Council tax, Mortgage, Water Bill and 2 more\)/);
  });

  it('drops the bracket when there is nothing to name', () => {
    const summary = buildPaydaySummary(input({ transfers: [watch({ earliestCommitments: [] })] }));
    assert.match(summary.transfers[0]!.text, /\(next due 21st October\)\. Aim to transfer/);
  });

  it('names the day while the five-day lead is still ahead', () => {
    const summary = buildPaydaySummary(
      input({
        today: '2026-10-05',
        transfers: [watch({ earliestDueDate: '2026-10-11' })],
      }),
    );
    assert.match(summary.transfers[0]!.text, /into Natwest by 6th October\.$/);
  });

  it('says "as soon as you can" once the five-day lead has arrived or passed', () => {
    // On the day itself (11th − 5 = the 6th) there is no lead left, and the
    // later cases are already behind it.
    for (const today of ['2026-10-06', '2026-10-08']) {
      const summary = buildPaydaySummary(
        input({ today, transfers: [watch({ earliestDueDate: '2026-10-11' })] }),
      );
      assert.match(summary.transfers[0]!.text, /into Natwest as soon as you can\.$/);
    }
  });

  it('handles a pot already below zero with nothing left to leave it', () => {
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
      summary.transfers[0]!.text,
      'Main account is already £443.65 overdrawn and has no bills left in this window. Aim to ' +
        'transfer at least £443.65 into Main account as soon as you can.',
    );
  });

  it('returns no transfer lines when every pot covers its own bills', () => {
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
  it('reads today from the snapshot and the labels from the view', () => {
    const view = {
      result: {
        paydayDate: '2026-10-26',
        days: 18,
        availableNowPence: 24222,
        projectedLowPence: -16525,
        tier: 'heads-up',
        warningThresholdPence: 25000,
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
      summary?.transfers[0]!.text ?? '',
      /Natwest will run about £850.00 short of its upcoming Direct Debits and standing orders/,
    );
  });

  it('returns null when there is no payday to talk about', () => {
    const view = { result: { paydayDate: null } } as unknown as ProjectionView;
    assert.equal(paydaySummaryFromView(view), null);
  });
});
