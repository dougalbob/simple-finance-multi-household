# Release notes — v1.1.0 — First-run onboarding: a brand-new household can set itself up

**Type:** stable minor release. This moves `latest` and is GitHub's Latest release.
**Install this image:** `ghcr.io/dougalbob/simple-finance-multi-household:latest`.
**Version badge:** `v1.1.0 (stable)`.

## Why this release exists

A household starts with nothing in it, so nothing can be demonstrated: a tour of empty screens teaches
nothing, and the app's own empty states decided the first ten minutes. Measured on a genuinely fresh
data root, the first run had three concrete faults beyond just being empty:

- the home card ("Household targets") asked for **two people and a vehicle**, so it **never cleared**
  for a one-person household — which `docs/MULTI_HOUSEHOLD_PLAN.md` §2 treats as complete;
- `/transactions` told you to add a pot **in Settings** — pots live on `/pots`;
- seven separate "Create a pot first…" messages named the missing dependency but gave **no link**, and
  so did `/horizon`'s checkpoint prose and the entire till form when the household has no pots.

`v1.1.0` builds the first slice of [`docs/ONBOARDING_PLAN.md`](ONBOARDING_PLAN.md) (approved by the
household on 2026-10-11): a **setup path derived from the household's own records**, and the repairs
above. No schema change, no storage change, no auth change and no new dependency.

## What changed

- **New: the setup path is derived, never ticked.** `src/lib/records/setup-path.ts` reads eight steps
  out of the household's own records — **Phase A, "your first projection":** people, pots (with
  opening amounts), the first checkpoint, and the salary schedule; **Phase B, "the rest, at your
  pace":** bills and scheduled payments, the projection figures (weekly shop and fuel), credit-card
  balances, and recording a few purchases. Each step's state comes from the data: nothing is stored,
  nothing is gated, no page refuses to open because a step is missing, and steps can never disagree
  with the records because there is no second copy of the truth.
- **New: `/start` — "Set up this household".** Phase A shows "N of 4 done" with the outstanding steps
  first; Phase B shows "N left". The short Phase A fields are filled in **where they are described**
  (person name, pot name/kind/owner, an amount for a pot you already have, and the salary schedule),
  and the long forms (schedules, purchases) stay on their own pages and are linked from here. Below
  the steps, a short "later, when you're ready" list names what each payoff page wants and links it
  (`/recurring`, `/insights`, `/charts`, `/horizon`, `/tasks`, the till).
- **New: the home card leads to the next step.** The old "Household targets" card is gone. Home now
  shows the next Phase A step with its inline form and a link to the full path — then, once Phase A
  is done, one quiet line telling you how many Phase B steps remain — then nothing at all once the
  household is set up.
- **Fixed: one person and no car is a complete household.** The derived condition replaces
  `people.length < 2 || vehicles.length === 0`, so the card that could never be dismissed is gone.
- **Fixed: empty states point where the thing actually lives.** `/transactions` now points at
  `/pots`; the seven "Create a pot first…" messages (income, borrowing, other movements, swaps, cash)
  now link `Accounts, Pots & Checkpoints`; `/horizon`'s checkpoint prose links it too; and the till
  with no pots at all shows one line and that link instead of an empty picker.
- **`/start` is reachable but not in the way:** it has an entry in the navigation and the footer, and
  every household action revalidates it (`PAGE_PATHS` in `src/app/actions.ts`), so the path is always
  current the moment a form on another page is submitted.
- **Support sessions stay read-only:** every inline form on `/start` and the home card is hidden when
  the request is a read-only support session, and the forms post only to actions that already refused
  writes in that mode.

## Who is affected and what to do

- **Any existing household (including this installation):** nothing to do. Your records decide the
  path, so a household that is already running will simply see the card and `/start` in their finished
  state — or nothing at all. No migration runs; no data is touched.
- **Anyone running `v1.0.2` or `latest`:** update the container (`latest` now resolves here). The badge
  should read `v1.1.0 · stable`. Nothing else changes.
