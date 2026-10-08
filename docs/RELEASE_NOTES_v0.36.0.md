# Release notes — v0.36.0 — A shorter payday card on the phone home

## What changed

The **PAYDAY PROJECTION** card on the Quick Entry (home) page is now a short, plain-English summary instead of the full panel. It says four things and links to Horizon for everything else:

> **Next pay day is 26th October (18 days from today)**
>
> Based on a current household balance of £242.22 in bank and cash pots and no additional unplanned spending, the household low would reach -£165.25. No overdraft fees would be incurred.
>
> **Plan a transfer?** Natwest will run about £850.00 short of its upcoming Direct Debits (next due 21st October — Council tax, Mortgage and Water Bill). Aim to transfer at least £850.00 into Natwest by 16th October.
>
> See full projection detail in the Horizon page.

- **The balance named is the one the projection actually starts from** — bank and cash pots, with credit-card debt ignored. Card debt is not money available to pay bills, and using the household net total would not reconcile with the low.
- **The fee verdict follows the warning tiers.** Below zero but inside the configured bank warning threshold reads "No overdraft fees would be incurred." Past the threshold the card says fees are likely and names the threshold. It never promises "no fees" when the low goes beyond the cushion the household configured.
- **"Plan a transfer?" keeps its amber treatment**, and now names what is really due: "Direct Debits", "standing orders", or both, read from the schedules themselves. Up to three bill names are listed with the rest counted.
- **The transfer deadline is five days before the earliest due date** (21st October → aim for the 16th), so the money lands before the debit is taken. Once that day has arrived the sentence says "as soon as you can" instead of naming a date in the past.
- **The Horizon link carries the day before payday** (`/horizon?through=…`), so tapping it opens the same window the summary just described.
- **Overview keeps its full panel** — the tier banner, the figures, the "what's in this forecast" expansions and the pot watch. It only lost the duplicated prose (the weekly pace line — the till on the same page already carries it — and two footnote paragraphs). Nothing was removed from Horizon, and the day-by-day table, the dated shops and fills, the expected-support list and the weekly pace are all still there.

## Schema and data

None. No migration, no data conversion, no backup-format change and no new dependency. Nothing is written to the database; the card is built from the projection the page already has.

## Who is affected and what to do

Everyone who uses the phone home. Nothing to set up or re-enter. Take a backup and Force Update as usual, then open the home page: the payday card should be four sentences and a Horizon link. If a pot is short of its own bills before payday, the amber "Plan a transfer?" line appears under it.

## Verification

- `npm test` — **696 passed**, 0 failed across 168 suites (up from 671 / 160; 25 new tests). The new tests pin the household's own worked example to the character (26th October, £242.22, −£165.25, "No overdraft fees would be incurred.", Natwest £850.00 by the 16th), plus the yearly wording, the three tiers' fee sentences, the bill nouns, the deadline edge and the "already overdrawn" line.
- `npm run typecheck`, `npm run format:check`, `npm run themes:check` and `npm run build` — passed.
- `npm audit --omit=dev` — 0 vulnerabilities.
- Playwright — a new spec, "the payday card states the facts and opens Horizon the day before payday", checks the sentence shape, the liquid balance wording and that the link opens Horizon on payday − 1; the full browser suite runs again in CI (`browser` job). Verified locally in the browser too: the card's −£165.25 matched Horizon's "Free to spend up to" for the 25th to the penny.

Decision recorded in [`docs/IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md): 186.

## What to do

In Unraid, **take a backup, then Force Update**. The version badge should read `v0.36.0 · pre-release`.

Release notes document: [`docs/RELEASE_NOTES_v0.36.0.md`](RELEASE_NOTES_v0.36.0.md).
