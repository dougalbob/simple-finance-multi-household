import { randomUUID } from 'node:crypto';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { recordAudit } from '../audit';
import type { Db } from '../db/client';
import { categories, schedules, settings } from '../db/schema';
import { getCommitmentCategoryIds, InvalidSettingValueError } from './settings';

const KEY = 'spending_category_presets';
export interface SpendingPreset {
  id: string;
  name: string;
  categoryIds: number[];
}
export interface SpendingPresets {
  presets: SpendingPreset[];
  version: number;
  source: 'saved' | 'legacy' | 'schedules';
}

/** Read-only compatibility: the old selection survives without a migration or a write on GET. */
export function getSpendingPresets(db: Db): SpendingPresets {
  const row = db.select().from(settings).where(eq(settings.key, KEY)).get();
  if (row)
    return {
      presets: JSON.parse(row.value) as SpendingPreset[],
      version: row.version,
      source: 'saved',
    };
  const legacy = getCommitmentCategoryIds(db);
  const categoryIds =
    legacy ??
    [
      ...new Set(
        db
          .select({ id: schedules.categoryId })
          .from(schedules)
          .where(and(isNotNull(schedules.categoryId), sql`${schedules.kind} in ('dd','so')`))
          .all()
          .flatMap((row) => (row.id === null ? [] : [row.id])),
      ),
    ].sort((a, b) => a - b);
  return {
    presets: [{ id: 'fixed-commitments', name: 'Fixed commitments', categoryIds }],
    version: 0,
    source: legacy === null ? 'schedules' : 'legacy',
  };
}

/** The version covers the whole collection, so two tabs cannot silently overwrite one another. */
export function changeSpendingPreset(
  db: Db,
  input: {
    operation: 'save' | 'delete';
    id: string;
    name?: string;
    categoryIds?: number[];
    version: number;
    actor: string;
    now?: Date;
  },
): string {
  return db.transaction((tx) => {
    const current = getSpendingPresets(db);
    if (!Number.isInteger(input.version) || input.version !== current.version) {
      throw new InvalidSettingValueError(
        'The presets changed in another window. Reload Settings before editing again.',
      );
    }
    const existing = current.presets.find((preset) => preset.id === input.id);
    if (input.id && !existing)
      throw new InvalidSettingValueError('That preset no longer exists. Reload Settings.');
    let presets: SpendingPreset[];
    const id = existing?.id ?? randomUUID();
    if (input.operation === 'delete') {
      if (!existing) throw new InvalidSettingValueError('Choose a preset to delete.');
      presets = current.presets.filter((preset) => preset.id !== id);
    } else {
      const name = input.name?.trim() ?? '';
      if (!name || name.length > 60)
        throw new InvalidSettingValueError('Give the preset a name of 1–60 characters.');
      if (
        current.presets.some(
          (preset) => preset.id !== id && preset.name.toLowerCase() === name.toLowerCase(),
        )
      ) {
        throw new InvalidSettingValueError('A preset already has that name. Choose another name.');
      }
      const categoryIds = [...new Set(input.categoryIds ?? [])].sort((a, b) => a - b);
      const children = new Set(
        db
          .select({ id: categories.id })
          .from(categories)
          .where(isNotNull(categories.parentId))
          .all()
          .map((row) => row.id),
      );
      if (
        categoryIds.some((categoryId) => !Number.isInteger(categoryId) || !children.has(categoryId))
      ) {
        throw new InvalidSettingValueError(
          'One of those child categories does not exist. Reload Settings.',
        );
      }
      const saved = { id, name, categoryIds };
      presets = existing
        ? current.presets.map((preset) => (preset.id === id ? saved : preset))
        : [...current.presets, saved];
    }
    const now = input.now ?? new Date();
    const value = JSON.stringify(presets);
    tx.insert(settings)
      .values({ key: KEY, value, version: 1, updatedAt: now, updatedBy: input.actor })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value, version: current.version + 1, updatedAt: now, updatedBy: input.actor },
      })
      .run();
    recordAudit(tx, {
      actor: input.actor,
      action: 'setting.update',
      entity: 'setting',
      entityId: KEY,
      summary: `${input.operation === 'delete' ? 'Deleted' : 'Saved'} spending preset ${existing?.name ?? input.name?.trim()}`,
      before: current.presets,
      after: presets,
      now,
    });
    return id;
  });
}
