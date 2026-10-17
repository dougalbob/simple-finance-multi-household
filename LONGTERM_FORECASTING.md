# Long-term forecasting — design record (LONGTERM_FORECASTING.md)

> **What this is:** the working plan for a **long-term forecasting tool** — multi-year (decade-plus)
> financial scenarios built around pensions, investments, an expected inheritance, inflation on
> everyday spending, and UK tax. It is deliberately **not** an extension of Horizon. Horizon answers
> *"will we reach payday?"*; this answers *"when I am 62, what is our income? Does the money last?
> What does 2030 look like?"*
>
> **Status (2026-10-17, later the same day): the grill is answered and v1 scope is settled.** The
> design record below is updated with the household's answers (§11A) and the scope changes they
> forced — notably: both pensions are defined-contribution **pots**; the tool must help compare
> **drawdown vs annuity** on the household's own numbers; employment income with a stop date is a
> first-class per-person stream because **the tool is project-wide** and must model working
> households (both people working is the ordinary case; this household's retired-at-56 member is the
> unusual one); every pot value, rate and amount is a **user-editable variable, never baked in**;
> and every date is displayed as **both an age and a calendar year**.
>
> **Continuation point for this feature.** The app-level handoff is `docs/HANDOFF.md`; the product
> spec is `docs/SPEC.md` (Horizon is §7.6 — useful as a boundary, not as a base); the decision log
> is `docs/IMPLEMENTATION_PLAN.md`. This file is the feature's own plan and, once building starts,
> its session-by-session status log. It lives at the repository root beside
> `PROJECTS_IMPLEMENTATION.MD` by the household's naming request; it can move to `docs/` later
> without changing anything but the links.
>
> **The honesty rule carries over unchanged:** the app does not give financial advice and never
> will. A long-term forecast is arithmetic performed on assumptions **the household chooses**. Every
> screen must say so in plain words, exactly as the payday projection and Horizon do.

---

## 1. The questions this tool must answer

These are the household's own words, and they are the acceptance test for the whole feature:

1. **"What is my projected income from investments and pension at my age 62?"** — an age-anchored
   answer, per person and for the household, for the calendar year in which that person turns 62.
2. **"What is my projected income in 2030?"** — a calendar-year answer, same detail.
3. **"Include other projected income from the second member of my household."** — the forecast is
   household-wide: every income stream of both people, each taxed as its own taxpayer, summed for
   the household.

And underneath those, the questions the household will want answered once they see the first
numbers (§7 asks which of these matter most):

- Does our spending stay covered by income in every year — or in which years does it not?
- Does the invested money last to 90? 95? If not, at what age does it run out?
- What changes if the investments return 3% instead of 5%? What if inflation is 4%?

