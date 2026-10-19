import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MIX_RESET_KEYS,
  chartsHref,
  chartsQuery,
  mixShowReconfirms,
  sameIdSet,
  syncMonthWindow,
} from '../src/lib/charts-sync';

/**
 * The Chart D → Chart E sync's pure halves (issue #81, decision 241): the
 * one query builder that rewrites `/charts` parameters without dropping the
 * other charts' state, the month→window hand-off, and the rule for when
 * Chart E's own Show keeps the "set from Spending trends" provenance.
 */

function query(href: string): URLSearchParams {
  return new URL(href, 'http://example.test').searchParams;
}

describe('chartsQuery', () => {
  it('preserves the other charts’ state, including repeated keys', () => {
    const result = chartsQuery(
      [
        ['preset', 'abc'],
        ['who', 'person:1'],
        ['cat', '12'],
        ['cat', '13'],
        ['noHousing', '1'],
      ],
      { set: { from: '2026-09-01', to: '2026-09-30' } },
    );
    assert.equal(result.get('preset'), 'abc');
    assert.equal(result.get('who'), 'person:1');
    assert.equal(result.get('noHousing'), '1');
    assert.deepEqual(result.getAll('cat'), ['12', '13']);
    assert.equal(result.get('from'), '2026-09-01');
    assert.equal(result.get('to'), '2026-09-30');
  });

  it('replaces a set key wholesale instead of appending to it', () => {
    const result = chartsQuery(
      [
        ['cat', '12'],
        ['cat', '13'],
      ],
      { set: { cat: ['7', '8', '9'] } },
    );
    assert.deepEqual(result.getAll('cat'), ['7', '8', '9']);
  });

  it('removes a key set to undefined, and every key in drop', () => {
    const result = chartsQuery(
      [
        ['from', '2026-09-01'],
        ['to', '2026-09-30'],
        ['catset', '1'],
        ['cat', '12'],
        ['slice', 'x'],
        ['mixvia', '1'],
        ['mixsync', '1'],
        ['preset', 'abc'],
      ],
      { set: { cat: undefined }, drop: MIX_RESET_KEYS },
    );
    assert.equal(result.toString(), 'preset=abc');
  });

  it('never carries the dead scheduleOnly param forward', () => {
    const result = chartsQuery(
      [
        ['scheduleOnly', '1'],
        ['preset', 'abc'],
      ],
      {},
    );
    assert.equal(result.toString(), 'preset=abc');
  });
});

describe('chartsHref', () => {
  it('builds /charts with the query and the anchor', () => {
    assert.equal(
      chartsHref([['preset', 'abc']], { set: { mixsync: '1' } }, '#commitments'),
      '/charts?preset=abc&mixsync=1#commitments',
    );
  });

  it('drops the question mark when nothing is left', () => {
    assert.equal(chartsHref([['mixsync', '1']], { drop: MIX_RESET_KEYS }, '#mix'), '/charts#mix');
    assert.equal(chartsHref([], {}, ''), '/charts');
  });
});

describe('syncMonthWindow', () => {
  it('hands a completed month over whole, first day to last', () => {
    assert.deepEqual(
      syncMonthWindow({ from: '2026-09-01', to: '2026-09-30', complete: true }, '2026-10-19'),
      { from: '2026-09-01', to: '2026-09-30' },
    );
  });

  it('ends the month being lived at today, which is Month to date', () => {
    assert.deepEqual(
      syncMonthWindow({ from: '2026-10-01', to: '2026-10-31', complete: false }, '2026-10-19'),
      { from: '2026-10-01', to: '2026-10-19' },
    );
  });
});

describe('sameIdSet', () => {
  it('is order-insensitive across strings and numbers', () => {
    assert.ok(sameIdSet([12, '13', 7], ['7', 13, '12']));
    assert.ok(!sameIdSet([12, 13], [12]));
    assert.ok(!sameIdSet([], ['12']));
  });
});

describe('mixShowReconfirms', () => {
  const all = ['1', '2', '3', '4'];

  it('reconfirms an identical explicit selection', () => {
    assert.ok(
      mixShowReconfirms({
        currentFrom: '2026-09-01',
        currentTo: '2026-09-30',
        currentCats: ['2', '1'],
        submittedFrom: '2026-09-01',
        submittedTo: '2026-09-30',
        submittedCats: ['1', '2'],
        allCategoryIds: all,
      }),
    );
  });

  it('treats an unticked tree and an explicit all-children list as the same selection', () => {
    assert.ok(
      mixShowReconfirms({
        currentFrom: '2026-09-01',
        currentTo: '2026-09-30',
        currentCats: ['1', '2', '3', '4'],
        submittedFrom: '2026-09-01',
        submittedTo: '2026-09-30',
        submittedCats: null,
        allCategoryIds: all,
      }),
    );
    assert.ok(
      mixShowReconfirms({
        currentFrom: '2026-09-01',
        currentTo: '2026-09-30',
        currentCats: null,
        submittedFrom: '2026-09-01',
        submittedTo: '2026-09-30',
        submittedCats: all,
        allCategoryIds: all,
      }),
    );
  });

  it('does not reconfirm changed dates, changed categories or a missing window', () => {
    const base = {
      currentFrom: '2026-09-01',
      currentTo: '2026-09-30',
      currentCats: ['1', '2'],
      submittedFrom: '2026-09-01',
      submittedTo: '2026-09-30',
      submittedCats: ['1', '2'],
      allCategoryIds: all,
    };
    assert.ok(!mixShowReconfirms({ ...base, submittedTo: '2026-09-29' }));
    assert.ok(!mixShowReconfirms({ ...base, submittedCats: ['1'] }));
    assert.ok(!mixShowReconfirms({ ...base, currentFrom: null }));
    assert.ok(!mixShowReconfirms({ ...base, currentCats: null }));
  });
});
