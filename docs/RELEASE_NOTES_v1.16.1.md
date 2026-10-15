# Release notes — v1.16.1 — Give split amounts room on laptop

## What changed

Quick Entry split cards now stack category, amount row and **Add item** at every width. On laptop, the amount and adder use the full card width instead of sharing a narrow column with the "+" button. Mobile keeps its existing stacked layout. The separate "+" remains a 48×48px target.

Same-category totalling and the automatic remainder are unchanged. No schema, migration, financial data or backup-format changes.

## Validation

The desktop geometry regression ran red against v1.16.0's side-by-side layout, then green after stacking. Input client widths must be at least 80px, the desktop amount row must sit below category, and "+" must be at least 48×48px. All four remainder specs at 393px/1400px and all three mobile split specs passed locally, including £70.39 total and £29.61 remainder. Required PR CI and Publish checks remain release gates.

## Stable update and Unraid

Stable patch **v1.16.1**; the badge reads `v1.16.1 · stable`. After successful publication, update the existing multi-household container normally using `ghcr.io/dougalbob/simple-finance-multi-household:latest`, or pin `:v1.16.1`. Both tags resolve to the same verified image.

Keep host port **3009** → **3000**, bridge networking, the existing Cloudflare route and `/mnt/user/appdata/simple-finance-multi-household` → `/data` unchanged. Continue normal household, registry and `.env` backups. No restore or separate migration step is needed. Do not alter the original app on port 3007 or its appdata.
