# Release notes — v1.15.1 — Keep Insights month navigation in place

## What changed

On Insights, Prev and Next in the **By person** panel now preserve the reader's current vertical scroll position when paging between months. The month and `#panel-persons-heading` remain in the URL; the heading fragment still supports direct links and browsers with JavaScript disabled. This fixes the regression reported in GitHub issue #45 (decision 220).

## Who is affected and what to do

This is a small navigation correction for anyone paging months in the By person card. No settings or data changes are needed.

## Data, schema and backups

No database schema, household records, registry data, migration or backup format changes. No data conversion or restore action is required. Continue the host's normal backup routine for the household data, registry and `.env`.

## Validation

- The new Playwright regression reproduced the old behavior before the fix: at 390px, Next shifted the page **91px**. After the fix, Prev and Next preserve `window.scrollY` within 8px at both 390px and 1400px, including after delayed anchor checks.
- The complete Insights Playwright project passed **3/3** locally using the sandbox Chromium setup in `docs/SANDBOX.md` entry 8.
- Local release gates passed: `npm run format:check`, `npm run typecheck`, `npm run themes:check`, `npm test` (**939/939** across 217 suites), `npm run build`, and `npm audit --omit=dev` (0 vulnerabilities).
- The required PR checks and tagged Publish workflow remain the merge/release gates; local results do not substitute for them.

## Stable update and Unraid

This is a stable patch: `v1.15.1` (`v1.15.1 · stable`). Once published, the new image is `ghcr.io/dougalbob/simple-finance-multi-household:v1.15.1`; stable `latest` moves to the same verified image. Update the existing multi-household app through its normal Unraid update flow. Keep bridge networking, host port **3009** → container port **3000**, the existing Cloudflare route, and `/mnt/user/appdata/simple-finance-multi-household` → `/data` unchanged. Do not use the original app's port 3007, route, image or appdata path. No separate migration or restore step is required.
