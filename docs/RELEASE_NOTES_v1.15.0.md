# Release notes — v1.15.0 — Pin a default pot for All Transactions

**Stable feature release (`v1.15.0`)**, moving **`latest`** and GitHub's **Latest** release. It answers **GitHub issue #44**: All Transactions can now open on the pot the household actually uses most, instead of relying on the page's former fallback. The app badge should read **`v1.15.0 · stable`**.

## What changed

### Choose the starting pot for All Transactions (issue #44)

- **Settings → All Transactions** now has a **Default pot for All Transactions** selector. Choose a live pot, change the choice later, or clear it to keep the existing fallback.
- When `/transactions` has no valid `potId` in its URL, the selected default is used. An explicit valid target always wins — including a pot selected through the Target filter and links that already carry a `potId`.
- The cleared/unset fallback is unchanged: **Main account**, or the first live pot when there is no Main account. An archived pot cannot be pinned; if a previously selected pot is archived, the stored preference is ignored.
- This is a household preference, saved in that household's existing settings table and audited like other settings. All Transactions remains read-only; the preference does not alter any record, date filter or movement.

## Schema and existing data

- **No database migration, backup-format change, `.env` change or schema change.** The setting is a new key in the existing tenant-local key/value settings table.
- Existing households start with no default, so their current All Transactions starting pot is unchanged until someone chooses one. Household backups already include the settings table.

## Who should update and what to do

- **Everyone on the multi-household installation**, especially anyone who opens All Transactions to review one pot regularly:
  1. Take a household backup in **Settings** and a registry backup in **Admin** (`/admin`), and keep a copy of `/mnt/user/appdata/simple-finance-multi-household/.env`.
  2. In Unraid, keep the container Repository on **`ghcr.io/dougalbob/simple-finance-multi-household:latest`** (or pin `:v1.15.0`) and run **Force Update**.
  3. Keep host port **`3009`** → container port **`3000`** and `/mnt/user/appdata/simple-finance-multi-household` → `/data`. Never point this container at `/mnt/user/appdata/simple-finance` or host port `3007`.
  4. Confirm the version badge reads **`v1.15.0 · stable`**. In **Settings → All Transactions**, choose the pot you usually review and save it. Open `/transactions` without a `potId` and confirm that pot is selected. Choose another pot in the Target filter and confirm that explicit choice still wins. Clear the setting to restore the former fallback.

## Validation evidence

- `tests/settings-domain.test.ts` covers unset/set/change/clear, invalid and archived pots, and the audit trail.
- `e2e/settings.spec.ts` covers saving the setting, opening All Transactions on it, explicit-target precedence and clearing back to the old fallback.
- `npm run typecheck` (`tsc --noEmit`): passed.
- `npm run format:check` (`prettier --check .`): passed.
- `npm test` (`node scripts/run-tests.mjs`): **939/939 passed across 217 suites**.
- `npm run themes:check`: passed; `npm run build`: passed; `npm audit --omit=dev`: **0 vulnerabilities**.
- Local browser acceptance: the focused issue #44 Playwright test passed **1/1** with the sandbox Chromium overlay, covering the saved default, invalid and explicit URL targets, and clearing to the former fallback. The full local suite reached **124/138**; the admin/restore test timed out first, followed by connection-refused failures from the dev server. The required CI `browser` check remains the release gate and will be recorded before merge.
- Required CI checks (`gates`, `browser`, `docker`) must all pass before the release PR is merged.

## Image tags

Stable release: publish as `v1.15.0`, `latest` and `sha-<short>`, all to one verified digest. The GitHub release must be marked **Latest**.
