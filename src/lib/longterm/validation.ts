/**
 * Boundary validation for the saved long-term plan (slice 2). The assumptions
 * form posts its whole draft as JSON; nothing from a browser is trusted. The
 * same schema guards a stored payload on read, so a corrupted or hand-edited
 * row fails loudly instead of feeding nonsense to the engine.
 *
 * Zod lives here rather than in `plan.ts` because the client-side editor
 * imports the types and percent helpers from that module; the validation
 * bundle belongs to the server.
 */

import { z } from 'zod';
import { MAX_ABS_PENCE } from '../money';
import { isValidLocalDate } from '../time';
import type { LongTermPlanDocument } from './plan';
import type { BasisPoints, LongTermPlan } from './types';

export class InvalidLongTermPlanError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(issues[0] ?? 'The long-term forecast assumptions are not valid.');
    this.name = 'InvalidLongTermPlanError';
    this.issues = issues;
  }
}

const pence = z.number().int().min(0).max(MAX_ABS_PENCE);
const basisPoints = z.number().int().min(0).max(10_000);
const rateBp = z.number().int().min(0).max(3_000);
const localDate = z.string().refine(isValidLocalDate, 'Use a real calendar date (YYYY-MM-DD).');
const id = z
  .string()
  .min(1)
  .max(60)
  .regex(/^[A-Za-z0-9_-]+$/, 'Ids may use letters, digits, dashes and underscores.');
const label = z.string().trim().min(1, 'Give this a name.').max(80);

const earningsSchema = z
  .object({
    monthlyPence: pence,
    untilDate: localDate,
    risesWithInflation: z.boolean().default(true),
    risesBp: basisPoints.default(350),
  })
  .strict();

const statePensionSchema = z
  .object({
    weeklyPence: pence,
    startDate: localDate,
    upratingBp: basisPoints,
  })
  .strict();

const pensionPotSchema = z
  .object({
    id,
    label,
    currentPence: pence,
    growthBp: basisPoints,
    startDate: localDate,
    takeUp: z.enum(['drawdown', 'annuity']),
    annuityPencePer100k: pence,
    annuityEscalationBp: basisPoints,
    drawdownAnnualPence: pence,
  })
  .strict();

const personSchema = z
  .object({
    id,
    label,
    birthYear: z.number().int().min(1900).max(2100),
    sex: z.enum(['woman', 'man']).optional(),
    lifeExpectancyAge: z.number().int().min(1).max(120).optional(),
    planToAge: z.number().int().min(1).max(120).optional(),
    earnings: earningsSchema.nullable(),
    statePension: statePensionSchema.nullable(),
    pensionPots: z.array(pensionPotSchema).max(8),
  })
  .strict();

const investmentSchema = z
  .object({
    id,
    label,
    ownerPersonId: id,
    wrapper: z.enum(['isa', 'gia']),
    currentPence: pence,
    costBasisPence: pence,
    growthBp: basisPoints,
    incomeShareBp: basisPoints,
    incomeKind: z.enum(['dividends', 'interest']),
  })
  .strict();

const windfallSchema = z
  .object({
    label,
    date: localDate,
    amountPence: pence,
  })
  .strict();

const spendingSchema = z
  .object({
    monthlyPence: pence,
    otherAnnualPence: pence,
  })
  .strict();

const commitmentSchema = z
  .object({
    label,
    monthlyPence: pence,
    endDate: localDate,
  })
  .strict();

const planSchema = z
  .object({
    people: z.array(personSchema).min(1, 'Add at least one person.').max(4),
    investments: z.array(investmentSchema).max(10),
    windfalls: z.array(windfallSchema).max(20),
    spending: spendingSchema,
    commitments: z.array(commitmentSchema).max(30),
    inflationBp: basisPoints,
    taxThresholdsBp: basisPoints.default(100),
    isaShelterAnnualPence: pence,
    horizonEndDate: localDate,
  })
  .strict()
  .transform((plan) => {
    // A saved plan from before plan-to existed keeps its horizon: each person's
    // plan-to is the age they reach in the horizon year, so nothing moves.
    const horizonYear = Number(plan.horizonEndDate.slice(0, 4));
    return {
      ...plan,
      people: plan.people.map((person) =>
        person.planToAge === undefined
          ? { ...person, planToAge: Math.max(1, Math.min(120, horizonYear - person.birthYear)) }
          : person,
      ),
    };
  });

const documentSchema = z
  .object({
    plan: planSchema,
    comparisonRatesBp: z.tuple([rateBp, rateBp, rateBp]),
  })
  .strict();

function issueText(issue: z.ZodIssue): string {
  const path = issue.path.length === 0 ? '' : `${issue.path.join('.')}: `;
  return `${path}${issue.message}`;
}

function fail(error: z.ZodError): never {
  throw new InvalidLongTermPlanError(error.issues.map(issueText));
}

/**
 * Cross-row rules the field schemas cannot express: ids are unique (they are
 * what the engine keys pots and accounts by), and every investment belongs to
 * a person on the plan. A household with no people cannot run a forecast.
 */
function checkDocument(document: LongTermPlanDocument): void {
  const plan: LongTermPlan = document.plan;
  const personIds = new Set<string>();
  const potIds = new Set<string>();
  for (const person of plan.people) {
    if (personIds.has(person.id)) {
      throw new InvalidLongTermPlanError([`Two people share the id “${person.id}”.`]);
    }
    personIds.add(person.id);
    for (const pot of person.pensionPots) {
      if (potIds.has(pot.id)) {
        throw new InvalidLongTermPlanError([`Two pension pots share the id “${pot.id}”.`]);
      }
      potIds.add(pot.id);
    }
  }
  const investmentIds = new Set<string>();
  for (const investment of plan.investments) {
    if (investmentIds.has(investment.id)) {
      throw new InvalidLongTermPlanError([`Two investments share the id “${investment.id}”.`]);
    }
    investmentIds.add(investment.id);
    if (!personIds.has(investment.ownerPersonId)) {
      throw new InvalidLongTermPlanError([
        `“${investment.label}” belongs to a person who is not on the plan.`,
      ]);
    }
  }
}

/** Validate an untrusted value as a plan document, or throw with readable issues. */
export function parsePlanDocument(input: unknown): LongTermPlanDocument {
  const result = documentSchema.safeParse(input);
  if (!result.success) fail(result.error);
  const document = result.data as LongTermPlanDocument;
  checkDocument(document);
  return document;
}

/** Validate a stored JSON payload. */
export function parseStoredPlanDocument(json: string): LongTermPlanDocument {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new InvalidLongTermPlanError([
      'The saved long-term forecast could not be read. Reset the draft from records to start again.',
    ]);
  }
  return parsePlanDocument(value);
}

/** Re-validate a plan document built in code (the seeder). Tests use this too. */
export function assertPlanDocument(document: LongTermPlanDocument): LongTermPlanDocument {
  return parsePlanDocument(document);
}

/** A short type alias used by the store and the assumptions action. */
export type PlanComparisonRates = [BasisPoints, BasisPoints, BasisPoints];
