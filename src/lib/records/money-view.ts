import { weeklyPaceText } from './weekly-pace';
import { and, asc, desc, eq, gte, isNull, lte, or } from 'drizzle-orm';
import type { Db } from '../db/client';
import {
  externalMovements,
  pots,
  purchases,
  receipts,
  scheduleInstances,
  schedules,
  transfers,
} from '../db/schema';
import { toLocalDateString } from '../time';
import {
  addDaysLocal,
  daysBetween,
  nextPaydayOccurrence,
  paydayOccurrencesBetween,
  previousPaydayOccurrences,
} from './dates';
import { expectedInflowOccurrences, expectedInflowPotId, listDebts } from './debts';
import {
  projectDayToDayEvents,
  splitDayToDayEvents,
  type ProjectedDayToDayEvent,
} from './day-to-day';
import {
  estimatePot,
  householdEstimatePence,
  type PotEstimateResult,
  type SignedMovement,
} from './estimates';
import { computeKeyDateAlerts, type KeyDateAlert, type KeyDateItem } from './keydates';
import {
  excludePaydayDayToDay,
  projectToPayday,
  type PotWatchInput,
  type ProjectionResult,
  type ProjectionScheduleLine,
} from './projection';
import { getContractEndWarningLeadDays, getPaydayDayOfMonth } from './settings';
import { advanceDueRenewals, listRenewals } from './renewals';
import { advanceDueAgreementRenewals, listAgreements } from './agreements';
import { debtsSummary, type DebtsSummary } from './debts';
import {
  listSchedules,
  materializeAndConvert,
  MATERIALIZATION_HORIZON_DAYS,
  type ScheduleKind,
} from './schedules';
import { latestCheckpointPerPot, listPots, type Checkpoint, type Pot } from './pots';
import { creditCardPaymentReminderDate } from './credit-cards';
import { listPeople } from './people';
import { listVehicles } from './vehicles';

/**
 * The read-side money view (docs/SPEC.md §7, §15.2): assembles pure engine
 * inputs from the database and runs the lazy due pass first, so the
 * estimate, projection, due lists and key dates the UI renders always
 * reflect the converted state (SPEC §11.2: "at no instant is the instance
 * in two states").
 *
 * Everything here is a pure query + engine call — no writes except the
 * idempotent due pass (conversions + eligible annual reminder advances),
 * which is what the app does instead of a cron daemon.
 */

export interface PotMoneyView {
  pot: Pot;
  estimatePence: number | null;
  latestCheckpoint: Checkpoint | null;
  estimate: PotEstimateResult;
}

export interface MoneySnapshot {
  asOf: Date;
  pots: PotMoneyView[];
  householdAvailablePence: number | null;
  /** Pots that have never been checkpointed — no estimate, ever. */
  uncheckpointedPotIds: number[];
  /** What the household owes others / is owed — beside "available now", never netted (SPEC §10.2). */
  debts: DebtsSummary;
}

export interface EnsureStateResult {
  convertedInstances: number;
  /** Standalone legacy renewal rows advanced, if any. */
  advancedRenewals: number;
  /** Provider-confirmed tracked policies advanced. */
  advancedAgreements: number;
}

/**
 * Run the lazy due pass (SPEC §11.2): convert every schedule instance whose
 * local midnight has arrived, advance standalone annual reminders, and roll
 * only explicitly auto-renewing tracked insurance dates. Idempotent — safe to
 * call on every read.
 */
export function ensureScheduleState(db: Db, nowArg?: Date): EnsureStateResult {
  const now = nowArg ?? new Date();
  const convertedInstances = materializeAndConvert(db, now);
  const advancedRenewals = advanceDueRenewals(db, now);
  const advancedAgreements = advanceDueAgreementRenewals(db, now);
  return { convertedInstances, advancedRenewals, advancedAgreements };
}

/**
 * The per-pot and household-net "available now" estimates (SPEC §7.1).
 * Credit-card liabilities remain in the household total; liquidity projections
 * derive a separate bank-and-cash sum below. Runs the due pass first so
 * converted schedule records are included.
 */
