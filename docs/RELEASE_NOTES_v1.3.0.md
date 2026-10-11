# Release notes — v1.3.0 — The worked example

**Type:** stable minor release. This moves `latest` and is GitHub's Latest release.
**Install this image:** `ghcr.io/dougalbob/simple-finance-multi-household:latest`.
**Version badge:** `v1.3.0 (stable)`.

## Why this release exists

A brand-new household can now see what the app looks like *after* the setup is done — without any fake data ever touching their database. Slice 3 of [`docs/ONBOARDING_PLAN.md`](ONBOARDING_PLAN.md) delivers `/example`: a fictional household (Alex & Sam) with two months of realistic history, rendered through the app's real engines and components. Every chart, projection, and insight is computed exactly as it would be for their own data, and the page reads no household records and writes nowhere.

No schema change, no migration, no storage change, no auth change and no new dependency.

## What changed

- **New: `/example` — "A household that has been using this for two months".** One page that shows:
  - **Home:** live payday projection, the quick-entry till mid-purchase, household total with per-pot breakdown
  - **Charts (all five):**
    - Forecast (liquid funds, today to a month ahead, with day-by-day detail)
    - Groceries (weekly shop vs configured figure and trailing average)
    - Personal spending (hers / his / household, discretionary categories only)
    - Fixed commitments (tracked categories, with schedule-converted toggle)
    - Spending mix (net spending by parent category, Personal split by person)
  - **Insights (all four panels):**
    - Month comparison (this month vs previous, with drift)
    - Personal spending this month
    - Vehicle running costs (rolling 12 months, with annual-spread logic)
    - Honesty loop (configured vs actual weekly shop and fuel)
  - **Horizon:** full projection to the next payday (or five weeks), with commitments, expected money in, day-to-day spending, and day-by-day balance table
  - Every section captioned with the records that produced it (e.g. "Two bank accounts, two cash pots, one salary on the 27th, eleven direct debits, two months of shops") and linked to the real page it will become
  - Behind the sign-in gate, reads no household records, writes nowhere — an in-memory seed rendered through the same engines the app uses

- **New: `src/lib/demo/household.ts` — Shared seed module.** `seedDemoHousehold(databasePath, now)` creates the fictional household in an in-memory SQLite database (via temp file) or a file path. The same module is used by `/example` and will be adopted by the E2E harness in a follow-up. All figures, names, phone numbers and links are invented (`.example` domains, Ofcom fictional numbers). The data is dated relative to `now` so the previous calendar month is always complete, satisfying the two-month requirement.

- **New: `scripts/seed-example-household.mts` — CLI rehearsal tool.** Seeds the same fictional two months into an isolated `DATA_DIR` (default `.preview-data`), refusing a production-shaped root or any root that already contains records. Creates a minimal registry with `alex@example.com` (platform_admin) and `sam@example.com`. For a household that wants to *touch* the example rather than look at it:
  ```bash
  DATA_DIR=./.preview-data node --import tsx scripts/seed-example-household.mts
  DATA_DIR=./.preview-data AUTH_DEV_BYPASS=true AUTH_DEV_IDENTITY_EMAIL=alex@example.com npm run dev
  ```

- **Footer link:** `/example` added to the global footer alongside "Getting started" and "Guide".

- **Documentation:** `docs/ONBOARDING_PLAN.md` updated to reflect Slice 3 shipped (was "not built"); added §10 documenting what Slice 3 delivered.

## Who is affected and what to do

Nothing is migrated and no data changes. Take the usual backup, then update to `latest`. The `/example` route is now available behind sign-in; it never touches the household's database. The Unraid template defaults to `:latest` which now resolves to `v1.3.0`.

## Validation

- `npm test`: 857 unit tests passing (15 new from Slice 2; no new unit tests for Slice 3 as it uses existing engines)
- Browser acceptance: first-run suite (empty household, 3 of 3) and seeded suite (64 of 64) pass in CI
- Typecheck, formatting and the production build are clean in CI
- Preview verified: `/example` returns 200 and renders all sections populated with the two-month fictional data

## Not verified

- A real phone render of `/example`. The layout was checked in headless Chromium at phone and laptop widths only.
- The E2E harness has not yet been switched to the shared `src/lib/demo/household.ts` module — that is a follow-up.

## Next after this release

All three onboarding slices are now shipped. The next planned work is the existing household import (see `docs/MULTI_HOUSEHOLD_PLAN.md`), which will move the original single-household data into the new multi-household product line.

## Known limitations

- The worked example is read-only in the app — the `scripts/seed-example-household.mts` rehearsal tool is the hands-on option.
- The E2E harness still uses its own inline seed (`scripts/e2e-server.mts`); the switch to `src/lib/demo/household.ts` is a separate PR.
- Unchanged from `v1.2.0`: the support-grant flow has unit tests but no browser test, the `secure` cookie flag applies only in production builds, and household restore reads up to 512 MiB into memory.