# Release notes — v1.43.0 — Wiki link in the site menu

**Stable release.** This build moves `latest` and is marked Latest on GitHub.
Version badge: **v1.43.0 · stable**.

## What changed

- The site menu has a new **Wiki** entry, shown with the GitHub mark before the label
  (`<GitHub icon> Wiki`). It links to the project wiki at
  https://github.com/dougalbob/simple-finance-multi-household/wiki and opens in a new tab.
- It appears in both places the menu is shown: the desktop navigation bar (after the last
  page link, before Admin when Admin is visible) and the phone drawer (end of the "More" group).
- The link is an external GitHub page, not an app page, so it does not add a route to the app.

## Schema, data and compatibility

- No schema change, no migration, no backup-format change, no storage-path change.
- No existing setting, record or permission changes. Nothing needs doing before or after upgrading.

## Who is affected and what to do

Every household user sees the new menu entry after upgrading. To upgrade on Unraid, back up the
households and Admin registry first, then use **Force Update** on the **Simple Finance
Multi-household** container only, from `ghcr.io/dougalbob/simple-finance-multi-household:latest`
(or pin `:v1.43.0`). Keep appdata at `/mnt/user/appdata/simple-finance-multi-household` and host
port **3009**. Never touch the original installation (appdata `/mnt/user/appdata/simple-finance`,
port 3007).

## Validation

- `tests/site-nav-routes.test.ts` (route guard plus a new wiki-link test: URL, new-tab attributes,
  GitHub icon, rendered in both places) and `tests/version.test.ts` pass.
- `npm run typecheck` passes.
- The existing browser drawer and desktop-menu specs check for their links by name and are
  unaffected by the added entry.