- **A newly created household:** sign in and the home page now says what to do first; `/start` holds
  the whole path. The old advice to add a second person and a vehicle is gone — one person alone is a
  household.
- **The original single-household app:** unchanged. It stays on port `3007` with its own appdata and
  route. Do not point this release at `/mnt/user/appdata/simple-finance`.

## Schema and data caveats

- **No schema change.** Finance migrations `0000`–`0016` and registry migrations `0001`–`0002` are
  unchanged from `v1.0.2`; upgrading runs no new migration.
- **No new stored state.** The setup path is derived on each request from records the app already
  keeps; there is no "onboarding seen" flag, no cookie, and nothing to reset or clean up.
- Household backups (format 3), registry backups and `.env` handling are unchanged: the registry and
  `.env` still stay outside household backups.
- `readOnly` support sessions continue to refuse writes; the new forms do not add a write path.

## Validation evidence

- Local gates before the PR: `npm run format:check` pass; `npm run typecheck` pass; `npm test`
  **842 passed, 0 failed** (11 new tests for the setup-path derivation); `npm run build` pass (the
  route table includes `/start`); `npm audit --omit=dev` **0 vulnerabilities**.
- **New first-run browser suite:** `e2e/fresh-household.spec.ts` runs against a **genuinely empty**
  household — its own data root (`.e2e-data-fresh`), its own port (3200) and its own actor — and is
  wired into the CI `browser` job as `npm run test:e2e:fresh` alongside the seeded suite. It asserts
  the home card's step count, the `/transactions` → `/pots` pointer, the till's no-pots state, the
  empty checkpoint hint on `/start`, and then fills all four Phase A forms and verifies the card
  unmounts, the projection figures appear, the payday summary renders and `/start` reports
  "The projection is live."
- Full local seeded browser suite in this sandbox: **114 passed, 10 failed**, where all ten failures
  have one cause and none is a product defect. The sandbox has a 3.9 GB memory limit and its OOM killer
  killed the `next dev` server (3.4 GB RSS) while the admin registry-restore test was compiling
  `/admin/restore`; every test after that failed with `net::ERR_CONNECTION_REFUSED`, not with an
  assertion. Each affected spec — `admin` (4), `backup` (3), `credit-card-pots`, `insights`,
  `payday-summary` — passes on its own re-run, verified for all of them. The only spec change in this
  release is the two navigation link counts that gained the "Getting started" entry.
- CI `gates` (format, types, unit tests, build, audit), `browser` (seeded + fresh Playwright suites)
  and `docker` (image build, entrypoint smoke, `v1.0.2` → `v1.1.0` upgrade smoke) are required green
  on this release PR and on the `main` merge commit before the tag is pushed.
- The Publish workflow smoke-tests the built image before pushing and upgrades the published `v1.0.2`
  volume to this image.

## Next after this release

Slices 2 and 3 of `docs/ONBOARDING_PLAN.md` are approved in direction and **not built**: `/guide` with
a "what this page needs first" pattern for the payoff pages, and a worked example rendered from a
fictional household through the real engines (not a prose page that drifts). Both start as their own
PR. Slice 3 must never write into a real household database.

## Known limitations

- The path shows the **next** step and the two phases, not a single ordered checklist across all eight
  steps; Phase B order is a suggestion, and any page can be used in any order.
- The inline forms cover the four Phase A steps only. Bills, projection figures, card balances and
  purchases link to their own pages, which already have the full forms.
- Slice 1 has no "worked example": an empty household still sees zero-figure charts until it records
  something. That is Slice 3's job, deliberately.
- `/start` stays in the navigation even when the household is fully set up (the home card is what
  disappears). Recorded as an open copy decision in the onboarding plan.
- Unchanged from `v1.0.2`: restore is a whole-file registry replace, the support-grant flow has unit
  tests but no browser test, the `secure` cookie flag applies only in production builds, and household
  restore reads up to 512 MiB into memory.
