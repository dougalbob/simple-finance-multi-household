# Release notes — v1.16.0 — Total same-category items on a split line

## What changed

On Quick Entry, a split line that is not Line 1's auto remainder now has a **"+"** beside its amount. Tapping it opens a small **Add item** field: each amount you type is added, in whole pence, to that line's running total — same category, same target, no extra split. Line 1 still follows the remainder of the till total. This is GitHub issue #46 (decision 221).

A wider bill with several clothing items (or several appliances) no longer needs a calculator outside the app. Empty or zero current starts the line at the first item; a half-typed amount is left alone. Enter in the item field adds; it never saves the purchase.

## Who is affected and what to do

Anyone recording a split purchase at the till. No settings or data changes are needed. The "+" appears once there is more than one allocation line.

## Data, schema and backups

No database schema, household records, registry data, migration or backup format changes. No data conversion or restore action is required. Continue the host's normal backup routine for the household data, registry and `.env`.

## Validation

- Unit tests in `tests/quick-entry.test.ts` walk the four fictional clothing amounts (£38.50 + £11.65 + £8.25 + £11.99) to **£70.39**, and hold half-typed, non-positive, negative and overflow cases.
- Browser coverage in `e2e/remainder.spec.ts` fills a £100 till total, adds a split, proves Line 1 has no "+", then adds those four amounts into Line 2 via Enter and asserts Line 2 is £70.39 with Line 1 remainder £29.61, at **393px** and **1400px**. The existing remainder and mobile split specs still pass.
- Local release gates passed: `npm run format:check`, `npm run typecheck`, `npm run themes:check`, `npm test` (**946/946** across 218 suites), `npm run build`, and `npm audit --omit=dev` (0 vulnerabilities). The required PR checks and tagged Publish workflow remain the merge/release gates; local results do not substitute for them.

## Stable update and Unraid

This is a stable minor release: `v1.16.0` (`v1.16.0 · stable`). Once published, the new image is `ghcr.io/dougalbob/simple-finance-multi-household:v1.16.0`; stable `latest` moves to the same verified image. Update the existing multi-household app through its normal Unraid update flow. Keep bridge networking, host port **3009** → container port **3000**, the existing Cloudflare route, and `/mnt/user/appdata/simple-finance-multi-household` → `/data` unchanged. Do not use the original app's port 3007, route, image or appdata path. No separate migration or restore step is required.
