# Simple Finance Multi-household

A private finance app for multiple independent households, self-hosted by the product owner on Unraid and protected by Cloudflare Access. Each household will have its own database and saved documents; households share the application, not financial data.

> **Status (2026-10-10):** this is the independent multi-household edition. The first published build is the release candidate **`v1.0.0-rc.1`**, with its notes in [`docs/RELEASE_NOTES_v1.0.0-rc.1.md`](docs/RELEASE_NOTES_v1.0.0-rc.1.md). Install only the exact tag. The release candidate does not import any existing household data, and it is not the stable release. Consent-based support access, the identity-to-`people` link and per-household backup and restore are implemented. Importing the existing household is a separate, approved step (see [`docs/MULTI_HOUSEHOLD_PLAN.md`](docs/MULTI_HOUSEHOLD_PLAN.md)).

## Non-negotiable separation

- **Repository:** `dougalbob/simple-finance-multi-household`.
- **Only GHCR image:** `ghcr.io/dougalbob/simple-finance-multi-household`. This repository must never push to `ghcr.io/dougalbob/simple-finance`, including the `latest` tag. The publish workflow contains a repository/image guard.
- **Original production app:** remains on bridge networking, host port `3007` → container port `3000`, using `/mnt/user/appdata/simple-finance`. Do not mount, alter or migrate that location.
- **New app target:** bridge networking, host port `3009` → container port `3000`, with `/mnt/user/appdata/simple-finance-multi-household` mapped to `/data`. Use a separate Cloudflare hostname/route to the new container; leave the existing route untouched.
- **Versioning:** the first candidate is `v1.0.0-rc.1` (SemVer prerelease). RCs publish only their exact version and `sha-<short>` tags—not `latest`. Production gets a separate stable `v1.0.0`; only stable releases move `latest`.

## Product and tenancy target

Each household has **one or two people**. An administrator pre-creates the household and assigns the Cloudflare email address(es) before first sign-in. Cloudflare Access verifies the identity; the app's own roster decides whether that verified identity is assigned and which household it can enter. There is no self-sign-up.

The app uses a separate SQLite database and `documents/` directory per household under the one new appdata root. A household backup includes only that household's database and documents. The app administrator has no standing in-app access to another household's finance data; access for support requires an explicit, visible, auditable and time-limited permission from that household. The owner and participating households accept that a host administrator could inspect files directly on Unraid.

See [`docs/MULTI_HOUSEHOLD_PLAN.md`](docs/MULTI_HOUSEHOLD_PLAN.md) for the complete active contract and delivery sequence. [`docs/SPEC.md`](docs/SPEC.md) is the product specification; [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) tracks design and delivery; [`docs/HANDOFF.md`](docs/HANDOFF.md) is the session continuation point. The old `AGENT_APP_BLUEPRINT.md` and historical v0.x notes describe the original single-household project unless explicitly superseded.

## What will remain within each household

Fast mobile entry, checkpoints, payday projections, recurring schedules, insights, supplier and contract records, attachments, and encrypted backups remain household-specific. The app still does not connect to banks, read statements, move real money, or provide financial advice.

## Unraid installation status and target

**Do not install the new template or point it at real data until the multi-household implementation and its first RC are ready.** The intended single data root is:

```text
/mnt/user/appdata/simple-finance-multi-household/  →  /data/
  .env
  system/registry.sqlite
  households/<opaque-household-id>/
    simple-finance.sqlite (+ WAL/SHM)
    documents/
    logging/
```

The central registry is for household identity, membership, administration and support grants—not finance records. A per-household backup excludes the registry and every other household. The target Unraid template is [`simple-finance-multi-household.xml`](simple-finance-multi-household.xml); its image, default appdata path and port are deliberately different from the original app. Stable template installs use the new image's `latest`; RC testing pins the exact candidate tag, such as `v1.0.0-rc.1`.

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

Merging a pull request does not publish an image. A lower-case annotated tag and the Publish workflow do. The first candidate is `v1.0.0-rc.1`, published from its release pull request; any additional candidate increments the suffix. An accepted production release is `v1.0.0`, not a retagged RC. See [`docs/RELEASE_PROCESS.md`](docs/RELEASE_PROCESS.md).

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
- **Insights:** `/insights` — month comparison, per-person attribution, vehicle running costs, and the
  honesty loop that compares configured figures with recent complete periods.
- **Charts:** `/charts` — the same figures drawn: the month ahead (household total, with zero always on the
  axis and the overdraft limit marked), the weekly shop against the configured figure and the trailing
  8-week average, personal spending per person per month with the household's shared spending kept
  separate, and the fixed commitments over the child categories ticked in Settings. Hand-rolled SVG, no
  client JavaScript, a table of the exact numbers under every chart, and a link from every bar to the
  purchases behind it.
- **Projects:** `/projects` — cost a future purchase or a whole project against real quotes before
  spending anything: materials down the side, suppliers across the top, quotes in the cells (with
  pack sizes and product links), delivery fees and free-delivery rules per supplier, and a
  shopping list grouped by supplier with the grand total against your target budget. Planning
  only — it never records a purchase.

## Household backup, restore and recovery

**Target behaviour, not yet implemented:** a backup is scoped to the selected household. It contains that household's consistent SQLite snapshot, only its stored attachments, and an integrity manifest. It never includes another household's database/documents, the system registry, `.env` or logs. The system registry/configuration has a separate administrator-managed recovery process.

Each household must be able to restore its backup only into its own selected household context. A restore rehearsal must use a clean isolated installation and verify both records and attachment hashes. Never restore or rehearse against `/mnt/user/appdata/simple-finance` or the original production container.

**Current runtime status:** `/api/backup` and `/api/restore` authenticate and enforce same-origin, then return `501` without reading or replacing finance data. Settings displays an unavailable notice; it no longer exposes the inherited global backup/restore controls. The underlying archive utilities remain legacy library code and are not tenant-scoped; do not re-enable the endpoints until household-scoped backup, restore, and isolation tests have separate approval.

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

The first multi-household candidate is planned as **`v1.0.0-rc.1`** (package/app version `1.0.0-rc.1`). The suffix is a SemVer prerelease identifier; if another candidate is needed, increment it (`v1.0.0-rc.2`). An RC gets its exact version tag and `sha-<short>` tag in the new package, **not `latest`**, and its GitHub release is marked pre-release. Once accepted for production, publish a distinct stable `v1.0.0` tag; stable releases may move `latest`. Never rename or retag the RC.

The only permitted registry is `ghcr.io/dougalbob/simple-finance-multi-household`. The inherited `v0.x` tags and release notes are history from the original single-household project; they must not be pushed or used as upgrade baselines for the new package. The version lives in `package.json`, `package-lock.json`, `src/lib/version.ts`, the Unraid template and the release notes, and these must be bumped together in each release pull request.
