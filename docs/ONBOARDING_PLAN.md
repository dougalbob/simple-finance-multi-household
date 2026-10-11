# First-run onboarding — proposal

**Status:** proposal for the household to approve (2026-10-11). **Nothing in this document is built.**
It is a design conversation, not a delivery commitment: decide the shape here, then it becomes an
implementation PR under the normal release process. It does not change storage, auth, tenancy or the
release line, and it must not be read as a change to [`docs/MULTI_HOUSEHOLD_PLAN.md`](MULTI_HOUSEHOLD_PLAN.md).

## 1. The problem, measured rather than remembered

A tour of empty screens is useless for the reason the household gave: there is nothing to point at.
But the measured first-run state is worse than "empty", and it is worth stating exactly what a
brand-new household sees (fresh data root, one household, no records):

- **Home** — the "Household targets" card (people/vehicles only), the full till form with every
  category listed, a locked "Payday projection" card explaining what it needs, an empty "Due this
  week", and three door cards to Charts / Purchases / Horizon.
- **Navigation** — all fourteen pages at once, in one flat desktop row.
- **`/pots`, `/recurring`, `/tasks`, `/projects`** — a working form is right there. These are already
  good first-run pages.
- **`/insights`, `/charts`** — zero-figure scaffolding: twelve empty week bars with a £0–£1 axis,
  "October 2026 £0.00 vs September 2026 £0.00", "no complete week recorded yet".
- **`/income`, `/horizon`, `/transactions`, `/suppliers`, `/contracts`** — instructions that name the
  missing dependency but sometimes point at the wrong page or nowhere at all:
  - `/transactions` says **"Add an account or cash pot in Settings first"** — pots are added on
    `/pots`. A wrong signpost on an empty page.
  - Seven messages across `income-forms`, `external-forms`, `pot-forms` and `record-forms` say
    "Create a pot first…" with **no link to `/pots`**.
  - `/horizon` explains the checkpoint dependency in prose, with no link.
  - The home "Household targets" card requires `people.length < 2 || vehicles.length === 0`, so it
    **never clears** for a one-person household (allowed and complete per MULTI_HOUSEHOLD_PLAN §2)
    or for any car-free household.

So there are really three gaps, and only the first is about "having data":

1. **No order.** The app has a dependency chain — people → pots → checkpoints → income → bills →
   projection figures → first purchase — and nothing states it. A new person must infer it from eight
   separate empty states.
2. **No destination.** Every payoff surface (projection, Horizon, Charts, Insights) is exactly the
   thing that is blank on day one, so there is no reward for the setup work and no picture of what
   "finished" looks like. This is what a tour would have shown, and it is what we do not have.
3. **The rules are invisible.** Checkpoint vs balance, estimate vs bank balance, income is not
   spending (`BAC`), transfers are not spending, borrowing is not income, schedules convert and are
   never rewritten, the projection is arithmetic on configured figures. These are the things a
   technically minded person takes a while to absorb — none of them is discoverable from an empty
   screen, and several only bite after a wrong assumption has already been made.

## 2. Principles this proposal keeps

- **Derived, never ticked.** Every "done" state is computed from the household's own records. No new
  onboarding flags, no "dismissed" hidden state, no checklist rows a person has to lie to.
- **The path is the tutorial.** Each step creates a real record and then *shows the payoff* — the
  projection appearing, the chart filling in. Learning by doing, on their own numbers.
- **Nothing is gated.** No page is hidden, no modal blocks the till, no step is mandatory. A
  household that only ever records purchases must still have a first-class app.
- **One page per job.** Long forms stay on their own page (pots, schedules); only genuinely short
  fields go inline on the path.
- **No pretend data in a real household's database.** Ever. Fake records mixed with real ones would
  poison every insight, projection and honesty-loop figure, and are exactly the kind of hidden state
  this app refuses.
- **Plain language.** No coach marks, no tooltips that need a "next" button, no jargon invented here.

## 3. Layer A — "Start here": the setup path

One page, `/start`, plus one card on the home page while it matters. Both render the same derived
state. Steps are ordered by dependency, and each shows: **why** (one sentence), **do** (an inline
field or a link), and **what appears when it is done**.

### Phase A — "Get to your first projection" (four steps, about five minutes)

The minimum for the app's headline figure is one pot, one checkpoint and one income schedule. Phase A
is exactly that, and it ends with the projection live on the home page.

| # | Step | Done when (derived) | Action |
| --- | --- | --- | --- |
| A1 | Name the people (one or two) | ≥ 1 person record | inline: label; second person optional |
| A2 | Add the pots you actually have | ≥ 1 live bank or cash pot | inline: name + kind (+ owner); "a typical setup is a joint current account, a bills account and a cash pot each" |
| A3 | Record a checkpoint for each | every live bank/cash pot has ≥ 1 checkpoint | inline: one amount per pot |
| A4 | The money that comes in | ≥ 1 incoming schedule | inline: label, amount, pot, day of month; weekend-shift note |

Payoff lines are literal, e.g. *"Your household total now appears on the home page"*, *"Your payday
projection and Horizon now work — they will improve as you add bills and the figures below."*

### Phase B — "Fill in the rest, at your pace"

