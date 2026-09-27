# Release notes — v0.23.0 — credit-card pots (broken on upgrade; superseded by v0.23.1)

> **⚠ Do not update to v0.23.0.** On any installation upgraded from v0.20.0–v0.22.1 the
> startup migration silently skipped migration `0012_credit_card_pots`, and the app fails at
> runtime with `SqliteError: no such column: "credit_card_payment_day_of_month"`. Fresh installs
> (empty `/data`) are unaffected, which is why every CI check was green. No data is lost or
> corrupted. **Update to v0.23.1 instead** — it repairs the migration bookkeeping and applies
> 0012 on upgrade. If you already updated and see the error, Force Update again once v0.23.1 is
> published; your data is intact. Do not add the missing columns by hand. Full analysis in
> [`RELEASE_NOTES_v0.23.1.md`](RELEASE_NOTES_v0.23.1.md).

**Published:** 2026-09-27. Publish workflow run
[36320618940](https://github.com/dougalbob/simple-finance/actions/runs/36320618940) passed; registry
tags verified.
**Merge commit:** `aed1c1299186f15c0ffef8428015eac2a8481d9e` (PR #82; short SHA `aed1c12`).
**Image tags:** `ghcr.io/dougalbob/simple-finance:v0.23.0` ·
`ghcr.io/dougalbob/simple-finance:latest` · `ghcr.io/dougalbob/simple-finance:sha-aed1c12`.
**Digest:** `sha256:42cb4c3495456998afe35d26b89163ed90498817edfa5870b3a56a0a6b39f057`, shared by all
three tags. This differs from v0.22.1's `sha256:e8d55169227a3e31fbd4d2c15512f0eb569d451d970e734d0f333288a1efe1de`;
v0.22.1 retains its version and commit tags while `latest` moved forward with this release —
`latest` moves to v0.23.1 as soon as that release publishes.
**Version badge in this image:** `v0.23.0 · pre-release`.

## What changed (the release's own content, independent of the upgrade defect)

- **Credit-card pots:** add one or more generic credit-card pots with signed balances,
  credit-limit and near-limit context, usual payment day, configurable reminder lead (default
  three days), copied statement minimum and due date, and the actual promotional end date.
- **Honest ledger treatment:** purchases charged to a card remain spending. A bank-to-card
  repayment is a transfer, not spending. Card liabilities reduce the household net total and card
  debt is shown separately as context.
- **Liquid-only forecasts:** payday, Horizon and Charts liquidity projections use bank and cash
  pots. Credit-card balances and card-assigned scheduled movements do not count as spendable
  funds. Card debt cannot trigger a bank overdraft warning or the bank-pot transfer shortfall
  watch.
- **Advisory reminders:** in-app payment-review and promotional-end alerts ask the household to
  check the statement/terms and decide what to do. The app does not calculate an issuer minimum,
  assume full repayment, automate or verify a payment, assume a promotional duration, calculate
  card interest, or provide a repayment scenario planner.
- **Build reliability:** the Docker builder now uses the Node headers bundled in its base image
  for the `better-sqlite3` native build, avoiding a separate `nodejs.org` header download.

## Schema and data

Migration `0012_credit_card_pots.sql` adds five optional per-pot credit-card fields. On **fresh**
installs it applies normally. On **upgraded** installs it was silently skipped (see the warning
above) — v0.23.1 repairs exactly that. Existing ledger records and pot balances are never
rewritten. Older backups continue to restore and upgrade through migrations. No real card
provider, limit, statement or promotional terms are included in repository fixtures or seed data.

## Updating in Unraid

Update to **v0.23.1** (or later), not to this release. If the container is pinned to this tag,
switch it to `ghcr.io/dougalbob/simple-finance:latest` or `ghcr.io/dougalbob/simple-finance:v0.23.1`
and Force Update. Take a backup first, as with every update.
