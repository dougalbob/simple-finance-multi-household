import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  assertAssignableEmail,
  assertSafeHouseholdId,
  isSafeHouseholdId,
  newHouseholdId,
  normalizeEmail,
} from '../src/lib/registry/ids';
import {
  householdDataDir,
  householdDatabasePath,
  householdDocumentsDir,
  systemRegistryPath,
} from '../src/lib/registry/paths';
import { InvalidEmailError, InvalidHouseholdIdError } from '../src/lib/registry/errors';

/**
 * Path derivation for the multi-household layout (SPEC §18.1): household paths
 * come from the data root plus a validated opaque id. A registry value can
 * never smuggle a path segment, and nothing from the browser is ever an id.
 */
describe('registry ids and path derivation', () => {
  it('mints opaque 128-bit hex household ids', () => {
    const id = newHouseholdId();
    assert.match(id, /^[a-f0-9]{32}$/);
    assert.notEqual(id, newHouseholdId());
    assert.equal(isSafeHouseholdId(id), true);
  });

  it('rejects any household id that is not exactly the opaque format', () => {
    for (const bad of [
      '',
      '../escape',
      'abcdef',
      'A'.repeat(32), // upper case is not the format
      `${'a'.repeat(32)}/../../etc`,
      'a'.repeat(31),
      'a'.repeat(33),
      'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz',
    ]) {
      assert.equal(isSafeHouseholdId(bad), false, `expected ${JSON.stringify(bad)} to be unsafe`);
      assert.throws(
        () => assertSafeHouseholdId(bad),
        InvalidHouseholdIdError,
        `expected ${JSON.stringify(bad)} to throw`,
      );
    }
  });

  it('derives every household path under <dataDir>/households/<id>', () => {
    const id = newHouseholdId();
    assert.equal(systemRegistryPath('/data'), path.join('/data', 'system', 'registry.sqlite'));
    assert.equal(householdDataDir('/data', id), path.join('/data', 'households', id));
    assert.equal(
      householdDatabasePath('/data', id),
      path.join('/data', 'households', id, 'simple-finance.sqlite'),
    );
    assert.equal(
      householdDocumentsDir('/data', id),
      path.join('/data', 'households', id, 'documents'),
    );
  });

  it('never builds a path from an unsafe id (traversal stays impossible)', () => {
    assert.throws(() => householdDataDir('/data', '../../etc'), InvalidHouseholdIdError);
    assert.throws(() => householdDatabasePath('/data', '..'), InvalidHouseholdIdError);
    assert.throws(
      () => householdDocumentsDir('/data', 'households/other'),
      InvalidHouseholdIdError,
    );
  });

  it('normalises and validates sign-in emails in one place', () => {
    assert.equal(normalizeEmail('  Alex@Example.COM '), 'alex@example.com');
    assert.equal(assertAssignableEmail(' Alex@Example.com '), 'alex@example.com');
    for (const bad of ['', 'plain', 'a@b', 'a b@example.com', `${'a'.repeat(250)}@example.com`]) {
      assert.throws(() => assertAssignableEmail(bad), InvalidEmailError);
    }
  });
});
