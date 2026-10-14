# Release notes — v1.13.1 — Anchored links land below the sticky header

**Stable patch release (`v1.13.1`)**, moving **`latest`** and GitHub's **Latest** release. It fixes the coordinates bug that re-opened **issue #34** after `v1.13.0`: following a Supplier card's `Linked to schedule "…"` link opened the Recurring page with the schedule row tucked behind the sticky menu, so the household had to scroll to find it. The app badge should read **`v1.13.1 · stable`**.

## What changed

### The linked schedule lands below the menu (re-opened issue #34)

- Every anchored link — the Supplier card's `Linked to schedule "…"` link first of all — now lands its target **below** the sticky site header, with a small gap, at any window width.
- The root cause was a fixed landing offset that no fixed number could get right: the menu is **57px** tall on a phone, **85px** on a wide laptop, and **121px between 1024px and 1199px**, where the desktop nav wraps onto a second row. The row carried a 24px margin, and even the app's usual 96px margin is short of a 121px bar.
- The header now measures itself and publishes that height plus a 12px gap; every hash target in the app spends it as its scroll offset, so the browser's own fragment scroll already lands correctly — before any of the app's JavaScript runs. That covers the schedule rows, the Purchases rows (issue #30), Insights panels, Contracts renewal dates, Settings cards, supplier cards, task rows, Projects, the guide and the till — replacing 14 hand-picked offsets. Until the header has measured itself, a laptop-width cold load uses the tallest height the bar has ever had, so even the very first paint of a link lands clear of the menu.
- The gentle half of the old behaviour is unchanged: a target that is already clearly on screen is left exactly where the household put it, and the laptop schedule list still scrolls inside its own panel rather than moving the page.

### The Recurring filter box no longer loses what you type (found while proving the fix)

- The schedule filter is a client-side control. If a keystroke arrived before the page had finished starting up, the hydration render wiped it and the box silently did nothing. The filter now says whether it is listening (the same rule the Quick Entry till, the Purchases filters, the theme gallery and the category editor already follow) and stays inert until it is.
- This was a pre-existing flaw, not something `v1.13.0` introduced: the browser test reproduces it with this release's code set aside.

## Schema and existing data

- **No database migration, no backup-format change, no `.env` change, and no stored preference change.** The fix is layout and scroll behaviour only; every figure and record is untouched.

## Who should update and what to do

- **Everyone on the multi-household installation**, and especially anyone who used the Supplier → schedule link:
  1. Take a household backup in **Settings** and a registry backup in **Admin** (`/admin`), and keep a copy of `/mnt/user/appdata/simple-finance-multi-household/.env`.
  2. In Unraid, keep the container Repository on **`ghcr.io/dougalbob/simple-finance-multi-household:latest`** (or pin `:v1.13.1`) and run **Force Update**.
  3. Keep host port **`3009`** → container port **`3000`** and `/mnt/user/appdata/simple-finance-multi-household` → `/data`. Never point this container at `/mnt/user/appdata/simple-finance` or host port `3007`.
  4. Confirm the version badge reads **`v1.13.1 · stable`**. Then check:
     - **Suppliers → Recurring**: expand a supplier, follow `Linked to schedule "…"`, and confirm the schedule card appears **below** the menu, with its `Edit schedule` control on screen. Try it on a laptop window narrowed to roughly 1100px wide, where the menu is at its tallest.
     - **Recurring filter**: type into the filter box and confirm the list narrows as you type, including any matching cancelled schedule while cancelled schedules are hidden.

## Validation evidence

- `npm run typecheck` (`tsc --noEmit`): clean.
- `npm run format:check` (`prettier --check .`): clean.
- `npm run themes:check`: clean.
- `npm test` (`node scripts/run-tests.mjs`): includes the new `tests/anchor-scroll.test.ts` — the landing rules themselves, the stylesheet/script agreement on the offset, and a scan that fails if any hash target goes back to a baked-in `scroll-mt-*` constant.
- Browser (`e2e/recurring-hide-cancelled.spec.ts`, extended): the supplier link's target row is asserted to sit below the header at 1400×950 (85px menu) **and** after a cold load at 1100×950 (121px wrapped menu — the case no constant fixes), so the row's own `Edit schedule` control is on screen without scrolling. Run **red first** with the source fix set aside (row top 24px against a header bottom of 85px) and green with it, using Chromium per `docs/SANDBOX.md` entry 8.
- The fix was also checked against the rest of the app: the whole local browser suite (133 tests), `npm run build` and `npm audit --omit=dev` were run before the release PR; mandatory CI checks (`gates`, `browser`, `docker`) and the tag-triggered `Publish` workflow gate publication.

## Image tags

Stable release: published as `v1.13.1`, `latest` and `sha-<short>`, all to one verified digest. The GitHub release is marked **Latest**.