export function getMoneySnapshot(db: Db, nowArg?: Date): MoneySnapshot {
  const now = nowArg ?? new Date();
  ensureScheduleState(db, now);

  const potList = listPots(db);
  const latest = latestCheckpointPerPot(db);

  const purchaseRows = db
    .select({
      potId: purchases.potId,
      totalPence: purchases.totalPence,
      occurredAt: purchases.occurredAt,
      occurredDate: purchases.occurredDate,
      createdAt: purchases.createdAt,
    })
    .from(purchases)
    .where(isNull(purchases.voidedAt))
    .all();
  const transferRows = db.select().from(transfers).where(isNull(transfers.voidedAt)).all();
  const receiptRows = db
    .select({
      potId: receipts.potId,
      amountPence: receipts.amountPence,
      occurredAt: receipts.occurredAt,
      occurredDate: receipts.occurredDate,
      createdAt: receipts.createdAt,
    })
    .from(receipts)
    .where(isNull(receipts.voidedAt))
    .all();

  const byPot = new Map<number, SignedMovement[]>();
  const push = (potId: number, movement: SignedMovement) => {
    const list = byPot.get(potId) ?? [];
    list.push(movement);
    byPot.set(potId, list);
  };
  // Spending: purchases add, refunds subtract → signed = −totalPence.
  // enteredAt is the record's createdAt: a same-day date-only credit counts
  // only when it was written down after the checkpoint (SPEC §7.1).
  for (const row of purchaseRows) {
    push(row.potId, {
      signedPence: -row.totalPence,
      occurredAt: row.occurredAt,
      occurredDate: row.occurredDate,
      enteredAt: row.createdAt,
    });
  }
  // Transfers: two legs, household net zero by construction (SPEC §10) —
  // once both pots' checkpoints predate the record. A same-day credit leg
  // recorded after its pot's checkpoint counts; one recorded before it is
  // already inside that reported figure.
  for (const row of transferRows) {
    push(row.fromPotId, {
      signedPence: -row.amountPence,
      occurredAt: row.occurredAt,
      occurredDate: row.occurredDate,
      enteredAt: row.createdAt,
    });
    push(row.toPotId, {
      signedPence: row.amountPence,
      occurredAt: row.occurredAt,
      occurredDate: row.occurredDate,
      enteredAt: row.createdAt,
    });
  }
  // Receipts: income adds (SPEC §11.3).
  for (const row of receiptRows) {
    push(row.potId, {
      signedPence: row.amountPence,
      occurredAt: row.occurredAt,
      occurredDate: row.occurredDate,
      enteredAt: row.createdAt,
    });
  }
  // External movements: money in adds like a receipt, money out subtracts
  // like spending (SPEC §10.2) — the household total genuinely moves.
  const externalRows = db
    .select({
      potId: externalMovements.potId,
      direction: externalMovements.direction,
      amountPence: externalMovements.amountPence,
      occurredAt: externalMovements.occurredAt,
      occurredDate: externalMovements.occurredDate,
      createdAt: externalMovements.createdAt,
    })
    .from(externalMovements)
    .where(isNull(externalMovements.voidedAt))
    .all();
  for (const row of externalRows) {
    push(row.potId, {
      signedPence: row.direction === 'in' ? row.amountPence : -row.amountPence,
      occurredAt: row.occurredAt,
      occurredDate: row.occurredDate,
      enteredAt: row.createdAt,
    });
  }

  const pots: PotMoneyView[] = potList.map((pot) => {
    const checkpoint = latest.get(pot.id) ?? null;
    const estimate = estimatePot({
      potId: pot.id,
      checkpoint:
        checkpoint === null
          ? null
          : {
              amountPence: checkpoint.amountPence,
              effectiveAt: checkpoint.effectiveAt,
              enteredAt: checkpoint.createdAt,
            },
      movements: byPot.get(pot.id) ?? [],
    });
    return { pot, estimatePence: estimate.estimatePence, latestCheckpoint: checkpoint, estimate };
  });

  return {
    asOf: now,
    pots,
    householdAvailablePence: householdEstimatePence(pots.map((pot) => pot.estimate)),
    uncheckpointedPotIds: pots.filter((pot) => pot.estimatePence === null).map((pot) => pot.pot.id),
    debts: debtsSummary(db),
  };
}

export interface ProjectionLine extends ProjectionScheduleLine {
  potLabel: string;
  /** 'dd' | 'so' | 'receipt' for schedule lines; null for debt expected inflows. */
  scheduleKind: ScheduleKind | null;
}

export interface ProjectionView {
  snapshot: MoneySnapshot;
  result: ProjectionResult;
  paceText: string;
  commitmentLines: ProjectionLine[];
  receiptLines: ProjectionLine[];
  /**
   * The projected shops/fills in the window (SPEC §7.3, v0.6.0): derived by
   * the anchor-reset model from the configured figures and the ledger, so
   * the panel can list exactly which events it is counting and when.
   */
  dayToDayEvents: ProjectedDayToDayEvent[];
  /** Estimates of other pots — for the "{pot} holds £X" clause in the transfer guidance. */
  potLabels: Map<number, string>;
  otherPotEstimates: Map<number, number>;
}

/**
 * The to-payday liquidity view (SPEC §7.2–§7.5, §8). Returns null when no
 * bank or cash pot has been checkpointed — a card-only net liability is not
 * a liquid starting estimate.
 */
