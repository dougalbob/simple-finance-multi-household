# Release notes — v0.33.0 — Running balance in All Transactions

## What changed

After a month of real use it was hard to work out the approximate balance at a point in history when money moves between pots. The earlier decision to *not* track a running balance in All Transactions is revised.

- **Balance column at the far right** of every movement row in `/transactions`. The column shows the running balance *after* that movement, computed from the most recent checkpoint.
- **Colour coded:** green (`text-positive`) when in credit, red (`text-danger`) when overdrawn — the same semantic colours the rest of the app uses.
- **Checkpoint-anchored to contain drift.** Balances before a checkpoint stay as previously computed/recorded; after a checkpoint the running balance is `checkpoint amount + sum(signed movements after that checkpoint)`. This matches the proposal: not line-by-line bank reconciliation, not 100% accurate against online banking, but good enough to answer “where were we around then?”.
- **Same-day absorbed vs counted logic** is preserved from the money view: a credit (receipt, external in) dated the same day as a checkpoint only counts as after the checkpoint when its `created_at` is after the checkpoint's `created_at`. Debits (purchases, transfers out) are always after if on or after the checkpoint date. This fixes the “receipt at 09:00, checkpoint at 12:00, purchase at 13:00” ordering.
- **Ordering fix for same-day movements** that previously shared the same `occurredAt` end-of-day stamp: balance movements are now sorted by `occurredAt` asc, then `enteredAt` (`createdAt`) asc, then family rank, then record id — so the real entry order is respected.
- **Checkpoint divider also shows its balance** coloured the same way, and the table footer now explains: “Movements shown sum to …” plus “The balance column shows the running balance after each movement. Green is in credit, red is overdrawn.”

## Schema and data

None. No migration, no data conversion, no backup-format change and no new dependency. Existing checkpoints, purchases, transfers, receipts and external movements are read as before; the balance is computed on the fly from the latest checkpoint.

## Verification

- `npm test` — **643 passed** across 150 suites (6 new in `tests/activity.test.ts` under “All Transactions: running balance (v0.33.0)”: no checkpoint → null, compute from checkpoint, drift reset, same-day absorbed vs counted, credit after checkpoint counts, expected rows have no running balance).
- `npm run typecheck` — passed.
- `npm run format:check` — passed.
- `npm run build` — passed (verified locally).
- Playwright via `docs/SANDBOX.md` entry 8 overlay (`playwright.local.config.ts` pointing at `/tmp/chromium` with `--no-sandbox`):
  - `transactions` project: **6 passed**, including new “shows running balance at far right, green in credit red in debit, anchored on checkpoints”.
  - `horizon` project: **9 passed** after fixing a strict-mode duplicate (“support from Mum” appears twice in a 35-day window).
  - `backup` project: **2 passed** on retry (previously flaky).
  - Full suite earlier run: 111 passed + 4 flakes that now pass.
- Pull-request CI and the release-image upgrade verification remain to run through GitHub before merge and publish (gates, browser, docker with upgrade smoke from `v0.32.0`).

## What to do

In Unraid, **take a backup, then Force Update**. The version badge should read `v0.33.0 · pre-release`.

Release notes document: [`docs/RELEASE_NOTES_v0.33.0.md`](RELEASE_NOTES_v0.33.0.md).
