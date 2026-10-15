import { SpendingPresetSelect } from '@/components/spending-presets';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  BarChart,
  CHART_COLOURS,
  ChartFigure,
  ChartLegend,
  ChartScroller,
  GroupedBarChart,
  MixCategoryTree,
  abbrevCategory,
  PieChart,
  StackedBarChart,
  StepAreaChart,
  chartDomain,
  type BarDatum,
  type ChartTableRow,
  type GroupedBand,
  type GroupedSeries,
  type PieSlice,
  type StackedGroup,
} from '@/components/charts';
import { householdContextFromRequest } from '@/lib/auth/next';
import { formatPence } from '@/lib/money';
import { NeedsFirst } from '@/components/needs-first';
import {
  PIE_SPLIT_PARENTS,
  getSpendingTrendsView,
  getCategoryMonthsView,
  getForecastChartView,
  getGroceriesChartView,
  getPersonalChartView,
  getSpendingMixView,
  type CategoryMonthsView,
  type SpendingTrendsView,
  type ForecastChartView,
  type GroceriesChartView,
  type MixWindow,
  type PersonalChartView,
  type SpendingMixView,
} from '@/lib/records/charts-view';
import { getPageNeeds, type PageNeed } from '@/lib/records/page-needs';
import {
  purchasesHref,
  type GroceriesSeries,
  type PersonalSeries,
  type WeekBucket,
} from '@/lib/records/chart-series';
import {
  householdSliceKey,
  mixSliceKey,
  type MixLine,
  type MixSlice,
} from '@/lib/records/spending-mix';
import { formatShortLocalDate } from '@/lib/time';

export const dynamic = 'force-dynamic';

/**
 * Charts (SPEC §16.7, v0.14.0) — the visual layer over the same numbers
 * `/insights` prints. Six charts, one under another on a phone, a
 * two-column grid on a laptop with the forecast across the top.
 *
 * Every drawing on this page is server-rendered SVG and is on the screen in
 * the first paint; every chart states whether its figures are reported or
 * projected; and every chart ships with a table twin holding the exact
 * numbers. Filters live in the URL so views can be shared. The preset dropdown uses
 * soft navigation without scrolling. The months chart's scroll arrows
 * (decision 201) are also hydrated: the sideways swipe itself is native overflow scrolling and
 * works with JavaScript off, and the arrows are pure enhancement on top.
 */

interface SearchParams {
  who?: string;
  preset?: string;
  /** Spending mix (E): the window, the category ticks and the selected slice. */
  from?: string;
  to?: string;
  cat?: string | string[];
  catset?: string;
  slice?: string;
  /** Three months by category (F): exclude the Housing parent. */
  noHousing?: string;
}

const PHONE_WIDTH = 320;
const LAPTOP_WIDTH = 720;

