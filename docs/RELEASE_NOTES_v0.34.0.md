# Release notes — v0.34.0 — Averages count only recorded time

## What changed

Two averages were counting time before the household had started recording, so they read lower than the real spend. Both now count only the time that has actually been recorded.

- **Charts — groceries.** The average is taken over recorded grocery lines only, bucketed Monday to Sunday. The count starts from the first recorded purchase, so the weeks before recording began are no longer counted as zero weeks. A week with no shop *after* recording began is still a zero week, so the average is not flattered. The current week is still being lived and never counts towards the average. A partly recorded first week is shown but marked "not counted", so it never mixes with whole weeks.
- **Insights — fuel comparison.** The average divides by the calendar months that count, not by every month in the window. A month counts when it contains or follows the first recorded purchase. This includes the first, part-recorded month, so a household that began recording part way through a month now sees that month's fuel as its average. Months that ended before recording began are left out. Where the first recorded month did not start on the 1st, the panel says that fuel bought earlier in that month is not in the figure. With no counted month there is no average and no drift.
- **Period wording.** The Insights panel says "per week" or "per month" for these averages, and never "per monthly".

Figures change on upgrade. A household that started recording recently will see a higher grocery weekly average and, where it applies, a fuel average based on the first recorded month. Nothing is lost: the underlying purchases are unchanged.

## Schema and data

None. No migration, no data conversion, no backup-format change and no new dependency. The start of recording is worked out from the purchases already stored, so nothing new is written to the database.

## Who is affected and what to do

Everyone. There is nothing to set up, check or re-enter. Take a backup and Force Update as usual, then look at the Charts groceries card and the Insights fuel comparison if you want to see the new figures.

## Verification

- `npm test` — **660 passed** across 158 suites, including `tests/groceries-recording-start.test.ts`, `tests/fuel-recording-start.test.ts`, the groceries block in `tests/chart-series.test.ts`, and `tests/schedule-category-correction.test.ts`, which pins the existing forward-only schedule category rule.
- `npm run typecheck`, `npm run format:check`, `npm run themes:check` and `npm run build` — passed.
- `npm audit --omit=dev` — 0 vulnerabilities.
- Playwright browser acceptance — **115 passed** across every project in a local run (`docs/SANDBOX.md` entry 8), and again in CI (`browser` job).

Decisions recorded in [`docs/IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md): 67 (panel honesty loop), 183 (groceries recorded start) and 184 (fuel first, part-recorded month counts).

## What to do

In Unraid, **take a backup, then Force Update**. The version badge should read `v0.34.0 · pre-release`.

Release notes document: [`docs/RELEASE_NOTES_v0.34.0.md`](RELEASE_NOTES_v0.34.0.md).
