# Release notes — v1.29.0 — The Chart D → E sync and an honest month-on-month verdict

**Stable release**, moving `latest` and GitHub's Latest release. The badge reads
**`v1.29.0 · stable`**. Answers GitHub issue #81, designed with the household in conversation
(decision 241) and accepted in the Arena preview.

## What changed

- **Charts — a Sync to Spending mix toggle on Spending trends (#81).** A chip beside the
  category-preset dropdown, off by default. Engaging it is inert: nothing changes on the
  Spending mix until a month is tapped. While it is on, **every month link on Spending
  trends** — each bar, and the table twin's month names, so the keyboard path does what the
  drawing does — hands the Spending mix **that whole calendar month with the preset's
  categories ticked**, landing on the pie. The month being lived ends at today, which is
  exactly the Spending mix's existing **Month to date** quick window, so that pill lights up
  on its own. There is deliberately **no Chart E → Chart D sync** and no date fields on
  Spending trends — payday cycles are weeks, and monthly trend bars over them are thin.
- **While synced, nothing on Spending trends opens Purchases.** The drill-down returns when
  the sync is switched off; until then the Spending mix's line items carry the same
  month-and-category list through **Open these purchases**.
- **The engaged chip is unmistakable on every theme**: the amber warning ramp (re-lit per
  theme by the theme generator) plus a soft breathing ring. `prefers-reduced-motion` stops
  the pulse and keeps the amber; the ✓, `aria-pressed` and the bars' changed hints
  ("set the Spending mix to this month") say the same thing colour does.
- **The Spending mix signposts a synced window.** An amber notice above the pie reads
  "Showing September 2026 with the Fixed commitments categories — set from Spending
  trends", with a **Return to since last payday** link. That link and disengaging the
  toggle are two doors to the same URL — the **full reset**: payday window, every category,
  slice closed, provenance and toggle cleared. The signpost is honest by construction: it
  appears only when the window drawn is exactly what tapping one of the drawn month bars
  produces and the ticked categories are exactly the preset's, so an edited URL or a stale
  link shows none.
- **Show takes control of the window.** Pressing **Show** in the Spending mix's own scopes
  panel keeps the signpost only when it re-submits exactly what the sync set; change
  anything (dates or categories) and the signpost goes, the bars stay synced, and the next
  tap re-claims the window.
- **Fixed on the way: the Spending mix no longer resets the trends preset.** Its slice
  links and Show built a fresh query string and silently dropped `?preset=`, sending Chart
  D back to its first preset. Every Chart E control now merges parameters the way the rest
  of the page always did, and a no-JavaScript Show carries the other charts' filters in
  hidden inputs.
- **Fixed from preview feedback: the trends verdict now compares month on month.** It read
  "£46.99 in September 2026 — up £12.00 on June 2026" — the latest complete month against
  the month three months earlier (inherited from v1.28.0), which asked the reader to hold
  a quarter-long gap in their head for no payoff. It now compares with **the complete month
  immediately before it** ("…on August 2026"), and a lone complete month states itself
  without a comparison.

## Data caveats and who is affected

**No schema change, no migration and no backup-format change.** The sync is pure URL
state — nothing is written to Settings, and a synced view is a shareable link. All
figures, purchases, presets and schedules are unchanged; nothing is rewritten. Every
household gets the new toggle on Charts; nothing to do, nothing to migrate.

## Validation evidence

- Unit suite: **1,088/1,088 across 257 suites** (12 new tests in
  `tests/charts-sync.test.ts` pin the query builder, the month→window hand-off and the
  Show-reconfirm rule; the trends-comparison tests pin the new verdict); `format:check`,
  `typecheck` and the production build pass.
- Server-rendered behaviour verified against the seeded E2E household: synced bar hrefs
  (whole months, current month ending today, preset categories, provenance), the signpost
  truth table (edited URLs, stale months and mismatched categories show none) and the
  full-reset URL.
- A new browser journey in `e2e/charts.spec.ts` covers engage → tap a month → signpost →
  Show-reconfirm → return → drill-down restored, and asserts Chart E's controls keep
  Chart D's preset. The sandbox has no browser binaries, so the suite runs in CI as ever.
- Required PR and `main` CI (gates, browser acceptance and Docker/upgrade smoke), then
  Publish and registry-tag verification, must pass before this release is declared
  published.

## Unraid update

1. **Take a backup first** from Settings.
2. Force Update the existing multi-household container using
   `ghcr.io/dougalbob/simple-finance-multi-household:latest` (or pin `:v1.29.0`).
3. Confirm **`v1.29.0 · stable`**, then try: Charts → Spending trends → engage
   **Sync to Spending mix** → tap a month bar → the pie shows that month with the preset's
   categories and the "set from Spending trends" notice → **Return to since last payday**
   resets everything and disengages the toggle.

Keep appdata `/mnt/user/appdata/simple-finance-multi-household` mounted at `/data` and
host port **3009** mapped to container **3000**. Do not change to the original
`simple-finance` image or appdata. Existing backups remain valid. No new setup or
migration step is required from you.
