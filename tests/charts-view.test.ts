import { changeSpendingPreset, getSpendingPresets } from '../src/lib/records/spending-presets';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createHouseholdFixture, type HouseholdFixture } from './household';
import {
  createPurchase,
  createRefund,
  listPurchases,
  voidPurchase,
} from '../src/lib/records/purchases';
import { createTransfer } from '../src/lib/records/transfers';
import { createSchedule } from '../src/lib/records/schedules';
import { addCheckpoint } from '../src/lib/records/pots';
import {
  PERSONAL_PARENTS,
  chartSpendingLines,
  effectiveCommitmentCategoryIds,
  getCommitmentCategoryPicker,
  getCommitmentChartView,
  getSpendingTrendsView,
  getCategoryMonthsView,
  getForecastChartView,
  getGroceriesChartView,
  getPersonalChartView,
  scheduleCommitmentCategoryIds,
} from '../src/lib/records/charts-view';
import { getMonthComparisonView } from '../src/lib/records/insights-view';
import { getHorizonProjectionView } from '../src/lib/records/money-view';
import {
  InvalidSettingValueError,
  setCommitmentCategoryIds,
  setWeeklyGroceriesPence,
} from '../src/lib/records/settings';
import { addDaysLocal, addMonthsClamped } from '../src/lib/records/dates';
import { firstOfLocalMonth, personalSpending, startOfWeekLocal } from '../src/lib/records/insights';
import { categories } from '../src/lib/db/schema';
import type { Db } from '../src/lib/db/client';

/**
 * Charts (SPEC §16.7, v0.14.0) reconciled with the purchase history. Same
 * contract as tests/insights-view.test.ts: every figure a chart draws is
 * cross-checked against an INDEPENDENT sum over listPurchases — the rows the
 * review page shows — so a chart that disagrees with the history it claims
 * to summarise cannot ship. Transfers, voids and refunds are asserted too.
 */

const NOW = new Date('2026-09-20T17:00:00Z');
const TODAY = '2026-09-20'; // a Sunday
const ACTOR = 'alex@example.com';

function parentNames(db: Db): Map<number, string> {
  const all = db.select().from(categories).all();
  const byId = new Map(all.map((row) => [row.id, row]));
  const parentOf = new Map<number, string>();
  for (const row of all) {
    if (row.parentId === null) continue;
    const parent = byId.get(row.parentId);
    if (parent !== undefined) parentOf.set(row.id, parent.name);
  }
  return parentOf;
}

/** Independent line-level sum straight from the review rows. */
function lineTotalPence(
  db: Db,
  from: string,
  to: string,
  keep: (line: {
    categoryId: number;
    amountPence: number;
    targetKind: string;
    targetId: number | null;
  }) => boolean,
): number {
  return listPurchases(db, { dateFrom: from, dateTo: to })
    .flatMap((row) => row.allocations)
    .filter((line) => keep(line))
    .reduce((sum, line) => sum + line.amountPence, 0);
}

