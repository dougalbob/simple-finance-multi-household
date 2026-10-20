# Release notes — v1.31.0 — Household payday and Getting Started

**Stable release**, moving `latest` and GitHub's Latest release. The badge reads
**`v1.31.0 · stable`**. Implements GitHub issues #85 and #86 (decisions 243–245),
approved for full household testing on Unraid.

## What changed

- **A separate household payday (#85).** Settings now has an editable, audited payday day of
  month (1–31). The planning date clamps to the end of short months and shifts a Saturday or
  Sunday back to Friday. Home/Overview and Quick Entry projections, day-to-day exclusions,
  Horizon's default date and Chart E's payday-cycle windows use this setting — not income receipt
  schedules. A configured payday enables projections without any receipt schedule; scheduled
  receipts remain separate income on their own due dates. Horizon uses today + 35 days only when
  no payday is configured. Chart E falls back to month-to-date and links to Settings → Payday
  when the setting is unset.
- **Clearer first-run guidance (#86).** Getting Started distinguishes uncapped `people` records
  (used for purchase attribution) from the limit of two assigned sign-in identities. It explains
  that the administrator assigns sign-ins before first login and that Settings links a person to
  an assigned sign-in for the till's “Paid by” default. It also covers pots and transfers,
  checkpoints, the lack of a bank connection or statement import, predictable recurring versus
  one-off income, recurring bills, shop/fuel estimates, credit cards and renewals, and the first
  till purchase. The guidance explicitly says that Quick Entry does not remember a manually
  chosen “For” value for the next purchase.
- **Income page copy.** The no-schedule message is shorter and explains that household payday
  sets the planning window while receipt schedules are optional.

## Data and upgrade notes

There is **no schema migration, backup-format change or data rewrite**. The payday is stored and
 audited in the existing settings table.

After upgrading an existing household, its new payday setting is **unset** until a member chooses
a day in Settings → Household payday. Until then, the payday projection is paused, Chart E shows
month-to-date, and Horizon uses its five-week default (today + 35 days). Existing receipt schedules,
checkpoints and other records are unchanged; receipt schedules still appear on their own due dates
and do not set or move the planning cycle. Set the household's usual payday day before relying on
the payday projection or cycle charts.

## Validation evidence

- `npm run format:check`, `npm run typecheck`, `npm test` (**1,090/1,090 across 256 suites**) and
  `npm run build` pass.
- Browser acceptance coverage was added for payday settings, projection without receipt schedules,
  payday-cycle windows, Horizon defaults and the fresh-household setup path. This sandbox has no
  Chromium binary, so the local Playwright run could not launch a browser; the required PR `browser`
  check is the release gate.
- The required PR checks are `gates`, `browser` and `docker` (including container and applicable
  upgrade smoke). Publication must not proceed unless they pass.

## Unraid update

1. Take a household backup from Settings before updating.
2. Install or update to `ghcr.io/dougalbob/simple-finance-multi-household:v1.31.0` (or
   `:latest` after publication). Confirm the app badge reads **`v1.31.0 · stable`**.
3. Open Settings → Household payday and save the household's usual payday day-of-month. No
   receipt schedule is required for the projection; any scheduled receipts remain on their own
   due dates.
4. Keep the multi-household appdata `/mnt/user/appdata/simple-finance-multi-household` mounted at
   `/data` and host port **3009** mapped to container **3000**. Do not change to the original
   `simple-finance` image, appdata or route.
