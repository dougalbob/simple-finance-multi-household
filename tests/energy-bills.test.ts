import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { eq } from 'drizzle-orm';
import { auditEntries, purchases } from '../src/lib/db/schema';
import {
  editEnergyBill,
  energyRowDetails,
  getEnergyBill,
  getEnergyCategoryId,
  getEnergyRowContext,
  getEnergyView,
  listEnergyBills,
  NotAnEnergyPurchaseError,
} from '../src/lib/records/energy';
import { InvalidEnergyInputError, type EnergyDetails } from '../src/lib/records/energy-usage';
import { VersionConflictError, RecordVoidedError } from '../src/lib/records/errors';
import { createPurchase, voidPurchase } from '../src/lib/records/purchases';
import {
  getEnergySetup,
  getEnergyTariff,
  setEnergyCategoryId,
  setEnergyGasReadingUnit,
  setEnergyShowOnPurchases,
  setEnergySmartMeter,
  setEnergyTariff,
} from '../src/lib/records/settings';
import { createHouseholdFixture, type HouseholdFixture } from './household';

/**
 * Energy details against the database (issue 118, v1.44.0; SPEC §29).
 *
 * The anchor is the `Utilities > Energy` allocation line, never a schedule's
 * name: the household's own schedule is called "Gas/Electric", and a copy of
 * that name is exactly what another household will not have. Everything here
 * hangs off the category.
 */

const DETAILS: EnergyDetails = {
  periodStart: '2026-09-18',
  periodEnd: '2026-10-18',
  gasWh: 755_230,
  electricWh: null,
  gasReadingStart: 137_704_660,
  gasReadingEnd: 138_377_730,
  electricReadingStart: null,
  electricReadingEnd: null,
  gasEstimateWh: 21_699_000,
  electricEstimateWh: null,
  note: null,
};

async function fixture(): Promise<HouseholdFixture> {
  return createHouseholdFixture();
}

function energyPurchase(
  house: HouseholdFixture,
  options: { date?: string; pence?: number; categoryId?: number } = {},
) {
  const energyCategoryId = options.categoryId ?? house.categoryId('Utilities', 'Energy');
  const created = createPurchase(house.db, {
    potId: house.pots.main.id,
    totalPence: options.pence ?? 15_149,
    paidByPersonId: null,
    occurredAt: new Date(`${options.date ?? '2026-10-20'}T09:00:00Z`),
    occurredDate: options.date ?? '2026-10-20',
    note: 'Monthly direct debit',
    lines: [
      {
        amountPence: options.pence ?? 15_149,
        categoryId: energyCategoryId,
        targetKind: 'household',
        targetId: null,
      },
    ],
    actor: 'alex@example.com',
  });
  return { purchase: created.purchase, categoryId: energyCategoryId };
}