export function getProjectionView(db: Db, nowArg?: Date): ProjectionView | null {
  const now = nowArg ?? new Date();
  const snapshot = getMoneySnapshot(db, now);
  const availableLiquidPence = liquidAvailablePence(snapshot);
  if (availableLiquidPence === null) return null;

  const today = toLocalDateString(now);
  const liquidPotIds = new Set(
    snapshot.pots.filter((entry) => entry.pot.kind !== 'credit-card').map((entry) => entry.pot.id),
  );
  const potLabel = new Map(snapshot.pots.map((pot) => [pot.pot.id, pot.pot.label]));

  // The configured household payday is the cycle boundary. Receipt schedules
  // remain independent and are counted below on their own due dates.
  const paydayDate = nextPaydayDate(db, today);
  if (paydayDate === null) return null;

  const windowUpper = paydayDate;

  const toLines = (rows: WindowLineRow[]): ProjectionLine[] =>
    rows.map((row) => ({
      scheduleId: row.scheduleId,
      name: row.name,
      potId: row.potId,
      amountPence: row.amountPence,
      dueDate: row.dueDate,
      potLabel: potLabel.get(row.potId) ?? `Pot ${row.potId}`,
      scheduleKind: row.scheduleKind,
    }));

  const commitmentRows = windowLines(db, 'commitment', today, paydayDate).filter((row) =>
    liquidPotIds.has(row.potId),
  );
  const receiptRows = windowLines(db, 'receipt', today, paydayDate).filter((row) =>
    liquidPotIds.has(row.potId),
  );

  const commitments = commitmentRows.map((row) => ({
    scheduleId: row.scheduleId,
    name: row.name,
    potId: row.potId,
    amountPence: row.amountPence,
    dueDate: row.dueDate,
  }));
  const expectedReceipts = expectedInflowLines(db, today, today, windowUpper).filter((line) =>
    liquidPotIds.has(line.potId),
  );
  const receiptLines = [
    ...receiptRows.map((row) => ({
      scheduleId: row.scheduleId,
      name: row.name,
      potId: row.potId,
      amountPence: row.amountPence,
      dueDate: row.dueDate,
    })),
    // Expected support into a card reduces card debt, not liquid funds.
    ...expectedReceipts,
  ];

  // Warning threshold (SPEC §8): the most protective configured value.
  const thresholds = snapshot.pots
    .filter((entry) => entry.pot.kind === 'bank')
    .map((entry) => entry.pot.warningThresholdPence)
    .filter((value): value is number => value !== null);
  const warningThresholdPence = thresholds.length === 0 ? null : Math.min(...thresholds);

  // Projected day-to-day spending (SPEC §7.3, v0.6.0): episodic events
  // anchored on when the household last actually shopped or filled up, so a
  // fresh £55 at the pumps suppresses projected fuel for its cooldown
  // instead of being double-counted alongside a smooth allowance. The
  // household's actual payday date(s), not receipt schedules, are excluded.
  const paydayDates = paydayDatesInWindow(db, today, windowUpper);
  const dayToDayEvents = excludePaydayDayToDay(
    projectDayToDayEvents(db, today, windowUpper),
    paydayDates,
  );
  const dayToDaySplit = splitDayToDayEvents(dayToDayEvents);

  const potWatches: PotWatchInput[] = snapshot.pots
    .filter((pot) => pot.pot.kind !== 'credit-card' && pot.estimatePence !== null)
    .map((pot) => ({
      potId: pot.pot.id,
      estimatePence: pot.estimatePence,
      commitments: commitments.filter((line) => line.potId === pot.pot.id),
    }));

  const result = projectToPayday({
    now,
    availableNowPence: availableLiquidPence,
    paydayDate,
    commitments,
    receipts: receiptLines,
    projectedGroceries: dayToDayEventsToLines(dayToDaySplit.groceries),
    projectedFuel: dayToDayEventsToLines(dayToDaySplit.fuel),
    paydayDates,
    warningThresholdPence,
    potWatches,
  });

  return {
    snapshot,
    result,
    paceText: weeklyPaceText(today, result.lowDate, result.projectedLowPence),
    commitmentLines: toLines(commitmentRows),
    receiptLines: [...toLines(receiptRows), ...expectedReceipts],
    dayToDayEvents,
    potLabels: potLabel,
    otherPotEstimates: new Map(
      snapshot.pots
        .filter((pot) => pot.pot.kind !== 'credit-card' && pot.estimatePence !== null)
        .map((pot) => [pot.pot.id, pot.estimatePence as number]),
    ),
  };
}

/* ------------------------------------------------------------------ */
/* The cycle outlook: what is safe to spend before the configured payday (v0.9.0) */
/* ------------------------------------------------------------------ */

export interface CycleOutlookPot {
  potId: number;
  estimatePence: number | null;
  /** Σ of this pot's unconverted commitments due before the configured payday. */
  commitmentsPence: number;
  /** estimate − commitments; null when the pot has no estimate (no checkpoint). */
  spendablePence: number | null;
  /** How far short of its own bills the pot would be; null when it covers them. */
  shortfallPence: number | null;
  /** The bills counted in the figure, soonest first — never invisible arithmetic. */
  outgoing: Array<{ name: string; amountPence: number; dueDate: string }>;
}

/** Configured-payday household low, shared with the projection engine.
 * Per-pot watches remain bills-only transfer signals. */
export interface CycleOutlook {
  asOf: Date;
  /** The next configured household payday, or null until one is set. */
  paydayDate: string | null;
  /** Whole days from today to payday; 0 when no payday is configured. */
  days: number;
  /** household_available_now (SPEC §7.1); null when no pot is checkpointed. */
  householdAvailablePence: number | null;
  commitmentsPence: number;
  dayToDayPence: number;
  /** The shared engine’s lowest point, including receipts due inside the payday window. */
  freeToSpendPence: number | null;
  paceText: string;
  /** Earliest day sharing the projected low, including today; null without a projection. */
  lowDate: string | null;
  pots: CycleOutlookPot[];
  commitments: Array<{
    name: string;
    amountPence: number;
    dueDate: string;
    potId: number;
    potLabel: string;
  }>;
  dayToDayEvents: Array<{ name: string; amountPence: number; dueDate: string }>;
}