The household's situation as confirmed in the grill (§11A). Two people: the asking member, male,
born **1970** (56 now — already **retired**, which he rightly flags as unusual); his partner, born
**1980** (46 now), **still working and expecting to continue for at least 10 years, maybe longer**.
Two **defined-contribution pension pots** (his), starting to pay in roughly **4 years** (≈2030,
age 60) and **9 years** (≈2035, age 65) — pot values are **user-editable inputs, never baked in**,
and every date is shown as **both an age and a year**. **State pension at 67** for him (2037, "in
11 years") at the **full rate**; hers will follow later (born 1980 — see §5.7 on her pension age).
An **inheritance at the start of 2027** leaves about **£250k to invest after the mortgage is paid
off** — and the mortgage is gone "within months", so it drops out of the spending baseline early
(kept as a general end-dated commitment because **other households differ**). Recent strong pension
investment returns are explicitly treated as possibly an outlier: return rates are user-set
(chosen: **4% / 6% / 8%**, treated as **net of charges**), inflation is a single best-guess figure
(chosen: **2.5%**), spending baseline is recurring + day-to-day, "other spending" is **£0 for now
with a visible warning**, there are **no existing savings or other income**, and UK tax is to be
estimated per person. The forecast runs **to age 90** (interpretation flagged in §5.7).

And the requirement that reshapes the whole model: **this is a project-wide tool.** Other
households will have **both people still working**, pensions of their own shapes, and mortgages
running for years. Nothing in the engine may special-case "retired" or "working" — a person is a
list of optional streams (earnings with a stop date, pension pots, state pension, windfalls), and
this household just happens to have the unusual mix.

---

## 2. Why this is not Horizon

The instinct to "extend Horizon past 400 days" is the one trap this feature must avoid. The two
tools differ in kind, not in range:

| | **Horizon (§7.6)** | **Long-term forecast (this)** |
| --- | --- | --- |
| Question | Where would we land on date D? | What does our income, spending and capital look like across decades? |
| Span | Today → up to 400 days | Now → age 90/95 (30–40 years) |
| Inputs | Recorded reality: schedules, pots, checkpoints, day-to-day anchors | Recorded reality **plus assumptions**: growth rates, inflation, pension start dates and amounts, windfalls, tax rules |
| Precision | Penny-exact, day-by-day | Month-by-month engine, year-by-year display; pence arithmetic, but figures are projections of assumptions, not a ledger |
| Tax | Not modelled at all | Central: income tax, savings/dividends, capital gains, per person per year |
| What it is honest about | Every counted item is a record in the app | Every figure is a consequence of assumptions the household set — and must be labelled as such |
| Reuse | — | The **spending baseline** (recurring + day-to-day) and the people/pot data. Not the projection engine's liquidity semantics. |

Both keep the house voice: show your inputs, say what you counted, never dress a projection as a
promise.

---

## 3. What the app already knows — and what is missing

### Already in the database (no new data entry needed)

- **Recurring commitments** — every DD/SO schedule (`schedules`, monthly and annual), with amounts,
  active-from/until and cancellation state. The mortgage is presumably one of these; its **end
  date** matters enormously (spending drops when it ends).
- **Day-to-day spending** — the groceries cadence (weekly) and per-vehicle fuel cadence (30 days)
  already drive Horizon's projected events (`src/lib/records/day-to-day.ts`); the same basis gives a
  defensible recurring spending baseline.
- **Income schedules** — what each person is paid today (`receipts`, `kind: 'receipt'` schedules).
- **People** — one or two per household (`people`), each a separate taxpayer.
- **Pots** — where money sits today, including any existing invested or savings pots.

### Missing — the long-term inputs (new data, see §9)

- Dates of birth (or just years) — needed to place "age 62", "age 67", and every age-anchored answer.
- The two pensions: type (see §5.1), current pot value or promised annual income, start dates,
  escalation rules, intended withdrawal style.
- State pension forecast for each person (weekly amount from the GOV.UK forecast, qualifying years).
- The inheritance: expected date, expected net amount (£250k after mortgage payoff as stated).
- Where the invested money will live (ISA / general investment account / pension) — this decides how
  the returns are taxed.
- The assumptions themselves: inflation %, investment return % (per pot or per scenario), state
  pension uprating %, forecast end age, and any "other spending" line.
- UK tax rules as **editable, versioned data** (see §5.4) — never hard-coded into the engine.

---

## 4. The shape of the answer

Three layers, thickest in the middle:

1. **Answer cards** — plain-English questions with one figure each:
   - "Household income in {year}" (and "in the year you turn 62"),
   - "of which pensions / investments / other",
   - "spending that year", "left over (or shortfall)",
   - "investments at the end of that year",
   - and the sustainability headline: "the money lasts to {age}" — or "runs out during {year}".
2. **The year table** — one row per calendar year: income by source (state pension, pension A,
   pension B, partner income, investment income), spending, estimated tax, surplus/shortfall,
   capital at year end. Every row in **future money and in today's money** (§5.5). Clicking a row
   opens the answer-card detail for that year — the same "open where you clicked" pattern Insights
   gained in v1.25.0.
3. **A small capital chart** — invested capital over time for **three return assumptions side by
   side** (the household explicitly wants to try various predicted rates; see §5.3 and OQ-LT-D3).

Everything is scoped **per person and household total**. Per-person tax is computed separately
(each person is their own taxpayer) and then summed — a detail that matters for the second member
(OQ-LT-A3).

---

## 5. The model in plain English

The engine is a **pure module** (`src/lib/longterm/` — house style: framework-free, testable,
penny-exact), stepping **month by month** from today to the chosen end age, with **calendar-year
rows** for display because "income in 2030" is how people actually ask. Each month:

1. Every capital pot grows at its assumed rate (compounded monthly from the annual rate).
2. Income streams that have **started** pay their monthly amount (state pension, each private
   pension, partner earnings, and the natural yield of investments if that is the chosen style).
3. Spending for the month is the baseline **inflated** at the chosen rate (see §5.6).
4. Surplus is added to the investment pot; shortfall is drawn from it (§5.2 — and this is where tax
   on withdrawals bites).
5. Tax is accrued and recorded against the year (see §5.4).

### 5.1 Pensions: the fork in the road that changes all the maths

This is the single biggest unknown (OQ-LT-B1) and the tool must support both shapes, because they
calculate differently:

- **Defined contribution ("a pot")** — a sum of money, today's value known (it "did particularly
  well" recently, hence the user-set growth rate). It can grow until needed, then be **drawn down**
  (commonly 25% tax-free cash, the rest taxed as income) or converted into a guaranteed income
  (**annuity**). The forecast must ask which, and when.
- **Defined benefit ("a promise")** — a guaranteed annual income for life from a start date, often
  with fixed escalation (e.g. CPI, or 2.5%, or nothing). No pot, no growth rate; a start date and an
  income line.

**Settled in the grill (§11A): both pensions are defined-contribution pots** — "with option to
purchase an annuity if I want to". So the engine's pension object is a **pot**: value (an editable
variable), growth rate, a start date (displayed as age *and* year), and a **take-up shape** that can
be drawdown or annuity. The DB shape stays in the model because other households will need it, but
it is no longer on this household's critical path. The household has **not** chosen drawdown or
annuity — *"I am hoping our tool will aid in that decision making"* — so v1 must show **both routes
side by side** on the same pot (§7).

### 5.2 Investments and how money is taken from them

