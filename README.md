# Simple Finance Multi-household

A private finance app for multiple independent households, self-hosted by the product owner on Unraid and protected by Cloudflare Access. Each household has its own database and saved documents; households share the application, not financial data.

> **Status (2026-10-13):** this is the independent multi-household edition and **`v1.7.0` is the current
> stable production release** (`v1.0.0` was the first), with its notes in [`docs/RELEASE_NOTES_v1.7.0.md`](docs/RELEASE_NOTES_v1.7.0.md).
> It refines the Recurring page: Cancel sits inside Edit, double-confirm before cancelling, Restore a cancelled schedule with an explicit back-fill warning, the Active-from label trimmed, and alternating Schedules rows. The first-run setup path for a brand-new household is in ([`docs/ONBOARDING_PLAN.md`](docs/ONBOARDING_PLAN.md), Slice 1).
> Install `ghcr.io/dougalbob/simple-finance-multi-household:latest`. It does not import any existing
> household data. Consent-based support access, the identity-to-`people` link, per-household backup and
> restore, and registry backup and restore in `/admin` are implemented. Importing the existing household
> is a separate, approved step (see [`docs/MULTI_HOUSEHOLD_PLAN.md`](docs/MULTI_HOUSEHOLD_PLAN.md)). The three release candidates that
> preceded `v1.0.0` are history: `v1.0.0-rc.1` and `v1.0.0-rc.2` failed their Publish runs and were never
> pushed to GHCR; `v1.0.0-rc.3` published and was accepted.

## Non-negotiable separation

- **Repository:** `dougalbob/simple-finance-multi-household`.
- **Only GHCR image:** `ghcr.io/dougalbob/simple-finance-multi-household`. This repository must never push to `ghcr.io/dougalbob/simple-finance`, including the `latest` tag. The publish workflow contains a repository/image guard.
- **Original production app:** remains on bridge networking, host port `3007` → container port `3000`, using `/mnt/user/appdata/simple-finance`. Do not mount, alter or migrate that location.
- **New app target:** bridge networking, host port `3009` → container port `3000`, with `/mnt/user/appdata/simple-finance-multi-household` mapped to `/data`. Use a separate Cloudflare hostname/route to the new container; leave the existing route untouched.
- **Versioning:** `v1.7.0` is the accepted stable release and moves `latest` (`v1.0.0` was the first stable, `v1.0.1` shipped registry backup/restore, `v1.0.2` fixed and hardened that restore, `v1.1.0` shipped first-run onboarding, `v1.2.0` shipped the guide, `v1.3.0` shipped the worked example, `v1.4.0` shipped the three-month comparison, line-item drill-downs and the months chart, `v1.5.0` shipped the link treatment, the one-control attachment form and the chart hatch fix, `v1.6.0` ships the Purchases show toggles, two-row line editor, striped rows and supplier-card links, `v1.7.0` ships the Recurring page cancel-inside-edit, double-confirm, restore with back-fill warning, trimmed label, and alternating Schedules rows). Candidates (`v1.0.0-rc.N`, SemVer prereleases) publish only their exact version and `sha-<short>` tags—never `latest`, and they are never retagged. Any future stable release moves `latest` again.

## Product and tenancy model

Each household has **one or two people**. An administrator pre-creates the household and assigns the Cloudflare email address(es) before first sign-in. Cloudflare Access verifies the identity; the app's own roster decides whether that verified identity is assigned and which household it can enter. There is no self-sign-up.

The app uses a separate SQLite database and `documents/` directory per household under the one new appdata root. A household backup includes only that household's database and documents. The app administrator has no standing in-app access to another household's finance data; access for support requires an explicit, visible, auditable and time-limited permission from that household. The owner and participating households accept that a host administrator could inspect files directly on Unraid.

See [`docs/MULTI_HOUSEHOLD_PLAN.md`](docs/MULTI_HOUSEHOLD_PLAN.md) for the complete active contract and delivery sequence. [`docs/SPEC.md`](docs/SPEC.md) is the product specification; [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) tracks design and delivery; [`docs/HANDOFF.md`](docs/HANDOFF.md) is the session continuation point. The old `AGENT_APP_BLUEPRINT.md` and historical v0.x notes describe the original single-household project unless explicitly superseded.

## What stays within each household

Fast mobile entry, checkpoints, payday projections, recurring schedules, insights, supplier and contract records, attachments, and encrypted backups remain household-specific. The app still does not connect to banks, read statements, move real money, or provide financial advice.

## Unraid installation

**`v1.7.0` is released and the template is installable.** It uses its own data root, port and Cloudflare route, so it never touches the original app. The single data root is:

```text
/mnt/user/appdata/simple-finance-multi-household/  →  /data/
  .env
  system/registry.sqlite
  households/<opaque-household-id>/
    simple-finance.sqlite (+ WAL/SHM)
    documents/
    logging/
```

The central registry is for household identity, membership, administration and support grants—not finance records. A per-household backup excludes the registry and every other household. The Unraid template is [`simple-finance-multi-household.xml`](simple-finance-multi-household.xml); its image, default appdata path and port are deliberately different from the original app. The template defaults to the new image's `latest`, which only stable releases move; to test a candidate, pin its exact tag instead, such as `v1.0.0-rc.3`.

