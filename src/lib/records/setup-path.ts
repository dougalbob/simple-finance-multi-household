import type { Db } from '../db/client';
import { purchases } from '../db/schema';
import { toLocalDateString } from '../time';
import { listPeople } from './people';
import { latestCheckpointPerPot, listPots, type PotKind } from './pots';
import { listRenewals } from './renewals';
import { listSchedules } from './schedules';
import { getMonthlyFuelByVehicle, getWeeklyGroceriesPence } from './settings';
import { listVehicles } from './vehicles';

/**
 * The first-run setup path (docs/ONBOARDING_PLAN.md, Slice 1).
 *
 * A brand-new household meets fourteen pages and one dependency chain —
 * people → pots → checkpoints → income → bills → figures → first purchase —
 * and nothing stated it. This module states it, derived entirely from the
 * household's own records: there is no onboarding flag, no "dismissed"
 * marker and no tick a person could tick dishonestly. Undo a record and the
 * step reopens; add one elsewhere and the step closes by itself.
 *
 * The copy lives here beside the derivation so the browser suite, the unit
 * tests and both surfaces (the home card and /start) cannot drift apart.
 */

export type SetupStepId =
  'people' | 'pots' | 'checkpoints' | 'income' | 'bills' | 'figures' | 'cards' | 'purchases';

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
   * A step that may simply not apply to this household (credit cards and
   * renewals). Optional steps are shown, never counted as outstanding, and
   * complete when the household has recorded one of either.
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
    title: 'Name the people',
    why: 'Every “paid by” and “for” chip on the till uses these names, and the by-person insight attributes only what is marked for someone. A household of one is complete — add a second person only if there is one.',
    payoff: 'Purchases can be marked for a person, and Insights can attribute them.',
  },
  pots: {
    title: 'Add the pots you actually have',
    why: 'A pot is any place money sits: a bank account, a credit card, a wallet or a jar. A typical setup is a joint current account, a bills account and a cash pot each — add only the ones you use.',
    payoff: 'The household total on the home page and the till’s pot picker start working.',
  },
  checkpoints: {
    title: 'Record what each pot holds',
    why: 'A checkpoint is the only anchor to reality the app has: one number you read from the bank or counted by hand. It never guesses a balance, so a pot with no checkpoint shows no estimate.',
    payoff: 'Each pot gets an estimate, the household total appears, and Horizon can project.',
  },
  income: {
    title: 'Add the money that comes in',
    why: 'The salary that repeats — its day of the month defines the payday-to-payday cycle everything is planned around. A due day on a weekend is expected on the Friday before.',
    payoff: 'The payday projection and “lowest before pay day” appear on the home page.',
  },
  bills: {
    title: 'Add the bills you pay',
    why: 'Direct debits and standing orders, each with its day of the month. Add the ones you know now; add the rest as they appear on the statement — nothing is assumed until you record it.',
    payoff: '“Due this week”, the month calendar, and contract ends and renewal warnings.',
  },
  figures: {
    title: 'The figures the projection needs',
    why: 'Your weekly shop and each vehicle’s monthly fuel. These are reported figures, not measured ones — Insights compares them with what actually happened, so a wrong figure is visible rather than hidden.',
    payoff: 'Day-to-day spending joins the projection and the groceries chart starts drawing.',
  },
  cards: {
    title: 'Credit cards and renewals, if you have them',
    why: 'A card balance is money owed, not money available: it counts in the household total but never in the liquidity projection. A renewal raises a warning before it falls due.',
    payoff: 'The Contracts & Renewals page tracks payment days, contract ends and renewals.',
  },
  purchases: {
    title: 'Record your first purchase',
    why: 'The till is the daily tool: supplier, total, split so the lines match, paid by, date, and an optional receipt photo. Record it while it is fresh — or at the laptop afterwards.',
    payoff: 'Purchases, Insights and the charts fill in, and the honesty loop gets its first week.',
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

  const incomeStep: SetupStepStatus = {
    id: 'income',
    phase: 'A',
    optional: false,
    state: incomeSchedules.length > 0 ? 'done' : 'todo',
    detail:
      incomeSchedules.length === 0
        ? 'No income scheduled yet'
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