/**
 * The cycle outlook read model. Callers that have already built the money
 * snapshot (the home page) pass it in rather than paying for it twice.
 */
export function getCycleOutlook(db: Db, nowArg?: Date, snapshotArg?: MoneySnapshot): CycleOutlook {
  const now = nowArg ?? new Date();
  const snapshot = snapshotArg ?? getMoneySnapshot(db, now);
  const today = toLocalDateString(now);
  const paydayDate = nextPaydayDate(db, today);
  const potLabel = new Map(snapshot.pots.map((entry) => [entry.pot.id, entry.pot.label]));

  const liquidPotIds = new Set(
    snapshot.pots.filter((entry) => entry.pot.kind !== 'credit-card').map((entry) => entry.pot.id),
  );
  const commitmentRows =
    paydayDate === null
      ? []
      : windowLines(db, 'commitment', today, paydayDate).filter((row) =>
          liquidPotIds.has(row.potId),
        );
  const paydayDates = paydayDate === null ? [] : paydayDatesInWindow(db, today, paydayDate);
  const dayToDayEvents =
    paydayDate === null
      ? []
      : excludePaydayDayToDay(projectDayToDayEvents(db, today, paydayDate), paydayDates);
  const commitments = commitmentRows.map((row) => ({
    name: row.name,
    amountPence: row.amountPence,
    dueDate: row.dueDate,
    potId: row.potId,
    potLabel: potLabel.get(row.potId) ?? `Pot ${row.potId}`,
  }));
  const commitmentsPence = sumPence(commitments);
  const dayToDayPence = sumPence(dayToDayEvents);

  const pots: CycleOutlookPot[] = snapshot.pots.map((entry) => {
    const own = commitments.filter((line) => line.potId === entry.pot.id);
    const ownPence = sumPence(own);
    // No configured payday → no window → no pre-payday figure. The estimate
    // still shows on the review pages; this stays silent rather than
    // pretending an endless window.
    const spendablePence =
      paydayDate === null || entry.pot.kind === 'credit-card' || entry.estimatePence === null
        ? null
        : entry.estimatePence - ownPence;
    return {
      potId: entry.pot.id,
      estimatePence: entry.estimatePence,
      commitmentsPence: ownPence,
      spendablePence,
      shortfallPence:
        spendablePence !== null && spendablePence < 0 ? Math.abs(spendablePence) : null,
      outgoing: own.map(({ name, amountPence, dueDate }) => ({ name, amountPence, dueDate })),
    };
  });

  const projection = getProjectionView(db, now);

  return {
    asOf: now,
    paydayDate,
    days: paydayDate === null ? 0 : daysBetween(today, paydayDate),
    householdAvailablePence: snapshot.householdAvailablePence,
    commitmentsPence,
    dayToDayPence,
    freeToSpendPence: projection?.result.projectedLowPence ?? null,
    lowDate: projection?.result.lowDate ?? null,
    paceText: projection?.paceText ?? '',
    pots,
    commitments,
    dayToDayEvents: dayToDayEvents.map(({ name, amountPence, dueDate }) => ({
      name,
      amountPence,
      dueDate,
    })),
  };
}

function sumPence(lines: Array<{ amountPence: number }>): number {
  return lines.reduce((total, line) => total + line.amountPence, 0);
}

/** Bank and cash balances are liquid funds; card pots are net liabilities, not cash. */
function liquidAvailablePence(snapshot: MoneySnapshot): number | null {
  const estimates = snapshot.pots
    .filter((entry) => entry.pot.kind !== 'credit-card' && entry.estimatePence !== null)
    .map((entry) => entry.estimatePence as number);
  return estimates.length === 0
    ? null
    : sumPence(estimates.map((amountPence) => ({ amountPence })));
}

/** Engine-shaped lines for projected day-to-day events (pot-less, id-less). */
function dayToDayEventsToLines(events: ProjectedDayToDayEvent[]): ProjectionScheduleLine[] {
  return events.map((event) => ({
    scheduleId: 0,
    name: event.name,
    potId: 0,
    amountPence: event.amountPence,
    dueDate: event.dueDate,
  }));
}

/**
 * The debt expected-inflow occurrence lines inside an (after, upTo] window,
 * shaped as `ProjectionLine`s for the UI (the engine takes the same list
 * with `scheduleKind` ignored). Each carries an `expected` flag and a
 * "support from {counterparty}" name so the UI never reads it as received.
 *
 * Every debt with an expectation is considered (v0.7.0): a debt that has not
 * borrowed yet projects against the household's default pot — that is the
 * whole point of setting the expectation before the first payment. The
 * settled/answered rules live in `expectedInflowOccurrences`, and the dates
 * carry the income weekend shift (decision 7). Passing null bounds widens
 * the window for payday selection.
 */
