# First-run onboarding — proposal

**Status:** approved by the household on 2026-10-11. **Slice 1 is built and released in `v1.1.0`** (the
derived `/start` setup path, the home card, the repaired empty states and the one-person/car-free fix).
**Slice 2 is built and released in `v1.2.0`** (`/guide`, the "What this page needs first" blocks on the
four payoff pages). **Slice 3 is built** (the `/example` worked example, two months of fictional data
rendered through the real engines, and the isolated-root seeding script `scripts/seed-example-household.mts`).
The chosen shapes are recorded in §5:
`/start` is a hub with inline short fields, never a full-screen wizard, and the worked example is
generated from the real engines rather than written as prose. Follow-up issues **#85 and #86** now
clarify that the planning payday is a separate audited household setting and revise the first-run
explanation so sign-in identities, people records, checkpoints, transfers, income and actual purchases
are not conflated. These follow-ups shipped in stable `v1.31.0`; see `docs/RELEASE_NOTES_v1.31.0.md` and
`docs/IMPLEMENTATION_PLAN.md` decisions 243–245.

This document does not change storage, auth, tenancy or the release line, and it must not be read as
a change to [`docs/MULTI_HOUSEHOLD_PLAN.md`](MULTI_HOUSEHOLD_PLAN.md).

## 1. The problem, measured rather than remembered

A tour of empty screens is useless for the reason the household gave: there is nothing to point at.
The original measurement below is a **2026-10-11 snapshot**, included as the rationale for Slice 1;
the current path and copy are described in §§3, 7 and 8. Since that snapshot, the planning boundary
has also become a separately configured household payday, rather than an income schedule.

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

1. **No order.** The app has a dependency chain — people → pots → checkpoints → household payday —
   then optional predictable receipts, bills, projection figures and a first purchase. A new person must
   not have to infer it from separate empty states.
2. **No destination.** Every payoff surface (projection, Horizon, Charts, Insights) is exactly the
   thing that is blank on day one, so there is no reward for the setup work and no picture of what
   "finished" looks like. This is what a tour would have shown, and it is what we do not have.
3. **The rules are invisible.** There is no bank connection or statement import; checkpoints are
   balances the household reads or counts and reports. Transfers between its own pots are not spending;
   income is not spending (`BAC`), borrowing is not income, schedules convert and history is not
   rewritten. Predictable recurring receipts are different from one-off income; the household payday
   is independent of either. The projection is arithmetic on configured figures, not knowledge from a
   bank. These are the assumptions the setup copy must make clear before a wrong one is made.

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

The minimum for the payday projection is one bank or cash pot, a checkpoint for each live bank/cash
pot, and the household's configured payday. A receipt schedule is **not** required. Phase A has four
steps and can end with the projection live on the home page; the optional recurring receipt step is in
Phase B.

| # | Step | Done when (derived) | Action |
| --- | --- | --- | --- |
| A1 | Name the household people | ≥ 1 `people` record | inline: label; add any people needed for “Paid by” or “For”. People records have no two-record cap; only two sign-in identities may be assigned to a household. The administrator assigns them before first login; in Settings, link a person to an assigned identity. |
| A2 | Add the pots you actually use | ≥ 1 live bank or cash pot | inline: name + kind (+ owner); add bank, credit-card, cash/wallet or savings pots as relevant. Record transfers between your own pots in Move, not as purchases. |
| A3 | Record each pot's balance | every live bank/cash pot has ≥ 1 checkpoint | inline: enter the figure read from the account or counted by hand; no bank connection or statement import supplies it. |
| A4 | Set the household payday | day-of-month from 1–31 configured | inline: choose the planning-cycle day; short months clamp to their last day and a Saturday/Sunday payday moves to the preceding Friday. This is audited in Settings and does not require an income schedule. |

Payoff lines are literal, e.g. *"Your household total now appears on the home page"* and *"Your payday
projection and Horizon now work from your checkpoints; scheduled receipts, when you add them, still count
on their own due dates."*

### Phase B — "Fill in the rest, at your pace"

| # | Step | Done when (derived) | Action |
| --- | --- | --- | --- |
| B1 | Predictable recurring income, if any | optional — never counted as incomplete | inline schedule for predictable amounts and dates (such as regular salary); record a one-off payment, refund, gift or sale on Income instead of making a recurring schedule |
| B2 | The bills you pay | ≥ 1 outgoing schedule | link to `/recurring` (the form is long); record expected direct debits and standing orders on their own due dates |
| B3 | Estimate the weekly shop and vehicle fuel | weekly-shop figure set, and every vehicle has a monthly-fuel figure (or there are no vehicles) | inline: usual weekly groceries and typical monthly fuel per vehicle; estimates are not purchases |
| B4 | Credit cards and renewals, if any | optional — never counted as incomplete | link to `/pots` and Contracts & Renewals; card debt counts in the household total but is not liquid cash |
| B5 | Record your first purchase at the till | ≥ 1 purchase | link to the till (`/#quick-entry`); check “For” on every entry — a manually selected target is not remembered for the next one |
| B6 | What to look at, and when | always shown last | no action: review checkpoints and purchases regularly, recurring bills weekly, Insights and Charts monthly, and Horizon when money is tight |
### Behaviour

