# Release notes — v0.22.0 (salary-window planning)

**Publication:** pending verification; release facts will be filled after the tagged image is green.
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

## Updating in Unraid

1. **Take a backup:** Settings → Backup, or a consistent appdata backup with the container stopped.
   Keep it safely outside the container.
2. **Force Update** Simple Finance. If pinned to `v0.21.1` or `v0.21.0`, first switch the repository
   to `ghcr.io/dougalbob/simple-finance:latest` or `ghcr.io/dougalbob/simple-finance:v0.22.0`.
   A pin will not pick up the new image.

The badge should read **v0.22.0 · pre-release**.

[Release notes document](https://github.com/dougalbob/simple-finance/blob/main/docs/RELEASE_NOTES_v0.22.0.md)
