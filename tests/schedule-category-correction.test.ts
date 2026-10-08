import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { createHouseholdFixture, type HouseholdFixture } from './household';
import { editPurchase, getPurchaseWithLines } from '../src/lib/records/purchases';
import {
  createSchedule,
  editSchedule,
  listInstances,
  materializeAndConvert,
} from '../src/lib/records/schedules';
import { listAuditForEntity } from '../src/lib/audit';

/**
 * A schedule's category is a forward-looking setting; a payment that has
 * already converted is a record of what happened (SPEC §11.1: "historical
 * instances are never rewritten"). So correcting a category on the schedule
 * fixes the next payment, not the one already recorded. The fix for the one
 * already recorded is an ordinary, audited purchase edit (SPEC §9.5).
 *
 * This pins that the one-off route works, end to end, as the household
 * relies on it when a direct debit was set up with the wrong category.
 */

const ACTOR = 'alex@example.com';

describe('correcting a schedule category: forward only, past payments fixed on the purchase', () => {
  let fixture: HouseholdFixture;
  after(() => fixture.close());

  it('the schedule corrects the next payment; the recorded one is fixed by editing it', async () => {
    fixture = await createHouseholdFixture(ACTOR);
    const { db, pots } = fixture;
    const wrong = fixture.categoryId('Other', 'Uncategorised');
    const right = fixture.categoryId('Utilities', 'Energy');

    const { schedule } = createSchedule(db, {
      name: 'Energy DD',
      kind: 'dd',
      frequency: 'monthly',
      dueDayOfMonth: 1,
      amountPence: 7400,
      potId: pots.main.id,
      categoryId: wrong,
      supplierName: 'Northern Power Co',
      targetKind: 'household',
      targetId: null,
      activeFrom: '2026-09-01',
      actor: ACTOR,
      now: new Date('2026-09-02T09:00:00Z'),
    });

    // The 1st of September converts before anyone looks: the wrong category is recorded.
    materializeAndConvert(db, new Date('2026-09-02T09:00:00Z'));
    const september = listInstances(db, { scheduleId: schedule.id, state: 'converted' })[0];
    assert.ok(september?.instance.convertedRecordId);
    const septemberId = september.instance.convertedRecordId as number;
    assert.equal(getPurchaseWithLines(db, septemberId).allocations[0]?.categoryId, wrong);

    // The mistake is noticed and the schedule corrected.
    const edited = editSchedule(db, {
      id: schedule.id,
      expectedVersion: schedule.version,
      actor: ACTOR,
      now: new Date('2026-09-20T09:00:00Z'),
      patch: { categoryId: right },
    });
    assert.equal(edited.schedule.categoryId, right);

    // Forward only: the recorded payment keeps the category it was recorded with.
    assert.equal(getPurchaseWithLines(db, septemberId).allocations[0]?.categoryId, wrong);

    // The one-off route: edit that purchase's line. The record is kept and audited.
    const recorded = getPurchaseWithLines(db, septemberId);
    const line = recorded.allocations[0];
    assert.ok(line);
    editPurchase(db, {
      id: septemberId,
      expectedVersion: recorded.purchase.version,
      actor: ACTOR,
      now: new Date('2026-09-21T09:00:00Z'),
      patch: {
        lines: [
          {
            amountPence: line.amountPence,
            categoryId: right,
            targetKind: line.targetKind,
            targetId: line.targetId,
          },
        ],
      },
    });
    const corrected = getPurchaseWithLines(db, septemberId);
    assert.equal(corrected.allocations.length, 1);
    assert.equal(corrected.allocations[0]?.categoryId, right);
    assert.equal(corrected.allocations[0]?.amountPence, 7400);
    assert.equal(corrected.purchase.totalPence, 7400);
    assert.ok(
      listAuditForEntity(db, 'purchase', septemberId).some(
        (entry) => entry.action === 'purchase.edit',
      ),
      'the correction is in the purchase history',
    );

    // The next payment, converted after the schedule was corrected, uses the right category.
    materializeAndConvert(db, new Date('2026-10-02T09:00:00Z'));
    const october = listInstances(db, { scheduleId: schedule.id, state: 'converted' }).find(
      (row) => row.instance.dueDate === '2026-10-01',
    );
    assert.ok(october?.instance.convertedRecordId);
    assert.equal(
      getPurchaseWithLines(db, october.instance.convertedRecordId as number).allocations[0]
        ?.categoryId,
      right,
    );
  });
});
