# Release notes — v1.45.0 — Account and supplier purchase links

**Stable release.** This build moves `latest` and is marked Latest on GitHub.
Version badge: **v1.45.0 · stable**.

## What changed

- **Overview account links (issue #122).** Select a bank or credit-card name in the household-total
  card to open **All Transactions** for that exact account. The same links appear on Home. Cash pot
  names remain plain text. The transactions page keeps its usual default date range, and an account
  without a checkpoint is still linked when its name is shown.
- **Supplier purchase links (issue #120).** Select a recent purchase on a supplier card to open that
  exact record on **Purchases**, including its lines, history and existing editing controls. An
  **Also filtering: Purchase** chip identifies the focused record; select the chip to return to the
  broader history without losing other filters. The card shows its five most recent purchases, with
  an **All purchases from …** link to the supplier-filtered history for older records. Purchases
  displays up to its usual 500 newest matches at a time.
- Purchase links identify records by ID before the history cap, so old or same-day purchases do not
  lead to the wrong entry. A link still finds the record if it is later re-dated or voided. These are
  views of the household's own records, not a connection to a bank.

## Schema, data and compatibility

No schema or migration change. No changes to stored financial records, calculations, authentication,
household separation, backup format or storage paths. Existing links and filters continue to work.

## Upgrading on Unraid

Back up each household and the Admin registry, then **Force Update** the **Simple Finance
Multi-household** container using `ghcr.io/dougalbob/simple-finance-multi-household:latest` (or pin
`:v1.45.0`). Keep appdata at `/mnt/user/appdata/simple-finance-multi-household` and host port **3009**.
Do not update or repoint the original installation at `/mnt/user/appdata/simple-finance`, port 3007.
No new migration is required. After the update, check that the app shows **v1.45.0 · stable**.

## Validation

- The full local unit suite passed **1,315 tests**. It covers ID-filtering before the row cap,
  same-day records, re-dating, refunds, voids, malformed IDs and household isolation.
- Targeted Chromium checks passed on phone and desktop, including the correct account selection,
  cash remaining unlinked, an uncheckpointed credit card, exact supplier-purchase navigation, the
  filter chip, older supplier history and the existing Overview, Purchases and Transactions filters.
- Typecheck, formatting, theme check, production build and production dependency audit passed locally.
  The build reports the existing registry-migration filesystem tracing warnings.
- PR and main CI require the gates, browser acceptance and Docker/upgrade-smoke checks before the
  release tag is published; the Publish workflow builds, smoke-tests and verifies the registry tags.
