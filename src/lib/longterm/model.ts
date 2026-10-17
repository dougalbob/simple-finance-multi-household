/**
 * The long-term forecast engine (LONGTERM_FORECASTING.md §5). Pure,
 * framework-free, integer-pence arithmetic — never binary floating point on
 * money (src/lib/money.ts rule). Months are stepped from a start date to the
 * plan's horizon; results are aggregated into **calendar-year rows** because
 * the household asks "what is our income in 2030?" and "at my age 62?".
 *
 * Month order (documented so tests can pin it):
 *   1. January (or the first month): uprate the price level, state pensions
 *      and annuities from the second calendar year; move the yearly ISA
 *      shelter from the GIA. Inflation is one figure per year (§5.6): the
 *      first forecast year is exactly today's baseline spending.
 *   2. Date events in the month: windfalls land and are invested; a pension
 *      pot starting converts to an annuity or takes its 25% tax-free cash.
 *   3. Income accruals: earnings before the stop date; state pension after
 *      its start; annuity; drawdown withdrawals while the fund lasts; each
 *      investment pot grows and pays out its income share of that growth.
 *   4. Spending: inflated baseline + inflated "everything else"/12 + fixed
 *      end-dated commitments while they run (the mortgage — never inflated).
 *   5. Settlement: surplus is invested (GIA first); a shortfall draws ISA
 *      first then the GIA (ISA withdrawals are tax-free; a GIA draw realises
 *      a proportional capital gain against its cost basis). When every
 *      account is empty the remainder is the year's **shortfall** — money ran
 *      out — and is never hidden.
 *   6. Growth on pension funds (drawdown pots keep growing; annuity pots are
 *      spent). Investments already grew in step 3 — their yield depends on
 *      it — and honour the override for the three-rate comparison (§5.3).
 *   7. At the calendar year end: estimated UK tax per person (tax.ts) is
 *      charged against the GIA, then the ISA. Tax on the year's flows is
 *      therefore assessed annually and labelled estimated (§5.4).
 *
 * Honesty: every figure is arithmetic on the household's own assumptions —
 * a projection, never a bank forecast or financial advice.
 */

import { roundHalfUpDivide } from '../money';
import { UK_2026_27, type TaxRateCard } from './rates';
import { estimatePersonTax, type PersonTaxComponents } from './tax';
import type {
  ForecastResult,
  LongTermPlan,
  PersonYearIncome,
  PensionPotPlan,
  RunOptions,
  YearRow,
} from './types';

const MONTHS_PER_YEAR = 12;
const RATE_DENOMINATOR = 10_000;
const MONTHLY_RATE_DENOMINATOR = MONTHS_PER_YEAR * RATE_DENOMINATOR;
const INDEX_ONE = 1_000_000;

/** 'YYYY-MM-DD' → 'YYYY-MM' (ISO strings compare correctly). */
function monthKey(date: string): string {
  return date.slice(0, 7);
}

function yearOf(date: string): number {
  return Number(date.slice(0, 4));
}

function monthIndex0(date: string): number {
  return Number(date.slice(5, 7)) - 1;
}

/** First day of the month 'YYYY-MM'. */
function monthFirstDay(key: string): string {
  return `${key}-01`;
}

/** The next month key after 'YYYY-MM'. */
function nextMonthKey(key: string): string {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
}

/** Apply one month of an annual basis-point rate to an integer-pence value. */
function growMonthlyPence(valuePence: number, growthBp: number): number {
  return valuePence + roundHalfUpDivide(valuePence * growthBp, MONTHLY_RATE_DENOMINATOR);
}

/** Increase an amount by one year of a basis-point rate (half-up, integer). */
function uprateAnnualPence(amountPence: number, upratingBp: number): number {
  return amountPence + roundHalfUpDivide(amountPence * upratingBp, RATE_DENOMINATOR);
}

