import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { abbrevCategory } from '../src/components/charts/abbrev';

/**
 * The three-months-by-category chart shortens its axis names (SPEC §16.7 F,
 * decision 201) and carries the full name as the hover hint. The three shapes
 * are the household's own examples: “Grocer'”, “Person'”, “Vehicle'”.
 */
describe('chart axis labels', () => {
  it('shortens a long single word to six characters and an apostrophe', () => {
    assert.equal(abbrevCategory('Groceries'), "Grocer'");
    assert.equal(abbrevCategory('Personal'), "Person'");
    assert.equal(abbrevCategory('Utilities'), "Utilit'");
    assert.equal(abbrevCategory('Entertainment & Eating Out'), "Entert'");
    assert.equal(abbrevCategory('Holidays & Events'), "Holida'");
    // A long first word gets the same six-character cut:
    assert.equal(abbrevCategory('Household Bills'), "Househ'");
  });

  it('keeps the first word of a longer name when that word already fits', () => {
    assert.equal(abbrevCategory('Vehicle Running'), "Vehicle'");
  });

  it('leaves a short name whole', () => {
    assert.equal(abbrevCategory('Housing'), 'Housing');
    assert.equal(abbrevCategory('Savings'), 'Savings');
  });

  it('always marks a shortened name with the apostrophe', () => {
    for (const name of ['Groceries', 'Vehicle Running', 'Entertainment & Eating Out']) {
      assert.ok(abbrevCategory(name).endsWith("'"), name);
      assert.ok(abbrevCategory(name).length < name.length, name);
    }
  });
});