The £250k (plus any existing invested savings) sits in **wrappers**, and the wrapper decides the tax:

- **ISA** — returns and withdrawals untaxed. Subscriptions are capped (£20,000 per person per tax
  year), so sheltering £250k is a multi-year project. The household chose **"ISAs first, rest
  GIA"** but is unsure of the yearly amount (OQ-LT-D4 answered "not sure yet"), so v1 carries an
  editable **"move £X per year into ISAs"** variable defaulting to the couple's combined cap
  (£40,000/year until the GIA is sheltered or empty) — a labelled, changeable assumption, never
  baked in.
- **General investment account (GIA)** — dividends and interest taxed yearly (small allowances),
  capital gains taxed when gains are **realised** (i.e. when selling/withdrawing, above a small
  annual exempt amount).
- **Pension** — growing pots are untaxed inside the wrapper; withdrawals are 25% tax-free and 75%
  taxable in the usual drawdown case.

Two spending policies to support (OQ-LT-D5): **natural yield** (live on interest/dividends, touch
the capital rarely) and **drawdown as needed** (shortfalls come out of capital, with the tax that
implies). The household picked **"drawdown as needed"** as the modelling default (Q2: undecided
between drawdown and annuity overall), and v1 additionally shows the **annuity route side by side**
on the same pot: an **indicative guaranteed income** computed from a rate the household enters
(e.g. "£5,500 a year per £100k of pot"). The app compares the arithmetic of both routes and never
recommends one — the decision, and any real quote, belongs to the household and their adviser.

### 5.3 Rates of return: the household drives them

Explicit requirement, and the right call — recent returns may be an outlier, so:

- Each investment pot carries an assumed **annual growth rate** set by the household (e.g. 3%, 5%,
  7%). Growth is applied to whatever capital the pot holds each month, including accumulated
  surpluses. **Chosen for this household (§11A): 4% / 6% / 8%, treated as net of charges** (the
  "no idea on charges" answer is read conservatively — if the rates are actually gross, the
  forecast is slightly pessimistic, which is the right direction to be wrong in). Never baked in:
  they are inputs like everything else.
- The headline comparison runs **three rates side by side** ("cautious / middle / optimistic" —
  labels chosen by the household), and every answer card says which rate it used. The three-run
  comparison is also the honest answer to *sequence-of-returns risk* (§6.4) at v1 — a single smooth
  line is the most flattering lie a forecast can tell.
- Pension pots awaiting drawdown grow at their own assumed rate (the household said the pensions
  "did particularly well" — they can set a different, lower rate for the future if they believe that
  was an outlier).
- Rates are **nominal** by default ("£100 becomes £105"), with inflation modelled separately. The
  document flags this in every input label so nobody mixes a real-terms rate into a nominal model
  (OQ-LT-G3).

### 5.4 Tax: right in shape, honest about precision

UK tax is unavoidable given the household's question, but a 40-year forecast cannot be
tax-perfect. The design:

- A **rate card as editable data**, versioned by tax year (seeded with the published **2026/27**
  figures below, never hard-coded in the engine — thresholds have been frozen before and will move
  again):
  - Personal allowance **£12,570** (tapers above £100,000 of income); basic rate **20%** to £50,270
    of taxable income; higher **40%** to £125,140; additional **45%** above.
  - Savings interest: **personal savings allowance** £1,000 (basic rate) / £500 (higher) / £0
    (additional), plus the 0% starting rate for savings where income is low.
  - Dividends: **£500** dividend allowance; dividend tax at **10.75% / 35.75% / 39.35%** in the
    three bands (rates rose 2 points from April 2026).
  - Capital gains: **£3,000** annual exempt amount; **18% / 24%** on gains (shares and funds
    included).
  - State pension 2026/27: **£241.30 per week** (full new State Pension) ≈ **£12,548 per year**.
- **Per person, per year, in bands** — pensions (state + private) are income; investment income
  falls into its own smaller allowances first; gains are taxed on realisation. ISAs: nothing.
- Every tax figure is labelled **"estimated"**. The engine gets the *shape* right — allowances,
  bands, wrappers — and refuses to pretend it can know the tax code of 2041.

**One correction the tool must make visible to the household:** *"I am already retired so I have my
full personal allowance available"* is true **today** and mostly false later. The full state pension
alone (£12,548) consumes virtually the entire £12,570 allowance once it starts at 67, and the first
private pension (in ~4 years) will likely use the rest before then. From that point, other income is
taxed. The forecast computes this year by year — which is precisely why it will surprise people who
assume "retired = no tax".

### 5.5 Today's money vs future money

Inflation at even 2.5% halves purchasing power in about 28 years. "£40,000 at age 62" is a
meaningless number without saying *which* £40,000. Every figure therefore appears **twice** — as
the nominal amount that year, and as **today's money** (deflated by cumulative inflation) — with
today's money as the default display because it is the one that answers *"will we feel alright?"*
(OQ-LT-G3).

### 5.6 Spending: one baseline, one inflation number

Exactly as the household asked:

- **Baseline** = active recurring commitments (DDs/SOs, annual items amortised) + the day-to-day
  basis the app already computes (groceries + fuel). Auto-drafted from records on first run, with an
  editable monthly total so anything the app cannot see can be added (cash spending, say).
