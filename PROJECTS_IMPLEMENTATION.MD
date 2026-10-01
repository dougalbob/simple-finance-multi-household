# Projects — Project Costing &amp; Supplier Optimiser

> **What this is:** the working plan for the **Projects** feature — a project costing and budgeting
> workspace crossed with a multi-supplier costing/comparison utility for future purchases. One
> costing matrix serves DIY projects first (Phase 1) and holiday bundles / car comparisons later,
> without rewriting the schema.
>
> **Continuation point for this feature.** The app-level handoff is `docs/HANDOFF.md`; the product
> spec is `docs/SPEC.md` (Projects are specified in §27); the decision log is
> `docs/IMPLEMENTATION_PLAN.md` (decision 181 opens this feature). This file is the feature's own
> plan and **session-by-session status log**.

---

## 0. The rule: documentation is updated just before any PR, every session

**Both this file (`PROJECTS_IMPLEMENTATION.MD`) and the repository's existing documentation
(`docs/HANDOFF.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/SPEC.md`, plus release notes and the five
version places when the session ships a release) must be updated just before any PR is created in
every session.** The next Arena session must be able to read these docs and know exactly which
stage implementation has reached — what is done, what is deliberately deferred, and what the
open questions are. Never open a PR with stale docs; refresh them as the last step before
`gh pr create`.

---

## 1. Real-world use cases

1. **DIY / Home Improvement (primary — Phase 1, e.g. replacing a garden fence):**
   - Define a **Bill of Materials (line items)** with quantities (`10 × 8ft concrete posts`,
     `20 × 8ft arris rails`, `120 × 6ft featheredge boards`, `10 × gravel boards`).
   - Research and record quotes across multiple **Suppliers** (name, phone, website URL, notes,
     plus direct product URLs on individual quotes).
   - Record **Supplier Delivery Rules**: ordering 2+ items from one supplier incurs that supplier's
     delivery charge once (or qualifies for free delivery), so delivery can change which
     combination of suppliers is cheapest.
   - **Manual selection:** click cells in the matrix to choose which supplier to use per material,
     with a grouped **Materials &amp; Order Breakdown by Supplier**, delivery subtotal and grand total.
   - **Automatic optimiser ("Calculate Cheapest Combination", Phase 2):** cheapest split across
     suppliers including delivery rules, alongside a "Best Single-Supplier" comparison.

2. **Holiday Package Builder (Phase 3 extension):** build a trip from components (flights, hotel,
   car hire, parking) across providers; compare a mix-and-match build against an all-in package.

3. **New Car / Whole-Option Comparison (Phase 4 extension):** compare mutually exclusive
   candidates (Car A vs Car B vs Car C) where the choice affects every line — purchase price,
   insurance, tax, fuel, servicing — as Upfront vs Annual Running vs multi-year TCO.

---

## 2. Agreed architecture: one costing matrix, two ways of totalling

All three project types share one **Costing Matrix (rows × columns → quote cells)**:

- **Rows (`project_items`)** — what you need (materials / trip legs / cost categories).
- **Columns (`project_suppliers`)** — suppliers/merchants in `mix_and_match` mode, or candidate
  options in `compare_options` mode.
- **Cells (`project_quotes`)** — the quote for one row from one column.
- **Aggregation mode (`projects.project_mode`)**:
  - `'mix_and_match'` (Phase 1 default — DIY &amp; holidays): pick **one cell per row** across
    different suppliers; group chosen items by supplier; supplier subtotals + delivery fees.
  - `'compare_options'` (Phase 4 — car/TCO): sum **each column vertically**, separating one-off
    upfront costs from monthly/annual recurring costs, to compare whole candidates.

Phase 1 builds and ships `mix_and_match` end-to-end. `compare_options` is **schema-ready from day
one** (the `project_mode` and `cost_frequency` fields exist and are validated) but its UI and
vertical totals arrive in Phase 4. Creating a `compare_options` project is possible but shows an
honest "arrives in a later phase" note in Phase 1.

---

## 3. Schema (adapted to this repository's conventions)

Conventions applied (see `docs/IMPLEMENTATION_PLAN.md` "Architecture summary" and
`AGENT_APP_BLUEPRINT.md` §3): **money is integer pence** (`*_pence` columns); instants are
millisecond timestamps; text enums on `text(..., { enum: [...] })`; every mutable row carries
`version` for optimistic concurrency and every write goes through a domain module that records an
**audit entry in the same transaction**. Migration `0016_projects` is drizzle-kit generated from
`src/lib/db/schema.ts` (checked-in SQL + journal; shipped migrations are never edited).

### A. `projects`

