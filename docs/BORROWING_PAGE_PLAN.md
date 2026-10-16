# Issue #60 — the Borrowing page (design record)

Status: **implemented 2026-10-16 — living on the branch, awaiting the household's review on the
Arena preview** (decision 228 in `docs/IMPLEMENTATION_PLAN.md` records it as built).
Designed first at the household's request ("offer any other suggestions before we begin changing any
existing code"), with the added requirement the same day: borrowing gets its **own page in the menu**
so everything borrowing-related lives together. The decisions are recorded in §8 — they drove the
implementation unchanged, with two build refinements: the ledger previews at most six expected rows
per plan (a finite plan still shows every remaining payment), and the setup card offers a third
outcome — "just track the person", decision 167's deletable empty setup.

## 1. What the issue describes

Three kinds of borrowing, and the household is right that the app already knows all three:

| Kind | Example | Where it lives today |
| --- | --- | --- |
| (i) Scheduled informal | "Parents support us £1,000 on the 13th for 5 months" | A debt with an **expected support** plan (SPEC §10.2) — projects as *expected borrowed* money, never income ✓ |
| (ii) One-off informal | "We borrow £50 from a friend and pay him back" (and the mirror: lending to our son) | A debt + loan movements; balance derived, never stored ✓ |
| (iii) Formal | Loan agreement, credit card | Credit-card pots, Contracts & Renewals — not this work |

What is missing is not the domain, it is the **presentation and the flow**:

- A transaction-style **history per arrangement** — `Date · From/To · Amt in · Amt out · Balance` —
  with the running balance as the issue's tables draw it (negative = we owe, positive = owed to us).
- **Click an amount → an in-line section below that row** with the detail (which pot did the money
  land in — cash or a bank transfer — the note, who recorded it and when) and **Edit / Void** for
  that movement, the same for repayments.
- A **From/To filter** so several borrowers/lenders can be grouped by person.
- A **setup card**: select (or create) the person → recurring (£X on day N until D, or N payments
  with "Fill the end date") or one-off (amount, pot, note).
- A **repay panel** to record a repayment to Dave & Maggie, or what our son paid back.

## 2. Why the current layout feels wrong (diagnosis)

On Accounts, Pots & Checkpoints today the flow is split across four boxes on an already long page:

- **Owed & owing** — the debt list, with the recurring plan hidden behind an *Edit* disclosure that
  only appears **after** the person exists (create, then come back and edit);
- **Borrow & repay** — a form whose first control is a dropdown of debts;
- **Recent money across the boundary** — last 20 movements of every kind mixed together, newest
  first, **void only** — a loan movement cannot be corrected at all in the UI
  (`ExternalMovementEditForm` is wired only to swap legs), there is no filter, and no running
  balance;
- and the same page also carries pots, checkpoints, swaps and other money.

Setup, recording and history are three separate boxes that must be used in the wrong order. The
issue's ledger idea fixes exactly this.

**Good news first: this needs no schema change.** Debts, loan movements and expected support
(SPEC §10.2) already carry every field the issue asks for — counterparty, direction, derived
balance, amount/day/until expectation (the *N payments → Fill the end date* helper already exists
in `DebtEditForm`), pot, note, immutable kind/direction/debt-link, void history. The work is a
page, a view and some forms.

## 3. The new Borrowing page (key requirement)

**New route `/borrowing`, nav label "Borrowing"**, added to the *More* group beside Accounts, Pots
& Checkpoints (and to the flat `NAV_ITEMS` list) in `src/components/site-nav.tsx`.

**What moves there** from `/pots`:

- the **Owed & owing** debt list and its Edit/Delete/Track-someone-new forms;
- the **Borrow & repay** form;
- the loan rows of **Recent money across the boundary**.

