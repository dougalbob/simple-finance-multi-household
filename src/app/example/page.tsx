import { redirect } from 'next/navigation';
import { Fragment } from 'react';
import { householdContextFromRequest } from '@/lib/auth/next';
import { seedDemoHousehold } from '@/lib/demo/household';
import {
  getMoneySnapshot,
  getProjectionView,
  getHorizonProjectionView,
  landPenceOf,
  nextScheduledIncomeDate,
} from '@/lib/records/money-view';
import {
  getForecastChartView,
  getGroceriesChartView,
  getPersonalChartView,
  getCommitmentChartView,
  getSpendingMixView,
} from '@/lib/records/charts-view';
import {
  getMonthComparisonView,
  getPersonalMonthView,
  getVehicleCostsView,
  getHonestyLoopView,
} from '@/lib/records/insights-view';
import { getPageNeeds } from '@/lib/records/page-needs';
import { listPots } from '@/lib/records/pots';
import { toLocalDateString, formatShortLocalDate } from '@/lib/time';
import { formatPence } from '@/lib/money';
import { QuickEntry } from '@/components/quick-entry';
import { buildEntryData } from '@/lib/records/entry-view';
import { PaydaySummary } from '@/components/payday-summary';
import { NeedsFirst } from '@/components/needs-first';
import { GettingStartedCard } from '@/components/getting-started';
import { getSetupPath, getSetupFormData } from '@/lib/records/setup-path';
import { addDaysLocal } from '@/lib/records/dates';

/**
 * The worked example (ONBOARDING_PLAN.md §4, Slice 3):
 * "A household that has been using this for two months" — rendered from
 * the app's real engines and components against an in-memory database
 * seeded with fictional data. It never touches a household's real database
 * and writes nowhere.
 *
 * The page shows:
 * - Home: live projection, till mid-purchase, payday summary
 * - Forecast chart (Charts A)
 * - Groceries chart (Charts B)
 * - Personal spending chart (Charts C)
 * - Fixed commitments chart (Charts D)
 * - Spending mix pie (Charts E)
 * - Insights: month comparison, personal spending, vehicle costs, honesty loop
 * - Horizon: the full projection with day-by-day breakdown
 *
 * Every section is captioned with the records that produced it and links
 * to the real page it will become. The fictional household is the same
 * one the E2E harness seeds (Alex, Sam, two bank accounts, two cash pots,
 * fictional suppliers and amounts).
 */
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Worked example' };

