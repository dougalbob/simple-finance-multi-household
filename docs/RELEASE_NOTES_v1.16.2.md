# Release notes — v1.16.2 — Schedule links land below the menu in every browser

## What changed

Following a Supplier card's **Linked to schedule "…"** link could still leave the filtered schedule tucked behind the menu bar in production (issue #43), even after v1.13.1 measured the header instead of guessing it. The v1.13.1 landing relied on the browser honouring the schedule row's scroll offset while it scrolled; the browser in the production report does not (older WebKit is the known case), so the row arrived at the very top of the screen, behind the menu, and nothing moved it.

Now the app verifies every anchored landing against the real menu bar. If a deep-linked row, card or heading has come to rest behind the bar, the page is corrected once by exactly the missing distance, so the target sits below the menu with the usual breathing room. The correction only fires when the target has stopped moving (a page still growing is left alone), only once per link, and the first tap, scroll or key press cancels it — the page is never moved under your finger. In browsers that already landed the link correctly (including every case v1.13.1 checked), nothing changes at all.

This applies to every anchored deep link in the app, not just schedules: purchase rows, supplier cards, settings cards, chart panels and the rest all get the same verified landing.

No schema, migration, financial data or backup-format changes.

## Validation

The new browser regression first ran red against v1.16.1 in the reported shape — with the browser's scroll-offset honouring simulated off, the schedule row sat at the top of the screen under an 85px menu a full second after landing, on laptop and phone — and green after the fix (the row corrects to exactly menu-plus-gap). The phone-width Supplier-card journey is now covered too. The existing Recurring, Charts, Insights and All Transactions browser projects pass unchanged, including the charts/settings journey that a previous, unguarded attempt at this correction broke in v1.13.1. Unit tests pin the correction rule and its three guards. Full local gates: format, types, themes, the batched unit suite, production build and production audit; required PR CI and tagged Publish checks remain the release gates.

## Stable update and Unraid

Stable patch **v1.16.2**; the badge reads `v1.16.2 · stable`. After successful publication, update the existing multi-household container normally using `ghcr.io/dougalbob/simple-finance-multi-household:latest`, or pin `:v1.16.2`. Both tags resolve to the same verified image.

Keep host port **3009** → **3000**, bridge networking, the existing Cloudflare route and `/mnt/user/appdata/simple-finance-multi-household` → `/data` unchanged. Continue normal household, registry and `.env` backups. No restore or separate migration step is needed. Do not alter the original app on port 3007 or its appdata.
