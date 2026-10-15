# Release notes — v1.17.0 — Spending trends with category presets

## What changed

Chart D is now **Spending trends**, asking “How is this spending changing month by month?”
Choose a named category preset from the dropdown to compare monthly recorded spending. Switching
presets preserves your scroll position and the other chart filters; the selected preset is in the URL
so the view can be revisited or shared with the other household member.

The **Create/Edit category presets** link opens Settings. The **Create/Edit preset** selector lets you
choose an existing preset or create a new one. Name it, select whole parent categories or expand them
to choose individual children, then save. Shortcuts select all categories, categories used by your
direct debits and standing orders, or clear the selection. You can rename, edit and delete presets;
deleting a preset asks for confirmation and never deletes purchases.

The old **Schedule-converted only** button and long category lists are removed. Monthly comparison
headlines, the current month's hatch, “Show the numbers” and purchase drill-downs remain.

## Existing settings and data

- Your existing tracked-category selection is preserved as **Fixed commitments**. If you never saved
  a selection, categories used by your schedules provide the starting point.
- Presets count recorded spending, including manual and schedule-generated purchases. They do **not**
  add projected groceries, fuel or future bills. Refunds reduce the totals as before.
- Parent ticks and the schedule shortcut save the selected child categories as a snapshot. Newly added
  categories or changed schedules do not silently change a saved preset.
- Retired categories remain available for historical reporting. An empty preset means no spending is
  selected, not all spending.
- Presets are shared within the household, audited, protected against stale edits and included in normal
  household backups. Read-only support sessions cannot change them.
- The illustrative presets in the Arena preview are not imposed on your installation: create the groups
  that suit your household.

No schema migration, financial-record conversion or backup-format change is required.

## Validation

The household approved the Arena preview and requested the final **Create/Edit preset** wording.
Unit coverage checks legacy preservation, CRUD, validation, audit, stale edits, empty collections,
retired categories, household isolation and reconciliation against purchase-line totals. Browser
coverage checks the preset editor, mixed parent ticks, persistence, filtered drill-downs, deleted-ID
fallback and scroll preservation at phone and laptop widths. Additional preview checks covered a
long-name empty preset at 320px without horizontal overflow or browser errors.

Local gates include formatting, types, themes, all 953 unit tests, production build and production
security audit. Required PR CI, main CI and the tagged Publish workflow gate publication, including
full seeded/fresh-household browser suites and container/upgrade smoke tests.

## Stable update and Unraid

Stable release **v1.17.0**; the version badge reads `v1.17.0 · stable`.
After successful publication, update your existing multi-household container using:

`ghcr.io/dougalbob/simple-finance-multi-household:latest`

Or pin the exact release:

`ghcr.io/dougalbob/simple-finance-multi-household:v1.17.0`

Keep host port **3009** → **3000**, bridge networking, the existing Cloudflare route and
`/mnt/user/appdata/simple-finance-multi-household` → `/data` unchanged. Take your normal household,
registry and `.env` backups before updating. No restore or separate migration command is needed.
Do not alter the original app on port 3007 or its `/mnt/user/appdata/simple-finance` directory.

After updating, open **Charts → D · Spending trends**, follow **Create/Edit category presets**, and
use **Create/Edit preset** to build and save your first additional category group.
