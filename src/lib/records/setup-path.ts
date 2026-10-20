import type { Db } from '../db/client';
import { purchases } from '../db/schema';
import { toLocalDateString } from '../time';
import { listPeople } from './people';
import { latestCheckpointPerPot, listPots, type PotKind } from './pots';
import { listRenewals } from './renewals';
import { listSchedules } from './schedules';
import { getMonthlyFuelByVehicle, getPaydayDayOfMonth, getWeeklyGroceriesPence } from './settings';
import { listVehicles } from './vehicles';

/**
 * The first-run setup path (docs/ONBOARDING_PLAN.md, Slice 1).
 *
 * A brand-new household meets fourteen pages and one dependency chain —
 * people → pots → checkpoints → household payday → bills → figures → first purchase —
 * and nothing stated it. This module states it, derived entirely from the
 * household's own records: there is no onboarding flag, no "dismissed"
 * marker and no tick a person could tick dishonestly. Undo a record and the
 * step reopens; add one elsewhere and the step closes by itself.
 *
 * The copy lives here beside the derivation so the browser suite, the unit
 * tests and both surfaces (the home card and /start) cannot drift apart.
 */

export type SetupStepId =
  | 'people'
  | 'pots'
  | 'checkpoints'
  | 'payday'
  | 'income'
  | 'bills'
  | 'figures'
  | 'cards'
  | 'purchases';

/**
 * `partly` is an honest middle: some pots anchored, some figures set — the
 * same partial-data honesty the rest of the app uses.
 */
export type SetupStepState = 'todo' | 'partly' | 'done';

export type SetupPhase = 'A' | 'B';

export interface SetupStepStatus {
  readonly id: SetupStepId;
  readonly phase: SetupPhase;
  /**
   * A step that may simply not apply to this household (predictable recurring
   * income, credit cards or renewals). Optional steps are shown, never counted
   * as outstanding, and complete when relevant records exist.
   */
  readonly optional: boolean;
  readonly state: SetupStepState;
  /** One honest sentence about what is already recorded. */
  readonly detail: string;
}

export interface SetupPathView {
  readonly steps: readonly SetupStepStatus[];
  /** Phase A — the four steps to the first payday projection. */
  readonly phaseA: { readonly done: number; readonly total: number; readonly complete: boolean };
  /** Which Phase A step is next, or null when Phase A is complete. */
  readonly nextStepId: SetupStepId | null;
  /** Non-optional Phase B steps still to do — what the home page counts down. */
  readonly phaseBOutstanding: number;
}

export interface SetupStepCopy {
  readonly title: string;
  /** Why the step matters, in the household's own terms. */
  readonly why: string;
  /** What appears once it is done. */
  readonly payoff: string;
}

/**
 * The live options the inline step forms need. Built here rather than in each
 * page so the home card and /start can never offer a different set of pots,
 * people or figures.
 */
export interface SetupFormData {
  readonly people: Array<{ id: number; label: string }>;
  readonly pots: Array<{ id: number; label: string; kind: PotKind }>;
  readonly vehicles: Array<{ id: number; label: string }>;
  readonly weeklyGroceriesPence: number | null;
  readonly paydayDayOfMonth: number | null;
  readonly monthlyFuelPence: Array<{
    vehicleId: number;
    label: string;
    pence: number | null;
  }>;
  /** Today in the household's calendar, for the income schedule's start date. */
  readonly today: string;
}

export function getSetupFormData(db: Db, nowArg?: Date): SetupFormData {
  const now = nowArg ?? new Date();
  const vehicles = listVehicles(db);
  const fuel = getMonthlyFuelByVehicle(db);
  return {
    people: listPeople(db).map(({ id, label }) => ({ id, label })),
    pots: listPots(db).map(({ id, label, kind }) => ({ id, label, kind })),
    vehicles: vehicles.map(({ id, label }) => ({ id, label })),
    weeklyGroceriesPence: getWeeklyGroceriesPence(db),
    paydayDayOfMonth: getPaydayDayOfMonth(db),
    monthlyFuelPence: vehicles.map((vehicle) => ({
      vehicleId: vehicle.id,
      label: vehicle.label,
      pence: fuel.get(vehicle.id) ?? null,
    })),
    today: toLocalDateString(now),
  };
}

