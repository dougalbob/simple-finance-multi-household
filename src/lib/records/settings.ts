import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { recordAudit, type DbTx } from '../audit';
import type { Db } from '../db/client';
import { categories, pots, settings } from '../db/schema';
import { isValidPenceAmount, MAX_ABS_PENCE } from '../money';
import {
  parseEnergyTariff,
  serialiseEnergyTariff,
  type EnergyFuel,
  type EnergyTariff,
} from './energy-usage';

/**
 * Private runtime settings (plan data-model sketch, docs/SPEC.md §15.2
 * Settings page lands in Phase 4 — this module fixes the storage shape and
 * the typed accessors now, so the projection engine has something to read
 * and the Settings page later only adds UI).
 *
 * Keys are a closed set with a string value; accessors parse/validate.
 * Real figures live only in the private installation (SPEC §19).
 */

export class InvalidSettingValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSettingValueError';
  }
}

const KEY_WEEKLY_GROCERIES = 'weekly_groceries_pence';
const KEY_FUEL_PREFIX = 'monthly_fuel_pence:';
const KEY_PAYDAY_DAY_OF_MONTH = 'payday_day_of_month';
const KEY_RENEWAL_LEAD = 'renewal_warning_lead_days';
const KEY_CONTRACT_END_LEAD = 'contract_end_warning_lead_days';
const KEY_DEFAULT_PURCHASE_POT = 'default_purchase_pot_id';
const KEY_DEFAULT_TRANSACTIONS_POT = 'default_transactions_pot_id';
const KEY_DEFAULT_SCHEDULE_POT = 'default_schedule_pot_id';
const KEY_COMMITMENT_CATEGORIES = 'commitment_category_ids';
/**
 * Energy tracking (issue 118, v1.44.0; SPEC §29). The energy category, which
 * meters are smart (the reading fields only appear for those), what the gas
 * meter prints, one saved tariff per fuel, and whether the purchase row shows
 * the optional block at all.
 */
const KEY_ENERGY_CATEGORY = 'energy_category_id';
const KEY_ENERGY_SMART_GAS = 'energy_smart_gas';
const KEY_ENERGY_SMART_ELECTRIC = 'energy_smart_electric';
const KEY_ENERGY_GAS_UNIT = 'energy_gas_reading_unit';
const KEY_ENERGY_TARIFF_GAS = 'energy_tariff_gas';
const KEY_ENERGY_TARIFF_ELECTRIC = 'energy_tariff_electric';
const KEY_ENERGY_SHOW_ON_PURCHASES = 'energy_show_on_purchases';

export const DEFAULT_RENEWAL_WARNING_LEAD_DAYS = 21;
export const DEFAULT_CONTRACT_END_WARNING_LEAD_DAYS = 21;

/**
 * The household's configured payday day-of-month (1–31). null = no payday has
 * been set; the setting uses the existing audited key/value table (no schema
 * migration). Dates are clamped and weekend-shifted by the date helpers.
 */
export function getPaydayDayOfMonth(db: Db): number | null {
  const row = settingRow(db, KEY_PAYDAY_DAY_OF_MONTH);
  if (row === null || row.value === '') return null;
  const day = Number(row.value);
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new InvalidSettingValueError(
      'The stored household payday setting is not a day from 1 to 31.',
    );
  }
  return day;
}

export function setPaydayDayOfMonth(
  db: Db,
  dayOfMonth: number | null,
  actor: string,
  now?: Date,
): void {
  if (dayOfMonth !== null && (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31)) {
    throw new InvalidSettingValueError('The household payday must be a whole day from 1 to 31.');
  }
  upsertSetting(
    db,
    KEY_PAYDAY_DAY_OF_MONTH,
    dayOfMonth === null ? '' : String(dayOfMonth),
    actor,
    'payday',
    now,
  );
}

/** Projected weekly groceries (SPEC §7.3). null = not configured yet. */
export function getWeeklyGroceriesPence(db: Db): number | null {
  const row = settingRow(db, KEY_WEEKLY_GROCERIES);
  if (row === null) return null;
  return parsePenceSetting(row.value, 'weekly groceries');
}

