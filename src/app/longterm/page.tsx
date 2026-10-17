import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LongTermAssumptionsForm } from '@/components/longterm-forms';
import { householdContextFromRequest } from '@/lib/auth/next';
import { guideSection } from '@/lib/guide';
import { incomeForYear, todayMoneyPence, type YearAnswer } from '@/lib/longterm/model';
import {
  comparisonIndexFromParam,
  comparisonKey,
  formatRateLabel,
  yearAtAge,
  youngerBirthYear,
  type ComparisonIndex,
} from '@/lib/longterm/plan';
import { RATE_CARD_YEAR } from '@/lib/longterm/rates';
import { getOrCreateLongTermPlan } from '@/lib/longterm/store';
import type { LongTermPlan } from '@/lib/longterm/types';
import {
  pensionComparisons,
  planWarnings,
  runComparison,
  sustainabilityOf,
  yearTableRows,
  type ComparisonRun,
  type PensionComparison,
} from '@/lib/longterm/view';
import { formatPence } from '@/lib/money';
import { formatInstantLocal, toLocalDateString } from '@/lib/time';

export const dynamic = 'force-dynamic';

interface LongTermSearchParams {
  year?: string;
  rate?: string;
  person?: string;
  age?: string;
}

function parseInteger(value: string | undefined, min: number, max: number): number | null {
  if (value === undefined || !/^\d{1,4}$/.test(value)) return null;
  const number = Number(value);
  return number >= min && number <= max ? number : null;
}

/**
 * The Long-term forecast (LONGTERM_FORECASTING.md slice 2): the household's
 * three questions answered in its own words — "income in 2030", "income at my
 * age 62", and whether the money lasts — over the saved plan of assumptions.
 *
 * Layer order is the grill's (Q6: income questions first, capital run-out
 * beneath): the two income cards, the sustainability headline, the selected
 * year line by line, the three-rate comparison, the drawdown-versus-annuity
 * comparison, then every calendar year and finally the editable assumptions.
 * Every tax figure says **estimated**; every screen ends with the same
 * honesty line the payday projection carries.
 */
