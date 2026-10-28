import { and, asc, eq, isNull } from 'drizzle-orm';
import { recordAudit } from '../audit';
import type { Db } from '../db/client';
import { allocations, categories, energyBills, purchases } from '../db/schema';
import { roundHalfUpDivide } from '../money';
import { addDaysLocal } from './dates';
import { RecordVoidedError, VersionConflictError } from './errors';
import {
  billNotes,
  billMonth,
  InvalidEnergyInputError,
  billingDays,
  checkEnergyDetails,
  comparisonUsage,
  describeEnergyDetails,
  effectiveMilliPencePerKwh,
  ENERGY_FUELS,
  formatKwh,
  formatReading,
  formatStandingCharge,
  formatUnitRate,
  annualCost,
  recordedUsage,
  summariseMonths,
  type BillNote,
  type EnergyBillLike,
  type EnergyDetails,
  type EnergyFuel,
  type EnergyMonth,
  type EnergyTariff,
  type FuelCost,
  type RecordedUsage,
} from './energy-usage';
import { PurchaseNotFoundError, type Purchase } from './purchases';
import { getEnergySetup, getEnergyTariff, type EnergySetup } from './settings';

/**
 * Energy details against the database (issue 118, v1.44.0; SPEC §29). The
 * arithmetic is `energy-usage.ts`'s; this module finds the bills, writes them
 * and assembles the Energy page.
 *
 * The anchor is the **category**, never a schedule's name: the household's
 * "Gas/Electric" schedule is their own wording, but the direct debit it
 * converts carries a `Utilities > Energy` allocation line, and that line is
 * what makes a purchase an energy purchase. A household that renamed the
 * category points `energy_category_id` at the new one.
 */

export class NotAnEnergyPurchaseError extends Error {
  constructor(message = 'Energy details belong on a purchase paid under the energy category.') {
    super(message);
    this.name = 'NotAnEnergyPurchaseError';
  }
}

export type EnergyBill = typeof energyBills.$inferSelect;

/**
 * The leaf category that means "energy": the household's own choice when one
 * is saved, otherwise the default `Utilities > Energy` looked up by name the
 * way the fuel category is.
 */
export function getEnergyCategoryId(db: Db): number | null {
  const setup = getEnergySetup(db);
  if (setup.categoryId !== null) return setup.categoryId;
  const parent = db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.name, 'Utilities'), isNull(categories.parentId)))
    .get();
  if (parent === undefined) return null;
  const child = db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.parentId, parent.id), eq(categories.name, 'Energy')))
    .get();
  return child?.id ?? null;
}

/** The energy category's own lines on this purchase, or null when it has none. */
export function energyPenceOfLines(
  lines: ReadonlyArray<{ categoryId: number; amountPence: number }>,
  energyCategoryId: number | null,
): number | null {
  if (energyCategoryId === null) return null;
  const matching = lines.filter((line) => line.categoryId === energyCategoryId);
  if (matching.length === 0) return null;
  return matching.reduce((total, line) => total + line.amountPence, 0);
}

export function getEnergyBill(db: Db, purchaseId: number): EnergyBill | null {
  return db.select().from(energyBills).where(eq(energyBills.purchaseId, purchaseId)).get() ?? null;
}

/**
 * Every recorded bill, oldest first, over live purchases only: voided records
 * and refunds are not usage. Each figure carries what its energy lines cost,
 * so the page never has to guess how much of a split purchase was energy.
 */
