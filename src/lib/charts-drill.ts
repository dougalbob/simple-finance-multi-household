/**
 * The in-line line-item panels behind Charts B, C and F (issue #94,
 * decision 250, SPEC §16.7).
 *
 * Before this slice, tapping a bar — or a segment of a stacked bar — left
 * `/charts` for a filtered `/purchases` list. The household asked for the
 * Chart E pattern instead: the purchases behind the bar open **in place**,
 * beneath the chart, with the same “Open these purchases →” and “Close line
 * items” pair, so the four reported charts read the same way. This module is
 * the URL half of that — pure, so the shapes are unit-tested rather than
 * only observed in a browser.
 *
 * One parameter carries the open panel, `show` — the same name Insights uses
 * for its own drill-down. Its value names the chart and the thing tapped, so
 * the URL stays shareable and the panel works with JavaScript off:
 *
 * - `b:2026-09-14` — Chart B, the Monday–Sunday week beginning that day.
 * - `c:2026-09:person:3` / `c:2026-09:household` — Chart C, that calendar
 *   month and that series (the person’s own series key, or the household
 *   bar).
 * - `f:2026-09:12` — Chart F, that calendar month and parent category id.
 *
 * Only one panel is open at a time: opening another chart’s line items
 * replaces the parameter, and tapping the open bar again removes it. Every
 * value is checked against what the chart actually drew before its panel is
 * rendered (`getChartDrillView`), so a stale or hand-edited URL shows no
 * panel rather than a list that disagrees with the drawing — the same
 * honesty-by-construction rule as Chart E’s sync signpost (decision 241).
 */

export type ChartDrillSelection =
  | { kind: 'groceries'; weekStart: string }
  | { kind: 'personal'; month: string; series: string }
  | { kind: 'months'; month: string; parentId: number };

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;
const PERSON_SERIES = /^person:[1-9][0-9]*$/;

/**
 * A real calendar date, not merely a date-shaped string: `Date.parse` happily
 * rolls 2026-02-30 over into March, so the parts are checked back against the
 * round trip.
 */
function isLocalDateText(value: string): boolean {
  if (!LOCAL_DATE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/**
 * A Chart C series key is what `personalSpendSeries` uses (`person:<id>`,
 * `household`), so the same key identifies the bar and the panel.
 */
export function isPersonalSeriesKey(value: string): boolean {
  return value === 'household' || PERSON_SERIES.test(value);
}

/** The stable `show=` value for a selection — shared by the links and the panel. */
export function chartDrillKey(selection: ChartDrillSelection): string {
  switch (selection.kind) {
    case 'groceries':
      return `b:${selection.weekStart}`;
    case 'personal':
      return `c:${selection.month}:${selection.series}`;
    case 'months':
      return `f:${selection.month}:${selection.parentId}`;
  }
}

/** Parse a `show=` value back into a selection; null when it is not one. */
export function parseChartDrillKey(raw: string | null | undefined): ChartDrillSelection | null {
  if (typeof raw !== 'string' || raw === '') return null;
  const kind = raw.slice(0, raw.indexOf(':'));
  const rest = raw.slice(kind.length + 1);
  const separator = rest.indexOf(':');
  const first = separator === -1 ? rest : rest.slice(0, separator);
  // A Chart C series key carries its own colon (`person:3`), so the tail is
  // kept whole rather than split into fields.
  const second = separator === -1 ? undefined : rest.slice(separator + 1);
  switch (kind) {
    case 'b': {
      if (first === '' || second !== undefined) return null;
      if (!isLocalDateText(first)) return null;
      return { kind: 'groceries', weekStart: first };
    }
    case 'c': {
      if (first === '' || second === undefined) return null;
      if (!MONTH_KEY.test(first) || !isPersonalSeriesKey(second)) return null;
      return { kind: 'personal', month: first, series: second };
    }
    case 'f': {
      if (first === '' || second === undefined) return null;
      if (!MONTH_KEY.test(first) || !/^[1-9][0-9]*$/.test(second)) return null;
      return { kind: 'months', month: first, parentId: Number(second) };
    }
    default:
      return null;
  }
}

/**
 * Whether the reader tapped the panel that is already open — the tap that
 * closes it, as Chart E’s selected slice does.
 */
export function isSameChartDrill(
  a: ChartDrillSelection | null,
  b: ChartDrillSelection | null,
): boolean {
  if (a === null || b === null) return false;
  return chartDrillKey(a) === chartDrillKey(b);
}