export const SETUP_STEP_COPY: Record<SetupStepId, SetupStepCopy> = {
  people: {
    title: 'Add the people in your household',
    why: 'Add a person record for each household member you want to use for “Paid by” and “For”; people records are not limited to two. Sign-in is separate: an administrator assigns up to two sign-in identities to the household before first login. In Settings, link a person to an assigned sign-in if you want that identity prefilled as “Paid by”. Choose “For” on every purchase too — a manually chosen value is not carried into the next entry, which uses its category default. Household versus individual purchases is what makes the by-person Insights and Charts useful.',
    payoff:
      'The till can identify who paid and who a purchase was for; Insights and Charts can separate household and individual spending.',
  },
  pots: {
    title: 'Add the pots you actually use',
    why: 'A pot can be a bank account, credit card, cash or wallet, or a savings jar. Add only the ones you use. Record transfers between your own pots in Move so the money is not mistaken for spending and the pot balances stay accurate.',
    payoff:
      'The household total, pot balances and till’s “Paid from” choices reflect where your money actually sits.',
  },
  checkpoints: {
    title: 'Record each pot’s balance',
    why: 'There is no bank connection, statement import or automatic knowledge of cash. A checkpoint is the balance you read from an account or count yourself; it re-establishes that pot’s balance, and later recorded activity updates it from that point. Without a checkpoint the app does not guess.',
    payoff:
      'Each checked bank or cash pot gets an estimate, the household total appears, and projections have a real starting point.',
  },
  payday: {
    title: 'Set the household payday',
    why: 'Choose the household’s usual payday day of the month. It defines the planning-cycle boundary for Home, Overview, Horizon’s default and the payday charts, even if no income receipt is scheduled. Short months clamp to their last day, and a weekend payday moves back to Friday.',
    payoff:
      'The payday projection can work from your checkpoints without a receipt schedule; scheduled receipts still count on their own due dates.',
  },
  income: {
    title: 'Add predictable recurring income',
    why: 'Create a receipt schedule only for income with a predictable amount and date, such as a regular salary. The household payday setting—not the schedule—defines the planning cycle. For one-offs such as a windfall or sale, record the money on Income instead of making a recurring schedule.',
    payoff:
      'Predictable future receipts appear in projections on their own due dates; one-off income stays a one-off record.',
  },
  bills: {
    title: 'Add recurring bills',
    why: 'Record the direct debits and standing orders you expect, with their amounts and due dates. When a bill is due, its schedule creates the transaction history. If the actual transaction differs, edit that transaction; if future bills change, edit the schedule.',
    payoff:
      'The projection and month calendar include upcoming bills, and due payments build a history you can correct.',
  },
  figures: {
    title: 'Estimate the weekly shop and vehicle fuel',
    why: 'Set a usual weekly-shop amount and a typical monthly fuel amount for each vehicle. These are projection estimates, not purchases or a record of what you spent. Keep recording actual till purchases and fuel; Insights compares them with the estimates.',
    payoff:
      'The projection includes estimated day-to-day spending, while actual purchases remain distinct in Insights and Charts.',
  },
  cards: {
    title: 'Credit cards and renewals, if you have them',
    why: 'A credit-card balance counts in the household total but is not liquid money available to spend. Add renewal dates for policies and contracts so the app can warn you before they are due.',
    payoff:
      'The household total includes card debt without treating it as cash, and Contracts & Renewals can surface upcoming renewals.',
  },
  purchases: {
    title: 'Record your first purchase at the till',
    why: 'Enter the supplier, total, split the lines so they add up, choose “Paid by” and “For”, set the date, and optionally attach a receipt photo. Check “For” on each new entry: the till does not remember a manually selected target for the next purchase. Record the purchase while it is fresh, or at the laptop afterwards.',
    payoff:
      'Purchases, Insights and Charts start reflecting what the household actually bought and for whom.',
  },
};

/** Phase headings, shared by the home card and /start. */
export const SETUP_PHASE_TITLES: Record<SetupPhase, string> = {
  A: 'your first projection',
  B: 'the rest, at your pace',
};

/**
 * Derive the path from the household's records. Pure in the same sense as the
 * other view builders: it reads (never writes) through the domain modules and
 * decides everything from what is stored, so a support view can render it too.
 */