export function listEnergyBills(db: Db): Array<EnergyBillLike & { energyPence: number | null }> {
  const energyCategoryId = getEnergyCategoryId(db);
  if (energyCategoryId === null) return [];
  const rows = db
    .select({
      purchaseId: purchases.id,
      occurredDate: purchases.occurredDate,
      periodStart: energyBills.periodStart,
      periodEnd: energyBills.periodEnd,
      gasWh: energyBills.gasWh,
      electricWh: energyBills.electricWh,
      gasReadingStart: energyBills.gasReadingStart,
      gasReadingEnd: energyBills.gasReadingEnd,
      electricReadingStart: energyBills.electricReadingStart,
      electricReadingEnd: energyBills.electricReadingEnd,
      gasEstimateWh: energyBills.gasEstimateWh,
      electricEstimateWh: energyBills.electricEstimateWh,
      amountPence: allocations.amountPence,
      categoryId: allocations.categoryId,
    })
    .from(energyBills)
    .innerJoin(purchases, eq(purchases.id, energyBills.purchaseId))
    .innerJoin(allocations, eq(allocations.purchaseId, purchases.id))
    .where(and(isNull(purchases.voidedAt), isNull(purchases.refundOfPurchaseId)))
    .orderBy(asc(purchases.occurredDate), asc(purchases.id))
    .all();

  const grouped = new Map<number, EnergyBillLike & { energyPence: number | null }>();
  for (const row of rows) {
    const existing = grouped.get(row.purchaseId);
    if (existing !== undefined) {
      if (row.categoryId === energyCategoryId) {
        existing.energyPence = (existing.energyPence ?? 0) + row.amountPence;
      }
      continue;
    }
    grouped.set(row.purchaseId, {
      purchaseId: row.purchaseId,
      occurredDate: row.occurredDate,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      gasWh: row.gasWh,
      electricWh: row.electricWh,
      gasReadingStart: row.gasReadingStart,
      gasReadingEnd: row.gasReadingEnd,
      electricReadingStart: row.electricReadingStart,
      electricReadingEnd: row.electricReadingEnd,
      gasEstimateWh: row.gasEstimateWh,
      electricEstimateWh: row.electricEstimateWh,
      energyPence: row.categoryId === energyCategoryId ? row.amountPence : null,
    });
  }
  return [...grouped.values()];
}

export interface EditEnergyBillInput {
  purchaseId: number;
  expectedVersion: number;
  actor: string;
  details: EnergyDetails;
  now?: Date;
}

/**
 * Record or correct a bill's energy details. The purchase owns the version —
 * a stale form is refused exactly as it is for any other correction — and the
 * change is audited against the purchase with before and after. Clearing both
 * usage figures deletes the row: "not tracked" is a real answer, and an empty
 * record would only make the chart lie about a month having a bill.
 */
