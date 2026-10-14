# Release notes — v1.9.0 — Granular Spending Mix category selector & Contracts & Renewals stable release

**Stable release (`v1.9.0`)**, moving **`latest`** and GitHub's **Latest** release. It signs off and promotes the field-tested **`v1.8.0-rc.1`** Contracts & Renewals agreement register to stable production, adds the expandable parent/child category tree selector on **Chart E (Spending mix — Where the money goes)**, and updates `npm test` to run in memory-bounded batches. The app badge should read **`v1.9.0 · stable`**.

## What changed

- **Granular child-category tree selector on Chart E (`E · Spending mix — Where the money goes`, decision 207).**
  - The category selector card (`#mix-controls`) starts collapsed showing only parent categories as before, now with a compact drop-down arrow button beside each parent.
  - Expanding a parent reveals its child categories slightly indented in a tree view (`src/components/charts/mix-category-tree.tsx`), allowing users to include or ignore individual child categories.
  - Ticking or unticking a parent checkbox cascades to all of its child categories; when only a subset of children under a parent are ticked, the parent checkbox displays its partial (`indeterminate`) state alongside a `(ticked/total)` indicator.
  - Pie slices remain grouped by parent category (with `Personal` split per person and household), summing only the ticked child categories. Window preset links, slice drill-down links, and the `"Open these purchases →"` link preserve the active child-category selection.
- **Contracts & Renewals agreement register promoted to stable (from accepted `v1.8.0-rc.1`).**
  - Policies and contracts on `/contracts` are explicitly classified as insurance, service, or other renewals, with separate renewal and fee-free switch dates, independent provider auto-renew (`Yes`, `No`, `Unknown`) and in-app reminder settings, optional linked recurring payment schedules, and agreement-aware key-date alerts on Overview, Tasks, and the bell.
- **Batched unit test runner (`scripts/run-tests.mjs`).**
  - `npm test` now runs the unit test suite in sequential batches of 20 files per child process with `--test-concurrency=2` so memory is reclaimed between batches, avoiding out-of-memory warnings in the Arena sandbox as the test suite grows.

## Schema and existing data

- **No new database migration in `v1.9.0`** beyond `0017_tracked_agreements` and `0018_legacy_schedule_source` already shipped in `v1.8.0-rc.1`.
- Households upgrading directly from `v1.7.0` (or earlier `v1.x` releases) receive additive migrations `0017_tracked_agreements` and `0018_legacy_schedule_source` automatically on startup; households already running `v1.8.0-rc.1` require no further schema migration.
- No backup-format or `.env` change.

## Who should update and what to do

- **Everyone on the multi-household installation:**
  1. Take a household backup in **Settings** and a registry backup in **Admin** (`/admin`), and keep a copy of `/mnt/user/appdata/simple-finance-multi-household/.env`.
  2. In Unraid, ensure the container Repository is set to **`ghcr.io/dougalbob/simple-finance-multi-household:latest`** (or pin `:v1.9.0` if preferred) and run **Force Update** (if you pinned `:v1.8.0-rc.1` during candidate testing, switch Repository back to `:latest`).
  3. Keep host port **`3009`** → container port **`3000`** and `/mnt/user/appdata/simple-finance-multi-household` → `/data`. Never point this container at `/mnt/user/appdata/simple-finance` or host port `3007`.
  4. Confirm the version badge reads **`v1.9.0 · stable`** and check **Charts → E · Spending mix** to verify the expandable child-category tree selector.

## Validation evidence

- `npm run typecheck` (`tsc --noEmit`) — clean.
- `npm run format:check` (`prettier --check .`) — clean.
- `npm run themes:check` — clean.
- `npm test` (`node scripts/run-tests.mjs`, 5 sequential batches) — **885 passed, 0 failed across 204 suites**, including new unit coverage for child-category filtering in `tests/spending-mix.test.ts` and `tests/spending-mix-view.test.ts`.
- `npm run build` (`next build`) — clean.
- `npm audit --omit=dev` — 0 production vulnerabilities.
- Mandatory CI checks (`gates`, `browser`, `docker`) and the tag-triggered `Publish` workflow (including upgrade smoke and GHCR digest verification across `v1.9.0`, `latest`, and `sha-<short>`) gate publication.