describe('which purchase is an energy purchase', () => {
  it('defaults to the seeded Utilities > Energy category', async () => {
    const house = await fixture();
    try {
      assert.equal(getEnergyCategoryId(house.db), house.categoryId('Utilities', 'Energy'));
    } finally {
      house.close();
    }
  });

  it('follows the household’s own category when they point it somewhere else', async () => {
    const house = await fixture();
    try {
      const water = house.categoryId('Utilities', 'Water');
      setEnergyCategoryId(house.db, water, 'alex@example.com');
      assert.equal(getEnergyCategoryId(house.db), water);
      // Clearing the override returns to the default, it does not disable energy.
      setEnergyCategoryId(house.db, null, 'alex@example.com');
      assert.equal(getEnergyCategoryId(house.db), house.categoryId('Utilities', 'Energy'));
    } finally {
      house.close();
    }
  });

  it('refuses a category that is not a live child, or is not a category at all', async () => {
    const house = await fixture();
    try {
      assert.throws(
        () => setEnergyCategoryId(house.db, 999_999, 'alex@example.com'),
        (err: unknown) => err instanceof Error && /child category/.test(err.message),
      );
    } finally {
      house.close();
    }
  });

  it('offers the block only where there is an energy line', async () => {
    const house = await fixture();
    try {
      const { purchase } = energyPurchase(house);
      const groceriesId = house.categoryId('Groceries', 'Weekly Shop');
      const other = createPurchase(house.db, {
        potId: house.pots.main.id,
        totalPence: 4_000,
        paidByPersonId: null,
        occurredAt: new Date('2026-10-19T09:00:00Z'),
        occurredDate: '2026-10-19',
        note: null,
        lines: [
          {
            amountPence: 4_000,
            categoryId: groceriesId,
            targetKind: 'household',
            targetId: null,
          },
        ],
        actor: 'alex@example.com',
      });
      const context = getEnergyRowContext(house.db);
      const energyLines = [
        { categoryId: house.categoryId('Utilities', 'Energy'), amountPence: 15_149 },
      ];
      assert.ok(energyRowDetails(context, purchase, energyLines) !== null);
      assert.equal(
        energyRowDetails(context, other.purchase, [
          { categoryId: groceriesId, amountPence: 4_000 },
        ]),
        null,
      );
      // The hidden-by-default rule: nothing appears until the household asks.
      setEnergyShowOnPurchases(house.db, false, 'alex@example.com');
      const hidden = getEnergyRowContext(house.db);
      assert.equal(energyRowDetails(hidden, purchase, energyLines), null);
    } finally {
      house.close();
    }
  });

  it('records only the energy lines when a bill is split with something else', async () => {
    const house = await fixture();
    try {
      const energyCategoryId = house.categoryId('Utilities', 'Energy');
      const created = createPurchase(house.db, {
        potId: house.pots.main.id,
        totalPence: 20_000,
        paidByPersonId: null,
        occurredAt: new Date('2026-10-20T09:00:00Z'),
        occurredDate: '2026-10-20',
        note: null,
        lines: [
          {
            amountPence: 15_000,
            categoryId: energyCategoryId,
            targetKind: 'household',
            targetId: null,
          },
          {
            amountPence: 5_000,
            categoryId: house.categoryId('Utilities', 'Water'),
            targetKind: 'household',
            targetId: null,
          },
        ],
        actor: 'alex@example.com',
      });
      editEnergyBill(house.db, {
        purchaseId: created.purchase.id,
        expectedVersion: created.purchase.version,
        actor: 'alex@example.com',
        details: DETAILS,
      });
      assert.equal(listEnergyBills(house.db)[0]?.energyPence, 15_000);
    } finally {
      house.close();
    }
  });
});

