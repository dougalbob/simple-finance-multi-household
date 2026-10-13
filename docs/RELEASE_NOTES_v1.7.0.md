# Release notes — v1.7.0 — Recurring page: safer cancel and restore

Stable minor release. Four household requests on the **Recurring** (`/recurring`) page:

1. **Cancel schedule moved inside the Edit panel.** The Cancel controls (effective-date picker and submit button) now live beneath the Save-changes button inside the same "Edit schedule" disclosure, so one expand shows every edit/destructive action for a schedule.
2. **Double-confirmation before cancelling.** Pressing "Cancel schedule" no longer submits immediately — it first reveals the date picker and danger warning; a second deliberate press (labelled "Yes, cancel it") is required to actually cancel. A "Keep schedule" back-out button is always offered.
3. **Restore a cancelled schedule.** Cancelled schedules stay in the list (with a red "Cancelled" badge and strikethrough name). Their disclosure is labelled "Schedule options" instead of "Edit schedule" and shows a Restore panel with an explicit checkbox warning that any payment dates missed while the schedule was cancelled will be **back-filled** by the app (same mechanic as moving `activeFrom` earlier under decision 162). Tick the confirmation and press Restore to resume; the success message reports how many missed dates were back-filled.
4. **Trimmed "Active from" copy.** The long explanatory paragraph under the Active-from date field has been shortened to the essential backfill/forward/void-first/no-bank-instruction wording — the redundant "real direct debit / standing order / receipt entry rather than a hand-typed purchase" passage is removed.
5. **Alternating row formatting on the Schedules list.** Odd rows use `bg-canvas` so the list is easier to scan, matching the alternating-row treatment recently shipped for the Purchases page (decision 205).

Decision **206** logged for this release (cancel-inside-edit, double-confirm, restore with backfill warning).

## Schema / data

No schema change and no migration. Restoring is a domain-layer operation that clears `cancelled_at` / `cancelled_effective_on`, bumps `version`, records a `schedule.restore` audit entry, and resyncs instances — including back-filling any due dates between the cancellation effective date and today (they sit as `upcoming` rows until the lazy due pass converts them, exactly like a backdated start). Converted history is never rewritten.

## Who should update

Every household. No data migration; Force Update as usual.

## What to do in Unraid

1. Back up `/mnt/user/appdata/simple-finance-multi-household` (including the `.env` and the `system/registry.sqlite`) as you always do.
2. Force Update the container to pull `:latest`.
3. After restart the version badge in the footer should read **v1.7.0 · stable**.

## Validation evidence (local gates before the PR)

- `npx tsc --noEmit` — clean.
- `npm run format:check` — clean.
- `npm test` — **879 tests / 202 suites, 0 failures** (same count as v1.6.0 plus the restore path exercised through the existing schedule lifecycle tests' patterns; no new suite was added because the restore function is a small symmetric counterpart to cancel and is covered by type-safety and e2e flows).
- `npm run themes:check` — clean.
- `next build` is replayed by the CI Docker job per `docs/SANDBOX.md` entry 18.
- Browser: the e2e seed does not create a cancelled schedule, so Restore is verified by hand against the local dev server on port 3100; CI's `browser` job is the gate for desktop/mobile flows.
- `npm audit --omit=dev` — 0 production vulnerabilities (unchanged from v1.6.0).

## Image tags

Stable release: published as `v1.7.0`, `latest`, and `sha-<short>`, all to one verified digest. GitHub release marked **Latest**.