For first-login onboarding, the admin provisions the household and email assignment in the app before adding/allowing that email through Cloudflare Access. Cloudflare permission alone does not assign a household; the app denies a verified but unassigned identity. A separate hostname/route should direct to host port `3009`, while the original hostname continues to port `3007`.

### Local development

```sh
npm ci
cp .env.example .env
# In .env, set an isolated DATA_DIR, REGISTRY_ADMIN_EMAIL, and matching
# AUTH_DEV_BYPASS=true / AUTH_DEV_IDENTITY_EMAIL for local-only development.
npm run db:migrate:registry
npm run dev
```

On first local access, the empty registry bootstraps the configured development administrator; the verified registry assignment then selects and migrates that household's database. `npm run db:migrate` migrates only registry-listed household databases and never a global `data/simple-finance.sqlite`. The E2E harness seeds fictional `alex@example.com` and `sam@example.com` in a separate ignored `.e2e-data` root. Local dev bypass is not a substitute for real Cloudflare acceptance on the isolated RC installation.

### Release-candidate and production releases

Merging a pull request does not publish an image. A lower-case annotated tag on the release commit in `main`, pushed to this repository, runs the Publish workflow — which smoke-tests the image before pushing and then creates the matching GitHub release. An accepted production release is a new stable tag (`v1.0.0`), never a retagged candidate. **Cut the tag on `main`, from a merged release pull request:** the `v1.0.0-rc.2` and `v1.0.0-rc.3` candidates were tagged on a session branch that was never merged, which is why `main` was still describing `v1.0.0-rc.1` after `rc.3` had been published. See [`docs/RELEASE_PROCESS.md`](docs/RELEASE_PROCESS.md).

## Everyday use

- **At the till (phone):** Quick entry → Purchase — supplier (with its remembered category), total, split
  lines so the total matches exactly, paid-by, date, optional note, optional receipt photo.
- **Cash and bank checks:** Quick entry → Balance ("Balance now" = ledger balance for a bank, counted
  amount for cash) — or the till's **Checkpoint cash** card, which opens the signed-in person's own
  cash pot in one tap. Checkpoints are labelled as checkpoints, and never as a bank balance.
- **Fuel:** Quick entry → Fuel for a vehicle.
- **Income (laptop):** `/income` — the salary that repeats, scheduled for its day of the month and
  corrected in place (a change applies from the next instance onward), plus one-off money recorded by
  hand: something you sold, a refund, a gift, a one-off job. Cash or bank transfer is simply which pot
  it landed in. A payday that falls on a Saturday or Sunday is expected on the Friday before. Income
  is not spending: it has no category, never appears in an insight, and shows up in All Transactions
  as `BAC`.
- **Moving money:** Quick entry → Move — between your own pots (a cash handover from one of you to the
  other is a transfer here, not a mystery), borrowing and repayments against someone you track on
  `/pots`, a swap with someone outside the household (cash one way, bank transfer the other), or other
  money in/out with a note saying what it was. Borrowing is always shown as owed beside "available
  now" — never as income — and repayments are never spending.
- **Reviewing:** `/purchases` filters and inline edit/refund/void (a purchase record is never deleted —
  the history is kept). A receipt attached to a purchase can be removed from Purchases, Overview or
  Suppliers; that removal is in the purchase's History, the file leaves `documents/`, and an older backup
  is the only way to get it back. `/recurring` shows the month calendar and the schedule list,
  `/contracts` shows contract ends and renewals with the follow-ups you promised.
- **All activity in one pot:** `/transactions` — a read-only list of everything that touched a chosen
  account or cash pot between two dates: purchases, direct debits and standing orders, transfers,
  borrowing and repayments, swaps and other money, and **income** (`BAC`), in one amount column (green
  in, red out relative to that pot), with the original note, checkpoint dividers and a link from every
  row to the page that can still edit or void it. Nothing on that page writes anything.
- **Insights:** `/insights` — a three-month comparison (each month with its change against the month
  before it), per-person attribution, vehicle running costs, and the honesty loop that compares
  configured figures with recent complete periods. Every figure opens its line items inline — the
  purchases behind the number — with a link to the same rows in the purchase history.
- **Charts:** `/charts` — the same figures drawn: the month ahead (household total, with zero always on the
  axis and the overdraft limit marked), the weekly shop against the configured figure and the trailing
  8-week average, personal spending per person per month with the household's shared spending kept
  separate, the fixed commitments over the child categories ticked in Settings, where the money goes
  (a spending-mix pie), and three months by category (with an Exclude Housing toggle). Hand-rolled SVG, no
  client JavaScript, a table of the exact numbers under every chart, and a link from every bar to the
  purchases behind it.
- **Projects:** `/projects` — cost a future purchase or a whole project against real quotes before
  spending anything: materials down the side, suppliers across the top, quotes in the cells (with
  pack sizes and product links), delivery fees and free-delivery rules per supplier, and a
  shopping list grouped by supplier with the grand total against your target budget. Planning
  only — it never records a purchase.

