import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CHART_COLOURS, ChartFigure, ChartLegend, ChartScroller } from '@/components/charts';
import { EnergyUsageChart, formatAxisKwh } from '@/components/charts/energy-usage-chart';
import { EnergySetupForm, EnergyTariffForm } from '@/components/energy-forms';
import { householdContextFromRequest } from '@/lib/auth/next';
import { formatPence } from '@/lib/money';
import { getEnergyView, type EnergyBillRow, type EnergyTariffCard } from '@/lib/records/energy';
import {
  comparisonUsage,
  compareTariffs,
  ENERGY_FUELS,
  exitFeeLive,
  formatKwh,
  formatKwhLabel,
  formatReading,
  FUEL_LABEL,
  recordedUsage,
  TYPICAL_ANNUAL_KWH,
  usageBasisLabel,
  type EnergyMonth,
  type EnergyTariff,
} from '@/lib/records/energy-usage';
import { toLocalDateString } from '@/lib/time';

export const dynamic = 'force-dynamic';

interface SearchParams {
  /** The candidate's rates, typed to see what a switch would do (never saved). */
  cmpFuel?: string;
  cmpUnit?: string;
  cmpStanding?: string;
  cmpExit?: string;
}

/**
 * Energy (issue 118, v1.44.0; SPEC §29) — the household's gas and electricity
 * over time, and what a switch would do to the same usage.
 *
 * Three rules shape the page, all of them borrowed from the fuel-economy work
 * that preceded it:
 *
 * 1. **Missing is not zero.** A month with no bill is a gap in the chart and a
 *    line in the list; nothing is inferred from the months either side.
 * 2. **The app's arithmetic is the household's arithmetic.** Every cost is the
 *    bill's own unit rate and standing charge applied to the bill's own kWh,
 *    with 5% VAT added per fuel — never a guess at what the supplier charged.
 * 3. **No recommendations.** The comparison shows what the same usage would
 *    cost on another tariff and says nothing about whether to take it.
 */
export default async function EnergyPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await householdContextFromRequest();
  if (user === null) redirect('/unauthorized');

  const params = await searchParams;
  const today = toLocalDateString(new Date());
  const view = getEnergyView(user.db, today);
  const usage = recordedUsage(view.bills);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Energy</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Gas and electricity over time
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-soft">
          The kWh from each bill, what it cost, and what a different tariff would cost on the same
          usage. The figures come from the bills you type in — the app reads no meter, contacts no
          supplier, and never guesses a month you have not recorded.
        </p>
      </header>

      <div className="space-y-6">
        <section
          aria-labelledby="setup-heading"
          className="rounded-xl border border-border bg-surface p-4 shadow-sm"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="setup-heading" className="text-lg font-semibold">
              Your meters and tariff
            </h2>
            <Link href="/contracts" className="text-xs sf-link-arrow">
              Switch dates &amp; reminders →
            </Link>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-ink-soft">
            Energy details are recorded on the purchase its bill was paid by — the direct debit
            under{' '}
            <span className="font-medium">{view.energyCategoryLabel ?? 'Utilities / Energy'}</span>.
            Nothing is asked for until you open the block on that row.
          </p>
          <EnergySetupForm
            setup={view.setup}
            categoryOptions={view.categoryOptions}
            energyCategoryLabel={view.energyCategoryLabel}
          />
          {view.energyCategoryId === null ? (
            <p className="mt-3 rounded-lg border border-warning-300 bg-warning-50 px-3 py-2 text-sm text-warning-900">
              No energy category is set and the default <em>Utilities / Energy</em> does not exist
              in this household, so no purchase can carry energy details yet. Choose the category
              that means energy above, or add it in Settings → Categories.
            </p>
          ) : null}
        </section>

        {!view.hasBills ? (
          <EmptyState />
        ) : (
          <>
            <AtAGlance usage={usage} bills={view.bills} />
            <UsageChart months={view.months} />
            <BillList bills={view.bills} />
          </>
        )}

        <TariffSection cards={view.tariffs} today={today} />
        <ComparisonSection view={view} params={params} today={today} />
        <HonestyPanel />
      </div>
    </main>
  );
}