/** Today's-money value of a nominal amount at a price index (millionths). */
export function todayMoneyPence(nominalPence: number, priceIndexMillionths: number): number {
  return roundHalfUpDivide(nominalPence * INDEX_ONE, priceIndexMillionths);
}

interface InvestmentState {
  id: string;
  label: string;
  ownerPersonId: string;
  wrapper: 'isa' | 'gia';
  valuePence: number;
  basisPence: number;
  growthBp: number;
  incomeShareBp: number;
  incomeKind: 'dividends' | 'interest';
}

interface PensionPotState {
  plan: PensionPotPlan;
  takeUp: 'drawdown' | 'annuity';
  valuePence: number;
  started: boolean;
  /** Locked at conversion; escalated each January afterwards. */
  annuityAnnualPence: number;
  annuityBaseYear: number;
}

interface PersonAcc {
  personId: string;
  label: string;
  birthYear: number;
  earningsPence: number;
  statePensionPence: number;
  pensionDrawdownPence: number;
  pensionAnnuityPence: number;
  savingsInterestPence: number;
  dividendPence: number;
  capitalGainsPence: number;
}

function emptyPersonAcc(personId: string, label: string, birthYear: number): PersonAcc {
  return {
    personId,
    label,
    birthYear,
    earningsPence: 0,
    statePensionPence: 0,
    pensionDrawdownPence: 0,
    pensionAnnuityPence: 0,
    savingsInterestPence: 0,
    dividendPence: 0,
    capitalGainsPence: 0,
  };
}