function seedHistory(fixture: HouseholdFixture) {
  const { db, pots, people, vehicles } = fixture;
  const weeklyShop = fixture.categoryId('Groceries', 'Weekly Shop');
  const topUp = fixture.categoryId('Groceries', 'Top-up Shops');
  const clothing = fixture.categoryId('Personal', 'Clothing & Shoes');
  const hobbies = fixture.categoryId('Personal', 'Hobbies');
  const dining = fixture.categoryId('Entertainment & Eating Out', 'Dining Out & Takeaways');
  const subscriptions = fixture.categoryId(
    'Entertainment & Eating Out',
    'Subscriptions & Streaming',
  );
  const fuel = fixture.categoryId('Vehicle Running', 'Fuel');
  const energy = fixture.categoryId('Utilities', 'Energy');

  const buy = (
    occurredDate: string,
    amountPence: number,
    categoryId: number,
    target: { kind: 'household' | 'person' | 'vehicle'; id?: number } = { kind: 'household' },
  ) =>
    createPurchase(db, {
      potId: pots.main.id,
      totalPence: amountPence,
      paidByPersonId: people.alex.id,
      occurredDate,
      lines: [
        {
          amountPence,
          categoryId,
          targetKind: target.kind,
          ...(target.id === undefined ? {} : { targetId: target.id }),
        },
      ],
      actor: ACTOR,
      now: NOW,
    });

  // Groceries: five weeks back, with one week deliberately EMPTY (the week
  // of 31 Aug) — a week with no shop is a zero week, not a missing one.
  buy('2026-08-25', 8200, weeklyShop); // week of Mon 24 Aug
  buy('2026-08-27', 1150, topUp); // same week
  // (no groceries at all in the week of Mon 31 Aug)
  buy('2026-09-08', 9100, weeklyShop); // week of Mon 7 Sep
  buy('2026-09-15', 8800, weeklyShop); // week of Mon 14 Sep — in progress
  const returned = buy('2026-09-16', 1200, weeklyShop);
  createRefund(db, {
    refundOfPurchaseId: returned.purchase.id,
    totalPence: -1200,
    lines: [{ amountPence: -1200, categoryId: weeklyShop, targetKind: 'household' }],
    actor: ACTOR,
    now: NOW,
  });

  // Personal spending, "For: person", across three calendar months.
  buy('2026-07-12', 4500, clothing, { kind: 'person', id: people.alex.id });
  buy('2026-08-03', 2600, hobbies, { kind: 'person', id: people.alex.id });
  buy('2026-08-19', 3150, clothing, { kind: 'person', id: people.sam.id });
  buy('2026-09-06', 1975, hobbies, { kind: 'person', id: people.sam.id });
  // …plus Sam's top-up grouped under Groceries (the split-bill case from
  // issue #25): marked for them, so the personal chart counts it wherever
  // it sits. Dated in the week of Mon 10 Aug, which no grocery assertion
  // hard-codes, inside the trailing-8 average window.
  buy('2026-08-10', 1240, topUp, { kind: 'person', id: people.sam.id });
  // Shared, and never split between the two.
  buy('2026-09-07', 4200, dining);
  buy('2026-09-09', 1499, subscriptions);
  // Out of scope for the personal chart: a vehicle line and a fuel line.
  buy('2026-09-10', 6000, fuel, { kind: 'vehicle', id: vehicles.vehicleA.id });
  // A hand-typed energy bill: tracked only once the household ticks Energy,
  // and never "schedule-converted".
  buy('2026-08-04', 7400, energy);
  buy('2026-09-04', 7100, energy);

  // A voided purchase must not reach any chart.
  const mistake = buy('2026-09-05', 99999, weeklyShop);
  voidPurchase(db, {
    id: mistake.purchase.id,
    expectedVersion: mistake.purchase.version,
    reason: 'Typed twice',
    actor: ACTOR,
    now: NOW,
  });

  // A transfer between the household's own pots must not reach any chart.
  createTransfer(db, {
    fromPotId: pots.salary.id,
    toPotId: pots.main.id,
    amountPence: 40000,
    occurredDate: '2026-09-19',
    actor: ACTOR,
    now: NOW,
  });

  // A backdated direct debit: the lazy due pass converts the instances that
  // have already fallen due into purchases carrying scheduleInstanceId.
  createSchedule(db, {
    name: 'Fibre broadband',
    kind: 'dd',
    frequency: 'monthly',
    dueDayOfMonth: 12,
    amountPence: 3499,
    potId: pots.main.id,
    categoryId: fixture.categoryId('Utilities', 'Broadband'),
    supplierName: 'Fibre Provider',
    activeFrom: '2026-06-01',
    actor: ACTOR,
    now: NOW,
  });
  // A fresh checkpoint so the forecast has an honest starting point.
  addCheckpoint(db, { potId: pots.main.id, amountPence: 180000, actor: ACTOR, now: NOW });
}

