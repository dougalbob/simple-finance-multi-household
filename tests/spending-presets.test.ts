import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createHouseholdFixture, type HouseholdFixture } from './household';
import { changeSpendingPreset, getSpendingPresets } from '../src/lib/records/spending-presets';
import { setCommitmentCategoryIds } from '../src/lib/records/settings';
import {
  createChildCategory,
  createParentCategory,
  retireCategory,
} from '../src/lib/records/categories';
import { listAuditForEntity } from '../src/lib/audit';
import { getCommitmentCategoryPicker } from '../src/lib/records/charts-view';

const actor = 'alex@example.com';
describe('household spending category presets', () => {
  let fixture: HouseholdFixture;
  beforeEach(async () => {
    fixture = await createHouseholdFixture();
  });
  afterEach(() => fixture.close());
  const save = (name: string, categoryIds: number[], id = '') =>
    changeSpendingPreset(fixture.db, {
      operation: 'save',
      id,
      name,
      categoryIds,
      version: getSpendingPresets(fixture.db).version,
      actor,
    });
  const remove = (id: string) =>
    changeSpendingPreset(fixture.db, {
      operation: 'delete',
      id,
      version: getSpendingPresets(fixture.db).version,
      actor,
    });

  it('preserves legacy selections, including explicit empty, without a write on read', () => {
    assert.equal(getSpendingPresets(fixture.db).source, 'schedules');
    setCommitmentCategoryIds(fixture.db, [], actor);
    assert.deepEqual(getSpendingPresets(fixture.db).presets[0]?.categoryIds, []);
    assert.equal(getSpendingPresets(fixture.db).source, 'legacy');
    const id = fixture.categoryId('Utilities', 'Energy');
    setCommitmentCategoryIds(fixture.db, [id], actor);
    assert.deepEqual(getSpendingPresets(fixture.db).presets[0], {
      id: 'fixed-commitments',
      name: 'Fixed commitments',
      categoryIds: [id],
    });
    assert.equal(listAuditForEntity(fixture.db, 'setting', 'spending_category_presets').length, 0);
    save('Everyday', []);
    assert.deepEqual(getSpendingPresets(fixture.db).presets[0]?.categoryIds, [id]);
  });

  it('creates, renames and deletes stable IDs, audits before/after, and never resurrects a deleted last preset', () => {
    const energy = fixture.categoryId('Utilities', 'Energy');
    const id = save('  Bills  ', [energy, energy]);
    assert.equal(getSpendingPresets(fixture.db).version, 1);
    assert.deepEqual(getSpendingPresets(fixture.db).presets[1], {
      id,
      name: 'Bills',
      categoryIds: [energy],
    });
    save('Essentials', [], id);
    assert.equal(getSpendingPresets(fixture.db).presets[1]?.id, id);
    assert.equal(getSpendingPresets(fixture.db).presets[1]?.name, 'Essentials');
    remove(id);
    remove('fixed-commitments');
    assert.deepEqual(getSpendingPresets(fixture.db).presets, []);
    const audit = listAuditForEntity(fixture.db, 'setting', 'spending_category_presets');
    assert.equal(audit.length, 4);
    assert.ok(audit.every((entry) => entry.before !== null && entry.after !== null));
    assert.equal(getSpendingPresets(fixture.db).source, 'saved');
    save('Start again', []);
    assert.equal(getSpendingPresets(fixture.db).presets.length, 1);
  });

  it('rejects stale writes, duplicate/blank/long names, invalid IDs and parent IDs atomically', () => {
    save('Bills', []);
    const before = getSpendingPresets(fixture.db);
    const parent = createParentCategory(fixture.db, { name: 'Test parent', actor });
    for (const [name, ids] of [
      ['bills', []],
      ['', []],
      ['x'.repeat(61), []],
      ['Invalid', [-1]],
      ['Parent', [parent.id]],
      ['Missing', [999999]],
      ['Fraction', [1.5]],
    ] as [string, number[]][]) {
      assert.throws(() => save(name, ids));
      assert.deepEqual(getSpendingPresets(fixture.db), before);
    }
    assert.throws(
      () =>
        changeSpendingPreset(fixture.db, {
          operation: 'save',
          id: '',
          name: 'Stale',
          categoryIds: [],
          version: 0,
          actor,
        }),
      /another window/,
    );
    assert.throws(() => save('Gone', [], 'missing'), /no longer exists/);
    assert.throws(() => remove('missing'), /no longer exists/);
    assert.equal(listAuditForEntity(fixture.db, 'setting', 'spending_category_presets').length, 1);
  });

  it('retains retired categories for historical spending and stores snapshots, not live parent selections', () => {
    const parent = createParentCategory(fixture.db, { name: 'Test parent', actor });
    const child = createChildCategory(fixture.db, { parentId: parent.id, name: 'Old', actor });
    const id = save('Historic', [child.id]);
    retireCategory(fixture.db, { id: child.id, expectedVersion: child.version, actor });
    createChildCategory(fixture.db, { parentId: parent.id, name: 'New', actor });
    save('Historic renamed', [child.id], id);
    assert.deepEqual(
      getSpendingPresets(fixture.db).presets.find((preset) => preset.id === id)?.categoryIds,
      [child.id],
    );
    assert.ok(
      getCommitmentCategoryPicker(fixture.db, true)
        .groups.flatMap((group) => group.children)
        .some((entry) => entry.id === child.id && entry.retired),
    );
  });

  it('does not share presets with another household', async () => {
    const other = await createHouseholdFixture('other@example.com');
    try {
      save('Private to this household', []);
      assert.equal(getSpendingPresets(other.db).version, 0);
      assert.ok(
        !getSpendingPresets(other.db).presets.some(
          (preset) => preset.name === 'Private to this household',
        ),
      );
    } finally {
      other.close();
    }
  });
});
