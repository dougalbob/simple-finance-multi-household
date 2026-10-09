import assert from 'node:assert/strict';
import { it } from 'node:test';
import { weeklyPacePence, weeklyPaceText } from '../src/lib/records/weekly-pace';
import { projectToPayday } from '../src/lib/records/projection';

it('floors whole pounds using weeks to the low, not the later payday', () => {
  assert.equal(weeklyPacePence('2026-10-03', '2026-10-22', 54732), 20100);
  assert.equal(weeklyPacePence('2026-10-03', '2026-10-25', 54732), 17400);
  assert.equal(weeklyPacePence('2026-10-03', '2026-10-04', 1), 0);
  assert.match(
    weeklyPaceText('2026-10-03', '2026-10-22', 54732),
    /on top of the planned shop and fuel.*rounded down.*touch zero/,
  );
});
it('protects zero, with no invented allowance for a low today or a shortfall', () => {
  for (const low of [-100, 0, 100])
    assert.equal(weeklyPacePence('2026-10-03', '2026-10-03', low), null);
  assert.equal(weeklyPacePence('2026-10-03', '2026-10-22', -100), null);
  assert.equal(
    weeklyPaceText('2026-10-03', '2026-10-22', -100),
    'Projected shortfall: -£1.00 before payday. No discretionary spending is available at this time.',
  );
  assert.equal(
    weeklyPaceText('2026-10-03', '2026-10-22', -41357),
    'Projected shortfall: -£413.57 before payday. No discretionary spending is available at this time.',
  );
  assert.equal(
    weeklyPaceText('2026-10-03', '2026-10-22', 0),
    'The forecast already touches zero. No weekly allowance.',
  );
  assert.match(weeklyPaceText('2026-10-03', '2026-10-03', 100), /already today/);
});
it('ties retain the earliest low date, even with later money and spending', () => {
  const line = (date: string, amountPence: number) => ({
    scheduleId: 1,
    potId: 1,
    name: 'test',
    dueDate: date,
    amountPence,
  });
  const result = projectToPayday({
    now: new Date('2026-10-03T12:00:00Z'),
    availableNowPence: 60000,
    paydayDate: '2026-10-25',
    commitments: [line('2026-10-10', 10000), line('2026-10-22', 10000)],
    receipts: [line('2026-10-12', 10000), line('2026-10-25', 200000)],
    projectedGroceries: [],
    projectedFuel: [],
    warningThresholdPence: -100000,
    potWatches: [],
  });
  assert.equal(result.projectedLowPence, 50000);
  assert.equal(result.lowDate, '2026-10-10');
  assert.equal(weeklyPacePence('2026-10-03', result.lowDate, result.projectedLowPence), 50000);
});
