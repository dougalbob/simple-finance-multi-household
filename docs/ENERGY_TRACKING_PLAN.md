# Issue #118 — energy tracking (design record)

Status: **built and shipped as v1.44.0 (2026-10-28).** The household's four answers (§1) and a real
bill they supplied (§2) drove the build; precision, units and the chart rule were revised after seeing
that bill. Where the implementation refined this record, the refinement is marked **built**. The
authoritative product text is `docs/SPEC.md` §29 and the decisions are 267–268 in
`docs/IMPLEMENTATION_PLAN.md`.

## 1. What the issue asks for, and what the household decided

GitHub issue #118, in the household's words: a "Gas/Electric" schedule pays a direct debit under the
default **Utilities / Energy** category, and there should be an **optional, hidden-by-default** way to
record that month's gas and electricity on the purchase — to track usage over time *and* to gather what
a switching decision needs. "Some other users may only want to track usage or not track at all so it
needs to be flexible."

Note what is and is not relied on: the **schedule's name** is the household's own choice and can never
be a hook; the **category** (`Utilities > Energy`, seeded by migration `0001`) is the hook, and a
schedule-converted purchase carries exactly that category line.

The household's answers to the four design questions:

| # | Question | Answer |
| --- | --- | --- |
| 1 | How much does each bill record? | **Gas/electric kWh + billing period + meter readings, with readings only where the household has a smart meter.** Estimates drift until an actual reading, so the reading fields appear only after the household says that fuel's meter is smart. |
| 2 | Where does the tracking live? | **A new `/energy` page in the menu.** |
| 3 | Switching comparison? | **Yes — in the same release**, arithmetic only. |
| 4 | The issue's second ask (Overview pot names → that account's transactions)? | **Held for later.** It stays on issue #118 and is not part of this work. |

## 2. What a real bill actually contains

The household supplied a real gas bill, and it changed three decisions:

```
18 Sep 2026   13770.4660   Smart meter reading
18 Oct 2026   13837.7730   Smart meter reading
Consumption   67.3070 Units (m3)
Energy used   755.2300 kWh
Gas tariff name  Simply Fixed Oct26v12      Product type  Fixed
Payment method   Direct Debit
Unit rate        4.748p/kWh
Standing charge  25.902p/day  (£94.54/year)
Price guaranteed until 1 November 2026
Early exit fee   £50.00
Estimated annual usage  21699 kWh
```

What that forces:

- **Rates are printed to three decimals**, not two. 4.748p and 25.902p cannot be held in hundredths of
  a penny without inventing precision loss, so rates are stored in **thousandths of a penny**.
- **Readings are printed to four decimals** (13,770.4660 m³) — the meter itself shows three, the bill
  shows four — so readings are stored in **ten-thousandths** of the meter's own unit, losslessly.
- **Usage is printed to two decimals** (755.23 kWh), so usage is stored as **whole watt-hours**, the
  energy equivalent of fuel's millilitres.
- **The bill prints the supplier's own estimated annual usage** (21,699 kWh). That is the number a
  comparison site would use, and it is the only usage figure a household has on day one — so it is
  recorded beside each fuel and used whenever the household's own recorded history is too short.
- **The billing period runs mid-month to mid-month** (18 Sep – 18 Oct), so the chart cannot pretend a
  bill is a calendar month. It buckets a bill into the month its period **ends** in, prints that rule
  under the chart, and keeps the exact dates in the table (§5).
- **The early exit fee is only live until the price guarantee ends** — "£50 until 1 Nov 2026, then
  nothing" — not a permanent fact about the tariff.
- The bill also names the **product type** and **payment method**, which matter only as context on the
  tariff card. They are not modelled: the comparison is unit rate against unit rate.

## 3. What already exists, and what is genuinely new

Reused, unchanged:

- **Utilities / Energy** as a default leaf category, and schedule conversion writing one allocation
  line per purchase (`convertInstance` in `src/lib/records/schedules.ts`).
- The **fuel-details shape**: a collapsed `<details>` under the purchase row, optional numbers,
  corrected later behind the purchase's `version` and audited (`editFuelDetails`, migration `0009`).
- The **settings key/value store** (key, value, version, `updated_by`; every write audited as
  `setting.update` through `upsertSetting`) — where the meter setup and the tariffs live.
