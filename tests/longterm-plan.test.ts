import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { asc, eq } from 'drizzle-orm';
import { auditEntries } from '../src/lib/db/schema';
import {
  defaultComparisonRates,
  defaultHorizonYear,
  endOfYearDate,
  formatRateInput,
  nextEntityId,
  parsePercentBp,
  statePensionStartYear,
  yearAtAge,
} from '../src/lib/longterm/plan';
import {
  buildDraftPlan,
  getOrCreateLongTermPlan,
  resetLongTermPlan,
  saveLongTermPlan,
} from '../src/lib/longterm/store';
import {
  InvalidLongTermPlanError,
  parsePlanDocument,
  parseStoredPlanDocument,
} from '../src/lib/longterm/validation';
import { VersionConflictError } from '../src/lib/records/errors';
import { createSchedule } from '../src/lib/records/schedules';
import { setMonthlyFuelPence, setWeeklyGroceriesPence } from '../src/lib/records/settings';
import { createHouseholdFixture, type HouseholdFixture } from './household';

const ACTOR = 'alex@example.com';
const TODAY = '2026-09-20';

describe('long-term plan: rates, ages and ids (LONGTERM_FORECASTING.md slice 2)', () => {
  it('parses the percentages a household types, exactly and in basis points', () => {
    assert.equal(parsePercentBp('4'), 400);
    assert.equal(parsePercentBp('2.5%'), 250);
    assert.equal(parsePercentBp(' 0.25 '), 25);
    assert.equal(parsePercentBp('0'), 0);
    assert.equal(parsePercentBp('6.00'), 600);
    assert.equal(parsePercentBp('4.567'), null, 'three decimal places is not a rate we accept');
    assert.equal(parsePercentBp('-1'), null);
    assert.equal(parsePercentBp('101'), null, 'over 100% is a typo, not an assumption');
    assert.equal(parsePercentBp(''), null);
    assert.equal(formatRateInput(600), '6.00');
    assert.equal(formatRateInput(5), '0.05');
    assert.equal(formatRateInput(0), '0.00');
  });

  it('places the ages and the default State Pension start under current law', () => {
    assert.equal(yearAtAge(1970, 62), 2032);
    assert.equal(statePensionStartYear(1970), 2037);
    assert.equal(statePensionStartYear(1977), 2044);
    assert.equal(statePensionStartYear(1978), 2046);
    assert.equal(statePensionStartYear(1980), 2048);
    assert.equal(defaultHorizonYear([1970, 1980], 2026), 2070, 'the younger person at 90');
    assert.equal(defaultHorizonYear([1970], 2026), 2060);
    assert.equal(endOfYearDate(2070), '2070-12-31');
    assert.deepEqual(defaultComparisonRates(), [400, 600, 800]);
    assert.equal(nextEntityId('pension', ['pension-1', 'pension-2']), 'pension-3');
    assert.equal(nextEntityId('investment', ['investment-2']), 'investment-1');
  });
});

