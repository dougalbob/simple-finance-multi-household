import Link from 'next/link';
import { bandWidth, bandX, yFor, type ChartDomain, type Plot } from './scale';
import {
  BandLabels,
  CHART_COLOURS,
  Gridlines,
  ReferenceLine,
  SubZeroBand,
} from './chart-primitives';

/**
 * Bars for a period series (SPEC §16.7 B and D).
 *
 * **Links are the drill-down** (decision 155): a bar with an `href` is a
 * real server-rendered `<a>` around its `<rect>`, pointing at `/purchases`
 * with the period's filters. It works without JavaScript, opens in a new
 * tab, and can be sent to the other person — which a click handler and a
 * router push cannot do.
 *
 * A **soft** bar (`soft: true`) is the one exception, and it is still a real
 * anchor: Chart D's synced month links rewrite this same page's query, so
 * they ride Next's client router with `scroll={false}` instead of reloading
 * the document (issue #87). That keeps the reader's exact place while Chart
 * E redraws beneath — the full-document load used to paint the top of the
 * page for a frame before the `#mix` fragment landed them back at Chart D.
 *
 * The SVG carries `role="img"`, so its subtree is one image to a screen
 * reader; the same links are repeated as ordinary links in the table twin,
 * which is the accessible (and keyboard) path. The bar anchors are therefore
 * `tabIndex={-1}` and `aria-hidden` — pointer affordances, never a trap.
 */

export interface BarDatum {
  key: string;
  label: string;
  valuePence: number;
  /** `/purchases?...` — the purchases behind this bar. */
  href?: string;
  /**
   * Same-page link (Chart D's synced month, issue #87): navigate through the
   * client router without touching the scroll position, so Chart E updates
   * where the reader is standing instead of after a full-document reload.
   */
  soft?: boolean;
  /** Native tooltip text. */
  hint?: string;
  /** An in-progress period: drawn hatched, never counted in an average. */
  muted?: boolean;
}

export interface BarChartProps {
  bars: readonly BarDatum[];
  domain: ChartDomain;
  ariaLabel: string;
  /**
   * A document-unique prefix for this drawing's hatch pattern (decision 202).
   *
   * Every chart is rendered **twice** — a phone figure and a laptop figure, one
   * of them hidden by CSS at any width — and an id is document-global. When the
   * two figures shared `chart-hatch`, `url(#chart-hatch)` resolved to whichever
   * copy came first in the DOM: at laptop widths that is the phone figure, whose
   * pattern sits inside a `display: none` subtree, and a paint server that
   * cannot be resolved paints **nothing at all** (SVG 1.1). The bars were in the
   * DOM, at the right size, and invisible. Passing the figure in keeps each
   * drawing's pattern in its own `<defs>`.
   */
  idPrefix: string;
  width?: number;
  height?: number;
  xTicks?: ReadonlyArray<{ index: number; label: string }>;
  referenceLines?: ReadonlyArray<{ valuePence: number; label: string; colour?: string }>;
  colour?: string;
}

export function BarChart({
  bars,
  domain,
  ariaLabel,
  idPrefix,
  width = 720,
  height = 260,
  xTicks = [],
  referenceLines = [],
  colour = CHART_COLOURS.bar,
}: BarChartProps) {
  const plot: Plot = {
    left: 46,
    top: 14,
    width: Math.max(10, width - 56),
    height: Math.max(10, height - 42),
  };
  const count = bars.length;
  const band = bandWidth(count, plot);
  const gap = Math.min(4, band * 0.22);
  const hatchId = `${idPrefix}-hatch`;
  const barWidth = Math.max(1.5, band - gap);
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
        <pattern
          id={hatchId}
          width="5"
          height="5"
          patternTransform="rotate(45)"
          patternUnits="userSpaceOnUse"
        >
          <rect width="5" height="5" style={{ fill: CHART_COLOURS.barMuted }} />
          <line x1="0" y1="0" x2="0" y2="5" style={{ stroke: colour }} strokeWidth="1.6" />
        </pattern>
      </defs>
      <SubZeroBand domain={domain} plot={plot} />
      <Gridlines domain={domain} plot={plot} />
      {bars.map((bar, index) => {
        const valueY = yFor(bar.valuePence, domain, plot);
        const y = Math.min(valueY, zeroY);
        const barHeight = Math.max(bar.valuePence === 0 ? 0 : 1, Math.abs(valueY - zeroY));
        const x = bandX(index, count, plot) + gap / 2;
        // An in-progress bar is **two** rects, deliberately (decision 202): a
        // solid muted base and the hatch over it. The hatch is what says "this
        // period is still being lived", but if a paint server ever fails again
        // the bar falls back to a flat muted bar instead of disappearing.
        const rect = bar.muted ? (
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
              style={{ fill: `url(#${hatchId})` }}
              rx={1}
            />
          </>
        ) : (
          <rect x={x} y={y} width={barWidth} height={barHeight} style={{ fill: colour }} rx={1} />
        );
        const title = bar.hint === undefined ? null : <title>{bar.hint}</title>;
        if (bar.href === undefined) {
          return (
            <g key={bar.key}>
              {title}
              {rect}
            </g>
          );
        }
        if (bar.soft === true) {
          return (
            <Link
              key={bar.key}
              href={bar.href}
              scroll={false}
              // This link rewrites the chart's own query: prefetching a
              // dozen month variants would re-run every chart query on a
              // hover, for a click the reader may never make.
              prefetch={false}
              tabIndex={-1}
              aria-hidden="true"
            >
              {title}
              {rect}
            </Link>
          );
        }
        return (
          <a key={bar.key} href={bar.href} tabIndex={-1} aria-hidden="true">
            {title}
            {rect}
          </a>
        );
      })}
      {referenceLines.map((reference, index) => (
        <ReferenceLine
          key={`${reference.label}-${reference.valuePence}`}
          valuePence={reference.valuePence}
          label={reference.label}
          colour={reference.colour ?? CHART_COLOURS.reference}
          domain={domain}
          plot={plot}
          // Alternate ends: two references at similar values (the configured
          // figure and the average it is being judged against) must not print
          // on top of each other.
          side={index % 2 === 0 ? 'start' : 'end'}
        />
      ))}
      <BandLabels labels={xTicks} plot={plot} count={count} />
    </svg>
  );
}