export default async function ExamplePage() {
  const user = await householdContextFromRequest();
  if (user === null) redirect('/unauthorized');

  const now = new Date();
  const todayIso = toLocalDateString(now);

  // Seed the fictional household into an in-memory database
  const { dbHandle, now: seedNow } = seedDemoHousehold(':memory:', now);
  const db = dbHandle.db;

  // Run the same lazy due pass every read page does
  const { ensureScheduleState } = await import('@/lib/records/money-view');
  ensureScheduleState(db, seedNow);

  // Build all the views the real pages use
  const money = getMoneySnapshot(db, seedNow);
  const projection = getProjectionView(db, seedNow);
  const entryData = buildEntryData(db, seedNow, 'alex@example.com');

  // Charts views
  const forecast = getForecastChartView(db, seedNow);
  const groceries = getGroceriesChartView(db, {}, seedNow);
  const everyone = getPersonalChartView(db, {}, seedNow);
  const personal = getPersonalChartView(db, { include: undefined }, seedNow);
  const commitments = getCommitmentChartView(db, { scheduleOnly: false }, seedNow);
  const mixView = getSpendingMixView(db, {}, seedNow);

  // Insights views
  const monthComparison = getMonthComparisonView(db, seedNow);
  const personalMonth = getPersonalMonthView(
    db,
    { year: new Date(todayIso).getFullYear(), month: new Date(todayIso).getMonth() + 1 },
    seedNow,
  );
  const vehicleCosts = getVehicleCostsView(db, seedNow);
  const honestyLoop = getHonestyLoopView(db, seedNow);

  // Horizon view
  const pots = listPots(db).filter((pot) => pot.kind !== 'credit-card');
  const nextIncomeDate = nextScheduledIncomeDate(db, todayIso);
  const throughDate = nextIncomeDate ?? addDaysLocal(todayIso, 35);
  const horizon = getHorizonProjectionView(db, throughDate, [], true, seedNow);

  // Setup path (for the "Getting started" card - shows as complete)
  const setup = getSetupPath(db, seedNow);

  const captionLines = [
    'Two people (Alex, Sam)',
    'Two bank accounts (Main, Salary)',
    'Two cash pots (one each)',
    'One salary on the 27th',
    'Eleven direct debits / standing orders',
    'Two months of weekly shops and personal spending',
    'A loan from Mum with expected monthly support',
    'The "Back Garden Fence Replacement" project demo',
  ];

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          Worked example
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          A household that has been using this for two months
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          This is not your data. It is a fictional household — Alex and Sam — rendered through the
          app's real engines and components from an in-memory seed. Every figure, chart and
          projection is computed exactly as it would be for your own household. Nothing here is
          written to disk.
        </p>
        <p className="mt-2 text-xs text-ink-muted">Based on: {captionLines.join(' · ')}</p>
        <p className="mt-3 text-sm">
          <span className="font-medium text-ink">Your household starts empty.</span> The setup path
          on{' '}
          <a href="/start" className="sf-link">
            /start
          </a>{' '}
          walks you through the same dependency chain (people → pots → checkpoints → income → bills
          → figures → purchases). The vocabulary is on{' '}
          <a href="/guide" className="sf-link">
            /guide
          </a>
          .
        </p>
      </header>

      <div className="space-y-6">
        {/* Home page snapshot */}
        <section
          id="home"
          aria-labelledby="home-heading"
          className="rounded-xl border border-border bg-surface p-4 shadow-sm"
        >
          <h2 id="home-heading" className="text-lg font-semibold">
            Home — live projection and till
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            The home page with a working payday projection, the quick-entry till, and the household
            total.
          </p>

          {/* Money section */}
          <section
            aria-labelledby="money-heading"
            className="mt-4 rounded-xl border border-border bg-surface p-4 shadow-sm"
          >
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-positive">
                  Household total now
                </p>
                <h3
                  id="money-heading"
                  className="text-2xl font-semibold tracking-tight sm:text-3xl"
                >
                  {money.householdAvailablePence === null
                    ? 'Waiting for your first checkpoint'
                    : formatPence(money.householdAvailablePence)}
                </h3>
              </div>
              <span className="text-xs text-ink-muted">
                Your reported figures plus recorded activity —{' '}
                <a href="/guide#checkpoint" className="sf-link">
                  not a bank balance
                </a>
              </span>
            </div>
            {money.householdAvailablePence === null ? (
              <p className="text-sm text-ink-soft">
                Record a balance checkpoint and the household estimate appears here.
              </p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                {money.pots.map((view) => (
                  <li key={view.pot.id} className="rounded-lg bg-canvas px-3 py-2">
                    <p className="text-xs text-ink-muted">{view.pot.label}</p>
                    {view.estimatePence === null ? (
                      <p className="text-sm text-ink-faint">no checkpoint</p>
                    ) : (
                      <p className="text-sm font-semibold tabular-nums">
                        {view.pot.kind === 'credit-card'
                          ? `Owed ${formatPence(view.estimatePence)}`
                          : formatPence(view.estimatePence)}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Till */}
          <div className="mt-4">
            <QuickEntry data={entryData} openAtTillOnMobile />
          </div>

          {/* Payday projection */}
          {projection !== null ? (
            <div className="mt-4">
              <PaydaySummary projection={projection} />
            </div>
          ) : (
            <section
              aria-labelledby="projection-locked-heading"
              className="mt-4 rounded-xl border border-dashed border-border-strong bg-surface p-4"
            >
              <h3 id="projection-locked-heading" className="text-lg font-semibold">
                Payday projection
              </h3>
              <p className="mt-1 text-sm text-ink-soft">
                The liquidity projection appears once the records it reads exist:
              </p>
              <NeedsFirst variant="inline" needs={getPageNeeds(db, 'projection', seedNow)} />
            </section>
          )}
        </section>

        {/* Charts - Forecast */}
        <section
          id="forecast"
          aria-labelledby="forecast-heading"
          className="rounded-xl border border-border bg-surface p-4 shadow-sm"
        >
          <h2 id="forecast-heading" className="text-lg font-semibold">
            Chart A — Forecast: where liquid funds go, today to a month ahead
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Projected liquid funds in bank and cash pots after expected cash commitments, receipts
            and day-to-day estimates. Credit-card debt is included in the household total, not this
            projection.
          </p>
          {forecast.unavailable ? (
            <NeedsFirst
              variant="inline"
              needs={getPageNeeds(db, 'charts', seedNow).filter((n) => n.id !== 'purchases')}
            />
          ) : (
            <ForecastChartInline view={forecast} />
          )}
        </section>

        {/* Charts - Groceries */}
        <section
          id="groceries"
          aria-labelledby="groceries-heading"
          className="rounded-xl border border-border bg-surface p-4 shadow-sm"
        >
          <h2 id="groceries-heading" className="text-lg font-semibold">
            Chart B — Groceries: is the weekly shop creeping up?
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Recorded grocery lines only, bucketed Monday to Sunday. A week with no shop is a zero
            week, not a missing one.
          </p>
          <GroceriesChartInline view={groceries} />
        </section>

        {/* Charts - Personal spending */}
        <section
          id="personal"
          aria-labelledby="personal-heading"
          className="rounded-xl border border-border bg-surface p-4 shadow-sm"
        >
          <h2 id="personal-heading" className="text-lg font-semibold">
            Chart C — Personal spending: hers, his, household
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Attributed by "For: …", the way Insights already does it — not by whose card was used.
            Household-marked spending is its own bar and is never split between people.
          </p>
          <PersonalChartInline view={personal} everyone={everyone} />
        </section>

        {/* Charts - Fixed commitments */}
        <section
          id="commitments"
          aria-labelledby="commitments-heading"
          className="rounded-xl border border-border bg-surface p-4 shadow-sm"
        >
          <h2 id="commitments-heading" className="text-lg font-semibold">
            Chart D — Fixed commitments: are the direct debits coming down?
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Tracked categories are the household's own list, ticked in Settings — "direct debit" is
            not a field on a purchase.
          </p>
          <CommitmentsChartInline view={commitments} />
        </section>

        {/* Charts - Spending mix */}
        <section
          id="mix"
          aria-labelledby="mix-heading"
          className="rounded-xl border border-border bg-surface p-4 shadow-sm"
        >
          <h2 id="mix-heading" className="text-lg font-semibold">
            Chart E — Spending mix: where the money goes
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Net spending by parent category, drawn from the purchase lines in the window — refunds
            net off their category. Personal is split by "For: …": each person's own slice, and
            household-marked personal spending as its own slice.
          </p>
          <SpendingMixChartInline view={mixView} />
        </section>

        {/* Insights - Month comparison */}
        <section
          id="insights-comparison"
          aria-labelledby="insights-comparison-heading"
          className="rounded-xl border border-border bg-surface p-4 shadow-sm"
        >
          <h2 id="insights-comparison-heading" className="text-lg font-semibold">
            Insights — Month comparison
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            This month vs. previous month, with honesty loop and per-person attribution.
          </p>
          <MonthComparisonInline view={monthComparison} />
        </section>

        {/* Insights - Personal spending detail */}
        <section
          id="insights-personal"
          aria-labelledby="insights-personal-heading"
          className="rounded-xl border border-border bg-surface p-4 shadow-sm"
        >
          <h2 id="insights-personal-heading" className="text-lg font-semibold">
            Insights — Personal spending this month
          </h2>
          <PersonalMonthInline view={personalMonth} />
        </section>

        {/* Insights - Vehicle costs */}
        <section
          id="insights-vehicles"
          aria-labelledby="insights-vehicles-heading"
          className="rounded-xl border border-border bg-surface p-4 shadow-sm"
        >
          <h2 id="insights-vehicles-heading" className="text-lg font-semibold">
            Insights — Vehicle running costs (rolling 12 months)
          </h2>
          <VehicleCostsInline vehicles={vehicleCosts} />
        </section>

        {/* Insights - Honesty loop */}
        <section
          id="insights-honesty"
          aria-labelledby="insights-honesty-heading"
          className="rounded-xl border border-border bg-surface p-4 shadow-sm"
        >
          <h2 id="insights-honesty-heading" className="text-lg font-semibold">
            Insights — Honesty loop
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Configured weekly-shop and fuel figures compared with recent actuals.
          </p>
          <HonestyLoopInline view={honestyLoop} />
        </section>

        {/* Horizon */}
        <section
          id="horizon"
          aria-labelledby="horizon-heading"
          className="rounded-xl border border-border bg-surface p-4 shadow-sm"
        >
          <h2 id="horizon-heading" className="text-lg font-semibold">
            Horizon — how far the money would go
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            A projection of liquid funds in bank and cash pots after known commitments and projected
            groceries/fuel. Credit-card balances remain in the household net total, but are not cash
            available to pay bills.
          </p>
          <HorizonInline view={horizon} throughDate={throughDate} />
        </section>
      </div>

      <footer className="mt-8 text-xs text-ink-muted">
        <p>
          This worked example is rendered from the app's real engines against an in-memory seed.
          <a href="/guide" className="sf-link">
            How this app thinks
          </a>{' '}
          ·{' '}
          <a href="/start" className="sf-link">
            Set up your household
          </a>
        </p>
      </footer>
    </main>
  );
}

// Inline chart components (simplified, server-rendered tables like the real pages)

function ForecastChartInline({ view }: { view: ReturnType<typeof getForecastChartView> }) {
  const { series } = view;
  const points = series.days.map((day) => ({
    date: day.date,
    valuePence: day.runningPence,
    reported: day.reported,
    income: day.receiptsPence > 0,
  }));
  // chartDomain is a pure function, import at module level
  const { chartDomain } = require('@/components/charts') as {
    chartDomain: (
      values: number[],
      options: { targetTicks: number },
    ) => { min: number; max: number };
  };
  const domain = chartDomain(
    points.map((p) => p.valuePence),
    { targetTicks: 4 },
  );
  const lowIndex = series.days.findIndex((d) => d.date === series.lowDate);

  return (
    <div>
      <p className="mb-2 text-sm font-medium">{series.headline}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-[11px] uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="py-1 pr-3 font-medium">Day</th>
              <th className="py-1 pr-3 font-medium text-right">In</th>
              <th className="py-1 pr-3 font-medium text-right">Out</th>
              <th className="py-1 pr-0 font-medium text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {series.days.map((day) => (
              <tr key={day.date} className="border-t border-border-hairline">
                <td className="py-1 pr-3">{formatShortLocalDate(day.date)}</td>
                <td className="py-1 pr-3 text-right">
                  {day.receiptsPence === 0 ? '—' : formatPence(day.receiptsPence)}
                </td>
                <td className="py-1 pr-3 text-right">
                  {day.commitmentsPence + day.dayToDayPence === 0
                    ? '—'
                    : formatPence(day.commitmentsPence + day.dayToDayPence)}
                </td>
                <td className="py-1 pr-0 text-right tabular-nums">
                  {formatPence(day.runningPence)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        Today's {formatPence(series.startPence)} is estimated liquid funds; later days apply
        expected commitments, receipts and day-to-day estimates.
      </p>
    </div>
  );
}

function GroceriesChartInline({ view }: { view: ReturnType<typeof getGroceriesChartView> }) {
  const series = view.laptop; // laptop IS a GroceriesSeries
  const caption =
    'Recorded grocery lines only, bucketed Monday to Sunday. Weeks before recording began are not counted. The current week is still being lived and never counts towards the average.';

  return (
    <div>
      <p className="mb-2 text-sm font-medium">{series.headline}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-[11px] uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="py-1 pr-3 font-medium">Week (Mon)</th>
              <th className="py-1 pr-0 font-medium text-right">Spent</th>
            </tr>
          </thead>
          <tbody>
            {series.weeks.map((week) => (
              <tr
                key={week.weekStart}
                className={`border-t border-border-hairline ${!week.complete ? 'text-ink-muted' : ''}`}
              >
                <td className="py-1 pr-3">
                  {week.weekStart}
                  {week.complete ? '' : ' (so far)'}
                  {week.recorded ? '' : ' (not counted)'}
                </td>
                <td className="py-1 pr-0 text-right tabular-nums">
                  {formatPence(week.amountPence)}
                </td>
              </tr>
            ))}
            <tr className="font-semibold border-t-2 border-border">
              <td className="py-1 pr-3">Total</td>
              <td className="py-1 pr-0 text-right tabular-nums">
                {formatPence(series.weeks.reduce((s, w) => s + w.amountPence, 0))}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink-muted">{caption}</p>
      {series.configuredWeeklyPence !== null && (
        <p className="mt-1 text-xs text-ink-soft">
          Configured weekly figure: {formatPence(series.configuredWeeklyPence)}
        </p>
      )}
      {series.averageWeeks > 0 && (
        <p className="mt-1 text-xs text-ink-soft">
          Trailing {series.averageWeeks}-week average: {formatPence(series.averagePence)}
        </p>
      )}
    </div>
  );
}

function PersonalChartInline({
  view,
  everyone,
}: {
  view: ReturnType<typeof getPersonalChartView>;
  everyone: ReturnType<typeof getPersonalChartView>;
}) {
  const series = view.laptop; // laptop IS a PersonalSeries

  return (
    <div>
      <p className="mb-2 text-sm font-medium">{series.headline}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-[11px] uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="py-1 pr-3 font-medium">Month</th>
              {series.series.map((ref) => (
                <th key={ref.key} className="py-1 pr-3 font-medium text-right">
                  {ref.label}
                </th>
              ))}
              <th className="py-1 pr-0 font-medium text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {series.months.map((month) => (
              <tr
                key={month.from}
                className={`border-t border-border-hairline ${!month.complete ? 'text-ink-muted' : ''}`}
              >
                <td className="py-1 pr-3">
                  {month.label}
                  {month.complete ? '' : ' (so far)'}
                </td>
                {month.cells.map((cell) => (
                  <td key={cell.key} className="py-1 pr-3 text-right tabular-nums">
                    {formatPence(cell.amountPence)}
                  </td>
                ))}
                <td className="py-1 pr-0 text-right tabular-nums font-semibold">
                  {formatPence(month.totalPence)}
                </td>
              </tr>
            ))}
            <tr className="font-semibold border-t-2 border-border">
              <td className="py-1 pr-3">Total</td>
              {series.totals.map((total) => (
                <td key={total.key} className="py-1 pr-3 text-right tabular-nums">
                  {formatPence(total.amountPence)}
                </td>
              ))}
              <td className="py-1 pr-0 text-right tabular-nums font-semibold">
                {formatPence(series.totals.reduce((s, t) => s + t.amountPence, 0))}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        A person&apos;s column counts every line marked for them, whatever its category.
        Household-marked spending is its own column and is never split between people; its scope is{' '}
        {view.parentNames.join(' and ')}.
      </p>
    </div>
  );
}

function CommitmentsChartInline({ view }: { view: ReturnType<typeof getCommitmentChartView> }) {
  if (view.tracking.categoryIds.length === 0) {
    return (
      <p className="text-sm text-ink-soft">
        No categories are tracked as fixed commitments yet. Tick the ones that are bills in{' '}
        <a href="/settings#commitment-categories" className="sf-link">
          Settings
        </a>
        , and this chart fills in.
      </p>
    );
  }

  const { series } = view;

  return (
    <div>
      <p className="mb-2 text-sm font-medium">{series.headline}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-[11px] uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="py-1 pr-3 font-medium">Month</th>
              <th className="py-1 pr-0 font-medium text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {series.months.map((month) => (
              <tr
                key={month.from}
                className={`border-t border-border-hairline ${!month.complete ? 'text-ink-muted' : ''}`}
              >
                <td className="py-1 pr-3">
                  {month.label}
                  {month.complete ? '' : ' (so far)'}
                </td>
                <td className="py-1 pr-0 text-right tabular-nums">
                  {formatPence(month.amountPence)}
                </td>
              </tr>
            ))}
            <tr className="font-semibold border-t-2 border-border">
              <td className="py-1 pr-3">Total</td>
              <td className="py-1 pr-0 text-right tabular-nums">
                {formatPence(series.months.reduce((s, m) => s + m.amountPence, 0))}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        Tracked categories:{' '}
        {view.trackedCategories.map((c) => `${c.parent} / ${c.child}`).join(', ')}
        {view.tracking.source === 'schedules' ? ' (from schedules — nothing saved yet)' : ''}.
      </p>
    </div>
  );
}

