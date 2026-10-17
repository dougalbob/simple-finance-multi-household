# Release and GitHub delivery process — multi-household edition

**Standing default:** when the product owner asks for a release, the agent owns the gated pull request, merge, annotated tag, GHCR publication checks and GitHub release. Do not ask the household to create a tag, publish an image or merge a PR by hand. Follow the session's one-PR-merge limit: keep the agreed deliverable in one reviewable PR; do not leave substantive release work for a follow-up docs-only PR.

This file supersedes the original single-household release process for this repository. Historical v0.x tags and notes came from `dougalbob/simple-finance`; they are not releases or upgrade images of this product line.

## 0. Non-negotiable destination and production separation

- This repository must be exactly `dougalbob/simple-finance-multi-household`.
- The only permitted image destination is **`ghcr.io/dougalbob/simple-finance-multi-household`**. The Publish workflow has a hard repository/image guard. Stop if the workflow, GitHub repository identity, Unraid template, release notes or package target differ.
- Never push any tag, including `latest`, to `ghcr.io/dougalbob/simple-finance`.
- Original production remains at host port `3007` and `/mnt/user/appdata/simple-finance`. The new app uses bridge networking, host port `3009` → container port `3000`, and `/mnt/user/appdata/simple-finance-multi-household` → `/data`. Never use the original data directory or replace its Cloudflare route.
- Merging a PR does not publish. Only a valid tag can run the Publish workflow. No release step may mount, restore, or migrate the live original data.

## 1. Version line: candidate first, stable separately

Candidates use SemVer prereleases **`v1.0.0-rc.N`** (package/app version `1.0.0-rc.N`). Use `-rc.N`, not the ambiguous `v1.0.0rc` spelling. If acceptance requires another build, increment the suffix.

An accepted production release is a **new stable tag `v1.0.0`**, with package/app version `1.0.0`. Do not rename, retag or rewrite the candidate tag; candidate and stable releases have different tags (and may point to different commits).