export default async function LongTermPage({
  searchParams,
}: {
  searchParams: Promise<LongTermSearchParams>;
}) {
  const user = await householdContextFromRequest();
  if (user === null) redirect('/unauthorized');

  const now = new Date();
  const today = toLocalDateString(now);
  const db = user.db;
  const { record, document } = getOrCreateLongTermPlan(db, {
    actor: user.email,
    today,
    now,
  });
  const plan: LongTermPlan = document.plan;
  const params = await searchParams;

  const currentYear = Number(today.slice(0, 4));
  const endYear = Number(plan.horizonEndDate.slice(0, 4));
  const yearInRange = (year: number | null): year is number =>
    year !== null && Number.isFinite(year) && year >= currentYear && year <= endYear;

  // The household's own example — "what is income in 2030?" — is the default
  // question while the plan reaches it; otherwise the forecast's first year.
  const requestedYear = parseInteger(params.year, currentYear, endYear);
  const year = yearInRange(requestedYear) ? requestedYear : yearInRange(2030) ? 2030 : currentYear;
  const rateIndex = comparisonIndexFromParam(params.rate);

  const firstPerson = plan.people[0];
  if (firstPerson === undefined) {
    // Validation keeps at least one person on a saved plan, so this only
    // guards the impossible; Settings is where a household creates people.
    redirect('/settings');
  }
  const person = plan.people.find((candidate) => candidate.id === params.person) ?? firstPerson;
  const requestedAge = parseInteger(params.age, 0, 120);
  const age = requestedAge ?? 62;
  const ageYear = yearAtAge(person.birthYear, age);

  const runs = runComparison(document, today);
  const primary = runs[rateIndex] as ComparisonRun;
  const answer = incomeForYear(primary.result, year);
  const ageAnswer = yearInRange(ageYear) ? incomeForYear(primary.result, ageYear) : null;
  const warnings = planWarnings(document);
  const table = yearTableRows(primary.result);
  const sustainability = sustainabilityOf(primary.result);
  const youngerBirthYearValue = youngerBirthYear(plan);
  const youngerLabel =
    youngerBirthYearValue === null
      ? null
      : (plan.people.find((candidate) => candidate.birthYear === youngerBirthYearValue)?.label ??
        null);
  const comparisons = pensionComparisons(document, today);
  const startYear = primary.result.years[0]?.year ?? currentYear;

  // Every link keeps the other question's parameters, so changing the rate
  // never moves the year the household is reading, and vice versa.
  const href = (overrides: {
    year?: number;
    rate?: ComparisonIndex;
    person?: string;
    age?: number;
  }): string => {
    const query = new URLSearchParams();
    query.set('year', String(overrides.year ?? year));
    query.set('rate', comparisonKey(overrides.rate ?? rateIndex));
    query.set('person', overrides.person ?? person.id);
    query.set('age', String(overrides.age ?? age));
    return `/longterm?${query.toString()}`;
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
      <header className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          Long-term forecast
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Your money across the years</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-soft">
          What income you might have, what spending might cost, and whether the capital lasts — a
          projection of the assumptions below, never a bank forecast or financial advice. Every fund
          value, rate and amount is yours to change; dates are shown as an age and a year.
        </p>
      </header>

      {warnings.length > 0 ? (
        <section
          aria-labelledby="longterm-warnings-heading"
          className="mb-5 rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm text-warning"
        >
          <h2 id="longterm-warnings-heading" className="text-sm font-semibold">
            Before you read the figures
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {warnings.map((warning) => (
              <li key={warning.kind}>{warning.message}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs">
            <a href="#assumptions" className="sf-link">
              Go to the assumptions
            </a>{' '}
            — each flag clears as soon as its figure is filled in.
          </p>
        </section>
      ) : null}

      <section
        aria-labelledby="longterm-questions-heading"
        className="mb-5 rounded-xl border border-border bg-surface p-4 shadow-sm"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="longterm-questions-heading" className="text-lg font-semibold">
            Ask a year, or an age
          </h2>
          <span className="text-xs text-ink-muted">
            shown at the {primary.label.toLowerCase()} rate · {formatRateLabel(primary.rateBp)}
          </span>
        </div>
        <form method="GET" action="/longterm" className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="rate" value={comparisonKey(rateIndex)} />
          <div className="flex flex-col gap-1">
            <label htmlFor="longterm-year" className="text-xs font-medium text-ink-soft">
              Income in the year
            </label>
            <input
              id="longterm-year"
              name="year"
              type="number"
              min={startYear}
              max={endYear}
              defaultValue={year}
              className="w-28 rounded border border-border-strong bg-surface px-2.5 py-1.5 text-sm focus:border-border-emphasis focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="longterm-person" className="text-xs font-medium text-ink-soft">
              Whose age
            </label>
            <select
              id="longterm-person"
              name="person"
              defaultValue={person.id}
              className="rounded border border-border-strong bg-surface px-2.5 py-1.5 text-sm focus:border-border-emphasis focus:outline-none"
            >
              {plan.people.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="longterm-age" className="text-xs font-medium text-ink-soft">
              turns age
            </label>
            <input
              id="longterm-age"
              name="age"
              type="number"
              min={0}
              max={120}
              defaultValue={age}
              className="w-24 rounded border border-border-strong bg-surface px-2.5 py-1.5 text-sm focus:border-border-emphasis focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="rounded bg-till px-3 py-1.5 text-sm font-medium text-till-ink"
          >
            Show
          </button>
        </form>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <YearCard
          title={`Income in ${year}`}
          answer={answer}
          year={year}
          note={
            year === ageYear ? `This is also the year ${person.label} turns ${age}.` : undefined
          }
        />
        <YearCard
          title={
            yearInRange(ageYear) ? `Income at age ${age} — ${ageYear}` : `Age ${age} — ${ageYear}`
          }
          answer={ageAnswer}
          year={ageYear}
          missing={
            yearInRange(ageYear)
              ? undefined
              : `${ageYear} is outside this forecast (${startYear}–${endYear}). Change the age, the birth year or the end date.`
          }
          note={
            yearInRange(ageYear) && ageYear !== year ? (
              <Link href={href({ year: ageYear })} className="sf-link">
                See {ageYear} line by line
              </Link>
            ) : undefined
          }
        />
        <section
          aria-labelledby="longterm-lasts-heading"
          className="rounded-xl border border-border bg-surface p-4 shadow-sm"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
            Does the money last?
          </p>
          <h2 id="longterm-lasts-heading" className="mt-2 text-xl font-semibold leading-snug">
            {sustainability.runsOutInYear !== null
              ? `The money runs out during ${sustainability.runsOutInYear}`
              : sustainability.coversWholeForecast
                ? `It covers every year to ${sustainability.endYear}`
                : `It covers every year from ${sustainability.firstCoveredAfterGapYear} to ${sustainability.endYear}`}
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            {sustainability.runsOutInYear !== null
              ? `${
                  youngerBirthYearValue === null
                    ? 'The first year spending cannot be met after the last covered year.'
                    : `${youngerLabel ?? 'The younger person'} would be ${
                        sustainability.runsOutInYear - youngerBirthYearValue
                      }.`
                } At the ${primary.label.toLowerCase()} rate (${formatRateLabel(primary.rateBp)}).`
              : sustainability.coversWholeForecast
                ? `That is the end of this forecast${
                    youngerBirthYearValue === null
                      ? ''
                      : ` — ${youngerLabel ?? 'the younger person'} at age ${
                          sustainability.endYear - youngerBirthYearValue
                        }`
                  }. It says nothing about years beyond it.`
                : `Spending is not fully covered in ${sustainability.gapYears.join(
                    ', ',
                  )}. From ${sustainability.firstCoveredAfterGapYear} the plan covers every year to ${
                    sustainability.endYear
                  }, at the ${primary.label.toLowerCase()} rate (${formatRateLabel(primary.rateBp)}).`}
          </p>
          <ul className="mt-3 space-y-1 border-t border-border-hairline pt-2 text-xs">
            {runs.map((run) => {
              const outcome = sustainabilityOf(run.result);
              return (
                <li key={run.key} className="flex items-baseline justify-between gap-2">
                  <Link
                    href={href({ rate: run.index })}
                    scroll={false}
                    className={run.index === rateIndex ? 'font-semibold' : 'sf-link'}
                  >
                    {run.label} {formatRateLabel(run.rateBp)}
                  </Link>
                  <span className="text-right text-ink-soft">
                    {outcome.runsOutInYear !== null
                      ? `runs out ${outcome.runsOutInYear}`
                      : outcome.coversWholeForecast
                        ? `covers to ${outcome.endYear}`
                        : `covers from ${outcome.firstCoveredAfterGapYear}`}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[11px] text-ink-muted">
            The rate applies to the investment accounts; pension pots grow at their own rates.
          </p>
        </section>
      </div>

      {answer ? (
        <YearDetail answer={answer} year={year} partYears={statePensionPartYears(plan, year)} />
      ) : (
        <p className="mt-6 rounded-xl border border-dashed border-border-strong bg-surface p-4 text-sm text-ink-soft">
          {year} is outside the forecast. Choose a year between {startYear} and {endYear}.
        </p>
      )}

      <RateComparison
        runs={runs}
        selectedIndex={rateIndex}
        year={year}
        hrefForRate={(index) => href({ rate: index })}
        endYear={sustainability.endYear}
      />

      <PensionComparisonSection comparisons={comparisons} />

      <YearTable
        rows={table}
        selectedYear={year}
        hrefForYear={(value) => `${href({ year: value })}#year-detail`}
      />

      <section id="assumptions" className="sf-anchor mt-8">
        <LongTermAssumptionsForm
          initialDocument={document}
          version={record.version}
          readOnly={user.readOnly}
          today={today}
          defaultOpen={warnings.length > 0}
          lastSavedLabel={formatInstantLocal(record.updatedAt)}
        />
      </section>

      <footer className="mt-8 border-t border-border-hairline pt-4 text-xs text-ink-muted">
        <p>
          A projection of the assumptions above — arithmetic, not a bank forecast, not financial
          advice, and not a promise. Tax figures are <span className="font-medium">estimated</span>{' '}
          with the {RATE_CARD_YEAR} rate card; future tax law, inflation and investment returns will
          all differ. A real annuity quote comes from a provider and depends on your health and the
          rates at the time.
        </p>
        <p className="mt-2">
          How this app thinks:{' '}
          <Link href="/guide#longterm" className="sf-link">
            {guideSection('longterm').title}
          </Link>
          .
        </p>
      </footer>
    </main>
  );
}

function moneyOrDash(pence: number): string {
  return pence === 0 ? '—' : formatPence(pence);
}

function YearCard({
  title,
  answer,
  year,
  note,
  missing,
}: {
  title: string;
  answer: YearAnswer | null;
  year: number;
  note?: ReactNode;
  missing?: string;
}) {
  return (
    <section
      aria-label={title}
      className="rounded-xl border border-border bg-surface p-4 shadow-sm"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">{title}</p>
      {answer === null ? (
        <p className="mt-2 text-sm text-ink-soft">
          {missing ?? `There is no row for ${year} in this forecast.`}
        </p>
      ) : (
        <>
          <p className="mt-1 text-2xl font-semibold tabular-nums sm:text-3xl">
            {formatPence(answer.netIncomePence)}
            <span className="ml-1 text-sm font-normal text-ink-soft">a year</span>
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            about {formatPence(answer.netIncomeInTodayMoneyPence)} in today&apos;s money — after{' '}
            <span className="font-medium">{formatPence(answer.totalTaxPence)} estimated tax</span>{' '}
            on {formatPence(answer.totalIncomePence)} gross.
          </p>
          <dl className="mt-3 space-y-1 border-t border-border-hairline pt-2 text-xs">
            {answer.people.map((entry) => (
              <div key={entry.personId} className="flex items-baseline justify-between gap-2">
                <dt>
                  {entry.label} · age {entry.age}
                </dt>
                <dd className="tabular-nums text-right">{formatPence(entry.netIncomePence)}</dd>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-2">
              <dt>Spending</dt>
              <dd className="tabular-nums text-right">{formatPence(answer.spendingPence)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt>Capital at year end</dt>
              <dd className="tabular-nums text-right">{formatPence(answer.capitalPence)}</dd>
            </div>
          </dl>
          {note === undefined ? null : <p className="mt-2 text-xs text-ink-muted">{note}</p>}
        </>
      )}
    </section>
  );
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * People whose State Pension starts part-way through `year`: the year's
 * figure is then only the months from the start date, and must say so.
 */
function statePensionPartYears(
  plan: LongTermPlan,
  year: number,
): { label: string; startMonthName: string; months: number }[] {
  const out: { label: string; startMonthName: string; months: number }[] = [];
  for (const person of plan.people) {
    const start = person.statePension?.startDate;
    if (!start) continue;
    const startYear = Number(start.slice(0, 4));
    const startMonth = Number(start.slice(5, 7));
    if (startYear !== year || startMonth <= 1) continue;
    out.push({
      label: person.label,
      startMonthName: MONTH_NAMES[startMonth - 1] ?? '',
      months: 13 - startMonth,
    });
  }
  return out;
}

function YearDetail({
  answer,
  year,
  partYears,
}: {
  answer: YearAnswer;
  year: number;
  partYears: { label: string; startMonthName: string; months: number }[];
}) {
  const row = answer.row;
  const incomeTax = answer.people.reduce(
    (sum, entry) => sum + entry.income.incomeTaxPence + entry.income.nationalInsurancePence,
    0,
  );
  return (
    <section
      id="year-detail"
      aria-labelledby="longterm-year-detail-heading"
      className="sf-anchor mt-6 rounded-xl border border-border bg-surface p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="longterm-year-detail-heading" className="text-lg font-semibold">
          {year}, line by line
        </h2>
        <span className="text-xs text-ink-muted">
          {answer.people.map((entry) => `${entry.label} ${entry.age}`).join(' · ')} · future money
          and today&apos;s money
        </span>
      </div>

      {partYears.map((part) => (
        <p
          key={part.label}
          className="mt-2 rounded border border-border-hairline bg-surface-muted p-2 text-xs text-ink-soft"
        >
          <span className="font-medium">{part.label}&apos;s State Pension</span> starts in{' '}
          {part.startMonthName} {year}, so {year} is a part-year: {part.months} of 12 months, shown
          as {part.months}/12 of the annual figure. The first full year is {year + 1}.
        </p>
      ))}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <caption className="sr-only">
            Income by person and source in {year}, with estimated tax
          </caption>
          <thead className="bg-surface-muted text-left text-[11px] uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-2 py-1.5 font-medium">Person</th>
              <th className="px-2 py-1.5 text-right font-medium">Earnings</th>
              <th className="px-2 py-1.5 text-right font-medium">State pension</th>
              <th className="px-2 py-1.5 text-right font-medium">Pension drawdown</th>
              <th className="px-2 py-1.5 text-right font-medium">Annuity</th>
              <th className="px-2 py-1.5 text-right font-medium">Income tax (est.)</th>
              <th className="px-2 py-1.5 text-right font-medium">NI (est.)</th>
              <th className="px-2 py-1.5 text-right font-medium">Net</th>
            </tr>
          </thead>
          <tbody>
            {answer.people.map((entry) => (
              <tr key={entry.personId} className="border-t border-border-hairline">
                <th scope="row" className="px-2 py-1.5 text-left font-medium">
                  {entry.label}
                </th>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {moneyOrDash(entry.income.earningsPence)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {moneyOrDash(entry.income.statePensionPence)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {moneyOrDash(entry.income.pensionDrawdownPence)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {moneyOrDash(entry.income.pensionAnnuityPence)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {moneyOrDash(entry.income.incomeTaxPence)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {moneyOrDash(entry.income.nationalInsurancePence)}
                </td>
                <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                  {formatPence(entry.netIncomePence)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <dl className="space-y-1 text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <dt>Investment income (taxable part)</dt>
            <dd className="tabular-nums">{moneyOrDash(row.investmentIncomePence)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt>Estimated income tax and NI</dt>
            <dd className="tabular-nums">{formatPence(incomeTax)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt>Estimated capital gains tax</dt>
            <dd className="tabular-nums">{moneyOrDash(row.capitalGainsTaxPence)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-2 border-t border-border-hairline pt-1 font-medium">
            <dt>Income after estimated tax</dt>
            <dd className="tabular-nums">{formatPence(answer.netIncomePence)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-ink-soft">of which, in today&apos;s money</dt>
            <dd className="tabular-nums text-ink-soft">
              {formatPence(answer.netIncomeInTodayMoneyPence)}
            </dd>
          </div>
        </dl>
        <dl className="space-y-1 text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <dt>Spending baseline (day-to-day and recurring)</dt>
            <dd className="tabular-nums">{formatPence(row.spendingPence)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt>End-dated commitments (the mortgage, while it runs)</dt>
            <dd className="tabular-nums">{moneyOrDash(row.commitmentsPence)}</dd>
          </div>
          <div
            className={`flex items-baseline justify-between gap-2 border-t border-border-hairline pt-1 font-medium ${
              answer.disposablePence < 0 ? 'text-danger' : ''
            }`}
          >
            <dt>{answer.disposablePence < 0 ? 'Shortfall' : 'Surplus'}</dt>
            <dd className="tabular-nums">{formatPence(answer.disposablePence)}</dd>
          </div>
          {row.shortfallPence > 0 ? (
            <div className="flex items-baseline justify-between gap-2 text-danger">
              <dt>Unmet spending — nothing left to draw on</dt>
              <dd className="tabular-nums">{formatPence(row.shortfallPence)}</dd>
            </div>
          ) : null}
          <div className="flex items-baseline justify-between gap-2 border-t border-border-hairline pt-1">
            <dt>
              Capital at year end — ISA {formatPence(row.isaPence)} · GIA{' '}
              {formatPence(row.giaPence)} · pensions {formatPence(row.pensionFundsPence)}
            </dt>
            <dd className="tabular-nums font-medium">{formatPence(row.capitalPence)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-ink-soft">capital in today&apos;s money</dt>
            <dd className="tabular-nums text-ink-soft">
              {formatPence(todayMoneyPence(row.capitalPence, row.priceIndexMillionths))}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function RateComparison({
  runs,
  selectedIndex,
  year,
  endYear,
  hrefForRate,
}: {
  runs: ComparisonRun[];
  selectedIndex: ComparisonIndex;
  year: number;
  endYear: number;
  hrefForRate: (index: ComparisonIndex) => string;
}) {
  return (
    <section
      aria-labelledby="longterm-rates-heading"
      className="mt-6 rounded-xl border border-border bg-surface p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="longterm-rates-heading" className="text-lg font-semibold">
          Three return assumptions, side by side
        </h2>
        <span className="text-xs text-ink-muted">net of charges, as the household chose</span>
      </div>
      <p className="mt-1 max-w-3xl text-sm text-ink-soft">
        The same plan at each rate. A single smooth line is the most flattering lie a forecast can
        tell, so these three are always shown together — and the rate below applies to the
        investment accounts only.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-surface-muted text-left text-[11px] uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-2 py-1.5 font-medium">Rate</th>
              <th className="px-2 py-1.5 font-medium">Money lasts</th>
              <th className="px-2 py-1.5 text-right font-medium">Net income in {year}</th>
              <th className="px-2 py-1.5 text-right font-medium">Capital end of {year}</th>
              <th className="px-2 py-1.5 text-right font-medium">Capital end of {endYear}</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => {
              const outcome = sustainabilityOf(run.result);
              const yearAnswer = incomeForYear(run.result, year);
              const last = run.result.years[run.result.years.length - 1];
              const selected = run.index === selectedIndex;
              return (
                <tr
                  key={run.key}
                  className={`border-t border-border-hairline ${selected ? 'bg-surface-muted' : ''}`}
                >
                  <th scope="row" className="px-2 py-1.5 text-left font-medium">
                    <Link href={hrefForRate(run.index)} scroll={false} className="sf-link">
                      {run.label} {formatRateLabel(run.rateBp)}
                    </Link>
                    {selected ? <span className="ml-1 text-xs text-ink-muted">(shown)</span> : null}
                  </th>
                  <td
                    className={`px-2 py-1.5 ${
                      outcome.runsOutInYear !== null
                        ? 'text-danger'
                        : outcome.coversWholeForecast
                          ? ''
                          : 'text-warning'
                    }`}
                  >
                    {outcome.runsOutInYear !== null
                      ? `runs out ${outcome.runsOutInYear}`
                      : outcome.coversWholeForecast
                        ? `covers to ${outcome.endYear}`
                        : `covers from ${outcome.firstCoveredAfterGapYear}`}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {yearAnswer === null ? '—' : formatPence(yearAnswer.netIncomePence)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {yearAnswer === null ? '—' : formatPence(yearAnswer.capitalPence)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {last === undefined ? '—' : formatPence(last.capitalPence)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PensionComparisonSection({ comparisons }: { comparisons: PensionComparison[] }) {
  return (
    <section
      aria-labelledby="longterm-pensions-heading"
      className="mt-6 rounded-xl border border-border bg-surface p-4 shadow-sm"
    >
      <h2 id="longterm-pensions-heading" className="text-lg font-semibold">
        Drawdown or annuity — the same pot, two routes
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-ink-soft">
        The tool compares the arithmetic and never recommends. Flexible drawdown keeps the fund
        invested and at risk; an annuity buys a guaranteed income for life with it. A real quote
        belongs to a provider and your adviser.
      </p>
      {comparisons.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">
          No pension pots are on the plan yet — add one in the assumptions to compare the routes.
        </p>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {comparisons.map((comparison) => (
            <article
              key={comparison.potId}
              aria-labelledby={`longterm-pot-${comparison.potId}`}
              className="rounded-lg border border-border-hairline p-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 id={`longterm-pot-${comparison.potId}`} className="font-semibold">
                  {comparison.potLabel}
                  <span className="ml-1 text-xs font-normal text-ink-muted">
                    {comparison.ownerLabel}
                  </span>
                </h3>
                <span className="text-xs text-ink-muted">
                  {comparison.startYear} · age {comparison.startAge}
                </span>
              </div>
              <p className="mt-1 text-sm">
                Projected pot at start{' '}
                <span className="font-medium tabular-nums">
                  {formatPence(comparison.projectedPotPence)}
                </span>
              </p>
              {comparison.projectedPotPence === 0 ? (
                <p className="mt-2 text-xs text-ink-muted">
                  Enter this pot&apos;s current value in the assumptions to compare the routes.
                </p>
              ) : null}
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div
                  className={`rounded border p-2 ${
                    comparison.takeUp === 'drawdown'
                      ? 'border-accent-200 bg-accent-50'
                      : 'border-border-hairline'
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    Flexible drawdown
                  </p>
                  <p className="mt-1 text-sm">
                    {formatPence(comparison.drawdown.taxFreeCashPence)} tax-free cash, re-invested
                    by this forecast.
                  </p>
                  <p className="mt-1 text-sm font-medium tabular-nums">
                    {formatPence(comparison.drawdown.taxableAnnualPence)} a year
                  </p>
                  <p className="text-xs text-ink-muted">
                    taxable, from the {formatPence(comparison.drawdown.fundAfterCashPence)}{' '}
                    remaining fund — which keeps growing and can run out.
                  </p>
                </div>
                <div
                  className={`rounded border p-2 ${
                    comparison.takeUp === 'annuity'
                      ? 'border-accent-200 bg-accent-50'
                      : 'border-border-hairline'
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    Indicative annuity
                  </p>
                  <p className="mt-1 text-sm font-medium tabular-nums">
                    {formatPence(comparison.annuity.annualPence)} a year
                  </p>
                  <p className="text-xs text-ink-muted">
                    guaranteed for life,{' '}
                    {comparison.annuity.escalationBp === 0
                      ? 'level (no yearly rise)'
                      : `rising ${formatRateLabel(comparison.annuity.escalationBp)} a year`}{' '}
                    — from the rate you entered. This is arithmetic, not a quote.
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function YearTable({
  rows,
  selectedYear,
  hrefForYear,
}: {
  rows: ReturnType<typeof yearTableRows>;
  selectedYear: number;
  hrefForYear: (year: number) => string;
}) {
  return (
    <section
      aria-labelledby="longterm-table-heading"
      className="mt-6 rounded-xl border border-border bg-surface p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="longterm-table-heading" className="text-lg font-semibold">
          Every calendar year
        </h2>
        <span className="text-xs text-ink-muted">
          {rows[0]?.year ?? '—'}–{rows[rows.length - 1]?.year ?? '—'} · click a year for its detail
        </span>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        Future money is that year&apos;s prices; today&apos;s money deflates it back at the
        inflation assumption. Estimated tax is labelled wherever it appears.
      </p>
      <div className="mt-3 max-h-[32rem] overflow-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="sticky top-0 bg-surface-muted text-left text-[11px] uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-2 py-1.5 font-medium">Year</th>
              <th className="px-2 py-1.5 text-right font-medium">Income (gross)</th>
              <th className="px-2 py-1.5 text-right font-medium">Tax (est.)</th>
              <th className="px-2 py-1.5 text-right font-medium">Spending</th>
              <th className="px-2 py-1.5 text-right font-medium">Surplus / shortfall</th>
              <th className="px-2 py-1.5 text-right font-medium">Capital at year end</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const selected = row.year === selectedYear;
              return (
                <tr
                  key={row.year}
                  className={`border-t border-border-hairline ${
                    selected ? 'bg-surface-muted' : ''
                  }`}
                >
                  <th scope="row" className="whitespace-nowrap px-2 py-1.5 text-left font-medium">
                    <Link href={hrefForYear(row.year)} className="sf-link">
                      {row.year}
                    </Link>
                    <span className="ml-1 text-xs font-normal text-ink-muted">
                      {row.ages.map((age) => `${age.label} ${age.age}`).join(' · ')}
                    </span>
                    {row.ranOut ? (
                      <span className="ml-1 text-xs font-semibold text-danger">ran out</span>
                    ) : row.unmet ? (
                      <span className="ml-1 text-xs font-semibold text-warning">unmet</span>
                    ) : null}
                  </th>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {formatPence(row.incomePence)}
                    <span className="block text-[11px] text-ink-muted">
                      {formatPence(row.incomeTodayPence)} today
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {formatPence(row.taxPence)}
                    <span className="block text-[11px] text-ink-muted">
                      {formatPence(row.taxTodayPence)} today
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {formatPence(row.spendingPence)}
                    <span className="block text-[11px] text-ink-muted">
                      {formatPence(row.spendingTodayPence)} today
                    </span>
                  </td>
                  <td
                    className={`px-2 py-1.5 text-right tabular-nums ${
                      row.surplusPence < 0 ? 'text-danger' : ''
                    }`}
                  >
                    {formatPence(row.surplusPence)}
                    <span className="block text-[11px] text-ink-muted">
                      {formatPence(row.surplusTodayPence)} today
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {formatPence(row.capitalPence)}
                    <span className="block text-[11px] text-ink-muted">
                      {formatPence(row.capitalTodayPence)} today
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        Figures are rounded to the penny and aggregated by calendar year; a pension starting in a
        year shows that whole year at the start date&apos;s place in the month.
      </p>
    </section>
  );
}
