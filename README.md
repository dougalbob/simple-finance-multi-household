# Simple Finance Multi-household

**v1.43.0 — Wiki link in the site menu:** the site menu gains a **Wiki** entry, shown with the GitHub
mark before the label, linking to the project wiki in a new tab. It appears on the desktop bar and in
the phone drawer. External link only: no route, schema, migration, backup-format or storage change.
Image `ghcr.io/dougalbob/simple-finance-multi-household:v1.43.0` (stable also moves `latest`), appdata
`/mnt/user/appdata/simple-finance-multi-household`, host port **3009**. See
[release notes](docs/RELEASE_NOTES_v1.43.0.md), [handoff](docs/HANDOFF.md) and decision 266.

**v1.42.1 — The app icon ships with every release (issue #115):** every stable release and
prerelease now carries the canonical 512 × 512 PNG as
`simple-finance-multi-household-icon.png`. Publish validates the checked-in image, uploads the exact
bytes from the release-tag checkout, and on a rerun either fills in a missing asset or downloads and
byte-verifies the one already present; it never fetches the moving `main` branch or silently
replaces mismatched published bytes. This is a release-infrastructure patch only: no app behaviour,
schema, migration, PWA icon, Unraid template or backup-format change. Image
`ghcr.io/dougalbob/simple-finance-multi-household:v1.42.1` (stable also moves `latest`), appdata
`/mnt/user/appdata/simple-finance-multi-household`, host port **3009**. See
[release notes](docs/RELEASE_NOTES_v1.42.1.md), [handoff](docs/HANDOFF.md) and decision 265.

**v1.42.0 — Renaming a document renames the file (issue 112):** the v1.41.0 **friendly name** is gone
from the interface — it did not behave as the household expected — and **Rename** now edits the
document's real file name, which is the one name the chip, the viewer, the download and the
Documents search use. The editor opens pre-filled with the whole current name, and the file's own
extension is added automatically when it is left off (`Vehicle MOT` → `Vehicle MOT.png`); a wrong
document extension is replaced rather than doubled, and the extension always comes from the file's
content-sniffed type. Uploads are named the same way. A rename touches only the name — storage key,
bytes and the backup format are untouched — and is recorded in the record's History. The `label`
column is kept but unused: **no migration**, and nothing to re-enter. Image
`ghcr.io/dougalbob/simple-finance-multi-household:v1.42.0` (stable also moves `latest`),
appdata `/mnt/user/appdata/simple-finance-multi-household`, host port **3009**. See
[release notes](docs/RELEASE_NOTES_v1.42.0.md) and [handoff](docs/HANDOFF.md).

**v1.41.1 — The Documents page, actually shipped:** v1.41.0 linked the menu to `/documents` but
omitted the page itself, so the item opened Next's 404 (the friendly-label work and search library
were present and correct). This patch adds the missing **Documents** page — one household-scoped
search over every stored attachment by friendly name, file name and owning record, with each
result linking back to Purchases, Income or Suppliers via `?attachment=<id>` so the document's
chip scrolls into view and rings — plus a unit guard that fails CI if any navigation link points
at a route without a page, and a Playwright spec covering both navigation surfaces, the search and
the deep link. No schema, migration, authentication, storage-path or backup-format change. Image
`ghcr.io/dougalbob/simple-finance-multi-household:v1.41.1` (stable also moves `latest`),
appdata `/mnt/user/appdata/simple-finance-multi-household`, host port **3009**. See
[release notes](docs/RELEASE_NOTES_v1.41.1.md) and [handoff](docs/HANDOFF.md).

**v1.41.0 — Friendly document names and the app-wide document search:** Every attachment can now
carry an optional **friendly label**, set at upload or edited inline from the chip, that is shown in
place of the file name while the stored file name, download name and storage key stay untouched; a
blank label means "show the file name", and renaming is cosmetic and not audited. A new
**Documents** page lists and searches every stored attachment in the household by label, file name
and owning record, returning the document's context and a link that lands on the page where it
appears. The search reuses the Purchases matching rules, is server-side and household-scoped,
matches `stored` attachments only and is capped at 100 results. Migration
`0021_attachment_labels.sql` adds the nullable label column; no authentication,
household-separation, storage-path or backup-format change. Image
`ghcr.io/dougalbob/simple-finance-multi-household:v1.41.0` (stable also moves `latest`),
appdata `/mnt/user/appdata/simple-finance-multi-household`, host port **3009**. See
[release notes](docs/RELEASE_NOTES_v1.41.0.md) and [handoff](docs/HANDOFF.md).

