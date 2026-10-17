/**
 * Persistence and first-run drafting for the long-term forecast
 * (LONGTERM_FORECASTING.md §9, slice 2).
 *
 * One `longterm_plans` row holds the whole plan as a validated JSON payload.
 * The draft is built from what the records already know — the two people, the
 * active recurring commitments (monthly-equivalent) and the groceries/fuel
 * basis — and from the reviewed defaults in `rates.ts` for everything the
 * records cannot know (birth years, pension pot dates, the inheritance). Every
 * figure it produces is editable in the assumptions panel; nothing in the
 * engine reads this module's seed constants.
 */

import { and, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import { recordAudit } from '../audit';
import type { Db } from '../db/client';
import { longtermPlans, schedules } from '../db/schema';
import { roundHalfUpDivide } from '../money';
import { listPeople } from '../records/people';
import { VersionConflictError } from '../records/errors';
import { getMonthlyFuelByVehicle, getWeeklyGroceriesPence } from '../records/settings';
import {
  defaultComparisonRates,
  defaultHorizonYear,
  endOfYearDate,
  LONGTERM_PLAN_NAME,
  statePensionStartYear,
  type LongTermPlanDocument,
} from './plan';
import { HOUSEHOLD_DEFAULTS } from './rates';
import type { LongTermPerson, PensionPotPlan, SpendingPlan, LongTermPlan } from './types';
import { assertPlanDocument, parseStoredPlanDocument } from './validation';

export class LongTermPlanNotFoundError extends Error {
  constructor() {
    super('The saved long-term forecast was not found. Reload the page and try again.');
    this.name = 'LongTermPlanNotFoundError';
  }
}

export interface StoredLongTermPlan {
  id: number;
  name: string;
  payload: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface LoadedLongTermPlan {
  record: StoredLongTermPlan;
  document: LongTermPlanDocument;
}

/** A schedule amount as a monthly figure (annual premiums spread ÷ 12). */
function monthlyEquivalent(amountPence: number, frequency: 'monthly' | 'annual'): number {
  return frequency === 'annual' ? roundHalfUpDivide(amountPence, 12) : amountPence;
}

/**
 * The draft a household sees on its first visit. Pure with respect to the
 * database (reads only), and deterministic for a given day and records.
 */
export function buildDraftPlan(db: Db, options: { today: string }): LongTermPlanDocument {
  const peopleRows = listPeople(db);
  const peopleSource: { id: string; dbId: number | null; label: string }[] =
    peopleRows.length === 0
      ? [{ id: 'person-1', dbId: null, label: 'Person 1' }]
      : peopleRows.map((row) => ({ id: `person-${row.id}`, dbId: row.id, label: row.label }));

  const birthYears = peopleSource.map((_, index) => {
    const supplied = HOUSEHOLD_DEFAULTS.birthYears[index];
    // Beyond the two people the app allows, keep the draft generic rather
    // than inventing this household's dates for another household's person.
    return supplied ?? 1970 + index * 10;
  });
  const youngestIndex = birthYears.indexOf(Math.max(...birthYears));

  const activeSchedules = db
    .select()
    .from(schedules)
    .where(
      and(
        inArray(schedules.kind, ['dd', 'so']),
        isNull(schedules.cancelledAt),
        lte(schedules.activeFrom, options.today),
        or(isNull(schedules.activeUntil), gte(schedules.activeUntil, options.today)),
      ),
    )
    .all();

  // Income schedules are the records' only earnings evidence. A receipt
  // targeted at a person lands on that person; an unassigned one (the common
  // case) lands on the younger person — the working member in this household
  // — and the stop date is a draft (State Pension age) the assumptions panel
  // asks the household to correct.
  const activeReceipts = db
    .select()
    .from(schedules)
    .where(
      and(
        eq(schedules.kind, 'receipt'),
        isNull(schedules.cancelledAt),
        lte(schedules.activeFrom, options.today),
        or(isNull(schedules.activeUntil), gte(schedules.activeUntil, options.today)),
      ),
    )
    .all();
  const earningsByPerson = new Map<string, number>();
  for (const receipt of activeReceipts) {
    const targeted =
      receipt.targetKind === 'person' && receipt.targetId !== null
        ? peopleSource.find((person) => person.dbId === receipt.targetId)
        : undefined;
    const target = targeted ?? peopleSource[youngestIndex];
    if (target === undefined) continue;
    const monthly = monthlyEquivalent(receipt.amountPence, receipt.frequency);
    earningsByPerson.set(target.id, (earningsByPerson.get(target.id) ?? 0) + monthly);
  }

  let recurringMonthlyPence = 0;
  const commitments: LongTermPlan['commitments'] = [];
  for (const schedule of activeSchedules) {
    const monthly = monthlyEquivalent(schedule.amountPence, schedule.frequency);
    if (schedule.activeUntil === null) {
      recurringMonthlyPence += monthly;
    } else {
      // An end-dated schedule is the engine's fixed, never-inflated
      // commitment (the mortgage in this household; a phone contract or a
      // car loan elsewhere). Its own end date is when the payments stop.
      commitments.push({
        label: schedule.name,
        monthlyPence: monthly,
        endDate: schedule.activeUntil,
      });
    }
  }

  const weeklyGroceriesPence = getWeeklyGroceriesPence(db);
  const groceriesMonthlyPence =
    weeklyGroceriesPence === null ? 0 : roundHalfUpDivide(weeklyGroceriesPence * 52, 12);
  const fuelMonthlyPence = [...getMonthlyFuelByVehicle(db).values()].reduce(
    (sum, value) => sum + value,
    0,
  );

  const spending: SpendingPlan = {
    monthlyPence: recurringMonthlyPence + groceriesMonthlyPence + fuelMonthlyPence,
    // The household's "everything else" is deliberately £0 for now; the page
    // carries a visible warning whenever this stays at zero (§5.6).
    otherAnnualPence: 0,
  };

  const middleGrowthBp = HOUSEHOLD_DEFAULTS.middleGrowthBp;
  const people: LongTermPerson[] = peopleSource.map((person, index) => {
    const birthYear = birthYears[index] as number;
    const pensionPots: PensionPotPlan[] =
      index === 0
        ? HOUSEHOLD_DEFAULTS.pensionPotStartDates.map((startDate, potIndex) => ({
            id: potIndex === 0 ? 'pension-a' : 'pension-b',
            label: potIndex === 0 ? 'Pension A' : 'Pension B',
            // The household has not supplied the pot values yet: the field is
            // deliberately £0.00 and the page flags it until it is filled in.
            currentPence: 0,
            growthBp: middleGrowthBp,
            startDate,
            takeUp: 'drawdown',
            annuityPencePer100k: HOUSEHOLD_DEFAULTS.annuityPencePer100k,
            annuityEscalationBp: 0,
            drawdownAnnualPence: 0,
          }))
        : [];
    const draftedEarningsPence = earningsByPerson.get(person.id) ?? 0;
    return {
      id: person.id,
      label: person.label,
      birthYear,
      earnings:
        draftedEarningsPence > 0
          ? {
              monthlyPence: draftedEarningsPence,
              untilDate: `${statePensionStartYear(birthYear) - 1}-12-31`,
              risesWithInflation: true,
              risesBp: 350,
            }
          : null,
      statePension: {
        weeklyPence: HOUSEHOLD_DEFAULTS.fullStatePensionWeeklyPence,
        startDate: `${statePensionStartYear(birthYear)}-01-01`,
        upratingBp: HOUSEHOLD_DEFAULTS.statePensionUpratingBp,
      },
      pensionPots,
    };
  });

  const ownerId = peopleSource[0]?.id ?? 'person-1';
  const horizonYear = defaultHorizonYear(birthYears, Number(options.today.slice(0, 4)));

  const plan: LongTermPlan = {
    people,
    investments: [
      {
        id: 'isa',
        label: 'ISA',
        ownerPersonId: ownerId,
        wrapper: 'isa',
        currentPence: 0,
        costBasisPence: 0,
        growthBp: middleGrowthBp,
        incomeShareBp: 0,
        incomeKind: 'dividends',
      },
      {
        id: 'gia',
        label: 'General investment account',
        ownerPersonId: ownerId,
        wrapper: 'gia',
        currentPence: 0,
        costBasisPence: 0,
        growthBp: middleGrowthBp,
        incomeShareBp: 0,
        incomeKind: 'dividends',
      },
    ],
    windfalls: [
      {
        label: 'Inheritance',
        date: HOUSEHOLD_DEFAULTS.inheritanceDate,
        amountPence: HOUSEHOLD_DEFAULTS.inheritancePence,
      },
    ],
    spending,
    commitments,
    inflationBp: HOUSEHOLD_DEFAULTS.inflationBp,
    taxThresholdsBp: HOUSEHOLD_DEFAULTS.taxThresholdsBp,
    isaShelterAnnualPence: HOUSEHOLD_DEFAULTS.isaShelterAnnualPence,
    horizonEndDate: endOfYearDate(horizonYear),
  };

  return assertPlanDocument({
    plan,
    comparisonRatesBp: defaultComparisonRates(),
  });
}

function findPlanRow(db: Db): StoredLongTermPlan | undefined {
  return db.select().from(longtermPlans).where(eq(longtermPlans.name, LONGTERM_PLAN_NAME)).get();
}

/**
 * The page's read path: the saved plan, or a freshly drafted one saved on the
 * spot (audited) so the household starts inside the tool rather than in a
 * wizard. Reads never mutate an existing plan.
 */
export function getOrCreateLongTermPlan(
  db: Db,
  options: { actor: string; today: string; now?: Date },
): LoadedLongTermPlan {
  const now = options.now ?? new Date();
  const existing = findPlanRow(db);
  if (existing !== undefined) {
    return { record: existing, document: parseStoredPlanDocument(existing.payload) };
  }

  const document = buildDraftPlan(db, { today: options.today });
  const inserted = db.transaction((tx) => {
    const row = tx
      .insert(longtermPlans)
      .values({
        name: LONGTERM_PLAN_NAME,
        payload: JSON.stringify(document),
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    if (row === undefined) throw new Error('insert longterm_plans returned no row');
    recordAudit(tx, {
      actor: options.actor,
      action: 'longterm_plan.create',
      entity: 'longterm_plan',
      entityId: row.id,
      summary:
        'Started the long-term forecast draft from household records and the reviewed defaults',
      after: document,
      now,
    });
    return row;
  });

  return { record: inserted, document };
}

/**
 * Save an edited plan behind the row's version counter (the house rule for a
 * shared, correctable record). Validation happens before the transaction so a
 * bad browser post never opens one.
 */
export function saveLongTermPlan(
  db: Db,
  input: {
    document: LongTermPlanDocument;
    expectedVersion: number;
    actor: string;
    now?: Date;
  },
): LoadedLongTermPlan {
  const now = input.now ?? new Date();
  const document = assertPlanDocument(input.document);
  const updated = db.transaction((tx) => {
    const current = tx
      .select()
      .from(longtermPlans)
      .where(eq(longtermPlans.name, LONGTERM_PLAN_NAME))
      .get();
    if (current === undefined) throw new LongTermPlanNotFoundError();
    if (current.version !== input.expectedVersion) {
      throw new VersionConflictError(
        'long-term forecast',
        current.id,
        input.expectedVersion,
        current.version,
      );
    }
    const row = tx
      .update(longtermPlans)
      .set({
        payload: JSON.stringify(document),
        updatedAt: now,
        version: current.version + 1,
      })
      .where(eq(longtermPlans.id, current.id))
      .returning()
      .get();
    if (row === undefined) throw new Error('update longterm_plans returned no row');
    recordAudit(tx, {
      actor: input.actor,
      action: 'longterm_plan.update',
      entity: 'longterm_plan',
      entityId: current.id,
      summary: 'Saved the long-term forecast assumptions',
      before: parseStoredPlanDocument(current.payload),
      after: document,
      now,
    });
    return row;
  });

  return { record: updated, document };
}

/**
 * Rebuild the draft from today's records and overwrite the payload. The
 * household's edits are replaced by design — the form asks first — and the
 * before/after pair stays in the audit trail.
 */
export function resetLongTermPlan(
  db: Db,
  input: {
    expectedVersion: number;
    actor: string;
    today: string;
    now?: Date;
  },
): LoadedLongTermPlan {
  const now = input.now ?? new Date();
  const document = buildDraftPlan(db, { today: input.today });
  const updated = db.transaction((tx) => {
    const current = tx
      .select()
      .from(longtermPlans)
      .where(eq(longtermPlans.name, LONGTERM_PLAN_NAME))
      .get();
    if (current === undefined) throw new LongTermPlanNotFoundError();
    if (current.version !== input.expectedVersion) {
      throw new VersionConflictError(
        'long-term forecast',
        current.id,
        input.expectedVersion,
        current.version,
      );
    }
    const row = tx
      .update(longtermPlans)
      .set({
        payload: JSON.stringify(document),
        updatedAt: now,
        version: current.version + 1,
      })
      .where(eq(longtermPlans.id, current.id))
      .returning()
      .get();
    if (row === undefined) throw new Error('update longterm_plans returned no row');
    recordAudit(tx, {
      actor: input.actor,
      action: 'longterm_plan.reset',
      entity: 'longterm_plan',
      entityId: current.id,
      summary: 'Reset the long-term forecast to a fresh draft from household records',
      before: parseStoredPlanDocument(current.payload),
      after: document,
      now,
    });
    return row;
  });

  return { record: updated, document };
}
