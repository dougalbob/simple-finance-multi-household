# Release notes — v1.46.0 — Money owed to us: tracked reimbursement claims

**Stable release.** This build moves `latest` and is marked Latest on GitHub.
Version badge: **v1.46.0 · stable**.

## What changed

Money you are owed back by someone outside the household — a funeral estate reimbursing wake costs, an
insurer settling, an employer paying back mileage — now has its own honest record on the **Borrowing**
page, headed **Money owed to us — expected back** (issue 124).

- **Track a claim from recorded spend.** Pick the purchases that belong to the claim (they stay in your
  charts as ordinary spending, exactly as if no claim existed) and say who owes you the money. The card
  shows what is still **awaited**, derived from the linked purchases minus what has since settled —
  never typed in, never stored.
- **Close it when the money moves — two honest doors, both one action.** *The money arrived* records the
  one-off income into a pot and settles the claim together. *Paid directly, not into a pot* settles the
  claim with no pot movement at all, and can cancel the informal IOU it belongs against by the same
  amount — the way a repayment normally would.
- **The IOU cancels where you watch it.** A settlement that names an IOU joins that IOU's balance and the
  Borrowing ledger like any movement, shown as a claim settlement — never silently netted, never a new
  pot of its own.
- **Claims never touch the rest of the app.** They are not income or spending, not a plan or projection,
  not netted automatically, and nothing predicts a payment date. Void anything and history is kept;
  income that already arrived stays recorded.
- **Corrections stay possible.** Purchases can be detached or attached later (the estate keeps adding
  wake costs as they happen), a claim's wording can be edited, and settlements or whole claims can be
  voided with a reason — all audited.

## Schema, data and compatibility

Migration `0023_claims.sql` adds three side tables (`claims`, `claim_purchases`, `claim_settlements`).
No existing table changes; no stored figure is derived for the new concept. A household backup already
carries the whole database file, so backups made before the update restore under `0023` at start-up.
No changes to authentication, household separation, storage paths or the backup format.

## Upgrading on Unraid

Back up each household and the Admin registry, then **Force Update** the **Simple Finance
Multi-household** container using `ghcr.io/dougalbob/simple-finance-multi-household:latest` (or pin
`:v1.46.0`). Keep appdata at `/mnt/user/appdata/simple-finance-multi-household` and host port **3009**.
Do not update or repoint the original installation at `/mnt/user/appdata/simple-finance`, port 3007.
The container applies migration `0023` at start-up; back up first. After the update, check that the app
shows **v1.46.0 · stable**.

## Validation

- The unit suite passes locally. It covers claim derivation (never stored), both settlement routes,
  over-settlement refusal, IOU reduction by exact amount, void-and-reopen of claims and settlements,
  release of purchases on void, version conflicts, audit entries and the ledger/IOU merge.
- The new browser spec (`e2e/claims.spec.ts`) covers the track → arrive-in-a-pot → closed journey, the
  paid-directly-outside-the-pots journey (IOU reduced), and void-and-release; its Chromium download is
  blocked in this build sandbox, so it runs as the `browser` gate on the PR and on main CI. The seeded
  installation was verified to render the new card with the right data wired up.
- Typecheck, formatting, theme check, production build and production dependency audit passed locally.
  The build reports the existing registry-migration filesystem tracing warnings.
- PR and main CI require the gates, browser acceptance and Docker/upgrade-smoke checks before the
  release tag is published; the Publish workflow builds, smoke-tests and verifies the registry tags.

If anything here misbehaves on a live household, the recovery is the ordinary pair: fix forward in a
patch release, or restore the household from its pre-update backup.
