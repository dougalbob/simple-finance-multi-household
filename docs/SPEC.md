# Simple Finance — Product Specification

**Status:** original single-household requirements were agreed 2026-09-20; the multi-household direction and decisions below were approved 2026-10-10. This is the authoritative product spec for the independent multi-household edition. Implementation is in progress: the system registry, identity pre-assignment and first-login denial (§3, §19) are built; per-household storage and routing (§18), tenant-scoped backup/restore and support-consent sessions are not yet.
**Companion documents:** [`docs/MULTI_HOUSEHOLD_PLAN.md`](MULTI_HOUSEHOLD_PLAN.md) (active isolation, storage and release contract), `docs/HANDOFF.md` (session continuation point), and `docs/IMPLEMENTATION_PLAN.md` (phases and dated decisions). `AGENT_APP_BLUEPRINT.md` is historical and its original product-specific defaults are superseded here.

> **Privacy notice — applies to this entire repository.**
> Every name, person, amount, date, account and threshold in this document is a **fictional placeholder**.
> Real households' names, balances, income figures, overdraft limits and warning thresholds exist only in the
> private installation's runtime configuration and that household's database, which `.gitignore` keeps out of version control.
> No real personal financial data may ever appear in commits, PRs, issues, screenshots, logs, fixtures, seed
> files, demo data or release artefacts. Demo/seed data lives in tracked source paths and is fictional by rule.

---

## 1. Product purpose

Simple Finance Multi-household is a private finance application for multiple independent households. Each
household contains **one or two people** and needs to watch money carefully to avoid overdraft charges. It answers
four questions separately for each household:

1. What have we spent, and on what?
2. What money do we have available now?
3. Which regular payments still need to come out?
4. How are we doing this month, and when do we need to be careful?

It is **not** a wealth-management, investment, budgeting-enforcement or bank-reconciliation product. The users
record everyday purchases (shops/POS, online, cash) alongside direct debits and standing orders, and
periodically tell the app **"this is how much we have at this moment"** (a *balance checkpoint*). The app never
connects to a bank and never asks for bank credentials.

**Honesty rule:** the app never presents a misleadingly reassuring figure. Money the user reported and money the
app calculated are always visually and verbally distinct. There is no "safe to spend" promise — only
*"available now (our estimate from your checkpoints)"* and *"projected low before payday (projection)"*, each
with its inputs inspectable.

## 2. Scope and non-goals

### In scope (v1)

- Each household configures its own money pots and user-reported balance checkpoints. The original two-person
  example uses joint bank accounts and personal cash pots; those labels and counts are household data, not global
  defaults imposed on every household.
- Fast mobile purchase entry with splits, supplier memory, category tree, attribution defaults and overrides.
- Recurring payment schedules (direct debits, standing orders) and expected income (salary) that
  auto-convert to actual records on their due dates, plus **one-off income** recorded by hand — a
  sale paid in cash or by bank transfer, a third-party refund, a gift (§11.3).
- Transfers between pots as a first-class record type that never inflates spending, plus
  informal debts and money across the household boundary — borrowing and repayments, swaps
  with someone outside the household, and anything else with a note — that moves estimates
  honestly without ever counting as spending or income (§10).
- Household estimate, payday-to-payday projection, and a two-tier warning system anchored on an authorised
  overdraft facility.
- Insights: month comparisons, personal-vs-personal spending, per-vehicle running costs, projection feedback.
- Dense desktop overview plus dedicated menu pages; mobile focused on quick entry.
- Supplier contact cards (phone, email, website, label→value reference pairs such as policy numbers) and a
  per-supplier interaction log for calls/emails (§21).
- A tracked **Contracts & Renewals** register for insurance policies, service agreements and other review
  dates, with independent renewal/switch reminders and optional links to recurring schedules (§22).
- **Receipt/invoice attachments** on purchases: .png/.jpg/.pdf uploads from desktop, camera capture on
  mobile, retroactive attachment (§23).
- One fixed Unraid data root — `/mnt/user/appdata/simple-finance-multi-household` — with a small system
  registry and a separate directory, SQLite database and `documents/` folder for each household (§18). Each
  household's encrypted backup contains only its own finance database and attachments.
- Encrypted per-household backup/restore, Cloudflare Access auth and isolated Unraid deployment — per §§18–19 and `docs/MULTI_HOUSEHOLD_PLAN.md`.

### Explicit non-goals (v1)

- Bank integration of any kind: no statement import, no line-by-line reconciliation, no open banking, no
  bank credentials ever requested.
- Credit cards (the household does not use them; the pot model could accommodate them later, but no
  card-specific behaviour is built).
- Investments, asset tracking, vehicle **valuation**, trip/business mileage logs, maintenance reminders.
  (Vehicles are tracked as **running-cost targets**; since v0.10.0 a fuel purchase may also carry litres
  and an odometer reading so the app can show mpg — §13, §16.6 — and nothing more.)
- Offline operation or offline caching of financial data (see §14).
- Notifications, reminders, emails (see §14; deferred, not forgotten).
- Drag-and-drop calendar scheduling; the calendar is a read-only view (§13).
- Fractional/percentage splits of one allocation between the two people (§9.4).
- Multi-currency, public sign-up, or ordinary member sharing between separate households. Multi-household
  operation and tenant isolation are in scope (§3, §18–§19); support viewing another household is a narrow,
  explicit-consent exception, not general sharing.
- Formal lending: interest, repayment schedules and credit agreements. Debts are informal
  IOUs only — who, which way round, and what is still owed.
- A privacy wall between members of the same household: members share that household's records. Strong
  application-level isolation between different households is mandatory (§3, §19).

## 3. People, personas and privacy

- Each household has **one or two members**. One-person households are valid and complete; no household may
  have more than two people or more than two assigned sign-in identities.
  *As built (2026-10-10):* the system registry (`<dataDir>/system/registry.sqlite`, `src/lib/registry`)
  enforces one-or-two assigned identities per household, one household per identity, and the pre-assignment
  rule; the administrator surface is `/admin`. The `people`-to-verified-identity link inside each household
  database is not yet wired to the registry assignment.
- Cloudflare Access + Google sign-in is the outer identity gate; the app independently verifies the Access JWT.
  The administrator pre-creates the household and assigns each allowed email to exactly one household before
  first login. There is no self-sign-up. A verified but unassigned identity is denied by the app. The Cloudflare
  email policy and the app's household assignment are separate checks (§19).
- All members of one household have mutual visibility and editing of that household's records, including one
  another's personal purchases. There is no default administrator access to another household's financial data.
  A member may grant and revoke an explicit, visible, time-limited support session; it is read-only by default,
  audited, and expires or stops immediately when revoked. The product owner and households accept that the
  Unraid host administrator can inspect files outside the app.
- Every record carries an audit trail: who created it, who changed it, what changed, when. Corrections are
  edits or voids with retained history — never silent deletion (blueprint §3).
- In this document and all demo data, the fictional personas are **Alex** and **Sam**. Real identities are
  configured only in the private installation; they must never appear in tracked source or tests.

## 4. Pots (tracked money containers)

A fictional two-person example household's shape (names are user-configurable labels; actual households configure their own pots):

| Pot | Type | Role |
|---|---|---|
| Main account | Bank (joint) | The "busy" account: **everything out** — all direct debits, standing orders, POS and online purchases. Has an authorised overdraft facility. Checkpointed by the users roughly every 4–5 days. |
| Salary account | Bank (joint) | Receives Sam's monthly salary. Source of manual transfers into the Main account. |
| Alex's cash | Cash | Personal cash — one pot each, so a handover is a visible transfer. |
| Sam's cash | Cash | Personal cash — one pot each, so a handover is a visible transfer. |

Rules:

- Every pot has independent checkpoints and an independent estimate (§6–§7).
- **Overdraft configuration is per bank pot.** In this household only the Main account has an authorised overdraft
  (a configurable limit figure, used for context/display) and a configurable **warning threshold** (§8).
- A household may add one or more **credit-card pots**. Their signed balance represents money owed (normally
  negative); limit and near-limit threshold are card-usage context, never overdraft context. Card terms and
  statement details are private per-pot settings (§24).
- Cash pots are checkpointed whenever the users count them ("as-needed"); the UI shows each pot's
  *last updated* age so staleness is always visible, never hidden.
- **A cash pot belongs to a person (v0.28.0, decision 178).** An optional Owner — the same explicit
  link a vehicle has — is set when the pot is added or edited; the link is never guessed from a
  label (§15.1's v0.9.0 rule). It does one job: the till's **Checkpoint cash** card
  (§15.1) opens the signed-in person's own cash pot without a picker. A pot with no owner is
  shared. Cash pots carry **no overdraft and no warning threshold** — those datapoints describe a
  bank facility or a credit line, not counted notes — so their cards leave the fields out and the
  domain layer keeps the values null.
- Transfers between pots (§10) are expected and routine (Salary → Main "as we need to"). The app **never**
  assumes a transfer happens; transfers are only real when the user records them.

## 5. Balance checkpoints

A checkpoint is the user saying: *"this is how much is in this pot at this moment."*

- The figure entered is the bank's **current/ledger balance** — the number that does **not** have pending items
  deducted. (Agreed decision; consequences in §7.4.) For cash pots it is the counted amount.
- Effective instant defaults to *now*. An optional **effective date** (date-only, today or earlier) supports
  delayed entry — e.g. you checked the bank last night and are entering it this morning. A date-only checkpoint
  takes effect at the **end of that local date** (Europe/London).
- Checkpoints are immutable history: entering a new one never edits or deletes an old one, and never deletes
  any spending record.
- **Pending-at-checkpoint rule (agreed decision, chosen twice with the trade-off explained):** purchases dated
  before a checkpoint's effective instant are **assumed to be included** in the reported balance ("assume
  cleared"). No pending-marking admin, no automatic safe window. Documented limitation in §7.4.

## 6. Record types

| Type | Sign | Counts as spending? | Notes |
|---|---|---|---|
| Purchase | positive | Yes | One or more allocation lines (§9). |
| Refund | negative | Yes (nets off) | Own record, optionally linked to the original purchase; same category/target as what it refunds. |
| Transfer | n/a | **No** | Pot-to-pot movement; two-sided; excluded from all spending insights (§10). |
| External movement | in / out | **No** | Money across the household boundary (borrowing/repayment, swap leg, other); moves estimates, never spending or income (§10.2). |
| Debt | n/a | No | Informal IOU (who, which way round); its balance derives from linked loan movements (§10.2). |
| Expected receipt (income) | positive | No (income) | Generated by income schedules (§11) or recorded by hand (§11.3). Carries an optional free-text **source** (what or who it came from); no category, no target. |
| Checkpoint | n/a | No | User-reported balance (§5). |

All money is stored as **integer pence**. No binary floating-point arithmetic on money, ever (blueprint §3).
Pro-rata projections round once, at the period level, half-up to the nearest penny (§7.3).

## 7. Estimates and the payday projection

Two distinct, clearly-labelled numbers. Neither is ever called a bank balance. v0.5.0 adds a third,
clearly-labelled view — the **horizon** (§7.6) — built from the same two ingredients.

### 7.1 Available now (estimate), per pot

For pot P with latest checkpoint C (amount, effective instant t):

```
estimate(P) = C.amount
            − Σ signed spending on P whose effective instant is after t
            − Σ transfers out of P after t
            + Σ transfers into P after t
            + Σ external money in to P after t
            − Σ external money out of P after t
```

*Signed spending*: purchases add, refunds subtract (so a refund increases the estimate).
Schedule-generated records are ordinary spending records and appear here once converted (§11).
External movements move the estimate like receipts (in) and spending (out) — the household
total genuinely moves, because the money really entered or left (unlike an internal transfer).

**household_available_now = Σ estimate(P) over all pots.** This is the headline net household figure; a
credit-card liability is negative and reduces it. Because it sums pots, internal transfers can never distort it.

**liquid_available_now = Σ estimate(P) over checkpointed bank and cash pots.** This separate figure is the
starting point for payday and Horizon liquidity projections. Card balances remain in the household net total,
but are not cash available to pay bills. A card-only checkpoint cannot start a liquidity projection.

Comparison precision: where both a record and a checkpoint carry times of day, compare by timestamp (mobile
entry auto-timestamps). Where a record is date-only and shares the checkpoint's date, the date alone does
not say which happened first (amended v0.2.1; entry order added 2026-09-26, decision 165):

- a date-only *debit* (money out of the pot) counts as *after*: a missed same-day debit only dips the
  estimate low, and it self-corrects at the next (later-dated) checkpoint;
- a date-only *credit* (money into the pot — a receipt, transfer-in, refund, external money in, or the
  in-leg of a swap) is decided by **when it was written down**:
  - recorded *before* the checkpoint: *absorbed*. The count was taken after the movement was recorded, so
    the reported figure already includes it. Counting it again is the v0.2.0 field report — the "£180"
    bug (E13) — and no later same-day checkpoint could self-correct while every same-day credit counted
    as after;
  - recorded *after* the checkpoint: *counted*. A movement that did not exist when the figure was reported
    cannot already be inside it. This is the bank-transfer case: Natwest checkpointed at −£443.65, then
    £1,500 moved in from Nationwide the same day, reads **£1,056.35**, not the checkpoint. The v0.2.1
    blanket absorb left that inbound leg out until the next checkpoint, while the outbound leg still
    counted;
  - entry time unknown: absorbed, the safe direction.

A transfer or swap recorded after both pots' checkpoints moves both estimates, so
`household_available_now` stays net zero. A swap recorded *before* a same-day checkpoint can still leave
the total one leg low (the out-leg counts, the in-leg is absorbed) until the next checkpoint. If a count
already includes money that has not been recorded yet, record that credit before the checkpoint, or
checkpoint again afterwards — a credit written down later is treated as new money.

### 7.2 Projected low before payday (projection)

The planning cycle is **payday-to-payday**: from Sam's salary date to the next one (configured day-of-month;
fictional example: the 26th). Insights additionally report by **calendar month** — both are views over the
same date-stamped records.

```
days = payday − today   (whole days, local date arithmetic)
the payday liquidity projection starts from liquid_available_now (bank and cash pots only) and applies,
day by day until pa       (income schedules not yet converted, and a debt's expected support, §10.2)
  − expected commitments due that day     (DD/SO schedule instances not yet converted)
  − projected day-to-day events due that day (see 7.3)
projected_low = the minimum running value within the window
```

Only bank and cash pots are liquid projection inputs: card balances and scheduled card-pot movements are
excluded even though purchases charged to a card remain ledger spending. The separate household headline
remains net of card debt (§24).

**Salary anchors the window (decision 166).** Use the next scheduled salary receipt date,
with the existing weekend shift, never the next debt expectation. No new setting: the household's
£1,000 monthly parental support is tracked as borrowing. Support remains inside the longer window,
flagged as borrowed and expected, never payday or received income. Horizon's default is unchanged.

**Weekly pace:** when the low is positive, divide that low by the weeks from today to its
**earliest** low date; floor to whole pounds, never round up. The low already subtracts planned
shop and fuel, so the pace is explicitly **on top of the planned shop and fuel**. Spending it all
would touch zero at the lowest point, not preserve a cushion. Protect zero, not the overdraft.
For a negative low state the shortfall and no allowance; for zero state no allowance; when the low
is today do not invent a weekly number. All three surfaces share the same calculation and wording.
Phone home and Overview call `household_available_now` **Household total now** (net of card debt), with
card debt shown separately as context. The payday and Horizon projections label their starting point
**Liquid funds now** and exclude credit-card pots. Decision 165's estimate arithmetic is unchanged.

**Main salary payday is the one day projected day-to-day is excluded (v0.37.0 follow-up, decision 187).**
For every read model, the engine removes all projected grocery and fuel events dated on an actual occurrence
of the main salary receipt — after any weekend shift — before it computes day-to-day totals, the low or the
per-day figures. An event on another receipt date still counts. Payday projection, Quick Entry/Till's cycle,
the phone-home summary, Overview and Horizon use the same corrected result; Horizon excludes every occurrence
of the selected main salary schedule inside its chosen window. This is an exclusion from the forecast only:
other dated events and all commitments still apply normally.

**The phone home shows a summary, not the panel (decisions 186–187; v0.37.0 follow-up).** Its card states the next pay
day, the household low, at most one transfer nudge (§7.5), and a link to Horizon. The balance in the low
sentence is `liquid_available_now` — **bank and cash pots only**, never the card-debt net total, because that
is the figure the low is derived from. The card has no overdraft-fees sentence. The transfer nudge names the
pot with the greatest **bills-only** shortfall; when projected day-to-day spending is positive it may add a
separate, qualified guide that assumes this spending also comes from that named pot, explicitly **not a strict
pot allocation** (§7.5). The Horizon link carries the day before payday (`/horizon?through=…`). The day-by-day
table, dated shops/fills, expected-support list, weekly pace and detail blocks live on Horizon — the phone home
does not repeat them (decision 164's "doors, not mini copies").

**Overview keeps the figures, not the expandable forecast (v0.37.0 follow-up, decision 187).** The panel
retains its tier message, payday and liquid-funds figures, projected day-to-day totals, commitments, receipts
and the same worst-pot transfer nudge. It no longer has expandable forecast sections or a day-by-day table;
its Horizon link opens on the day before payday. Horizon owns the dated detail. Quick Entry/Till remains beside
the projection on `/overview`.

`projected_low` normally occurs just before salary lands. The projection **includes** expected income; it is
not a spending-only forecast.

**A shifted expectation belongs to the window it lands in (v0.7.0).** A debt's expected support counts while
**either** its configured day-of-month **or** the Friday it shifts to (§11.3, decision 7) falls inside the
window — so a payment configured for Saturday the 10th dates Friday the 9th and counts in the window that
ends on Friday the 9th, rather than vanishing because its configured day sat one day outside. Nothing else
about the cadence changes: the crossing date shown is the shifted one, and the recorded Borrow is still
recorded on whichever day it actually lands.

### 7.3 Projected day-to-day spending as episodic events (anchor-reset) — v0.6.0

The household's day-to-day spending is highly predictable in **amount** (weekly food shop varies by roughly
±£20; per-vehicle fuel is predictable monthly) but it is **episodic in timing**: the weekly shop happens on one
day and not again until the next, and a £55 fill resets the car's fuel clock for the month. So the projection
uses **user-configured figures**, set privately in Settings, as the **amount of a repeating projected event**,
and derives each next event's **date from the ledger** (the "anchor-reset" rule, decisions 118–119):

- `weekly_groceries` → the **weekly shop**: one projected event every **7 days**, amount = the configured
  figure. Anchor: the most recent non-voided purchase with a positive allocation to `Groceries > Weekly Shop`.
  Top-up shops deliberately do **not** reset the week — they are spending *between* shops, and the tree keeps
  a separate category for them. The shop's recorded amount does not matter; if it happened, it counts.
- `monthly_fuel[vehicle]` → that vehicle's **fill**: one projected event every **30 days**, amount = the
  configured figure. Anchor: the most recent non-voided purchase with a positive `Vehicle Running > Fuel`
  allocation **targeted at that vehicle**. Fuel anchors are per car: filling one never resets the other.

The next event after an anchor is `anchor + cadence`; it repeats at the cadence while inside the window.
**No history, or overdue** (anchor + cadence already in the past — e.g. no shop recorded for 10 days): the
next event is projected **tomorrow**, then the cadence resumes. The projection may understate, never
overstate — an unknown shop is nearer than a known one. No weekend shifting: shops and fills happen on any
day. A voided purchase is no anchor; a refunded one neither (only positive allocations count).

An actual event therefore **suppresses projected spending for its cooldown window** and is never counted
twice: the £55 fill is inside the estimate the moment it is recorded, and the next projected fill for that
car is a month away — the window between carries no fuel projection at all. (The pre-v0.6.0 model smoothed
the figures pro-rata over the window and charged them up front; the recorded fill was then double-counted —
once in the estimate, once in the smoothed allowance — for the whole cadence window, and every lowest point
carried today's date.)

The events join the projection engine as ordinary expected outgoings with due dates (§7.2): within a day they
apply before receipts, like commitments, except that all projected day-to-day events on the main salary date
are omitted. Other receipt dates do not suppress them. Two consequences the household can see: the **lowest
point's date is meaningful with day-to-day included** (it lands on a shop day, a fill day, or a commitment day
— not always "today"), and Horizon lists the dated events it counts. The home summary and Overview retain the
corrected day-to-day totals without repeating the dated list. Events are household-level: pot scoping on the
horizon does not filter them, and the §7.5 pot watch still excludes them.

