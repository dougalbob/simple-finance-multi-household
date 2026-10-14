import type { PersonRef, SpendingLineInput } from './insights';

/**
 * Where the money goes (SPEC §16.7 E): the share of net spending that each
 * parent category takes over a chosen window, drawn as a pie.
 *
 * Pure arithmetic, no database. The DB assembly lives in charts-view.ts, and
 * the same lines feed Insights, so the pie can never disagree with the tables.
 *
 * Two rules sit on top of the parent roll-up:
 * - **Personal is split by person.** A line under a split parent (Personal)
 *   with a person target becomes that person's own slice, so "Personal — Alex"
 *   and "Personal — Sam" sit beside each other. Household-marked (or
 *   unassigned) personal spending is its own slice and is never split between
 *   people — the same rule as the personal-spending chart (§16.7 C).
 * - **Net spending, honestly drawn.** Refunds net off their category. A slice
 *   that nets to zero or below cannot be drawn as a slice, so it stays in the
 *   table with its real figure rather than vanishing or being drawn wrongly.
 */

/** A purchase line with the parent id and the purchase it came from. */
export interface MixLine extends SpendingLineInput {
  parentId: number;
  purchaseId: number;
  supplierName: string | null;
  note: string | null;
}

export type MixSliceKind = 'category' | 'person' | 'household';

export interface MixSlice {
  /** Stable key for the `slice=` URL parameter, e.g. `12`, `14:p3`, `14:household`. */
  key: string;
  kind: MixSliceKind;
  label: string;
  parentId: number;
  parentName: string;
  /** The person a `person` slice belongs to; null otherwise. */
  personId: number | null;
  /** Net spending in the window, signed (refunds reduce it). */
  amountPence: number;
  /** True when the slice is drawn: net spending above zero. */
  drawn: boolean;
  /** Share of the drawn total, 0–1; 0 when not drawn. */
  share: number;
  /** The lines behind the slice, newest first. */
  lines: MixLine[];
}

export interface SpendingMix {
  from: string;
  to: string;
  /** Net spending across every counted line (matches the Insights total). */
  totalPence: number;
  /** Sum of the drawn slices; the pie's whole. */
  drawnTotalPence: number;
  /** Drawn slices largest first, then the undrawn ones by label. */
  slices: MixSlice[];
}

export interface MixOptions {
  from: string;
  to: string;
  /** Parent ids counted; null means every parent. */
  includedParentIds: ReadonlySet<number> | null;
  /** Child (leaf) category ids counted; null/undefined means every child under included parents. */
  includedCategoryIds?: ReadonlySet<number> | null;
  people: readonly PersonRef[];
  /** Parents whose person-targeted lines are split per person (e.g. Personal). */
  splitParents: ReadonlyArray<{ id: number; name: string }>;
}

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The stable key for a slice, shared by the pie, the legend and the URL. */
export function mixSliceKey(parentId: number, personId: number | null): string {
  if (personId === null) return String(parentId);
  return `${parentId}:p${personId}`;
}

export function householdSliceKey(parentId: number): string {
  return `${parentId}:household`;
}

export function spendingMix(lines: readonly MixLine[], options: MixOptions): SpendingMix {
  if (!LOCAL_DATE.test(options.from) || !LOCAL_DATE.test(options.to)) {
    throw new Error('spendingMix expects YYYY-MM-DD bounds');
  }
  const { from, to, includedParentIds, includedCategoryIds = null, people, splitParents } = options;
  const splitParentNames = splitParents.map((parent) => parent.name);
  const byKey = new Map<string, MixSlice>();

  const sliceFor = (
    key: string,
    base: Omit<MixSlice, 'key' | 'amountPence' | 'drawn' | 'share' | 'lines'>,
  ): MixSlice => {
    const existing = byKey.get(key);
    if (existing !== undefined) return existing;
    const slice: MixSlice = { ...base, key, amountPence: 0, drawn: false, share: 0, lines: [] };
    byKey.set(key, slice);
    return slice;
  };

  let totalPence = 0;
  for (const line of lines) {
    if (line.occurredDate < from || line.occurredDate > to) continue;
    if (includedParentIds !== null && !includedParentIds.has(line.parentId)) continue;
    if (includedCategoryIds !== null && !includedCategoryIds.has(line.categoryId)) continue;
    totalPence += line.amountPence;

    if (splitParentNames.includes(line.parentName)) {
      const person =
        line.targetKind === 'person' && line.targetId !== null
          ? people.find((entry) => entry.id === line.targetId)
          : undefined;
      if (person !== undefined) {
        const slice = sliceFor(mixSliceKey(line.parentId, person.id), {
          kind: 'person',
          label: `${line.parentName} — ${person.label}`,
          parentId: line.parentId,
          parentName: line.parentName,
          personId: person.id,
        });
        slice.amountPence += line.amountPence;
        slice.lines.push(line);
      } else {
        const slice = sliceFor(householdSliceKey(line.parentId), {
          kind: 'household',
          label: `${line.parentName} — household`,
          parentId: line.parentId,
          parentName: line.parentName,
          personId: null,
        });
        slice.amountPence += line.amountPence;
        slice.lines.push(line);
      }
    } else {
      const slice = sliceFor(mixSliceKey(line.parentId, null), {
        kind: 'category',
        label: line.parentName,
        parentId: line.parentId,
        parentName: line.parentName,
        personId: null,
      });
      slice.amountPence += line.amountPence;
      slice.lines.push(line);
    }
  }

  // A split parent with a person in the household but no line for them yet
  // still gets an honest £0.00 row — nobody is quietly missing from the table.
  for (const parent of splitParents) {
    if (includedParentIds !== null && !includedParentIds.has(parent.id)) continue;
    for (const person of people) {
      sliceFor(mixSliceKey(parent.id, person.id), {
        kind: 'person',
        label: `${parent.name} — ${person.label}`,
        parentId: parent.id,
        parentName: parent.name,
        personId: person.id,
      });
    }
  }

  for (const slice of byKey.values()) {
    slice.lines.sort(
      (a, b) =>
        b.occurredDate.localeCompare(a.occurredDate) ||
        (a.supplierName ?? '').localeCompare(b.supplierName ?? '') ||
        b.purchaseId - a.purchaseId,
    );
    slice.drawn = slice.amountPence > 0;
  }

  const drawnTotalPence = [...byKey.values()]
    .filter((slice) => slice.drawn)
    .reduce((sum, slice) => sum + slice.amountPence, 0);
  for (const slice of byKey.values()) {
    if (slice.drawn && drawnTotalPence > 0) slice.share = slice.amountPence / drawnTotalPence;
  }

  const slices = [...byKey.values()].sort((a, b) => {
    if (a.drawn !== b.drawn) return a.drawn ? -1 : 1;
    if (a.drawn) return b.amountPence - a.amountPence || a.label.localeCompare(b.label);
    return a.label.localeCompare(b.label);
  });

  return { from, to, totalPence, drawnTotalPence, slices };
}
