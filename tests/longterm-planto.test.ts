import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parsePlanDocument } from '../src/lib/longterm/validation';

describe('long-term plan: saved plans from before plan-to load unchanged (issue #73, slice 3)', () => {
  it('fills each person’s plan-to from the saved horizon and defaults tax indexation', () => {
    const document = parsePlanDocument({
      comparisonRatesBp: [400, 600, 800],
      plan: {
        people: [
          {
            id: 'p1',
            label: 'A',
            birthYear: 1970,
            earnings: null,
            statePension: null,
            pensionPots: [],
          },
          {
            id: 'p2',
            label: 'B',
            birthYear: 1980,
            earnings: null,
            statePension: null,
            pensionPots: [],
          },
        ],
        investments: [],
        windfalls: [],
        spending: { monthlyPence: 0, otherAnnualPence: 0 },
        commitments: [],
        inflationBp: 250,
        isaShelterAnnualPence: 0,
        horizonEndDate: '2070-12-31',
      },
    });
    // The horizon is unchanged: the younger person's 90th year (2070).
    assert.equal(document.plan.horizonEndDate, '2070-12-31');
    assert.equal(document.plan.people[0]?.planToAge, 100);
    assert.equal(document.plan.people[1]?.planToAge, 90);
    assert.equal(document.plan.taxThresholdsBp, 100);
  });
});
