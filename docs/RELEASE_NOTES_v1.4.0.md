# Release notes — v1.4.0 — Three months, line items and the months chart

**Release line:** v1.4.x · stable · released 2026-10-12 (Europe/London)

- Image: `ghcr.io/dougalbob/simple-finance-multi-household:v1.4.0`
- Compose: `ghcr.io/dougalbob/simple-finance-multi-household:latest`
- Unraid template: `ghcr.io/dougalbob/simple-finance-multi-household:latest`, host port **3009**
- Platform: linux/amd64

## In this release

- **Insights compares three months side by side** (PR #TBD): the month comparison shows the three
  most recent calendar months, oldest first, each month after the first paired with its **change
  against the month before it**. Two complete months always compare, even at the start of a month;
  a household that began recording mid-window simply sees the earlier months blank, and the gap
  self-cures as history fills in. The month still running is labelled "(in progress)" as before.
- **Every Insights figure opens its line items** (PR #TBD): clicking a monthly total, a parent
  category's cell, a person's figure, or a vehicle running-cost figure opens the purchases behind it
  inline — date, where, category, who it was for, and amount — with **Open these purchases →**
  opening the same rows in the purchases list. The drill is a real link (`?show=…`), so it works
  with JavaScript switched off and can be copied to the other person; pressing the figure again
  closes the table. Vehicle rows add up to the figure being opened: an annual premium shows its
  ÷ 12 share with the full payment footnoted on the row (decision 190's spread).
- **A new chart: three months by category** (PR #TBD): grouped bars per parent category — one bar
  per month, the same three months as the Insights table — on `/charts`. An **Exclude Housing**
  toggle removes Housing alone from the drawing so the other bars can breathe (Housing is about
  35% of this household's spending); the month still running is hatched and labelled "(so far)",
  and every bar opens its own purchases. The chart reads the same figures as the Insights table, so
  the two views cannot disagree. Category names on the axis are shortened ("Grocer'", "Person'",
  "Vehicle'") with the full name on hover, the bars are kept thin so more categories fit at once,
  and when the categories outgrow the screen the drawing scrolls sideways — swipe it with a finger,
  drag it with a mouse, or tap the small ◀ ▶ arrows.
- **Process fixes:** `prettier --check .` is clean again — v1.3.0 changed three files without
  running `npm run format`, which failed the release's format gate; the release docs name the
  current release, so the multi-household isolation contract stays green (it caught the drift
  immediately after v1.3.0); and `scripts/seed-example-household.mts` runs end-to-end at last
  (v1.3.0 shipped it unable to start), which is how this release's preview was seeded.

## Upgrade

From **v1.3.0 or any earlier v1.x** — pull and restart. There is no schema change.

```bash
docker pull ghcr.io/dougalbob/simple-finance-multi-household:v1.4.0   # version-pinned
docker pull ghcr.io/dougalbob/simple-finance-multi-household:latest  # Compose/Unraid template
```

From any **pre-v1** image (rc.7 or earlier), the upgrade is now two steps: **first stop and delete
the old `system/` registry folder inside the appdata folder**, then pull and start v1.4.0 and let
the migration finish. This is still the only clean path away from the inherited `v0` namespaces,
and it drops none of the household's money history.

As before: after the container is up, visit **`/settings`** and confirm each allowed sign-in email
is listed under Households and Identities. The upgrade rechecks every restriction automatically.

No new user-visible secrets or environment variables; see `docs/ENVIRONMENT.md` if you are curious
about the ones the app accepts.

## For the household: how to use it

1. **Insights → the three-month table.** The oldest month is on the left; each Change is against
   the month before it, so September's Change compares with August and October's with September.
   Months before the household started recording are simply blank.
2. **Click any figure** — a monthly total, a category cell, a person's total, any running-cost
   figure — and the purchases behind it open underneath: what it was, where, who it was for, and
   how much. **Open these purchases →** takes the same rows to the purchases list; clicking the
   figure again closes the table. Everything works with JavaScript off, and the open state is in
   the link, so it can be texted to the other person.
3. **Charts → “Three months by category”** draws the same table: three bars per category. If one
   category (Housing) flattens everything else, press **Exclude Housing** to see the rest — it
   comes back with one press. On a phone the drawing scrolls sideways when there are many
   categories — swipe it, or use the small arrows; short names like "Grocer'" show the full
   category name when you hover them.
4. **A payment spread over a year still shows its share.** Opening a vehicle figure that includes
   an annual premium shows the ÷ 12 share in the month, with the full payment in the row's
   footnote — the rows always add up to the figure you clicked.
