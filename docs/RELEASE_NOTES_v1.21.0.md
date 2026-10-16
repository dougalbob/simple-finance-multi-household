# Release notes — v1.21.0 — Borrowing gets its own page

**Stable release (`v1.21.0`)**, moving **`latest`** and GitHub's **Latest** release. Everything
informal borrowing now lives on a new **Borrowing** page in the menu (GitHub issue #60): the
per-person summary, one setup flow, one combined ledger with per-arrangement running balances and
expected payments, and the repay panel. The version badge should read **`v1.21.0 · stable`**.

## What changed

### The Borrowing page (issue #60)

The old **Owed & owing** and **Borrow & repay** cards on Accounts, Pots & Checkpoints were not
intuitive. They have moved, with the borrowing half of the boundary history, to one page that
answers the question directly — who, which way round, and what is still owed:

- **Summary strip** — one card per person. Each arrangement's honest status word (*Awaiting first
  payment* / *we owe £X* / *owed to us £X* / *Settled* / *overpaid £X*), the balance derived
  beside its movements, an expected-support plan in plain words ("Expecting £1,000.00 on day 12 of
  each month (a weekend day lands on the Friday before)…"), and quick links to record. Two
  arrangements with one person are never netted: the card reads *we owe £1,000.00 · owed to us
  £400.00*, never £600. Edit and Delete stay here (Delete is for an empty mistaken setup only —
  as before, a debt with even voided history keeps it).
- **Set up borrowing or lending** — select the person or create them ("Someone new…"), then say
  whether this is a **recurring** arrangement (£X on day N until a date or for N payments, with
  **Fill the end date**), a **one-off** first payment (amount, the pot it landed in, note), or
  neither yet. The "cash or bank transfer" question stays answered the way you chose: pick the pot
  the money landed in (borrowing into the Cash pot, then an ordinary **Move → Between pots** when
  you deposit it) and say so in the note.
- **The ledger** — every borrowing, repayment, loan and expected payment in date order (oldest
  first, with a **Newest first** toggle): **Date / From-To / Money in / Money out / Balance**. The
  balance is that arrangement's after each row, signed the way your tables already are: **− we owe,
  + owed to us** (a lending shows *£50.00 (owed)*). Expected payments appear as greyed rows at
  their expected dates, badged **expected — not recorded yet**, each with a one-click **Record this
  month's £1,000** that opens the record form already filled in. Recording is the real movement —
  the plan itself never moves a pot.
- **Click an amount to open that row's detail right beneath it**: which pot the money landed in
  ("Came in as cash to Alex's cash."), the note, who recorded it and when, a link to **Show the pot
  around that date**, and **Correct it** and **Void it** side by side. Loan movements could only be
  voided before — correction is new. Voided rows stay in the history, struck through with the
  reason, moving no balance.
- **From/To filter** — group the ledger to one person (the chips carry each person's position);
  the columns then say what the amounts mean for them ("Amt in (borrowed) / Amt repaid", or
  "Amt in (repaid to us) / Amt out (lent)").
- **Record money in or out** — the repay panel, for both directions, one tap away from every row
  and summary line.

**What stayed where it was:** swaps and other money across the boundary remain on Accounts, Pots &
Checkpoints (whose history panel is now **Recent swaps & other money**), beside a small signpost
card carrying the running owed figures and an **Open Borrowing** link. Formal borrowing is not this
page: a loan agreement is a Contract, a credit card is a credit-card pot repaid by transfer — the
page's footer says so.

**Old links keep working.** `/pots#debt-…` bookmarks are forwarded to the same anchor on the new
page; `/pots?external=…` loan links land there with that row open; All Transactions' borrowing rows
(`LN`) open the panel inline on the new page and the expected-support rows (`EXP<`) link **Open the
loan panel** to it. The drawer's page count moved from 16 to 17 with Borrowing in the menu.

Along the way, a repayment confirmation now reads *"…repaid £25.00 — the balance is reduced"* on
money coming back from someone who owes you — it used to say "Borrowed…" whatever the arrangement.

## Existing data and migrations

- **No schema migration, backup-format change or `.env` change.** Borrowing is still exactly what
  it was underneath: external movements of kind `loan` bound to a debt, with every balance derived
  from the movements so it can never drift. Nothing already recorded is rewritten.
- The expectation model is untouched: an expected-support plan moves no money, shows in the
  projections and All Transactions as *expected — never received*, and a real recorded payment is
  what silences it.
- Households upgrading from `v1.20.0` need no migration step. Old bookmarks and links resolve.

## Who should update and what to do

1. Take a household backup in **Settings**, a registry backup in **Admin** (`/admin`), and a copy of
   `/mnt/user/appdata/simple-finance-multi-household/.env`.
2. In Unraid, set the container Repository to
   **`ghcr.io/dougalbob/simple-finance-multi-household:latest`**, or pin
   `ghcr.io/dougalbob/simple-finance-multi-household:v1.21.0`, then run **Force Update**.
3. Keep bridge networking, host port **3009** → container port **3000**, the existing Cloudflare
   route, and `/mnt/user/appdata/simple-finance-multi-household` → `/data` unchanged. Never point
   this container at `/mnt/user/appdata/simple-finance` or the original app's port 3007.
4. Confirm the badge reads **`v1.21.0 · stable`**. Open **Borrowing** in the menu: the summary
   strip should show each arrangement's status; the ledger should run oldest first with the plan's
   greyed rows at the end; clicking an amount should open the detail beneath the row.

## Validation evidence

- The household shaped this one first (2026-10-16): the design and the decisions — one combined
  ledger, expected rows with one-click recording, what moves and what stays, cash as pot plus note —
  are recorded in `docs/BORROWING_PAGE_PLAN.md`, and the as-built record is decision 228 in
  `docs/IMPLEMENTATION_PLAN.md`. They reviewed the Arena preview before merge.
- Local gates: `prettier --check .`, `tsc --noEmit` and `themes:check` are clean. `npm test` passes
  **998/998 across 231 suites** — including 6 new pure tests for the signed running balance, the
  From/To filter's grouping, voided history, expectation projection and silencing, the never-netted
  two-IOU chip, and the panel's phrases — and `next build` is clean with `npm audit --omit=dev`
  reporting **0 vulnerabilities**.
- Browser (Playwright): `e2e/borrowing.spec.ts` adds four journeys — a recurring setup whose plan
  projects as a greyed expected row and records through its prefilled form; a one-off loan out and
  its repayment running the per-person balance under the filter; a ledger row opening beneath
  itself for correction and void; and the pots signpost with both old-link forwards.
  `e2e/debt-lifecycle.spec.ts` moves to the new page and the All Transactions expectation journey
  re-runs end-to-end through it. As at v1.20.0, this sandbox's dev server dies on the
  registry-heavy `admin` flows mid-suite; the affected projects pass on a fresh server and CI's
  browser job (with retries) is the proof for them.
- The required `gates`, `browser` and `docker` checks, main CI and the tagged Publish workflow
  (upgrade smoke against `v1.20.0` and one-digest verification of `v1.21.0`, `latest` and
  `sha-<short>`) gate publication.
