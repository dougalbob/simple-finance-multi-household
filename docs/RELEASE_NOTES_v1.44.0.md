# Release notes — v1.44.0 — Energy tracking: the bill beside the direct debit

**Stable release.** This build moves `latest` and is marked Latest on GitHub.

## What the household asked for

GitHub issue #118: a "Gas/Electric" schedule pays a direct debit under the default
**Utilities / Energy** category, and the household wanted an **optional, hidden-by-default** way to
record that month's gas and electricity on the purchase — to track usage over time *and* to gather
what a decision to switch supplier needs. "Some other users may only want to track usage or not track
at all so it needs to be flexible." The issue's second ask — making the Overview pot names clickable
through to that account's transactions — is **held**; it stays open on the issue.

## What was decided before any code

| Question | Answer |
| --- | --- |
| How much does each bill record? | Gas/electric kWh, the **billing period**, and **meter readings only where the meter is smart** — estimates drift until an actual reading. |
| Where does it live? | A new **`/energy`** page in the menu. |
| Switching comparison? | **Yes, in this release** — arithmetic only. |
| Overview pot names? | Held for a later patch. |

A real UK bill the household then supplied settled the details: **rates print to three decimals**
(4.748p/kWh, 25.902p a day), **readings to four** (13 770.4660 m³), usage to two (755.23 kWh); the
period runs **18 September to 18 October**; the supplier prints its **own estimated annual usage**
(21,699 kWh); and the **£50 exit fee is live only until the price guarantee ends** on 1 November 2026.

## What this release builds

- **The optional block on a purchase.** Under any purchase with a `Utilities / Energy` line, a
  collapsed "Energy details" disclosure: billing period, gas and electricity kWh, the supplier's
  estimated annual usage, an optional note, and — **only for a smart meter** — opening and closing
  readings. It appears on Purchases and in the in-place correction panel on All Transactions, never in
  the till, and one settings tick removes it entirely for a household that tracks nothing.
- **The domain rules.** The purchase keeps the money and its version; the bill keeps its own figures in
  `energy_bills`, audited as `purchase.energy_details` with before and after. Electricity can be derived
  from two readings when the bill's kWh box is blank; **gas is never converted from m³** — the app
  checks the implied factor instead. Clearing both usage figures deletes the row; a voided purchase
  shows what was recorded, read-only.
- **The `/energy` page.** Your meters and category; the last twelve months in kWh and what was paid;
  a month-by-month chart with its table twin; every bill with period, day count, readings and what the
  app noticed; one saved tariff per fuel; and the switching comparison.
- **The switching arithmetic.** One tariff per fuel (unit rate, standing charge, price-guaranteed-until,
  early exit fee), and a candidate typed in and never saved. The same usage on both sides, standing
  charges at 365 days, **5% VAT per fuel rounded once**, the difference quoted a year *with its basis*
  ("from your own 365 days of bills", or the supplier's estimate when the history is short), and the
  current exit fee expressed as months to pay itself back. No prices are fetched, nothing is
  recommended.
- **Honest gaps.** A month with no bill draws no bar; a bill with one fuel shows one fuel; overlapping
  periods, a reading that does not follow the previous one, a reading that goes backwards and a gas
  factor outside 9–13 kWh/m³ are all named beside the bill rather than blocked; a short history is
  labelled short.

## The figures, checked against the household's own bill

Gas, 18 Sep – 18 Oct 2026, 31 days, 755.23 kWh at 4.748p plus 25.902p a day: 3,586p units + 803p
standing = 4,389p, 219p VAT, **£46.08**. Electricity, 327.8 kWh at 24.860p plus 60.970p a day: 8,149p +
1,890p, 502p VAT, **£105.41**. The bill's own **£94.54 a year** of standing charge comes out of 365 days
at 25.902p to the penny. All three are pinned by tests.

## What does not change

No authentication, household-separation, storage-path, registry or backup-format change: a household
backup archives the whole SQLite file, so the new table travels with it, and restore applies migration
`0022` to an older archive exactly as the container does at start-up. No scheduler, no alert engine, no
external request. Charts, Insights, the Quick Entry till and the Purchases filters are untouched.

**Migration `0022_energy_bills.sql`** adds one optional table. Back up the household **and** the Admin
registry before updating.

## Upgrading

Image `ghcr.io/dougalbob/simple-finance-multi-household:v1.44.0` (stable also moves `latest`), appdata
`/mnt/user/appdata/simple-finance-multi-household`, host port **3009**. Never the original installation
or port 3007.

To use it: open the purchase your energy direct debit is recorded as on **Purchases**, open **Energy
details**, and type the kWh and the dates the bill covers. On **Energy**, tick the meters that are smart
(the reading boxes then appear), enter your tariff from the bill, and type a quote into the comparison.