export function runForecast(
  plan: LongTermPlan,
  startDate: string,
  runOptions: RunOptions = {},
  taxCard: TaxRateCard = UK_2026_27,
): ForecastResult {
  const startMonth = monthKey(startDate);
  const endMonth = monthKey(plan.horizonEndDate);
  const overrideGrowthBp = runOptions.overrideInvestmentGrowthBp;

  const investments: InvestmentState[] = plan.investments.map((inv) => ({
    id: inv.id,
    label: inv.label,
    ownerPersonId: inv.ownerPersonId,
    wrapper: inv.wrapper,
    valuePence: inv.currentPence,
    basisPence: inv.costBasisPence,
    growthBp: overrideGrowthBp ?? inv.growthBp,
    incomeShareBp: inv.incomeShareBp,
    incomeKind: inv.incomeKind,
  }));

  const pensionPots: PensionPotState[] = plan.people.flatMap((person) =>
    person.pensionPots.map((pot) => ({
      plan: pot,
      takeUp: runOptions.pensionTakeUpOverride ?? pot.takeUp,
      valuePence: pot.currentPence,
      started: false,
      annuityAnnualPence: 0,
      annuityBaseYear: 0,
    })),
  );

  /** The state pension's annual amount per person, uprated each January. */
  const statePensionAnnual = new Map<string, number>();
  for (const person of plan.people) {
    if (person.statePension) {
      statePensionAnnual.set(person.id, person.statePension.weeklyPence * 52);
    }
  }

  const giaOf = (): InvestmentState | undefined => investments.find((i) => i.wrapper === 'gia');
  const isaOf = (): InvestmentState | undefined => investments.find((i) => i.wrapper === 'isa');

  /**
   * Invest a cash inflow: GIA first (a taxable account is what we shelter),
   * else the ISA. A household with neither gets a GIA created on the spot —
   * surplus must never vanish into nowhere.
   */
  function invest(amountPence: number): void {
    if (amountPence <= 0) return;
    let target = giaOf() ?? isaOf();
    if (!target) {
      const owner = plan.people[0];
      target = {
        id: 'auto-investments',
        label: 'Investments',
        ownerPersonId: owner ? owner.id : 'unknown',
        wrapper: 'gia',
        valuePence: 0,
        basisPence: 0,
        growthBp: 0,
        incomeShareBp: 0,
        incomeKind: 'dividends',
      };
      investments.push(target);
    }
    target.valuePence += amountPence;
    if (target.wrapper === 'gia') target.basisPence += amountPence;
  }

  /**
   * Realise `amountPence` from a GIA. `recordGain` is true for a spending
   * withdrawal (a proportional capital gain is taxable); false when charging
   * the year's tax bill itself (v1 simplification: paying tax does not
   * re-crystallise gains).
   */
  function withdrawFromGia(gia: InvestmentState, amountPence: number, recordGain: boolean): void {
    const basisOut =
      gia.valuePence <= 0 ? 0 : roundHalfUpDivide(gia.basisPence * amountPence, gia.valuePence);
    const gain = Math.max(0, amountPence - basisOut);
    gia.valuePence = Math.max(0, gia.valuePence - amountPence);
    gia.basisPence = Math.max(0, gia.basisPence - basisOut);
    if (recordGain && currentYearRow) {
      const acc = currentYearRow.people.get(gia.ownerPersonId);
      if (acc) acc.capitalGainsPence += gain;
    }
  }

  let priceIndex = INDEX_ONE;
  const years: YearRow[] = [];
  let currentYearRow: {
    year: number;
    people: Map<string, PersonAcc>;
    investmentIncomePence: number;
    spendingPence: number;
    commitmentsPence: number;
    shortfallPence: number;
  } | null = null;

  function closeYearRow(): void {
    if (!currentYearRow) return;
    const peopleRows: YearRow['people'] = [];
    let totalIncomePence = 0;
    let totalTaxPence = 0;
    let capitalGainsTaxPence = 0;
    for (const person of plan.people) {
      const acc = currentYearRow.people.get(person.id);
      if (!acc) continue;
      const components: PersonTaxComponents = {
        employmentPence: acc.earningsPence,
        pensionIncomePence:
          acc.statePensionPence + acc.pensionDrawdownPence + acc.pensionAnnuityPence,
        savingsInterestPence: acc.savingsInterestPence,
        dividendPence: acc.dividendPence,
        capitalGainsPence: acc.capitalGainsPence,
      };
      const tax = estimatePersonTax(components, taxCard);
      const income: PersonYearIncome = {
        earningsPence: acc.earningsPence,
        statePensionPence: acc.statePensionPence,
        pensionDrawdownPence: acc.pensionDrawdownPence,
        pensionAnnuityPence: acc.pensionAnnuityPence,
        incomeTaxPence: tax.incomeTaxPence,
        nationalInsurancePence: tax.nationalInsurancePence,
      };
      peopleRows.push({
        personId: person.id,
        label: person.label,
        birthYear: person.birthYear,
        income,
      });
      totalIncomePence +=
        acc.earningsPence +
        acc.statePensionPence +
        acc.pensionDrawdownPence +
        acc.pensionAnnuityPence;
      totalTaxPence += tax.incomeTaxPence + tax.nationalInsurancePence;
      capitalGainsTaxPence += tax.capitalGainsTaxPence;
    }
    totalIncomePence += currentYearRow.investmentIncomePence;
    totalTaxPence += capitalGainsTaxPence;

    // Charge the year's estimated tax against the GIA, then the ISA.
    let taxDue = totalTaxPence;
    const gia = giaOf();
    if (gia && taxDue > 0) {
      const fromGia = Math.min(gia.valuePence, taxDue);
      withdrawFromGia(gia, fromGia, false);
      taxDue -= fromGia;
    }
    const isa = isaOf();
    if (isa && taxDue > 0) {
      const fromIsa = Math.min(isa.valuePence, taxDue);
      isa.valuePence -= fromIsa;
      taxDue -= fromIsa;
    }
    const isaTotal = isaOf()?.valuePence ?? 0;
    const giaTotal = giaOf()?.valuePence ?? 0;
    const pensionFundsPence = pensionPots.reduce((sum, pot) => sum + pot.valuePence, 0);
    const capitalPence = isaTotal + giaTotal + pensionFundsPence;
    const shortfallPence = currentYearRow.shortfallPence + taxDue;

    years.push({
      year: currentYearRow.year,
      priceIndexMillionths: priceIndex,
      people: peopleRows,
      investmentIncomePence: currentYearRow.investmentIncomePence,
      capitalGainsTaxPence,
      spendingPence: currentYearRow.spendingPence,
      commitmentsPence: currentYearRow.commitmentsPence,
      totalIncomePence,
      totalTaxPence,
      surplusPence:
        totalIncomePence -
        totalTaxPence -
        currentYearRow.spendingPence -
        currentYearRow.commitmentsPence,
      shortfallPence,
      isaPence: isaTotal,
      giaPence: giaTotal,
      pensionFundsPence,
      capitalPence,
    });
  }

  let month = startMonth;
  while (month <= endMonth) {
    const monthYear = Number(month.slice(0, 4));
    const isFirstMonth = month === startMonth;

    if (!currentYearRow || currentYearRow.year !== monthYear) {
      closeYearRow();
      currentYearRow = {
        year: monthYear,
        people: new Map(plan.people.map((p) => [p.id, emptyPersonAcc(p.id, p.label, p.birthYear)])),
        investmentIncomePence: 0,
        spendingPence: 0,
        commitmentsPence: 0,
        shortfallPence: 0,
      };
    }
    const row = currentYearRow;

    // 1. January year-boundary events: upratings and ISA sheltering. The
    //    price level steps here too — one best-guess inflation figure per
    //    year, so the first year is exactly today's baseline spending and
    //    each January above it is the previous year × (1 + inflation).
    if (month.endsWith('-01') && !isFirstMonth) {
      priceIndex += roundHalfUpDivide(priceIndex * plan.inflationBp, RATE_DENOMINATOR);
      for (const person of plan.people) {
        const sp = person.statePension;
        if (sp && statePensionAnnual.has(person.id) && monthYear > yearOf(sp.startDate)) {
          statePensionAnnual.set(
            person.id,
            uprateAnnualPence(statePensionAnnual.get(person.id) as number, sp.upratingBp),
          );
        }
      }
      for (const pot of pensionPots) {
        if (
          pot.takeUp === 'annuity' &&
          pot.started &&
          monthYear > pot.annuityBaseYear &&
          pot.plan.annuityEscalationBp !== 0
        ) {
          pot.annuityAnnualPence = uprateAnnualPence(
            pot.annuityAnnualPence,
            pot.plan.annuityEscalationBp,
          );
        }
      }
      if (plan.isaShelterAnnualPence > 0) {
        const gia = giaOf();
        const isa = isaOf();
        if (gia && isa && gia.valuePence > 0) {
          const move = Math.min(plan.isaShelterAnnualPence, gia.valuePence);
          const basisOut = roundHalfUpDivide(gia.basisPence * move, gia.valuePence);
          gia.valuePence -= move;
          gia.basisPence = Math.max(0, gia.basisPence - basisOut);
          isa.valuePence += move;
        }
      }
    }

    // 2. Date events: windfalls and pension pot starts in this month.
    for (const windfall of plan.windfalls) {
      if (monthKey(windfall.date) === month) invest(windfall.amountPence);
    }
    for (const pot of pensionPots) {
      if (!pot.started && monthKey(pot.plan.startDate) === month) {
        pot.started = true;
        if (pot.takeUp === 'annuity') {
          // annuityPencePer100k is pence of yearly income per £100,000 of pot
          // (£100,000 = 10,000,000p).
          pot.annuityAnnualPence = roundHalfUpDivide(
            pot.valuePence * pot.plan.annuityPencePer100k,
            10_000_000,
          );
          pot.annuityBaseYear = monthYear;
          pot.valuePence = 0;
        } else {
          // 25% pension commencement lump sum, tax-free, re-invested.
          const pcls = roundHalfUpDivide(pot.valuePence, 4);
          pot.valuePence -= pcls;
          invest(pcls);
        }
      }
    }

    // 3. Income accruals.
    let monthIncomePence = 0;
    for (const person of plan.people) {
      const acc = row.people.get(person.id) as PersonAcc;
      const earnings = person.earnings;
      if (earnings && monthKey(earnings.untilDate) >= month) {
        acc.earningsPence += earnings.monthlyPence;
        monthIncomePence += earnings.monthlyPence;
      }
      const sp = person.statePension;
      if (sp && monthKey(sp.startDate) <= month) {
        const monthly = roundHalfUpDivide(statePensionAnnual.get(person.id) as number, 12);
        acc.statePensionPence += monthly;
        monthIncomePence += monthly;
      }
    }
    for (const pot of pensionPots) {
      if (!pot.started) continue;
      const owner = plan.people.find((p) =>
        p.pensionPots.some((candidate) => candidate.id === pot.plan.id),
      );
      const acc = owner ? row.people.get(owner.id) : undefined;
      if (pot.takeUp === 'annuity') {
        const monthly = roundHalfUpDivide(pot.annuityAnnualPence, 12);
        if (acc) acc.pensionAnnuityPence += monthly;
        monthIncomePence += monthly;
      } else if (pot.valuePence > 0) {
        const monthly = Math.min(
          pot.valuePence,
          roundHalfUpDivide(pot.plan.drawdownAnnualPence, 12),
        );
        pot.valuePence -= monthly;
        if (acc) acc.pensionDrawdownPence += monthly;
        monthIncomePence += monthly;
      }
    }
    for (const inv of investments) {
      const before = inv.valuePence;
      inv.valuePence = growMonthlyPence(inv.valuePence, inv.growthBp);
      const growth = inv.valuePence - before;
      const yieldPaid = roundHalfUpDivide(growth * inv.incomeShareBp, RATE_DENOMINATOR);
      inv.valuePence -= yieldPaid;
      if (yieldPaid > 0) {
        const rowAcc = row.people.get(inv.ownerPersonId);
        if (rowAcc) {
          if (inv.incomeKind === 'dividends') rowAcc.dividendPence += yieldPaid;
          else rowAcc.savingsInterestPence += yieldPaid;
        }
        row.investmentIncomePence += yieldPaid;
        monthIncomePence += yieldPaid;
      }
    }

    // 4. Spending: inflated baseline and extras; fixed end-dated commitments.
    const monthSpending =
      roundHalfUpDivide(plan.spending.monthlyPence * priceIndex, INDEX_ONE) +
      roundHalfUpDivide(
        roundHalfUpDivide(plan.spending.otherAnnualPence, 12) * priceIndex,
        INDEX_ONE,
      );
    let monthCommitments = 0;
    for (const commitment of plan.commitments) {
      if (monthKey(commitment.endDate) >= month) monthCommitments += commitment.monthlyPence;
    }
    row.spendingPence += monthSpending;
    row.commitmentsPence += monthCommitments;

    // 5. Settlement: surplus is invested; shortfalls draw ISA then GIA.
    const net = monthIncomePence - monthSpending - monthCommitments;
    if (net >= 0) {
      invest(net);
    } else {
      let needed = -net;
      const isa = isaOf();
      if (isa && isa.valuePence > 0) {
        const fromIsa = Math.min(isa.valuePence, needed);
        isa.valuePence -= fromIsa;
        needed -= fromIsa;
      }
      const gia = giaOf();
      if (gia && needed > 0 && gia.valuePence > 0) {
        const fromGia = Math.min(gia.valuePence, needed);
        withdrawFromGia(gia, fromGia, true);
        needed -= fromGia;
      }
      if (needed > 0) row.shortfallPence += needed;
    }

    // 6. Growth on pension funds (drawdown pots keep growing; annuity pots are spent).
    for (const pot of pensionPots) {
      if (pot.started && pot.takeUp === 'annuity') continue;
      pot.valuePence = growMonthlyPence(pot.valuePence, pot.plan.growthBp);
    }

    // Price level for next month's spending is applied at the next January
    // step above (one inflation figure per year, §5.6).
    month = nextMonthKey(month);
  }
  closeYearRow();

  return {
    startDate,
    endDate: plan.horizonEndDate,
    years,
    inflationBp: plan.inflationBp,
    runOptions,
  };
}