**Honesty loop:** Insights show recent actuals (e.g. last 4–8 weeks of Groceries and per-vehicle Fuel) against
these configured figures, so drift is visible and the config can be corrected. The projection panel lists
exactly which events it is counting and when — nothing invisible.

### 7.4 Documented limitation of "assume cleared" (accepted by the users)

A purchase made shortly **before** a checkpoint may still be pending at the bank and therefore *not* included
in the reported ledger balance — but the app assumes it is included and does not subtract it. The estimate can
therefore **overstate** available money by whatever was pending at checkpoint time (typically small, typically
1–3 days of card purchases), until the next checkpoint resets everything. The users chose this deliberately
(over an automatic safe window or tap-at-checkpoint marking) to keep admin at zero. The UI does not hide the
mechanism: the projection panel shows the last checkpoint time per pot, so staleness is visible. **The app
never claims precision it does not have.**

### 7.5 Pot-level "plan a transfer" watch (distinct from household warnings)

The bank-and-cash liquidity projection can look healthy while the Main account alone cannot cover the
commitments due from it — because the money is sitting in the Salary account and transfers are manual.
So, separately:

```
pot_watch(P) = estimate(P) − Σ expected commitments due from P between now and payday
```

Only bank and cash pots can enter this watch. A credit-card balance and commitments charged to a card are
excluded: card debt cannot trigger a bank-pot **"plan a transfer"** warning. If one or more pots have a
shortfall, the home card and Overview show **only the pot with the greatest bills-only shortfall** in a
distinct, non-alarming notice (v0.37.0 follow-up, decision 187). It names that pot, the shortfall, the earliest
due date with the bills due that day, and how soon the money should move (fictional example: *"Natwest has the
worst bills-only shortfall: £850.00 (upcoming Direct Debits next due 21st October — Council tax, Mortgage and
Water Bill). Aim to transfer at least £850.00 into Natwest by 16th October."*). The bills' **kind** is read from
the schedules themselves — "Direct Debits", "standing orders", or both — never assumed. The deadline is the
earliest due date **minus five days** (`TRANSFER_LEAD_DAYS`), so the money lands before the debit is taken; once
that day has arrived the sentence says "as soon as you can" rather than naming a date in the past. Long lists
name three bills and count the rest. When the projection contains day-to-day spending, the notice may add a
separate **guide**: bills-only shortfall plus the projected day-to-day total, **assuming that spending also
comes from the named pot**. It says this is a guide, not a strict pot allocation; it never changes the
bills-only shortfall or transfer deadline. The pot-level watch itself deliberately excludes day-to-day
projection (groceries/fuel vary by pot and payment method and would muddy a transfer-planning signal).

### 7.6 Horizon (how far the money would go) — v0.5.0

The payday projection answers "will we reach payday without dipping below zero?" The **horizon** answers a
different question: **"if we only paid what is already expected, where would we land on date D — and how low
would we go on the way?"** It is the same arithmetic as §7.2 with the window freed from the payday: the user
picks any date up to 400 days ahead, and the engine runs to that date instead of to the next salary. The
field **opens on the day before the next scheduled income** (v0.13.0, decision 150), so the out-of-the-box view
answers *"where would we land the day before the salary lands?"*.

```days = throughDate − today             (whole days, local date arithmetic, today < throughDate ≤ today + 400)
where_we'd_land = liquid_available_now (selected bank and cash pots)
                  + Σ expected receipts due in (today, throughDate]   (only receipts landing in selected liquid pots)
                  − Σ expected commitments due in (today, throughDate] (DD/SO instances)
                  − projected day-to-day events due in (today, throughDate]   (§7.3; toggleable, on by default)
```

- **Headline:** "Free to spend up to {throughDate}" — `where_we'd_land` — with the context line "Where we'd
  land on {throughDate}". With day-to-day excluded the page relabels itself "Free to spend on **bills** up
  to {throughDate}" so the figure is never mistaken for the full answer.
- **The lowest point always shows**, with its date and the §8 tier, whatever the window: a long window can
  look healthy at both ends and still dip hard in the middle (the DDs leave on the 1st), and the projection
  must say so rather than hide it in the headline. With day-to-day included the low lands on dated shop/fill
  events too (v0.6.0, §7.3), so the date stays meaningful — before the anchor-reset model every lowest point
  with day-to-day on read "today", the up-front lump's artifact.
- **Debt expected inflow joins this window** (and §7.2's) as expected money, flagged `expected` in the lists —
  a labelled expectation, never received income (§10.2). It lands on the debt's day-of-month, clamped like a
  schedule (OQ1) and moved off a weekend onto the previous Friday like income (§11.3, decision 7), and it
  counts in the window when either the configured day or the shifted date falls inside it (v0.7.0). From
  v0.7.0 the expectation also has a **start and an end**: occurrences project strictly after today and through
  the optional **until date** inclusive, and only for months the expectation has actually been planned for —
  a day-of-month or until-date edit is forward-looking (§10.2). A debt that has been **settled** — movements
  recorded and the balance brought to zero or below — expects nothing, while a debt with no movements yet is
  *not* settled and projects from the day the plan was set (fixing the v0.5.0 gap where a brand-new debt, £0
  and no movements, projected nothing at all).
- **The default date (v0.13.0, decision 150).** With no `?through=` (whatever else is in the URL), the date is
  **the day before the next scheduled income** — the earliest upcoming instance of a *receipt schedule* into
  a bank or cash pot, already moved off a weekend (§11.3). A card-pot receipt cannot anchor a liquidity payday.
  Only scheduled income counts: a debt's expected support is borrowed
  money, never income (§10.2), so it never sets the default, even when it lands first. The payday window (§7.2) and till (§7.7) now share this salary anchor, while still including support within their windows. The default is
  clamped into the selectable window: income **tomorrow** ⇒ tomorrow (the income day itself, so that window
  includes the salary — preferred to jumping to five weeks); income **beyond 400 days** ⇒ today + 400. With
  **no scheduled income at all** the long-standing default stands: five weeks ahead (today + 35). An explicit
  `?through=` that is valid and in range is always used as named. An annual-only income makes the default a
  long window, so the detail blocks start collapsed (> 60 days) — honest, if heavier.
- **Form order and applying (v0.13.0, decision 150).** The form reads top to bottom: **pots → Day-to-day →
  "Look ahead to" date → "Look ahead" button**. Changing the **date** applies the look-ahead itself (the form
  submits on the date's `change`), carrying the pots and Day-to-day chosen above it. Pots and Day-to-day do
  **not** apply on their own — the button is their explicit control, and the whole path without JavaScript.
  Clearing the date, or an invalid/out-of-range date, never submits (HTML validation still applies).
- **Every bank and cash pot is selected by default**; credit-card pots are not selectable in a liquidity
  projection. The household may untick liquid pots to scope the projection. A debt's expected inflow counts
  only while it lands in a selected bank or cash pot.
- **Search-params persistence:** the through date, pot selection and day-to-day toggle ride in the URL
  (`?through=…&pots=…&daytoday=…`), so a look-ahead can be shared and survives a refresh. The chosen date is
  clamped to the window on load, exactly as the transaction window clamps its dates. An empty pot selection
  means *every* pot, so unticking every pot and applying counts every pot again (the page says sod applying counts every pot again (the page says so under the
  checkboxes).
- **Detail blocks** (commitments, expected money in with the `expected` flag, day-by-day table) stay
  `<details open>` for windows of 60 days or less and start collapsed beyond that, so the honest inputs are
  one tap away without the page turning into a spreadsheet.
- The honesty line carries over from §7.4: it is a projection of the records already in the app, never a bank
  forecast, and *expected support is an expectation of borrowed money — it is owed, never income, and it lands
  only if it is actually borrowed and recorded.*

### 7.7 Lowest before pay day (the till figure) — v0.22.0

The till and Overview use **the identical projected low and earliest low date from §7.2's engine**,
not a separate spending-only subtraction. The window ends on the next salary receipt schedule,
never on a debt's expected support. Borrowed support inside that window remains included and flagged
as expected, never received income. The salary itself is not counted as money you can spend: the
engine applies outgoings before receipts, including on salary day.

Quick Entry/Till shows the same low and pace on `/` and `/overview`; its heading includes the scheduled
payday as an ordinal day and abbreviated month (for example, “Lowest before 26th Oct pay day”). Positive
and zero-low guidance is unchanged. For a negative low, the pace text states the shortfall and that no
discretionary spending is available (for example, *"Projected shortfall: -£413.57 before payday. No
discretionary spending is available at this time."*). That negative-low presentation omits “No weekly
allowance”, the salary-not-counted sentence, and the projected-liquid-funds disclaimer. No salary schedule
or no checkpoint means no figure, not zero. The home payday card states the low without the weekly pace;
Overview retains the projection figures and tier message (§7.2).

Per-pot bills-only signals remain `estimate(P) − commitments from P`, in the same salary window. They
exclude household shops/fuel and receipts: these are transfer-planning signals, not the household spending
allowance. Quick Entry labels its selected-pot signal **Bills-only shortfall** and shows that pot's last
checkpoint labelled **Last checkpoint**, with its age and the existing local date/time format. For a
checkpointed bank pot, it also shows **current account balance** from the latest ledger running balance on
All Transactions (the checkpoint plus recorded movements after it), not by repeating the checkpoint amount.
When projected day-to-day spending is positive, it adds a separate qualified guide to the selected-pot
shortfall (for example: *"If projected day-to-day spending also comes from Natwest, the guide shortfall is
about £1,458.57."*). The guide adds the projected day-to-day total to the bills-only shortfall, assumes that
spending comes from the named pot, and is not a strict pot allocation; it does not change the bills-only
figure. The checkpoint stays the reported figure, never edited. Cash pots show no balance.


## 8. Warnings (two tiers)

Evaluated against the projected low of bank-and-cash liquid funds (§7.2), household-wide. Credit-card debt
and card near-limit thresholds do not participate:

| Tier | Condition | Presentation |
|---|---|---|
| Heads-up | `projected_low < £0` | Calm, distinct colour **and** label: "Projected to dip below zero before payday." |
| Warning | `projected_low ≤ −warning_threshold` | Stronger (still calm) colour and label: "Projected to be more than £W overdrawn before payday." |

- `warning_threshold` is selected from configured **bank-pot** overdraft warning thresholds only; credit-card
  near-limit thresholds are shown on their card pot but never enter household overdraft warnings. No card
  balance can cause the app to say a bank account is overdrawn.
- The authorised bank overdraft limit is stored for context and shown alongside warnings so the distance to the
  limit is visible; crossing £0 is tier 1, the configured threshold is tier 2. No third tier in v1.
- Colours are never the only signal (blueprint §5 accessibility rule).

## 9. Purchases, splits and attribution

### 9.1 The purchase record

Fields: supplier (optional free text if unknown), **total amount** (integer pence), pot, date (defaults today;
backdatable) + auto timestamp, **paid_by** (defaults to the signed-in user; overridable), **entered_by**
(audit), one-or-more allocation lines, optional note.

Three distinct concepts are **never conflated** (handoff rule):

- **entered_by** — who typed the record (audit only).
- **paid_by** — who paid at the till / whose card or cash it was.
- **for_whom (target)** — on each allocation line: `household`, a `person`, or a `vehicle`.

### 9.2 Category and target defaults — visible, one-tap, never hidden

- The supplier's **most-used category** is preselected as a visible chip; one tap changes it. Supplier never
  forces a category: Tesco may preselect Groceries while Fuel, Household Goods or Personal/Clothing are one
  tap away.
- Target defaults: shared-type categories (Groceries, Utilities, Housing, Entertainment & Eating Out…) →
  `household`; personal-type categories (Personal/*) → the **payer**; Fuel and Vehicle Running → the **payer's
  own vehicle**. Every default renders as a small chip ("for: household ▾", "for: Vehicle A ▾", "paid by: me ▾")
  that opens the override — including assigning a personal purchase **to the other person** (Alex buying
  clothes for Sam lands as Sam's personal spending, one tap, no interrogation).
- Defaults are rules the users can see and correct; the app never guesses silently.

### 9.3 Splits

A payment can split into multiple allocation lines, each with its own amount, category (child) and target.
Fictional example — one Tesco payment of £63.47:

| Line | Amount | Category | Target |
|---|---|---|---|
| 1 | £41.98 | Groceries / Weekly Shop | household |
| 2 | £21.49 | Personal / Clothing & Shoes | Sam *(override from default Alex — bought for Sam)* |

- **Lines must total the payment exactly.** The save control stays disabled until they match; a one-tap
  *"assign remaining £X to…"* helper makes matching effortless. Amounts are whole pence, so "exactly" is
  always achievable — no rounding residue, no unallocated bucket.
- No draft/incomplete split records: a purchase is complete or it doesn't exist. Mid-entry abandonment loses
  nothing that was saved; the on-screen form survives brief connectivity loss (§14).
- Every allocation line has exactly **one** target.

### 9.4 No fractional sharing between the two people (agreed)

Couple activities — dining out, cinema, family holidays — are simply **household** allocations. There is no
"split evenly between us" line type, no percentages, no stored fractional ownership. If a genuinely
half-and-half personal case ever arises, the users record two explicit lines. This keeps every record
refundable, editable and analysable without fraction arithmetic. (The users reviewed the cinema-ticket
scenario and confirmed household-level granularity is all they need.)

### 9.5 Refunds and corrections

- A **refund** is its own negative record in the same category/target as the original, optionally linked to it
  (partial refunds are just a smaller negative amount). Refunds net off in insights and increase the pot
  estimate (§7.1).
- A **mistake** is corrected by edit (audit-logged) or **void** (retained, marked void, excluded from totals).
  Nothing is silently deleted. A purchase record is never deleted. Removing a receipt (§23.4) is a
  deliberate, audited removal of that file — not a silent deletion of the purchase, and not an undelete.
- A **duplicate** (e.g. both users recorded the same purchase) is resolved by voiding one copy — see §9.6.
- **Corrected where it is read (decision 226, GitHub issue #57).** A purchase record — one recorded by
  hand (`PUR`) or converted from a schedule (`DD` / `SO`) — can be corrected or voided **in place** on All
  Transactions (§15.3), beneath its own row, using the Purchases page's own forms, version guard and
  audit. A **refund** is not corrected there: its form belongs beside the original it was refunded
  against, so its row keeps its link to Purchases.

### 9.6 Duplicate-entry protection (light-touch)

If a user saves a record with the same pot, supplier (or category) and amount as one saved by either user
within the last ~2 hours, a **non-blocking** notice appears: "Sam recorded a matching entry 20 minutes ago —
is this a duplicate?" with a one-tap link to review/void. It never blocks a legitimate second purchase
(two identical coffees are legal); it just makes the common accident visible immediately rather than at
month end.

## 10. Transfers and money across the household boundary

### 10.1 Transfers between the household's own pots

- Dedicated record type: from-pot, to-pot, amount, date/time, entered_by. Not spending, not income; excluded
  from every spending insight and from `projected_low`'s day-to-day figures; included in per-pot estimates
  (§7.1) so moving money can never look like losing or gaining money.
- The app never auto-creates transfers. Salary lands in the Salary account; moving it to Main is the users'
  decision, recorded when they do it (§7.5 nudges them when it matters).
- Cash between the two people is a transfer too: with one cash pot each (§4), John handing Janet £200 is
  recorded as John's cash → Janet's cash with a note — never an unexplained move absorbed by the next
  checkpoint.
- **Correction discipline (v1.14.0, decision 218).** A saved transfer is a money record like any other, so
  it is **corrected where it is reviewed**: the two pots, the amount, the date and the note are editable in
  place — since decision 225 (GitHub issue #55) beneath the transfer's own row in All Transactions (§15.3),
  where the household reads it; Accounts, Pots & Checkpoints no longer lists transfers — guarded by the
  version the page rendered (a stale form is refused and nothing is saved) and audited before-and-after
  like every other correction. `entered_by` and the entry
  time are never editable — a correction is not a new movement, so §7.1's same-day rule, which reads
  `createdAt`, cannot be rewritten by one. Voiding stays for a transfer that should not exist at all; a
  wrong pot, a mistyped amount or a missing note is an edit, not a void plus a second entry.

### 10.2 Money across the household boundary (debts, swaps, other)

Borrowing, swaps with family, and anything else that is neither salary nor spending — the app's closed
world of §10.1 cannot represent these, so they get their own honest boxes:

- **Debts (informal IOUs).** A debt records who the money is owed to or by (`Mum`, `our son`) and which
  way round (`we_owe` / `they_owe`), plus an optional note. Its outstanding balance is always **derived**
  from the linked loan movements — never stored — so it cannot drift: for `we_owe`, borrowed minus
  repaid; for `they_owe`, lent minus repaid-to-us. Voided movements never count. No interest, no
  schedules: repayments simply reduce the balance, and a settled debt stays as history.
  An empty mistaken setup with no movements at all, including voided, may be permanently deleted
  after confirmation (decision 167); a debt with any movement history, including voided, cannot be
  hard-deleted. A debt with no effective movements displays “Awaiting first payment” (`we_owe`) or
  “Awaiting first loan” (`they_owe`), not “settled” (decision 168); voided-only history counts as
  unstarted for display but still blocks deletion.
- **Expected inflow — a plan with a start, a changeable day and an end (v0.5.0; planned from v0.7.0 on).**
  Because the money that would settle a debt is often dependable (Mum's £1,000 each 12th, while the loan
  runs), a debt may carry a **read-only expectation**: an amount, a day-of-month and an optional **until
  date**. It feeds only the projections (§7.2, §7.6) and the `EXP<` rows on All Transactions (§15.3) as
  *expected* money — never the estimate, the Income page, All Transactions' `BAC` rows or any insight. It
  follows the income cadence: clamped to the month (OQ1) and moved off a weekend onto the Friday before
  (decision 7). The plan runs **strictly after today and through the until date inclusive** (no until date
  means "until you say otherwise"), so a five-payment arrangement ends itself: once the until date has
  passed, nothing projects from the next month.
  **A settled debt expects nothing** — settled meaning movements exist and the balance has been brought to
  zero (or below). A debt with **no movements yet** is *not* settled: it is exactly the debt the expectation
  was planned for, and it projects from the day the expectation was set. A month that has already been
  answered by a live loan movement is never projected twice: a money-in recorded from up to two days before
  an occurrence's expected date (the weekend shift can bring it forward) and before the next occurrence
  simply *is* that month's money. Recording the real Borrow is therefore what silences the expectation — not
  a manual tidy-up — and if the parents are late one month the panel is late with them rather than moving
  the pot on a promise (§7.1).
  **Edits are forward-looking.** Moving the day from the 10th to the 13th, or changing or clearing the until
  date, changes only what is still expected; recorded movements are immutable history. The expectation is a
  **plan, not a promise**: no month is flagged late, and stopping the arrangement is an edit (or the until
  date passing). The actual deposit is still a Borrow movement; the expectation is a label, never received
  income.
- **Borrowing and repayments (loan movements).** Money in linked to a `we_owe` debt is borrowing: it
  raises the pot estimate **and** the owed balance together, and the Overview shows the owed figure
  **beside** "available now" — borrowed money is never income. Money out against the same debt is a
  repayment: it lowers the estimate and the balance, and is never spending. (Lending mirrors this on a
  `they_owe` debt.) Loan movements always link to a debt and carry the debt's name.
- **Swaps.** Cash in one hand and a bank transfer in the other (the son's wages scenario): the two legs
  are created **atomically as one pair** sharing an exchange key — the same amount into one pot and out
  of another — so no money crosses the boundary and the halves can never be orphaned. On a later date
  the pair is net zero against `household_available_now`. On the same day as a checkpoint the in-leg is
  absorbed only when the swap was recorded *before* that checkpoint; recorded after it, both legs count
  (§7.1, E13). A swap recorded first can leave the total one leg low until the next checkpoint — the
  out-leg still counts. Pairs are managed where they were made: the Pots page lists each pair with its net
  total, per-leg edit, single-leg void (an honest correction) and one-step void-of-both-legs. Each leg
  stays an independent correctable record afterwards: voiding one leg leaves the other visible as the
  survivor, honestly, rather than cascading. Swaps never touch spending or income.
- **Other money in/out.** Anything else across the boundary, with a counterparty and **always a note
  saying what it was** — the note is what keeps miscellaneous money honest.
- Estimates, checkpoints, Insights: external money in adds like a receipt and money out subtracts like
  spending (§7.1); checkpoint assume-cleared applies (§5); Insights exclude external movements by
  construction (the join is over allocations). A checkpoint absorbs an estimate — it never absorbs a
  debt: what is owed survives every checkpoint.
- Correction discipline mirrors transfers: kind, direction, debt link and exchange key are immutable
  (a repayment does not become borrowing); voiding keeps history. To fix those, void and re-record —
  for a swap, void both legs and record it anew.

## 11. Recurring payments (DD/SO) and expected income

### 11.1 Schedules

A schedule carries: name (fictional example: "Energy Co direct debit"), kind (direct debit | standing order |
expected receipt), amount (**fixed**, user-maintained), **frequency (monthly | annual)**, due day-of-month,
pot, category (child) + target (e.g. Vehicle Running/Insurance → Vehicle A; Utilities/Energy → household),
active from/until. Provider terms and review dates belong to a separate tracked agreement (§22), optionally
linked to this schedule. Legacy `contract_ends_on` values are migrated as fee-free switch dates; the source
field remains for compatibility, but new schedules do not create agreement dates.

**Monthly schedules may exclude selected calendar months each year** (decision 163). For example,
February and March can have no payment while April through January remain ordinary monthly payments.
This is not a new frequency. No selection means all twelve months; at least one payment month must
remain. Exclusions refer to the configured calendar month, before any income weekend shift. They apply
to instance generation, backfills, next-due dates and every instance-backed forecast/calendar. Editing
exclusions regenerates the forward window only, preserving converted history and past due instances
awaiting conversion. Moving the start earlier retains the backfill exception described below.

**Small UI footprint:** Add and Edit use the same nested native `<details>` / `<summary>`, collapsed
by default, only for monthly schedules. The single compact summary reads “Select any months with no
payment: none” or lists selected month names in calendar order. The marker and summary styling match
Horizon; no custom icon or button. Opening it exposes twelve labelled checkboxes in a responsive grid.
The dedicated Income forms use the same control. Switching to annual clears exclusions on save.

The users' direct debits are fixed amounts; when one changes, they update the schedule and it applies **from
the next instance onward** — historical instances are never rewritten.

**The start date is the one field an edit may move into the past** (decision 162). `active from` sits on the
schedule card's edit form, and changing it re-derives which dates the app expects money on:

- Moved **earlier**, it backfills every due date between the new start and today — including dates before a
  record that has already converted. Each becomes an ordinary instance, so it converts like any other and lands
  as a schedule-tagged `DD` / `SO` / income record dated the day the money moved. That is the point: a payment
  collected before the household created the schedule in the app (a direct debit set up after the fact, the
  first few days after the app was adopted) would otherwise be a hole in the history, or a hand-typed Purchase
  that every insight, projection and vehicle clock then reads wrongly (§15.3, §16).
- Moved **later**, it drops the upcoming instances before that date. Records already converted stay, and are
  corrected the normal way — edited or voided, never silently deleted.
- Either direction never rewrites a converted record, and a date the app already holds is skipped rather than
  duplicated. Backfilled instances carry the amount saved alongside them, which the form says in words. A
  payment the household had **already typed in by hand** is not merged or removed — the form tells them to
  void that purchase first, so a day cannot end up carrying both.
- Any *other* edit still never invents a past instance (decision 75): saving an amount or due-day change with
  the start date left alone changes the next instance and nothing before it.
- How far back is bounded by the window the app materialises instances for (~3 years); a start date beyond it
  is refused with a sentence naming the earliest usable date, not a crash.

### 11.2 Lifecycle — auto-conversion, no double counting

Each schedule instance exists in **exactly one state at any moment**, enforced in code and covered by tests:

```
UPCOMING (expected commitment)          → due date arrives (local midnight) →
CONVERTED (actual record, tagged "from schedule")
```

- While UPCOMING, the instance reduces `projected_low` as an expected commitment (§7.2) and appears in
  "due this week"/calendar views. It is **not** in the estimate.
- On its due date it auto-converts into an ordinary record: spending (DD/SO) or receipt (income). Now it is in
  the pot estimate like any purchase (§7.1) and **no longer** counted as an upcoming commitment. One instance,
  one state, counted once.
- Converted records carry a quiet **"from schedule"** tag (transparency without admin) and are fully
  editable/voidable like any record.
- **Late or missed payment:** the converted record is simply edited (new date) or voided (never happened).
  The schedule itself can be ended with a cancellation effective date; instances after that date stop
  existing, instances before it are history.
- **Weekends/bank holidays:** v1 uses the configured due date as-is (UK banks shift collection dates
  themselves; the assume-cleared checkpoint cycle absorbs small timing slop). A per-schedule
  "shift to previous working day if weekend/bank holiday" toggle is proposed for income schedules
  (salaries commonly pay on the last working day) — flagged as an open question in the plan; no automatic
  shifting for DDs/SOs, and nothing in the UI implies that changing a date in the app changes a bank
  instruction. It does not; the app only ever changes its own expectation.

### 11.3 Income: expected receipts and one-off money

**Scheduled income.** Sam's salary is a schedule of kind *expected receipt*: fixed amount, monthly, due into
the Salary account on the configured payday. It enters `projected_low` as a receipt (§7.2) and converts to an
actual receipt record on the day, exactly mirroring §11.2. The payday that defines the planning cycle is this
schedule's due date.

**Payday never waits for the weekend.** When an income schedule's configured day falls on a **Saturday or
Sunday**, the money is expected on the **previous Friday** — that is when it actually lands. The rule applies
to income schedules only: a direct debit or standing order leaves on the date the household configured. A
shifted payday can therefore fall in the previous month (a salary configured for the 1st pays on the last
Friday of the month before), and one calendar month can hold two paydays. Bank holidays are **not** handled —
the app keeps no holiday calendar and will not guess one, so a Good Friday payday still expects the money on
that day; the receipt can be corrected by hand.

**One-off income.** Anything that arrives once is recorded by hand on the Income page (§15.2): the bicycle
sold for cash, the bank transfer from a buyer, a refund from a third party, a gift, a one-off job. Cash or
bank transfer is simply which pot it landed in. Each record is an amount, a pot, a date, an optional
**source** ("Sale of bicycle") and an optional note — and nothing else: income carries no category and no
target because it is not spending, and it never enters an insight (§12, §16).

Income records raise their pot's estimate like any other credit (§7.1) and appear in All Transactions as
`BAC` (§15.3). Borrowed money is never income (§10.2). Income *analysis* — income-versus-spending, a category
breakdown of receipts — remains out of scope.

**Scheduled income will slot**

## 12. Categories — two-level tree (approved 2026-09-20)

- **Allocations always land on a child (leaf) category.** Insights roll up to the parent ("Housing cost £X")
  with drill-down to children ("…Council Tax £Y, DIY £Z"). Exactly two levels — a third would slow till-time
  entry.
- The tree is user-editable in Settings: add/rename parents and children; **retiring** a child prevents new
  assignments but preserves history. Schedules also reference a child category + target. The rename/retire
  picker’s visible selection, submitted ID and optimistic version must always agree (decision 169); the
  version stays in sync after a rename so a second rename without refresh does not hit a stale conflict,
  and the picker is `inert` until hydrated (`data-category-ready`).

Initial tree:

| Parent | Children |
|---|---|
| Housing | Mortgage/Rent · Council Tax · Buildings & Contents Insurance · DIY & Improvements · Gardening |
| Utilities | Energy · Water · Broadband · Mobile Phones |
| Groceries | Weekly Shop · Top-up Shops |
| Household Goods | Cleaning & Consumables · Homeware & Furnishings · Appliances |
| Vehicle Running | Fuel · Insurance · Maintenance & Repairs · Road Tax · Parking & Tolls |
| Personal | Clothing & Shoes · Health & Toiletries · Hair & Grooming · Hobbies |
| Entertainment & Eating Out | Dining Out & Takeaways · Cinema & Events · Holidays & Day Trips · Subscriptions & Streaming |
| Gifts & Donations | Gifts · Charity |
| Other | Uncategorised — anything here shows in a visible "needs filing" list so it cannot quietly rot |

Category (what it was) and target (who/what it was for) are **separate dimensions**: Fuel is a category;
*Vehicle A* is the target. That separation is what makes "everything Vehicle A cost us this year" one honest
query instead of a duplicated tree per car.

## 13. Vehicles

- Two vehicles (fictional labels: Vehicle A — Alex's; Vehicle B — Sam's), each a first-class **target**.
- Vehicle running costs in scope: fuel, insurance, maintenance & repairs, road fund licence, parking & tolls —
  anything allocated to the vehicle, including schedules (the insurance DD targets Vehicle A directly).
- Reporting answers *"what is Vehicle A costing us per month / rolling 12-month, in total"* — not "£75 on fuel
  this week". A vehicle has an owner for reporting roll-ups (owner totals = their personal totals + their
  vehicle totals, shown separately, never merged silently). Shared use needs no special handling: costs stay
  with the vehicle regardless of who paid or drove.
- **Fuel economy (v0.10.0, household request).** A fuel purchase may carry the odometer reading, the litres
  bought and whether the tank was filled to full. Both numbers are optional when the fuel is recorded and can
  be added later; from them the app works out the price per litre, mpg and fuel cost per mile (§15.1, §16.6).
- **Annual vehicle payments (decision 190).** A yearly schedule payment against a vehicle (a car insurance
  premium, say) is shown in running costs as one twelfth in each of the twelve months it covers, from the month
  it is paid (§16.3). Monthly payments are shown as they are, and the purchase record keeps the single payment
  on its date.
- Out of scope: valuation, depreciation, trip or business mileage logs, maintenance reminders.

## 14. Connectivity, PWA, notifications

- **Online-only** (agreed). Entry requires a signal; if connectivity drops mid-entry, the app **keeps
  the half-typed record on screen** and retries the save on reconnection (single in-flight submission guard —
  no duplicate posts on flaky networks). No offline queue, no sensitive financial data cached on the device,
  no service-worker caching of pages or API responses.
- Receipt photos/uploads need connectivity like everything else (§23): the purchase save **never waits on an
  attachment**; uploads are retryable and can be added days later. The phone's own gallery is the temporary
  store for a photo taken without signal — the app keeps no offline queue of its own.
- **Installability shipped in v0.8.0** as a web app manifest (`public/manifest.webmanifest`) and icons
  (`icon-192.png`, `icon-512.png`, `apple-touch-icon.png`) — no service worker, no caching, no offline
  queue. The manifest is a static file in `public/` so it is fetchable without credentials; a Next route
  would sit behind Cloudflare Access. The manifest and icon paths are bypassed at the Cloudflare Access
  level (path-scoped Bypass → Everyone policy); every other URL remains behind the email-policy app.
  SPEC §14's online-only rule stands unchanged; the household confirmed they do not want offline access.
- **No external notifications** (agreed). Key-date prompts live inside the app (§22.3). An optional email
  alert channel is a recorded **v2 roadmap item** — not a v1 blocker.

## 15. UX

### 15.1 Mobile — the "walking out of Tesco" tool

Purpose: fast, accurate entry at the till. It does not get into the weeds; review lives on the desktop.
All pages remain reachable on mobile (nothing hidden) — they are simply not the mobile design focus.

**Two homes, one codebase (decision 164).** The phone's first screen is `/` — a till home, ordered as
**Household total now → Quick Entry/Till → payday summary → due this week → links**. The summary is the
v0.37.0 follow-up card (decisions 186–187): next payday, projected household low, at most one worst-pot
bills-only transfer nudge with a qualified day-to-day guide when applicable, and a link to Horizon (§7.2,
§7.5). On a laptop the same `/` page places Quick Entry/Till **above** the household total and the rest of
the existing dashboard; responsive ordering never replaces that content. Neither layout is a copy of
Overview or embeds Recurring, the pots dump, recent purchases, checkpoints or key dates. Recurring stays a
laptop-first chore, reachable from the drawer as one item. The drawer leads with Quick Entry, Purchases,
Horizon, Charts, Overview and Recurring; everything else sits in a second group. The laptop keeps the full
navigation bar and opens on Overview when the household sits down.

Home = four big actions:

1. **Add Purchase (redesigned v0.9.0, re-laid out v0.11.0)**. Two cards.
   - **Card 1, record it:** pot first, then the two balance figures (§7.7): the selected bank pot's
     **last reported checkpoint**, with its age and existing local date/time label (cash shows no balance),
     the household **"free to spend before income lands"** headline, and the selected pot's explicitly
     **bills-only shortfall** when its own commitments outrun it. The low uses the same salary-day
     exclusion as the payday projection; a negative low says **"Projected shortfall: -£413.57 before
     payday. No discretionary spending is available at this time."** The negative presentation omits
     “No weekly allowance”, the salary-not-counted sentence, and the projected-liquid-funds disclaimer.
     Positive and zero-low guidance is unchanged. Then supplier (typeahead: recents
     first, filtered as you type, inline rows, no browser popup; tapping a suggestion fills the name, applies
     the remembered category and moves to Amount) → amount → "+ Note" collapsed out of the way → a full-width
     **Next: category →** button. **There is no
     Save on card 1** (v0.11.0): the supplier's remembered category is only shown on card 2, and it must
     be seen before it is saved.
   - **Card 2, Category & allocation:** category → "For" (household / person / vehicle) → split lines →
     "+ Add split" → **Paid by** (one tap-button per person, radio semantics) → **Date** (full width,
     "Today if blank") → **Save purchase** (enabled only when the lines total exactly; remainder helper
     available) → a confirmation line, and the form handed back **blank** (decision 174): supplier,
     amount, date, note and the split lines are cleared, the note field closes behind "+ Note" again,
     and the amount-following restarts, so the next purchase starts from empty and **Save is greyed
     out until it is complete** — one save cannot be pressed twice by an accidental second tap.
     **Pot and Paid by stay as they are**, because the same pot and the same person usually pay for
     the next purchase; they are choices, not the entry. The confirmation stays on screen while the
     next entry is typed. A failed save clears nothing, so the values can be corrected and re-saved.
     Nothing moves: the card the household is on, and the keyboard, are left exactly as they were
     (decision 151) — a save is not a tap on a field.
     Changing Paid by re-targets any line still on the old payer's default (their car, themselves);
     lines pointed elsewhere by hand stay put.
   - **Automatic remainder (v0.27.0, decision 177):** Total is the source of truth. Line 1
     follows Total minus the other split amounts, including after adding/removing splits or correcting
     Total. Empty new splits count as zero for this calculation but still block Save until complete.
     The label says "auto remainder". Results are clamped to zero; an exhausted remainder warns and
     zero-value lines still block Save. Empty Total clears Line 1; incomplete/invalid input holds the
     last valid remainder and cannot save. Editing Line 1 (including Assign remaining on it) takes
     control until a fresh entry. Adding a split no longer stops following (supersedes the old rule).
   - **Add items into a split line (v1.16.0, decision 221, GitHub issue #46):** a receipt often
     has several items of the same category (four clothing lines on one Amazon order). Each split
     line that is not Line 1's auto remainder offers a **"+"** to the right of its amount. Tapping it
     opens a small **Add item** field: each amount entered is added, in whole pence, to that line's
     running total — same category, same target, no extra split. Line 1 still follows the remainder.
     The household never leaves the till for a calculator. Empty or zero current starts the line at
     the first item; a half-typed amount is left alone. Enter in the item field adds, it never saves
     the purchase. In v1.16.1, category, amount row and adder stack at every width, so the
     adder uses the full split-card width on laptop rather than the old 0.8fr column;
     the separate "+" button retains its 48×48px target.
   - **"Add another" (decision 174)** sits next to Save while the confirmation is up **and the next
     entry has not begun** — it is offered when the form is still blank, and steps aside as soon as
     the household starts typing the next purchase, rather than wiping it under their thumb. It
     returns to card 1 with the supplier focused (decision 137). It is also the start-over shortcut
     for a form that was filled and not saved.
   - **Focus at the till (v0.13.1, decision 151): nothing is focused when the page opens.** The till used
     to land on the supplier as soon as it was ready; on a real phone that raised the on-screen keyboard,
     the browser scrolled the focused field above it, and the Purchase / Fuel / Checkpoint / Move tab strip
     went off the top of the screen with it. The household decides what to fill in by tapping it, so no
     field is focused as a side-effect of **the till becoming ready** or of **a type tab becoming
     visible** — Fuel and Checkpoint open with nothing focused too. The card's first paint still shows the
     type tabs, the pot, the payday shortfall warning and the free-to-spend figure; the keyboard stays
     down.
   - **The phone opens at the till (decision 158, superseding 151's "the page does not scroll itself"
     clause; 151's focus rule stands unchanged).** A phone opened at `/` used to land on "Shared household
     ledger" with the till below the fold, so the household had to scroll to record a purchase — the one
     thing the phone is for. Now a mount-time **scroll, never a focus** (`scrollIntoView`, no `focus()`
     anywhere in the move) parks the card's top just below the sticky header (the section spends the
     measured `sf-anchor` offset — decision 216, re-opened issue #34) so the type tabs are the first thing
     on screen, keyboard down. It is the phone layout only (`< lg`); a laptop still opens at the
     top. The mobile drawer's **Quick Entry (Till)** link carries
     `/#quick-entry`, so tapping it lands on the till even when the page is already open.
   - **Focus order once the household is typing:** supplier → amount → Next → category. Focus moves only
     as the answer to something they did: tapping a suggestion moves to Amount, Enter in Supplier moves to
     Amount, Next moves to the category, "+ Note" focuses the note it just opened, and "Add another"
     returns to Supplier on card 1. **A save is not one of those answers** (decision 174): it clears the
     form without moving focus or the card, so the confirmation is read where it was left and the
     keyboard stays down. The keyboard's Enter/Go never saves from card 1: in Supplier it moves
     to Amount, in Amount (or the note) it is Next.
   - **Card switching (mobile only, v0.11.0):** the cards sit side by side in a clipped viewport and move
     with a short `translateX` slide. They are not a native scroll container. They switch on **Next**, the
     **dots**, or a deliberate swipe (≥50px sideways, clearly more sideways than down). Vertical scrolling
     never moves them (`touch-action: pan-y`), and the hidden card is `inert`. On a laptop (`lg:` and up)
     they are two static columns.
   - **Payer default:** Paid by starts on the person linked to the signed-in email (§15.2 "Signs in as"),
     else the first person.
   - The default pot is **a setting**, not a guess from a pot's label (§15.2 Settings). With none configured
     the form starts with no pot selected, and Save stays off until one is chosen — a purchase has to name
     the pot it came out of, and the server refuses one that does not.
   - **The till says whether it is listening.** The form is a client island: before React hydrates it, a tap
     switches nothing and a keystroke typed into a controlled input is wiped by the hydration render. So the
     section carries `data-till-ready` (false in the server-rendered HTML, true once mounted) and the tab
     strip and forms are `inert` until then, refusing input instead of silently swallowing it. The acceptance
     suite waits on that signal (`e2e/support.ts` · `waitForTill`) before it drives the till; assertions
     auto-wait, keystrokes do not.
2. **Add Fuel**: prefills the payer (the signed-in person, via "Signs in as"; else the first person), the
   pot default, category Fuel (fixed), and the vehicle = **that person's own vehicle** (its Owner; else
   the first vehicle). Vehicle and Paid by are tap-buttons, so the other car is one tap. Until a vehicle
   is tapped it follows Paid by. Once tapped, a Paid by change leaves it alone. The **amount is the only
   required typing**.
   - **Supplier (v0.11.0):** the same inline typeahead as purchases, fed **only suppliers with a previous
     fuel purchase** (the §16.6 definition), most recent fill first; "Did you mean" compares against those
     only. A new name can be typed and becomes a fuel supplier from its first fill.
   - **Litres and odometer (v0.10.0), both optional.** Two more boxes — litres from the pump or receipt,
     miles from the dashboard — and a **Filled to full** tick, **off by default** (v0.11.0; tick it when
     the pump clicked off at full). The price per litre is shown as the litres are typed (amount ÷ litres;
     never stored). Anything left blank can be added later from the purchase's row on Purchases
     ("Fuel details — add odometer & litres"); that edit is versioned and audited like any other, and shows
     the stored tick.
   - **The save answers with the mpg:** one sentence under the form — e.g. "Vehicle A: 41.2 mpg over 312
     miles since the last full tank. 40.12 L at 142.9p/L." — or, when mpg cannot be worked out yet, why
     (part fill: worked out at the next full tank; first full tank noted; a reading or litres missing).
   - **After a save the form is handed back blank too (decision 174)**, the same as the purchase form:
     amount, litres, odometer, supplier, date and note clear, the **"Filled to full" tick goes back to
     off** (a tick left behind would measure the next fill as a full tank), and **Save fuel greys out**
     until the next fill has an amount. The mpg answer stays on screen. **Pot, Vehicle and Paid by stay
     as they are** — the same car is usually filled again. A failed save clears nothing.
3. **Update Balance** — pick pot (defaults to least-recently-updated), enter figure, save. Optional effective
   date. Two fields in the common case.
   - **Checkpoint cash (v0.28.0, decision 178).** Cash is checked far more often than the
     household expected, so the till header carries a collapsed **Checkpoint cash** button between
     the heading and the description line. It opens a small card, not a fifth tab: the signed-in
     person's **own cash pot** — the one whose Owner is them (§4) — with a counted amount, an
     optional note, and Save. The pot is shown as a locked name (with a "your cash pot" chip and
     the age of the last count, never a stale amount), so the card has one field in the common
     case. When the sign-in is not linked to a person who owns exactly one cash pot, the card
     falls back to a cash-pots-only select so it always works. A save hands the amount back empty
     (decision 174's rule) and the card stays open on its confirmation; nothing is ever focused as
     a side-effect of opening it (decision 151). Checkpoints stay checkpoints — labelled as such,
     never a bank connection. The card is hidden entirely for a household with no cash pots, and
     the full **Checkpoint** tab remains for every other pot.
4. **Move Money** — between the household's own pots (a cash handover included), borrowing and
   repayments against a tracked debt, a swap with someone outside the household, or other money
   in/out with a note. Recorded in the moment, like everything else here.

Supplier memory: suppliers are remembered after first use; a supplier stores the most-used category as the
preselected (always visible, always changeable) chip. Near-duplicate supplier names prompt lightly at add
time ("Did you mean: Tesco?"). The suggestion list is rendered into the page (v0.9.0), because the
browser's native `<datalist>` popup is fiddly on a phone and different on every device.

Layout rule at the till (v0.9.0, tightened v0.11.0): a phone screen with the keyboard open is roughly half
a screen, so the critical fields and Next fit in it; inputs and buttons are at least 44px tall; and **the
page never becomes wider than the screen**, at 320px or at 360px with 130% text (Android's font and display
size settings). The tab strip is a four-column grid that shrinks, nothing unbounded is `nowrap`, the Quick
Entry section clips (`overflow-x: clip`) as a safety net, and on a phone the black card's padding is `p-2`.
A mobile test asserts `scrollWidth <= clientWidth` on every tab and both cards.

Till details fixed in v0.10.0: **one tap on Save saves** even with the supplier suggestions open (the list
no longer collapses under the finger); **every** control inside Quick Entry — tabs, chips, toggles, split
controls — is at least 44px tall, and a mobile test measures them; and the purchase form used to open with
the cursor in **Supplier**, once the till was ready to listen. **v0.13.1 reverses that last one**
(decision 151): on a real phone the keyboard it raised scrolled the type tabs off the screen, so the till
now opens with nothing focused and the household taps the field they want.

### 15.2 Desktop — the "sit down and review" tool

Dense and efficient: useful information per screen, minimal scrolling — but **density never sacrifices
functionality** (agreed correction to the original one-screen proposal). Readable text, real click targets,
clear grouping; dense is not cramped, and this is not a spreadsheet with tiny targets.

**Visual depth (v0.30.0, decision 180).** The canvas may carry a broad, faint wash from the active
accent; ordinary cards use a shared, theme-aware soft elevation; and the phone-home and Overview
household-total cards may receive a restrained accent gradient and stronger shadow to establish a
clear focal point. The sticky header and genuinely interactive destination cards can use the same
elevation language. Gradient and shadow colours come from the existing theme tokens, so all 28
light/dark themes remain supported. Hover lift is limited to hover-capable devices and is suppressed
for reduced-motion preferences. Tables, forms and status treatments stay calm: decoration never
replaces legible borders, focus indication or the existing words and signs that explain money states.

Menu pages:

| Page | Contents |
|---|---|
| **Overview** | The one genuinely dense single screen: household available-now + per-pot mini-balances inline + "last checkpoint" times + the owed/owing figures beside the total; warning banner when a tier is active; payday projection panel retaining its date, tier, liquid funds, day-to-day total, commitments and receipts, plus the worst-pot bills-only transfer nudge (§7.5), but **no expandable forecast sections or day-by-day table** (v0.37.0 follow-up, decision 187). Horizon owns the dated shops/fills, expected-support list and day-by-day detail; the panel links there, opening on the day before payday. Quick Entry/Till stays visible beside the projection. Due-this-week commitments; **contracts & renewals inside their warning windows (§22.3)**; month-to-date by parent category with small bars, each parent name linking to Purchases filtered to that parent and this month's first day through today; vehicle rolling-12, each vehicle name linking to Purchases filtered to that vehicle and the rolling window through today (decision 179). Purchase review, transfer void, adding a pot and checkpoint history live on their own pages (decision 164) — not here. |
| **Purchases** | Full history table; filters by date range, supplier, category, target, pot, person, tag (on a phone the filter card collapses behind **Show filters**, starts open if any filter is already applied, and From/To date share a row); the four record-kind boxes — **Purchases** (anything not from a schedule), **From schedule**, **Refunds**, **Voided** — are show toggles, all on by default so the full history including voided records is shown, and unticking one hides that kind (a record with two tags is hidden if either is off; decision 205); the result heading shows the number of entries and their **net total** from the rows actually displayed (up to 500 newest matches): whole purchases count once even if a category filter matched one line, refunds subtract, and voided history adds nothing; rows alternate plain/tinted (`bg-canvas`) so neighbouring records are easy to tell apart; the supplier name links to that supplier's expanded card on Suppliers (decision 149's link); inline editing; the line editor puts **Spent for** and **Amount** on its first row and **Category** full-width on the second (plus **Which** when a person/vehicle is chosen), with slightly shorter controls; refund/void/correct with audit trail visible — a refund is its own negative record in the same category and target as the original, linked to it, with the original's pot, supplier and payer unless the form says otherwise; its lines total the refund exactly, so a partial refund is simply a smaller amount (§9.5); split editing with the same exact-total rule; **receipt/invoice attachments (§23)** viewed, added and removed from the purchase row, with the audit line (who, when) in that row's History. |
| **All Transactions** | Activity for one selected pot over a date window: every movement that touched it (purchases, direct debits and standing orders, transfers, borrowing and repayments, swaps, other money, **income**), one signed amount column (green in / red out relative to that pot), the original record's note, checkpoint dividers, a debt's expected support as flagged `EXP<` rows outside the totals (v0.7.0), and a link from every row to that record's canonical form. With no pot in the URL, the household's saved default pot is used; an explicit pot in the URL wins. Nothing is added here, and nothing is edited or voided here **except a purchase and an internal transfer**, which open in place — their correction and void forms in a panel directly beneath their row (decisions 225 and 226, GitHub issues #55 and #57; §15.3). A refund keeps its link to Purchases. |
| **Recurring Payments** | The DD/SO/income schedule list (amount, frequency, due day, category, target, pot, next instance and state); edit/cancel with effective dates; history of converted instances; **read-only month calendar view** of due instances. Provider agreements and their review dates live on Contracts & Renewals, with an optional link from a schedule. On a laptop the calendar sits left with compact projection figures under it; the schedules panel matches the calendar card's height and the list scrolls inside it, with Add a schedule pinned below and a link card to Contracts & Renewals beside projection. On a phone the four stack unclipped. Deep links `#schedule-{id}` still land on the row, below the sticky site header (every hash target in the app spends the measured `sf-anchor` offset, so a link works at any window width whatever the nav wraps to — decision 216, re-opened issue #34; and the scroll pass verifies each landing against the real header, correcting once a settled landing a browser left behind the bar — decision 222, issue #43). Cancelled schedules show by default; a Hide cancelled toggle (`?hideCancelled=1`, with a count of those hidden) removes them from the list while keeping the calendar and history (decision 212); the hide-cancelled preference is remembered across page navigations via a device cookie (decision 214). An in-place filter search box with Clear button filters schedules by name or supplier, revealing matching cancelled schedules even when cancelled schedules are hidden (decision 215). |
| **Horizon** | "How far the money would go" (§7.6): pick a date up to 400 days ahead (opens on the day before the next scheduled income; a date change applies itself, v0.13.0), scope by pot (all selected by default) and toggle day-to-day; the free-to-spend headline, the always-shown lowest point with its date and tier, and detail blocks for the commitments, expected money in (debts' expected support flagged `expected`), the projected day-to-day events (dated shops/fills, v0.6.0) and the day-by-day table. Same engine as the payday projection; laptop-shaped by the household's choice. |
| **Income** | Money coming in: the scheduled income (salary) that converts itself, editable in place from the next instance onward; one-off income recorded by hand with an optional source; and one list of everything received — scheduled and one-off together, with inline correction, void and the retained history. Income is desktop-shaped by the household's choice: it is not a till-side task, so nothing here is squeezed into the mobile quick-entry panel. |
| **Suppliers** | Supplier list + detail: contact card (phone, email, website, address, label→value reference pairs such as policy numbers, notes; directly below Address, connected recurring schedules link to `/recurring?q=<name>#schedule-<id>` or indicate no scheduled payments relate to the supplier; decision 215), interaction log with "+ Create Interaction", linked purchases (§21), including removing a receipt from a linked purchase (§23.4). Tap-to-call on mobile. |
| **Contracts & Renewals** | The agreement register groups explicit insurance policies (regardless of provider auto-renew status), service contracts and other reminders. It owns renewal/review and separate fee-free switch dates, independent per-date in-app leads, provider auto-renew status for insurance, notes and optional recurring-schedule links. It also retains credit-card payment reviews and supplier follow-ups. |
| **Accounts, Pots & Checkpoints** (was **Accounts & Pots**; renamed v0.28.0) | Leads with the **Record a balance checkpoint** card, then **Add a pot** (both v0.28.0, decision 178 — recording is the page's most frequent job), then a card per pot: reported figure, estimate, owner (decision 178), checkpoint timeline, edit form; **cash pot cards show no overdraft or warning threshold** (decision 178); staleness of every pot; **no transfer list** — internal transfers are recorded in Quick Entry → Move and corrected or voided in place on All Transactions (decision 225, which retired the "Transfers between pots" card of decisions 164 and 218), and an old `/pots?transfer={id}` link redirects there with that transfer open; overdraft context (limit, threshold) for the Main account; informal debts with derived balances and an optional expected-support plan (amount, day-of-month, until date — editable forward-looking, v0.7.0); borrow/repay/swap/other entry and history; archiving for empty pots. |
| **Insights** | §16 panels. |
| **Settings** | Household labels; pots (each with an optional Owner, decision 178 — cash pots use it for the till's Checkpoint cash card, and cash pots show no overdraft/threshold fields); category-tree editor; projection figures; thresholds; payday/income config; legacy default warning leads for standalone renewal rows/unlinked schedule ends; agreement reminders have per-date leads; **the default pot for purchases** (v0.9.0 — an explicit choice, never a guess from a pot's label); **the default pot for All Transactions** (issue #44 — an explicit household preference for the activity page's initial target, with the normal fallback available by clearing it); **"Signs in as"** per person (the verified identity assigned to that household in the app registry; drives the till's Paid by and Fuel vehicle defaults; audited and unique across household membership); each vehicle's Owner shown. (Suppliers live on their own page.) All private numbers live here at runtime — never in the repo. |

**Calendar (agreed: read-only month view).** A month grid on Recurring Payments showing due DD/SO instances and
expected receipts — another view of the same schedule data, never a second database. Each populated day keeps
the date visible and summarizes the count of scheduled items plus their combined amount; this is the gross sum
of listed amounts, so expected receipts are not netted against outgoings. Selecting that summary expands a
full-width day-details panel with each schedule name, amount, kind and conversion state. Its Edit schedule link
filters the list to that exact schedule ID and opens the ordinary Edit section, while keeping the schedule name
in the visible filter. **No drag-and-drop**, and the UI states plainly that changing a date in the app changes
only the app's expectation, never a bank instruction.

**Version display:** the app version is visible unobtrusively on desktop and mobile (blueprint §1).

### 15.3 All Transactions — activity for one pot (v0.3.0 line; household sketch 2026-09-23)

One page, one pot at a time: every movement that touched the selected pot inside a date window, in
one dense table — purchases, direct debits and standing orders, transfers, money across the
household boundary, and income (`BAC`). It is a **pure projection of existing records** — it stores
nothing, and every row links to the canonical record that owns the add/edit/void behaviour and the
retained history. (One derived exception since v0.7.0: a debt's expected support renders as a flagged
`EXP<` row that is not a record at all — it links to the debt, not to a form.) **Two exceptions since
decisions 225 and 226:** an internal transfer's and a purchase's canonical form *is* this page — they
open in place, beneath their own row (below).

**Transfers and purchases open in place (decisions 225 and 226, GitHub issues #55 and #57).** The pots
page's separate "Transfers between pots" list only repeated what this table already shows, and grew
harder to read with every transfer, so it is gone. On a `TX<` / `TX>` row that is an internal transfer,
the other pot's name is a disclosure button (dotted underline, as Horizon's breakdowns, decision 203):
selecting it opens a panel **directly beneath that row** — the page does not navigate away — naming the
transfer in full (`#id · from → to`, amount, date, who recorded it) with its **correction form** (the two
pots, amount, date, note; decision 218's rules and stale-version guard, unchanged) beside its **void
form** (reason required; the record and reason are kept). **One record is open at a time** — a transfer or
a purchase; opening another closes the first, and Close (or the name again) shuts it. Income, boundary
money (`TX` rows for `other` money included) and expectations keep their links exactly as before.

**Purchases open in place the same way (decision 226, GitHub issue #57).** A one-off purchase (`PUR`), a
direct debit (`DD`) and a standing order (`SO`) are the same record with the same canonical forms on the
Purchases page, and the row a household most often needs to put right is the one in front of them: on
those rows the supplier's name — or the schedule's name when the record has none, as a standing order
may — is the disclosure button, opening the Purchases page's own `PurchaseEditForm` and `VoidForm` in a
panel directly beneath the row, with the same live category tree, people and vehicles that page offers.
A **refund** (`REF`) is deliberately not one of them: it is a purchase record too, but its amount lives
in the negative, its form belongs beside the original it was refunded against, and it can only be
recorded, corrected and voided on Purchases — so its row keeps its link there. Correcting a converted
`DD` / `SO` record never touches the schedule that produced it (§11.1), and the schedule link stays
beside the code.

- **The open record is the URL's `?transfer={id}` or `?purchase={id}`** (with `#transfer-{id}` /
  `#purchase-{id}`), replaced through the router without a history entry or a scroll, so a refresh or a
  shared link reopens it and the page the server renders after a save knows which record is open. The two
  parameters are alternatives — opening one clears the other, so there is never more than one panel — and
  an id that names no record is ignored (a bare `?purchase=abc` changes nothing; a nonsense `transfer`
  does not shadow a valid `purchase`).
- **A save never pulls the panel out from under the household.** A void always takes the record out of
  this list (voids are never movements), and a correction can (a purchase re-dated outside the window; a
  transfer onto two other pots, or re-dated outside it). The open record then stays on screen as a
  **pinned row** placed by the projection's own comparator, at the position it holds in the list — muted,
  outside the totals, the stripe and the running balance, and badged *voided*, *moved to other pots*,
  *outside these dates* or *past the row limit* — with a panel saying why: a voided record shows its
  reason and no forms; a re-dated or moved one keeps its forms (so a mistake is put right in place). The
  save itself never navigates or scrolls the page (a void cannot move the row at all). A re-date does
  move it — the row sorts where the new date belongs — so when that leaves the panel entirely off screen
  it is brought back to the middle of the view once, and only then: an in-view panel, one the household
  scrolled away from themselves, and a hash landing are all left as they are. A pinned row links to where
  it is a live row again: a move or a re-date to that pot's activity over a
  window holding its date, and a voided purchase to `/purchases?voidedOnly=1#purchase-{id}`, the one page
  where a voided record is still readable. Closing the panel lets the pinned row go.
- **Old links:** `/pots?transfer={id}` (bookmarks from decision 164) redirects to this page with that
  transfer open — on the household's usual pot (the saved default, then `Main account`, then the first
  pot) when the transfer touches it, otherwise the pot the money left — over the last 30 days when they
  hold its date, otherwise about a month around it. It is not statement import and not bank reconciliation, both of which remain
non-goals (§2): the rows are the household's own records, not a bank's lines.

**Filters.** A target selector (the household's live pots; if the URL does not name a valid pot, use
the household's saved default from Settings, then the pot labelled `Main account`, else the first
pot; issue #44) and a start/end date pair compared against each record's local `occurred_date` — never
against an instant. A valid `potId` in the URL always wins, including links and submitted filters.
Quick picks: **last 30 days** (the default), **since last checkpoint** (that pot's most recent
checkpoint's effective date; a never-checkpointed pot falls back to 30 days and says so) and **this
month**. The end date cannot be in the future, because no record can be (§9.1). The list caps at the
newest 500 rows and says so, rather than truncating silently.

Archived pots are not offered, and that strands no history: a pot can only be archived when it has
no records at all — no checkpoints, purchases, transfers, receipts, external movements or schedules
(§4) — so an archived pot's activity view is empty by construction.

**Columns.** Date · Type · Source · Category · Amount · Notes. The date column is **date-only,
`YYYY-MM-DD`** (household choice, 2026-09-23): a record entered without a time carries the
end-of-local-date marker as its instant, so printing that instant would show a `23:59` that never
happened. Other pages keep their existing date rendering; this is not an app-wide change.

There is **one row per record, never one per allocation line**, so the amount column always sums to
the stated total. A split purchase shows its first allocation line and "+N more"; the whole split is
behind the row's link. The amount column is single and coloured by sign: **green = money into the
selected pot, red = money out**, so one pot→pot transfer is automatically green on one side and red
on the other with no data change anywhere.

**Alternating rows (v1.10.0, issue #23, decision 208).** Movement rows alternate a tinted background
(`bg-canvas` on every second movement), the same treatment as the Purchases list (decision 205) and the
Schedules list (decision 206). Checkpoint dividers do not take a turn in the stripe: they are already a
tinted divider with heavy rules above and below, so the movements either side of one keep alternating.

| Code | Record | Source cell | Category cell | Notes cell |
|---|---|---|---|---|
| `PUR` | `purchases`, manual entry | supplier name | allocation: `Parent / Child (Target)` | `purchase.note` |
| `REF` | `purchases` with `refund_of_purchase_id` set — a credit, shown green | supplier name | as above | `purchase.note` |
| `DD` | purchase converted from a schedule of kind `dd` | the schedule's supplier | the schedule's category + target | `purchase.note` (`From schedule "…"`) |
| `SO` | purchase converted from a schedule of kind `so` | the schedule's supplier; a standing order may have none (§11.1), in which case the schedule's own name is shown | as above | `purchase.note` |
| `TX<` `TX>` | `transfers` (internal) and `external_movements` kind `other` | the other pot's label, or the counterparty | — | `note` (mandatory for `other`, §10.2) |
| `LN<` `LN>` | `external_movements` kind `loan` | the counterparty (the debt's name) | — | `note` |
| `EXP<` | *derived, not a record*: a debt's expected support due that day (§10.2, v0.7.0), always money in | the counterparty (the debt's name) | — | `expected — not recorded yet` badge; the row links to `/pots#debt-{id}`, not to a form |
| `SW<` `SW>` | `external_movements` kind `swap`, one row per leg on the pot it touched | the counterparty | — | `note`, plus a `swap (paired, £X with <pot>)` badge |
| `BAC` | `receipts` (income) — a one-off entry, or a receipt converted from an income schedule | `receipt.source`, else the income schedule's name, else "Income" | — (income has no category) | `receipt.note` (`From schedule "…"` when converted) |

`POS` and `BYP` from the household sketch stay unallocated: purchases carry no payment channel and
no channel field is added for this page (§9.1's three concepts are entered-by, paid-by and
for-whom; a fourth, typed at the till and read by one column, is not worth its cost). Income is
rendered as `BAC` (v0.4.0): one-off income is recorded on the Income page rather than as other money
in, so a third-party credit reads as income, and a converted salary reads as income too, named by
the schedule that produced it. Borrowed money still appears as `LN<` — it is never income (§10.2).

**Expected support rows are flagged, never counted (v0.7.0).** A debt's expected inflow (§10.2) is the one
thing on this page that is **not a record**: it renders as a green `EXP<` row dated the day the money is
expected, badged `expected — not recorded yet` and linking to the debt on the Pots page, so the plan is
visible in the same list as the money that has actually moved — on the due date itself, which is when the
household needs to record the borrowing, and for the days that follow while the window still covers it. It is
deliberately outside the totals: the count line above the table and the total row both say how many
expectations were shown and what they come to ("≈"), and the footnote spells out that they are not counted,
because nothing has moved and the estimate has not changed. Each row **gives way to the real thing**: once
the Borrow for that month is recorded, the `LN<` row takes its place and the expectation stops projecting
that month (§10.2). Expected rows speak only for months **since the plan was set** — an expectation added in
late September does not retro-fit a September row — and they render in date order with everything else. The
window still cannot reach into the future (§9.1), so a payment due next month is not listed here yet: the
projections (§7.2, §7.6) are what show the plan ahead, while this page shows the money that moved — or was
expected to move — on the days the window covers.

**Voided records are excluded** (`voided_at IS NULL` on every family) and no history machinery is
rendered; corrections happen on the canonical page behind the link — for an internal transfer or a
purchase, in place (decisions 225 and 226), where a record voided while its panel is open stays pinned,
struck through and uncounted, until the panel closes. **Refunds are
shown** as green `REF` rows: a refund is already just a purchase with a negative total and the
estimate counts it (§7.1), so hiding it would make this page disagree with the pot for no gain.

**Checkpoints render as divider rows** inside the window — effective date, the reported figure and
the note — visually distinct from transactions, excluded from the total, and labelled *reported*,
never *balance*.

**The total row reads "movements shown", not "estimate change".** It is the sum of the rows above,
and it can legitimately differ from the movement in the pot's estimate: voided records are invisible
here, and §7.1 absorbs a date-only credit that was written down before a checkpoint on the same local
date while counting a date-only debit (and counting a credit written down after that checkpoint). The
page says so rather than implying an equality it cannot keep.

**Deep links.** Each row links to its record's canonical form: refunds (`REF`) to
`/purchases?potId&from&to#purchase-{id}`; `DD`/`SO` rows additionally to `/recurring#schedule-{id}`;
`PUR`, `DD` and `SO` rows open in place (decision 226), their URL being this page's own
`/transactions?potId&from&to&purchase={id}#purchase-{id}`; internal transfers open in place too
(decision 225), as `/transactions?potId&from&to&transfer={id}#transfer-{id}`; boundary money (other, loan, swap
legs) to `/pots?external={id}#external-{id}`, swaps also under `/pots#swaps`; income to
`/income?receipt={id}#receipt-{id}`. Those anchors and the `?external=` parameter exist so that a
linked record lying outside a page's recent list is still rendered and findable, instead of the link
landing on a list that no longer contains it; `?transfer=` on this page does the same for the open
transfer, and on `/pots` it now only redirects here.

**Running balance is not shown** (deferred, not rejected): every pot balance is checkpoint-based, so
any running figure is relative to the last checkpoint only — and on a checkpoint's own day §7.1
makes even that ambiguous.

**The lazy due pass still runs** on this page as on every read page (§11.2), so a direct debit that
came due today appears. Nothing on this page creates a record, and the only user-facing writes are the
open transfer's and the open purchase's correction and void (decisions 225 and 226) — the same server
actions, guards and audit as anywhere else, refused for a read-only support view.

### 15.5 The guide and "what this page needs first" (v1.2.0, decision 196)

`/guide` is one plain-language page with eight anchored sections (checkpoints and bank balances, income is not spending, transfers, borrowed money, schedules and history, the projection, "the app has noticed", and what the app never does). It reads no household records, is reached from the footer and from the setup path, and is not a navigation entry.

The four payoff pages (the payday projection, Horizon, Charts and Insights) state what they are waiting for, in place of zero-figure scaffolding. Each missing record is a setup-path step that is not done, so it closes everywhere once recorded. Optional steps and Phase B bills are never prerequisites. A reported chart or an Insights panel gives way to the block only while nothing is recorded for it. Nothing is stored and nothing is dismissable.

### 15.4 Appearance — one token block, fourteen palettes, light and dark (v0.17.0)

The household's standing requirement (decision **159**): the colour scheme must be arranged so that
**adding a new theme is a small, single-place change — not an app-wide edit in every page**.
Phase 1 (v0.16.0) built the precondition — every colour became a custom property in one Tailwind v4
`@theme static` block in `src/app/globals.css`, with zero visual change. Phase 2 (v0.17.0, decision
**160**) is the proof: **28 themes** — fourteen palettes, each in a light and a dark form — and a
picker in Settings. Not one page, component or chart changed to make that possible.

- **One block per theme.** `src/app/themes.generated.css` holds 28 plain `[data-theme='…']` blocks,
  each re-declaring the same 74 `--color-*` names (73 + `--color-link`, decision 203). Plain CSS, not more `@theme`: Tailwind puts
  `@theme` inside `@layer theme`, and an unlayered rule beats a layered one whatever the order.
  Attribute selectors rather than `:root[…]`, so a Settings card can paint a live preview of one
  theme inside a page wearing another.
- **A palette is five hex stops.** A theme is not hand-written. `scripts/themes/palettes.ts` holds
  one row per palette — an id, a label, a sentence and five stops dark → light — and
  `npm run themes:build` derives both modes from it in OKLCH: the neutral spine, every family ramp,
  the chart series, and the two `color-mix` tints. Adding a palette is that one row plus the build;
  `npm run themes:check` fails CI if the checked-in files do not match the generator, so the
  stylesheet can never drift from its source.
- **Nothing ships that cannot be read.** The generator measures Classic's own contrast ratios and
  treats them as floors — ink on surface, every muted grey, the till's ink, each family's text
  shade, the chart furniture — and pushes lightness in OKLCH until a derived theme meets them, or
  the build fails. `tests/themes.test.ts` re-measures the shipped stylesheet rather than trusting
  the generator: all 28 themes, every floor, plus a *distinctness* rule — any two tokens Classic
  keeps visibly apart must stay apart in every theme, so a theme cannot collapse two greys.
- **Dark inverts by role, not by number.** `accent-300` is till-eyebrow text and stays light in both
  modes; the 50/100 steps become dark tints, 700–900 become light text. The till is the one
  by-design-dark surface in a light theme and becomes the **floor** of a dark one (darker than the
  canvas), which keeps the same hierarchy rather than inverting the page's furniture. Saturated
  fills carry `--color-fill-ink` — white on light themes, near-black on dark — so a primary button's
  label is legible in both without a page knowing which mode it is in.
- **The choice is per device, in a cookie.** `sf-theme`, one year, `httpOnly`, no database row: the
  phone at the checkout can run dark while the laptop stays on paper, and nothing about the
  household's shared records changes. The layout reads the cookie server-side and renders
  `<html data-theme>`, so the first paint is already correct — there is no inline script and no
  flash. An unknown or stale value silently falls back to Classic Light.
- **Settings → Appearance** (near the bottom of the page, after Backup) lists every palette as two
  cards, light and dark. Each card is a real miniature of the app built from the same components and
  tokens — not a picture of one — so a theme that renders badly renders badly *there* first.
  Choosing applies at once and saves in the same gesture; if the save fails the page goes back to
  what the server last knew.
- **Colour is never the only signal** (§16.7) holds inside the picker too: each card names its mode
  in words and the chosen one says **In use**, so the selection does not rest on a coloured ring.
- **Links are blue and underlined, in every theme** (decision 203). The household found links by
  accident — the same weight and almost the same colour as the sentence around them, with an
  underline that appeared only on hover and never on a phone — so a link is now the familiar blue
  **and** permanently underlined: two signals that survive a theme, a colour-blind reader and a
  printed page. One token (`--color-link`) and two utilities (`sf-link` for ordinary links,
  `sf-link-arrow` for a link that is its own call to action, retaining its arrow and weight) carry
  the whole treatment. Both are underlined at rest; hover only thickens the line.
  The hue is fixed rather than read from the palette — "that is a link" is the same signal in
  Classic, Damson and Beacon — and the theme generator re-lights that one value per theme
  (light and dark) so it still clears the §15.4 legibility floors: 4.5:1 on a card, on the page,
  inside a grey strip and inside a tinted panel. A link drawn on the till keeps the till's own ink
  and its underline, because `--color-link` is a mid-tone and would not read on a dark surface.
- **The PWA exception, resolved.** `theme_color` and the manifest are read before any stylesheet
  exists, so they cannot be variables (§14). `generateViewport()` now emits the *chosen* theme's
  chrome colour — its till on a light theme, its canvas on a dark one — generated into the theme
  catalogue beside the stylesheet and checked against that theme's own token by the tests. The
  installed manifest stays pinned to the default theme, because a manifest is read once at install
  time and is a property of the installation, not of the current page.

## 16. Insights (initial scope — small and useful)

1. **Three months side by side (v1.4.0, decision 197)** — total spending and by parent category over the
   three most recent calendar months, oldest first, each middle/newest month's figure paired with its
   **Change** against the month before it (blank for the oldest column — there is nothing before it to
   compare). The month being lived is labelled "(in progress)" and is never read as a finished figure.
   Keeping three columns at all times means two complete months always compare, even at the start of a
   month; a household that began recording mid-window simply sees earlier months as blank, and the gap
   self-cures. (This was "month vs previous month" until v1.4.0: the counting rules — calendar months,
   refunds netted, voided and transferred money excluded — are unchanged.) On Overview, each
   month-to-date parent name links to Purchases filtered to that live parent category (including its
   children) from the first of the month through today (decision 179).
   **Every figure opens its line items (v1.4.0, decision 198).** Clicking a monthly total or a
   parent cell in this table opens the recorded purchases behind it — date, where, category, who it was
   for, and amount — inline beneath the table, with "Open these purchases" linking to the same rows in
   the purchases list. The open state is a real link (`?show=m:2026-09:3#month-drill`), so it works with
   JavaScript switched off and can be sent to the other person; pressing the figure again closes it. A
   row is a purchase line; a purchase with several lines shows each row whole (its note, its supplier)
   with the matching line's amount, exactly like the pie's line items (§16.7 E).
2. **Personal comparison** — each person's for-person allocations (e.g. Clothing, Hobbies), side by side,
   per month. Household allocations are **never** attributed to whoever happened to pay. Each figure opens
   its own line items in the same way (`?show=p:2:2026-10:3#person-drill`, v1.4.0, decision 198). Prev/Next
   month navigation preserves the current vertical scroll position during a soft navigation; the
   `#panel-persons-heading` fragment remains for direct/no-JavaScript visits (decision 220).
3. **Vehicle running costs** — per vehicle: monthly totals and rolling 12-month, by child category
   (fuel/insurance/maintenance/road tax/parking). On Overview, each vehicle name links to Purchases
   filtered to that vehicle from `rolling12From` through today (decision 179). Each figure opens its line
   items (`?show=v:1:rolling#vehicle-drill`, v1.4.0, decision 198); a spread row shows its month's ÷ 12
   share as the amount and the full payment as a footnote, so the rows add up to the figure being opened.
   **Annual payments (decision 190).** In running costs only, a converted annual schedule payment against a
   vehicle counts as one twelfth in each of the twelve months it covers, starting in the month it is paid, so a
   yearly premium can be compared with a monthly direct debit. The rolling 12-month total therefore counts one
   premium once, and this month and last month each show its share. Shares are whole pence, with the leftover
   pence on the earliest months, so they always add up to the payment. A month counts in full, including the
   one in progress. The spread is worked out when the figures are read and is never stored. Purchases, the
   month-on-month comparison (item 1), the personal views, the honesty loop, Horizon and Charts keep each
   payment on its due date. The rule follows the schedule's cadence and its vehicle target, not its category,
   so an annual road-tax payment against a vehicle is spread as well. A spread row is labelled "(annual ÷ 12)",
   and the Insights subtitle names this one exception to exact reconciliation with the purchase history.
4. **Projection feedback (honesty loop)** — configured weekly grocery and per-vehicle monthly fuel figures vs
   recent actuals (the last 8 complete weeks for groceries, the last 3 complete months for fuel), so drift is
   visible and fixable. Drift within −15%…+10% of the configured figure reads as normal life (v1.11.0,
   issue #27): the verdict stays friendly inside that band and only speaks more strongly — with the percent
   ("12% over") — once the drift leaves it.
5. **To-payday projection strip** — lives on Overview (§15.2) with the two warning tiers and the pot-level
   transfer watch; the phone home carries the short summary card and links to Horizon (v0.36.0, decision 186).
6. **Fuel economy (v0.10.0, §16.6)** — per vehicle mpg and fuel cost per mile from the litres and odometer
   readings recorded with fuel purchases.
7. **Charts (v0.14.0, §16.7)** — the same figures drawn, on their own page at `/charts`: the month ahead,
   the weekly shop, personal spending, the fixed commitments, and (v1.4.0) three months by category.
   Insights keeps the tables; the two always agree, because they read the same records.

### 16.6 Fuel economy — how mpg is worked out (v0.10.0)

- **Full tank to full tank, UK gallons.** A stretch starts at a full tank with an odometer reading and ends
  at the next full tank. Part fills in between add their litres and cost to the stretch. mpg = miles ÷
  (litres ÷ 4.54609); fuel cost per mile = the stretch's fuel cost ÷ its miles.
- **Honest gaps.** A stretch is not measured — and the app says why — when its closing full tank has no
  odometer reading, when any fill in it has no litres, or when the odometer did not go up. A result below
  8 or above 150 mpg is shown with "worth checking the readings", not hidden.
- **Only fuel counts.** A fuel purchase is one whose Fuel lines all go to a single vehicle; its fuel cost is
  those lines only, so a split with a shop item does not distort the price per litre. Refunds and voided
  purchases are ignored.
- **"Filled to full" is off by default (v0.11.0).** A forgotten tick on a genuine full tank only lengthens
  a stretch — its litres roll into the next full tank, so the figure stays right — whereas a mistaken tick on
  a part fill produces a wrong mpg. When a vehicle's last three or more fills have none marked full,
  Insights says "no full tank marked in the last N fills — mpg needs one".
- **Insights shows, per vehicle:** the latest measured stretch; the last 12 months (total miles ÷ total
  gallons — a ratio of totals, never an average of averages); fuel cost per mile; the latest price per litre;
  recent fills missing litres (or, on a full tank, the odometer), each linked to its Purchases row; and the
  recent fills.

### 16.7 Charts — the drawings, and the rules they all keep (v0.14.0)

`/charts` answers one question per picture: the month ahead, the weekly shop, personal spending, the fixed
commitments, where the money went (E), and how the last three months compare (F). Every figure on it is the same arithmetic the tables
on `/insights` use, over the same records, so the two can never disagree.

**A. Where the balance goes, today to a month ahead.** A step area of the **household total** (every pot,
day-to-day included) from today to one month out, from the same projection engine as Overview and Horizon.
Today's point is the household's own reported figure plus recorded activity; every later point is
projected. The y-axis **always includes zero**, with room on both sides: going below zero is a place on the
chart, tinted, not a line that clips at the axis. The overdraft limit is a dashed line when the chart
reaches that far down and a sentence in the caption when it does not. The lowest point is labelled on the
drawing, income days are ticked along the axis, and the verdict sentence states the amount and the date —
"Projected to go £1,831.27 below zero on Fri 9 Oct. That is past the £800.00 overdraft limit from Mon 28
Sept." A laptop also gets the three biggest outgoing days and a day-by-day breakdown of what lands.

**B. Is the weekly shop creeping up?** Bars for Monday–Sunday weeks of everything under the Groceries
parent — 12 weeks on a phone, 26 on a laptop — against two reference lines: the configured weekly figure
and the trailing 8-week average. **A week with no shop is a zero week, not a missing one**; anything else
would flatter the average. The week being lived is drawn hatched and never counts towards the average,
which is the honesty loop's rule (§16.4) and its exact figure. **Weeks before the household started recording
are not counted either**: recording starts at the first recorded purchase (the earliest non-voided,
hand-entered one), and a week counts only if it is complete and begins on or after that date. Those weeks
are labelled "not counted" rather than read as shopping-free (decision 183).

**C. Hers, his, household.** Stacked monthly bars — 6 months on a phone, 12 on a laptop — split into one
series per person plus a Household series. Attribution is **"For: person"**, the allocation's target, never
"Paid by": whose card was used says nothing about whose spending it was. A person's series counts every line
marked for them, whatever category it sits under (v1.11.0, issue #25): clothing bought inside a grocery shop
is still their spending, and the chart agrees with the Insights month panel that counts the same rule.
Household-marked spending (a joint takeaway, a shared subscription) is its own bar and is **never split**
between people; only the Household series keeps the discretionary scope — the parents *Personal* and
*Entertainment & Eating Out*, resolved from the live category tree rather than a fixed list of children, so
a child added under Personal is in scope the day it is created. Chips filter the chart by person; the choice
lives in the URL, and a filter click keeps the reader's scroll position. The `#personal` link also lands on
the card on a direct/no-JavaScript visit, below the sticky header. A person's bar drills down with no
category filter; the household bar keeps the discretionary-parent filter.

**D. Spending trends (issue #40, decision 223).** Monthly bars of **recorded net spending** in a
household's chosen category preset — never projected groceries, fuel or future commitments.
The title is “How is this spending changing month by month?” A dropdown selects a named preset;
`?preset=<stable-id>` makes the selection shareable, and soft selection preserves the reader's scroll
position and other query filters. Missing/deleted IDs fall back to the first preset; no presets and
explicitly empty selections show an honest empty state, never all spending.

**Create/Edit category presets** opens Settings. The household can create, rename, edit and delete
presets, using an expandable parent/child tree with mixed parent ticks. Parent selection saves the
current child IDs, not a rule that silently includes future children. Shortcuts select all categories,
select categories used by DD/SO schedules, or clear the selection. “Used by a schedule” is a category
shortcut, not a purchase-source filter: manual and schedule-generated purchases both count. Retired
categories remain available for historical spending. Deletion needs confirmation and never alters purchases.
Names are trimmed, nonblank, at most 60 characters and unique within the household (case-insensitive).

Presets are household settings (`spending_category_presets`, JSON in the existing settings table),
audited before/after, guarded against stale collection versions, refused in read-only support views,
and included in household backups without a schema or backup-format change. Before the first save,
the old `commitment_category_ids` selection appears as **Fixed commitments** (including an explicit
empty list); if never configured, existing schedule categories supply the starting selection. This
compatibility read writes nothing. The first mutation persists that starting preset alongside the
new changes. A saved empty collection never resurrects the fallback.

The old **Schedule-converted only** toggle and the long tracked-category/breakdown lists are removed.
Monthly comparison headlines, the in-progress month hatch, exact-number tables and filtered purchase
drill-downs remain. Presets classify categories only; they do not reclassify purchases or impose a
household-independent definition of “discretionary”.

**E. Where the money went (decisions 195, 207, 208).** A pie of **net spending by parent category**
over a window the household chooses, so the question "what share of our money went on each thing" has a picture.
It counts **money already spent, never a projection**, which is why it was renamed from "Where the money goes"
in v1.10.0 (issue #24): **no window runs past today**.

- **Quick windows** (decision 208): **Since last payday** (the default — the most recent payday up to today),
  **Last full payday cycle** (the payday before that up to the day before the most recent one) and **Month to
  date** (the 1st up to today). A weekend payday counts as the Friday before (decision 112). The payday dates
  come from the main salary's recorded instances, and when the salary schedule is too new to have recorded the
  earlier payday, it is worked out from the salary's cadence, so both payday windows are offered from the first
  day. With no salary scheduled at all, the chart shows month to date and says why.
- **Custom windows** need both dates, running forwards, and a start no later than today. Both date pickers carry
  `max` = today. An end date after today (typed into the URL, say) is brought back to today with a sentence
  saying so. Typed dates that match a quick window light that window's button.
- **The pickers always show the window drawn.** Pressing a quick window puts its dates in the From and To pickers,
  even when a picker had been edited by hand first (the inputs are keyed on the window, so they remount).
- The selector is a plain GET form, so the window and the category ticks live in the URL and work with
  JavaScript switched off.

- **Slices are parent categories**, counted from the same allocation lines as Insights, with refunds netted off
  their own category. **Personal is the one exception**: each person's own spending is a slice of its own
  ("Personal — Alex", "Personal — Sam"), and household-marked personal spending is a third slice that is never
  split between people. Entertainment & Eating Out stays one slice.
- **Granular parent/child category tree selector (decision 207).** The category selector starts collapsed showing
  only parent categories, with a tiny drop-down arrow beside each parent that expands to reveal its indented child
  categories (`MixCategoryTree`). Ticking or unticking a parent toggles all of its child categories, and when only
  some children under a parent are ticked the parent checkbox shows its partial (`indeterminate`) state alongside a
  `(ticked/total)` indicator. Pie slices remain grouped by parent category (and Personal by person), summing only
  the ticked child categories. Unticking a category or child category removes it from the pie and from the total.
- **A category that nets to zero or below is not drawn**, because a slice cannot be negative. It stays in the
  table with its real figure, and the legend says "not drawn". A person in Personal with no spending in the
  window still appears with an honest £0.00.
- **Clicking a slice shows its line items** beneath the pie: date, where, category, who it was for, and amount,
  with "Open these purchases" linking to the same window in the purchases list. The slice is
  a real link (`?slice=…#mix`), so the line items work without JavaScript and can be sent to the other person.
- Hand-rolled SVG, server-rendered, with the same verdict sentence, table twin, and phone and laptop figures as
  every other chart. Colour is never the only signal: the legend names each slice and gives its figure and share.

**F. Three months by category (v1.4.0, decision 199).** Grouped bars: parent categories along the x-axis,
one bar per category for each of the same three calendar months the Insights comparison table shows (§16.1),
oldest first. The month being lived is hatched and labelled "(so far)", never read as finished. The figures
come from the same read as the Insights table, so the two views cannot drift.

- **An "Exclude Housing" toggle** removes one parent — the default *Housing* name match, the same
  tree-resolution rule as the pie split — from the drawing and its total, so a category around a third of
  the spending stops flattening the rest. It is a real link (`?noHousing=1#months`), like every other
  control here, and the verdict says "Housing is excluded." while it is on. The category excluded is never
  deleted: the toggle puts it back with one press.
- **Each bar is a drill-down link** to its own month and category in the purchases list, repeated per cell
  in the table twin (a row per category, a column per month, a totals row), which is the keyboard path.
- **Categories the household never recorded are left out**, but a category with a zero month still gets an
  honest zero bar; rows are ordered by the three-month total, biggest first.
- **The axis carries abbreviated names** (decision 201) — "Grocer'", "Person'", "Vehicle'" — each with its
  full name as the hover hint, so a crowded category list still reads; the apostrophe is the honest signal
  that a name was shortened, and the table twin always spells every name out.
- **The drawing scrolls sideways rather than crushing its bands** (decision 201): bars stay thin and a band
  never falls below a minimum width, so a long category list simply makes the drawing wider than its column.
  The sideways swipe is the browser's own overflow scrolling — finger drag with the platform's momentum,
  no scroll-snap and no scripted touch handling to fight the finger — and small ◀ ▶ arrows (plus a desktop
  pointer drag) nudge it in steps. The arrows are the one hydrated client-side control on the page (the
  enhancement documented as decision 201): the drawing and its scroll still work with JavaScript off, and
  the scroll frame keeps the page itself from panning at any width.

**Rules every chart keeps.**

- **Hand-rolled SVG, server-rendered** (`src/components/charts/`), no chart library and no client
  JavaScript: the drawing is in the first paint on a phone, with nothing to hydrate. The one documented
  exception (decision 201) is the months chart's scroll arrows — pure enhancement over native scrolling;
  no drawing depends on hydration.
- **A verdict sentence above the drawing**, and the same sentence as the SVG's `aria-label`; the SVG is one
  `role="img"` to a screen reader.
- **A table twin under `<details>`** for every chart — the same numbers, exact, copyable, keyboard
  reachable, working without JavaScript.
- **Reported vs projected is always stated**, as a badge and in words.
- **Colour is never the only signal**: every series is named in a legend and in the table twin, and an
  in-progress period is hatched as well as labelled.
- **Two figures, two sets of SVG ids** (decision 202). Every chart is drawn twice — a phone figure and
  a laptop figure, one of them hidden by CSS — and an `id` is document-global, so figures that share
  one borrow each other's paint servers: `url(#…)` resolves to the first copy in the DOM, and when
  that copy sits inside the hidden figure the fill paints **nothing at all**. Each drawing therefore
  namespaces every pattern it defines with its own variant, and an in-progress bar is drawn as
  **two rects** — a solid muted bar with the hatch over it — so the period is still readable if a
  paint server ever fails again. A browser spec reads the drawing's own pixels back (an in-progress
  bar has to have paint in it) and checks that no id inside one figure is shared with, or resolves
  into, another.
- **Drill-down is a real link.** A bar wraps an `<a>` at `/purchases?from=…&to=…&categoryId=…` (the same
  link is repeated in the table twin, which is the keyboard path), so it can be opened in a new tab or sent
  to the other person. Those filters match the **purchase**, and a matched purchase comes back with all of
  its lines, receipt-style — so a split shop appears whole, not as the single line that matched. The page
  says so.
- **Responsive by `viewBox` and two variants**: a 320px-wide drawing for a phone, a 720px one for a laptop,
  chosen by CSS. Neither pans the page sideways at 320px, or at 360px with 130% text.

Later candidates (explicitly **not** v1): supplier top-N, category trends beyond the three months of F,
cash-vs-card mix, seasonal comparisons.

## 17. Worked examples (all figures fictional)

Personas: Alex and Sam. Pots as §4. Config (fictional): payday = 26th; salary £2,150.00 monthly into Salary
account; `weekly_groceries` £90.00; `monthly_fuel` Vehicle A £75.00, Vehicle B £60.00; authorised overdraft
limit on Main £800.00; warning threshold £250.00. Schedules (fictional): Energy DD £84.55 due 28th (Main,
Utilities/Energy, household); Mortgage DD £685.00 due 1st; Council Tax DD £178.42 due 1st; Broadband DD
£42.00 due 3rd; Mobile DD £24.99 due 10th (all Main).

### E1 — Mixed Tesco receipt (mobile acceptance scenario)

Saturday the 27th, 14:10. Alex walks out of Tesco, one card payment **£63.47** from Main. Entry: supplier
"Tesco" (remembered; Groceries chip preselected) → amount 63.47 → **Split**: line 1 Groceries/Weekly Shop
£41.98 target *household* (default chip, untouched); line 2 — Alex taps Personal/Clothing & Shoes; the target
chip defaults to *Alex* (payer) but the clothes are Sam's, so Alex taps it once → *Sam*. Lines total £63.47 =
payment total → save enabled. Paid-by Alex (default), entered-by Alex (audit). Insight effect: £41.98 to
household Groceries; £21.49 to **Sam's** personal Clothing total — not Alex's.

### E2 — Fuel stop (mobile acceptance scenario)

Alex fills **Vehicle A**, £58.20. Home → Add Fuel: payer Alex, target *Vehicle A*, category Vehicle
Running/Fuel, pot Main — all prefilled as visible chips; Alex types 58.20 and saves. Two taps plus digits.
(If Alex had filled Sam's Vehicle B, one tap flips the vehicle chip — the cost still belongs to Vehicle B.)
Since v0.10.0 Alex may also type **40.12** litres and the odometer **52,622**, tick left on "Filled to full";
the last full tank was at 52,310 miles, so the save answers "Vehicle A: 35.4 mpg over 312 miles since the
last full tank. 40.12 L at 145.1p/L." Left blank, the purchase saves exactly as before and the numbers can
be added from Purchases later.

### E3 — Direct debit lifecycle: counted exactly once

Energy DD £84.55, due the 28th, from Main.

| When | Instance state | Where the £84.55 appears |
|---|---|---|
| 26th (before due) | UPCOMING | Projection only: reduces `projected_low`; listed in due-this-week. Not in the estimate. |
| 28th (due date, local midnight) | CONVERTED | Ordinary spending record dated 28th, tagged "from schedule", pot Main. Now inside `estimate(Main)` (checkpoint predates it). Removed from UPCOMING lists the same moment. |
| 30th, Alex checkpoints Main at £412.35 (ledger now includes it) | history | Record dated **before** the new checkpoint → excluded from the fresh estimate (already inside the reported balance). Still in history and insights. |

At no instant is the instance in two states; at no checkpoint is it subtracted twice. If the bank is late or
the DD is cancelled, the converted record is edited/voided (audit trail) and the schedule ended with an
effective date — future instances stop; past ones remain history.

### E4 — Transfer between pots

25th: the users move **£400.00** Salary → Main to cover the 1st's mortgage. Recorded as a transfer:
`estimate(Salary)` −£400, `estimate(Main)` +£400, `household_available_now` **unchanged**. No spending
insight, no category, no effect on `projected_low`'s day-to-day figures. Transfers can never inflate spending.

### E5 — The assume-cleared limitation (honest walkthrough)

Saturday 21st, 16:00: Sam buys £45.99 at a supermarket (card, Main). Sunday 22nd, 17:00: Alex checkpoints Main
at **£412.35** — the bank's *ledger* balance, which does **not** yet include Saturday's still-pending £45.99.
The app assumes pre-checkpoint purchases are included, so it reports available = £412.35. Truth at the bank:
once the purchase clears, £366.36. **The estimate overstates by £45.99 until the next checkpoint.** Agreed and
documented (§5, §7.4): zero admin, self-correcting, bounded by whatever was pending at checkpoint time. The
UI never claims the estimate is bank-verified; "last checkpoint Sun 17:00" is always visible.

### E6 — Backdated entry is absorbed, never double-subtracted

Wednesday 25th: Alex remembers a Tuesday 24th purchase of £12.50 and backdates it. Latest Main checkpoint:
Sunday 22nd 17:00 → the record is *after* the checkpoint → subtracted from the estimate (correct — the bank
has taken or will take it). Later, Alex checkpoints again on Wednesday evening; the bank ledger now includes
the £12.50, and the record predates the new checkpoint → excluded from the fresh estimate. Counted exactly
once at every stage.

### E7 — Both users record the same purchase

14:10 Alex saves the Tesco £63.47 (E1). 14:31 Sam, not knowing, saves Tesco £63.47 from Main. On save, Sam
sees the non-blocking notice: "Alex recorded a matching entry 21 minutes ago — is this a duplicate?" Sam taps
through, confirms, and voids their copy. The voided record remains in the audit trail; totals unaffected.
Had it been two genuinely identical purchases, Sam would simply dismiss the notice.

### E8 — To-payday projection with warning tiers (forecast acceptance scenario)

Friday 27th, 20:00. Checkpoints: Main £412.35 (26th 18:05) − E1's £63.47 recorded since = **£348.88**;
Salary £520.00 (26th); Alex's cash £41.20; Sam's cash £28.62.
`household_available_now` = **£938.70**. Next payday: the 26th → `days = 29`.

Outgoings in window:
- Commitments due: Energy £84.55 (28th) + Mortgage £685.00 (1st) + Council Tax £178.42 (1st) + Broadband
  £42.00 (3rd) + Mobile £24.99 (10th) = **£1,014.96**
- Projected day-to-day events (§7.3, v0.6.0): the last Weekly Shop is E1's Tesco run, **today** (the 27th),
  so shops are projected every 7 days from it — 4th, 11th, 18th, 25th — **4 × £90.00 = £360.00**. The last
  fills: Vehicle A £75.00 on the 12th → next fill **12 October**; Vehicle B £60.00 on the 8th → **8 October**
  — **£135.00** between them. Total day-to-day: **£495.00**.

Receipts in window: salary **£2,150.00** on the 26th.

```
running low, day by day: 938.70 → 854.15 (28th, Energy) → −9.27 (1st) → −51.27 (3rd)
  → −141.27 (4th, weekly shop) → −201.27 (8th, fuel B) → −226.26 (10th, Mobile)
  → −316.26 (11th, shop) → −391.26 (12th, fuel A) → −481.26 (18th, shop)
  → −571.26 (25th, the cycle's last shop) → +2,150.00 lands on the 26th → £1,578.74
projected_low = −£571.26 on the 25th   (the last weekly shop of the cycle, just before salary)
```

Tier check: −£571.26 ≤ −£250.00 → **Tier 2 Warning**: "Projected to be more than £250 overdrawn before
payday." (Had it fallen between £0 and −£250, only the Tier 1 heads-up would show.) Horizon owns the dated
breakdown of the five commitments, salary and the projected day-to-day events; the home summary and Overview
keep the corrected figures and link to that detail.

Pot-level transfer watch (§7.5): `pot_watch(Main)` = £348.88 − £1,014.96 = **−£666.08** → distinct notice:
"Main account has the worst bills-only shortfall: £666.08 (upcoming Direct Debits next due 28th September —
Energy). If projected day-to-day spending also comes from Main account, the guide shortfall is about £1,161.08
— a guide, not a strict pot allocation. Aim to transfer at least £666.08 into Main account as soon as you can."
The household warning and the transfer nudge are separate signals with separate remedies; the pot watch remains
bills-only.

### E9 — Tracked agreements and key-date alerts (fictional)

- **Insurance policy:** "Vehicle A insurance — InsurerCo", explicit kind `insurance`, target Vehicle A,
  provider auto-renew `yes`, renewal date 12 October, 21-day reminder lead, annual app reminder enabled.
  From **21 September** the Overview and Tasks surfaces say the policy renews in 21 days and link directly
  to its agreement card. On 12 October the date may advance one year (visible and audited) because provider
  auto-renew is explicitly yes. If the provider status were `no` or `unknown`, the date would stay on 12
  October for review until the household updated it. An annual premium is still a separate annual schedule.
- **Service agreement:** BroadbandCo fibre has a fee-free switch date of 3 November and an optional link to
  its £42 monthly direct-debit schedule. From 13 October its alert says it can be switched without an exit
  fee in 21 days. The schedule keeps forecasting and the bank instruction remains untouched after that date.
- **Grouping is explicit:** Vehicle B insurance with provider auto-renew `no` remains beside Vehicle A in
  Insurance policies; user-defined spending categories never decide whether something is insurance.

### E10 — Cash handover between the two people (transfer acceptance scenario)

Sam has £500 in personal cash; Alex has £50. Alex asks Sam for £200 towards a coat, and Sam hands
over the notes. Alex records a transfer there and then (Move → Between pots): Sam's cash → Alex's
cash, £200, note "coat money". `estimate(Sam's cash)` −£200, `estimate(Alex's cash)` +£200,
`household_available_now` **unchanged**, no spending insight touched — and the next morning the
history says exactly why both pots moved. Alex then buys the coat and logs it as
Personal/Clothing & Shoes against Alex's cash, which is the spending.

### E11 — A family loan, borrowed and repaid (debt acceptance scenario)

A family member lends the household £1,000 in cash to help cover direct debits until spring. The
users track a debt ("Mum", we owe) and record borrowing of £1,000 into Alex's cash. The pot
estimate rises £1,000 **and** the Overview shows "Owe others £1,000" beside "available now" — the
money is spendable and the owing is visible, in the same glance, never labelled as income. Paying
the cash into Main is an ordinary internal transfer (Alex's cash → Main, £1,000). Months later a
repayment of £250 from Main lowers the estimate and the owed balance together — never spending —
until the debt reads "settled" and stays as history.

**Expected inflow — planned, changed and stopped (v0.5.0; live plan from v0.7.0).** The household also sets
Mum's debt to *expect £1,000 support on the 12th* — the money she reliably sends while the loan is live —
and, because the arrangement runs for a known stretch, an **until date** of 10 February, its last payment.
The estimate does not move, the Income page shows nothing new, and no `BAC` row appears: an expectation is not
a receipt, and the pot never moves on a promise. The projection (§7.2) and the horizon (§7.6) do show it,
flagged `expected`: money in on the 12th (or the Friday before when the 12th is a weekend), into Alex's cash,
one occurrence a month through the until date inclusive — and nothing from March. On All Transactions (§15.3)
an `EXP<` row appears on the due date, flagged `expected — not recorded yet` and outside the totals, as the
nudge to record the Borrow; it gives way to the real `LN<` the moment that month's money is recorded. If the
parents move the payment to the 13th, the household edits the day and only what is still expected moves —
months already recorded stay exactly as they were, and the next occurrence is the 13th. A month that goes by
unrecorded is not treated as late: the next one still projects, because the expectation is a plan, not a
promise. And a debt that has **never had a movement** is not settled — it is the very debt this arrangement
exists for, so it projects from the day the expectation was set; once it *is* settled (movements recorded,
balance at zero) it expects nothing at all.

### E12 — Cash for a bank transfer (swap acceptance scenario)

Their son is paid £120 in cash and hands it over; the household transfers £120 from Main to his
bank account. One action (Move → Swap): money in £120 to Alex's cash, money out £120 from Main,
counterparty "our son", recorded as an atomic pair. Both pot estimates move in opposite directions by
£120; on a later date `household_available_now` is unchanged, and if the swap is recorded before a
same-day checkpoint the total may read £120 low until the next checkpoint (E13 — the in-leg is already
in that count, the out-leg still counts). A swap recorded after the checkpoint moves both pots.
Insights see nothing — no phantom income, no phantom spending. If the cash never arrives, the pair can
be voided in one step with a shared reason, or one leg voided alone, leaving the other visible as the
survivor rather than vanishing by cascade.

### E13 — Same-day swap, same-day checkpoint (v0.2.1 acceptance scenario)

Alex's cash is checkpointed at £20.00 on the 22nd. On the 23rd the son's wages arrive: a swap of
£80.00, recorded date-only (in-leg into Alex's cash, out-leg from Main).

1. 22nd, 10:00 checkpoint £20.00 → Alex's cash estimate **£20.00**.
2. 23rd swap in £80.00 (later date than the 22nd's checkpoint) → **£100.00** (£20 + £80).
3. 23rd, 12:00 the cash is counted and checkpointed at £100.00 — the count already includes the £80
   in hand, and the swap was written down *before* this checkpoint → estimate **£100.00**, not £180.00
   (the v0.2.0 bug: the date-only credit shared the checkpoint's date and was counted again).
4. 23rd, 18:00 a second £100.00 checkpoint → still **£100.00** — the credit is still older than the
   checkpoint, so it stays absorbed.
5. 24th, 09:00 a £100.00 checkpoint → **£100.00**, as it always was.

The opposite order is not E13. Checkpoint Natwest at −£443.65, *then* record £1,500 in from Nationwide
the same day: the credit was written down after the count, so the estimate is **£1,056.35**. The v0.2.1
blanket absorb left that pot on the checkpoint until the next report (2026-09-26 field report).

The out-leg sits in Main: with Main uncheckpointed it produces no estimate (a pot without a checkpoint
has no estimate — no phantom number is invented). Had Main been checkpointed at 12:00 on the 23rd, after
the swap was recorded, the out-leg (a same-day debit) counts against it and Main reads £80 low until
Main's next checkpoint — the safe direction, self-correcting, while the in-leg is absorbed. Acceptance:
steps read 2000 / 10000 / 10000 / 10000 / 10000 pence; live v0.2.0 data self-heals under the new rule —
no migration.

## 18. Backup, restore and data locations

Encrypted backup and verified restore remain first-class requirements. The archive integrity, encryption and
crash-recovery lessons from the original implementation carry forward only where they do not conflict with this
edition's tenant boundary. Every backup and restore in this edition is scoped to exactly one household; this
section defines the target contract, including its own documents directory (§23).

### 18.1 Data locations (fixed by the product owner)

Host path on Unraid: **`/mnt/user/appdata/simple-finance-multi-household`**, mapped to container **`/data`**:

```text
/mnt/user/appdata/simple-finance-multi-household/  →  /data/
  .env                                           Cloudflare/bootstrap secrets (root-owned, 0600)
  system/registry.sqlite                        household roster, assignments, roles and support grants only
  households/<opaque-household-id>/
    simple-finance.sqlite (+ -wal / -shm)         this household's SQLite data, WAL mode
    documents/                                    this household's receipt/invoice attachments (§23)
    logging/                                      this household's logs, if retained
```

`system/registry.sqlite` is control-plane metadata only; it must never contain finance rows, balances or receipt
content. Each household's path is derived from a verified identity's trusted registry assignment and a stable,
opaque household ID. Do not accept a filesystem path or household ID from the browser. The original production
installation remains at `/mnt/user/appdata/simple-finance` and must never be mounted by this container.

- The entrypoint prepares any missing directories with sane permissions, applies pending migrations, then
  `exec`s the server (blueprint §7). Migration failure prevents normal startup.
- `.env` semantics per blueprint §7: shell-sourcing an env file executes shell code — it is a trusted,
  admin-only file, never editable by untrusted users, never committed to Git, never copied into the image
  build context, and **never included in a household backup archive**. A separate recovery checklist covers
  recreating secrets and the system registry.
- Every household database and its `documents/` directory are durable user data; no household's durable data
  lives only in the container layer. Runtime paths must remain within that household's directory.
- `.gitignore` mirrors the new runtime paths so a stray development copy can never reach this public repo.

### 18.2 Backup contents and exclusions

A backup is created for one authenticated household at a time. It can never enumerate or include another
household's database, documents or registry data. The administrator/system registry has a separate recovery
procedure (accessible via the admin panel, producing a `simple-finance-registry-v<app-version>-YYYY-MM-DD-HHmmss.sqlite` WAL-safe dump) and is not bundled with member-downloadable household backups.

- A consistent SQLite snapshot via the supported backup mechanism (WAL-safe, not a raw file copy), **plus**
  every `documents/` file referenced by the selected household database, **plus** a versioned manifest: archive format,
  producing app version, creation instant (Europe/London, generated from the same instant as the filename),
  file counts/sizes, per-document sha256 hashes, and the metadata needed to validate restoration.
- **Excluded:** all other households, `system/registry.sqlite`, `.env` and any secrets; `logging/`.
- Consistency boundary: an attachment is referenceable only in `stored` state after its file is fully written
  (§23.3); backup coordinates the database snapshot with document enumeration so a valid archive can never
  reference a missing file. Orphan files (present but unreferenced) are reported, never silently included or
  silently deleted. (As built, Phase 5 reads the document list from the snapshot itself and fails the backup
  — HTTP 409 — if the snapshot references a file the disk has lost; `manifest.documents.orphans` reports the
  reverse case.)
- A receipt the household has removed (§23.4) is no longer `stored`. A later archive does not include that
  file and does not list it as an orphan once the file has been unlinked. An archive taken **before** the
  removal still contains the receipt — that older archive is the only way back. Removal never changes the
  archive format, and it never unlinks the file before the database has recorded the removal: the other
  order would make the next backup fail closed if the process died in between.
- Archive layout (format 2, as built): the encrypted stream wraps a tar holding exactly `db.sqlite` (the
  WAL-safe snapshot), `manifest.json`, and `documents/<fileKey>` for each `stored` attachment the snapshot
  references. `manifest.json` records `formatVersion`, the producing version, the creation instant, row
  counts, the document summary and `files[]` with per-file byte length and sha256 — it holds hashes of every
  member except itself. Format 1 (a bare encrypted database, no documents) remains restorable; format 1 with
  a manifest that references attachments is refused rather than restored incompletely.

### 18.3 Encryption, filename, download

- Encrypted before the archive reaches the browser: AES-256-GCM with a scrypt-derived key, fresh salt and
  nonce per archive (reviewed primitives per blueprint §6). The recovery password is **never persisted**;
  losing it loses the archive — stated plainly in the UI and README.
- Filename contract: `simple-finance-backup-v<app-version>-YYYY-MM-DD-HHmmss.simple-finance-backup`, date and
  time from one instant in Europe/London (seconds included so two archives taken in the same minute cannot
  collide on disk). The client-side blob download must carry the server filename into `anchor.download`
  (the blueprint's v0.2.21 regression lesson) with a fallback; the real client path is tested, including
  midnight and DST.
- Downloads are user-managed: **no implied scheduled offsite backup and no server-side retention.** The
  README explains how often to take archives, where to keep them, and what password loss means.

### 18.4 Restore

Authenticate and authorise; resolve the selected household from the verified identity and trusted
registry, never from a browser-supplied path; require explicit destructive-replacement confirmation; enforce
bounded upload limits; authenticate the encrypted archive before trusting contents; reject unsafe paths,
traversal and unsupported formats; validate manifest, document hashes and schema compatibility **before**
touching live data; stage replacements **on the same filesystem as that household's destination** (EXDEV
lesson — `/tmp` and `/data` may differ on Unraid); preserve recoverable old data until the replacement fully
succeeds; the database-and-documents swap is not one atomic transaction, so rollback and crash recovery are
implemented and tested; reopen the app against that household's data, refresh the UI, and never overwrite or
delete another household's recoverable copy on an error path.

**Schema compatibility, as built (v0.10.0).** The live app is migrated by the container at start-up and a
live restore does not restart it, so the restore settles the schema itself, on the staged copy, before the
swap: a backup made by a **newer** version (it has a migration this version does not ship) is refused with
"update the app, then restore it"; a backup from an **older** version has the pending migrations applied
exactly as a container start would, then its integrity and foreign keys are checked again. Either way a
failure leaves the live data as it was.

### 18.5 Rehearsal requirement

Before real household data is entrusted to an installation, a backup must be restored into a **clean isolated
installation** and verified — records *and* attachments (blueprint §12). Rehearsals never run against the
live household installation.

## 19. Security and repository privacy (binding rules)

- Cloudflare Tunnel + Access + Google sign-in, server-side JWT verification via `jose`; Cloudflare's email
  policy is the outer gate and the app's pre-provisioned roster assigns verified identities to one household.
  Every page, server action, API, document operation, backup and restore resolves household context from trusted
  server-side identity/membership and fails closed if it is missing or inactive. A user-controlled household ID
  is never authority. The dev identity remains available only behind the dev flag **and** dev-environment check.
- A household's own members have shared visibility. The platform administrator has no standing in-app access to
  other households' finance data; support viewing requires a household member's explicit, visible, time-limited,
  revocable and audited grant, read-only by default. Host administrator access to raw Unraid files is an accepted
  limitation and is not represented as cryptographic secrecy from the host owner.
- Database handles, attachments, cache keys, errors, exports and backup/restore staging are tenant-scoped. A
  single mutable process-wide "current household" or database pointer is forbidden; concurrent requests for two
  households must not share context or data.
- Public repository: fictional data only, everywhere (§ privacy notice). Real databases, backups, receipts,
  uploads, exports and `.env` files are ignored by `.gitignore` and stored only under the installation's
  appdata. Demo/seed data lives in tracked source paths, is fictional, and resolves to isolated paths.
- No bank credentials are ever requested, stored or referenced; the product has no bank integration.
- Staged diffs and generated artefacts are reviewed for sensitive content before publishing (handoff §7).
- Destructive tests and restore rehearsals run against isolated installations, never the live household data.

## 20. Agreed decisions vs open questions

The multi-household decisions recorded 2026-10-10 supersede conflicting single-household assumptions earlier
in this inherited specification: one or two members per household; a pre-provisioned email-to-household roster;
per-household SQLite and documents; per-household backups; app-level consent-based support access; the new
appdata root and host port. See [`docs/MULTI_HOUSEHOLD_PLAN.md`](MULTI_HOUSEHOLD_PLAN.md). Earlier examples and
historical release references remain domain examples, not permission to share records across households.

The complete dated decision log lives in `docs/IMPLEMENTATION_PLAN.md` (§ Decision log). Open questions
(e.g. income-schedule working-day shift toggle, dedupe window length, checkpoint effective-date granularity,
camera file formats, attachment size limits, the 29 February renewal rule) are listed there; **none block
Phase 0–1** and each has a proposed default.

## 21. Suppliers: contact cards and interactions

Suppliers grow beyond autocomplete: each has an optional **contact card** and an **interaction log**, on a
dedicated Suppliers page (desktop-first; fully reachable on mobile — this is review territory, per §15).

### 21.1 Contact card

Optional fields: phone, email, website, postal address, free-form notes, plus **label→value reference pairs**
(fictional examples: "Policy Number — Vehicle A" → "ABC123"; "Account Number" → "XYZ789"). Purpose: when
something goes wrong, the number or policy reference is in the app — tap-to-call on mobile — instead of being
dug out of paperwork. Contact cards are visible to both users (§3 full mutual visibility) and audited on
change like every record.

### 21.2 Interactions

**"+ Create Interaction"** on any supplier: date/time (defaults now), channel (call / email / letter /
in person / other), summary of what was said or sent, optional outcome, optional link to a related purchase or
renewal. `recorded_by` is audited; both users see and add interactions.

**A promised follow-up is a task (v0.25.0, decision 175).** The form's optional **Follow up by** date and
optional follow-up words (default "Follow up with <supplier>") create a **task** about the supplier (§25) in
the same transaction as the interaction — both are saved or neither is. The task stays listed, overdue first,
until someone ticks it; it no longer disappears the day after its date, which is what the v0.24.0 date column
did. No notification is sent (decision 19). Existing follow-up dates were migrated into tasks by migration
0013, which dropped the old column.

**Every line of a log entry is labelled** — "Interaction: Sun 27 Sept · Phone call", "Outcome: …", "Logged
by: Alex", "Follow up by: Sat 3 Oct — In 6 days" (or "— Done …") — and dates are printed in words with
the year added when it is not this year. A bare "2026-11-01" under a call could be read as the day of the
call, the day it was written down or the day something was owed; it no longer appears. "Logged by" shows
the person's name when their sign-in email is linked in Settings, else the email.

### 21.2a Deep links to a supplier card (v0.12.1)

A schedule on Recurring Payments, a fixed-term contract end and a follow-up row on Contracts & Renewals
each paint a link that names the supplier it came from — `/suppliers?supplierId=<id>`. The Suppliers page
opens on that supplier: the card is expanded, the "Filter suppliers" box holds its name, and the card is
scrolled into view under the sticky header (measured landing offset, decision 216). Clearing the
filter leaves the card open and shows the rest of the list beside it. `?q=` (a name search) and `#supplier-<id>` / `#<supplier name>` are accepted too, an
identity the household no longer holds falls back to the plain list rather than naming a wrong card, and a
plain `/suppliers` visit is unchanged.

### 21.3 Privacy

Contact details, policy numbers and interaction summaries are real personal data: they live only in the
private installation. Repository demos and tests use fictional suppliers ("InsurerCo", "BroadbandCo") with
invented numbers, and screenshots are reviewed before publishing (§19).

### 21.4 Recent purchases say who each one was for (v0.18.0)

The card's **Recent purchases** list (the five most recent, each with its receipts) names the payment as
well as dating it: `2026-10-25 · £28.99 · Mobile Phones (Matthew)`. The **target is words** — the person,
the vehicle or `household` — because one supplier legitimately holds one contract per person, and a list of
`date · amount` alone forces the household to tell three mobile contracts apart by price. This is the same
rule the rest of the app already follows: All Transactions renders `Utilities / Mobile Phones (Matthew)`,
and Insights and Charts split by target. Colour is never the only signal (§16.7), so the target is never a
tint or an icon on its own.

A purchase **split across several targets** shows its first line and counts the rest — `Weekly Shop
(household) +1 more` — which is All Transactions' convention, so the two lists read the same way; the full
split stays one click away on Purchases. The card shows the **child** category only (`Mobile Phones`, not
`Utilities / Mobile Phones`): the cards sit two-to-a-row on a laptop and full width on a phone, and the
supplier already implies the parent. Voided purchases keep their struck-through styling.

## 22. Contracts, renewals and key-date alerts

Contracts & Renewals is the authoritative register for provider terms and review dates. Recurring Payments
remains the source of truth for expected money movement. A tracked agreement may exist without a schedule;
a schedule may be linked to at most one agreement. The link is navigational and descriptive — it never
changes a bank instruction or makes a payment stop automatically.

### 22.1 Tracked agreements

Each agreement carries a name, explicit kind (`insurance`, `service` or `other`), optional supplier, household /
person / vehicle target, notes, version and audit history. Insurance is classified explicitly by this kind,
never inferred from household-defined category names. Insurance policies stay grouped together whether the
provider auto-renews them or not. Insurance also records provider auto-renew as `yes`, `no` or `unknown`; the
field is not a substitute for the app's reminder settings.

A tracked agreement may link to one active recurring direct-debit or standing-order schedule. The schedule
continues to own amount, cadence, category and converted payment history. Both pages link to the other record.
Legacy renewal rows and schedule `contract_ends_on` values are backfilled into the register without deleting
the source rows. Source ids preserve compatibility and allow the alert engine to avoid duplicate legacy alerts.
The legacy renewal APIs and standalone records remain available for older callers.

### 22.2 Renewal and switch dates; annual reminder behaviour

An agreement may carry two independent dates:

- **Renewal / review date** — when to check the price, arrange replacement cover or review terms.
- **Fee-free switch date** — the earliest date the household can switch or cancel without an exit fee. It is
  not a payment stop date; the service and its schedule may continue beyond it.

Each date has its own optional in-app reminder lead (default 21 days when enabled). The app never sends an
external message. The annual app reminder cycle is separate from the provider's auto-renew setting. A policy
can be marked as having an annual date, but the app advances that date only when provider auto-renew is
explicitly `yes`. A `no` or `unknown` policy date remains due/past for review until a household member updates
it after confirming cover; the app never silently assumes a renewal occurred. On an eligible advance the old
date is visible in the agreement and audit history, and 29 February clamps to 28 February in non-leap years.

Older standalone renewal records retain their legacy behaviour and API. Legacy schedule end dates are
migrated as switch dates with their own 21-day in-app lead. Unlinked legacy dates can still use the old global
warning defaults in Settings; modern agreement dates use their own leads.

### 22.3 Where alerts appear — and the delivery channel

- **Overview key dates and Tasks / "The app has noticed":** tracked agreement renewal and switch dates,
  standalone legacy reminders, any unlinked legacy schedule end dates, and credit-card payment/promotion
  dates. Alerts inside their warning window are sorted by date; a past fee-free switch date reads available
  now, while a past policy date stays a review prompt. Each item links to its agreement, legacy row, schedule
  or card. Linked schedule end dates are not emitted a second time.
- **Contracts & Renewals page:** the grouped agreement register has visual priority, followed by credit-card
  payment reviews and **"Follow-ups you promised"** — every open supplier task (§25), overdue first, naming
  and linking its supplier card. Overdue supplier follow-ups do not disappear when their date passes.
- **Channel: in-app for v1**, consistent with decision 19 and the users' 4–5-day checkpoint cadence. An
  optional **email alert channel is a recorded v2 roadmap item** (SMTP configuration, delivery-failure
  handling and tested delivery — scoped separately when reached); it is deliberately not a v1 blocker.

## 23. Receipt and invoice attachments

Any purchase can carry **attachments** — receipt or invoice photos/scans. v1 formats: PNG, JPEG, PDF;
multiple per purchase; per-file size limit (10 MB, plan OQ12). A household can remove one receipt later (§23.4); that is not automatic pruning.

**Income records too (v0.10.0).** Every entry in "Income received" on the Income page can carry documents —
typically a one-page payslip, and as many as needed. They go through exactly the same pipeline (sniffed
PNG/JPEG/PDF, 10 MB, private serving, audit, backup and restore, removal as §23.4). The file picker does not
force the camera there: a payslip is as often a PDF from the employer's portal as a sheet of paper. A voided
income record keeps its documents viewable but takes no new ones.

**Suppliers too (v0.25.0, decision 175; resolves plan OQ10).** A supplier card has a **Documents** section
for letters, policy documents and terms that belong to the supplier rather than to one purchase — same
pipeline, same rules: sniffed PNG/JPEG/PDF only (no `text/plain`: a policy number belongs in a reference
pair, §21.1), 10 MB, private serving, audited against the supplier, in the backup, removable as §23.4.

Each attachment belongs to **exactly one** purchase, income record or supplier; the table's CHECK constraint
enforces the same rule as the upload action.

### 23.1 Capture flows

- **Desktop:** file picker during purchase creation, or retroactively from the purchase detail.
- **Mobile:** standard camera capture (`accept="image/*" capture`) during entry, or attach later from the
  phone gallery via the purchase detail. (As built, the input accepts PNG/JPEG/PDF with
  `capture="environment"`; the saved file is classified by content sniffing, so a photo that arrives as
  HEIC is offered as a PNG-extension target only if the bytes really are PNG — the plan's OQ9 default
  applies: the UI asks for JPEG and the household's phone normalises, with HEIC conversion out of scope.)
- **One control, not two** (decision 204). The visible control *is* the file picker: a label reading
  "Attach receipt" (or "Attach payslip" / "Attach document" for the other owner kinds) opens the
  picker, and choosing a file starts the upload by itself. There is no second button to press first,
  and no way to press an attach button with nothing to attach; while the upload runs the control
  reads "Attaching…". The input itself is visually hidden but present and focusable, so the control
  is keyboard-reachable and its focus ring is the label's. A submit button is still served for a
  browser with JavaScript off, where the same label is only a label; React hides it on mount. The
  input's value is cleared once each upload reports back, so the same file can be chosen a second
  time after a failure.
- **The till moment stays fast:** the purchase save never waits on an attachment upload. Attachment lifecycle
  is independent (`pending → stored | failed`), retryable, and a receipt can be attached days later. The
  online-only stance is unchanged (§14).

### 23.2 Storage and serving

Files live under `/data/households/<opaque-household-id>/documents/` (§18.1) with server-generated storage keys — never user-controlled paths. The selected directory comes from the authenticated household context, never a request path.
The database stores the original filename (for display/download naming only), MIME type, size, sha256,
uploader and timestamp. Viewing/downloading an attachment requires authentication; responses are private and
uncached, with `Content-Disposition` using a sanitized display name.

**In-app viewer (v0.27.0, decision 177; layout revised by decision 191; PDF drawing by decision 192):** attachment links open a native modal on phone and desktop, not a new tab or a browser window inside the installed PWA. Below 640px the viewer fills the screen; from 640px up it is a centred panel. The header holds Close, the file name (which wraps rather than being cut short) and the size. The footer always holds the actions: **Open in PDF app** for a PDF (**Share** for an image), offered when the browser can share files, which hands the file to the system share sheet so the household's own PDF app can open it; and **Download**, always offered. Images use the browser's normal zoom. A PDF is drawn page by page in the app by **pdf.js** (`pdfjs-dist`, Apache-2.0; its legacy build, so that older phone browsers run it too). Each page is fitted to the viewer's width and drawn at the device's pixel ratio, capped at 2. Only pages near the screen are drawn, and a page that scrolls well away is released, so a long document does not exhaust a phone's memory. pdf.js loads only when a PDF is opened. The same code runs on every device; nothing checks which phone it is. The reader draws pages only: text cannot be selected or searched, links and form fields are not active, and a font the PDF does not embed is drawn with a stand-in while its positions still come from the PDF. Open in PDF app always gives the exact file. A PDF the reader cannot open shows a plain message and the footer buttons. Close, Escape and backdrop dismissal return focus to the originating link without navigating or losing scroll. The modal traps keyboard focus and locks background scrolling. Loading and unavailable/offline states keep Close usable. Bytes are fetched through the same independently authenticated API with `no-store`, held only in a temporary blob URL and revoked on close. No offline document cache and no new tab. The worker is served from this app's own static files, so no PDF content or request goes to another site. Printing remains via the browser/OS PDF viewer or the downloaded file rather than an unreliable mobile print button.

### 23.3 Integrity and security rules

- MIME validated by content sniffing, not extension alone; size limits enforced server-side (Zod boundary).
  (As built: PNG signature, JPEG `FF D8 FF` and PDF `%PDF-` are the only accepted sniff results; the browser
  MIME type and the file extension are ignored; the 10 MB limit is checked before any bytes are written and
  the display name is sanitised to a basename with control characters, quotes, slashes and the Windows
  reserved set replaced.)
- Only `stored` attachments are referenceable by backups (§18.2); an orphan sweep runs at backup time and
  reports unreferenced files without deleting them.
- Restore verifies presence and sha256 of every referenced document (§18.4).
- **Real receipts are real financial data:** they must never appear in the repository, screenshots, PRs,
  issues or demo data (§19). Demo/dev attachments are generated fictional images.

### 23.4 Removal

A household can remove one receipt from the purchase row on Purchases and Suppliers. The
purchase record stays. There is no undelete in the app.

- The control posts an attachment id. The storage key is read from the row, never from the request, and
  removal does not grow a second path that builds or accepts a key.
- In one transaction the row moves from `stored` to `deleted` and one audit entry is written on the
  purchase (`attachment.delete`: actor, timestamp, the file key, name, type, size and sha256). A second
  remove of the same row matches nothing and writes nothing.
- The file is unlinked only after that transaction commits. If the file is already gone, that is success.
  If the unlink fails for any other reason, the row stays `deleted` and the leftover file is an orphan —
  reported, not a failed backup, and not a rolled-back removal.
- A removed key is not `stored`, so the viewer returns 404 and a later backup neither includes it nor
  lists it as missing. An archive taken before the removal still restores that receipt (§18.2).
- The purchase's History list shows who removed it and when. The chip disappears from every page that
  renders stored receipts.

## 24. Credit-card pots, statement reviews and promotional dates

A credit card is a pot for accurate bookkeeping, not a source of liquidity:

- The card pot's estimate is signed. A purchase charged to it is spending and reduces the estimate (making
  debt more negative). The household's net `household_available_now` includes that liability; the overview
  shows total card debt separately as context.
- Paying the provider is a transfer from a bank pot to the card pot. It is not spending and leaves the
  household net total unchanged. No payment is created automatically.
- The credit limit and configurable near-limit threshold are shown as card-usage context on that card's
  Accounts, Pots & Checkpoints panel. They are never called an overdraft and do not participate in the bank-pot warning
  thresholds (§8).
- Payday and Horizon are **liquidity** projections over bank and cash pots. Card balances, DD/SO commitments
  charged to a card, receipts into a card, and expected support landing in a card are excluded from their
  liquid starting balance and cash movement lines. Credit cards are not selectable Horizon pots. A card
  liability must not trigger the §7.5 bank-pot "plan a transfer" watch. A purchase on a card is still spending
  in spending insights; excluding it from cash projection does not erase it from the ledger.

### 24.1 Monthly payment review reminder

Each card may store its usual due day of month and a configurable reminder lead (initial default: **3 days**).
The due day is clamped to the last day of a short month. When available, the exact due date and minimum amount
from the current provider statement override the recurring date and are shown together. The household copies
those values from the statement; the app never calculates, validates or predicts the issuer's minimum formula.
The current statement fields are paired and may be cleared/updated after review. A reminder asks the household
to check the statement and choose an amount; it is not a fixed repayment, an autopayment, or a presumption of
full repayment. A recorded bank-to-card transfer only records what the household entered — it does not verify
that the provider received or credited a payment.

### 24.2 Promotional end date

Each card may store the actual promotional end date from its accepted terms. A separate in-app key-date alert
uses that date and the configured lead; the app assumes no promotional duration. At or after the date, the
alert asks the household to check current card terms and the remaining balance. The product does not calculate
interest, interest paid, or a payoff schedule, and does not infer the date from a balance or a monthly payment.

### 24.3 Alert placement

Payment-review and promotional-end alerts appear in the Overview key-date panel and the Contracts & Renewals
review page, alongside other in-app key dates (§22.3). The relevant card link opens Accounts, Pots & Checkpoints. Alerts are
advisory and in-app only; no external notification, statement fetch, provider connection or payment verification
is implied.

## 25. Tasks: follow-ups that stay until they are done (v0.25.0)

A **task** is something one of us has said we will do: "Follow up with EnergyCo", "Chase the refund",
"Research cheaper tariffs". It is a record like any other (decision 175): created, changed and closed through
one validated, audited write path, with optimistic concurrency, and **never deleted**. It exists because a
follow-up date typed on a supplier call did nothing — it fell off every list the day after its date and could
not be closed or moved.

### 25.1 What a task holds

- **Title** (required, up to 200 characters), optional **detail** (up to 2,000), optional **due date** (a
  calendar date in the household's timezone; a task may be undated).
- **What it is about** — the *subject*: the household (the default), a **supplier**, a **vehicle** or a
  **purchase**. The subject must exist when the task is written; a voided purchase takes no new task. A
  task created from a logged interaction also remembers that interaction.
- **Who wrote it and when; who closed it, when, and an optional closing note.**
- A version number: a stale tick, edit or reopen (someone else changed the task first) is refused with a
  plain message, and the page shows the current state. A box never looks ticked when it is not.

Every create, edit, completion and reopen writes an audit entry. **Reopen** is allowed (a mis-tick is undone
from "Done in the last 30 days") and audited; the earlier completion stays in the history.

### 25.2 Where tasks are written

- **Tasks page:** "Add a task" with an optional due date and a choice of subject (household, a supplier or
  a vehicle).
- **Supplier card:** the interaction form's follow-up (§21.2) — one transaction with the interaction — and
  "Add a task for <supplier>" in the card's Tasks section.
- **Purchase row (Purchases page):** "Add a task" — "Chase the refund", "Return the faulty kettle". A
  purchase's open tasks are listed on its row with their boxes. Tracking a purchase as a *case* (states such
  as reported → refund promised → refunded, linked refunds) is **a later decision**; it would grow from
  `tasks`, not replace it.

Each open task can be ticked, rescheduled or reworded ("Reschedule, edit or close with a note") wherever it
is shown; a closed task cannot be edited until it is reopened.

### 25.3 Due state and order

The state is computed from the due date and the household's today (`daysBetween`, §6 timezone rules) and is
always printed as **words** — "Overdue by 3 days · was due Thu 24 Sept", "Due today", "Due tomorrow",
"In 12 days", "No due date". Colour repeats what the words say and is never the only signal (§16.7).
Open tasks are ordered **overdue → due today → later → undated**, soonest first within each, then in the order
they were written. An overdue task stays at the top until someone closes it.

### 25.4 The Tasks page

One page (`/tasks`, in the desktop bar and the drawer's "More" group) with two visibly separate groups:

- **Your tasks** — the stored tasks, each with a checkbox, grouped Overdue / Due today / Coming up / No due
  date, each row saying what it is about and linking there; below them "Done in the last 30 days" with who
  closed each one, the note, and **Reopen**.
- **The app has noticed** — items **derived** from the records, links only, **no checkboxes**: key dates
  inside their warning window (renewals, contract ends and card dates — §22, §24), recent fuel fills missing
  their litres or mileage, and a vehicle whose recent fills have no full tank marked (so no mpg can be
  worked out). Each goes away when the thing itself is dealt with — the renewal reviewed, the litres added —
  and none is ever stored as a task.

The same open supplier tasks drive the Suppliers page's "Promised follow-ups" banner and the Contracts &
Renewals "Follow-ups you promised" list (§22.3); a supplier card's header shows "2 open tasks · 1
overdue" in words.

### 25.5 Subjects in words, and links

A task's subject is printed by `subjectLabel()` — the supplier's or vehicle's name, or "£84.20 at EnergyCo on
Tue 1 Sept" for a purchase. When the subject has gone (a voided purchase), the label **degrades to the bare
kind** ("purchase", marked "voided") and the task stays listed and closable; an unrecognised kind prints
itself, **never "household"**. Tasks deliberately do not reuse the spend lines' `targetKind`/`targetId`:
`targetLabel()` answers "household" for anything it does not recognise, which would silently misfile a
task.

Links: a supplier opens its card through `supplierCardHref()` (§21.2a — the one resolver); a purchase opens
Purchases filtered to its day with the row in view (voided ones with "voided only"); a vehicle opens its
running-costs card on Insights; a tracked agreement opens its card on Contracts & Renewals; an unlinked
legacy contract end opens its schedule on Recurring; a card date opens its pot on Accounts, Pots & Checkpoints.

### 25.6 What tasks are not

- **Not a chore recurrence system.** Annual policy reminders and fee-free switch dates are agreement data
  (§22.2); only a policy whose provider auto-renews explicitly may advance itself. Card dates also raise
  key-date alerts (§24). A repeating chore list is out of scope.
- **Not external notifications.** Nothing is emailed, pushed or shown by the browser (decision 19; §22.3's
  channel). The bell (§26) is in-app only.
- **Never a money movement.** A task moves no money and changes no balance, estimate or projection.
- **The stale-pot item is not included.** Whether "The app has noticed" should also list a pot with no
  balance checkpoint for 7 or 14 days is an open question (plan OQ14), deferred by the household in v0.26.0
  — they will road-test the app and decide in a few weeks.

## 26. The bell — an in-app "needs attention" prompt (v0.26.0, decision 176)

The header holds a **bell button** on every signed-in page (desktop: at the right-hand end of the bar;
phone: in the top bar next to the menu button; hidden on `/unauthorized` and when signed out). It is a
`<button>`, not a link inside `nav[aria-label="Pages"]`. The number is **"needs attention now"**, shared
by both people in its default, but filtered by who a task is for (§25.1, §26.2).

### 26.1 What counts

- **Open tasks overdue or due today** — `taskDue` against Europe/London today — where `assigned_to` is
  null (household, both people) or equals the current user (only that person counts it, e.g. "Query brake
  disc invoice on Mercedes" only for one of us). A task assigned to the other person does **not** count
  for me, and does not appear in my bell lists; it stays visible to both on the Tasks page (SPEC §3 —
  full mutual visibility).
- **Key-date alerts** in state **today**, **past**, **available now** or **rolled-awaiting-review** (agreement
  dates, legacy contract ends and card dates — §22, §24). These are household-wide.
- **Not counted:** tasks coming up (due tomorrow or later), tasks with no due date, and key dates merely
  inside their warning window (`in-window`). Otherwise the badge would stay lit for three weeks and stop
  meaning anything.
- **Zero means no badge.** The button's accessible name carries the count in words, e.g. "Needs attention:
  3 — 2 overdue, 1 due today", or "Nothing needs attention". Words, never colour alone (SPEC §16.7).

### 26.2 Who a task is for

- **Default: everyone.** A new task is for the household — both people see it in the bell count.
- **Optional: only me.** When adding or editing a task, the form offers "Everyone" (default) and "Only me".
  "Only me" stores the current user's lower-cased email in `tasks.assigned_to`. That task only counts in
  that person's bell; the other person's bell does not count it and does not list it. The task itself stays
  visible to both on `/tasks` and on its subject card, with a label "Only for <name>" when the email is
  linked in Settings (else the email).
- **No assignee beyond that.** There is no "assign to Sam" picker in this release; the household has two
  people, and "Only me" covers the stated case. A later decision could add a full person picker.

### 26.3 The panel

Clicking the bell opens a panel. On a laptop it is a popover; on a phone, a sheet under the top bar.
`aria-expanded`, Escape closes and returns focus to the bell, and a click outside closes it.

1. **Needs attention:** the counted items. Tasks reuse `TaskCheckbox` and `TaskDueBadge` and link to their
   subject; key dates use `keyDateMessage` and `keyDateHref`.
2. **Coming up in the next 7 days:** tasks due in the next 7 days (relevant to me, as above) and
   in-window key dates, listed but not counted.
3. **Footer:** one line, "N things the app has noticed →" linking to `/tasks#noticed-heading`, then
   "All tasks →" linking to `/tasks`.

The bell must stay fresh without a reload (the main trap, §26.5).

### 26.4 Since you last looked

A small **"new" dot**, not part of the number, shows when the other person did something since you last
opened the bell. The accessible name carries "2 new since you last looked".

- **Source:** `audit_entries` rows where `entity = 'task'` and `action` is `task.create`, `task.complete`
  or `task.reopen`.
- **Filtered:** `actor` ≠ me (case-insensitively), and `actor` ≠ `system` (the 0013 migration).
- **Window:** `createdAt` > my last-seen time. A person with no row yet looks back 7 days at most, so a
  first open is not flooded.
- **Worded with names:** "Sam added “Chase the refund”", "Sam ticked “Follow up with EnergyCo”". A person's
  name comes from `people.email` when linked, else the email.
- **Cap:** 20 entries.
- **Storage:** `bell_seen (email TEXT PRIMARY KEY, seen_at INTEGER NOT NULL)` — lower-cased email. This
  is **UI state, not a record: not audited**, same as the theme cookie. Opening the panel marks it seen
  via `POST /api/attention/seen`, fired on open. The "new" list is worked out *before* updating `seen_at`,
  so it stays visible while the panel is open. Phone and laptop agree because the timestamp lives on the
  server.

### 26.5 Freshness and implementation rules

- **The root layout persists across client navigation.** A count computed in `layout.tsx` and passed to
  `SiteNav` would go stale: after navigating, at midnight (Europe/London), or when the other person changes
  something.
- **Route:** `GET /api/attention` (`dynamic = 'force-dynamic'`, `cache: 'no-store'`, 401 JSON when signed
  out) returns counts and panel items. A client `Bell` inside `SiteNav` fetches it with a relative URL on
  mount, on pathname change, and when the tab becomes visible again (`visibilitychange`). It also refetches
  on a `window` event `sf:tasks-changed` (dispatched by task forms after a successful action) and every
  5 minutes while visible.
- **Rules in one pure function:** `attentionView(tasks, alerts, auditRows, me, seenAt, today, now)` — unit
  tested — with the route as a thin wrapper.
- **Midnight is Europe/London midnight:** `toLocalDateString()` and `daysBetween`, never UTC dates.
- **E2e has one identity:** the dev bypass signs in as `alex@example.com`. To test "the other person",
  seed one task (and so its audit row) with actor `sam@example.com`.
- **No email, push, browser or sound notifications** (decision 19), and no service worker (decisions
  122–123). The bell stays in-app.

### 26.6 What the bell is not

- **Not a full notification centre.** It does not list every task, only what needs attention now and what is
  coming up soon. The full list lives on `/tasks`.
- **Not a filter for "my tasks only" on the Tasks page.** The Tasks page shows all open tasks to both
  people; the bell's personal filtering is about the count and its own lists. A dedicated "only mine"
  filter on the Tasks page would be a later decision if the household wants it.


## 27. Projects: project costing & supplier optimiser (v0.31.0 Phase 1, decision 181; Phase 2 decision 182)

A planning workspace for **future** spending: cost a purchase or a project against real quotes from
several suppliers before any money moves. Projects are planning records — they never touch pots,
purchases, estimates or Insights, and nothing on the page records a purchase.

### 27.1 The costing matrix (shared shape for every project type)

One matrix serves DIY projects now and holiday/car comparisons later, without a schema rewrite
(`PROJECTS_IMPLEMENTATION.MD` is the feature's working plan and status log):

- **Rows** (`project_items`) — what you need: name, whole-number `quantity`, `unit`, optional
  `category`/`notes`, and a `cost_frequency` (`one_off` | `annual` | `monthly`; dormant in this
  release, unlocked for TCO comparisons later).
- **Columns** (`project_suppliers`) — suppliers/merchants per project (deliberately separate from
  the §21 contact book), with phone/website/notes and the delivery rules (below).
- **Cells** (`project_quotes`) — one item's quote from one supplier (UNIQUE per item+supplier):
  unit price **inc. VAT** (integer pence), or pack-only pricing (`pack_size` + `pack_price` —
  required packs = `ceil(quantity / pack_size)`, line cost = packs × pack price), plus `product_url`,
  `in_stock` (default true) and notes.
- **Aggregation mode** (`projects.project_mode`): `'mix_and_match'` (this release — one cell per
  row, grouped by supplier) or `'compare_options'` (columns are whole candidates; vertical totals by
  cost frequency arrive with the TCO phase). A `compare_options` project can be created and carries
  an honest "arrives in a later phase" note.

### 27.2 Delivery rules (per supplier)

- A **flat delivery fee**, incurred **once** when ≥1 selected item is ordered from that supplier
  (two lines from one supplier pay one fee).
- An optional **free-delivery threshold** on that supplier's materials subtotal: met → delivery £0
  (stated as "Free delivery (over £X)"); missed → the fee, with a **"£X away from free delivery"**
  hint.
- **Click &amp; Collect**: the supplier may offer it; when the order is set to `collect`, delivery is
  £0 regardless of fee or threshold. Suppliers with no selected items pay nothing.

### 27.3 Manual selection and the order breakdown

Clicking a quote cell selects that supplier for the row (stored on the item as
`selected_supplier_id`); only a supplier with a quote for an item can be selected for it (an empty
cell is "not stocked"); the "No supplier" column clears a pick. Out-of-stock quotes can be selected
but are flagged everywhere they appear.

The **Shopping List &amp; Order Breakdown** groups every selected line by chosen supplier —
supplier name/phone/website, lines with quantity and product links, materials subtotal, the
delivery verdict and the supplier total — and the **Project Grand Total** footer sums materials +
delivery against `projects.target_budget_pence` when set (under/on/over in words).

### 27.4 DIY entry helpers

- **+20% VAT helper** on the quote price: builders' merchants quote ex. VAT; the button rewrites the
  typed price × 1.2 (exact integer pence, half-up). The stored price is always inc. VAT.
- **Pack sizes**: entering pack size + pack price makes the cell a pack-only quote; the cell and the
  breakdown show the effective line cost for the required quantity.

### 27.5 Records, versions and deletion

Standing rules apply: every mutable row carries `version` (stale forms fail visibly), and every
change writes an audit entry in the same transaction. Deletion is allowed — a project is a draft
plan, not money history (PROJECTS_IMPLEMENTATION.MD OQ-P2) — and is audited with what went:
deleting a project removes its rows/columns/cells; deleting a row or column cascades its quotes; a
selection pointing at a removed supplier or quote is cleared.

### 27.6 The Cheapest Combination optimiser (Phase 2, decision 182)

Above the matrix on a `mix_and_match` project, an action bar sets three plans side by side, each
with its grand total (materials + delivery), who the order goes to and a plain-words comparison:

- **Your manual selection** — whatever is picked in the matrix now.
- **⚡ Auto-pick cheapest split** — the cheapest way to buy every orderable item across suppliers,
  delivery fees and free-delivery thresholds included (so it will pay a little more on a line to
  push one supplier over its threshold, or leave a supplier out entirely, when that is cheaper).
  Notes say how much it saves against a *complete* manual selection (never against a partial one),
  and against simply buying every item at its lowest price.
- **🚚 Best single-supplier option** — the cheapest supplier that has *every* orderable item in
  stock, with the convenience trade-off stated ("£X more than the cheapest split, but one order from
  one supplier"), and the next-best single suppliers. If nobody stocks everything the card says
  so.

Rules: only **in-stock** quotes are candidates (OQ-P3 — you cannot order what is not there); an
item no supplier can supply in stock is **uncoverable** — named in a caveat, left out of both plans,
and never blocks the rest; each supplier's delivery rule is applied as set, including a Click &
Collect choice (the optimiser does not flip that choice). Ties prefer fewer suppliers, then the
earlier supplier column; the result is deterministic.

**Apply** writes a plan into the matrix selections in one transaction (a version bump per changed
row, one audit entry on the project). The server recomputes the plan itself and refuses — telling
the household — if the prices moved since the plan was shown. Applying a plan the matrix already
holds changes nothing. After applying, any cell can still be changed by hand. `compare_options`
projects show no bar. Nothing here changes the schema.

### 27.7 Phasing

Phase 1 is the DIY matrix end-to-end above; Phase 2 is the optimiser above. Phase 3 is holiday/
bundle refinements; Phase 4 the `compare_options` candidate/TCO mode. `PROJECTS_IMPLEMENTATION.MD`
tracks the stage session by session.
