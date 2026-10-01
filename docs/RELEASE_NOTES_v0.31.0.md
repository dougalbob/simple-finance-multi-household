# Release notes — v0.31.0 — Projects: cost the plan before you spend

## What changed

A new **Projects** workspace (`/projects`): the cross between a project budget and a
multi-supplier costing tool the household asked for — plan a future purchase against real quotes
before any money moves. Nothing here records a purchase or touches the money pipelines.

- **The costing matrix:** a bill of materials down the side (quantity + unit per row), the
  project's suppliers across the top, and the quote for each pair in the cells (unit price inc.
  VAT, or pack-only pricing — “pack of 10 @ £29.50” buys whole packs). A cell without a quote
  stays honestly empty (“Not stocked”); out-of-stock quotes are flagged wherever they appear.
- **Click a cell, pick that supplier** for that material. A “No supplier” column clears a pick;
  only a supplier with a quote can be selected for an item.
- **Delivery rules that match the real world:** one flat fee per used supplier (two lines from one
  supplier pay one fee), a free-delivery threshold on that supplier's materials subtotal (“Free
  delivery (over £300)” or “£122.00 away from free delivery”), and Click & Collect orders at £0.
- **The Shopping List & Order Breakdown by Supplier:** every chosen line grouped by where it comes
  from — phone, website, product links, line costs, materials subtotal, the delivery verdict and
  the supplier total — then **Materials + Delivery = Grand Total**, compared against the project's
  target budget in words.
- **A +20% VAT typing helper** on quote prices (merchants quote ex. VAT; retail quotes inc. VAT).
  The button does exact integer maths; the stored price is always inc. VAT.
- A fictional **“Back Garden Fence Replacement”** demo project (10 posts, 20 arris rails, 120
  featheredge boards, gravel boards, post mix across three suppliers) ships with the e2e/preview
  seeds and is asserted figure-exactly in the tests.
- A small Charts honesty fix found on the way: the personal-spending table twin no longer offers a
  drill-down link for a £0.00 cell the chart does not draw (an empty month, e.g. on the 1st). The
  table now says exactly what the drawing says, in words and in links.
- The data model is ready for what comes next without a rewrite: holiday bundles (Phase 3) and
  whole-option comparisons like car/TCO (Phase 4, `project_mode = 'compare_options'`) share the
  same rows × columns × quotes shape. The cheapest-combination **optimiser** is Phase 2.

## Schema and data

New migration `0016_projects` adds `projects`, `project_items`, `project_suppliers` and
`project_quotes` (integer pence, version counters, audited writes). Existing tables are untouched;
no data conversion, backup-format change or new dependency is required. The migration applies on
startup as usual.

Dependency note: `npm audit` raised a new critical advisory against `next` (GHSA-vcvr-r3jv-pc5j,
RCE in `next/og`) after v0.30.0; `npm audit fix` moved the lockfile **16.3.5 → 16.3.8** within the
existing `^16.3.5` range. The full test suite and build were re-run green on the patch.

## Verification

- `npm test` — **618 passed** across 147 suites (32 new: the pure costing module and the
  projects domain, including the figure-exact fence scenario — £1,073.50 materials + £10.00
  delivery = £1,083.50 grand, £116.50 under the £1,200 target).
- `npm run typecheck` — passed.
- `npm run format:check` — passed.
- `npm run themes:check` — passed; generated theme files remain current.
- `npm run build` — passed; generated `next-env.d.ts` restored after the build.
- `npm audit --omit=dev` — zero production vulnerabilities (after the `next` patch above).
- Playwright via `docs/SANDBOX.md` entry 8 — **113 passed** across every project (verified locally,
  ~7 minutes), including the updated navigation assertions (Projects in the desktop bar and the
  phone drawer) and the charts bar/table twin on a month boundary.
- Pull-request CI and the release-image upgrade verification remain to run through GitHub before
  merge and publish.

## What to do

In Unraid, **take a backup, then Force Update**. The version badge should read
`v0.31.0 · pre-release`.

Release notes document: [`docs/RELEASE_NOTES_v0.31.0.md`](RELEASE_NOTES_v0.31.0.md).