function SpendingMixChartInline({ view }: { view: ReturnType<typeof getSpendingMixView> }) {
  const { mix } = view;
  const drawn = mix.slices.filter((s) => s.drawn);
  const largest = drawn[0];

  return (
    <div>
      <p className="mb-2 text-sm font-medium">
        {largest === undefined
          ? `Nothing is above zero from ${view.window.from} to ${view.window.to}.`
          : `${formatPence(mix.totalPence)} net spending. ${largest.label} is the biggest slice, at ${Math.round(largest.share * 100)}%.`}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-[11px] uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="py-1 pr-3 font-medium">Slice</th>
              <th className="py-1 pr-3 font-medium text-right">Net spent</th>
              <th className="py-1 pr-0 font-medium text-right">Share</th>
            </tr>
          </thead>
          <tbody>
            {mix.slices.map((slice) => (
              <tr
                key={slice.key}
                className={`border-t border-border-hairline ${!slice.drawn ? 'text-ink-muted' : ''}`}
              >
                <td className="py-1 pr-3">{slice.label}</td>
                <td className="py-1 pr-3 text-right tabular-nums">
                  {formatPence(slice.amountPence)}
                </td>
                <td className="py-1 pr-0 text-right tabular-nums">
                  {slice.drawn ? `${Math.round(slice.share * 100)}%` : 'not drawn'}
                </td>
              </tr>
            ))}
            <tr className="font-semibold border-t-2 border-border">
              <td className="py-1 pr-3">Total</td>
              <td className="py-1 pr-3 text-right tabular-nums">{formatPence(mix.totalPence)}</td>
              <td className="py-1 pr-0 text-right"></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        Window: {view.window.from} to {view.window.to} ({view.window.kind}).{' '}
        {view.notice ? `Notice: ${view.notice}` : ''}
      </p>
    </div>
  );
}

