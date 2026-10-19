import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeSearchText, rankSearchMatches } from '../src/lib/search';

/**
 * The searchable pickers behind GitHub issues #76 (till categories) and #78
 * (Recurring suppliers). Both lists live in the page, so this pure ranking is
 * the only place the matching rules can drift; the rows and keyboard
 * behaviour are covered by the Playwright suite.
 */
describe('searchable picker ranking', () => {
  const categories = [
    { label: 'Weekly Shop', searchText: 'Groceries' },
    { label: 'Top-up Shops', searchText: 'Groceries' },
    { label: 'Energy', searchText: 'Utilities' },
    { label: 'Mobile Phones', searchText: 'Utilities' },
    { label: 'Fuel', searchText: 'Vehicle Running' },
  ];

  it('shows every option, in the caller’s order, when nothing is typed', () => {
    assert.deepEqual(
      rankSearchMatches(categories, '').map((option) => option.label),
      categories.map((option) => option.label),
    );
    assert.deepEqual(
      rankSearchMatches(categories, '   ').map((option) => option.label),
      categories.map((option) => option.label),
    );
  });

  it('matches the parent or the child, case-insensitively', () => {
    assert.deepEqual(
      rankSearchMatches(categories, 'GROC').map((option) => option.label),
      ['Weekly Shop', 'Top-up Shops'],
    );
    assert.deepEqual(
      rankSearchMatches(categories, 'mobile').map((option) => option.label),
      ['Mobile Phones'],
    );
  });

  it('requires every typed word, in any order, anywhere in the label', () => {
    assert.deepEqual(
      rankSearchMatches(categories, 'shop groc').map((option) => option.label),
      ['Weekly Shop', 'Top-up Shops'],
    );
    assert.deepEqual(
      rankSearchMatches(categories, 'running fuel').map((option) => option.label),
      ['Fuel'],
    );
    assert.deepEqual(rankSearchMatches(categories, 'shop energy'), []);
  });

  it('puts a phrase match first, then scarce words, then the original order', () => {
    // "Energy" starts with the query; "Utilities" only contains it, so the
    // child is offered before the parent's other children.
    const ranked = rankSearchMatches(
      [
        { label: 'Renewable energy', searchText: 'Utilities' },
        { label: 'Energy', searchText: 'Utilities' },
        { label: 'Green Energy', searchText: 'Utilities' },
      ],
      'energy',
    );
    assert.deepEqual(
      ranked.map((option) => option.label),
      ['Energy', 'Green Energy', 'Renewable energy'],
    );
  });

  it('does not mutate the options it was given', () => {
    const original = [...categories];
    rankSearchMatches(categories, 'shop');
    assert.deepEqual(categories, original);
  });

  it('normalises the query and the searchable text the same way', () => {
    assert.equal(normalizeSearchText('  Corner   Foods '), 'corner foods');
    assert.deepEqual(
      rankSearchMatches(
        [{ label: 'Corner   Foods', searchText: 'Groceries  /  Weekly Shop' }],
        '  corner foods ',
      ).map((option) => option.label),
      ['Corner   Foods'],
    );
  });
});
