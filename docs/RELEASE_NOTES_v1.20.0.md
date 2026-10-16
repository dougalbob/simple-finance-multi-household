# Release notes — v1.20.0 — Purchases open in place on All Transactions, and Record refund works again

**Stable release (`v1.20.0`)**, moving **`latest`** and GitHub's **Latest** release. It adds in-place
purchase editing on All Transactions (GitHub issue #57) and repairs the **Record refund** button on
Purchases, which never sent the fields its action needed. The version badge should read
**`v1.20.0 · stable`**.

## What changed

### A purchase opens right where you see it (issue #57)

On **All Transactions**, a purchase record no longer sends you to another page to be corrected. Select
the supplier's name in the row — on an ordinary purchase (`PUR`), a direct debit (`DD`) or a standing
order (`SO`; the schedule's name when the record has none). A panel opens **directly below that row**
with:

- **Correct it**: change the amount on each split line, the category, who it was for, the date or the
  note, then save. This is the same editor as on Purchases, so the same rules apply: the lines must total
  the amount exactly, a stale form saves nothing and says why, and every change is audited.
- **Void it**: give a reason and void the purchase. Voided records are never counted.
- **Close**: closes the panel. Only one record — a purchase or a transfer — is open at a time.

Correcting a direct debit or standing order changes **only that record**: it never rewrites the schedule
that produced it. Saving keeps the panel where it was, so you can save again without hunting for the row.
If a correction re-dates the purchase outside the dates you are viewing, it stays where it now belongs
in the list with a **not counted** label and a link such as **Show Main account around 2026-08-20 →** —
and if that moved it off your screen, the panel comes back to you. A void keeps the row
in place too, marked **voided — not counted**, with a link to **See it on Purchases**. Closing the panel
removes these rows. The open purchase is part of the page address, so a reload or a bookmark opens it
again.

**A refund is different on purpose.** A `REF` row keeps its link to Purchases, because a refund is
recorded, corrected and voided beside the original it came back from. `PUR`, `DD` and `SO` rows open in
place; everything else (income, checkpoints, boundary money, expected support) behaves exactly as before.

### Record refund works again (found while testing issue #57)

Recording a refund from a purchase's **Edit → Refund** section had never worked: the form did not send
the original purchase's id, the pot or the amount, and it sent its amounts in a shape the action could not
read, so every attempt failed with *"Invalid input: expected number, received null"*. The form and its
action now share one field contract, the refund total is the sum of its lines (type a smaller amount for a
partial refund), and a refund inherits the original's **pot, supplier and payer** — the same shop, the same
account, the same person — exactly as SPEC §9.5 describes. A browser test now records a real refund, reads
its `REF` row in All Transactions, follows its link back, and voids it.

## Existing data and migrations

- **No schema migration, backup-format change or `.env` change.** Both changes are presentation,
  navigation and form wiring; nothing already recorded is rewritten.
- Correcting and voiding a purchase use the same domain rules as before: the version guard,
  before-and-after audit, the exact-total rule for splits, the refund-link rules, and refusal in a
  read-only support session.
- Households upgrading from `v1.19.0` need no migration step.

## Who should update and what to do

1. Take a household backup in **Settings**, a registry backup in **Admin** (`/admin`), and a copy of
   `/mnt/user/appdata/simple-finance-multi-household/.env`.
2. In Unraid, set the container Repository to
   **`ghcr.io/dougalbob/simple-finance-multi-household:latest`**, or pin
   `ghcr.io/dougalbob/simple-finance-multi-household:v1.20.0`, then run **Force Update**.
3. Keep bridge networking, host port **3009** → container port **3000**, the existing Cloudflare route,
   and `/mnt/user/appdata/simple-finance-multi-household` → `/data` unchanged. Never point this
   container at `/mnt/user/appdata/simple-finance` or the original app's port 3007.
4. Confirm the badge reads **`v1.20.0 · stable`**. On **All Transactions**, select a supplier's name on a
   purchase, direct debit or standing order row. On **Purchases**, open a purchase's **Edit → Refund**
   section and record a refund against it.

## Validation evidence

- The household approved the issue #57 Arena preview, using fictional records only.
- Local gates: `prettier --check .`, `tsc --noEmit` and `themes:check` are clean. `npm test` passes
  **992/992 across 230 suites** — including 16 new pure tests for the open-purchase address, date windows,
  pinned-row reasons, links and placement, and a field-by-field wiring test for the refund form — and
  `next build` is clean with `npm audit --omit=dev` reporting **0 vulnerabilities**.
- Browser (Playwright): `e2e/transactions.spec.ts` adds three journeys — correcting a purchase recorded at
  the till and voiding it in place (the page does not move: ≤ 4px); a re-date out of the window (pinned,
  honest, and the panel is brought back into view when the new date moved it); and a refund recorded on
  Purchases whose `REF` row keeps its link, lands below the sticky header and is voided afterwards.
  Locally, `transactions` passes **11/11**, and the `projects`, `credit-card-pots`, `insights`,
  `recurring`, `payday-summary` and `backup` projects — which a full sandbox run had failed only because
  its dev server died part-way — pass **14/14** on a fresh server. The `admin` project cannot complete in
  this sandbox (its dev server dies on the registry flows); it fails the same way, and worse, with this
  change stashed, and CI's browser job passes it.
- The required `gates`, `browser` and `docker` checks, main CI and the tagged Publish workflow (upgrade
  smoke and one-digest verification of `v1.20.0`, `latest` and `sha-<short>`) gate publication.