function MonthComparisonInline({ view }: { view: ReturnType<typeof getMonthComparisonView> }) {
  const { months, byParent, monthToDate } = view;
  const newest = view.current;

  return (
    <div>
      <p className="mb-2 text-sm font-medium">
        Three months side by side ({months.map((month) => month.label).join(' · ')})
        {newest.deltaPence !== null
          ? ` — drift on the month before: ${newest.deltaPence > 0 ? '+' : ''}${formatPence(newest.deltaPence)}`
          : ''}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-[11px] uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="py-1 pr-3 font-medium">Category</th>
              {months.map((month, index) => (
                <Fragment key={month.label}>
                  <th className="py-1 pr-3 font-medium text-right">{month.label}</th>
                  {index === 0 ? null : (
                    <th className="py-1 pr-3 font-medium text-right">Change</th>
                  )}
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {byParent.map((entry) => (
              <tr key={entry.parent} className="border-t border-border-hairline">
                <td className="py-1 pr-3">{entry.parent}</td>
                {months.map((month, index) => (
                  <Fragment key={month.label}>
                    <td className="py-1 pr-3 text-right tabular-nums">
                      {formatPence(entry.amountsPence[index] ?? 0)}
                    </td>
                    {index === 0 ? null : (
                      <td className="py-1 pr-3 text-right tabular-nums">
                        {(entry.deltasPence[index] ?? 0) > 0 ? '+' : ''}
                        {formatPence(entry.deltasPence[index] ?? 0)}
                      </td>
                    )}
                  </Fragment>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        Month-to-date ({formatMonthLabel(newest.month)}): {formatPence(monthToDate.totalPence)}{' '}
        across {monthToDate.byParent.length} parent categories.
      </p>
    </div>
  );
}

function formatMonthLabel(month: { year: number; month: number }): string {
  const date = new Date(month.year, month.month - 1, 1);
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function PersonalMonthInline({ view }: { view: ReturnType<typeof getPersonalMonthView> }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{view.label}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-[11px] uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="py-1 pr-3 font-medium">Person</th>
              <th className="py-1 pr-3 font-medium text-right">Total</th>
              <th className="py-1 pr-0 font-medium text-right">Parent categories</th>
            </tr>
          </thead>
          <tbody>
            {view.people.map((person) => (
              <tr key={person.personId} className="border-t border-border-hairline">
                <td className="py-1 pr-3">{person.person}</td>
                <td className="py-1 pr-3 text-right tabular-nums">
                  {formatPence(person.totalPence)}
                </td>
                <td className="py-1 pr-0 text-right tabular-nums">{person.byParent.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function VehicleCostsInline({ vehicles }: { vehicles: ReturnType<typeof getVehicleCostsView> }) {
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-[11px] uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="py-1 pr-3 font-medium">Vehicle</th>
              <th className="py-1 pr-3 font-medium text-right">This month</th>
              <th className="py-1 pr-3 font-medium text-right">Previous month</th>
              <th className="py-1 pr-3 font-medium text-right">Rolling 12</th>
              <th className="py-1 pr-3 font-medium text-right">Annual spread</th>
              <th className="py-1 pr-0 font-medium text-right">Categories</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((vehicle) => (
              <tr key={vehicle.vehicleId} className="border-t border-border-hairline">
                <td className="py-1 pr-3">{vehicle.label}</td>
                <td className="py-1 pr-3 text-right tabular-nums">
                  {formatPence(vehicle.monthPence)}
                </td>
                <td className="py-1 pr-3 text-right tabular-nums">
                  {formatPence(vehicle.previousMonthPence)}
                </td>
                <td className="py-1 pr-3 text-right tabular-nums">
                  {formatPence(vehicle.rolling12Pence)}
                </td>
                <td className="py-1 pr-3 text-right tabular-nums">
                  {formatPence(vehicle.annualSpreadPence)}
                </td>
                <td className="py-1 pr-0 text-right tabular-nums">{vehicle.byChild.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HonestyLoopInline({ view }: { view: ReturnType<typeof getHonestyLoopView> }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium">Groceries honesty verdict</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-[11px] uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="py-1 pr-3 font-medium">Metric</th>
              <th className="py-1 pr-3 font-medium text-right">Configured</th>
              <th className="py-1 pr-3 font-medium text-right">Actual (8 weeks)</th>
              <th className="py-1 pr-0 font-medium text-right">Drift</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-border-hairline">
              <td className="py-1 pr-3">Weekly shop</td>
              <td className="py-1 pr-3 text-right tabular-nums">
                {view.groceries.configuredPence !== null
                  ? formatPence(view.groceries.configuredPence)
                  : '—'}
              </td>
              <td className="py-1 pr-3 text-right tabular-nums">
                {view.groceries.averageWeeklyPence !== null
                  ? formatPence(view.groceries.averageWeeklyPence)
                  : '—'}
              </td>
              <td className="py-1 pr-0 text-right tabular-nums">
                {view.groceries.driftPence !== null
                  ? (view.groceries.driftPence > 0 ? '+' : '') +
                    formatPence(view.groceries.driftPence)
                  : '—'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-sm font-medium">Fuel honesty verdict</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-[11px] uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="py-1 pr-3 font-medium">Vehicle</th>
              <th className="py-1 pr-3 font-medium text-right">Configured monthly</th>
              <th className="py-1 pr-3 font-medium text-right">Actual (3 months)</th>
              <th className="py-1 pr-0 font-medium text-right">Drift</th>
            </tr>
          </thead>
          <tbody>
            {view.fuel.map((vehicle) => (
              <tr key={vehicle.vehicleId} className="border-t border-border-hairline">
                <td className="py-1 pr-3">{vehicle.label}</td>
                <td className="py-1 pr-3 text-right tabular-nums">
                  {vehicle.configuredPence !== null ? formatPence(vehicle.configuredPence) : '—'}
                </td>
                <td className="py-1 pr-3 text-right tabular-nums">
                  {vehicle.averageMonthlyPence !== null
                    ? formatPence(vehicle.averageMonthlyPence)
                    : '—'}
                </td>
                <td className="py-1 pr-0 text-right tabular-nums">
                  {vehicle.driftPence !== null
                    ? (vehicle.driftPence > 0 ? '+' : '') + formatPence(vehicle.driftPence)
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HorizonInline({
  view,
  throughDate,
}: {
  view: ReturnType<typeof getHorizonProjectionView>;
  throughDate: string;
}) {
  const { result } = view;
  const lowLine = !view.hasSelectedCheckpoint
    ? 'No selected bank or cash pot has a balance checkpoint.'
    : result.projectedLowPence === null
      ? 'No window to project.'
      : `The lowest point would be ${formatPence(result.projectedLowPence)} on ${result.lowDate ?? '—'}.`;

  return (
    <div>
      <section className="mb-4 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            {view.dayToDayIncluded ? 'Free to spend up to' : 'Free to spend on bills up to'}
          </p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">
            {formatPence(landPenceOf(result))}
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            Where we'd land on {throughDate} — after commitments and expected money in,
            {view.dayToDayIncluded ? ' and day-to-day spending.' : ' without day-to-day spending.'}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Lowest point</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {result.projectedLowPence === null ? '—' : formatPence(result.projectedLowPence)}
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            {result.lowDate === null ? 'No window to project.' : `on ${result.lowDate}`}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Scope</p>
          <p className="mt-1 text-sm text-ink-body">{result.days} days ahead · every pot</p>
          <p className="mt-1 text-sm text-ink-soft">
            Available now {formatPence(view.availableNowPence)} · commitments −
            {formatPence(view.totalCommitmentsPence)} · expected money in +
            {formatPence(view.totalReceiptsPence)}
            {view.dayToDayIncluded && result.dayToDayPence > 0
              ? ` · day-to-day −${formatPence(result.dayToDayPence)}`
              : ''}
          </p>
        </div>
      </section>

      <p className="mb-4 text-sm">{lowLine}</p>

      <details className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <summary className="cursor-pointer text-sm font-medium text-ink-body">
          Commitments in the window ({view.commitmentLines.length}) ·{' '}
          {formatPence(view.totalCommitmentsPence)}
        </summary>
        {view.commitmentLines.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">No commitments due in this window.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border-hairline">
            {view.commitmentLines.map((line) => (
              <li
                key={`${line.dueDate}-${line.name}`}
                className="flex items-baseline justify-between gap-2 py-1.5 text-sm"
              >
                <span>
                  <span className="font-medium">{line.name}</span>{' '}
                  <span className="text-xs text-ink-muted">
                    {line.dueDate} · {line.potLabel}
                  </span>
                </span>
                <span className="tabular-nums">−{formatPence(line.amountPence)}</span>
              </li>
            ))}
          </ul>
        )}
      </details>

      <details className="mt-4 rounded-xl border border-border bg-surface p-4 shadow-sm">
        <summary className="cursor-pointer text-sm font-medium text-ink-body">
          Expected money in ({view.receiptLines.filter((l) => !l.expected).length} income +{' '}
          {view.receiptLines.filter((l) => l.expected).length} expected support) ·{' '}
          {formatPence(view.totalReceiptsPence)}
        </summary>
        {view.receiptLines.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">No expected money in this window.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border-hairline">
            {view.receiptLines.map((line) => (
              <li
                key={`${line.dueDate}-${line.name}-${line.expected}`}
                className="flex items-baseline justify-between gap-2 py-1.5 text-sm"
              >
                <span>
                  <span className="font-medium">{line.name}</span>{' '}
                  <span
                    className={`text-xs ${line.expected ? 'text-ink-faint' : 'text-ink-muted'}`}
                  >
                    {line.dueDate} · {line.potLabel}
                    {line.expected ? ' · expected — never received' : ''}
                  </span>
                </span>
                <span
                  className={`tabular-nums ${line.expected ? 'text-ink-muted' : 'text-positive'}`}
                >
                  {line.expected ? '≈' : '+'}
                  {formatPence(line.amountPence)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </details>

      {view.dayToDayIncluded ? (
        <details className="mt-4 rounded-xl border border-border bg-surface p-4 shadow-sm">
          <summary className="cursor-pointer text-sm font-medium text-ink-body">
            Projected day-to-day spending ({view.dayToDayEvents.length}) ·{' '}
            {formatPence(view.dayToDayEvents.reduce((s, e) => s + e.amountPence, 0))}
          </summary>
          {view.dayToDayEvents.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">No projection figures are configured.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border-hairline">
              {view.dayToDayEvents.map((event) => (
                <li
                  key={`${event.dueDate}-${event.name}`}
                  className="flex items-baseline justify-between gap-2 py-1.5 text-sm"
                >
                  <span>
                    <span className="font-medium">{event.name}</span>{' '}
                    <span className="text-xs text-ink-muted">{event.dueDate}</span>
                  </span>
                  <span className="tabular-nums">−{formatPence(event.amountPence)}</span>
                </li>
              ))}
            </ul>
          )}
        </details>
      ) : null}

      {view.hasSelectedCheckpoint && result.perDay.length > 0 ? (
        <details className="mt-4 rounded-xl border border-border bg-surface p-4 shadow-sm">
          <summary className="cursor-pointer text-sm font-medium text-ink-body">
            Day by day ({result.perDay.length} days)
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-[11px] uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="py-1 pr-3 font-medium">Date</th>
                  <th className="py-1 pr-3 font-medium text-right">In</th>
                  <th className="py-1 pr-3 font-medium text-right">Out</th>
                  <th className="py-1 pr-0 font-medium text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {result.perDay.map((day) => (
                  <tr key={day.date} className="border-t border-border-hairline">
                    <td className="py-1 pr-3">{day.date}</td>
                    <td className="py-1 pr-3 text-right">
                      {day.receiptsPence === 0 ? '—' : formatPence(day.receiptsPence)}
                    </td>
                    <td className="py-1 pr-3 text-right">
                      {day.commitmentsPence + day.dayToDayPence === 0
                        ? '—'
                        : formatPence(day.commitmentsPence + day.dayToDayPence)}
                    </td>
                    <td className="py-1 pr-0 text-right tabular-nums">
                      {formatPence(day.runningPence)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </div>
  );
}
