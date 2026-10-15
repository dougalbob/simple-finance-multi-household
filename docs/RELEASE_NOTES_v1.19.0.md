# Release notes — v1.19.0 — Transfers open in place on All Transactions, and Recurring calendar day summaries

**Stable release (`v1.19.0`)**, moving **`latest`** and GitHub's **Latest** release. It adds in-place
transfer editing on All Transactions (GitHub issue #55) and promotes the accepted **`v1.18.0-rc.1`**
Recurring calendar day summaries (GitHub issue #53) to stable. The version badge should read
**`v1.19.0 · stable`**.

## What changed

### A transfer between your own pots opens right where you see it (issue #55)

On **All Transactions**, a transfer between two of your own pots (a `TX>` or `TX<` row) no longer sends
you to another page. Select the other pot's name in the row, for example **Sam's cash** on Main
account's `2026-10-14 TX< Sam's cash +£1,100.00` row. A panel opens **directly below that row** with:

- **Correct it**: change the pots, amount, date or note, then save. This is the same correction as
  before (decision 218): a stale form saves nothing and says why, and every change is audited.
- **Void it**: give a reason and void the transfer. Voided transfers are never counted.
- **Close**: closes the panel. Only one transfer is open at a time.

Saving keeps the panel where it was, so you can save again without searching for the row. If a
correction moves the transfer off the pot you are viewing, or outside the dates shown, it stays in
place with a **not counted** label and links such as **See it in Alex's cash →**. A void keeps the
row in place too, marked **voided — not counted**. Closing the panel removes these rows. The open
transfer is part of the page address, so a reload or a bookmark opens it again.

**Only transfers change.** Purchases still link to Purchases, and income, checkpoints, external
movements and scheduled payments behave as before. Recording a transfer is unchanged: use Quick Entry →
Move → Between pots.

**The "Transfers between pots" card is gone** from Accounts, Pots & Checkpoints. Everything it offered
(edit and void) is now on the transfer's own row. Old bookmarks and links to `/pots?transfer=…` still
work: they open that transfer in place on All Transactions, on your usual pot if the transfer touches
it, or on the pot it came from otherwise.

### Recurring calendar day summaries (issue #53, accepted from `v1.18.0-rc.1`)

The Recurring month calendar no longer tries to fit every schedule name and amount into a busy day.
Each populated day shows an item count and the gross combined amount. Select it to open a details
panel listing each schedule's name, amount, type and conversion state. Expected receipts are added to
the gross total, not subtracted from outgoing payments. Each **Edit schedule** link opens the Recurring
page filtered to that exact schedule (by name and schedule ID) with its Edit section already open.

## Existing data and migrations

- **No schema migration, backup-format change or `.env` change.** Both changes only affect
  presentation and navigation. No household data is rewritten.
- Correcting and voiding a transfer use the same domain rules as before: the version guard,
  before-and-after audit, the "two different pots" rule, and refusal in read-only support sessions.
- Households upgrading from `v1.17.0`, or still running the `v1.18.0-rc.1` candidate, need no
  migration step.

## Who should update and what to do

1. Take a household backup in **Settings**, a registry backup in **Admin** (`/admin`), and a copy of
   `/mnt/user/appdata/simple-finance-multi-household/.env`.
2. In Unraid, set the container Repository to
   **`ghcr.io/dougalbob/simple-finance-multi-household:latest`**, or pin
   `ghcr.io/dougalbob/simple-finance-multi-household:v1.19.0`, then run **Force Update**. If you pinned
   `:v1.18.0-rc.1` to test the candidate, switch back to `:latest`.
3. Keep bridge networking, host port **3009** → container port **3000**, the existing Cloudflare route,
   and `/mnt/user/appdata/simple-finance-multi-household` → `/data` unchanged. Never point this
   container at `/mnt/user/appdata/simple-finance` or the original app's port 3007.
4. Confirm the badge reads **`v1.19.0 · stable`**. On **All Transactions**, select a transfer's pot name
   to open it in place. On **Recurring**, select a populated day's summary.

## Validation evidence

- The household approved the issue #55 Arena preview, using fictional data only, and accepted the
  `v1.18.0-rc.1` candidate, which published from `7c8fecc` (PR #54; Publish run `38761006486`).
- Local gates: `prettier --check .`, `tsc --noEmit` and `themes:check` are clean. `npm test` passes
  **973/973 across 225 suites**, including 18 new pure tests for the open-transfer address, date
  windows, the usual pot and pinned-row placement. `next build` is clean and `npm audit --omit=dev`
  reports **0 vulnerabilities**.
- Browser (Playwright): the four transfer journeys in `e2e/transactions.spec.ts` cover opening in
  place, red and green legs, correcting pots, amount and note, a stale editor, voiding, and old
  `/pots?transfer=` links. Purchases are checked to keep their link. Locally, every project up to and
  including `transactions`, in CI's order, passed **69/69**. A save-stability check ran red first
  against the abandoned `history.replaceState` design (the panel moved **333px**) and is green now.
- The first PR browser run failed one assertion. After the correction, it checked that no row showed
  the old **£12.34**, but the earlier `mobile` project records a £12.34 till purchase on the same pot
  and day. The check is now limited to transfer rows. The failure was reproduced locally, and the same
  pair passes after the fix.
- The required `gates`, `browser` and `docker` checks, main CI and the tagged Publish workflow (upgrade
  smoke and one-digest verification of `v1.19.0`, `latest` and `sha-<short>`) gate publication.
