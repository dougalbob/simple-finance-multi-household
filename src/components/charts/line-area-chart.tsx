import { bandX, yFor, type ChartDomain, type Plot } from './scale';
import { AXIS_FONT, BandLabels, CHART_COLOURS, Gridlines } from './chart-primitives';

/**
 * Overlapping cumulative lines with a semi-transparent fill (SPEC §16.7 G,
 * decision 246): two months' spending added up day by day, drawn on top of
 * each other so the pace of one can be read against the other.
 *
 * The geometry is deliberately plain. Each series opens at £0 at the start
 * of day 1 (the plot's left edge — not a separate "day 0"), then a point at
 * the **end of each day** carrying that day's cumulative total, joined by
 * straight lines. No curve smoothing: a spline could rise above a total
 * the household never reached, while straight joins only spread a day's
 * spending across the segment that ends on it — the household asked for
 * the trajectory, and the table twin carries the exact daily figures.
 *
 * Series paint in array order, so the caller puts the comparison first and
 * the primary month last, on top. Colour is never the only signal: the
 * caller gives one series a dashed stroke, every line ends in a dot with
 * a short label, and the legend and table name both months in words.
 */

export interface LineAreaSeries {
  key: string;
  /** A colour token reference (`CHART_COLOURS.series[n]`), never a literal. */
  colour: string;
  /** Dashed stroke — the second signal beside colour. */
  dashed?: boolean;
  /** Cumulative pence per day; index 0 is day 1. */
  pointsPence: readonly number[];
  /** Short label at the line's end, e.g. "Oct 26 · £1,842.10". */
  endLabel: string;
}

export interface LineAreaChartProps {
  series: readonly LineAreaSeries[];
  domain: ChartDomain;
  ariaLabel: string;
  width?: number;
  height?: number;
  xTicks?: ReadonlyArray<{ index: number; label: string }>;
}

interface EndLabel {
  key: string;
  text: string;
  colour: string;
  x: number;
  y: number;
  anchor: 'start' | 'end';
}

export function LineAreaChart({
  series,
  domain,
  ariaLabel,
  width = 720,
  height = 300,
  xTicks = [],
}: LineAreaChartProps) {
  const plot: Plot = {
    left: 46,
    top: 14,
    width: Math.max(10, width - 56),
    height: Math.max(10, height - 42),
  };
  const count = Math.max(1, ...series.map((entry) => entry.pointsPence.length));
  const zeroY = yFor(0, domain, plot);

  const drawn = series.map((entry) => {
    const vertices = [
      { x: plot.left, y: zeroY },
      ...entry.pointsPence.map((valuePence, index) => ({
        x: bandX(index + 1, count, plot),
        y: yFor(valuePence, domain, plot),
      })),
    ];
    const linePath = vertices
      .map((vertex, index) => `${index === 0 ? 'M' : 'L'} ${round(vertex.x)} ${round(vertex.y)}`)
      .join(' ');
    const last = vertices[vertices.length - 1] as { x: number; y: number };
    const areaPath =
      entry.pointsPence.length === 0
        ? ''
        : `${linePath} L ${round(last.x)} ${round(zeroY)} L ${round(plot.left)} ${round(zeroY)} Z`;
    return { entry, linePath, areaPath, last };
  });

  // End labels: nudged apart vertically so two lines finishing close
  // together stay readable, and drawn back inside the plot when a line
  // ends at its right edge.
  const endLabels: EndLabel[] = drawn
    .filter(({ entry }) => entry.pointsPence.length > 0)
    .map(({ entry, last }) => {
      const nearRight = last.x > plot.left + plot.width - 110;
      return {
        key: entry.key,
        text: entry.endLabel,
        colour: entry.colour,
        x: nearRight ? last.x - 5 : last.x + 5,
        y: last.y - 6,
        anchor: nearRight ? ('end' as const) : ('start' as const),
      };
    })
    .sort((a, b) => a.y - b.y);
  for (let index = 1; index < endLabels.length; index += 1) {
    const label = endLabels[index] as EndLabel;
    const previous = endLabels[index - 1] as EndLabel;
    if (label.y - previous.y < AXIS_FONT + 6) label.y = previous.y + AXIS_FONT + 6;
  }
  for (const label of endLabels) {
    label.y = Math.min(Math.max(label.y, plot.top + AXIS_FONT), plot.top + plot.height - 2);
  }

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-auto w-full"
      style={{ maxWidth: '100%' }}
    >
      <Gridlines domain={domain} plot={plot} />
      {drawn.map(({ entry, areaPath }) =>
        areaPath === '' ? null : (
          <path
            key={`area-${entry.key}`}
            d={areaPath}
            stroke="none"
            style={{ fill: entry.colour }}
            fillOpacity={0.14}
          />
        ),
      )}
      {drawn.map(({ entry, linePath }) =>
        entry.pointsPence.length === 0 ? null : (
          <path
            key={`line-${entry.key}`}
            d={linePath}
            fill="none"
            style={{ stroke: entry.colour }}
            strokeWidth={2}
            strokeDasharray={entry.dashed === true ? '5 3' : undefined}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ),
      )}
      <g aria-hidden="true">
        {drawn.map(({ entry, last }) =>
          entry.pointsPence.length === 0 ? null : (
            <circle
              key={`end-${entry.key}`}
              cx={last.x}
              cy={last.y}
              r={3}
              style={{ fill: entry.colour, stroke: CHART_COLOURS.halo }}
              strokeWidth={1.25}
            />
          ),
        )}
        {endLabels.map((label) => (
          <text
            key={`label-${label.key}`}
            x={label.x}
            y={label.y}
            textAnchor={label.anchor}
            fontSize={AXIS_FONT + 1}
            fontWeight={600}
            // The same surface halo as Chart A's lowest-point label: the
            // text sits over the other line's fill and must stay readable.
            style={{ fill: label.colour, stroke: CHART_COLOURS.halo }}
            strokeWidth={3}
            paintOrder="stroke"
          >
            {label.text}
          </text>
        ))}
      </g>
      <BandLabels labels={xTicks} plot={plot} count={count} />
    </svg>
  );
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
