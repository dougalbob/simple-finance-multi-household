# Release notes — v1.34.0 — Charts B, C and F open their line items in line

**Stable feature release**, moving `latest` and GitHub's Latest release. The badge reads
**`v1.34.0 · stable`**. Answers GitHub issue #94 ("Charts B & C & F — when a bar is tapped, open
items in-line below chart"), reviewed in the Arena preview, for full household testing on Unraid.
See decisions 250–251 and SPEC §16.7 B, C and F.

## What changed

- **The purchases behind a bar now open beneath the chart.** Tapping a week's bar on
  **B · Groceries**, a person's segment on **C · Personal spending**, or a category-month bar on
  **F · Three months by category** opens that figure's line items in a panel directly under its
  own chart — the behaviour **Chart E (Where the money went)** has always had — instead of taking
  you away to the Purchases page. The same link sits on each figure in the chart's "Show the
  numbers" table, so the keyboard path does what the drawing does.
- **The panel adds up to the bar you tapped.** Each panel lists the very allocation lines its
  chart summed — date, where, category, who it was for, amount — newest first, so its heading
  total is the bar's figure **to the penny**, refunds netted in. (The old filtered list could
  show more than the bar, because a matched purchase arrives whole; the panel never does.)
- **The old journey is one press further, unchanged.** Every panel ends with
  **Open these purchases →**, going to the same filtered Purchases list as before, beside
  **Close line items**. Tapping the open bar again also closes its panel.
- **Nothing reloads and you never lose your place.** Opening and closing panels — and changing
  what is drawn with Chart C's person chips or Chart F's **Exclude Housing** — are all in-place
  updates that keep your exact scroll position. A panel never outlives its bar: switching a
  person off closes their panel, and excluding Housing closes a Housing panel. The open panel is
  ordinary URL state (`?show=…`), so it works with JavaScript off and a link to "this week,
  itemised" can be sent to the other person.

## Data and upgrade notes

There is **no schema migration, backup-format change or data rewrite**. Existing households
upgrade with no action needed; this release changes only how Charts drill-downs are shown.

## Validation evidence

- `npm run format:check`, `npm run typecheck`, `npm run themes:check`, `npm test`
  (**1,141/1,141 across 268 suites**, +12: `tests/charts-drill.test.ts` for the `?show=` keys and
  resolver reconciliations in `tests/charts-view.test.ts` proving each panel's rows sum to its
  bar) and `npm run build` pass; `npm audit --omit=dev` reports 0 vulnerabilities.
- Browser: the local Playwright `charts` project passed **15/15**, including the reworked grocery
  journey (panel lines sum exactly to the tapped week, then Open these purchases) and a new
  journey tapping drawn bars on B, C and F at phone and laptop widths, asserting one document
  throughout and no scroll movement.
- The required PR checks are `gates`, `browser` and `docker` (including container and applicable
  upgrade smoke). Publication must not proceed unless they pass.

## Unraid update

1. Take a household backup from Settings before updating.
2. Install or update to `ghcr.io/dougalbob/simple-finance-multi-household:v1.34.0` (or
   `:latest` after publication). Confirm the app badge reads **`v1.34.0 · stable`**.
3. Open **Charts** and tap a bar on **B · Groceries**, a segment on **C · Personal spending**
   and a bar on **F · Three months by category**: each opens its line items beneath the chart.
   Check a panel total against its bar, follow **Open these purchases**, and try switching a
   person chip or Exclude Housing with a panel open.
4. Keep the multi-household appdata `/mnt/user/appdata/simple-finance-multi-household` mounted at
   `/data` and host port **3009** mapped to container **3000**. Do not change to the original
   `simple-finance` image, appdata or route.
