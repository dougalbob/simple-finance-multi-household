/**
 * Long-term forecast model types (LONGTERM_FORECASTING.md §5, §9).
 *
 * The long-term forecast is deliberately not Horizon: Horizon is penny-exact
 * liquidity over recorded reality to 400 days; this is a multi-decade scenario
 * of **assumptions the household chooses** — pension pots, investments,
 * windfalls, inflation, and estimated UK tax — answered per calendar year and
 * per age. Every amount is integer pence (src/lib/money.ts rule: no binary
 * floating point on money); every rate is integer basis points (400 = 4.00%).
 *
 * Project-wide by construction (the household's correction, §11A): a person is
 * a list of optional streams — earnings with a stop date, pension pots, state
 * pension — and nothing assumes anyone is working or retired. Pot values,
 * rates and amounts are user-editable variables and are never baked in.
 */

/** Integer basis points: 400 = 4.00% per year. */
export type BasisPoints = number;

/**
 * One person's streams. All streams optional: the model must render a
 * household where both people work exactly as well as one where neither does.
 */
export interface LongTermPerson {
  id: string;
  label: string;
  /** Calendar year of birth (1970). The tool shows dates as age AND year. */
  birthYear: number;
  /** Gross employment income; `untilDate` is when the person stops working. */
  earnings: { monthlyPence: number; untilDate: string } | null;
  /**
   * State pension. `weeklyPence` is the household's forecast (full rate is
   * today's rate (the full new State Pension is the labelled default).
   * `upratingBp` is the annual rise (the form default is a fixed 3.50%, §5.6),
   * applied every January after today, from the first one onwards.
   */
  statePension: {
    weeklyPence: number;
    startDate: string;
    upratingBp: BasisPoints;
  } | null;
  pensionPots: PensionPotPlan[];
}

/**
 * A defined-contribution pension pot (§5.1 — settled: both of this household's
 * pensions are pots). Until `startDate` the pot simply grows at `growthBp`.
 * On `startDate` one of two shapes begins (§5.2):
 *
 * - **drawdown**: 25% tax-free cash is realised and re-invested into the
 *   household's general investment account; `drawdownAnnualPence` (gross,
 *   taxable) is then withdrawn from the remaining fund each year while it
 *   lasts. The fund keeps growing.
 * - **annuity**: the whole fund converts to a guaranteed income of
 *   `annuityPencePer100k` per year per £100,000 of pot value at the start
 *   date — a rate the household enters; the tool compares arithmetic and
 *   never recommends. `annuityEscalationBp` (0 = level) raises it yearly.
 */
export interface PensionPotPlan {
  id: string;
  label: string;
  currentPence: number;
  growthBp: BasisPoints;
  startDate: string;
  takeUp: 'drawdown' | 'annuity';
  /** Gross annual annuity income per £100,000 of pot at conversion. */
  annuityPencePer100k: number;
  annuityEscalationBp: BasisPoints;
  /** Gross annual drawdown withdrawal once drawdown starts. */
  drawdownAnnualPence: number;
}

/**
 * An invested holding outside the pensions. `wrapper` decides the tax (§5.2):
 * ISA — nothing taxed; GIA — `incomeShareBp` of each year's growth arrives as
 * taxable income (dividends/interest) and withdrawals realise capital gains
 * against `costBasisPence`.
 */
export interface InvestmentPlan {
  id: string;
  label: string;
  /** Whose tax affairs the returns fall into (a GIA/ISA is one person's). */
  ownerPersonId: string;
  wrapper: 'isa' | 'gia';
  currentPence: number;
  /** Acquisition cost of the units held (for CGT on GIA withdrawals). */
  costBasisPence: number;
  growthBp: BasisPoints;
  /** Share of growth paid out yearly as taxable income (the rest accrues as gains). */
  incomeShareBp: BasisPoints;
  /** How that yearly income is taxed: fund distributions vs deposit interest. */
  incomeKind: 'dividends' | 'interest';
}

/** One-off money landing on a date and becoming invested capital (the inheritance). */
export interface WindfallPlan {
  label: string;
  date: string;
  amountPence: number;
}

/** Recurring and day-to-day spending, inflated at the plan's inflation rate. */
export interface SpendingPlan {
  /** Direct debits/standing orders + groceries + fuel, per month (baseline). */
  monthlyPence: number;
  /** "Everything else" — holidays, house, car (§5.6). £0 is allowed but flagged. */
  otherAnnualPence: number;
}

/**
 * A fixed-amount commitment with an end date (the mortgage): charged at its
 * nominal amount until `endDate` inclusive, never inflated, then gone.
 * Other households keep mortgages for years — this is a general mechanism.
 */
export interface CommitmentPlan {
  label: string;
  monthlyPence: number;
  endDate: string;
}

export interface LongTermPlan {
  people: LongTermPerson[];
  investments: InvestmentPlan[];
  windfalls: WindfallPlan[];
  spending: SpendingPlan;
  commitments: CommitmentPlan[];
  /** Single best-guess annual inflation rate on spending (250 = 2.5%). */
  inflationBp: BasisPoints;
  /** Moved from the first GIA into ISAs each January, up to this amount. */
  isaShelterAnnualPence: number;
  /** Final date the forecast runs to (default: the younger person's 90th year). */
  horizonEndDate: string;
}

/** Overrides for comparison runs (§5.3 three-rate comparison; §5.2 take-up comparison). */
export interface RunOptions {
  /** Replaces every investment pot's growth rate for this run. */
  overrideInvestmentGrowthBp?: BasisPoints;
  /** Forces every pension pot's take-up shape for this run. */
  pensionTakeUpOverride?: 'drawdown' | 'annuity';
}

/** One person's income by source for one calendar year (gross, pence). */
export interface PersonYearIncome {
  earningsPence: number;
  statePensionPence: number;
  pensionDrawdownPence: number;
  pensionAnnuityPence: number;
  incomeTaxPence: number;
  nationalInsurancePence: number;
}

export interface YearRow {
  /** Calendar year (2030). */
  year: number;
  /** Inflation index active during this year, millionths (1,000,000 = today's money). */
  priceIndexMillionths: number;
  people: { personId: string; label: string; birthYear: number; income: PersonYearIncome }[];
  /** Investment yield paid out to the household (already inside the tax calc). */
  investmentIncomePence: number;
  capitalGainsTaxPence: number;
  spendingPence: number;
  commitmentsPence: number;
  /** Gross income that year, household (all sources incl. investment income). */
  totalIncomePence: number;
  /** income tax + NI + CGT for the household, estimated. */
  totalTaxPence: number;
  /** totalIncome − totalTax − spending − commitments. */
  surplusPence: number;
  /** Unmet spending once every pot is empty (money ran out this year). */
  shortfallPence: number;
  isaPence: number;
  giaPence: number;
  pensionFundsPence: number;
  /** isa + gia + pensionFunds. */
  capitalPence: number;
}

export interface ForecastResult {
  startDate: string;
  endDate: string;
  years: YearRow[];
  /** The run's assumptions echoed for the honesty line and answer cards. */
  inflationBp: BasisPoints;
  runOptions: RunOptions;
}
