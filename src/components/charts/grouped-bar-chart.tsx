import { bandWidth, bandX, yFor, type ChartDomain, type Plot } from './scale';
import { BandLabels, CHART_COLOURS, Gridlines, SubZeroBand } from './chart-primitives';

/**
 * Grouped bars for the three-months-by-category chart (SPEC §16.7 F): one
 * band per parent category, with one adjacent bar per month inside it.
 *
 * The rules are `BarChart`'s (decision 155): every bar can be a real
 * `<a>` link to the purchases behind it, pointer-only (the table twin is the
 * keyboard path); an in-progress period is drawn hatched as well as labelled;
 * and the SVG is one `role=\"img\"` with the verdict as its `aria-label`.
 *
 * Decision 201: bars stay thin and bands have a minimum width, so a crowded
 * category list makes the drawing wider than its column — the wrapper scrolls
 * it sideways (`ChartScroller`) instead of crushing the labels. Axis labels
 * are abbreviated (`abbrevCategory`) and carry the full name as a hover hint.
 */

export interface GroupedSeries {
  key: string;
  label: string;
  fill: string;
  /** An in-progress period: drawn hatched, never counted in an average. */
  muted?: boolean;
}

export interface GroupedBar {
  key: string;
  valuePence: number;
  /** `/purchases?...` — the purchases behind this bar. */
  href?: string;
  /** Native tooltip text. */
  hint?: string;
}

export interface GroupedBand {
  key: string;
  /** Abbreviated axis label. */
  label: string;
  /** Full name: the hover hint for the abbreviated label. */
  labelHint?: string;
  /** One bar per series, in series order. */
  bars: readonly GroupedBar[];
}

export interface GroupedBarChartProps {
  bands: readonly GroupedBand[];
  series: readonly GroupedSeries[];
  domain: ChartDomain;
  ariaLabel: string;
  /**
   * Nominal column width; the drawing grows past it when bands would crowd.
   */
  width?: number;
  /**
   * A document-unique prefix for this drawing's hatch patterns (decision 202).
   * The months chart is drawn twice — a phone figure and a laptop figure, one
   * hidden by CSS — and two figures sharing an id meant `url(#…)` resolved to
   * the hidden one, which paints nothing at all (SVG 1.1). See `BarChart`.
   */
  idPrefix: string;
  height?: number;
  xTicks?: ReadonlyArray<{ index: number; label: string }>;
}

/** Narrowest band before the drawing starts growing sideways, per variant. */
function minBand(width: number, count: number): number {
  const wanted = width < 400 ? 46 : 54;
  return count * wanted > 3000 ? 3000 / count : wanted;
}

export function GroupedBarChart({
  bands,
  series,
  domain,
  ariaLabel,
  idPrefix,
  width = 720,
  height = 280,
  xTicks = [],
}: GroupedBarChartProps) {
  const count = bands.length;
  const plotLeft = 46;
  const plotRight = 12;
  const floor = minBand(width, Math.max(1, count));
  const drawingWidth = Math.max(width, plotLeft + count * floor + plotRight);
  const plot: Plot = {
    left: plotLeft,
    top: 14,
    width: Math.max(10, drawingWidth - plotLeft - plotRight),
    height: Math.max(10, height - 42),
  };
  const band = bandWidth(count, plot);
  const gap = Math.min(4, band * 0.1);
  const subWidth = series.length === 0 ? band : (band - gap) / series.length;
  // Thin bars (decision 201): more categories fit per screenful, and a wide
  // band never inflates one bar into a slab.
  const barWidth = Math.min(10, Math.max(2, subWidth - 3));
  const zeroY = yFor(0, domain, plot);

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${drawingWidth} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-auto"
      style={{ width: `${drawingWidth}px`, maxWidth: 'none', height: 'auto' }}
    >
      <defs>
        {series
          .filter((entry) => entry.muted)
          .map((entry) => (
            <pattern
              key={entry.key}
              id={`${idPrefix}-hatch-${entry.key}`}
              width="5"
              height="5"
              patternTransform="rotate(45)"
              patternUnits="userSpaceOnUse"
            >
              <rect width="5" height="5" style={{ fill: CHART_COLOURS.barMuted }} />
              <line x1="0" y1="0" x2="0" y2="5" style={{ stroke: entry.fill }} strokeWidth="1.6" />
            </pattern>
          ))}
      </defs>
      <SubZeroBand domain={domain} plot={plot} />
      <Gridlines domain={domain} plot={plot} />
      {bands.map((bandEntry, bandIndex) => {
        const bandLeft =
          bandX(bandIndex, count, plot) +
          (band - series.length * barWidth - (series.length - 1) * gap) / 2;
        return (
          <g key={bandEntry.key}>
            {bandEntry.bars.map((bar, seriesIndex) => {
              const entry = series[seriesIndex];
              if (entry === undefined) return null;
              const valueY = yFor(bar.valuePence, domain, plot);
              const y = Math.min(valueY, zeroY);
              const barHeight = Math.max(bar.valuePence === 0 ? 0 : 1, Math.abs(valueY - zeroY));
              const x = bandLeft + seriesIndex * (barWidth + gap);
              // Two rects for the in-progress month, as `BarChart` does
              // (decision 202): a solid muted base under the hatch, so the bar
              // can never vanish even if a paint server fails again.
              const rect = entry.muted ? (
                <>
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={barHeight}
                    style={{ fill: CHART_COLOURS.barMuted }}
                    rx={1}
                  />
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={barHeight}
                    style={{ fill: `url(#${idPrefix}-hatch-${entry.key})` }}
                    rx={1}
                  />
                </>
              ) : (
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  style={{ fill: entry.fill }}
                  rx={1}
                />
              );
              const title = bar.hint === undefined ? null : <title>{bar.hint}</title>;
              return bar.href === undefined ? (
                <g key={bar.key}>
                  {title}
                  {rect}
                </g>
              ) : (
                <a key={bar.key} href={bar.href} tabIndex={-1} aria-hidden="true">
                  {title}
                  {rect}
                </a>
              );
            })}
          </g>
        );
      })}
      <BandLabels
        labels={xTicks}
        plot={plot}
        count={count}
        hints={xTicks.map((tick) => bands[tick.index]?.labelHint)}
      />
    </svg>
  );
}
