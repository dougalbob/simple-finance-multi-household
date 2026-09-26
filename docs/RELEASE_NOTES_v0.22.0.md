# Release notes — v0.22.0 (salary-window planning)

**Published:** 2026-09-26. Publish run `36273381993` passed; registry tags verified.
**Merge commit:** `0cca6aeab5432c8a5b7b1a2f1428c6123b6e5ec8` (PR #77; short SHA `0cca6ae`).
**Image tags:** `ghcr.io/dougalbob/simple-finance:v0.22.0` ·
`ghcr.io/dougalbob/simple-finance:latest` · `ghcr.io/dougalbob/simple-finance:sha-0cca6ae`.
**Digest:** `sha256:38fa8f57bb372a4af75cbed91a7bbad3f747f5edf4eb03e5d7aa608b072b1a58`, shared by all three tags.
This differs from v0.21.1's `sha256:c9ada52917fed04c28ba828c585a92bcf566d7c3103580842f3d4de02077a506`;
v0.21.1 still resolves to its original digest.
**Version badge:** `v0.22.0 · pre-release`

## What changed

- Payday, home, Overview and the till now plan through the salary receipt date, not the earlier
  £1,000 parental support. Expected support remains inside the forecast, flagged as borrowed money,
  never payday or received income. Horizon's salary-based default is unchanged.
- The till and Overview show the same **Lowest before pay day** as the payday engine, replacing
  the old bills-only, no-inflows subtraction. Salary itself is not spendable in that figure.
- Weekly spare pace divides the positive projected low by weeks to its earliest date, not payday,
  and rounds down to whole pounds. It is on top of planned shop and fuel. Spending it all would
  touch zero at the low, not preserve a cushion. No weekly allowance below/at zero or for a low today.
- The starting estimate is consistently **Household total now**, with the not-a-bank-balance reminder.

## Schema and data

No database change, no schema change and no migration. Existing data is used as-is. The estimate
updates on the next page load; decision 165's same-day credit arithmetic and the £180 case are unchanged.
v0.21.1 is not retagged and its release notes are untouched.

## Verification

PR #77 and the exact main merge commit passed gates, browser and Docker checks.
All 514 unit tests and 78 browser tests passed. Main CI:
[36273098587](https://github.com/dougalbob/simple-finance/actions/runs/36273098587).
[Publish run 36273381993](https://github.com/dougalbob/simple-finance/actions/runs/36273381993)
built and smoke-tested the image before pushing; registry verification finished green.
The GHCR package-version API groups `v0.22.0`, `latest`, and `sha-0cca6ae` under the single digest above.
The annotated tag stays on the tested merge commit; this notes-only stamp does not amend it.

## Updating in Unraid

1. **Take a backup:** Settings → Backup, or a consistent appdata backup with the container stopped.
   Keep it safely outside the container.
2. **Force Update** Simple Finance. If pinned to `v0.21.1` or `v0.21.0`, first switch the repository
   to `ghcr.io/dougalbob/simple-finance:latest` or `ghcr.io/dougalbob/simple-finance:v0.22.0`.
   A pin will not pick up the new image.

The badge should read **v0.22.0 · pre-release**.

[Release notes document](https://github.com/dougalbob/simple-finance/blob/main/docs/RELEASE_NOTES_v0.22.0.md)