- **Tracked agreements** (`tracked_agreements.switch_date`, per-date reminder leads, SPEC §22.2) —
  the existing home for a tariff's fee-free switch date, so no new alert engine is needed.
- **Integer money arithmetic**: pence, plus `roundHalfUpDivide` in `src/lib/money.ts` for exact half-up
  division.
- The **chart components**: `GroupedBarChart` / `ChartFigure` / the table-twin pattern.

Genuinely new: one small table for a bill's usage and readings, a saved tariff per fuel, the `/energy`
page, and a pure arithmetic module. One migration.

## 4. The records

### 4.1 `energy_bills` — the usage on a purchase (migration `0022`)

One row per purchase, optional. A **side table** rather than more nullable columns on `purchases`: the
purchase stays a finance record, the energy fields have room to grow, and the chart reads one small
table instead of every purchase.

```sql
CREATE TABLE `energy_bills` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `purchase_id` integer NOT NULL UNIQUE REFERENCES `purchases`(`id`) ON DELETE cascade,
  `period_start` text,                  -- 'YYYY-MM-DD', local, inclusive
  `period_end` text,
  `gas_wh` integer,                     -- watt-hours: 755.23 kWh = 755230
  `electric_wh` integer,
  `gas_reading_start` integer,          -- ten-thousandths of the gas meter's own unit
  `gas_reading_end` integer,            --   13770.4660 m³ = 137704660
  `electric_reading_start` integer,     -- ten-thousandths of a kWh
  `electric_reading_end` integer,
  `gas_estimate_wh` integer,            -- the supplier's estimated annual usage, as printed
  `electric_estimate_wh` integer,
  `note` text,
  `created_by` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  CONSTRAINT `energy_bills_usage_present`
    CHECK (`gas_wh` IS NOT NULL OR `electric_wh` IS NOT NULL),
  CONSTRAINT `energy_bills_period_order`
    CHECK (`period_start` IS NULL OR `period_end` IS NULL OR `period_end` >= `period_start`)
);
```

- **Readings are stored exactly as printed.** Nothing is converted in storage, and gas usage always
  comes from the bill's kWh: the m³→kWh factor depends on the calorific value, so the app checks the
  implied factor (§7) rather than inventing one.
- **The purchase owns the version.** Editing details bumps `purchases.version` and audits
  `purchase.energy_details` with before/after against `purchase` — exactly `editFuelDetails`'s
  contract, so `VersionConflictError`, `RecordVoidedError` and the audit rules apply unchanged.
  Clearing both usage figures deletes the row.
- **Refunds and voided purchases** carry no editable details; a voided purchase shows what was
  recorded, read-only (as fuel does).

### 4.2 Electricity from readings *(taken as proposed)*

When the household ticked "smart meter" for electricity and leaves the bill's kWh box blank but enters
both readings, the app **derives** the usage from the readings rather than refusing the save. The
bill's own figure, when typed, always wins. This is what makes reading the meter worth doing: a month
with no bill yet can still be recorded. Gas is never derived.

### 4.3 The settings keys (no migration)

| Key | Values | Meaning |
| --- | --- | --- |
| `energy_category_id` | a child category id, or empty | Which category is "energy". **Empty means match `Utilities > Energy` by name**, the same name lookup fuel uses; setting it lets a household that renames the category keep working. Validated as a live child category. |
| `energy_smart_gas` | `1` / `0` (default `0`) | The gas meter is smart, so the gas reading fields appear. |
| `energy_smart_electric` | `1` / `0` (default `0`) | Same for electricity. |
| `energy_gas_reading_unit` | `m3` (default) / `kwh` | What the gas meter prints — labels only; nothing is converted. |
| `energy_tariff_gas` | validated JSON, or empty | The household's current gas tariff. |
| `energy_tariff_electric` | validated JSON, or empty | The household's current electricity tariff. |
| `energy_show_on_purchases` | `1` (default) / `0` | One tick removes the disclosure entirely for a household tracking nothing. |

**Built:** the keys are snake_case, matching the store's existing `weekly_groceries_pence` and
`commitment_category_ids` rather than the dotted names in the first draft, and `energy_category_id`
holds the category override. Each is written through `upsertSetting`, so every change is audited as
`setting.update` with the old value kept.