describe('recording a bill', () => {
  it('keeps the household’s own figures exactly as printed', async () => {
    const house = await fixture();
    try {
      const { purchase } = energyPurchase(house);
      const updated = editEnergyBill(house.db, {
        purchaseId: purchase.id,
        expectedVersion: purchase.version,
        actor: 'alex@example.com',
        details: DETAILS,
      });
      assert.equal(updated.version, purchase.version + 1, 'the purchase owns the version');
      const stored = getEnergyBill(house.db, purchase.id);
      assert.equal(stored?.gasWh, 755_230);
      assert.equal(stored?.gasReadingEnd, 138_377_730);
      assert.equal(stored?.gasEstimateWh, 21_699_000);
      assert.equal(stored?.periodStart, '2026-09-18');
    } finally {
      house.close();
    }
  });

  it('audits the change against the purchase, with before and after', async () => {
    const house = await fixture();
    try {
      const { purchase } = energyPurchase(house);
      editEnergyBill(house.db, {
        purchaseId: purchase.id,
        expectedVersion: purchase.version,
        actor: 'sam@example.com',
        details: DETAILS,
      });
      const entries = house.db
        .select()
        .from(auditEntries)
        .where(eq(auditEntries.entityId, String(purchase.id)))
        .all()
        .filter((entry) => entry.action === 'purchase.energy_details');
      assert.equal(entries.length, 1);
      assert.equal(entries[0]?.actor, 'sam@example.com');
      // The audit row keeps no "before" on a first recording (stored as JSON null).
      assert.equal(entries[0]?.before, 'null');
      assert.match(entries[0]?.summary ?? '', /gas 755\.23 kWh/);
      assert.match(entries[0]?.summary ?? '', /2026-09-18 to 2026-10-18/);
      assert.deepEqual(JSON.parse(entries[0]?.after ?? '{}').gasWh, 755_230);
    } finally {
      house.close();
    }
  });

  it('refuses a stale form rather than overwriting a newer figure', async () => {
    const house = await fixture();
    try {
      const { purchase } = energyPurchase(house);
      const first = editEnergyBill(house.db, {
        purchaseId: purchase.id,
        expectedVersion: purchase.version,
        actor: 'alex@example.com',
        details: DETAILS,
      });
      assert.throws(
        () =>
          editEnergyBill(house.db, {
            purchaseId: purchase.id,
            expectedVersion: purchase.version, // the version the stale form still holds
            actor: 'sam@example.com',
            details: { ...DETAILS, gasWh: 1 },
          }),
        VersionConflictError,
      );
      assert.equal(getEnergyBill(house.db, purchase.id)?.gasWh, 755_230);
      assert.equal(first.id, purchase.id);
    } finally {
      house.close();
    }
  });

  it('refuses energy details on a purchase with no energy line, and on a refund', async () => {
    const house = await fixture();
    try {
      const groceries = createPurchase(house.db, {
        potId: house.pots.main.id,
        totalPence: 4_000,
        paidByPersonId: null,
        occurredAt: new Date('2026-10-19T09:00:00Z'),
        occurredDate: '2026-10-19',
        note: null,
        lines: [
          {
            amountPence: 4_000,
            categoryId: house.categoryId('Groceries', 'Weekly Shop'),
            targetKind: 'household',
            targetId: null,
          },
        ],
        actor: 'alex@example.com',
      });
      assert.throws(
        () =>
          editEnergyBill(house.db, {
            purchaseId: groceries.purchase.id,
            expectedVersion: groceries.purchase.version,
            actor: 'alex@example.com',
            details: DETAILS,
          }),
        NotAnEnergyPurchaseError,
      );
    } finally {
      house.close();
    }
  });

  it('shows a voided purchase’s details but will not change them', async () => {
    const house = await fixture();
    try {
      const { purchase } = energyPurchase(house);
      const saved = editEnergyBill(house.db, {
        purchaseId: purchase.id,
        expectedVersion: purchase.version,
        actor: 'alex@example.com',
        details: DETAILS,
      });
      voidPurchase(house.db, {
        id: purchase.id,
        expectedVersion: saved.version,
        reason: 'Wrong month',
        actor: 'alex@example.com',
      });
      // The recorded figures stay visible on the row, read-only.
      const context = getEnergyRowContext(house.db);
      const props = energyRowDetails(context, { ...saved, voidedAt: new Date() }, [
        { categoryId: house.categoryId('Utilities', 'Energy'), amountPence: 15_149 },
      ]);
      assert.equal(props?.editable, false);
      assert.equal(props?.recorded, true);
      // But the domain refuses a new write.
      const current = house.db.select().from(purchases).where(eq(purchases.id, purchase.id)).get();
      assert.throws(
        () =>
          editEnergyBill(house.db, {
            purchaseId: purchase.id,
            expectedVersion: current?.version ?? 1,
            actor: 'alex@example.com',
            details: { ...DETAILS, gasWh: 1 },
          }),
        RecordVoidedError,
      );
    } finally {
      house.close();
    }
  });

  it('clears the row when both usage figures are cleared', async () => {
    const house = await fixture();
    try {
      const { purchase } = energyPurchase(house);
      const saved = editEnergyBill(house.db, {
        purchaseId: purchase.id,
        expectedVersion: purchase.version,
        actor: 'alex@example.com',
        details: DETAILS,
      });
      editEnergyBill(house.db, {
        purchaseId: purchase.id,
        expectedVersion: saved.version,
        actor: 'alex@example.com',
        details: { ...DETAILS, gasWh: null, electricWh: null },
      });
      assert.equal(getEnergyBill(house.db, purchase.id), null);
      assert.equal(listEnergyBills(house.db).length, 0);
    } finally {
      house.close();
    }
  });

  it('refuses an empty bill rather than storing a month that never happened', async () => {
    const house = await fixture();
    try {
      const { purchase } = energyPurchase(house);
      assert.throws(
        () =>
          editEnergyBill(house.db, {
            purchaseId: purchase.id,
            expectedVersion: purchase.version,
            actor: 'alex@example.com',
            details: { ...DETAILS, gasWh: null, electricWh: null },
          }),
        InvalidEnergyInputError,
      );
      assert.equal(getEnergyBill(house.db, purchase.id), null);
    } finally {
      house.close();
    }
  });

  it('prefills the next bill’s period and opening reading', async () => {
    const house = await fixture();
    try {
      const first = energyPurchase(house, { date: '2026-09-20' });
      editEnergyBill(house.db, {
        purchaseId: first.purchase.id,
        expectedVersion: first.purchase.version,
        actor: 'alex@example.com',
        details: DETAILS,
      });
      const second = energyPurchase(house, { date: '2026-10-20' });
      const context = getEnergyRowContext(house.db);
      const props = energyRowDetails(context, second.purchase, [
        { categoryId: house.categoryId('Utilities', 'Energy'), amountPence: 15_149 },
      ]);
      // The previous bill ended 18 Oct, so the next period starts 19 Oct; the
      // opening reading is the previous closing reading, and the period ends
      // the day before this purchase.
      assert.equal(props?.suggestedPeriodStart, '2026-10-19');
      assert.equal(props?.suggestedPeriodEnd, '2026-10-19');
      assert.equal(props?.suggestedGasReadingStart, 138_377_730);
    } finally {
      house.close();
    }
  });
});

