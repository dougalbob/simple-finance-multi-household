# Release notes — v1.2.0 — The guide, and what each page needs first

**Type:** stable minor release. This moves `latest` and is GitHub's Latest release.
**Install this image:** `ghcr.io/dougalbob/simple-finance-multi-household:latest`.
**Version badge:** `v1.2.0 (stable)`.

## Why this release exists

A brand-new household that opened the payoff pages — the payday projection, Horizon, Charts and Insights —
met zero-figure scaffolding: twelve empty week bars on a £0–£1 axis, "October £0.00 vs September £0.00",
"no complete week recorded yet". Those pages are exactly the ones that reward the setup work, so the
blank state explained nothing. `v1.2.0` builds Slice 2 of [`docs/ONBOARDING_PLAN.md`](ONBOARDING_PLAN.md),
approved by the household: a plain-language guide to how the app thinks, and a short statement on each
payoff page of the records it is waiting for.

No schema change, no migration, no storage change, no auth change and no new dependency.

## What changed

- **New: `/guide` — "How this app thinks".** One page with eight anchored sections: checkpoints, estimates
  and bank balances; income is not spending; transfers are not spending; borrowed money is owed, never
  income; schedules convert on the due date and history is never rewritten; the projection is arithmetic
  on your figures; what "the app has noticed" means; and what the app will never do. Each section says
  where you can see the idea in the app. It is linked from the footer and from *Getting started*, and any
  page can link straight to a section (for example `/guide#checkpoint`). It reads no household records.
- **New: "What this page needs first".** On the four payoff pages, the missing records are named in one
  sentence each, with a link to the *Getting started* step that supplies them. The list comes from the same
  steps as the setup path, so it can never disagree with what is recorded, and a need closes everywhere
  as soon as its record exists. Optional steps (credit cards, renewals) and the Phase B bills are never
  needs.
  - **Home:** the locked payday projection card lists what it is waiting for.
  - **Horizon:** the no-checkpoint block lists what it needs, in place of the prose.
  - **Charts:** the forecast card lists what it needs. While nothing has been recorded, the four reported
    charts give way to one block instead of drawing empty bars.
  - **Insights:** the month comparison and the honesty loop give way to one block while nothing is
    recorded. The people, vehicle and fuel-economy panels keep their own honest sentences.
- **Inline guide links** on the home, Horizon, Charts and Insights prose, and a "How this app thinks" link
  under the review rhythm on *Getting started*.
- **Decided:** *Getting started* keeps its navigation entry. The home card is still the only element that
  leaves once the first projection is set up.

## Who is affected and what to do

Nothing is migrated and no data changes. Take the usual backup, then update to `latest`. A household with
records sees the same payoff pages, with the guide links added; a brand-new household sees the needs
blocks in place of the empty charts.

## Validation

- `npm test`: 857 unit tests passing, including 15 new ones (`tests/guide.test.ts`,
  `tests/page-needs.test.ts`), which drive real records through the domain APIs.
- Browser acceptance, run locally: the first-run suite against an empty household (3 of 3, including the
  new needs-and-guide assertion) and the seeded projects that render the changed pages (64 of 64).
  The full seeded suite is the CI `browser` job.
- Typecheck, formatting and the production build are clean in CI.

## Not verified

- A real iPhone or Android render of the guide and the needs blocks. The layout was checked in headless
  Chromium at phone and laptop widths only.

## Next after this release

Slice 3 of `docs/ONBOARDING_PLAN.md` is approved in direction and **not built**: the worked example at
`/example`, rendered from a fictional household through the real engines. As the household asked, that
fictional history spans **two calendar months**, so the month-on-month comparison is visible to a new user.
Slice 3 must never write into a household database.

## Known limitations

- The guide describes behaviour that is already built. A rule that changes must change its section in the
  same release (`tests/guide.test.ts` pins the load-bearing phrases to catch drift).
- The needs blocks say what is missing, not how to fix a figure. Each action goes to the existing step or
  page, which already has the full form.
- Unchanged from `v1.1.0`: the support-grant flow has unit tests but no browser test, the `secure` cookie
  flag applies only in production builds, and household restore reads up to 512 MiB into memory.