export default async function ChartsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await householdContextFromRequest();
  if (user === null) redirect('/unauthorized');

  const db = user.db;
  const now = new Date();
  const params = await searchParams;

  // “What this page needs first” (Slice 2), split by the two halves of the
  // page: the forecast reads the checkpoint chain, and the four reported
  // charts read recorded purchases. Each half replaces its own zero-figure
  // scaffolding; a household with records never sees either block.
  const chartNeeds = getPageNeeds(db, 'charts', now);
  const forecastNeeds = chartNeeds.filter((need) => need.id !== 'purchases');
  const reportedNeeds = chartNeeds.filter((need) => need.id === 'purchases');
  const reportedDrawn = reportedNeeds.length === 0;

  const forecast = getForecastChartView(db, now);
  const groceries = getGroceriesChartView(db, {}, now);
  const everyone = getPersonalChartView(db, {}, now);
  const include = parseWho(params.who, everyone);
  const personal = include === null ? everyone : getPersonalChartView(db, { include }, now);
  const commitments = getSpendingTrendsView(db, params.preset, now);
  const mixView = getSpendingMixView(
    db,
    {
      from: params.from ?? null,
      to: params.to ?? null,
      includedParentIds: parseCategoryIds(params),
    },
    now,
  );
  const sliceKey = typeof params.slice === 'string' ? params.slice : null;
  const monthsView = getCategoryMonthsView(db, { excludeHeavy: params.noHousing === '1' }, now);

  return (
    <main className="mx-auto max-w-7xl overflow-x-clip px-4 py-6 sm:py-8">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Charts</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">The money, drawn</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-soft">
          Six questions: where the balance goes next month, where the money went since payday,
          whether the shopping is creeping up, whose discretionary spending is moving, whether the
          fixed bills are coming down, and how the last three months compare. Every chart carries
          its numbers underneath —{' '}
          <Link href="/insights" className="sf-link">
            Insights
          </Link>{' '}
          holds the same figures as tables, and the two always agree.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ForecastSection view={forecast} needs={forecastNeeds} />
        {reportedDrawn ? (
          <>
            <GroceriesSection view={groceries} />
            <PersonalSection
              view={personal}
              everyone={everyone}
              selected={include}
              params={params}
            />
            <CommitmentsSection view={commitments} />
            <MixLayout view={mixView} selectedKey={sliceKey} />
            <MonthsSection view={monthsView} params={params} />
          </>
        ) : (
          <NeedsFirst
            needs={reportedNeeds}
            className="lg:col-span-2"
            headingId="charts-needs-heading"
          />
        )}
      </div>

      {reportedDrawn ? (
        <p className="mt-6 text-xs text-ink-muted">
          Clicking a bar opens the purchases behind it. Those filters match the <em>purchase</em>,
          and a matched purchase comes back with all of its lines, receipt-style — so a split shop
          appears whole, not as the single line that matched.
        </p>
      ) : null}
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* A. Forecast                                                         */
/* ------------------------------------------------------------------ */

function ForecastSection({
  view,
  needs,
}: {
  view: ForecastChartView;
  /** The checkpoint-chain needs — rendered only in the unavailable branch. */
  needs: readonly PageNeed[];
}) {
  const { series } = view;
  const points = series.days.map((day) => ({
    date: day.date,
    valuePence: day.runningPence,
    reported: day.reported,
    income: day.receiptsPence > 0,
  }));
  const domain = chartDomain(
    points.map((point) => point.valuePence),
    { targetTicks: 4 },
  );
  const lowIndex = series.days.findIndex((day) => day.date === series.lowDate);
  // The overdraft line is only drawn when the chart reaches that far down.
  // A legend entry for a line nobody can see is the kind of small lie this
  // app does not tell — when it is off the chart, the caption says so
  // instead, which is also the better news.
  const overdraftDrawn =
    series.overdraftLimitPence !== null && domain.min <= -series.overdraftLimitPence;
  const references = [
    ...(overdraftDrawn && series.overdraftLimitPence !== null
      ? [
          {
            valuePence: -series.overdraftLimitPence,
            label: 'overdraft limit',
            colour: CHART_COLOURS.danger,
          },
        ]
      : []),
    ...(series.warningThresholdPence === null
      ? []
      : [{ valuePence: series.warningThresholdPence, label: 'warning level' }]),
  ];

  const rows: ChartTableRow[] = series.days.map((day) => ({
    key: day.date,
    cells: [
      formatShortLocalDate(day.date),
      day.receiptsPence === 0 ? '—' : formatPence(day.receiptsPence),
      day.commitmentsPence + day.dayToDayPence === 0
        ? '—'
        : formatPence(day.commitmentsPence + day.dayToDayPence),
      formatPence(day.runningPence),
    ],
  }));
  const columns = [
    { key: 'date', label: 'Day' },
    { key: 'in', label: 'In', align: 'right' as const },
    { key: 'out', label: 'Out', align: 'right' as const },
    { key: 'balance', label: 'Balance', align: 'right' as const },
  ];
  const caption = `Today's ${formatPence(series.startPence)} is estimated liquid funds in bank and cash pots; later days apply expected cash commitments, receipts and day-to-day estimates. Credit-card debt is included in the household total, not this projection. Not a bank feed.${
    series.overdraftLimitPence !== null && !overdraftDrawn
      ? ` The ${formatPence(series.overdraftLimitPence)} of overdraft room is off the bottom of this chart — nothing next month goes near it.`
      : ''
  }`;

  if (view.unavailable) {
    return (
      <ChartCard
        id="forecast"
        eyebrow="A · Forecast"
        title="Where liquid funds go, today to a month ahead"
        className="lg:col-span-2"
      >
        <NeedsFirst variant="inline" needs={needs} />
      </ChartCard>
    );
  }

  return (
    <ChartCard
      id="forecast"
      eyebrow="A · Forecast"
      title="Where liquid funds go, today to a month ahead"
      className="lg:col-span-2"
    >
      <div className="lg:hidden">
        <ChartFigure
          chart="forecast"
          variant="phone"
          headline={series.headline}
          basis="Reported + projected"
          caption={caption}
          columns={columns}
          rows={rows}
          footer={<DipList view={view} />}
        >
          <StepAreaChart
            points={points}
            domain={domain}
            width={PHONE_WIDTH}
            height={220}
            ariaLabel={`Projected liquid funds in bank and cash pots to ${formatShortLocalDate(series.throughDate)}. ${series.headline}`}
            xTicks={weeklyTicks(points.map((point) => point.date))}
            lowIndex={lowIndex < 0 ? null : lowIndex}
            lowLabel={`${formatPence(series.lowPence)} · ${shortDayMonth(series.lowDate)}`}
            referenceLines={references}
          />
        </ChartFigure>
      </div>
      <div className="hidden lg:block">
        <ChartFigure
          chart="forecast"
          variant="laptop"
          headline={series.headline}
          basis="Reported + projected"
          caption={caption}
          columns={columns}
          rows={rows}
          footer={
            <>
              <ChartLegend
                items={[
                  { key: 'balance', label: 'Projected balance', fill: CHART_COLOURS.line },
                  { key: 'income', label: 'Money expected in', fill: CHART_COLOURS.average },
                  ...(overdraftDrawn && series.overdraftLimitPence !== null
                    ? [
                        {
                          key: 'overdraft',
                          label: view.overdraftLabel ?? 'Overdraft limit',
                          fill: CHART_COLOURS.danger,
                          note: `(${formatPence(series.overdraftLimitPence)})`,
                        },
                      ]
                    : []),
                ]}
              />
              <DayDetails view={view} />
            </>
          }
        >
          <StepAreaChart
            points={points}
            domain={domain}
            width={LAPTOP_WIDTH}
            height={300}
            ariaLabel={`Projected liquid funds in bank and cash pots to ${formatShortLocalDate(series.throughDate)}. ${series.headline}`}
            xTicks={weeklyTicks(points.map((point) => point.date))}
            lowIndex={lowIndex < 0 ? null : lowIndex}
            lowLabel={`${formatPence(series.lowPence)} · ${shortDayMonth(series.lowDate)}`}
            referenceLines={references}
          />
        </ChartFigure>
      </div>
    </ChartCard>
  );
}

function DipList({ view }: { view: ForecastChartView }) {
  if (view.series.dips.length === 0) {
    return <p className="text-xs text-ink-muted">Nothing is due in the next month.</p>;
  }
  return (
    <div>
      <p className="text-xs font-semibold text-ink-soft">What makes it dip</p>
      <ul className="mt-0.5 space-y-0.5 text-xs text-ink-soft">
        {view.series.dips.map((dip) => (
          <li key={dip.date} className="flex justify-between gap-2">
            <span>{formatShortLocalDate(dip.date)}</span>
            <span className="tabular-nums">{formatPence(dip.amountPence)} out</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DayDetails({ view }: { view: ForecastChartView }) {
  if (view.details.length === 0) return null;
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs font-medium text-ink-soft">
        What lands on each day ({view.details.length} days)
      </summary>
      <ul className="mt-2 space-y-2 text-xs">
        {view.details.map((detail) => (
          <li key={detail.date}>
            <p className="font-medium text-ink-body">{formatShortLocalDate(detail.date)}</p>
            <ul className="mt-0.5 space-y-0.5 text-ink-soft">
              {detail.commitments.map((line) => (
                <li key={`c-${line.name}`} className="flex justify-between gap-3">
                  <span>
                    {line.name} <span className="text-ink-faint">· {line.potLabel}</span>
                  </span>
                  <span className="tabular-nums">−{formatPence(line.amountPence)}</span>
                </li>
              ))}
              {detail.dayToDay.map((line) => (
                <li key={`d-${line.name}`} className="flex justify-between gap-3">
                  <span>{line.name}</span>
                  <span className="tabular-nums">−{formatPence(line.amountPence)}</span>
                </li>
              ))}
              {detail.receipts.map((line) => (
                <li key={`r-${line.name}`} className="flex justify-between gap-3 text-positive-800">
                  <span>
                    {line.name}
                    {line.expected ? ' (expected)' : ''}{' '}
                    <span className="text-ink-faint">· {line.potLabel}</span>
                  </span>
                  <span className="tabular-nums">+{formatPence(line.amountPence)}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </details>
  );
}

/* ------------------------------------------------------------------ */
/* B. Groceries                                                        */
/* ------------------------------------------------------------------ */

function GroceriesSection({ view }: { view: GroceriesChartView }) {
  // Weeks before the first recorded purchase were never recorded at all, so
  // they are not zero weeks and do not count (decision 183).
  const since =
    view.recordingStartedOn === null
      ? ' Nothing is recorded yet, so there is no average.'
      : ` Weeks before recording began on ${formatShortLocalDate(view.recordingStartedOn)} are not counted either.`;
  const caption =
    'Recorded grocery lines only, bucketed Monday to Sunday. A week with no shop is a zero week, not a missing one — the average would flatter you otherwise. The current week is still being lived and never counts towards the average.' +
    since;
  return (
    <ChartCard id="groceries" eyebrow="B · Groceries" title="Is the weekly shop creeping up?">
      <div className="lg:hidden">
        {renderGroceries(view, view.phone, 'phone', PHONE_WIDTH, 200, caption, 3)}
      </div>
      <div className="hidden lg:block">
        {renderGroceries(view, view.laptop, 'laptop', LAPTOP_WIDTH, 260, caption, 4)}
      </div>
    </ChartCard>
  );
}

function renderGroceries(
  view: GroceriesChartView,
  series: GroceriesSeries,
  variant: 'phone' | 'laptop',
  width: number,
  height: number,
  caption: string,
  labelEvery: number,
) {
  const href = (week: WeekBucket): string =>
    purchasesHref({
      from: week.weekStart,
      to: week.weekEnd,
      categoryIds: view.parentCategoryId === null ? undefined : [view.parentCategoryId],
    });
  const bars: BarDatum[] = series.weeks.map((week) => ({
    key: week.weekStart,
    label: shortDayMonth(week.weekStart),
    valuePence: week.amountPence,
    href: href(week),
    hint: `Week of ${formatShortLocalDate(week.weekStart)}: ${formatPence(week.amountPence)}${
      week.complete ? '' : ' so far'
    }${week.recorded ? '' : ' — not counted, recording had not begun'} — open these purchases`,
    muted: !week.complete,
  }));
  const domain = chartDomain(
    [...bars.map((bar) => bar.valuePence), series.configuredWeeklyPence ?? 0, series.averagePence],
    { targetTicks: 4 },
  );
  const references = [
    ...(series.configuredWeeklyPence === null
      ? []
      : [
          {
            valuePence: series.configuredWeeklyPence,
            label: `configured ${formatPence(series.configuredWeeklyPence)}`,
            colour: CHART_COLOURS.reference,
          },
        ]),
    ...(series.averageWeeks === 0
      ? []
      : [
          {
            valuePence: series.averagePence,
            label: `${series.averageWeeks}-week average`,
            colour: CHART_COLOURS.average,
          },
        ]),
  ];
  return (
    <ChartFigure
      chart="groceries"
      variant={variant}
      headline={series.headline}
      basis="Reported"
      caption={caption}
      columns={[
        { key: 'week', label: 'Week (Mon)' },
        { key: 'spent', label: 'Spent', align: 'right' as const },
      ]}
      rows={series.weeks.map((week) => ({
        key: week.weekStart,
        muted: !week.complete || !week.recorded,
        cells: [
          <a key="link" href={href(week)} className="sf-link">
            {week.weekStart}
            {week.complete ? '' : ' (so far)'}
            {week.recorded ? '' : ' (not counted)'}
          </a>,
          formatPence(week.amountPence),
        ],
      }))}
      totals={['Total', formatPence(series.weeks.reduce((sum, week) => sum + week.amountPence, 0))]}
      footer={
        <ChartLegend
          items={[
            { key: 'week', label: 'Weekly spend', fill: CHART_COLOURS.bar },
            ...(series.configuredWeeklyPence === null
              ? []
              : [
                  {
                    key: 'configured',
                    label: 'Configured weekly figure',
                    fill: CHART_COLOURS.reference,
                    note: `(${formatPence(series.configuredWeeklyPence)})`,
                  },
                ]),
            ...(series.averageWeeks === 0
              ? []
              : [
                  {
                    key: 'average',
                    label: `Trailing ${series.averageWeeks}-week average`,
                    fill: CHART_COLOURS.average,
                    note: `(${formatPence(series.averagePence)})`,
                  },
                ]),
          ]}
        />
      }
    >
      <BarChart
        bars={bars}
        domain={domain}
        idPrefix={`chart-hatch-groceries-${variant}`}
        width={width}
        height={height}
        ariaLabel={`Grocery spending by week. ${series.headline}`}
        xTicks={everyNth(
          bars.map((bar) => bar.label),
          labelEvery,
        )}
        referenceLines={references}
      />
    </ChartFigure>
  );
}

/* ------------------------------------------------------------------ */
/* C. Personal spending                                                */
/* ------------------------------------------------------------------ */

function PersonalSection({
  view,
  everyone,
  selected,
  params,
}: {
  view: PersonalChartView;
  everyone: PersonalChartView;
  selected: string[] | null;
  params: SearchParams;
}) {
  const caption = `Attributed by “For: …”, the way Insights already does it — not by whose card was used. A person's bar counts every line marked for them, whatever its category. Household-marked spending (a joint takeaway, a shared subscription) is its own bar and is never split between people; its scope is ${view.parentNames.join(' and ')}.`;
  const chips = everyone.laptop.series.map((ref) => ({
    key: ref.key,
    label: ref.label,
    on: selected === null || selected.includes(ref.key),
    href: chipHref(params, ref.key, everyone),
  }));
  const fills = new Map(
    everyone.laptop.series.map((ref, index) => [
      ref.key,
      CHART_COLOURS.series[index % CHART_COLOURS.series.length] as string,
    ]),
  );

  return (
    <ChartCard
      id="personal"
      eyebrow="C · Personal spending"
      title="Hers, his, household"
      action={
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Whose spending to show">
          {chips.map((chip) => (
            // Keep the reader's exact place on a soft navigation. The #personal
            // fragment remains in the URL so a direct/no-JS visit lands here.
            <Link
              key={chip.key}
              href={chip.href}
              scroll={false}
              aria-current={chip.on ? 'true' : undefined}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                chip.on
                  ? 'border-till bg-till text-till-ink'
                  : 'border-border-strong bg-surface text-ink-soft hover:bg-canvas'
              }`}
            >
              {chip.on ? '✓ ' : ''}
              {chip.label}
            </Link>
          ))}
        </div>
      }
    >
      {view.laptop.series.length === 0 ? (
        <p className="text-sm text-ink-soft">
          Nothing selected. Tap a name above to put a series back on the chart.
        </p>
      ) : (
        <>
          <div className="lg:hidden">
            {renderPersonal(view, view.phone, 'phone', PHONE_WIDTH, 210, caption, fills, 1)}
          </div>
          <div className="hidden lg:block">
            {renderPersonal(view, view.laptop, 'laptop', LAPTOP_WIDTH, 280, caption, fills, 1)}
          </div>
        </>
      )}
    </ChartCard>
  );
}

function renderPersonal(
  view: PersonalChartView,
  series: PersonalSeries,
  variant: 'phone' | 'laptop',
  width: number,
  height: number,
  caption: string,
  fills: Map<string, string>,
  labelEvery: number,
) {
  // A person's drill-down carries no category filter: their bar counts every
  // line marked for them, so the review page must show every line (issue
  // #25). The household bar keeps the discretionary-parent filter.
  const hrefFor = (from: string, to: string, key: string): string =>
    purchasesHref({
      from,
      to,
      ...(key === 'household'
        ? { targetKind: 'household' as const, categoryIds: view.parentCategoryIds }
        : { targetKind: 'person' as const, targetId: Number(key.split(':')[1]) }),
    });

  const groups: StackedGroup[] = series.months.map((month) => ({
    key: month.from,
    label: monthTick(month.label),
    muted: !month.complete,
    segments: month.cells.map((cell) => ({
      key: cell.key,
      valuePence: cell.amountPence,
      href: hrefFor(month.from, month.to, cell.key),
      hint: `${labelOf(series, cell.key)} · ${month.label}: ${formatPence(cell.amountPence)} — open these purchases`,
    })),
  }));
  const domain = chartDomain(
    groups.map((group) =>
      group.segments.reduce((sum, segment) => sum + Math.max(0, segment.valuePence), 0),
    ),
    { targetTicks: 4 },
  );

  return (
    <ChartFigure
      chart="personal"
      variant={variant}
      headline={series.headline}
      basis="Reported"
      caption={caption}
      columns={[
        { key: 'month', label: 'Month' },
        ...series.series.map((ref) => ({
          key: ref.key,
          label: ref.label,
          align: 'right' as const,
        })),
        { key: 'total', label: 'Total', align: 'right' as const },
      ]}
      rows={series.months.map((month) => ({
        key: month.from,
        muted: !month.complete,
        cells: [
          <span key="month">
            {month.label}
            {month.complete ? '' : ' (so far)'}
          </span>,
          ...month.cells.map((cell) =>
            // Zero cells draw no segment (stacked-bar-chart skips them), so
            // the table twin shows the honest £0.00 without a drill-down —
            // "the table says what the chart draws" holds on the first of a
            // month as well as the last (charts.spec's bar/table link twin).
            cell.amountPence === 0 ? (
              <span key={cell.key}>{formatPence(cell.amountPence)}</span>
            ) : (
              <a key={cell.key} href={hrefFor(month.from, month.to, cell.key)} className="sf-link">
                {formatPence(cell.amountPence)}
              </a>
            ),
          ),
          formatPence(month.totalPence),
        ],
      }))}
      totals={[
        'Total',
        ...series.totals.map((total) => formatPence(total.amountPence)),
        formatPence(series.totals.reduce((sum, total) => sum + total.amountPence, 0)),
      ]}
      footer={
        <ChartLegend
          items={series.series.map((ref, index) => ({
            key: ref.key,
            label: ref.label,
            fill: fills.get(ref.key) ?? (CHART_COLOURS.series[index] as string),
            note: `(${formatPence((series.totals[index] as { amountPence: number }).amountPence)})`,
          }))}
        />
      }
    >
      <StackedBarChart
        groups={groups}
        series={series.series.map((ref, index) => ({
          key: ref.key,
          label: ref.label,
          fill: fills.get(ref.key) ?? (CHART_COLOURS.series[index] as string),
        }))}
        domain={domain}
        width={width}
        height={height}
        ariaLabel={`Discretionary spending per month, by person. ${series.headline}`}
        xTicks={everyNth(
          groups.map((group) => group.label),
          labelEvery,
        )}
      />
    </ChartFigure>
  );
}

function labelOf(series: PersonalSeries, key: string): string {
  return series.series.find((ref) => ref.key === key)?.label ?? key;
}

/* ------------------------------------------------------------------ */
/* D. Spending trends                                                  */
/* ------------------------------------------------------------------ */

function CommitmentsSection({ view }: { view: SpendingTrendsView }) {
  const caption = `${view.selectedPreset?.name ?? 'No preset selected'}: recorded spending in the selected categories, including manual and schedule-generated purchases. Not a projection.${view.presets.source === 'schedules' ? ' Starting with categories used by your schedules; save a preset to keep this selection fixed.' : ''}`;
  const action = (
    <div className="flex min-w-0 flex-wrap items-end gap-3">
      <SpendingPresetSelect
        presets={view.presets.presets}
        selectedId={view.selectedPreset?.id ?? ''}
      />
      <Link href="/settings#commitment-categories" className="text-xs sf-link-arrow">
        Create/Edit category presets →
      </Link>
    </div>
  );

  if (view.tracking.categoryIds.length === 0) {
    return (
      <ChartCard
        id="commitments"
        eyebrow="D · Spending trends"
        title="How is this spending changing month by month?"
        action={action}
      >
        <p className="text-sm text-ink-soft">
          {view.selectedPreset
            ? 'This preset has no selected categories.'
            : 'No category presets yet.'}{' '}
          <Link href="/settings#commitment-categories" className="sf-link">
            Create or edit a category preset
          </Link>{' '}
          to fill in this chart.
        </p>
      </ChartCard>
    );
  }

  const series = view.series;
  const href = (from: string, to: string): string =>
    purchasesHref({
      from,
      to,
      categoryIds: view.tracking.categoryIds,
      scheduleOnly: view.scheduleOnly,
    });
  const bars: BarDatum[] = series.months.map((month) => ({
    key: month.from,
    label: monthTick(month.label),
    valuePence: month.amountPence,
    href: href(month.from, month.to),
    hint: `${month.label}: ${formatPence(month.amountPence)}${month.complete ? '' : ' so far'} — open these purchases`,
    muted: !month.complete,
  }));
  const domain = chartDomain(
    bars.map((bar) => bar.valuePence),
    { targetTicks: 4 },
  );
  const columns = [
    { key: 'month', label: 'Month' },
    { key: 'total', label: 'Total', align: 'right' as const },
  ];
  const rows: ChartTableRow[] = series.months.map((month) => ({
    key: month.from,
    muted: !month.complete,
    cells: [
      <a key="link" href={href(month.from, month.to)} className="sf-link">
        {month.label}
        {month.complete ? '' : ' (so far)'}
      </a>,
      formatPence(month.amountPence),
    ],
  }));
  const totals = [
    `${series.months.length} months`,
    formatPence(series.months.reduce((sum, month) => sum + month.amountPence, 0)),
  ];

  return (
    <ChartCard
      id="commitments"
      eyebrow="D · Spending trends"
      title="How is this spending changing month by month?"
      action={action}
    >
      <div className="lg:hidden">
        <ChartFigure
          chart="commitments"
          variant="phone"
          headline={series.headline}
          basis="Reported"
          caption={caption}
          columns={columns}
          rows={rows}
          totals={totals}
        >
          <BarChart
            bars={bars}
            domain={domain}
            idPrefix="chart-hatch-commitments-phone"
            width={PHONE_WIDTH}
            height={200}
            ariaLabel={`Spending trends by month. ${series.headline}`}
            xTicks={everyNth(
              bars.map((bar) => bar.label),
              2,
            )}
          />
        </ChartFigure>
      </div>
      <div className="hidden lg:block">
        <ChartFigure
          chart="commitments"
          variant="laptop"
          headline={series.headline}
          basis="Reported"
          caption={caption}
          columns={columns}
          rows={rows}
          totals={totals}
        >
          <BarChart
            bars={bars}
            domain={domain}
            idPrefix="chart-hatch-commitments-laptop"
            width={LAPTOP_WIDTH}
            height={260}
            ariaLabel={`Spending trends by month. ${series.headline}`}
            xTicks={everyNth(
              bars.map((bar) => bar.label),
              1,
            )}
          />
        </ChartFigure>
      </div>
    </ChartCard>
  );
}

/* ------------------------------------------------------------------ */
/* E. Where the money went — the spending-mix pie                     */
/* ------------------------------------------------------------------ */

/**
 * The selector and the pie side by side on a laptop, stacked on a phone. The
 * selector is a plain GET form, so the choices live in the URL and the page
 * works with JavaScript switched off.
 */
function MixLayout({ view, selectedKey }: { view: SpendingMixView; selectedKey: string | null }) {
  return (
    <div className="grid min-w-0 gap-6 lg:col-span-2 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
      <MixSelector view={view} />
      <MixSection view={view} selectedKey={selectedKey} />
    </div>
  );
}

/**
 * Which parent ids the selector counted. The form always sends `catset`, so
 * an unticked category is an exclusion rather than a missing field; without
 * `catset` (a fresh visit) every category counts.
 */
function parseCategoryIds(params: SearchParams): number[] | null {
  if (params.catset !== '1') return null;
  const raw = Array.isArray(params.cat) ? params.cat : params.cat === undefined ? [] : [params.cat];
  return raw
    .flatMap((part) => part.split(','))
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
}

/** The page's own URL for a window, a category set and an optional slice. */
function mixHref(
  window: { from: string; to: string },
  options: { cats: readonly number[] | null; slice?: string },
): string {
  const query = new URLSearchParams();
  query.set('from', window.from);
  query.set('to', window.to);
  if (options.cats !== null) {
    query.set('catset', '1');
    for (const id of options.cats) query.append('cat', String(id));
  }
  if (options.slice !== undefined) query.set('slice', options.slice);
  return `/charts?${query.toString()}#mix`;
}

interface PresetLink {
  key: string;
  label: string;
  window: MixWindow;
}

function selectedMixCategoryIds(view: SpendingMixView): number[] | null {
  if (view.allCategoriesIncluded) return null;
  const childlessIncluded = view.parents
    .filter((parent) => parent.children.length === 0 && view.includedParentIds.includes(parent.id))
    .map((parent) => parent.id);
  return [...view.includedCategoryIds, ...childlessIncluded];
}

function MixSelector({ view }: { view: SpendingMixView }) {
  const {
    window,
    presets,
    parents,
    includedParentIds,
    includedCategoryIds,
    allCategoriesIncluded,
  } = view;
  const cats = selectedMixCategoryIds(view);
  // Quick windows (issue #24). None runs past today: this chart counts money
  // already spent, never a projection.
  const presetLinks: PresetLink[] = [];
  if (presets.payday !== null) {
    presetLinks.push({ key: 'payday', label: 'Since last payday', window: presets.payday });
  }
  if (presets.previousPayday !== null) {
    presetLinks.push({
      key: 'previous-payday',
      label: 'Last full payday cycle',
      window: presets.previousPayday,
    });
  }
  presetLinks.push({ key: 'month', label: 'Month to date', window: presets.month });
  // The date pickers are uncontrolled, and a quick-window link is a soft
  // navigation that keeps this form mounted, so `defaultValue` alone would
  // leave the pickers showing the old dates. Keying them on the window
  // remounts them, so the pickers always show the dates the pie is drawn for.
  const windowKey = `${window.from}:${window.to}`;

  return (
    <section
      id="mix-controls"
      aria-labelledby="mix-controls-heading"
      className="min-w-0 rounded-xl border border-border bg-surface p-4 shadow-sm"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">Selector</p>
      <h2 id="mix-controls-heading" className="text-lg font-semibold">
        Choose what to count
      </h2>
      <p className="mt-1 text-xs text-ink-muted">
        By default this is since last payday: from the last payday up to today. This chart counts
        money already spent, so no window runs past today. Press Show after changing anything.
      </p>

      <form method="get" action="/charts#mix" className="mt-4 space-y-4">
        <input type="hidden" name="catset" value="1" />
        <fieldset className="grid grid-cols-2 gap-2">
          <legend className="mb-1 text-xs font-medium text-ink-soft">Time window</legend>
          <label className="flex flex-col gap-1 text-xs text-ink-soft">
            From
            <input
              key={`from:${windowKey}`}
              type="date"
              name="from"
              required
              max={view.today}
              defaultValue={window.from}
              className="w-full min-w-0 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-ink-body"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-soft">
            To
            <input
              key={`to:${windowKey}`}
              type="date"
              name="to"
              required
              max={view.today}
              defaultValue={window.to}
              className="w-full min-w-0 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-ink-body"
            />
          </label>
          <div className="col-span-2">
            <button
              type="submit"
              className="rounded bg-till px-3 py-1.5 text-sm font-medium text-till-ink"
            >
              Show
            </button>
          </div>
        </fieldset>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick windows">
          {presetLinks.map((preset) => {
            const on = window.kind === preset.window.kind;
            return (
              <Link
                key={preset.key}
                href={mixHref(preset.window, { cats })}
                aria-current={on ? 'true' : undefined}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  on
                    ? 'border-till bg-till text-till-ink'
                    : 'border-border-strong bg-surface text-ink-soft hover:bg-canvas'
                }`}
              >
                {on ? '✓ ' : ''}
                {preset.label}
              </Link>
            );
          })}
        </div>

        <MixCategoryTree
          parents={parents}
          includedParentIds={includedParentIds}
          includedCategoryIds={includedCategoryIds}
          allCategoriesIncluded={allCategoriesIncluded}
          resetHref={mixHref(window, { cats: null })}
        />
      </form>
    </section>
  );
}

/** Colour slots are fixed by the category tree, so a slice keeps its colour. */
function mixColourSlots(view: SpendingMixView): string[] {
  const split = new Set<string>(PIE_SPLIT_PARENTS);
  const slots: string[] = [];
  for (const parent of view.parents) {
    if (split.has(parent.name)) {
      for (const person of view.people) slots.push(mixSliceKey(parent.id, person.id));
      slots.push(householdSliceKey(parent.id));
    } else {
      slots.push(mixSliceKey(parent.id, null));
    }
  }
  return slots;
}

/** Five series colours, then tints of them: enough for a household's categories. */
function mixColour(index: number): string {
  const series = CHART_COLOURS.series;
  const base = series[index % series.length] as string;
  if (index < series.length) return base;
  const tint = index < series.length * 2 ? 62 : 40;
  return `color-mix(in srgb, ${base} ${tint}%, var(--color-surface))`;
}

function sharePercent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

function MixSection({ view, selectedKey }: { view: SpendingMixView; selectedKey: string | null }) {
  const { mix, window, notice } = view;
  const slots = mixColourSlots(view);
  const colourOf = (key: string): string => {
    const index = slots.indexOf(key);
    return mixColour(index < 0 ? slots.length : index);
  };
  const cats = selectedMixCategoryIds(view);
  const selected =
    selectedKey === null ? null : (mix.slices.find((slice) => slice.key === selectedKey) ?? null);
  const drawn = mix.slices.filter((slice) => slice.drawn);
  const largest = drawn[0];
  const windowText = `${formatShortLocalDate(window.from)} to ${formatShortLocalDate(window.to)}`;

  const sliceHref = (slice: MixSlice): string =>
    // Pressing the selected slice again closes its line items.
    selected?.key === slice.key
      ? mixHref(window, { cats })
      : mixHref(window, { cats, slice: slice.key });

  const pieSlices: PieSlice[] = drawn.map((slice) => ({
    key: slice.key,
    label: slice.label,
    valuePence: slice.amountPence,
    fill: colourOf(slice.key),
    href: sliceHref(slice),
    hint: `${slice.label}: ${formatPence(slice.amountPence)}, ${sharePercent(slice.share)} — show the line items`,
    selected: slice.key === selected?.key,
  }));

  const headline =
    view.allCategoriesIncluded === false && view.includedParentIds.length === 0
      ? 'No categories are ticked, so nothing is counted.'
      : largest === undefined
        ? `Nothing is above zero from ${windowText}.`
        : `${formatPence(mix.totalPence)} net spending from ${windowText}. ${largest.label} is the biggest slice, at ${sharePercent(largest.share)}.`;

  const caption = `Net spending by parent category, drawn from the purchase lines in the window — refunds net off their category. It counts money already spent, never a projection, so the window ends today at the latest. Personal is split by “For: …”: each person’s own slice, and household-marked personal spending as its own slice, never split between people. A category that nets to zero or below is listed in the table but not drawn.`;

  const columns = [
    { key: 'slice', label: 'Slice' },
    { key: 'spent', label: 'Net spent', align: 'right' as const },
    { key: 'share', label: 'Share', align: 'right' as const },
  ];
  const rows: ChartTableRow[] = mix.slices.map((slice) => ({
    key: slice.key,
    muted: !slice.drawn,
    cells: [
      <a key="link" href={sliceHref(slice)} className="sf-link">
        {slice.label}
      </a>,
      formatPence(slice.amountPence),
      slice.drawn ? sharePercent(slice.share) : 'not drawn',
    ],
  }));

  const mixFigure = (variant: 'phone' | 'laptop', size: number) => (
    <ChartFigure
      chart="mix"
      variant={variant}
      headline={headline}
      basis="Reported"
      caption={caption}
      columns={columns}
      rows={rows}
      totals={['Total', formatPence(mix.totalPence), '']}
      footer={
        <ul className="grid gap-1 text-xs text-ink-soft sm:grid-cols-2">
          {mix.slices.map((slice) => (
            <li key={slice.key}>
              <Link
                href={sliceHref(slice)}
                aria-current={slice.key === selected?.key ? 'true' : undefined}
                className={`flex items-center justify-between gap-2 rounded px-1 py-0.5 hover:bg-canvas ${
                  slice.key === selected?.key ? 'font-semibold text-ink-body' : ''
                }`}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={
                      slice.drawn
                        ? { backgroundColor: colourOf(slice.key) }
                        : { boxShadow: `inset 0 0 0 1px ${CHART_COLOURS.axis}` }
                    }
                  />
                  <span className="truncate">{slice.label}</span>
                </span>
                <span className="shrink-0 tabular-nums">
                  {formatPence(slice.amountPence)}
                  {slice.drawn ? ` · ${sharePercent(slice.share)}` : ' · not drawn'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      }
    >
      <div className="mx-auto max-w-[17rem] sm:max-w-[20rem]">
        <PieChart
          slices={pieSlices}
          size={size}
          ariaLabel={`Share of net spending by category, ${windowText}. ${headline}`}
        />
      </div>
    </ChartFigure>
  );

  return (
    <ChartCard id="mix" eyebrow="E · Spending mix" title="Where the money went" className="min-w-0">
      {notice === null ? null : (
        <p className="mb-3 rounded-lg border border-dashed border-border-strong bg-canvas p-3 text-xs text-ink-soft">
          {notice}
        </p>
      )}
      <div className="lg:hidden">{mixFigure('phone', 240)}</div>
      <div className="hidden lg:block">{mixFigure('laptop', 260)}</div>

      {selected === null ? (
        <p className="mt-4 text-xs text-ink-muted">
          Select a slice, or its name below, to see the line items behind it.
        </p>
      ) : (
        <MixLineItems view={view} slice={selected} closeHref={mixHref(window, { cats })} />
      )}
    </ChartCard>
  );
}

function MixLineItems({
  view,
  slice,
  closeHref,
}: {
  view: SpendingMixView;
  slice: MixSlice;
  closeHref: string;
}) {
  const { window } = view;
  const target =
    slice.kind === 'person' && slice.personId !== null
      ? { targetKind: 'person' as const, targetId: slice.personId }
      : slice.kind === 'household'
        ? { targetKind: 'household' as const }
        : {};
  const parent = view.parents.find((entry) => entry.id === slice.parentId);
  const parentChildIds = parent?.children.map((child) => child.id) ?? [];
  const includedSet = new Set(view.includedCategoryIds);
  const tickedChildren = parentChildIds.filter((id) => includedSet.has(id));
  const sliceCategoryIds =
    tickedChildren.length > 0 && tickedChildren.length < parentChildIds.length
      ? tickedChildren
      : [slice.parentId];
  const openHref = purchasesHref({
    from: window.from,
    to: window.to,
    categoryIds: sliceCategoryIds,
    ...target,
  });
  return (
    <section
      id="mix-lines"
      aria-labelledby="mix-lines-heading"
      className="mt-4 rounded-xl border border-border bg-canvas p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="mix-lines-heading" className="text-sm font-semibold">
          Line items: {slice.label}
        </h3>
        <p className="text-sm tabular-nums text-ink-soft">
          {formatPence(slice.amountPence)} · {slice.lines.length}{' '}
          {slice.lines.length === 1 ? 'line' : 'lines'}
        </p>
      </div>
      {slice.lines.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">Nothing was spent here in this window.</p>
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
              {slice.lines.map((line) => (
                <MixLineRow
                  key={`${line.purchaseId}-${line.categoryId}-${line.targetKind}-${line.targetId ?? 'x'}-${line.amountPence}`}
                  line={line}
                  labels={view.targetLabels}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <Link href={openHref} className="sf-link-arrow">
          Open these purchases →
        </Link>
        <Link href={closeHref} className="sf-link">
          Close line items
        </Link>
        <span className="text-ink-muted">
          A matching purchase comes back whole, with all of its lines.
        </span>
      </div>
    </section>
  );
}

function MixLineRow({ line, labels }: { line: MixLine; labels: Map<string, string> }) {
  const forText =
    line.targetKind === 'household'
      ? 'Household'
      : (labels.get(`${line.targetKind}:${line.targetId}`) ?? 'Unknown');
  return (
    <tr className="border-t border-border-hairline align-top">
      <td className="whitespace-nowrap py-1 pr-3">{formatShortLocalDate(line.occurredDate)}</td>
      <td className="py-1 pr-3">{line.supplierName ?? line.note ?? '—'}</td>
      <td className="py-1 pr-3 text-ink-soft">{line.childName}</td>
      <td className="py-1 pr-3 text-ink-soft">{forText}</td>
      <td className="py-1 pr-0 text-right tabular-nums">{formatPence(line.amountPence)}</td>
    </tr>
  );
}

/* ------------------------------------------------------------------ */
/* F. Three months by category                                         */
/* ------------------------------------------------------------------ */

function MonthsSection({ view, params }: { view: CategoryMonthsView; params: SearchParams }) {
  const { months, categories, heavyParentId, excludeHeavy } = view;
  const canExclude = heavyParentId !== null;
  const toggleHref = `${hrefWith(params, { noHousing: excludeHeavy ? undefined : '1' })}#months`;
  const newest = months[months.length - 1];
  const largest = categories[0];
  const headline =
    categories.length === 0
      ? `Nothing was recorded from ${months[0]?.label ?? ''} to ${newest?.label ?? ''}.`
      : `${formatPence(view.totalPence)} net spending across ${categories.length} ${
          categories.length === 1 ? 'category' : 'categories'
        } from ${months[0]?.label ?? ''} to ${newest?.label ?? ''}. ${
          largest?.name ?? ''
        } is the biggest, at ${formatPence(largest?.totalPence ?? 0)}.${excludeHeavy ? ' Housing is excluded.' : ''}`;
  const caption = `One band per parent category, one bar per month — the same figures as the month comparison on Insights. Refunds net off their category. The month still running is drawn hatched and labelled “so far”. Axis names are shortened (hover one for the full name); when the categories outgrow the drawing it scrolls sideways — swipe it, drag it, or use the arrows. ${
    canExclude
      ? 'Housing can be excluded: it alone is big enough to flatten every other bar in the drawing.'
      : ''
  }`;

  const series: GroupedSeries[] = months.map((month, index) => ({
    key: month.from,
    label: month.label,
    fill: CHART_COLOURS.series[index % CHART_COLOURS.series.length] ?? CHART_COLOURS.bar,
    muted: !month.complete,
  }));

  const hrefOf = (parentId: number, monthIndex: number): string => {
    const month = months[monthIndex];
    if (month === undefined) return '/purchases';
    return purchasesHref({ from: month.from, to: month.to, categoryIds: [parentId] });
  };

  const bands: GroupedBand[] = categories.map((category) => ({
    key: String(category.parentId),
    label: abbrevCategory(category.name),
    labelHint: category.name,
    bars: months.map((month, index) => ({
      key: `${category.parentId}-${month.from}`,
      valuePence: category.amountsPence[index] ?? 0,
      href: hrefOf(category.parentId, index),
      hint: `${category.name}, ${month.label}: ${formatPence(
        category.amountsPence[index] ?? 0,
      )} — open these purchases`,
    })),
  }));

  const domain = chartDomain(
    bands.flatMap((band) => band.bars.map((bar) => bar.valuePence)),
    { targetTicks: 4 },
  );

  const columns = [
    { key: 'category', label: 'Category' },
    ...months.map((month) => ({ key: month.from, label: month.label, align: 'right' as const })),
  ];
  const rows: ChartTableRow[] = categories.map((category) => ({
    key: String(category.parentId),
    muted: category.totalPence <= 0,
    cells: [
      category.name,
      ...months.map((month, index) => (
        <a key={month.from} href={hrefOf(category.parentId, index)} className="sf-link">
          {formatPence(category.amountsPence[index] ?? 0)}
        </a>
      )),
    ],
  }));
  const totals = [
    'Total',
    ...months.map((month, index) =>
      formatPence(
        categories.reduce((sum, category) => sum + (category.amountsPence[index] ?? 0), 0),
      ),
    ),
  ];

  const action = canExclude ? (
    <Link
      href={toggleHref}
      aria-current={excludeHeavy ? 'true' : undefined}
      className={`rounded-full border px-3 py-1 text-xs font-medium ${
        excludeHeavy
          ? 'border-till bg-till text-till-ink'
          : 'border-border-strong bg-surface text-ink-soft hover:bg-canvas'
      }`}
    >
      {excludeHeavy ? '✓ ' : ''}Exclude Housing
    </Link>
  ) : undefined;

  const drawing = (variant: 'phone' | 'laptop', width: number, height: number) => (
    <ChartFigure
      chart="months"
      variant={variant}
      headline={headline}
      basis="Reported"
      caption={caption}
      columns={columns}
      rows={rows}
      totals={totals}
      footer={
        <ChartLegend
          items={series.map((entry) => ({
            key: entry.key,
            label: entry.label, // the in-progress month's label already says “(so far)”
            fill: entry.fill,
          }))}
        />
      }
    >
      <ChartScroller label="the three months chart">
        <GroupedBarChart
          bands={bands}
          series={series}
          domain={domain}
          idPrefix={`chart-hatch-months-${variant}`}
          width={width}
          height={height}
          ariaLabel={`Net spending by parent category over three months. ${headline}`}
          xTicks={bands.map((band, index) => ({ index, label: band.label }))}
        />
      </ChartScroller>
    </ChartFigure>
  );

  return (
    <ChartCard
      id="months"
      eyebrow="F · Three months by category"
      title="How the last three months compare"
      className="lg:col-span-2"
      action={action}
    >
      <div className="lg:hidden">{drawing('phone', PHONE_WIDTH, 240)}</div>
      <div className="hidden lg:block">{drawing('laptop', LAPTOP_WIDTH, 300)}</div>
    </ChartCard>
  );
}

/* ------------------------------------------------------------------ */
/* Page furniture                                                      */
/* ------------------------------------------------------------------ */

function ChartCard({
  id,
  eyebrow,
  title,
  action,
  className,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className={`sf-anchor min-w-0 rounded-xl border border-border bg-surface p-4 shadow-sm ${className ?? ''}`}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
            {eyebrow}
          </p>
          <h2 id={`${id}-heading`} className="text-lg font-semibold sm:text-xl">
            {title}
          </h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Labels for every nth band — enough to read, few enough not to collide. */
function everyNth(labels: readonly string[], nth: number): Array<{ index: number; label: string }> {
  const step = Math.max(1, nth);
  const out: Array<{ index: number; label: string }> = [];
  for (let index = labels.length - 1; index >= 0; index -= step) {
    out.unshift({ index, label: labels[index] as string });
  }
  return out;
}

/** Weekly x-ticks for a daily series — 30 days is ~9px a day on a phone. */
function weeklyTicks(dates: readonly string[]): Array<{ index: number; label: string }> {
  const out: Array<{ index: number; label: string }> = [];
  for (let index = 0; index < dates.length; index += 7) {
    out.push({ index, label: shortDayMonth(dates[index] as string) });
  }
  return out;
}

/** "3 Oct" — the weekday is noise once the ticks are weekly. */
function shortDayMonth(date: string): string {
  return formatShortLocalDate(date).replace(/^\w{3} /, '');
}

/** "Sep 26" from "September 2026" — a month tick that fits. */
function monthTick(label: string): string {
  const [month, year] = label.split(' ');
  return `${(month ?? '').slice(0, 3)} ${(year ?? '').slice(2)}`;
}

function parseWho(raw: string | undefined, everyone: PersonalChartView): string[] | null {
  if (raw === undefined || raw.trim() === '') return null;
  const known = new Set(everyone.laptop.series.map((ref) => ref.key));
  const wanted = raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => known.has(part));
  return wanted.length === everyone.laptop.series.length ? null : wanted;
}

function chipHref(params: SearchParams, key: string, everyone: PersonalChartView): string {
  const all = everyone.laptop.series.map((ref) => ref.key);
  const current = parseWho(params.who, everyone) ?? all;
  const next = current.includes(key)
    ? current.filter((entry) => entry !== key)
    : all.filter((entry) => current.includes(entry) || entry === key);
  const who = next.length === all.length ? undefined : next.join(',');
  return `${hrefWith(params, { who })}#personal`;
}

function hrefWith(params: SearchParams, changes: Partial<SearchParams>): string {
  const merged: SearchParams = { ...params, ...changes };
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (key === 'scheduleOnly' || value === undefined || value === '') continue;
    for (const item of Array.isArray(value) ? value : [value]) query.append(key, item);
  }
  const text = query.toString();
  return text === '' ? '/charts' : `/charts?${text}`;
}
