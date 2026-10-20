# Release notes — v1.32.1 — Charts sync without the scroll flash

**Stable patch release**, moving `latest` and GitHub's Latest release. The badge reads
**`v1.32.1 · stable`**. Answers GitHub issue #87 (decision 248), reviewed in the Arena preview
and approved for full household testing on Unraid.

## What changed

- **Tapping a synced month no longer reloads the page (#87).** On **Charts**, with
  **Sync to Spending mix** engaged on Chart D (Spending trends), tapping a month bar updated
  Chart E correctly but the page visibly jumped: the browser reloaded `/charts`, showed the top
  of the page for a frame, then the `#mix` fragment scroll landed the reader back at the D/E row.
  A synced month link is now a soft client-side navigation with scrolling disabled, so the
  viewport never moves while Chart E redraws beneath it.
- **The keyboard path does the same.** The table twin's month names underneath Chart D — the
  accessible route to the same action — take the same in-place navigation, so a keyboard reader
  also keeps their exact place.
- **Nothing else changes.** The URLs are identical: a synced view is still shareable, still lands
  on Chart E on reload, and the signpost and “Return to since last payday” reset behave exactly
  as before. With JavaScript off every link is still an ordinary anchor that performs the old
  full load and lands on Chart E. Bars on an *unsynced* Chart D still open Purchases.

## Data and upgrade notes

There is **no schema migration, backup-format change or data rewrite**. This is a navigation
change on the Charts page only; no figure, projection or record moves, and nothing is written to
Settings by the sync. Existing households upgrade with no action needed.

## Validation evidence

- `npm run format:check`, `npm run typecheck`, `npm test` (**1,112/1,112 across 261 suites**) and
  `npm run build` pass.
- A new Playwright journey at 390px and 1400px counts document loads through `sessionStorage` and
  measures `window.scrollY` before and after tapping a drawn month bar: it fails against the old
  anchors (document count 1 → 2) and passes with this change. The existing issue #81 journey now
  asserts the same for its table-twin tap. The local `charts` project passed **14/14**.
- The required PR checks are `gates`, `browser` and `docker` (including container and applicable
  upgrade smoke). Publication must not proceed unless they pass.

## Unraid update

1. Take a household backup from Settings before updating.
2. Install or update to `ghcr.io/dougalbob/simple-finance-multi-household:v1.32.1` (or
   `:latest` after publication). Confirm the app badge reads **`v1.32.1 · stable`**.
3. Open **Charts**, engage **Sync to Spending mix** on Chart D, and tap a month bar or a month
   name in the table underneath. Chart E updates in place and the page should not move.
4. Keep the multi-household appdata `/mnt/user/appdata/simple-finance-multi-household` mounted at
   `/data` and host port **3009** mapped to container **3000**. Do not change to the original
   `simple-finance` image, appdata or route.
