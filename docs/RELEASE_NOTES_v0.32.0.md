# Release notes — v0.32.0 — Projects: the cheapest combination

## What changed

**Projects Phase 2.** A project's workspace now works out the cheapest way to buy everything, and
can fill in the matrix for you. Nothing here records a purchase or touches the money pipelines.

- **A new bar above the costing matrix** puts three plans side by side, each with its grand total
  (materials + delivery), who the order goes to and a plain-words comparison:
  - **Your manual selection** — whatever is picked in the matrix now.
  - **⚡ Auto-pick cheapest split** — the cheapest way to buy every orderable item across suppliers,
    with each supplier's delivery fee and free-delivery threshold counted. It will pay a little more
    on a line to lift a supplier over its free-delivery threshold, or leave a supplier out
    altogether, when that is cheaper overall. It says how much it saves against your selection
    (only when your selection covers every item) and against simply buying each item at its lowest
    price.
  - **🚚 Best single-supplier option** — the cheapest supplier that has every item in stock, with
    the convenience trade-off in words (“£90.50 more than the cheapest split, but one order from one
    supplier instead of 2 suppliers”) and the next-best single suppliers.
- **One click to apply a plan.** The matrix selections are filled in, the shopping list and grand
  total follow, and every cell can still be changed by hand afterwards. The server recomputes the
  plan before applying and refuses, saying so, if prices changed since the plan was shown.
  Applying a plan the matrix already holds changes nothing.
- **Honest about what it skips.** Out-of-stock quotes are never chosen (you cannot order them); an
  item with no in-stock quote anywhere is named and left out of both plans without blocking the
  rest; a supplier set to Click & Collect keeps its £0 delivery. On the fictional fence demo the
  cheapest split is **£1,061.50** (against £1,083.50 by hand) and the best single supplier is
  Wickes at **£1,152.00**.
- **Provably cheapest.** The solver tries every combination of suppliers, then searches every
  item-to-supplier assignment, so the “pay slightly more at one supplier to cross its free-delivery
  threshold” case is solved exactly. On a freak-large project it stops at a fixed search budget and
  the bar says the answer is the best found rather than proven.

## Schema and data

None. No migration, no data conversion, no backup-format change and no new dependency. Existing
projects, quotes and selections are untouched until you press Apply, which writes the chosen
suppliers to the project's rows (one audit entry on the project, a version bump per changed row).

## Open questions for the household

- Out-of-stock quotes are skipped by the optimiser (OQ-P3). Say if you would rather see them priced.
- Should the optimiser also *suggest* switching a supplier to Click & Collect when that would be
  cheapest (OQ-P4)? It keeps your current delivery/collect choice for now.

## Verification

- `npm test` — see the release PR's CI for the final run; locally **637 passed** (19 new in
  `tests/projects-optimiser.test.ts`: split vs single supplier, threshold cross-over, unstocked and
  out-of-stock items, Click & Collect, pack pricing, ties, determinism, the node budget, an
  exhaustive-search cross-check on 150 random matrices, the figure-exact fence results and the apply
  flow).
- `npm run typecheck`, `npm run format:check`, `npm run themes:check`, `npm run build` and
  `npm audit --omit=dev` — passed.
- Playwright via `docs/SANDBOX.md` entry 8 — **114 passed** across every project (~6 minutes
  locally), including the new `e2e/projects.spec.ts` (compare the plans, Apply the single supplier
  then the cheapest split, still applied after a reload).
- Pull-request CI and the release-image upgrade verification run through GitHub before merge and
  publish.

## What to do

In Unraid, **take a backup, then Force Update**. The version badge should read
`v0.32.0 · pre-release`.

Release notes document: [`docs/RELEASE_NOTES_v0.32.0.md`](RELEASE_NOTES_v0.32.0.md).
