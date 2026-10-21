import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  chartDrillKey,
  isPersonalSeriesKey,
  isSameChartDrill,
  parseChartDrillKey,
} from '../src/lib/charts-drill';

/**
 * The URL half of the in-line line items behind Charts B, C and F (issue
 * #94, decision 250). The keys are shared by the links the reader taps and
 * the panel the server renders, so a key that parses to something else — or
 * to nothing — is a broken drill-down, not a cosmetic bug.
 */

describe('chartDrillKey', () => {
  it('names the chart and the thing tapped, in a shareable shape', () => {
    assert.equal(chartDrillKey({ kind: 'groceries', weekStart: '2026-09-14' }), 'b:2026-09-14');
    assert.equal(
      chartDrillKey({ kind: 'personal', month: '2026-09', series: 'person:3' }),
      'c:2026-09:person:3',
    );
    assert.equal(
      chartDrillKey({ kind: 'personal', month: '2026-09', series: 'household' }),
      'c:2026-09:household',
    );
    assert.equal(chartDrillKey({ kind: 'months', month: '2026-09', parentId: 12 }), 'f:2026-09:12');
  });
});

describe('parseChartDrillKey', () => {
  it('round-trips every key it builds', () => {
    const selections = [
      { kind: 'groceries', weekStart: '2026-09-14' },
      { kind: 'personal', month: '2026-09', series: 'person:3' },
      { kind: 'personal', month: '2026-09', series: 'household' },
      { kind: 'months', month: '2026-09', parentId: 12 },
    ] as const;
    for (const selection of selections) {
      assert.deepEqual(parseChartDrillKey(chartDrillKey(selection)), selection);
    }
  });

  it('accepts only the shapes the page produces', () => {
    for (const raw of [
      undefined,
      null,
      '',
      'b',
      'b:2026-02-30',
      'b:2026-9-14',
      'b:2026-09-14:extra',
      'c:2026-09',
      'c:2026-13:household',
      'c:2026-09:person:0',
      'c:2026-09:person:3:extra',
      'c:2026-09:sonia',
      'f:2026-09',
      'f:2026-00:12',
      'f:2026-09:0',
      'f:2026-09:abc',
      'f:2026-09:12:extra',
      'm:2026-09',
      'p:3:2026-09',
    ]) {
      assert.equal(parseChartDrillKey(raw), null, String(raw));
    }
  });

  it('keeps a person series key whole, colon and all', () => {
    assert.deepEqual(parseChartDrillKey('c:2026-09:person:42'), {
      kind: 'personal',
      month: '2026-09',
      series: 'person:42',
    });
  });
});

describe('isPersonalSeriesKey', () => {
  it('is the personal chart’s own series vocabulary', () => {
    assert.equal(isPersonalSeriesKey('household'), true);
    assert.equal(isPersonalSeriesKey('person:1'), true);
    assert.equal(isPersonalSeriesKey('person:01'), false);
    assert.equal(isPersonalSeriesKey('vehicle:1'), false);
  });
});

describe('isSameChartDrill', () => {
  it('is the tap that closes the open panel — never a different one', () => {
    const open = parseChartDrillKey('b:2026-09-14');
    assert.equal(isSameChartDrill(open, { kind: 'groceries', weekStart: '2026-09-14' }), true);
    assert.equal(isSameChartDrill(open, { kind: 'groceries', weekStart: '2026-09-07' }), false);
    assert.equal(isSameChartDrill(open, { kind: 'months', month: '2026-09', parentId: 2 }), false);
    // Nothing is open, so a first tap is always an opening.
    assert.equal(isSameChartDrill(null, { kind: 'groceries', weekStart: '2026-09-14' }), false);
    assert.equal(isSameChartDrill(open, null), false);
  });
});