export function setWeeklyGroceriesPence(
  db: Db,
  pence: number | null,
  actor: string,
  now?: Date,
): void {
  if (pence !== null) {
    if (!isValidPenceAmount(pence) || pence < 0) {
      throw new InvalidSettingValueError(
        'The weekly groceries figure must be a non-negative whole-pence amount.',
      );
    }
  }
  upsertSetting(
    db,
    KEY_WEEKLY_GROCERIES,
    pence === null ? '' : String(pence),
    actor,
    'projection',
    now,
  );
}

/** Projected monthly fuel for one vehicle (SPEC §7.3). null = not configured. */
export function getMonthlyFuelPence(db: Db, vehicleId: number): number | null {
  const row = settingRow(db, fuelKey(vehicleId));
  if (row === null) return null;
  return parsePenceSetting(row.value, `monthly fuel for vehicle ${vehicleId}`);
}

export function setMonthlyFuelPence(
  db: Db,
  vehicleId: number,
  pence: number | null,
  actor: string,
  now?: Date,
): void {
  if (!Number.isInteger(vehicleId) || vehicleId <= 0) {
    throw new InvalidSettingValueError('Monthly fuel needs a vehicle id.');
  }
  if (pence !== null && (!isValidPenceAmount(pence) || pence < 0)) {
    throw new InvalidSettingValueError(
      'The monthly fuel figure must be a non-negative whole-pence amount.',
    );
  }
  upsertSetting(
    db,
    fuelKey(vehicleId),
    pence === null ? '' : String(pence),
    actor,
    'projection',
    now,
  );
}

/** All configured monthly fuel figures, keyed by vehicle id. */
export function getMonthlyFuelByVehicle(db: Db): Map<number, number> {
  const rows = db
    .select()
    .from(settings)
    .all()
    .filter((row) => row.key.startsWith(KEY_FUEL_PREFIX) && row.value !== '');
  const result = new Map<number, number>();
  for (const row of rows) {
    const vehicleId = Number(row.key.slice(KEY_FUEL_PREFIX.length));
    result.set(vehicleId, parsePenceSetting(row.value, `monthly fuel for vehicle ${vehicleId}`));
  }
  return result;
}

/** Default warning lead for renewals (SPEC §22.2: default 21, configurable). */
export function getRenewalWarningLeadDays(db: Db): number {
  const row = settingRow(db, KEY_RENEWAL_LEAD);
  if (row === null) return DEFAULT_RENEWAL_WARNING_LEAD_DAYS;
  return parseLeadSetting(row.value, 'renewal warning lead', DEFAULT_RENEWAL_WARNING_LEAD_DAYS);
}

export function setRenewalWarningLeadDays(db: Db, days: number, actor: string, now?: Date): void {
  upsertSetting(db, KEY_RENEWAL_LEAD, String(checkedLeadDays(days)), actor, 'key dates', now);
}

/** Default warning lead for contract-end alerts (plan decision 23: default 21). */
export function getContractEndWarningLeadDays(db: Db): number {
  const row = settingRow(db, KEY_CONTRACT_END_LEAD);
  if (row === null) return DEFAULT_CONTRACT_END_WARNING_LEAD_DAYS;
  return parseLeadSetting(
    row.value,
    'contract-end warning lead',
    DEFAULT_CONTRACT_END_WARNING_LEAD_DAYS,
  );
}

export function setContractEndWarningLeadDays(
  db: Db,
  days: number,
  actor: string,
  now?: Date,
): void {
  upsertSetting(db, KEY_CONTRACT_END_LEAD, String(checkedLeadDays(days)), actor, 'key dates', now);
}

/**
 * The pot the Quick Entry purchase form starts on (SPEC §15.1, v0.9.0).
 * Fixed by the household in Settings rather than guessed from a pot label:
 * the real installation's daily-spend pot is not called "Main account", and
 * a string match silently pointed the till flow at the wrong pot. null =
 * nothing chosen yet, and the form starts with no pot selected.
 */
export function getDefaultPurchasePotId(db: Db): number | null {
  const row = settingRow(db, KEY_DEFAULT_PURCHASE_POT);
  if (row === null || row.value === '') return null;
  const potId = Number(row.value);
  if (!Number.isInteger(potId) || potId <= 0) return null;
  return isLivePot(db, potId) ? potId : null;
}

