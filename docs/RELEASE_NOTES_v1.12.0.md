# Release notes — v1.12.0 — Hide cancelled schedules, and purchase links that land in view

**Stable release (`v1.12.0`)**, moving **`latest`** and GitHub's **Latest** release. It takes the two open issues the household filed as one small slice: **#28** (Recurring: hide cancelled schedules) and **#30** (All Transactions: the supplier link opens Purchases with the row hidden under the header). The app badge should read **`v1.12.0 · stable`**.

## What changed

### Recurring → Schedules: hide cancelled schedules (issue #28)

- A **Hide cancelled** link sits beside the Schedules heading. It appears only when at least one schedule is cancelled.
- While cancelled schedules are hidden, the link reads **Show cancelled** and a badge shows how many are hidden (for example "3 hidden"). Show it again to bring them back.
- Cancelled schedules are still **shown by default**, so every existing `#schedule-…` link keeps landing on its row.
- The choice is kept in the address (`?hideCancelled=1`), so it survives paging the calendar with Prev and Next, and the Today link keeps it too. Nothing is saved to the household's data.
- If every schedule is cancelled and hidden, the list says so and offers to show them.
- Hiding only affects the list. The month calendar and the schedule history are unchanged, and cancelling or restoring a schedule works as before.

### All Transactions → purchase links land in view (issue #30)

- Clicking a supplier name on All Transactions opens Purchases with that purchase as the first visible row. The row now lands just below the sticky header, on a phone and on a laptop, instead of under it.
- Nothing else on Purchases changes.

## Schema and existing data

- **No database migration, no backup-format change and no `.env` change.**
- Nothing is written by either change. Hiding cancelled schedules is a view choice in the address bar, and the purchase fix is a scroll margin.

## Who should update and what to do

- **Everyone on the multi-household installation:**
  1. Take a household backup in **Settings** and a registry backup in **Admin** (`/admin`), and keep a copy of `/mnt/user/appdata/simple-finance-multi-household/.env`.
  2. In Unraid, keep the container Repository on **`ghcr.io/dougalbob/simple-finance-multi-household:latest`** (or pin `:v1.12.0`) and run **Force Update**.
  3. Keep host port **`3009`** → container port **`3000`** and `/mnt/user/appdata/simple-finance-multi-household` → `/data`. Never point this container at `/mnt/user/appdata/simple-finance` or host port `3007`.
  4. Confirm the version badge reads **`v1.12.0 · stable`**. Then check:
     - **Recurring → Schedules**: once a schedule is cancelled, a **Hide cancelled** link appears. Using it hides the cancelled rows and shows a count; **Show cancelled** brings them back.
     - **All Transactions**: click a supplier name in a purchase row. The purchase should appear fully visible, not tucked under the top bar.

## Validation evidence

- `npm run typecheck` (`tsc --noEmit`): clean.
- `npm run format:check` (`prettier --check .`): clean.
- `npm test` (`node scripts/run-tests.mjs`, 5 sequential batches): **912 passed, 0 failed across 211 suites**. That includes the new `tests/schedule-visibility.test.ts` (the hide choice, cancelled counts, empty lists, input not mutated, and the links that keep the month and the choice).
- Browser: `e2e/recurring-hide-cancelled.spec.ts` is new (cancel a schedule, hide it, check the count, page the calendar, show it again). `e2e/transactions.spec.ts` now asserts the purchase row sits below the sticky header after the supplier link. Neither was run in the sandbox, which has no browser; CI's `browser` job is the browser evidence for this release.
- `npm run build` (`next build`): clean.
- `npm audit --omit=dev`: 0 production vulnerabilities.
- Mandatory CI checks (`gates`, `browser`, `docker`) and the tag-triggered `Publish` workflow (upgrade smoke and GHCR digest verification across `v1.12.0`, `latest` and `sha-<short>`) gate publication.

## Image tags

Stable release: published as `v1.12.0`, `latest` and `sha-<short>`, all to one verified digest. The GitHub release is marked **Latest**.