describe('charts-view: reconciliation with the purchase history', () => {
  let fixture: HouseholdFixture;
  before(async () => {
    fixture = await createHouseholdFixture(ACTOR, NOW);
    seedHistory(fixture);
  });
  after(() => fixture.close());
  const db = () => fixture.db;

  /* ---------------- A. Forecast ---------------- */

  it('the forecast starts at the reported balance and ends one month out', () => {
    const view = getForecastChartView(db(), NOW);
    const horizon = getHorizonProjectionView(db(), addMonthsClamped(TODAY, 1), [], true, NOW);
    assert.equal(view.today, TODAY);
    assert.equal(view.throughDate, '2026-10-20');
    assert.equal(view.series.startPence, horizon.availableNowPence);
    assert.equal(view.series.days[0]?.reported, true);
    assert.equal(view.series.days.length, horizon.result.perDay.length + 1);
    // Every projected point is the projection's own running balance.
    for (const [index, day] of horizon.result.perDay.entries()) {
      const point = view.series.days[index + 1];
      assert.equal(point?.date, day.date);
      assert.equal(point?.runningPence, day.runningPence);
      assert.equal(point?.reported, false);
    }
    assert.equal(view.series.endPence, horizon.result.perDay.at(-1)?.runningPence);
    assert.equal(view.unavailable, false);
  });

  it('the forecast names the overdraft room it draws', () => {
    const view = getForecastChartView(db(), NOW);
    // The fixture gives the main account an £800 limit; the cash pots none.
    assert.deepEqual(view.overdraftPots, [{ label: 'Main account', limitPence: 80000 }]);
    assert.equal(view.overdraftLabel, 'Main account overdraft limit');
    assert.equal(view.series.overdraftLimitPence, 80000);
  });

  it('the forecast low point agrees with the day-by-day figures it was taken from', () => {
    const view = getForecastChartView(db(), NOW);
    const low = Math.min(...view.series.days.map((day) => day.runningPence));
    assert.equal(view.series.lowPence, low);
    const first = view.series.days.find((day) => day.runningPence === low);
    assert.equal(view.series.lowDate, first?.date);
    assert.match(view.series.headline, /Lowest projected point/);
  });

  /* ---------------- B. Groceries ---------------- */

  it('every grocery week matches an independent sum over the review rows', () => {
    setWeeklyGroceriesPence(db(), 8500, ACTOR, NOW);
    const view = getGroceriesChartView(db(), {}, NOW);
    const parents = parentNames(db());
    assert.equal(view.phone.weeks.length, 12);
    assert.equal(view.laptop.weeks.length, 26);
    for (const week of view.laptop.weeks) {
      const independent = lineTotalPence(
        db(),
        week.weekStart,
        week.weekEnd,
        (line) => parents.get(line.categoryId) === 'Groceries',
      );
      assert.equal(week.amountPence, independent, week.weekStart);
    }
    assert.equal(view.configuredWeeklyPence, 8500);
  });

  it('a week with no shop is a zero week, and the refund nets off its own week', () => {
    const view = getGroceriesChartView(db(), {}, NOW);
    const week = (weekStart: string) =>
      view.laptop.weeks.find((entry) => entry.weekStart === weekStart);
    assert.equal(week('2026-08-24')?.amountPence, 8200 + 1150);
    assert.equal(week('2026-08-31')?.amountPence, 0);
    assert.equal(week('2026-08-31')?.complete, true);
    assert.equal(week('2026-09-07')?.amountPence, 9100);
    // 8800 recorded, 1200 returned: the till shows both, the week shows one.
    assert.equal(week('2026-09-14')?.amountPence, 8800 + 1200 - 1200);
    assert.equal(week('2026-09-14')?.complete, false);
  });

  it('the grocery average covers complete weeks only and ignores the voided entry', () => {
    const view = getGroceriesChartView(db(), {}, NOW);
    const complete = view.laptop.weeks.filter((week) => week.complete).slice(-8);
    const expected = Math.round(
      complete.reduce((sum, week) => sum + week.amountPence, 0) / complete.length,
    );
    assert.equal(view.laptop.averagePence, expected);
    assert.equal(view.laptop.averageWeeks, 8);
    // £999.99 was voided; nothing in the window can be that large.
    assert.equal(
      view.laptop.weeks.every((week) => week.amountPence < 99999),
      true,
    );
  });

  /* ---------------- C. Personal spending ---------------- */

  it('personal totals match independent "For: person" sums, household kept apart', () => {
    const view = getPersonalChartView(db(), {}, NOW);
    const parents = parentNames(db());
    const inScope = (categoryId: number) =>
      PERSONAL_PARENTS.includes(
        (parents.get(categoryId) ?? '') as (typeof PERSONAL_PARENTS)[number],
      );
    const windowFrom = addMonthsClamped(firstOfLocalMonth(TODAY), -11);
    for (const total of view.laptop.totals) {
      // A person's total is every line marked for them, whatever its parent
      // (issue #25); only the household total keeps the parent scope.
      const independent =
        total.key === 'household'
          ? lineTotalPence(
              db(),
              windowFrom,
              TODAY,
              (line) => inScope(line.categoryId) && line.targetKind === 'household',
            )
          : lineTotalPence(
              db(),
              windowFrom,
              TODAY,
              (line) =>
                line.targetKind === 'person' &&
                line.targetId === Number(total.key.slice('person:'.length)),
            );
      assert.equal(total.amountPence, independent, total.key);
    }
    const { alex, sam } = fixture.people;
    assert.equal(
      view.laptop.totals.find((total) => total.key === `person:${alex.id}`)?.amountPence,
      4500 + 2600,
    );
    // Sam's Groceries top-up counts: marked for them, wherever it sits.
    assert.equal(
      view.laptop.totals.find((total) => total.key === `person:${sam.id}`)?.amountPence,
      3150 + 1975 + 1240,
    );
    // Dining out + the shared subscription, whole, attributed to nobody.
    assert.equal(
      view.laptop.totals.find((total) => total.key === 'household')?.amountPence,
      4200 + 1499,
    );
  });

  it("a person's September cell matches the Insights month panel behind it (issue #25)", () => {
    const view = getPersonalChartView(db(), {}, NOW);
    const september = view.laptop.months.find((month) => month.label === 'September 2026');
    const { alex, sam } = fixture.people;
    // Panel 2's own rule, run over the same lines the chart read.
    const spends = personalSpending(
      chartSpendingLines(db(), '2026-09-01', '2026-09-30'),
      [
        { id: alex.id, label: 'Alex' },
        { id: sam.id, label: 'Sam' },
      ],
      '2026-09-01',
      '2026-09-30',
    );
    for (const spend of spends) {
      const cell = september?.cells.find((entry) => entry.key === `person:${spend.personId}`);
      assert.equal(cell?.amountPence, spend.totalPence, spend.person);
    }
  });

  it('the personal chart excludes vehicle lines but counts grocery lines marked for a person', () => {
    const view = getPersonalChartView(db(), {}, NOW);
    assert.deepEqual(
      view.people.map((person) => person.label),
      ['Alex', 'Sam'],
    );
    const drawn = view.laptop.totals.reduce((sum, total) => sum + total.amountPence, 0);
    assert.equal(drawn, 4500 + 2600 + 3150 + 1975 + 1240 + 4200 + 1499);
    // The £60 vehicle fuel line reaches no month; the voided £999.99 neither.
    assert.equal(
      view.laptop.months.every((month) => month.totalPence < 60000),
      true,
    );
  });

  it('the chips narrow the chart, its months and its headline together', () => {
    const { sam } = fixture.people;
    const view = getPersonalChartView(db(), { include: [`person:${sam.id}`] }, NOW);
    assert.deepEqual(
      view.laptop.series.map((ref) => ref.label),
      ['Sam'],
    );
    assert.equal(
      view.laptop.totals.reduce((sum, total) => sum + total.amountPence, 0),
      3150 + 1975 + 1240,
    );
    // …and the full cast is still offered as chips.
    assert.equal(view.people.length, 2);
  });

  it('the September month bucket matches the review rows for that month', () => {
    const view = getPersonalChartView(db(), {}, NOW);
    const september = view.laptop.months.find((month) => month.label === 'September 2026');
    const parents = parentNames(db());
    // Person lines everywhere, household lines under the discretionary
    // parents — the engine's rule, restated against the review rows.
    const independent = lineTotalPence(
      db(),
      '2026-09-01',
      '2026-09-30',
      (line) =>
        (line.targetKind === 'person' && line.targetId !== null) ||
        (line.targetKind === 'household' &&
          PERSONAL_PARENTS.includes(
            (parents.get(line.categoryId) ?? '') as (typeof PERSONAL_PARENTS)[number],
          )),
    );
    assert.equal(september?.totalPence, independent);
    assert.equal(september?.complete, false);
  });

  /* ---------------- D. Fixed commitments ---------------- */

  it('tracks the schedule categories until the household says otherwise', () => {
    const fromSchedules = scheduleCommitmentCategoryIds(db());
    assert.deepEqual(fromSchedules, [fixture.categoryId('Utilities', 'Broadband')]);
    const tracking = effectiveCommitmentCategoryIds(db());
    assert.equal(tracking.source, 'schedules');
    assert.deepEqual(tracking.categoryIds, fromSchedules);

    const view = getCommitmentChartView(db(), {}, NOW);
    assert.equal(view.tracking.source, 'schedules');
    assert.deepEqual(
      view.trackedCategories.map((entry) => `${entry.parent} / ${entry.child}`),
      ['Utilities / Broadband'],
    );
    // Four monthly instances have fallen due: 12 June to 12 September.
    const converted = view.series.months.reduce((sum, month) => sum + month.amountPence, 0);
    assert.equal(converted, 3499 * 4);
  });

  it('every commitment month matches an independent sum, with and without the toggle', () => {
    const energy = fixture.categoryId('Utilities', 'Energy');
    const broadband = fixture.categoryId('Utilities', 'Broadband');
    setCommitmentCategoryIds(db(), [energy, broadband], ACTOR, NOW);

    const view = getCommitmentChartView(db(), {}, NOW);
    assert.equal(view.tracking.source, 'configured');
    for (const month of view.series.months) {
      const independent = lineTotalPence(
        db(),
        month.from,
        month.to,
        (line) => line.categoryId === energy || line.categoryId === broadband,
      );
      assert.equal(month.amountPence, independent, month.label);
    }
    assert.equal(
      view.series.months.find((month) => month.label === 'August 2026')?.amountPence,
      7400 + 3499,
    );

    const onlySchedules = getCommitmentChartView(db(), { scheduleOnly: true }, NOW);
    for (const month of onlySchedules.series.months) {
      const independent = listPurchases(db(), {
        dateFrom: month.from,
        dateTo: month.to,
        scheduleOnly: true,
      })
        .flatMap((row) => row.allocations)
        .filter((line) => line.categoryId === energy || line.categoryId === broadband)
        .reduce((sum, line) => sum + line.amountPence, 0);
      assert.equal(month.amountPence, independent, month.label);
    }
    // The hand-typed energy bills drop out; the converted direct debit stays.
    assert.equal(
      onlySchedules.series.months.find((month) => month.label === 'August 2026')?.amountPence,
      3499,
    );
  });

  it('Spending trends uses the selected preset and reconciles every month with purchase lines', () => {
    const energy = fixture.categoryId('Utilities', 'Energy');
    const broadband = fixture.categoryId('Utilities', 'Broadband');
    const presetId = changeSpendingPreset(db(), {
      operation: 'save',
      id: '',
      name: 'Bills',
      categoryIds: [energy, broadband],
      version: getSpendingPresets(db()).version,
      actor: ACTOR,
      now: NOW,
    });
    const view = getSpendingTrendsView(db(), presetId, NOW);
    assert.equal(view.selectedPreset?.name, 'Bills');
    assert.equal(view.scheduleOnly, false);
    for (const month of view.series.months) {
      assert.equal(
        month.amountPence,
        lineTotalPence(db(), month.from, month.to, (line) =>
          [energy, broadband].includes(line.categoryId),
        ),
        month.label,
      );
    }
    assert.equal(
      view.series.months.find((month) => month.label === 'August 2026')?.amountPence,
      7400 + 3499,
    );
    assert.equal(
      getSpendingTrendsView(db(), 'missing-id', NOW).selectedPreset?.id,
      'fixed-commitments',
    );
    const emptyId = changeSpendingPreset(db(), {
      operation: 'save',
      id: '',
      name: 'Empty',
      categoryIds: [],
      version: getSpendingPresets(db()).version,
      actor: ACTOR,
    });
    assert.ok(
      getSpendingTrendsView(db(), emptyId, NOW).series.months.every(
        (month) => month.amountPence === 0,
      ),
    );
  });

  it('an explicitly empty set means none tracked, not "fall back to schedules"', () => {
    setCommitmentCategoryIds(db(), [], ACTOR, NOW);
    const tracking = effectiveCommitmentCategoryIds(db());
    assert.equal(tracking.source, 'configured');
    assert.deepEqual(tracking.categoryIds, []);
    const view = getCommitmentChartView(db(), {}, NOW);
    assert.equal(
      view.series.months.every((month) => month.amountPence === 0),
      true,
    );
    assert.match(view.series.headline, /No categories are tracked/);
  });

  it('refuses a category that is not a live child of the tree', () => {
    const parent = db()
      .select()
      .from(categories)
      .all()
      .find((row) => row.parentId === null);
    assert.notEqual(parent, undefined);
    assert.throws(
      () => setCommitmentCategoryIds(db(), [parent?.id ?? 0], ACTOR, NOW),
      InvalidSettingValueError,
    );
    assert.throws(
      () => setCommitmentCategoryIds(db(), [999999], ACTOR, NOW),
      InvalidSettingValueError,
    );
  });

  it('the Settings picker offers every child, grouped, with the schedule ones flagged', () => {
    const broadband = fixture.categoryId('Utilities', 'Broadband');
    setCommitmentCategoryIds(db(), [broadband], ACTOR, NOW);
    const picker = getCommitmentCategoryPicker(db());
    assert.equal(picker.source, 'configured');
    assert.equal(picker.tickedCount, 1);
    const utilities = picker.groups.find((group) => group.parent === 'Utilities');
    const choice = utilities?.children.find((child) => child.id === broadband);
    assert.equal(choice?.ticked, true);
    assert.equal(choice?.usedBySchedule, true);
    // Groups carry their parent, and no parent is offered as a choice.
    const everyChildId = new Set(
      picker.groups.flatMap((group) => group.children.map((child) => child.id)),
    );
    assert.equal(everyChildId.has(utilities?.parentId ?? -1), false);
    assert.equal(picker.groups.length > 1, true);
  });

  /* ---------------- The shared query ---------------- */

  it('the shared line query skips voided purchases and transfers entirely', () => {
    const lines = chartSpendingLines(db(), '2026-06-01', TODAY);
    assert.equal(
      lines.some((line) => line.amountPence === 99999),
      false,
      'the voided purchase leaked in',
    );
    assert.equal(
      lines.some((line) => line.amountPence === 40000),
      false,
      'the transfer leaked in',
    );
    const independent = listPurchases(db(), { dateFrom: '2026-06-01', dateTo: TODAY }).flatMap(
      (row) => row.allocations,
    );
    assert.equal(lines.length, independent.length);
    assert.equal(
      lines.reduce((sum, line) => sum + line.amountPence, 0),
      independent.reduce((sum, line) => sum + line.amountPence, 0),
    );
    // Parent names are joined in for every line, and the converted direct
    // debits are the only ones flagged.
    assert.equal(
      lines.every((line) => line.parentName.length > 0 && line.childName.length > 0),
      true,
    );
    assert.equal(lines.filter((line) => line.scheduleConverted).length, 4);
  });

  it('draws a window that ends today, never tomorrow', () => {
    const groceries = getGroceriesChartView(db(), {}, NOW);
    const lastWeek = groceries.laptop.weeks.at(-1);
    assert.equal(lastWeek?.weekStart, startOfWeekLocal(TODAY));
    assert.equal(lastWeek?.weekEnd, addDaysLocal(startOfWeekLocal(TODAY), 6));
    const personal = getPersonalChartView(db(), {}, NOW);
    assert.equal(personal.laptop.months.at(-1)?.label, 'September 2026');
    const commitments = getCommitmentChartView(db(), {}, NOW);
    assert.equal(commitments.series.months.at(-1)?.label, 'September 2026');
  });
});