export function editEnergyBill(db: Db, input: EditEnergyBillInput): Purchase {
  const now = input.now ?? new Date();
  const actor = input.actor.trim();
  if (actor === '') throw new NotAnEnergyPurchaseError('Every change records who made it.');
  // Clearing is a real answer — "stop tracking this bill" — so an all-blank
  // form deletes the row instead of failing validation.
  const cleared =
    (input.details.gasWh ?? null) === null && (input.details.electricWh ?? null) === null;
  const checked = checkEnergyDetails(input.details, { allowEmpty: cleared });

  return db.transaction((tx) => {
    const current = tx.select().from(purchases).where(eq(purchases.id, input.purchaseId)).get();
    if (current === undefined) throw new PurchaseNotFoundError(input.purchaseId);
    if (current.voidedAt !== null) throw new RecordVoidedError('purchase', input.purchaseId);
    if (current.version !== input.expectedVersion) {
      throw new VersionConflictError(
        'purchase',
        input.purchaseId,
        input.expectedVersion,
        current.version,
      );
    }
    if (current.refundOfPurchaseId !== null) {
      throw new NotAnEnergyPurchaseError('A refund has no energy details of its own.');
    }
    const lines = tx
      .select({ categoryId: allocations.categoryId, amountPence: allocations.amountPence })
      .from(allocations)
      .where(eq(allocations.purchaseId, current.id))
      .all();
    if (energyPenceOfLines(lines, getEnergyCategoryId(db)) === null) {
      throw new NotAnEnergyPurchaseError();
    }

    const existing = tx
      .select()
      .from(energyBills)
      .where(eq(energyBills.purchaseId, current.id))
      .get();
    const values = {
      periodStart: checked.periodStart,
      periodEnd: checked.periodEnd,
      gasWh: checked.gasWh,
      electricWh: checked.electricWh,
      gasReadingStart: checked.gasReadingStart,
      gasReadingEnd: checked.gasReadingEnd,
      electricReadingStart: checked.electricReadingStart,
      electricReadingEnd: checked.electricReadingEnd,
      gasEstimateWh: checked.gasEstimateWh,
      electricEstimateWh: checked.electricEstimateWh,
      note: checked.note,
    } satisfies Omit<
      typeof energyBills.$inferInsert,
      'purchaseId' | 'createdBy' | 'createdAt' | 'updatedAt'
    >;

    if (cleared) {
      // Nothing recorded and nothing typed is not a save: say what is missing
      // rather than reporting a success that changed nothing.
      if (existing === undefined) {
        throw new InvalidEnergyInputError(
          'Enter the gas or the electricity usage from the bill — that is the one figure to keep.',
        );
      }
      tx.delete(energyBills).where(eq(energyBills.purchaseId, current.id)).run();
    } else if (existing === undefined) {
      tx.insert(energyBills)
        .values({
          ...values,
          purchaseId: current.id,
          createdBy: actor,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    } else {
      tx.update(energyBills)
        .set({ ...values, updatedAt: now })
        .where(eq(energyBills.purchaseId, current.id))
        .run();
    }

    const updated = tx
      .update(purchases)
      .set({ updatedAt: now, version: current.version + 1 })
      .where(eq(purchases.id, current.id))
      .returning()
      .get();
    if (updated === undefined) throw new Error('update purchase returned no row');

    recordAudit(tx, {
      actor,
      action: 'purchase.energy_details',
      entity: 'purchase',
      entityId: current.id,
      summary: `Energy details for purchase #${current.id}: ${
        cleared
          ? 'cleared'
          : `${describeEnergyDetails(checked)}${checked.electricFromReadings ? ' (electricity from the readings)' : ''}`
      }`,
      before: existing === undefined ? null : energyDetailsOf(existing),
      after: cleared ? null : values,
      now,
    });
    return updated;
  });
}

/** The recordable fields of a stored row, for a before/after audit payload. */
export function energyDetailsOf(bill: EnergyBill): EnergyDetails {
  return {
    periodStart: bill.periodStart,
    periodEnd: bill.periodEnd,
    gasWh: bill.gasWh,
    electricWh: bill.electricWh,
    gasReadingStart: bill.gasReadingStart,
    gasReadingEnd: bill.gasReadingEnd,
    electricReadingStart: bill.electricReadingStart,
    electricReadingEnd: bill.electricReadingEnd,
    gasEstimateWh: bill.gasEstimateWh,
    electricEstimateWh: bill.electricEstimateWh,
    note: bill.note,
  };
}

/* ------------------------------------------------------------- the purchase row */

export interface EnergyRowContext {
  setup: EnergySetup;
  energyCategoryId: number | null;
  /** Every recorded bill, oldest first — used to prefill the next one. */
  previous: Map<number, EnergyBill & { occurredDate: string }>;
  byDate: Array<{ purchaseId: number; occurredDate: string; bill: EnergyBill }>;
}

export function getEnergyRowContext(db: Db): EnergyRowContext {
  const setup = getEnergySetup(db);
  const energyCategoryId = getEnergyCategoryId(db);
  const rows = db
    .select({ bill: energyBills, occurredDate: purchases.occurredDate, purchaseId: purchases.id })
    .from(energyBills)
    .innerJoin(purchases, eq(purchases.id, energyBills.purchaseId))
    .orderBy(asc(purchases.occurredDate))
    .all();
  const previous = new Map<number, EnergyBill & { occurredDate: string }>();
  const byDate: EnergyRowContext['byDate'] = [];
  for (const row of rows) {
    previous.set(row.purchaseId, { ...row.bill, occurredDate: row.occurredDate });
    byDate.push({ purchaseId: row.purchaseId, occurredDate: row.occurredDate, bill: row.bill });
  }
  return { setup, energyCategoryId, previous, byDate };
}

export interface EnergyRowDetailsProps {
  purchaseId: number;
  expectedVersion: number;
  occurredDate: string;
  setup: EnergySetup;
  energyPence: number | null;
  details: EnergyDetails;
  /** Prefills for a bill being recorded for the first time. */
  suggestedPeriodStart: string | null;
  suggestedPeriodEnd: string | null;
  suggestedGasReadingStart: number | null;
  suggestedElectricReadingStart: number | null;
  /** True when the purchase already carries recorded details. */
  recorded: boolean;
  editable: boolean;
  /** One line under the row: usage, period and the average price of a unit. */
  summary: string | null;
  /** Thousandths of a penny per kWh bought, standing charge included. */
  effectivePencePerKwh: number | null;
  notes: BillNote[];
}

/**
 * Props for `EnergyDetailsForm`, or null when the purchase has no energy line
 * (or the household turned the block off). Mirrors `fuelRowDetails`: the row
 * decides, the form only draws.
 */
export function energyRowDetails(
  context: EnergyRowContext,
  purchase: Purchase,
  lines: ReadonlyArray<{ categoryId: number; amountPence: number }>,
): EnergyRowDetailsProps | null {
  if (purchase.refundOfPurchaseId !== null) return null;
  const energyPence = energyPenceOfLines(lines, context.energyCategoryId);
  if (energyPence === null) return null;
  if (!context.setup.showOnPurchases && !context.previous.has(purchase.id)) return null;

  const stored = context.previous.get(purchase.id) ?? null;
  const earlier = context.byDate.filter(
    (entry) => entry.purchaseId !== purchase.id && entry.occurredDate <= purchase.occurredDate,
  );
  const lastEntry = earlier.at(-1) ?? null;
  const last = lastEntry === null ? null : lastEntry.bill;

  const details: EnergyDetails =
    stored === null
      ? {
          periodStart: null,
          periodEnd: null,
          gasWh: null,
          electricWh: null,
          gasReadingStart: null,
          gasReadingEnd: null,
          electricReadingStart: null,
          electricReadingEnd: null,
          gasEstimateWh: null,
          electricEstimateWh: null,
          note: null,
        }
      : energyDetailsOf(stored);

  return {
    purchaseId: purchase.id,
    expectedVersion: purchase.version,
    occurredDate: purchase.occurredDate,
    setup: context.setup,
    energyPence,
    details,
    suggestedPeriodStart: last?.periodEnd != null ? addDaysLocal(last.periodEnd, 1) : null,
    suggestedPeriodEnd: addDaysLocal(purchase.occurredDate, -1),
    suggestedGasReadingStart: last?.gasReadingEnd ?? null,
    suggestedElectricReadingStart: last?.electricReadingEnd ?? null,
    recorded: stored !== null,
    editable: purchase.voidedAt === null,
    summary: stored === null ? null : describeEnergyDetails(energyDetailsOf(stored)),
    effectivePencePerKwh:
      stored === null
        ? null
        : effectiveMilliPencePerKwh(energyPence, (stored.gasWh ?? 0) + (stored.electricWh ?? 0)),
    notes:
      stored === null
        ? []
        : billNotes(
            {
              ...energyDetailsOf(stored),
              purchaseId: purchase.id,
              occurredDate: purchase.occurredDate,
            },
            last === null
              ? null
              : { ...energyDetailsOf(last), purchaseId: -1, occurredDate: purchase.occurredDate },
          ),
  };
}

/* ------------------------------------------------------------------ the page */

export interface EnergyBillRow {
  purchaseId: number;
  occurredDate: string;
  periodStart: string | null;
  periodEnd: string | null;
  days: number | null;
  gasWh: number | null;
  electricWh: number | null;
  gasReadingStart: number | null;
  gasReadingEnd: number | null;
  electricReadingStart: number | null;
  electricReadingEnd: number | null;
  gasEstimateWh: number | null;
  electricEstimateWh: number | null;
  /** What the energy lines cost, in pence, when any were recorded. */
  energyPence: number | null;
  /** The average price of a unit that bill bought, standing charge included. */
  effectiveMilliPencePerKwh: number | null;
  month: string;
  notes: BillNote[];
  /** A derived electricity figure is worth saying out loud on the row. */
  electricFromReadings: boolean;
}

export interface EnergyTariffCard {
  fuel: EnergyFuel;
  tariff: EnergyTariff | null;
  /** Set when a saved tariff could not be read — the card offers a fresh form. */
  error: string | null;
  /** A year on this tariff for the usage the page knows, VAT included. */
  annual: FuelCost | null;
  /** Which usage the annual figure used, or why there is none. */
  annualBasis: 'bills' | 'estimate' | null;
  annualDays: number | null;
  annualWh: number | null;
}

export interface EnergyView {
  setup: EnergySetup;
  energyCategoryId: number | null;
  energyCategoryLabel: string | null;
  months: EnergyMonth[];
  usage: RecordedUsage;
  bills: EnergyBillRow[];
  tariffs: EnergyTariffCard[];
  /** The usage a comparison would be worked on, per fuel, if any. */
  comparison: Array<{
    fuel: EnergyFuel;
    wh: number;
    basis: 'bills' | 'estimate';
    days: number | null;
  }>;
  hasBills: boolean;
  /** Every category the household could point energy at. */
  categoryOptions: Array<{ id: number; label: string }>;
}

export function getEnergyView(db: Db, today: string): EnergyView {
  const setup = getEnergySetup(db);
  const energyCategoryId = getEnergyCategoryId(db);
  const stored = listEnergyBills(db);
  const usage = recordedUsage(stored);

  const energyCategoryLabel = (() => {
    if (energyCategoryId === null) return null;
    const row = db
      .select({ name: categories.name, parentId: categories.parentId })
      .from(categories)
      .where(eq(categories.id, energyCategoryId))
      .get();
    if (row === undefined) return null;
    if (row.parentId === null) return row.name;
    const parent = db
      .select({ name: categories.name })
      .from(categories)
      .where(eq(categories.id, row.parentId))
      .get();
    return parent === undefined ? row.name : `${parent.name} / ${row.name}`;
  })();

  const bills: EnergyBillRow[] = [];
  for (let index = 0; index < stored.length; index += 1) {
    const bill = stored[index];
    if (bill === undefined) continue;
    const previous = index === 0 ? null : (stored[index - 1] ?? null);
    const days =
      bill.periodStart !== null && bill.periodEnd !== null
        ? billingDays(bill.periodStart, bill.periodEnd)
        : null;
    const kwhWh = (bill.gasWh ?? 0) + (bill.electricWh ?? 0);
    bills.push({
      purchaseId: bill.purchaseId,
      occurredDate: bill.occurredDate,
      periodStart: bill.periodStart,
      periodEnd: bill.periodEnd,
      days,
      gasWh: bill.gasWh,
      electricWh: bill.electricWh,
      gasReadingStart: bill.gasReadingStart,
      gasReadingEnd: bill.gasReadingEnd,
      electricReadingStart: bill.electricReadingStart,
      electricReadingEnd: bill.electricReadingEnd,
      gasEstimateWh: bill.gasEstimateWh,
      electricEstimateWh: bill.electricEstimateWh,
      energyPence: bill.energyPence,
      effectiveMilliPencePerKwh:
        bill.energyPence === null ? null : effectiveMilliPencePerKwh(bill.energyPence, kwhWh),
      month: billMonth(bill),
      notes: billNotes(bill, previous),
      electricFromReadings:
        bill.electricWh !== null &&
        bill.electricReadingStart !== null &&
        bill.electricReadingEnd !== null &&
        roundHalfUpDivide(bill.electricReadingEnd - bill.electricReadingStart, 10) ===
          bill.electricWh,
    });
  }

  const tariffs: EnergyTariffCard[] = ENERGY_FUELS.map((fuel) => {
    let tariff: EnergyTariff | null = null;
    let error: string | null = null;
    try {
      tariff = getEnergyTariff(db, fuel);
    } catch (err) {
      error = err instanceof Error ? err.message : 'The saved tariff is not readable.';
    }
    const usageFor = comparisonUsage(usage, fuel);
    return {
      fuel,
      tariff,
      error,
      annual: tariff === null || usageFor === null ? null : annualCost(usageFor.wh, tariff),
      annualBasis: usageFor?.basis ?? null,
      annualDays: usageFor?.days ?? null,
      annualWh: usageFor?.wh ?? null,
    };
  });

  const categoryOptions = db
    .select({ id: categories.id, name: categories.name, parentId: categories.parentId })
    .from(categories)
    .all()
    .filter((row) => row.parentId !== null)
    .map((row) => {
      const parent = db
        .select({ name: categories.name })
        .from(categories)
        .where(eq(categories.id, row.parentId as number))
        .get();
      return {
        id: row.id,
        label: parent === undefined ? row.name : `${parent.name} / ${row.name}`,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  return {
    setup,
    energyCategoryId,
    energyCategoryLabel,
    months: summariseMonths(
      stored.map((bill) => ({ ...bill, energyPence: bill.energyPence })),
      today,
    ),
    usage,
    bills: [...bills].reverse(),
    tariffs,
    comparison: ENERGY_FUELS.flatMap((fuel) => {
      const usageFor = comparisonUsage(usage, fuel);
      return usageFor === null ? [] : [{ fuel, ...usageFor }];
    }),
    hasBills: stored.length > 0,
    categoryOptions,
  };
}

/** Formatting the page and the row share, so both read the same way. */
export const ENERGY_FORMAT = {
  kwh: formatKwh,
  reading: formatReading,
  unitRate: formatUnitRate,
  standingCharge: formatStandingCharge,
};