export function setDefaultPurchasePotId(
  db: Db,
  potId: number | null,
  actor: string,
  now?: Date,
): void {
  if (potId !== null && (!Number.isInteger(potId) || potId <= 0 || !isLivePot(db, potId))) {
    throw new InvalidSettingValueError(
      'That pot does not exist (or is archived), so it cannot be the default for purchases.',
    );
  }
  upsertSetting(
    db,
    KEY_DEFAULT_PURCHASE_POT,
    potId === null ? '' : String(potId),
    actor,
    'quick entry',
    now,
  );
}

/**
 * The pot All Transactions opens on when its URL does not select one (issue
 * #44). This is a household setting, not an inferred preference; null keeps
 * the page's existing Main account / first pot fallback. Only live pots can
 * be pinned because the page's target picker offers live pots.
 */
export function getDefaultTransactionsPotId(db: Db): number | null {
  const row = settingRow(db, KEY_DEFAULT_TRANSACTIONS_POT);
  if (row === null || row.value === '') return null;
  const potId = Number(row.value);
  if (!Number.isInteger(potId) || potId <= 0) return null;
  return isLivePot(db, potId) ? potId : null;
}

export function setDefaultTransactionsPotId(
  db: Db,
  potId: number | null,
  actor: string,
  now?: Date,
): void {
  if (potId !== null && (!Number.isInteger(potId) || potId <= 0 || !isLivePot(db, potId))) {
    throw new InvalidSettingValueError(
      'That pot does not exist (or is archived), so it cannot be the default for All Transactions.',
    );
  }
  upsertSetting(
    db,
    KEY_DEFAULT_TRANSACTIONS_POT,
    potId === null ? '' : String(potId),
    actor,
    'all transactions',
    now,
  );
}

/**
 * The pot a new Recurring schedule starts on (GitHub issue #79). It is a
 * starting choice only — every payment can still name any pot — and it is
 * chosen on the pot's own card in Settings beside the till and All
 * Transactions defaults. `null` keeps the schedule form's first-pot
 * fallback.
 */
export function getDefaultSchedulePotId(db: Db): number | null {
  const row = settingRow(db, KEY_DEFAULT_SCHEDULE_POT);
  if (row === null || row.value === '') return null;
  const potId = Number(row.value);
  if (!Number.isInteger(potId) || potId <= 0) return null;
  return isLivePot(db, potId) ? potId : null;
}

export function setDefaultSchedulePotId(
  db: Db,
  potId: number | null,
  actor: string,
  now?: Date,
): void {
  if (potId !== null && (!Number.isInteger(potId) || potId <= 0 || !isLivePot(db, potId))) {
    throw new InvalidSettingValueError(
      'That pot does not exist (or is archived), so it cannot be the default for a new schedule.',
    );
  }
  upsertSetting(
    db,
    KEY_DEFAULT_SCHEDULE_POT,
    potId === null ? '' : String(potId),
    actor,
    'recurring',
    now,
  );
}

/**
 * The child categories the household counts as fixed commitments — the
 * direct-debit chart's definition (SPEC §16.7 D, v0.14.0, decision 156).
 *
 * "Direct debit" is not a field on a purchase, and the household spotted
 * why a parent-level rule cannot work: Vehicle Running holds Insurance and
 * Road Tax (both commitments) next to Fuel (not one). So the definition is
 * an explicit set of **child** ids, ticked in Settings.
 *
 * `null` means never configured — the caller then falls back to the children
 * already used by dd/so schedules, which makes the chart useful on first
 * open. An empty array is a real answer ("track nothing") and is kept.
 * Stored in the existing key/value table with the standard audit entry: no
 * schema change, no migration.
 */
export function getCommitmentCategoryIds(db: Db): number[] | null {
  const row = settingRow(db, KEY_COMMITMENT_CATEGORIES);
  if (row === null) return null;
  if (row.value.trim() === '') return [];
  return normaliseCategoryIds(
    row.value
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((id) => Number.isInteger(id) && id > 0),
  );
}