| Column | Type | Notes |
|---|---|---|
| `id` | integer PK | autoincrement |
| `name` | text | e.g. *"Back Garden Fence Replacement"* (1–120 chars) |
| `project_mode` | text enum | `'mix_and_match'` (default) \| `'compare_options'` |
| `target_budget_pence` | integer nullable | under/over budget status in the footer |
| `status` | text enum | `'researching'` \| `'ready_to_order'` \| `'completed'` |
| `notes` | text nullable | free text (≤ 2000 chars) |
| `created_at` / `updated_at` | integer (timestamp_ms) | |
| `version` | integer | optimistic concurrency |

### B. `project_items` (rows — bill of materials / cost lines)

| Column | Type | Notes |
|---|---|---|
| `id` | integer PK | |
| `project_id` | FK → `projects` | ON DELETE CASCADE |
| `sort_order` | integer | display order; create appends at max+1 |
| `name` | text | e.g. *"8ft Concrete Slotted Post"* (1–120 chars) |
| `quantity` | integer | **whole units** needed (boards, posts, packs, days, years) — ≥ 1 |
| `unit` | text | `'each'`, `'pack'`, `'m'`, `'days'`, `'year'` or similar (1–20 chars) |
| `selected_supplier_id` | FK → `project_suppliers` nullable | the user's manual pick for this row |
| `cost_frequency` | text enum | `'one_off'` (default) \| `'annual'` \| `'monthly'` — dormant in Phase 1, unlocks TCO in Phase 4 |
| `category` | text nullable | optional grouping (e.g. *Timber*, *Fixings*) |
| `notes` | text nullable | |
| `created_at` / `updated_at` / `version` | | |

### C. `project_suppliers` (columns — merchants / providers / candidates)

| Column | Type | Notes |
|---|---|---|
| `id` | integer PK | |
| `project_id` | FK → `projects` | ON DELETE CASCADE |
| `sort_order` | integer | |
| `name` | text | e.g. *"Local Timber Yard"*, *"Wickes"*, *"Jewson"* (1–120 chars) |
| `phone` | text nullable | |
| `website_url` | text nullable | |
| `notes` | text nullable | |
| `delivery_fee_pence` | integer | flat charge incurred **once** if ≥ 1 item is ordered from this supplier (default 0) |
| `free_delivery_threshold_pence` | integer nullable | materials subtotal at this supplier ≥ threshold → delivery becomes £0 |
| `click_and_collect_available` | integer boolean | default false |
| `fulfilment_choice` | text enum | `'delivery'` (default) \| `'collect'` — `'collect'` forces delivery £0 for this supplier |
| `created_at` / `updated_at` / `version` | | |

### D. `project_quotes` (cells — price per item per supplier)

| Column | Type | Notes |
|---|---|---|
| `id` | integer PK | |
| `project_id` | FK → `projects` | ON DELETE CASCADE |
| `item_id` | FK → `project_items` | ON DELETE CASCADE |
| `supplier_id` | FK → `project_suppliers` | ON DELETE CASCADE |
| | | **UNIQUE (`item_id`, `supplier_id`)** |
| `unit_price_pence` | integer nullable | price per unit, **inc. VAT**; null when pack-only |
| `pack_size` | integer nullable | when the supplier only sells packs of N |
| `pack_price_pence` | integer nullable | price per pack, inc. VAT |
| `product_url` | text nullable | direct link to the supplier's product page |
| `in_stock` | integer boolean | default true |
| `notes` | text nullable | |
| `created_at` / `updated_at` / `version` | | |

**Quote pricing rule:** a quote must carry either `unit_price_pence`, or both `pack_size` and
`pack_price_pence` (a pack-only quote). When pack pricing is present it wins:
`required_packs = ceil(item.quantity / pack_size)`, `line_cost = required_packs × pack_price_pence`.

**Naming note:** `project_suppliers` are *per-project merchant columns*, deliberately separate from
the household contact book's `suppliers` (SPEC §21). A project supplier may later be linked to a
contact-book supplier; Phase 1 keeps them independent.

---

## 4. DIY nuances supported in Phase 1

1. **Inc. VAT vs ex. VAT entry helper:** merchants quote ex. VAT, retail stores inc. VAT. The
   quote form has a **“+20% VAT”** helper button beside the price input that multiplies the typed
   price by 1.2 (exact integer-pence, half-up) — a typing aid only; the stored price is always
   inc. VAT.
2. **Pack sizes vs individual units:** optional `pack_size` + `pack_price` on a quote; the cell and
   the breakdown show the effective line cost (`12 packs of 10 @ £29.50 = £354.00`).
3. **Sparse matrix (“not stocked” cells):** a cell without a quote stays empty; only a supplier
   with a quote for an item can be selected for that item. Out-of-stock quotes
   (`in_stock = false`) can still be selected but are flagged “out of stock” wherever they appear.
