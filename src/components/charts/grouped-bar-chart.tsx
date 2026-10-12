import { bandWidth, bandX, yFor, type ChartDomain, type Plot } from './scale';
import { BandLabels, CHART_COLOURS, Gridlines, SubZeroBand } from './chart-primitives';

/**
 * Grouped bars for the three-months-by-category chart (SPEC §16.7 F): one
 * band per parent category, with one adjacent bar per month inside it.
 *
 * The rules are `BarChart`'s (decision 155): every bar can be a real
 * `<a>` link to the purchases behind it, pointer-only (the table twin is the
 * keyboard path); an in-progress period is drawn hatched as well as labelled;
 * and the SVG is one `role="img"` with the verdict as its `aria-label`.
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
  label: string;
  /** One bar per series, in series order. */
  bars: readonly GroupedBar[];
}

export interface GroupedBarChartProps {
  bands: readonly GroupedBand[];
  series: readonly GroupedSeries[];
  domain: ChartDomain;
  ariaLabel: string;
  width?: number;
  height?: number;
  xTicks?: ReadonlyArray<{ index: number; label: string }>;
}

export function GroupedBarChart({
  bands,
  series,
  domain,
  ariaLabel,
  width = 720,
  height = 280,
  xTicks = [],
}: GroupedBarChartProps) {
  const plot: Plot = {
    left: 46,
    top: 14,
    width: Math.max(10, width - 56),
    height: Math.max(10, height - 42),
  };
  const count = bands.length;
  const band = bandWidth(count, plot);
  const gap = Math.min(6, band * 0.25);
  const subWidth = series.length === 0 ? band : (band - gap) / series.length;
  const barWidth = Math.max(1.5, subWidth - 1);
  const zeroY = yFor(0, domain, plot);

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-auto w-full"
      style={{ maxWidth: '100%' }}
    >
      <defs>
        {series
          .filter((entry) => entry.muted)
          .map((entry) => (
            <pattern
              key={entry.key}
              id={`chart-grouped-hatch-${entry.key}`}
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
        const bandLeft = bandX(bandIndex, count, plot) + gap / 2;
        return (
          <g key={bandEntry.key}>
            {bandEntry.bars.map((bar, seriesIndex) => {
              const entry = series[seriesIndex];
              if (entry === undefined) return null;
              const valueY = yFor(bar.valuePence, domain, plot);
              const y = Math.min(valueY, zeroY);
              const barHeight = Math.max(bar.valuePence === 0 ? 0 : 1, Math.abs(valueY - zeroY));
              const x = bandLeft + seriesIndex * subWidth;
              const rect = (
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  style={{
                    fill: entry.muted ? `url(#chart-grouped-hatch-${entry.key})` : entry.fill,
                  }}
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
      <BandLabels labels={xTicks} plot={plot} count={count} />
    </svg>
  );
}