/** What the page does, and the one thing to do first — never a setup wall. */
function EmptyState() {
  return (
    <section
      aria-labelledby="empty-heading"
      className="rounded-xl border border-dashed border-border-strong bg-surface p-6"
    >
      <h2 id="empty-heading" className="text-lg font-semibold">
        Nothing recorded yet
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-ink-soft">
        Find the purchase your gas or electricity was paid by on{' '}
        <Link href="/purchases" className="sf-link">
          Purchases
        </Link>{' '}
        — a direct debit, or one you entered by hand — and open{' '}
        <span className="font-medium">Energy details</span> beneath it. Type the kWh from the bill
        and, if you want the chart to land in the right month, the dates the bill covers. That is
        all this page needs for its first bar.
      </p>
      <p className="mt-2 text-sm text-ink-soft">
        Reading the meter is worth doing only when the meter is smart: the app asks for readings on
        the fuels you have ticked above, and never for the others.
      </p>
    </section>
  );
}

function AtAGlance({
  usage,
  bills,
}: {
  usage: ReturnType<typeof recordedUsage>;
  bills: readonly EnergyBillRow[];
}) {
  const windowDays = usage.daysCovered;
  const gasPerDay = windowDays > 0 ? usage.gasWh / windowDays : null;
  const electricPerDay = windowDays > 0 ? usage.electricWh / windowDays : null;
  const spentPence = bills.reduce((total, bill) => total + (bill.energyPence ?? 0), 0);
  return (
    <section
      aria-labelledby="glance-heading"
      className="rounded-xl border border-border bg-surface p-4 shadow-sm"
    >
      <h2 id="glance-heading" className="text-lg font-semibold">
        Everything recorded so far
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        {bills.length} {bills.length === 1 ? 'bill' : 'bills'}
        {windowDays > 0
          ? `, covering ${windowDays} days`
          : ' — no billing period recorded yet, so nothing is averaged'}
        .
      </p>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="Gas used" value={formatKwhLabel(usage.gasWh)} note={perDay(gasPerDay)} />
        <Figure
          label="Electricity used"
          value={formatKwhLabel(usage.electricWh)}
          note={perDay(electricPerDay)}
        />
        <Figure
          label="Paid under Utilities / Energy"
          value={formatPence(spentPence)}
          note="The direct debits recorded, not the supplier's balance."
        />
        <Figure
          label="Typical household"
          value={`${TYPICAL_ANNUAL_KWH.gas.toLocaleString('en-GB')} gas · ${TYPICAL_ANNUAL_KWH.electric.toLocaleString('en-GB')} electric`}
          note="Ofgem's typical medium household, kWh a year. A yardstick, not a target."
        />
      </dl>
    </section>
  );
}

function perDay(whPerDay: number | null): string {
  if (whPerDay === null) return 'No period to average over';
  return `${formatKwh(Math.round(whPerDay))} kWh a day on average`;
}

function Figure({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-lg bg-canvas px-3 py-2">
      <dt className="text-xs font-medium text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
      <p className="mt-0.5 text-xs text-ink-muted">{note}</p>
    </div>
  );
}

/** Month label for the axis: `Oct`, with the year as the hover hint. */
function monthLabel(month: string): { short: string; long: string } {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const date = new Date(Date.UTC(year, monthNumber - 1, 1));
  return {
    short: date.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }),
    long: date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
  };
}