describe('charts-view: three months by category (§16.7 F)', () => {
  it('draws exactly the Insights month comparison, oldest first', async () => {
    const fixture = await createHouseholdFixture();
    try {
      const { db, pots, people } = fixture;
      const council = fixture.categoryId('Housing', 'Council Tax');
      const groceries = fixture.categoryId('Groceries', 'Weekly Shop');
      const buy = (occurredDate: string, amountPence: number, categoryId: number) =>
        createPurchase(db, {
          potId: pots.main.id,
          totalPence: amountPence,
          paidByPersonId: people.alex.id,
          occurredDate,
          lines: [{ amountPence, categoryId, targetKind: 'household' }],
          actor: ACTOR,
          now: NOW,
        });
      buy('2026-07-10', 4000, groceries); // the oldest month
      buy('2026-08-01', 100000, council); // housing, August
      buy('2026-08-05', 5000, groceries);
      buy('2026-09-10', 7000, groceries);

      const view = getCategoryMonthsView(db, {}, NOW);
      assert.deepEqual(
        view.months.map((month) => month.label),
        ['July 2026', 'August 2026', 'September 2026 (so far)'],
      );
      assert.equal(view.months[2]?.complete, false);
      assert.equal(view.months[2]?.to, TODAY, 'the in-progress month never runs past today');

      // The same arithmetic as the tables on /insights — one source, two views.
      const comparison = getMonthComparisonView(db, NOW);
      for (const row of comparison.byParent) {
        const category = view.categories.find((entry) => entry.name === row.parent);
        assert.deepEqual(category?.amountsPence, row.amountsPence, row.parent);
      }
      assert.equal(
        view.totalPence,
        comparison.months.reduce((sum, m) => sum + m.summary.totalPence, 0),
      );

      // Largest first: Housing (100000) leads the drawing.
      assert.equal(view.categories[0]?.name, 'Housing');
      assert.ok(view.categories[0] !== undefined && view.categories[0].parentId > 0);
    } finally {
      fixture.close();
    }
  });

  it('the exclude toggle takes out Housing alone, and nothing else', async () => {
    const fixture = await createHouseholdFixture();
    try {
      const { db, pots, people } = fixture;
      const council = fixture.categoryId('Housing', 'Council Tax');
      const groceries = fixture.categoryId('Groceries', 'Weekly Shop');
      const buy = (occurredDate: string, amountPence: number, categoryId: number) =>
        createPurchase(db, {
          potId: pots.main.id,
          totalPence: amountPence,
          paidByPersonId: people.alex.id,
          occurredDate,
          lines: [{ amountPence, categoryId, targetKind: 'household' }],
          actor: ACTOR,
          now: NOW,
        });
      buy('2026-08-01', 100000, council);
      buy('2026-08-05', 5000, groceries);
      buy('2026-09-10', 7000, groceries);

      const withHousing = getCategoryMonthsView(db, {}, NOW);
      const withoutHousing = getCategoryMonthsView(db, { excludeHeavy: true }, NOW);
      assert.equal(withHousing.heavyParentId, withHousing.categories[0]?.parentId);
      assert.ok(withHousing.categories.some((entry) => entry.name === 'Housing'));
      assert.equal(withHousing.excludeHeavy, false);
      assert.equal(withoutHousing.excludeHeavy, true);
      assert.ok(!withoutHousing.categories.some((entry) => entry.name === 'Housing'));
      assert.ok(withoutHousing.categories.some((entry) => entry.name === 'Groceries'));
      assert.equal(withoutHousing.totalPence, 5000 + 7000);
    } finally {
      fixture.close();
    }
  });
});
