# Release notes — v1.22.0 — Chart E in-card scopes and Borrowing inline recording with repayment guards

**Stable release (`v1.22.0`)**, moving **`latest`** and GitHub's **Latest** release. Chart E
(**Where the money went**) folds its selector inside the chart card as a top-right **Change chart
scopes** disclosure and hides its long caption behind an **`i`** button (GitHub issue #61). On
**Borrowing**, each person's card opens a compact inline recording form right beneath its summary
line, the redundant bottom **Record money in or out** card is retired, **Setup new Borrowing or
lending** moves below the ledger as a collapsed new-person disclosure, and repayment/outflow sanity
checks block debt overpayments and insufficient cash pots while warning when a bank account goes
below zero (GitHub issue #63). The version badge should read **`v1.22.0 · stable`**.

## What changed

### Chart E — "Where the money went" in-card scopes & compact caption (issue #61)

- **In-card scopes disclosure** — the selector panel (`#mix-controls`) is no longer a separate
  side-by-side sibling card next to Chart E. It now lives inside the Chart E (`#mix`) card,
  collapsed by default, and toggles open from a top-right **Change chart scopes** button in the
  card's header.
- **Trimmed selector copy** — the boilerplate headings and paragraphs inside the selector
  (*"Selector"*, *"Choose what to count"*, *"By default this is since last payday…"*, and *"Time
  window"*) are removed so the window pills, date pickers and category tree open cleanly in place.
- **Explicit "Show" submission & persistent panel** — clicking a quick-window pill (**Since last
  payday**, **Last full payday cycle**, **Month to date**) updates the `From` and `To` date inputs
  in place without auto-submitting, so any category-tree changes made alongside the window selection
  are preserved until **Show** is pressed. Pressing **Show** updates the chart and keeps the scopes
  panel open until the user closes it or navigates away.
- **Two-column layout & `i` caption** — Chart D and Chart E sit side by side in the two-column
  grid while keeping the pie SVG large, and Chart E's long `Reported: Net spending by parent
  category…` caption is tucked behind a compact **`i`** summary button until clicked.

### Borrowing — inline recording, collapsed new-person setup & repayment guards (issue #63)

- **Inline recording on each person's card** — clicking **Record borrowing** or **Record a
  repayment** (or **Record a loan out** / **Record what they repaid**) on a person's summary card at
  the top of `/borrowing` opens a compact inline form directly inside that card with only the four
  fields needed (`Which pot did it touch?`, `Amount (£)`, `When`, and `Note`), and auto-collapses
  2 seconds after saving. Clicking **Record this month's £X** on an expected row in the ledger opens
  that person's inline form at `#debt-{id}` pre-filled with the expected amount.
- **Bottom "Record money in or out" card removed** — recording now happens directly on each person's
  card, so the standalone bottom card is gone.
- **Collapsed "Setup new Borrowing or lending" below the ledger** — moved below the ledger panel,
  titled **Setup new Borrowing or lending**, collapsed by default with a down-arrow disclosure icon,
  dedicated to new people only (existing people record through their summary card), and
  auto-collapsing 2 seconds after saving.
- **Repayment and outflow sanity checks** —
  - **Overpayment block:** repayments (`we_owe` + `out`, or `they_owe` + `in`) are checked against
    the arrangement's current outstanding balance (`balancePence`). Entering more than is owed (or
    any repayment on a settled £0 arrangement) shows a red alert explaining the excess and disables
    **Record it** (enforced both live in the form and in `addExternalMovementAction`).
  - **Cash pot shortfall block:** if an outflow selects a **cash pot** whose estimated balance is
    less than the payment, the form explains the shortfall, disables submission, and
    `startBorrowingAction` / `addExternalMovementAction` refuse it server-side.
  - **Bank account below-zero warning:** if an outflow selects a **bank account** and will take its
    estimated balance below zero, an amber warning shows the projected negative balance while still
    allowing the household to record it.

## Existing data and migrations

- **No schema migration, backup-format change or `.env` change.** Nothing already recorded is
  rewritten, and all existing `/borrowing` and `/charts` deep links continue to work.

## Who should update and what to do

1. Take a household backup in **Settings**, a registry backup in **Admin** (`/admin`), and a copy of
   `/mnt/user/appdata/simple-finance-multi-household/.env`.
2. In Unraid, set the container Repository to
   **`ghcr.io/dougalbob/simple-finance-multi-household:latest`**, or pin
   `ghcr.io/dougalbob/simple-finance-multi-household:v1.22.0`, then run **Force Update**.
3. Keep bridge networking, host port **3009** → container port **3000**, the existing Cloudflare
   route, and `/mnt/user/appdata/simple-finance-multi-household` → `/data` unchanged. Never point
   this container at `/mnt/user/appdata/simple-finance` or the original app's port 3007.
4. Confirm the badge reads **`v1.22.0 · stable`**.

## Validation evidence

- The household reviewed and approved both changes in the Arena preview before release, including
  the cash-pot block, bank-account below-zero warning, and debt overpayment block on `/borrowing`.
- Local gates: `prettier --check .`, `tsc --noEmit` and `themes:check` are clean. `npm test` passes
  **999/999 across 231 suites** (including unit coverage for the repayment/outflow sanity checks in
  `tests/borrowing-ledger.test.ts`), and `next build` is clean with `npm audit --omit=dev`
  reporting **0 vulnerabilities**.
- Browser (Playwright): `charts` (**11/11**), `borrowing` (**5/5**), `debt-lifecycle` (**6/6**),
  `external` (**3/3**) and `transactions` (**2/2** expectation journeys) pass locally via SANDBOX
  entry 8.
- The required `gates`, `browser` and `docker` checks, main CI and the tagged Publish workflow
  (upgrade smoke against `v1.21.0` and `v1.20.0`, and one-digest verification of `v1.22.0`,
  `latest` and `sha-<short>`) gate publication.
