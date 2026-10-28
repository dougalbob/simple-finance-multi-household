import { BandLabels, CHART_COLOURS, SubZeroBand } from './chart-primitives';
import { bandWidth, bandX, chartDomain, niceStep, yFor, type Plot } from './scale';

/**
 * The Energy page's monthly usage chart (issue 118, v1.44.0; SPEC §29).
 *
 * Two bars per calendar month — gas and electricity — measured in **kWh**, not
 * money, because usage is what the household is trying to see. It reuses the
 * chart kit's geometry (`scale.ts`) and paint (`chart-primitives.tsx`) so the
 * line weights, grid and axis type match every other drawing in the app; only
 * the axis labels differ, because a kWh axis is not a money axis.
 *
 * Two rules are visible in the drawing itself:
 *
 * - **A month with no bill draws no bar.** `null` is a gap, never a zero: a
 *   zero bar would claim the household used nothing that month.
 * - **A month whose bill has only one fuel recorded shows one bar**, and the
 *   missing fuel is simply absent — unknown, not nil. The table twin and the
 *   bill list say so in words.
 */

export interface EnergyChartSeries {
  key: 'gas' | 'electric';
  label: string;
  fill: string;
}

export interface EnergyChartBand {
  key: string;
  /** Abbreviated axis label, e.g. `Oct`. */
  label: string;
  /** Full label for the hover hint, e.g. `October 2026`. */
  labelHint: string;
  gasKwh: number | null;
  electricKwh: number | null;
}

export interface EnergyUsageChartProps {
  bands: readonly EnergyChartBand[];
  series: readonly EnergyChartSeries[];
  ariaLabel: string;
  /** Document-unique prefix for this drawing's ids (phone and laptop both draw it). */
  idPrefix: string;
  width?: number;
  height?: number;
}

/** Short axis text: `1.2k` above a thousand kWh, whole numbers below. */
export function formatAxisKwh(kwh: number): string {
  if (Math.abs(kwh) >= 1000) {
    const thousands = kwh / 1000;
    return `${thousands >= 10 ? Math.round(thousands) : Math.round(thousands * 10) / 10}k`;
  }
  return String(Math.round(kwh));
}

/** The y-domain for a run of kWh figures, in whole kWh. */
export function energyDomain(values: readonly number[]): ReturnType<typeof chartDomain> {
  const finite = values.filter((value) => Number.isFinite(value));
  const max = Math.max(0, ...finite);
  // Whole-kWh ticks: a 4 kWh step reads better than a 4.2 one on this axis.
  const rough = max <= 0 ? 100 : max / 4;
  const step = Math.max(1, Math.round(niceStep(rough)));
  const top = Math.max(step, Math.ceil((max * 1.08) / step) * step);
  const ticks: number[] = [];
  for (let value = 0; value <= top; value += step) ticks.push(value);
  return { min: 0, max: top, ticks };
}

export function EnergyUsageChart({
  bands,
  series,
  ariaLabel,
  idPrefix,
  width = 720,
  height = 280,
}: EnergyUsageChartProps) {
  const plotLeft = 52;
  const plotRight = 12;
  const count = Math.max(1, bands.length);
  // Twelve months need room to breathe; the scroller takes the overflow.
  const floor = width < 400 ? 40 : 52;
  const drawingWidth = Math.max(width, plotLeft + count * floor + plotRight);
  const plot: Plot = {
    left: plotLeft,
    top: 14,
    width: Math.max(10, drawingWidth - plotLeft - plotRight),
    height: Math.max(10, height - 42),
  };
  const band = bandWidth(count, plot);
  const gap = Math.min(4, band * 0.08);
  const subWidth = (band - gap) / Math.max(1, series.length);
  const barWidth = Math.min(16, Math.max(3, subWidth - 8));
  const zeroY = yFor(0, { min: 0, max: 1, ticks: [0] }, plot);
  /**
   * One domain for the whole drawing. It is worked out from the figures that
   * exist: a month with no bill contributes nothing to the scale, because it
   * contributes no bar.
   */
  const domain = energyDomain(
    bands.flatMap((entry) => [entry.gasKwh ?? 0, entry.electricKwh ?? 0]),
  );

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${drawingWidth} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-auto"
      style={{ width: `${drawingWidth}px`, maxWidth: 'none', height: 'auto' }}
    >
      {/* Gridlines, labelled in kWh rather than in money. */}
      <g aria-hidden="true">
        {domain.ticks.map((tick) => {
          const y = yFor(tick, domain, plot);
          return (
            <g key={tick}>
              <line
                x1={plot.left}
                x2={plot.left + plot.width}
                y1={y}
                y2={y}
                style={{ stroke: tick === 0 ? CHART_COLOURS.axis : CHART_COLOURS.grid }}
                strokeWidth={1}
              />
              <text
                x={plot.left - 6}
                y={y + 3}
                textAnchor="end"
                fontSize={10}
                style={{ fill: CHART_COLOURS.text }}
              >
                {formatAxisKwh(tick)}
              </text>
            </g>
          );
        })}
      </g>
      <SubZeroBand domain={{ min: 0, max: 1, ticks: [0] }} plot={plot} />
      {bands.map((entry, bandIndex) => {
        const left =
          bandX(bandIndex, count, plot) +
          (band - series.length * barWidth - (series.length - 1) * gap) / 2;
        const values: Record<EnergyChartSeries['key'], number | null> = {
          gas: entry.gasKwh,
          electric: entry.electricKwh,
        };
        return (
          <g key={entry.key}>
            {series.map((line, seriesIndex) => {
              const value = values[line.key];
              if (value === null) return null;
              const top = yFor(value, domain, plot);
              const x = left + seriesIndex * (barWidth + gap);
              return (
                <rect
                  key={`${entry.key}-${line.key}`}
                  x={x}
                  y={top}
                  width={barWidth}
                  height={Math.max(1, zeroY - top)}
                  style={{ fill: line.fill }}
                  rx={1.5}
                >
                  <title>{`${entry.labelHint} · ${line.label} ${Math.round(value)} kWh`}</title>
                </rect>
              );
            })}
          </g>
        );
      })}
      <BandLabels
        count={count}
        plot={plot}
        labels={bands.map((entry, index) => ({ index, label: entry.label }))}
        hints={bands.map((entry) => entry.labelHint)}
      />
      {/* One quiet mark per month with no bill at all, so a gap is visible as
          "nothing recorded" rather than as a month the household forgot. */}
      {bands.map((entry, bandIndex) => {
        if (entry.gasKwh !== null || entry.electricKwh !== null) return null;
        const x = bandX(bandIndex, count, plot) + band / 2;
        return (
          <g key={`gap-${entry.key}`} aria-hidden="true">
            <line
              x1={x - 3}
              x2={x + 3}
              y1={zeroY - 3}
              y2={zeroY - 3}
              style={{ stroke: CHART_COLOURS.text }}
              strokeWidth={1.4}
            />
            <title>{`${entry.labelHint} · no bill recorded`}</title>
          </g>
        );
      })}
      <g aria-hidden="true" data-energy-axis-unit>
        <text
          x={plot.left - 6}
          y={plot.top - 4}
          textAnchor="end"
          fontSize={10}
          style={{ fill: CHART_COLOURS.text }}
        >
          kWh
        </text>
      </g>
      <g aria-hidden="true" data-chart-id={idPrefix} />
    </svg>
  );
}
