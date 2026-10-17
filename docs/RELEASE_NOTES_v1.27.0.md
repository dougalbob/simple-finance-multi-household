# Release notes — v1.27.0 — Long-term forecast growth, pension timing and plan-to ages

**Stable release**, moving `latest` and GitHub's Latest release. The badge reads
**`v1.27.0 · stable`**. Completes issue #73, including the browser acceptance slice.

## What changed

- **State Pension is today's weekly rate.** It now grows each January before its start date
  as well as afterwards. Previously a future start incorrectly used today's rate in that future
  year, understating pension income. A mid-year start is labelled with its month, fraction of a
  year and first full year. Uprating defaults to a fixed, editable **3.50%**, not inflation + 1%.
- **Earnings grow each January.** Today's gross monthly pay rises with the plan's inflation by
  default. Untick **Rises with inflation** to enter an override. Pay still stops at Last paid;
  estimated income tax and NI follow the grown pay.
- **Tax thresholds rise together.** A plan-level **Tax thresholds rise a year** assumption
  defaults to **1.0%**, indexing the card's monetary allowances and thresholds from 2027. Tax
  rates do not change. The footer states the assumption. January indexation is a calendar-year
  approximation, not the UK's 6 April tax-year boundary.
- **Each person has a plan-to age.** Household-chosen sex seeds editable life expectancy
  (84 man / 87 woman), and plan-to defaults five years beyond that. Both ages can be lowered.
  The later person's plan-to year sets the forecast end, which stays editable. Earnings,
  State Pension and drawdown stop after that person's plan-to year; spending continues.
- **Editor fixes:** dependent age changes now update the displayed value as well as the saved
  plan; name and birth year precede life expectancy; inputs fit narrow phones; the editor is
  inert until hydrated so early interactions are not silently lost.

## Data caveats and who is affected

**Existing saved forecasts change numbers on loading under the new defaults:** pay grows with
inflation, tax thresholds rise at 1.0%, and future State Pension starts include pre-start uprating.
Review the assumptions before comparing old and new answers. Old plans without plan-to ages
fill them from their saved horizon, preserving that horizon. New fields default automatically;
existing plans remain loadable and saveable.

No schema migration, backup-format change, household isolation change or authentication change.
Purchases, schedules, pots and other household records are not rewritten by the forecast.
Drafts leave sex for the household to choose. Life expectancy is an average, not a personal
prediction. Undrawn pension capital stays invested after plan-to; survivor transfer and mortality
modelling remain follow-up work. Forecasts remain arithmetic on assumptions, not financial advice.

## Validation evidence

- Unit suite: **1,063/1,063 across 249 suites**; format, typecheck and production build pass.
- Local Chromium: **9/9 long-term journeys**, no retries, covering saved assumptions, pension
  part-years, earnings growth, dependent ages, horizon sync and navigation/guide access.
- Desktop **1400px**, phone **390px** and narrow phone **320px** screenshots captured; automated
  checks confirm no document-level horizontal overflow. Wide tables scroll within their panels.
- Required PR and main CI (gates, full browser acceptance and Docker/upgrade smoke), then Publish
  and registry-tag verification, must pass before this release is declared published.

## Unraid update

1. **Take a backup first**, preserving your current saved assumptions for comparison.
2. Force Update the existing multi-household container using
   `ghcr.io/dougalbob/simple-finance-multi-household:latest` (or pin `:v1.27.0`).
3. Confirm **`v1.27.0 · stable`**, open Long-term forecast and review all assumptions with your data.

Keep appdata `/mnt/user/appdata/simple-finance-multi-household` mounted at `/data` and host port
**3009** mapped to container **3000**. Do not change to the original `simple-finance` image or
appdata. Existing backups remain valid. No new setup or migration step is required from you.