4. **Delivery rules:** delivery fee charged **once** per used supplier (2+ items from one supplier
   still pay one fee); `free_delivery_threshold_pence` met → £0 with a “Free delivery over £X”
   confirmation; otherwise a **“£X away from free delivery”** hint; `fulfilment_choice = 'collect'`
   → £0 with a Click &amp; Collect label. Suppliers with no selected items are not charged.

---

## 5. Screen layout &amp; workflow (Phase 1, as built)

1. **`/projects`** — project list + “Start a project” create form (name, mode, target budget,
   status, notes). Each card shows status, matrix size, current grand total vs target budget.
2. **`/projects/[id]`** — the workspace:
   1. **Suppliers &amp; Delivery bar (top):** supplier cards with phone, website, delivery fee,
      “Free delivery over £X”, Click &amp; Collect availability and the delivery/collect choice.
      Add/edit/delete supplier forms.
   2. **The Costing Matrix (middle):** rows = items (name, quantity, unit), columns = suppliers.
      Cells show unit/pack price, the calculated line cost for the required quantity and a
      product-link icon. **Clicking a cell with a quote selects that supplier for the row**
      (highlighted). Empty cells offer “Add quote” (inline form with the +20% VAT helper,
      pack fields, product URL, in-stock, notes). Rows show an “none” cell to clear a selection.
   3. **Shopping List &amp; Order Breakdown by Supplier (bottom):** grouped by chosen supplier —
      supplier name/phone/website, each selected line (qty, product link, line cost), **Materials
      Subtotal**, **Delivery Cost** (with free-delivery/collect/shortfall explanation) and
      **Supplier Total**.
   4. **Project Grand Total footer:** Total Materials + Total Delivery = **Grand Total**, compared
      against `target_budget` (under/over/on budget) when set.

---

## 6. Calculation rules (pure module — `src/lib/projects/costing.ts`)

Framework-free, dependency-free, integer-pence, fully unit-tested. This is the single source of
truth for line costs, delivery evaluation and totals — the UI, server validation and (in Phase 2)
the optimiser all call it.

- `requiredPacks(quantity, packSize)` — integer ceil division.
- `lineCostPence(quote, quantity)` — pack pricing wins; else `quantity × unit_price_pence`;
  `null` when the quote carries no usable price.
- `deliveryCost(materialsSubtotalPence, rule)` —
  `'collect'` → £0; threshold met → £0 (`'free-threshold'`); fee 0 → £0 (`'free'`); else the flat
  fee (`'charged'`), plus `shortfallToFreeDeliveryPence` when a threshold exists below the subtotal.
- `orderBreakdown(...)` — groups selected lines by supplier (one group per **used** supplier),
  per-supplier materials subtotal, delivery result and supplier total.
- `projectTotals(...)` — materials total + delivery total = grand total; budget comparison
  (`'under' | 'on' | 'over' | 'none'`) and the delta in pence.

Phase 2 adds `cheapestCombination(...)` here: the exact subset solver (2^S − 1 supplier subsets),
cheapest stocked supplier per item within each subset with delivery/threshold rules applied, plus
the best single supplier that stocks everything.

---

## 7. Phased implementation plan (across Arena sessions)

### Phase 1 — Core DIY matrix, delivery rules &amp; manual costing ✅ (session 1, v0.31.0)

- [x] Schema + migration `0016_projects` for `projects`, `project_items`, `project_suppliers`,
      `project_quotes` (with `project_mode` and `cost_frequency` already extensible).
- [x] Pure calculation module (line costs incl. pack rounding; grouped supplier order totals;
      flat delivery once per used supplier; free-delivery threshold; click &amp; collect override;
      “£X away from free delivery” hints; grand total vs target budget).
- [x] UI: create/manage projects; add/edit/delete material rows; add/edit/delete suppliers with
      delivery rules; enter/edit cell quotes (+20% VAT helper, pack fields, product URLs);
      click cells to select suppliers; grouped Supplier Shopping List &amp; Grand Total.
- [x] Seed/demo data — the fictional **“Back Garden Fence Replacement”** project
      (`src/lib/projects/demo.ts`, shared by the e2e seed and the demo seeder script).
- [x] Unit/integration tests (`tests/projects-costing.test.ts`, `tests/projects.test.ts`).

### Phase 2 — The “Cheapest Combination” optimiser engine ✅ (session 2, v0.32.0)

- [x] Solver `cheapestCombination(...)` in `costing.ts`: stage 1 enumerates every supplier subset
      (2^S − 1, cheapest stocked supplier per item, delivery/threshold/collect rules applied);
      stage 2 is an exact branch-and-bound over all item→supplier assignments seeded with stage 1,
      so the “pay slightly more at B to cross B's free-delivery threshold” case is solved
      exactly, not just approximated (a pure per-subset pass misses it when A is still needed for
      an item only A stocks). Budgeted (`exact: false` + caveat if exhausted); deterministic ties
      (fewer suppliers, then earlier column).