describe('the Energy page’s view', () => {
  it('draws the household’s months and names the gap between them', async () => {
    const house = await fixture();
    try {
      const first = energyPurchase(house, { date: '2026-08-20' });
      editEnergyBill(house.db, {
        purchaseId: first.purchase.id,
        expectedVersion: first.purchase.version,
        actor: 'alex@example.com',
        details: {
          ...DETAILS,
          periodStart: '2026-07-18',
          periodEnd: '2026-08-18',
          gasWh: 600_000,
          gasReadingStart: 137_040_000,
          gasReadingEnd: 137_704_660,
        },
      });
      const second = energyPurchase(house, { date: '2026-10-20' });
      editEnergyBill(house.db, {
        purchaseId: second.purchase.id,
        expectedVersion: second.purchase.version,
        actor: 'alex@example.com',
        details: DETAILS,
      });

      const view = getEnergyView(house.db, '2026-10-28');
      assert.equal(view.hasBills, true);
      assert.equal(view.bills.length, 2);
      assert.equal(view.bills[0]?.purchaseId, second.purchase.id, 'newest first');
      assert.equal(view.bills[0]?.month, '2026-10');
      assert.equal(view.bills[0]?.days, 31);
      // 151.49 for 755.23 kWh + 0 electric… the effective price is per kWh bought.
      assert.ok((view.bills[0]?.effectiveMilliPencePerKwh ?? 0) > 0);
      const september = view.months.find((month) => month.month === '2026-09');
      assert.equal(september?.gasWh, null, 'no bill is a gap, not a zero bar');
      assert.equal(view.months.at(-1)?.gasWh, 755_230);
      assert.equal(view.energyCategoryLabel, 'Utilities / Energy');
    } finally {
      house.close();
    }
  });

  it('gives an annual cost per fuel only when a tariff and a usage exist', async () => {
    const house = await fixture();
    try {
      const view = getEnergyView(house.db, '2026-10-28');
      assert.equal(view.tariffs.find((card) => card.fuel === 'gas')?.annual, null);

      setEnergyTariff(
        house.db,
        'gas',
        {
          supplier: 'Octopus Energy',
          tariffName: 'Simply Fixed Oct26v12',
          unitRateMilliPencePerKwh: 4_748,
          standingChargeMilliPencePerDay: 25_902,
          fixedUntil: '2026-11-01',
          exitFeePence: 5_000,
          notes: '',
        },
        'alex@example.com',
      );
      // A tariff with no usage to apply it to still quotes nothing.
      assert.equal(getEnergyView(house.db, '2026-10-28').tariffs[0]?.annual, null);

      const first = energyPurchase(house);
      editEnergyBill(house.db, {
        purchaseId: first.purchase.id,
        expectedVersion: first.purchase.version,
        actor: 'alex@example.com',
        details: DETAILS,
      });
      const gasCard = getEnergyView(house.db, '2026-10-28').tariffs.find(
        (card) => card.fuel === 'gas',
      );
      assert.equal(gasCard?.annualBasis, 'bills');
      assert.equal(gasCard?.annualDays, 31);
      assert.ok((gasCard?.annual?.totalPence ?? 0) > 0);
      // Electricity has no tariff and no usage: no invented figure.
      const electricCard = getEnergyView(house.db, '2026-10-28').tariffs.find(
        (card) => card.fuel === 'electric',
      );
      assert.equal(electricCard?.annual, null);
      assert.equal(electricCard?.annualBasis, null);
    } finally {
      house.close();
    }
  });

  it('reports an unreadable saved tariff instead of crashing the page', async () => {
    const house = await fixture();
    try {
      house.handle.raw
        .prepare(
          'INSERT INTO settings (key, value, updated_at, updated_by, version) VALUES (?, ?, ?, ?, ?)',
        )
        .run('energy_tariff_gas', '{broken', 0, 'alex@example.com', 1);
      const view = getEnergyView(house.db, '2026-10-28');
      const gasCard = view.tariffs.find((card) => card.fuel === 'gas');
      assert.equal(gasCard?.tariff, null);
      assert.match(gasCard?.error ?? '', /tariff/i);
      // Every other part of the page still works.
      assert.equal(view.tariffs.length, 2);
    } finally {
      house.close();
    }
  });
});

