# Release notes — v0.29.0 — Overview links to filtered purchases

## What changed

The Overview panels now link directly to the Purchases records behind their figures:

- In **Spending, by parent / This month so far**, each parent category name links to Purchases for
  that live parent category (including all its children), from the first day of the current month
  through today.
- In **Running costs / Vehicles**, each vehicle name links to Purchases for that vehicle, from the
  panel's `rolling12From` through today.

The category IDs come from the current category tree, not hard-coded names or IDs. These links are
real, accessible links named for the category or vehicle. Date windows are pinned intentionally so
the list shows the entries included in the panel, rather than Purchases' default last-30-days window.
The panels' figures and the records they count have not changed.

## Schema and data

No schema change or migration. No data conversion is required.

## Verification

- `npm test` — **586 passed** across 139 suites.
- `npm run typecheck` — passed.
- `npm run format:check` — passed.
- `npm run build` — passed; generated `next-env.d.ts` restored.
- Playwright via `docs/SANDBOX.md` entry 8 — **112 passed** across every project, including the Overview link/date-window assertions in `desktop`.
- CI and Publish verification run through the release pull request and tag workflow.

## What to do

In Unraid, **take a backup, then Force Update**. The version badge should read `v0.29.0 · pre-release`.

Release notes document: [`docs/RELEASE_NOTES_v0.29.0.md`](RELEASE_NOTES_v0.29.0.md).
