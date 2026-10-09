# Release notes — v0.37.0 — Clearer payday outlook and checkpoint balances

## What changed

- **The payday window excludes planned day-to-day spending only on the main salary date.** Projected weekly shops and vehicle fuel due on the actual main salary receipt date are omitted from that window, including when the salary date is shifted for a weekend. Day-to-day spending on other income dates still counts. The rule is shared by the Quick Entry/Till, home payday summary, Overview and Horizon.
- **The home payday card is a summary with a door to Horizon.** It keeps the payday, household low, one worst-pot bills-only transfer nudge and Horizon link. The overdraft-fees sentence is removed. When day-to-day spending is positive, the transfer nudge may add a clearly qualified guide that assumes the spending comes from the named pot; the bills-only shortfall and five-day transfer lead stay unchanged.
- **Overview retains the key figures without duplicating Horizon.** Its tier, payday, liquid funds, day-to-day totals, commitments, receipts and worst-pot transfer nudge remain. Expandable forecast sections and the day-by-day table are removed; Horizon owns the dated detail. On desktop the Till sits above the existing home dashboard, without replacing it; mobile ordering is unchanged.
- **Quick Entry names its salary-window low precisely.** The heading includes the payday as an ordinal date, such as “Lowest before 26th Oct pay day”. A negative low reads “Projected shortfall: -£413.57 before payday. No discretionary spending is available at this time.” The negative presentation omits “No weekly allowance”, the salary-not-counted sentence and the projected-liquid-funds disclaimer. Positive and zero-low guidance is unchanged.
- **The selected-pot warning stays bills-only, with an optional guide.** The Till no longer lists the first due bill in that line. When projected day-to-day spending is positive it adds a separate guide, for example: “If projected day-to-day spending also comes from Natwest, the guide shortfall is about £1,458.57.” The guide is the bills-only shortfall plus projected day-to-day spending, assumes that spending comes from the named pot, and is not a strict pot allocation.
- **Quick Entry distinguishes a checkpoint from the current ledger balance.** The tab is now **Checkpoint**. The Purchase tab labels the report **Last checkpoint**, retaining its amount, age and local timestamp, then separately shows **current account balance** from the latest running balance on All Transactions. That second figure is derived from the checkpoint plus recorded movements after it; it is not a repeat of the checkpoint or a live bank connection.

## Schema and data

None. No migration, data conversion, backup-format change or new dependency. The new balances and projections are derived from existing ledger records; no records are rewritten.

## Who is affected and what to do

Everyone using Quick Entry/Till, the home payday card or Overview. There is nothing to configure or re-enter. After updating, check the dated low and the bills-only/qualified-guide wording for your next salary window. Horizon remains the place for the dated projection detail.

## Verification

- `npm test` — **703 passed**, 0 failed across 169 suites.
- `npm run typecheck`, `npm run format:check`, `npm run themes:check` and `npm run build` — passed.
- `npm audit --omit=dev` — 0 vulnerabilities.
- GitHub PR checks `gates`, `browser` (Playwright acceptance) and `docker` (image and upgrade smoke) are release-blocking and must all pass before merge.

Decisions recorded in [`docs/IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md): 187–189.

## What to do

In Unraid, **take a backup, then Force Update**. The version badge should read `v0.37.0 · pre-release`.

Release notes document: [`docs/RELEASE_NOTES_v0.37.0.md`](RELEASE_NOTES_v0.37.0.md).