function UsageChart({ months }: { months: readonly EnergyMonth[] }) {
  const bands = months.map((month) => {
    const label = monthLabel(month.month);
    return {
      key: month.month,
      label: label.short,
      labelHint: label.long,
      gasKwh: month.gasWh === null ? null : Math.round(month.gasWh / 1000),
      electricKwh: month.electricWh === null ? null : Math.round(month.electricWh / 1000),
    };
  });
  const series = [
    { key: 'gas' as const, label: 'Gas', fill: CHART_COLOURS.bar },
    { key: 'electric' as const, label: 'Electricity', fill: CHART_COLOURS.line },
  ];
  const busiest = months.reduce(
    (max, month) => Math.max(max, (month.gasWh ?? 0) / 1000 + (month.electricWh ?? 0) / 1000),
    0,
  );
  const recorded = months.filter((month) => month.bills > 0).length;
  const headline =
    recorded === 0
      ? 'No month in the last year has a bill recorded'
      : `${recorded} of the last 12 months has a bill · the busiest used ${Math.round(busiest)} kWh`;

  const columns = [
    { key: 'month', label: 'Month' },
    { key: 'gas', label: 'Gas kWh', align: 'right' as const },
    { key: 'electric', label: 'Electricity kWh', align: 'right' as const },
    { key: 'paid', label: 'Paid', align: 'right' as const },
    { key: 'bills', label: 'Bills', align: 'right' as const },
  ];
  const rows = months.map((month) => {
    const label = monthLabel(month.month);
    return {
      key: month.month,
      muted: month.bills === 0,
      cells: [
        label.long,
        month.gasWh === null ? 'no bill' : formatKwh(month.gasWh),
        month.electricWh === null ? '—' : formatKwh(month.electricWh),
        month.pence === null ? '—' : formatPence(month.pence),
        month.bills === 0 ? '—' : String(month.bills),
      ],
    };
  });

  return (
    <section
      aria-labelledby="chart-heading"
      className="rounded-xl border border-border bg-surface p-4 shadow-sm"
    >
      <h2 id="chart-heading" className="text-lg font-semibold">
        Month by month
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-ink-soft">
        A bill is drawn in the month its period <span className="font-medium">ends</span> — a bill
        covering 18 September to 18 October is October&rsquo;s, even though the money may have left
        in either month. A month with no bill has no bar at all.
      </p>
      <div className="mt-3">
        <ChartFigure
          chart="energy"
          variant="laptop"
          headline={headline}
          basis="Reported"
          caption={`The kWh you typed in from each bill, by the month the billing period ends. Months without a bill are left blank rather than drawn as zero. The exact periods, readings and prices are in the bill list below.`}
          columns={columns}
          rows={rows}
          footer={
            <ChartLegend
              items={[
                { key: 'gas', label: 'Gas', fill: CHART_COLOURS.bar },
                { key: 'electric', label: 'Electricity', fill: CHART_COLOURS.line },
              ]}
            />
          }
        >
          <ChartScroller label="the monthly energy chart">
            <EnergyUsageChart
              bands={bands}
              series={series}
              idPrefix="energy-months-laptop"
              width={720}
              height={280}
              ariaLabel={`Gas and electricity used each month, in kWh. ${headline}. Months with no bill are left blank.`}
            />
          </ChartScroller>
        </ChartFigure>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        Axis figures are kW·h per month ({formatAxisKwh(500)} is 500 kWh). The numbers behind every
        bar are in “Show the numbers”.
      </p>
    </section>
  );
}

