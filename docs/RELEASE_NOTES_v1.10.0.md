# Release notes — v1.10.0 — Striped transactions, and the spending mix shows where the money went

**Stable release (`v1.10.0`)**, moving **`latest`** and GitHub's **Latest** release. It takes two of the three issues the household filed on 2026-10-14 as one slice: **#23** (alternating rows on All Transactions) and **#24** (Chart E's "identity disorder"). **#25** (Chart C missing personal spending made under other parent categories) is deliberately left for its own session because it changes what a chart measures; its agreed direction is recorded in decision 208. The app badge should read **`v1.10.0 · stable`**.

## What changed

### All Transactions — alternating rows (issue #23)

- Movement rows on **All Transactions** (`/transactions`) now alternate a tinted background, the same treatment as the Purchases list (v1.6.0) and the Schedules list (v1.7.0).
- Checkpoint dividers do not take a turn in the stripe. They are already tinted dividers with heavy rules, so the movements either side of one keep alternating.

### Charts → E · Spending mix — "Where the money went" (issue #24)

- **Renamed from "Where the money goes" to "Where the money went".** The pie counts recorded spending only, never a projection.
- **No dates after today.** Both date pickers stop at today. If an end date after today arrives in a link, it is brought back to today and the chart says so. A window that starts after today is refused, and the default window is shown with a note.
- **New quick windows, none ending after today:**
  - **Since last payday** (the default): from the most recent payday up to today.
  - **Last full payday cycle**: from the payday before that up to the day before the most recent one. With a payday on the 25th and today 14 October, that is 25 August – 24 September.
  - **Month to date**: from the 1st up to today.
- **"Last full payday cycle" now always appears when a salary is scheduled.** Previously the earlier cycle was only offered once the salary schedule had two paydays on record, so a recently added salary hid it. Earlier paydays are now worked out from the salary's own monthly rhythm, and a weekend payday still counts as the Friday before.
- **The date pickers show the window being drawn.** Pressing a quick window now always puts its dates into the From and To pickers, even after you have typed in a picker. Before, hand-typed dates could stay in the pickers beside a chart drawn for different dates. Typing dates that match a quick window lights that window's button.

## Schema and existing data

- **No database migration, no backup-format change and no `.env` change.**
- Nothing is written by the new payday logic: earlier paydays are calculated for the chart's windows only. No schedule instances are created and no records are converted.

## Who should update and what to do

- **Everyone on the multi-household installation:**
  1. Take a household backup in **Settings** and a registry backup in **Admin** (`/admin`), and keep a copy of `/mnt/user/appdata/simple-finance-multi-household/.env`.
  2. In Unraid, keep the container Repository on **`ghcr.io/dougalbob/simple-finance-multi-household:latest`** (or pin `:v1.10.0`) and run **Force Update**.
  3. Keep host port **`3009`** → container port **`3000`** and `/mnt/user/appdata/simple-finance-multi-household` → `/data`. Never point this container at `/mnt/user/appdata/simple-finance` or host port `3007`.
  4. Confirm the version badge reads **`v1.10.0 · stable`**. Then check:
     - **All Transactions**: rows alternate.
     - **Charts → E · Spending mix**: it is titled "Where the money went"; the buttons read Since last payday · Last full payday cycle · Month to date; neither picker allows a date after today; and pressing a button updates both pickers.

## Validation evidence

- `npm run typecheck` (`tsc --noEmit`): clean.
- `npm run format:check` (`prettier --check .`): clean.
- `npm run themes:check`: clean.
- `npm test` (`node scripts/run-tests.mjs`, 5 sequential batches): **902 passed, 0 failed across 208 suites**. That includes the new `tests/payday-windows.test.ts`, which covers the household's new-salary case, a first payday still to come, no salary, and the cadence walker's weekend, excluded-month and annual edges. It also includes the extended `tests/spending-mix-view.test.ts`: the default ends today, month to date, no quick window past today, the end-date clamp, a future start refused, and typed dates matching a quick window.
- Browser (local Chromium, `docs/SANDBOX.md` entry 8): the `transactions` and `charts` projects passed **16/16**. They include the new striping check and the new Chart E spec: title, `max` = today, three buttons, pickers following each button after hand edits, and the URL end-date clamp. The picker spec was shown to **fail without the fix** (`Expected "2026-10-01", Received "2020-01-01"`) and pass with it.
- `npm run build` (`next build`): clean.
- `npm audit --omit=dev`: 0 production vulnerabilities.
- Mandatory CI checks (`gates`, `browser`, `docker`) and the tag-triggered `Publish` workflow (upgrade smoke and GHCR digest verification across `v1.10.0`, `latest` and `sha-<short>`) gate publication.

## Image tags

Stable release: published as `v1.10.0`, `latest` and `sha-<short>`, all to one verified digest. The GitHub release is marked **Latest**.
