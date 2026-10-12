import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Fragment } from 'react';
import { householdContextFromRequest } from '@/lib/auth/next';
import { formatPence } from '@/lib/money';
import { NeedsFirst } from '@/components/needs-first';
import {
  getHonestyLoopView,
  getMonthComparisonView,
  getPersonalMonthView,
  getVehicleCostsView,
} from '@/lib/records/insights-view';
import {
  drillKey,
  drillMonth,
  drillPerson,
  drillVehicle,
  parseDrillKey,
  vehicleDrillWindow,
  type DrillSelection,
  type DrillTable,
} from '@/lib/records/insights-drill';
import { purchasesHref } from '@/lib/records/chart-series';
import { targetLabel, targetNames, type TargetNames } from '@/lib/records/targets';
import { listPeople } from '@/lib/records/people';
import { listVehicles } from '@/lib/records/vehicles';
import { getPageNeeds } from '@/lib/records/page-needs';
import { getFuelEconomyView, type VehicleFuelEconomyView } from '@/lib/records/fuel';
import { describeClosure, formatLitres, formatMiles, formatMpg } from '@/lib/records/fuel-economy';
import { formatShortLocalDate, toLocalDateString } from '@/lib/time';

export const dynamic = 'force-dynamic';

interface MonthRef {
  year: number;
  month: number; // 1–12
}

const monthParam = (ref: MonthRef) => `${ref.year}-${String(ref.month).padStart(2, '0')}`;

function parseMonthParam(raw: string | undefined, fallback: MonthRef): MonthRef {
  if (raw === undefined) return fallback;
  const match = /^(\d{4})-(\d{2})$/.exec(raw);
  if (match === null) return fallback;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12 || year < 2000 || year > 2100) return fallback;
  return { year, month };
}