function expectedInflowLines(
  db: Db,
  today: string,
  lower: string | null,
  upper: string | null,
): ProjectionLine[] {
  const after = lower ?? today;
  const through = upper ?? addDaysLocal(today, MATERIALIZATION_HORIZON_DAYS);
  const potLabel = new Map(listPots(db).map((pot) => [pot.id, pot.label]));
  const lines: ProjectionLine[] = [];
  for (const debt of listDebts(db)) {
    const potId = expectedInflowPotId(db, debt);
    if (potId === null) continue; // no live pot exists to hold the money
    for (const occurrence of expectedInflowOccurrences(db, debt, after, through, potId)) {
      lines.push({
        scheduleId: debt.id,
        name: `support from ${debt.counterparty}`,
        potId: occurrence.potId,
        amountPence: occurrence.amountPence,
        dueDate: occurrence.dueDate,
        potLabel: potLabel.get(occurrence.potId) ?? `Pot ${occurrence.potId}`,
        scheduleKind: null,
        expected: true,
      });
    }
  }
  lines.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name));
  return lines;
}

/**
 * One schedule instance inside the payday window, flattened for the UI
 * helpers below. Both the projection panel and the cycle outlook (SPEC §7.7)
 * read the window through these two functions, so the two views can never
 * disagree about which commitments are counted.
 */
interface WindowLineRow {
  scheduleId: number;
  name: string;
  potId: number;
  amountPence: number;
  dueDate: string;
  scheduleKind: ScheduleKind;
}

/**
 * Unconverted dd/so instances (commitments) or receipt instances inside
 * (today, throughDate]. The lazy due pass has already run, so every
 * unconverted instance is strictly in the future.
 */
function windowLines(
  db: Db,
  kind: 'commitment' | 'receipt',
  today: string,
  throughDate: string,
): WindowLineRow[] {
  const kindFilter =
    kind === 'commitment'
      ? or(eq(schedules.kind, 'dd'), eq(schedules.kind, 'so'))
      : eq(schedules.kind, 'receipt');
  return db
    .select({
      dueDate: scheduleInstances.dueDate,
      scheduleName: schedules.name,
      scheduleId: schedules.id,
      scheduleKind: schedules.kind,
      potId: schedules.potId,
      amountPence: schedules.amountPence,
    })
    .from(scheduleInstances)
    .innerJoin(schedules, eq(schedules.id, scheduleInstances.scheduleId))
    .where(
      and(
        eq(scheduleInstances.state, 'upcoming'),
        kindFilter,
        gte(scheduleInstances.dueDate, addDaysLocal(today, 1)),
        lte(scheduleInstances.dueDate, throughDate),
      ),
    )
    .orderBy(asc(scheduleInstances.dueDate), asc(schedules.name))
    .all()
    .map((row) => ({
      scheduleId: row.scheduleId,
      name: row.scheduleName,
      potId: row.potId,
      amountPence: row.amountPence,
      dueDate: row.dueDate,
      scheduleKind: row.scheduleKind,
    }));
}

/** The next configured household payday after today, or null until it is set. */
export function nextPaydayDate(db: Db, today: string): string | null {
  const dayOfMonth = getPaydayDayOfMonth(db);
  return dayOfMonth === null ? null : nextPaydayOccurrence(dayOfMonth, today);
}

/**
 * Every actual configured household payday in (today, throughDate], oldest
 * first. An unset payday means there are no payday dates to exclude from
 * Horizon's day-to-day forecast.
 */
export function paydayDatesInWindow(db: Db, today: string, throughDate: string): string[] {
  const dayOfMonth = getPaydayDayOfMonth(db);
  return dayOfMonth === null ? [] : paydayOccurrencesBetween(dayOfMonth, today, throughDate);
}

/**
 * The actual household payday dates already lived through, newest first.
 * Chart E derives both quick windows from this setting, never from receipt
 * schedules or their recorded instances.
 */
export function recentPaydayDates(db: Db, today: string, count: number): string[] {
  const dayOfMonth = getPaydayDayOfMonth(db);
  return dayOfMonth === null ? [] : previousPaydayOccurrences(dayOfMonth, today, count);
}

/**
 * Upcoming commitments and receipts between now and `throughDate` (the
 * "due this week" list, SPEC §15.2).
 */
export function getUpcomingCommitments(
  db: Db,
  throughDate: string,
  nowArg?: Date,
): ProjectionLine[] {
  const now = nowArg ?? new Date();
  const today = toLocalDateString(now);
  if (throughDate <= today) return [];
  const potList = listPots(db);
  const potLabel = new Map(potList.map((pot) => [pot.id, pot.label]));
  const rows = db
    .select({
      instance: scheduleInstances,
      scheduleName: schedules.name,
      scheduleId: schedules.id,
      scheduleKind: schedules.kind,
      potId: schedules.potId,
      amountPence: schedules.amountPence,
    })
    .from(scheduleInstances)
    .innerJoin(schedules, eq(schedules.id, scheduleInstances.scheduleId))
    .where(
      and(
        eq(scheduleInstances.state, 'upcoming'),
        gte(scheduleInstances.dueDate, addDaysLocal(today, 1)),
        lte(scheduleInstances.dueDate, throughDate),
      ),
    )
    .orderBy(asc(scheduleInstances.dueDate), asc(schedules.name))
    .limit(100)
    .all();
  return rows.map((row) => ({
    scheduleId: row.scheduleId,
    name: row.scheduleName,
    potId: row.potId,
    amountPence: row.amountPence,
    dueDate: row.instance.dueDate,
    potLabel: potLabel.get(row.potId) ?? `Pot ${row.potId}`,
    scheduleKind: row.scheduleKind,
  }));
}

