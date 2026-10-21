# v1.36.0 — issue #98 and the Purchases filter rework (2026-10-21)

**Approved stable feature:** the household reviewed both pages in the Arena preview — the All
Transactions Range drop-down and supplier/notes search of issue #98, then the Purchases filter
rework it asked for in the same session — approved them and requested stable **v1.36.0** for full
testing on the multi-household Unraid installation. Publication follows
[`docs/RELEASE_PROCESS.md`](RELEASE_PROCESS.md): one PR, required checks, merge to `main`, an
annotated tag on that exact merge commit, and successful GHCR verification.

**Read decisions 254 and 255 in [`docs/IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md), plus
SPEC §15.3 and the new §15.3a first.** The preview runs on the isolated fictional seed
(`scripts/e2e-server.mts`, port 3100).

**All Transactions (issue #98).** The three quick-pick links became one **Range** drop-down — **Last
30 days** (default), **This month**, **Last Month**, **This Year**, **All** — in the order the issue
asked for. **Since last checkpoint** is gone, as requested (checkpoint dividers still show in every
other window). A new **search** box matches the **Supplier / transfer / loan** column and **Notes**
together as the household types: case- and spacing-insensitive, every word required across the two
columns in any order, encoded in the URL as `q`, applied to the whole window before the 500-row cap,
with totals and the hidden-row note describing the matches. Hand-edited dates put the select on a
**Custom dates** entry; "All" is the real `from=1970-01-01` window and the heading reads "All time to
today". Files: `src/lib/records/date-range-presets.ts` (born as `activity-range.ts`, renamed when
Purchases began sharing it) and `src/lib/records/activity-search.ts` (new),
`src/components/activity-filters.tsx` (new), `src/lib/records/activity.ts`,
`src/app/transactions/page.tsx`, `tests/date-range-presets.test.ts` and
`tests/activity-search.test.ts` (new), `tests/activity.test.ts`, `e2e/transactions.spec.ts`, SPEC
§15.3 and the §15 page table.

**Purchases (the follow-up).** **Pot** and **Paid by** are gone from the filter form because the
household never used them, and **Supplier** and **Category** are replaced by one **Search supplier,
category or notes** box: it reads the supplier's directory name and bank payee, every allocation
line's `Parent / Child` category label (a split purchase is searched whole) and the record's note,
applying as the household types (300 ms debounce, `?q=` through a `router.replace` so one search is
one history entry, no scroll jump), and it filters the whole window **before** the 500-row cap so
the count and net total describe the matches. Purchases now carries the same **Range** drop-down
while keeping the editable **From/To** dates; choosing a preset fills and applies them, a
hand-edited window shows **Custom dates**, and **All** — this page's default — means no date filter
at all (no sentinel `from`). A link can still bring a category, pot, supplier or payer in the URL;
each one the form no longer owns appears above the results as an **Also filtering** chip that clears
only that filter, so an Overview Groceries link still filters, visibly, and can be undone in one
click. Files: `src/lib/records/purchase-search.ts` (new), `src/lib/records/purchases.ts`,
`src/components/purchase-filter-form.tsx`, `src/app/purchases/page.tsx`,
`tests/purchase-search.test.ts` (new), `e2e/purchases-filters.spec.ts` (new project
`purchases-filters`), the Purchases journeys in `e2e/desktop.spec.ts` and `e2e/home.spec.ts`, and
SPEC §15.2 / §15.3a.

**Validation:** `npm test` **1167/1167 across 273 suites**, `typecheck`, `themes:check`,
`format:check`, `next build` and `npm audit --omit=dev` green. The local Playwright projects (SANDBOX
entry 8) passed **47/47** for `desktop`, `mobile` and the new `purchases-filters`, plus
`transactions` **14/14** and `charts` **15/15**; the Purchases journeys cover the five Range
options, preset ↔ dates ↔ URL, Custom dates, All clearing the dates, searches by supplier / two
columns / a category word / a note alone, the no-match state keeping the window, and the category
chip removing only `categoryId`.

**Version files:** `1.36.0` in `package.json`, `package-lock.json` (root and `packages[""]`),
`src/lib/version.ts` and the Unraid template, with `docs/RELEASE_NOTES_v1.36.0.md`. **No schema,
migration or backup-format change.**

**Published:** `v1.36.0` was merged in PR #99 at
`94ca0b40f521d4d556d007f6ac1a2fd349198d0e`; the PR checks run `39652310731` passed `gates`,
`browser` and `docker`, the `main` CI run `39653934230` succeeded, and Publish run `39653951397`
verified GHCR tags `v1.36.0`, `latest` and `sha-94ca0b4` at digest
`sha256:4373ddfc4dd4f8688d706ef2a3ec5cf3aa7390a5d2079e199ca7c98af8d57fde`, creating the Latest
release titled "v1.36.0 — Date Range drop-downs and one search over supplier, category and notes".

---

# v1.35.0 — issue #96: explicit partial refunds, signposting and locked refund lines (2026-10-21)

**Approved stable feature:** the household rejected a first pre-filled/remove-line preview,
directed explicit refund entry, then tested the revised refund form, linked signposting and the
fresh-origin refund-correction preview. It approved the entire change and requested stable
**v1.35.0** for full testing on the multi-household Unraid installation. Publication follows
[`docs/RELEASE_PROCESS.md`](RELEASE_PROCESS.md): one PR, required checks, merge to `main`, an
annotated tag on that exact merge commit, and successful GHCR verification.

**Read decision 252 (the refund model) and decision 253 (this release) in
[`docs/IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md), plus SPEC §9.5 and §15.3 first.**

**What changed:** refund amount boxes start blank with **Originally £X** placeholders; the household
explicitly enters each **refunded** amount under **Enter the amount _to be refunded_**, and a blank
line is omitted. An all-blank form records nothing. Refund creation and correction show each
parent/child category and spent-for target only as a read-only heading, with no Spent for,
Category or Which selects and no add/remove-line controls. A refund correction edits a positive
**Amount refunded** and submits the negative record; `editPurchase`'s
`assertRefundLineIdentitiesUnchanged` preserves its line count, order, categories and targets.
Purchases and All Transactions now signpost live refund state in both directions: originals show
the amount refunded/still refundable and linked refund records, while refunds name and link their
original purchase. Ordinary purchase edits retain the new split-line removal control. No schema,
migration or backup-format change.

**Validation:** `npm test` **1143/1143 across 268 suites**, `typecheck`, `themes:check`,
`format:check`, `next build` and `npm audit --omit=dev` green. The local Playwright
`transactions` refund journeys (SANDBOX entry 8) passed **2/2**, including the explicit partial
refund, already-refunded warnings, both signposting surfaces and a £10.00 → £12.00 refund
correction through the locked editor. Required PR CI (`gates`, `browser`, `docker`) remains the
gate at merge time; this entry is the pre-merge record.

**Previous release publication record:** `v1.34.0` was merged in PR #95 at
`fe274edad03c3fc5aea74a8df9e3b27fcbf1713d`; successful PR CI run `39563700500`, main CI run
`39564993184`, Publish run `39566470448`, verified GHCR digest
`sha256:9679e28473ad783484175c8f0af96daa9e7a82617a85401d8f9302b30c5e33da` for `v1.34.0`,
`latest` and `sha-fe274ed`.

**Published:** `v1.35.0` was merged in PR #97 at
`ad36f0c2c4af3f479ba6db97a3dea876e8936d6e`; the PR checks run `39604096898` passed `gates`,
`browser` and `docker`, the `main` CI run `39605429986` succeeded, and Publish run `39607611128`
verified GHCR tags `v1.35.0`, `latest` and `sha-ad36f0c` at digest
`sha256:a7eef8262430e64cd4705b119a674797481a0149f317d4fa524632473ed55270`, creating the Latest
release.

---

# v1.34.0 — issue #94: Charts B, C and F open their line items in line (2026-10-21)

**Approved stable feature:** the household reviewed the Arena preview, approved it and requested
stable **v1.34.0** for full testing on the multi-household Unraid installation. Publication follows
[`docs/RELEASE_PROCESS.md`](RELEASE_PROCESS.md): one PR, required checks, merge to `main`, an
annotated tag on that exact merge commit, and successful GHCR verification.

**Read decisions 250–251 in [`docs/IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) and SPEC
§16.7 B, C, F first.**

**What changed:** tapping a grocery week (B), a personal-spending segment (C) or a three-months bar
(F) now opens that figure's allocation lines in a panel beneath its own chart — Chart E's behaviour,
through one shared `LineItemsPanel` — instead of leaving for `/purchases`. One `?show=` key
(`b:`/`c:`/`f:`) carries the open panel as URL state (no-JavaScript and shareable, re-tap closes);
each panel sums **exactly** to the bar tapped, and **Open these purchases** keeps the old filtered
list one press further on. Opening, closing, Chart C's chips and Chart F's Exclude Housing are all
soft, scroll-preserving navigations, and a panel never outlives a series or category the redrawn
chart no longer shows. No schema, migration or backup-format change.

**Validation:** `npm test` **1141/1141 across 268 suites** (+12 for the drill keys and the resolver
reconciliations), `typecheck`, `themes:check`, `format:check` and `next build` green. The local
Playwright `charts` project (SANDBOX entry 8) passed **15/15**, including the reworked grocery
journey and a new B/C/F in-place journey at 390px and 1400px (one document, no scroll jump,
chip-closes-panel). Two pre-existing journeys (chips after reload, pace "Show the numbers") were
hardened with this file's hydration-marker wait after the sandbox exposed the swallowed-click race
decision 216 records; assertions unchanged. The first PR #95 `browser` run then exposed a
pre-existing calendar bug in the payday-summary fixture: its fixed 21st/26th window is incoherent
on the 21st–25th (the direct debits fall after payday, so its expected low is unreachable) and one
assertion pinned “26th Oct”. The fixture now picks payday and direct-debit days relative to today
and the test derives its label from the fixture's payday — test-only, no product change. Required
PR CI (`gates`, `browser`, `docker`) remains
the gate at merge time; this entry is the pre-merge record.

**Publication record:** PR #95 merged at `fe274edad03c3fc5aea74a8df9e3b27fcbf1713d`; successful
PR CI run `39563700500`, main CI run `39564993184`, Publish run `39566470448`, verified GHCR
digest `sha256:9679e28473ad783484175c8f0af96daa9e7a82617a85401d8f9302b30c5e33da`.

---

# v1.33.0 — issue #91: server settings, the Admin menu and the Cloudflare shortcut (2026-10-20)

**Approved stable feature:** the household agreed the issue #91 design (strict
`REGISTRY_ADMIN_EMAIL` admin gate, direct `/data/.env` editing with a restart banner,
roster-derived allowlist, Cloudflare rule URL shortcut), reviewed the Arena preview and
requested merge and publication for full testing on the multi-household Unraid installation.
Publication follows `docs/RELEASE_PROCESS.md`: one PR, required checks, merge to
`main`, an annotated tag on that exact merge commit, and successful GHCR verification.

**What shipped:** the /admin **Server settings** panel (editable `AUTH_ISSUER`,
`AUTH_AUDIENCE`, `AUTH_CERTS_URL`, `AUTH_ALLOWED_EMAILS`, `CLOUDFLARE_ACCESS_URL`; quoted
shell literals, atomic writes, `.bak` copy, 0600 permissions, registry audit rows, restart
banner), the env-gated **Admin** menu entry, the **Open Cloudflare ↗** shortcut, and a
combined allowlist (registry roster OR the env fallback). No schema, migration or
backup-format change.

**Validation:** `npm test` **1129/1129 across 264 suites** (including the new
`tests/env-file.test.ts`), `typecheck`, `format:check` and `next build` green. The release
PR's `gates`, `browser` and `docker` checks are the publication gate.

**To record next session:** the merge commit SHA, PR/check run IDs, Publish run ID and the verified
GHCR digest for `v1.33.0` (the workflow prints them and creates the GitHub release).

---

# v1.32.1 — issue #87: a synced month redraws Chart E in place (2026-10-20)

**Approved stable patch:** the household reviewed the Arena preview of the Chart D → E sync fix,
approved it and requested stable **v1.32.1** for full testing on the multi-household Unraid
installation. Publication follows `docs/RELEASE_PROCESS.md`: one PR, required checks, merge to
`main`, an annotated tag on that exact merge commit, and successful GHCR verification.

**Read decision 248 (the fix) and decision 249 (this release) in
[`docs/IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) and SPEC §16.7 D.**

