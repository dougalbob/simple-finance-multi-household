# Release notes — v1.28.0 — Search as you type, Day by day totals and pot defaults

**Stable release**, moving `latest` and GitHub's Latest release. The badge reads
**`v1.28.0 · stable`**. Answers GitHub issues #76, #77, #78 and #79 — the four open issues
the household asked to be considered for one slice.

## What changed

- **Quick Entry — the category field searches as you type (#76).** Each split line's
  category is now a combobox over the same parent/child list instead of a long native
  dropdown. Typing filters on the **parent or the child** name, in any word order and
  any case (`shop` finds Weekly Shop and Top-up Shops; `running insur` finds
  Vehicle Running / Insurance). A tap, ArrowDown, Enter or the first typed character
  opens the list; arrow keys and Enter choose; Escape closes without changing the line.
  Focusing the field never opens the list by itself (so “Next: category →” does not
  shove the card down), and the current choice is always shown. A pinned
  **No category — clear this line** row survives every search.
- **Recurring — supplier choice is A–Z and searchable (#78).** Adding or editing a
  schedule now reads the **whole supplier directory in A–Z order**, not just the most
  recently used names, and filters on any part of a name as you type. **Add a new
  supplier…** (and a standing order's “no supplier / household transfer”) stay pinned,
  so the special choices survive a search that matches nothing. Enter in the search
  never submits the schedule form.
- **Horizon — the Day by day card counts and totals like its neighbours (#77).** The
  heading now reads `Day by day (42 days) · out £741.98 · in £5,900.00`: **out** is
  commitments plus projected day-to-day spending, **in** is expected money in, summed
  from the rows inside the card. The worked example on Getting started uses the same
  arithmetic, so the two cannot drift.
- **Settings — the default pot is chosen on the pot's own card (#79).** The detached
  **Quick entry** and **All Transactions** default-pot cards are retired. Every pot
  card now ends with **Set as default account for: Till · Transactions · New DD/SO**.
  One account per use: ticking a second account **moves** the default, and unticking
  clears it only on the account that holds it (so saving one card can never silently
  remove another pot's tick). The new **New DD/SO** default starts a new Recurring
  schedule on that pot, and every change is audited against its own setting.

## Data caveats and who is affected

**No schema change, no migration and no backup-format change.** The new schedule
default is one more audited row in the existing settings table. All figures,
purchases, schedules, pots and forecasts are unchanged; nothing is rewritten.

Two settings sections move rather than disappear: an existing **default pot for quick
entry** and **default pot for All Transactions** keep their saved values and now show
as ticks on the matching pot cards. If neither was set, the forms fall back exactly as
before. The new **New DD/SO** default starts unset, so a new schedule begins on the
first pot until a household ticks one.

## Validation evidence

- Unit suite: **1,075/1,075 across 252 suites**; `format:check`, `typecheck` and the
  production build pass.
- Full browser suite through the sandbox Chromium: **171/171**. The release gate first
  exposed two pre-existing date/data traps in `insights.spec.ts` — its groceries verdict
  assumed the seed average always sat over +10% (it was 9.7% on 2026-10-19), and its
  £0.00 row relied on a seeded cell that earlier projects fill in; both also failed on
  `main` at `7dbdc13` with the same seed. Both tests now derive their expectations from
  the page's own figures or create the state they assert, so the suite is deterministic.
- New browser journeys cover each issue: the till category search, the supplier A–Z
  search, the Day by day totals, and the three pot-default ticks (including moving a
  default between pots).
- Required PR and `main` CI (gates, browser acceptance and Docker/upgrade smoke), then
  Publish and registry-tag verification, must pass before this release is declared
  published.

## Unraid update

1. **Take a backup first** from Settings.
2. Force Update the existing multi-household container using
   `ghcr.io/dougalbob/simple-finance-multi-household:latest` (or pin `:v1.28.0`).
3. Confirm **`v1.28.0 · stable`**, then try: an amount at the till → *Next: category* →
   type in Category; *Add a schedule* → type in Supplier; Settings → any pot card's
   three ticks; Horizon → the Day by day heading.

Keep appdata `/mnt/user/appdata/simple-finance-multi-household` mounted at `/data` and
host port **3009** mapped to container **3000**. Do not change to the original
`simple-finance` image or appdata. Existing backups remain valid. No new setup or
migration step is required from you.