- **Mortgage** is a commitment with an **end date** (the payoff when the inheritance arrives) — it
  must drop out of the baseline afterwards, and the model must never quietly inflate it forever.
- **Inflation**: one best-guess % per year applied to all spending (the household explicitly does
  not want an inflation curve). **Chosen: 2.5%** (§11A). Separate uprating knobs for anything that
  follows different rules — in particular the state pension (triple-lock-ish, OQ-LT-E4).
- **"Other spending" line** (OQ-LT-E2): holidays, house maintenance, cars, gifts, help for family.
  Records-based baselines systematically omit these, and omitting them is the classic way a forecast
  lies by omission. The household chose **£0 for now** — so the output must carry a **visible
  warning whenever that line is zero**, and the field stays prominent for when that answer changes.

### 5.7 Time anchors

Answers must land on **calendar years** ("2030") and **ages** ("the year you turn 62"), so the
engine needs each person's date of birth. Following the household's own suggestion (Q3/Q4): **every
date in the UI is displayed as both an age and a year** — "starts paying · age 60 · 2030" — because
neither anchor alone means anything to both members of a household ten years apart. Pensions start
on specific dates ("in 4 years"); the inputs take explicit start dates/ages, not vague windows. Tax
is accrued per calendar year for display simplicity and labelled estimated (the alternative —
tax-year rows — is more precise and more confusing; the year table is for humans).

Two date subtleties this household forces into the open:

- **Whose "age 90"?** He chose "to age 90" (2060) — but his partner, born 1980, is only 80 that
  year, and the household's money must last until the **second** of them is old. The end-year input
  defaults to **the year the younger person turns 90** (2070) so capital is tested against both
  lifetimes; changing it to 2060 is one edit. Flagged for his confirmation (§11A).
- **Her state pension age.** His is 67 (2037). She was born in 1980: under legislation current
  today her state pension age is **68** (rising in 2044–46), though that rise has been under review
  before. The tool defaults her to 68 in **2048** with the "assumption — check your GOV.UK
  forecast" label; the field is editable and the tool never predicts government.

The **mortgage** is an end-dated commitment: for this household it ends "within months" and must
drop out of the baseline almost immediately — the baseline auto-draft has to handle a commitment
ending next month without drama. The mechanism stays general (other households will have mortgages
running for years; OQ-LT-C2 confirmed it must be a selection, not a hard-coded absence).

---

## 6. Issues already visible (why a grill session first)

**The grill resolved the blocking ones (§11A): both pensions are pots; the wrapper question is
answered (ISA-first, rest GIA); the inheritance is start-of-2027; the mortgage ends within months
but stays a general end-dated commitment; and the "retired user" assumption is now explicitly
exorcised — the model is per-person streams because the tool is project-wide.** The list below is
kept as the record of what was worried about and why, with resolutions noted where they landed.

1. **DB vs DC unknown** (§5.1) — changes the engine's core object model. **Resolved: both pots
   (§11A).** DB remains in the model for other households, off this household's critical path.
2. **Annuity vs drawdown** — same pot, entirely different income shape and tax. **Resolved as a
   feature: side-by-side comparison (§5.2, §7) — the tool exists to aid that decision.**
3. **Where the £250k will live** — the tax on "investment return" the household worries about
   depends more on the wrapper (ISA/GIA/pension) than on the rate. **Resolved: ISA-first with a
   GIA remainder (§5.2); yearly ISA amount still an editable default (OQ-LT-D4 "not sure").**
4. **Real vs nominal confusion** — the likeliest way for a non-expert (and an expert) to misread a
   forecast; the double-display exists to kill it, but the inputs must also ask it (a "5%" entered
   as a real rate inside a nominal model is 2.5 points wrong).
5. **Sequence-of-returns risk** — a smooth average rate hides "the market falls 25% the year after
   you retire". V1 answers with parallel rate runs; a dedicated "bad early years" stress run is
   proposed for later (§10).
6. **Spending baseline gaps** — the records know groceries, fuel and DDs; they do not know the next
   car, the roof, or Christmas. **Answered: £0 "other spending" for now — the output must flag it
   every time (§5.6).**
7. **Personal-allowance assumption** (§5.4) — will quietly overstate net income if the model
   believed it.
8. **Second member's tax** — a separate taxpayer with their own allowance and bands; household
   totals need per-person tax first. **Sharper after the grill: she is 10 years younger and
   working for at least 10 more years — earnings with a stop date are a core stream, and her state
   pension lands two decades after his (§5.7).**
9. **Inheritance timing** — "about £250k" after a mortgage payoff is two events (money in; mortgage
   out) that may not be the same date; the model needs both edges (OQ-LT-C2). **Answered: mortgage
   gone within months, £250k arrives start of 2027 (§11A) — but both edges stay modelled because
   other households' two events may differ.**
10. **ISA sheltering is a slow process** — £20k/person/year means years of GIA tax drag unless the
    model is shown the plan.