export function setCommitmentCategoryIds(
  db: Db,
  categoryIds: readonly number[],
  actor: string,
  now?: Date,
): void {
  const ids = normaliseCategoryIds(categoryIds);
  for (const id of ids) {
    if (!Number.isInteger(id) || id <= 0 || !isChildCategory(db, id)) {
      throw new InvalidSettingValueError(
        'Fixed commitments are tracked by child category — one of those categories does not exist.',
      );
    }
  }
  upsertSetting(db, KEY_COMMITMENT_CATEGORIES, ids.join(','), actor, 'charts', now);
}

function normaliseCategoryIds(ids: readonly number[]): number[] {
  return [...new Set(ids)].sort((a, b) => a - b);
}

/** A category that exists and sits at the child (leaf) level. */
function isChildCategory(db: Db | DbTx, categoryId: number): boolean {
  const row = db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), isNotNull(categories.parentId)))
    .get();
  return row !== undefined;
}

/** A pot that still exists and has not been archived. */
function isLivePot(db: Db | DbTx, potId: number): boolean {
  const row = db
    .select({ id: pots.id })
    .from(pots)
    .where(and(eq(pots.id, potId), isNull(pots.archivedAt)))
    .get();
  return row !== undefined;
}

function fuelKey(vehicleId: number): string {
  return `${KEY_FUEL_PREFIX}${vehicleId}`;
}
function settingRow(db: Db | DbTx, key: string): { value: string } | null {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  return row ?? null;
}

function upsertSetting(
  db: Db,
  key: string,
  value: string,
  actor: string,
  area: string,
  nowArg?: Date,
): void {
  const now = nowArg ?? new Date();
  db.transaction((tx) => {
    const existing = tx.select().from(settings).where(eq(settings.key, key)).get();
    if (existing === undefined) {
      tx.insert(settings).values({ key, value, updatedAt: now, updatedBy: actor }).run();
    } else {
      tx.update(settings)
        .set({ value, updatedAt: now, updatedBy: actor, version: existing.version + 1 })
        .where(eq(settings.key, key))
        .run();
    }
    recordAudit(tx, {
      actor,
      action: 'setting.update',
      entity: 'setting',
      entityId: key,
      summary: `Updated ${area} setting ${key} to ${value === '' ? '(cleared)' : value}`,
      before: existing === undefined ? null : { value: existing.value },
      after: { value },
      now,
    });
  });
}

function parsePenceSetting(value: string, label: string): number {
  if (value === '') return 0;
  const number = Number(value);
  if (!isValidPenceAmount(number) || number < 0 || Math.abs(number) > MAX_ABS_PENCE) {
    throw new InvalidSettingValueError(
      `The stored ${label} setting is not a valid whole-pence figure.`,
    );
  }
  return number;
}

function parseLeadSetting(value: string, label: string, fallback: number): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 365) return fallback;
  return number;
}

function checkedLeadDays(days: number): number {
  if (!Number.isInteger(days) || days < 0 || days > 365) {
    throw new InvalidSettingValueError(
      'The warning lead must be a whole number of days between 0 and 365.',
    );
  }
  return days;
}

/* ------------------------------------------------------- energy (v1.44.0) */

export type EnergyGasReadingUnit = 'm3' | 'kwh';

export interface EnergySetup {
  /** A child category id, or null to follow `Utilities > Energy` by name. */
  categoryId: number | null;
  gasSmart: boolean;
  electricSmart: boolean;
  gasReadingUnit: EnergyGasReadingUnit;
  showOnPurchases: boolean;
}

/**
 * How the household's energy is set up (issue 118). Every field is a
 * preference, not a fact about the household's money: the defaults are "no
 * smart meter" (so no reading boxes appear until the household says otherwise)
 * and "gas meter prints m³", which is what most UK gas meters show.
 */