/* ------------------------------------------------------------------ *
 * Answer queries (LONGTERM_FORECASTING.md §4): "income in 2030",
 * "income at age 62", "does the money last" — per person and household.
 * ------------------------------------------------------------------ */

export interface YearAnswer {
  row: YearRow;
  /** Household income that year, gross. */
  totalIncomePence: number;
  totalTaxPence: number;
  /** totalIncome − totalTax — what the household actually has to spend. */
  netIncomePence: number;
  spendingPence: number;
  /** netIncome − spending − commitments. */
  disposablePence: number;
  capitalPence: number;
  /** Present-day purchasing power of netIncomePence. */
  netIncomeInTodayMoneyPence: number;
  people: {
    personId: string;
    label: string;
    birthYear: number;
    age: number;
    income: PersonYearIncome;
    netIncomePence: number;
    netIncomeInTodayMoneyPence: number;
  }[];
}

export function incomeForYear(result: ForecastResult, year: number): YearAnswer | null {
  const row = result.years.find((candidate) => candidate.year === year);
  if (!row) return null;
  return buildYearAnswer(row);
}

/** "What is my projected income at age 62?" — the year that person turns `age`. */
export function incomeAtAge(
  result: ForecastResult,
  personId: string,
  age: number,
  birthYear: number,
): YearAnswer | null {
  return incomeForYear(result, birthYear + age);
}

