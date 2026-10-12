import { openDatabase } from '../db/client';
import { applyMigrations } from '../db/migrate';
import { findChildCategory } from '../records/categories';
import { createDebt, editDebt } from '../records/debts';
import { createExternalMovement } from '../records/external-movements';
import { createPerson, setPersonEmail } from '../records/people';
import { addCheckpoint, createPot } from '../records/pots';
import { createPurchase } from '../records/purchases';
import { createReceipt } from '../records/receipts';
import { createRenewal } from '../records/renewals';
import { createSchedule } from '../records/schedules';
import {
  setDefaultPurchasePotId,
  setMonthlyFuelPence,
  setWeeklyGroceriesPence,
} from '../records/settings';
import { createSupplier } from '../records/suppliers';
import { addSupplierInteraction } from '../records/supplier-details';
import { createTask } from '../records/tasks';
import { createVehicle } from '../records/vehicles';
import { toLocalDateString } from '../time';
import { seedFenceDemoProject } from '../projects/demo';
import fs from 'node:fs';
import path from 'node:path';

/**
 * A day-of-month (1–28) whose most recent occurrence is `daysBehind` — or, when
 * that day is in `avoid`, up to `daysBehind + 4` — days before `todayIso`.
 *
 * Copied from `scripts/e2e-seed-dates.ts` so the demo seed is self-contained
 * and doesn't depend on the scripts folder.
 */
function recentMonthlyDueDay(
  todayIso: string,
  daysBehind = 6,
  avoid: readonly number[] = [],
): number {
  const dayOfMonth = Number(todayIso.slice(8, 10));
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
    throw new Error(`Expected a YYYY-MM-DD local date, got "${todayIso}".`);
  }
  if (!Number.isInteger(daysBehind) || daysBehind < 1 || daysBehind > 20) {
    throw new Error(`daysBehind must be 1–20, got ${daysBehind}.`);
  }
  for (let step = 0; step <= 4; step += 1) {
    let day = dayOfMonth - (daysBehind + step);
    while (day < 1) day += 28;
    day = ((day - 1) % 28) + 1;
    if (!avoid.includes(day)) return day;
  }
  throw new Error(`No usable due day for "${todayIso}" avoiding ${avoid.join(', ')}.`);
}

/**
 * The worked example's fictional household — two months of realistic data
 * rendered through the app's real engines and components.
 *
 * This module seeds an in-memory SQLite database (or a file database at a
 * given path) with the exact same fictional scenario the E2E harness uses:
 * Alex & Sam, two bank accounts, two cash pots, vehicles, salary, bills,
 * two months of weekly shops, personal spending, a loan from Mum with
 * expected support, and the "Back Garden Fence Replacement" project demo.
 *
 * All figures, names, phone numbers and links are invented (`.example`
 * domains, Ofcom fictional numbers). The data is dated relative to the
 * provided `now` so the previous calendar month is always complete,
 * satisfying the two-month requirement (ONBOARDING_PLAN.md §4).
 *
 * Usage:
 *   - In-memory (for /example): pass `:memory:` as databasePath
 *   - File (for preview seeding): pass a real file path under .preview-data
 *
 * Returns the seeded database handle and the `now` Date used for anchoring.
 */

export interface DemoHouseholdResult {
  dbHandle: ReturnType<typeof openDatabase>;
  now: Date;
  todayIso: string;
}

/**
 * Seed the fictional household into the given database.
 * If databasePath is ':memory:', creates an in-memory database.
 * Otherwise creates/opens a file database at that path.
 */
