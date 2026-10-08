# Release notes — v0.35.0 — Tap a day-by-day amount to see what it is made of

## What changed

The Horizon **Day by day** card is easier to use on a phone. Each amount in the **Commitments**, **Expected money in** and **Day-to-day** columns is now a tap (or click) target. Tapping it opens the breakdown inline, directly beneath that date's row, so the date stays in view and you no longer have to scroll back to the "Commitments in the window" card to find it.

- **Commitments.** Each payment due that day, with its pot and type, e.g. "Council tax · Bills · direct debit". Three direct debits on the same day show as three lines that add up to the day's figure.
- **Expected money in.** Each item due that day. Expected support is marked "expected — never received", and it is never shown as income.
- **Day-to-day.** Each projected weekly shop or vehicle fill, with a plain sentence explaining why it falls on that date. For example: "Projected every 7 days from the last weekly shop on 2026-10-07, at the figure set in Settings." Where no shop or fill has been recorded yet, the sentence says it is projected from tomorrow.
- **One at a time.** Opening a second breakdown closes the first. Tapping the same amount again, or **Close**, shuts it.

The breakdown uses the same figures as the table, so the totals always agree with the day's row. The End of day column is unchanged.

## Schema and data

None. No migration, no data conversion, no backup-format change and no new dependency. Nothing is written to the database; the breakdown is built from the projection already on the page.

## Who is affected and what to do

Everyone who uses Horizon. Nothing to set up or re-enter. Take a backup and Force Update as usual, then open Horizon, expand **Day by day** and tap an amount to see its detail.

## Verification

- `npm test` — **671 passed**, 0 failed across 160 suites. New tests cover the per-day grouping, the basis wording for shops and fills, and the basis rules in `tests/day-to-day.test.ts`.
- `npm run typecheck`, `npm run format:check`, `npm run themes:check` and `npm run build` — passed.
- `npm audit --omit=dev` — 0 vulnerabilities.
- Playwright — the Horizon project passed 10 of 10 in a local run, including the new spec "tapping a day-by-day amount opens its breakdown beneath that date, one at a time". The full browser suite runs again in CI (`browser` job).
- Checked on a 390px-wide phone layout: the breakdown fits the screen and the amounts stay on one line.

Decision recorded in [`docs/IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md): 185.

## What to do

In Unraid, **take a backup, then Force Update**. The version badge should read `v0.35.0 · pre-release`.

Release notes document: [`docs/RELEASE_NOTES_v0.35.0.md`](RELEASE_NOTES_v0.35.0.md).