export function getSetupPath(db: Db, nowArg?: Date): SetupPathView {
  const now = nowArg ?? new Date();
  const people = listPeople(db);
  const pots = listPots(db);
  const vehicles = listVehicles(db);
  const checkpointed = latestCheckpointPerPot(db);
  const schedules = listSchedules(db, now).filter(({ schedule }) => schedule.cancelledAt === null);

  const bankOrCash = pots.filter((pot) => pot.kind !== 'credit-card');
  const cards = pots.filter((pot) => pot.kind === 'credit-card');
  const anchors = bankOrCash.filter((pot) => checkpointed.has(pot.id)).length;
  const incomeSchedules = schedules.filter(({ schedule }) => schedule.kind === 'receipt');
  const bills = schedules.filter(({ schedule }) => schedule.kind !== 'receipt');

  const weeklyGroceries = getWeeklyGroceriesPence(db) !== null;
  const fuel = getMonthlyFuelByVehicle(db);
  const fuelled = vehicles.filter((vehicle) => fuel.has(vehicle.id)).length;
  // A household with no vehicle has one figure to set, not two: with nothing
  // to fuel, a missing weekly shop is a plain "nothing set yet" rather than a
  // half-done step.
  const fuelSettled = vehicles.length === 0 || fuelled === vehicles.length;
  const figuresDone = weeklyGroceries && fuelSettled;
  const figuresPartly = !figuresDone && (weeklyGroceries || fuelled > 0);

  const renewals = listRenewals(db);
  const firstPurchase = db.select({ id: purchases.id }).from(purchases).limit(1).all().length > 0;

  const peopleStep: SetupStepStatus = {
    id: 'people',
    phase: 'A',
    optional: false,
    state: people.length > 0 ? 'done' : 'todo',
    detail:
      people.length === 0
        ? 'Nobody named yet'
        : `${people.map((person) => person.label).join(' and ')} named`,
  };

  const potsStep: SetupStepStatus = {
    id: 'pots',
    phase: 'A',
    optional: false,
    state: bankOrCash.length > 0 ? 'done' : pots.length > 0 ? 'partly' : 'todo',
    detail:
      pots.length === 0
        ? 'No pots yet'
        : bankOrCash.length === 0
          ? 'A credit card only — a bank or cash pot is what carries a balance checkpoint'
          : `${pots.length} pot${pots.length === 1 ? '' : 's'} so far`,
  };

  const checkpointsStep: SetupStepStatus = {
    id: 'checkpoints',
    phase: 'A',
    optional: false,
    state:
      bankOrCash.length === 0
        ? 'todo'
        : anchors === bankOrCash.length
          ? 'done'
          : anchors === 0
            ? 'todo'
            : 'partly',
    detail:
      bankOrCash.length === 0
        ? 'No bank or cash pot to record yet'
        : `${anchors} of ${bankOrCash.length} pot${bankOrCash.length === 1 ? '' : 's'} have a checkpoint`,
  };

  const paydayDayOfMonth = getPaydayDayOfMonth(db);
  const paydayStep: SetupStepStatus = {
    id: 'payday',
    phase: 'A',
    optional: false,
    state: paydayDayOfMonth === null ? 'todo' : 'done',
    detail:
      paydayDayOfMonth === null
        ? 'No household payday set yet'
        : `Household payday set to day ${paydayDayOfMonth}`,
  };

  const incomeStep: SetupStepStatus = {
    id: 'income',
    phase: 'B',
    optional: true,
    state: incomeSchedules.length > 0 ? 'done' : 'todo',
    detail:
      incomeSchedules.length === 0
        ? 'No recurring income scheduled — add it only if predictable'
        : incomeSchedules.map(({ schedule }) => schedule.name).join(', ') + ' scheduled',
  };

  const billsStep: SetupStepStatus = {
    id: 'bills',
    phase: 'B',
    optional: false,
    state: bills.length > 0 ? 'done' : 'todo',
    detail: bills.length === 0 ? 'No bills scheduled yet' : `${bills.length} scheduled`,
  };

  const figuresStep: SetupStepStatus = {
    id: 'figures',
    phase: 'B',
    optional: false,
    state: figuresDone ? 'done' : figuresPartly ? 'partly' : 'todo',
    detail:
      !weeklyGroceries && fuelled === 0
        ? 'No figures set yet'
        : [
            weeklyGroceries ? 'weekly shop set' : 'no weekly shop figure',
            vehicles.length === 0
              ? 'no vehicles'
              : `${fuelled} of ${vehicles.length} vehicle${vehicles.length === 1 ? '' : 's'} have a fuel figure`,
          ].join(' · '),
  };

  const cardsStep: SetupStepStatus = {
    id: 'cards',
    phase: 'B',
    optional: true,
    state: cards.length + renewals.length > 0 ? 'done' : 'todo',
    detail:
      cards.length + renewals.length === 0
        ? 'No credit cards or renewals recorded'
        : `${cards.length} credit card${cards.length === 1 ? '' : 's'}, ${renewals.length} renewal${renewals.length === 1 ? '' : 's'}`,
  };

  const purchasesStep: SetupStepStatus = {
    id: 'purchases',
    phase: 'B',
    optional: false,
    state: firstPurchase ? 'done' : 'todo',
    detail: firstPurchase ? 'The till has been used' : 'Nothing recorded yet',
  };

  const steps: SetupStepStatus[] = [
    peopleStep,
    potsStep,
    checkpointsStep,
    paydayStep,
    incomeStep,
    billsStep,
    figuresStep,
    cardsStep,
    purchasesStep,
  ];

  const phaseASteps = steps.filter((step) => step.phase === 'A');
  const phaseADone = phaseASteps.filter((step) => step.state === 'done').length;
  const next = phaseASteps.find((step) => step.state !== 'done') ?? null;

  return {
    steps,
    phaseA: { done: phaseADone, total: phaseASteps.length, complete: next === null },
    nextStepId: next?.id ?? null,
    phaseBOutstanding: steps.filter(
      (step) => step.phase === 'B' && !step.optional && step.state !== 'done',
    ).length,
  };
}