/**
 * Key-date items for the Overview panel: agreement renewal and switch dates,
 * standalone legacy reminders, unlinked schedule end dates and card prompts.
 * Runs the due pass first so eligible annual dates have already advanced.
 */
export function getKeyDateAlerts(db: Db, nowArg?: Date): KeyDateAlert[] {
  const now = nowArg ?? new Date();
  ensureScheduleState(db, now);
  const today = toLocalDateString(now);

  const people = listPeople(db);
  const vehicles = listVehicles(db);
  const targetLabel = (kind: string, targetId: number | null): string | null => {
    if (targetId === null) return null;
    if (kind === 'person') return people.find((person) => person.id === targetId)?.label ?? null;
    if (kind === 'vehicle')
      return vehicles.find((vehicle) => vehicle.id === targetId)?.label ?? null;
    return null;
  };

  const items: KeyDateItem[] = [];
  const agreements = listAgreements(db);
  const migratedRenewalIds = new Set(
    agreements.flatMap((agreement) =>
      agreement.legacyRenewalId === null ? [] : [agreement.legacyRenewalId],
    ),
  );
  const linkedScheduleIds = new Set(
    agreements.flatMap((agreement) =>
      [agreement.scheduleId, agreement.legacyScheduleId].filter(
        (scheduleId): scheduleId is number => scheduleId !== null,
      ),
    ),
  );

  // Keep the existing pure renewal engine useful for older callers/tests, but
  // migrated rows now surface only through their agreement record.
  for (const renewal of listRenewals(db)) {
    if (migratedRenewalIds.has(renewal.id)) continue;
    items.push({
      id: renewal.id,
      kind: 'renewal',
      label: renewal.label,
      date: renewal.nextRenewalDate,
      leadDays: renewal.warnDaysBefore,
      supplierId: renewal.supplierId,
      targetLabel: targetLabel(renewal.targetKind, renewal.targetId),
    });
  }

  for (const agreement of agreements) {
    if (agreement.renewalDate !== null && agreement.renewalReminderLeadDays !== null) {
      items.push({
        id: agreement.id,
        agreementId: agreement.id,
        kind: 'agreement-renewal',
        label: agreement.name,
        date: agreement.renewalDate,
        leadDays: agreement.renewalReminderLeadDays,
        supplierId: agreement.supplierId,
        targetLabel: targetLabel(agreement.targetKind, agreement.targetId),
        autoRenew: agreement.autoRenew,
      });
    }
    if (agreement.switchDate !== null && agreement.switchReminderLeadDays !== null) {
      items.push({
        id: agreement.id,
        agreementId: agreement.id,
        kind: 'switch-date',
        label: agreement.name,
        date: agreement.switchDate,
        leadDays: agreement.switchReminderLeadDays,
        supplierId: agreement.supplierId,
        targetLabel: targetLabel(agreement.targetKind, agreement.targetId),
      });
    }
  }

  const contractLead = getContractEndWarningLeadDays(db);
  for (const { schedule } of listSchedules(db, now)) {
    if (
      schedule.cancelledAt !== null ||
      schedule.contractEndsOn === null ||
      linkedScheduleIds.has(schedule.id)
    ) {
      continue;
    }
    items.push({
      id: schedule.id,
      kind: 'contract-end',
      label: `${schedule.name} contract`,
      date: schedule.contractEndsOn,
      leadDays: contractLead,
      scheduleId: schedule.id,
    });
  }
  for (const pot of listPots(db).filter((entry) => entry.kind === 'credit-card')) {
    const paymentDate = creditCardPaymentReminderDate(pot, today);
    if (paymentDate !== null) {
      items.push({
        id: pot.id,
        kind: 'credit-card-payment',
        label: pot.label,
        date: paymentDate,
        leadDays: pot.creditCardWarningDays,
        potId: pot.id,
        minimumPaymentPence:
          pot.creditCardStatementDueDate === paymentDate
            ? pot.creditCardStatementMinimumPence
            : null,
      });
    }
    if (pot.creditCardPromotionalEndDate !== null) {
      items.push({
        id: pot.id,
        kind: 'credit-card-promo-end',
        label: pot.label,
        date: pot.creditCardPromotionalEndDate,
        leadDays: pot.creditCardWarningDays,
        potId: pot.id,
      });
    }
  }
  return computeKeyDateAlerts(items, today);
}

/**
 * Converted-instance history for a schedule (the "history of converted
 * instances" on the Recurring Payments page, SPEC §15.2).
 */
export function listConvertedInstances(
  db: Db,
  scheduleId: number,
  limit = 24,
): Array<{
  dueDate: string;
  convertedAt: Date;
  recordKind: 'purchase' | 'receipt';
  recordId: number;
}> {
  const rows = db
    .select()
    .from(scheduleInstances)
    .where(
      and(eq(scheduleInstances.scheduleId, scheduleId), eq(scheduleInstances.state, 'converted')),
    )
    .orderBy(desc(scheduleInstances.dueDate))
    .limit(Math.min(Math.max(limit, 1), 200))
    .all();
  return rows.map((row) => ({
    dueDate: row.dueDate,
    convertedAt: row.convertedAt as Date,
    recordKind: row.convertedRecordKind as 'purchase' | 'receipt',
    recordId: row.convertedRecordId as number,
  }));
}