export function getEnergySetup(db: Db): EnergySetup {
  const categoryRow = settingRow(db, KEY_ENERGY_CATEGORY);
  const categoryId = categoryRow === null ? null : Number(categoryRow.value);
  const gasUnit = settingRow(db, KEY_ENERGY_GAS_UNIT)?.value;
  return {
    categoryId:
      categoryId !== null &&
      Number.isInteger(categoryId) &&
      categoryId > 0 &&
      isChildCategory(db, categoryId)
        ? categoryId
        : null,
    gasSmart: settingRow(db, KEY_ENERGY_SMART_GAS)?.value === '1',
    electricSmart: settingRow(db, KEY_ENERGY_SMART_ELECTRIC)?.value === '1',
    gasReadingUnit: gasUnit === 'kwh' ? 'kwh' : 'm3',
    showOnPurchases: settingRow(db, KEY_ENERGY_SHOW_ON_PURCHASES)?.value !== '0',
  };
}

/** Empty clears the override and returns the household to the default category. */
export function setEnergyCategoryId(
  db: Db,
  categoryId: number | null,
  actor: string,
  now?: Date,
): void {
  if (categoryId !== null && (!Number.isInteger(categoryId) || !isChildCategory(db, categoryId))) {
    throw new InvalidSettingValueError(
      'Energy is tracked by child category — that category does not exist.',
    );
  }
  upsertSetting(
    db,
    KEY_ENERGY_CATEGORY,
    categoryId === null ? '' : String(categoryId),
    actor,
    'energy',
    now,
  );
}

export function setEnergySmartMeter(
  db: Db,
  fuel: EnergyFuel,
  smart: boolean,
  actor: string,
  now?: Date,
): void {
  const key = fuel === 'gas' ? KEY_ENERGY_SMART_GAS : KEY_ENERGY_SMART_ELECTRIC;
  upsertSetting(db, key, smart ? '1' : '0', actor, 'energy', now);
}

export function setEnergyGasReadingUnit(
  db: Db,
  unit: EnergyGasReadingUnit,
  actor: string,
  now?: Date,
): void {
  upsertSetting(db, KEY_ENERGY_GAS_UNIT, unit === 'kwh' ? 'kwh' : 'm3', actor, 'energy', now);
}

export function setEnergyShowOnPurchases(db: Db, show: boolean, actor: string, now?: Date): void {
  upsertSetting(db, KEY_ENERGY_SHOW_ON_PURCHASES, show ? '1' : '0', actor, 'energy', now);
}

/**
 * The household's saved tariff for one fuel, validated on the way out: a
 * corrupt or hand-edited row throws rather than being half-believed, and the
 * Energy page shows that fuel's card as unreadable with a form to replace it.
 */
export function getEnergyTariff(db: Db, fuel: EnergyFuel): EnergyTariff | null {
  const row = settingRow(db, fuel === 'gas' ? KEY_ENERGY_TARIFF_GAS : KEY_ENERGY_TARIFF_ELECTRIC);
  if (row === null) return null;
  try {
    return parseEnergyTariff(row.value);
  } catch (err) {
    throw new InvalidSettingValueError(
      err instanceof Error
        ? `${fuel === 'gas' ? 'Gas' : 'Electricity'} tariff: ${err.message}`
        : 'The saved tariff is not readable.',
    );
  }
}

/** A null tariff clears the card. Rates are thousandths of a penny, ex VAT. */
export function setEnergyTariff(
  db: Db,
  fuel: EnergyFuel,
  tariff: EnergyTariff | null,
  actor: string,
  now?: Date,
): void {
  if (tariff !== null) {
    if (tariff.supplier.trim() === '' || tariff.tariffName.trim() === '') {
      throw new InvalidSettingValueError('A tariff needs a supplier and a tariff name.');
    }
    if (
      !Number.isSafeInteger(tariff.unitRateMilliPencePerKwh) ||
      tariff.unitRateMilliPencePerKwh < 0 ||
      !Number.isSafeInteger(tariff.standingChargeMilliPencePerDay) ||
      tariff.standingChargeMilliPencePerDay < 0
    ) {
      throw new InvalidSettingValueError('A tariff needs a unit rate and a standing charge.');
    }
  }
  upsertSetting(
    db,
    fuel === 'gas' ? KEY_ENERGY_TARIFF_GAS : KEY_ENERGY_TARIFF_ELECTRIC,
    tariff === null ? '' : serialiseEnergyTariff(tariff),
    actor,
    'energy',
    now,
  );
}