**Where this line actually stands:** `v1.0.0-rc.1` and `v1.0.0-rc.2` exist as Git tags but their Publish runs failed before pushing, so **no image exists for either** — they must never be used as upgrade bases or described as released. `v1.0.0-rc.3` published and was accepted on a live installation. `v1.0.0` is the stable release, promoted from `rc.3` with no application-code change. `v1.0.1` shipped registry backup and restore in `/admin` (added by PR #9, repaired by PR #10). `v1.0.2` is a stable patch: it fixes the `/admin` restore's broken redirect (relative `/admin`, status 303, never derived from `request.url`) and hardens the restore (upload validation, atomic replace, timestamped pre-restore copy, outcome logging) with dedicated route and browser tests, published as `v1.0.2`, `latest` and `sha-<short>` to one digest. `v1.1.0` adds the derived first-run setup path for a brand-new household (`/start`, home card, repaired empty states, the "one person is a complete household" fix, `docs/ONBOARDING_PLAN.md` Slice 1) and a browser suite that runs against a genuinely empty household, published as `v1.1.0`, `latest` and `sha-<short>` to one digest. `v1.2.0` added the guide (`/guide`, eight anchored sections) and the "What this page needs first" blocks on the four payoff pages (`docs/ONBOARDING_PLAN.md` Slice 2). `v1.3.0` added the worked example (`/example`, a fictional two-month household rendered through the real engines, plus the preview seed script). `v1.4.0` added the three-month Insights comparison, inline line-item drill-down on every Insights figure, and the three-months-by-category chart with its Exclude Housing toggle (SPEC §16.7 F). `v1.5.0` shipped every link as the familiar blue and permanently underlined through one token and two utilities (decision 203, SPEC §15.4), the attachment form has one control — the styled label opens the picker and choosing a file uploads it (decision 204, SPEC §23.1) — and the charts name their hatch patterns per figure with a two-rect muted bar, fixing the in-progress bars that were invisible on screens 1024px and wider from v0.14.0 (decision 202, SPEC §16.7); published as `v1.5.0`, `latest` and `sha-<short>` to one digest. `v1.7.0` shipped the Recurring page changes — Cancel moved inside the Edit disclosure, double-confirmation before cancelling, a Restore button for cancelled schedules with an explicit back-fill warning, the trimmed Active-from label, and alternating Schedules rows (decision 206); published as `v1.7.0`, `latest` and `sha-<short>` to one digest. The Contracts & Renewals redesign shipped as acceptance candidate `v1.8.0-rc.1` and was accepted in the field. `v1.9.0` promoted the accepted `v1.8.0-rc.1` Contracts & Renewals agreement register to stable, adds the granular expandable parent/child category tree selector on Chart E (`E · Spending mix — Where the money goes`, decision 207), and updates `npm test` to run in memory-bounded batches (`scripts/run-tests.mjs`); published as `v1.9.0`, `latest` and `sha-<short>` to one digest. `v1.10.0` shipped alternating All Transactions rows (issue #23) and Chart E renamed "Where the money went" with no dates after today, the Since last payday / Last full payday cycle / Month to date quick windows and pickers kept in sync (issue #24, decision 208); no schema change; published as `v1.10.0`, `latest` and `sha-<short>` to one digest. `v1.16.0` shipped the stable Quick Entry split-line totaling feature, GitHub issue #46: Quick Entry split lines can total several same-category items in place via a "+" beside the line amount (decision 221); no schema change; published as `v1.16.0`, `latest` and `sha-<short>` to one verified digest. `v1.15.1` before it answered issue #45: By Person month paging preserves the current scroll position during soft navigation while retaining the heading fragment for direct visits (decision 220); no schema change; published as `v1.15.1`, `latest` and `sha-<short>` to one verified digest. `v1.15.0` before it answered issue #44: All Transactions opens on the household's saved default pot when no valid `potId` is present, while explicit targets win; clearing restores the old fallback; no schema change; published as `v1.15.0`, `latest` and `sha-<short>` to one verified digest. `v1.14.0` before it corrected saved pot-to-pot transfers in place (issue #33), with a version guard, read-only support refusal and before-and-after audit; no schema change. `v1.13.1` before it was a patch for the re-opened issue #34: anchored deep links (including the Supplier card's schedule links) land below the sticky header at every width, because the landing offset is measured from the header rather than a constant (decision 216); no schema change; published as `v1.13.1`, `latest` and `sha-<short>` to one digest. `v1.13.0` before it shipped the Supplier card schedule links and empty state, the in-place Recurring search filter, and remembered cancelled schedule visibility across navigations (issues #34 and #35, decisions 214–215); no schema change; published as `v1.13.0`, `latest` and `sha-<short>` to one digest. `v1.12.0` is the previous stable release: the Recurring Schedules list can hide cancelled schedules, with a count of those hidden (issue #28, decision 212), and All Transactions purchase links land below the sticky header (issue #30, decision 213); no schema change; published as `v1.12.0`, `latest` and `sha-<short>` to one digest. `v1.11.0` released 2026-10-14: Chart C counting every line marked for a person whatever its category (issue #25, decision 209), By Person month navigation keeping the panel in view (issue #26, decision 210), and the honesty loop's −15%…+10% tolerance band (issue #27, decision 211); no schema change; published as `v1.11.0`, `latest` and `sha-<short>` to one digest.

**Current line status (2026-10-17):** Stable `v1.26.0` is prepared to move `latest` from
`v1.25.0`. It adds the **Long-term forecast**: `/longterm`, in the menu beside Horizon on the desktop
bar and in the phone drawer's second group, projects decades of pension pots, earnings with a stop
date, the State Pension, windfalls, inflation and estimated UK tax; it leads with the household's own
questions (income in 2030, income at age 62 — 2032), compares three return rates side by side, shows
the same pot as drawdown versus annuity (arithmetic, never a recommendation), lists every calendar
year in future money and today's money, and keeps every figure editable in one saved plan. Migration
`0020_longterm_plans.sql` adds `longterm_plans` (one validated JSON payload per household behind a
version counter, audited on create/save/reset); no existing record or backup format changes — see
decisions 233–235 and `docs/RELEASE_NOTES_v1.26.0.md`. Stable `v1.25.0` before it shipped GitHub
issue #68 — on **Borrowing**, an arrangement that owes nothing reads
**"Nothing owing"** and its repayment action is greyed out while nothing is owed, the ledger is
**newest first** with only the **next** "expected — not yet recorded" row, and changing the order or
the person filter keeps the reader's scroll position; on **Insights**, a category's line items open
**immediately below the row that was clicked**, closing them returns the reader to the top of the
page (a month total), the row itself (a category), the person's card (By Person) or the vehicle's
card just below the menu (vehicle running costs), and a **£0.00** figure is greyed out and opens
nothing — decision 232, with no schema, migration or backup-format change; see
`docs/RELEASE_NOTES_v1.25.0.md`. Stable `v1.24.0` before it shipped `paidVia` (statement payee) on
purchases and clearer signposting on "Other money in & out"
with migration `0019_purchase_paid_via.sql`; see `docs/RELEASE_NOTES_v1.24.0.md`. Stable `v1.23.0`
shipped GitHub issue #65 (each swap drawn as one nested object in **Recent swaps & other money** with a
pointer arrow on the nested leg, the pair's honest net and void-both in its footer, and inline Edit and
Void on every leg; the swap card's own "Recent swaps" list retired so a swap is corrected in one place,
and the redundant **Owed & owing** panel removed — decision 231), with no schema, migration or
backup-format change; see `docs/RELEASE_NOTES_v1.23.0.md`. Stable `v1.22.0` shipped GitHub issue #61
(Chart E's in-card **Change chart scopes** disclosure, explicit Show submission and collapsed `i`
caption, decision 229) and GitHub issue #63 (inline per-person borrowing/repayment recording with
2-second auto-collapse, removal of the bottom record card, collapsed **Setup new Borrowing or lending**
below the ledger for new people only, and repayment/outflow sanity checks that block debt overpayments
and insufficient cash pots while warning when a bank account goes below zero, decision 230).
Stable `v1.21.0` published from `872fa1b` (PR #62, Publish run
`38888180733`, digest `sha256:cec5f2bb3d50148dc946f7070dc6d6403d1b1e106de010380fe661faa8925353`, image
tags `v1.21.0`, `latest` and `sha-872fa1b` to that one verified digest) and is the release `latest`
moves from. It shipped GitHub issue #60 — everything informal borrowing on its own **Borrowing** page (the
combined ledger with per-arrangement running balances and expected rows, the setup flow and the repay
panel; swaps and other boundary money stay on the pots page) — decision 228, with no schema, migration
or backup-format change. Stable `v1.20.0` published from `4a31b52` (PR #58, Publish run
`38826604532`, digest `sha256:008f976751d54e5d61f5c80d1321b4ebba3c557d15f76f16a6477d4318af693f`); it shipped issue #57 (a purchase opens in place on All Transactions for
correction or void, decision 226) and the Purchases page's Record refund repair (decision 227). Stable
`v1.19.0` published from `284f15e` (PR #56, Publish run `38791004005`) and shipped issue #55 (internal
transfers open in place; the pots page's transfer card is retired), promoting the accepted candidate
`v1.18.0-rc.1` (Recurring calendar day summaries, issue #53), which published from `7c8fecc` (PR #54,
Publish run `38761006486`) as a pre-release with only its exact version and `sha-<short>` tags, never
moving `latest`. See `docs/RELEASE_NOTES_v1.22.0.md`.

For each release PR, these version-bearing files must agree exactly:

- `package.json`
- `package-lock.json` (root `version` and `packages[""]`)
- `src/lib/version.ts` (`APP_VERSION`)
- `simple-finance-multi-household.xml` (template description)
- `docs/RELEASE_NOTES_<tag>.md`

The tag must be lower-case and match the checked-in package/module version. The Publish workflow accepts only v1+ `vMAJOR.MINOR.PATCH` or `vMAJOR.MINOR.PATCH-rc.N`; it rejects inherited v0.x tags and malformed versions.

### Image tags and release visibility

- **RC:** publish `<image>:v1.0.0-rc.N` and `<image>:sha-<short>` only. Do not create, move or verify `<image>:latest`. Create the GitHub release with `--prerelease`; it must not become Latest. RC Unraid acceptance pins the exact candidate tag.
- **Stable:** publish `<image>:v1.0.0`, `<image>:latest`, and `<image>:sha-<short>`, all to the same verified digest. Only a stable release may move `latest` or be marked Latest on GitHub. The Unraid template's stable default is the new image's `latest`.

Never retag an image after publication. If the candidate changes, cut the next `-rc.N`; after acceptance, cut the stable tag.

## 2. Pull request, checks and merge

1. Inspect the worktree first and preserve user changes. Work only on the assigned Arena branch.
2. Keep changes, tests, release notes (when applicable), handoff and docs in the same PR. Commit and push only to the assigned branch; open one PR to `main`.
3. Wait for all required checks to pass before merge: `gates`, `browser`, and `docker` (including container smoke and any applicable upgrade smoke). Do not infer CI success from local checks.
4. Merge with an explicit **merge commit**: `gh pr merge <number> --merge`. Never squash. Observe the one-merge-per-Arena-session limit.
5. Wait for CI on the resulting `main` merge commit. For a documentation/configuration foundation PR, stop here: do not create a release tag or image merely because the PR merged.

## 3. Database migrations and upgrade smoke

- Keep `drizzle/meta/_journal.json` migration `when` stamps strictly increasing and never in the future. Drizzle may silently skip an out-of-order migration on upgraded databases. Prefer `npm run db:generate`; never change shipped migration SQL.
- Test upgrades as well as fresh databases. The Publish workflow considers only previous v1+ tags from this product line. The inherited v0.x source tags must never be used as GHCR upgrade bases. With no previously published v1+ image, a release correctly skips upgrade smoke; later releases upgrade the two most recent published v1+ images and require every journal entry exactly once.
- **A tag is only an upgrade base if its image exists in GHCR.** Both workflows must test each candidate tag against the registry and skip the ones with no image. This is not theoretical: `v1.0.0-rc.2` failed its Publish run precisely because the upgrade smoke took `v1.0.0-rc.1` as its base, and `rc.1` had never pushed. `rc.3` fixed that in `publish.yml` only, so `.github/workflows/ci.yml` still selected the unpublished `v1.0.0-rc.2` and would have failed every later PR on `docker pull`; both workflows now share the rule.
- A failed/absent previous v1+ image is not a reason to pull from the original package. Stop and investigate the new package/tag state.
- Household migrations and rehearsals run only against isolated test data or a copied backup. Never run destructive tests or restore rehearsals against `/mnt/user/appdata/simple-finance`.

## 4. Tag and publish

1. Finish implementation, tests, all version files and release notes in the release PR. Confirm the new repository, new image, new appdata path, host port `3009`, and release type (RC vs stable) agree.
2. Merge the PR after required checks. Create an **annotated, lower-case tag** on that exact merge commit **in `main`**: `v1.0.0-rc.N` or the approved stable version. Never tag a session branch that has not been merged — `v1.0.0-rc.2` and `v1.0.0-rc.3` were tagged this way, published correctly from the tag, and left `main` describing a build that was not the released one.
3. Push only that tag to this repository. The Publish workflow verifies repository identity, exact package/version agreement, builds and smoke-tests before pushing, then publishes only the tags appropriate for RC or stable.
4. Wait for Publish to succeed. A tag existing in Git does not mean an image was successfully published.

Never push inherited `v0.x` tags as new-product releases. Never retag an already published version or rewrite earlier release notes.

## 5. Verify GHCR before declaring success

Confirm the workflow pushed to **only** `ghcr.io/dougalbob/simple-finance-multi-household` and independently inspect every tag that should exist:

- RC: `v1.0.0-rc.N` and `sha-<short>`; verify `latest` was not created or changed by this run.
- Stable: `vX.Y.Z`, `latest`, and `sha-<short>`.

All tags published by the run must resolve to the same digest. The workflow checks this and fails on a mismatch; independently verify the package and digest when network access permits. Never interpret the original package's digest or `latest` as evidence for this repository.

## 6. Release notes and GitHub release

Complete `docs/RELEASE_NOTES_<tag>.md` in the release PR, before merge. Its first line must be exactly:

```text
# Release notes — <tag> — <short subject>
```

For example:

```text
# Release notes — v1.0.0 — First stable multi-household release
```

Include what changed; schema/data caveats; who is affected and what to do; validation evidence; appdata, backup and Unraid instructions; whether it is an RC or stable release; and the version badge users should see. For RCs, state that `latest` is not moved and give the exact tag to install. The Publish workflow prepends date, merge commit, actual image tags and verified digest and creates a pre-release GitHub release for an RC or a Latest GitHub release for stable.

## 7. After the release

After successful publication, verify the GitHub release type (pre-release vs stable), title, package link and digest. Report only verified facts. Add merge SHA, PR/check run IDs, Publish run and digest to the next working session's `docs/HANDOFF.md`; do not create a separate post-merge documentation PR. For an RC, gather acceptance feedback and publish a higher RC number for changes; only after acceptance prepare the separate stable `v1.0.0` release.

**v1.16.1 stable patch:** Quick Entry split category, amount and Add item stack at every width, fixing the cramped laptop column without changing totalling. No schema or migration change. See `docs/RELEASE_NOTES_v1.16.1.md`.

**v1.16.2 stable patch:** A Supplier card's "Linked to schedule" link (and every anchored deep link) is verified against the sticky menu after landing and corrected once if a browser left it behind the bar (issue #43, decision 222). No schema or migration change. See `docs/RELEASE_NOTES_v1.16.2.md`.

**v1.17.0 stable feature:** Chart D is now Spending trends with saved household category presets, parent/child selection and scroll-preserving switching (issue #40, decision 223). Existing tracked categories are preserved; no schema or backup-format change. See `docs/RELEASE_NOTES_v1.17.0.md`.

**v1.18.0-rc.1 acceptance candidate:** Recurring calendar day summaries with per-schedule details and exact-ID Edit links (issue #53, decision 224). Published as a pre-release from `7c8fecc` (PR #54); it never moved `latest`. Accepted by the household and promoted in `v1.19.0`. See `docs/RELEASE_NOTES_v1.18.0-rc.1.md`.

**v1.19.0 stable feature:** Internal transfers open in place on All Transactions, directly below their row, for correction or void; the pots page's "Transfers between pots" card is retired and old `/pots?transfer=` links redirect there (issue #55, decision 225). Includes the accepted `v1.18.0-rc.1`. No schema, migration or backup-format change. See `docs/RELEASE_NOTES_v1.19.0.md`.

**v1.20.0 stable feature:** A purchase — one recorded by hand (`PUR`) or converted from a schedule (`DD` / `SO`) — opens in place on All Transactions, directly below its row, for correction or void, using the Purchases page's own forms; a refund (`REF`) keeps its link to Purchases (issue #57, decision 226). It also repairs the Purchases page's **Record refund** button, which had never sent the original's id, the pot or the amount, so every refund attempt failed (decision 227). No schema, migration or backup-format change. See `docs/RELEASE_NOTES_v1.20.0.md`.

**v1.21.0 stable feature:** Informal borrowing moves to its own **Borrowing** page in the menu (issue #60,
decision 228): a per-person summary with each IOU's honest status and never-netted positions, one setup
flow (select-or-create the person; a recurring plan with Fill the end date, a one-off, or just tracking),
one combined ledger (Date / From-To / Money in / Money out / Balance, signed − we owe, + owed to us per
arrangement) with greyed expected rows and one-click prefilled recording, a From/To filter, and a row
detail panel beneath its row with correction and void — closing the gap where loan movements were
voidable but not editable. Swaps and other boundary money stay on Accounts, Pots & Checkpoints beside a
signpost; old `/pots#debt-` and `/pots?external=` loan links forward to the new anchors. No schema,
migration or backup-format change. See `docs/RELEASE_NOTES_v1.21.0.md`.

**v1.26.0 stable feature:** The **Long-term forecast** (`/longterm`, in the menu beside Horizon on the desktop bar and in the phone drawer's second group) projects decades of pension pots, earnings with a stop date, the State Pension, windfalls, inflation and estimated UK tax. It leads with the household's own questions — income in 2030, income at age 62 (2032), and "does the money last?" — compares three return rates side by side, shows the same pot as drawdown versus annuity (arithmetic, never a recommendation), lists every calendar year in future money and today's money, estimates UK tax per person from the 2026/27 rate card, distinguishes a temporary gap from a run-out, and keeps every figure editable in one saved plan. Migration `0020_longterm_plans.sql` adds `longterm_plans`; no existing record or backup format changes. `/guide#longterm` explains the idea. See `docs/RELEASE_NOTES_v1.26.0.md`, SPEC §28 and decisions 233–235.

**v1.25.0 stable feature:** On **Borrowing**, an arrangement that owes nothing reads **"Nothing owing"** on the person's card and in the ledger, and its repayment action is greyed out while nothing is owed; the ledger is **newest first** by default (`?order=oldest` still asks for the old order), prints only the **next** "expected — not yet recorded" row instead of three, and keeps the reader's scroll position when the order or the person filter changes. On **Insights**, a category's line items open in a full-width row **immediately below the category line that was clicked**, closing returns the reader to the top of the page (a month total), the row itself (a category), the person's card (By Person) or the vehicle's card just below the menu (vehicle running costs), and a **£0.00** figure is greyed out and opens nothing (issue #68, decision 232). No schema, migration or backup-format change. See `docs/RELEASE_NOTES_v1.25.0.md`.

**v1.24.0 stable feature:** Purchases now support an optional `paidVia` statement payee field (up to 120 chars) alongside the merchant/supplier, enabling shared meal transfers and third-party payment routes (e.g. PayPal) to match banking statements without polluting the commercial supplier directory. "Other money in & out" on Accounts, Pots & Checkpoints and Quick Entry gains clearer signposting to distinguish it from loans/borrowing and categorized spending. Database migration `0019_purchase_paid_via.sql` adds `paid_via` to `purchases`. See `docs/RELEASE_NOTES_v1.24.0.md`.

**v1.23.0 stable feature:** On Accounts, Pots & Checkpoints, **Recent swaps & other money** draws each swap as **one nested object** — the in-leg first, the out-leg indented beneath it behind a small pointer arrow on the alternate row shade, then the pair's honest net (`net £0.00`, `legs differ · net +£2.50`, `one leg voided · net …` or `voided`) beside **Void both legs** — with each leg re-worded to name the direction, the person and the pot (`Swap in £40.00 from Sam · into Alex's cash`) and carrying its own **Edit** and **Void** that open inline beneath that leg; the "Recent swaps" list inside the swap card is retired so a swap is corrected in one place, and the redundant **Owed & owing** panel is removed (issue #65, decision 231). No schema, migration or backup-format change. See `docs/RELEASE_NOTES_v1.23.0.md`.

**v1.22.0 stable feature:** Chart E (**Where the money went**) moves its selector inside the chart card
behind a top-right **Change chart scopes** disclosure, removes boilerplate selector headings, turns off
auto-submit on quick-window clicks so category changes ride with **Show**, and hides its long caption
behind an `i` button (issue #61, decision 229). On **Borrowing**, each person's summary card opens an
inline recording form (Pot, Amount, When, Note) with 2-second auto-collapse on save, the bottom
**Record money in or out** card is retired, **Setup new Borrowing or lending** moves below the ledger
as a collapsed disclosure for new people only, and repayment/outflow sanity checks block debt
overpayments and insufficient cash pots while warning when a bank account goes below zero (issue #63,
decision 230). No schema, migration or backup-format change. See `docs/RELEASE_NOTES_v1.22.0.md`.