- [x] Also returned: the best single supplier that stocks everything (plus ranked alternatives),
      the naive cheapest-price-per-row baseline (to explain the delivery saving), uncoverable
      items and the count of out-of-stock quotes skipped (OQ-P3 as proposed).
- [x] UI action bar above the matrix: **Your manual selection** vs **⚡ Auto-pick cheapest split**
      vs **🚚 Best single-supplier option**, each with total, suppliers, per-supplier delivery
      verdict and comparison sentences; one-click **Apply**.
- [x] `applyProjectSelections` (one transaction, per-row version bump, one `project.apply-plan`
      audit entry, no-op re-apply) + `applyProjectPlanAction` (server recomputes the plan and
      refuses if the browser's expected total no longer matches).
- [x] Tests: `tests/projects-optimiser.test.ts` (split vs single, threshold cross-over, unstocked
      and out-of-stock items, Click & Collect, pack pricing, ties, determinism, node budget,
      exhaustive cross-check on 150 random matrices, figure-exact fence results, apply flow) and
      `e2e/projects.spec.ts`.
- [x] Released as v0.32.0: five version places bumped, release notes
      `docs/RELEASE_NOTES_v0.32.0.md`, full gates, PR and publish via `docs/RELEASE_PROCESS.md`.

### Phase 3 — Holiday / bundle refinements

- Optional item categories/dates; compare a mix-and-match build against a single all-in package
  quote (a `compare_options`-style column pinned as the package reference).

### Phase 4 — Candidate comparison mode (car / TCO)

- UI + calculation for `project_mode = 'compare_options'`: columns are mutually exclusive
  candidates; rows use `cost_frequency` (`one_off` / `monthly` / `annual`); display Upfront Cost,
  Annual Running Cost and 3-/5-Year TCO side-by-side.

---

## 8. Open questions (for the household)

- **OQ-P1:** should a project supplier be linkable to a contact-book `suppliers` card (phone/website
  reused)? Phase 1 keeps them independent — low cost to add later, no schema rewrite.
- **OQ-P2:** deleting a project/row/supplier is allowed in Phase 1 (it is a draft plan, not money
  history) and is audited, with cascading quote removal. A stricter “archive instead of delete”
  policy is easy to switch on if the household prefers it.
- **OQ-P3:** when an out-of-stock quote is the cheapest, Phase 2’s optimiser skips it (you
  cannot order it) — implemented that way in session 2; an item with *only* out-of-stock quotes is
  reported as uncoverable. Still awaiting the household's confirmation (the code has an
  `includeOutOfStock` switch if they would rather see it priced).
- **OQ-P4 (new):** the optimiser keeps each supplier's current delivery / Click & Collect choice.
  Should it also *suggest* flipping a supplier to Click & Collect when that would be cheapest?
  Left out of Phase 2 so the plan never contradicts what the household set.

---

## 9. Session status log

| Session | Date (Europe/London) | Branch / PR | Stage reached |
|---|---|---|---|
| 1 | 2026-10-01 | `arena/01a0f778-simple-finance` | **Phase 1 complete.** Repo inspected; this plan written; migration `0016_projects`; `src/lib/projects/{costing,projects,projects-view,demo}.ts`; Zod boundaries; server actions; `/projects` + `/projects/[id]` workspace (suppliers bar, clickable costing matrix with +20% VAT quote forms, supplier-grouped shopping list, grand total vs budget); “Back Garden Fence Replacement” demo project seeded in the e2e/preview seeds; tests for the pure costing module and the domain/integration flows; nav + e2e nav lists updated; docs refreshed (SPEC §27, decision 181, HANDOFF, release notes v0.31.0). Two incidental fixes on the way: the lockfile moved `next` 16.3.5 → 16.3.8 (critical `next/og` advisory), and the personal-spending chart's table twin stopped linking £0.00 cells the drawing skips (first-of-month edge). Phase 2 optimiser not started. |
| 2 | 2026-10-01 | `arena/01a0f975-simple-finance` | **Phase 2 complete, released as v0.32.0.** Read the repo docs; built the two-stage exact optimiser in `costing.ts`, `applyProjectSelections` in `projects.ts`, optimiser view + `computeProjectOptimiser` in `projects-view.ts`, `applyProjectPlanAction` + `projectApplyPlanEntrySchema`, the `ProjectOptimiserBar` component and its placement on `/projects/[id]`; 19 new unit/integration tests (637 total pass) and a Playwright spec that passed locally (SANDBOX entry 8). Fence demo: split £1,061.50 vs manual £1,083.50 vs single supplier (Wickes) £1,152.00. Docs refreshed (SPEC §27.6–27.7, decision 182, HANDOFF, this file). Phase 3 not started. |
