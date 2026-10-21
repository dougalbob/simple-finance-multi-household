import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DATE_RANGE_ALL_FROM,
  dateRangePresets,
  matchedDateRangePreset,
} from '../src/lib/records/date-range-presets';

/**
 * The All Transactions range drop-down (GitHub issue #98). The calendar
 * edges are where a preset goes wrong — a 30-day lookback across a month or
 * year end, "last month" in January or after a leap February — so they are
 * pinned here rather than inferred from a browser run.
 */
describe('All Transactions range presets (issue #98)', () => {
  it('offers the household’s five ranges in their order, all ending today', () => {
    const presets = dateRangePresets('2026-10-21');
    assert.deepEqual(
      presets.map((preset) => [preset.id, preset.label, preset.from, preset.to]),
      [
        ['last-30-days', 'Last 30 days', '2026-09-22', '2026-10-21'],
        ['this-month', 'This month', '2026-10-01', '2026-10-21'],
        ['last-month', 'Last Month', '2026-09-01', '2026-09-30'],
        ['this-year', 'This Year', '2026-01-01', '2026-10-21'],
        ['all', 'All', DATE_RANGE_ALL_FROM, '2026-10-21'],
      ],
    );
  });

  it('reaches back across a year boundary without losing a day', () => {
    const presets = dateRangePresets('2026-01-15');
    const byId = new Map(presets.map((preset) => [preset.id, preset]));
    assert.equal(byId.get('last-30-days')?.from, '2025-12-17');
    assert.equal(byId.get('last-month')?.from, '2025-12-01');
    assert.equal(byId.get('last-month')?.to, '2025-12-31');
    assert.equal(byId.get('this-year')?.from, '2026-01-01');
  });

  it('ends Last Month on the 29th after a leap February, and the 28th otherwise', () => {
    assert.equal(
      dateRangePresets('2024-03-10').find((preset) => preset.id === 'last-month')?.to,
      '2024-02-29',
    );
    assert.equal(
      dateRangePresets('2025-03-10').find((preset) => preset.id === 'last-month')?.to,
      '2025-02-28',
    );
  });

  it('on the first of a month, This month is one day and Last Month is the whole previous month', () => {
    const presets = dateRangePresets('2026-11-01');
    assert.equal(presets.find((preset) => preset.id === 'this-month')?.from, '2026-11-01');
    assert.equal(presets.find((preset) => preset.id === 'last-month')?.from, '2026-10-01');
    assert.equal(presets.find((preset) => preset.id === 'last-month')?.to, '2026-10-31');
  });

  it('recognises the window it is showing, and calls anything else custom', () => {
    const today = '2026-10-21';
    assert.equal(matchedDateRangePreset(today, '2026-10-01', today)?.id, 'this-month');
    assert.equal(matchedDateRangePreset(today, DATE_RANGE_ALL_FROM, today)?.id, 'all');
    // One day off either edge is a hand-edited window, not a preset.
    assert.equal(matchedDateRangePreset(today, '2026-10-02', today), null);
    assert.equal(matchedDateRangePreset(today, '2026-10-01', '2026-10-20'), null);
  });
});