function shiftMonth(ref: MonthRef, delta: number): MonthRef {
  const index = ref.year * 12 + (ref.month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** The page's own URL for the person-card month and an optional drill selection. */
function insightsHref(state: { month: string; show: string | null }, anchor: string): string {
  const query = new URLSearchParams();
  query.set('month', state.month);
  if (state.show !== null) query.set('show', state.show);
  return `/insights?${query.toString()}#${anchor}`;
}

/**
 * Insights v1 (SPEC §16): the panels. Every figure comes from the pure
 * insights engine via the DB assembly layer — the UI only formats and lays
 * out, so the numbers here reconcile with the tested engines by construction.
 *
 * Every total is a link (decision 197): pressing it opens the line items
 * behind the figure, in place, via a real `?show=…` URL — no client
 * JavaScript, works in a new tab, shareable with the other person. Pressing
 * the selected figure again closes the list.
 */
export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; show?: string }>;
}) {
  const user = await householdContextFromRequest();
  if (user === null) redirect('/unauthorized');

  const db = user.db;
  const now = new Date();
  const today = toLocalDateString(now);
  const params = await searchParams;

  const thisMonth = { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
  // “What this page needs first” (Slice 2): with nothing recorded, the month
  // comparison and the honesty loop are zero-figure scaffolding — “October
  // £0.00 vs September £0.00”, “no complete week recorded yet” — so the needs
  // block replaces exactly those two panels. The people, vehicle and mpg
  // panels keep their own honest empty sentences: no vehicle is a complete
  // household, never a missing record.
  const insightsNeeds = getPageNeeds(db, 'insights', now);
  const needsPurchases = insightsNeeds.some((need) => need.id === 'purchases');
  const comparison = getMonthComparisonView(db, now);
  const personal = getPersonalMonthView(db, parseMonthParam(params.month, thisMonth), now);
  const vehicles = getVehicleCostsView(db, now);
  const loop = getHonestyLoopView(db, now);
  const economy = getFuelEconomyView(db, now);
  const names = targetNames({ people: listPeople(db), vehicles: listVehicles(db) });

  const state = { month: monthParam(personal.month), show: parseDrillKey(params.show) };
  const toggleShow = (selection: DrillSelection, anchor: string): string => {
    const key = drillKey(selection);
    return insightsHref({ month: state.month, show: params.show === key ? null : key }, anchor);
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Insights</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Where the money actually went
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-soft">
          Recorded spending only —{' '}
          <Link href="/guide#transfers" className="hover:underline">
            transfers never appear here
          </Link>{' '}
          (they move money between your own pots), and{' '}
          <Link href="/guide#income" className="hover:underline">
            income is not spending
          </Link>
          . Figures reconcile with the purchase history exactly, except that running costs show an
          annual vehicle payment as ÷ 12 a month (decision 190). Any figure here opens its own line
          items.
        </p>
      </header>

      <div className="space-y-6">
        {needsPurchases ? (
          <NeedsFirst needs={insightsNeeds} headingId="insights-needs-heading" />
        ) : (
          <MonthPanel
            comparison={comparison}
            today={today}
            state={state}
            toggleShow={toggleShow}
            names={names}
          />
        )}

        <section
          aria-labelledby="panel-persons-heading"
          className="rounded-xl border border-border bg-surface p-4 shadow-sm"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="panel-persons-heading" className="text-xl font-semibold">
              By person — {personal.label}
            </h2>
            <div className="flex items-center gap-1">
              <Link
                href={`/insights?month=${monthParam(shiftMonth(personal.month, -1))}`}
                className="rounded border border-border-strong px-2.5 py-1 text-sm font-medium text-ink-body hover:bg-canvas"
              >
                ← Prev
              </Link>
              <Link
                href={`/insights?month=${monthParam(shiftMonth(personal.month, 1))}`}
                className="rounded border border-border-strong px-2.5 py-1 text-sm font-medium text-ink-body hover:bg-canvas"
              >
                Next →
              </Link>
            </div>
          </div>
          <p className="mb-3 text-xs text-ink-muted">
            Only lines explicitly marked “for {personal.people.length > 1 ? 'a person' : 'someone'}”
            are attributed. Household spending is never attributed to whoever happened to pay.
          </p>
          {personal.people.length === 0 ? (
            <p className="text-sm text-ink-muted">
              No people in the household yet —{' '}
              <Link href="/start#setup-people" className="font-medium text-accent hover:underline">
                name them on Getting started
              </Link>
              .
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {personal.people.map((person) => {
                const drill = state.show;
                const personMonth = monthParam(personal.month);
                // The card drills its own displayed month only: a stale or
                // hand-edited key naming another month opens nothing rather
                // than reading one month's lines under another month's header.
                const open: Extract<DrillSelection, { kind: 'person' }> | null =
                  drill?.kind === 'person' &&
                  drill.personId === person.personId &&
                  drill.month === personMonth
                    ? drill
                    : null;
                return (
                  <div key={person.personId} className="rounded-lg bg-canvas p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-semibold">{person.person}</p>
                      <p className="text-lg font-semibold tabular-nums">
                        <a
                          href={toggleShow(
                            {
                              kind: 'person',
                              personId: person.personId,
                              month: personMonth,
                              parentId: null,
                            },
                            'person-drill',
                          )}
                          className="hover:underline"
                          aria-current={open !== null ? 'true' : undefined}
                        >
                          {formatPence(person.totalPence)}
                        </a>
                      </p>
                    </div>
                    {person.byParent.length === 0 ? (
                      <p className="mt-1 text-xs text-ink-muted">
                        Nothing marked for {person.person} this month.
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-1 text-sm">
                        {person.byParent.map((row) => {
                          const parentId = personal.lines.find(
                            (line) => line.parentName === row.parent,
                          )?.parentId;
                          return (
                            <li
                              key={row.parent}
                              className="flex items-baseline justify-between gap-2"
                            >
                              <span className="text-ink-soft">
                                {row.parent}
                                {row.children.length > 0
                                  ? ` (${row.children.map((child) => child.child).join(', ')})`
                                  : ''}
                              </span>
                              <span className="tabular-nums">
                                {parentId === undefined ? (
                                  formatPence(row.amountPence)
                                ) : (
                                  <a
                                    href={toggleShow(
                                      {
                                        kind: 'person',
                                        personId: person.personId,
                                        month: personMonth,
                                        parentId,
                                      },
                                      'person-drill',
                                    )}
                                    className="hover:underline"
                                    aria-current={
                                      open !== null && open.parentId === parentId
                                        ? 'true'
                                        : undefined
                                    }
                                  >
                                    {formatPence(row.amountPence)}
                                  </a>
                                )}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {open !== null ? (
                      <PersonDrillCard
                        selection={open}
                        table={drillPerson(
                          personal.lines,
                          personMonth,
                          person.personId,
                          open.parentId,
                        )}
                        personLabel={person.person}
                        monthLabel={personal.label}
                        parentName={
                          open.parentId === null
                            ? null
                            : (personal.lines.find((line) => line.parentId === open.parentId)
                                ?.parentName ?? 'Category')
                        }
                        toggleShow={toggleShow}
                        names={names}
                        today={today}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section
          aria-labelledby="panel-vehicles-heading"
          className="rounded-xl border border-border bg-surface p-4 shadow-sm"
        >
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 id="panel-vehicles-heading" className="text-xl font-semibold">
              Vehicle running costs
            </h2>
            <span className="text-xs text-ink-muted">
              fuel, insurance, maintenance, road tax, parking
            </span>
          </div>
          {vehicles.length === 0 ? (
            <p className="text-sm text-ink-muted">No vehicles in the household yet.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {vehicles.map((vehicle) => {
                const drill = state.show;
                const open =
                  drill?.kind === 'vehicle' && drill.vehicleId === vehicle.vehicleId ? drill : null;
                const isShown = (key: string) => (params.show === key ? 'true' : undefined);
                return (
                  // The anchor a vehicle task's "About:" link lands on (decision 175).
                  <div
                    key={vehicle.vehicleId}
                    id={`vehicle-${vehicle.vehicleId}`}
                    className="scroll-mt-24 rounded-lg bg-canvas p-3"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-semibold">{vehicle.label}</p>
                      <p className="text-lg font-semibold tabular-nums">
                        <a
                          href={toggleShow(
                            {
                              kind: 'vehicle',
                              vehicleId: vehicle.vehicleId,
                              window: 'rolling',
                              childCategoryId: null,
                            },
                            'vehicle-drill',
                          )}
                          className="hover:underline"
                          aria-current={isShown(
                            drillKey({
                              kind: 'vehicle',
                              vehicleId: vehicle.vehicleId,
                              window: 'rolling',
                              childCategoryId: null,
                            }),
                          )}
                        >
                          {formatPence(vehicle.rolling12Pence)}
                        </a>
                        <span className="ml-1 text-xs font-normal text-ink-muted">
                          last 12 months
                        </span>
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-ink-muted">
                      this month{' '}
                      <a
                        href={toggleShow(
                          {
                            kind: 'vehicle',
                            vehicleId: vehicle.vehicleId,
                            window: 'month',
                            childCategoryId: null,
                          },
                          'vehicle-drill',
                        )}
                        className="tabular-nums text-ink-body hover:underline"
                        aria-current={isShown(
                          drillKey({
                            kind: 'vehicle',
                            vehicleId: vehicle.vehicleId,
                            window: 'month',
                            childCategoryId: null,
                          }),
                        )}
                      >
                        {formatPence(vehicle.monthPence)}
                      </a>{' '}
                      (in progress) · previous month{' '}
                      <a
                        href={toggleShow(
                          {
                            kind: 'vehicle',
                            vehicleId: vehicle.vehicleId,
                            window: 'previous',
                            childCategoryId: null,
                          },
                          'vehicle-drill',
                        )}
                        className="tabular-nums text-ink-body hover:underline"
                        aria-current={isShown(
                          drillKey({
                            kind: 'vehicle',
                            vehicleId: vehicle.vehicleId,
                            window: 'previous',
                            childCategoryId: null,
                          }),
                        )}
                      >
                        {formatPence(vehicle.previousMonthPence)}
                      </a>{' '}
                      · window since {vehicle.rolling12From}
                    </p>
                    {vehicle.byChild.length > 0 ? (
                      <ul className="mt-2 space-y-1 text-sm">
                        {vehicle.byChild.map((row) => (
                          <li
                            key={`${row.parent}-${row.child}`}
                            className="flex items-baseline justify-between gap-2"
                          >
                            <span className="text-ink-soft">
                              {row.child}
                              {row.spreadPence > 0 ? (
                                <span className="ml-1 text-xs text-ink-muted">
                                  {row.spreadPence === row.amountPence
                                    ? '(annual ÷ 12)'
                                    : '(incl. annual ÷ 12)'}
                                </span>
                              ) : null}
                            </span>
                            <span className="tabular-nums">
                              <a
                                href={toggleShow(
                                  {
                                    kind: 'vehicle',
                                    vehicleId: vehicle.vehicleId,
                                    window: 'rolling',
                                    childCategoryId: row.categoryId,
                                  },
                                  'vehicle-drill',
                                )}
                                className="hover:underline"
                                aria-current={isShown(
                                  drillKey({
                                    kind: 'vehicle',
                                    vehicleId: vehicle.vehicleId,
                                    window: 'rolling',
                                    childCategoryId: row.categoryId,
                                  }),
                                )}
                              >
                                {formatPence(row.amountPence)}
                              </a>
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {vehicle.annualSpreadPence > 0 ? (
                      <p className="mt-2 text-xs text-ink-muted">
                        An annual payment is shown as ÷ 12 in each month it covers, from the month
                        it is paid. Purchases and the monthly comparison still show the single
                        payment on its date.
                      </p>
                    ) : null}
                    {open !== null ? (
                      <VehicleDrillCard
                        selection={open}
                        table={drillVehicle(
                          vehicle.lines,
                          vehicle.vehicleId,
                          open.window,
                          open.childCategoryId,
                          today,
                        )}
                        vehicleLabel={vehicle.label}
                        childName={
                          open.childCategoryId === null
                            ? null
                            : (vehicle.byChild.find(
                                (row) => row.categoryId === open.childCategoryId,
                              )?.child ?? 'Category')
                        }
                        toggleShow={toggleShow}
                        names={names}
                        today={today}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section
          aria-labelledby="panel-mpg-heading"
          className="rounded-xl border border-border bg-surface p-4 shadow-sm"
        >
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="panel-mpg-heading" className="text-xl font-semibold">
              Fuel economy
            </h2>
            <span className="text-xs text-ink-muted">
              miles per UK gallon, measured full tank to full tank
            </span>
          </div>
          <p className="mb-3 max-w-3xl text-xs text-ink-muted">
            Record the litres and the odometer reading with a fill — at the pump or later on
            Purchases. A stretch is measured once both of its full tanks have a mileage and every
            fill in between has its litres; part fills just add their litres.
          </p>
          {economy.length === 0 ? (
            <p className="text-sm text-ink-muted">No vehicles in the household yet.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {economy.map((vehicle) => (
                <FuelEconomyCard key={vehicle.vehicleId} vehicle={vehicle} />
              ))}
            </div>
          )}
        </section>

        {needsPurchases ? null : (
          <section
            aria-labelledby="panel-honesty-heading"
            className="rounded-xl border border-border bg-surface p-4 shadow-sm"
          >
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h2 id="panel-honesty-heading" className="text-xl font-semibold">
                Are your configured figures honest?
              </h2>
              <Link href="/settings" className="text-sm font-medium text-accent hover:underline">
                Adjust in Settings →
              </Link>
            </div>
            <p className="mb-4 text-xs text-ink-muted">
              Complete weeks and months only — the in-progress period never skews the average. If
              the configured figure is far from what actually happens, the projection will be too.
            </p>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-border p-3">
                <h3 className="text-sm font-semibold">Groceries — {loop.groceries.parent}</h3>
                <p className="text-xs text-ink-muted">
                  {loop.groceries.weeks.length === 0
                    ? 'no complete week recorded yet'
                    : `last ${loop.groceries.weeks.length} complete ${
                        loop.groceries.weeks.length === 1 ? 'week' : 'weeks'
                      } (Mon–Sun)`}
                  {loop.groceries.weeks.length > 0 && loop.groceries.weeks.length < 8
                    ? ` · recording began ${formatShortLocalDate(loop.groceries.recordedFrom)}, so earlier weeks are not counted`
                    : ''}
                </p>
                {loop.groceries.weeks.length === 0 ? (
                  <p className="mt-2 text-sm text-ink-soft">
                    No complete week of shopping is recorded yet, so there is no average to compare
                    with the configured figure.
                  </p>
                ) : (
                  <HonestyComparison
                    configuredLabel="weekly"
                    period="week"
                    configuredPence={loop.groceries.configuredPence}
                    averagePence={loop.groceries.averageWeeklyPence}
                    driftPence={loop.groceries.driftPence}
                  />
                )}
                <ul className="mt-3 space-y-1">
                  {loop.groceries.weeks.map((week) => (
                    <li
                      key={week.weekStart}
                      className="flex items-baseline justify-between gap-2 text-xs"
                    >
                      <span className="text-ink-soft">week of {week.weekStart}</span>
                      <span className="tabular-nums">{formatPence(week.actualPence)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-border p-3">
                <h3 className="text-sm font-semibold">Fuel</h3>
                <p className="text-xs text-ink-muted">
                  {loop.fuel[0] === undefined || loop.fuel[0].months.length === 0
                    ? 'no complete month recorded yet, per vehicle'
                    : `last ${loop.fuel[0].months.length} complete ${
                        loop.fuel[0].months.length === 1 ? 'month' : 'months'
                      }, per vehicle`}
                  {loop.fuel[0] !== undefined &&
                  loop.fuel[0].months.length > 0 &&
                  loop.fuel[0].months.length < 3
                    ? ` · recording began ${formatShortLocalDate(loop.groceries.recordedFrom)}, so earlier months are not counted${
                        loop.groceries.recordedFrom.endsWith('-01')
                          ? ''
                          : ' — the first month is only part recorded, so its figure may read low'
                      }`
                    : ''}
                </p>
                <div className="mt-3 space-y-4">
                  {loop.fuel.map((vehicle) => (
                    <div key={vehicle.vehicleId}>
                      <p className="text-sm font-medium">{vehicle.label}</p>
                      {vehicle.months.length === 0 ? (
                        <p className="mt-2 text-sm text-ink-soft">
                          No complete month of fuel is recorded yet, so there is no average to
                          compare with the configured figure.
                        </p>
                      ) : (
                        <HonestyComparison
                          configuredLabel="monthly"
                          period="month"
                          configuredPence={vehicle.configuredPence}
                          averagePence={vehicle.averageMonthlyPence}
                          driftPence={vehicle.driftPence}
                        />
                      )}
                      <ul className="mt-2 space-y-1">
                        {vehicle.months.map((month) => (
                          <li
                            key={month.month}
                            className="flex items-baseline justify-between gap-2 text-xs"
                          >
                            <span className="text-ink-soft">{month.month}</span>
                            <span className="tabular-nums">{formatPence(month.actualPence)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  {loop.fuel.length === 0 ? (
                    <p className="text-sm text-ink-muted">No vehicles to compare yet.</p>
                  ) : null}
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Month comparison — three months side by side                        */
/* ------------------------------------------------------------------ */

function MonthPanel({
  comparison,
  today,
  state,
  toggleShow,
  names,
}: {
  comparison: ReturnType<typeof getMonthComparisonView>;
  today: string;
  state: { month: string; show: DrillSelection | null };
  toggleShow: (selection: DrillSelection, anchor: string) => string;
  names: TargetNames;
}) {
  const { months, byParent, lines } = comparison;
  const oldest = months[0] ?? comparison.previous;
  const newest = comparison.current;
  // Only a month in this table opens line items: the lines read span exactly
  // these months, so a stale key naming another month would show an empty
  // list for a month that may well have history.
  const show = state.show;
  const drill =
    show?.kind === 'month' && months.some((month) => monthParam(month.month) === show.month)
      ? show
      : null;
  const parentIdOf = (parent: string): number | undefined =>
    lines.find((line) => line.parentName === parent)?.parentId;

  return (
    <section
      aria-labelledby="panel-month-heading"
      className="rounded-xl border border-border bg-surface p-4 shadow-sm"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="panel-month-heading" className="text-xl font-semibold">
          {oldest.label} → {newest.label}
          {newest.inProgress ? ' (in progress)' : ''}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-ink-muted">
            {oldest.summary.from} → {newest.summary.to}
          </span>
          <Link
            href="/charts#months"
            className="rounded-full border border-border-strong bg-surface px-3 py-1 text-xs font-medium text-ink-soft hover:bg-canvas"
          >
            See this as a chart →
          </Link>
        </div>
      </div>
      <p className="mb-3 text-xs text-ink-muted">
        Three months side by side, so two complete months always compare — each Change is against
        the month before it. Click any figure for the line items behind it.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {months.map((month) => {
          const selection: DrillSelection = {
            kind: 'month',
            month: monthParam(month.month),
            parentId: null,
          };
          return (
            <div key={month.label} className="rounded-lg bg-canvas px-4 py-3">
              <p className="text-xs text-ink-muted">
                {month.label}
                {month.inProgress ? ' (in progress)' : ' (complete)'}
              </p>
              <p className="text-2xl font-semibold tabular-nums">
                <a
                  href={toggleShow(selection, 'month-drill')}
                  className="hover:underline"
                  aria-current={selectionIsShown(state.show, selection)}
                >
                  {formatPence(month.summary.totalPence)}
                </a>
              </p>
            </div>
          );
        })}
      </div>
      {byParent.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="py-1.5 pr-4">Category</th>
                {months.map((month, index) => (
                  <Fragment key={month.label}>
                    <th className="py-1.5 pr-4 text-right">
                      {month.label}
                      {month.inProgress ? ' (in progress)' : ''}
                    </th>
                    {index === 0 ? null : <th className="py-1.5 pr-4 text-right">Change</th>}
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {byParent.map((row) => (
                <tr key={row.parent} className="border-t border-border-hairline">
                  <td className="py-1.5 pr-4 font-medium">{row.parent}</td>
                  {months.map((month, index) => {
                    const amount = row.amountsPence[index] ?? 0;
                    const delta = row.deltasPence[index] ?? null;
                    const parentId = parentIdOf(row.parent);
                    const selection: DrillSelection | null =
                      parentId === undefined
                        ? null
                        : {
                            kind: 'month',
                            month: monthParam(month.month),
                            parentId,
                          };
                    return (
                      <Fragment key={month.label}>
                        <td className="py-1.5 pr-4 text-right tabular-nums">
                          {selection === null ? (
                            formatPence(amount)
                          ) : (
                            <a
                              href={toggleShow(selection, 'month-drill')}
                              className="hover:underline"
                              aria-current={selectionIsShown(state.show, selection)}
                            >
                              {formatPence(amount)}
                            </a>
                          )}
                        </td>
                        {index === 0 ? null : (
                          <td
                            className={`py-1.5 pr-4 text-right font-medium tabular-nums ${
                              (delta ?? 0) > 0
                                ? 'text-danger'
                                : (delta ?? 0) < 0
                                  ? 'text-positive'
                                  : 'text-ink-muted'
                            }`}
                          >
                            {delta === null
                              ? ''
                              : delta === 0
                                ? '±0'
                                : `${delta > 0 ? '+' : '−'}${formatPence(Math.abs(delta))}`}
                          </td>
                        )}
                      </Fragment>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 text-sm text-ink-muted">No spending recorded in either month yet.</p>
      )}
      {drill !== null ? (
        <LineItemsCard
          id="month-drill"
          heading={monthDrillHeading(drill, comparison)}
          table={drillMonth(lines, drill.month, drill.parentId)}
          openHref={purchasesHref({
            ...monthHrefRange(drill.month, today),
            ...(drill.parentId === null ? {} : { categoryIds: [drill.parentId] }),
          })}
          closeHref={toggleShow(drill, 'month-drill')}
          names={names}
        />
      ) : null}
    </section>
  );
}

function selectionIsShown(
  show: DrillSelection | null,
  selection: DrillSelection,
): 'true' | undefined {
  return show !== null && drillKey(show) === drillKey(selection) ? 'true' : undefined;
}

/** The 'YYYY-MM' key's window on Purchases, never reaching past today. */
function monthHrefRange(month: string, today: string): { from: string; to: string } {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const from = `${month}-01`;
  const to = `${month}-${String(lastDay).padStart(2, '0')}`;
  return { from, to: to > today ? today : to };
}

function monthDrillHeading(
  drill: Extract<DrillSelection, { kind: 'month' }>,
  comparison: ReturnType<typeof getMonthComparisonView>,
): string {
  const monthLabel =
    comparison.months.find((month) => monthParam(month.month) === drill.month)?.label ??
    drill.month;
  const parentName =
    drill.parentId === null
      ? null
      : (comparison.lines.find((line) => line.parentId === drill.parentId)?.parentName ?? null);
  return `Line items: ${parentName ?? 'All categories'} — ${monthLabel}`;
}

/* ------------------------------------------------------------------ */
/* Inline line items — the transactions behind a figure                */
/* ------------------------------------------------------------------ */

function LineItemsCard({
  id,
  heading,
  table,
  openHref,
  closeHref,
  names,
}: {
  /** The anchor the figure's link scrolls to, e.g. `month-drill`. */
  id: string;
  heading: string;
  table: DrillTable;
  openHref: string;
  closeHref: string;
  names: TargetNames;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="mt-4 scroll-mt-24 rounded-xl border border-border bg-canvas p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={`${id}-heading`} className="text-sm font-semibold">
          {heading}
        </h3>
        <p className="text-sm tabular-nums text-ink-soft">
          {formatPence(table.totalPence)} · {table.purchaseCount}{' '}
          {table.purchaseCount === 1 ? 'purchase' : 'purchases'}
          {table.rows.length !== table.purchaseCount
            ? ` · ${table.rows.length} ${table.rows.length === 1 ? 'line' : 'lines'}`
            : ''}
        </p>
      </div>
      {table.rows.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">Nothing was recorded here.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-[11px] uppercase tracking-wide text-ink-muted">
              <tr>
                <th scope="col" className="py-1 pr-3 font-medium">
                  Date
                </th>
                <th scope="col" className="py-1 pr-3 font-medium">
                  Where
                </th>
                <th scope="col" className="py-1 pr-3 font-medium">
                  Category
                </th>
                <th scope="col" className="py-1 pr-3 font-medium">
                  For
                </th>
                <th scope="col" className="py-1 pr-0 text-right font-medium">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row) => (
                <tr
                  key={`${row.purchaseId}-${row.parentName}-${row.childName}-${row.targetKind}-${row.targetId ?? 'x'}`}
                  className="border-t border-border-hairline align-top"
                >
                  <td className="whitespace-nowrap py-1 pr-3">
                    {formatShortLocalDate(row.occurredDate)}
                  </td>
                  <td className="py-1 pr-3">{row.supplierName ?? row.note ?? '—'}</td>
                  <td className="py-1 pr-3 text-ink-soft">
                    {row.childName}
                    {row.spread ? (
                      <span className="ml-1 text-ink-muted">
                        (annual ÷ 12
                        {row.countedPence !== row.paidPence
                          ? ` of ${formatPence(row.paidPence)} paid`
                          : ''}
                        )
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1 pr-3 text-ink-soft">
                    {targetLabel(row, names) === 'household'
                      ? 'Household'
                      : targetLabel(row, names)}
                  </td>
                  <td className="py-1 pr-0 text-right tabular-nums">
                    {formatPence(row.countedPence)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {table.hasSpreadRows ? (
        <p className="mt-2 text-xs text-ink-muted">
          An annual vehicle payment counts as ÷ 12 in each of the twelve months it covers (decision
          190). Each such row shows the share that counts toward the figure above; the full payment
          is recorded on its own date.
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <Link href={openHref} className="font-medium text-accent hover:underline">
          Open these purchases →
        </Link>
        <Link href={closeHref} className="font-medium text-ink-soft hover:underline">
          Close line items
        </Link>
        <span className="text-ink-muted">
          A matching purchase comes back whole, with all of its lines.
        </span>
      </div>
    </section>
  );
}

function PersonDrillCard({
  selection,
  table,
  personLabel,
  monthLabel,
  parentName,
  toggleShow,
  names,
  today,
}: {
  selection: Extract<DrillSelection, { kind: 'person' }>;
  table: DrillTable;
  personLabel: string;
  monthLabel: string;
  parentName: string | null;
  toggleShow: (selection: DrillSelection, anchor: string) => string;
  names: TargetNames;
  today: string;
}) {
  return (
    <LineItemsCard
      id="person-drill"
      heading={`Line items: ${parentName === null ? `all for ${personLabel}` : `${parentName} for ${personLabel}`} — ${monthLabel}`}
      table={table}
      openHref={purchasesHref({
        ...monthHrefRange(selection.month, today),
        targetKind: 'person',
        targetId: selection.personId,
        ...(selection.parentId === null ? {} : { categoryIds: [selection.parentId] }),
      })}
      closeHref={toggleShow(selection, 'person-drill')}
      names={names}
    />
  );
}

function VehicleDrillCard({
  selection,
  table,
  vehicleLabel,
  childName,
  toggleShow,
  names,
  today,
}: {
  selection: Extract<DrillSelection, { kind: 'vehicle' }>;
  table: DrillTable;
  vehicleLabel: string;
  childName: string | null;
  toggleShow: (selection: DrillSelection, anchor: string) => string;
  names: TargetNames;
  today: string;
}) {
  const windowLabel =
    selection.window === 'month'
      ? 'this month'
      : selection.window === 'previous'
        ? 'the previous month'
        : 'the last 12 months';
  const range = vehicleDrillWindow(selection.window, today);
  return (
    <LineItemsCard
      id="vehicle-drill"
      heading={`Line items: ${childName === null ? vehicleLabel : `${childName} — ${vehicleLabel}`} (${windowLabel})`}
      table={table}
      openHref={purchasesHref({
        from: range.from,
        to: range.to,
        targetKind: 'vehicle',
        targetId: selection.vehicleId,
        ...(selection.childCategoryId === null ? {} : { categoryIds: [selection.childCategoryId] }),
      })}
      closeHref={toggleShow(selection, 'vehicle-drill')}
      names={names}
    />
  );
}

function HonestyComparison({
  configuredLabel,
  period,
  configuredPence,
  averagePence,
  driftPence,
}: {
  /** "weekly" / "monthly" — used in the card labels. */
  configuredLabel: string;
  /** "week" / "month" — used in the sentence ("per week"). */
  period: 'week' | 'month';
  configuredPence: number | null;
  averagePence: number;
  driftPence: number | null;
}) {
  return (
    <div className="mt-2">
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded bg-surface px-3 py-2 ring-1 ring-border">
          <p className="text-xs text-ink-muted">Configured {configuredLabel}</p>
          <p className="font-semibold tabular-nums">
            {configuredPence === null ? 'not set' : formatPence(configuredPence)}
          </p>
        </div>
        <div className="rounded bg-surface px-3 py-2 ring-1 ring-border">
          <p className="text-xs text-ink-muted">Actual average {configuredLabel}</p>
          <p className="font-semibold tabular-nums">{formatPence(averagePence)}</p>
        </div>
      </div>
      {driftPence === null ? (
        <p className="mt-2 text-xs text-ink-muted">
          Set the configured figure in Settings to see the drift.
        </p>
      ) : (
        <p
          className={`mt-2 rounded px-3 py-2 text-sm font-medium ${
            driftPence > 0
              ? 'bg-warning-50 text-warning-900 ring-1 ring-warning-200'
              : 'bg-positive-50 text-positive-900 ring-1 ring-positive-200'
          }`}
        >
          {driftPence === 0
            ? 'Your configured figure matches recent actuals exactly.'
            : driftPence > 0
              ? `You are spending about ${formatPence(driftPence)} more per ${period} than the ${formatPence(
                  configuredPence ?? 0,
                )} you configured. Consider raising the figure — or cutting back.`
              : `You are spending about ${formatPence(Math.abs(driftPence))} less per ${period} than the ${formatPence(
                  configuredPence ?? 0,
                )} you configured. The projection is being pessimistic.`}
        </p>
      )}
    </div>
  );
}

/** One vehicle's mpg card (SPEC §16.6, v0.10.0 — decision 140). */
function FuelEconomyCard({ vehicle }: { vehicle: VehicleFuelEconomyView }) {
  return (
    <div
      className="rounded-lg bg-canvas p-3"
      role="group"
      aria-label={`Fuel economy for ${vehicle.label}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">{vehicle.label}</p>
        {vehicle.latest !== null ? (
          <p className="text-lg font-semibold tabular-nums">
            {formatMpg(vehicle.latest.mpg)}
            <span className="ml-1 text-xs font-normal text-ink-muted">latest</span>
          </p>
        ) : (
          <p className="text-xs text-ink-muted">no measured stretch yet</p>
        )}
      </div>
      <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-ink-soft">
        <dt>Last 12 months</dt>
        <dd className="text-right tabular-nums">
          {vehicle.lastYear === null
            ? '—'
            : `${formatMpg(vehicle.lastYear.mpg)} over ${formatMiles(vehicle.lastYear.miles)} miles`}
        </dd>
        <dt>Fuel cost per mile</dt>
        <dd className="text-right tabular-nums">
          {vehicle.lastYear === null ? '—' : `${vehicle.lastYear.pencePerMile.toFixed(1)}p`}
        </dd>
        <dt>Latest price</dt>
        <dd className="text-right tabular-nums">
          {vehicle.latestPrice === null
            ? '—'
            : `${vehicle.latestPrice.pencePerLitre.toFixed(1)}p/L (${vehicle.latestPrice.occurredDate})`}
        </dd>
      </dl>
      {vehicle.latest?.suspect ? (
        <p className="mt-1 text-xs font-semibold text-warning">
          The latest figure looks unusual — worth checking the readings.
        </p>
      ) : null}
      {vehicle.fillsWithoutFullTank !== null ? (
        <p className="mt-2 rounded-md bg-warning-50 p-2 text-xs font-semibold text-warning-900">
          No full tank marked in the last {vehicle.fillsWithoutFullTank} fills — mpg needs one. Tick
          “Filled to full” next time the pump clicks off (or fix a past fill from Purchases).
        </p>
      ) : null}
      {vehicle.missing.length > 0 ? (
        <div className="mt-2 rounded-md bg-warning-50 p-2 text-xs text-warning-900">
          <p className="font-semibold">
            {vehicle.missing.length === 1
              ? '1 recent fill is missing details'
              : `${vehicle.missing.length} recent fills are missing details`}
          </p>
          <ul className="mt-1 space-y-0.5">
            {vehicle.missing.slice(0, 5).map((entry) => (
              <li key={entry.purchaseId}>
                <Link href={`/purchases#purchase-${entry.purchaseId}`} className="underline">
                  {entry.occurredDate} · {formatPence(entry.fuelPence)}
                </Link>{' '}
                — add {entry.missing.join(' & ')}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {vehicle.recent.length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-medium text-ink-soft">
            Recent fills ({vehicle.recent.length} of {vehicle.fillCount})
          </summary>
          <ul className="mt-1 space-y-1 text-xs">
            {vehicle.recent.map(({ fill, closed, pencePerLitre }) => (
              <li key={fill.purchaseId} className="text-ink-soft">
                <span className="tabular-nums">
                  {fill.occurredDate} · {formatPence(fill.fuelPence)}
                  {fill.fuelMillilitres !== null
                    ? ` · ${formatLitres(fill.fuelMillilitres)} L`
                    : ''}
                  {pencePerLitre !== null ? ` · ${pencePerLitre.toFixed(1)}p/L` : ''}
                  {fill.odometerMiles !== null ? ` · ${formatMiles(fill.odometerMiles)} mi` : ''}
                  {fill.fullTank ? '' : ' · part fill'}
                </span>
                {closed !== null ? (
                  <span className="block text-ink-muted">{describeClosure(closed)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : (
        <p className="mt-2 text-xs text-ink-muted">No fuel recorded for this vehicle yet.</p>
      )}
    </div>
  );
}