**v1.40.0 — A compact, task-oriented Admin workspace (issue #107):** `/admin` now fits its main
jobs into a shorter two-column layout on laptops and large tablets. Household rows start collapsed
to their name and an expand arrow; expansion reveals status, metadata and assigned emails, with a
separate **Manage household** disclosure for assignment, rename and status controls. The roster and
recent registry activity scroll inside their cards, activity retrieves up to 25 entries, and
Cloudflare/Server settings stay behind advanced disclosures. Backup/restore and support access move
into the compact task rail. No schema, migration, authentication, storage-path or backup-format
change. Image `ghcr.io/dougalbob/simple-finance-multi-household:v1.40.0` (stable also moves
`latest`), appdata `/mnt/user/appdata/simple-finance-multi-household`, host port **3009**. See
[release notes](docs/RELEASE_NOTES_v1.40.0.md) and [handoff](docs/HANDOFF.md).

**v1.39.0 — Who is connected, and a connection log (issue #105):** The **Admin** page gains a live **Who is connected** card and a **Connection history** log, so an update or restart is never done under someone's feet. The app has no server-side session, so presence is inferred from activity and the card says **active now**, **idle** or **last seen** — never "online": active for 2 minutes, idle to 15, ended after 15 minutes of silence, and a visit is closed lazily with no background job. It is written from authenticated page loads and API calls plus a browser heartbeat that only beats while the tab is visible **and** you have actually touched the page, so a tab left open overnight sinks to idle. Registry migration `0003` adds `presence_sessions` — identity, own household, an opaque per-tab key and timestamps only: no page paths, finance data, IP addresses or user agents, and support views record the visitor's own household. Closed visits are pruned after 30 days with a 2,000-row ceiling. Presence can never deny access. `next` moves to ^16.4.2, clearing the critical advisories that failed the CI audit step. No authentication, assignment, household-status, finance-path or household-backup-format change. See [release notes](docs/RELEASE_NOTES_v1.39.0.md) and [SPEC §18.6](docs/SPEC.md). Image `ghcr.io/dougalbob/simple-finance-multi-household:v1.39.0` (stable also moves `latest`); appdata `/mnt/user/appdata/simple-finance-multi-household`, host port **3009**, never the original installation or 3007.

**v1.38.1 — Cloudflare grant/removal accepts read-only policy metadata (issue #101 patch):** Fixes the live-blocking refusal that made every grant fail in v1.38.0. Cloudflare's account-level reusable-policy response includes a legacy read-only `uid` beside `id`, which the strict schema rejected. `uid` (and an optional `precedence`) is now accepted, validated and stripped from the PUT body: the written payload, full preservation, prewrite reread, post-write verification, exclusive-edit acknowledgement and fail-closed refusal of genuinely unknown fields are unchanged. No authentication, registry, household-status, schema, migration or backup-format change. See [release notes](docs/RELEASE_NOTES_v1.38.1.md) and [setup and limitations](docs/CLOUDFLARE_INSPECTION.md). Image `ghcr.io/dougalbob/simple-finance-multi-household:v1.38.1` (stable also moves `latest`); appdata `/mnt/user/appdata/simple-finance-multi-household`, host port **3009**, never the original installation or 3007.

**v1.38.0 — Explicit Cloudflare access operations (issue #101 stages 2/3):** Admin can deliberately grant a direct email entry for a registry assignment or separately confirm removal, including policy-only cleanup. Bootstrap administrator only; own-email removal protected. Strict single-application reusable Allow policy validation, preservation of supported settings, audited outcomes and refreshed inspection. No automatic synchronisation or authentication/schema/backup-format changes. External edits must not overlap: Cloudflare has no documented atomic conditional update. Writes need account-scoped Access: Apps and Policies Edit/Write in trusted server configuration. See [setup and limitations](docs/CLOUDFLARE_INSPECTION.md) and [release notes](docs/RELEASE_NOTES_v1.38.0.md). Image `ghcr.io/dougalbob/simple-finance-multi-household:v1.38.0` (stable also moves `latest`); appdata `/mnt/user/appdata/simple-finance-multi-household`, host port **3009**, never the original installation or 3007.

**v1.37.0 — Cloudflare inspection (issue #101, stage one):** Admin now compares registry emails with the dedicated Cloudflare Allow policy using a server-side, read-only API token. Only `REGISTRY_ADMIN_EMAIL` can inspect it. Application audience and policy association are verified; errors mean unknown, and complex conditions are explicitly flagged. No Cloudflare writes, schema, migration or backup-format changes. Configure the four connection variables and restart; see [setup](docs/CLOUDFLARE_INSPECTION.md). Image `ghcr.io/dougalbob/simple-finance-multi-household:v1.37.0` (stable also moves `latest`).


**v1.36.0 stable feature:** GitHub issue #98 and the Purchases filter rework (decisions 254–255). All Transactions' three quick picks became one **Range** drop-down — Last 30 days (default), This month, Last Month, This Year, All — and its new search reads the **Supplier / transfer / loan** column and **Notes** together as you type, applied before the 500-row cap. Purchases now carries the same Range drop-down with its editable From/To dates, while **Pot** and **Paid by** are removed and its **Supplier** and **Category** selects are replaced by one **Search supplier, category or notes** box that reads the supplier (with any bank payee), every allocation line's `Parent / Child` category and the note. A filter a link brought in with no control of its own (pot, category, supplier, payer) shows above the results as an **Also filtering** chip that clears only that filter. No schema, migration or backup-format change. Image `ghcr.io/dougalbob/simple-finance-multi-household:latest` (or `:v1.36.0`), Unraid host port **3009**, appdata `/mnt/user/appdata/simple-finance-multi-household`. See [`docs/RELEASE_NOTES_v1.36.0.md`](docs/RELEASE_NOTES_v1.36.0.md).

Previous release — **v1.35.0:** GitHub issue #96 (decisions 252–253). Recording a linked refund is now explicit: every amount box starts blank with an **Originally £X** placeholder, the household enters the **refunded** amount under **Enter the amount _to be refunded_**, and a line left blank is omitted. Purchases and All Transactions signpost live refunds in both directions — originals show the amount refunded/still refundable and linked refund records, while refunds name and link their original purchase. In refund creation and correction, each parent/child category and spent-for target is only a read-only line heading; there are no Spent for/Category/Which controls or add/remove-line controls. A refund correction edits a positive **Amount refunded**, and the domain preserves its line count, order, categories and targets. No schema, migration or backup-format change. Image `ghcr.io/dougalbob/simple-finance-multi-household:latest` (or `:v1.35.0`), Unraid host port **3009**, appdata `/mnt/user/appdata/simple-finance-multi-household`. See [`docs/RELEASE_NOTES_v1.35.0.md`](docs/RELEASE_NOTES_v1.35.0.md).

Previous release — **v1.34.0:** GitHub issue #94 (decisions 250–251). On **Charts**, tapping a bar on **B · Groceries**, a segment on **C · Personal spending** or a bar on **F · Three months by category** now opens that figure's line items **in line beneath its own chart** — the behaviour Chart E already had — instead of leaving for the Purchases page. Each panel lists the same allocation lines its figure summed (its total is the bar tapped, to the penny), with **Open these purchases** carrying on to the filtered purchases list and **Close line items** (or re-tapping the bar) putting the chart back; opening, closing, Chart C's person chips and Chart F's Exclude Housing all redraw in place without a reload or scroll jump, and a panel never outlives a series or category the chart no longer shows. No schema, migration or backup-format change. Image `ghcr.io/dougalbob/simple-finance-multi-household:latest` (or `:v1.34.0`), Unraid host port **3009**, appdata `/mnt/user/appdata/simple-finance-multi-household`. See [`docs/RELEASE_NOTES_v1.34.0.md`](docs/RELEASE_NOTES_v1.34.0.md).

Previous release — **v1.33.0:** GitHub issue #91. The Admin page gains a **Server settings** panel that edits the key `/data/.env` fields (`AUTH_ISSUER`, `AUTH_AUDIENCE`, `AUTH_CERTS_URL`, `AUTH_ALLOWED_EMAILS`, `CLOUDFLARE_ACCESS_URL`) without SSH — quoted shell literals, atomic writes, a `.bak` copy, 0600 permissions and a registry audit row, with a restart banner when the running app still holds the old values. A new **Admin** menu entry is shown only to the `REGISTRY_ADMIN_EMAIL` identity (the only identity allowed to edit Server settings), and an **Open Cloudflare ↗** button links straight to the Access rule. The allowlist derives from the registry roster: assigned identities sign in automatically and `AUTH_ALLOWED_EMAILS` is an optional fallback. No schema, migration or backup-format change. Image `ghcr.io/dougalbob/simple-finance-multi-household:latest` (or `:v1.33.0`), Unraid host port **3009**, appdata `/mnt/user/appdata/simple-finance-multi-household`. See [`docs/RELEASE_NOTES_v1.33.0.md`](docs/RELEASE_NOTES_v1.33.0.md).

Previous release — **v1.32.1:** GitHub issue #87 (decision 248). Tapping a month bar on Chart D while **Sync to Spending mix** is engaged now updates Chart E in place, keeping the reader's exact scroll position — the brief flash of the top of the charts page is gone. The table twin's month names behave the same way. No schema, migration or backup-format change. Image `ghcr.io/dougalbob/simple-finance-multi-household:latest` (or `:v1.32.1`), Unraid host port **3009**, appdata `/mnt/user/appdata/simple-finance-multi-household`. See [`docs/RELEASE_NOTES_v1.32.1.md`](docs/RELEASE_NOTES_v1.32.1.md).

Previous release — **v1.32.0:** GitHub issue #89 (decisions 246–247). Chart G, Spending pace: two fully recorded calendar months' cumulative spending compared day by day, scoped by all spending or the household's saved category presets. No schema, migration or backup-format change. See [`docs/RELEASE_NOTES_v1.32.0.md`](docs/RELEASE_NOTES_v1.32.0.md).

Previous release — **v1.31.0:** GitHub issues #85 and #86 (decisions 243–245). Adds an editable, audited household payday setting that independently defines planning cycles, plus clearer Getting Started guidance for sign-ins, money records and everyday use. No schema, migration or backup-format change. Image `ghcr.io/dougalbob/simple-finance-multi-household:latest` (or `:v1.31.0`), Unraid host port **3009**, appdata `/mnt/user/appdata/simple-finance-multi-household`. See [`docs/RELEASE_NOTES_v1.31.0.md`](docs/RELEASE_NOTES_v1.31.0.md).

Previous release — **v1.30.0**: issue #83, purchase receipts can be attached, viewed and removed in the in-place correction panel on All Transactions. No schema, migration or backup-format change. See [`docs/RELEASE_NOTES_v1.30.0.md`](docs/RELEASE_NOTES_v1.30.0.md).

Earlier release — **v1.29.0**: issue #81, the one-way Spending trends → Spending mix sync. `v1.28.0` added searchable pickers, Horizon day totals and per-pot defaults; `v1.27.0` added long-term forecast assumptions and life expectancy. Earlier release details are in [`docs/RELEASE_PROCESS.md`](docs/RELEASE_PROCESS.md).


A private finance app for multiple independent households, self-hosted by the product owner on Unraid and protected by Cloudflare Access. Each household has its own database and saved documents; households share the application, not financial data.

> **Status (2026-10-21):** this is the independent multi-household edition and **`v1.36.0` is the current
> stable production release** (`v1.0.0` was the first), with its notes in [`docs/RELEASE_NOTES_v1.36.0.md`](docs/RELEASE_NOTES_v1.36.0.md).
> It answers GitHub issue #98 and the Purchases follow-up: **All Transactions** trades its quick picks for one **Range** drop-down (Last 30 days, This month, Last Month, This Year, All) and its search reads the Supplier and Notes columns together, while **Purchases** shares that Range drop-down, keeps its editable From/To dates, drops **Pot** and **Paid by**, and replaces its **Supplier** and **Category** selects with one search over supplier, category and notes. `v1.35.0` before it answered issue #96: linked refunds are entered explicitly line by line, blank lines mean no refund, both linked records signpost each other, and refund category/spent-for identities are locked. `v1.34.0` before it answered issue #94: on Charts, a Groceries week, a Personal spending segment and a Three months bar each open their line items in line beneath the chart, exactly as Chart E already did. `v1.33.0` before it answered issue #91: key `/data/.env` fields are editable from `/admin`'s Server settings panel, the Admin menu entry is shown only to the `REGISTRY_ADMIN_EMAIL` identity, an Open Cloudflare button links to the Access rule, and the allowlist derives from the registry roster. `v1.32.1` before it answered issue #87: a synced month redraws Chart E in place without a scroll flash; `v1.32.0` before it answered issue #89 with Chart G, Spending pace; `v1.31.0` answered issues #85 and #86 with the audited household payday and revised Getting Started. `v1.30.0` before it answered issue #83: purchase receipts can be attached, viewed and removed in the inline correction panel on All Transactions. `v1.29.0` before it answered issue #81 with the one-way Spending trends → Spending mix sync; `v1.28.0` added searchable pickers, Horizon day totals and per-pot defaults; `v1.27.0` added long-term forecast assumptions and life expectancy.
> It answers issue #57: on All Transactions, a purchase — one recorded by hand, a direct debit or a standing order — opens **in place**, directly below its row, to be corrected or voided, while a refund keeps its link to Purchases; it also repairs the Purchases page's **Record refund** button, which had never sent the original's id, the pot or the amount. `v1.19.0` before it answered issue #55: a transfer between your own pots opens **in place**, directly below its row, to be corrected or voided, and the "Transfers between pots" card on Accounts, Pots & Checkpoints is retired. It also promotes the accepted `v1.18.0-rc.1` candidate: a Recurring calendar day shows its item count and gross amount, with per-schedule details and exact Edit links (issue #53). `v1.17.0` before it made Chart D Spending trends with household category presets (issue #40); `v1.16.2` verified anchored landings against the sticky menu (issue #43); `v1.16.1` stacked the Quick Entry split card at every width. `v1.16.0` answers issue #46: a split line at the till can total several same-category items in place via a "+" beside the amount, so a wider bill does not need a calculator. `v1.15.1` before it answers issue #45: By Person month paging keeps the current scroll position on soft navigation, while retaining the heading fragment for direct visits. `v1.15.0` before it answers issue #44: All Transactions can open on the household's chosen default pot, while a pot selected in the URL or Target filter still wins; clear the setting to keep the old fallback. `v1.14.0` before that answers issue #33: a saved transfer between your own pots is now **corrected in place** on Accounts, Pots & Checkpoints — its pots, its amount, its date and its note — instead of only being voidable, guarded by the record's version, refused for a read-only support view and audited before-and-after like every other correction. Earlier releases include the #34 anchored deep-link fix (`v1.13.1`), supplier schedule links and recurring search (`v1.13.0`), and the Recurring cancelled-schedule filter and All Transactions purchase-link offset (`v1.12.0`). The first-run setup path for a brand-new household is in ([`docs/ONBOARDING_PLAN.md`](docs/ONBOARDING_PLAN.md), Slice 1).
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
- **Versioning:** `v1.36.0` is the current stable release and moves `latest` (issue #98 and the Purchases filter follow-up: the shared date Range drop-downs, the supplier/notes search on All Transactions and the supplier/category/notes search on Purchases). `v1.35.0` shipped explicit partial refunds, bidirectional refund signposting and locked refund line identities (issue #96); `v1.34.0` opened Charts B, C and F line items in line (issue #94); `v1.33.0` added server settings on `/admin`, the env-gated Admin menu entry and the Cloudflare shortcut (issue #91); `v1.32.1` fixed the synced-month scroll flash (issue #87); `v1.32.0` added Chart G Spending pace (issue #89); `v1.31.0` added independently configured payday cycles and revised Getting Started (issues #85/#86); `v1.30.0` added purchase receipts in the All Transactions correction panel; `v1.29.0` added the one-way Spending trends → Spending mix sync; `v1.28.0` added searchable pickers, Horizon day totals and per-pot defaults; `v1.27.0` added long-term forecast assumptions and life expectancy. Earlier releases and candidates are documented in [`docs/RELEASE_PROCESS.md`](docs/RELEASE_PROCESS.md). Candidates (`v1.0.0-rc.N`, SemVer prereleases) publish only their exact version and `sha-<short>` tags—never `latest`, and they are never retagged.

## Product and tenancy model

Each household may have **up to two assigned sign-in identities**. This is separate from the household's `people` records, which are used for purchase attribution and are not capped at two. An administrator pre-creates the household and assigns Cloudflare email identities before first sign-in. Cloudflare Access verifies the identity; the app's own roster decides whether that verified identity is assigned and which household it can enter. There is no self-sign-up.

The app uses a separate SQLite database and `documents/` directory per household under the one new appdata root. A household backup includes only that household's database and documents. The app administrator has no standing in-app access to another household's finance data; access for support requires an explicit, visible, auditable and time-limited permission from that household.

See [`docs/MULTI_HOUSEHOLD_PLAN.md`](docs/MULTI_HOUSEHOLD_PLAN.md) for the complete active contract and delivery sequence. [`docs/SPEC.md`](docs/SPEC.md) is the product specification; [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) tracks design and delivery; [`docs/HANDOFF.md`](docs/HANDOFF.md) is the session continuation point. The old `AGENT_APP_BLUEPRINT.md` and historical v0.x notes describe the original single-household project unless explicitly superseded.

## What stays within each household

Fast mobile entry, checkpoints, payday projections, recurring schedules, insights, supplier and contract records, attachments, and encrypted backups remain household-specific. The app still does not connect to banks, read statements, move real money, or provide financial advice.

## Unraid installation

**`v1.16.0` is released and the template is installable.** It uses its own data root, port and Cloudflare route, so it never touches the original app. The single data root is:

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
- **All activity in one pot:** `/transactions` — everything that touched a chosen account or cash pot
  between two dates: purchases, direct debits and standing orders, transfers, borrowing and repayments,
  swaps and other money, and **income** (`BAC`), in one amount column (green in, red out relative to that
  pot), with the original note, checkpoint dividers and a link from every row to the page that can still
  edit or void it. A transfer between your own pots is the exception: select its pot name and its
  correction and void forms open right there, beneath the row (issue #55) — the pots page no longer keeps
  a separate transfer list. Settings can pin its starting pot; an explicit target in the URL still wins.
- **Insights:** `/insights` — a three-month comparison (each month with its change against the month
  before it), per-person attribution, vehicle running costs, and the honesty loop that compares
  configured figures with recent complete periods. Every figure opens its line items inline — the
  purchases behind the number — with a link to the same rows in the purchase history.
- **Charts:** `/charts` — the same figures drawn: the month ahead (household total, with zero always on the
  axis and the overdraft limit marked), the weekly shop against the configured figure and the trailing
  8-week average, personal spending per person per month with the household's shared spending kept
  separate, the fixed commitments over the child categories ticked in Settings, where the money went
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

**`v1.26.0` introduced** the **Long-term forecast** at `/longterm` — the menu entry beside Horizon on the desktop bar and in the phone drawer's second group. It answers the household's own questions over decades: income in 2030, income at age 62 (2032), and "does the money last?", with every date shown as both an age and a year. It compares three return rates side by side, shows the same pension pot as drawdown versus annuity (arithmetic, never a recommendation), lists every calendar year in future money and today's money, estimates UK tax per person from the 2026/27 rate card, names a temporary gap separately from a run-out, and flags a £0 "everything else" line and other missing figures. Every pot value, rate, amount and date is editable; the draft is seeded from the household's records and saved as one plan per household (migration `0020_longterm_plans.sql`). `/guide#longterm` explains the idea. `v1.25.0` before it answered GitHub issue #68: on **Borrowing**, an arrangement that owes nothing says **"Nothing owing"** (not the legal-sounding "Settled") and its repayment action is greyed out; the ledger is **newest first**, prints only the **next** "expected — not yet recorded" row instead of three, and **keeps your scroll position** when you change the order or the person filter. On **Insights**, a category's line items open **immediately below the row you clicked**, and closing them returns you **exactly where you started** — the top of the page for a month total, the row itself for a category, the person's card for a By-person figure, the vehicle's card just below the menu for a vehicle figure — while a **£0.00** figure is greyed out and opens nothing. `v1.24.0` before it added `paidVia` (statement payee) to purchases so shared expenses and payment routes (e.g. transfers to friends, PayPal) match banking apps without polluting commercial suppliers, alongside clearer signposting for "Other money in & out" on Accounts, Pots & Checkpoints and Quick Entry. `v1.23.0` before it shipped issue #65: a swap reads as one nested object in **Recent swaps & other money**, each leg with its own inline Edit and Void, the swap card's "Recent swaps" list retired and the redundant **Owed & owing** panel removed. `v1.22.0` before it shipped issues #61 and #63: Chart E's in-card scopes disclosure and collapsed caption, plus Borrowing inline per-person recording, collapsed new-person setup and repayment sanity checks. `v1.21.0` before it shipped issue #60: everything informal borrowing on its own **Borrowing** page — the combined ledger, the setup flow and the repay panel. `v1.20.0` before it shipped issue #57: a purchase (`PUR`, `DD` or `SO`) opens in place on All Transactions for correction or void, a refund keeps its link to Purchases, and the Purchases page's **Record refund** button works again. `v1.19.0` before it shipped issue #55 (internal transfers open in place on All Transactions and the pots page's transfer card is retired), together with the accepted `v1.18.0-rc.1` Recurring calendar day summaries (issue #53). `v1.17.0` added Spending trends presets (issue #40); `v1.16.2`, `v1.16.1` and `v1.16.0` verified anchored landings (issue #43), stacked the split card and totalled same-category split items (issue #46). `v1.15.1` kept By Person month paging in place (issue #45); `v1.15.0` set the default All Transactions pot (issue #44); `v1.14.0` corrected saved transfers between pots in place (issue #33); earlier releases are recorded in [`docs/RELEASE_PROCESS.md`](docs/RELEASE_PROCESS.md).

A candidate is a SemVer prerelease with an `-rc.N` suffix, incrementing per build (`v1.0.0-rc.1`, `-rc.2`, …). A candidate gets its exact version tag and `sha-<short>` tag, **not `latest`**, and its GitHub release is marked pre-release. Accepted candidates become a distinct stable tag; never rename or retag one. The candidates so far: `v1.0.0-rc.1` and `v1.0.0-rc.2` exist as Git tags but their Publish runs failed before pushing, so **no image exists for either**; `v1.0.0-rc.3` published, was accepted on a real installation, and is the base `v1.0.0` was promoted from.

The only permitted registry is `ghcr.io/dougalbob/simple-finance-multi-household`. The inherited `v0.x` tags and release notes are history from the original single-household project; they must not be pushed or used as upgrade baselines for the new package. The version lives in `package.json`, `package-lock.json`, `src/lib/version.ts`, the Unraid template and the release notes, and these must be bumped together in each release pull request.

**v1.16.1 stable patch:** Quick Entry split category, amount and Add item stack at every width, fixing the cramped laptop column without changing totalling. No schema or migration change. See `docs/RELEASE_NOTES_v1.16.1.md`.

**v1.16.2 stable patch:** A Supplier card's "Linked to schedule" link (and every anchored deep link) is verified against the sticky menu after landing and corrected once if a browser left it behind the bar (issue #43, decision 222). No schema or migration change. See `docs/RELEASE_NOTES_v1.16.2.md`.

**v1.17.0 stable feature:** Chart D is now Spending trends with saved household category presets, parent/child selection and scroll-preserving switching (issue #40, decision 223). Existing tracked categories are preserved; no schema or backup-format change. See `docs/RELEASE_NOTES_v1.17.0.md`.

**v1.18.0-rc.1 acceptance candidate:** Recurring calendar day summaries show item counts and gross amounts, expand to per-schedule details, and link to the exact schedule's open Edit section (issue #53). This pre-release never moved `latest`; the household accepted it and it ships in stable `v1.19.0`. See `docs/RELEASE_NOTES_v1.18.0-rc.1.md`.

**v1.26.0 stable feature:** The **Long-term forecast** (`/longterm`, in the menu beside Horizon on the desktop bar and in the phone drawer's second group) answers the household's own questions across decades — income in 2030, income at age 62 (2032), and "does the money last?" — over one saved, editable plan of assumptions. It compares three return rates side by side, shows the same pension pot as drawdown versus annuity (arithmetic, never a recommendation), lists every calendar year in future money and today's money, estimates UK tax per person from the 2026/27 rate card, distinguishes a temporary gap from a run-out, and flags a £0 "everything else" line and other missing figures. Every pot value, rate, amount and date is editable; the draft is seeded from the household's records. Migration `0020_longterm_plans.sql` adds one `longterm_plans` row per household (validated JSON behind a version counter, audited on create/save/reset); no existing record changes and the backup format is unchanged. `/guide#longterm` explains the idea. See `docs/RELEASE_NOTES_v1.26.0.md`, SPEC §28, decisions 233–235.

**v1.25.0 stable feature:** On **Borrowing**, an arrangement that owes nothing reads **"Nothing owing"** on the person's card and in the ledger, and its repayment action is greyed out while nothing is owed; the ledger is **newest first** by default (`?order=oldest` still asks for the old order), prints only the **next** "expected — not yet recorded" row instead of three, and keeps the reader's scroll position when the order or the person filter changes. On **Insights**, a category's line items open in a full-width row **immediately below the category line that was clicked**, closing returns the reader to the top of the page (a month total), the row itself (a category), the person's card (By Person) or the vehicle's card just below the menu (vehicle running costs), and a **£0.00** figure is greyed out and opens nothing (issue #68, decision 232). No schema, migration or backup-format change. See `docs/RELEASE_NOTES_v1.25.0.md`.

**v1.24.0 stable feature:** Purchases now support an optional `paidVia` statement payee field (up to 120 chars) alongside the merchant/supplier, enabling shared meal transfers and third-party payment routes (e.g. PayPal) to match banking statements without polluting the commercial supplier directory. "Other money in & out" on Accounts, Pots & Checkpoints and Quick Entry gains clearer signposting to distinguish it from loans/borrowing and categorized spending. Database migration `0019_purchase_paid_via.sql` adds `paid_via` to `purchases`. See `docs/RELEASE_NOTES_v1.24.0.md`.

**v1.23.0 stable feature:** On Accounts, Pots & Checkpoints, **Recent swaps & other money** draws each swap as **one nested object** — the in-leg first, the out-leg indented beneath it behind a small pointer arrow on the alternate row shade, then the pair's honest net (`net £0.00`, `legs differ · net +£2.50`, `one leg voided · net …` or `voided`) beside **Void both legs** — with each leg re-worded to name the direction, the person and the pot (`Swap in £40.00 from Sam · into Alex's cash`) and carrying its own **Edit** and **Void** that open inline beneath that leg; the "Recent swaps" list inside the swap card is retired so a swap is corrected in one place, and the redundant **Owed & owing** panel is removed (issue #65, decision 231). No schema, migration or backup-format change. See `docs/RELEASE_NOTES_v1.23.0.md`.

**v1.22.0 stable feature:** Chart E (**Where the money went**) folds its selector inside the chart card behind a top-right **Change chart scopes** disclosure, removes boilerplate selector labels, keeps the panel open across Show submissions without auto-submitting on quick-window clicks, and tucks the long caption behind an `i` button (issue #61, decision 229). On **Borrowing**, each person's card opens an inline recording form with 2-second auto-collapse on save, the standalone bottom record card is retired, **Setup new Borrowing or lending** sits collapsed below the ledger for new people only, and repayment/outflow sanity checks block debt overpayments and insufficient cash pots while warning when a bank account goes below zero (issue #63, decision 230). No schema, migration or backup-format change. See `docs/RELEASE_NOTES_v1.22.0.md`.

**v1.21.0 stable feature:** Everything informal borrowing moves to its own **Borrowing** page in the menu — the per-person summary with each IOU's honest, never-netted position, one setup flow (select-or-create the person; a recurring plan with Fill the end date, a one-off, or just tracking), one combined ledger with per-arrangement running balances and greyed expected rows, a From/To filter, and a row detail panel with correction and void (issue #60, decision 228). Swaps and other boundary money stay on Accounts, Pots & Checkpoints beside a signpost; old `/pots#debt-` and `/pots?external=` loan links forward to the new anchors. No schema, migration or backup-format change. See `docs/RELEASE_NOTES_v1.21.0.md`.

**v1.20.0 stable feature:** On All Transactions, a purchase — one recorded by hand (`PUR`) or converted from a schedule (`DD` / `SO`) — opens in place, directly below its row, for correction or void, using the Purchases page's own forms; a refund (`REF`) keeps its link to Purchases (issue #57, decision 226). The Purchases page's **Record refund** button is repaired: it never sent the original's id, the pot or the amount, so every refund attempt failed (decision 227). No schema, migration or backup-format change. See `docs/RELEASE_NOTES_v1.20.0.md`.

**v1.19.0 stable feature:** On All Transactions, a transfer between your own pots opens in place, directly below its row, for correction or void; the pots page's "Transfers between pots" card is retired and old `/pots?transfer=` links open the transfer there (issue #55, decision 225). Includes the accepted `v1.18.0-rc.1` Recurring calendar day summaries (issue #53). No schema, migration or backup-format change. See `docs/RELEASE_NOTES_v1.19.0.md`.