- Each step is three-valued: **todo / partly / done**, with visible counts ("2 of 4 pots have a
  checkpoint") — the same honesty the rest of the app uses for partial data.
- The home card replaces today's "Household targets" card (A1 and A2 live inside it), so the home
  page has exactly one first-run element and nothing nags in duplicate.
- The home card disappears once Phase A is complete; `/start` stays reachable from the nav (under a
  plain "Getting started" label) and from the footer until Phase B is complete.
- A household can keep any number of `people` attribution records; the separate admin limit is two
  assigned sign-in identities. A one-person household is complete, and a vehicle is optional throughout.
- No step ever blocks another. A household can create pots from the till's empty pot picker, or
  record a purchase before any of it, as today.

## 4. Layer B — "A month in the life": the worked example

This answers the tour question directly: you cannot tour the app with no data, but you can show a
**worked example** built from the app's own engines and components, so it can never drift into
something the app cannot produce.

- `/example` — "A household that has been using this for two months": the home page with a live
  projection, a till mid-purchase, the forecast and groceries charts, the insights month-on-month
  comparison and honesty loop, and the recurring calendar with a converted schedule.
- **Two calendar months, not one (household requirement, 2026-10-11).** The fictional history must span
  two complete calendar months, so a new user sees the month-on-month comparison ("October vs
  September") fully populated and understands it. One month would leave Insights' comparison and the
  Charts month views with nothing to compare against, which is the empty state this layer exists to
  remove. The seeded data is dated relative to today so the previous month is always complete.
- Every section is captioned with the records that produced it ("two bank accounts, a cash pot each,
  payday on the 27th, a salary receipt on the 27th, eleven direct debits and two months of shopping")
  and links to the real page it will become.
- It is rendered from an **in-memory database seeded with fictional data** (`src/lib/demo/`), never
  from a household database and never writing anywhere. It stays behind the sign-in gate like every
  other page, but it reads no household records.
- The fictional household is the one the E2E harness already seeds (Alex, Sam, two bank accounts, two
  cash pots, fictional suppliers and amounts): `scripts/e2e-server.mts`'s seed moves into
  `src/lib/demo/household.ts` and both the browser suite and `/example` use it. One fictional
  scenario, already asserted by tests, now also teaches the app.
- For a household that wants to *touch* it rather than look at it, `scripts/seed-example-household.mts`
  seeds the same fictional two months into an **isolated data root** (the `.preview-data` pattern the
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
3. **Slice 3 — the worked example** (two months of fictional history, see §4). The `src/lib/demo/household.ts` module, `/example` page,
   the isolated-root seeding script `scripts/seed-example-household.mts`, and the footer link.

Each slice is a normal pull request with domain tests for the derivation rules, browser acceptance
for the first-run flow (fresh household → complete Phase A → projection visible), and a check that
`/example` never touches a household database. Slices can ship independently and in this order.

## 10. What Slice 3 shipped — the worked example

- `src/lib/demo/household.ts` — the in-memory seed module: `seedDemoHousehold(databasePath, now)` creates the fictional household (Alex & Sam, two bank accounts, two cash pots, vehicles, salary, bills, two months of weekly shops and personal spending, a loan from Mum with expected support, the "Back Garden Fence Replacement" project demo) in an in-memory SQLite database or a file path. Unit-testable, used by both `/example` and the E2E harness.
- `src/app/example/page.tsx` — `/example`, "A household that has been using this for two months", rendered from the app's real engines (`money-view`, `charts-view`, `insights-view`) against the in-memory seed. Shows: home projection + till, all five Charts (Forecast, Groceries, Personal, Commitments, Spending mix), all four Insights (Month comparison, Personal, Vehicle costs, Honesty loop), and Horizon. Every section captioned with the records that produced it and linked to the real page. Behind the sign-in gate, reads no household records, writes nowhere.
- `scripts/seed-example-household.mts` — CLI rehearsal tool: seeds the same fictional two months into an isolated `DATA_DIR` (default `.preview-data`), refusing a production-shaped root or any root that already contains records. Creates a minimal registry with `alex@example.com` (platform_admin) and `sam@example.com`. For a household that wants to *touch* the example rather than look at it.
- Footer link: `/example` added to the global footer alongside "Getting started" and "Guide".

## 7. Decisions taken

1. **First slice scope → Slice 1, alone.** Decided 2026-10-11: build the path and the repairs first,
   review them on a preview installation, then start a new PR for Slice 2 and later Slice 3.
2. **Phase A shape → `/start` as a hub with short inline fields.** The current Phase A is people, pots,
   checkpoints and the household payday. Predictable recurring income is an optional Phase B step;
   one-off income is recorded on `/income`, while long bill forms and purchases stay on their own pages.
   No full-screen wizard — it would duplicate forms the app already has, and this app is one page per job.
3. **The worked example → built from the real engines with the shared fictional household** (Slice 3),
   not a prose page that drifts.
4. **Version → `v1.1.0`**, a stable minor release with no schema change and no candidate, published
   under [`docs/RELEASE_PROCESS.md`](RELEASE_PROCESS.md).
5. **Decided for Slice 2 (2026-10-11): `/start` keeps its navigation entry.** The household chose "keep it
   always": the nav entry stays, and only the *home card* unmounts itself when the derived path is done.
   Nothing can disagree with the records either way.
6. **Decided for Slice 2: `/guide` is reached from the footer and from links, not the navigation.** The
   household chose the footer and contextual links, so the nav stays at fifteen entries.
7. **Follow-up issues #85 and #86 (2026-10-20; decisions 243–244).** The household payday is an audited
   setting independent of receipt schedules. Getting Started now explicitly says that people records are
   not capped at two (only assigned sign-in identities are), checkpoints are reported by the household, no
   bank connection or statement import exists, transfers are not spending, recurring receipts are for
   predictable income, one-offs belong on Income, and Quick Entry does not remember the previous “For” choice.
   The payday planning rule and income guidance live in the Phase A/B descriptions above; no version or release
   change is part of this follow-up.

## 8. What Slice 1 actually shipped (for the next session)

- `src/lib/records/setup-path.ts` — the derivation: nine steps
  (`people, pots, checkpoints, payday, income, bills, figures, cards, purchases`) read from the household's own
  records, `SETUP_PHASE_TITLES`, and `getSetupFormData` for the inline fields. Steps are derived,
  never ticked, and nothing is gated. Unit-tested in `tests/setup-path.test.ts`.
- `src/app/start/page.tsx` — the hub: "N of 4 done" (Phase A) and "N left" (Phase B), the inline
  Phase A forms (`src/components/setup-forms.tsx`), the review rhythm, and the `readOnly` passthrough
  that hides every form for a support session.
- `src/components/getting-started.tsx` — `GettingStartedCard` (next Phase A step, then one line until
  Phase B is done, then nothing) and `GettingStartedPath`. It owns no writes; every form posts to an
  existing action, and `PAGE_PATHS` in `src/app/actions.ts` revalidates `/start`.
- The repairs: `/transactions` now points at `/pots`; the seven "Create a pot first…" messages, the
  `/horizon` checkpoint prose and the till's no-pots state all link `/pots`; the old
  "two people and a vehicle" card (`src/components/household-setup.tsx`) is deleted.
- `e2e/fresh-household.spec.ts` — the first-run suite, run against a genuinely empty household
  (`E2E_FRESH=1`, data root `.e2e-data-fresh`, actor `new@example.com`) as `npm run test:e2e:fresh`,
  and wired into the CI `browser` job beside the seeded suite.

## 9. What Slice 2 shipped — `v1.2.0` (the vocabulary)

- `src/lib/guide.ts` — the guide's copy and anchors: nine sections (`checkpoint`, `income`, `transfers`,
  `borrowing`, `schedules`, `projection`, `longterm`, `noticed`, `never` — `longterm` was added with the
  long-term forecast in v1.26.0). Each carries a lead, paragraphs and "where to see it" links.
  `tests/guide.test.ts` pins the anchors, the shape and the load-bearing phrases.
- `src/app/guide/page.tsx` — `/guide`, "How this app thinks", rendered from `GUIDE_SECTIONS`, behind the
  sign-in gate, reading no household records. Linked from the footer and from `/start`'s review rhythm.
- `src/lib/records/page-needs.ts` — "What this page needs first": per payoff page (`projection`,
  `horizon`, `charts`, `insights`), the setup-path steps that are not `done`. The payday projection needs
  pots, checkpoints and the household payday; Horizon/Charts/Insights have their own record needs.
  Optional receipt schedules and Phase B bills are never projection prerequisites. Tested in
  `tests/page-needs.test.ts` against real records through the domain APIs.
- `src/components/needs-first.tsx` — the pattern (section or inline), server-rendered, no state, nothing
  dismissed. It renders nothing when the list is empty.
- The four payoff pages: home's locked projection card lists its needs; Horizon's no-checkpoint block
  lists its needs; Charts' forecast lists its needs and the four reported charts give way to one block
  while nothing is recorded; Insights' month comparison and honesty loop give way to one block while
  nothing is recorded. The people, vehicle and mpg panels keep their own honest empty sentences.
- Inline guide links on home, Horizon, Charts and Insights prose, and a "How this app thinks" link under
  the review rhythm on `/start`.
- Browser: `e2e/fresh-household.spec.ts` gains the needs-and-guide assertion on the empty household.
- Deliberately not changed: no schema, no migration, no new dependency, no navigation entry for `/guide`,
  and the Slice 1 copy in `setup-path.ts`.
