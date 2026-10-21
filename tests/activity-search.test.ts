import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ACTIVITY_SEARCH_MAX_LENGTH,
  activityRowMatchesSearch,
  normalizeActivitySearch,
} from '../src/lib/records/activity-search';

/**
 * The All Transactions supplier-and-notes search (GitHub issue #98). It reads
 * the two columns the household sees — the row's source (supplier, the other
 * pot, a counterparty, an income source) and its note — and matches the same
 * way the in-page pickers do: case and spacing folded, every typed word
 * somewhere across the two, in any order.
 */
describe('All Transactions supplier and notes search (issue #98)', () => {
  const corner = { source: 'Corner Foods', note: 'Weekly shop' };
  const transfer = { source: "Alex's cash", note: 'Son wages' };

  it('matches everything when nothing is typed', () => {
    assert.equal(activityRowMatchesSearch(corner, ''), true);
    assert.equal(activityRowMatchesSearch(corner, '   '), true);
    assert.equal(normalizeActivitySearch('  Corner   Foods '), 'corner foods');
  });

  it('finds a supplier, case-insensitively and on any part of the name', () => {
    assert.equal(activityRowMatchesSearch(corner, 'corner'), true);
    assert.equal(activityRowMatchesSearch(corner, 'FOODS'), true);
    assert.equal(activityRowMatchesSearch(corner, 'newsagent'), false);
  });

  it('finds a note', () => {
    assert.equal(activityRowMatchesSearch(corner, 'weekly'), true);
    assert.equal(activityRowMatchesSearch(transfer, 'wages'), true);
    assert.equal(activityRowMatchesSearch(transfer, 'shop'), false);
  });

  it('reads the two columns together: every word in either, in any order', () => {
    assert.equal(activityRowMatchesSearch(corner, 'corner weekly'), true);
    assert.equal(activityRowMatchesSearch(corner, 'weekly corner'), true);
    // A word in neither column is still a miss.
    assert.equal(activityRowMatchesSearch(corner, 'corner weekly 63'), false);
  });

  it('matches a transfer by the other pot’s label — the source column as shown', () => {
    assert.equal(activityRowMatchesSearch(transfer, "alex's cash"), true);
    assert.equal(activityRowMatchesSearch(transfer, 'alex son'), true);
  });

  it('caps an over-long query at the same prefix the page sends', () => {
    const long = 'a'.repeat(ACTIVITY_SEARCH_MAX_LENGTH + 20);
    assert.equal(normalizeActivitySearch(long).length, ACTIVITY_SEARCH_MAX_LENGTH);
  });
});