| # | Step | Done when (derived) | Action |
| --- | --- | --- | --- |
| B1 | The bills you pay | ≥ 1 outgoing schedule | link to `/recurring` (the form is long) |
| B2 | The figures the projection needs | weekly groceries set, and every vehicle has a monthly fuel figure (or there are no vehicles) | inline: two numbers |
| B3 | Credit cards and renewals, if any | optional — never counted as incomplete | link to `/pots` and `/recurring` |
| B4 | Record your first purchase | ≥ 1 purchase | link to the till (`/#quick-entry`) |
| B5 | What to look at, and when | always shown last | no action: the review rhythm (weekly purchases/recurring, monthly insights/charts, Horizon when money is tight) |

### Behaviour

- Each step is three-valued: **todo / partly / done**, with visible counts ("2 of 4 pots have a
  checkpoint") — the same honesty the rest of the app uses for partial data.
- The home card replaces today's "Household targets" card (A1 and A2 live inside it), so the home
  page has exactly one first-run element and nothing nags in duplicate.
- The home card disappears once Phase A is complete; `/start` stays reachable from the nav (under a
  plain "Getting started" label) and from the footer until Phase B is complete.
- The one-person and car-free households are handled properly: one person is a complete household,
  and a vehicle is optional throughout. This also fixes the current permanent nag.
- No step ever blocks another. A household can create pots from the till's empty pot picker, or
  record a purchase before any of it, as today.

## 4. Layer B — "A month in the life": the worked example

This answers the tour question directly: you cannot tour the app with no data, but you can show a
**worked example** built from the app's own engines and components, so it can never drift into
something the app cannot produce.

- `/example` — "A household that has been using this for a month": the home page with a live
  projection, a till mid-purchase, the forecast and groceries charts, the insights honesty loop, and
  the recurring calendar with a converted schedule.
- Every section is captioned with the records that produced it ("two bank accounts, a cash pot each,
  a salary on the 28th, eleven direct debits and three weeks of shopping") and links to the real page
  it will become.
- It is rendered from an **in-memory database seeded with fictional data** (`src/lib/demo/`), never
  from a household database and never writing anywhere. It stays behind the sign-in gate like every
  other page, but it reads no household records.
- The fictional household is the one the E2E harness already seeds (Alex, Sam, two bank accounts, two
  cash pots, fictional suppliers and amounts): `scripts/e2e-server.mts`'s seed moves into
  `src/lib/demo/household.ts` and both the browser suite and `/example` use it. One fictional
  scenario, already asserted by tests, now also teaches the app.
- For a household that wants to *touch* it rather than look at it, `scripts/seed-example-household.mts`
  seeds the same fictional month into an **isolated data root** (the `.preview-data` pattern the
  Projects demo script already uses), refusing a production-shaped `/data` root or any root that
  already contains records. That is a rehearsal tool, not an in-app playground: the one-household-per-
  identity rule stays intact, and no fake record ever lands in a household's own database.

## 5. Layer C — the vocabulary, and empty states that teach

- `/guide` — one page, plain language, the ideas that make the rest click: checkpoint vs estimate vs
  bank balance; income is not spending (`BAC`); transfers are not spending; borrowing is owed, never
  income; schedules convert on the due date and history is never rewritten; the projection is
  arithmetic on your figures, not a forecast of your behaviour; what "the app has noticed" is; and
  what the app will never do (no bank connection, no advice, no notifications). Anchored, so any page
  can link to `#checkpoint`.
- A small "**What this page needs first**" pattern for the four payoff pages (projection, Horizon,
  Charts, Insights): one sentence naming the missing records and a link to the step that supplies
  them — replacing the zero-figure scaffolding on an empty household.
- The concrete repairs found today: `/transactions` pointing at Settings for pot creation (it is
  `/pots`), the seven unlinked "Create a pot first…" messages, `/horizon`'s unlinked prose, and the
  home card's one-person/car-free nag.
- The till with no pots at all: one line and a link instead of an empty picker.

## 6. Delivery slices

1. **Slice 1 — the path and the repairs.** The derived step model (pure functions, unit-tested),
   `/start`, the home card, the empty-state repairs, the one-person/car-free fix. This is the slice
   that changes the first ten minutes; it needs no new dependency and no schema change.
2. **Slice 2 — the vocabulary.** `/guide`, the "what this page needs first" component on the four
   payoff pages, and the inline links.
3. **Slice 3 — the worked example.** The `src/lib/demo/household.ts` refactor, `/example`, the
   isolated-root seeding script, and the E2E seed switched to the shared module.

Each slice is a normal pull request with domain tests for the derivation rules, browser acceptance
for the first-run flow (fresh household → complete Phase A → projection visible), and a check that
`/example` never touches a household database. Slices can ship independently and in this order.

## 7. Open decisions (with the agent's proposed default)

1. **First slice scope.** Proposed: Slice 1, reviewed on a preview installation before Slice 2.
2. **Phase A shape.** Proposed: `/start` as the hub with short inline fields, long forms linked —
   rather than a full-screen wizard that creates records in sequence. The wizard is more guided but
   duplicates forms, and this app has been consistently one-page-per-job.
3. **The worked example.** Proposed: built from the real engines with the shared fictional household
   (Slice 3). A cheaper alternative is a prose-and-figures page, at the cost of going stale.
4. **When `/start` leaves the nav.** Proposed: when Phase B is complete; nothing is tracked beyond
   the derived state, so it can never disagree with the records.
5. **Version.** A new feature line — proposed `v1.1.0` (RC only if the household wants one), released
   under [`docs/RELEASE_PROCESS.md`](RELEASE_PROCESS.md) when the slices are accepted.