## Household backup, restore and recovery

**Implemented.** A backup is scoped to the calling household: it contains that household's consistent SQLite snapshot, only its stored attachments, and an integrity manifest. It never includes another household's database or documents, the system registry, `.env` or logs. Household archives are format 3 and name their own household.

- `POST /api/backup` takes a passphrase of at least 12 characters and returns the archive. It authenticates, enforces same-origin, and refuses an open support view with `403`. A missing attachment file gives `409` and nothing downloads.
- `POST /api/restore` takes the archive, its passphrase and the typed word `RESTORE`. It refuses **before changing anything**: an archive belonging to another household, a legacy format 1 or 2 archive (which includes anything made by the original single-household app), an archive over 512 MiB, a wrong passphrase, or a tampered archive. A valid archive replaces only the caller's own household under a maintenance lock, keeps the previous copy under a `.pre-restore` name, and clears any sign-in links the registry no longer assigns to that household (reported back as `personLinksCleared`).
- Settings shows the household's own backup and restore controls. The inherited app-wide backup controls are gone. An open support view sees a message instead, because a support session is read-only.

The system registry (`system/registry.sqlite`) and `.env` are deliberately **not** in a household backup. Since `v1.0.1` the registry has its own download/restore controls in the admin panel; `.env` still needs the host's own backup routine. Never restore or rehearse against `/mnt/user/appdata/simple-finance` or the original production container.

## Stack (as built)

Next.js 16 (App Router, React 19) · TypeScript strict · Tailwind CSS · SQLite via better-sqlite3 + Drizzle
ORM with checked-in SQL migrations · `jose` for Cloudflare Access JWT verification · Zod at the server
boundary · Node's built-in test runner through `tsx` · Playwright for the browser acceptance suite.
Domain engines (`estimates`, `projection`, `keydates`, `insights`, `chart-series`, `dates`) are
framework-free pure modules with DST and boundary tests.

## Gates

The same commands CI runs, all from the repository root:

```
npm ci                 # CI uses a plain install; this sandbox needs --ignore-scripts
npm run format:check   # Prettier (markdown is excluded deliberately)
npm run typecheck      # tsc --noEmit
npm test               # Node test runner; test count changes as work lands
npm run build          # production build (Turbopack)
npm audit --omit=dev   # production dependencies must report 0 vulnerabilities
npm run test:e2e       # browser acceptance suite (needs: npx playwright install --with-deps chromium)
```

The browser suite runs in CI's `browser` job; the release workflow must smoke-test the built image before pushing it to the new GHCR package, including health, least privilege, persistence, and the applicable upgrade path. `npm audit` will suggest
`npm audit fix --force` for four moderate advisories in the dev-only drizzle-kit/esbuild chain — **do not
run it**: it downgrades drizzle-kit to 0.18.1.

## Privacy — this repository is public

No real names, balances, receipts or addresses exist anywhere in this repository, and none may be added —
not in code, tests, fixtures, screenshots, issues or pull requests. `.env.example` holds placeholders only.
Real configuration lives in `/mnt/user/appdata/simple-finance-multi-household/.env` (container `/data/.env`) inside the private installation. Real household data lives only under `/data/households/<opaque-household-id>/`; never commit or publish it.

## Version and release line

**`v1.7.0` is the accepted stable release** (package/app version `1.7.0`, badge `v1.7.0 · stable`). It is published as `v1.7.0`, `latest` and `sha-<short>`, all to one digest, and its GitHub release is marked Latest. `v1.0.0` was the first stable release, `v1.0.1` shipped registry backup/restore, `v1.0.2` fixed and hardened the restore, `v1.1.0` shipped first-run onboarding, `v1.2.0` shipped the guide, `v1.3.0` shipped the worked example, `v1.4.0` shipped the three-month comparison, `v1.5.0` the link treatment/one-control attachments/chart hatch fix, and `v1.6.0` the Purchases page show toggles/two-row editor/striped rows/supplier links; their own image tags stay on their own digests while `latest` has moved on.

A candidate is a SemVer prerelease with an `-rc.N` suffix, incrementing per build (`v1.0.0-rc.1`, `-rc.2`, …). A candidate gets its exact version tag and `sha-<short>` tag, **not `latest`**, and its GitHub release is marked pre-release. Accepted candidates become a distinct stable tag; never rename or retag one. The candidates so far: `v1.0.0-rc.1` and `v1.0.0-rc.2` exist as Git tags but their Publish runs failed before pushing, so **no image exists for either**; `v1.0.0-rc.3` published, was accepted on a real installation, and is the base `v1.0.0` was promoted from.

The only permitted registry is `ghcr.io/dougalbob/simple-finance-multi-household`. The inherited `v0.x` tags and release notes are history from the original single-household project; they must not be pushed or used as upgrade baselines for the new package. The version lives in `package.json`, `package-lock.json`, `src/lib/version.ts`, the Unraid template and the release notes, and these must be bumped together in each release pull request.
