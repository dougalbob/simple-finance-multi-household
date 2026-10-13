# Release notes — v1.6.0 — Purchases: show toggles, a roomier editor, striped rows and supplier links

**Release line:** v1.6.x · stable · released 2026-10-13 (Europe/London)

- Image: `ghcr.io/dougalbob/simple-finance-multi-household:v1.6.0`
- Compose: `ghcr.io/dougalbob/simple-finance-multi-household:latest`
- Unraid template: `ghcr.io/dougalbob/simple-finance-multi-household:latest`, host port **3009**
- Platform: linux/amd64

## In this release

All four changes are on the **Purchases** page (PR #18, decision 205), and all four were household requests:

- **Four show toggles, all on by default.** The filter boxes are now **Purchases** (anything that is not a
  scheduled payment), **From schedule**, **Refunds** and **Voided** — and they show rather than narrow:
  every box starts ticked, so the page opens on the complete history. Untick **From schedule** and only
  ordinary purchases, refunds and voided records remain; untick **Purchases** to see just the scheduled
  ones. One behaviour change to know about: **voided records are now visible by default** (before, they
  were hidden until the Voided box was ticked) — untick Voided to hide them again. A record with two tags
  (a voided refund, say) is hidden if either of its tags is unticked. The old "only" links from Charts
  and Tasks (`scheduleOnly`, `voidedOnly`) still land where they always did.
- **A roomier purchase editor.** Amount, Category and Spent for were squeezed onto one row, so a long
  "Parent / Child" category name was unreadable in its own box. Each line now puts **Spent for** and
  **Amount** on the first row and **Category** across the full second row (with **Which** following when
  a person or vehicle is chosen), the boxes are slightly shorter, and the edit panel itself is wider.
  The refund form shares the same editor, so it gets the same layout.
- **Alternating rows.** Neighbouring purchases now alternate plain and lightly tinted, in the page's own
  hue, so it is easier to follow one record across the table — on every theme.
- **The supplier name is a link.** Pressing it goes to the Suppliers page with that supplier's card
  already expanded and filtered, the same destination the "Supplier card" links elsewhere already used.

## Upgrade

From **v1.5.0 or any earlier stable multi-household v1.x** — back up, pull and restart. There is no
schema change or new migration. Before updating, keep a household backup from Settings, the separate
registry backup from `/admin`, and the host's backup of `.env` (neither the registry nor `.env` is in a
household backup).

```bash
docker pull ghcr.io/dougalbob/simple-finance-multi-household:v1.6.0   # version-pinned
docker pull ghcr.io/dougalbob/simple-finance-multi-household:latest  # Compose/Unraid template
```

Keep the existing multi-household data mount: `/mnt/user/appdata/simple-finance-multi-household` →
`/data`, with host port **3009** → container port **3000**. In Unraid, use **Force Update** on this
container and confirm **`v1.6.0 · stable`** in the header. **Do not delete `system/` or any household
data.** Original single-household `v0.x` images and their data (port **3007**,
`/mnt/user/appdata/simple-finance`) are untouched by this update and require a separately approved
import, not this update.

## For the household: what to look at

1. **Purchases filters.** All four boxes start ticked; untick **From schedule** to hide direct debits and
   standing orders, or untick **Purchases** to see only them.
2. **Edit any purchase.** The Category box now has a full row to itself, so long category names are
   readable before you change them.
3. **Press a supplier's name.** It opens that supplier's expanded card.

## Validation

- `npm test`: **879 tests / 202 suites, all passing**, including a new suite proving each of the four
  toggles hides its own kind independently.
- `npm run format:check`, `npm run typecheck` and `npm run build` all clean in the release session.
- Browser: the desktop purchases filter/edit and void cases pass locally (2/2, via the sandbox Chromium
  recipe), covering the toggles' default state, the supplier link, row striping and the void flow. The
  full seeded and empty-household suites are required CI gates on the pull request.
- CI (`gates`, `browser`, `docker` and the container smoke) runs on this pull request and again on the
  merge commit; the Publish workflow builds, smoke-tests and pushes the image from the `v1.6.0` tag.

## Version badge

Users should see **`v1.6.0 · stable`** in the app header after upgrading.
