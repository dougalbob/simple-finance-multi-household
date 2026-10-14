# Release notes — v1.11.0 — Chart C counts all of your spending, and the honesty loop allows normal life

**Stable release (`v1.11.0`)**, moving **`latest`** and GitHub's **Latest** release. It takes three of the five issues the household has open as one slice: **#25** (Chart C misses person spending made under non-Personal parents), **#26** (By Person Prev/Next jumps to the top of the page) and **#27** (the honesty verdict needs a tolerance band). **#28** (Recurring hide-cancelled toggle and badge counter) and **#30** (Transactions supplier links landing under the sticky header) are left as the natural follow-up slice. The app badge should read **`v1.11.0 · stable`**.

## What changed

### Charts → C · Personal spending — every line marked for you (issue #25)

- A person's bar now counts **every line marked for them, whatever category it sits under**. Clothing bought inside a split grocery shop, or a present grouped under Groceries, used to vanish from the chart — a person column could read £45–60 lower than it should. The chart now agrees with the Insights month panel, which always counted the same "For: person" rule over every line.
- The **Household bar keeps its scope** (Personal and Entertainment & Eating Out only), so joint groceries and bills do not swamp it — and it is still never split between people.
- Opening a person's bar now shows **all** of their lines for the month (the category filter is gone for person bars); the household bar keeps its filter. The caption says all of this.

### Insights → By person — Prev/Next keep the panel in view (issue #26)

- Paging months in the By person panel now keeps the panel in view instead of jumping to the top of the page, and the heading lands clear of the sticky header.

### Insights → honesty loop — a tolerance band (issue #27)

- Drift within **−15%…+10%** of the configured figure now reads as normal life: "Close to the £85.00 you configured — actual spending of £87.00 a week is within the usual range."
- Outside the band the verdict keeps the pounds, **adds the percent** ("12% over"), and speaks more strongly ("That is outside the usual range — …"). Only overspending warns; spending less keeps the friendly styling and suggests lowering the figure.

## Schema and existing data

- **No database migration, no backup-format change and no `.env` change.**
- Nothing is written by any of the three changes: the chart re-counts existing lines, the month links only navigate, and the tolerance band is worked out when the figures are read.

## Who should update and what to do

- **Everyone on the multi-household installation:**
  1. Take a household backup in **Settings** and a registry backup in **Admin** (`/admin`), and keep a copy of `/mnt/user/appdata/simple-finance-multi-household/.env`.
  2. In Unraid, keep the container Repository on **`ghcr.io/dougalbob/simple-finance-multi-household:latest`** (or pin `:v1.11.0`) and run **Force Update**.
  3. Keep host port **`3009`** → container port **`3000`** and `/mnt/user/appdata/simple-finance-multi-household` → `/data`. Never point this container at `/mnt/user/appdata/simple-finance` or host port `3007`.
  4. Confirm the version badge reads **`v1.11.0 · stable`**. Then check:
     - **Charts → C · Personal spending**: the caption says a person's bar counts every line marked for them; opening a person's month shows lines from every category.
     - **Insights → By person**: Prev/Next keep the panel in view.
     - **Insights → Are your configured figures honest?**: small drifts read "within the usual range"; larger ones name the percent.

## Validation evidence

- `npm run typecheck` (`tsc --noEmit`): clean.
- `npm run format:check` (`prettier --check .`): clean.
- `npm run themes:check`: clean.
- `npm test` (`node scripts/run-tests.mjs`, 5 sequential batches): **906 passed, 0 failed across 208 suites**. That includes the reworked `tests/chart-series.test.ts` personal block (a grocery line marked for a person counts, with its category named; a joint grocery shop stays out of Household), the extended `tests/charts-view.test.ts` (a Groceries top-up for Sam in the seed; person totals reconciled without the parent filter; September's person cells demanded to match panel 2's own `personalSpending` over the same lines), and the new `honestyBand` / `honestyDriftPercent` cases in `tests/insights.test.ts` (band edges, null/zero configured figures, half-up rounding).
- Browser: two new specs in `e2e/insights.spec.ts` (month links carry the anchor and the heading lands in view below the sticky header; the seeded groceries verdict reads outside the usual range with a percent). They were not run in this sandbox — it has no browser and the Playwright download host is unreachable — so CI's `browser` job (the complete seeded suite) is the browser evidence for this release.
- `npm run build` (`next build`): clean.
- `npm audit --omit=dev`: 0 production vulnerabilities.
- Mandatory CI checks (`gates`, `browser`, `docker`) and the tag-triggered `Publish` workflow (upgrade smoke and GHCR digest verification across `v1.11.0`, `latest` and `sha-<short>`) gate publication.

## Image tags

Stable release: published as `v1.11.0`, `latest` and `sha-<short>`, all to one verified digest. The GitHub release is marked **Latest**.