11. **Fiscal drag** — allowances are frozen (currently to April 2031); a decades-long model that
    uprates bands with inflation overstates how much tax-free room exists. V1 keeps the rate card
    fixed until the household changes it, and says so on the tax lines.
12. **State pension age and rate** — 67 is legislated for this household; 68 is legislated for the
    mid-2040s and under review. The tool takes the household's dates (OQ-LT-A2) and does not
    predict government.
13. **Scope gravity** — "forecasting" grows toward Monte Carlo, care costs, downsizing, and
    IHT overnight. §10 draws the v1 line deliberately small.

---

## 7. What the first version is, and is not

**V1 (the smallest thing that answers the three questions honestly):**

- New page `/longterm` — **"Long-term forecast"** — in the menu's second group beside Horizon.
- **Per-person stream model, project-wide:** each person carries optional streams — **earnings with
  a stop date** (working households first-class; this household's partner works ≥10 more years),
  **pension pots** (value, growth rate, start date, drawdown or annuity shape), **state pension**
  (amount, start age, uprating), and one-off **windfalls**. No stream is assumed present; nothing
  assumes anyone is retired.
- One assumptions panel (drafted from records where records exist; **everything else is an editable
  variable — pot values, rates, amounts are never baked in**): birth years; the two pension pots
  (value + start date shown as age **and** year); state pension amounts and ages; earnings and stop
  dates; investments (existing + the £250k windfall with its start-of-2027 date, wrapper, growth
  rate); end-dated commitments (the mortgage ends within months for this household, but stays a
  general selection); inflation % (2.5%); other spending (£0, flagged); forecast end year (default:
  the year the younger person turns 90).
- **Answer cards** for arbitrary years and ages (including the household's two examples as
  first-class queries — "income at age 62 · 2032", "income in 2030").
- **Drawdown vs annuity side by side** on each pension pot: the same pot as flexible drawdown and
  as an indicative guaranteed income from a household-entered annuity rate (e.g. "£5,500 a year per
  £100k"). The tool compares arithmetic and never recommends (§5.2).
- **The year table** with per-person and household totals, future money and today's money.
- **The three-rate capital comparison** — the household's "various predicted % investment rates"
  (4% / 6% / 8% net of charges for this household, editable).
- Estimated UK tax per person per year from the editable 2026/27 rate card.
- Assumptions persist (v1 proposal: one `longterm_plans` table holding a versioned JSON payload —
  one migration, honest and small; full normalised tables only if the feature grows).
- Tests: the engine is pure maths and gets the same respect as the payday engine — worked example
  tests, property tests (surplus grows capital; shortfall shrinks it; today's-money × inflation =
  future money), tax-shape tests.

**Explicitly not v1:** Monte Carlo; the "bad early years" stress run (v2 candidate, cheap to add to
a pure engine); annuity pricing or quotes — the side-by-side comparison uses only a rate the
household enters (§5.2); IHT/care-cost modelling; Scottish/NI tax rates (OQ-LT-F1); a
self-contained tax-year-accurate self-assessment replacement; bank-grade tax advice of any kind.

---

## 8. Answers the tool will and will not give

Will: *"With the assumptions you set, this is what your income, spending and capital look like year
by year; here is 2030; here is the year you turn 62; here is what changes at 3%, 5% and 7%; here is
where tax bites."*

Will not: *"You will be fine."* Every screen ends with the same line the payday projection carries —
a projection of your assumptions, never a bank forecast or financial advice — and the tax figures
say **estimated** wherever they appear.

---

## 9. Data and code sketch (for later, not to be built yet)

- **Engine:** `src/lib/longterm/` — `model.ts` (the month-step core), `tax.ts` (rate card
  application), `baseline.ts` (records → spending draft), `view.ts` (year rows, answer cards).
  Pure, framework-free, shared by page and tests.
- **Rate card:** versioned data (tax-year keyed), seeded from the 2026/27 figures in §5.4, editable
  per plan — so April 2031's changes are a data edit, not a rewrite.
- **Schema:** one migration creating `longterm_plans` (id, name, payload JSON, created/updated,
  version — house conventions). Pensions, investments and windfalls live inside the payload at v1;
  promote to tables only with a real need.
- **UI:** `/longterm` server-rendered house style; assumptions form → answer cards → year table →
  rate comparison; search-params for the selected year/age query so an answer is shareable and
  survives refresh (the Horizon convention).
- **Guide & spec:** the vocabulary entry and SPEC section arrive **with the build**, not before.

---

## 10. Delivery slices (sizing)

| Slice | Content | Size |
| --- | --- | --- |
| **0 (this commit)** | This design record; the grill; scope settled from the answers | — |
| **1** | Engine + rate card + tests (pure maths; no UI) | Medium |
| **2** | `/longterm` page: assumptions, answer cards, year table, persistence | Medium |
| **3** | Three-rate comparison chart, per-person detail polish, guide/SPEC/release | Small–medium |
| **4 (later)** | Bad-early-years stress run; ISA-sheltering plan; annuity comparison; CSV export | As demanded |

Whether slices 1–3 fit alongside the grill depends on how the answers fall — specifically OQ-LT-B1
(DB vs DC) and OQ-LT-D1 (wrappers). If both land simply, a buildable v1 is a realistic session's
work; if either opens out, slices 1–2 become the next session and this document is the handoff.

---

## 11. Open questions for the household — the grill

**Answered 2026-10-17 — see the answers recorded in §11A.** The questionnaire is kept below as the
record of what was asked and why; several answers changed the design (they are marked where they
do). Written for someone who is **not** a financial expert: each question says why it is asked and
offers plain options to pick from. **★ = needed before any code is written.** Everything else has
a sensible default we can start with and change later. Answer in plain words — "no idea, suggest
something" is a perfectly good answer to any of these.

### A. You both — dates and the second member

- **★ OQ-LT-A1: Birth years (or dates of birth) for each of you.** Needed for "the year you turn
  62" and for placing every pension start. Also: which of you is the one already retired, and is it
  simplest to think of you as Person 1 and Person 2?
- **★ OQ-LT-A2: State pension.** What does each person's GOV.UK State Pension forecast say (the
  weekly figure and whether the record is full)? If you have not checked, say so — the tool can
  default to the full new rate (about £241 a week in 2026/27) and you can correct it later. Do you
  know anyone's state pension age differs from 67? (It is 67 for the timescales here; 68 is
  legislated to arrive in the mid-2040s — we take your dates and do not guess future law.)
