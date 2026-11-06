# Issue #124 — money owed to us (reimbursement claims) — design record

Status: **built and shipped as v1.46.0 (2026-11-05/06).** The authoritative product text is
`docs/SPEC.md` §10.3 and the decisions are 271–273 in `docs/IMPLEMENTATION_PLAN.md`.

## 1. What the household asked for

GitHub issue #124, in general terms: some costs the household pays will be reimbursed by a third
party (an estate settling its affairs, an insurer, an employer, a club). Today the app records the
spend (a purchase) and, later, the money arriving (one-off income), but it cannot connect the two or
show anywhere that a specific amount is **owed back** until it lands. When the third party settles by
paying somebody else — for example the refund going to the person who fronted the money — there is no
honest way to close the loop either.

The ask: a first-class way to track **money owed to us** until it arrives, on the page the household
already reads for informal outside-the-household IOUs.

## 2. Decisions the household made (agreed before building)

| # | Question | Answer |
| --- | --- | --- |
| 1 | How much builds now? | **The full fix** — tracked claims, both settlement routes, direct settlement can clear a named informal IOU. |
| 2 | Does claimed spend still count in Insights? | **Yes.** The household really spent it; the claim sits beside the spend, not instead of it. |
| 3 | Where do claims live? | **The Borrowing page** — one place for "outside the household owes me / I owe". |

## 3. The design

Three additive tables, one derivation, no change to any existing record or to the pot-estimate
invariant:

- **`claims`** — one row per arrangement: `counterparty` (who owes us), `note`, `status`
  (`open`/`closed`, transitions only through the domain), `closed_reason` (`settled`/`cancelled`),
  `voided_*`, `version`. Audited like everything else.
- **`claim_purchases`** — which purchases the claim covers. A purchase may sit on at most one **live**
  (non-voided) claim; voiding a claim releases its purchases. Refund records (negative totals) and
  already-voided records are never claimable. A claim's total is **derived** — the sum of its linked
  non-void purchases — never stored, so it cannot drift.
- **`claim_settlements`** — how a claim was settled, in whole pence, dated, `kind`:
  `pot` (money arrived: an ordinary one-off income record is created **in the same transaction** and
  linked via `receipt_id`) or `direct` (settled outside the household's pots entirely; `receipt_id`
  must be null; `reduces_debt_id` may name an informal IOU to clear by the same amount).
  Settlements carry `voided_*` history like every other record.

Derived figures (the only ones the UI shows):

- `claimedPence` = Σ linked, non-void purchase totals.
- `settledPence` = Σ live settlements.
- `outstandingPence` = claimed − settled. May not go negative via the UI (a settlement larger than
  the outstanding amount is refused; corrections start from voiding a mistaken settlement).
- `status` is recomputed on every write: outstanding ≤ 0 ⇒ `closed` (`settled`); voiding a settlement
  on a settled-closed claim reopens it (`closed_at`/`closed_reason` clear) — nothing is ever
  silently untracked.

**The pot-estimate invariant holds everywhere else:** a claim and its links move no pot, no estimate,
no projection and no insight. Spending stays in Insights untouched; the only visible differences are
the claim cards and rows described here.

**The never-netted IOU rule holds:** a `direct` settlement reduces a named IOU by writing one
settlement row that the debt-balance derivation reads — it never edits, deletes or merges movements,
and it only happens through one explicit, audited user action with the IOU chosen by name. Nothing
nets automatically, and one settlement clears at most one IOU.

### Settlement routes

1. **"Money arrived in a pot"** (`kind: pot`). The household picks the pot, the date (default
   today), the amount (default the outstanding figure) and an optional note; the app creates the
   ordinary one-off income record (`receipts`, source = the claim's counterparty) and the settlement
   link atomically. The claim closes itself when the outstanding figure reaches zero.
2. **"Paid directly — no pot movement"** (`kind: direct`). For the assignment case: the third party
   pays somebody else on the household's behalf (e.g. the person who fronted the money). One action
   records the settlement with a required note, and optionally names one open informal IOU to clear by
   the same amount (default amount = the outstanding figure; may not exceed that IOU's derived
   outstanding balance — the same over-repayment discipline as decision 230). **No pot moves**, and
   the Borrowing ledger shows the settlement as its own signed row ("Claim settled — …"), so the
   running balance the household reads never changes without a row explaining why.

### Voids and corrections

- Void a **settlement**: the claim's outstanding figure is recomputed; a settled-closed claim
  reopens if the settlement voided brings outstanding back above zero. A `pot` settlement's linked
  income record is **kept** — the money really arrived; only the claim link dies. The audit says so.
- Void a **claim**: voids its live settlements (so a mis-tracked claim subtracts nothing from any
  named IOU either) but keeps linked income records; the claim's purchases are released for a future
  claim. Requires a reason.
- No hard deletes anywhere in v1; history is retained exactly as the rest of the app does it.
- Editing is limited to `counterparty` and `note` while the claim is open (version-guarded, audited),
  mirroring the IOU edit discipline.

## 4. Where it appears

- **Borrowing page** (new card, between the people grid and the ledger):
  *Money owed to us — money spent and expected back.* Lists open claims (derived outstanding, note,
  the covered purchases with date/supplier/amount, links to Purchases), a collapsed **Track money
  you expect back** setup flow (counterparty + note + a searchable picker of claimable purchases),
  per-claim **Settle / Edit / Void** disclosures, and a collapsed **Settled** history of recent
  closed claims.
- **Borrowing ledger**: `direct` settlements that name an IOU render as their own signed rows in the
  per-arrangement running balance (a settlement is the only non-movement that moves a debt balance,
  so it gets a row like any other balance-moving fact).
- Nowhere else in v1: no Overview card (the household chose Borrowing only), no projection of an
  expected settlement date (the day the estate settles is unknowable — the card says "still awaited",
  never a guessed date), no bell/attention integration, no changes to All Transactions.

## 5. What it is not

Not debt recovery, not legal advice, not a document store, and never a netting engine. A claim does
not assert the estate *will* settle — it records what the household believes it is owed, and closes
honestly with the actual figure when it arrives. Partial settlements are recorded as they happen;
the claim closes when the running total matches, not before.

## 6. Backup, schema and privacy

Additive: migration `0023_claims.sql` (three tables, one index each, FK checks). Household backups
archive the whole database file and restore applies pending migrations, so claims ride along with no
format change (verified against `src/lib/backup/restore.ts`'s upgrade path). No private data ships in
the repo; fixtures and e2e data are fictional.