/* ------------------------------------------------------------------ */
/* Horizon projection (SPEC §7.6, v0.5.0)                              */
/* ------------------------------------------------------------------ */

export interface HorizonLine extends ProjectionLine {
  /** True for debt expected inflows, false for receipt schedules. */
  expected: boolean;
}

export interface HorizonProjectionView {
  asOf: Date;
  throughDate: string;
  result: ProjectionResult;
  /** The selected pots (all existing pots when none are specified). */
  selection: { pot: Pot; selected: boolean }[];
  includeDayToDay: boolean;
  /** Every pots' id → label for the selected set. */
  potLabels: Map<number, string>;
  commitmentLines: HorizonLine[];
  receiptLines: HorizonLine[];
  /**
   * The projected shops/fills inside the horizon window (SPEC §7.3, v0.6.0),
   * derived by the anchor-reset model — empty when day-to-day is toggled
   * off or nothing is configured. Displayed as their own detail block: the
   * figure is never invisible arithmetic.
   */
  dayToDayEvents: ProjectedDayToDayEvent[];
  totalCommitmentsPence: number;
  totalReceiptsPence: number;
  /** False when day-to-day is excluded — the page relabels the headline. */
  dayToDayIncluded: boolean;
  /** The selected pots' liquid starting balance; zero is valid. */
  availableNowPence: number;
  /** False when none of the selected bank/cash pots has a reported checkpoint. */
  hasSelectedCheckpoint: boolean;
}

/**
 * The horizon projection read model (SPEC §7.6): the same pure engine as the
 * payday panel, given `paydayDate = throughDate` and only the selected pots'
 * data. Reuses the engine untouched; the window is the days strictly after
 * today up to and including `throughDate`; expected debt inflows join the
 * receipt list flagged `expected` so the UI can label them, and day-to-day
 * is passed as zero when excluded (the "bills only" headline).
 */
