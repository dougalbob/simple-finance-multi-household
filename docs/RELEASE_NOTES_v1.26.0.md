# Release notes — v1.26.0 — Long-term forecasting: your money across the years

**Stable release (`v1.26.0`)**, moving **`latest`** and GitHub's **Latest** release. It adds the
**Long-term forecast** — a new `/longterm` page that answers the household's own questions over
decades rather than days:

- **"What is income in 2030?"** and **"What is income at age 62?"** are first-class answer cards,
  each showing net income a year, the same figure in today's money, estimated tax on the gross
  figure and capital at the year end. Every date appears as **both an age and a year**.
- **"Does the money last?"** sits beside them. A temporary shortfall is named as a **gap**;
  "the money runs out during {year}" is reserved for the start of the final uncovered run.
- **Every figure is an editable assumption**: birth years, pension pot values and growth rates,
  pension start dates, State Pension amounts and ages, earnings and their stop dates, windfalls,
  investments and wrappers, end-dated commitments such as a mortgage, inflation, an "everything
  else" spending line, the comparison rates and the forecast end date.
- **Three return rates are always compared side by side** — cautious / middle / optimistic — and
  **the same pension pot is shown as drawdown and as an annuity**, arithmetic only, never a
  recommendation.
- **The plan is saved per household**, behind a version counter and an audit trail, and can be
  reset to a fresh draft from the records at any time.

The version badge should read **`v1.26.0 · stable`**.

## What changed

### A new page, and where it sits

- **`/longterm` — "Long-term forecast"** is in the menu. On the desktop bar it sits **beside
  Horizon**; in the phone drawer it is in the **second group**. It is deliberately separate from
  Horizon: Horizon answers *"will we reach payday?"* over recorded reality to 400 days; the
  long-term forecast answers *"what does 2030 look like, and does the capital last?"* over decades
  of assumptions the household chooses.
- The page is server-rendered in the house style and works without client JavaScript. The question
  is shareable: `?year=2030&rate=middle&person=person-1&age=62` survives a refresh, and each link
  keeps the parameters it does not change.

### The questions the household asked for

- **Income in a year** and **income at an age**: the page opens on **2030** and on **age 62
  (2032)** for this household's plan, and either can be changed on the page. Each card shows net
  income a year, the same figure in today's money, estimated tax on gross, per-person net income
  with ages, spending, and capital at year end.
- **Does the money last?** beside them, with the three rates listed and selectable. When a year
  cannot be met but later years are covered, the headline says **"It covers every year from
  {year} to {endYear}"** and names the gap years; it never calls a temporary gap a run-out.
- **The selected year, line by line**: per person, earnings, State Pension, pension drawdown,
  annuity, estimated income tax and NI, and net; beneath, investment income, estimated CGT, the
  spending baseline, end-dated commitments, surplus or shortfall, unmet spending when nothing is
  left, and capital split ISA / GIA / pensions — in future money and today's money.

### Three rates, and drawdown versus annuity

- **Three return assumptions, side by side**: money lasts, net income in the selected year, and
  capital at the selected year and at the horizon. The rates replace the **investments'** growth
  only; pension pots keep their own rates, and the page says so twice.
- **Drawdown or annuity — the same pot, two routes**: the projected pot value at its start date,
  the indicative annuity from the household's own rate (default £5,500 a year per £100,000), and
  the arithmetic of the 25% tax-free cash plus the taxable residual fund. The tool compares and
  never recommends; a real quote belongs to a provider.
- **Every calendar year** is listed in future money and today's money, with ages and unmet/ran-out
  years marked; clicking a year opens its detail.

### One assumptions editor, drafted from records

- **Everything is editable, and nothing is baked in.** The draft seeds the people, the active
  direct debits and standing orders (an end-dated schedule becomes a fixed commitment, so a
  mortgage drops out at payoff), the groceries/fuel basis, and active receipt schedules as
  earnings. An unassigned receipt lands on the younger person with a stop date one year before
  State Pension age — labelled as a draft to correct.
- **Tax is estimated per person, per year**, from the published **2026/27** rate card: personal
  allowance and its taper, basic/higher/additional bands, the savings starting rate and personal
  savings allowance, the dividend allowance, CGT on realised gains, and employee National
  Insurance. Every tax figure says **estimated**, and the card is data the release can update.
- **Warnings are output, not setup gates.** A £0 "everything else" line, an empty pension pot, a £0
  drawdown, no capital, no State Pension and 0% inflation each get a visible flag with a link to
  the assumptions; the forecast still answers every question.
- **Save, reset and reload** keep the reader's place: the panel stays open or closed as they left
  it, and a save that clears the last warning does not collapse the form and its message.
- **Read-only support sessions can view the plan but not change it.**

### The guide and the specification

- `/guide` gains a **ninth section**, **"The long-term forecast is your assumptions, not a
  prediction"** (`/guide#longterm`), and the long-term page's footer links back to it.
- `docs/SPEC.md` gains **§28**, covering the model, the saved plan and draft, the page and its
  honesty boundaries.

## Schema and data caveats

- **Database migration `0020_longterm_plans.sql`** adds one table, `longterm_plans`: one row per
  household holding a validated JSON payload, created/updated instants and a version counter. The
  container entrypoint applies it automatically at start-up; a live restore applies it too.
- **No existing record is changed.** No table or column is altered, no purchase, schedule, pot,
  checkpoint or person is touched, and the forecast never writes into the household's records. The
  table is empty until the household opens `/longterm`, at which point one draft plan is created
  and audited.
- **Backup format unchanged.** Existing backups stay valid; restoring one applies the new migration
  before the app serves pages, and the forecast starts from a fresh draft.
- **No change to household isolation, authentication or deployment boundaries.**

## Who is affected and what to do

- **Every household** sees the new **Long-term forecast** menu entry and can open it immediately.
  The draft is seeded from the household's own records; every figure is editable, and nothing is
  saved until the household chooses to save.
- **Nothing to do.** Existing pages, links, backups and records behave exactly as before.
- The new page is a projection of the household's own assumptions. It is **not** a bank forecast,
  **not** financial advice and **not** a promise, and the page says so on every screen.

## Validation evidence

- **Full test suite passes:** 1,052/1,052 tests across 245 suites (`npm test`), including the guide
  contract's ninth anchor and the release contract's current-tag checks.
- **Typecheck and format:** `npm run typecheck` and `npm run format:check` are clean.
- **Production build:** `npm run build` succeeds.
- **Browser suite (Playwright, Chromium):** `e2e/longterm.spec.ts` — 5/5 journeys: the answer cards,
  the honesty flags and the year table; asking an age as well as a year; switching the comparison
  rate; saving an edited assumption and finding it after a reload; and the page being reachable from
  the desktop menu, the phone drawer and the guide's ninth section.

## Deployment

- **Image:** `ghcr.io/dougalbob/simple-finance-multi-household` only — tags `v1.26.0`, `latest` and
  `sha-<short>`, all to one verified digest. Never pull from `ghcr.io/dougalbob/simple-finance`.
- **Unraid:** update the container image to `:latest` (or pin `:v1.26.0`). The template's data root
  is `/mnt/user/appdata/simple-finance-multi-household`, host port **3009** → container port
  **3000**, bridge networking. Do not point it at the original appdata path or the original image.
- **Backups:** no change to the backup format; existing backups restore as before.
