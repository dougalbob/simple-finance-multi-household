# Release notes — v1.13.0 — Supplier schedule links, in-place Recurring search, and remembered cancelled schedule visibility

**Stable release (`v1.13.0`)**, moving **`latest`** and GitHub's **Latest** release. It delivers two open issues filed by the household: **#34** (Suppliers card: link to schedule or empty state, and in-place search filter on Recurring) and **#35** (Recurring: remember "Hidden" cancelled schedules setting across navigations). The app badge should read **`v1.13.0 · stable`**.

## What changed

### Suppliers → Supplier card: link to recurring schedule (issue #34)

- Directly beneath the **Address** field on each expanded supplier card, any connected recurring schedules are displayed as `Linked to schedule "<Schedule Name>"`, linking directly to `/recurring?q=<name>#schedule-<id>`.
- If more than one recurring schedule is linked to the supplier, each is listed on its own line with a deep link.
- If no scheduled payments relate to the supplier, the card explicitly states: `No scheduled payments relate to this supplier currently`.
- Clicking the link opens `/recurring` pre-filtered to the schedule and scrolls the matching schedule into view.

### Recurring → Schedules: in-place schedule filter search (issue #34)

- An instant search box with a **Clear filter** button sits in the Schedules section header beside the Hide/Show cancelled control.
- Typing in the filter box immediately filters the visible schedule cards by matching either the schedule's name or its associated supplier name.
- When filtered, any matching schedule is displayed even if it is cancelled and cancelled schedules are currently hidden.
- Clicking **Clear filter** resets the query and restores the default view and hide/show cancelled rules.

### Recurring → Schedules: remember hidden cancelled schedule preference across navigations (issue #35)

- The choice to hide or show cancelled schedules (introduced in `v1.12.0`) is now remembered across page navigations using a device cookie (`sf_hide_cancelled_schedules`, max-age 1 year, path `/`, SameSite `lax`), matching the app's established client preference pattern (`sf_theme`).
- Navigating away from Recurring (for example to Purchases, Suppliers, or Overview) and returning without query parameters maintains the user's hidden/shown preference.
- An explicit query parameter (`?hideCancelled=1` or `?hideCancelled=0`) in the URL continues to take precedence and updates the cookie.

## Schema and existing data

- **No database migration, no backup-format change and no `.env` change.**
- The preference is stored client-side via cookie, and schedule linking is derived from existing foreign key relationships between schedules and suppliers.

## Who should update and what to do

- **Everyone on the multi-household installation:**
  1. Take a household backup in **Settings** and a registry backup in **Admin** (`/admin`), and keep a copy of `/mnt/user/appdata/simple-finance-multi-household/.env`.
  2. In Unraid, keep the container Repository on **`ghcr.io/dougalbob/simple-finance-multi-household:latest`** (or pin `:v1.13.0`) and run **Force Update**.
  3. Keep host port **`3009`** → container port **`3000`** and `/mnt/user/appdata/simple-finance-multi-household` → `/data`. Never point this container at `/mnt/user/appdata/simple-finance` or host port `3007`.
  4. Confirm the version badge reads **`v1.13.0 · stable`**. Then check:
     - **Suppliers**: expand a supplier card to verify the `Schedule` section below Address displays linked schedules with links or the empty state notice.
     - **Recurring**: verify the search filter box quickly narrows schedules, that clicking a supplier link filters and jumps to the schedule, and that hiding cancelled schedules persists across navigation away from and back to Recurring.

## Validation evidence

- `npm run typecheck` (`tsc --noEmit`): clean.
- `npm run format:check` (`prettier --check .`): clean.
- `npm test` (`node scripts/run-tests.mjs`, 5 sequential batches): **912 passed, 0 failed across 211 suites**. Including unit test coverage for cookie resolution, schedule visibility, and query filtering in `tests/schedule-visibility.test.ts`.
- Browser (`e2e/recurring-hide-cancelled.spec.ts`): verified locally with Chromium (per `docs/SANDBOX.md` Entry 8) and passing (2/2):
  1. Hiding cancelled schedules persists across page navigations without query params, maintains month paging, and can be toggled back.
  2. Supplier card links to schedule, filters the recurring page, navigates to `#schedule-{id}`, and displays empty state when unlinked; clearing filter restores hidden state.
- `npm run build` (`next build`): clean.
- `npm audit --omit=dev`: 0 production vulnerabilities.
- Mandatory CI checks (`gates`, `browser`, `docker`) and the tag-triggered `Publish` workflow gate publication.

## Image tags

Stable release: published as `v1.13.0`, `latest` and `sha-<short>`, all to one verified digest. The GitHub release is marked **Latest**.
