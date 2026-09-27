/**
 * Who a record was for, in words (SPEC §9.2 targets).
 *
 * An allocation line, a schedule and a renewal all point at the same three
 * things — the household, a person or a vehicle — and every page that lists
 * them has to turn `{targetKind, targetId}` back into a name. Four pages had
 * each grown their own copy of that six-line function (All Transactions,
 * Purchases, Contracts & Renewals, and then the supplier card asked for a
 * fifth), so it lives here once instead: pure, framework-free and
 * database-free, like the rest of `src/lib/records`'s pure helpers.
 *
 * The naming rule matters beyond tidiness. "Colour is never the only signal"
 * (SPEC §16.7) means the target has to be **words** wherever a page
 * distinguishes one row from another by it — three mobile contracts with one
 * carrier are told apart by the name in brackets, never by the amount.
 */

/** A record that points at the household, a person or a vehicle. */
export interface TargetRef {
  targetKind: string;
  targetId: number | null;
}

/** Id → label for the two named target kinds. Build it with `targetNames()`. */
export interface TargetNames {
  people: ReadonlyMap<number, string>;
  vehicles: ReadonlyMap<number, string>;
}

/** Collect the lookup maps from the lists the pages already load. */
export function targetNames(source: {
  people: readonly { id: number; label: string }[];
  vehicles: readonly { id: number; label: string }[];
}): TargetNames {
  return {
    people: new Map(source.people.map((person) => [person.id, person.label])),
    vehicles: new Map(source.vehicles.map((vehicle) => [vehicle.id, vehicle.label])),
  };
}

/**
 * `Alex` / `Vehicle A` / `household`. A target whose person or vehicle the
 * household has since removed degrades to the bare kind rather than throwing
 * or printing an id — history keeps rendering.
 */
export function targetLabel(target: TargetRef, names: TargetNames): string {
  if (target.targetKind === 'person' && target.targetId !== null) {
    return names.people.get(target.targetId) ?? 'person';
  }
  if (target.targetKind === 'vehicle' && target.targetId !== null) {
    return names.vehicles.get(target.targetId) ?? 'vehicle';
  }
  return 'household';
}

/** One purchase's allocation lines, summarised for a single-line list row. */
export interface PurchaseLineSummary {
  /**
   * The first line as `<category> (<target>)` — e.g. `Mobile Phones (Matthew)`
   * or `Utilities / Mobile Phones (Matthew)`, depending on which names the
   * caller passes. Empty string when the purchase has no lines at all, which
   * the split rules forbid but a list should survive.
   */
  label: string;
  /** Lines beyond the first, rendered as `+N more`. Zero for a simple purchase. */
  extraLines: number;
}

/**
 * The house rule for a purchase that was split across targets: **show the
 * first line and count the rest**. All Transactions has rendered
 * `Utilities / Mobile Phones (Matthew)  +1 more` since v0.3.0 and the supplier
 * card follows it, so a household reading two lists sees one convention. The
 * full split always remains one click away on `/purchases`.
 *
 * `categoryNames` decides how much category a caller wants: a wide table maps
 * child ids to `Parent / Child`, a narrow card maps them to `Child`.
 */
export function purchaseLineSummary(
  lines: readonly (TargetRef & { categoryId: number })[],
  categoryNames: ReadonlyMap<number, string>,
  names: TargetNames,
): PurchaseLineSummary {
  const first = lines[0];
  return {
    label:
      first === undefined
        ? ''
        : `${categoryNames.get(first.categoryId) ?? 'Category'} (${targetLabel(first, names)})`,
    extraLines: Math.max(lines.length - 1, 0),
  };
}

/**
 * What a task is **about** (SPEC §25, decision 175) — a different question
 * from who a spend was *for*, so it has its own vocabulary and its own label
 * helper. `targetLabel()` above answers "household" for any kind it does not
 * know, which is right for a spend (an allocation with no named target *is*
 * the household's) and wrong for a task: a task about a supplier would
 * silently read "household". Tasks therefore never go through it.
 */
export interface SubjectRef {
  subjectKind: string;
  subjectId: number | null;
}

/**
 * Id → words for each named subject kind, built by the page from what it
 * loads. `purchases` holds only purchases that still stand: a voided
 * purchase is left out, so its tasks read "purchase".
 */
export interface SubjectNames {
  suppliers: ReadonlyMap<number, string>;
  vehicles: ReadonlyMap<number, string>;
  purchases: ReadonlyMap<number, string>;
}

/**
 * `EnergyCo` / `Vehicle A` / `£84.20 at EnergyCo on 1 Sep` / `household`.
 * A subject that has gone (a voided purchase) degrades to the bare kind; an
 * unknown kind prints that kind, never `household` — a task about something
 * this version does not recognise must not claim to be the household's.
 */
export function subjectLabel(subject: SubjectRef, names: SubjectNames): string {
  const id = subject.subjectId;
  switch (subject.subjectKind) {
    case 'household':
      return 'household';
    case 'supplier':
      return (id === null ? undefined : names.suppliers.get(id)) ?? 'supplier';
    case 'vehicle':
      return (id === null ? undefined : names.vehicles.get(id)) ?? 'vehicle';
    case 'purchase':
      return (id === null ? undefined : names.purchases.get(id)) ?? 'purchase';
    default:
      return subject.subjectKind.trim() === '' ? 'unknown' : subject.subjectKind;
  }
}