The tariff document, validated on read and write like the long-term plan's payload:

```json
{
  "supplier": "Octopus Energy",
  "tariffName": "Simply Fixed Oct26v12",
  "unitRateMilliPencePerKwh": 4748,
  "standingChargeMilliPencePerDay": 25902,
  "fixedUntil": "2026-11-01",
  "exitFeePence": 5000,
  "notes": ""
}
```

`fixedUntil` and `exitFeePence` are optional; everything else is required once a tariff is saved. Rates
are entered **excluding VAT**, as the bill prints them, and the app adds the 5% itself (§6). One current
tariff per fuel, no history table: a change is a `setting.update` audit entry with the old and new
rates, which is where this app keeps every other "what changed and when". The **exit fee is read as
"applies only before `fixedUntil`"**.

## 5. The capture — hidden by default on the purchase

On **Purchases**, under any purchase that has an allocation line in the energy category:

```
Energy details — add this period's kWh                     (collapsed summary once filled)
  Period from [2026-09-18]  to [2026-10-18]
  Gas [755.23] kWh                 Smart meter readings  [13770.466] → [13837.773] m³
  Electricity [327.8] kWh          Smart meter readings  [48213.4] → [48541.2] kWh
  Estimated annual usage  Gas [21699] kWh   Electricity [____] kWh   (as printed on the bill)
  Note [optional]
  [Save energy details]
```

- **Only energy purchases get the block** — the same `null`-or-props gate `fuelRowDetails` uses.
  A collapsed `<details>`, exactly like "Fuel details", and removable entirely via
  `energy_show_on_purchases`.
- **Fields follow the household's setup**: the reading pair appears only for a fuel whose meter is
  ticked smart; the gas unit label follows `energy_gas_reading_unit`.
- **Defaults that save typing, never guessed facts**: `Period from` is the previous energy bill's
  `period_end + 1 day` and `Period to` is the day before this purchase's date; the opening reading is
  prefilled from the previous bill's closing reading. With no previous bill the period is blank with a
  hint ("the dates your bill covers").
- **The summary line once filled**, beside the existing ⛽ line:
  `⚡ Energy · gas 755.23 kWh · electric 327.8 kWh · 18 Sep–18 Oct · £0.31/kWh paid`. The last figure is
  what left the bank divided by the total kWh — standing charge included, and labelled as such.
- **The app counts the bill's money as the energy category's allocation lines only**, never the
  purchase total (the fuel rule), so a split purchase cannot distort it.
- **Where else the block appears**: inside the in-place correction panel on **All Transactions**,
  beside the attachment block it already carries. **Not** in the Quick Entry till.

## 6. The `/energy` page

Menu entry **Energy**, in the drawer's *More* group and the desktop bar after Borrowing. Own route,
`force-dynamic`, household-scoped, covered by `tests/site-nav-routes.test.ts`.

1. **Your meters** (collapsed once saved). Gas/electric smart meter ticks, the gas reading unit, the
   energy category, and the "show on purchases" tick. First-run empty state: one sentence saying what
   the page does and what to fill in — never a setup wall.
2. **The last 12 months at a glance.** Gas kWh, electricity kWh and what left the bank, plus average
   kWh a day for each fuel, with Ofgem's *typical medium household* (11,500 kWh gas, 2,700 kWh
   electricity a year) as a **yardstick, labelled as one**.
3. **The chart.** One grouped bar per calendar month with gas and electricity series and a table twin.
   **A bill is bucketed into the month its period ends in** — 18 Sep – 18 Oct counts in October — and
   that rule is printed under the heading, with the exact periods and day counts in the table. A month
   with no bill is **a gap, never a zero bar**.
4. **Every bill**, newest first: period, days, gas kWh, electric kWh, kWh a day, readings where
   recorded, the supplier's annual estimate where recorded, what the energy lines cost, and a link to
   the purchase.
5. **Your tariff**, one compact card per fuel: supplier, tariff name, unit rate, standing charge,
   "fixed until" with a countdown, the exit fee worded as *"£50 until 1 Nov 2026, then nothing"*, and an
   inline edit. A card with no tariff says so and offers the form. A link to **Contracts & Renewals**
   where the household registers the fee-free switch date and its reminder (§8).