export function getHorizonProjectionView(
  db: Db,
  throughDate: string,
  potIds: number[],
  includeDayToDay: boolean,
  nowArg?: Date,
): HorizonProjectionView {
  const now = nowArg ?? new Date();
  const snapshot = getMoneySnapshot(db, now);
  const today = toLocalDateString(now);

  // Horizon is a liquidity forecast: credit-card liabilities stay in the
  // household net total but are not liquid pots that can pay bills.
  const potsAll = listPots(db).filter((pot) => pot.kind !== 'credit-card');
  const selection =
    potIds.length === 0
      ? potsAll.map((pot) => ({ pot, selected: true }))
      : potsAll.map((pot) => ({ pot, selected: potIds.includes(pot.id) }));

  const selectedIdSet = new Set(
    potsAll
      .filter((pot) => selection.find((entry) => entry.pot.id === pot.id)?.selected)
      .map((pot) => pot.id),
  );
  const selectedPots = potsAll.filter((pot) => selectedIdSet.has(pot.id));
  const potLabels = new Map(selectedPots.map((pot) => [pot.id, pot.label]));

  // A debt's expectation lands in the pot its movements travel through, or —
  // for a debt that has not borrowed yet (v0.7.0) — the household's default
  // pot. A deselected pot's expectation is left out, like every other
  // movement on that pot.
  const movementPotByDebt = new Map<number, number>();
  for (const debt of listDebts(db)) {
    movementPotByDebt.set(debt.id, expectedInflowPotId(db, debt) ?? 0);
  }

  const windowLower = addDaysLocal(today, 1);
  const windowUpper = throughDate;

  // Projected day-to-day spending (SPEC §7.3, v0.6.0): episodic events
  // anchored on actual shops/fills, household-level like the configured
  // figures were — pot scoping filters commitments and receipts, never the
  // day-to-day events. Exclude configured payday occurrences, independent of
  // receipt schedules. "Bills only" passes no events at all.
  const paydayDates = paydayDatesInWindow(db, today, windowUpper);
  const dayToDayEvents = includeDayToDay
    ? excludePaydayDayToDay(projectDayToDayEvents(db, today, windowUpper), paydayDates)
    : [];
  const dayToDaySplit = splitDayToDayEvents(dayToDayEvents);

  // Commitments: unconverted dd/so instances in (today, through].
  const commitmentRows = db
    .select({
      instance: scheduleInstances,
      scheduleName: schedules.name,
      scheduleId: schedules.id,
      scheduleKind: schedules.kind,
      potId: schedules.potId,
      amountPence: schedules.amountPence,
    })
    .from(scheduleInstances)
    .innerJoin(schedules, eq(schedules.id, scheduleInstances.scheduleId))
    .where(
      and(
        eq(scheduleInstances.state, 'upcoming'),
        or(eq(schedules.kind, 'dd'), eq(schedules.kind, 'so')),
        gte(scheduleInstances.dueDate, windowLower),
        lte(scheduleInstances.dueDate, windowUpper),
      ),
    )
    .orderBy(asc(scheduleInstances.dueDate), asc(schedules.name))
    .all();

  // Receipts: unconverted receipt instances in the window.
  const receiptRows = db
    .select({
      instance: scheduleInstances,
      scheduleName: schedules.name,
      scheduleId: schedules.id,
      scheduleKind: schedules.kind,
      potId: schedules.potId,
      amountPence: schedules.amountPence,
    })
    .from(scheduleInstances)
    .innerJoin(schedules, eq(schedules.id, scheduleInstances.scheduleId))
    .where(
      and(
        eq(scheduleInstances.state, 'upcoming'),
        eq(schedules.kind, 'receipt'),
        gte(scheduleInstances.dueDate, windowLower),
        lte(scheduleInstances.dueDate, windowUpper),
      ),
    )
    .orderBy(asc(scheduleInstances.dueDate), asc(schedules.name))
    .all();

  const commitmentLines: HorizonLine[] = commitmentRows
    .filter((row) => selectedIdSet.has(row.potId))
    .map((row) => ({
      scheduleId: row.scheduleId,
      name: row.scheduleName,
      potId: row.potId,
      amountPence: row.amountPence,
      dueDate: row.instance.dueDate,
      potLabel: potLabels.get(row.potId) ?? `Pot ${row.potId}`,
      scheduleKind: row.scheduleKind,
      expected: false,
    }));

  const receiptScheduleLines: HorizonLine[] = receiptRows
    .filter((row) => selectedIdSet.has(row.potId))
    .map((row) => ({
      scheduleId: row.scheduleId,
      name: row.scheduleName,
      potId: row.potId,
      amountPence: row.amountPence,
      dueDate: row.instance.dueDate,
      potLabel: potLabels.get(row.potId) ?? `Pot ${row.potId}`,
      scheduleKind: row.scheduleKind as ScheduleKind,
      expected: false,
    }));

  const inflowLines: HorizonLine[] = [];
  for (const debt of listDebts(db)) {
    const potId = movementPotByDebt.get(debt.id) ?? 0;
    if (!selectedIdSet.has(potId)) continue;
    for (const occurrence of expectedInflowOccurrences(db, debt, today, windowUpper, potId)) {
      inflowLines.push({
        scheduleId: debt.id,
        name: `support from ${debt.counterparty}`,
        potId: occurrence.potId,
        amountPence: occurrence.amountPence,
        dueDate: occurrence.dueDate,
        potLabel: potLabels.get(occurrence.potId) ?? `Pot ${occurrence.potId}`,
        scheduleKind: null,
        expected: true,
      });
    }
  }

  const receiptLines = [...receiptScheduleLines, ...inflowLines].sort(
    (a, b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name),
  );
  const commitments = commitmentLines.map(toBatchLine);
  const receipts = receiptLines.map(toBatchLine);

  const availablePence = selectedPots
    .map((pot) => snapshot.pots.find((entry) => entry.pot.id === pot.id)?.estimatePence ?? null)
    .filter((value): value is number => value !== null);
  const availableNowPence =
    availablePence.length === 0 ? 0 : availablePence.reduce((a, b) => a + b, 0);

  const thresholds = selectedPots
    .filter((pot) => pot.kind === 'bank')
    .map((pot) => pot.warningThresholdPence)
    .filter((value): value is number => value !== null);
  const warningThresholdPence = thresholds.length === 0 ? null : Math.min(...thresholds);

  const potWatches: PotWatchInput[] = selectedPots
    .filter(
      (pot) =>
        pot.kind !== 'credit-card' &&
        snapshot.pots.find((entry) => entry.pot.id === pot.id)?.estimatePence != null,
    )
    .map((pot) => ({
      potId: pot.id,
      estimatePence: snapshot.pots.find((entry) => entry.pot.id === pot.id)
        ?.estimatePence as number,
      commitments: commitments.filter((line) => line.potId === pot.id),
    }));

  const result = projectToPayday({
    now,
    availableNowPence,
    paydayDate: throughDate,
    commitments,
    receipts,
    projectedGroceries: dayToDayEventsToLines(dayToDaySplit.groceries),
    projectedFuel: dayToDayEventsToLines(dayToDaySplit.fuel),
    paydayDates,
    warningThresholdPence,
    potWatches,
  });

  return {
    asOf: now,
    throughDate,
    result,
    selection,
    includeDayToDay,
    potLabels,
    commitmentLines,
    receiptLines,
    dayToDayEvents,
    totalCommitmentsPence: result.totalCommitmentsPence,
    totalReceiptsPence: result.totalReceiptsPence,
    dayToDayIncluded: includeDayToDay,
    availableNowPence,
    hasSelectedCheckpoint: availablePence.length > 0,
  };
}

/** The where-we'd-land figure: the final day's running total. */
export function landPenceOf(result: ProjectionResult): number {
  const last = result.perDay.at(-1);
  if (last === undefined) return result.availableNowPence - result.dayToDayPence;
  return last.runningPence;
}

function toBatchLine(line: ProjectionLine): ProjectionScheduleLine {
  return {
    scheduleId: line.scheduleId,
    name: line.name,
    potId: line.potId,
    amountPence: line.amountPence,
    dueDate: line.dueDate,
    ...(line.expected === true ? { expected: true } : {}),
  };
}