**The defect (issue #87):** with “Sync to Spending mix” on, tapping a month on Chart D caused a
brief flash of the top of the charts page. The synced month links were plain document anchors, so
the browser reloaded `/charts`, painted the new document at scroll 0, then the `#mix` fragment
scroll landed the reader back at the D/E row 20–30 ms later. The update itself was correct.

**The fix (decision 248):** a synced month — a bar, and the table twin's month name — is now a soft
`next/link` with `scroll: false` and `prefetch: false`. The client router rewrites the page's own
query without a document load, so the viewport stays exactly where the reader was standing while
Chart E redraws. The hrefs are unchanged (still shareable, still signposted, still the full reset
with JavaScript off — the links are ordinary anchors underneath). Non-synced bars still open
`/purchases` as document links.

**Validation:** `npm test` **1112/1112 across 261 suites**, `typecheck`, `format:check` and
`next build` green. The local Playwright `charts` project (SANDBOX entry 8) passed **14/14**,
including the issue #81 journey and a new issue #87 journey at 390px and 1400px: both assert no
extra document load and no scroll movement when a synced month is tapped; the new test fails against
the old anchors (document count 1 → 2). The release PR's `gates`, `browser` and `docker` checks are
the publication gate.

**To record next session:** the merge commit SHA, PR/check run IDs, Publish run ID and the verified
GHCR digest for `v1.32.1` (the workflow prints them and creates the GitHub release).

---

# v1.32.0 — issue #89: Chart G "Spending pace" (2026-10-20)

**Approved stable release:** the household reviewed the Arena preview, approved Chart G unchanged
(“exactly what I was looking for”) and requested stable **v1.32.0** for full testing on the
multi-household Unraid installation. Publication follows `docs/RELEASE_PROCESS.md`: one PR,
required checks, merge to `main`, an annotated tag on that exact merge commit, and successful
GHCR verification. This is a stable release, not an RC.

**Read decisions 246–247 in [`docs/IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) and SPEC
§16.7 G first.** The household designed this in conversation (calendar months, cumulative
spending only, straight lines, preset scope) and shelved the issue's household-balance toggle
for separate thought — do not resurrect it inside this chart.

**Delivered (decision 246):** qualifying-month rule over the earliest dated spending entry of any kind
(`firstSpendingEntryDate`, decision 246's deliberate divergence from decision 183), the pure
resolvers and `getCumulativeComparisonView`, the `LineAreaChart` component, the full-width
`#pace` section with Compare/With/Categories selectors under `cmpA`/`cmpB`/`cmpPreset`, and the
verdict at the last common drawn day. The worked example is not mirrored (it never carried
Chart F either). No schema, migration or backup-format change.

**Validation:** `npm test` **1112/1112 across 261 suites**, `typecheck`, `format:check` and
`next build` green; the local Playwright `charts` project passes **13/13** including the new
pace journey; desktop and phone screenshots checked against the seeded household.

---

# v1.31.0 — issues #85 and #86: household payday and Getting Started (2026-10-20)

**Approved stable release:** the household requested **v1.31.0** after reviewing the Arena preview,
so they can test the release fully on the multi-household Unraid installation. Publication follows
`docs/RELEASE_PROCESS.md`: one PR, required checks, merge to `main`, an annotated tag on that exact
merge commit, and successful GHCR verification. This is a stable release, not an RC.

**Issue #85 — household payday.** Settings stores an optional, audited payday day-of-month
(1–31) in the existing settings table, with no schema migration. Planning occurrences clamp to
month-end and weekend dates shift to the preceding Friday. That setting, not an income receipt
schedule, defines projection and day-to-day windows, Horizon defaults, and Chart E's payday-cycle
windows. A configured payday enables projections without receipt schedules; receipts remain
separate expected income on their own due dates. Horizon uses today + 35 days only when payday is
unset. Existing households upgrade with payday unset and should configure it before relying on the
payday projection or cycle charts.

**Issue #86 — Getting Started.** The first-run guidance distinguishes household people from the
maximum of two assigned sign-in identities (people attribution records remain uncapped). It
covers pots and transfers, checkpoints, no bank connection or statement import, predictable
recurring versus one-off income, bills, shop/fuel estimates, credit cards and renewals, and the
first till purchase. It preserves the fact that Quick Entry does not remember the prior “For who”
selection.

**Validation:** `npm run format:check`, `npm run typecheck`, `npm test` (**1090/1090 across 256
suites**) and `npm run build` pass. Browser acceptance coverage is present, but this sandbox lacks
Chromium; the mandatory PR `browser` check must pass before merge. The preview server uses the
isolated fresh-household seed from `scripts/e2e-server.mts` (`E2E_FRESH=1`), stored outside Git in
`.e2e-data-fresh`.

---

# v1.30.0 — issue #83: purchase receipts on All Transactions (2026-10-20)

**Read decision 242 in [`docs/IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) and the updated
SPEC §15.3 / §23.4 first.**

**Release: stable `v1.30.0`.** The household reviewed the Arena preview for GitHub issue #83
(adding the purchase receipt attachment block to the inline **Correct it** panel on All
Transactions) and approved publishing on 2026-10-20. The five version-bearing places agree on
**1.30.0** (`package.json`, `package-lock.json`, `src/lib/version.ts`, the Unraid template
description and `docs/RELEASE_NOTES_v1.30.0.md`), and the contract documents name `v1.30.0`.
Follow `docs/RELEASE_PROCESS.md` for the PR gate, merge, annotated tag on the `main` merge commit
and the Publish/GHCR verification. `v1.29.0` remains the previous release.

**Delivered (decision 242):**

1. **Batched stored-receipt projection.** `listStoredPurchaseAttachments(db, purchaseIds)` in
   `src/lib/records/attachments.ts` fetches the `stored` receipts for every purchase in the
   activity window in one query (oldest first, matching `listStoredAttachments`).
   `ActivityPurchaseFacts` in `src/lib/records/activity.ts` carries `attachments:
   StoredAttachment[]`, populated via `listStoredPurchaseAttachments` in `listPotActivity` (live
   rows) and `listStoredAttachments` in `purchaseActivityRow` (pinned rows).
2. **In-place receipt block in the "Correct it" column.** `PurchaseActivityRow` in
   `src/components/purchase-activity-row.tsx` renders
   `<AttachmentForm purchaseId={purchaseId} attachments={facts.attachments} />` beneath
   `PurchaseEditForm`, giving `PUR`, `DD` and `SO` rows on `/transactions` the same single-control
   `Attach receipt` picker, `AttachmentViewer` modal and two-step `Remove` / `Confirm remove` /
   `Cancel` flow as `/purchases`.
3. **In-place revalidation.** `revalidateAttachmentPages()` in `src/app/actions.ts` now also
   revalidates `/transactions`, so uploading or removing a receipt updates the open row in place.
4. **Tests.** Unit and wiring tests in `tests/purchase-activity.test.ts` (**1089/1089 across 257
   suites**) and a Playwright journey in `e2e/transactions.spec.ts` (**12/12 passing**).

---

# v1.29.0 — issue #81: the Chart D → Chart E sync (2026-10-19)

**Read decision 241 in [`docs/IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) and the updated
SPEC §16.7 (D and E) first.** The household designed this in conversation: a two-way sync and
date fields on Chart D were both dropped ("it could get very messy"; payday cycles are weeks and
monthly bars over them are thin), leaving the one direction that pays for itself.

**Release: stable `v1.29.0`.** The household reviewed the Arena preview, asked for one fix (the
trends verdict's compared month — see below), re-checked and approved publishing on 2026-10-19.
The five version-bearing places agree on **1.29.0** (package.json, package-lock.json,
`src/lib/version.ts`, the Unraid template description and `docs/RELEASE_NOTES_v1.29.0.md`), and
the contract documents name `v1.29.0`. Follow `docs/RELEASE_PROCESS.md` for the PR gate, merge,
annotated tag on the `main` merge commit and the Publish/GHCR verification. The release notes
explain that the release adds nothing to the schema and that the sync is pure URL state.
`v1.28.0` remains the previous release.

**Delivered:**

1. **The toggle.** A "Sync to Spending mix" chip beside the preset dropdown on Spending trends,
   off by default; engaging it is inert. While on, every month link on Chart D — each bar and the
   table twin's month names (the keyboard path) — hands Chart E that whole calendar month with the
   preset's categories ticked, landing on `#mix`; the month being lived ends at today, which is
   Chart E's existing "Month to date" quick window. Nothing on Chart D opens Purchases while
   synced. Engaged state: amber warning ramp plus a soft breathing ring (`prefers-reduced-motion`
   keeps the amber, stops the pulse), with ✓, `aria-pressed` and changed bar hints.
2. **Provenance and reset.** `mixsync=1` is the toggle; `mixvia=1` is carried only by links a
   synced bar produced. Disengaging the chip or the signpost's "Return to since last payday" is
   the full reset (window, ticks, slice, provenance, toggle). Chart E's signpost appears only when
   the window drawn is exactly what tapping a drawn month produces and the cats are exactly the
   preset's; a no-JS or hand-edited mismatch shows none. Show in Chart E's panel keeps the
   signpost only when it re-submits exactly what the sync set.
3. **The pre-#81 quirk fixed.** Chart E's slice links and Show built fresh query strings and
   dropped `?preset=`, silently resetting Chart D to its first preset. All Chart E controls now
   merge parameters (`chartsQuery`), and a no-JS Show carries the other charts' filters in hidden
   inputs.
4. **Preview-acceptance fix — the trends verdict.** It compared the latest complete month with the
   month three months earlier ("£46.99 in September 2026 — up £12.00 on June 2026", inherited from
   v1.28.0). It now compares with **the complete month immediately before it**, and a lone
   complete month states itself alone: `commitmentSeries` in
   `src/lib/records/chart-series.ts`, SPEC §16.7 D names the rule.

**Tests added or updated:** `tests/charts-sync.test.ts` (12 tests: the query builder, repeated-key
preservation, `syncMonthWindow`, `sameIdSet`, `mixShowReconfirms` including the implicit-all
equivalence), the commitments verdict tests in `tests/chart-series.test.ts` rewritten for
month-on-month plus a lone-complete-month case, and a new Playwright journey in
`e2e/charts.spec.ts` (engage → tap a month → signpost → Show-reconfirm → return → drill-down
restored; asserts Chart E keeps Chart D's preset).

**Validation in this session:** `npm run typecheck`, `npm run format:check`, `npm run build` and
`npm run test` all green (**1088/1088 unit tests across 257 suites**). Server-rendered behaviour
verified against the seeded E2E household (bar hrefs, the signpost truth table, the reset URL).
This sandbox has no browser binaries, so the Playwright suite — including the new journey — runs
as the PR's `browser` check in CI (the note in `playwright.config.ts`); that check is the gate,
not this sandbox's curl.

**Not changed:** no figure, projection or record moves; no schema, migration or backup-format
change; nothing is written to Settings by the sync. Issue #81 closes with this release.

# v1.28.0 — issues #76–#79: searchable pickers, Day by day totals and pot defaults (2026-10-19)

**Read decision 240 in [`docs/IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) and the updated
SPEC §15.1/§15.2 first.** This slice implements the four open issues the household asked to be
considered together (they chose the slice; #76 and #78 share one searchable picker).

**Release: stable `v1.28.0`.** The household reviewed the Arena preview and approved publishing on
2026-10-19. The five version-bearing places agree on **1.28.0** (package.json, package-lock.json,
`src/lib/version.ts`, the Unraid template description and `docs/RELEASE_NOTES_v1.28.0.md`), and
the contract documents name `v1.28.0`. Follow `docs/RELEASE_PROCESS.md` for the PR gate, merge,
annotated tag on the `main` merge commit and the Publish/GHCR verification. The release notes explain
that this release adds nothing to the schema and moves two settings sections onto the pot cards.
`v1.27.0` remains the previous release.

**Delivered:**

1. **#76 — Quick Entry category search.** Each split line's category field is a combobox
   (`src/components/search-picker.tsx`) over the same live leaf categories, matching the parent
   or child name, any word order, case-insensitively. Tap/ArrowDown/Enter/first keystroke opens;
   arrows and Enter pick; Escape closes leaving the line alone; focus alone never opens the list
   and selects the shown label so typing replaces it. Pinned "No category — clear this line".
   Pure ranking in `src/lib/search.ts`.
2. **#78 — Recurring supplier selection.** The add form's supplier field is the same picker over
   **the whole supplier directory, A–Z** (`listSuppliers`), not the 40 most recent; "Add a new
   supplier…" and a standing order's "no supplier / household transfer" stay pinned; the edit
   form matches. Enter in the search never submits the schedule form.
3. **#77 — Horizon "Day by day" total.** The card heading now reads
   `Day by day (N days) · out £… · in £…`, summed by `projectionDayTotals` from the table's own
   rows; the worked example uses the same helper.
4. **#79 — pot defaults on the pot cards.** The detached Quick entry and All Transactions cards
   are gone. Each pot card carries **Set as default account for: Till · Transactions · New DD/SO**.
   One account per use: ticking moves the default, unticking clears it only where it is held. The
   new `default_schedule_pot_id` setting feeds a new schedule's Pot field. No schema change — the
   setting lives in the existing key/value table with its audit entry. The ticks sit behind the
   decision-131 hydration guard (`data-pot-defaults-ready`).

**Tests added or updated:** `tests/search.test.ts` (ranking), `tests/projection.test.ts`
(`projectionDayTotals`), `tests/settings-domain.test.ts` (the schedule default's store/clear/archive/
audit rules). Playwright: a category-search journey in `e2e/home.spec.ts`, a supplier A–Z/search
journey in `e2e/desktop.spec.ts`, the Day by day totals in `e2e/horizon.spec.ts`, and
`e2e/settings.spec.ts` rewritten for the three ticks (including "ticking a second pot moves the
default"). `e2e/support.ts` gained `pickEntryCategory`, `pickScheduleSupplier` and
`waitForPotDefaults`; the specs that chose a category or supplier through `.selectOption` now use
the pickers.

**Validation in this session:** `npm run typecheck`, `npm run format:check`, `npm run build` and
`npm run test` all green (**1075/1075 unit tests across 252 suites**). The full Playwright suite
through SANDBOX entry 8 (throwaway `playwright.local.config.ts`, `@sparticuz/chromium`, one worker,
fresh `.e2e-data`) is **171/171** after repairing two pre-existing traps in `insights.spec.ts` that
the release gate exposed — both also failed on `main` at `7dbdc13` with the same seed:

- `honesty loop tolerance band (issue #27)` assumed the seed's trailing eight weeks always averaged
  more than +10% over the configured figure; on Monday 19 October 2026 the drift was 9.7%. It now
  reads the card's own configured and actual figures and asserts the verdict its band rule derives
  (`honestyBand`/`honestyDriftPercent`), so it tests the feature rather than the weekday.
- `the Insights line-item drill (issue #68) › a £0.00 figure is greyed out` relied on a seeded
  month cell staying zero, which the earlier projects' records fill in. It now creates its own
  parent/child category, records one £5.00 purchase (naming the pot explicitly, because the
  settings project ends with the Till default cleared) and asserts the two earlier month cells are
  muted text while the current month is a link.

The four issues' own journeys pass, and so does every other project.

If your run differs, the four issues' own journeys are the ones to check first: the category search
(`e2e/home.spec.ts`), the supplier A–Z/search (`e2e/desktop.spec.ts`), the Day by day totals
(`e2e/horizon.spec.ts`) and the three pot-default ticks (`e2e/settings.spec.ts`).

**Not changed:** no figure, projection, chart or record moves; no migration; the backup format is
unchanged. The **Quick entry** and **All Transactions** settings sections are removed, which is the
household's own request in #79 — their defaults moved onto the pot cards.

# v1.27.0 — approved for publication (2026-10-17)

The household approved publishing for own-data testing and Unraid Force Update. This supersedes
the release hold and the pending-go-ahead bullets below. Sex stays household-chosen (issue #73's
agreed scope); survivor transfer remains follow-up. Release notes: `docs/RELEASE_NOTES_v1.27.0.md`.
Image: `ghcr.io/dougalbob/simple-finance-multi-household:latest`, host port **3009**, appdata
`/mnt/user/appdata/simple-finance-multi-household`. Back up before upgrading: saved forecasts
change numbers under the new growth/indexation defaults. No schema/backup-format change.

Release sequence in progress: one gated PR from `arena/7cfd38f8-simple-finance-multi-household`,
merge commit, main CI, annotated tag, Publish registry verification and Latest GitHub release.
Do not interpret this prepared entry as proof of publication; check GitHub release/workflow
metadata for the merge SHA, run IDs and digest. Prior browser evidence and known flakiness follow.

---

# Issue #73 — browser acceptance slice (2026-10-17) — unreleased, target v1.27.0

**Read this entry first, then the previous entry for the engine changes and household flags.**
PR #74 is merged (the previous session's PR status is stale). Its Playwright job failed and
passed on retry: treat that result as flaky, not as a fixed clean pass.

**Release override remains in force:** no version bump, release notes, tag, publication or
GitHub release in this slice. `package.json` remains **1.26.0**. No remote CI run requested here.

**Delivered:** `e2e/longterm.spec.ts` now has nine journeys: the original five, one covering
State Pension July-2037 part-year copy (6/12, first full year 2038), earnings inflation/override
persistence, sex defaults, life-expectancy edits and plan-to/horizon sync, plus screenshot and
no-document-overflow checks at **1400, 390 and 320px**. Full-page and people-panel screenshots
are written to git-ignored `test-results/` on each run.

**Browser checks found and fixed two product bugs:** the whole-number editor kept stale local
text when another field changed its value (sex/life expectancy changed the saved plan-to but
not the displayed age); it now synchronises external value changes while preserving partial
valid typing. At 320px, fieldsets and intrinsic input widths pushed the document sideways;
fieldsets and inputs now shrink to their container. Name/birth year now precede sex/life
expectancy/plan-to so the reader knows whose assumptions they are editing.

**Flake prevention, not a claim to fix #74's CI failure:** the assumptions island now publishes
`data-longterm-ready` and stays inert until hydrated (decision 131). Tests wait for that signal.
The reset helper reloads after the successful action before editing: the action's success message
can precede its `router.refresh()`, which otherwise replaces edits with the reset document.

**Validation:** full unit suite **1,063/1,063 across 249 suites**; format, typecheck and production
build green. Local Chromium via SANDBOX entry 8: **9/9** after fixes; no retries configured.
The full Playwright suite and browser CI have **not** been run. Initial local failures exposed
the stale age, the 320px overflow and the reset/refresh race; do not report those as clean runs.

**Still needs household direction before final release:**
- Drafts from records still leave sex blank. Should they seed it from records where available?
- Undrawn pension capital stays invested after plan-to; survivor transfer remains a follow-up,
  not part of #73 acceptance.
- Confirm go-ahead for the full browser CI/release gate. Then follow `docs/RELEASE_PROCESS.md`
  for v1.27.0; no release has been prepared in this slice.

**Sandbox correction:** entry 21 is the batched unit-test runner, not the native rebuild;
entry 18 covers installed Node headers. Used `npm ci --ignore-scripts` then
`npm_config_nodedir=/usr/local npm rebuild better-sqlite3`. The browser overlay is ignored.

---

# Issue #73 — long-term forecast fixes and additions, slices 1–3 (2026-10-17) — unreleased, target v1.27.0

**Read first:** [`LONGTERM_FORECASTING.md`](../LONGTERM_FORECASTING.md) (§12 session log, row 6), SPEC §28,
decisions **236–238** in [`docs/IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md), and the sandbox notes
(entries 1, 8 and 21 in [`docs/SANDBOX.md`](SANDBOX.md)).

**Release override — read before you do anything with tags or versions.** The product owner has overridden
the release steps for issue #73 (see *Interim override* in [`docs/RELEASE_PROCESS.md`](RELEASE_PROCESS.md)).
**Do not bump the version, write release notes, tag, publish or create a GitHub release until all of #73 is
done.** `package.json` is still **v1.26.0**; the contract test requires documents to name that version. Open
PRs for `main` unreleased. The Playwright browser CI check is left for the session that completes #73.

**What this branch delivers (issue #73, the feature's fixes and additions):**

1. **State Pension timing (`36062d4`).** The weekly figure is today's rate and grows each January from 2027,
   before the start date as well. A 2037 start was paid at the 2026 rate; the bug is fixed and the pinned test
   rewritten. The start year is labelled as a part-year. Copy says "today's rate", and the default uprating is
   a fixed 3.50%.
2. **Earnings growth and tax indexation (`da43028`).** Pay rises each January with inflation by default
   ("Rises with inflation" ticked), or at an override %, and stops at the last-paid date. A plan-level **Tax
   thresholds rise a year** (default 1.0%) indexes every money figure on the card together from 2027. The footer
   states it.
3. **Per-person life expectancy and plan-to (`c0a1220`).** Each person has sex, life expectancy (ONS 87 woman /
   84 man) and plan-to (life expectancy + 5). Earnings, State Pension and drawdown stop after their plan-to year.
   The forecast ends on the later plan-to year, which moves when a plan-to age changes.
4. **Docs and guide (this commit).** The guide's longterm paragraph, SPEC §28, decisions 236–238, the sandbox note
   on the native rebuild, and this entry.

**Validation (this session):** `npm test` **1,063/1,063 across 249 suites**; `npm run format:check`,
`npm run typecheck` and `npm run build` all green. The native module needed a rebuild after
`npm ci --ignore-scripts` (SANDBOX 21). **Not run:** the Playwright suite, by the household's instruction.
`e2e/longterm.spec.ts` is unchanged and its five journeys were **not** re-run here.

**Issue #73 acceptance criteria — where they stand:**
- 1 (State Pension, pre-start uprating): **met**, engine and tests.
- 2 (start year marked as part-year): **met** on the year detail. Not browser-checked.
- 3 (earnings grow, override, stop, tax and NI follow): **met**, engine and tests.
- 4 (thresholds rise at the plan-level rate from 2027/28; footer says so): **met**, engine, tests and footer.
- 5 (per-person sex, life expectancy, plan-to; horizon = later plan-to; lowered plan-to stops streams): **met**
  in the engine and the form. The form's new row has not been checked in a browser.
- 6 (saved plans load and save unchanged, with new fields defaulted): **met**, tested. Plans without plan-to
  fill it from their horizon; plans without growth fields take the new defaults (see flags below).
- 7 (`npm test`, format, typecheck and build green; e2e journeys extended; screenshots with no overflow): **partly.**
  The first four are green. The e2e journeys are not extended and no screenshots were taken.

**Left to do — next session (must finish #73, then release v1.27.0):**
1. **Browser check of `/longterm`.** Check the State Pension hint and part-year note, the earnings "Rises with
   inflation" checkbox and override, the new tax footer and threshold field, the sex, life expectancy and plan-to
   row (it sits above the name and birth-year row; review the order), and the horizon sync. Check desktop and phone
   for horizontal overflow and take screenshots.
2. **Extend `e2e/longterm.spec.ts`** with a journey for the part-year label, the earnings checkbox, and a plan-to
   change moving "Forecast ends on". Run it locally through SANDBOX entry 8. Leave the browser CI check for the
   household's go-ahead, as instructed.
3. **Decide with the household:** should drafts from records seed sex (and so life expectancy and plan-to)? Today
   they leave sex blank, and the form asks for it.
4. **Follow-up, not in #73's acceptance list:** a pension pot still held at a plan-to date keeps being invested. The
   survivor-transfer or stay decision is open.
5. **Release v1.27.0** once all of #73 is done, following `docs/RELEASE_PROCESS.md` in full: the five-place
   version bump, `docs/RELEASE_NOTES_v1.27.0.md`, the contract documents naming v1.27.0, the PR gate, the
   annotated tag, GHCR checks and the GitHub release. Then close issue #73 with a comment linking the PR.

**Flags for the household (§5.7/§11A and #73):**
- Existing saved plans **change numbers** when next loaded: thresholds index at 1.0% from 2027; pay grows with
  inflation in January; plan-to is filled from the saved horizon (which keeps the horizon itself unchanged).
- The State Pension uprating default is a fixed **3.50%**, which doesn't follow the inflation rate.
- Life expectancy defaults (87 woman / 84 man) and plan-to (+5) are ONS-based defaults, not a forecast.
- Her state pension age default (68 in 2048) is still the earlier flag.

**Sandbox:** `npm ci --ignore-scripts`, then `npm_config_nodedir=/usr/local npm rebuild better-sqlite3`
(SANDBOX 21). Run `git checkout -- next-env.d.ts` after `npm run build`.

---

# Release v1.26.0 — Long-term forecasting (slices 1–3) (2026-10-17)

**Read [`LONGTERM_FORECASTING.md`](../LONGTERM_FORECASTING.md) first** — the feature's own design
record, grill answers (§11A) and session log (§12); decision 235 in
[`docs/IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) is this slice's build record.

**What this session delivered — slice 3, prepared on this branch as PR for `main`. No tag, image or
GitHub release yet: the household asked to see the preview first.** Slice 2 (`/longterm` and the
saved plan, migration `0020_longterm_plans.sql`) was merged as PR #71. This slice makes the feature
reachable and documented: **`/longterm` is in the menu** — on the desktop bar immediately beside
Horizon, and in the phone drawer's second group — the guide gains its **ninth section**
(`/guide#longterm`, "The long-term forecast is your assumptions, not a prediction") with a link back
from the page's footer, and `docs/SPEC.md` gains **§28** plus the row in the §15.2 page table and the
§15.5 guide wording. `docs/RELEASE_NOTES_v1.26.0.md` and the five-place version bump are prepared
(`package.json`, `package-lock.json`, `src/lib/version.ts`, the Unraid template's comment/description
and the release notes), and every contract document names the new tag. `e2e/longterm.spec.ts` gains a
fifth journey proving the desktop menu, the phone drawer and the guide section all reach the page.

**Validation evidence (this session):** full test suite **1,052/1,052 across 245 suites**;
`npm run format:check`, `npm run typecheck`, `npm run build` green; `e2e/longterm.spec.ts` **5/5**
through SANDBOX entry 8, and desktop/phone screenshots checked for horizontal overflow.

**First CI run (PR #72) and its fix.** The Browser acceptance job failed on
`e2e/bell.spec.ts:233`, which pins the phone drawer at 17 links — the new menu entry makes it 18
(6 Daily + 12 More). The longterm journey's own drawer step flaked (passed on retry) because it
resized a live session; it now reloads at the phone width first. `e2e/desktop.spec.ts` and
`e2e/home.spec.ts` also gained the new entry in their "every page" lists, so menu changes fail
where they happen. Local bell + desktop + mobile + longterm projects: **53/53**.

**Release checklist still to run after the household approves the preview:** merge the PR, wait for
required CI, create the annotated lower-case tag **`v1.26.0`** on the merge commit in `main`, push
only that tag, wait for Publish, verify `v1.26.0`, `latest` and `sha-<short>` all resolve to one
digest in `ghcr.io/dougalbob/simple-finance-multi-household` (SANDBOX entry 6), and confirm the
GitHub release is Latest. Do not publish to the original package.

**Decisions carried from slices 1–2** (LONGTERM_FORECASTING.md §12 rows 3–4, decisions 233–234):
the pure month-step engine with all-integer pence and an editable 2026/27 rate card; a gap is not a
run-out; earnings are drafted from receipt schedules; the comparison rates replace only the
investments' growth; the assumptions panel keeps the reader's open/closed choice across a save; and
the whole plan is one validated JSON row per household, audited on create/save/reset.

**Two flags still awaiting the household** (§5.7/§11A): (1) "to age 90" currently means the
**younger person's** 90th — **2070**, not his 2060; (2) her state pension age defaults to **68**
(current law for a 1980 birth year). Both are single editable fields on the page.

**Household inputs still not supplied** (form variables, not blockers): both pension pot values, her
salary and stop date, the annual ISA-shelter amount (default suggestion £40k/year), and the annuity
comparison rate (default suggestion £5,500/year per £100k). The draft seeds the inheritance
(start-2027, £250k), inflation 2.5%, the 4/6/8% rates, and the £0 "other spending" line with its
required warning.

**Sandbox notes:** `npm ci --ignore-scripts` (SANDBOX entry 1); Playwright **can** run here through
the `@sparticuz/chromium` recipe (SANDBOX entry 8) — that is how this slice's browser evidence was
taken; a spec that saves to the shared seed should reset to a fresh draft first (the `longterm` spec
does); `next build` rewrites `next-env.d.ts` — revert that churn.

---

# Release v1.25.0 — "Nothing owing" on Borrowing, and line items that open and close where you were (GitHub issue #68) (2026-10-16)

**Release scope is prepared on this branch.** The household's report was a list of small annoyances
on the two pages they use most for reading: the Borrowing page's legal-sounding "Settled", a ledger
that printed three identical future rows and threw the reader back to the top when the order
changed, and Insights line items that opened below the whole card — so closing them stranded the
reader. All of it is fixed in one slice. Version files are aligned at **v1.25.0 stable**, moving
`latest` on `ghcr.io/dougalbob/simple-finance-multi-household` only. No schema, migration or
backup-format change. Required PR CI, main CI and tagged Publish evidence are still pending at
preparation time; this is a pre-merge record, not proof that a tag or image exists.

**#68 (decision 232).** On **Borrowing**: an arrangement that owes nothing now reads **"Nothing
owing"** on the person's card and in the ledger's status chip (never the legal-sounding "Settled"),
and while nothing is owed its **repayment** action is greyed out — a muted
`<span aria-disabled="true">`, skipped by the keyboard, instead of an offer the server would
refuse. The ledger is **newest first** by default (`?order=oldest` asks for the old order, and the
default is left out of the URL), prints **only the next** "expected — not yet recorded" row instead
of three, and the sort and person-filter links are `<Link scroll={false}>` so **the reader's scroll
position is kept** when the order or the filter changes. On **Insights**: a **category cell** opens
its line items in a full-width table row **immediately below the category line that was clicked**
(pinned to the visible width on a phone), and every close link carries a **return anchor** — a
month total closes to the **top of the page** (a fragment-less URL lands at `scrollY 0`), a
category closes to **its own row** (`#month-category-{parentId}`), a By-person figure closes to
**that person's card** (`#person-{id}`), and a vehicle figure closes to **that vehicle's card**
(`#vehicle-{id}`), whose top then sits just below the sticky menu. A **£0.00** figure is a muted
non-link: there is nothing behind a zero.

**Where the code lives.** `src/lib/records/debts.ts` — the "Nothing owing" status word.
`src/lib/records/borrowing.ts` — `EXPECTED_ROWS_PER_DEBT = 1`, the `newest` default order and the
`nothingOwed()` helper. `src/app/borrowing/page.tsx` — newest-first default, `scroll={false}` on the
sort/filter links, `buildLedgerHref` leaving the default order out of the URL.
`src/components/borrowing-forms.tsx` — the greyed repayment action. `src/app/insights/page.tsx` —
`toggleShow(selection, openAnchor, closeAnchor)`, `insightsHref(state, anchor)` (a `null` anchor
means no fragment at all, which is what lands the reader at the top of the page), the inline
category drill `<tr colSpan={columnCount}>` and the `MONTH_PANEL_ANCHOR` fallback. `src/lib/guide.ts`
— the guide's own wording, so the app never contradicts itself.

**Verified locally:** Gates: `npm run format:check`, `npm run typecheck`, `npm test`
(**1,012/1,012 across 233 suites**), `npm run build`. Browser (Playwright via SANDBOX entry 8, fresh
seed): `borrowing` (5/5), `debt-lifecycle` (8/8) and `insights` (7/7) — 20/20, including the seven
new issue-#68 journeys. Three sandbox lessons from this slice are recorded as **SANDBOX entry 24**:
a scroll assertion must call `scrollIntoViewIfNeeded()` before it measures (Playwright's click
scrolls the target into view); a dirty e2e database is fixed by **restarting the server**
(`scripts/e2e-server.mts` re-seeds its data directory on every start) rather than by editing the
spec; and a spec that moves money must leave the shared seed's pot balances as it found them — a
same-day debit always counts against a pot's estimate (the same-day credit is absorbed by its
checkpoint), so the new "Nothing owing" journey records its £60 **dated yesterday** and returns it
to Main account. Without that, the payday project (which runs last and reads those balances) named
Main account instead of Natwest as the worst bills-only shortfall, and its spec failed. See
`docs/RELEASE_NOTES_v1.25.0.md`.

---

# Release v1.24.0 — Statement payee on purchases and Other money signposting (2026-10-16)

**Release scope is prepared on this branch.** Version files are aligned at **v1.24.0 stable**, moving `latest` on
`ghcr.io/dougalbob/simple-finance-multi-household` only. Migration `0019_purchase_paid_via.sql` adds `paid_via`
to `purchases`.

**What was delivered.**
1. Purchases now support an optional `paidVia` statement payee field (up to 120 chars) alongside the merchant/supplier,
   enabling shared meal transfers and third-party payment routes (e.g. PayPal) to match banking statements without
   polluting the commercial supplier directory.
2. In Quick Entry Panel 1, `+ Paid via` is available beside `+ Note`.
3. In All Transactions and Purchases, purchases with a statement payee display as `Supplier · via Payee` (or `via Payee` if no commercial supplier is set).
4. Both the in-place All Transactions editor and the Purchases page editor support viewing and editing `paidVia`.
5. "Other money in & out" on Accounts, Pots & Checkpoints and Quick Entry gains clearer signposting to distinguish it from loans/borrowing and categorized spending.

# Release v1.23.0 — Swaps nested as one object in the boundary history (GitHub issue #65) (2026-10-16)

**Release scope is prepared on this branch.** The household reviewed the Arena preview of issue #65,
approved both judgement calls (the pointer arrow marks the **nested** leg so it doubles as the pair's
indent marker; each **leg** keeps its own Edit/Void with pair-level **Void both legs** in the footer)
and authorised a new stable tag. Version files are aligned at **v1.23.0 stable**, moving `latest` on
`ghcr.io/dougalbob/simple-finance-multi-household` only. No schema, migration or backup-format change.
Required PR CI, main CI and tagged Publish evidence are still pending at preparation time; this is a
pre-merge record, not proof that a tag or image exists.

**#65 (decision 231).** On Accounts, Pots & Checkpoints, "Recent swaps & other money" still reads as one
newest-first feed, but a swap's two legs are grouped by exchange key into a single card
(`<div data-swap-pair>`): the **in** leg (`Swap in £40.00 from Sam · into Alex's cash`) on top, the
nested **out** leg (`Swap out £40.00 to Sam · from Main account`) beneath it on the alternate row shade,
indented under the same gutter and introduced by an inline-SVG pointer (vertical leg → short horizontal
leg → right-pointing arrowhead), then a footer with the pair's badge — `net £0.00`, `legs differ · net
+£2.50`, `one leg voided · net …`, `voided` — beside **Void both legs**. Every leg carries its own
**Edit** and **Void** that open that leg's form inline beneath it, one panel at a time; other-money rows
get the same two controls. The **"Recent swaps"** list inside the **Swap with someone outside** card is
removed, so a swap is corrected in exactly one place, and the redundant **Owed & owing** signpost panel
is removed too (its `<BorrowingMovedRedirect>` helper stays for legacy `#debt-{id}` bookmarks; old
`/pots?external={id}` loan links still redirect to `/borrowing`).

**Where the code lives.** `src/lib/records/external-history.ts` — pure: grouping and ordering, the
honest half-pair, the four badge states, `describeSwapLeg` / `describeBoundaryMovement`, and the
`SWAP_HISTORY_ANCHOR` constant. `src/components/external-history.tsx` — draws it and holds which leg's
panel is open. The page fetches `EXTERNAL_HISTORY_FETCH_LIMIT` (60) rows and draws
`EXTERNAL_HISTORY_DISPLAY_LIMIT` (20) entries so a pair is never split by the limit; `?external={id}`
still pins the linked record (`pinnedExternal`), and a pinned swap leg brings its partner with it. The
panel carries `id="swap-history"`, which the pot cards' "Recent swaps involving …" links and All
Transactions' "Open the swap list" now target (`#swaps` only names the recording card now).

**Verified locally:** Gates: `npm run format:check`, `npm run typecheck`, `npm test`
(**1010/1010 across 233 suites**, including the new `tests/external-history.test.ts`), `npm run build`.
Browser (Playwright via SANDBOX entry 8): `external` (**4/4**, two rewritten journeys) and `borrowing`
(**5/5**); the seventeen failures a full local run reports (admin, backup, credit-card-pots, insights,
recurring, payday-summary) all pass when re-run in their own batch — the sandbox's mid-run web-server
loss of SANDBOX entry 17, not this change.

---

# Release v1.22.0 — Chart E in-card scopes and Borrowing inline recording with repayment guards (GitHub issues #61 and #63) (2026-10-16)

**Release scope is prepared on this branch.** The household reviewed and approved the Arena preview of
issues #61 and #63 (including the cash-pot shortfall block, bank-account below-zero warning, and debt
overpayment block on `/borrowing`) and asked to publish a new stable tag for Unraid testing. Version
files are aligned at **v1.22.0 stable**, moving `latest` on
`ghcr.io/dougalbob/simple-finance-multi-household` only. No schema, migration or backup-format change.

**#61 (decision 229).** Chart E (**Where the money went**) folds its selector (`#mix-controls`) inside
the Chart E (`#mix`) card behind a top-right **Change chart scopes** disclosure button (`MixScopes` in
`src/components/charts/mix-category-tree.tsx`), removing the old boilerplate selector headings
(*"Selector"*, *"Choose what to count"*, *"By default this is since last payday…"* and *"Time
window"*). Clicking a quick-window pill (**Since last payday**, **Last full payday cycle**, **Month to
date**) updates the `From` and `To` date inputs in place without auto-submitting so category-tree
ticks made alongside the window change ride with **Show**; pressing **Show** updates the chart and
keeps the scopes panel open until closed or navigated away from. Chart D and Chart E sit side by side
in a two-column grid while keeping the pie SVG large, and `ChartFigure`'s `collapseCaption` prop hides
both the `Reported` badge and caption text behind a compact `i` (`aria-label="Chart information"`)
summary button.

**#63 (decision 230).** On `/borrowing`, clicking **Record borrowing** / **Record a repayment** (or
**Record a loan out** / **Record what they repaid**) on a person's summary card opens a compact inline
recording form (`PersonDebtRecord` in `src/components/borrowing-forms.tsx`) with only Pot, Amount,
When and Note, auto-collapsing `2000ms` after a save; clicking **Record this month's £X** on an
expected row in the ledger opens that person's inline form at `#debt-{id}` pre-filled with the
expected amount. The standalone **Record money in or out** card at the bottom of the page is removed.
**Setup new Borrowing or lending** (`BorrowSetupSection`) moves below the ledger panel, starts
collapsed with a down-arrow disclosure icon, is dedicated to new people only, and auto-collapses
`2000ms` after save. Repayments and outflows carry three sanity checks (`evaluateOutflowSanityCheck`,
`checkLoanCashPotBalance`, and `addExternalMovementAction`):
1. **Overpayment block:** repayments (`we_owe` + `out` or `they_owe` + `in`) exceeding the
   arrangement's current outstanding balance (`balancePence`) are hard-blocked both in the live form
   and server-side.
2. **Cash pot shortfall block:** outflows from a cash pot whose estimated balance is less than the
   payment are hard-blocked both in the live form and server-side.
3. **Bank account below-zero warning:** outflows from a bank account that take its estimated balance
   below zero show an amber warning while still allowing submission.

**Verified locally:**
- Gates: `npm run format:check`, `npm run typecheck`, `npm run themes:check`, `npm test` (**999/999
  across 231 suites**), `npm run build`, and `npm audit --omit=dev` (**0 vulnerabilities**).
- Browser (Playwright via SANDBOX entry 8): `charts` (**11/11**), `borrowing` (**5/5**),
  `debt-lifecycle` (**6/6**), `external` (**3/3**), and `transactions` (**2/2** expectation journeys).

---

# Release v1.21.0 — Borrowing gets its own page (GitHub issue #60) (2026-10-16)

**Released and verified.** The household reviewed the Arena preview of issue #60 and authorised a
stable release in the same session ("merge and publish new stage tag and latest"). Version files are
aligned at **v1.21.0 stable**; `latest` on `ghcr.io/dougalbob/simple-finance-multi-household` moved
with it. No schema, migration or backup-format change.

**Delivery facts.** PR #62 (`arena/6b0acf6d-simple-finance-multi-household` → `main`) merged as merge
commit `872fa1b` after `gates`, `browser` and `docker` passed on the branch (run `38886184711`) and
again on the merge commit. Annotated tag `v1.21.0` on `872fa1b`; **Publish run `38888180733`** built
the image, ran the upgrade smoke against `v1.20.0`, pushed and verified `v1.21.0`, `latest` and
`sha-872fa1b` to one digest **`sha256:cec5f2bb3d50148dc946f7070dc6d6403d1b1e106de010380fe661faa8925353`**;
the GitHub release `v1.21.0 — Borrowing gets its own page` is marked **Latest**. The branch's one CI
failure along the way was the bell spec's drawer link count — Borrowing is the seventeenth nav link —
and the registry-heavy `admin` projects fail only in this sandbox (SANDBOX entry 23), never in CI.

**#60 (decision 228, `docs/BORROWING_PAGE_PLAN.md`).** Everything informal borrowing lives on its own
**Borrowing** page: a per-person summary with each IOU's honest, never-netted position and its
expected-support plan in plain words; one setup flow (select-or-create the person, recurring plan with
Fill the end date / one-off / just tracking); one combined ledger (Date / From-To / Money in / Money
out / Balance, signed − we owe, + owed to us per arrangement) with greyed expected rows and one-click
prefilled recording, newest-first toggle, and a From/To filter; and a row detail panel beneath its row
with plain-words pot landing, correction and void. Swaps and other boundary money stay on Accounts,
Pots & Checkpoints beside a signpost card; `/pots#debt-` bookmarks and `/pots?external=` loan links
forward to the new anchors. Loans are still external movements of kind `loan` bound to a debt — no
schema, migration or backup-format change. Next work: see below and the plan doc's §8.

---

# Release v1.20.0 — Purchases open in place on All Transactions, and Record refund works again (GitHub issue #57) (2026-10-15)

**Release scope is prepared on this branch.** The household accepted the Arena preview of issue #57 and
authorised a stable release in the same session. Version files are aligned at **v1.20.0 stable**, moving
`latest` on `ghcr.io/dougalbob/simple-finance-multi-household` only. No schema, migration or
backup-format change. Required PR CI, main CI and tagged Publish evidence are still pending at
preparation time; this is a pre-merge record, not proof that a tag or image exists.

**#57 (decision 226).** On All Transactions, a purchase's row makes the supplier's name (or the
schedule's name, when the record has none) a disclosure button. The panel opens **directly below the
row** — `<tr><td colSpan={7}>`, pinned to the visible width on a phone, as decision 225's transfer panel
is — with **Correct it** (the Purchases page's own `PurchaseEditForm`: amount per split line, category,
who it was for, date, note) and **Void it** (`VoidForm`) side by side from `md` up, plus Close. One
record is open at a time.

- **Codes:** `PUR` (recorded by hand), `DD` and `SO` (converted from a schedule — the household asked
  for "PUR and DD", and `SO` is the same record with the same editor, so it was included). A **refund**
  (`REF`) keeps its link to Purchases: its amount lives in the negative and its form belongs beside the
  original it was refunded against. Correcting a `DD`/`SO` never touches the schedule; its link stays
  beside the code.
- **The open purchase lives in the URL**, as `?purchase={id}#purchase-{id}`, alongside decision 225's
  `?transfer={id}`. The two are alternatives — opening one clears the other — and a URL carrying both
  resolves to the transfer (the older contract). Same mechanism as before: `router.replace(…, {
  scroll: false })` + `useOptimistic`, never `history.replaceState`.
- **A save never pulls the panel away.** A void takes the purchase out of the projection; a re-date can
  too. The open purchase is then pinned where the projection would list it (`compareActivityOrder`),
  muted, outside the totals, stripe and running balance, badged *voided / outside these dates / past the
  row limit*. A voided one keeps its reason and links to `/purchases?voidedOnly=1#purchase-{id}`; a
  re-dated one keeps its forms and links to "Show <pot> around <date>". Closing lets the pinned row go.
- **Shared, not copied:** `src/lib/records/in-place-activity.ts` (the URL/window/pinned-placement
  contract) and `src/components/activity-open-row.tsx` (provider, ready hook, panel frame) now serve both
  kinds; `transfer-activity-row.tsx` was refactored onto them with no behaviour change, and
  `tests/transfer-activity.test.ts`'s wiring suite points at the shared module.
- **Placement, measured rather than assumed:** the pinned row goes by the record's own date. A **void**
  cannot change the date, so the row — and the panel with it — stays exactly where the household was
  reading it; the spec measures the page for that case (**≤ 4px**, the v1.19.0 regression guard: the
  abandoned `history.replaceState` moved it 439px and ran red at 333px). A **re-date out of the window**
  does move the row: an older date sorts last, so the pinned row lands at the far end of a 30-day list —
  measured at first as a 931px panel move, which was the row legitimately relocating. `PurchaseActivityRow`
  and `TransferActivityRow` therefore share `useKeepPinnedPanelInView`: when a record becomes pinned and
  its panel is **entirely** off screen, the panel is brought back to the middle of the view **once** —
  never a general scroll rule (an in-view panel, a panel the household scrolled away from, and a hash
  landing are all left alone, so the page never moves under a pointer; SANDBOX 22). The spec asserts the
  panel is in the viewport afterwards instead of asserting the row did not move.

**Decision 227 — the Purchases page's Record refund button never worked, and now does.** Found by this
release's own browser test (which needs a real `REF` row): `RefundForm` sent `purchaseId` where
`addRefundAction` parses `refundOfPurchaseId`, and sent neither `potId` nor `amount`, so every attempt
failed with `Invalid input: expected number, received null`; its lines also went in the editor's typed
text shape where the action's schema reads whole pence. The action additionally passed the parsed `null`
supplier and payer through, which reads as "no supplier" rather than "inherit the original's". Both
halves now share one named contract, `tests/purchases.test.ts` pins every field name in each half, and
the browser records a real refund, reads its `REF` row, follows its link back to Purchases, checks the
issue-30 anchored landing and voids it again. Reported to the household as a separate repair.

Code: `src/components/activity-open-row.tsx`, `src/components/purchase-activity-row.tsx`,
`src/lib/records/in-place-activity.ts`, `src/lib/records/purchase-activity.ts`,
`src/lib/records/activity.ts`, `src/lib/records/entry-view.ts`, `src/lib/records/purchases.ts`,
`src/app/transactions/page.tsx`, `src/components/record-forms.tsx`, `src/app/actions.ts`,
`src/app/purchases/page.tsx`, `src/lib/guide.ts`. SPEC §9.5, §15.1–15.3 and the guide are updated.

**Verified locally:**

- Gates: format, typecheck and themes are clean. `npm test` passes **992/992 across 230 suites** (16 new
  in `tests/purchase-activity.test.ts`, 19 in `tests/transfer-activity.test.ts`, 2 new wiring tests
  for the refund form in `tests/purchases.test.ts`). The production build is clean and `npm audit --omit=dev` reports 0
  vulnerabilities.
- Browser, via SANDBOX entry 8 (Chromium 153.0.8010.0, `LD_LIBRARY_PATH=/tmp/al2023/lib`):
  - `transactions` **11/11** — including the three new issue-57 journeys: a purchase recorded at the till
    and corrected then voided in place (the page unmoved, ≤ 4px); a re-date out of the window (pinned,
    honest, panel brought back into view); and a refund recorded on Purchases whose `REF` row keeps its
    link, lands below the sticky header and is voided again.
  - `projects`, `credit-card-pots`, `insights`, `recurring` and `payday-summary` **11/11** on a fresh
    server, and `backup` **3/3** — the same projects that failed earlier in this session only because the
    sandbox's `next dev` had died part-way through a 146-test run (SANDBOX 17's hazard; the failures were
    `net::ERR_CONNECTION_REFUSED`).
  - **`admin` is the one project this sandbox cannot finish: 2/4.** Re-run **against the clean `HEAD` tree
    with the change stashed** it is *worse* — 3/4, including the same two tests — so it is the environment
    (the dev server dies on the registry backup/restore and household-creation flows here), not this
    change; the spec touches no code this release edits, and CI's `browser` job passes it on GitHub
    runners. CI's run is the authoritative full-suite evidence for this PR.
  - A full 146-test run in this sandbox passed 128 and lost its server for the rest (SANDBOX 17); the
    per-project runs above are the local evidence that matters.

**Live preview:** port **3000**, Next development mode bound to `0.0.0.0`, using only fictional records in
ignored `.preview-data` and the development-only `alex@example.com` identity. Recreate it with
`DATA_DIR=.preview-data node --import tsx scripts/seed-example-household.mts`. On **All Transactions**
(Main account), select **Corner Foods** on the split purchase row to open it in place, correct the amount
or the note, then void it and close; select the **Phone plan** `SO` row to see a converted record. On
**Purchases**, open a purchase's **Edit → Refund** section and record a refund, then find its `REF` row on
All Transactions and follow it back. No real household data was accessed.

**Trade-offs accepted with the household (decision 226):** a refund is recorded, corrected and voided on
Purchases only (it does not open in place); the panel offers Correct it and Void it, not Refund; and a
purchase re-dated outside the window is pinned at its own date's place in the list rather than under the
household's pointer.

**Prior release, verified from `gh` in this session:** `v1.19.0` published on 2026-10-15T19:08:10Z. Its
annotated tag dereferences to `284f15e02eb56e892b7714ae3938418e31fa2842` (the `main` merge commit of PR
#56), and Publish run `38791004005` (job `116615216479`) succeeded. The GitHub release is **not** a draft
and **not** a pre-release, so `latest` has moved off `v1.17.0`. The published digest is verified by the
workflow's own step; this sandbox cannot read the run's log blob (its host is outside the network
allow-list), so no digest is restated here.

---

# Release v1.19.0 — Transfers open in place on All Transactions (GitHub issue #55) (2026-10-15)

**Release scope is prepared on this branch.** The household approved the Arena preview of issue #55. They
authorised a stable release on one condition: fix the failure the PR's CI Playwright run picked up (done;
see "CI catch" below). They also accepted `v1.18.0-rc.1` (issue #53), so it ships inside this stable
release, following the `v1.9.0` precedent. Version files are aligned at **v1.19.0 stable**, moving
`latest` on `ghcr.io/dougalbob/simple-finance-multi-household` only. No schema, migration or
backup-format change. Required PR CI, main CI and tagged Publish evidence are still pending at
preparation time; this is a pre-merge record, not proof that a tag or image exists.

**#55 (decision 225).** On All Transactions, an internal transfer's row (`TX>` / `TX<`, family
`transfer`) makes the other pot's name a disclosure button. The panel opens **directly below the row**
(`<tr><td colSpan=7>`, pinned to the visible width on a phone) with **Correct it** (the existing
`TransferEditForm`) and **Void it** (`VoidForm`) side by side from `md` up, plus Close. One transfer is
open at a time.

- **The open transfer lives in the URL**, as `?transfer={id}#transfer-{id}`. `OpenTransferProvider`
  sets it with `router.replace(…, { scroll: false })` plus `useOptimistic`. Do not use
  `history.replaceState`: the first save afterwards scrolled the page 439px, and the spec ran red at
  333px.
- **A save never pulls the panel away.** If a void, or a correction to other pots or dates, takes the
  transfer out of the projection, it is pinned at the index it held while live. It is labelled
  "voided / moved to other pots / outside these dates / past the row limit — not counted", is excluded
  from totals, stripe and balance, and shows "See it in … →" / "Show … around … →" links. Closing
  removes it.
- **The pots page.** The "Transfers between pots" card is gone. `/pots?transfer={id}` redirects to the
  in-place view, on the usual pot if the transfer touches it, otherwise its from-pot.
- **Unchanged:** purchases keep their link to Purchases, and every other family is untouched.
  Recording still happens in Quick Entry → Move → Between pots.
- **Two fixes made along the way:**
  - The `TransferEditForm` selects are keyed by pot. An uncontrolled `<select defaultValue>` snapped
    back after a save, and the next save would have rewritten the old pot.
  - Pinned rows are placed with the shared `compareActivityOrder` (`src/lib/records/activity-order.ts`),
    not by date. Placement by date moved the panel 163px.

Code: `src/components/transfer-activity-row.tsx`, `src/lib/records/transfer-activity.ts`,
`src/lib/records/activity-order.ts`, `src/app/transactions/page.tsx`, `src/app/pots/page.tsx`. SPEC §10.1
and §15.2–15.3 and the guide are updated.

**Prior v1.18.0-rc.1, verified from `gh`:**

- PR #54 merged as `7c8fecc798bf16ec58d8dea2ceff864b6a9011ca` (2026-10-15T15:23:00Z).
- PR CI `38758289072`, main CI `38759833241` and Publish `38761006486` all succeeded.
- Digest `sha256:b99b0adf06e91bbe7f3c365c81d60428c552cfb9644db2f0d4329b70412ffb0a`.
- The GitHub release "v1.18.0-rc.1 — Recurring calendar day summaries" is marked pre-release.
- `latest` stayed on `v1.17.0` (`sha256:f886f7976f19dc7e5f2c610239ebccc792dd6302b0608295f360b3d8053aacd7`).
- The household accepted the candidate in this session.

**Verified locally:**

- Gates: format, typecheck and themes are clean. `npm test` passes **973/973 across 225 suites** (18 new
  in `tests/transfer-activity.test.ts`). The production build is clean, and `npm audit --omit=dev`
  reports 0 vulnerabilities.
- Browser, via SANDBOX entry 8:
  - The six projects desktop, settings, external, checkpoint, transactions and income passed 42/42.
  - After the CI fix, every project in CI's order up to and including `transactions` (mobile, desktop,
    attachments, settings, external, checkpoint, transactions) passed **69/69**.

**CI catch.** The first PR browser run (`38784645889`) failed one assertion: 143 passed, 1 failed, in
"a saved transfer is corrected in place". After correcting £12.34 to £12.99, it expected no activity row
to contain "£12.34". In CI the earlier `mobile` project records a £12.34 till purchase ("Playwright
Paints") on Main account today, and the old card-scoped check could never see purchases. The spec's
lookups now use `transferRows(page)` (`tbody > tr[id^="transfer-"]`; the panel's `<tr>` has no id).

- Reproduced red locally: the mobile till test plus the corrected-transfer test, unscoped check,
  Expected 0, Received 1.
- Green with the fix.
- **Lesson:** when changing an e2e spec, run the CI projects that precede it too (`mobile` first), not
  only its own project.

**Live preview:** port **3000**, Next development mode bound to `0.0.0.0`, using only fictional records
in ignored `.preview-data` and the development-only `alex@example.com` identity. Open `/transactions`
(Main account) and select **Sam's cash** on the 1st bridging payment row. Recreate the preview with
`DATA_DIR=.preview-data node --import tsx scripts/seed-example-household.mts`, then add these
illustrative transfers with a throwaway script calling `createTransfer`, or through Quick Entry → Move
→ Between pots:

- Sam's cash → Main £1,100.00, yesterday, "1st bridging payment plus £100 of charity donation"
- Main → Alex's cash £60.00, 5 days ago
- Salary account → Main £1,250.00, 12 days ago
- Main → Sam's cash £40.00, 15 days ago
- Main → Salary account £25.00, 21 days ago

Also add a Main account checkpoint of £162.01 dated 31 days ago. No real household data was accessed.

**Trade-offs accepted with the household (decision 225):** voided transfers are no longer listed
anywhere in the UI (the audit trail keeps them), and an older transfer is reached by widening the
dates.

---

# Release v1.18.0-rc.1 — Recurring calendar crowding (GitHub issue #53) (2026-10-15)

**Outcome (recorded in the v1.19.0 session):** published from `7c8fecc` (PR #54, Publish
`38761006486`) as a pre-release that never moved `latest`. Accepted by the household on 2026-10-15 and
promoted to stable in `v1.19.0`. The text below is this session's pre-merge record.

**Release candidate `v1.18.0-rc.1` is being prepared for Unraid acceptance.** PR checks, main CI and
tagged Publish are still pending; the candidate is not yet published. Stable `v1.17.0` and `latest` remain
unchanged. The Recurring month grid
now keeps populated day cells compact: each shows an item count and the gross combined amount. Selecting
a day opens a full-width details panel below the grid with each schedule's name, amount, type and
conversion state. Receipts are included in the gross amount, never netted against outgoings. Each
“Edit schedule” link keeps the schedule name in the filter, adds an exact `scheduleId` constraint, and
opens the matching Edit disclosure through `#schedule-edit-<id>` on direct or soft navigation. Similar
schedule names therefore cannot widen the result. No financial-data, schema, migration or backup-format
change. The exact total remains visible at 320px and 390px phone widths.

**Verified locally:** `npm run format:check`, `npm run typecheck`, `npm run themes:check`, `npm test`
(**955/955 across 221 suites**), `npm run build`, and `npm audit --omit=dev` (**0 vulnerabilities**).
Browser: the full recurring project **5/5** and the desktop calendar/edit journey **1/1** pass. A live
browser smoke on the preview confirmed the six-item `£1546.60` summary, all six detail rows and no
browser errors.

**Live preview:** port **3000**, Next development mode bound to `0.0.0.0`, using only fictional records
in ignored `.preview-data` and the development-only `alex@example.com` identity. Open
`/recurring?month=2026-10` and select **22 October** to see the six illustrative standing orders
(Mortgage payment, Council tax, Energy bill, Broadband, Gym membership and Car finance; gross total
£1546.60). No real household data was accessed. The browser overlay and preview database are ignored
local artifacts. Recreate the household seed with:

```bash
DATA_DIR=.preview-data node --import tsx scripts/seed-example-household.mts
```

Then add the six illustrative schedules if the sandbox has reset.

---

# Release v1.17.0 — Spending trends (issue #40) (2026-10-15)

**Release scope is prepared on this branch.** The household accepted the Arena preview, requested the
minor final label change from “Edit preset” to **“Create/Edit preset”**, and explicitly authorised
publication for Unraid testing. This supersedes the preview hold. Version files are aligned at
**v1.17.0 stable**, moving `latest` on `ghcr.io/dougalbob/simple-finance-multi-household` only.
No schema, migration or backup-format change. Required PR CI, main CI and tagged Publish evidence
remain pending at preparation time; this is a pre-merge record, not proof a tag or image exists.

Chart D now selects household category presets from a dropdown without scrolling. Settings offers
create/rename/edit/delete, expandable parent/child ticks, all/schedule-category/clear shortcuts,
retired categories, empty selections, delete confirmation and a read-only refusal. The old category
selection survives as Fixed commitments; an unset selection uses the existing schedule fallback until
first save. The new JSON setting is audited and collection-version guarded; no schema or backup-format
change. Reported spending includes manual and schedule-generated purchases; no forecast data is added.
The old schedule-only UI and long category lists are removed. See SPEC §16.7 D and decision 223.

**Verified locally (including the final label/version change):** format, typecheck, production build, themes, production audit (0 vulnerabilities),
all **953 unit tests / 219 suites**, and the **11 Charts + 5 Settings browser tests** using SANDBOX entry 8.
The preset browser journey checks creation/rename/deletion, persistence, mixed parent ticks, filtered
bar URLs, deleted-ID fallback, other-query preservation and scroll preservation in both directions at
390px and 1400px. Additional live-preview browser checks exercised a long-name empty preset at 320px,
empty state, switching back to a populated chart, cancellation/confirmation of deletion, and screenshots
of the phone chart and desktop editor: no horizontal overflow or browser errors. The preset browser journey was rerun successfully with the final Create/Edit preset label before the release PR.

**Live preview:** port **3000**, Next development mode bound to 0.0.0.0, using only fictional data in
ignored `.preview-data` with the development-only `alex@example.com` identity. Open `/charts#commitments`
and `/settings#commitment-categories`. Four illustrative presets are seeded: Fixed commitments,
Everyday essentials, Discretionary, All spending. They are preview examples, not imposed production defaults.
The persistent server was started with:
`DATA_DIR=/home/user/simple-finance-multi-household/.preview-data AUTH_DEV_BYPASS=true AUTH_DEV_IDENTITY_EMAIL=alex@example.com NEXT_TELEMETRY_DISABLED=1 npm run dev`.
No real household data was accessed. Browser config, seed helpers and screenshots are ignored artifacts;
if the sandbox restarts, dependencies and preview data may need rebuilding using SANDBOX entry 8 and
the fictional E2E seed. The required PR CI will run the full seeded and fresh-household browser suites before merge.

---

# Release v1.16.2 — Verified anchor landings (GitHub issue #43) (2026-10-15)

**Release scope is prepared on this branch.** Open issues were #43 and #40; this session took #43 (a concrete production bug) and left Chart D #40 untouched — its own text asks for a naming/design discussion first. #43: after v1.13.1 (decision 216), following a Supplier card's "Linked to schedule" link could still leave the filtered schedule behind the menu bar in production. Root cause found by simulation: decision 216 assumed every browser honours `scroll-margin-top` during Next's bare `scrollIntoView()` / fragment scroll; one that does not (older WebKit) lands the row at viewport top 0 and nothing rescued it. Chromium honours it at every width, which is why v1.13.1's checks all passed. The fix (decision 222): `ScrollHashIntoView` now measures each settle sample against the sticky header and corrects the document once — only when the target is settled behind the bar (`ANCHOR_CORRECTION_STABLE_MS`), once per navigation, and disarmed by the household's first pointer/wheel/touch/key input (the three guards decision 216's removed attempt lacked). Pure rule `anchorCorrectionDelta` in `src/lib/records/anchor-scroll.ts`. No schema, migration, backup-format or financial-data change.

**Evidence.** New e2e in `e2e/recurring-hide-cancelled.spec.ts`: a phone supplier journey, and a margin-stripped simulation (`.sf-anchor { scroll-margin-top: 0 !important }`) that ran **red on v1.16.1** (row top 0 vs 85px header, still there after 1.2s, desktop and cold phone) and green after the fix (corrects 0 → 97px = bar + 12px gap); normal Chromium landings at 390–1400px unchanged. Local gates all pass: format, typecheck, themes, `npm test` **947/947 across 218 suites**, production build, `npm audit --omit=dev` 0 vulnerabilities, and the full local browser suites (seeded **113 passed**, fresh-household **3 passed**, via `docs/SANDBOX.md` entry 8) — including the commitments-chart journey that caught the 216-era attempt. Required PR CI and tagged Publish evidence remain pending at merge time; this entry is the pre-merge record, not evidence a tag or image exists.

Prior v1.16.1 verified: see the entry below and `docs/RELEASE_NOTES_v1.16.1.md`. This patch does not reopen Chart D #40.

---

# Release v1.16.1 — Laptop split-card layout patch (2026-10-15)

Prepared on the assigned branch: category, amount row and adder stack at every width; no totalling changes. The "+" explicitly stays 48px tall despite the till-wide 44px minimum rule. Geometry test ran red against the old desktop row placement, green after the fix. Old 1400px client widths were 127px (amount) and 102px (item), not below 80px in this seed; row-placement coverage catches the regression regardless. All seven targeted remainder/mobile split tests passed using SANDBOX entry 8. Local format, types, themes, build, production audit (0 vulnerabilities) and all 946 unit tests across 218 suites pass. CI and publication remain pending at preparation time.

Prior v1.16.0 verified: PR #49 merge `052e369ef311c98a87232c9295bc21124de10ad5`; PR CI `38713521081`, main CI `38714493023`, Publish `38715290201` all succeeded. Household accepted the totalling and mobile layout. This patch does not reopen those rules, Chart D #40, or #43.

---

# Release v1.16.0 — Total same-category items on a split line (GitHub issue #46) (2026-10-15)

**Release scope is prepared on this branch.** On Quick Entry, a split line that is not Line 1's auto remainder offers a **"+"** beside its amount. Tapping it opens **Add item**: each amount is added in whole pence to that line's running total (same category, same target, no extra split). Line 1 still follows the remainder. Empty or zero current starts the line at the first item; a half-typed amount is left alone. Enter in the item field adds and never saves the purchase. No financial data, schema, migration or backup format changes. See decision 221 and SPEC §15.1.

The four fictional clothing amounts from the issue (£38.50 + £11.65 + £8.25 + £11.99) total **£70.39** in the unit tests. The new browser spec fills a £100 till total, proves Line 1 has no "+", then adds those four amounts into Line 2 via Enter and asserts Line 2 is £70.39 with Line 1 remainder £29.61, at 393px and 1400px. Existing remainder and mobile split specs still pass. Local gates passed: format, typecheck, themes, `npm test` (**946/946** across 218 suites), build, and production audit (0 vulnerabilities). Required PR CI and tagged Publish evidence remain pending; the local results are not a substitute. This is still a pre-merge record, not evidence that a tag or image exists.

---

# Release v1.15.1 — Keep By Person month navigation in place (GitHub issue #45) (2026-10-15)

**Release scope is prepared on this branch.** On `/insights`, the By Person Prev/Next links keep the current scroll position during month changes, while retaining their `#panel-persons-heading` fragment for direct and no-JavaScript visits. Next's default hash scrolling followed that fragment on soft navigation; both links now use `scroll={false}`. No financial data, schema, migration or backup format changes. See decision 220 and SPEC §16.2.

The new browser regression test first failed against the unmodified page: at 390px, Next shifted the page by **91px** from the starting position. It now passes at 390px and 1400px in both directions, retaining `window.scrollY` within 8px after 450ms. The prior test already covered the sticky-header-safe heading anchor; that check remains. The full Insights Playwright project passed **3/3** locally using `docs/SANDBOX.md` entry 8. Local gates passed: format, typecheck, themes, `npm test` (**939/939** across 217 suites), build, and production audit (0 vulnerabilities). Required PR CI and tagged Publish evidence remain pending; the local results are not a substitute. This is still a pre-merge record, not evidence that a tag or image exists.

---

# Release v1.15.0 — Pin a default pot for All Transactions (GitHub issue #44) (2026-10-15)

**Release scope is prepared on this branch.** `/transactions` now resolves a valid `potId` from the URL first, then the household's saved `default_transactions_pot_id`, then the former `Main account` / first-live-pot fallback. The new Settings → All Transactions selector can set, change or clear that household-level preference. It uses the existing settings table and audit trail; no migration or backup-format change. Explicit URL targets remain authoritative, including submissions from the Target filter.

The session also cherry-picked remote docs-only commit **`1ba146c2494ee36651079b6296bafd3e8667384b`** as **`aac63bb`**: it records the verified v1.14.0 PR #42 checks, CI and Publish facts in this handoff. That exact change is included in the v1.15.0 release branch as requested.

Unit coverage is in `tests/settings-domain.test.ts`; browser coverage is in `e2e/settings.spec.ts`. Release-gate results and verified PR/Publish facts will be added after the checks and tag complete. This entry is a continuation point, not evidence that a tag or image exists.

---

# Release v1.14.0 — A saved pot-to-pot transfer is corrected in place (GitHub issue #33) (2026-10-14)

Released as **`v1.14.0`** (`APP_RELEASE_STAGE = 'stable'`; moves `latest` on `ghcr.io/dougalbob/simple-finance-multi-household`, host port `3009`; GitHub release marked Latest). No schema change, no migration. Recorded from `gh` after publication (RELEASE_PROCESS §7): PR **#42** merged as **`382f5f9f36bab19cd8ccfdea45b2f6bd6801e488`** (`382f5f9`, merged 2026-10-15T00:11:41Z). PR checks (workflow run **`38657829636`**): `Gates (format, types, tests, build, audit)` success, `Browser acceptance (Playwright)` success, `Docker image build + entrypoint smoke` success. CI on `main`'s merge commit: run **`38658611851`**, success. Publish: run **`38658627684`**, success — every step green including "upgrade smoke", "push the verified image" and "verify the registry tags resolve" — publishing **`v1.14.0`**, **`latest`** and **`sha-382f5f9`** to one digest **`sha256:84030855d1a74861477e11ade5f8557532d102d837b79cea51a1142b9ded7ffe`**. GitHub release **`v1.14.0`** ("v1.14.0 — Correct a saved transfer between pots") created from `docs/RELEASE_NOTES_v1.14.0.md`, not a pre-release, marked **Latest**. **GitHub issue #33 is closed as completed.** The independent package-version read (`/users/dougalbob/packages/...`, SANDBOX entry 6) returned `403 Resource not accessible by integration` for this session's app-bot token — no package read scope — so the one-digest proof is the Publish run's own verify step, which passed; that is the route SANDBOX entry 6 names as authoritative when the API read is unavailable.

**#33 — a saved transfer is a money record like any other (decision 218).** On Accounts, Pots & Checkpoints the only thing a live transfer row offered was **Void**. The household's issue: no way to add a note after the fact, no way to fix a wrong amount or a pot picked by mistake, where a purchase has full edit. The domain already had `editTransfer` (optimistic version guard, voided-transfer refusal, two-different-pots rule, `undefined` = unchanged / `null` = clear, before-and-after audit) and its unit tests — the gap was everything above it. Now: `editTransferEntrySchema` (`src/lib/validation.ts`), `editTransferAction` (`src/app/actions.ts`, with the same sign-in and read-only refusals every household action carries), `TransferEditForm` (`src/components/record-forms.tsx`) and an **Edit** disclosure beside **Void** on every live row, opening with the row's own pots, amount, local date (`max={today}`) and note pre-filled. A stale form is refused with the domain's version-conflict message and saves nothing. `entered_by` and the entry time never change — §7.1's same-day rule reads `createdAt`, so a correction cannot re-date a movement into a checkpoint's window. Blank note keeps the note; blank date means unchanged (the app's usual edit convention). Recording still happens only in Quick Entry → Move → Between pots (decision 164); All Transactions stays read-only and its existing `/pots?transfer={id}#transfer-{id}` deep link now lands on the page that can fix the record.

**Evidence.** Two browser specs in `e2e/transactions.spec.ts`, both run **red first against the unmodified `src/` tree** (no Edit affordance — the locator timed out) and green with the change: the in-place correction of pot + amount + note (asserting the old amount is gone, so it is one movement moved rather than a void plus a second entry) and the stale-editor case (a second page loaded before the first saves: the stale save is refused with "changed by someone else" and writes nothing). Both void their transfer at the end so the shared seed's pot estimates finish where they started. Local browser runs used docs/SANDBOX.md entry 8 (`@sparticuz/chromium`, Chromium 153.0.8010.0, throwaway `playwright.local.config.ts`). Unit: `tests/entry-validation.test.ts` (schema boundaries) and `tests/transfers.test.ts` (pots/amount/date correction, preserved entry time, no phantom leg on the old pot, both audit rows). Gates before the PR: `npm run format:check`, `npm run typecheck`, `npm run themes:check`, `npm test` (batched), `npm run build`, `npm audit --omit=dev`.

**The live preview the household approved** ran `E2E_PORT=3000 node --import tsx scripts/e2e-server.mts` (fictional `.e2e-data`, dev identity bypass, port 3000) with three throwaway transfers seeded through the domain's own `createTransfer` — one deliberately without a note, which is the issue's own case. Note for a future session: the seeded household contains **no transfers of its own**, so a preview of this area needs that one-off seed; the e2e seed was left untouched.

# Unreleased PR — Purchases result total (#38) and Chart C scroll stability (#39) (2026-10-14)

A bounded UI slice of the open issues, without a new release tag/version: Purchases now shows `N entries: Total £X` for the filtered rows it displays (up to 500 newest). Refunds reduce the total, voided entries remain visible for history but add zero, and a split purchase counts once. Chart C's person chips keep the reader's scroll position on soft navigation while retaining their URL filters and direct/no-JS `#personal` fallback (which now lands below the sticky header). No migration or changed household data. See decision 217 and SPEC §§15.2, 16.7 C. #33 and #40 remain larger follow-up slices; #34 is already corrected in v1.13.1 but remains open for field confirmation.

The two documentation-only handoff commits left on the other remote Arena branches were brought into this PR: `65b47a9` (v1.13.0 release facts, from `arena/962933e3-simple-finance-multi-household`) and `19a4f37` (v1.13.1 release facts, from `arena/c2cce040-simple-finance-multi-household`). Both alter only this handoff document; they add missing merge/CI/Publish/digest history and do not change either published release.

Validation: Chart C's browser regression failed by **160px** before the fix and passes afterward at 390px and 1400px, in both filter directions. The new Purchases browser test passes for default, filtered and empty lists. `npm run format:check`, `npm run themes:check`, `npm run typecheck`, `npm test` (**928/928**, 215 suites), `npm run build`, and `npm audit --omit=dev` (0 vulnerabilities) pass. The local full browser run passed 120 specs including the new ones, then hit two environmental failures: it crossed London midnight, so the existing seeded task expected "In 6 days" but read "In 5 days"; the server stopped while compiling the admin restore route after a long run (SANDBOX entry 17), and later tests could not connect. Reruns of all 13 affected non-admin tests and all 4 admin tests passed in separate fresh invocations; the separate first-run household suite passed 3/3. Required PR CI (`gates`, `browser`, `docker`) remains the merge gate. Follow up after merging: record PR/CI status here in the next session; do not call this a published release or move `latest` without a separate release request.

# v1.13.1 release — Anchored links land below the sticky header at every width (2026-10-14)

Released as **`v1.13.1`** (`APP_RELEASE_STAGE = 'stable'`; moves `latest` on `ghcr.io/dougalbob/simple-finance-multi-household`, host port `3009`; GitHub release marked Latest), a patch on `v1.13.0`. The household re-opened **GitHub issue #34** from production: following a Supplier card's `Linked to schedule "…"` link opened `/recurring?q=…` with the schedule row's top at 24px, behind the 85px sticky menu, so the row had to be scrolled into view by hand. No schema change, no migration.

1. **The coordinates bug, fixed at the root (decision 216).** The row carried `scroll-mt-6` (24px) and `ScrollHashIntoView` used `scrollIntoView({ block: 'nearest' })`, which cannot see a sticky header (it is not a scrollport). Worse, the header is not a fixed height: measured in Chromium here, **57px** on a phone, **121px between 1024px and 1199px** (the desktop nav wraps onto a second row), **85px** from 1200px up — so the app's usual 96px `scroll-mt-24` fails too on a wrapped-nav laptop. The offset is now measured and shared: `src/lib/records/anchor-scroll.ts` (pure rules, unit-tested), `site-nav.tsx` publishes the header's height + a 12px gap as `--sf-anchor-offset`, `@utility sf-anchor` (globals.css) spends it as `scroll-margin-top` (with a taller pre-hydration guess from 1024px, where the nav can wrap before anything has measured it), and `ScrollHashIntoView` — **now rendered once in the root layout** — does only the job a fragment scroll cannot (bringing the target into Recurring's inner list scrollport, decision 164); it re-arms on pathname, hashchange and load, so a soft navigation cannot drop it. It originally *corrected the document* too, and that was removed: a correction firing while `/charts` was still growing landed between a click's hit-test and its dispatch and made the click miss (`e2e/charts.spec.ts`), three runs out of three — a correct landing needs no re-aiming (see decision 216). **Every hash target in the app now uses `sf-anchor`** — 14 baked-in `scroll-mt-*` values replaced, so Purchases rows (issue #30), Insights panels, Contracts renewals, Settings cards, supplier cards, task rows, the guide, Projects and the till all clear the header at any width. `e2e/transactions.spec.ts` (issue #30) now asserts the row the fragment actually names rather than the first `hasText` match, which was a different row once other specs had grown the seed.
2. **The Recurring filter island says whether it is listening (SPEC §15.1).** Found while proving the fix: on a cold dev server the filter step of `e2e/recurring-hide-cancelled.spec.ts` failed because a keystroke landed before hydration and was wiped by the hydration render (it reproduced with this session's changes stashed, so it predates them — docs/SANDBOX.md entry 22). The filter row is now `inert` until hydration and publishes `data-schedules-ready`; `waitForScheduleFilter` in `e2e/support.ts` mirrors the existing till/filters/gallery/category helpers.

Version files bumped together: `package.json`, `package-lock.json` (root and `packages[""]`), `src/lib/version.ts`, `simple-finance-multi-household.xml`, `docs/RELEASE_NOTES_v1.13.1.md`; `AGENTS.md`, `README.md`, `docs/HANDOFF.md`, `docs/RELEASE_PROCESS.md` and `docs/MULTI_HOUSEHOLD_PLAN.md` name `v1.13.1` (the isolation contract test pins that).

Evidence: the regression spec was run **red first** with this session's `src` changes stashed (`git stash`) — the row's top at 24px against a header bottom of 85px (1400×950) — and green with them: the linked row clears the header at 1400×950 and again after a cold load at 1100×950, the width where a constant cannot work (and cold loads at 1400/1100/390px were probed directly: 133/133/69px rows against 85/121/57px bars). Browser runs here used docs/SANDBOX.md entry 8 (`@sparticuz/chromium`, throwaway `playwright.local.config.ts`): the recurring, insights, mobile, desktop and transactions projects, then the full local suite. Gates: `npm run format:check`, `npm run typecheck`, `npm run themes:check`, `npm test` (batched), `npm run build`, `npm audit --omit=dev`.

Recorded from `gh` after publication (RELEASE_PROCESS §7): PR **#37** merged as **`8da392c9d4277a93b85064e48d1664d7e7ab11b5`** (`8da392c`). PR checks: `gates` 1m57s, `browser` 8m40s, `docker` 1m49s (workflow run `38635776735`). CI on `main`'s merge commit: run **`38637449905`**, success. Publish: run **`38638347620`**, success, published `v1.13.1`, `latest` and `sha-8da392c` to one digest **`sha256:eaea465778003c00339400b1692751f08ea81e76412fb074f08793d77d91eaad`**, verified against the registry by the run. GitHub release **`v1.13.1`** created from `docs/RELEASE_NOTES_v1.13.1.md`, marked **Latest**.

**One wrinkle worth knowing:** the tag's *first* Publish run (`38637469174`) failed at the "Push the verified image" step after build, login, upgrade smoke and image smoke had all passed — a transient push failure, with nothing published and no release created. `gh run rerun` refused that run and `gh workflow run` was refused by the sandbox token (403, no `actions:write`), so the tag was deleted and re-pushed to the **same commit** with the same annotated message; the fresh run succeeded. Job logs are still unreachable here (SANDBOX entry 15) — the failure was read from check-run annotations, which named only a step line.

# v1.13.0 release — Supplier schedule links, in-place Recurring search, and remembered cancelled schedule visibility (2026-10-14)

Released as **`v1.13.0`** (`APP_RELEASE_STAGE = 'stable'`; moves `latest` on `ghcr.io/dougalbob/simple-finance-multi-household`, host port `3009`; GitHub release marked Latest). Release PR: the same PR as the feature work (#36), merged at `744257f08dd46d3d5b78ae6b2cb95ffb8a142b7f`. CI run on main `38611992298`, Publish run `38613387507`, GHCR digest `sha256:87366f8d165939d558234e605fe97e25830e510b7b7bd13b888de5801d356274`. No schema change, no migration.

1. **#34 — Supplier card links to schedule & in-place Recurring search** (decision 215). In the Supplier card below Address, connected recurring schedules display as `Linked to schedule "<Schedule Name>"` with deep links to `/recurring?q=<name>#schedule-<id>`, or `No scheduled payments relate to this supplier currently` when unlinked. On Recurring, an instant search filter with Clear button filters schedules by schedule or supplier name. Matching schedules are displayed even if cancelled and cancelled schedules are hidden.
2. **#35 — Recurring remembers hidden cancelled schedules setting across navigations** (decision 214). The hide-cancelled setting is stored in device cookie `sf_hide_cancelled_schedules` (max-age 1 year, path `/`, SameSite `lax`), matching `sf_theme`. Navigating away from `/recurring` and back without query params maintains the user's hidden/shown preference. Explicit `?hideCancelled=1` or `0` in URL takes precedence and updates the cookie.

Version files bumped together: `package.json`, `package-lock.json` (root and `packages[""]`), `src/lib/version.ts`, `simple-finance-multi-household.xml`, `docs/RELEASE_NOTES_v1.13.0.md`.

Gates run locally: `npm run format:check` clean; `npm run typecheck` clean; `npm test` 922 passed, 0 failed across 213 suites; `npm run build` clean. Browser tests verified locally with Chromium (2 passed in `e2e/recurring-hide-cancelled.spec.ts`).

Next session: evaluate remaining open issue #33 (edit pot-to-pot transfers on Accounts, Pots & Checkpoints page).

# v1.12.0 release — Hide cancelled schedules, and purchase links that land in view (2026-10-14)

Released as **`v1.12.0`** (`APP_RELEASE_STAGE = 'stable'`; moves `latest` on `ghcr.io/dougalbob/simple-finance-multi-household`, host port `3009`; GitHub release marked Latest). Release PR: the same PR as the feature work (#32), merged at `5825636aa100a831f8a79e2943cd35b457c749b8`. CI run on main `38596779262`, Publish run `38596810147`. No schema change, no migration.

1. **#28 — Recurring: hide cancelled schedules** (decision 212). `?hideCancelled=1` on `/recurring`; the Hide/Show cancelled link appears beside the Schedules heading only when a cancelled schedule exists; `N hidden` badge while hiding; calendar Prev/Today/Next keep the choice; an all-hidden list says so. Pure helper `src/lib/records/schedule-visibility.ts` (unit tests in `tests/schedule-visibility.test.ts`).
2. **#30 — All Transactions source link lands under the sticky header** (decision 213). The Purchases row carries `scroll-mt-24`; `e2e/transactions.spec.ts` asserts the row sits below the header.

Version files bumped together: `package.json`, `package-lock.json` (root and `packages[""]`), `src/lib/version.ts`, `simple-finance-multi-household.xml`, `docs/RELEASE_NOTES_v1.12.0.md`.

Gates run locally: `npm run format:check` clean; `npm run typecheck` clean; `npm test` 912 passed, 0 failed across 211 suites; `npm run build` clean.

# v1.11.0 release — Honest personal spending, steadier month paging, a gentler honesty loop (2026-10-14)

Released on branch `arena/bddeb52c-simple-finance-multi-household` as **`v1.11.0`** (`APP_RELEASE_STAGE = 'stable'`; moves `latest` on `ghcr.io/dougalbob/simple-finance-multi-household`, host port `3009`; GitHub release marked Latest). No schema change, no migration.

The household had five open issues (#25, #26, #27, #28, #30) and asked the agent to pick a slice that fits together. Agreed with them: **#25 + #26 + #27** this release ("honest personal spending"); **#28 + #30 deferred** as the natural follow-up slice ("Recurring & Transactions list polish").

1. **#25 — Chart C counts every line marked for a person, whatever its category** (decision 209, SPEC §16.7 C): `personalSpendSeries` no longer pre-filters by `parentNames` — a `person:{id}` key counts wherever its line sits, only `household` keeps the discretionary scope. `getPersonalChartView` passes all window lines to the engine (the old view-level `.filter()` would have silently re-imposed the lifted scope). Person drill-downs drop `categoryIds`; household keeps `parentCategoryIds`; caption and `/example` reflection rewritten. New test runs panel 2's `personalSpending` over the chart's lines and demands September's person cells match. #25's direction was agreed in decision 208; decision 154 stands (attribution rule unchanged, scope widened for person series only).
2. **#26 — By Person Prev/Next keep the panel in view** (decision 210): both links go through `insightsHref` with the `panel-persons-heading` anchor (drills dropped, as before). `scroll-mt-24` sits on the `h2` itself, not the section — scroll-margin only clears the sticky header on the element actually scrolled to. E2E asserts the anchor, the in-view landing, and the heading clearing the header's bottom edge.
3. **#27 — the honesty loop reads −15%…+10% as normal life** (decision 211, SPEC §16 item 4): new `honestyBand` / `honestyDriftPercent` in `insights.ts`; band edges test the EXACT ratio (+10.4% is already above though it shows as "10% over"); null drift has no band; zero configured takes no percentage. Only above-tolerance warns. E2E asserts the seeded groceries verdict reads outside the band with a percent (robustly above +10% on any weekday — only the in-progress week can move under other specs, and the average never sees it).

Gates run locally before the PR: `npm run typecheck` clean; `npm run format:check` clean; `npm run themes:check` clean; `npm test` **906 passed, 0 failed across 208 suites** (reworked chart-series personal block, extended charts-view.test.ts with the panel-2 agreement test, new honesty-band cases); `npm run build` clean; `npm audit --omit=dev` 0 vulnerabilities. Browser specs were written but **not run locally**: this sandbox has no browser and the Playwright CDN is unreachable (`npx playwright install chromium` fails), so CI's `browser` job is the browser evidence — do not treat it as optional on this PR.

Watch out for: **this sandbox's `npm install` runs `node-gyp rebuild` for better-sqlite3 and fails** (nodejs.org headers unreachable); harmless, because better-sqlite3 v13 ships N-API prebuilds — `npm install --ignore-scripts` plus the shipped `prebuilds/linux-x64.node` is enough, verified with a `:memory:` open. **Re-run `npm test` after the version bump** (contract test needs all five docs + release notes on the new tag — done here, green). The edit tool occasionally reports success without applying when two edits to one file are batched: every batched edit in this session was re-verified with `git diff`, and three had to be re-applied solo. Merge SHA, check runs, Publish run and digest are to be recorded by the next session from `gh` (the merge closes this session).

# v1.10.0 release — Striped transactions, and the spending mix shows where the money went (2026-10-14)

Released on branch `arena/75d5a4f4-simple-finance-multi-household` as **`v1.10.0`** (`APP_RELEASE_STAGE = 'stable'`; moves `latest` on `ghcr.io/dougalbob/simple-finance-multi-household`, host port `3009`; GitHub release marked Latest). No schema change, no migration.

The household filed three GitHub issues (#23, #24, #25) and asked the agent to pick a manageable slice. Agreed with them: **#23 + #24** this release (presentation only); **#25 deferred** because it changes what Chart C measures.

1. **#23 — alternating rows on All Transactions** (`src/app/transactions/page.tsx`): movement rows alternate `bg-canvas`; checkpoint dividers don't take a turn (`stripeIndex`). Same treatment as decisions 205/206.
2. **#24 — Chart E is "Where the money went"** (decision 208, SPEC §16.7 E):
   - Title renamed; both pickers `max` = today; server refuses a start after today and clamps an end after today (with a notice).
   - Quick windows: **Since last payday** (default, latest payday → today) · **Last full payday cycle** (previous payday → day before latest) · **Month to date** (1st → today). `MixWindowKind` values unchanged.
   - **Why the household never saw the previous-cycle button:** windows were bracketed by *recorded* salary instances only, and their salary schedule is recent. New `cadenceDatesOnOrBefore` (`schedules.ts`, pure, ignores `activeFrom`) + `recentPaydayDates` (`money-view.ts`, recorded first, cadence fills the gap, 14-day minimum gap) fix it.
   - **Pickers follow the buttons:** the date inputs are uncontrolled; after a hand edit the browser's dirty-value flag stops them following `defaultValue` across a soft navigation. Both inputs are now keyed on `from:to`. The e2e spec edits the pickers first; it fails without the key and passes with it.
3. **#25 — agreed direction for the next session** (household answer, 2026-10-14): Chart C's person series should count **every line whose "For" is that person, whatever the parent category**; the **Household series keeps its current scope** (household-marked lines under Personal and Entertainment & Eating Out only). `personalSpendSeries` filters by `parentNames` for every series today; the drill-down links (`hrefFor` in `renderPersonal`) pass `parentCategoryIds` and will need to drop the category filter for person segments; SPEC §16.7 C and decision 154 need updating. Check the caption ("Scope: …") and `/insights` panel 2 for agreement.

Gates run locally before the PR: `npm run typecheck` clean; `npm run format:check` clean; `npm run themes:check` clean; `npm test` **902 passed, 0 failed across 208 suites** (new `tests/payday-windows.test.ts`, extended `tests/spending-mix-view.test.ts`); `npm run build` clean; `npm audit --omit=dev` 0 vulnerabilities. Browser (SANDBOX entry 8 recipe): `transactions` + `charts` projects **16/16**. Local full suite 118/129: all 11 failures were entry-17 server loss after the admin registry-restore test, and all 11 passed when rerun. CI `browser` passed on the PR's first commit (`f644211`).

Watch out for: **re-run `npm test` after the version bump.** `tests/multi-household-isolation-contract.test.ts` requires AGENTS.md, README.md, docs/HANDOFF.md, docs/RELEASE_PROCESS.md **and docs/MULTI_HOUSEHOLD_PLAN.md** to name the current tag; this release's first CI `gates` run failed because MULTI_HOUSEHOLD_PLAN.md still said v1.9.0 (the local full run had happened before the bump). Also: the `caret-color: transparent` hydration warning in the dev-server log during the charts pixel test is Playwright's screenshot caret hiding, pre-existing and harmless. Merge SHA, check runs, Publish run and digest are to be recorded by the next session from `gh` (the merge closes this session).

# v1.9.0 release — Granular Spending Mix category tree selector & Contracts & Renewals stable promotion (2026-10-14)

Released on branch `arena/9001fee2-simple-finance-multi-household` as **`v1.9.0`** (`APP_RELEASE_STAGE = 'stable'`; moves `latest` on `ghcr.io/dougalbob/simple-finance-multi-household` on host port `3009` and marks the GitHub release Latest):

1. **Granular parent/child category tree selector on Chart E (`E · Spending mix — Where the money goes`, decision 207):**
   - `MixCategoryTree` (`src/components/charts/mix-category-tree.tsx`) renders the category selector starting collapsed with just parent categories and a compact drop-down arrow beside each parent.
   - Expanding a parent reveals its indented child categories (`ml-2 border-l border-border-strong pl-3`). Ticking or unticking a parent toggles all of its children; partial child selection displays the parent checkbox's `indeterminate` state plus a `(ticked/total)` badge.
   - `spendingMix` (`src/lib/records/spending-mix.ts`) and `getSpendingMixView` (`src/lib/records/charts-view.ts`) filter by `includedCategoryIds` alongside `includedParentIds`, keeping slices grouped by parent category (and `Personal` split per person/household) while summing only the ticked child categories.
2. **Contracts & Renewals (`v1.8.0-rc.1`) signed off in the field and promoted to stable in `v1.9.0`.**
3. **Batched unit test runner (`scripts/run-tests.mjs`, `docs/SANDBOX.md` entry 21):**
   - Running all ~100 test files in a single `node --import tsx --test` invocation caused an out-of-memory warning in the Arena sandbox. `npm test` now invokes `node scripts/run-tests.mjs`, running the suite in 5 sequential batches of 20 files with `--test-concurrency=2` so each child process exits and reclaims memory between batches. During iterative development, prefer running targeted test files (`npx tsx --test tests/<file>.test.ts`).

Gates run locally before PR: `npm run typecheck` clean; `npm run format:check` clean; `npm run themes:check` clean; `npm test` (batched via `scripts/run-tests.mjs`) **885 passed, 0 failed across 204 suites**; `npm run build` clean; `npm audit --omit=dev` **0 vulnerabilities**. See `docs/RELEASE_NOTES_v1.9.0.md`.

# v1.8.0-rc.1 candidate — Contracts & Renewals redesign (2026-10-13)

The release PR is **#21** (`Release candidate v1.8.0-rc.1: Contracts & Renewals`) on the assigned Arena branch `arena/71f43cea-simple-finance-multi-household`. It carries both commits prepared in #20 plus the fix the failing `browser` job needed: the register's "For" picker is addressed by role and accessible name (`combobox`, `For`) because Playwright reads a wrapping `<label>`'s option text, so the exact label match could never succeed. This is an acceptance candidate, not a stable release: `v1.7.0` remains the accepted stable version and `latest` must not move. The candidate adds the explicit insurance/service/other agreement register, separate renewal and fee-free switch dates, independent provider auto-renew and app reminder settings, additive tenant migrations, and agreement-aware key-date prompts. The exact merge SHA, required check run IDs, Publish run, and verified image digest are to be appended here after successful publication; use `docs/RELEASE_NOTES_v1.8.0-rc.1.md` for candidate testing instructions.

# v1.7.0 release — Recurring page session (2026-10-13)

Four household requests on `/recurring`, released as **`v1.7.0`** (stable; moves `latest`):

1. **Cancel moved inside the Edit disclosure** — one expand reveals edit fields and the cancel controls together, instead of a separate always-visible block outside.
2. **Double-confirmation before cancelling** — first press reveals the warning and effective-date picker; second press (labelled "Yes, cancel it") is required to submit; a "Keep schedule" escape is always shown.
3. **Restore a cancelled schedule** with an explicit back-fill warning: cancelled schedules stay in the list (red "Cancelled" badge, strikethrough name), disclosure label changes to "Schedule options", and Restore only submits once the user ticks the "I understand" checkbox confirming missed dates will be back-filled (same decision-162 mechanic as moving `activeFrom` earlier). Domain function `restoreSchedule` clears `cancelled_at`/`cancelled_effective_on`, bumps version, records a `schedule.restore` audit entry, and resyncs instances with back-fill; `restoreScheduleAction` wires the server action.
4. **Trimmed "Active from" copy** — the redundant "real direct debit / standing order / receipt entry rather than a hand-typed purchase … it never merges with yours" passage removed; essentials kept.
5. **Alternating Schedules rows** (`bg-canvas` on odd rows), matching decision 205's striped Purchases rows.

Decision **206** logged for this release.

Gates run locally: typecheck clean; `npm test` **879 tests / 202 suites, 0 failures**; format clean; themes check clean; production build is replayed by the CI Docker job. Browser: desktop/mobile flows verified by hand against the local dev server; CI's `browser` job is the gate.

# v1.6.0 release — Purchases page session (2026-10-13)

Four household requests on `/purchases`, released as **`v1.6.0`** (stable; moves `latest`):

1. **Show toggles, not "only" filters** (decision 205): Purchases / From schedule / Refunds / Voided,
   all on by default (voided records now show by default); unticking hides that kind. See decision 205
   for the hidden-`0` form trick and the legacy `…Only` deep-link compatibility.
2. **Two-row line editor**: Spent for | Amount, then Category full-width (Which when needed), shorter
   (`py-1`) controls, wider edit panel on Purchases.
3. **Alternating rows**: odd Purchases rows use `bg-canvas`.
4. **Supplier name is a link** to the already-existing expanded supplier card (`supplierCardHref`).

Gates run locally: typecheck clean; `npm test` **879 tests / 202 suites, 0 failures** (one new
show-toggle suite). Browser: desktop spec's purchases-filter/edit and void cases pass locally via the SANDBOX entry 8 recipe (2/2); full suite to be confirmed in CI.

# Current handoff — v1.5.0 release: links that look like links, one attach control, and the chart bars that were never drawn (2026-10-12)

## v1.5.0 delivery status (before merge)

- Release PR **#17**: <https://github.com/dougalbob/simple-finance-multi-household/pull/17>.
- Initial PR CI run `38294560184`: Gates and Docker passed; Browser acceptance reported **125 passed,
  1 failed**. Decision 204 had dropped the file-kind accessible name and the payslip spec still pressed
  the old second button. Both were fixed before release: the input keeps the visible action **and** its
  file-kind hint, and the payslip spec checks auto-upload and the hidden no-JavaScript button.
- Final review also caught `sf-link-arrow`'s hover-only underline; it is now permanently underlined,
  just like `sf-link`. New browser checks cover all three reported sites before hover at 393px and
  1400px (**2/2 passed**).
- Focused final browser run: **17/17 passed** (attachments 3, income 5, charts 9). A wider sandbox run
  completed 116 tests before losing the dev server during registry-restore compilation (the existing
  limit in `docs/SANDBOX.md` entry 17); all ten affected tests passed when rerun against a managed server.
  Do not call that interrupted run a full green suite; the complete seeded and empty-household suites
  must pass in CI before merge and again on the merge commit before tagging.
- The final correction repeated types, all **878 unit tests / 201 suites**, format, theme freshness,
  production build and production audit (0 vulnerabilities) successfully.
- At this point no `v1.5.0` tag or image has been published. After delivery, record the final PR/main
  checks, merge SHA, annotated tag object, Publish run and verified release digest here (§7).

## v1.4.0 post-merge facts (recorded per `docs/RELEASE_PROCESS.md` §7)

- **v1.4.0 — Three months, line items and the months chart** released 2026-10-12; release PR **#16**,
  merged to `main` with a merge commit: **`94e27beb89e300ca13e91d8de6bdadaf2abf97c7`** (short `94e27be`).
- Annotated lower-case tag **`v1.4.0`** (object `3f2d8f31866f06de2ed7f0c9ffdb8f704a9306bb`) on `94e27be`.
- Publish run **`38281961050`** succeeded (job `114921115034`, "Build, smoke test and push the release
  image"). The GitHub release `v1.4.0` was published 2026-10-12T17:08:52Z, is **Latest** and is not a
  pre-release.
- Digest **`sha256:05b8c33f65e07a4f096aff952692189ec054f8c31de66d3c58d81e60ca5db57c`**, shared by `v1.4.0`,
  `latest` and `sha-94e27be`, as printed by the Publish run's own registry check.
- Known redness at that tree: none — `main` was green when this session started.

## What this release is (v1.5.0)

The three changes the household asked for in one session:

1. **Links look like links** — the familiar blue and permanently underlined, everywhere, in every theme
   (SPEC §15.4, decision 203). The trigger was the household finding links by accident: the Schedules
   card's "Supplier card", the "… →" links and Horizon's day-by-day amounts.
2. **One control on attachments, not two** — "Attach receipt" opens the picker and choosing a file uploads
   it; no button to press first, for all three owner kinds (SPEC §23.1, decision 204).
3. **The chart hatch fix** — in-progress bars were unpainted on any screen ≥1024px (Groceries since
   v0.14.0, the months chart since v1.4.0) because two figures shared one SVG pattern id; each drawing now
   namespaces its ids and a muted bar is two rects, with a pixel test to keep it true (SPEC §16.7,
   decision 202).

## What a future session should know (v1.5.0)

- **A link is one token and two utilities.** `--color-link` in `src/app/globals.css` (base block
  `#1d4ed8`) is re-lit per theme by `scripts/themes/derive.ts` — hue and chroma fixed, lightness moved
  until `CONTRAST_RULES` are met — giving `#2352cf` light and `#8aafff` dark in the generated file. Use
  `className="sf-link"` for an ordinary link and `sf-link-arrow` for a link that is its own call to action
  (retaining the arrow and weight; always underlined too). **Do not** reintroduce `text-accent hover:underline` for a
  link: the theme generator now measures the link separately from `accent`, and a new link style would
  bypass those floors. Text that is a button or a toggle keeps its own underline and does not become blue.
- **The attachment form has one control by construction.** `src/components/attachment-form.tsx`: the file
  input is `peer sr-only` with `onChange` → `requestSubmit()`, the visible control is the `<label
  htmlFor>` styled as the button, and a `<button type="submit" hidden={jsReady}>` is the no-JS path only.
  Do not add a second visible submit control — the household's whole complaint was the button with nothing
  behind it. The effect keyed on `state` clearing the input is what lets a rejected file be re-chosen.
- **Chart ids are per drawing.** `BarChart` and `GroupedBarChart` take a required `idPrefix`, and
  `/charts` passes the variant (`chart-hatch-groceries-${variant}`, …). A new chart figure **must** do the
  same: an SVG `id` is document-global, and `url(#…)` resolving into the hidden figure paints nothing at
  all. An in-progress (muted) bar is deliberately two rects (muted base + hatch overlay) so it degrades to
  a solid bar rather than vanishing.
- **Pixel assertions exist now.** `e2e/pixels.ts` is a small PNG decoder (`node:zlib`, no dependency) and
  `e2e/charts.spec.ts` uses it to require paint inside every in-progress bar's box, after first asserting
  no pattern id is shared across figures. Read `docs/SANDBOX.md` **entry 20** before writing another pixel
  test: element and clipped screenshots come back unpainted in this sandbox, so take a **full-page**
  screenshot, keep boxes in page coordinates, and scale by `window.innerWidth`.
- **`filter({ has })` resolves its inner locator relative to each candidate.** Use
  `row.locator('form:has(input[type="file"])')` when the anchor (the row) is the ancestor of the form.
- **The version-doc coupling is still real**: `tests/multi-household-isolation-contract.test.ts` requires
  AGENTS.md, README.md, docs/HANDOFF.md, docs/RELEASE_PROCESS.md and docs/MULTI_HOUSEHOLD_PLAN.md to name
  the current tag literally, plus `docs/RELEASE_NOTES_<tag>.md` to exist with its exact title. Bump the
  five docs in the same commit as the version, or `npm test` goes red.
- **Preserve the registry on upgrades.** This release's notes correct the inherited pre-v1
  "delete `system/`" paragraph in older notes: it is not a multi-household upgrade path. Back up the
  household, registry and `.env` separately; leave all existing data intact. Original single-household
  data needs its own approved import and must never be mounted here.
- **Release mechanics unchanged** (`docs/RELEASE_PROCESS.md` §7): one PR/merge, one release per session;
  lowercase annotated tag on the merge commit; never squash; never touch
  `ghcr.io/dougalbob/simple-finance`; the README's pinned digest is refreshed after publish.

## Why this session exists

Three things the household reported, with a fourth handed over:

- Links were not obviously links. The household chose **blue + always underlined** over keeping the theme
  accent hue and over a hover-only underline.
- On `/purchases` the "Attach receipt" button appeared before a file was chosen, and the natural gesture
  was to press it — nothing happened. The household wanted one control, not two. (An earlier sketch — a
  label that said "Choose file" and then named the file — was superseded before implementation; the built
  answer is the label-as-button.)
- A diagnosis note from the v1.4.0 session: the hatched in-progress bars were invisible on laptop/desktop
  because both figures of each chart defined the same pattern id. Fix it, degrade honestly, and add the
  pixel proof.
- Cut the release (v1.5.0, minor) as usual: the agent owns the PR, merge, tag and publish.

## What this session did

- **Link treatment** (decision 203): `--color-link` added to the base token block and to
  `scripts/themes/derive.ts` (light + dark builds, `CONTRAST_RULES` split from `accent`); `themes.generated.css`
  regenerated (all 28 themes); `sf-link` / `sf-link-arrow` `@utility` rules in `globals.css`; **119 link
  sites** converted across ~31 files (the audit swept `<Link`/`<a>` with context, including the four the
  household named); `tests/themes.test.ts` gained the `'link vs ink'` distinctness group and re-measures
  the shipped stylesheet.
- **Attachment single control** (decision 204): `src/components/attachment-form.tsx` restructured as above;
  `e2e/attachments.spec.ts` now drives the real gesture (click the label → take the browser's file chooser
  → set the file), asserts the no-JS button is present but hidden, and scopes that to the attachment form.
- **Chart hatch fix** (decision 202): `idPrefix` threaded through `bar-chart.tsx` and
  `grouped-bar-chart.tsx` into every pattern id, with the four `/charts` call sites passing the variant;
  muted bars drawn as muted base + hatch overlay; `e2e/charts.spec.ts` gained the structural + pixel case;
  new `e2e/pixels.ts`.
- **Docs/version**: SPEC §15.4 (link treatment, token count 74), §16.7 (two figures, two id sets), §23.1
  (one control); plan decisions 202–204; `docs/SANDBOX.md` entry 20 (element screenshots unpainted);
  version 1.5.0 across `package.json`, `package-lock.json`, `src/lib/version.ts` and the Unraid template;
  `docs/RELEASE_NOTES_v1.5.0.md`; and every agent entry point naming `v1.5.0`.

## Gates run locally before the PR

- `npx tsc --noEmit` — clean.
- `npm test` — **878 tests / 201 suites, 0 failures** (the multi-household isolation contract included).
- `npm run format:check` — clean (the sweep's files were reformatted with `npm run format`).
- `npm run themes:check` — "themes are up to date".
- `next build` — clean (replayed per `docs/SANDBOX.md` entry 18; `next-env.d.ts` reverted).
- Browser suite via the `@sparticuz/chromium` recipe (entry 8, overlay `playwright.local.config.ts`):
  the **charts** project 9/9 (including the new paint case) and the **attachments** project 3/3, against a
  hand-started `node --import tsx scripts/e2e-server.mts` on port 3100. The pixel case was also proved to
  bite: with the fix temporarily un-namespaced, it named all four unpainted bars.
- `npm audit --omit=dev` — 0 vulnerabilities.

# Historical handoff — v1.4.0 release: three months, line-item drill-downs and the months chart (2026-10-12)

## v1.3.0 post-merge facts (recorded per `docs/RELEASE_PROCESS.md` §7)

- **v1.3.0 — The worked example** released 2026-10-11; annotated tag `v1.3.0` on merge commit
  `c22c721`; it moved `latest` and is GitHub's Latest release (this handoff's release follows it).
- Known redness at that tree: `npm run format:check` fails on three files the release changed without
  running `npm run format` — `scripts/seed-example-household.mts`, `src/app/example/page.tsx`,
  `src/lib/demo/household.ts`. This release fixes them; the test suite was never affected.
- The preview seed script v1.3.0 advertised (`scripts/seed-example-household.mts`) could not run at
  all (`require` in an ESM module, plus a placeholder household-id call that threw before its own
  override). Repaired here (decision 200) and used to seed this release's preview.

## What this release is (v1.4.0)

Four Insights features the household asked for, plus keeping CI green:

1. **The month comparison shows three months side by side** — oldest first, each month after the
   first with its change against the month before (SPEC §16.1, decision 197).
2. **Every Insights figure opens its line items inline** — on the comparison card, the by-person
   card and the vehicle running costs; the open state is a real `?show=…` link (decision 198).
3. **A new `/charts` figure: three months by category** — grouped bars per parent, one per month,
   with an **Exclude Housing** toggle (SPEC §16.7 F, decision 199).
4. **Process fixes** — the prettier failures above, the version-doc drift that red-lined the
   isolation contract after v1.3.0, and the seed script (decision 200).

## What a future session should know (v1.4.0)

- **One read feeds the three-month views.** `getMonthComparisonView` (insights-view.ts) is the
  source of truth; `getCategoryMonthsView` (charts-view.ts) derives the chart from it, so the
  drawing and the tables cannot drift. `compareCalendarMonths` takes `{ months: n }` (default 3).
  Don't extend either view independently — extend the engine.
- **Drill keys are a closed grammar** (`src/lib/records/insights-drill.ts`): `m:<YYYY-MM>[:parent]`,
  `p:<personId>:<YYYY-MM>[:parent]`, `v:<vehicleId>:<month|previous|rolling>[:child]`; anything
  malformed is rejected whole (never partially parsed). A card drills only the months it displays.
- **Vehicle drill rows are spread-aware**: an annual premium contributes its ÷ 12 share to a month
  and each in-window ÷ 12 share to the rolling window, with the full payment footnoted on the row,
  so rows add up to the figure being opened. Window bounds are asserted in
  `tests/insights-drill.test.ts` (month = the full local month; rolling = from the 1st, 11 months
  back, through today).
- **`e2e/charts.spec.ts`'s generic loop now includes the `months` figure** (bar links must equal
  table links in order — keep the table twin's cells in months order when touching it), plus a
  months case for the sideways scroll, the hover hints and the arrows. For a scrollable figure the
  loop's width assertion checks the `[data-chart-scroll]` frame, not the SVG (decision 201).
- **`ChartScroller` is the pages' one hydrated client component** (decision 201): arrows + desktop
  drag over native `overflow-x` scrolling; touch is never handled in JS. The `abbrevCategory` rule
  ("Grocer'", "Person'", "Vehicle'") lives in `src/components/charts/abbrev.ts` with its own tests.
- **The version-doc coupling is real**: `tests/multi-household-isolation-contract.test.ts` requires
  every one of AGENTS.md, README.md, docs/HANDOFF.md, docs/RELEASE_PROCESS.md and
  docs/MULTI_HOUSEHOLD_PLAN.md to literally name the current release tag, plus
  `docs/RELEASE_NOTES_<tag>.md` to exist with its exact title. The v1.3.0 release missed this and
  main sat red until this release. Bump the five docs in the same PR as the version.
- **Sandbox constraints** (see `docs/SANDBOX.md`, append-only): `npm ci --ignore-scripts`;
  Playwright runs via the `@sparticuz/chromium` recipe in entry 8; one `next dev` per directory
  (entry 12); unpushed commits die with the sandbox (entry 10) — push after every step; the fuzzy
  edit tool can mangle large files (entry 11) — diff after every edit.
- **Release mechanics unchanged** (`docs/RELEASE_PROCESS.md` §7): one PR/merge, one release per
  session; lowercase annotated tag on the merge commit; never squash; never touch
  `ghcr.io/dougalbob/simple-finance`; refresh the README's pinned image digest after publish.

## Why this session exists

The household sketched the month comparison as `Category | August 2026 | September 2026 Change |
October 2026 Change` and asked for: the purchases behind any monthly total to open inline ("click on
£197.66 and see the three October purchases"), the same drill on the by-person and vehicle cards, a
grouped bar chart of the same three months per parent category with a button to exclude Housing
(about 35% of their spend), and CI kept green — including the prettier failures and the docs
coupling that the previous release left behind.

## What this session did

- **Engine** (`src/lib/records/insights.ts`): `compareCalendarMonths` generalized to N months
  (`months?`, default 3), returning `months: MonthColumn[]` with per-row `amountsPence[]` and
  `deltasPence[]` (the oldest column's delta is null). Spread/vehicle math unchanged.
- **New `src/lib/records/insights-drill.ts`**: the key grammar above plus `drillMonth`,
  `drillPerson`, `drillVehicle` and `vehicleDrillWindow` (pure; assemble tables from the `lines`
  the views already carried).
- **`src/app/insights/page.tsx`**: the comparison card is a three-month table (month, change —
  change columns for months 2 and 3 only) with every figure a `?show=…#…-drill` link; person and
  vehicle figures likewise; drill tables render inline as the pie's line items do (decision 195)
  and close via the same link. `/example`'s reflection follows the new shape.
- **New `src/components/charts/grouped-bar-chart.tsx`** and `getCategoryMonthsView` (charts-view.ts
  F): the `/charts` months figure with the `?noHousing=1#months` toggle, hatched "(so far)" month,
  per-bar purchases links, table twin and totals row.
- **Tests**: `tests/insights.test.ts` (three-month shape), new `tests/insights-drill.test.ts`
  (10 cases), `tests/insights-view.test.ts` (drill reconciliation), `tests/charts-view.test.ts`
  (chart equals the Insights comparison; exclusion removes Housing alone).
- **Docs/version**: SPEC §16.1/§16.7, plan decisions 197–200, version 1.4.0 across the
  version-bearing files, `docs/RELEASE_NOTES_v1.4.0.md`, and every agent entry point naming the
  release (the coupling the isolation contract enforces).

## Gates run locally before the PR

- `npx tsc --noEmit` — clean.
- `npm test` — the full suite green (see the PR for the final counts; the baseline was 874 with
  only the docs-coupling failure).
- `npm run format:check` — clean (the three v1.3.0 files are reformatted).
- `next build` and the container smoke — replayed per `docs/SANDBOX.md` entry 18.
- Browser suite via the `@sparticuz/chromium` recipe (SANDBOX entry 8): the charts (now including
  the months figure), insights and desktop specs.
- `npm audit --omit=dev` — 0 vulnerabilities.

# Historical handoff — v1.2.0 release: the guide and "what this page needs first" (Slice 2) (2026-10-11)

**Session branch:** `arena/90c66748-simple-finance-multi-household`.

## v1.1.0 — verified post-merge facts (recorded per `docs/RELEASE_PROCESS.md` §7)

- Release PR **#13** (`Release v1.1.0: first-run onboarding`), merged to `main` with a merge commit: **`9ea4900cf65160dfa0e568a7899e334bc87f91ba`** at 2026-10-11T15:20:40Z.
- CI on the merge commit, all success: `Gates (format, types, tests, build, audit)` check run `114503911982`; `Browser acceptance (Playwright)` `114503911817`; `Docker image build + entrypoint smoke` `114503911978`.
- Annotated lower-case tag **`v1.1.0`** (tag object `1109662ec01198395498de61691f0267a3842a53`) on `9ea4900`.
- Publish run **`38151241573`** succeeded: check run `114504976895` (`Build, smoke test and push the release image`). The GitHub release `v1.1.0` was published 2026-10-11T15:28:53Z, is **Latest** and is not a pre-release.
- Digest **`sha256:fc5a269289ac4095c72b770809a8d516c0e0fe8fe9b52fabbaaa64390788e2f5`**, shared by `v1.1.0`, `latest` and `sha-9ea4900`, as printed by the Publish run's own registry check.

## What this release is (v1.2.0)

Slice 2 of `docs/ONBOARDING_PLAN.md`, per the household's decisions on 2026-10-11:

- **`/guide` — "How this app thinks"** (`src/app/guide/page.tsx`, copy in `src/lib/guide.ts`): eight anchored sections (`#checkpoint`, `#income`, `#transfers`, `#borrowing`, `#schedules`, `#projection`, `#noticed`, `#never`). Reached from the footer and from the review rhythm on `/start`, and from the in-page links. It is **not** a navigation entry (the household chose the footer and contextual links). Every section keeps its rule; `tests/guide.test.ts` pins the load-bearing phrases.
- **"What this page needs first"** (`src/lib/records/page-needs.ts`, `src/components/needs-first.tsx`) on the four payoff pages. Each need is a setup-path step that is not `done`, so it cannot disagree with the records and closes everywhere when the record exists. Home's locked projection card, Horizon's no-checkpoint block and the Charts forecast show the needs inline; the four reported Charts, and the month comparison and honesty loop on Insights, are replaced by one block while nothing is recorded. Optional steps (cards, renewals) and Phase B bills are never needs. A checkpoint need is hidden while the pots need is open.
- **Inline links to the guide** on the payoff pages and in the Insights, home and Horizon prose.
- **Navigation decision (plan §7 item 5), recorded:** `/start` keeps its navigation entry permanently ("Keep it always"). The home card is still the only element that unmounts.
- **Two-month seed (docs change only, as the household asked):** the Slice 3 worked example is to span two calendar months, so the month-on-month comparison is visible to new users. No seed code changed in this release.

### Gates run locally before the PR

- `npm run typecheck` clean; `npm run format:check` clean.
- `npm test`: **857 passed, 0 failed** (842 before; 15 new in `tests/guide.test.ts` and `tests/page-needs.test.ts`).
- Browser, via the SANDBOX entry 8 recipe (`@sparticuz/chromium`, throwaway overlay deleted before commit): the first-run suite (`E2E_FRESH=1`) **3 of 3**, including the new needs and guide assertion; the seeded projects that render the changed pages (`mobile`, `desktop`, `charts`, `horizon`, `insights`, `bell`, `payday-summary`) **64 of 64**. The full seeded suite was not re-run here; CI's `browser` job is the gate.

## What a future session should know (v1.2.0)

1. **Slice 3 is the last onboarding slice**: the worked example (`/example`) rendered from `src/lib/demo/household.ts` through the real engines, with the isolated-root seeding script and the E2E seed moved onto the shared module. Per the household's decision it covers **two calendar months** (so the Insights month-on-month comparison and the Charts month views have real history). It must never write into a household database.
2. A need is derived from the setup path. If you add a payoff figure that reads a new record, add its prerequisite to `PAGE_PREREQUISITES` and copy to `NEED_COPY` in `page-needs.ts`; the unit tests walk every page.
3. The guide's copy describes built behaviour. If a rule changes (for example the BAC, transfer or borrowing rules), change the section and its pinned phrase in `tests/guide.test.ts` in the same PR.
4. The guide and the needs blocks were proven in headless Chromium only; the household's own phone is still the test.

## Why this session exists

The household asked for something that works on a **brand-new household**: a tour is impossible
because there is nothing to point at, yet the app has a lot of surface for a first-time user. The
session measured the actual first-run state on an empty data root, wrote
[`docs/ONBOARDING_PLAN.md`](ONBOARDING_PLAN.md), and asked for decisions rather than assuming them.

**Decisions taken by the household (2026-10-11):** build **Slice 1 only** for now; Phase A is a
**`/start` hub with short inline fields**, not a full-screen wizard that duplicates forms; the later
worked example (Slice 3) is to be **rendered from the real engines off a shared fictional household**,
not written as prose that drifts. Slices 2 and 3 are approved in direction and not built.

## What this session did

1. **Measured the empty household, then wrote the proposal**: `docs/ONBOARDING_PLAN.md` (three layers,
   Phase A/B steps, delivery slices, the wrong `/transactions` signpost, the seven unlinked
   "Create a pot first…" messages, the unlinked `/horizon` prose, and the no-pots till).
2. **Built Slice 1** (the whole change set is in this release PR):
   - `src/lib/records/setup-path.ts` — the derivation. Eight steps
     (`people, pots, checkpoints, income, bills, figures, cards, purchases`) read from the household's
     own records; Phase A is "your first projection", Phase B follows at your pace; `cards` is
     optional and never counted; nothing is stored, nothing is ticked by hand, nothing is gated.
     `getSetupFormData` supplies the inline fields. Unit-tested in `tests/setup-path.test.ts`.
   - `src/app/start/page.tsx` + `src/components/setup-forms.tsx` — the hub: "N of 4 done" / "N left",
     inline Phase A forms (person; pot; checkpoint; salary schedule), the review rhythm, and a
     `readOnly` passthrough that hides every form during a support session.
   - `src/components/getting-started.tsx` — `GettingStartedCard` (next Phase A step, then one line
     until Phase B is done, then nothing) and `GettingStartedPath`. It owns no writes.
   - Repairs: `/transactions` now points at `/pots`; the seven "Create a pot first…" messages, the
     `/horizon` checkpoint prose and the till's no-pots state all link `/pots`; the old
     `src/components/household-setup.tsx` "two people and a vehicle" card is deleted, so a one-person,
     car-free household is complete and never nagged.
   - `PAGE_PATHS` in `src/app/actions.ts` gained `/start`, so any action taken anywhere refreshes the
     derived path; `/start` is in both navigation lists and the footer.
3. **Added the first-run browser suite** — `e2e/fresh-household.spec.ts` runs against a **genuinely
   empty** household: its own data root (`.e2e-data-fresh`), its own port (3200), its own actor
   (`new@example.com`), seeded by `scripts/e2e-server.mts` with a registry assignment and no finance
   database. It is run as `npm run test:e2e:fresh` (which sets `E2E_FRESH=1`; the config then exposes
   only the `fresh-household` project) and is wired into the CI `browser` job beside the seeded suite.
4. **Updated the two specs that count navigation links** (`e2e/bell.spec.ts` 15 → 16,
   `e2e/desktop.spec.ts` gains "Getting started"): the only pre-existing tests this change touched.
5. **Cut stable minor `v1.1.0`** in this release PR (version files, Unraid template, release notes,
   the four agent entry points). No candidate: Slice 1 is additive, has no schema change, and a
   genuinely empty household is the acceptance case the new browser suite automates.
6. **Merge, tag and publish:** the release PR merges to `main` with a merge commit, CI on the merge
   commit goes green, then annotated lower-case tag `v1.1.0` on that exact merge commit is pushed, and
   the Publish workflow publishes `v1.1.0`, `latest` and `sha-<short>` to one digest.

## Gates run locally before the PR

- `npm run format:check` pass; `npm run typecheck` pass; `npm test` **842 passed, 0 failed**
  (11 new setup-path tests); `npm run build` pass (`/start` in the route table); `npm audit --omit=dev`
  **0 vulnerabilities**.
- Browser suites via the SANDBOX entry 8 recipe (`@sparticuz/chromium`, `playwright.local.config.ts`):
  the fresh suite (`E2E_FRESH=1`, port 3200) green repeatedly, and the seeded suite (port 3100, 124
  tests) run in full: **114 passed, 10 failed**, all ten with a single environmental cause. The sandbox
  has a **3.9 GB memory limit** and its OOM killer killed `next-server` (3.4 GB RSS) during the `admin`
  registry-restore test; every later test (admin ×4, backup ×3, credit-card-pots, insights,
  payday-summary) then failed with `net::ERR_CONNECTION_REFUSED` rather than an assertion. **Verified:
  each of those specs passes on its own re-run**, including all four `admin` tests. Diagnose this class
  of failure with `dmesg | tail` — look for `Out of memory: Killed process ... (next-server)`. The only
  spec change in this release is the two navigation link counts that gained the "Getting started"
  entry (`e2e/bell.spec.ts` 15 → 16, `e2e/desktop.spec.ts` gains the label).
- **Two more sandbox facts worth keeping:** only one `next dev` may run in this directory at a time
  (Next 16 refuses the second, so nothing else may hold port 3000/3100/3200 while a suite runs), and a
  long serial `next dev` run grows to ~3.4 GB — over half the sandbox's RAM.

## v1.0.2 post-merge facts (recorded here as the previous handoff asked)

- Release PR **#12**, merge commit `5140fc2fbcef7eb0aa49fdc4a6c82e9bae58fc0d` (2026-10-11T13:02:29Z).
- CI on the merge commit: `Gates` run 114476408268, `Browser acceptance` 114476408086,
  `Docker image build + entrypoint smoke` 114476408332 — all success.
- Annotated tag `v1.0.2` (tag object `fd6a7583f194562053e9b505f3363e82378d4ad7`) on that commit;
  Publish run **38142109971**, success.
- Image `ghcr.io/dougalbob/simple-finance-multi-household` `v1.0.2`, `latest` and `sha-5140fc2`, all
  on digest `sha256:ee9c3d17844ef0debb033c3c1e9a63f5c185865857c8f2a1ce2b8c3f4b63ba7b`; GitHub release
  marked Latest (2026-10-11T13:13:12Z).

## What a future session should know

1. **Record v1.2.0's post-merge facts at the top of this file** (PR merge SHA, CI run IDs on the merge
   commit, annotated tag, Publish run, and the digest shared by `v1.2.0` / `latest` / `sha-<short>`),
   per `docs/RELEASE_PROCESS.md` §7 — the v1.1.0 block above is the pattern.
2. **Slice 1 shipped; Slices 2 and 3 did not.** They stay approved in direction: `/guide` plus the
   "what this page needs first" pattern for the payoff pages, then the worked example built from
   `src/lib/demo/household.ts` and the real engines (`/example`, isolated-root seeding, the E2E seed
   switched to the shared module). Slice 3 must never write into a real household database.
3. **One open copy decision** in `docs/ONBOARDING_PLAN.md` §7: whether `/start` keeps its navigation
   entry once Phase B is complete. Today the entry is always listed and the home card is what unmounts.
4. **The live install** should update to `latest` and confirm three things on an empty household if a
   second household is ever created: the home card names a step, `/transactions` says `/pots`, and
   completing the four Phase A steps shows `£` figures rather than £0 scaffolding.
5. **Still not approved:** any real-data import of the original household, and any change to the
   original app (its GHCR package, appdata or port `3007`).
6. **A dev-only oddity, not chased:** the mobile spec's first `/purchases` load logs a React hydration
   warning from the dev server. It does not fail any assertion and predates this change set; if it ever
   fails a test, start at the purchases page's date-dependent rendering.

---

# Historical handoff — v1.0.2 release: /admin registry restore fixed, hardened and tested (2026-10-11)

**Session branch:** `arena/dc9654f7-simple-finance-multi-household`.

## Why this session exists

User testing on the live Unraid install (v1.0.1 image) found `/admin` registry restore broken:
pressing RESTORE navigated to `https://0.0.0.0:3000/admin` ("This site can't be reached"), because
`src/app/admin/restore/route.ts` built its redirect from `request.url` — which under
`next start -H 0.0.0.0 -p 3000` is the bind address, never the public URL (`Host` is ignored;
`trustHostHeader` cannot help) — and `NextResponse.redirect` defaults to 307, which would re-POST
the upload. Separately, one live restore appeared not to take effect; that cause stays open (the
redirect proves the write path ran, so a stale cached view is the leading explanation), and this
release makes it diagnosable instead of silently re-occurring.

## What this session did

1. **Fixed the redirect:** `POST /admin/restore` now returns **303** with the relative
   `Location: /admin` — never derived from `request.url`, and 303 so the browser GETs the page
   instead of re-POSTing the upload (the 307 default).
2. **Hardened the restore** in a new module `src/lib/registry/restore.ts`, consumed by a rewritten
   route handler (`src/app/admin/restore/route.ts`):
   - session gate unchanged (401/403), now via the framework-free `describeSession`, plus the
     same-origin guard the household restore already used;
   - 64 MiB size cap (413); SQLite magic-header check; `PRAGMA integrity_check` on a throwaway
     copy; and a `households`/`identities` table check so a valid-but-unrelated SQLite file can
     never wipe the roster;
   - consistent pre-restore snapshot via SQLite's backup API, kept as
     `<dataDir>/system/registry.sqlite.pre-restore-<timestamp>`;
   - atomic inode swap: upload written to a same-directory temp file, fsynced, renamed over the
     live path, then the old-inode WAL/SHM sidecar names removed; if the swapped-in file fails to
     reopen, the snapshot is swapped back automatically and the error reported;
   - every restore logs path, byte length, sha256, households/identities before→after, and the
     pre-restore copy path (the artifacts the open live question needs: see release notes).
3. **Added the missing tests** v1.0.1's notes admitted to: `tests/admin-restore-route.test.ts`
   (401/403 gates, invalid uploads with the live registry proven untouched, success path asserting
   the exact 303 + relative Location value, byte-for-byte replacement on an isolated `DATA_DIR`,
   pre-restore copy contents, outcome log) and a browser round trip in `e2e/admin.spec.ts`
   (download → create household → restore → roster back, landed on `/admin`).
4. **Cut stable patch v1.0.2** in this release PR (version files, Unraid template, release notes,
   the five agent entry points). No RC: this is a small fix on the admin surface of an accepted
   stable line, and the restore button is broken without it — same reasoning as v1.0.1.
5. **Merge, tag and publish:** the release PR merges to `main` with a merge commit, CI on the merge
   commit goes green, then annotated lower-case tag `v1.0.2` on that exact merge commit is pushed,
   and the Publish workflow publishes `v1.0.2`, `latest` and `sha-<short>` to one digest.

## Gates run locally before the PR (sandbox, `npm ci --ignore-scripts` per SANDBOX entry 1)

- `npm run format:check` pass; `npm run typecheck` pass; `npm test` **831 passed**, 0 failed;
  `npm run build` pass; `npm audit --omit=dev` **0 vulnerabilities**.
- Full local Playwright suite via the SANDBOX entry 8 recipe (`@sparticuz/chromium`): **124
  passed**, including the new registry round-trip test, run repeatedly to rule out a race.

## A debugging lesson worth keeping

The first in-place rewrite implementation (unlink WAL/SHM, `writeFileSync` over the live path —
the v1.0.1 mechanics) failed in this sandbox's `next dev` with `SQLITE_IOERR_SHORT_READ`: Turbopack
dev evaluates pages/server actions and route handlers as separate module graphs in one process, so
two cached better-sqlite3 connections coexist, and rewriting the file under the other connection
let its stale WAL state resurrect and corrupt the fresh open. The atomic rename swap fixed it and
is strictly better in production too (no torn file if the process dies mid-restore). If registry
access ever misbehaves only in `next dev`, suspect multiple module-graph handle caches before
suspecting the data.

## What a future session should know

1. **Record v1.0.2's post-merge facts at the top of this file** (release-PR merge SHA, PR CI and
   `main` CI run IDs, annotated tag, Publish run, digest on `v1.0.2` / `latest` / `sha-<short>` vs
   v1.0.1's), per `docs/RELEASE_PROCESS.md` §7.
2. **The open live question** (v1.0.1 restore that appeared not to land) is now diagnosable: fresh
   reload of `/admin` first; then the container log's `[registry-restore]` line (path, bytes,
   sha256, before/after row counts) and the preserved `registry.sqlite.pre-restore-*` copy for a
   direct `sqlite3` roster check. If it recurs, those artifacts answer it.
3. **Still not approved:** any real-data import of the original household, and any change to the
   original app (its GHCR package, appdata or port `3007`).

---

# Historical handoff — v1.0.1 release: PR #10 merged, registry backup/restore published (2026-10-11)

**Session branch:** `arena/0569c272-simple-finance-multi-household`.

## Why this session exists

The previous session's GitHub loop stopped after CI went green on PR #10: the PR was never merged to
`main`, and nothing was built, pushed or published to GHCR. The owner asked this session to complete
the remainder: merge PR #10, then build, push and publish a new image.

## What this session did

1. **Merged PR #10** (`fix(admin): extract registry backup UI into client component and fix CI gates`,
   from `arena/bdeae08a-…`) with a merge commit: **`5ec36c6`**, merged 2026-10-11T10:45:19Z. PR CI run
   `38131054839` was green on all three jobs. CI on the `main` merge commit, run `38133082098`, is
   green on all three jobs too — `main` is healthy again after PR #9's merge left it red
   (`format:check` and browser acceptance, run `38128894553`).
2. **Cut stable patch `v1.0.1` in this release PR.** `main` after the merge is `v1.0.0` plus the
   registry backup/restore admin feature (PR #9) and its repair (PR #10), while the version files
   still said `1.0.0` — already released and never to be retagged — so a new patch version is what
   makes a new image publishable. `v1.0.1` goes directly stable with no RC: it is a small
   admin-surface change on top of the accepted `v1.0.0`, `/admin` is broken without it, and the v0.x
   line always released patches directly (e.g. `v0.22.1`, `v0.23.1`).
3. **Tag `v1.0.1` on the release-PR merge commit, push only that tag, and publish.** Post-publish
   facts (Publish run, digest, tag verification) are verified in-session and reported at close; the
   next session records them at the top of this file per §7 (item 1 below).

On the one-merge-per-session limit (`docs/RELEASE_PROCESS.md` §2): this session merges PR #10, which
is the *previous* session's already-reviewed, CI-green PR, closed out here only because the owner
explicitly asked this session to complete that loop — plus this session's own single release PR.

## This release PR's contents

- Version `1.0.1` in `package.json`, `package-lock.json` (root and `packages[""]`),
  `src/lib/version.ts` (`APP_RELEASE_STAGE` stays `stable`, badge `v1.0.1 · stable`), the Unraid
  template description, and `docs/RELEASE_NOTES_v1.0.1.md` (new; title
  `# Release notes — v1.0.1 — Registry backup and restore in the admin panel`).
- The five agent entry points name `v1.0.1` (`AGENTS.md`, `README.md`, this file,
  `docs/RELEASE_PROCESS.md` §1 standing line, `docs/MULTI_HOUSEHOLD_PLAN.md` status + §6 + §7 item
  8); the "registry has no in-app backup" statements are updated to the admin-panel download/restore.
- No application-code change: the tree is the PR #10 merge plus release mechanics.

## Gates run locally before the PR (sandbox, `npm ci --ignore-scripts` per SANDBOX entry 1)

- `npm run format:check` pass; `npm run typecheck` pass; `npm test` **826 passed**, 0 failed (the only
  red run during preparation was the isolation-contract test failing with
  `docs/HANDOFF.md does not name the current release v1.0.1` before this block was written — the
  test doing exactly its job); `npm run build` pass (`next-env.d.ts` restored); `npm audit
  --omit=dev` **0 vulnerabilities**. Local Playwright was not run (no browser here); the PR's
  `browser` check is the gate.

## What a future session should know

1. **Record `v1.0.1`'s post-merge facts at the top of this file** (release-PR merge SHA, PR CI and
   `main` CI run IDs, annotated tag, Publish run, digest on `v1.0.1` / `latest` / `sha-<short>` vs
   `v1.0.0`'s), per `docs/RELEASE_PROCESS.md` §7. This session's closing report has the verified
   Publish run id and digest.
2. **The `/admin/backup` and `/admin/restore` routes have no dedicated tests** (no route, unit or
   browser coverage; `e2e/admin.spec.ts` does not touch them). Add filename/route-gating/e2e coverage
   before the next admin change. The release notes state this gap honestly.
3. **The restore route writes the uploaded bytes over the live registry without validating them
   first** (`src/app/admin/restore/route.ts`): a corrupt upload breaks the registry until a good file
   is restored. Consider checking the SQLite header, enforcing a size cap, and keeping a pre-restore
   copy. Registry downloads are **unencrypted** — document retention/deletion, and never commit one.
4. **Still not approved:** any real-data import of the original household, and any change to the
   original app (its GHCR package, appdata or port `3007`).

---

# Historical handoff — v1.0.0 released, and main brought back in step with what was published (2026-10-11)

**Session branch:** `arena/e6df491e-simple-finance-multi-household`.

## The problem this session fixed

`main` and the published image had drifted apart. The release candidates `v1.0.0-rc.2` and `v1.0.0-rc.3` were
committed to the session branch `arena/f011a008-simple-finance-multi-household`, tagged **there**, and
published from those tags — but no pull request was ever opened for that branch. The Publish workflow builds
from the tag, so the image was always correct and the owner's Unraid install was genuinely `rc.3`. The
repository was not: `main` sat at `e2be937` still naming version `1.0.0-rc.1` in `package.json`,
`src/lib/version.ts` and the Unraid template, and every top-level document still described `v1.0.0-rc.1` as
the current build and support consent, the identity-to-`people` link and per-household backup/restore as
unimplemented (they shipped in PR #4).

Verified at the start of this session: `git merge-base --is-ancestor v1.0.0-rc.3^{commit} origin/main`
returned false, and `git ls-remote --heads origin` showed `refs/heads/main` at
`e2be93755fd1cc4578ba875cca068bfec5fa0656`.

## Verified release chronology (from tags, Publish runs and the release body — not inferred)

| Tag | Commit | Publish run | Result |
| --- | --- | --- | --- |
| `v1.0.0-rc.1` | `ef02e95` (PR #5 merge) | `38083365013` | **failed** at *Smoke test the built image* — checked for the inherited root-level `/data/simple-finance.sqlite`, which the multi-household layout never creates |
| `v1.0.0-rc.2` | `b0f7288` (branch `arena/f011a008-…`) | `38088666376` | **failed** at *Upgrade smoke test* — selected `v1.0.0-rc.1` as its upgrade base, a tag with no image in GHCR |
| `v1.0.0-rc.3` | `a9e32f1` (branch `arena/f011a008-…`) | `38088956509` | **succeeded** |

`v1.0.0-rc.3` publication facts, as written into the GitHub release body by that run: source commit
`a9e32f1fd6a550cfd1841948dd010f5c49f1b30a`; tags
`ghcr.io/dougalbob/simple-finance-multi-household:v1.0.0-rc.3` and `:sha-a9e32f1`; digest
`sha256:ded0257383b5c64a8a980a41b17f3d86b775a48a1ea5ebb76170d44867f7c238`; `latest` untouched; GitHub release
created 2026-10-10T21:47:12Z and marked pre-release. `gh release list` shows `v1.0.0-rc.3` as the only
release — **there is no `rc.1` or `rc.2` image or GitHub release.**

The owner accepted `v1.0.0-rc.3` on a live installation: the container ran on host port `3009` with appdata at
`/mnt/user/appdata/simple-finance-multi-household`, sign-in worked through the **real** Cloudflare Access
route, the household was created and assigned on `/admin`, and the app was used with real household data. That
retires the two limitations the candidate carried as unverified (real Cloudflare Access; a real Unraid template
install).

## What this session's pull request does

1. **Brings the published candidate onto `main`.** A merge of `origin/arena/f011a008-simple-finance-multi-household`
   puts `main` on the `rc.3` tree: version `1.0.0-rc.3`, `docs/RELEASE_NOTES_v1.0.0-rc.3.md`, and the
   `publish.yml` fix that skips version tags with no published image. **No tag was moved** — `v1.0.0-rc.3`
   still points at `a9e32f1`.
2. **Fixes the same bug in CI, which `rc.3` missed.** `.github/workflows/ci.yml` still picked its upgrade base
   as "newest v1+ tag other than the version under test", published or not. Replayed locally against the `rc.3`
   tree it selected `v1.0.0-rc.2`, so **every PR after `rc.3` would have failed its required `docker` check on
   `docker pull`** rather than testing an upgrade. Both workflows now probe each candidate with
   `docker buildx imagetools inspect` and take the newest tag that really has an image. Replayed with a stubbed
   `docker`: at version `1.0.0-rc.3` it skips `rc.2` and `rc.1` and skips the smoke cleanly; at version `1.0.0`
   it selects `v1.0.0-rc.3`, so the `rc.3 → v1.0.0` upgrade path is genuinely exercised.
3. **Promotes the accepted candidate to stable `v1.0.0`**, with no application-code change: `1.0.0` in
   `package.json`, `package-lock.json` (root and `packages[""]`) and `src/lib/version.ts`;
   `APP_RELEASE_STAGE` is `stable`, so the badges read `v1.0.0 · stable`; the Unraid template's `Repository` is
   `:latest`; `docs/RELEASE_NOTES_v1.0.0.md` added.
4. **Corrects the documentation drift.** `README.md` (status, versioning, Unraid install, release section,
   version line, and the backup section that still claimed `/api/backup` and `/api/restore` return `501` —
   they do not; verified in the route handlers), `AGENTS.md` (the "Implemented / Still deferred" list),
   `docs/MULTI_HOUSEHOLD_PLAN.md` (status, §6, §7), `docs/RELEASE_PROCESS.md` (§1 where the line stands, §3 the
   tag-without-an-image rule, §4 tag-on-`main`, §6 example title), and the candidate notes
   (`rc.1` marked never-published, `rc.2` added, `rc.3` given its publication facts).
5. **Makes the drift testable.** `tests/multi-household-isolation-contract.test.ts` now derives the current tag
   from `package.json` and fails if any of the five agent entry points does not name it, and fails if
   `docs/RELEASE_NOTES_<tag>.md` is missing or mis-titled. The old hard-coded `v1\.0\.0-rc\.[123]` assertion is
   what let this drift sit unnoticed.

## Loose ends the owner chose to leave

- **PR #6 is open and dead.** Its single commit `3dbf042` ("Fix Publish smoke tests for the household layout")
  is patch-equivalent to what landed in PR #7 — `git cherry origin/main
  origin/arena/124de12d-simple-finance-multi-household` reports it with a `-`, meaning an equivalent patch is
  already upstream. It is closed with an explanation; the branch is kept.
- **The `arena/…` branches are kept**, including `arena/f011a008-…` (now merged) and
  `arena/124de12d-…`. Delete them only when the owner says so.

## After this release

Record `v1.0.0`'s verified post-merge facts at the top of this file, per `docs/RELEASE_PROCESS.md` §7: the merge
SHA, PR and CI run IDs, the Publish run, the image tags and the digest, and confirm `latest` now resolves to the
same digest as `v1.0.0` and `sha-<short>`. The sandbox cannot reach `ghcr.io` (SANDBOX entry 6), so take the
digest from the Publish run's own release body rather than re-deriving it.

**Still not approved:** any real-data import of the original household, and any change to the original app
(`dougalbob/simple-finance`, its GHCR package, its appdata or port `3007`).

---

# Historical handoff — v1.0.0-rc.1 Publish fix: replayed locally, then merged (PR #7, 2026-10-10)

**Session branch:** `arena/50895dfb-simple-finance-multi-household`. It carries the previous session's fix
(`3dbf042`, from branch `arena/124de12d-…`, open as PR #6) plus two accuracy corrections of its own and a sandbox
note. PR #6 is superseded by PR #7 and is left open only until #7 lands.

**Re-checked at the start of this session, with current facts:**

- `main` is `ef02e95` (PR #5 merged). The annotated tag `v1.0.0-rc.1` points at it.
- **Nothing was published between the sessions.** There is no GHCR package and no GitHub release for this
  product. PR #6 was still open and mergeable; the previous session's note is accurate on every point.
- The failing step in Publish run 38083365013 is *Smoke test the built image*, which looked for
  `/data/simple-finance.sqlite`.

**What PR #7 changes:**

1. **Fresh-start smoke test** (`publish.yml`): checks `/data/system/registry.sqlite` (non-empty) instead of the
   root-level database the multi-household layout never creates.
2. **Upgrade smoke test** (`publish.yml`): now mirrors the CI `docker` job — create the volume, seed a household via
   `registry-migrate.cjs` and a registry insert, check the tenant database at
   `/data/households/<id>/simple-finance.sqlite`, and check every journal entry was applied exactly once against
   that tenant database. (Previously it opened the stale root-level path.)
3. **Two accuracy corrections added in this session:** the release body and the image's
   `org.opencontainers.image.revision` label now name the **checked-out commit** (`steps.meta.outputs.sha`) rather
   than `GITHUB_SHA`. On a tag push the two are the same commit. On a `workflow_dispatch` re-run they are not:
   `GITHUB_SHA` is the ref the run was dispatched on. Without this fix, re-running Publish for `v1.0.0-rc.1` after
   this merge would have written the *workflow-fix* commit into the release notes while the image was built from the
   tagged release commit `ef02e95` — a released statement that is simply wrong. The release line now reads
   "**Source commit:** …" instead of "**Merge commit:** …".
4. `docs/SANDBOX.md` entry 18: `npm_config_nodedir=/usr/local npm ci` (no nodejs.org fetch) and how to replay the
   container smoke steps without Docker or `/data`.

**Verified in this sandbox — not inferred from CI:**

- `npm test` **825 passed / 0 failed**; `tsc --noEmit` clean; `prettier --check .` clean.
- `publish.yml` parses as YAML; all seven `run:` blocks pass `bash -n`.
- The fixed smoke steps **replayed locally without Docker** (`docs/SANDBOX.md` entry 18), running the workflow's own
  `node -e` payloads against a scratch `DATA_DIR`: registry created → household registered → finance migrations →
  *"tenant database exists with 17 migrations"* → *"all 17 journal entries applied exactly once"* → registry
  non-empty after restart. The **old** check fails on the same tree, which is exactly what CI saw.
- The release step **replayed with a stubbed `gh`** in a worktree of the tag: title `v1.0.0-rc.1 — First
  multi-household candidate`, body naming `ef02e95db43193c7f8974fea35ff7c694f19fd63`, tags `v1.0.0-rc.1` and
  `sha-ef02e95`, created with `--prerelease`.
- **Not verifiable here:** the Docker build and the GHCR push (no Docker daemon; `ghcr.io` blocked — SANDBOX
  entries 6 and 18). CI's `docker` job and the Publish run are the proof for those.

**Merge and publish (this session's plan, per `docs/RELEASE_PROCESS.md` §2 and §4):** merge PR #7 with a merge
commit, wait for CI on the resulting `main`, then re-run Publish by `workflow_dispatch` on `main` with
`tag=v1.0.0-rc.1`. The workflow checks out the tag, so the image is built from `ef02e95` — the code the tag already
names — and only the smoke-test logic comes from the merged fix. **The tag is not moved and `latest` is untouched.**
A successful run creates the GitHub pre-release; the merge SHA, check-run IDs, Publish run id and digest are
recorded by the next session, as `docs/RELEASE_PROCESS.md` §7 asks.

**Still not approved:** the stable `v1.0.0`, any real-data import, and any change to the original app
(`dougalbob/simple-finance`, its GHCR package, appdata or port 3007).

---

# Historical handoff — v1.0.0-rc.1 publish run failed; smoke-test fix awaits approval (2026-10-10)

**State:** PR #5 (release PR) merged to `main` as merge commit `ef02e95db43193c7f8974fea35ff7c694f19fd63`. CI on that `main` commit passed. The annotated tag `v1.0.0-rc.1` was pushed to that commit. The **Publish run 38083365013 failed** at "Smoke test the built image". Nothing was pushed to GHCR, and no GitHub release was created.

**Cause (from the run's step results; the job log cannot be downloaded here):** the Publish workflow's fresh-start smoke test checked for the inherited root-level database `/data/simple-finance.sqlite`. The multi-household layout creates only `/data/system/registry.sqlite` at start. Finance databases live under `households/<id>/`, and the app never creates the root-level file. The CI `docker` job already checks the new layout, and it passed. The Publish workflow's upgrade smoke had the same stale path, and it would have failed on the next release candidate.

**Fix (branch `arena/124de12d-simple-finance-multi-household`, not merged):** `.github/workflows/publish.yml` now checks the registry in the fresh-start smoke test. The upgrade smoke now follows the CI job: it seeds a household in the previous release's volume, checks its tenant database, and checks that every journal entry was applied exactly once. The YAML parses, the shell steps pass `bash -n`, the journal check passes locally on a seeded household (17 of 17 entries), and the contract test and formatting pass. Docker was not available here, so the fixed Publish run has not been seen.

**Why the fix is not merged yet:** the release process allows one merge per Arena session, and PR #5 used it. Merging this fix needs the owner's approval to exceed that limit.

**Next, once the owner decides:**
- Option A: approve merging the fix PR. Then run Publish with `workflow_dispatch` on `main`, with input `tag=v1.0.0-rc.1`. This publishes the same commit (`ef02e95`), so the candidate does not change.
- Option B: run Publish from the session branch with `workflow_dispatch`, without merging the fix. The release process does not describe this route.
- The tag stays on `ef02e95` in both cases. Nothing has been published, and `latest` has not been touched.

---

# Historical handoff — release candidate v1.0.0-rc.1 (2026-10-10)

**Owner approval:** the owner said "You can publish v1.0.0-rc.1" after the step 6 acceptance run. The owner will ask follow-up questions after publication.

**Release PR contents (one PR to `main`, from `arena/124de12d-simple-finance-multi-household`):**

- Version `1.0.0-rc.1` in `package.json`, `package-lock.json` (root and `packages[""]`), `src/lib/version.ts` and the Unraid template. Release notes are in `docs/RELEASE_NOTES_v1.0.0-rc.1.md`, and their first line is the exact title the publish workflow checks.
- The Unraid template is `simple-finance-multi-household.xml`. It is pinned to `ghcr.io/dougalbob/simple-finance-multi-household:v1.0.0-rc.1`, because `latest` will not exist until the stable release. The isolation contract test now allows that pinned form. Switch the template back to `:latest` with the stable release.
- Steps 5 and 6 on fictional data: `scripts/rehearse-import.mts` and `scripts/acceptance.mts` (`npm run rehearse:import`, `npm run acceptance`), with their tests and docs. Scratch folders are git-ignored.
- README status text updated. It no longer says no release exists.

**Gates run locally before the PR:** `npm run typecheck` pass; `npm run format:check` pass; `npm test` **825 passed**, 0 failed; `npm run build` pass (`next-env.d.ts` restored); `npm run acceptance` **31 of 31**; `npm run rehearse:import` **17 of 17**; `npm audit --omit=dev` **0 vulnerabilities**.

**Required before merge:** CI checks `gates`, `browser` and `docker` must pass on the PR. Merge with a merge commit (`gh pr merge --merge`). Do not squash.

**After merge:** create an annotated, lower-case tag `v1.0.0-rc.1` on the merge commit and push only that tag. The Publish workflow publishes only `v1.0.0-rc.1` and `sha-<short>`, does not move `latest`, and creates a GitHub pre-release. Then verify the GitHub release type, the digest and the tags. The next working session records the merge SHA, check run IDs, the Publish run and the digest here.

**Not verified in the sandbox:** real Cloudflare Access; the Docker image build (Docker is not installed here, so the CI `docker` job and Publish build it); the Unraid install; any real household data. The release notes say so.

**Still not approved:** the stable `v1.0.0`, any real-data import, and any change to the original app (`dougalbob/simple-finance`, its GHCR package, appdata or port 3007).

---

# Historical handoff — step 6 acceptance on fictional data (2026-10-10)

**Owner approval:** the owner said "ok go ahead" to step 6 after the synthetic rehearsal, on fictional data only.

**What was run:** `npm run acceptance` (after `npm run build`). It is `scripts/acceptance.mts`. It builds a fictional
installation with three households (Alex & Sam, where Alex is an administrator; Other; and a Retired household that is
deactivated). It then starts the **production** build with the container's production settings. A local stand-in for
Cloudflare Access (a key server plus tokens signed in the same way) lets the real sign-in checks run over HTTP. Scratch
data is in the git-ignored `.acceptance/`, and the report is `.acceptance/REPORT.md`.

**Result: 31 of 31 checks pass.** They cover:

- **Sign-in:** signed-out requests see no data (they redirect to /unauthorized). Each of these is refused: a stranger
  (allowed by Cloudflare but not assigned in the registry), the retired household's member, a forged signature, a wrong
  audience, a wrong issuer, an expired token, and an identity not on the allowlist.
- **Isolation:** Alex, Sam and Other each see only their own household's data on the pots and purchases pages. Other
  cannot open Alex's attachment (404). A stranger cannot open any attachment. A token whose two identity claims disagree
  shows one household only.
- **Concurrency:** 40 interleaved requests from two households were all correct.
- **Backup and restore over HTTP:** Alex can back up. A cross-origin backup gets 403. A stranger gets 401. Other cannot
  restore Alex's archive (400, nothing changed). Alex can restore her own archive and keeps her data.

**Bug found and fixed in the test (not the app):** one check had a wrong expectation. The first run reported a
failure. The test had a validly signed token for the Other household and treated the resulting access as a leak. The
test now checks the conflicting-claims case properly, and no app change was needed. The app log had no errors or
warnings.

**Not done, and why:**

- **Docker image build:** Docker is not installed in this sandbox, so the Dockerfile was not built. The production build
  and settings were tested directly instead.
- **Real Cloudflare Access, the Cloudflare Tunnel route, Unraid, and the new template install:** these need the owner's
  environment. They are the remaining steps before any release candidate.
- **Grant-flow browser test:** support grants are a server action, and the grant flow is still covered by unit tests only.
- The `secure` cookie flag, restore memory use and `npm audit` items from step 4 are unchanged.

**Still not approved:** publishing `v1.0.0-rc.1`, tags, the version bump, any real-data import, and any Unraid or
Cloudflare change.

---

# Historical handoff — step 5 synthetic import rehearsal and template rename (2026-10-10)

**Branch:** `arena/124de12d-simple-finance-multi-household` (session branch), on top of `main` at `c2cac66` (PR #4 merged).

**Owner decisions recorded here:**

- The owner cannot provide live or original backups (they hold sensitive data). Step 5 therefore runs on **fictional**
  data only. The owner's request for a throwaway seed database is treated as approval for this synthetic rehearsal and
  nothing else. Step 6, any publication, and any work on real data still need separate approval.
- The Unraid template is renamed to **`simple-finance-multi-household.xml`**, because the original app's template is
  `simple-finance.xml` and both must coexist. Its `TemplateURL`, README link, release-process reference and the
  isolation contract test now use the new name. Historical release notes and the decision log keep the old name.

**What was added:**

- `scripts/rehearse-import.mts` (`npm run rehearse:import`). It builds a fictional legacy installation (two people, a
  lodger with a stale sign-in, pots, checkpoints, purchases, two documents) with the checked-in migrations, then:
  1. imports a WAL-consistent copy into an isolated `new-appdata` root with registry assignments and the documents folder;
  2. runs the production startup scripts `registry-migrate.cjs` and `migrate.cjs`;
  3. verifies row counts for every table, integrity, foreign keys, attachment hashes, no orphan files and sign-in links;
  4. makes a household backup, refuses a restore into another household and a wrong passphrase (both with the database
     unchanged), restores the same household, and checks counts, hashes and that the stale sign-in link was cleared.
  Output goes to the git-ignored `.import-rehearsal/`. It refuses to run under `/mnt/`.
- `tests/import-rehearsal.test.ts` runs the rehearsal as part of `npm test`.
- `.gitignore` ignores `.import-rehearsal/`.

**Result:** the rehearsal passes 17 of 17 checks. Gates: `npm run typecheck` pass; `npm run format:check` pass;
`npm test` **825 passed**, 0 failed.

**What this does not prove:**

- It proves the import and restore path on fictional data, not on the owner's real database. Real data can differ
  (older rows, unusual values, document quirks). A real-data rehearsal would need an approved, isolated copy handled by
  the owner.
- The "legacy" database is built with the checked-in migrations. The v0.39.0 release notes say that release added no
  migration, and the newest finance migration (`0016`) arrived in v0.31.0, so the schema should match. The clone is
  shallow, so this was not checked against the v0.39.0 commit itself.
- The `secure` cookie flag, restore memory use and `npm audit` items from step 4 are unchanged.

**Install note for the owner (not yet a release):** the container template's data folder must be exactly
`/mnt/user/appdata/simple-finance-multi-household` and its port 3009. Nothing is published, tagged or bumped
(`package.json` stays `0.39.0`).

---

# Historical handoff — plan step 4: support consent and household-scoped backup/restore (2026-10-10)

**Baseline:** PR #3 (per-household finance routing) merged to `main` at `72dfb46`. This work is on the fixed Arena
branch `arena/c8a5b27d-simple-finance-multi-household`.

**Approval:** the owner explicitly approved this step's scope on 2026-10-10: consent-based support access **and**
household-scoped backup/restore, as the PR #3 handoff required and MULTI_HOUSEHOLD_PLAN §7 item 4 describes. This
approval does **not** cover step 5 (import rehearsal) or step 6 (acceptance); each needs its own approval.

## What is implemented

- **Identity-to-person link.** `savePersonEmailAction` accepts only a sign-in the registry assigns to the viewer's
  own household (`householdSignInEmails`). Settings' "Signs in as" choices no longer come from the installation-wide
  Cloudflare allowlist, which named every household's members.
- **Support consent** (registry table `support_grants`, migration `0002`):
  - Only a member of a household can grant or end support access. The grantee must be a platform administrator who
    is not a member of that household. Durations are fixed at 1, 4 or 24 hours. One active grant per household.
    Ending a grant takes effect on the next request.
  - An administrator opens a live grant from `/support`. The browser sends a grant ID; the `sf_support_view` cookie
    holds only that ID (httpOnly, SameSite strict, at most 24 hours). Every request re-checks the verified sign-in,
    expiry, revocation, the grantee's administrator role and the household's active status. Any failure falls back to
    the administrator's own household.
  - A support view is read-only at three layers: a read-only SQLite handle (the engine refuses writes), a `readOnly`
    refusal in every household server action (`saveThemeAction` is the one exemption, because it is a device
    preference), and refusals in backup, restore and the bell's seen-time. A view never creates a household database.
  - Audit: `support.grant`, `support.revoke`, `support.open`, `support.access` (first use, then last use throttled to
    once a minute). Settings → Support access shows the household its recent grants and that activity. A banner shows
    on every page while a view or a granted share is active.
- **Household-scoped backup/restore.**
  - `POST /api/backup` takes a passphrase of at least 12 characters and returns a format 3 archive. The archive names
    its household, and holds only that household's database snapshot and attachments: never the registry or another
    household. A support view gets 403. A missing attachment file gets 409, and nothing downloads.
  - `POST /api/restore` takes the archive, passphrase and the typed word `RESTORE`. It refuses, before any change, an
    archive for another household, a legacy format 1 or 2 archive, a wrong passphrase or a tampered archive. A valid
    archive replaces only the caller's household, under a maintenance lock, and the previous copy is kept under a
    `.pre-restore` name. Sign-in links the registry no longer assigns to the household are cleared from the restored
    copy and reported as `personLinksCleared`.
  - Settings shows the household's own backup and restore controls. A support view shows a message instead.
- **Settings and admin.** The inherited global backup controls are gone. `/admin` links to `/support`.

## Gates completed locally

- `npm run typecheck`: pass.
- `npm test`: **824 passed**, 0 failed (was 782). New suites: `support-consent`, `support-context`,
  `household-backup`, `identity-link`, `support-readonly-guard`. The `api-backup-route` and `api-restore-route` tests
  now cover the live behaviour rather than the 501 stubs.
- `npm run format:check`: pass.
- `npx next build`: pass. `next-env.d.ts` was restored afterwards.
- Migrator: `scripts/registry-migrate.cjs` applies `0001` and `0002` to a fresh registry.
- Playwright, via the throwaway Chromium overlay in `docs/SANDBOX.md` entry 8: **123 passed** on a clean run. Its
  backup and support-access specs were rewritten for this UI.
- HTTP smoke against the seeded e2e server: pages render; a cross-origin backup is refused (403); a short passphrase
  is refused (400); the download is `no-store`, `attachment`, named for the household; a wrong passphrase, a missing
  confirmation word and a matching archive give 400, 400 and 200 respectively.

No version bump, image or tag publication, deployment, live-data operation or Unraid change is part of this work.
`package.json` remains `0.39.0`. The original app stays at port `3007` and `/mnt/user/appdata/simple-finance`, and the
new app stays on host port `3009` with appdata at `/mnt/user/appdata/simple-finance-multi-household`.

## Not verified here

- The support grant flow has no browser test. The Playwright seed has one administrator, who is also a member of the
  seeded household, so there is nobody to grant to. The flow is covered by the registry, context, route and
  read-only-guard tests. A browser test needs a second household and administrator in the seed.
- The `secure` cookie flag applies only in production.
- Restore reads the whole archive into memory, up to the 512 MiB policy limit.
- `npm audit` was not re-run in this session.

## Next work

Step 4 is complete on this branch and awaiting review. Do not merge, tag, publish, deploy or touch live data as part
of this work. Step 5 (import rehearsal in an isolated copy of the legacy database and documents) and step 6
(acceptance) need separate approval. Before merge, update this file and `docs/SANDBOX.md` for the final state.

---

# Historical handoff — per-household finance routing, PR #3 (2026-10-10)

**Baseline:** PR #2, which delivered the system registry and administrator assignment, merged to `main` at
`ab3fda9698e078322e5cb26e604c877242f328f8`. This implementation continues from that commit on the fixed Arena
branch `arena/f5b6a64a-simple-finance-multi-household`.

**Approved scope:** implement HANDOFF “next implementation work” item 2 only: replace the inherited global
`getDbHandle()` assumption with a verified, immutable household context and independent handles under
`households/<id>/simple-finance.sqlite`, using `src/lib/registry/paths.ts`. Do not add consent-based support or
tenant backup/restore without asking first.

## What is implemented on this branch

- `householdContextFromHeaders` / `householdContextFromRequest` build a frozen request context only from
  `describeSession`'s active registry assignment. `getHouseholdDbHandle` validates the opaque hex32 ID through
  `paths.ts`, caches by absolute tenant path, detects a replaced DB file, and keeps simultaneous household
  handles independent. There is no mutable current-household pointer or request-selected tenant ID.
- Every finance page and server action uses the resolved context's DB. Audit entries therefore remain in the
  selected household's finance DB. Purchase/income/supplier document upload and deletion use that context's
  `documentsDir`; the attachment API queries the same tenant DB and reads only from its matching directory.
- The attention GET/seen APIs now use the selected tenant DB and private no-store responses. Database/path
  failures fail closed; attachment/attention endpoints return no-store 503 responses if tenant data cannot open.
- `scripts/migrate.cjs` discovers validated IDs from `<DATA_DIR>/system/registry.sqlite` and migrates only
  `<DATA_DIR>/households/<id>/simple-finance.sqlite`. Entrypoint order is registry migration first, then tenant
  migrations; failures refuse startup. Global `DATABASE_PATH` / `DOCUMENTS_DIR` overrides and the inherited
  root-level finance/document paths are not selected or prepared. Newly created households migrate on first DB
  open.
- Global backup/restore is deliberately **disabled**, not made tenant-safe: authenticated same-origin API calls
  return `501`, live restore throws a dedicated unavailable error, and Settings shows the deferred status with no
  legacy controls. The underlying archive utility is not exposed. Support consent, per-household backup/restore,
  the identity-to-`people` link and data import remain later, separately approved work.
- E2E setup now seeds the fictional Alex/Sam registry first and derives the finance path from its assigned
  household. The payday scenario resolves Alex via the same registry context. No real data or the original app
  has been read, mounted, migrated or changed.

## Gates completed locally

- `npm ci --ignore-scripts` restored the partial dependency tree; four moderate **development-only** audit notices
  remain as before. `npm audit --omit=dev`: 0 vulnerabilities.
- `npm test`: **782 passed**, 186 suites, 0 failed. `npm run typecheck`, `npm run format:check`,
  `npm run themes:check`, and `npm run build` passed. `next-env.d.ts` was restored after build.
- Playwright local run via the throwaway Chromium setup in `docs/SANDBOX.md` entry 8: **121 passed** across all
  projects. `playwright.local.config.ts` and `.e2e-data` are local-only/ignored and must not be committed.

No version bump, image/tag publication, deployment, live-data operation, or Unraid change is part of this work.
`package.json` remains `0.39.0`. The original Unraid app remains at host port `3007` and
`/mnt/user/appdata/simple-finance`; the new app remains a future, separate installation at host `3009` and
`/mnt/user/appdata/simple-finance-multi-household` → `/data`.

## Pull request and checks

PR #3 is open from `arena/f5b6a64a-simple-finance-multi-household` to `main`:
https://github.com/dougalbob/simple-finance-multi-household/pull/3. The first CI run exposed a stale Docker
smoke-test assumption that every install creates `/data/simple-finance.sqlite` and `/data/documents`; the
workflow was corrected to seed a fictional registry household, verify migration and persistence at the tenant
path, repair only the tenant subtree on a bind mount, and assert that legacy root-level fixtures remain unchanged.
On commit `d0aa7bc`, all three GitHub jobs passed: gates (format, types, tests, build, audit), Browser acceptance
(Playwright), and Docker image build/entrypoint smoke.

## Next work

Implementation and validation for HANDOFF item 2 are complete. PR #3 remains open for review; do not merge,
publish, deploy, touch live data, or bump the version as part of this task. Any future work on support consent,
tenant backup/restore or live-data import requires its own approval and isolated-copy rehearsal.

---

# Historical handoff — system registry and identity-to-household assignment (PR #2)

**Continuation of:** the multi-household foundation (PR #1, merge `e3720c5`) and its delivery sequence.
**Merged:** PR #2 merged to `main` at `ab3fda9698e078322e5cb26e604c877242f328f8`.
**Scope of this change (approved step):** the system registry and secure identity-to-household assignment —
households with up to two assigned sign-in identities, administrator pre-assignment, and app-side first-login denial. The two-identity rule does not cap `people` attribution records. Nothing else:
no per-household database routing, no tenant backup/restore, no support consent, no version bump, no image or
tag, no deployment, no real data touched. The original installation (port 3007, `/mnt/user/appdata/simple-finance`,
its route and backups) is untouched.

## What landed

- **System registry (control plane)** at `<dataDir>/system/registry.sqlite` — `households`, `identities`,
  `registry_audit`; membership/admin metadata only, never finance rows (SPEC §18.1). SQL lives in
  `drizzle/registry/0001_initial.sql` and is applied by `src/lib/registry/schema.ts` (app/tests) and the
  production twin `scripts/registry-migrate.cjs` (entrypoint runs it before `next start`; migration failure
  refuses startup). `tests/registry-migrations.test.ts` pins idempotence and that the twin builds an identical
  schema. New npm script: `db:migrate:registry`.
- **Registry domain** (`src/lib/registry/domain.ts`), every write audited in one transaction:
  - one or two assigned sign-in identities per household (one person is complete; a third is refused);
  - one household per identity — normalised (trimmed, lower-cased), globally unique email; unassign then
    reassign is the supported move; there is no self-sign-up;
  - create/rename/deactivate/reactivate households (deactivation denies members without deleting anything);
  - grant/revoke the `platform_admin` role; the **last administrator can never be removed or demoted**;
  - `bootstrapRegistryAdmin` — consumed once while the roster is empty.
- **Identity resolution** (`src/lib/registry/paths.ts`, `ids.ts`): opaque 128-bit hex household IDs; every
  household path (`households/<id>/simple-finance.sqlite`, `documents/`) derives from the data root plus a
  validated ID — traversal-proof, and the browser never supplies an ID. These helpers are the ones the later
  per-household routing step must use.
- **App-side first-login denial at one choke point** (`src/lib/auth/current-user.ts`): `getCurrentUser` now
  requires authentication **and** an active registry assignment for an active household. Every page, server
  action and API route already calls it, so an authenticated-but-unassigned identity is denied everywhere with
  zero per-route drift (fail closed; a missing/unreadable registry denies everyone). `describeSession` reports
  the same decision with its reason (`ok` / `not-signed-in` / `unassigned` with the email /
  `household-deactivated` carrying the role / `registry-unavailable`); `appSessionFromRequest` is the Next
  adapter. `User` now carries `householdId` and `role` (call sites only read `.email`).
- **Denial page** (`/unauthorized`) explains the state: not signed in, signed in but not assigned yet (it
  names the address to give the administrator), household deactivated (nothing deleted), or registry
  unavailable.
- **Administrator surface `/admin`** (platform administrators only; operational metadata only — no financial
  records, no standing access to any household's data): household roster with assigned identities and
  one-or-two slots, create/rename/deactivate/reactivate households, pre-assign/unassign sign-in emails, and a
  registry audit tail. Server actions in `src/app/admin/actions.ts` re-check the role on every write. A
  platform administrator whose own household is deactivated keeps `/admin` (to restore it) but no household
  pages. **Reach it at `/admin` on the household link** — deliberately not in the household nav.
- **First-administrator bootstrap:** while the registry roster is empty, the first app open consumes
  `REGISTRY_ADMIN_EMAIL` (optional `REGISTRY_ADMIN_HOUSEHOLD_NAME`, default "Main household") and creates that
  household + `platform_admin` assignment together (`.env.example` documents both). Once the roster is
  non-empty the bootstrap cannot run again. For the real install: set `REGISTRY_ADMIN_EMAIL` in `/data/.env`,
  start once, then manage everything at `/admin`.
- **Entrypoint** prepares `system/` and `households/`, aligns ownership for them (including
  `households/<id>/*.sqlite*`), and runs the registry migrator alongside the existing one. The transitional
  single-database app (see below) is migrated exactly as before.
- **Tests:** `tests/registry-domain.test.ts` (assignment rules, audit, bootstrap, last-admin guard),
  `tests/registry-paths.test.ts` (opaque IDs, traversal refusal), `tests/registry-migrations.test.ts`
  (idempotence + CJS/TS twin), `tests/session-gate.test.ts` (unassigned denial, deactivated households, dev
  bypass gated too, registry-unavailable fail-closed, choke point), updated `tests/current-user.test.ts`,
  `tests/config.test.ts` and the three API-route test files (they now seed a registry for the dev identity via
  `seedTestRegistry` in `tests/helpers.ts`). e2e: the seed assigns fictional Alex (platform admin) and Sam to
  their household; new `e2e/admin.spec.ts` (project `admin`, before `backup`) covers the roster, the
  one-or-two limit copy, create/assign/unassign, deactivate/reactivate and the audit tail.

## The deliberate transition (read this before the next step)

Pages, server actions and the backup/restore endpoints still use the **inherited single-database handle**
(`getDbHandle()` → `dataDir/simple-finance.sqlite`) and the single `documents/` directory. The gate above is
real and enforced, but an assigned identity's household database is **not** what pages read yet. The next
approved step (delivery sequence step 2, second half) replaces that with safe request-scoped household
context and per-household handles — resolving the household from the registry assignment (never from the
browser), passing an immutable context through every request/action/route, and caching handles by safe path or
stable household ID. Then documents, caches, exports, backup and restore get scoped the same way (step 4),
before any import rehearsal (step 5). Do not treat the current screens or the backup endpoint as
multi-household-safe.

## Gates at PR preparation

`npm test`: **783 passed**, 184 suites, 0 failed (749 before; +34 across the four new registry/session
suites and the config additions). `npm run typecheck`, `npm run format:check` and `npm run themes:check`
clean. `npm run build` clean (`next-env.d.ts` restored before commit). Playwright: **122 passed** across
every project (119 before + 3 in the new `admin` project), locally via `docs/SANDBOX.md` entry 8. The PR's
`gates`, `browser` and `docker` checks are mandatory and must all be green before merge — do not infer their
status from these local results.
No version bump, no image, no tag: this is not a release.

## What a future session should know

1. **`getCurrentUser` is the choke point — keep it that way.** Any new entry point that skips it opens a hole.
   If the next step introduces `requireHousehold()`-style helpers, they must build on `describeSession`, not
   beside it. `AUTH_ALLOWED_EMAILS` and the registry are two separate checks (plan §2): both must pass.
2. **The registry schema's SQL is frozen** once shipped (decision 172's rule): change it only by adding
   `drizzle/registry/0002_*.sql`, and update BOTH runners (`src/lib/registry/schema.ts` and
   `scripts/registry-migrate.cjs`) — the twin test will catch a drift in the schema, not a missing runner
   entry for a new file (both discover files by directory listing, so a new file is picked up by both).
3. **Household IDs are opaque hex32** and `paths.ts` refuses anything else — the import step (step 5) should
   mint IDs through `newHouseholdId()` and never hand-craft paths.
4. **Bootstrap is consumed once** and the last-admin guard means the registry can never become
   unadministrable via the UI. There is intentionally no UI for granting `platform_admin` yet (role changes
   are domain-level, used by bootstrap); add one to `/admin` if the household wants a second administrator.
5. **e2e locator lesson (cost a red run):** the roster cells repeat their email in the Unassign button label
   and in the action message, and "Deactivated" repeats in the confirmation sentence. `admin.spec.ts`
   therefore matches cell text with `{ exact: true }` — do the same for any new roster assertion.
6. **Playwright locally:** SANDBOX entry 8 still holds. A full 16-minute run once lost its `next dev` server
   mid-run (`ERR_CONNECTION_REFUSED` on the projects after `admin`) without any server-side error in the log;
   the identical tree passed on re-run. If a long local run reddens late projects with connection refused,
   re-run before believing it — and prefer per-project runs while iterating.
7. **Registry handle caching** (`src/lib/registry/db.ts`) opens first and caches after, so a failed open
   cannot leave a closed handle that still answers path checks (same lesson as `getDbHandle` in v0.14.0).
8. The `/admin` page is intentionally absent from `NAV_ITEMS`; link it from docs only unless the household
   asks for a nav entry.

## What the household does

Nothing yet — no release, no Unraid change. When the later RC exists: take a backup of the original app as
usual before any cutover, and bootstrap the new install by setting `REGISTRY_ADMIN_EMAIL` in the new
appdata `.env` and opening `/admin`. Do not install this build against real data.

---

# Historical handoff — multi-household isolation foundation (2026-10-10)

**Current project:** independent repository `dougalbob/simple-finance-multi-household`, copied from the original
single-household product. The old v0.x release preparations, tags, package digests and implementation decisions
below are upstream history only; do not apply them to the new package or installation without explicit review.
The complete active contract is [`MULTI_HOUSEHOLD_PLAN.md`](MULTI_HOUSEHOLD_PLAN.md). See also [`AGENTS.md`](../AGENTS.md),
[`README.md`](../README.md), [`SPEC.md`](SPEC.md), [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) and
[`RELEASE_PROCESS.md`](RELEASE_PROCESS.md).

## Approved decisions

- One application installation serves separate households. A household may have **up to two assigned sign-in
  identities**; its `people` attribution records are separate and are not capped at two. A one-person household
  is complete.
- Cloudflare Access + Google verifies identities. The app's administrator pre-assigns each email to a household
  before first login; there is no self-sign-up. A Cloudflare-allowed but unassigned identity is denied by the app.
- Each household will have its own SQLite database and documents directory. A separate central system registry
  contains membership/admin/support metadata, not financial records. All server access, files, backups and restore
  operations must be scoped to the verified household, including when requests from different households happen
  at the same time.
- The app admin has no standing in-app access to another household's financial data. A member may grant/revoke
  visible, audited, time-limited support access, read-only by default. Host-admin access to raw Unraid files is an
  accepted limitation.
- Original Unraid deployment remains bridge / host `3007` → container `3000` / appdata
  `/mnt/user/appdata/simple-finance`. New deployment is bridge / host **`3009`** → container `3000` / appdata
  **`/mnt/user/appdata/simple-finance-multi-household`**. Never mount or alter the original data path or route.
- The only image allowed is `ghcr.io/dougalbob/simple-finance-multi-household`; the original
  `ghcr.io/dougalbob/simple-finance` is forbidden. CI and Publish hard-fail for a wrong GitHub repository and
  ignore inherited v0.x tags as release/upgrade bases.
- First candidate is `v1.0.0-rc.1`; RCs publish only their version and SHA tags and never move `latest`. Accepted
  production release is a separate `v1.0.0` tag; stable releases alone may move `latest`.

## State of this foundation change

This change updates the operating contract, product/spec/implementation docs, template defaults and guarded
CI/Publish workflows. It does **not** implement household routing, registry, admin UI, support-consent flow, tenant
backups, data migration, or change the current source app version. No release tag or image is to be created from
this change. The production app and the recent encrypted backup have not been mounted, restored or modified.

The local backup taken on 2026-10-10 is a candidate **dry-run source** while it remains current; use only an
isolated copy for migration rehearsal. Before a later real-data cutover, take a fresh backup if source data has
changed and verify the archive/password and attachments through an isolated restore.

## Next implementation work after this foundation

1. Implement the small system registry and administrator onboarding/pre-assignment, including one-or-two member
   enforcement and first-login denial for an unassigned email.
2. Replace the single process-wide DB assumption with safe per-household request context/handles; scope every read,
   write, document operation, cache, audit and API.
3. Add explicit consent-based, revocable, expiring support access and audit visibility.
4. Make household backup/restore contain only the selected household's DB and attachments; separately recover the
   system registry/configuration.
5. Rehearse import of the owner's existing database and documents into the owner's tenant using an isolated copy;
   test a second empty household, concurrent requests, unauthorized access and the real Cloudflare path on host
   port 3009 before migrating any live data. With a consenting test account holder, use a separately signed-in
   mobile Google account and separate test route/household to verify first login; confirm an unassigned identity
   is denied.
6. Prepare `v1.0.0-rc.1` only after implementation and acceptance gates are complete; publish only to the new GHCR
   package. Promote to separate `v1.0.0` only after RC acceptance.

---

# Historical upstream release preparation and handoff records

# Release prep: v0.39.0 — Where the money goes, and Horizon totals (decisions 194–195)

**Status at PR preparation:** the household approved the Horizon totals on the preview, and approved the Charts pie in this session ("I like it … happy with the scope of the chart"). This is a pre-merge record only. It asserts no merge, tag, Publish run, GitHub release or registry digest. After publication, the next working session must add independently verified post-merge facts at the top, per decision 173.

## What changed

- **Horizon totals (decision 194).** Each card's heading shows its total beside the count: commitments, expected money in, day-to-day. Summed from the same lists each card renders. Expected money in keeps its "≈ … expected — never received" support lines.
- **Where the money goes on /charts (decision 195).** A pie of net spending by parent category over a window, with Personal split per person (`targetKind = person`, one slice each; household-marked personal spending is its own unsplit slice). Default window: payday cycle (last payday up to the day before the next; weekend shift per decision 112). Selector: payday cycle, previous payday cycle, calendar month, custom. Category include/exclude checkboxes. Slice drill-down to line items. Everything is a GET form and link, server-rendered SVG, no client JavaScript. Pure arithmetic in `src/lib/records/spending-mix.ts`; view assembly in `getSpendingMixView` (`charts-view.ts`); `recentScheduledIncomeDates` in `money-view.ts`.
- **Version.** 0.38.0 → 0.39.0 in `package.json`, `package-lock.json` (root and `packages[""]`), `src/lib/version.ts`, `simple-finance.xml` and `docs/RELEASE_NOTES_v0.39.0.md`.
- No schema, migration, backup-format or dependency change.

## Gates at PR preparation

`npm test`: **749 passed**, 178 suites, 0 failed (723 before, plus 26 new in `tests/spending-mix.test.ts` and `tests/spending-mix-view.test.ts`). `npm run typecheck`, `npm run format:check`, `npm run themes:check` and `npm run build` passed. `npm audit --omit=dev`: 0 vulnerabilities. Local Playwright was not run for this release (the household asked for it to be skipped for now). The PR's `gates`, `browser` and `docker` checks are mandatory and must all be green before merge. Do not infer their status from these local results.

## Not verified

- A real phone or laptop browser render of the pie. The layout is checked through server HTML only, and the phone and laptop variants are both present, following the other charts.
- Entertainment & Eating Out is not split per person. This is as built and was not changed in this release.

## What the household does

In Unraid, take a backup, then Force Update. The version badge should read `v0.39.0 · pre-release`.

---

# Release prep: v0.38.0 — Annual vehicle payments as ÷ 12 and PDFs read in the app (decisions 190–193)

**Status at PR preparation:** the household approved, in order: PDF.js as a new dependency; road tax as built; the release once PDF was implemented; the tag and Publish. This is a pre-merge record only. It asserts no merge, tag, Publish run, GitHub release or registry digest. After publication, the next working session must add independently verified post-merge facts at the top, per decision 173.

## What changed

- **Running costs (decision 190).** A converted annual schedule payment against a vehicle is spread as one twelfth in each of the twelve months it covers, starting in the month it is paid. Insights labels spread rows and footnotes them, and its subtitle names the one exception to exact reconciliation. Overview shows a one-line note. Purchases, the month comparison, Horizon and Charts stay on the payment date.
- **Road tax (decision 193).** Confirmed as built: an annual road-tax payment against a vehicle is spread too. None is annual today, so nothing changes until one is added.
- **PDFs in the app (decisions 191–192).** Full screen on a phone. PDF.js (`pdfjs-dist`, Apache-2.0, legacy build) draws each page to a canvas, fitted to the viewer's width, and only the pages near the screen. The footer holds Open in PDF app and Download. One code path for every device; nothing checks which phone it is. Text is not selectable or searchable in the reader, and standard-font data is not shipped, so a non-embedded font is drawn with a stand-in.
- **Version.** 0.37.0 → 0.38.0 in `package.json`, `package-lock.json`, `src/lib/version.ts`, `simple-finance.xml` and `docs/RELEASE_NOTES_v0.38.0.md`.
- No schema, migration or backup-format change. One new dependency: `pdfjs-dist`.

## Gates at PR preparation

`npm test`: **723 passed**, 172 suites, 0 failed (717 before, plus 6 geometry tests). `npm run typecheck`, `npm run format:check`, `npm run themes:check` and `npm run build` passed. `npm audit --omit=dev`: 0 vulnerabilities. The attachments project passed 3/3 locally. The full local browser run is recorded in the release notes. The PR's `gates`, `browser` and `docker` checks are mandatory and must all be green before merge. Do not infer their status from these local results.

## Not verified

- A real iPhone Safari or Android Chrome. The reader is proven on the headless Chromium used here, which draws pages through pdf.js. The production build emits the worker, and `next start` serves it (HTTP 200, `application/javascript`, identical bytes). The household's phones are the test that remains.
- The household's live car-insurance data: whether its recurring payment targets the car, and whether earlier years exist as purchases (decision 193).

## What the household does

In Unraid, take a backup, then Force Update. The version badge should read `v0.38.0 · pre-release`. Then open a PDF attachment on each phone and check that it displays, scrolls and opens in a PDF app.

---

**v0.37.0 — verified post-merge facts (recorded per decision 173, by the session after its merge):**

- Merge commit `abbd1374799fb733faa0554e52b44983b8a48aa9` (PR #98). The annotated tag `v0.37.0` points at that merge commit.
- Publish run `37916778432` succeeded. The GitHub release `v0.37.0` was published 2026-10-09T10:22:29Z and is marked Latest.
- Digest `sha256:f5610d92ca1b5d312db355c75c2d82af2320ac07cc7f46c94e9b834af932cfa2`, as printed in the release body by the Publish run's own registry check, shared by `v0.37.0`, `latest` and `sha-abbd137`. This sandbox cannot reach ghcr.io (SANDBOX entry 6), so this session did not repeat that check.

---

**v0.36.0 — verified post-merge facts (recorded per decision 173):**

- Merge commit `005e1e6022df02863b625e70155059b90e3d4fee` (PR #97); PR CI run `37820874589` and `main` CI run `37822242713` — all green.
- Annotated tag `v0.36.0` points at that merge commit; Publish run `37823382583` succeeded, and the release is marked Latest.
- Digest `sha256:cc04dcb8b1cae6d80eb61cc25c21874523a9c82e7d655120eea1b1c60aeb3d89` on `v0.36.0` / `latest` / `sha-005e1e6`, differing from v0.35.0's `sha256:7bc3ba04259697e1b6c4ba2cbb8afa71bb3b0846b967f765bc24b274fd3efa63`.

# Release prep: v0.37.0 — Clearer payday outlook and checkpoint balances (decisions 187–189)

**Status at PR preparation:** the preview and changes were approved by the household. This is a pre-merge record only; it asserts no PR, merge, tag, Publish run, release or registry digest. After publication, the next working session must add independently verified post-merge facts at the top, per decision 173.

## What changed

- Exclude all projected day-to-day spending on the actual main salary date only; the shared payday calculation feeds Quick Entry, home, Overview and Horizon. Other receipt dates still include day-to-day spending.
- Keep the home card short: payday, household low, one worst-pot bills-only transfer nudge and Horizon link. Remove the overdraft-fees sentence. The optional day-to-day guide is qualified, assumes the named pot pays for it, and is not a strict allocation; the five-day transfer lead stays.
- Keep Overview's figures and transfer warning but move dated forecast detail to Horizon. On desktop, place the Till above—not instead of—the existing home dashboard; mobile order is unchanged.
- Make the negative salary-window low explicit, with the date in the heading and the approved shortfall wording. In the selected-pot warning, remove the first-due bill detail and show a separate optional guide only when projected day-to-day spending is positive.
- Rename only the visible Balance tab to **Checkpoint**. The Purchase view shows **Last checkpoint** (same amount, age and local timestamp), then a separate **current account balance** derived from the latest running balance in All Transactions—not from a live bank connection.
- No schema, migration, backup-format or dependency change. The full notes are in `docs/RELEASE_NOTES_v0.37.0.md`; detailed decisions are 187–189 in `docs/IMPLEMENTATION_PLAN.md` and the aligned behaviour is in `docs/SPEC.md`.

## Gates at PR preparation

`npm test`: **703 passed** / 169 suites, 0 failed · `npm run typecheck`, `npm run format:check`, `npm run themes:check` and `npm run build` passed · `npm audit --omit=dev`: 0 vulnerabilities. The approved preview was served from the preserved `.e2e-data/simple-finance.sqlite` fixture. Local Playwright was not run because this sandbox has no Chromium binary; the PR's `gates`, `browser` and `docker` checks are mandatory and must all be green before merge. Do not infer their status from these local results.

## What the household does

After the release is published, in Unraid: take a backup, then Force Update. The badge should read `v0.37.0 · pre-release`.

---

# Handoff: v0.36.0 — A shorter payday card on the phone home (decision 186)

**v0.35.0 — verified post-merge facts (recorded per decision 173):**

- Merge commit `2bd0371ecbb9ef7e0eb19ec087636ba351080182` (PR #96, from `arena/fefa6e6c-simple-finance`,
  merged 2026-10-08T16:23:43Z, merge commit not squash).
- PR CI run `37807552570` (green on the head), `main` CI run `37808440884` and Publish run
  `37809769954` — all green.
- Annotated tag `v0.35.0` (tag object `191d9a9b3fff6637b09d23e8a6ae99cac3a5eaf8`) points at that merge
  commit; the GitHub release "v0.35.0 — Tap a day-by-day amount to see what it is made of" was published
  2026-10-08T16:37:18Z and is marked Latest.
- Digest `sha256:7bc3ba04259697e1b6c4ba2cbb8afa71bb3b0846b967f765bc24b274fd3efa63` on `v0.35.0` /
  `latest` / `sha-2bd0371`, differing from v0.34.0's `sha256:e1c6ee54…`.

**v0.34.0 — verified post-merge facts (recorded per decision 173):** merge commit
`d957567bb9b194c6a18560576aead48de0a0526b` (PR #95, merged 2026-10-08T14:26:38Z); `main` CI run
`37792505570` and Publish run `37793933963` green; annotated tag `v0.34.0`; digest
`sha256:e1c6ee54d7649d84aea1e17b7abf94e69178e8c488b505975b7281dd1178473a` on all three tags.

## What changed

- **The phone home's payday card is a summary, not the panel (decision 186).** The household's own copy:
  "Next pay day is 26th October (18 days from today)"; the household low from the liquid balance with "no
  additional unplanned spending" and the fee verdict; the amber "Plan a transfer?" line; "See full
  projection detail in the Horizon page." The balance named is `liquid_available_now` — bank and cash pots,
  card debt ignored, because that is what the low is derived from. The feature sentence follows the tier
  (§8): inside the threshold it says no fees, past it says fees are likely and names the threshold.
- **One pure builder, two surfaces.** `buildPaydaySummary` / `paydaySummaryFromView`
  (`src/lib/records/payday-summary.ts`) build the sentences; the home card
  (`src/components/payday-summary.tsx`) and the Overview pot watch both render them, so the two cannot
  disagree. Wording is pinned to the character in `tests/payday-summary.test.ts` against the household's
  worked example (26th October, £242.22, −£165.25, Natwest £850.00 by the 16th).
- **The transfer sentence names what is really due.** `TRANSFER_LEAD_DAYS = 5` (a constant, not a setting);
  the bill noun comes from `scheduleKind` on the commitment lines ("Direct Debits", "standing orders", or
  both) — `ProjectionScheduleLine.scheduleKind` and `PotWatchResult.earliestCommitments[].scheduleKind` are
  new, and `money-view.ts` fills them. Three bill names, then "and N more"; once the five-day lead has
  passed the sentence says "as soon as you can" instead of a past date.
- **Overview keeps its panel, minus duplicate prose.** The weekly pace line (the till on the same page
  already carries it) and the two footnote paragraphs under "Expected support" and "Projected shops and
  fills" are gone; the figures, the expansions, the day-by-day table and the pot watch stay. Horizon is
  untouched.
- **Horizon link carries payday − 1** (`/horizon?through=…`) — the same date Horizon's own default
  resolves (decision 150), so the tap lands on the window the summary described.
- **New shared date helper.** `formatDayMonthLocalDate` and `ordinalDay` in `src/lib/time.ts` ("26th
  October", plus the year when it is not today's year). `src/app/income/page.tsx`'s private `ordinal` was
  replaced by the shared one.
- No schema, migration, backup-format or dependency change. Version 0.36.0 in all five places.

## Gates at PR preparation

`npm test`: **696 passed** / 168 suites, 0 failed (25 new) · `npm run typecheck` clean · `npm run format:check` clean ·
`npm run themes:check` clean · `npm run build` clean (`next-env.d.ts` restored) · `npm audit --omit=dev`
zero · Playwright: see the release PR description and `docs/SANDBOX.md` entry 8 for the local run
(overlay `playwright.local.config.ts`, never committed).

## What a future session should know

1. **Record v0.36.0's post-merge facts at the top of this file** (merge commit, PR CI and main CI run IDs,
   tag, Publish run, digest vs v0.35.0's `sha256:7bc3ba04…`), per decision 173.
2. **The transfer nudge no longer ends with "Transfers stay explicit — record one when you decide."** The
   household's copy ends at the deadline. The `TransferForm` on the till's Move tab is the recording path;
   put the sentence back only if they ask.
3. **A past-due transfer deadline says "as soon as you can"** rather than naming a date — the one place the
   wording departs from the household's literal text, chosen so the card cannot tell them to transfer by a
   date that has already gone.
4. **The five-day lead is a code constant.** If the household wants to tune it, promote `TRANSFER_LEAD_DAYS`
   into the settings table beside the renewal/contract leads (Settings → Warning leads).
5. Open items carried forward are unchanged: the Horizon "untick all pots" question, the Insights
   groceries/fuel rule asymmetry (decision 183/184), and the day-by-day line → record links.

## What the household does

In Unraid: take a backup, then Force Update. The badge should read `v0.36.0 · pre-release`.

---

# Handoff: v0.35.0 — Tap a day-by-day amount to see what it is made of (decision 185)

## What changed

- **Horizon Day by day amounts open their breakdown inline (decision 185).** Commitments, Expected
  money in and Day-to-day amounts are tappable. The breakdown opens beneath that date's row, one at a
  time, and closes on a second tap or Close. Components: `src/app/horizon/day-by-day-table.tsx` (client),
  `buildHorizonDayDetails` and `describeDayToDayBasis` in `src/lib/records/horizon-days.ts` (pure), and
  `page.tsx` now passes the day rows plus the per-day details into the table.
- **Projected shops and fills record their basis.** `ProjectedDayToDayEvent` gained `basis`
  (`anchor` | `overdue` | `never`), `anchorDate` and `cadenceDays`, set in `projectDayToDayEvents`
  (`src/lib/records/day-to-day.ts`). The figures are unchanged.
- **Gotchas for future work.** Keep amount-button labels free of the words "Day-to-day" so that
  `getByLabel('Day-to-day')` (the form select, used in `e2e/horizon.spec.ts`) keeps resolving to one
  element. The panel is pinned to `min(calc(100vw-6rem),36rem)` because the table scrolls sideways on a
  phone. Windows over 60 days open Day by day closed by default.
- **Verification run locally.** `npm test` 671 passed; typecheck, format, themes, build and
  `npm audit --omit=dev` clean; Horizon Playwright project 10/10 via the `docs/SANDBOX.md` entry 8 route.
  The full browser suite runs in CI.
- **Open item (not in this release).** Nothing new. The day-by-day tap does not yet offer a link from a
  line to its Purchases or Schedules record; say if the household wants that.

## What the household does

In Unraid: take a backup, then Force Update. The badge should read `v0.35.0 · pre-release`.


**v0.33.0 — verified post-merge facts (recorded per decision 173):**

- Merge commit `d0c3d1a3ace569d60b9c5f946effb92abfa33900` (PR #94, from `arena/2d58da4f-simple-finance`,
  merged 2026-10-08T08:44:37Z, merge commit not squash).
- PR CI run `37750742324` (green on head `b67728ec…`), `main` CI run `37751866330` and Publish run
  `37753147792` — all green.
- Annotated tag `v0.33.0` (tag object `2bde766f…`) points at that merge commit; the GitHub release
  "v0.33.0 — Running balance in All Transactions" was published 2026-10-08T08:59:55Z and is marked Latest.
- Digest `sha256:34643a0a8aeaa628f6f17a8db154f49c72206ca86558bdd79ad53f6245c29029` on `v0.33.0` /
  `latest` / `sha-d0c3d1a`, differing from v0.32.0's `sha256:9c339e02…`.

**v0.32.0 — verified post-merge facts (recorded per decision 173):**

- Merge commit `83ffd1d2f4222e24069817d1bd3e35557eda20cf` (PR #93, merged 2026-10-01T22:26:36Z).
- `main` CI run `36935088332`, Publish run `36937299990`; annotated tag `v0.32.0` (tag object `5760e543…`).
- Digest `sha256:9c339e02ff4b529da82ee8a7ca31a038d3ef0b45245c747d29bdf05cdcae657d` on `v0.32.0` /
  `latest` / `sha-83ffd1d`, differing from v0.31.0's `sha256:f82d3d31…`.

## What changed

- **Charts groceries average counts recorded weeks only (decision 183).** The start of recording is
  derived, not stored: `firstRecordedPurchaseDate` in `src/lib/records/recording.ts` (earliest
  non-voided, non-schedule-converted purchase). A week counts only if it is complete and begins on or
  after that date (`isRecordedWeek` in `src/lib/records/insights.ts`). Empty weeks inside the recording
  period are zero weeks. Nothing recorded means no average and no drift. Worked example: recording from
  Mon 14 Sep 2026 gives £46.67 a week over 3 complete weeks, not £17.50 over 8.
- **Insights fuel comparison counts the part-recorded first month (decision 184).** `isRecordedMonth`:
  a calendar month counts when its last day is on or after the recording date. The average divides by
  counted months only; with none there is no average and no drift. The panel says "per week" or "per
  month" and warns when recording began on a day other than the 1st. Worked example: configured £75,
  September £50 (recording from 17 Sep), July and August £0 → average £50.00 over 1 month, drift −£25.00.
  The old rule gave £16.67 (£50 / 3).
- **Decision 67** (the panel honesty loop) now records both rules; groceries and fuel deliberately differ
  until the household says otherwise.
- **Schedule category stays forward-only** (pinned by `tests/schedule-category-correction.test.ts`,
  commit `62c2aea`). A converted payment keeps its category; the one-off fix is an audited Edit on the
  Purchases page. This is closed and was not changed.
- No schema, migration, backup-format or dependency change. Version 0.34.0 in all five places.

## Gates at PR preparation

`npm test`: **660 passed** / 158 suites · `npm run typecheck` clean · `npm run format:check` clean ·
`npm run themes:check` clean · `npm run build` clean (`next-env.d.ts` restored) · `npm audit
--omit=dev` zero · Playwright: see the release PR description and `docs/SANDBOX.md` entry 8 for the
local run (overlay `playwright.local.config.ts`, never committed).

## What a future session should know

1. **Record v0.34.0's post-merge facts at the top of this file** (merge commit, PR CI and main CI run
   IDs, tag, Publish run, digest vs v0.33.0's `sha256:34643a0a…`), per decision 173.
2. **Open follow-up, not in this release:** the groceries rule (whole weeks starting on or after the
   start) and the fuel rule (any month containing or after the start) differ on purpose. Offer to align
   them only if the household asks.
3. **Known limit (decision 183):** a purchase back-dated to before launch moves the recording start back,
   and those weeks count again. The fix is to correct that date, not the rule.
4. Phase 3 and Phase 4 of `PROJECTS_IMPLEMENTATION.MD` are unchanged from v0.32.0 below.

---

# Handoff: v0.32.0 — Projects Phase 2: the Cheapest Combination optimiser (decision 182)

**v0.31.0 — verified post-merge facts (recorded per decision 173):**

- Merge commit `b61477df4a5d61f3a2136e1d5f08d2bac300c2b8` (PR #92, merged 2026-10-01T14:09:38Z).
- PR CI run `36872715966`, `main` CI run `36874163652` and Publish run `36875360817` — all green.
- Annotated tag `v0.31.0` points at that merge commit; the GitHub release is marked Latest.
- Digest `sha256:f82d3d31f97a4861e26f334fd043a2801c3a32326014890de7db848b2d753c9b` on `v0.31.0` /
  `latest` / `sha-b61477d`, differing from v0.30.0's `sha256:22d8fac6…`.

## What changed

- `cheapestCombination` in `src/lib/projects/costing.ts`: exact two-stage solver (supplier-subset
  enumeration, then branch-and-bound over assignments) over in-stock quotes with every delivery
  rule applied; also best single supplier, the naive cheapest-per-row baseline, uncoverable items.
- `/projects/[id]` gains an optimiser bar above the matrix: manual selection vs ⚡ cheapest split
  vs 🚚 best single supplier, with one-click Apply (`applyProjectPlanAction` →
  `applyProjectSelections`: one transaction, audited, server recomputes and refuses stale totals).
- No schema, migration or dependency change. SPEC §27.6–27.7, decision 182,
  `PROJECTS_IMPLEMENTATION.MD` (Phase 2 ticked, session 2 logged, OQ-P3 updated, OQ-P4 added).

## Gates at PR preparation

`npm test`: **637 passed** / 149 suites (19 new in `tests/projects-optimiser.test.ts`) · `npm run
typecheck` clean · `npm run format:check` clean · `npm run themes:check` clean · `npm run build`
clean (`next-env.d.ts` restored) · `npm audit --omit=dev` zero · Playwright **114 passed** across
every project via SANDBOX entry 8 (~6 min locally), including the new `e2e/projects.spec.ts` (own
`projects` project in `playwright.config.ts`, before `backup`).

## What a future session should know

1. **Record v0.32.0's post-merge facts at the top of this file** (merge commit, PR CI and main CI
   run IDs, tag, Publish run, digest vs v0.31.0's `sha256:f82d3d31…`), per decision 173.
2. Phase 3 (holiday/bundle refinements) and Phase 4 (`compare_options` / TCO) are next in
   `PROJECTS_IMPLEMENTATION.MD` §7. The optimiser is `mix_and_match` only; the bar is hidden for
   `compare_options` projects.
3. Open household questions: OQ-P3 (out-of-stock quotes skipped — implemented, awaiting
   confirmation) and OQ-P4 (should the optimiser suggest Click & Collect?). OQ-P1/OQ-P2 and the
   app-level OQ15 are unchanged.
4. The Phase 2 demo figures are asserted to the penny in `tests/projects-optimiser.test.ts` (split
   £1,061.50, single supplier Wickes £1,152.00 over the fence fixture) — changing the demo's prices
   means changing those tests too.

---

# Handoff: v0.31.0 — Projects Phase 1: the DIY costing matrix & delivery rules (decision 181)

**v0.30.0 — verified post-merge facts (recorded per decision 173):**

- Merge commit `5a609a51f6fd71b0b7416e611825bee5f93a8eff` (PR #91, from `arena/01a0ee6b-simple-finance`,
  merged 2026-09-30T05:17:27Z).
- PR CI runs `36672731548` (first) and `36673487980` (docs follow-up), `main` CI run `36674261498`
  and Publish run `36675052878` — all three jobs green in every run.
- Annotated tag `v0.30.0` points at that merge commit; the Publish run succeeded, including the
  registry-tag verification and the GitHub release.
- Digest `sha256:22d8fac6888ff1981d8de46ccdda458bf5511259e304ab3b144a31a3e47e82b8` on `v0.30.0` /
  `latest` / `sha-5a609a5`, differing from v0.29.0's `sha256:426ad031…`.

## What changed

- **Projects (SPEC §27) — Phase 1 of the Project Costing & Supplier Optimiser.** A planning
  workspace for future spending: materials down the side, per-project suppliers across the top,
  quotes in the cells, and delivery rules that know one fee covers a whole order. The feature's
  working plan, **session-by-session status log** and open questions live at the repo root in
  [`PROJECTS_IMPLEMENTATION.MD`](../PROJECTS_IMPLEMENTATION.MD) — read it before touching this
  area. It also carries the standing rule: **that file and the repo docs are refreshed just before
  any PR, every session.**
- Migration `0016_projects` adds `projects`, `project_items`, `project_suppliers`,
  `project_quotes` (integer pence, `version` counters, audited writes; `project_mode` and
  `cost_frequency` already carry the Phase 4 shape). Pure costing module
  `src/lib/projects/costing.ts` owns line costs (pack rounding), delivery evaluation (fee once per
  used supplier, free-delivery threshold + "£X away" hint, Click & Collect), grouped order totals
  and the +20% VAT typing helper. Domain `projects.ts`, view `projects-view.ts`, fictional
  "Back Garden Fence Replacement" demo `demo.ts` (e2e + preview seeds, figure-exact tests).
- UI: `/projects` and `/projects/[id]` (suppliers & delivery bar, clickable matrix with inline
  quote forms + the +20% VAT helper, "No supplier" clear column, supplier-grouped shopping list,
  grand total vs target budget). Nav gained Projects (bar + drawer; the three e2e nav assertions
  updated). A `compare_options` project shows an honest "arrives in a later phase" note.
- **Charts honesty fix (pre-existing, exposed on 1 October):** the personal-spending table twin
  linked £0.00 cells the stacked chart does not draw; zero cells now print unlinked.
- **Dependency:** `npm audit fix` moved the lockfile `next` **16.3.5 → 16.3.8** (new critical
  advisory GHSA-vcvr-r3jv-pc5j — RCE in `next/og`) within the existing `^16.3.5` range; tests and
  build re-ran green on the patch. Full test count **586 → 618**; `__drizzle_migrations` counts in
  tests/backup-restore.test.ts moved 16→17.

## Gates at PR preparation

`npm test`: **618 passed** / 147 suites (32 new across `tests/projects-costing.test.ts` and
`tests/projects.test.ts`, incl. the figure-exact fence demo: materials £1,073.50 + delivery
£10.00 = grand £1,083.50, £116.50 under the £1,200 budget) · `npm run typecheck` clean ·
`npm run format:check` clean · `npm run themes:check` clean · `npm run build` clean
(`next-env.d.ts` restored) · `npm audit --omit=dev` zero · Playwright **113 passed** across every
project via SANDBOX entry 8 (~7 min locally), including the Projects nav assertions, the bell's
drawer-link count (14→15) and the charts bar/table twin on a month boundary.

## What a future session should know

1. **Phase 2 is the "Calculate Cheapest Combination" optimiser** (PROJECTS_IMPLEMENTATION.MD §7):
   exact subset solver over supplier combinations in `costing.ts`, with the manual-vs-auto-vs-best-
   single action bar. The pure module's shapes were built for it — extend, don't rewrite.
2. The demo fixture (`src/lib/projects/demo.ts`) is the shared figure-exact scenario — tests assert
   its totals to the penny; changing its prices means changing `tests/projects.test.ts`.
3. Project suppliers are deliberately NOT the §21 contact book (OQ-P1). Deletion is allowed and
   audited (OQ-P2); the Phase 2 optimiser skips out-of-stock quotes (OQ-P3). All three are in
   PROJECTS_IMPLEMENTATION.MD §8.
4. The bell's phone drawer test counts links exactly (`toHaveCount(15)`) — the next nav entry moves
   it again.
5. OQ15 remains the next app-level open question; nothing here touches the money pipelines,
   backup format or the release loop.

---

# Handoff: v0.30.0 preparation — a more dimensional, theme-aware interface (decision 180)

## What changed

- The global canvas has a broad, faint accent wash, driven by the active theme.
- The household-total card on `/` and `/overview` now gets a restrained accent gradient, more deliberate figure hierarchy and the stronger shared elevation token.
- `shadow-sm` and `shadow-md` now use theme-derived till colours with a subtle top edge, so common cards feel raised in both light and dark modes; the sticky header uses the same language.
- Home-page destination links lift by 2px on hover-capable devices only, disable motion for `prefers-reduced-motion`, and expose a keyboard focus ring.
- No theme catalogue changes, data or calculation changes, schema/migration, new dependency or backup-format change. SPEC §15.2, decision 180, release notes, and all five version places are updated.

## Gates at PR preparation

`npm test`: **586 passed** / 139 suites · `npm run typecheck` clean · `npm run format:check` clean ·
`npm run themes:check` clean · `npm run build` clean (`next-env.d.ts` restored) ·
`npm audit --omit=dev` zero · Playwright **113 passed** across every project via SANDBOX entry 8,
including the actual Overview card's light/dark gradient and shadow assertion. PR #91 is open from
the fixed session branch. Its first CI run, `36672731548`, passed all three jobs (gates, browser and
Docker/upgrade smoke); this handoff update will trigger another run, which must pass before merge.
The release-image publish and registry verification remain after merge.

## Delivery status

- The Arena/GitHub connector is active; v0.29.0's post-merge facts are verified below. PR #91 is the
  v0.30.0 release PR.
- OQ15 remains the next open question. No unrelated OQ14 work is included.

---

# Handoff: v0.29.0 — Overview panel names link into filtered Purchases (decision 179)

**v0.29.0 — verified post-merge facts (recorded per decision 173):**

- Merge commit `60da8ce39fb36db6672e3caf91bb4882a4bc5d53` (PR #90, merged 2026-09-28T12:29:24Z).
- PR CI run `36421342611` and `main` CI run `36422157028` green; all three jobs passed in both runs.
- Annotated tag `v0.29.0` points to that merge commit; Publish run `36423242855` succeeded, including
  registry-tag verification and GitHub release creation.
- Digest `sha256:426ad0313aaa4d3927e4ff628f3dd85958d19e674467abd87ecc3db4bb5445b3` on `v0.29.0` /
  `latest` / `sha-60da8ce`, differing from v0.28.0's `sha256:da74bb0b…`.

**v0.28.0 — verified post-merge facts (recorded per decision 173):**

- Merge commit `34c785b87ec547ac198385afb6893f1e7b742f9b` (PR #89, from `arena/01a0e796-simple-finance`).
- PR CI run `36414694257` and `main` CI run `36415738551` green.
- Annotated tag `v0.28.0` points to that merge commit; Publish run `36416711842` succeeded.
- Digest `sha256:da74bb0b3132515da7c66445f2f14ef781379121f4110f5d3876918144d6c474` on `v0.28.0` / `latest` / `sha-34c785b`, differing from v0.27.0's `sha256:d037f522…`.

## What changed in v0.29.0

- Overview's month-to-date parent names are real links, named accessibly for the category, to Purchases filtered by the current parent ID from the live `categoryTree(db)` (never hard-coded names or IDs). Purchases' existing parent expansion includes all children.
- Overview's vehicle names are real links, named accessibly for the vehicle, to Purchases filtered by `targetKind=vehicle` and its `vehicleId`.
- Chosen default for decision 179: **pin the date windows** to the panel figures. Month-to-date uses the first of this month through today; rolling vehicle costs use `rolling12From` through today. No figure or counting rule changed.
- No schema change or migration. SPEC §15.2 and §16, decision 179, the five version places, and `docs/RELEASE_NOTES_v0.29.0.md` updated.

## Gates at close

`npm test`: **586 passed** / 139 suites · `npm run typecheck` clean · `npm run format:check` clean ·
`npm run build` clean (`next-env.d.ts` restored) · `npm audit --omit=dev` zero · Playwright **112 passed**
across every project via SANDBOX entry 8, including the desktop link/window assertions. The first browser
run caught an over-escaped digit regex in the new assertion; after correction, the full suite passed.

## What a future session should know

1. **Record v0.30.0's post-merge facts at the top of this file** (merge commit, PR CI and main CI run IDs,
   annotated tag, Publish run, registry digest and comparison with v0.29.0), per decision 173. This is
   intentionally the next session's post-merge handoff step.
2. The parent link resolver is name→ID over the live `categoryTree(db)`, because the month summary rows
   contain only names. Category names are unique among parent siblings; category records are not deleted.
3. The query strings deliberately include inclusive `from` and `to` dates so Purchases does not silently
   fall back to last 30 days. Browser assertions cover both windows and the category link's filtered form.
4. No data-mutating e2e test was added; all 112 existing project tests pass in their established order.
5. OQ15 remains the next open question; OQ14 (stale-pot noticed item) is still the household's call.

---

# Handoff: v0.28.0 — checkpoint cash at the till, pot owners, and the renamed pots page (decision 178)

## What changed

- **Checkpoint cash (the brief's ask #1):** a collapsed "Checkpoint cash" button in the Quick
  Entry header, between the heading and the "Mobile-first entry…" line (the household chose this
  placement from options). It opens a small card locked on the **signed-in person's own cash pot**
  via the new pot Owner link; a counted amount, optional note, Save. Locked = exactly one cash pot
  owned by the viewer person (the decision-146 person, `data.defaultPersonId`); anything else falls
  back to a cash-pots-only select (the household chose this over hiding the card). The card shows
  the last count's **age only** — cash balances still never appear at the till (§15.1). A save
  clears the amount (decision 174's rule) and keeps the card open on its confirmation.
- **Pots gain an optional `owner_person_id` (migration `0015_pot_owner`):** drizzle-kit generated,
  then extended before shipping with `UPDATE pots SET overdraft/warning = NULL WHERE kind='cash'`
  (normalisation; editing pre-ship SQL is legal, shipped SQL is not — decision 172). Domain rules:
  create/edit validate the owner exists; cash pots carry no limit/threshold on any write path
  (kind switched to cash clears them, like card settings for non-card kinds).
- **Cash pot cards hide the overdraft/threshold `dl`** on /pots, and the PotEditForm hides the two
  inputs for cash (a note explains; converting kind needs a second edit to set a limit — stated).
- **/pots order (the brief's ask #3):** Record a balance checkpoint card, then Add a pot, then the
  pot cards. **Label (ask #4):** eyebrow "Accounts, pots & checkpoints"; nav/prose "Accounts, Pots
  & Checkpoints" — site-nav (bar + drawer), /pots header, and the prose links on home, Overview,
  Horizon and Contracts all updated; the two nav assertions in e2e updated to match.

## Calls made without the household's answer

None — the three open choices (owner-on-pot vs setting vs no link; label wording; no-owner
fallback) were asked and answered in-session. Everything else follows standing decisions.

## What a future session should know

1. **The `checkpoint` e2e project's spec still posts through the /pots checkpoint card** — it now
   sits above the pot cards; the locator is `aria-labelledby`, so order didn't break it.
2. **The new `cash-checkpoint` e2e project** (before `backup`): saves a £42.10 checkpoint on Alex's
   cash, then rewrites Alex's cash Owner to Shared and back. Projects after it see Owner set.
   `home.spec`'s new disclosure test is deliberately read-only (opens and closes the card).
3. **`buildEntryData` now sends `ownerPersonId` and `cashLastCountedLabel` per pot** — cash keeps
   `checkpoint: null` (no amount at the till) but gains the age label. The household fixture and
   the e2e seed both link Alex's cash→Alex and Sam's cash→Sam now (people are created first).
4. **Two `__drizzle_migrations` counts in tests/backup-restore.test.ts moved 15→16** — the next
   migration bump moves them again; they say "one row per applied migration".
5. **Backup/restore of a 0015 database is unchanged** (column travels inside the snapshot). A
   restore of an *older* archive onto a new installation re-runs 0015 on startup via the entrypoint
   — the upgrade test covers the production runner path.
6. The label rename touched prose in five page files; a future rename should start from
   `grep -rn "Accounts" src` plus the site-nav entries and the two e2e nav assertions.

## Gates at close

`npm test` **586 passed** / 139 suites · `npm run typecheck` clean · `npm run format:check` clean ·
`npm run build` clean (`next-env.d.ts` restored afterwards) · `npm audit --omit=dev` zero.
Playwright **112 passed** across every project via the SANDBOX entry 8 overlay (103 before, plus 4
in the new `cash-checkpoint` project and 1 in `home.spec`; the temporary
`playwright.local.config.ts` was removed before commit).

## Housekeeping still open

- OQ15 remains the next open question; OQ14 (stale-pot noticed item) is still the household's call.
- The next working session records v0.28.0's post-merge verified facts (merge SHA, digest, run IDs)
  at the top of this file, as decision 173 requires.

---

# Handoff: v0.27.0 — closable documents and automatic split remainder (decision 177)

## What changed

- Shared attachment modal fixes the installed-phone PWA trap for purchases, income and suppliers.
  Close/Escape/backdrop returns to the originating link and scroll; preview, filename/size, Download,
  and native Share where supported. Failed loads remain closable. Auth/private no-store unchanged;
  errors now explicitly carry the cache policy too. No offline cache or schema changes.
- Quick Entry Line 1 remains the remainder after adding splits and changing Total, until explicitly
  edited. Blank extra lines count as zero only for calculating the remainder; Save validation remains
  strict. Exhausted/overallocated remainder is zero, never negative, with a warning.
- Calls made without an answer: modal rather than route; £100 minus £80 means £20; adding splits does
  not take over (resolves contradictory brief); native PDF preview with download/share fallback,
  printing through the downloaded file/native viewer, not a separate unreliable mobile print control.
- Next decision: 178; next OQ: OQ15. See SPEC §15.1 / §23.2 and decision 177.
- Local browser recipe: docs/SANDBOX.md entry 8. Native iOS PDF rendering/share sheets still require
  household road-testing; Chromium phone/desktop coverage does not claim real iOS device verification.

## Local verification

583 unit tests and 103 full-suite browser tests passed. After hardening focus return to use the
explicit originating link (also for touch browsers that do not focus links), the three attachment/
remainder browser tests passed again. Typecheck, format check, production build and production
dependency audit passed (zero production vulnerabilities). Temporary Playwright config removed
before commit. PR/main CI and Publish verification follow through GitHub; final run IDs and digest
belong in the next session's handoff, per decision 173.

## v0.26.0 — verified previous-release facts

At session start GitHub Latest is v0.26.0, and package API reports one digest
`sha256:32d3ab66f49e774aabf6a257312d9ecf3c775f2f962462fc6b0c53699f5f8420` carrying
`v0.26.0`, `latest`, `sha-c1bacc2`. Merge commit is the session base
`c1bacc277c3fa1c414690c8a79e235c138ee881f`; previous v0.25.0 digest differs.

---

# Handoff: v0.26.0 — the bell: an in-app "needs attention" prompt, with personal tasks (decision 176)

**v0.25.0 — verified post-merge facts (recorded here per decision 173):**

- Merge commit `71f34130fc90a36783aa351e429179bc93d6d62a` (PR #86, merged 2026-09-27T17:35:40Z).
- PR CI run `36337203309` (gates, browser and docker all green); `main` CI run `36337522283` green.
- Annotated tag `v0.25.0` (tag object `8ddd79f`) on that merge commit; Publish run `36337883090` succeeded,
  including the upgrade smoke from published releases.
- Digest `sha256:de454437d6b85aa020d46db93b7a7dcf2ee901ba47e633c9c29cf8ecac85a366` on `v0.25.0` / `latest` /
  `sha-71f3413`. That differs from v0.24.0's `sha256:ab0e90bb397a0498400d71548cd27affd5fb331e6a6ac4af580d2a041d0ccf01`.
- The GitHub release `v0.25.0` is marked Latest and carries those facts.

**What v0.26.0 changes:** see decision 176 and SPEC §26. Bell button in header (desktop right end, phone top
bar next to menu), count is overdue/today tasks (filtered by assigned_to — shared or only me) + today/past/rolled
key dates; panel groups Needs attention / Coming up in next 7 days / noticed link; Since you last looked via
audit_entries and bell_seen table (UI state, not audited). Tasks gain assigned_to column and "For: Everyone / Only me"
UI (default both see bell count regardless of creator, personal task only counts for owner). OQ14 deferred by
household.

---

# Handoff: v0.25.0 — tasks: a real follow-up model, labelled dates, supplier documents (decision 175)

**Branch:** `arena/01a0e3b7-simple-finance`, from `main` @ `6e22b5d` (the v0.24.0 merge). The session
implemented the prepared brief "Next session: Tasks — a real follow-up model, labelled dates, and what
'prompt me' means". The release is the single pull request (decision 173).

## v0.24.0 — verified post-merge facts (recorded here per decision 173)

Merge commit `6e22b5d725ca413aec5e63f2ff31321066500e68` (PR #85); annotated tag `v0.24.0` on it; Publish
run `36331056044` (2026-09-27, success); digest
`sha256:ab0e90bb397a0498400d71548cd27affd5fb331e6a6ac4af580d2a041d0ccf01` on `v0.24.0` / `latest` /
`sha-6e22b5d`; the GitHub release `v0.24.0` exists, is Latest, and carries those facts.

## What changed

- **Schema — migration `0013_tasks_and_supplier_documents`** (drizzle-kit real-clock stamp
  `1790527814635`, decision 172): new `tasks` table; each `supplier_interactions.follow_up_date` value
  becomes an open task (title "Follow up with <supplier>", detail = summary, undated when not a real
  date) with a `task.migrate` audit row by `system`; the column is dropped; `attachments` is rebuilt
  on the 0009 pattern with `supplier_id` and a three-owner exactly-one CHECK.
- **Domain:** `src/lib/records/tasks.ts` (create / edit / complete / reopen — versioned, audited,
  never deleted; pure `taskDue`, `sortTasksByDue`, `groupTasksByDue`, `countOpenTasks`);
  `subjectLabel()` in `targets.ts`; `src/lib/records/tasks-view.ts` (display rows, deep links, "The
  app has noticed", page views); `keyDateHref()` / `keyDateStateWords()` in `keydates.ts`;
  `formatShortLocalDateWithYear()` in `time.ts`. `addSupplierInteraction` returns
  `{ interaction, followUpTask }` and writes both in one transaction; `upcomingSupplierFollowUps` is
  gone. Attachments take a supplier owner (`listStoredSupplierAttachments`).
- **Actions:** `createTaskAction`, `completeTaskAction`, `reopenTaskAction`, `editTaskAction`
  (`revalidateTaskPages()`), `addSupplierInteractionAction` (follow-up words, task message), and the
  upload action accepts exactly one of purchase / receipt / supplier.
- **UI:** `/tasks` (new; `NAV_ITEMS` and the drawer's More group); `src/components/task-forms.tsx`
  (checkbox, reopen, edit/reschedule/close-with-note, create form, lists, `TaskDueBadge`); the
  supplier card (Tasks section, header badge, labelled log, Documents, follow-up words); Suppliers
  banner and Contracts "Follow-ups you promised" from open tasks; purchase rows "Add a task"; anchors
  `renewal-{id}` on Contracts and `vehicle-{id}` on Insights.
- **Docs:** SPEC §25 (new) and §21.2 / §22.3 / §23 wording; decision 175; OQ10 and OQ11 resolved;
  OQ14 (stale pot) opened; `docs/RELEASE_NOTES_v0.25.0.md`; version 0.25.0 in all five places.

## Calls made without the household's answer

The household skipped this session's questions ("carry on and I will wait for you to finish"), so:

1. **The stale-pot noticed item is excluded** — OQ14 records the 7-day / 14-day choice for them.
2. **Supplier attachments ship in this release's migration** (resolving OQ10), PDF/JPEG/PNG only.

## What a future session should know

1. **Never reuse `targetKind`/`targetId`/`targetLabel()` for tasks.** `targetLabel()` answers
   "household" for any kind it does not know. `subjectLabel()` degrades to the bare kind (a voided
   purchase reads "purchase") and prints an unknown kind as itself. Adding a subject kind means
   `TASK_SUBJECT_KINDS`, `subjectLabel`, `taskSubjectHref` (tasks-view) and the write-time existence
   check in `tasks.ts` — the database only enforces `(subject_kind = 'household') = (subject_id IS
   NULL)`; `subject_id` has no FK because it is polymorphic.
2. **Keep `tasks-view.ts` apart from `tasks.ts`.** `supplier-details.ts` imports the write path; the
   view reads the key-date and fuel engines (via `money-view`) and must not be dragged into it.
3. **0013 was hand-corrected from drizzle's output before shipping:** the generated attachments
   rebuild selected a non-existent `supplier_id` from the old table and qualified CHECK columns with
   `"__new_attachments".`. Now that it ships, its SQL must never change (decision 172).
4. **Attachments' FKs are now no-action** (drizzle's default in the rebuild), where 0009 had
   cascade. Nothing deletes a purchase, receipt or supplier today; any feature that ever does must
   deal with its attachments explicitly.
5. **ICU prints September as "Sept"** in en-GB here (`tests/time.test.ts` already pins it). Do not
   hard-code "Sep" in assertions; weekday names are real — 1 Sept 2026 is a Tuesday.
6. **The checkbox is controlled (`ticked || pending`) and unticks itself on an error;**
   `completeTaskAction`/`reopenTaskAction`/`editTaskAction` revalidate even when they refuse, so a
   stale box re-renders the current state instead of looking done.
7. **e2e `tasks` project** runs before `backup` and uses a per-attempt unique title (CI retries share
   the database). "Done in the last 30 days" sits *inside* the "Your tasks" section, so assert on the
   task's checkbox, not on `li` counts; a task made from a call carries the call's summary as its
   detail, so select log entries by their "Interaction:" label.
8. **OQ14, if the household chooses:** add a derived item in `getNoticedItems()` for bank/cash pots
   whose latest checkpoint is older than N days — link-only, like the others.
9. **Sandbox:** SANDBOX entry 8 still holds (`/tmp/pwbrowsers`, the throwaway, un-ignored
   `playwright.local.config.ts`). Running `node scripts/migrate.cjs` without `DATA_DIR` creates
   `data/simple-finance.sqlite` in the repo — ignored, but delete it.

## Gates at close

`npm test` **568 passed** / 132 suites · `npm run typecheck` clean · `npm run format:check` clean ·
`npm run build` clean (`next-env.d.ts` restored afterwards). Playwright **95 passed** across every
project via the SANDBOX entry 8 overlay (92 before + 3 in the new `tasks` project).

## Housekeeping still open

- OQ14 — the stale-pot item, 7 or 14 days — is the household's call.
- The next working session records v0.25.0's post-merge verified facts (merge SHA, digest, run IDs)
  at the top of this file, as decision 173 requires.

---

# Handoff: v0.24.0 — a saved purchase clears the till (decision 174)

**Branch:** `arena/01a0e36d-simple-finance`, from `main` @ `1081025` (the v0.23.1 merge). The previous
session could not make code changes (it ended when PR #84 merged), so it left a prepared note; this
sitting implemented it, and the release is the single pull request (decision 173).

## What changed

`src/components/quick-entry.tsx` only. The household asked for two things at the till — clear the
breadcrumbs of the purchase just saved, and grey Save out until the *next* entry is complete — and
the second follows from the first, so it is one change:

- An effect in `PurchaseForm` keyed on `[state]` clears the entry fields when `state.status === 'ok'`:
  supplier, amount, date, note, the note field's open flag, and the split lines back to one fresh
  default line with `lineFollowsTotal` back to true. With the form blank, `balanced` is false, so the
  existing `saveBlocked` rule and the existing disabled styling grey Save out with no new state and no
  new flag.
- `resetForAnother` keeps its own copy of that clearing (it is the start-over for an unsaved form, and
  the slide to card 1 + supplier focus is the one thing the save does *not* do).
- The same effect and rule in `FuelForm`: amount, litres, odometer, supplier, date, note clear and the
  full-tank tick goes back to off; pot, vehicle and paid-by stay. Clearing the amount is what greys
  Save fuel out (`canSave` needs a positive one).
- "Add another" now renders only while the next entry has not begun: `nextEntryStarted` is computed
  from the typed values (supplier, amount, date, note, split amounts, line count), so the button is
  offered while the form is blank after a save and withdraws as soon as the household starts typing
  the next purchase, instead of wiping a half-typed entry.

**Sticky, by the household's choice:** pot and paid-by on purchases; pot, vehicle and paid-by on
fuel. Category and target are also not part of the "next entry has begun" test, so changing one does
not hide the button.

## What a future session should know

1. **Key the reset effect on the `state` object, never on `state.message`.** Two identical
   consecutive saves produce the identical message string, so a message-keyed effect would not fire
   for the second save and the form would stay dirty. `e2e/home.spec.ts`'s "a second identical save
   clears the form again" exists to keep that honest.
2. **`data` must not be a dependency of that effect.** The purchase and fuel actions both
   `revalidatePages()`, so a successful save re-renders the server page and hands the client island a
   fresh props object; re-firing on that would wipe the *next* entry half-typed. The effect reads
   `data` from its closure on the render where `state` changed, which is current.
3. **The save must never move focus or a panel** (decision 151). The household confirmed this over
   the alternative of sliding back to card 1 with the supplier focused. The e2e spec asserts
   `expectNoFieldFocused` after a save, so a future "convenience" focus move fails the suite.
4. **Errors clear nothing** (`status === 'error'`), and a save that trips the duplicate notice is
   still `'ok'` and does reset. The notice reads `state` and is untouched; server-side duplicate
   detection is unchanged — only the accidental double-tap became unreachable.
5. **Balance checkpoints were left alone on purpose.** The ask was purchases, then fuel. A repeated
   checkpoint is a different question; if the household wants the same rule there, it is a small
   change to `BalanceForm`.
6. **The new e2e specs are order-sensitive in the way the project is.** `e2e/fuel.spec.ts`'s new
   spec picks the pot itself (`if ((await pot.inputValue()) === '') …`), because the settings project
   clears the default pot before the fuel project runs — the first full-suite run caught exactly that.
   Its `VEHICLE` is created by the first spec in the same file, so it must keep running second.
7. **Playwright locally:** SANDBOX entry 8 recipe still holds. `node_modules` was absent again this
   sitting (`npm ci --ignore-scripts` fixes it). The overlay `playwright.local.config.ts` is throwaway
   and must be deleted before committing — it is **not** in `.gitignore`, so `git status` is the check.
8. **The Fuel tab's `fullTank` reset is a correctness fix, not tidiness.** A tick left on the form
   would silently measure the next fill as a full tank and report a wrong mpg (decision 147).

## Gates at close

`npm test` **547 passed** / 124 suites · `npm run typecheck` clean · `npm run format:check` clean ·
`npm run build` clean (`next-env.d.ts` restored afterwards). Playwright **92 passed** across every
project via the SANDBOX entry 8 overlay — 25 mobile, the rest unchanged in count but all re-run, since
the till is on the phone home page and the Fuel tab. No schema, no migration, no server-action change.

## Housekeeping still open

- The household's v0.23.1 steps were never confirmed done; v0.24.0 supersedes that update anyway —
  backup, then Force Update, and the badge should read `v0.24.0 · pre-release`.
- The next working session records the post-merge verified facts (merge SHA, digest, run IDs) at the
  top of this file, as decision 173 requires.

---

# Handoff: v0.23.1 — the upgrade migration repair and the release-process rework (decisions 172–173)

**Branch:** `arena/01a0e2fe-simple-finance`, from `main` @ `aed1c12` (the v0.23.0 merge). v0.23.0
was published broken on upgrade: every install updated from v0.20.0+ silently skipped migration
`0012_credit_card_pots` at startup and then failed on any pots query with
`no such column: credit_card_payment_day_of_month`. Fresh installs were fine, so all of CI was
green — the upgrade path was simply never tested. This sitting fixes that, adds the missing tests
and smoke checks, and reworks the release process so nothing needs a second session after merge.
Everything ships in the one release PR, because the Arena session ends when its PR merges.

## What happened (root cause, reproduced before fixing)

drizzle-orm 0.45.2's better-sqlite3 migrator applies a journal entry only when its `when` stamp is
newer than the **single newest** `created_at` recorded in `__drizzle_migrations`
(`ORDER BY created_at DESC LIMIT 1`). Journal entry 0011 had been hand-stamped with the round,
future-dated `1790600000000` (2026-09-28 13:06 UTC) while 0012 carried its real generation stamp
`1790506141836` (2026-09-27 10:49 UTC) — numerically smaller — so upgraded databases skipped 0012
and fresh databases applied everything. Sandbox reproduction of the exact Unraid upgrade: 12
journal rows before, 12 after, no column.

## What changed

- `drizzle/meta/_journal.json`: 0011 re-dated to `1790504000000`. The journal is now strictly
  increasing and entirely in the past, so drizzle-kit's future real-clock stamps sort correctly
  after 0012 forever.
- `src/lib/db/migrate-repair.ts` (canonical) and `scripts/migrate-repair.cjs` (production twin,
  production deps only): before the migrator runs, any `__drizzle_migrations` row recorded at a
  stamp the journal no longer carries is re-dated to the journal's value, matched by sha256 of the
  migration `.sql` (the same value drizzle stores — never row id, which is NULL: drizzle declares
  `id SERIAL PRIMARY KEY`, not INTEGER PRIMARY KEY). Wired into `scripts/migrate.cjs` and into
  `applyMigrations` (dev open path), so dev databases converge too.
- `tests/migrate-journal.test.ts`: the journal must be strictly increasing and never
  future-stamped. `tests/migrate-upgrade.test.ts`: builds a real v0.22.1-era database (0011 at the
  old stamp) and upgrades it through the actual production runner; covers fresh-v0.23.0 and
  brand-new databases; proves the CJS and TS repairs agree. Both fail in milliseconds on the
  pre-fix journal.
- `.github/workflows/ci.yml` (docker job): upgrades the most recently published release image to
  the build under test on the same volume and requires every journal entry applied exactly once.
  `.github/workflows/publish.yml`: same check against the two most recent published images before
  push, plus it now **creates the GitHub release** from `docs/RELEASE_NOTES_vX.Y.Z.md` (title from
  its first line, verified facts prepended) — no post-merge session work remains.
- Version 0.23.1 in the five places; release notes for v0.23.0 (honest record of the broken
  release) and v0.23.1; `RELEASE_PROCESS.md` reworked; blueprint §7 journal rule; decisions 172
  and 173; README's badly stale v0.8.0 status lines refreshed. PR #83 (the docs-only follow-up
  from the previous session) is closed unmerged — its verified v0.23.0 facts were folded into
  `RELEASE_NOTES_v0.23.0.md`; that second-PR pattern is what decision 173 retires.

## Verification (this branch, local)

`npm test` green including the new suites; `npm run typecheck`, `npm run format:check` and
`npm run build` clean. CI on the PR runs the full gates, browser acceptance and the Docker job
with the new upgrade smoke; the Publish workflow then upgrades the two most recent published
images (v0.23.0 and v0.22.1 — both affected populations) before pushing.

## What a future session should know

1. **Migration journal `when` stamps are ordering keys.** drizzle's migrator orders by the single
   newest recorded stamp, not by journal position. Stamps must be strictly increasing and never in
   the future; `tests/migrate-journal.test.ts` enforces it. Never hand-stamp a round number — let
   drizzle-kit generate the entry, or pick a real past instant strictly between the neighbours.
2. **Fresh-database tests cannot catch upgrade failures.** Any migration change needs an
   upgrade-path test (`tests/migrate-upgrade.test.ts` has the harness: build a legacy journal
   folder, migrate a DB with it, then run the production runner) and the Docker smoke now covers
   it end to end.
3. **A release is one pull request.** All documentation — release notes, this handoff, blueprint,
   plan decisions, version bumps — lands before merge. The Publish workflow creates the GitHub
   release automatically; the notes document must exist and start with
   `# Release notes — vX.Y.Z — <subject>`. Post-merge verified facts (digest, run IDs) belong in
   the next working session's handoff block, never a dedicated docs-only PR (decision 173).
4. **Never re-date or edit a published journal entry's SQL** — only its ordering stamp, and only
   alongside a repair that converges fielded databases (this release is the worked example). The
   hash drizzle stores is the sha256 of the `.sql` content; changing the SQL orphans every fielded
   database row.
5. The household is waiting on v0.23.1: backup, then Force Update. The first start's log should
   show `[migrate-repair] re-dated 0011_schedule_excluded_months: 1790600000000 -> 1790504000000`,
   then `[migrate] database is up to date`, and the badge should read `v0.23.1 · pre-release`.

---

# Handoff: Credit-card pots and liquid-only projections (decision 171)

**Branch:** `arena/01a0e259-simple-finance`. Feature A was merged as PR #82 and published as
**v0.23.0** (merge `aed1c12`, digest `sha256:42cb4c…`, facts in
[`RELEASE_NOTES_v0.23.0.md`](RELEASE_NOTES_v0.23.0.md)) — but v0.23.0 is **broken on upgrade**:
migration 0012 was silently skipped on databases upgraded from v0.20.0+. The v0.23.1 block above
is the repair; read it before touching migrations. Do not put real provider, limit, balance or
offer terms in tracked files or test data.

## What changed

- Added the generic `credit-card` pot kind, card limit/near-limit context, configurable monthly review
  lead, current statement minimum + due date copied as a pair, and actual promotional end date. Migration
  `0012_credit_card_pots.sql` adds five private per-pot fields; its snapshot and journal entry are checked
  in.
- Card purchases remain spending; a bank-to-card repayment is a transfer. The household headline remains
  the sum of all estimated pots (therefore net of card debt) and shows card debt separately.
- Per the household's settled choice, payday, Horizon and Charts forecast **liquid bank/cash only**.
  Card debt, card-pot schedules/receipts/expected support and card near-limit thresholds do not enter the
  liquid projection; a card receipt cannot define payday. Card pots cannot trigger a bank overdraft warning
  or a §7.5 pot shortfall watch. Horizon/Charts do not invent a zero liquid checkpoint when only a card
  balance is known.
- Added in-app monthly payment-review and promotional-end key dates, linked to Accounts & Pots and listed
  on Overview and Contracts & Renewals. Minimum/date are copied from the provider statement; no issuer
  formula, full repayment assumption, fixed payment, payment automation/verification, assumed offer length,
  interest calculator or scenario planner is included.
- Updated `docs/SPEC.md` §§4, 7, 8, 22.3 and 24 and appended decision 171 to the implementation plan.

## Verification

- `npm run typecheck` — passed.
- `npm run format:check` — passed.
- `npm test` — **539 passed, 0 failed** (122 suites).
- `npm run build` — passed. Build rewrites `next-env.d.ts`; that generated-only change was restored, and
  should not be included.
- Playwright via the SANDBOX §8 local Chromium overlay — **89 passed** across all projects, including the
  new `e2e/credit-card-pots.spec.ts`. The database/domain suite includes new card tests and older-backup/
  schema-migration tests. `npm ci --ignore-scripts` was used for dependencies earlier in this session; npm
  reported 4 moderate vulnerabilities then.

## Next checks if continuing

1. Review `git diff` for product wording and schema/migration consistency. `next-env.d.ts` should remain
   unchanged after any build.
2. If any code changes are made after this verification, rerun the full gates, including the complete
   SANDBOX-recipe Playwright suite; card UI coverage is already in place.
3. v0.23.0 was released on 2026-09-27 and is broken on upgrade; the record lives in
   [`RELEASE_NOTES_v0.23.0.md`](RELEASE_NOTES_v0.23.0.md) and the repair in the v0.23.1 block above.
   The release notes now carry the final merge SHA and verified digest; no follow-up documentation
   remains open for this release.

---

# Handoff: v0.22.1 category picker, debt deletion, honest loan status (decisions 167–170)

**Branch:** `arena/01a0e1ea-simple-finance`, from `main` @ `0f7070f` (v0.22.0 merge). This branch
carries the three fixes originally prepared on `arena/01a0dfd7-simple-finance` (PR #79, superseded
and closed) plus decision 170, the repair that makes the browser suite green again.

Three narrowly scoped app fixes, no schema change — and one test-harness fix:

1. **Category rename picker selects wrong visible category (decision 169):** Settings → Category tree → Rename: option values are `parent:<id>` / `child:<id>` but controlled value was bare `String(categoryId)`. Browser displayed first parent while hidden ID/version referred to intended category. Fixed by storing `categoryKind`, making select value `${kind}:${id}`, syncing version when tree updates (save → rename again without refresh no stale failure), and adding hydration-ready guard `data-category-ready` + `inert` with `waitForCategoryEditor`. Switching operations clears unintended target; add-parent/add-child and child retirement still work; parent retirement remains prohibited.

2. **Permanently delete a mistaken debt setup (decision 167):** Accounts & Pots → Owed and Owing: household accidentally created Parents and prefers full deletion, not void/hide. Safety boundary: hard-delete only when no movement records whatsoever, including voided. Enforced server-side in transaction guarding race; UI hides Delete when not eligible but server still refuses. After deletion debt disappears from list and selectors, and any expected-support plan no longer generates forecast or All Transactions EXP< rows. Confirmation identifies counterparty and explains permanence. Audit, concurrency and auth conventions respected without retaining active row to simulate deletion. Existing debt code said debts are never deleted, so SPEC and decision deliberately amended.

3. **A loan awaiting first payment must not say settled (decision 168):** Martin & Sue (we owe) settled, no movements yet — bridging pending estate settlement. `debtBalanceLabel` returned settled for any zero balance. Now returns Awaiting first payment for `we_owe` with no effective movements, Awaiting first loan for `they_owe`; settled reserved for loan with actual movement history whose balance is zero. Voided-only history displays unstarted but still blocks deletion per decision 167. No first payment invented, no pot estimate increased. Expected support still appears in projections as expected borrowing where configured, never received income. First borrowing/lending moves to outstanding; full repayment to settled; overpayment distinguishable. Lists/pickers use consistent wording.

4. **The browser suite had an expiry date (decision 170, tests only — no app change):** `e2e/transactions.spec.ts` went red on 2026-09-27 and stayed red across four pushes of PR #79, which read as a regression from the fixes above. It was not: the same spec fails identically on pristine `main` @ `0f7070f`. The seeded "Phone plan" standing order was dated the **28th of the month**, so its newest converted payment was the 28th of the *previous* month — exactly 30 days behind today on the 27th of any month whose predecessor has 31 days, i.e. one day outside All Transactions' default last-30-days window. The row the spec asserts on did not exist. Nor could the next payment rescue it: `desktop.spec.ts` moves that schedule to the 21st earlier in the same run, deleting the upcoming 28th, and a cadence edit never invents past instances (decision 162). Seeded dates are now relative with a guaranteed margin (`scripts/e2e-seed-dates.ts` · `recentMonthlyDueDay`), guarded for every day of 2025–2028 by `tests/e2e-seed-dates.test.ts`, and the spec's stale "back-fills a second converted row" comment is corrected. **Read decision 170 before adding any seeded date a spec asserts on.**

**Tests:** 534 unit tests (528 from the three fixes + 6 new seed-date guards), all green. Browser: **88 tests green locally** (78 existing + category-picker 4 + debt-lifecycle 6) via the SANDBOX entry 8 recipe — run them there, not in CI: ~5 minutes against ~6 minutes of CI *per push*, and CI job logs cannot be downloaded in this sandbox (entry 15). Domain tests cover empty delete, cancel, expected-support plan deletion, live/voided block, unrelated data unchanged, version guard, race guard, and awaiting vs settled vs overpaid. No schema/migration.

**Published as v0.22.1 on 2026-09-27 from merge `c5e94aa` (PR #80), Publish run `36308225732` green. `v0.22.1`, `latest`, `sha-c5e94aa` share `sha256:e8d55169227a3e31fbd4d2c15512f0eb569d451d970e734d0f333288a1efe1de`, different from v0.22.0 (whose own version keeps only `v0.22.0` and `sha-0cca6ae` — `latest` has moved). Full facts in `RELEASE_NOTES_v0.22.1.md`. Household steps: backup, then Force Update; change old image pins first.**

**Known flake, hardened after the merge:** `e2e/home.spec.ts` "Save is only on the second card; Next, the dots and a real swipe switch cards" measured a bounding box immediately after `scrollIntoView` and then dragged with raw CDP touch events. On a loaded runner the scroll has not settled, so the gesture arrives diagonal and the till's own rule (≥50px, ≥1.5× more sideways than down) reads it as a scroll — `data-active-panel` stays at 1 and the spec fails. It reddened the v0.22.1 merge commit's browser job (**87/88**) while the *identical tree* passed **88/88** on PR #80 twenty minutes earlier and six consecutive local runs of the `mobile` project. `settledBox()` now measures until two readings agree. Note for the next session: **a failed CI job cannot be re-run with the Arena token** (`403 Resource not accessible by integration` on both the run and job rerun endpoints), so a flake on `main` cannot be cleared by retrying — fix the spec, or take the green run on the identical PR tree as the evidence and record the caveat, as this release did.

---

# Handoff: v0.22.0 salary-window planning (decision 166)

The household confirmed the £1,000 on the 12th is expected borrowing from parents, not a second
income schedule. Payday and till now anchor on the next salary receipt; Horizon's default is unchanged.
Expected support remains flagged inside the window. Till and Overview consume the payday engine's
low and shared weekly pace; the old no-inflows subtraction is gone. Pace floors whole pounds using
weeks to the earliest low date and protects zero. Estimate arithmetic (decision 165) is untouched.
No schema/migration/setting. **Published v0.22.0 on 2026-09-26** from merge `0cca6ae` (PR #77),
Publish run `36273381993` green. `v0.22.0`, `latest`, `sha-0cca6ae` share
`sha256:38fa8f57bb372a4af75cbed91a7bbad3f747f5edf4eb03e5d7aa608b072b1a58`, different from v0.21.1. Full facts in
`RELEASE_NOTES_v0.22.0.md`. Main CI: 514 unit tests, 78 browser tests, Docker smoke green.
Household steps: backup, then Force Update; change old image pins first.

---

# Handoff: a same-day transfer recorded after a checkpoint now moves the inbound pot

Date: 2026-09-26. Branch: `arena/01a0df10-simple-finance`, from `main` @ `063ff5d` (v0.21.0 merge).

Natwest stayed on its checkpoint (−£443.65) after £1,500 was transferred in from Nationwide the same
day. Nationwide fell, correctly. Overview and Horizon both read the estimate, so both showed the
checkpoint. Expected: **£1,056.35**.

Cause: decision 98 absorbed every date-only credit that shared a checkpoint's date. Transfers are
always date-only (the form date defaults to today), so an inbound leg recorded after the count was
indistinguishable from one already inside it. Decision **165** refines that rule: a same-day credit
counts when `createdAt` is strictly after the checkpoint's `createdAt`. Recorded before the checkpoint,
it is still absorbed — the £180 bug (E13) stays fixed. Same-day debits still always count. No schema
change.

Wired through `recordIsAfterCheckpoint` (`src/lib/records/estimates.ts`) and `getMoneySnapshot`
(`src/lib/records/money-view.ts`), which is what Overview, Horizon and the pot watch all read. SPEC
§7.1, §10.2, §15.3 and E12/E13 updated. The All Transactions footnote and the swap blurb on Accounts
& Pots match the new rule.

## What a future session should know

- Do not go back to "absorb every same-day credit". That is the bug this sitting fixed.
- Do not count a same-day credit whose `createdAt` is missing or not after the checkpoint. That
  reopens E13.
- If the household counted money and *then* recorded the explaining credit, the estimate adds it.
  The correction is another checkpoint, or recording the credit before the count. Say so; don't
  special-case one pot.
- **Published as v0.21.1 on 2026-09-26.** Annotated tag `v0.21.1` points at merge commit `22a9901`
  (PR #75). GHCR `v0.21.1`, `latest` and `sha-22a9901` share
  `sha256:c9ada52917fed04c28ba828c585a92bcf566d7c3103580842f3d4de02077a506`, different from v0.21.0.
  v0.21.0 was not retagged. Unraid Force Update pulls `latest`. Facts are in
  [`RELEASE_NOTES_v0.21.1.md`](RELEASE_NOTES_v0.21.1.md).

---

# Handoff: Overview panels moved onto the pages that own them — v0.21.0

Date: 2026-09-26. Implementation branch: `arena/01a0de74-simple-finance`, starting at `2578acc`
(`main` after v0.20.0; merged as PR #72). Release preparation on
`arena/01a0de9d-simple-finance`, branched from that merge.

**Published as v0.21.0 on 2026-09-26.** Annotated tag `v0.21.0` points to PR #73's merge commit
`4b177a5`; GHCR's `v0.21.0`, `latest` and `sha-4b177a5` tags resolve to
`sha256:dec7f9a26eaa914b33f93e52717867fdf417075899bad6aed98966ff36ceb346`. Full release facts and
Unraid update instructions are in [`RELEASE_NOTES_v0.21.0.md`](RELEASE_NOTES_v0.21.0.md). The panel move
below is the whole release — no product code changed while preparing it.

Decision **164**: one codebase, two homes. Phone `/` is the till home; laptop `/overview` is the
dense dashboard. Duplicates left Overview and the phone dump; transfers now void on Accounts & Pots.

## What landed

- **Transfers:** review list + void + `?transfer=` / `#transfer-{id}` on `/pots` (same pattern as
  `?external=`). All Transactions links to `/pots?transfer=` (`src/lib/records/activity.ts`).
  Record remains Quick Entry → Move → Between pots. No void on All Transactions or Quick Entry.
- **Overview** no longer lists purchases, transfers, add-a-pot, or checkpoints. Money row,
  projection, Quick Entry, due this week, key dates, this month, vehicles stay.
- **Phone `/`:** available now → Quick Entry (till scroll unchanged) → payday projection → due this
  week → links to Charts, Purchases, Horizon. Recurring section, pots dump, recent-purchase table,
  key dates, add-pot and checkpoint cards are gone.
- **Phone drawer:** Daily = Quick Entry · Purchases · Horizon · Charts · Overview · Recurring.
  Everything else is under More. Desktop full bar unchanged. No tab bar.
- **Recurring `lg+`:** calendar left, compact projection figures under it; schedules panel
  height-matches the calendar card with an inner-scrolling list and Add a schedule pinned below;
  renewals under that. Phone stacks unclipped. `#schedule-{id}` scrolls inside the list
  (`ScrollHashIntoView`).

SPEC §15.1 / §15.2 / §15.3 / §23.4 updated where the UI was now wrong.

## Gates

`npm test`: **506 passed** · TypeScript clean · formatting clean · production build clean ·
Playwright: **78 passed** (two new specs: phone home is the till, not a dump; desktop bar still
lists every page). Browser ran using SANDBOX entry 8; the temporary local-browser config was
removed afterwards. Version metadata is v0.21.0. The published merge commit, tags and digest are recorded
in [`RELEASE_NOTES_v0.21.0.md`](RELEASE_NOTES_v0.21.0.md); back up before using Unraid Force Update.

## What a future session should know

1. **Canonical transfer URL is `/pots?transfer={id}#transfer-{id}`.** Mirror `linkedExternal` if
   you change the recent-list cap. Do not put void back on Overview, All Transactions, or Quick Entry.
2. **Purchases is the only purchase review surface** — fuel details and attachments live there (and
   on the supplier card), not on Overview.
3. **Checkpoints are still immutable.** Create on Quick Entry → Balance or Accounts & Pots; history
   is the per-pot timeline on `/pots`.
4. **Phone home is a till, not a dashboard.** Do not CSS-hide leftover laptop panels on `/`; do not
   add a five-tab app bar unless the household later wants it to feel like a bank app.
5. **Recurring laptop height-match** uses `lg:h-0 lg:min-h-full` on the schedules card so the grid
   row is sized by the calendar, then the list `overflow-y-auto`. Phone must not get that clip.
6. **The release is its own sitting** — done for v0.21.0 on `arena/01a0de9d-simple-finance`: five version
   places, notes, tag, registry check, Unraid. Never bolt it onto a product branch.

## Still to walk (one panel at a time) — deferred past v0.21.0

The v0.21.0 release sitting deliberately did **not** walk these; they wait on a later decision.

- Recurring: other panels (renewals copy, add forms) if needed after the layout pass
- Due this week / Key dates (Overview tiles; phone home keeps Due this week)
- This month so far / Vehicles
- Payday projection / Quick entry / Money row (stay; they *are* the two homes)

---

# Handoff: Monthly schedules can skip selected months — v0.20.0

Date: 2026-09-26. Implementation branch: `arena/01a0ddd0-simple-finance`, starting at `db9e020`
(`main` after v0.19.0 and its documentation merge).

**Published as v0.20.0 on 2026-09-26.** Annotated tag `v0.20.0` points to PR #70's merge commit
`2d4cb81`; GHCR's `v0.20.0`, `latest` and `sha-2d4cb81` tags resolve to
`sha256:1e0db60a775f85958342420926b327994bf90cd58d7564b85cfaaaf5c0a92de2`. Full release
facts and Unraid update instructions are in [`RELEASE_NOTES_v0.20.0.md`](RELEASE_NOTES_v0.20.0.md).

Monthly schedules can exclude selected calendar months every year.
For the ten-payment-year case, select February and March. The shared Add/Edit control is a nested
native details disclosure, **collapsed by default**, with Horizon's compact summary styling and native
marker. Only opening it reveals the twelve labelled checkboxes. Recurring and dedicated Income forms
share it; annual schedules do not show it. SPEC §11.1 and decision **163** describe the rules.

## Gates

`npm test`: **506 passed** · TypeScript clean · formatting clean · production build clean ·
Playwright: **76 passed**, including keyboard disclosure and checkbox operation, save/reload,
monthly-only visibility and a 390px viewport. Browser ran using SANDBOX entry 8; the temporary
local-browser config was removed afterwards. No new sandbox workaround was needed.

## What a future session should know

- Migration **0011_schedule_excluded_months** adds a JSON list of calendar month numbers, default `[]`.
  Existing schedules keep twelve payments; existing instances are untouched. Migration and older-backup
  restore tests pass. Take the usual backup before deploying a schema change.
- Action and domain validation both reject invalid/duplicate months and all-twelve exclusions. At least
  one payment month must remain. Annual schedules reject a non-empty list; switching to annual clears
  it on save. Valid lists are sorted, persisted and included in the existing full-row audit snapshots.
- Skip membership uses the **configured month**, before moving receipt dates off weekends. An August
  receipt may still land on July's final Friday when July is excluded. Instance-backed forecasts, due
  lists, conversion and calendars share this rule rather than implementing separate filters.
- Edits use the existing forward-regeneration path. Converted history and past due instances awaiting
  conversion remain intact. Only moving `activeFrom` earlier backfills (decisions 75/162 unchanged).
- `nextDueDateAfter` starts its bounded search at the later of the queried date and `activeFrom`, so a
  distant start followed by eleven skipped months still has an honest next-due date.
- Version metadata is v0.20.0. The published merge commit, tags and digest are recorded in
  `docs/RELEASE_NOTES_v0.20.0.md`; back up before using Unraid Force Update.

---

# Handoff: A schedule can start in the past — v0.19.0

Date: 2026-09-26. Branch: `arena/01a0dcf7-simple-finance` (from `main` @ `1363139`, the v0.18.0
post-release merge).

**Released as v0.19.0 on 2026-09-26.** The household filled up the car five days before the app was
stable enough to record in, and the direct debits that left inside that window belonged to schedules
created *after* it — so the app had no instance for those dates. Their only options were a hole in the
history or a hand-typed Purchase, and a Purchase is mislabelled money: All Transactions reads `PUR`
not `DD`, and the commitment chart and the projected figures then read the wrong past. The fix is the
schedule's own start date: **the Edit form can now move `activeFrom`, earlier or later, and moving it
earlier backfills the missed due dates as ordinary instances** — which convert into real,
schedule-tagged records. Recorded as decision **162** and SPEC **§11.1**; release facts (merge commit,
tag, digest) are stamped in [`docs/RELEASE_NOTES_v0.19.0.md`](RELEASE_NOTES_v0.19.0.md). The household
does two things in Unraid: back up, then Force Update.

## Gates at close

`npm test` **494** green · `npx tsc --noEmit` clean · `npm run format:check` clean · `next build`
clean · Playwright **75** green locally (SANDBOX entry 8; `playwright.local.config.ts` is a throwaway
overlay — recreate it from that entry, never commit it) and in CI on the merge commit.

## What a future session should know

1. **`activeFrom` is the one schedule field an edit may date in the past, and it is the only exception to
   "edits apply from the next instance".** `editSchedule` backfills *only* when the start genuinely
   moved earlier (`startMovedEarlier`), so decision 75's no-invented-past-cadence rule is intact for
   every other edit. If you are tempted to make `regenerateFromToday` backfill unconditionally, don't:
   a due-day change must not retroactively rewrite which dates the household believes in.
2. **Generation floor and retention floor are now two different things in `syncScheduleInstances`.**
   `lower` (max(`activeFrom`, lastConverted+1)) says where *new* dates start being generated; it is **not**
   a reason to delete an upcoming row. Past-dated upcoming rows are due dates awaiting conversion — the
   daily pass used to prune them as stale, which would have silently eaten a backfill before it ever
   became a record. That trap is the reason this release is a domain change and not just a form field.
3. **`editSchedule` returns `{ schedule, materializedInstances, backfilledInstances }`** (mirroring
   `createSchedule`), and the household's message is built from `backfilledInstances`. If a future edit
   path needs to report what it did, use that number rather than counting queries afterwards.
4. **`nextDueDateAfter` honours `activeFrom` now** — a period whose *configured* date precedes the start
   is not an expectation, mirroring `candidateForPeriod`. Keep that symmetry: the card's "Next due" and
   the materialised instance set must never disagree.
5. **The backfill window is bounded before anything is written** (`MAX_BACKFILL_SPAN_DAYS`, ~3 years,
   checked on create *and* edit). Instance materialisation is a single bounded window; say so in a
   sentence the household can act on rather than letting `dueDatesBetween` throw.
6. **The lazy due pass remains the only writer of records.** The edit action does not convert anything
   itself — `/transactions` (and every money page) runs the pass, so the backfilled record is there when
   it is looked for. Do not "helpfully" convert inside an action; SPEC §11.2's single writer is why a
   record can never be counted twice.

## Watch out for (carried forward, still true)

- **No migration was needed** — `active_from` has been a column since migration 0002. A feature that
  only needs a form field should not reach for the `drizzle` folder.
- **The e2e seed's pot order is not "Main account first" in the Add-schedule select.** A new browser test
  that asserts a row on `/transactions` must pick the pot by name, not trust the default (that cost this
  session one red run).
- **Never bump `APP_VERSION` while Playwright is running** — the backup spec reads it.
- **Generated files are generated.** Editing `src/app/themes.generated.css` or
  `src/lib/theme/catalogue.ts` by hand is reverted by the next build and caught by
  `tests/themes.test.ts` / `npm run themes:check`.
- **Tokens only.** `tests/colour-tokens.test.ts` is a grep-gate that reads prose too: a phrase like
  "sky-blue" in a `.ts` file trips `PALETTE_CLASS`. Colour is never the only signal (§16.7).
- **`purchaseLineSummary()` / `targetLabel()`** in `src/lib/records/targets.ts` are the one way to turn
  `{targetKind, targetId}` into words — do not write a sixth copy (v0.18.0).
- **Project order matters in Playwright** (`workers: 1`, `fullyParallel: false`, one shared
  `.e2e-data`): run the **whole** suite before believing a list assertion.
- SANDBOX entries 8 (local browser — how to run Playwright here), 9 (stale `next dev` SSR), 10/its
  sibling (a `node_modules` that is absent or *partially* restored — `npm ci --ignore-scripts` fixes
  both; this session started with `node_modules` missing entirely), 13 (GitHub connector drops), 14
  (Turbopack rejects a symlinked `node_modules`).
- `next build` flips `next-env.d.ts` — restore before committing.

---

# Handoff: The supplier card says who each purchase was for — v0.18.0

Date: 2026-09-26. Branch: `arena/01a0dcb6-simple-finance` (from `main` @ `9dc74e4`, the v0.17.0
post-release merge).

*Provenance for the block below — the v0.18.0 session, kept unchanged for context.*

**Released as v0.18.0 on 2026-09-26.** A household case the v0.17.0 release conversation turned up:
three mobile contracts with one carrier, one per person, modelled as **one supplier, three
schedules**. Every list in the app said who a payment was for except the supplier card's **Recent
purchases**, which showed `date · amount` — so the three contracts were told apart by amount alone.
Each row now reads `2026-09-24 · £28.99 · Mobile Phones (Robin)`. Recorded as decision **161** and
SPEC **§21.4**. Release facts (merge commit `ee2308e`, tag, digest
`sha256:8d8b822a…`) are stamped in
[`docs/RELEASE_NOTES_v0.18.0.md`](RELEASE_NOTES_v0.18.0.md); the version badge reads
`v0.18.0 · pre-release`. The household does two things in Unraid: back up, then Force Update.

## Gates at close

`npm test` **481** green · `npx tsc --noEmit` clean · `npm run format:check` clean · `next build`
clean · Playwright **74** green locally (SANDBOX entry 8; `playwright.local.config.ts` is a throwaway
overlay — recreate it from that entry, never commit it) and in CI on the merge commit.

## What a future session should know

1. **There is one target-label helper now — use it.** `src/lib/records/targets.ts` holds
   `targetNames()`, `targetLabel()` and `purchaseLineSummary()`: pure, no DB, no framework. Turning
   `{targetKind, targetId}` into `Alex` / `Vehicle A` / `household` had grown **four** copies
   (`activity.ts`, `purchases/page.tsx`, `contracts/page.tsx`, and the supplier card would have been
   the fifth). All four call it now. If a new page needs the label, import it — do not write a
   sixth.
2. **`purchaseLineSummary()` takes the category map as an argument on purpose.** That is how a wide
   table shows `Utilities / Mobile Phones (Matthew)` and a narrow card shows `Mobile Phones
   (Matthew)` without forking the `+N more` rule. Build the map the way the caller needs.
3. **The split rule is settled: first line, then `+N more`.** All Transactions has rendered it that
   way since v0.3.0 and the supplier card now matches. Don't introduce a third convention for a
   fifth list — the full split is always one click away on `/purchases`.
4. **`listPurchases` already returns the allocations.** The suppliers page had been calling
   `.map(({ purchase }) => …)` and discarding them. Before adding a query to a page, check whether
   the data is already in hand.

## Watch out for (carried forward, still true)

- **Generated files are generated.** Editing `src/app/themes.generated.css` or
  `src/lib/theme/catalogue.ts` by hand will be reverted by the next build and caught by
  `tests/themes.test.ts` / `npm run themes:check`.
- **Another palette is one row** in `scripts/themes/palettes.ts`, then `npm run themes:build`.
- **The theme blocks must stay unlayered**, and **`@theme static` is load-bearing** — the chart kit
  reads `var(--color-chart-…)` from inline styles, which Tailwind's scanner cannot see.
- **Tokens only.** `tests/colour-tokens.test.ts` is a grep-gate that reads prose too: a phrase like
  "sky-blue" in a `.ts` file trips `PALETTE_CLASS`. Colour is never the only signal (§16.7).
- **`@source not` excludes prose from Tailwind's scan** — keep the directive.
- **Tailwind resolves competing colour utilities by stylesheet order**, not class-attribute order
  (the void button); `e2e/desktop.spec.ts` guards it.
- **Screenshot determinism**: the seed's captions tick with wall-clock time ("just now" → "3 minutes
  ago") — normalise them before any pixel comparison.
- **Project order matters in Playwright** (`workers: 1`, `fullyParallel: false`, one shared
  `.e2e-data`): `mobile` runs before `desktop`, so a spec that writes a purchase can shift what a
  later project's "five most recent" list contains. Run the **whole** suite, not just your project,
  before believing a list assertion.
- SANDBOX entries 8 (local browser — how to run Playwright here), 9 (stale `next dev` SSR), 13
  (GitHub connector drops), 14 (Turbopack rejects a symlinked `node_modules`).
- **`node_modules` can come back *partially* restored** — not just absent. This session started with
  a `node_modules` directory present but `tsx` missing, so all 52 suites failed at import with
  `ERR_MODULE_NOT_FOUND` and looked like a broken checkout. `npm ci --ignore-scripts` fixed it
  (SANDBOX entry 10's sibling note, now widened).
- `next build` flips `next-env.d.ts` — restore before committing. Don't bump the version while
  Playwright is running (the backup spec reads `APP_VERSION`).

---

> Provenance: the brief below is the Phase-1/Phase-2 handoff this session executed. Phase 1 (v0.16.0)
> tokenised the scheme; Phase 2 (v0.17.0, above) shipped the themes and the Settings picker, and
> answered its three open questions — cookie (not an inline script), a per-device gallery in the
> existing Settings page, and per-theme browser chrome from `generateViewport()` with the manifest
> pinned to the default. It is kept unchanged for context.

---

# Handoff: Colour tokens — Phase 2 of 2 (add the first theme)

Date: 2026-09-25. Branch: `arena/01a0da84-simple-finance` (from `main` @ `b364f18`, the v0.15.0 merge).

**Phase 1 is done.** The whole colour scheme now lives in one Tailwind v4 `@theme static` block in
`src/app/globals.css` (decision **159**, SPEC **§15.4**). The 35 `.tsx` files and the chart kit use
token names only; no palette class or colour literal remains in `src` outside the PWA `themeColor`
(`layout.tsx`). Rendering is **pixel-identical**: 39 screenshots (13 pages × 320/412/1400) of `main`'s
`src` vs the tokenised `src`, on the same seeded data, differ by **0 pixels** (only the elapsed-time
caption was normalised — see "Watch out for"). Gates at Phase-1 close: `npm test` **466** green
(461 + the new `tests/colour-tokens.test.ts` grep-gate), `tsc`, `format:check`, `next build` and the
full Playwright suite **71** green (SANDBOX entry 8).

## The household's requirement (recorded as decision 159 — it was never in the spec before)

> The colour scheme must be arranged so that **adding a new theme is a small, single-place change —
> not an app-wide edit in every page**.

Phase 1 wrote it down (SPEC §15.4 + decision 159) and built the precondition. **Phase 2 (this session)
is the proof**: ship one theme — a block that re-declares the same `--color-*` names under a selector,
e.g. `<html data-theme="dark">` — and a Settings toggle. Nothing else may change.

## What a theme touches (and only this)

- **One block.** Re-declare whichever of the existing `--color-*` tokens change, under the theme
  selector. Semantic names (`canvas`, `surface`, `ink`, `border`, `till`, `accent`, `positive`,
  `warning`, `danger`, `negative`, `note`, `chart-…`) are all in `globals.css` — read decision 159's
  table for what each maps to. Do **not** add new palette classes to pages; the grep-gate will fail.
- **The till stays legible.** `--color-till`/`--color-till-ink` is the by-design-dark surface and its
  ink, shared today by the till, the primary buttons and the active dark pills. A dark theme will want
  to split or invert it — do that **in the token block**, not in the pages. `ink-ghost` (slate-300) is
  used both on the till (quick-entry ×3) and once on a white card (supplier-card.tsx:349); if the two
  need to diverge, split into a `till-ink-soft` token (four sites).
- **Contrast rules stand.** "Colour is never the only signal" (§16.7) and the void-button legibility
  e2e (`e2e/desktop.spec.ts`, asserts the danger label inverts correctly) must stay green.

## Open Phase-2 decisions (record whichever you choose)

1. **Apply before first paint.** To avoid a flash of the wrong theme, set `<html data-theme>` before
   paint. SSR has no DOM, so you need the choice in a cookie that the layout reads server-side (an
   inline `<head>` script that reads the cookie works for the pre-hydration paint). Decide and record
   cookie-vs-inline-script.
2. **Settings toggle.** Add a key/value setting (audited, like the others in `settings.ts`) e.g.
   `theme`. Wire a toggle in `settings-forms.tsx` + a server action in `actions.ts`.
3. **PWA chrome.** `themeColor`/manifest are read before any stylesheet, so they cannot be a variable.
   Either add the `media` form of `themeColor` for dark, or accept the light chrome; document the
   choice (SPEC §15.4 already flags it).

## Watch out for (carried forward)

- **Screenshot determinism (learned this session).** The seed's captions tick with wall-clock time
  ("just now" → "3 minutes ago") and are the *only* thing that differs between two runs of an
  unchanged tree. To pixel-compare, re-seed and normalise those captions (`just now` / `N units ago`)
  before the shot; then a diff means a real change. With that, main-vs-tokens was 0 px.
- **`@theme static` is load-bearing.** The chart kit references `var(--color-chart-…)` from TSX inline
  styles, which Tailwind's scanner does not see; `static` keeps those variables from being
  tree-shaken. Don't "tidy" it away.
- **`@source not` excludes prose from Tailwind's scan.** The scanner reads markdown and comments; the
  mapping tables in decision 159 would otherwise generate palette utilities. Keep the directive.
- **Tailwind resolves competing colour utilities by stylesheet order**, not class-attribute order
  (the void button). `.text-till-ink` is emitted after `.text-danger` — verified again post-tokenise;
  the e2e guards it.
- SANDBOX entries 8 (local browser), 9 (stale `next dev` SSR), 13 (GitHub connector drops),
  14 (Turbopack rejects a symlinked `node_modules`).
- `next build` flips `next-env.d.ts` — restore before committing. Don't bump the version while
  Playwright is running (backup spec reads `APP_VERSION`).

---

# Handoff: Charts — the money, drawn (v0.14.0)

Date: 2026-09-25. Branch: `arena/01a0d991-simple-finance` (from `main` @ `c50cfa7`, the v0.13.1 merge).

**Released as v0.14.0 on 2026-09-25.** Release facts (merge commit, tag, digest) are stamped in
[`docs/RELEASE_NOTES_v0.14.0.md`](RELEASE_NOTES_v0.14.0.md); the version badge reads
`v0.14.0 · pre-release`. The household does two things in Unraid: back up, then Force Update.

**Released as v0.15.0 on 2026-09-25** (decision 158; badge reads `v0.15.0 · pre-release`). On a phone
the home page now **opens at the till** — a mount-time `scrollIntoView` in `QuickEntry`
(`openAtTillOnMobile`, home page only), anchored by `#quick-entry` / `scroll-mt-16`, with the mobile
drawer's **Quick Entry (Till)** link carrying `/#quick-entry`. It supersedes decision 151's "the page
does not scroll itself" clause only; nothing takes focus, so 151's keyboard-quiet rule (and its e2e
assertions) still stand. SPEC §15.1 records it, `e2e/home.spec.ts` guards it (fresh open + drawer
path). Release facts (merge commit `439eea4`, digest, tags) are stamped in
[`docs/RELEASE_NOTES_v0.15.0.md`](RELEASE_NOTES_v0.15.0.md); the full Playwright suite was green (71
tests) on the tagged tree.

## What changed (decisions 152–157)

The household asked for data visualisation and answered the three open questions themselves: **hand-rolled
SVG** (no chart library), the page is called **Charts**, and the scope is **all four charts plus the
settings key** in one release.

- **`/charts`** (`src/app/charts/page.tsx`) — four sections, each rendered twice: a 320px figure for a
  phone (`lg:hidden`) and a 720px one for a laptop (`hidden lg:block`). Linked from the nav between
  Insights and Settings, and from a card on the home page **below** the till.
  - **A. Forecast** — household total, today → one month, from `getHorizonProjectionView(db, +1 month, [],
    true)`. Zero always on the axis; below zero tinted; the overdraft line only when the domain reaches it
    (otherwise a caption sentence, decision 152); lowest point labelled; income days ticked.
  - **B. Groceries** — Mon–Sun weeks (12/26) against the configured figure and the trailing 8-week
    average. An empty week is a zero week; the current week is hatched and never averaged.
  - **C. Personal** — stacked months (6/12) by **"For: person"**; Household is its own segment and is
    never split; scope from the **live** tree (decision 154). Chips are links: `?who=person:3,household`.
  - **D. Fixed commitments** — monthly bars over `commitment_category_ids` (decision 156), with a
    `?scheduleOnly=1` toggle reading `purchases.scheduleInstanceId`.
- **Chart kit** (`src/components/charts/`, decision 155) — `ChartFigure` (verdict sentence, badge, caption,
  table twin), `chart-primitives` (gridlines, sub-zero band, reference lines, band labels), `scale.ts`
  (domain/ticks/geometry), `StepAreaChart`, `BarChart`, `StackedBarChart`. Server components only.
- **Pure resolvers** in `src/lib/records/chart-series.ts` (integer pence, no DB, no framework) with DB
  assembly in `src/lib/records/charts-view.ts`.
- **Settings** — `commitment_category_ids` in the existing key/value table:
  `getCommitmentCategoryIds`/`setCommitmentCategoryIds` in `settings.ts`,
  `saveCommitmentCategoriesAction` in `actions.ts`, `CommitmentCategoriesForm` in `settings-forms.tsx`,
  section `#commitment-categories` on `/settings`. **No schema change, no migration.**
- **`/purchases`** (decision 157) — repeatable `categoryId`, parent→children expansion,
  `targetKind=household`, and a "<Parent> / all children" option in the filter form.

## Watch out for (learned this session)

- **A controlled select before hydration is a silent black hole (proven 2026-09-25).** The merge's
  `browser` job flaked on `desktop.spec.ts`'s vehicle picker: `selectOption` landed before
  `PurchaseFilterForm` hydrated, React state stayed empty and the dependent Target select never
  populated — DOM and state visibly disagreed (a delayed-JS probe reproduces it on demand). The form
  now carries the decision-131 signal (`data-filters-ready` + `inert`), `waitForFilters` lives in
  `e2e/support.ts`, and the spec's fixture name is unique per retry. Any client island with controlled
  inputs needs the same signal before a test drives it — check the next form you touch.
- **`getDbHandle()` compared a raw path with a resolved one.** With a relative `DATA_DIR`/
  `DATABASE_PATH` the identity check never matched, so every call closed and reopened the handle and
  `/settings` (the only double caller) 500'd mid-render with "The database connection is not open".
  Fixed in the v0.14.0 stamp (`path.resolve` on both sides · `tests/db-handle.test.ts`) — but still
  start the dev preview with absolute paths (`DATA_DIR=$PWD/…`). SANDBOX entry 12.
- **The Arena GitHub connector drops mid-session.** Reconnect windows (batch the remote work, toggle on
  request, verify, report completed steps on any 401) are now standard practice for every release —
  read SANDBOX entry 13 before touching GitHub in a release session.

- **The screenshots found what the assertions could not.** Headless Chromium (SANDBOX entry 8) rendered
  `/charts` at 1400px and 320px, and reading the PNGs back caught two real defects no locator would have:
  the groceries reference labels printed on top of each other (fixed by alternating start/end and a white
  `paintOrder` halo), and the forecast legend named an overdraft line that was off the chart (fixed by
  drawing the legend entry only when the domain reaches the limit). Look at the picture before shipping a
  picture.
- **A second `next dev` in the same directory exits 1** with "Another next dev server is already running"
  after printing `✓ Ready` — Next 16 guards the project directory, not the port. SANDBOX entry 12.
- **A throwaway database is the cheapest way to see a state the seed cannot produce.** `cp -r .e2e-data
  /tmp/low-data`, add a checkpoint and a fat schedule with the repo's own domain functions, point one dev
  server at it — that is how the below-zero forecast (tint, overdraft line, "£1,831.27 below zero"
  headline) was verified in a browser without touching the seeded specs.
- **The e2e seed now carries history** (about six months of weekly shops, a year of discretionary spending
  and monthly bills). Every row is dated **≥ 10 days before today** and the new supplier names avoid
  `corner` and `insurer`, which `e2e/home.spec.ts:410-413` matches on. Keep both rules if you extend it.
- **Don't bump the version while the Playwright suite is running** — the backup spec derives its filename
  regex from `APP_VERSION` (unchanged advice from v0.13.1).
- `next build` still flips `next-env.d.ts`; `git checkout -- next-env.d.ts` before committing.

## Test state

`npm test`: **459 tests / 111 suites green** (43 new). The v0.14.0 stamp adds `tests/db-handle.test.ts`
(the `getDbHandle` identity check with a relative path) and `waitForFilters` in `e2e/support.ts` —
**461 tests / 112 suites** green after it, Playwright still **70 tests green** with the hardened filter
form. `format:check`, `tsc --noEmit`, `next build` and
`npm audit --omit=dev` clean. Local Playwright (SANDBOX entry 8 recipe, `playwright.local.config.ts`,
git-excluded): **70 tests green** across every project, including the new `charts` project (7 specs). CI's
`browser` job is the gate and went green on the PR and on the `main` merge commit.

## Open / deferred

- **Printing or exporting a chart** was explicitly out of scope this session, as were email/alert channels,
  bank feeds and card-level merchant data. Ask before adding any of them.
- **The tracked-commitment list can go stale**: a category the household adds later is not tracked until
  someone ticks it. A future session could nudge with "your schedules now use categories this chart does not
  track" — the data for it is already there (`scheduleCommitmentCategoryIds` vs the saved set).
- **Empty pot selection = every pot** on Horizon is kept and stated under the checkboxes. Still waiting on
  whether "untick all" should mean *none* (marker param + §7.6 wording + spec).
- **The household's real phone is still the final check (decision 148).** After they Force Update, ask them
  to open `/charts` on the phone: four charts, no sideways pan, and "Show the numbers" agreeing with each
  drawing.
- Overview hydration warning (`<p>` wrapping `<details>`/`<form>` at `overview/page.tsx:305`) — still out of
  scope.
- UK gallons; supplier-level documents (OQ10); home-page mobile layout beyond the till.