6. **Would switching save?** The household's own recorded usage (or the bill's estimated annual usage
   when the history is short — the basis is always named) against a candidate tariff typed in on the
   spot: unit rates, standing charges, optional exit fee. Four figures come back: the usage and its
   basis, the current annual cost, the candidate annual cost, and the difference. Nothing is saved, so
   nothing rots. **Nothing recommends anything**: "£39.63 a year cheaper on the same usage", never
   "switch to X". The exit fee, when given, is expressed as months to pay itself back.
7. **What the app cannot see.** Fixed honesty panel: the app knows the direct debit and the kWh typed
   in, not the supplier's balance; a bill priced on an estimate is only as good as the estimate;
   weather moves usage more than anything else; and a tariff compared today is a snapshot.

## 7. The arithmetic, and its rounding rules

Pure functions in `src/lib/records/energy-tariff.ts` (no database, no clock); the database and settings
live in `src/lib/records/energy.ts`.

- **Unit cost** = `roundHalfUpDivide(unitRateMilli × wattHours, 1_000_000)` — milli-pence per kWh ×
  kWh, exact, half-up, once.
- **Standing charge** = `roundHalfUpDivide(standingMilli × days, 1000)`, days counted inclusively
  across the period.
- **VAT at 5%** is added per fuel, as each fuel is its own account, and rounded once per fuel.
- **Worked example** the tests pin, from the household's own bill (18 Sep – 18 Oct 2026, 31 days):
  - Gas: 755.23 kWh × 4.748p = 3,585.83p → **3,586p**; 31 × 25.902p = 802.96p → **803p**; subtotal
    **4,389p**; VAT 219.45p → **219p**; **£46.08**.
  - Electricity (same period, 327.8 kWh at 24.860p and 60.970p/day): 8,149.11p → **8,149p**; 1,890.07p
    → **1,890p**; subtotal **10,039p**; VAT **502p**; **£105.41**.
  - **£151.49 for the period.** Gas alone, on the bill's own 21,699 kWh estimate, is £1,030.27 of units
    + £94.54 of standing charge + 5% VAT = **£1,181.05 a year** — which is what the tariff card shows.
- **Annualised usage** = recorded watt-hours ÷ the days those bills actually cover × 365, always
  carrying its basis: *"from 217 days of bills"*. Fewer than 30 recorded days and the comparison falls
  back to the bill's printed estimate; with neither, it refuses rather than extrapolating.
- **The comparison** uses identical usage on both sides, so only the tariff changes; standing charges
  use 365 days. The delta is quoted a year and labelled with the usage basis.
- **Effective p/kWh paid** = the energy lines' pence ÷ the kWh, for the row summary and the chart: the
  true average price of a unit that month, standing charge included, and labelled as such.
- **Dates** are local calendar dates (`'YYYY-MM-DD'`); a period's day count is inclusive of both ends.

## 8. Honest gaps — the rules the page keeps

The fuel-economy section (SPEC §16.6) sets the tone, and energy follows it:

- **Missing is not zero.** A month without a bill is a gap in the chart and a note in the list.
- **A bill with one fuel recorded shows one fuel.** The other is unknown, not nil.
- **Overlaps are named.** Two bills whose periods cover the same day, or two bills bucketed into one
  month, are flagged rather than silently added.
- **Reading continuity is checked, never enforced.** Each bill's opening reading is compared with the
  previous bill's closing reading for the same fuel, and with the bill's own kWh. A mismatch — or a
  reading that went backwards, usually a meter exchange — is a note beside the bill, not a blocked
  save.
- **The implied gas factor is checked, not used.** kWh ÷ m³ should land near 11.2; outside 9–13 the
  bill gets "worth checking the readings or the kWh", because the usual cause is kWh typed into the m³
  box.
- **A short history is labelled short**, and the supplier's estimate is named when it is doing the work.
- **Two months are not a trend.** Nothing claims a direction from a handful of bills, and no allowance
  is made for weather — the page says usage is dominated by it.
- **An exit fee expires with the fixed term**, and is worded that way.

## 9. What does not change

- **No authentication, household-separation, storage-path or registry change.**
- **No backup-format change**: a household backup archives the whole SQLite file, so `energy_bills`
  travels automatically, and restore's schema-upgrade path applies `0022` to an older archive exactly
  as the container entrypoint does at start-up. The registry is untouched.