function BillList({ bills }: { bills: readonly EnergyBillRow[] }) {
  return (
    <section
      aria-labelledby="bills-heading"
      className="rounded-xl border border-border bg-surface p-4 shadow-sm"
    >
      <h2 id="bills-heading" className="text-lg font-semibold">
        Every bill
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        Newest first, with what was recorded and what the app noticed. A note never blocks a save —
        you know about meter exchanges and estimated bills; the app only says what it sees.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[46rem] text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wide text-ink-muted">
            <tr>
              <th scope="col" className="py-1 pr-3 font-medium">
                Period
              </th>
              <th scope="col" className="py-1 pr-3 font-medium">
                Gas
              </th>
              <th scope="col" className="py-1 pr-3 font-medium">
                Electricity
              </th>
              <th scope="col" className="py-1 pr-3 text-right font-medium">
                Paid
              </th>
              <th scope="col" className="py-1 pr-3 text-right font-medium">
                p/kWh
              </th>
              <th scope="col" className="py-1 pr-3 font-medium">
                Recorded
              </th>
            </tr>
          </thead>
          <tbody>
            {bills.map((bill) => (
              <tr key={bill.purchaseId} className="border-t border-border-hairline align-top">
                <td className="py-1.5 pr-3">
                  {bill.periodStart === null || bill.periodEnd === null ? (
                    <span className="text-ink-muted">no period</span>
                  ) : (
                    <>
                      <span className="tabular-nums">
                        {bill.periodStart} → {bill.periodEnd}
                      </span>
                      <span className="block text-xs text-ink-muted">{bill.days} days</span>
                    </>
                  )}
                </td>
                <td className="py-1.5 pr-3 tabular-nums">
                  {bill.gasWh === null ? (
                    <span className="text-ink-faint">—</span>
                  ) : (
                    formatKwhLabel(bill.gasWh)
                  )}
                  {bill.gasReadingStart !== null && bill.gasReadingEnd !== null ? (
                    <span className="block text-xs text-ink-muted">
                      {formatReading(bill.gasReadingStart)} → {formatReading(bill.gasReadingEnd)}
                    </span>
                  ) : null}
                </td>
                <td className="py-1.5 pr-3 tabular-nums">
                  {bill.electricWh === null ? (
                    <span className="text-ink-faint">—</span>
                  ) : (
                    formatKwhLabel(bill.electricWh)
                  )}
                  {bill.electricFromReadings ? (
                    <span className="block text-xs text-ink-muted">from the readings</span>
                  ) : null}
                  {bill.electricReadingStart !== null && bill.electricReadingEnd !== null ? (
                    <span className="block text-xs text-ink-muted">
                      {formatReading(bill.electricReadingStart)} →{' '}
                      {formatReading(bill.electricReadingEnd)}
                    </span>
                  ) : null}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">
                  {bill.energyPence === null ? '—' : formatPence(bill.energyPence)}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">
                  {bill.effectiveMilliPencePerKwh === null
                    ? '—'
                    : (bill.effectiveMilliPencePerKwh / 1000).toFixed(1)}
                </td>
                <td className="py-1.5 pr-3">
                  <Link
                    href={`/purchases?from=${bill.occurredDate}&to=${bill.occurredDate}#purchase-${bill.purchaseId}`}
                    className="sf-link"
                  >
                    {bill.occurredDate}
                  </Link>
                  {bill.notes.length > 0 ? (
                    <ul className="mt-0.5 space-y-0.5 text-xs text-ink-muted">
                      {bill.notes.map((note) => (
                        <li key={`${bill.purchaseId}-${note.kind}-${note.message}`}>
                          {note.message}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TariffSection({ cards, today }: { cards: readonly EnergyTariffCard[]; today: string }) {
  return (
    <section
      aria-labelledby="tariff-heading"
      className="rounded-xl border border-border bg-surface p-4 shadow-sm"
    >
      <h2 id="tariff-heading" className="text-lg font-semibold">
        Your tariff
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-ink-soft">
        One saved tariff per fuel, typed from the bill. The annual figure applies it to the usage
        the app knows about, and says which usage that was.
      </p>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        {cards.map((card) => (
          <div key={card.fuel} className="rounded-lg border border-border-hairline p-3">
            <h3 className="text-sm font-semibold">{FUEL_LABEL[card.fuel]}</h3>
            {card.error !== null ? (
              <p className="mt-1 text-sm text-danger">{card.error}</p>
            ) : card.tariff === null ? (
              <p className="mt-1 text-sm text-ink-soft">
                No tariff saved yet. Add the unit rate and standing charge from a bill and the
                comparison below starts working.
              </p>
            ) : (
              <TariffFacts tariff={card.tariff} card={card} today={today} />
            )}
            <EnergyTariffForm fuel={card.fuel} tariff={card.tariff} label={FUEL_LABEL[card.fuel]} />
          </div>
        ))}
      </div>
    </section>
  );
}

function TariffFacts({
  tariff,
  card,
  today,
}: {
  tariff: EnergyTariff;
  card: EnergyTariffCard;
  today: string;
}) {
  const fee = exitFeeLive(tariff, today);
  const expired = tariff.fixedUntil !== null && today >= tariff.fixedUntil;
  return (
    <div className="mt-1 text-sm">
      <p className="font-medium">
        {tariff.supplier} · {tariff.tariffName}
      </p>
      <p className="text-ink-soft">
        {tariff.unitRateMilliPencePerKwh / 1000} p/kWh ·{' '}
        {tariff.standingChargeMilliPencePerDay / 1000} p a day
        <span className="text-ink-muted"> (both before VAT)</span>
      </p>
      {card.annual !== null ? (
        <p className="mt-1">
          <span className="font-semibold tabular-nums">{formatPence(card.annual.totalPence)}</span>{' '}
          a year on this tariff
          <span className="text-ink-muted">
            {' '}
            — from {formatKwh(card.annualWh ?? 0)} kWh (
            {card.annualBasis === 'bills'
              ? `${card.annualDays} days of your bills`
              : "the bill's estimated annual usage"}
            )
          </span>
        </p>
      ) : (
        <p className="mt-1 text-xs text-ink-muted">
          No usage to apply it to yet — record a bill, or add the estimated annual usage on the
          purchase.
        </p>
      )}
      {tariff.fixedUntil !== null ? (
        <p className="mt-1 text-xs text-ink-soft">
          {expired
            ? `The guaranteed price ended on ${tariff.fixedUntil}.`
            : `Price guaranteed until ${tariff.fixedUntil}.`}{' '}
          {fee > 0
            ? `Leaving before then costs ${formatPence(fee)}.`
            : tariff.exitFeePence !== null && tariff.exitFeePence > 0
              ? 'The early exit fee no longer applies.'
              : 'No early exit fee.'}
        </p>
      ) : null}
      {tariff.notes === '' ? null : <p className="mt-1 text-xs text-ink-muted">{tariff.notes}</p>}
    </div>
  );
}

/**
 * The switching arithmetic (never a recommendation).
 *
 * The candidate is typed, not saved: a saved quote would rot the moment the
 * price cap moved, and the household can see the whole working here. The
 * usage on both sides is identical, so the only thing that changes is the
 * tariff.
 */
function ComparisonSection({
  view,
  params,
  today,
}: {
  view: ReturnType<typeof getEnergyView>;
  params: SearchParams;
  today: string;
}) {
  const fuel = params.cmpFuel === 'electric' ? 'electric' : 'gas';
  const usageFor = comparisonUsage(usage(view), fuel);
  const card = view.tariffs.find((entry) => entry.fuel === fuel) ?? null;
  const submitted = params.cmpUnit !== undefined || params.cmpStanding !== undefined;

  return (
    <section
      aria-labelledby="compare-heading"
      className="rounded-xl border border-border bg-surface p-4 shadow-sm"
    >
      <h2 id="compare-heading" className="text-lg font-semibold">
        What would another tariff cost?
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-ink-soft">
        Type a quote you have been given. The app applies it to the same usage it applies to your
        own tariff, so the difference is the tariff and nothing else. Nothing is saved and nothing
        is recommended — the words are the arithmetic, not advice.
      </p>
      <form method="get" className="mt-3 flex flex-wrap items-end gap-2 text-sm">
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-soft">
          Fuel
          <select
            name="cmpFuel"
            defaultValue={fuel}
            className="rounded border border-border-strong bg-surface px-2.5 py-1.5 text-sm focus:border-border-emphasis focus:outline-none"
          >
            {ENERGY_FUELS.map((entry) => (
              <option key={entry} value={entry}>
                {FUEL_LABEL[entry]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-soft">
          Unit rate (p/kWh, before VAT)
          <input
            name="cmpUnit"
            inputMode="decimal"
            defaultValue={params.cmpUnit ?? ''}
            placeholder="e.g. 4.4"
            className="rounded border border-border-strong bg-surface px-2.5 py-1.5 text-sm tabular-nums focus:border-border-emphasis focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-soft">
          Standing charge (p/day, before VAT)
          <input
            name="cmpStanding"
            inputMode="decimal"
            defaultValue={params.cmpStanding ?? ''}
            placeholder="e.g. 30"
            className="rounded border border-border-strong bg-surface px-2.5 py-1.5 text-sm tabular-nums focus:border-border-emphasis focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-soft">
          Their exit fee (£, optional)
          <input
            name="cmpExit"
            inputMode="decimal"
            defaultValue={params.cmpExit ?? ''}
            placeholder="e.g. 0"
            className="rounded border border-border-strong bg-surface px-2.5 py-1.5 text-sm tabular-nums focus:border-border-emphasis focus:outline-none"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-till px-3 py-1.5 text-sm font-medium text-till-ink"
        >
          Work it out
        </button>
      </form>

      {!submitted ? null : card === null || card.tariff === null ? (
        <p className="mt-3 text-sm text-ink-soft">
          Save your own {FUEL_LABEL[fuel].toLowerCase()} tariff above first — the comparison needs a
          “before” as well as an “after”.
        </p>
      ) : usageFor === null ? (
        <p className="mt-3 text-sm text-ink-soft">
          There is no {FUEL_LABEL[fuel].toLowerCase()} usage to compare on yet: record a bill, or
          add the estimated annual usage printed on one. The app will not make a year out of a
          month.
        </p>
      ) : (
        <ComparisonResult
          fuel={fuel}
          current={card.tariff}
          unitText={params.cmpUnit ?? ''}
          standingText={params.cmpStanding ?? ''}
          exitText={params.cmpExit ?? ''}
          usageWh={usageFor.wh}
          basis={usageFor.basis}
          days={usageFor.days}
          today={today}
        />
      )}
    </section>
  );
}

function usage(view: ReturnType<typeof getEnergyView>) {
  return recordedUsage(view.bills);
}

function ComparisonResult({
  fuel,
  current,
  unitText,
  standingText,
  exitText,
  usageWh,
  basis,
  days,
  today,
}: {
  fuel: 'gas' | 'electric';
  current: EnergyTariff;
  unitText: string;
  standingText: string;
  exitText: string;
  usageWh: number;
  basis: 'bills' | 'estimate';
  days: number | null;
  today: string;
}) {
  const unit = Number(unitText.replace(',', '.'));
  const standing = Number(standingText.replace(',', '.'));
  if (!Number.isFinite(unit) || !Number.isFinite(standing) || unit <= 0 || standing < 0) {
    return (
      <p className="mt-3 text-sm text-danger">
        Enter the candidate&apos;s unit rate and standing charge as numbers (4.4 and 30, not £
        signs).
      </p>
    );
  }
  const exit = exitText.trim() === '' ? 0 : Math.round(Number(exitText.replace(',', '.')) * 100);
  const result = compareTariffs({
    fuel,
    usageWh,
    basis,
    days,
    current,
    candidate: {
      supplier: 'Candidate',
      tariffName: 'Typed in',
      unitRateMilliPencePerKwh: Math.round(unit * 1000),
      standingChargeMilliPencePerDay: Math.round(standing * 1000),
    },
    today,
  });
  const cheaper = result.differencePence < 0;
  const same = result.differencePence === 0;
  return (
    <div className="mt-3 rounded-lg bg-canvas p-3 text-sm" data-energy-comparison={fuel}>
      <p className="font-medium">
        {same ? (
          <>The two tariffs cost the same on this usage, to the penny.</>
        ) : (
          <>
            {formatPence(Math.abs(result.differencePence))} a year {cheaper ? 'cheaper' : 'dearer'}{' '}
            on the same usage
          </>
        )}
        <span className="block text-xs font-normal text-ink-muted">
          {usageBasisLabel(result)} — {formatKwh(result.usageWh)} kWh a year
        </span>
      </p>
      <dl className="mt-2 grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium text-ink-muted">Your tariff</dt>
          <dd className="tabular-nums">{formatPence(result.currentAnnual.totalPence)} a year</dd>
          <dd className="text-xs text-ink-muted">
            {formatPence(result.currentAnnual.unitsPence)} units +{' '}
            {formatPence(result.currentAnnual.standingPence)} standing,{' '}
            {formatPence(result.currentAnnual.vatPence)} VAT
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-ink-muted">The quote you typed</dt>
          <dd className="tabular-nums">{formatPence(result.candidateAnnual.totalPence)} a year</dd>
          <dd className="text-xs text-ink-muted">
            {formatPence(result.candidateAnnual.unitsPence)} units +{' '}
            {formatPence(result.candidateAnnual.standingPence)} standing,{' '}
            {formatPence(result.candidateAnnual.vatPence)} VAT
          </dd>
        </div>
      </dl>
      {result.currentExitFeePence > 0 ? (
        <p className="mt-2 text-xs text-ink-soft">
          Leaving your current tariff today costs {formatPence(result.currentExitFeePence)}
          {result.paybackMonths === null
            ? ' — and on these figures the switch would not pay that back.'
            : `, which this saving would cover in about ${result.paybackMonths} ${result.paybackMonths === 1 ? 'month' : 'months'}`}
          .{' '}
          {exit > 0
            ? `The quote's own exit fee of ${formatPence(exit)} is a later question, not this year's cost.`
            : null}
        </p>
      ) : null}
      <p className="mt-2 text-xs text-ink-muted">
        Both sides use the same {formatKwh(result.usageWh)} kWh and a 365-day year for standing
        charges; VAT is 5% on each fuel, rounded once. This is arithmetic on your figures, not
        advice.
      </p>
    </div>
  );
}

function HonestyPanel() {
  return (
    <section
      aria-labelledby="honesty-heading"
      className="rounded-xl border border-dashed border-border-strong bg-surface p-4"
    >
      <h2 id="honesty-heading" className="text-sm font-semibold">
        What this page cannot see
      </h2>
      <ul className="mt-1 space-y-1 text-sm text-ink-soft">
        <li>
          It knows the direct debit you recorded and the kWh you typed in — not your supplier&apos;s
          balance, credit or what a bill said beyond what you entered.
        </li>
        <li>
          A bill priced on an estimated reading is only as good as that estimate; a real reading is
          the only cure, which is why the app only asks for one on a smart meter.
        </li>
        <li>
          Weather moves gas usage more than anything else you do — two cold weeks are not a trend,
          and the app never claims one.
        </li>
        <li>
          A tariff compared today is a snapshot: prices change, and the quote you were given may
          have closed.
        </li>
      </ul>
      <p className="mt-2 text-xs text-ink-muted">
        Read more in the guide:{' '}
        <Link href="/guide#energy" className="sf-link">
          how the energy page works
        </Link>
        .
      </p>
    </section>
  );
}
