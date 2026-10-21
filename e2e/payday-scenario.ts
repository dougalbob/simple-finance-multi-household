import path from 'node:path';
import { eq } from 'drizzle-orm';
import { getCurrentUser } from '../src/lib/auth/current-user';
import { loadAppConfig } from '../src/lib/config';
import { closeDbHandles, getHouseholdDbHandle, type Db } from '../src/lib/db/client';
import { checkpoints } from '../src/lib/db/schema';
import { addDaysLocal, nextPaydayOccurrence } from '../src/lib/records/dates';
import { getProjectionView } from '../src/lib/records/money-view';
import { findChildCategory } from '../src/lib/records/categories';
import { addCheckpoint, createPot, listPots } from '../src/lib/records/pots';
import { createPurchase } from '../src/lib/records/purchases';
import { createSchedule, editSchedule, listSchedules } from '../src/lib/records/schedules';
import {
  setDefaultPurchasePotId,
  setMonthlyFuelPence,
  setPaydayDayOfMonth,
  setWeeklyGroceriesPence,
} from '../src/lib/records/settings';
import { createSupplier, findSupplierByName } from '../src/lib/records/suppliers';
import { createVehicle, listVehicles } from '../src/lib/records/vehicles';
import { lastFuelDatesByVehicle } from '../src/lib/records/day-to-day';
import { listPeople } from '../src/lib/records/people';
import { toLocalDateString } from '../src/lib/time';

const ACTOR = 'payday-scenario@example.invalid';
const TARGET_LOW_PENCE = -9635;
const MAIN_CHECKPOINT_PENCE = 24222;
const NATWEST_CHECKPOINT_PENCE = 31200;
const NATWEST_LABEL = 'Natwest';
const SALARY_SCHEDULE_NAME = 'Salary';

const bills = [
  {
    name: 'Scenario Council Tax',
    supplier: 'Payday Scenario Council Services',
    category: ['Housing', 'Council Tax'] as const,
    amountPence: 10_000,
  },
  {
    name: 'Scenario Mortgage',
    supplier: 'Payday Scenario Mortgage Company',
    category: ['Housing', 'Mortgage/Rent'] as const,
    amountPence: 7_500,
  },
  {
    name: 'Scenario Water',
    supplier: 'Payday Scenario Water Company',
    category: ['Utilities', 'Water'] as const,
    amountPence: 2_500,
  },
  {
    name: 'Scenario Energy',
    supplier: 'Payday Scenario Energy Company',
    category: ['Utilities', 'Energy'] as const,
    amountPence: 180_000,
  },
] as const;

/**
 * Prepare the isolated, fictional E2E installation for the payday card.
 * Suppliers are created before their DD schedules. The day-to-day fuel event
 * is anchored 30 days before the configured payday so its £90 projection lands on payday;
 * every other projected day-to-day figure is set to zero to make the exclusion
 * visible in the Overview and Horizon as well as in the shared projection.
 */