describe('long-term plan: validation at the boundary', () => {
  const fixtures: HouseholdFixture[] = [];
  after(() => fixtures.forEach((fixture) => fixture.close()));

  async function draft() {
    const fixture = await createHouseholdFixture();
    fixtures.push(fixture);
    return buildDraftPlan(fixture.db, { today: TODAY });
  }

  it('accepts the seeded draft and round-trips through stored JSON', async () => {
    const document = await draft();
    const parsed = parsePlanDocument(document);
    assert.deepEqual(parseStoredPlanDocument(JSON.stringify(parsed)), parsed);
    assert.equal(parsed.comparisonRatesBp.length, 3);
  });

  it('rejects duplicate ids, an unknown owner, negative money and bad rates', async () => {
    const document = await draft();

    const duplicatePot = structuredClone(document);
    const first = duplicatePot.plan.people[0];
    assert.ok(first);
    const firstPot = first.pensionPots[0];
    assert.ok(firstPot);
    first.pensionPots.push({ ...firstPot });
    assert.throws(() => parsePlanDocument(duplicatePot), InvalidLongTermPlanError);

    const unknownOwner = structuredClone(document);
    const investment = unknownOwner.plan.investments[0];
    assert.ok(investment);
    investment.ownerPersonId = 'person-does-not-exist';
    assert.throws(() => parsePlanDocument(unknownOwner), InvalidLongTermPlanError);

    const negativeMoney = structuredClone(document);
    negativeMoney.plan.spending.monthlyPence = -1;
    assert.throws(() => parsePlanDocument(negativeMoney), InvalidLongTermPlanError);

    const wrongRates = structuredClone(document) as unknown as {
      comparisonRatesBp: number[];
    };
    wrongRates.comparisonRatesBp = [400, 600];
    assert.throws(() => parsePlanDocument(wrongRates), InvalidLongTermPlanError);

    const notJson = parseStoredPlanDocument.bind(null, '{');
    assert.throws(notJson, InvalidLongTermPlanError);
  });
});