**What stays on `/pots`:** swaps and other money in & out — money across the boundary that is not
borrowing (decided: loans only). `/pots` keeps a **signpost card**: the running totals ("we owe …",
"owed to us …") and a link to Borrowing, so the overview role is kept without the cards. Old deep
links (`/pots#debt-{id}`, `/pots?external={id}`, the guide's "Owed and Owing on the pots page",
All Transactions' "Open the loan panel") redirect or re-point to `/borrowing` — the same treatment
decision 225 gave `/pots?transfer=` links.

**Page shape:**

1. **Summary strip** — one line per person: *Dave & Maggie — we owe £2,500 · next expected 13 Nov*;
   *our son — owed to us £50 · awaiting first loan*; honest labels kept (decisions 167/168:
   awaiting / settled / overpaid).
2. **Set up borrowing or lending** (the issue's card, one flow): select or create the person →
   *recurring?* shows the plan fields the issue lists (£1,000.00 · on day 13 · until 12/02/2027 ·
   or continuing for 5 payments · **Fill the end date**) → or *one-off* shows person, amount, the
   pot it came out of, note. Creating the person **and** the plan in one go — no more
   create-then-hunt-for-Edit.
3. **The ledger** — the transaction-style history (§4).
4. **Repay panel** — per person: *Record a repayment to Dave & Maggie* / *Record what our son paid
   back*, prefilled person and direction; amount, pot, date, note. (Recording borrowing is the same
   form the other way round — the ledger rows and the expected rows also offer it, see S1/S2.)

## 4. The ledger contract (proposed)

One history, **oldest first** — chronological like a bank statement, as the issue's tables draw it
— with a newest-first toggle:

```
Date        From/To          Amt in     Amt out    Balance
15.08.2026  Dave and Maggie  £1,000                          −£1,000
22.08.2026  Our son                      £75.00               £75 (owed)
15.09.2026  Dave and Maggie  £1,000                          −£2,000
15.10.2026  Dave and Maggie  £1,000                          −£3,000
25.10.2026  Dave and Maggie              £500                 −£2,500
26.10.2026  Our son           £25                            £50 (owed)
```

- **Columns:** `Date` (the money's date — the record timestamp lives in the detail panel) ·
  `From/To` · `Money in` · `Money out` · `Balance`.
- **Meaning of in/out follows the person's arrangement:** for a `we_owe` person, in = borrowed,
  out = repaid; for a `they_owe` person, out = lent, in = repaid to us. Column captions can adapt
  when filtered to one person (`Amt in / Amt repaid` for Dave & Maggie).
- **Balance is per person**, signed: **− we owe, + owed to us** (exactly as the issue's tables
  draw it), with a one-line legend. A person with both directions keeps **two separate IOUs** —
  never netted against each other (two promises, two debts); the filter groups them under the
  person.
- **From/To filter:** `All` plus a chip per person, carrying the running balance; the choice lives
  in the URL (`/borrowing?who=…`) like every other view (`?purchase=`, `?transfer=`, `?show=`).
- **Click the amount → in-line section below that row** (one open at a time): which pot the money
  landed in or left from (that answers "cash or bank transfer" — Cash pot vs bank pot — plus the
  note), the note, who entered it and when. **Correct it** (pot, amount, date, note — the exact
  correction set `ExternalMovementEditForm` already enforces, with `expectedVersion`, refusal of a
  stale form and before-and-after audit like every other correction) and **Void it** side by side
  from `md` up, plus Close. Kind, direction and the debt link stay immutable (SPEC §10.2: a
  repayment does not become borrowing; to fix those, void and re-record). Voided rows stay in the
  ledger struck through with their reason — history keeps.
- **Interaction machinery:** the shared in-place pattern from decisions 225/226
  (`in-place-activity.ts` / `activity-open-row.tsx`) is the house style for "open a record below
  its row" — the ledger should reuse that contract (URL state via `router.replace` +
  `useOptimistic`, never `history.replaceState`; one open at a time) so the app speaks one
  interaction language.

## 5. Suggestions beyond the issue

- **S1 — Expected rows in the ledger.** Show the plan's future occurrences as greyed rows at their
  expected dates, badged *expected — not recorded yet* (they already appear as `EXP<` on All
  Transactions — this keeps the two honest and consistent), with a one-click
  **"Record this month's £1,000"** that opens the Borrow form prefilled. Still a real movement:
  the expectation-silencing rule (a money-in up to two days before an occurrence *is* that month's
  money) already does the matching, and the plan remains a label, never income.
- **S2 — Per-row quick actions.** Every row's detail panel gets *Record another with this person*;
  every summary-strip person gets *Borrow / Lend / Repay* shortcuts prefilled — the repay panel is
  never more than one tap away (the issue's "repay panel").
- **S3 — All Transactions rows open in place.** `LN<` / `LN>` rows open the same detail/correct/void
  panel below their row on All Transactions (shared `activity-open-row` machinery), and their
  existing link ("Open the loan panel") re-points to `/borrowing?who=…`.
- **S4 — Plain words beside the sign.** The ledger shows the signed figure the issue draws; the
  summary strip and balance cells use the app's honest labels in words ("we owe £2,500") wherever
  there is room, so nobody has to decode a minus sign on a phone.
- **S5 — One signpost for the three types.** A short "Not this page" line at the bottom: formal
  borrowing lives in **credit-card pots** and **Contracts & Renewals** — one place that answers
  "which kind of borrowing is this?" (the issue's opening complaint).
- **S6 — Mobile.** The wide table follows the Horizon day-by-day pattern (decision 185): amount
  buttons `nowrap`, the detail panel pinned to the visible width, sticky first column if needed.
- **S7 — Deep links.** `/borrowing?who=dave`, `?debt={id}`, `?external={id}` — shareable and
  anchor-scrolled past the sticky menu (decisions 213/216/222).

## 6. What does not change

- **No schema, migration or backup-format change.** All of it is a page, views and forms over the
  existing tables.
- Domain rules stand (SPEC §10.2): balances derived from movements; expectations feed projections
  and `EXP<` rows only, never income; edits to a plan are forward-looking; settled debts expect
  nothing; a debt with movements is never hard-deleted (decisions 167/168).
- Swaps stay atomic net-zero pairs managed on `/pots`; other money keeps its always-a-note rule.
- Correction discipline for movements is unchanged — the UI is what's missing, not the rules.

## 7. How it would be verified

- Unit: the ledger reshape as a pure function (ordering, per-person running balance and sign,
  voided rows, expected rows); form/action field names pinned like `tests/purchases.test.ts`;
  redirects of old `/pots#debt-…` and `/pots?external=…` links.
- Browser: (a) set up a recurring arrangement end to end and see it in the ledger and projections;
  (b) record a one-off borrow and a repayment; (c) open a row, correct it and void it — the page
  unmoved (the v1.19.0 ≤ 4px guard); (d) From/To filter; (e) the pots-page signpost and old links.
- The existing `debt-lifecycle` journeys move to the new page with their honest-status assertions
  intact.

## 8. Decisions (all answered by the household, 2026-10-16)

**Decided with the household (2026-10-16):**

1. **Ledger organisation** — one combined history with the From/To filter and per-person running
   balance, as the issue's tables draw it.
2. **Expected rows** — yes: the plan's future payments appear as greyed rows at their expected
   dates, badged *expected — not recorded yet*, each with a one-click "Record this month's £1,000"
   that prefills the Borrow form (still a real movement; the expectation-silencing rule matches it
   to the month).
3. **What moves** — loans only. Owed & owing, Borrow & repay and the loan rows of the boundary
   history move to `/borrowing`; swaps and Other money in & out stay on Accounts, Pots &
   Checkpoints, whose "Recent money across the boundary" survives as *swaps and other money*.
4. **"Was it paid in cash or a bank transfer" — pot + note (option A).** The journey is two
   records, both events on their true dates: the **Borrow** into the **Cash** pot on the day it
   was handed over (noted "cash from Dave & Maggie"), then the deposit as the app's ordinary
   **pot-to-pot transfer**, Cash → Main account, on the day it is banked (Quick Entry → Move →
   Between pots). Months later the ledger row reads `13.10 · Dave & Maggie · +£1,000 · into Cash`,
   its detail panel says in plain words "came in as cash to your Cash pot" beside the note, and a
   "Show Cash around 16 Oct →" link (decision 226's pattern) opens All Transactions where the
   deposit sits on its real date — the complete picture with both dates, nothing new stored. The
   explicit "How did it move?" field was considered and declined for now: it adds a label but not
   the banking date, and it would need a database and backup-format change. Polish inside A: the
   detail panel's plain-words pot line, the "Show <pot> around <date> →" link, and a note
   placeholder suggesting "e.g. cash handed over — banked 16th".