function buildYearAnswer(row: YearRow): YearAnswer {
  const people = row.people.map((person) => {
    const gross =
      person.income.earningsPence +
      person.income.statePensionPence +
      person.income.pensionDrawdownPence +
      person.income.pensionAnnuityPence;
    const net = gross - person.income.incomeTaxPence - person.income.nationalInsurancePence;
    return {
      personId: person.personId,
      label: person.label,
      birthYear: person.birthYear,
      age: row.year - person.birthYear,
      income: person.income,
      netIncomePence: net,
      netIncomeInTodayMoneyPence: todayMoneyPence(net, row.priceIndexMillionths),
    };
  });
  return {
    row,
    totalIncomePence: row.totalIncomePence,
    totalTaxPence: row.totalTaxPence,
    netIncomePence: row.totalIncomePence - row.totalTaxPence,
    spendingPence: row.spendingPence + row.commitmentsPence,
    disposablePence: row.surplusPence,
    capitalPence: row.capitalPence,
    netIncomeInTodayMoneyPence: todayMoneyPence(
      row.totalIncomePence - row.totalTaxPence,
      row.priceIndexMillionths,
    ),
    people,
  };
}

/**
 * The sustainability headline (§4): the last year capital covers everything,
 * or the first year with unmet spending — whichever the plan reaches. Capital
 * landing on exactly £0 at a year end is a year that *was* covered.
 */
export function moneyLastsTo(result: ForecastResult): {
  lastsToYear: number | null;
  runsOutInYear: number | null;
} {
  const exhausted = result.years.find((row) => row.shortfallPence > 0);
  if (exhausted) {
    return { lastsToYear: exhausted.year - 1, runsOutInYear: exhausted.year };
  }
  const last = result.years[result.years.length - 1];
  return { lastsToYear: last ? last.year : null, runsOutInYear: null };
}

/** End-of-year capital per year for the three-rate comparison chart (§5.3). */
export function capitalTrajectory(
  result: ForecastResult,
): { year: number; capitalPence: number }[] {
  return result.years.map((row) => ({ year: row.year, capitalPence: row.capitalPence }));
}