- **★ OQ-LT-A3: The second member's money.** What does their income look like — still working
  (until when, roughly)? Their own pensions (when, how much)? Their own state pension (at what
  age)? Even rough shapes are fine; the tool treats each of you as your own taxpayer and adds you
  up.

### B. The two pensions (the biggest fork in the road)

- **★ OQ-LT-B1: For each pension — a pot of money, or a promise of income?**
  - **"A pot" (defined contribution):** you have a balance today (say, £180k), you choose how to
    draw it down later. The balance moves with investments — which matches your remark that they
    "did particularly well".
  - **"A promise" (defined benefit):** the scheme guarantees "£X a year from age Y for life",
    usually rising a little each year. There is no balance to invest and no growth rate to set.
  - If you are not sure: does your annual statement talk about a **"pot value / transfer value"**
    or about a **"projected annual pension"**? The first is a pot, the second a promise. Some
    people have one of each — that is fine.
- **★ OQ-LT-B2: If a pot — what is the current value of each, and what did the statement say the
  recent yearly growth was?** You want to set future rates yourself (rightly so); knowing the
  recent figures just helps us propose sensible cautious/middle/optimistic defaults.
- **★ OQ-LT-B3: If a promise — what annual income does each promise from its start date, and how
  does it increase each year** (fixed %, "CPI", "CPI + 1%", or nothing)? The annual statement says.
- **★ OQ-LT-B4: When each "starts paying out", how do you plan to take the money?**
  - **Drawdown** (the usual flexible route): typically 25% tax-free in one go or gradually, the
    rest taken as income when you want it, the remainder still invested;
  - **Annuity** (buy a guaranteed income for life with the pot);
  - or **"not sure — show me drawdown first"** (the recommended default for v1).
- **OQ-LT-B5: Roughly what income do you expect each pension to produce in its first years?**
  Useful as a sanity check against the model's numbers. And: any plans for the 25% tax-free cash —
  spend it, invest it, pay off anything? It changes the capital picture.

### C. The inheritance and the mortgage

- **★ OQ-LT-C1: When do you expect the inheritance, roughly?** A year is fine ("sometime in 2029").
  If uncertain, give an early and a late guess — the tool can show both (that is what scenarios are
  for).