export function seedDemoHousehold(
  databasePath: string,
  now: Date = new Date(),
): DemoHouseholdResult {
  // Handle :memory: by creating a temporary file instead, since openDatabase
  // uses fs.statSync which doesn't work with :memory:
  let actualPath = databasePath;
  let tempFile = false;
  if (databasePath === ':memory:') {
    actualPath = path.join(
      '/tmp',
      `demo-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`,
    );
    tempFile = true;
  }
  const handle = openDatabase(actualPath);
  applyMigrations(handle.db);
  const db = handle.db;

  // The household's calendar date (Europe/London), not UTC's: between 23:00
  // and 00:00 UTC in summer they differ, and a seed dated by UTC put "today's"
  // records on yesterday as far as the app was concerned.
  const todayIso = toLocalDateString(now);
  const today = new Date(`${todayIso}T12:00:00Z`);

  const ACTOR = 'alex@example.com';

  // People come first: the cash pots carry an Owner, the same link the till's
  // Checkpoint cash card reads.
  const alex = createPerson(db, { label: 'Alex', actor: ACTOR, now });
  const sam = createPerson(db, { label: 'Sam', actor: ACTOR, now });

  const main = createPot(db, {
    label: 'Main account',
    kind: 'bank',
    overdraftLimitPence: 80000,
    warningThresholdPence: 25000,
    actor: ACTOR,
    now,
  });
  const salary = createPot(db, { label: 'Salary account', kind: 'bank', actor: ACTOR, now });
  const alexCash = createPot(db, {
    label: "Alex's cash",
    kind: 'cash',
    ownerPersonId: alex.id,
    actor: ACTOR,
    now,
  });
  const samCash = createPot(db, {
    label: "Sam's cash",
    kind: 'cash',
    ownerPersonId: sam.id,
    actor: ACTOR,
    now,
  });

  // The till form's starting pot is a setting — the seed sets it the
  // way a household would, and the specs prove the form honours it.
  setDefaultPurchasePotId(db, main.id, ACTOR, now);

  // "Signs in as" (v0.11.0): the dev identity is Alex, so the till opens with
  // Paid by = Alex, the Fuel tab on Alex's Vehicle A, and the Checkpoint cash
  // card locked on Alex's cash.
  setPersonEmail(db, {
    id: alex.id,
    email: ACTOR,
    allowedEmails: [ACTOR],
    actor: ACTOR,
    now,
  });
  const vehicleA = createVehicle(db, {
    label: 'Vehicle A',
    ownerPersonId: alex.id,
    actor: ACTOR,
    now,
  });
  const vehicleB = createVehicle(db, {
    label: 'Vehicle B',
    ownerPersonId: sam.id,
    actor: ACTOR,
    now,
  });

  // Checkpoints — varied dates so the anchor-reset model has something to work with
  addCheckpoint(db, {
    potId: main.id,
    amountPence: 161235,
    note: 'Friday evening check',
    actor: ACTOR,
    now,
  });
  addCheckpoint(db, { potId: salary.id, amountPence: 120000, actor: ACTOR, now });
  addCheckpoint(db, { potId: alexCash.id, amountPence: 4210, actor: ACTOR, now });
  addCheckpoint(db, { potId: samCash.id, amountPence: 2862, actor: ACTOR, now });

  // Categories needed for the seed
  const groceries = findChildCategory(db, 'Groceries', 'Weekly Shop');
  const topUp = findChildCategory(db, 'Groceries', 'Top-up Shops');
  const fuel = findChildCategory(db, 'Vehicle Running', 'Fuel');
  const insurance = findChildCategory(db, 'Vehicle Running', 'Insurance');
  const clothing = findChildCategory(db, 'Personal', 'Clothing & Shoes');
  const hobbies = findChildCategory(db, 'Personal', 'Hobbies');
  const toiletries = findChildCategory(db, 'Personal', 'Health & Toiletries');
  const dining = findChildCategory(db, 'Entertainment & Eating Out', 'Dining Out & Takeaways');
  const energy = findChildCategory(db, 'Utilities', 'Energy');
  const water = findChildCategory(db, 'Utilities', 'Water');
  const roadTax = findChildCategory(db, 'Vehicle Running', 'Road Tax');
  if (
    groceries === null ||
    topUp === null ||
    fuel === null ||
    insurance === null ||
    clothing === null ||
    hobbies === null ||
    toiletries === null ||
    dining === null ||
    energy === null ||
    water === null ||
    roadTax === null
  ) {
    throw new Error('Demo seed: the SPEC §12 category tree is missing an expected child');
  }

  // Suppliers
  const cornerFoods = createSupplier(db, {
    name: 'Corner Foods',
    contactPhone: '01632 960111',
    contactEmail: 'hello@cornerfoods.example',
    website: 'https://cornerfoods.example',
    address: '1 Fictional Parade, Testville',
    notes: 'Weekend shop usually here.',
    actor: ACTOR,
    now,
  });
  const insurerCo = createSupplier(db, {
    name: 'InsurerCo',
    contactPhone: '01632 960222',
    contactEmail: 'policies@insurerco.example',
    actor: ACTOR,
    now,
  });
  const broadbandCo = createSupplier(db, {
    name: 'BroadbandCo',
    contactEmail: 'billing@broadbandco.example',
    notes: '18-month contract, ends next spring.',
    actor: ACTOR,
    now,
  });

  // Recent purchases (last few days) — these give the "recent activity" feel
  createPurchase(db, {
    potId: main.id,
    totalPence: 6347,
    occurredAt: new Date(now.getTime() - 26 * 60 * 60 * 1000),
    paidByPersonId: alex.id,
    supplierId: cornerFoods.id,
    note: 'Weekly shop',
    actor: ACTOR,
    lines: [
      { amountPence: 4198, categoryId: groceries.id, targetKind: 'household' },
      { amountPence: 2149, categoryId: fuel.id, targetKind: 'vehicle', targetId: vehicleA.id },
    ],
    now,
  });
  createPurchase(db, {
    potId: samCash.id,
    totalPence: 349,
    occurredAt: new Date(now.getTime() - 3 * 60 * 60 * 1000),
    paidByPersonId: sam.id,
    supplierName: 'The Corner Cafe',
    actor: 'sam@example.com',
    lines: [{ amountPence: 349, categoryId: groceries.id, targetKind: 'person', targetId: sam.id }],
    now,
  });

  // ----------------------------------------------------------------
  // Fictional history — two calendar months of data so the month-on-month
  // comparison (Insights) and Charts month views are fully populated.
  // Every amount is invented; dates are at least ten days old so specs
  // asserting on "this week" and the recent-entry list are not disturbed.
  // ----------------------------------------------------------------
  const greenfield = createSupplier(db, { name: 'Greenfield Market', actor: ACTOR, now });
  const hillside = createSupplier(db, { name: 'Hillside Outfitters', actor: ACTOR, now });
  const wattstream = createSupplier(db, { name: 'Wattstream Energy', actor: ACTOR, now });

  const historyPurchase = (
    dayOffset: number,
    totalPence: number,
    categoryId: number,
    target: { kind: 'household' | 'person'; id?: number },
    supplierId: number | null,
    note: string,
  ): void => {
    const date = localDate(today, dayOffset);
    createPurchase(db, {
      potId: main.id,
      totalPence,
      occurredAt: new Date(`${date}T12:00:00Z`),
      occurredDate: date,
      paidByPersonId: alex.id,
      supplierId,
      note,
      actor: ACTOR,
      lines: [
        {
          amountPence: totalPence,
          categoryId,
          targetKind: target.kind,
          ...(target.id === undefined ? {} : { targetId: target.id }),
        },
      ],
      now,
    });
  };

  // 25 completed weekly shops, one a week, drifting upwards against the
  // configured £85 so the honesty verdict has something to say.
  const shopAmounts = [
    7840, 8120, 7995, 8460, 8210, 9030, 8675, 8890, 7720, 9240, 8815, 9120, 8360, 9480, 8990, 9310,
    8740, 9650, 9180, 8420, 9720, 9060, 9895, 9340, 10120,
  ];
  shopAmounts.forEach((amountPence, index) => {
    const weeksAgo = shopAmounts.length - index;
    historyPurchase(
      -7 * weeksAgo - 2,
      amountPence,
      groceries.id,
      { kind: 'household' },
      greenfield.id,
      'Weekly shop',
    );
    if (index % 3 === 0) {
      historyPurchase(
        -7 * weeksAgo + 1,
        1240 + index * 15,
        topUp.id,
        { kind: 'household' },
        greenfield.id,
        'Top-up',
      );
    }
  });

  // A year of discretionary spending: Alex, Sam, and a few joint takeaways
  for (let monthsAgo = 11; monthsAgo >= 0; monthsAgo -= 1) {
    const day = -(monthsAgo * 30 + 11);
    historyPurchase(
      day,
      2400 + monthsAgo * 110,
      clothing.id,
      { kind: 'person', id: alex.id },
      hillside.id,
      'Clothes',
    );
    historyPurchase(
      day - 3,
      1850 + ((monthsAgo * 7) % 900),
      hobbies.id,
      { kind: 'person', id: alex.id },
      null,
      'Hobby',
    );
    historyPurchase(
      day - 1,
      3100 - monthsAgo * 85,
      clothing.id,
      { kind: 'person', id: sam.id },
      hillside.id,
      'Clothes',
    );
    historyPurchase(
      day - 5,
      1450 + ((monthsAgo * 13) % 700),
      toiletries.id,
      { kind: 'person', id: sam.id },
      null,
      'Toiletries',
    );
    historyPurchase(
      day - 7,
      2650 + ((monthsAgo * 31) % 1200),
      dining.id,
      { kind: 'household' },
      null,
      'Takeaway together',
    );
    // Household bills in tracked categories, easing down over the year.
    historyPurchase(
      day - 9,
      9800 - monthsAgo * 120,
      energy.id,
      { kind: 'household' },
      wattstream.id,
      'Energy bill',
    );
    historyPurchase(day - 10, 3600, water.id, { kind: 'household' }, null, 'Water bill');
    if (monthsAgo % 12 === 3) {
      historyPurchase(day - 12, 18000, roadTax.id, { kind: 'household' }, null, 'Road tax');
    }
  }

  // One-off income (plan decision 110): the old bicycle sold for cash, paid
  // into the cash pot — so the Income page, All Transactions and the estimate
  // all have a manual, non-schedule income row to show.
  createReceipt(db, {
    potId: alexCash.id,
    amountPence: 4500,
    occurredAt: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000),
    source: 'Sale of bicycle',
    note: 'Collected in cash',
    actor: ACTOR,
    now,
  });

  // Recurring commitments:
  // - BroadbandCo (dd) due in TWO DAYS so the key-date warning tests have
  //   something to warn about.
  // - Phone plan (so) must have a conversion INSIDE the 30-day activity window.
  //   `recentMonthlyDueDay` lands it about a week behind today on every day
  //   of the year, and never on the 21st.
  // - Salary (receipt) on the 27th — the payday the projection plans to.
  // - Annual insurance renewal.
  const dueDay = Math.min(Number(todayIso.slice(8, 10)) + 2, 28);
  createSchedule(db, {
    name: 'BroadbandCo fibre',
    kind: 'dd',
    frequency: 'monthly',
    dueDayOfMonth: dueDay,
    amountPence: 3499,
    potId: main.id,
    categoryId: insurance.id,
    supplierId: broadbandCo.id,
    targetKind: 'household',
    contractEndsOn: localDate(today, 12),
    activeFrom: localDate(today, -180),
    actor: ACTOR,
    now,
  });
  createSchedule(db, {
    name: 'Phone plan',
    kind: 'so',
    frequency: 'monthly',
    dueDayOfMonth: recentMonthlyDueDay(todayIso, 6, [21]),
    amountPence: 1200,
    potId: main.id,
    categoryId: insurance.id,
    targetKind: 'household',
    activeFrom: localDate(today, -90),
    actor: ACTOR,
    now,
  });
  createSchedule(db, {
    name: 'Salary',
    kind: 'receipt',
    frequency: 'monthly',
    dueDayOfMonth: 27,
    amountPence: 245000,
    potId: salary.id,
    activeFrom: localDate(today, -60),
    actor: ACTOR,
    now,
  });

  // A tracked debt with the household's motivating expected inflow: £1,000
  // borrowed from Mum into Alex's cash, expecting £1,000 support on the 12th
  // of each month. The loan raises the pot estimate and the owed balance
  // together — never income; the expectation only ever feeds the projections.
  const mum = createDebt(db, {
    counterparty: 'Mum',
    direction: 'we_owe',
    note: 'helping with the bills until spring',
    actor: ACTOR,
    now,
  });
  createExternalMovement(db, {
    potId: alexCash.id,
    direction: 'in',
    kind: 'loan',
    amountPence: 100000,
    debtId: mum.id,
    occurredAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
    occurredDate: localDate(today, -5),
    actor: ACTOR,
    now,
  });
  editDebt(db, {
    id: mum.id,
    expectedVersion: 1,
    actor: ACTOR,
    now,
    patch: { expectedInflow: { amountPence: 100000, dayOfMonth: 12 } },
  });

  createRenewal(db, {
    label: 'Vehicle A insurance',
    supplierId: insurerCo.id,
    targetKind: 'vehicle',
    targetId: vehicleA.id,
    nextRenewalDate: localDate(today, 17),
    warnDaysBefore: 21,
    repeatsAnnually: true,
    notes: 'Compare the comparison sites before renewing.',
    actor: ACTOR,
    now,
  });

  addSupplierInteraction(db, {
    supplierId: broadbandCo.id,
    channel: 'call',
    summary: 'Asked what the out-of-contract price would be',
    outcome: 'They will write to us',
    followUpDate: localDate(today, 6),
    actor: ACTOR,
    now,
  });

  // Seeded task by Sam for the bell's "Since you last looked"
  createTask(db, {
    title: `Sam added a note ${Date.now()}`,
    detail: 'Seeded for bell e2e — activity by the other person',
    dueDate: localDate(today, 3),
    actor: 'sam@example.com',
    now,
  });

  // Projection figures
  setWeeklyGroceriesPence(db, 8500, ACTOR);
  setMonthlyFuelPence(db, vehicleA.id, 6000, ACTOR);
  setMonthlyFuelPence(db, vehicleB.id, 4500, ACTOR);

  // Projects demo: the fictional "Back Garden Fence Replacement"
  seedFenceDemoProject(db, ACTOR, now);

  // The second vehicle exists so the Insights panels have a zero-activity row
  // to list honestly (SPEC §16 decision 66).
  void vehicleB;

  return { dbHandle: handle, now, todayIso };
}

function localDate(base: Date, dayOffset: number): string {
  const shifted = new Date(base.getTime() + dayOffset * 24 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}
