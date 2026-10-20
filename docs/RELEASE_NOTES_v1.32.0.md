# Release notes — v1.32.0 — Chart G: Spending pace

**Stable release**, moving `latest` and GitHub's Latest release. The badge reads
**`v1.32.0 · stable`**. Implements GitHub issue #89 (decision 246), designed with the
household in conversation, reviewed in the Arena preview and approved for full household
testing on Unraid.

## What changed

- **New Chart G — Spending pace (#89).** At the bottom of **Charts**, “How spending builds
  through two months” draws two months' recorded net spending added up day by day from the
  1st, as overlapping lines with a semi-transparent fill, so the pace of one month reads
  against the other. The verdict compares the two months at their last common drawn day —
  “By day 20, October 2026 has spent £404.06 — £10.30 less than September 2026 at the same
  point. September 2026 finished at £697.85.” — and the table underneath carries every day's
  spend (linking to that day's purchases), each month's running total and the signed
  difference.
- **Choose the two months and what counts.** **Compare** and **With** selectors plus a
  **Categories** scope, submitted together by **Show**: all spending by default, or any of
  the household's saved category presets from Settings — the same presets Spending trends
  uses, under this chart's own URL parameter, so neither chart disturbs the other. A preset
  is also how a household with one very large category stops it flattening the line.
- **Only fully recorded months are compared.** A month is offered only when recording covers
  it from the 1st. Recording is taken to begin on the earliest dated spending entry of any
  kind — manual or scheduled — so the month recording began part-way through can never be
  selected (it would forever look artificially cheap), and until the first full recorded
  month completes, the card explains the wait instead of drawing. The current month is drawn
  through today even before anything has been spent in it.
- The Charts page now asks **seven** questions. The issue's household-balance version of
  this chart was shelved during design and is not part of this release.

## Data and upgrade notes

There is **no schema migration, backup-format change or data rewrite**. The chart is a
read-only view over the same recorded purchases every other chart and the Insights tables
already read, and every line's final figure is the same net total those pages print for
that month. Newer households simply see the explanatory empty state on Chart G until their
first full recorded month completes; nothing else changes on upgrade.

## Validation evidence

- `npm run format:check`, `npm run typecheck`, `npm test` (**1,112/1,112 across 261
  suites**) and `npm run build` pass.
- A new Playwright journey covers Chart G end to end — the default two months, a day's
  drill-down link, changing the comparison month and the category preset in the URL (Chart
  D's own preset choice untouched), the refused part-recorded month and the same-month
  state — and Chart G joins the shared phone/laptop figure checks, including no sideways
  page pan at 320px or 360px with 130% text. It passed locally against the seeded household
  (13/13 in the `charts` project); the required PR `browser` check remains the release
  gate.
- The required PR checks are `gates`, `browser` and `docker` (including container and
  applicable upgrade smoke). Publication must not proceed unless they pass.

## Unraid update

1. Take a household backup from Settings before updating.
2. Install or update to `ghcr.io/dougalbob/simple-finance-multi-household:v1.32.0` (or
   `:latest` after publication). Confirm the app badge reads **`v1.32.0 · stable`**.
3. Open **Charts** and scroll to “G · Spending pace” to try the new chart. No setting needs
   changing first; existing saved category presets are offered automatically.
4. Keep the multi-household appdata `/mnt/user/appdata/simple-finance-multi-household`
   mounted at `/data` and host port **3009** mapped to container **3000**. Do not change to
   the original `simple-finance` image, appdata or route.