export async function seedPaydayScenario(): Promise<{
  paydayDate: string;
  natwestBillsOnlyShortfallPence: number;
}> {
  const config = loadAppConfig({
    ...process.env,
    NODE_ENV: 'development',
    DATA_DIR: path.resolve(process.cwd(), '.e2e-data'),
    AUTH_DEV_BYPASS: 'true',
    AUTH_DEV_IDENTITY_EMAIL: 'alex@example.com',
  });
  const user = await getCurrentUser({ get: () => null }, config);
  if (user === null) throw new Error('E2E seed identity has no active household assignment.');
  const handle = getHouseholdDbHandle(user.householdId, config);
  try {
    const { db } = handle;
    const now = new Date();
    const today = toLocalDateString(now);
    // The fixture used to pin payday to the 26th and the direct debits to the
    // 21st, which only coheres while the 21st is still ahead: on the 21st–25th
    // the next 21st falls after payday, no bill lands in the projection window
    // and the expected low is unreachable (CI, 2026-10-21). Choose the days
    // relative to today instead — payday ten days out (the weekend shift can
    // bring the actual payday at most two days closer), the direct debits five
    // days before the actual payday, both starting today — so the scenario is
    // the same on every calendar day.
    const paydayDay = Number(addDaysLocal(today, 10).slice(8, 10));
    const fixturePayday = nextPaydayOccurrence(paydayDay, today);
    if (fixturePayday === null) {
      throw new Error('Payday E2E fixture could not place its payday');
    }
    const directDebitDay = Number(addDaysLocal(fixturePayday, -5).slice(8, 10));
    const windowStart = today;

    const pots = listPots(db);
    const main = required(
      pots.find((pot) => pot.label === 'Main account'),
      'Main account pot',
    );
    const salaryPot = required(
      pots.find((pot) => pot.label === 'Salary account'),
      'Salary pot',
    );
    const alexCash = required(
      pots.find((pot) => pot.label === "Alex's cash"),
      "Alex's cash pot",
    );
    const samCash = required(
      pots.find((pot) => pot.label === "Sam's cash"),
      "Sam's cash pot",
    );
    const natwest =
      pots.find((pot) => pot.label.toLocaleLowerCase('en-GB') === NATWEST_LABEL.toLowerCase()) ??
      createPot(db, { label: NATWEST_LABEL, kind: 'bank', actor: ACTOR, now });
    // A preview may have changed the configured default pot manually; pin the
    // fixture to Main so the payday assertion starts from the known balance.
    setDefaultPurchasePotId(db, main.id, ACTOR, now);
    setPaydayDayOfMonth(db, paydayDay, ACTOR, now);

    const schedules = listSchedules(db, now);
    const salarySchedule = required(
      schedules.find(
        ({ schedule }) => schedule.kind === 'receipt' && schedule.name === SALARY_SCHEDULE_NAME,
      ),
      'Salary receipt schedule',
    ).schedule;

    // The income spec leaves the seeded salary on a computed weekend day, and
    // adds Car allowance. Restore Salary's receipt date for this fixture; the
    // household's independently configured payday above remains the window boundary.
    for (const { schedule } of schedules) {
      if (schedule.cancelledAt !== null) continue;
      if (schedule.id === salarySchedule.id) continue;
      if (schedule.kind === 'receipt' || schedule.kind === 'dd' || schedule.kind === 'so') {
        if (schedule.activeUntil === null || schedule.activeUntil > today) {
          editSchedule(db, {
            id: schedule.id,
            expectedVersion: schedule.version,
            actor: ACTOR,
            now,
            patch: { activeUntil: today },
          });
        }
      }
    }

    const currentSalary = required(
      listSchedules(db, now).find(({ schedule }) => schedule.id === salarySchedule.id),
      'Salary receipt schedule after reset',
    ).schedule;
    if (
      currentSalary.dueDayOfMonth !== paydayDay ||
      currentSalary.activeFrom !== windowStart ||
      currentSalary.activeUntil !== null
    ) {
      editSchedule(db, {
        id: currentSalary.id,
        expectedVersion: currentSalary.version,
        actor: ACTOR,
        now,
        patch: { dueDayOfMonth: paydayDay, activeFrom: windowStart, activeUntil: null },
      });
    }

    // Create every fictional supplier before any of its direct-debit schedules.
    const suppliers = new Map(
      bills.map(({ supplier }) => {
        const existing = findSupplierByName(db, supplier);
        return [
          supplier,
          existing ?? createSupplier(db, { name: supplier, actor: ACTOR, now }),
        ] as const;
      }),
    );

    for (const bill of bills) {
      const category = findChildCategory(db, bill.category[0], bill.category[1]);
      if (category === null) {
        throw new Error(`Payday E2E fixture is missing ${bill.category.join(' / ')}`);
      }
      const supplier = required(suppliers.get(bill.supplier), `Supplier ${bill.supplier}`);
      const existing = listSchedules(db, now).find(
        ({ schedule }) => schedule.name === bill.name && schedule.kind === 'dd',
      );
      if (existing === undefined) {
        createSchedule(db, {
          name: bill.name,
          kind: 'dd',
          frequency: 'monthly',
          dueDayOfMonth: directDebitDay,
          amountPence: bill.amountPence,
          potId: natwest.id,
          categoryId: category.id,
          supplierId: supplier.id,
          activeFrom: windowStart,
          actor: ACTOR,
          now,
        });
      } else {
        const { schedule } = existing;
        if (
          schedule.dueDayOfMonth !== directDebitDay ||
          schedule.amountPence !== bill.amountPence ||
          schedule.potId !== natwest.id ||
          schedule.categoryId !== category.id ||
          schedule.supplierId !== supplier.id ||
          schedule.activeFrom !== windowStart ||
          schedule.activeUntil !== null
        ) {
          editSchedule(db, {
            id: schedule.id,
            expectedVersion: schedule.version,
            actor: ACTOR,
            now,
            patch: {
              dueDayOfMonth: directDebitDay,
              amountPence: bill.amountPence,
              potId: natwest.id,
              categoryId: category.id,
              supplierId: supplier.id,
              activeFrom: windowStart,
              activeUntil: null,
            },
          });
        }
      }
    }

    ensureCheckpoint(db, main.id, MAIN_CHECKPOINT_PENCE, 'Payday example — Main', now);
    ensureCheckpoint(db, salaryPot.id, 0, 'Payday example — Salary', now);
    ensureCheckpoint(db, alexCash.id, 0, 'Payday example — Alex cash', now);
    ensureCheckpoint(db, samCash.id, 0, 'Payday example — Sam cash', now);
    ensureCheckpoint(db, natwest.id, NATWEST_CHECKPOINT_PENCE, 'Payday example — Natwest', now);

    setWeeklyGroceriesPence(db, 0, ACTOR, now);
    for (const vehicle of listVehicles(db)) setMonthlyFuelPence(db, vehicle.id, 0, ACTOR, now);

    const alex = required(
      listPeople(db).find((person) => person.label === 'Alex'),
      'Alex',
    );
    let exampleVehicle = listVehicles(db).find(
      (vehicle) => vehicle.label === 'Payday example vehicle',
    );
    if (exampleVehicle === undefined) {
      exampleVehicle = createVehicle(db, {
        label: 'Payday example vehicle',
        ownerPersonId: alex.id,
        actor: ACTOR,
        now,
      });
    }
    setMonthlyFuelPence(db, exampleVehicle.id, 9_000, ACTOR, now);

    const fuel = findChildCategory(db, 'Vehicle Running', 'Fuel');
    if (fuel === null) throw new Error('Payday E2E fixture is missing Vehicle Running / Fuel');

    let projection = getProjectionView(db, now);
    if (projection === null || projection.result.paydayDate === null) {
      throw new Error('Payday E2E fixture could not find its configured payday');
    }
    let paydayDate = projection.result.paydayDate;
    const fuelAnchorDate = addDaysLocal(paydayDate, -30);
    const lastFuelDate = lastFuelDatesByVehicle(db).get(exampleVehicle.id) ?? null;
    if (lastFuelDate !== fuelAnchorDate) {
      if (lastFuelDate !== null && lastFuelDate > fuelAnchorDate) {
        throw new Error('Payday E2E fixture has a later fuel anchor than the configured payday');
      }
      // `createPurchase` correctly rejects future-dated real entries. On the
      // rare calendar days when payday-30 is tomorrow, advance only the
      // fictional fixture clock for this anchor; the E2E database is isolated.
      const anchorNow = fuelAnchorDate > today ? new Date(`${fuelAnchorDate}T12:00:00.000Z`) : now;
      createPurchase(db, {
        potId: main.id,
        totalPence: 9_000,
        occurredDate: fuelAnchorDate,
        paidByPersonId: alex.id,
        note: 'Fictional payday-day fuel anchor',
        actor: ACTOR,
        lines: [
          {
            amountPence: 9_000,
            categoryId: fuel.id,
            targetKind: 'vehicle',
            targetId: exampleVehicle.id,
          },
        ],
        now: anchorNow,
      });
    }

    projection = getProjectionView(db, now);
    if (projection === null || projection.result.projectedLowPence === null) {
      throw new Error('Payday E2E fixture could not calculate its configured-payday low');
    }
    paydayDate = projection.result.paydayDate ?? paydayDate;
    const energy = required(
      listSchedules(db, now).find(({ schedule }) => schedule.name === 'Scenario Energy'),
      'Scenario Energy direct debit',
    ).schedule;
    const adjustment = projection.result.projectedLowPence - TARGET_LOW_PENCE;
    if (adjustment !== 0) {
      const adjustedEnergy = energy.amountPence + adjustment;
      if (adjustedEnergy <= 0) {
        throw new Error('Payday E2E fixture cannot keep the energy direct debit positive');
      }
      editSchedule(db, {
        id: energy.id,
        expectedVersion: energy.version,
        actor: ACTOR,
        now,
        patch: { amountPence: adjustedEnergy },
      });
    }

    projection = getProjectionView(db, now);
    if (
      projection === null ||
      projection.result.paydayDate === null ||
      projection.result.projectedLowPence !== TARGET_LOW_PENCE ||
      projection.result.dayToDayPence !== 0
    ) {
      throw new Error('Payday E2E fixture did not resolve to the expected isolated projection');
    }

    const natwestWatch = projection.result.potWatches.find((watch) => watch.potId === natwest.id);
    if (natwestWatch === undefined) {
      throw new Error('Payday E2E fixture has no bills-only shortfall for Natwest');
    }

    return {
      paydayDate: projection.result.paydayDate,
      natwestBillsOnlyShortfallPence: natwestWatch.shortfallPence,
    };
  } finally {
    closeDbHandles();
  }
}

function ensureCheckpoint(
  db: Db,
  potId: number,
  amountPence: number,
  note: string,
  now: Date,
): void {
  const existing = db
    .select({ id: checkpoints.id })
    .from(checkpoints)
    .where(eq(checkpoints.note, note))
    .get();
  if (existing !== undefined) return;
  addCheckpoint(db, { potId, amountPence, note, actor: ACTOR, now });
}

function required<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined)
    throw new Error(`Missing ${label} in payday E2E fixture`);
  return value;
}