describe('long-term plan: the draft from records and the saved row', () => {
  const fixtures: HouseholdFixture[] = [];
  after(() => fixtures.forEach((fixture) => fixture.close()));

  it('drafts people, spending, end-dated commitments, pots and the inheritance from records', async () => {
    const fixture = await createHouseholdFixture();
    fixtures.push(fixture);
    const { db, pots, vehicles, people } = fixture;
    const now = new Date('2026-09-20T12:00:00Z');
    const categoryId = fixture.categoryId('Groceries', 'Weekly Shop');

    setWeeklyGroceriesPence(db, 7000, ACTOR, now);
    setMonthlyFuelPence(db, vehicles.vehicleA.id, 6000, ACTOR, now);
    const council = createSchedule(db, {
      name: 'Council tax',
      kind: 'dd',
      frequency: 'monthly',
      dueDayOfMonth: 5,
      amountPence: 15_000,
      potId: pots.main.id,
      categoryId,
      supplierName: 'Test Council',
      activeFrom: '2026-04-01',
      actor: ACTOR,
      now,
    });
    assert.ok(council.schedule.id);
    createSchedule(db, {
      name: 'Annual insurance',
      kind: 'dd',
      frequency: 'annual',
      dueDayOfMonth: 12,
      dueMonth: 3,
      amountPence: 12_000,
      potId: pots.main.id,
      categoryId,
      supplierName: 'Test Insurer',
      activeFrom: '2026-03-01',
      actor: ACTOR,
      now,
    });
    createSchedule(db, {
      name: 'Mortgage',
      kind: 'so',
      frequency: 'monthly',
      dueDayOfMonth: 1,
      amountPence: 90_000,
      potId: pots.main.id,
      categoryId,
      activeFrom: '2026-01-01',
      activeUntil: '2026-12-31',
      actor: ACTOR,
      now,
    });
    createSchedule(db, {
      name: 'Salary',
      kind: 'receipt',
      frequency: 'monthly',
      dueDayOfMonth: 27,
      amountPence: 245_000,
      potId: pots.salary.id,
      activeFrom: '2026-01-01',
      actor: ACTOR,
      now,
    });

    const document = buildDraftPlan(db, { today: TODAY });
    const plan = document.plan;

    assert.deepEqual(
      plan.people.map((person) => person.label),
      [people.alex.label, people.sam.label],
    );
    assert.deepEqual(
      plan.people.map((person) => person.birthYear),
      [1970, 1980],
    );
    assert.equal(plan.people[0]?.statePension?.startDate, '2037-01-01');
    assert.equal(plan.people[1]?.statePension?.startDate, '2048-01-01');
    // The Salary receipt is the records' earnings evidence; unassigned, it
    // drafts onto the younger person and stops at State Pension age (a draft
    // the assumptions panel asks the household to correct).
    assert.equal(plan.people[0]?.earnings, null);
    assert.deepEqual(plan.people[1]?.earnings, {
      monthlyPence: 245_000,
      untilDate: '2047-12-31',
    });
    assert.deepEqual(
      plan.people[0]?.pensionPots.map((pot) => pot.startDate),
      ['2030-01-01', '2035-01-01'],
    );

    // Baseline: Council tax 15,000 + annual 12,000 ÷ 12 = 1,000 +
    // groceries 7,000 × 52 ÷ 12 = 30,333 + fuel 6,000. The mortgage is an
    // end-dated commitment, and the receipt is income — neither is baseline.
    assert.equal(plan.spending.monthlyPence, 15_000 + 1_000 + 30_333 + 6_000);
    assert.equal(plan.spending.otherAnnualPence, 0);
    assert.deepEqual(plan.commitments, [
      { label: 'Mortgage', monthlyPence: 90_000, endDate: '2026-12-31' },
    ]);
    assert.deepEqual(plan.windfalls, [
      { label: 'Inheritance', date: '2027-01-01', amountPence: 25_000_000 },
    ]);
    assert.deepEqual(
      plan.investments.map((investment) => investment.wrapper),
      ['isa', 'gia'],
    );
    assert.equal(plan.horizonEndDate, '2070-12-31');
    assert.equal(plan.isaShelterAnnualPence, 4_000_000);
  });

  it('creates once, saves behind the version, audits both and resets to a fresh draft', async () => {
    const fixture = await createHouseholdFixture();
    fixtures.push(fixture);
    const { db } = fixture;
    const now = new Date('2026-09-20T12:00:00Z');

    const loaded = getOrCreateLongTermPlan(db, { actor: ACTOR, today: TODAY, now });
    assert.equal(loaded.record.version, 1);
    const created = db
      .select()
      .from(auditEntries)
      .where(eq(auditEntries.entity, 'longterm_plan'))
      .orderBy(asc(auditEntries.id))
      .all();
    assert.equal(created.length, 1);
    assert.equal(created[0]?.action, 'longterm_plan.create');

    const again = getOrCreateLongTermPlan(db, { actor: ACTOR, today: TODAY, now });
    assert.equal(again.record.id, loaded.record.id, 'a read never inserts a second plan');

    const edited = structuredClone(loaded.document);
    edited.plan.inflationBp = 300;
    edited.plan.people[0]!.label = 'Alex edited';
    const saved = saveLongTermPlan(db, {
      document: edited,
      expectedVersion: loaded.record.version,
      actor: ACTOR,
      now,
    });
    assert.equal(saved.record.version, 2);
    assert.equal(
      getOrCreateLongTermPlan(db, { actor: ACTOR, today: TODAY, now }).document.plan.inflationBp,
      300,
    );

    assert.throws(
      () =>
        saveLongTermPlan(db, {
          document: edited,
          expectedVersion: 1,
          actor: ACTOR,
          now,
        }),
      VersionConflictError,
    );

    const reset = resetLongTermPlan(db, {
      expectedVersion: saved.record.version,
      actor: ACTOR,
      today: TODAY,
      now,
    });
    assert.equal(reset.record.version, 3);
    assert.equal(reset.document.plan.inflationBp, 250);
    assert.equal(reset.document.plan.people[0]?.label, 'Alex');

    const audits = db
      .select()
      .from(auditEntries)
      .where(eq(auditEntries.entity, 'longterm_plan'))
      .orderBy(asc(auditEntries.id))
      .all();
    assert.deepEqual(
      audits.map((entry) => entry.action),
      ['longterm_plan.create', 'longterm_plan.update', 'longterm_plan.reset'],
    );
    const update = audits[1];
    assert.ok(update);
    assert.ok(update.before !== null);
    assert.match(update.before, /"inflationBp":250/);
    assert.match(update.after ?? '', /"inflationBp":300/);
  });
});
