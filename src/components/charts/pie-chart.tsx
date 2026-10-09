import { CHART_COLOURS } from './chart-primitives';

/**
 * A pie of shares (SPEC §16.7 E), hand-rolled like every chart in the kit:
 * server-rendered SVG, no client JavaScript.
 *
 * Each slice is a real link to its own line items (`href`), so the drawing
 * works with JavaScript switched off and the slice can be sent to the other
 * person. The selected slice is pulled outwards, so the choice is shown by
 * shape as well as colour, and its name sits in the legend beside the pie.
 */

export interface PieSlice {
  key: string;
  label: string;
  /** Must be positive; zero and negative slices are not drawn. */
  valuePence: number;
  fill: string;
  href: string;
  hint: string;
  selected: boolean;
}

export interface PieChartProps {
  slices: readonly PieSlice[];
  /** Square drawing size in SVG units; the SVG scales to its container. */
  size: number;
  ariaLabel: string;
}

/** The pull-out distance for the selected slice, in SVG units. */
const EXPLODE = 7;
/** Smallest share that gets an in-slice percentage; smaller ones would crowd. */
const LABEL_MIN_SHARE = 0.05;

export function PieChart({ slices, size, ariaLabel }: PieChartProps) {
  const drawn = slices.filter((slice) => slice.valuePence > 0);
  const total = drawn.reduce((sum, slice) => sum + slice.valuePence, 0);
  const centre = size / 2;
  const radius = size / 2 - EXPLODE - 2;

  if (drawn.length === 0 || total <= 0) {
    return (
      <svg
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${size} ${size}`}
        className="h-auto w-full"
        style={{ maxWidth: '100%' }}
      >
        <circle
          cx={centre}
          cy={centre}
          r={radius}
          fill="none"
          strokeDasharray="4 4"
          style={{ stroke: CHART_COLOURS.grid }}
          strokeWidth={1.5}
        />
      </svg>
    );
  }

  // A single slice is the whole disc: an arc from a point back to itself
  // would draw nothing, so it is a circle.
  if (drawn.length === 1) {
    const only = drawn[0] as PieSlice;
    return (
      <svg
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${size} ${size}`}
        className="h-auto w-full"
        style={{ maxWidth: '100%' }}
      >
        <a href={only.href} tabIndex={-1} aria-hidden="true">
          <title>{only.hint}</title>
          <circle
            cx={centre}
            cy={centre}
            r={radius}
            data-slice={only.key}
            data-selected={only.selected ? 'true' : undefined}
            style={{ fill: only.fill, stroke: CHART_COLOURS.halo }}
            strokeWidth={1.5}
          />
        </a>
        <text
          x={centre}
          y={centre + 4}
          textAnchor="middle"
          fontSize={12}
          fontWeight={600}
          style={{ fill: CHART_COLOURS.text, stroke: CHART_COLOURS.halo, paintOrder: 'stroke' }}
          strokeWidth={3}
        >
          100%
        </text>
      </svg>
    );
  }

  let angle = -Math.PI / 2;
  const shapes = drawn.map((slice) => {
    const sweep = (slice.valuePence / total) * Math.PI * 2;
    const start = angle;
    const end = angle + sweep;
    angle = end;
    const mid = (start + end) / 2;
    const offset = slice.selected ? EXPLODE : 0;
    const ox = Math.cos(mid) * offset;
    const oy = Math.sin(mid) * offset;
    const x0 = centre + ox + radius * Math.cos(start);
    const y0 = centre + oy + radius * Math.sin(start);
    const x1 = centre + ox + radius * Math.cos(end);
    const y1 = centre + oy + radius * Math.sin(end);
    const large = sweep > Math.PI ? 1 : 0;
    const d = `M ${centre + ox} ${centre + oy} L ${x0} ${y0} A ${radius} ${radius} 0 ${large} 1 ${x1} ${y1} Z`;
    const share = slice.valuePence / total;
    const labelRadius = radius * 0.62;
    return {
      slice,
      d,
      share,
      labelX: centre + ox + labelRadius * Math.cos(mid),
      labelY: centre + oy + labelRadius * Math.sin(mid),
    };
  });

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${size} ${size}`}
      className="h-auto w-full"
      style={{ maxWidth: '100%' }}
    >
      {shapes.map(({ slice, d }) => (
        <a key={slice.key} href={slice.href} tabIndex={-1} aria-hidden="true">
          <title>{slice.hint}</title>
          <path
            d={d}
            data-slice={slice.key}
            data-selected={slice.selected ? 'true' : undefined}
            style={{ fill: slice.fill, stroke: CHART_COLOURS.halo }}
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
        </a>
      ))}
      {shapes
        .filter(({ share }) => share >= LABEL_MIN_SHARE)
        .map(({ slice, share, labelX, labelY }) => (
          <text
            key={`label-${slice.key}`}
            x={labelX}
            y={labelY + 4}
            textAnchor="middle"
            fontSize={11}
            fontWeight={600}
            aria-hidden="true"
            style={{ fill: CHART_COLOURS.text, stroke: CHART_COLOURS.halo, paintOrder: 'stroke' }}
            strokeWidth={3}
          >
            {`${Math.round(share * 100)}%`}
          </text>
        ))}
    </svg>
  );
}