- **★ OQ-LT-C2: The mortgage.** What is the remaining balance, the monthly payment, and the date it
  would end if you paid it normally? And confirm the sequence you described: inheritance arrives →
  mortgage paid off → about **£250k left to invest.** Are those the right numbers, and do the two
  events happen at the same time? (The tool needs to stop the mortgage payment at the right moment —
  Horizon's records already carry a schedule end date if it is set.)
- **OQ-LT-C3: Is the £250k for you both together?** And is any of it already spoken for — a car,
  house work, help for family — before it becomes investment capital? A planned one-off is easy to
  model and painful to discover missing.
- **OQ-LT-C4: Any other big one-off money expected in the next 10–15 years?** Another inheritance,
  a house sale, downsizing, a big gift? And the unpleasant twin question: any big planned costs —
  a wedding, a boat, a house project?

### D. The investments (the £250k and what you already hold)

- **★ OQ-LT-D1: Where will the money live?** The three relevant "homes" for money, in plain terms:
  - **ISA** — any returns and withdrawals are **tax-free**; but you may only add £20,000 each per
    tax year.
  - **General investment account ("GIA", a normal platform account)** — flexible and unlimited, but
    dividends, interest and gains are taxed (with small yearly allowances).
  - **Pension** — you are past the point of likely contributions here, so probably not; mention it
    only if relevant.
  A realistic answer might be "£40k into ISAs each year as we are allowed, the rest in a GIA" —
  that kind of plan is exactly what the tool needs (OQ-LT-D4 refines it).
- **★ OQ-LT-D2: What do you already hold outside the pensions and the house?** Existing ISAs,
  savings, investment accounts, premium bonds — rough values and where they sit. (If the answer is
  "nothing yet", fine.)
- **★ OQ-LT-D3: The return rates you want to test.** Name three annual % figures — cautious,
  middle, optimistic — and say whether you mean **before or after fund charges** (a 0.5% platform
  fee is worth knowing about over 30 years). We will use your three as the comparison set. *If you
  want a starting suggestion: 3% / 5% / 7% nominal, charges separate — but yours to set, which is
  the whole point.*
- **OQ-LT-D4: The sheltering plan.** Do you intend to move money into ISAs each year (£20k each)?
  How much per year, roughly? (V1 can model it as a simple yearly transfer; we can get cleverer
  later.)
- **★ OQ-LT-D5: How will you take money out of the investments?** Two plain styles:
  - **"Live on the income"** (interest/dividends) and touch the capital rarely;
  - **"Take what we need"** (drawdown as needed to top up spending — the default we suggest).
  Any preference for a fixed regular amount (e.g. "£1,000 a month") instead?

### E. Spending and inflation

- **★ OQ-LT-E1: The spending baseline.** Shall we draft it from your records — active direct
  debits/standing orders + the app's groceries/fuel basis — and show it to you as one monthly figure
  to correct? Is there significant spending the app does not see (cash, a second account)? Note:
  the mortgage is **inside** those DDs today and must drop out at payoff (OQ-LT-C2).
- **★ OQ-LT-E2: The "everything else" line.** Give us a rough **annual** figure for the spending
  that is not in the DDs or the grocery/fuel habit: holidays, house upkeep, car costs and
  replacement, gifts, hobbies. Even a cautious number is better than zero; the classic forecast lie
  is leaving this out. (£0 is allowed — the tool will simply flag it.)
- **★ OQ-LT-E3: Inflation.** Your single best-guess annual figure for prices (say, 2%–3%)? It will
  be applied to all spending. That is the whole model — one number, as you asked.
- **OQ-LT-E4: Should the state pension rise faster than your inflation guess?** The "triple lock"
  has historically beaten CPI some years (2026's rise was 4.8%). Simple options: (a) rise it at your
  inflation figure; (b) rise it at inflation **+ 1%**; (c) your own figure. Same question for each
  private pension if it is a "promise" type (OQ-LT-B3).

### F. Tax

- **OQ-LT-F1: Tax positions we should know?** We plan to model standard UK (England/NI) income tax
  and the small allowances for interest/dividends/gains, per person, from an editable rate card
  (2026/27 figures as the starting point). Anything unusual — Scottish rates, marriage allowance
  transfers, income from anything not listed above? If not, "nothing unusual" is the answer.
- **OQ-LT-F2: Is "estimated tax" acceptable?** Over 30 years the code will change. The tool will
  get allowances and bands broadly right with today's rules and label every tax figure
  **estimated**. OK as a working basis?

### G. The answers you want

- **★ OQ-LT-G1: Is the real headline "does the money last?"** The three questions you listed are
  income questions; the thing most people actually want from a 30-year forecast is *whether capital
  survives to a chosen age* (and if not, when it runs out). Shall "the money lasts to {age}" be the
  top answer card, with the income figures beneath it?
- **OQ-LT-G2: How far out?** To age 90? 95? 100? (The end age sets the table length; default
  suggestion: 95.)
- **★ OQ-LT-G3: Which money are we quoting?** Everything shown as **today's money** (what it will
  feel like), as **future money** (the nominal figures), or **both side by side** (the default
  suggestion — this is the single most common way forecasts are misread).
- **OQ-LT-G4: Anything else you want the tool to answer**, that we have not listed? Examples people
  ask: "what if we give the children £X now?", "can we afford £Y a year on holidays?", "what does
  stopping work at 60 rather than 62 change?"

### H. Working style

- **OQ-LT-H1: Saved named scenarios** (e.g. "Cautious", "My guess", "If inflation bites") vs
  **tweak-and-see** with the three-rate comparison only? The latter is v1's plan; the former is a
  slice-3 extra.
- **OQ-LT-H2: Is the v1 scope in §7 right?** Anything there you would cut or must have? In
  particular: is a table-plus-cards view enough to start (chart can follow)?

---

## 11A. Answers from the grill (2026-10-17)

Recorded verbatim where the wording matters; the design changes they forced are referenced in
brackets.

**Numbers**

| Item | Answer |
| --- | --- |
| Inflation (best guess, single figure) | **2.5%** |
| Him | Male, born **1970** — 56 now, **already retired** (his own note: "my situation is unusual that I am retired at 56!") |
| Her (second household member) | Born **1980** — 46 now, **still working; at least 10 more years, maybe longer** |
| Pension A (pot) | Pot value: **a user variable, not baked in** (an input field). Starts ≈ **2030** (age 60) — dates displayed as **both age and year**, his suggestion |
| Pension B (pot) | Same: pot value is an input; starts ≈ **2035** (age 65); age **and** year shown |
| State pension | **Full rate** for both (~£241.30/week in 2026/27; his starts at 67 in 2037; hers at her pension age — see §5.7) |
| Mortgage | **Paid off fully within months** — remove from the DD baseline, but keep as a **selection** ("other households may be in a different position") |
| Inheritance | **Start of 2027; £250k after mortgage payoff** |
| ISA plan | "I'm not sure yet" → default assumption: move up to the couple's caps (£40k/year) from the GIA until sheltered; editable |
| Existing savings / other income | **None** |
| Return rates (cautious / middle / optimistic) | **4% / 6% / 8%** — charges "no idea", so treated as **net** (conservative) |
| Other spending | **£0 for now — output must flag it** |

**Decisions**

| Question | Answer | Design effect |
| --- | --- | --- |
| Q1 pension shape | "both are pots with option to purchase an annuity if i want to" | Pot object with growth + start date (§5.1). DB kept only for other households |
| Q2 drawdown vs annuity | "I haven't decided… I am hoping our tool will aid in that decision making" | **Side-by-side comparison in v1** (§5.2): drawdown vs indicative annuity on the household's entered rate; never a recommendation |
| Q3 money home | ISAs first, rest GIA | Wrapper-aware tax (§5.2); yearly ISA amount is a labelled default until he decides |
| Q6 headline | **Income questions first** ("at age 62", "in 2030"), capital run-out beneath | Answer-card order follows that |
| Q7 annuity help | Side-by-side comparison | As Q2 |
| Q8 state pension uprating | "not sure — suggest" | Default **inflation + 1%**, labelled as a changeable assumption |
| Q9 charges | "no idea" | 4/6/8% read as **net of charges** |
| Q10 end age | To age 90 | Interpretation flagged (§5.7): default end year = when the **younger** person turns 90 (2070) unless he prefers 2060 |
| Q11 working style | Tweak-and-see | One assumption set, three rates always compared; saved scenarios stay a later slice |
| Q12 other spending | £0, flagged | Warning required in the output whenever the line is zero |

**The project-wide correction (his words):** "As this is a project wide tool we need to account for
other households where both users may still be working." The model is therefore **per-person
optional streams** — earnings with a stop date, pension pots or promises, state pension, windfalls —
and never assumes anyone is retired or working. This household (retired 56-year-old, working
partner born 1980) is one configuration among many.

---

## 12. Session status log

| Session | Date (Europe/London) | Branch / PR | Stage reached |
| --- | --- | --- | --- |
| 1 | 2026-10-17 | `arena/59781088-simple-finance-multi-household` | **Design record opened (this commit).** Repo conventions and the Horizon boundary reviewed; UK rate card facts checked (2026/27: PA £12,570; 20/40/45 bands; PSA £1,000/£500; dividend allowance £500 at 10.75/35.75/39.35; CGT £3,000 exempt at 18/24; full new State Pension £241.30/wk ≈ £12,548/yr — see §5.4). Proposal: pure `src/lib/longterm/` engine, `/longterm` page, one `longterm_plans` table, three-rate comparison, today's-money display. No code yet. Grill issued (§11) — answers decide whether slices 1–3 build in this session or the next. |
| 2 | 2026-10-17 | `arena/59781088-simple-finance-multi-household` | **Grill answered; v1 scope settled (§11A).** Both pensions are DC pots; drawdown-vs-annuity side-by-side enters v1 as a decision aid; income questions lead the answer cards; dates display as age **and** year; all pot values/rates are editable variables; employment-with-stop-date is a first-class per-person stream (**project-wide correction**: working households are the ordinary case); inheritance start-2027 £250k post-mortgage; mortgage end-dated but general; inflation 2.5%; rates 4/6/8% net; state pension uprating defaults inflation+1%; other spending £0 flagged; horizon ends at the younger person's 90th (2070) by default, flagged for confirmation. Next: build slices 1–3 or hand off per the sizing at §10. |
| 3 | 2026-10-17 | `arena/59781088-simple-finance-multi-household` | **Slice 1 complete — the engine, on the branch.** `src/lib/longterm/` (`types.ts`; `rates.ts` — the versioned 2026/27 rate card plus the household's chosen defaults; `tax.ts` — estimated per-person UK tax in HMRC stacking order with PA taper, starting rate/PSA, dividend allowance and CGT; `model.ts` — the month-step engine and answer queries). All integer pence (`roundHalfUpDivide`); inflation is one figure per **year**, stepped each January (year one is exactly today's baseline; today's-money deflates exactly); annuity maths pinned to pence-per-£100k of pot; an auto-created GIA so surplus never vanishes; "money runs out" = the first year with unmet spending. 22 new tests (`tests/longterm-tax.test.ts`, `tests/longterm-model.test.ts`). Gates: `format:check`, `typecheck`, `npm test` (**1,034/1,034 across 238 suites**), `npm run build` all green. **Not yet built: slice 2** (the `/longterm` page, `longterm_plans` persistence, answer cards, three-rate comparison UI) **and slice 3** (nav, guide, SPEC, release) — Playwright cannot run in this sandbox (SANDBOX entry 2), so UI work wants a session where the browser evidence can come from CI. |