- **No new alert engine, no scheduler, no background work, no external call.** Candidate tariffs are
  typed in.
- **The Charts page, Insights and the Quick Entry till are not touched.**
- **Purchases' filters, search, refunds and totals are not touched.**

## 10. Renewal dates, without a second reminder system

A tariff's `fixedUntil` shows on the Energy page with a countdown and a link to **Contracts &
Renewals**, which already records a **fee-free switch date** with its own reminder lead and surfaces it
on Overview's key dates and the bell. Registering the tariff there — type `service` or `other`, linked
to the Gas/Electric schedule — gives the reminder for free, and the app never says the same thing
twice.

## 11. Verification

**Built:** the arithmetic lives in `tests/energy-usage.test.ts` (33 tests) and the database layer in
`tests/energy-bills.test.ts` (18), with `e2e/energy.spec.ts` for the browser run. The full suite is
1,305 tests across 297 suites; the seeded E2E installation now carries twelve fictional energy bills
and two fictional tariffs (decision 268) so the page has a year to draw, with **smart meters off** so
the browser spec proves the reading boxes stay out of the way until they are ticked.

- `tests/energy-tariff.test.ts` — the pure arithmetic: the worked example, milli-pence rounding, VAT
  per fuel, 365-day annualisation, the short-history fallback, zero and blank inputs, a backwards
  reading, the implied-factor check, `m³` and `kWh` labelling, tariff JSON validation.
- `tests/energy-bills.test.ts` — the database layer: create, edit, clear, the version conflict, a
  voided purchase refusing an edit, a non-energy purchase refused, the category override, electricity
  derived from readings, overlap and continuity notes, and the audit entries with their before/after.
- `tests/site-nav-routes.test.ts` — already enforces that the new menu entry resolves to a real page.
- `e2e/energy.spec.ts` — desktop bar and phone drawer reach `/energy`; the first-run empty state; an
  energy purchase grows the collapsed block; saving twice shows the summary line; a second bill draws
  the chart; a non-energy purchase has no block.
- `npm run typecheck`, `npm run format:check`, `npm test`, `npm run themes:check`,
  `npm audit --omit=dev`, `NEXT_TELEMETRY_DISABLED=1 npm run build`.

## 12. Release shape

One feature release, **v1.44.0**, one PR, per `docs/RELEASE_PROCESS.md` — migration `0022` applied at
container start-up, so the household backs up the household and the registry before a Force Update.
With the code: `docs/SPEC.md` §29, decisions in `docs/IMPLEMENTATION_PLAN.md` (267 onwards),
`docs/HANDOFF.md`, this file's status, a `#energy` section in `src/lib/guide.ts`,
`docs/RELEASE_NOTES_v1.44.0.md`, `AGENTS.md`'s current-release paragraph and
`docs/RELEASE_PROCESS.md`'s new section. Appdata `/mnt/user/appdata/simple-finance-multi-household`,
host port **3009**; the original installation and port 3007 are never touched.

## 13. What this deliberately is not

- Not a supplier integration: no tariff feed, no Ofgem API, no account login.
- Not a recommendation engine: every figure is arithmetic over the household's own numbers.
- Not a bill reconstruction: the app knows what left the bank and the kWh typed in; it does not claim
  the direct debit *is* the bill, and it does not model the supplier's credit balance.
- Not payment-method aware: candidate rates are typed as the supplier quotes them for the household's
  own payment method.
- Not multi-property: one household, one set of meters per fuel.

## 14. Decisions and remaining questions

Resolved by the household's bill and answers, 2026-10-28:

1. **Gas readings in m³** — confirmed by the bill itself.
2. **Electricity derived from readings** when the kWh box is blank — taken as proposed.
3. **`energy_show_on_purchases`**, default shown — taken as proposed.
4. **The Overview pot-name links** stay parked on issue #118.

Still open, and deliberately deferred to a later release rather than guessed at:

- A saved "quote" per candidate tariff, so three quotes can sit side by side for a week.
- Reading the tariff's fixed-until date straight into the reminder engine instead of via Contracts &
  Renewals.
- Two properties (two sets of meters) under one household.