describe('meter setup', () => {
  it('starts with no smart meters and gas in m³, and remembers what it is told', async () => {
    const house = await fixture();
    try {
      const initial = getEnergySetup(house.db);
      assert.equal(initial.gasSmart, false);
      assert.equal(initial.electricSmart, false);
      assert.equal(initial.gasReadingUnit, 'm3');
      assert.equal(initial.showOnPurchases, true);

      setEnergySmartMeter(house.db, 'gas', true, 'alex@example.com');
      setEnergySmartMeter(house.db, 'electric', true, 'alex@example.com');
      setEnergyGasReadingUnit(house.db, 'kwh', 'alex@example.com');
      const setup = getEnergySetup(house.db);
      assert.equal(setup.gasSmart, true);
      assert.equal(setup.electricSmart, true);
      assert.equal(setup.gasReadingUnit, 'kwh');
    } finally {
      house.close();
    }
  });

  it('audits a tariff change with the old rates kept', async () => {
    const house = await fixture();
    try {
      const first = {
        supplier: 'Octopus Energy',
        tariffName: 'Simply Fixed Oct26v12',
        unitRateMilliPencePerKwh: 4_748,
        standingChargeMilliPencePerDay: 25_902,
        fixedUntil: '2026-11-01',
        exitFeePence: 5_000,
        notes: '',
      };
      setEnergyTariff(house.db, 'gas', first, 'alex@example.com');
      setEnergyTariff(
        house.db,
        'gas',
        { ...first, tariffName: 'Simply Fixed Oct27v01', unitRateMilliPencePerKwh: 5_100 },
        'sam@example.com',
      );
      assert.equal(getEnergyTariff(house.db, 'gas')?.unitRateMilliPencePerKwh, 5_100);
      const entries = house.db
        .select()
        .from(auditEntries)
        .where(eq(auditEntries.entityId, 'energy_tariff_gas'))
        .all();
      assert.equal(entries.length, 2);
      assert.match(entries.at(-1)?.before ?? '', /4\.748|Simply Fixed Oct26v12/);
      // Clearing the card is a real, audited answer too.
      setEnergyTariff(house.db, 'gas', null, 'sam@example.com');
      assert.equal(getEnergyTariff(house.db, 'gas'), null);
    } finally {
      house.close();
    }
  });
});
