# Release notes — v1.8.0-rc.1 — Contracts & Renewals agreement register

**Release candidate 1** for acceptance before a separate stable `v1.8.0`. This is a pre-release, not the new stable default; it does not move `latest`. The app badge should read **`v1.8.0-rc.1 · pre-release`**.

## What changed

- **A structured agreement register on Contracts & Renewals.** Policies and contracts are explicitly classified as insurance, service, or other renewals. Insurance is grouped by its explicit agreement type—not inferred from supplier or category—and remains in the insurance group whether the provider auto-renews or not. Older unclassified renewal reminders stay under Other until someone classifies them.
- **Separate provider terms from payment schedules.** Agreements can record the supplier, household/person/vehicle, notes, renewal date, fee-free switch date, and independent in-app reminder lead times. A direct-debit or standing-order schedule can be linked, while its payment amount and frequency remain on Recurring.
- **Clear insurance renewal behaviour.** Provider auto-renew (`Yes`, `No`, or `Unknown`) is separate from the app's annual reminder repetition. The app advances a date only for an insurance policy explicitly marked `Yes` with annual repetition enabled. `No`, `Unknown`, service agreements, and unclassified legacy renewals are not automatically rolled forward. Reminders never renew, cancel, change cover, or issue a bank instruction.
- **Renewal and fee-free switch prompts are distinct.** Overview and Tasks can link back to the relevant agreement; a past fee-free switch date stays visible as available rather than being treated as an expired contract. Existing credit-card payment/promotion reviews and supplier follow-ups remain available.

## Schema and existing data

Tenant migrations `0017_tracked_agreements` and `0018_legacy_schedule_source` add the tracked-agreements register and its legacy source link. Existing renewal rows are copied into the register as **Other** (their type is not guessed); active schedules with a contract end date are copied as service agreements with that date recorded as the switch date. The original rows and schedule dates are retained for compatibility and audit relationships. The source link prevents an imported legacy schedule from appearing twice if it is later unlinked. These are additive migrations; they do not delete household data or change payment schedules.

Back up before testing the candidate. Migrations run against each registered household's database when the app starts.

## Who should update

This is an **acceptance candidate**, not a stable upgrade announcement. Test it only if you are willing to evaluate a pre-release; stable users can stay on `latest` (`v1.7.0`) until acceptance and a separate stable release. If you test against existing data, make a current, restorable backup first.

## Unraid and candidate image

1. Back up `/mnt/user/appdata/simple-finance-multi-household`, including `.env`, `system/registry.sqlite`, household databases, and documents.
2. To test the candidate, pin the container Repository to **`ghcr.io/dougalbob/simple-finance-multi-household:v1.8.0-rc.1`**. The template's `:latest` default remains on the accepted stable release and is not changed by this RC.
3. Keep the multi-household appdata root above, host port `3009`, and container port `3000`. Do not point it at or alter the original `/mnt/user/appdata/simple-finance` installation.
4. After the update, confirm the footer badge reads **`v1.8.0-rc.1 · pre-release`** and review the imported entries on `/contracts`.

The RC publishes only its exact version tag and `sha-<short>`; it does **not** create or move `latest`. If a change is needed, the next candidate must use a higher RC number. Stable `v1.8.0` follows only after acceptance.

## Validation evidence

- `npm run typecheck`, `npm run format:check`, and `npx drizzle-kit check` passed.
- Migration journal ordering and upgrade tests passed; focused agreement, money-view, renewal, task, and validation suites passed.
- The E2E seed and HTTP checks for `/contracts` and `/recurring` passed.
- Interactive local Playwright was not run because the sandbox lacks the Chromium executable. The release PR must still pass all required CI checks—`gates`, `browser`, and `docker`—before merge; local results do not replace those gates.
