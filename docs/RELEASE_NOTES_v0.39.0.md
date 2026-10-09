# Release notes — v0.39.0 — Where the money goes, and Horizon totals

## What changed

- **Where the money goes: a spending pie on Charts.** A new card on `/charts` shows net spending for a chosen window as a pie, one slice per parent category. Personal is split per person, so each person's own spending is a slice of its own. Household-marked personal spending is its own slice and is never split between people. Entertainment & Eating Out stays one slice.
- **The window defaults to the payday cycle.** It runs from the most recent payday up to the day before the next one. A weekend payday counts as the Friday before, as income already does. You can also pick the previous payday cycle, the calendar month, or custom dates.
- **Choose what is counted.** Tick or untick categories to include or exclude them from the pie and its total. The selector works without JavaScript, and your choices stay in the page address, so a link to a view can be sent to someone else.
- **Click a slice to see its line items.** Each slice lists the purchases behind it, with date, where, category, who it was for and amount. **Open these purchases** takes you to the same window in the purchases list.
- **A category that nets to zero or below is not drawn.** A slice cannot be negative, so it stays in the table with its real figure, marked "not drawn".
- **Horizon shows totals in each card heading.** The commitments total, the expected money in total and the day-to-day total now sit beside each card's count. They add up the same rows the card shows. Expected money in still carries its "expected — never received" note, so an expected receipt is never presented as money received.

## Schema and data

None. No migration, data conversion, backup-format change or new dependency. The pie is worked out when the page is read and is not stored.

## Who is affected and what to do

- **Everyone:** nothing to configure. Open **Charts** and check the **Where the money goes** card, then open **Horizon** and check the totals in each card heading.
- **If the payday window looks wrong:** it is driven by the main salary schedule. Check that the salary is on **Money coming in** (`/income`). With no payday scheduled, the card falls back to the calendar month and says so.

## Verification

- `npm test` — **749 passed**, 0 failed across 178 suites. The 26 new tests cover the pie rules (no database) and the pie against an independent sum of purchases and against Insights (with the database).
- `npm run typecheck`, `npm run format:check`, `npm run themes:check` and `npm run build` — passed.
- `npm audit --omit=dev` — 0 vulnerabilities.
- Browser acceptance (Playwright) is release-blocking. It runs as the PR's `browser` check, not locally for this release. The `gates`, `browser` and `docker` checks must all be green before merge.

Decisions recorded in [`docs/IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md): 194–195.

## What to do

In Unraid, **take a backup, then Force Update**. The version badge should read `v0.39.0 · pre-release`.

Release notes document: [`docs/RELEASE_NOTES_v0.39.0.md`](RELEASE_NOTES_v0.39.0.md).
