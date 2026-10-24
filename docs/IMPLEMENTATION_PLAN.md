# Simple Finance Multi-household — Implementation Plan

> **ACTIVE PLAN (approved 2026-10-10):** this repository is the independent multi-household edition. The concise
> binding contract is [`docs/MULTI_HOUSEHOLD_PLAN.md`](MULTI_HOUSEHOLD_PLAN.md); the product requirements are in
> [`docs/SPEC.md`](SPEC.md). The current stable release is `v1.32.1` (issue #87). Household-scoped storage, verified identity
> assignment, support consent, tenant-scoped backup/restore, registry recovery and per-request tenant contexts are
> implemented. Live import of the owner's pre-existing single-household data remains unimplemented and requires a
> separately approved isolated-copy rehearsal. Decisions below preserve the delivery history; issues #85 and #86 were released as stable
> `v1.31.0` under decision 245, issue #89 as stable `v1.32.0` under decision 247, and issue #87 as stable `v1.32.1` under decision 249. Do not treat legacy v0.x release
> notes, source tags, project profile or the old session plan as current.

## Current multi-household decisions

- **Product:** one app container serves multiple private households. Each household may have up to two assigned
  sign-in identities; `people` attribution records are separate and are not limited to two. A one-person household
  is complete.
- **Repository and registry:** only `dougalbob/simple-finance-multi-household` and
  `ghcr.io/dougalbob/simple-finance-multi-household` are permitted. The publish workflow hard-fails for any other
  GitHub repository/image. Never publish to the original `ghcr.io/dougalbob/simple-finance` package.
- **Identity:** Cloudflare Access + Google remains the perimeter and identity provider. The app verifies JWTs and
  looks up a pre-assigned email-to-household membership in an admin-managed registry. Provision before first
  login; no self-sign-up; an unassigned identity is denied.
- **Data:** one SQLite finance database and one documents directory per household under
  `/data/households/<opaque-id>/`; a separate `/data/system/registry.sqlite` contains operational membership and
  consent metadata only. All requests select tenant context server-side, never from browser input; never use a
  process-wide mutable current-household pointer.
- **Support:** platform admin has no standing in-app access to other households' finance data. A household member
  may grant/revoke a visible, audited, time-limited support session, read-only by default. Host-admin access to
  raw Unraid files is an accepted limitation.
- **Unraid:** separate root `/mnt/user/appdata/simple-finance-multi-household` → `/data`; bridge networking;
  host `3009` → container `3000`. Original production remains at `/mnt/user/appdata/simple-finance`, host port
  `3007`, and its existing route; never mount or alter it.
- **Backups/migration:** per-household encrypted backup/restore contains only that household's SQLite data and
  documents, never the registry or another household. The existing two-person household is copied into its own
  tenant; link the existing Cloudflare emails to the existing people records. Rehearse from the current encrypted
  backup on an isolated copy, verify database integrity and document hashes, and take a fresh source backup before
  any later cutover if production data changed.
- **Release line:** first candidate `v1.0.0-rc.1`; RCs publish the exact version and SHA tag only, never `latest`;
  stable production is a separate `v1.0.0` release and only stable releases move `latest`. Never publish inherited
  v0.x tags to this package.

## Approved implementation order

1. Lock the documentation, Unraid template, GHCR repository/image guard, RC behavior and first-release upgrade-
   smoke filtering (foundation, delivered; no image/tag publication).
2. Implement the control-plane registry, admin pre-assignment, one-or-two identity limit and first-login denial
   (PR #2 merged at `ab3fda9698e078322e5cb26e604c877242f328f8`).
3. Route finance pages, server actions, attachment storage/viewing and attention APIs through immutable contexts
   resolved only from active registry assignments; cache independent handles by validated tenant path and migrate
   only registry-discovered tenant databases (current implementation work).
4. Separately approve/implement the person-to-identity link, consent-based support grants and audit, and
   tenant-scoped backup/restore. Until backup/restore is approved and isolated against multiple tenants, the old
   global API remains disabled and Settings has no backup/restore controls.
5. Rehearse the legacy finance database/documents import using an isolated backup copy; verify integrity, records,
   attachments and any separately approved tenant recovery path. Never touch live data in rehearsal.
6. Test concurrent households, cross-tenant denial, Cloudflare sign-in and a separate Unraid route on port 3009
   before any live import. Use a separate test household/route and account holder consent for mobile Google
   acceptance, and verify an unassigned identity is denied.
7. Publish `v1.0.0-rc.1` only after implementation and acceptance gates are complete; after RC acceptance, publish
   a distinct stable `v1.0.0`.

> **Versioning rule:** the current source version is not changed to `1.0.0-rc.1` by this implementation work. Set the
> package, lockfile, version module, template and release notes to that version together in the actual RC release
> PR. See [`docs/RELEASE_PROCESS.md`](RELEASE_PROCESS.md).

## Current branch validation (2026-10-10)

`npm test`: **782 passed**, 186 suites, 0 failed. `npm run typecheck`, `npm run format:check`,
`npm run themes:check`, `npm run build` and `npm audit --omit=dev` passed. The full local Playwright suite
passed **121 tests** using the throwaway browser setup in `docs/SANDBOX.md` entry 8. The build-updated
`next-env.d.ts` was restored. These are local results only; check PR CI conclusions separately before any merge.

## Multi-household decision log (additions)

- **2026-10-10 — registry and identity assignment landed (PR #2 merged at
  `ab3fda9698e078322e5cb26e604c877242f328f8`).** The system registry is `system/registry.sqlite` (control plane
  only: `households`, `identities`, `registry_audit`; SQL at
  `drizzle/registry/`, applied by `src/lib/registry/schema.ts` and the production twin
  `scripts/registry-migrate.cjs`, which the entrypoint runs and whose schema equality is pinned by
  `tests/registry-migrations.test.ts`). Household IDs are opaque 128-bit hex; all household paths derive from
  `src/lib/registry/paths.ts` with ID validation (no browser-supplied id or path is ever authority).
- **Assignment rules (enforced in `src/lib/registry/domain.ts`, audited row per change):** one or two assigned
  sign-in identities per household (a third is refused; one person is complete), one household per identity
  (normalised, globally unique email; unassign + reassign is the supported move), no self-sign-up, households are
  deactivated rather than deleted, and the last platform administrator can never be removed or demoted.
- **First-login denial is one choke point.** `getCurrentUser` (`src/lib/auth/current-user.ts`) now requires
  authentication **and** an active registry assignment for an active household — every page, server action and
  route handler already calls it, so unassigned or deactivated identities are denied everywhere with no
  per-route drift. `describeSession` reports the same decision with its reason for the denial page and `/admin`.
  A missing or unreadable registry denies everyone (fail closed).
- **Administrator surface:** `/admin` (platform-administrator role only) lists the operational roster, creates,
  renames and deactivates households, pre-assigns and unassigns sign-in emails, and shows the registry audit
  tail. It never exposes financial records. Bootstrap of the first administrator is a one-time environment
  consumption (`REGISTRY_ADMIN_EMAIL`, optional `REGISTRY_ADMIN_HOUSEHOLD_NAME`) while the roster is empty; the
  last-administrator guard keeps it from ever locking itself out. A platform administrator whose own household
  is deactivated retains `/admin` (so they can restore it) but no household pages.
- **2026-10-10 — per-household finance routing implemented on this branch.** `householdContextFromHeaders` /
  `householdContextFromRequest` build an immutable context from `describeSession`'s active registry assignment.
  The process-wide `getDbHandle()` is gone; `getHouseholdDbHandle()` caches independent handles by validated,
  absolute tenant path, and pages/actions use that context for reads, writes and audit. Attachment uploads,
  deletion and viewing use the same household's documents directory. Attention and attachment APIs are tenant
  scoped; tests pin spoofed-header refusal, concurrent handles and data isolation.
- **Container migration now follows the registry.** Startup runs registry migrations first, then migrates only
  each validated household ID in the registry at `households/<id>/simple-finance.sqlite`. It ignores inherited
  `DATABASE_PATH` overrides and never creates, migrates or chowns the old root-level finance/document paths.
  Finance handles migrate idempotently on first open so a household created after startup is usable.
- **Backup/restore remains a separately deferred feature.** The old global APIs authenticate and enforce
  same-origin, then return `501`; Settings explains the unavailable status. No request reads, writes or replaces
  tenant finance data through those routes. The archive library is legacy code and must not be exposed until a
  separately approved tenant-scoped implementation passes isolation tests. Nothing in this work touches the
  original installation, its data, route or port 3007.

---

## Historical single-household source-project record

> The material below records how the original `dougalbob/simple-finance` v0.x product was built. References to
> its original image, `/mnt/user/appdata/simple-finance`, exactly two global sign-ins, shared single database,
> phase map and release digests are historical context only. They are not active requirements for this repo.
> New work follows the current decisions above and `docs/MULTI_HOUSEHOLD_PLAN.md`.

> All names, amounts and dates in the historical examples below are fictional placeholders. Real values belong
> only in private installation data; see the privacy notice in `docs/SPEC.md`.

## Historical upstream session map (the original v0.x product only)

| Session | Scope | Status |
|---|---|---|
| 1 | Phase 0 + Phase 1 — bootstrap + thin vertical slice | Complete (PR #2) |
| 2 | Phase 2a — core money records: schema + pure domain modules, E1/E2/E4/E6/E7 | Complete (PR #3) |
| 3 | Phase 2b — mobile entry flows (Add Purchase / Add Fuel / Update Balance) + Playwright | Complete (build; browser tooling unavailable in this sandbox) |
| 4 | Phase 3 — schedules, estimate/projection engines, warnings, key-date alerts | Complete (build on session branch; docs in same PR) |
| 5 | Phase 4a — desktop pages + Insights v1 (first part) | Complete (build on session branch; docs in same PR) |
| 6 | Phase 4b — desktop pages + attachments (remainder) | Complete (PR #8) |
| 7 | Phase 5 — hardening & first release (v0.1.0) | Complete; published as v0.1.0, then patched as v0.1.2 |
| 8 | Post-release — remove an attached receipt (v0.1.3) | This change (decision 89). Not a new phase. |

> Phase 4a/4b boundary as delivered in Session 5: **4a** = Overview (dense dashboard), Purchases
> (filters + inline edit/refund/void), Recurring Payments (read-only month calendar + schedule/renewal
> edits), Accounts & Pots (edits + checkpoint history), Insights panels 1–4 (incl. the projection
> honesty loop), Settings (names, pots, category tree editor, projection figures, warning leads),
> version display in the nav. **4b** = Suppliers page, Contracts & Renewals page + its Overview panel,
> receipt/invoice attachments (SPEC §23), scenario E9.

## Historical upstream project profile (superseded)

The single-household profile that originally occupied this section is superseded by the active multi-household
profile at the top of this document and `docs/MULTI_HOUSEHOLD_PLAN.md`. The legacy finance-domain model below
remains useful as the starting point **inside one household database**, but its singleton database, exactly-two
global allowlist, old repo/package and old appdata path are not current deployment or tenancy decisions.

## Architecture summary

Keep the proven stack defaults: TypeScript strict, Next.js App Router, React, Zod at server boundaries, semantic
HTML + Tailwind, Node test runner via `tsx`, Prettier, multi-stage Dockerfile, Unraid template. The old
single-household auth, storage, database-connection and publication assumptions do not carry forward.

Domain rules live in small pure modules (estimate engine, projection engine, schedule lifecycle, split
validation, category tree), shared by UI hints, server validation, insights and tests. Money is integer pence
everywhere; per-period rounding, half-up, once (SPEC §7.3).

### Tenant/control-plane architecture (approved target and current runtime)

The control-plane registry at `/data/system/registry.sqlite` holds household identity/status, normalized email-to-
household membership, administrator bootstrap/role and registry audit metadata. It stores no finance records or
documents. Household finance remains in separate SQLite files at
`/data/households/<opaque-id>/simple-finance.sqlite`, with that tenant's own `documents/` and optional `logging/`
siblings. This physical separation is why existing finance tables do not need a `household_id` column in every
row; migrations apply independently to each tenant database.

The runtime resolves identity and active assignment before selecting a tenant database. Finance pages and server
actions use `householdContextFromRequest`; Request-based APIs use `householdContextFromHeaders`. Both derive from
the shared `describeSession` gate. `getHouseholdDbHandle` caches by the validated absolute tenant path; there is
no mutable global current-household handle and no browser-selected ID/path. The unscoped backup/restore API
remains disabled pending a separately approved tenant recovery implementation. Registry recovery is separate
from any later member backup. See `docs/MULTI_HOUSEHOLD_PLAN.md` for binding details and deferred consent policy.

### Data model sketch (entities — v1, inside each household database)

- `pots` — id, label, kind (bank|cash), sort, overdraft_limit_pence?, warning_threshold_pence?, archived.
- `checkpoints` — id, pot_id, amount_pence, effective_at (UTC instant), entered_by, created_at. Immutable.
- `suppliers` — id, name, normalized_name, default_category_id (most-used, derived or cached),
  contact_phone?, contact_email?, website?, address?, notes? (contact card, SPEC §21).
- `supplier_references` — id, supplier_id, label, value (label→value pairs, e.g. policy/account numbers).
- `supplier_interactions` — id, supplier_id, occurred_at, channel (call|email|letter|in_person|other),
  summary, outcome?, follow_up_date?, related_purchase_id?, related_renewal_id?, created_by.
- `categories` — id, parent_id (null = parent; exactly two levels enforced), name, retired_at?, sort.
- `targets` — exactly one household per database, `people` (one or two: id, label, verified email link), `vehicles` (id, label, owner_person_id).
- `purchases` — id, supplier_id?, pot_id, total_pence, occurred_at (timestamp), occurred_date (backdatable),
  paid_by_person_id, entered_by, note?, **schedule_instance_id? (non-null = the "from schedule" tag — the
  converted form of a schedule instance; also the self-heal back-reference)**, voided_at?, version
  (optimistic concurrency).
- `allocations` — id, purchase_id, amount_pence (signed: refunds negative), category_id (leaf),
  target_kind (household|person|vehicle), target_id?, refund_of_purchase_id?.
  Constraint: Σ allocations = purchase total (enforced in a transaction, tested).
- `refunds` — modelled as purchases with negative allocation amounts + `refund_of_purchase_id` link.
- `transfers` — id, from_pot_id, to_pot_id, amount_pence, occurred_at, entered_by, voided_at?, version.
- `debts` — id, counterparty (who, verbatim), direction (`we_owe`|`they_owe`, immutable), note?,
  created_by, version. Informal IOUs only — the outstanding balance is always derived from linked
  loan movements, never stored (SPEC §10.2). Renaming a debt updates the counterparty copy on its
  linked loan movements in the same transaction.
- `external_movements` — id, kind (`loan`|`swap`|`other`), direction (`in`|`out`, immutable),
  pot_id, amount_pence, occurred_at/occurred_date, counterparty, debt_id? (loans only, FK → debts),
  exchange_key? (swap legs only: one UUID shared by the pair), note? (required for `other`),
  entered_by, voided_at?, version. Money across the household boundary: in adds / out subtracts
  in the estimate engine like receipts and spending, never spending or income (SPEC §10.2).
- `schedules` — id, name, kind (dd|so|receipt), amount_pence, frequency (monthly|annual), due_day_of_month,
  **due_month (annual only — which month it falls in; NULL for monthly; DB-check enforced)**,
  pot_id, category_id? (leaf; NULL required for receipts), target_kind/target_id?, contract_ends_on?,
  active_from, active_until?, cancelled_at?, **cancelled_effective_on?** (instances from that date stop),
  version. (Phase 3 — decision 55.)
- `renewals` — id, label, supplier_id?, target_kind/target_id?, next_renewal_date, warn_days_before
  (default 21), repeats_annually, notes, advanced_from? (history of auto-advances), version (SPEC §22.2).
- `schedule_instances` — id, schedule_id, due_date, state (**upcoming|converted** — exactly one, enforced
  by a DB CHECK on the (state, link) pair), converted_record_kind (purchase|receipt), converted_record_id,
  converted_at, UNIQUE(schedule_id, due_date). Derived rows: re-derivable from the schedule, so deletion is
  the honest "instances stop existing" (SPEC §11.2).
- `receipts` — **own table (Phase 3 decision 55 / OQ5 resolved):** id, schedule_instance_id?, pot_id,
  amount_pence (>0), occurred_at/occurred_date, entered_by, note?, voided_at/by/reason?, version. Income has
  no category/target (SPEC §6), so it does not reuse `purchases`/`allocations`; the estimate engine treats
  it as +signed pence. This keeps one clean per-record shape while the estimate engine's per-pot sum stays
  transfer-invariant.
- `attachments` — id, purchase_id, file_key (server-generated under `documents/`), original_name, mime,
  size_bytes, sha256, state (pending|stored|failed|deleted), created_by, created_at (SPEC §23, §23.4).
  `deleted` is a soft-delete written by `deleteAttachment`; there is no CHECK on `state` and no extra
  migration.
- `settings` — typed string-key value store (Phase 3): `weekly_groceries_pence`,
  `monthly_fuel_pence:<vehicleId>` (SPEC §7.3), `renewal_warning_lead_days` +
  `contract_end_warning_lead_days` (default 21, SPEC §22); private runtime values, typed accessors in
  `src/lib/records/settings.ts`, empty string clears. (Household labels / payday-of-month config move to the
  Phase 4 Settings page when they become user-editable; the planning cycle's payday is currently derived from
  the earliest unconverted receipt instance — SPEC §11.3.)
- `audit_entries` — actor, action, entity, before/after summary, timestamp; written in the same transaction
  as the change (blueprint §3).

*Phase 3 design resolved (Session 4):* dedicated `receipts` table (not a signed-purchase reuse — OQ5), the
instance↔record back-references on both tables, `purchases.schedule_instance_id` for the "from schedule"
tag + crash self-heal, `due_month` for annual schedules, and `(pot_id, occurred_at)` / `(occurred_date)`
indexes for the estimate queries.

## Phased plan

**Phase 0 — Bootstrap.** Repo scaffold: package.json + lockfile, tsconfig strict, Next.js App Router, Tailwind,
Prettier, Node test runner via tsx, Drizzle + better-sqlite3 with migration tracking, `docker-entrypoint.sh`
skeleton, `.env.example` placeholders, CI-friendly scripts. Docs already exist (this set). *Exit: `npm ci`,
typecheck, format:check, test (trivial), build all green.*

**Phase 1 — Thin vertical slice (blueprint §2).** Authenticated access (`jose` verification of Access JWTs,
allowlist, fail-closed config, dev-identity behind dev flag) → one validated write (a pot + checkpoint) →
persistent read → container startup runs migrations → backup/restore skeleton exercised on the slice data.
*Exit: unauthorised/wrong-audience requests rejected in tests; checkpoint survives container recreate;
restore round-trip passes on an isolated copy.*

**Phase 2 — Core money records.** Pots, checkpoints (with effective-date rule), purchases + allocations with
exact-total constraint and remainder helper, split validation, category tree (seeded with SPEC §12, editable),
suppliers with memory + default chip, targets (household/people/vehicles), transfers, refunds, void/edit with
audit trail, optimistic concurrency, duplicate-entry notice. Mobile entry flows (Add Purchase / Add Fuel /
Update Balance) functional; supplier records include the contact card + reference pairs and the interaction
log (SPEC §21). *Exit: acceptance scenarios E1, E2, E4, E6, E7 (SPEC §17) pass as integration
tests plus a Playwright mobile-viewport run where tooling allows.*

**Phase 3 — Schedules, estimate and projection engines.** Schedules + instances with the upcoming→converted
lifecycle (unique-state enforcement), income schedules, estimate engine (SPEC §7.1, timestamp/date comparison
rules), projection engine (§7.2–7.3, period-level rounding), warning tiers (§8), pot-level transfer watch
(§7.5). Schedules gain frequency (monthly|annual) and optional contract end dates; renewal records and the
key-date alert engine (pure date arithmetic: warning windows, annual advance, "rolled / awaiting review" —
SPEC §22). *Exit: scenario E3 (counted exactly once at every instant — property-tested across the due-date
boundary), E5 (assume-cleared documented behaviour), E8 (projection arithmetic to the penny, tier selection,
DST + month/year boundary cases) all green.*

**Phase 4 — Desktop pages + Insights v1.** Overview (dense dashboard per SPEC §15.2), Purchases (filters,
inline edit), Recurring Payments (+ read-only month calendar view), Accounts & Pots, Insights (SPEC §16
panels 1–4), Settings (category tree editor, projection figures, thresholds, labels), **Suppliers page** and
**Contracts & Renewals page** with the Overview panel (SPEC §21–22), **receipt/invoice attachments**
(desktop picker, mobile camera capture, retroactive attach, authenticated viewer — SPEC §23), scenario E9.
Version display.
*Exit: desktop and mobile primary paths checked; calendar consistent with lists after schedule edits;
insights figures reconcile with the pure engines in tests.*
Session 5 delivered the first half (decisions 63–75); the calendar-consistency exit criterion is pinned by
`tests/recurring-calendar.test.ts` and the insights-reconciliation criterion by
`tests/insights-view.test.ts`.

**Phase 5 — Hardening & first release (v0.1.0).** Full backup/restore per blueprint §6 and SPEC §18
(encryption, filename contract incl. blob-download filename lesson, EXDEV staging, failure recovery,
wrong-password/corruption tests, **documents/attachments consistency and sha256 manifest verification**),
restore rehearsal into a clean isolated installation **covering records and attachments**, security review
against blueprint §4 checklist,
Dockerfile + GHCR workflow + Unraid XML template + first-install instructions, README brought to operating
truth, all gates + `npm audit --omit=dev`, PR → merge → tag → publish verification. *Exit: blueprint §12
"Definition of ready" checklist complete; user Force Updates and runs the listed acceptance checks
(real Cloudflare sign-in, a real till-moment mobile entry **including a camera receipt attachment**,
checkpoint + projection sanity, a renewal/contract-end alert inside its window, restore rehearsal evidence
covering attachments).

*Delivered in Session 6 (this session), with the decision numbers below:*

- **Backup format 2** — the WAL-safe snapshot plus every attachment the snapshot references, sha256 per
  file, an orphan report; refuses to build an archive that references a missing document (SPEC §18.2).
- **Restore** — accepts format 1 and 2, strict member allowlist (no traversal/absolute paths/extra members),
  per-file integrity, referenced-document verification, staged swap preserving both the previous database
  and the previous documents directory, rollback that never deletes the only recoverable copy (SPEC §18.4).
- **Live in-place restore** — `POST /api/restore` closes the process-wide handle, restores, reopens; the
  Settings panel carries the typed confirmation, the same-origin guard and a 512 MB bound.
- **Browser download path** — `Content-Disposition` filename carried into `anchor.download` with a tested
  fallback (the v0.2.21 lesson), plus an end-to-end Playwright case.
- **Container least privilege** — the entrypoint aligns `/data` ownership once and runs the server as
  PUID:PGID (Unraid 99:100); the CI and publish smoke tests assert the server is not root.
- **Unraid template + publish workflow** — `simple-finance.xml`, tag-triggered GHCR publication with a
  pre-push smoke test (health, unprivileged, database survives container recreation) and registry-digest
  verification.
- **Browser acceptance suite** — `e2e/` specs driven by real selectors (mobile till moment, desktop review,
  calendar consistency after a real due-day edit, backup download and restore through the UI); run in CI
  (`npm run test:e2e`), never claimed from markup rendering (blueprint §9).*

## Test strategy (domain-specific, on top of blueprint §9)

- Household-boundary money (`tests/external-money.test.ts`, 17 tests) is a first-class worked
  domain alongside E8: debt balances derive from movements (badges settled/void-only/settled),
  loan movements link to a live debt and render "settled", swaps are atomic net-zero pairs that
  survive DB round-trips, estimate ≡ Insights spending on the same fixture, `archivePot` refuses
  referenced pots. Followed by 4 Zod boundary tests (money-input caps, swap same-pot,
  archivePot naming) and e2e specs (`e2e/external-money.spec.ts` + a Move-tab test in
  `e2e/home.spec.ts`).


- Pure engine tests: estimate, projection, rounding, tier selection, schedule lifecycle state machine,
  split-total validation, category roll-ups.
- Integration tests on isolated databases: E1–E8 scenarios (SPEC §17) as named cases; checkpoint comparison
  precision rules (§7.1); void/edit audit trails; optimistic-concurrency conflict on shared edit; migration
  up-path.
- Date/time tests: Europe/London DST transitions, local-date rollover near UTC midnight, month/year/leap
  boundaries for due-day schedules (e.g. due day 31 in a 30-day month — rule: clamp to last day of month;
  confirm in Phase 3), payday window arithmetic.
- Auth tests: missing/invalid/wrong-issuer/wrong-audience/expired JWTs rejected on every protected entry
  point, including API routes and backup/restore.
- Key-date tests: renewal warning-window arithmetic (default 21 days, per-item overrides), annual advance
  including 29 February (OQ13 rule), contract-end alerts that never stop instances (property test across the
  end-date boundary), "rolled / awaiting review" state transitions.
- Attachment pipeline tests: content-sniffed MIME vs spoofed extension, size limit enforcement, failed upload
  leaves the purchase intact and retryable, orphan sweep reports without deleting, authenticated-only serving
  (no unauthenticated fetch), sha256 verification on restore, and user-initiated removal (decision 89):
  soft-delete then unlink, double-delete is a no-op, a deleted URL 404s, an unlink failure does not roll
  the row back, an unsafe key is not used as a path, and a pre-delete archive still restores the file while
  a post-delete archive has neither the document nor an orphan.
- Backup consistency tests: an archive can never reference a missing document; unreferenced documents are
  excluded and reported; `.env`/`logging/` provably absent from archives.
- Browser tests (Playwright where available): mobile-viewport entry flows, desktop table editing, calendar
  view consistency, backup download filename via the real client path.
- Never claim a browser run from markup rendering; distinguish harnesses honestly (blueprint §9).

## Decision log (all decisions dated 2026-09-20, discovery session with the product owner)

1. Pots: two joint bank accounts (Main "busy" account pays everything out; Salary account receives partner's
   monthly salary; manual transfers Salary→Main as needed) **plus cash tracked separately**: two personal
   wallets + shared jar (five pots total).
2. No credit cards in the household; out of scope.
3. Checkpoint figure = bank **current/ledger balance** (pending items not deducted).
4. Planning cycle: **payday-to-payday** for warnings/projection; **calendar month** for Insights reporting.
5. Headline figure = **household total across pots**, plus a separate pot-level "plan a transfer" watch on
   commitments due from the Main account.
6. Pending-at-checkpoint purchases: **assume cleared** (chosen twice, after the overstatement trade-off was
   explained and a tap-at-checkpoint compromise was offered). Documented limitation SPEC §7.4.
7. Recurring payments: **auto-convert to actual spending on due date**; amounts are fixed and user-maintained;
   no confirmation step; "from schedule" tag; edit/void for late/missed; cancellation with effective date.
8. Income: **fixed expected receipts in scope** (salary, known date, roughly fixed amount) feeding the
   projection. One-off income (a sale, a third-party refund, a gift) was deferred at the time and is
   **in scope from v0.4.0** (decisions 109–111).
9. Warnings: **two tiers** — heads-up below £0; main warning at a configured overdrawn threshold well inside
   the authorised overdraft limit (limit exists on the Main account only; real figures private).
10. Day-to-day projection: **configured figures** (weekly groceries; per-vehicle monthly fuel — spending is
    highly predictable: weekly shop within ~±£20) **+ Insights honesty loop** comparing recent actuals.
11. Attribution: **paid-by / entered-by / for-whom** kept distinct; defaults (shared→household, personal→payer,
    fuel→payer's vehicle) as visible one-tap-override chips; unobtrusive override to assign a purchase to the
    other person.
12. Vehicles: first-class **cost targets** — fuel, insurance, maintenance, road fund licence, parking; long-horizon
    per-vehicle totals; category × target as separate dimensions.
13. Splits: multiple allocation lines, each a whole-pence amount with exactly one target; **lines must total
    the payment exactly** (save disabled until matched; one-tap remainder helper). **No fractional/percentage
    splits between the two people** — couple activities are household allocations. No draft/incomplete splits.
14. Refunds: separate negative records, optionally linked; corrections via edit/void with retained audit
    history; transfers can never inflate spending.
15. Privacy between users: **full mutual visibility and editing** with audit trails; no in-app privacy walls.
16. Categories: **two-level parent/child tree approved as proposed** (SPEC §12); user-editable; retire
    preserves history; insights roll up to parent.
17. Connectivity: **online-only v1**; keep-on-screen + retry on reconnect; no offline queue or sensitive
    local caching.
18. Calendar: **read-only month view** of due instances on the Recurring Payments page; no drag-and-drop;
    explicit wording that in-app date changes never move bank instructions.
19. Notifications/reminders: **none in v1** (proposed; no objection = agreed per session convention).
20. Desktop: dense **Overview page only** as a single screen; all other subjects get their own menu pages —
    functionality is never sacrificed to save space. Mobile's main purpose is out-and-about quick entry;
    deep review happens on the laptop. Menu pages are not hidden on mobile (at least for now).
21. Release authority: **full delivery loop (blueprint option 1)** for the next coding session(s); this
    discovery session is explicitly **no-coding** — its deliverable is this spec handoff.
22. Privacy: public repo — all repo content fictional; real figures only in private installation config;
    `.gitignore` committed before any code (already on branch).

*Scope additions agreed later the same day (2026-09-20), after the initial handoff draft:*

23. Fixed-term contracts: DD/SO schedules carry an optional **contract end date** — informational with an
    ahead-of-time alert (configurable lead, default 21 days); **instances never auto-stop** because the app
    never assumes a bank instruction changed; past dates show as "rolled / awaiting review".
24. Renewals (house/car insurance etc.): dedicated **renewal records** — label, optional supplier link,
    optional vehicle/household target, next date, per-item warning lead (**default 21 days**), annual
    auto-advance; surfaced in an Overview panel and a Contracts & Renewals page. Schedules gain
    **frequency (monthly|annual)** so annual lump-sum premiums convert like any instance. Delivery channel
    **confirmed 2026-09-20: in-app for v1**; an optional **email alert channel is a recorded v2 roadmap
    item** (SMTP config, delivery-failure handling, tested delivery; scoped separately, not a v1 blocker).
25. Suppliers get **contact cards** (phone, email, website, address, label→value reference pairs such as
    policy numbers, notes) and an **interaction log** ("+ Create Interaction": channel, when, summary,
    optional outcome and follow-up date, optional links to a purchase/renewal), on a dedicated Suppliers
    page; both users see all; audited.
26. **Receipt/invoice attachments in scope for v1** (supersedes OQ6): PNG/JPEG/PDF, multiple per purchase,
    desktop file picker + mobile camera capture, retroactive attachment; purchase save never blocks on
    upload; stored under `documents/` with server-generated keys, content-sniffed MIME, sha256,
    authenticated private serving; included in backups with manifest verification (SPEC §18.2, §23).
27. **Historical upstream data root (superseded 2026-10-10):** `/mnt/user/appdata/simple-finance` on the original host → container `/data`,
    containing the SQLite files (+WAL/SHM), `.env`, `documents/`, `logging/`. `.env` and logs are excluded
    from backups; a separate recovery checklist covers configuration (SPEC §18.1).
28. Backup/restore contract made explicit in **SPEC §18** (previously only referenced via blueprint §6 in
    SPEC §2, this profile and Phase 5): contents/exclusions, consistency boundary for attachments,
    encryption + filename + blob-download lessons, restore staging/rollback rules, and the clean-installation
    rehearsal gate before real data is trusted.

*Session 1 (2026-09-20) — build decisions, recorded for future sessions:*

29. **Session map adopted** (table above): seven sessions; Phases 2 and 4 split into a/b. Recorded in this document at the product owner's instruction so no future session re-opens the phasing question. End-of-session documentation updates ride in the same PR as the code (user instruction 2026-09-20).
30. **Stack versions** (current, supported, mutually compatible; lockfile committed): Next.js 16.3.5, React 19.3.0, TypeScript **5.9.3** (deliberately not 7.x — the native-compiler line is newest but 5.9 is the known-Next-compatible choice; revisit later with a dedicated upgrade gate), Tailwind 4.3.3, drizzle-orm 0.45.2 + drizzle-kit 0.31.10, better-sqlite3 13.0.3, zod 4.6.5, jose 6.2.12, tar 7.5.22, Node 22 LTS.
31. **Drizzle sync-mode conventions** (discovered the hard way in Session 1; future sessions must follow): every query needs a terminal method — inserts use `.returning().get()` (single row) or `.run()` (no return); a bare `.values()`/`.returning()` is a no-op builder, not a query. Counts via `select({ value: count() }).from(t).all()`, not `$count()`. Recorded so Phase 2+ doesn't re-trip.
32. **Container strategy:** regular `next build` + `next start` (not standalone output) with the pruned production `node_modules` copied from the builder stage — robustness (native modules) over image size; optimisation candidate for Phase 5. Container runs as root for now (documented trade-off matching the reference app); Phase 5 security review to decide least-privilege execution.
33. **Historical upstream auth configuration (superseded 2026-10-10):** the original single-household app used `AUTH_ISSUER`, `AUTH_AUDIENCE`, and an `AUTH_ALLOWED_EMAILS` list of exactly two, optional `AUTH_CERTS_URL` (default `${issuer}/cdn-cgi/access/certs`), `AUTH_DEV_BYPASS` + `AUTH_DEV_IDENTITY_EMAIL`. The bypass is computed false whenever `NODE_ENV=production` — impossible to enable by flags alone. Verification restricts to RS256 and enforces issuer/audience/expiry/allowlist.
34. **Backup skeleton scope (Phase 1):** archive = tar.gz{db snapshot via `better-sqlite3 .backup()`, manifest.json} → AES-256-GCM (scrypt N=16384/r=8/p=1, fresh salt+nonce) with frame magic `SFBA` v1. Restore targets isolated directories only; live in-place restore (connection close, WAL/SHM, rollback, UI refresh) is Phase 5. Filename contract implemented and DST/midnight-tested; client blob-download tests land with the Phase 5 UI.
35. **Prettier excludes `*.md`** (`.prettierignore`): documentation is hand-authored, including the product owner's spec documents; markdown reformatting adds diff noise without value. (A `prettier --write .` reformatted the spec docs once in Session 1; reverted before commit — no spec content was lost.)
36. **Sandbox constraint (environmental, not a repo decision):** this sandbox blocks `nodejs.org`, so plain `npm ci` fails when npm's gypfile auto-build tries to compile `better-sqlite3` from source. `npm ci --ignore-scripts` works (the package bundles prebuilt binaries incl. linux-x64/node-22) and the suite verifies the native module — the blueprint §9 caveat is satisfied and recorded. Plain `npm ci` is proven in the CI `gates` job on GitHub Actions. Do not "fix" the repo for this; do not assume the constraint still holds in a future session — re-verify.

*Session 2 (2026-09-20) — Phase 2a build decisions:*

37. **Refund linkage on the purchase, not the line:** `purchases.refund_of_purchase_id` points at the original purchase (the plan's sketch placed it on allocations; the whole negative record links, so the column lives with the record). Every refund line must (category, target)-match an original line; cumulative active refunds are capped at the original total; a refund of a refund is rejected (that is just a purchase).
38. **Supplier category memory is derived, never cached:** count of non-void purchases per category; ties break towards most recent use, then lowest category id (stable, never arbitrary per query). The preselected chip can never go stale.
39. **Date-only money facts take effect at the end of the local date:** backdated purchases/transfers and date-only checkpoints share one rule (`endOfLocalDate`, Europe/London, DST-tested). `occurred_at` + `occurred_date` are stored together and consistency-checked when both are given.
40. **No mixed-sign splits:** purchase lines are all positive, refund lines all negative; a till discount reduces a line. Rejected with a message pointing at refunds (keeps SPEC §9.4 fraction-free).
41. **Void discipline:** voiding an original with active linked refunds is blocked — void the refunds first, explicitly, no cascades. Voided records are frozen: no edit, no second void.
42. **Optimistic concurrency via synchronous transactions:** a single-writer Node process running fully synchronous transaction bodies cannot interleave two transactions, so read-check-update inside one transaction is race-safe without a row-count assertion. Each domain module documents this assumption; it must be revisited if writers ever multiply.
43. **Uniqueness:** sibling category names and person/vehicle labels unique case-insensitively (domain-enforced); supplier `normalized_name` unique at the DB level with domain error mapping (race-safe).
44. **Retire is for child categories only** (parents stay while history points at them); edits that do not touch lines skip category re-validation, so fixing a typo never breaks on a category retired after the purchase.
45. **Duplicate-notice rule — OQ3 default shipped:** same pot + same total + (same non-null supplier OR a shared category) + created within [now−2h, now] + non-void; the newest match is returned, non-blocking.
46. **`paid_by` nullable in schema:** till entry always sets it; schedule conversions (Phase 3) may leave it null. The UI default (signed-in user) lands in Phase 2b/4 with the user→person mapping.
47. **Refunds default to the original's pot/supplier/payer** but may override each (a cash refund can differ from a card purchase); no same-pot enforcement.
48. **Phase-1 test maintenance:** fixed-date checkpoint tests now pass explicit `now` (future-dated records are rejected by the new validation); the `__drizzle_migrations` count assertion moved to 2 with migration 0001. People/vehicles/suppliers are never seeded (household data); categories are seeded (product content).

*Session 3 (2026-09-20) — Phase 2b build decisions:*

49. **Entry boundary shape:** Add Purchase submits integer-pence totals and a JSON split payload through a server action; Zod validates the parsed shape before the existing domain module enforces exact totals, live leaf categories and target existence. Add Fuel uses the same purchase path with the Fuel category and a vehicle target fixed server-side.
50. **Signed-in payer default:** until the Phase 4 Settings mapping exists, a visible paid-by chip is preselected from a person whose label appears in the signed-in email local part, falling back deterministically to the first person. The user can override it before save; schedule conversions may still use the nullable schema value later.
51. **Supplier entry ordering:** recent non-void supplier use is listed first, followed by alphabetical suppliers. Unknown typed names pass through the existing inline supplier creation path; near matches are a non-blocking client prompt, never an automatic merge.
52. **Quick-entry duplicate handling:** a duplicate notice is returned only after the save has succeeded. It links to the home review row and offers an explicit version-guarded void action; no duplicate is blocked and no record is deleted.
53. **Phase-2b setup:** people and vehicles remain unseeded household data. A small authenticated setup section is available on the home page so a fresh installation can create the labels needed by paid-by, personal and vehicle target chips; it is not a replacement for the Phase 4 Settings page.
54. **Browser harness status:** no Playwright package or browser is present in this sandbox. The mobile layout and single-flight guards are implemented, but no browser run is claimed; browser setup/real mobile acceptance remains an explicit Phase 5 gate.

*Session 4 (2026-09-20) — Phase 3 build decisions:*

55. **Phase 3 money-record shape (OQ5 resolved):** dedicated `receipts` table for income — NOT a reuse of
   `purchases`/`allocations`. Income has no category or target (SPEC §6), so forcing it through the
   exact-total split machinery would be a lie the schema would have to hide. `receipts` is a flat,
   positive-pence, pot-scoped money record (voidable, versioned, audited) that the estimate engine reads as
   +signed pence. Schedule↔record linking uses back-references on **both** sides:
   `purchases.schedule_instance_id` / `receipts.schedule_instance_id` (the "from schedule" tag) and
   `schedule_instances.converted_record_kind/_id` (history + self-heal). Migration `0002_phase3_schedules`
   adds schedules, schedule_instances, receipts, renewals, settings and the purchase back-reference column.
56. **Annual schedules need a due month:** a monthly-only `due_day_of_month` is ambiguous for annual
   schedules ("12 October every year" — which month?). `schedules.due_month` (1–12) is required for
   `frequency = annual` and NULL for monthly, enforced by the `schedules_due_month_rule` DB check. Annual
   due date = clamped `due_month`-`due_day` each year (29 Feb → 28 non-leap, OQ13).
57. **Conversion semantics (E3):** conversion is the local-midnight instant of the due date
   (`startOfLocalDate`, Europe/London — always exists). The converted record is an ordinary record:
   occurredAt = that midnight, occurredDate = the due date, single line = the schedule's amount/category/
   target, `paid_by` null, actor `system`, note `From schedule "name"`, created through `createPurchase` /
   `createReceipt` (so duplicate/void/edit/audit all work unchanged). The due pass is **lazy** — the app is
   not a cron daemon: every money read (`getMoneySnapshot`/`getProjectionView`/`getKeyDateAlerts`) first
   runs `ensureScheduleState` (materialize + convert due instances + advance due renewals). Conversion is
   idempotent and **self-healing**: each conversion first looks for a record already back-referencing the
   instance (crash between the two writes) and repairs the link instead of converting twice, so at no
   instant is a fact in two states and it is never subtracted twice (a converted record before a later
   checkpoint is excluded from that estimate — the E3 table, tested).
58. **Instance set = derived data:** `syncScheduleInstances` recomputes the desired upcoming set
   (due dates in `[max(active_from, day-after-last-converted), min(today+400d, active_until,
   cancelled_effective_on−1)]`), inserts missing (onConflictDoNothing) and deletes stale — deletion is the
   honest "instances stop existing" (SPEC §11.2); the schedule's own create/edit/cancel audits are the
   retained record. Edits apply from the next instance onward; converted history is never rewritten
   (SPEC §11.1). Cancellation = flag + effective date; instances from it stop existing, earlier ones remain
   history. Contract end dates are alert-only — instances never auto-stop (SPEC §22.1, tested).
59. **Comparison precision (E5 / SPEC §7.1):** a record is *after* a checkpoint ⇔ (timed) its instant is
   strictly after the checkpoint instant, or (date-only, recognised by the end-of-local-date marker) its
   local date is ≥ the checkpoint's local date — sharing the date counts as after, the conservative
   direction, self-correcting at the next checkpoint. Timed-vs-timed comparisons therefore never use dates.
60. **Projection reading (E8, penny-verified):** `days = payday − today` in whole local days; the configured
   day-to-day block (weekly groceries × days/7, per-vehicle monthly fuel × days/30, each rounded once at
   period level, integer half-up) is applied **pessimistically up front** — the low is computed as if all
   predictable spending lands before pay (exactly the E8 arithmetic). Commitments (unconverted dd/so
   instances) and receipts (unconverted receipt instances) apply on their due days; **within a day,
   outgoings apply before receipts** (still the conservative direction). `projected_low` = the minimum
   running value including the start; `payday` = the earliest unconverted receipt instance (today's dues are
   already converted, so it is strictly in the future); no receipt schedule → the view is null and the UI
   says exactly what is missing. (*Amended v0.5.0, decision 116:* the earliest debt expected inflow also
   wins the cycle, earliest against receipts. *Amended v0.6.0, decisions 118–119:* day-to-day is no longer
   smoothed pro-rata nor charged up front — each figure is a repeating **event** dated from the last actual
   shop/fill (the anchor-reset model, SPEC §7.3), which also ends the double-count after a recorded spend
   and makes the lowest point's date meaningful with day-to-day included.) Warnings (§8) against
   `projected_low`: below £0 → heads-up; at or beyond
   the most-protective configured pot threshold → warning. The pot watch (§7.5) excludes day-to-day by
   design.
61. **Renewal auto-advance is a full catch-up:** `advanceDueRenewals` steps repeating renewals one year at
   a time (each step audited, `advanced_from` history) until the date is in the future, so a late-created
   renewal converges in one pass; non-repeating renewals are left in place (key dates show them as past).
   29 Feb → 28 Feb in non-leap years (OQ13). Key-date windows are inclusive: an alert shows from exactly
   `leadDays` days before (E9's 21st-day boundary, tested).
62. **Phase 3 UI scope:** compact home panels — money estimate (household + per-pot, honest
    "not a bank balance" labels + last-checkpoint times), projection breakdown with tier banner, pot-watch
    nudges and a collapsible day-by-day table, due-this-week, key dates, and entry forms for
    schedules/renewals/projection figures (new server actions + Zod schemas following the Phase 2b
    conventions). The dense desktop pages (month calendar, Insights, Settings) remain Phase 4 per the
    session map — the mobile surface is the primary Phase 3 deliverable.
63. **Insights engine split (Session 5):** pure engine `src/lib/records/insights.ts` consumes flat typed
    rows (`SpendingLineInput`: occurredDate, categoryId, parent/child names, target kind/id, signed
    pence) — same shape the estimate engine uses, framework-free, integer pence only. DB assembly
    `src/lib/records/insights-view.ts` runs the lazy due pass first (converted schedule purchases are
    ordinary spending and belong in the month), then joins allocations ⋈ purchases (non-void) ⋈
    categories. **Transfers never reach the engine** (SPEC §10 — they move money between your own pots)
    and receipts never do (income is not spending); the join over `allocations` enforces both by
    construction. No arithmetic lives in the view layer, so the UI and the tests share one code path.
64. **Panel 1 months:** full calendar months; the current month carries an "in progress" flag while
    `today < last day of month` (DST-safe local dates). The Overview's "month so far" bars use a separate
    month-to-date summary (first of month → today) from the same view.
65. **Panel 2 attribution:** only lines with an explicit `person` target are attributed; **household
    allocations are never attributed to whoever happened to pay**; zero-activity people are still listed.
66. **Panel 3 window:** vehicle rolling 12 = first day of (current month − 11) → today, per vehicle,
    by child category (fuel/insurance/maintenance/road tax/parking); zero-activity vehicles listed.
67. **Panel 4 honesty loop (complete periods only):** groceries = last 8 complete Monday–Sunday weeks, counting only weeks on or after the first recorded purchase (decision 183); fuel per vehicle = last 3 complete calendar months, counting only months that contain or follow it (decision 184);
    fuel per vehicle = last 3 complete calendar months. Averages via `roundHalfUpDivide` (integer, once at
    period level); `drift = average − configured`, `null` when the figure is unconfigured. The partial
    current week/month never enters the average, so a 3-day week never mixes with a 7-day one (tested
    across the UK spring-forward, 2026-03-29).
68. **Pot edits (Settings):** `editPot` accepts label/kind/overdraft limit/warning threshold with the
    version guard + `pot.edit` audit; label collapses whitespace (≤60 chars); blank limit/threshold
    clears; **a threshold requires a limit and must sit at or below it** (`InvalidPotInputError`).
69. **Purchase filters (Purchases page):** `PurchaseFilters` gains `scheduleOnly` / `refundsOnly` /
    `voidedOnly` (isNotNull on `scheduleInstanceId` / `refundOfPurchaseId` / `voidedAt`); `voidedOnly`
    overrides the default voided exclusion. Line-level category/target filters match the purchase and
    return all its lines receipt-style.
70. **Recurring calendar is server-rendered from the instance list:** the month grid (Mon-first, 42
    cells, `?month=YYYY-MM`) renders exactly `listInstances(db, {from, through})` for the month window —
    one query, one row per cell — so the calendar and the lists below it are consistent **by
    construction**, not by synchronisation. Day details in `<details>`; each instance links to its
    schedule's edit form (`#schedule-edit-<id>`). The page states the read-only boundary in plain
    language: **app date changes never move bank instructions** — direct debits/standing orders are
    agreed with the bank; the app only changes which records it will make.
71. **Edit/refund/void forms:** `PurchaseEditForm` = full line replacement (line editor + hidden
    `linesJson` carrying integer pence; blank date/note = unchanged). `RefundForm` prefills the
    original's lines as **positive magnitudes**; `addRefundAction` flips the signs
    (`-total`, `-abs(line)`) before `createRefund` (decision 37's negative-purchase refund). A generic
    `VoidForm(recordId, expectedVersion, reason)` serves purchase and transfer rows with the same
    reason rules; voids never delete (decision 6).
72. **Revalidation + dynamism:** every new action revalidates `['/', '/overview', '/purchases',
    '/recurring', '/pots', '/insights', '/settings']`; all six new pages export
    `dynamic = 'force-dynamic'` (single-user household app — no caching of money figures).
73. **Settings sections:** household renames (person/vehicle, `renameTargetAction`), per-pot edit
    (68), the **category tree editor** (`categoryEntrySchema` ops add-parent/add-child/rename/retire,
    one shared `saveCategoryAction`; parents can't be retired while history points at them — retire
    children instead), `ProjectionSettingsForm` (slim props `{weeklyGroceriesPence, monthlyFuelPence}`,
    reused by home + recurring + settings), warning leads (`warningLeadsEntrySchema`, 0–365 days each),
    and the payday pointer (projection view's income schedule + link into Recurring).
74. **Overview density (SPEC §15.2):** money row + tier banner, projection panel with the
    "what's in this forecast" day-by-day `<details>` (shared component with the home page), due this
    week, key dates, month-to-date by-parent bars with last-month comparison, vehicle rolling-12, and
    the review list with inline edit/refund/void. Quick entry is embedded via the shared
    `buildEntryData(db, now)` (`src/lib/records/entry-view.ts`) — the mobile home and the desktop
    overview use one code path; the home page's inline builder was removed.
75. **Due-day edits move the next instance (Phase 3 bug fixed in Session 5):** the old
    `syncScheduleInstances` kept already-materialised upcoming instances, so changing a due day never
    reached any materialised instance — contradicting SPEC §11.1 "applies from the next instance
    onward". `editSchedule` now passes `{ regenerateFromToday: true }`: the upcoming set is regenerated
    from the schedule's **current** cadence starting today (no backfill of past dates under the new
    cadence — that would invent history). Creation and the daily pass keep history-based
    materialisation (an `activeFrom` in the past still yields its real, already-occurred instances).
    Regression: `tests/recurring-calendar.test.ts`.

*Session 6 (2026-09-21) — Phase 5 build decisions (hardening & first release):*

76. **Archive format 2 = snapshot + attachments + manifest.** `simple-finance-backup` format 2 carries
    `db.sqlite` (the supported WAL-safe `.backup()` snapshot), `manifest.json` and `documents/<key>` for every
    attachment the **snapshot** references in state `stored`. The document list, row counts and sha256 values
    are all read from the snapshot file, not from the live connection — that is the coordination point SPEC
    §18.2 asks for, so an archive can never describe a database state it does not contain. A file that the
    snapshot references but the disk has lost makes the backup **fail loudly** (`BackupIncompleteError`,
    HTTP 409) rather than produce an archive that only looks complete. Unreferenced files are reported in
    `manifest.documents.orphans` — never included, never deleted. The manifest cannot hash itself, so it is
    the one allowlisted member that is legitimately absent from `manifest.files` (see decision 81).
77. **Restore accepts formats 1 and 2 and verifies before it touches anything.** Order: authenticate
    (decrypt + GCM), extract through a strict member allowlist (`db.sqlite`, `manifest.json`,
    `documents/<uuid-like-key>`; directory entries ignored, everything else dropped), validate the manifest
    against the Zod schema, verify size + sha256 of every listed member, reject any extracted member the
    manifest does not list, `quick_check` the database plus expected-table probing, then verify that every
    `stored` attachment the restored database references is actually inside the archive. Only then does the
    swap happen.
78. **The swap is staged on the destination filesystem with rollback that keeps the old data.** Both the
    database (with its `-wal`/`-shm` sidecars) and the documents directory are renamed aside as
    `.pre-restore-<stamp>` before the replacement lands; if the replacement fails, the preserved copies are
    renamed back and any partially moved replacement is removed first, so the previous installation is
    complete again. Nothing is ever deleted on an error path. When the archive carries no documents the
    restored installation gets an empty documents directory rather than leftovers the restored database does
    not reference.
79. **Live restore closes the connection first and reopens it after.** `closeDbHandle()` → staged restore →
    `getDbHandle()` again, with a trivial read to prove the reopened handle is usable. If anything fails the
    handle is reopened against whatever is on disk (the restore layer preserved the previous data), so a
    failed restore leaves a working app. Archive-authentication failures (`BackupPasswordError`,
    `BackupFormatError`) are re-thrown unchanged so the route can say "wrong password" instead of "failed".
    `RestoreSummary.previousPreservedAs` gives the household the manual rollback path in writing.
80. **Route handlers guard themselves from the Request.** `/api/restore` and `/api/backup` call
    `getCurrentUser(request.headers, loadAppConfig())`, never the `next/headers` adapter (which throws
    outside a request scope, as the attachment route proved in this session's tests). Both POST handlers
    additionally require a same-origin request: `Sec-Fetch-Site: cross-site` is refused, `Origin: null` is
    refused, and a mismatched origin is refused (forwarded host allowed, which is how Cloudflare's tunnel
    presents the app). Server actions keep the framework's CSRF protection; route handlers do not get it for
    free, which is exactly why this is explicit.
81. **Attachment pipeline is one module.** `src/lib/records/attachments.ts` owns content sniffing
    (PDF `%PDF-`, JPEG `FF D8 FF`, the full PNG signature — extension and browser MIME are ignored),
    the 10 MB limit (plan OQ12), the strict server-generated key pattern
    (`uuid.{png|jpg|pdf}`), display-name sanitising (basename of a Windows-style path too; control
    characters, quotes, slashes and the Windows-reserved set replaced), storage writes with `wx`, the row +
    `attachment.store` audit entry in one transaction, and the read path used by the serving route. The
    upload action, the viewer, the backup engine and the restore path all import it, so they cannot drift.
    Rejected uploads write nothing at all — the purchase is untouched and a retry is a clean retry.
82. **A new archive password must be at least 12 characters; restoring accepts any non-empty password.**
    scrypt slows a brute-force attack, but it cannot rescue a one-character passphrase protecting the only
    copy of the household's data. The asymmetric rule keeps pre-Phase-5 archives recoverable. The typed
    destructive confirmation (`RESTORE`) is validated server-side too — the UI's confirmation is assistance,
    not authority — and uploads are bounded at 512 MB on the declared length *and* the received file.
83. **Download naming never depends on the browser's guess.** `filenameFromContentDisposition` supports the
    quoted and unquoted forms plus RFC 5987 `filename*=`, refuses anything that is not a plain file name
    (paths, traversal, control characters, >200 chars), and `chooseDownloadFilename` falls back to the
    versioned contract name generated locally in Europe/London. This is the v0.2.21 lesson implemented as a
    contract and tested at the layer that failed, with the end-to-end button path covered by
    `e2e/backup.spec.ts`.
84. **Supplier references and interactions became domain operations.** They were written straight into the
    tables by the form actions (no validation, no actor on the audit trail). Now
    `src/lib/records/fuel-economy.ts — v0.10.0 pure fuel maths: litres/odometer parsing, UK-gallon mpg full tank to
                                full tank, stretches and gaps, totals, the post-save sentence (decisions 139–141)
src/lib/records/fuel.ts       — v0.10.0 DB side of fuel: fills per vehicle, audited editFuelDetails, the Insights
                                view, row context for Purchases/Overview
src/components/fuel-details-form.tsx — v0.10.0 fuel summary + "Fuel details" editor on a fuel purchase row
src/lib/records/supplier-details.ts` owns them: trimmed and length-capped text, the five documented
    channels, `isValidLocalDate` on follow-up dates, `SupplierNotFoundError` for unknown suppliers, the
    supplier must exist, and `supplier.reference` / `supplier.interaction` audit entries written in the same
    transaction. `upcomingSupplierFollowUps(db, today)` is the query the Contracts page uses. The contact
    card gained an editor (version-guarded, `supplier.contact` audit) — it existed in the domain since
    Phase 2a but nothing called it.
85. **Container runs unprivileged by default (closes the Phase 5 security-review item, decision 32).** The
    image ships `gosu`; the entrypoint sources `/data/.env`, creates `documents/` and `logging/`, aligns
    `/data` ownership **once** (only when the root does not already match PUID/PGID — files the app writes
    itself need no fixing), fixes `/app/.next` so Next's runtime cache is writable, applies migrations as the
    unprivileged user, and `exec`s the server as `PUID:PGID` (Unraid defaults 99:100). `PUID=0` keeps the old
    root behaviour deliberately. Both the CI and the publish smoke tests assert `/proc/1/status` reports uid
    99, so the guarantee is tested rather than documented.
86. **Security review record (blueprint §4 checklist, Phase 5).** Every page and every API route verifies the
    Access assertion independently (`getCurrentUser`) — the attachment viewer, backup and restore included;
    the dev identity bypass is computed false whenever `NODE_ENV=production`; the public health endpoint
    returns `{status:'ok'}` and nothing else; both mutating route handlers have the same-origin guard
    (decision 80); money and document responses are `no-store`/`private, no-store`; production builds set
    `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy: same-origin`,
    `same-origin` opener policy, `X-Robots-Tag: noindex` and HSTS (dev builds deliberately omit them so the
    operator's hosted preview is not framed-out); no secrets, real names or figures exist anywhere in the
    repository; `npm audit --omit=dev` reports 0 vulnerabilities (4 moderate remain in the dev-only
    drizzle-kit/esbuild chain — accepted, because the suggested "fix" downgrades drizzle-kit to 0.18.1).
87. **Playwright is a real, CI-executed gate now.** `playwright.config.ts` starts `scripts/e2e-server.mts`,
    which seeds a fictional household into a git-ignored `.e2e-data` directory through the domain modules and
    runs `next dev` on port 3100 with the dev identity bypass. Projects: `mobile` (Pixel 7) for the till
    moment, `desktop` for review, `backup` for the download/restore path. **This sandbox cannot install
    browser binaries** (the download host is blocked; no system browser either) — the suite therefore runs in
    the CI `browser` job, and no local browser run is claimed (decision 54 stands, now with a harness behind
    it). The calendar grid exposes `data-date` per cell so the acceptance run can assert that the month view
    and the instance list agree after a real due-day edit.
88. **Historical upstream template and publication (superseded 2026-10-10).** This entry describes the original single-household repo, old `/mnt/user/appdata/simple-finance` root and old package. The active new template/package/host port and RC publication policy are recorded at the top of this plan, `docs/MULTI_HOUSEHOLD_PLAN.md`, `docs/RELEASE_PROCESS.md` and `.github/workflows/publish.yml`. Merging a PR still publishes nothing.

*Session 8 (2026-09-22) — post-release, remove an attached receipt (v0.1.3):*

89. **Removing a receipt is a soft-delete, then an unlink — never the other way around.**
    `deleteAttachment` in the shared attachment module (decision 81) loads the row by id (the client never
    supplies a storage key). In one transaction it sets `state = 'deleted'` only where `state = 'stored'`,
    then writes one `attachment.delete` audit on the purchase (`entity: 'purchase'`, the purchase id) with
    the file key, name, mime, size and sha256 in `before`, and the summary `Removed <name> (<size>, <mime>)`.
    A second delete matches zero rows and writes nothing. The file is unlinked only after that transaction
    commits. `ENOENT` is success; any other unlink error is logged and does not roll the row back — the
    leftover file is an orphan, which is the designed report, not a failed backup. Unlinking first would make
    every later backup fail closed (`BackupIncompleteError`) if the process died in between. No migration:
    `state` has no CHECK, and the audit entry already carries actor and timestamp. No undelete: an older
    archive is the only way back. The control is on Purchases, Overview and Suppliers (the three pages that
    render the receipt chip), a quiet two-click confirm, and the purchase's History list shows the audit
    line. A key that is not a safe storage key is never joined onto the documents directory. OQ12 is
    unchanged: this is user-initiated removal, not automatic pruning. v0.1.2 stays published as it was;
    this change is v0.1.3 and is tagged only after merge.

*Post-release follow-up (2026-09-22) — Quick Entry: Line 1 follows the amount (no phase, no version change):*

90. **A shop typed at the till fills split Line 1 until the household takes that line over.** Mobile entry had
    a step nobody wanted: type the amount, then retype it on Line 1 (or hunt for "Assign remaining") before
    Save would light up. `PurchaseForm` now mirrors the amount into Line 1 while the line is untouched. The
    takeover flag (`lineFollowsTotal`, true on mount) is cleared for good when the user edits the Line 1
    amount — that field's handler, **not** the shared `updateLine`, so category, "For"/target, supplier (and
    `selectSupplier`'s most-used-category write), pot, paid-by, date and note changes all keep the following —
    when they press "+ Add split" (the new line stays empty and Line 1 is neither cleared nor shrunk), or
    when Assign remaining writes Line 1. Removing an extra line does not resume it; only "Add another" does.
    `parsePence("8")` is already £8.00, so every valid intermediate keystroke mirrors (typing 8 then 5 ends at
    85.00 — nothing freezes on the first valid number) and a correction from 85 to 84.50 arrives too. A
    deleted or zero total clears the line; a half-typed "85." or a negative total leaves the last mirrored
    value and keeps Save disabled, because `balanced` already requires a positive parsed total. The rule is
    the pure `followedLineAmount` (`src/lib/records/quick-entry.ts`) over `penceInput`, now shared from
    `src/lib/money.ts`. Deliberately unchanged: no category control next to the supplier and the amount (the
    dropdown stays in "Split the payment", above Save), the `balanced` check and its exact-total rule,
    `assignRemainder`'s replace-not-add behaviour, the paid-by chip not retargeting existing lines, and every
    server action. No schema, migration, backup-format or version change. Coverage:
    `tests/quick-entry.test.ts` plus `penceInput` cases in `tests/money.test.ts` (Node, run green here), and
    seven mobile specs in `e2e/home.spec.ts` for the mirror, the keystroke sequence, the half-typed and
    deleted totals, the takeover, Add split and "Add another" — the flag is client state, so those need a
    browser and run in the CI `browser` job.

*Post-release follow-up (2026-09-22) — publishing v0.1.4 (no code change):*

91. **A release tag is a claim about the commit it points at, so cut it after the metadata bump lands.**
    v0.1.4's publication stalled until `v0.1.4` was re-cut on `7197666`: the first `v0.1.4` tag sat on the
    PR #13 merge (whose `package.json` still said `0.1.3`) and a `v0.1.5` tag sat on the metadata-bump merge
    (whose `package.json` says `0.1.4`). Both publish runs reached `Verify the version metadata matches the
    tag`, refused, and pushed nothing — which is the design: an image must not exist for a version the code
    disowns, and a half-published registry tag is worse than a refused run. `docs/HANDOFF.md` §5 now carries
    the two-command local pre-check and the ordered step list. Because neither refused tag had ever published
    an image, `v0.1.4` could be re-pointed and the unused `v0.1.5` release deleted; `v0.1.2` and `v0.1.3`
    have images on the registry and are never moved (the same rule that left `V0.1.1` in place). Publication
    is otherwise unchanged: `v*.*.*` tag push (or `workflow_dispatch` with a tag that exists), smoke test
    before push, then the release tag, `latest` and `sha-<short>` on one digest.

*Post-release follow-up (2026-09-22) — Purchases filters on a phone (v0.1.5):*

92. **Phone Purchases filters collapse; the fields stay inside the card.** The GET form is unchanged
    (same names, same query). On viewports below `sm` a full-width **Show filters** / **Hide filters**
    button is the only chrome until tapped; the panel starts collapsed unless any filter is already in the
    URL, in which case it starts open so an applied filter is not invisible. From `sm` up the toggle is
    hidden and the fields stay visible. From date and To date share one row (`grid-cols-2`); Pot, Supplier,
    Category and Paid by stay one per row (`col-span-2 sm:col-span-1`). Every control is
    `w-full min-w-0 max-w-full` so a native date or a long category label cannot overflow the rounded
    card. Client component `src/components/purchase-filter-form.tsx`. No schema, migration or backup-format
    change. Coverage: mobile `e2e/home.spec.ts` (collapse, same-row dates, in-card bounds, stays open after
    Apply) and desktop `e2e/desktop.spec.ts` (toggle hidden). Those run in CI; this sandbox has no browser.

*Post-release follow-up (2026-09-23) — money across the household boundary (unreleased):*

93. **The shared cash jar is replaced by one cash pot each, so handovers are tracked.** The users'
    real-world gap: John giving Janet £200 in cash had no honest home — a jar cannot say who held
    the notes. Seed, fixtures and E8 now carry four pots (Main, Salary, Alex's cash, Sam's cash);
    a handover is an ordinary internal transfer with a note, `household_available_now` unchanged.
    Retired legacy: the jar existed only in seed/fixture/demo data — no live install ever held cash
    history, so no data migration maps the jar onto anyone.
94. **Borrowing is loan movements plus a lender, never income.** A `debts` row tracks who and which
    way round; loan movements (`external_movements`, kind `loan`) move the pot estimate and the
    derived owed balance together. The Overview shows owed/owing beside "available now". No interest,
    no schedules — repayments simply reduce the balance, and a settled debt stays as history.
    Financial-text-fidelity decision (blueprint §6): a debt says "we owe £50.00", borrowing says
    "borrowed", never "income"; surfaces distinguish *reported* (checkpoints) from *recorded*
    (movements: money in/out) from *owed* (debts).
95. **A swap is an atomic net-zero pair, survivable leg by leg.** `createSwap` writes both legs in one
    transaction under one `exchange_key`, with two audits, and rejects same-pot pairs — the son's
    wages scenario can never half-record. Each leg keeps its own version for independent correction
    (voiding one leg leaves the other standing, honestly); kind, direction, debt link and exchange
    key are immutable, so a swap cannot quietly become borrowing.
96. **Miscellaneous boundary money needs a note, or it does not happen.** Kind `other` requires a
    note (Zod refuses the empty form) because an unexplained in/out is exactly the gap being
    closed. Excluded from Insights by construction — the Insights join is over `allocations`, and
    boundary money never has one.
97. **Entry lives in the moment, on both clients.** A fourth quick-entry tab (Move: pots, a debt,
a swap, or other) and matching sections on the Pots page share the same form components, so
thumb and keyboard take the same path. Pots gain `archivePot`, which refuses any pot a live
record still points at — archiving is a tidy-up for empties, never a deletion.
98. **The same-day comparison is sign-aware (v0.2.1, 2026-09-23).** v0.2.0 counted every
    date-only record sharing a checkpoint's date as *after*; safe for debits (understating
    self-corrects) but it double-counted same-day credits — swap in-legs, receipts, transfer-ins,
    refunds — and a same-day checkpoint could never self-correct, because the counted credit was
    already inside the counted balance (field report: a cash pot read £180.00 instead of £100.00;
    SPEC E13). The rejected alternative — flipping `>=` to `>` for everything — would have absorbed
    same-day *spending* after a checkpoint (overstating, and it lies about the bank pot). Rule now:
    same-day date-only credits are absorbed; same-day date-only debits still count. The known cost,
    accepted with the household: a same-day swap makes the household total read one leg LOW until
    the next checkpoint (the out-leg dips, the in-leg is absorbed) — no rule is both per-pot-safe
    and household-net-zero on the day, and low was chosen over high. Debits self-correct at the
    next later-dated checkpoint; live v0.2.0 data self-heals under the new rule, so no migration.
99. **A checkpoint refreshes every page it can move (v0.2.1, 2026-09-23).**
    `addCheckpointAction` — and six sibling actions — revalidated only `/`, so checkpointing from
    /pots or /overview left those pages stale until a manual reload. All server actions now use the
    shared `revalidatePages()` set, so the simple estimate figure (≈ £100.00) updates in place
    everywhere. An itemised "since the last checkpoint" breakdown was first added to the pot cards
    but withdrawn before the PR: the household confirmed the card should show the simple figure
    only — the estimate badge and the "Last reported" line are the display.
100. **Swaps are managed where they were made (v0.2.1, 2026-09-23).** The boundary list at the foot
    of /pots existed but the household never found it; the missing capabilities were edit (domain
    `editExternalMovement` existed without a surface) and an honest whole-pair correction. The
    "Swap with someone outside" section now lists recent pairs grouped by exchange key with the net
    total (green £0.00 balanced, amber "legs differ" when one leg was edited or voided alone, grey
    voided), per-leg edit and single-leg void under "Correct or void one leg", and a two-click
    "Void both legs" that voids the pair in one transaction with one shared reason (`voidSwap`,
    version-guarded per leg). Pot cards link to the list when they are involved in a pair.
101. **"All Transactions" is a projection, not a new record type (v0.3.0 line, 2026-09-23).** The
    household sketched a one-page, read-only view of all activity for one account or cash pot
    (purchases, direct debits, transfers, boundary money). It is a pure read over the four existing
    money families plus checkpoints: nothing is written, no add/edit/void is rendered, and every row
    links to the canonical form that keeps that behaviour. **No schema change is needed**, so the
    "breaking changes are acceptable" permission stays unspent. One pot target at a time (the
    household's position, not a pre-existing SPEC rule). SPEC §15.2 table row + new §15.3.
102. **The sketch's compact codes are kept; `POS`/`BYP` stay unallocated (household choice,
    2026-09-23).** Offered plain words ("Purchase", "Transfer in") against the sketch's codes, the
    household kept the codes. Purchases carry no payment channel, so `PUR` covers every purchase and
    **no channel field is added** — a fourth dimension on the busiest record in the app, typed at the
    till and read by one column, is not worth its cost. `SO` is split out from `DD` because a
    schedule's kind is recorded and schedules are never deleted, so a converted purchase's origin is
    always resolvable. `REF` marks refunds and `SW<`/`SW>` mark swap legs, following the sketch's
    angle-bracket idiom. `TX<`/`TX>` unify internal transfers and boundary `other` money (the cell
    shows the other pot's label or the counterparty), which is how the sketch reads.
103. **Income rows are deferred; `BAC` is reserved (household choice, 2026-09-23).** The sketch's
    `BAC` row ("Acme windows · Income: Janet") is not producible today: `receipts` has no
    source-name and no category column, `createReceipt` is called only by schedule conversion (there
    is no manual income entry), and `listReceipts` has no caller at all (no page lists income).
    Rendering that row would need schema, an entry form and a list — an income feature, not a
    display tweak, and one that reopens the income-analysis question §12/§16 deliberately excludes.
    Scheduled income will slot in later as `BAC`; meanwhile a one-off third-party credit is recorded
    as other money in (counterparty + mandatory note) and appears as `TX<`.
104. **Refunds are shown; voids are excluded silently (household choice, 2026-09-23).** "No
    refund machinery" is about the void/refund *UI*, not the rows: a refund is already a purchase
    with a negative total, so it projects as a green `REF` row with zero new machinery, and the
    estimate counts it (`signedPence = −totalPence`). Excluding refunds would make the page disagree
    with the pot for no gain. Voids stay excluded (`voided_at IS NULL`), and the page renders no
    count of them either.
105. **Every row links to a record the app can actually show (household choice, 2026-09-23).**
    Only purchases had a real destination: transfers live in a last-5 list on /overview, boundary
    money in a 20-row list on /pots, and none of those rows had an anchor. Chosen fix is the small
    one — stable row anchors (`purchase-{id}`, `transfer-{id}`, `external-{id}`) plus
    `?transfer={id}` / `?external={id}` parameters that force-render a referenced record when it
    falls outside the recent list, so a link can never land on a list that no longer contains it.
    A full transfers/income history was considered and rejected as a second feature area.
106. **The page's total is "movements shown", and checkpoints are divider rows (2026-09-23).** The
    window total cannot be labelled "estimate change": voided records are invisible here, and §7.1's
    sign-aware rule absorbs a date-only credit sharing a checkpoint's local date while counting a
    date-only debit — so the two differ even with no voids and refunds shown. Checkpoints therefore
    render as visually distinct divider rows carrying the **reported** figure (never a computed
    balance), which is the reconciliation aid the household wanted, and the total row states plainly
    what it is.
107. **One row per record, filtered on `occurred_date`, capped at 500, due pass still running
    (2026-09-23).** One row per record (never per allocation line) is what makes the amount column
    sum to the stated total; a split shows its first line and "+N more". Date filters use the local
    `occurred_date`, as every existing list does, so the window matches the sketch's start/end and
    never depends on an instant. The end date cannot be in the future because no record can be
    (§9.1). The date column renders `occurred_date` (decision 108 fixes the format): reusing
    `formatInstantLocal` would print `23:59` for every date-only record, a time that never happened.
    The lazy due pass runs as on every read page so today's direct debit appears; "read-only" means
    no user-facing writes.
108. **The date column is date-only `YYYY-MM-DD`, and purchases are `PUR` (household choice,
    2026-09-23, at build time).** Asked whether the sketch's dotted date should be per-page or
    app-wide, the household chose plain ISO with **no time at all** on this page; other pages keep
    their existing rendering, so this is not an app-wide change. On `PUR` vs `POS` the household
    left the call to the agent: `PUR` ships, because it cannot be misread as a payment channel, and
    `POS`/`BYP` stay reserved for the day a real channel field exists. Two corrections landed while
    building, both now in SPEC §15.3: (a) archived pots are **not** offered as targets — decision
    101 first said they should be, which was wrong, because `archivePot` refuses any pot with records
    at all, so an archived pot's activity is empty by construction and there is never history to
    strand; (b) a standing order with no supplier shows the **schedule's name** in the source cell
    rather than "Unknown supplier", which would be a dead end on a dense list.

109. **Income is a feature of its own, and `BAC` is rendered (household choice, 2026-09-23,
    v0.4.0).** Decision 103 deferred income rows because the app could not produce one: no manual
    entry, no source column, no list. The household answered the four questions that deferred it:
    build all three phases (entry, list, `BAC` rows); one free-text **source** field ("Sale of
    bicycle") rather than a payer list; a **dedicated Income page**; and (decision 112) always move
    a weekend payday to the Friday before. Migration `0006_income_source` adds the optional
    `receipts.source` column; `createReceipt`/`editReceipt` accept it; `addReceiptAction`,
    `editReceiptAction` and `voidReceiptAction` wrap the domain; `activity.ts` renders income as
    `BAC`. **No estimate, projection or insight code changed** — receipts were always +signed pence
    there, and insights stay blind to income (§12/§16). Insights still carry no income analysis:
    no income-vs-spending, no income categories (decision 103's reasoning stands).
110. **One-off income is a receipt with a `source`, not an external movement (household choice,
    2026-09-23).** The documented interim was other money in (`TX<`, counterparty + mandatory
    note). The household's own example — selling something they own, paid in cash or by bank
    transfer — is *income into a pot*, not money across the household boundary with a counterparty,
    and borrowing is the one thing that must never read as income. So: `receipts` gets one nullable
    free-text `source` (120 chars, trimmed, blank stored as NULL) for what or who it came from, and
    the note stays optional. A converted expected receipt leaves `source` NULL and reads its
    **schedule's current name** through the back-reference, so renaming a salary does not strand
    history. Income still has no category and no target (SPEC §6): it is not spending.
111. **Income lives on its own page, and is desktop-shaped (household choice, 2026-09-23).** "I
    would like the majority of income to be handled by a scheduled entry… I can handle any small
    edits on PC view, it is not subject I expect to be visiting from a mobile view." So `/income`
    joins the menu (between Recurring and Accounts & Pots) with three sections — scheduled income
    (add/edit/cancel in place, "applies from the next instance onward"), one-off income entry, and
    one list of everything received with inline edit/void — and **Quick Entry gains no income
    tab**: squeezing a record the household does not make at the till into the mobile panel would
    cost more than it returns. Deep-link contract is the decision-105 pattern: `receipt-{id}`
    anchors plus `?receipt={id}`.
112. **A weekend payday is expected on the previous Friday — always, for income only (OQ2
    resolved, household choice 2026-09-23).** Not a toggle: "always move salary income to the
    previous Friday if pay date falls on a weekend". Implemented once, where due dates are derived
    — `dueDateForPeriod` in `schedules.ts` — so instance materialization, the "next due date"
    every list shows, the calendar and the to-payday projection all agree, and an *upcoming*
    instance left on a weekend (materialized before this rule) is re-dated on the next sync while
    converted history is never rewritten. Two consequences are deliberate and documented in SPEC
    §11.3: a payday configured for the 1st can land in the previous month, so one calendar month
    can hold two instances; and **bank holidays are not handled** — the app has no holiday
    calendar and will not guess one, so a Friday bank holiday still expects the money that day and
    the receipt can be corrected by hand.
113. **The `BAC` row resolves its source, and links to the Income page (2026-09-23).** Source cell
    = `receipt.source` ?? the income schedule's name ?? "Income"; category `—` (income has none);
    direction always `in` (a receipt is a credit to its pot); the note as stored; a primary link to
    `/income?receipt={id}#receipt-{id}` and, for a converted receipt, the secondary
    `/recurring#schedule-{id}` link DD and SO rows already carry. Voided income is excluded here
    and shown struck through on the Income page, which is where its history lives.
114. **Horizon is its own page at `/horizon`, laptop-shaped (household choice, v0.5.0).** The
    household wanted "how far the money would go": pick a future date and see where every expected
    commitment and receipt would leave them, beyond the payday window. They chose a **dedicated
    page** named "Horizon" over another Overview mode — the same reasoning as Income (decision
    111): it is a sit-down surface, not a till-side one, so Quick Entry stays untouched and the
    menu gains **Horizon** after Recurring. All pots are selected by default and the household
    untick to scope it; day-to-day (groceries + fuel) is included by default and toggleable.
    Selection, through-date and the toggle persist in the URL (`?through=…&pots=…&daytoday=…`).
115. **The horizon reuses `projectToPayday` with `paydayDate = throughDate` (v0.5.0).** No second
    engine and no second arithmetic: the pure window walker already models
    `available + Σ receipts − Σ commitments − day-to-day`, tracks the running low and warns, and
    its final day's `runningPence` *is* "where we'd land". The horizon read model (in
    `money-view.ts`) filters the window to the selected pots, then delegates. The property test in
    `tests/horizon.test.ts` pins the hand identity — `available + receipts − commitments −
    day-to-day` equals the final per-day row — so the two read models can never disagree.
116. **Debt expected inflow is a pair-or-nothing expectation, never income (v0.5.0 feature 2).**
    Migration `0007_debt_expected_inflow` adds nullable `expected_inflow_amount_pence` and
    `expected_inflow_day_of_month` to `debts` (both set or both null — enforced at the boundary
    and again in the domain). `editDebt` persists the pair; `expectedInflowOccurrences` derives
    the dates with `incomeOccurrencesBetween` — month stepping, clamped (OQ1), weekend-shifted
    (`shiftIncomeOffWeekend`, decision 112's rule, numbered **decision 7** in the v0.5.0 notes) —
    and returns nothing when the derived balance is ≤ 0. It lands in the pot the most recent live
    loan movement targeted, flagged `expected`, and joins the payday window (§7.2) *earliest-wins*
    against receipts and the horizon window (§7.6). It is read-only: it never touches the estimate,
    the Income page, or `BAC` (§10.2, §11.3 hold).
117. **Horizon detail blocks collapse beyond 60 days (v0.5.0).** A look-ahead of up to 60 days is a
    sit-down read; beyond that the day-by-day table, the commitment list and the expected-money
    list start collapsed (`<details>` without `open`), one tap each — density without a
    spreadsheet. The lowest-point line stays visible at every window length, because a long healthy
    window can still dip hard mid-month and the projection must say so.
118. **Projected day-to-day spending is episodic, anchored on actual events (v0.6.0).** The
    household's real world: fill the Mercedes £55 on the 29th and it will not need fuel for
    ~3 weeks; the weekly shop happens on one day, then not again until the next. The v0.1-era
    smoothing (pro-rata the configured figures, charge the whole window's block up front) had two
    faults the household hit in live use: a recorded fill/shop was double-counted for its whole
    cooldown window (once in the estimate, once in the smoothed allowance), and every lowest point
    with day-to-day included read "today" — the up-front lump's artifact (the original smoothing
    decision is amended here). The replacement (SPEC §7.3 v0.6.0): each configured figure is the
    amount of a **repeating projected event** — groceries every 7 days, fuel every 30 days per
    vehicle — whose next date derives from the ledger (`last anchor + cadence`). `src/lib/records/
    day-to-day.ts` owns the anchors (a positive `Groceries > Weekly Shop` allocation for the week;
    a positive `Vehicle Running > Fuel` allocation targeted at the vehicle for each fill) and the
    event list; the events join the same pure engine as ordinary dated outgoings, so there is
    still no second arithmetic and the horizon/payday panel cannot disagree on shared days.
119. **Anchor-reset detail rules (v0.6.0, all agreed with the household).** Amount = the configured
    figure (stable budget, not last-actual — avoids whipsaw when one shop is small). Only
    `Weekly Shop` resets the groceries week — `Top-up Shops` are spending between shops. Each
    vehicle's fuel clock is its own; a `Fuel` line with no vehicle target anchors nothing. No
    history, or an overdue anchor ⇒ the next event is **tomorrow**, then the cadence resumes
    (pessimism — the projection may understate, never overstate). No weekend shifting. Voided or
    refunded purchases are no anchor. Events are household-level: pot scoping never filters them,
    and the §7.5 pot watch still excludes them. E8 (SPEC §17) is reworked end-to-end for the new
    arithmetic (low −£571.26 on the 25th, the cycle's last shop), and the horizon lowest point's
    date is meaningful again with day-to-day on.
120. **Expected support becomes a plan with a real start, a changeable day and an end (v0.7.0).**
    The household's real arrangement — £1,000 on the 10th for about five months while probate completes,
    then it stops — is what v0.5.0's pair-only expectation (decision 116) could not express, and the
    household's own acceptance list named the three gaps: a brand-new debt (no movements, balance £0)
    projected nothing at all, there was no way to end the arrangement, and a recorded Borrow left the
    same month's expectation sitting beside it. Migration `0008_debt_expected_inflow_until` adds nullable
    `expected_inflow_until_date` (additive `ALTER TABLE`, no backup-format change). `expectedInflowOccurrences`
    gains three rules: **settled stops** (movements exist and the derived balance is ≤ 0 ⇒ nothing —
    a debt with **no** movements is *not* settled and projects, so the first payment pre-projects);
    **until inclusive** (an occurrence whose configured date is past it does not count, so five payments
    end themselves); and **an answered month stops projecting** (a live money-in recorded from
    `OCCURRENCE_ANSWER_LEAD_DAYS = 2` before the occurrence's expected date — the weekend shift can bring
    it forward — up to the next occurrence *is* that month's money). `expectedInflowPotId` replaces
    `firstMovementPotOf`: the pot the most recent **live** movement travelled through, else the household
    default (the pot labelled `Main account`, else the first live pot), so a not-started debt's
    expectation still has an honest home and follows reality once the first Borrow is recorded. Edits stay
    forward-looking: `editDebt` persists day and until date under the existing version check, the audit
    line carries the new end date, and recorded movements are never rewritten. The cadence is unchanged
    (clamp OQ1, weekend shift decision 7), with one window refinement — an occurrence counts when its
    configured **or** its shifted date falls in `(after, through]` — so the first payment (Sat 10 Oct →
    Fri 9 Oct) is counted in a window ending on the Friday, and a configured 1st/2nd can shift back into
    the previous month's window.
121. **The expectation is visible on every surface it touches, and never counted as money (v0.7.0).**
    All Transactions renders it as `EXP<` rows (family `expected`) — green, dated the day the money is
    expected, badged `expected — not recorded yet`, linking to `/pots#debt-{id}` — **outside the totals**:
    `expectedRowCount` / `expectedInPence` carry them separately so the count line, the total row
    ("Expected support (N expectations, not counted)") and the footnote can all say so. The rows speak
    only for months **since the plan was set** (`plannedFrom` = the local date of the debt's last edit), so
    a late-September edit does not retrofit September, and they give way to the real `LN<` the moment that
    month's Borrow is recorded. The projection panel gains "Expected support in this forecast (N)" from the
    `expected`-flagged receipt lines; the Pots debt panel says whether the debt is *settled* or *expecting*
    (amount, day, end) and the edit form carries the day, the optional until date and a **"Fill the end
    date"** helper — `lastOccurrenceDate(dayOfMonth, fromDate, count)` returns the Nth clamped monthly
    occurrence after today (1–240 payments) — so "five payments" needs no calendar. Unchanged by design
    (decision 116 holds): never income, never an estimate move, never an insight, and the pot moves only
    when the Borrow is actually recorded.

*Session `arena/01a0d4f9-simple-finance` (2026-09-24) — PWA installability (v0.8.0):*

122. **PWA ships as manifest + icons, never a service worker (OQ7 resolved).** The household configured
    Cloudflare Access bypasses for the PWA asset paths and found them 404 — the files did not exist. The
    fix is a static `public/manifest.webmanifest` (not a Next route, which would sit behind Access), two
    PNG icons (192×192 and 512×512) and an `apple-touch-icon.png` (180×180), all derived from the existing
    `docs/assets/simple-finance-icon.svg` / `.png`. The manifest declares `name`, `short_name`, `start_url`,
    `scope`, `display: standalone`, `background_color` / `theme_color` `#0f172a`, and `purpose: any` on both
    icons. `layout.tsx` links the manifest, apple-touch icon and apple-web-app capable via the Next 16
    metadata API (`themeColor` in the `viewport` export, not the deprecated `metadata` field). **No service
    worker, no caching of pages or API responses, no offline queue** — SPEC §14's online-only rule stands
    unchanged. The household confirmed they do not want offline access.
123. **The Access bypass surface equals the files that exist.** The path-scoped Cloudflare Bypass → Everyone
    app should carry exactly four destinations: `/manifest.webmanifest`, `/icon-192.png`, `/icon-512.png`,
    `/apple-touch-icon.png`. The legacy `/sw.js` destination should be deleted — no service worker ships, and
    a public 404 is worse than no destination at all. Everything else remains behind the hostname-wide
    email-policy app.

*Session `arena/01a0d55f-simple-finance` (2026-09-24) — the phone-first till form and the "before income lands" figure (v0.9.0):*

124. **Two balance figures, not one (SPEC §7.7).** The household's objection is concrete: standing in Tesco
    with a "free to spend" £500 while a £600 mortgage leaves three days before payday is worse than no
    figure at all. Both facts therefore show together — the pot's **last reported checkpoint** (what the
    bank last said, with its age) and **what is left before income lands**: household available-now minus
    the commitments and projected day-to-day events due in `(today, next income]`. The figure deliberately
    **counts no income** — it is the dip, not the balance after payday; adding the salary back in would hide
    exactly the case the household raised. It is now a named concept rather than a derivation of §7.2: the
    projection panel's `projected_low` equals it when no other receipt lands in the window, and
    `tests/cycle-outlook.test.ts` pins that agreement so the till and the panel cannot drift.
125. **The per-pot version is the §7.5 pot watch, and cash stays silent.** Per pot the figure is
    `estimate(P) − commitments due from P in the window`, i.e. §7.5's transfer watch with the window taken
    to the next income instead of a named payday; it warns only when the pot itself goes short (the money
    may be in the other account, which is exactly what a transfer fixes). Projected day-to-day events are
    household-level and stay out of the per-pot figure, per §7.5's reasoning. A pot with no checkpoint, a
    household with no income schedule, and a cash pot all show nothing rather than a guess — "no window, no
    figure", null rather than zero.
126. **Where the figures live.** The Quick Entry purchase panel (headline + the selected pot's checkpoint
    and shortfall) and the pot cards on the home page and Overview. The rest of the home page stays as the
    household agreed; a dedicated mobile menu and mobile-specific hiding remain later decisions.
127. **Pot-first till form, with the default pot as a setting (SPEC §15.1).** The pot selector moves to the
    top of the form and the purchase form starts on `default_purchase_pot_id`, chosen in Settings. The old
    `pots.find(label === 'Main account') ?? pots[0]` guess is deleted: the household's real pot is not called
    "Main account", so the till form was opening on the first alphabetical cash pot. With nothing configured
    the form starts with **no pot selected** and the user picks one.
128. **Inline supplier typeahead replaces the `<datalist>`.** Recents-first when the field is empty, filtered
    case-insensitively as the user types, rendered as tappable rows under the field; tapping one fills the
    name, applies the remembered most-used category and moves focus to Amount. Ranking is pure
    (`rankSupplierMatches`, `nearestSupplierName` in `records/quick-entry.ts`) so it is unit-tested; the
    "did you mean" near-match prompt is unchanged. No library, no request.
129. **Swipe panels as progressive enhancement (mobile only).** Panel 1 records it (pot + figures, supplier,
    amount, paid-by, date, "+ Note", save); Panel 2 holds category, "For" and the split lines. On a phone
    they are a `scroll-snap-type: x mandatory` pair with dots and a hint; **Save is on both panels** so a
    purchase never needs a swipe. At `lg:` and up they are the previous two columns with no snapping. The
    secondary things the household asked for ride along: the "Split the payment" title becomes "Category &
    allocation", "Line 1 amount" is invisible when there is only one line (the amount mirrors the till
    figure, and the accessible name is unchanged), the note collapses behind "+ Note", focus order is
    supplier → amount → save, and "Add another" resets to Panel 1 on the supplier field.
130. **Contrast fix while in there.** Panel 1 of the purchase form (and the Fuel and Balance forms) sat
    directly on the dark quick-entry card with `text-slate-800` labels — dark grey on near-black, effectively
    unreadable. Every quick-entry panel is now a light card, and touch targets are at least 44px.

131. **The till announces when it is listening (SPEC §15.1).** The v0.9.0 form is bigger, and the acceptance
    suite started losing races it used to win: a tap on a tab before React hydrated switched nothing, and a
    value typed into a controlled input was wiped by the hydration render — the CI run failed four specs
    with `expected number, received null`, a dead tab and a frozen hint. The fix is in the product, not the
    test: the quick-entry section renders `data-till-ready="false"`, flips it to `true` when it mounts, and
    the tab strip and the forms are `inert` until then, so input that arrives too early is refused rather
    than swallowed. Locator *assertions* auto-wait; locator *actions* (and `pressSequentially` in
    particular — measured, it waits for neither `inert`, `disabled` nor `readonly`) do not, so the specs wait
    on the signal first (`e2e/support.ts` · `waitForTill`, 25 call sites).
132. **A purchase must name its pot.** Decision 127 removed the fallback, so "no pot selected" is a reachable
    state for the first time — and the server rejects a purchase without one, which surfaced as a raw
    `Invalid input: expected number, received null`. Save is now disabled until a pot is chosen and the panel
    says why ("Choose the pot this came out of — no default is set, so nothing is preselected"). The settings
    project ends by clearing the default on purpose, so specs that record a purchase after it name their pot
    themselves (`backup.spec.ts`).
133. **The browser suite can run in this sandbox (SANDBOX entry 8).** `cdn.playwright.dev` is blocked and
    `apt-get` cannot install `libnss3`, but `registry.npmjs.org` serves `@sparticuz/chromium`, which carries
    both a Chromium build and the AL2023 shared libraries in its tarball. With `LD_LIBRARY_PATH` pointed at
    the extracted libs, the real Playwright suite runs green locally (50 tests, ~2 minutes) through a
    throwaway config overlay. Sixteen CI minutes per guess became two local ones, which is how the failures
    above were diagnosed instead of guessed at.

134. **The acceptance suite's "today" is London's (v0.10.0).** Between 23:00 and 00:00 UTC in summer the seed
    wrote tomorrow's UTC date while the app showed London's today, and the date-sensitive specs failed for an
    hour a night. The seed now writes `toLocalDateString(now)`, the specs compute dates with
    `londonToday()`/`addDaysIso()` from `e2e/support.ts`, and the browser runs with
    `timezoneId: 'Europe/London'` — the one timezone the household lives in (SPEC §2). Re-done in session
    `arena/01a0d778-simple-finance`: the original post-v0.9.0 commits for 134–137 never reached GitHub
    (GitHub outage) and their sandbox was lost.
135. **One tap on Save saves, with the supplier suggestions open.** The typeahead closed on the supplier
    field's `blur`, so a tap on Save first collapsed the list, the page moved up under the finger, and the
    `click` landed on nothing — the household had to tap twice. A pointer-initiated blur now hides the list
    *in place* (`closing`: invisible, still taking its space) until the click has landed, then removes it;
    keyboard blur closes it at once as before. Mobile spec: one tap with the list open saves.
136. **Every Quick Entry control is at least 44px tall.** Decision 130 fixed the big ones; tab buttons, the
    "+ Note" toggle, chips and split-line controls were still 32–36px. One scoped rule (`.till-touch` in
    `globals.css`) sets `min-height: 44px` on every button, input, select, textarea and summary inside the till, and a
    mobile spec measures every visible control on every tab so a new small one fails the build.
137. **The purchase form starts on Supplier — once it can hear.** The `autoFocus` and the focus calls ran
    while the form was still `inert` (decision 131), so the focus was refused and the phone opened on
    nothing. Focus now moves to Supplier when `data-till-ready` flips to `true`, and again after "Add
    another" and a tab switch back to Purchase.
138. **Documents on income records use the attachments table (SPEC §23, v0.10.0).** The household wants a
    payslip (usually one page, sometimes several documents) on the income entry it belongs to. Migration
    `0009_income_documents_fuel_details` rebuilds `attachments` with `purchase_id` nullable, a new nullable
    `receipt_id` → `receipts`, and `CHECK attachments_one_owner` (exactly one of the two). Everything else is
    the existing pipeline unchanged — sniffed PNG/JPEG/PDF, 10 MB, opaque keys, soft-delete then unlink,
    audit (entity `receipt`), backup/restore (the archive stores rows and files, not owners) and the
    authenticated route. The rebuild keeps every id, key and state (tested on a v0.9.0-shaped database in
    `tests/migration-0009.test.ts`). The income upload control does not force the camera: a payslip is as
    often a PDF from a portal as paper. A voided income record keeps its documents viewable and takes no new
    ones. OQ10's "purchases only" is superseded for income; supplier-level documents stay deferred.
139. **Fuel details are optional and editable later (SPEC §15.1).** A fuel purchase can carry an odometer
    reading (whole miles), litres (stored as integer millilitres, so no floats in the database) and "Filled
    to full" (default on). The household was clear that neither number may be mandatory at the pump, so
    the till accepts blanks and Purchases/Overview show a "Fuel details — add odometer & litres" editor on
    every fuel row; the edit is versioned and audited (`purchase.fuel_details`). Cost per litre is never
    stored — it is `amount ÷ litres`, shown live as the litres are typed. A "fuel purchase" is a live,
    non-refund purchase whose Fuel-category lines all go to one vehicle; the fuel cost is those lines, so a
    split with a shop item does not inflate the price per litre.
140. **mpg is measured full tank to full tank, in UK gallons (SPEC §16.6).** A stretch runs from one full tank
    with an odometer reading to the next; part fills in between add their litres and their cost. mpg = miles
    ÷ (litres ÷ 4.54609). A stretch is left unmeasured — and says why — when the closing full tank has no
    odometer, when any fill in it lacks litres, or when the odometer did not go up; it is flagged (not
    hidden) when the answer is outside 8–150 mpg. Totals are ratios of sums, never averages of ratios.
    Insights shows per vehicle: the latest stretch, the last 12 months, fuel cost per mile, the latest price
    per litre, the fills missing details (linked to their Purchases row) and the recent fills. Pure maths in
    `records/fuel-economy.ts` (importable by client components), database side in `records/fuel.ts`.
141. **The save answers with the mpg.** After a fuel save — at the till or from Fuel details — one sentence
    says what happened: "Vehicle A: 41.2 mpg over 312 miles since the last full tank. 40.12 L at
    142.9p/L.", or a part fill waiting for the next full tank, or the first full tank noted, or what is
    missing. The same sentence (short form) sits on the Purchases/Overview row that closed the stretch.
142. **A restore brings an older backup up to the running schema, and refuses a newer one (SPEC §18.4).**
    Found while writing the v0.10.0 notes: in production only the container entrypoint runs migrations, at
    start-up, and a live restore reopens the database without a restart. Restoring an archive taken before
    a migration therefore came back without the newer columns until the next restart — harmless while
    migrations only added tables few pages read, but 0009 adds columns to `purchases`, which nearly every
    page reads. `restoreEncryptedBackup` now, on the staged copy and before the swap: refuses an archive
    whose newest applied migration is later than the newest one this build ships ("made by a newer
    version… update the app, then restore it"), otherwise applies the pending migrations exactly as the
    entrypoint would, re-runs the foreign-key and integrity checks, and folds the WAL into the file. A
    failure leaves the live data untouched. This is what §18.4's "validate … schema compatibility before
    touching live data" asked for; the checks before it were table-presence only. Tests: an archive made
    on the v0.9.0 schema restores as ten migrations with the new columns; one with a future migration is
    refused and the target keeps its data.

143. **The till never widens the page, and its cards move only on purpose (SPEC §15.1, v0.11.0).** The
    household's Android phone (larger-than-default text) showed the whole page panning sideways. The cause
    was the Quick Entry tab strip: `flex` buttons with `whitespace-nowrap` text had a fixed minimum width,
    which overflowed the card at 320px (page 322px), at 360px with 115% text (370px) and at 130% (418px).
    Emulation at 360–412px with default text had looked clean. Fix: the tabs are a `grid-cols-4` of
    shrinkable cells (`min-w-0`, `text-xs` below `sm:`), the Move sub-tabs are a 2×2/4 grid, the "£…"
    headline wraps, and the section has `overflow-x: clip` as a safety net. Two home-page grids further
    down (`Add a pot`/`Record a balance checkpoint`) had implicit `auto` tracks that grew to their widest
    input and are now `grid-cols-1`. The swipe area is no longer a native `overflow-x-auto snap-x`
    container, because any diagonal thumb dragged it: the viewport is `overflow-x: clip`, the track moves
    by `translateX` with a 200ms transition, `touch-action: pan-y`, and it switches only on Next, the
    dots or a touch swipe of ≥50px that is ≥1.5× more sideways than down. The hidden card is `inert`,
    and at `lg:` it is two static columns (`useWideLayout` via `matchMedia`). On a phone the black card
    is `p-2`. Specs: `scrollWidth <= clientWidth` at 320px and at 360px with `html{font-size:130%}` on
    every tab and both cards. A diagonal CDP touch drag (20px across, 200px down) leaves the card alone;
    a horizontal one, Next and the dots switch it. This reverses decision 129's scroll-snap design.
144. **Save only on card 2; card 1 ends with "Next: category →" (reverses decision 129's "Save on both").**
    The household's reason: a supplier's remembered category is preselected on card 2, so saving from card
    1 recorded it unseen, and a new supplier got no category at all. Next is full-width and ≥48px. It slides to
    card 2 and focuses Line 1's Category (the focus waits for the render so it never lands in an inert
    card). Implicit submission is blocked: Enter in a card-1 input is intercepted (`panelOneKeyDown`).
    Supplier → Amount, anything else → Next. The typeahead's own Enter on a highlighted row claims the
    event first. "Add another" still returns to card 1 on Supplier (decision 137). `canSave`, which was
    true when saving was *blocked*, is renamed `saveBlocked` and now also requires a payer.
145. **Paid by and Date move to card 2; `ChipGroup` for short choices; fuel-only supplier recents.** Card 2
    order: Category → For → lines → "+ Add split" → Paid by → Date (full width) → Save. `ChipGroup` is real
    radio inputs styled as ≥44px pills in a `role="radiogroup"` (arrow keys, form posting and screen
    readers come free), used for Paid by (both forms) and Vehicle. The old `ChipSelect` rendered a
    `<select>` and is renamed `SelectField` (the pot stays a select). Changing Paid by re-targets lines
    still on the old payer's `defaultTarget`. The Fuel form's supplier is the shared `SupplierTypeahead`
    fed `QuickEntryData.fuelSuppliers`: `listFuelSupplierIds` (records/fuel.ts) applies the fuel purchase
    definition (live, not a refund, Fuel lines all to one vehicle), newest fill first. "Did you mean"
    uses the same list.
146. **The till starts on whoever is signed in: "Signs in as" (migration 0010).** `buildEntryData` used
    `people[0]` for both Paid by and the vehicle default whatever the sign-in, a bug against §15.1's
    "prefills payer (signed-in user)". Vehicles already had an Owner, and the household confirmed Owner is
    the "main driver". What was missing was which sign-in is which person. Migration `0010_people_email`
    adds a nullable, unique, lower-case `people.email`. Settings shows a per-person select of
    `signInEmailChoices` (the `AUTH_ALLOWED_EMAILS` allowlist, plus the dev identity under the dev bypass,
    plus any already-stored value). `setPersonEmail` validates against that list, moves an email already
    held by someone else, and audits `person.email`. The pages pass `user.email`. The pure
    `entryDefaults` picks the linked person (else first) and the vehicle they own (else first). On the
    Fuel form the vehicle follows Paid by until the user taps a vehicle (`vehiclePicked`). The e2e seed
    links the dev identity to Alex; the fuel spec moves it to Sam and back and sees Vehicle B.
147. **"Filled to full" is off by default (reverses decision 139's default-on, SPEC §16.6).** Forgetting the
    tick on a real full tank only lengthens a stretch (its litres roll into the next full tank, so the
    figure stays right). Ticking a part fill by mistake produces a wrong mpg. So the till starts unticked
    with the hint "Tick only when the pump clicked off at full". The database default for old rows and the
    Fuel details editor (showing the stored value) are unchanged. Insights adds `fillsWithoutFullTank`:
    when the latest ≥3 fills in a row have none marked full it says "no full tank marked in the last N
    fills — mpg needs one".
148. **Real-phone check still owed.** The layout was verified in emulation (Pixel 7, 320px, 360px at
    115%/130% text) and with synthetic touch. The household's before screenshots (2026-09-25 10:38/10:39/
    10:41) are to be matched by the same three views after the update. Their real thumb is the final check.
149. **A "Supplier card" link names the supplier it came from (SPEC §21.2a, v0.12.1).** v0.12.0 painted those
    links on Recurring Payments and Contracts & Renewals but sent them to a bare `/suppliers`, so the
    household landed on a collapsed list of everything instead of the card they clicked from. The links now
    carry the identity — `/suppliers?supplierId=<id>`, built in one place (`supplierCardHref`,
    `lib/records/supplier-focus.ts`) and used by the schedule row, the contract-end row and the follow-up
    rows (the follow-up list gained the supplier id it needed for this). The resolver is pure and unit-tested
    (`tests/supplier-focus.test.ts`, 15 cases): `?supplierId=`, the `?id=` alias, `?q=` (exact name, else
    first partial) and the `#supplier-<id>` / `#<name>` fragment all resolve to one card; an id not held
    falls back to the plain list, never to a wrong card; a plain visit is unchanged. The server page resolves
    it so the card is open in the **first paint**, and the client island re-resolves only the fragment (a
    server never sees it) on mount, sets the filter box, expands the card and smooth-scrolls it into view
    (`scroll-mt-24` clears the sticky header; `prefers-reduced-motion` disables the animation). The list is
    keyed by the resolved focus (`supplierFocusKey`) because a client-side hop from one
    `?supplierId=` link to another is the *same route* — without the key React would keep the first link's
    filter. Typed filters and manually opened cards survive a form action, as before. Browser acceptance:
    the Recurring spec clicks the link and asserts URL, filter value, a single card and `aria-expanded`;
    the Contracts spec clicks "BroadbandCo card →" and asserts the same, then goes back.
150. **Horizon opens on the day before the next scheduled income, and a date change applies itself (SPEC
    §7.6, v0.13.0, household request 2026-09-25).** *Default:* a param-less visit (any `?pots=`/`?daytoday=`
    still gets it) looks ahead to the day before the next **scheduled** income. The household clarified
    "income" means the salary, so **only receipt schedules count** — a debt's expected support never sets the
    default, even when it lands first; the payday window (§7.2) and the till figure (§7.7) keep counting it,
    and the two definitions are allowed to differ (pinned by a test). Earliest receipt schedule wins, already
    weekend-shifted. One query serves both reads (`nextReceiptScheduleInstance` →
    `nextScheduledIncomeDate`, exported from `money-view.ts`); the rule is a pure resolver
    (`lib/records/horizon-default.ts`, `resolveHorizonThrough`) with `tests/horizon-default.test.ts`
    (12 cases). Clamp rules: income tomorrow ⇒ tomorrow (the income day — preferred over jumping to +35,
    since it still answers "how do we reach payday"); beyond 400 days ⇒ today + 400; no scheduled income ⇒
    today + 35 (unchanged); a valid in-range `?through=` is used unchanged. *Apply on change:* the form order
    is pots → Day-to-day → date → button; a small client island (`HorizonLookAheadForm`) keeps the plain
    `GET /horizon` form and calls `requestSubmit()` on the date's `change` — skipped when the field is empty
    or `validity.valid` is false. Only the date auto-applies (a navigation per pot tick would make the
    ordering pointless); the button stays for pots/Day-to-day and without JS. A `data-horizon-ready` flag
    marks hydration for specs, and the form dims while the navigation is in flight. *Known quirk kept and
    documented:* an empty pot selection still means every pot (now said under the checkboxes); changing that
    is a separate household call. Browser acceptance: nine horizon specs (default date read against the
    Income page's "Next payday", field order, date auto-applies, date carries pots + Day-to-day, clearing
    does not navigate, the button still applies Day-to-day and pots, ≤ 6 weeks open).

151. **The till opens with nothing focused — the household taps what they want (SPEC §15.1, v0.13.1,
    household request 2026-09-25).** The till used to focus Supplier as soon as it was ready (decision
    137). That was right when the till was the whole phone screen; with the free-to-spend card and the
    payday warning above the form it now costs the tab strip. On the real phone the keyboard rose, the
    browser scrolled the focused field above it, and the **Purchase / Fuel / Balance / Move** tabs went off
    the top of the screen — measured on the page before the fix: `scrollY` 1342 with the tab strip at
    `y=-35`, entirely above the viewport. Their words: *"It is not necessary for any control on the form to
    get focus when it opens — the user can make that decision by tapping whatever control they want to
    change. Changing where the page scrolls to looks much cleaner … and avoids the user missing the
    Purchase/Fuel/Balance/Move buttons."* So the rule is now: **no field is focused as a side-effect of the
    till becoming ready, or of a type tab becoming visible.** Dropped the `ready` → `supplierRef.focus()`
    effect in `PurchaseForm` (and the `ready` prop that existed only to feed it); removed `autoFocus` from
    the Fuel amount and the Balance amount, which stole focus the same way as their tab appeared. The rule
    is universal rather than phone-only: desktop has room so autofocus costs it nothing there, and one rule
    is simpler to keep than a media query's worth of exceptions. Every in-flow focus move is untouched,
    because each answers something the household did — tapping a supplier suggestion (→ Amount), Enter in
    Supplier (→ Amount), **Next: category →** (→ Category), opening "+ Note" (→ the note it just opened),
    **Add another** (→ Supplier on card 1). The card's first paint is unchanged: type tabs, pot, payday
    shortfall warning, free-to-spend figure; the keyboard stays down and the page does not scroll itself.
    *Browser acceptance:* the old "the till lands on the supplier once it is listening" spec is replaced by
    two — the home page opens with no field focused **and** `window.scrollY === 0`, and choosing Fuel,
    Balance or Move grabs no field while tapping Balance's amount still focuses it. Both were checked to
    fail against the pre-fix component (they caught `supplierName` and then `amount` focused by
    themselves), which is the only proof worth having that they guard anything.

152. **The forecast chart draws the household total, not a line per pot (SPEC §16.7 A, v0.14.0).** The
    question this chart answers is "does the money last the month" — and the money that has to last is the
    household's, across every pot, because the household moves money between its own pots freely. Five
    lines at 320px would be unreadable, and the per-pot question already has a better answer: the pot watch
    on `/overview` and the pot picker on `/horizon`. So the chart takes `getHorizonProjectionView(db,
    addMonthsClamped(today, 1), [], true)` — no pot filter, day-to-day included — and draws one step area.
    The y-domain **always includes zero**, with symmetric padding: the honest question is the distance to
    zero, so zero must be on the chart even when the balance is nowhere near it (a chart that floats a flat
    line in the middle of nowhere hides exactly that). Below zero is a tinted region, the overdraft limit a
    dashed line **only when the domain reaches it** — a legend entry for a line that is off the chart is a
    small lie, so when the limit is out of range the caption says "the £800.00 of overdraft room is off the
    bottom of this chart" instead. The headline never clips: "Projected to go £1,831.27 below zero on Fri 9
    Oct. That is past the £800.00 overdraft limit from Mon 28 Sept."

153. **Charts get their own page, and the home page gets a card, not a chart (SPEC §16.7, v0.14.0).**
    `/insights` keeps its tables: the household reads them, they are exact, and burying them under drawings
    would be a loss. `/overview` keeps its projection panel. The charts therefore live at **`/charts`**
    (the household named it), linked from the navigation between Insights and Settings, and from a card on
    the home page **below** the till — the till is what the phone is for, and nothing may push it down.
    Every chart ships in one frame, `ChartFigure`, which enforces the standing rules so no chart can
    quietly skip one: a verdict sentence above the drawing, a "reported / projected" badge, a caption
    saying what the numbers are, and a **table twin** under `<details>` carrying the same figures exactly.
    The table twin is not a consolation prize for screen readers — it is the copyable, linkable,
    JavaScript-free version of the chart, and the specs assert the two agree.

154. **Personal spending takes its scope from the live category tree (SPEC §16.7 C, v0.14.0).** The scope
    is the two parents *Personal* and *Entertainment & Eating Out*, and every child under them **as the
    tree stands today** — not a hard-coded list of children. The tree is user-editable (§12): a
    hard-coded list would silently drop a child the household added and, worse, would have needed
    Subscriptions & Streaming special-cased out of "personal", when the honest treatment is the one the
    household already uses — that line is marked *For: household*, so it lands in the Household series on
    its own. Attribution is the allocation target ("For: person"), never "Paid by", which is the rule
    Insights panel 2 already holds (decision 65). A household-marked line is **never split** between
    people; it is its own bar, and the caption says so.

155. **The chart kit is hand-rolled SVG behind a wrapper, and drill-down is a link (SPEC §16.7, v0.14.0,
    household decision 2026-09-25).** Asked to choose between a charting library and hand-rolled SVG, the
    household chose hand-rolled — for a page with four charts, a dependency is a bundle, a hydration step
    and a maintenance surface for something the app can already do: `/overview`'s month bars have been
    hand-rolled inline since v0.4.0. The kit lives behind one boundary, `src/components/charts/`
    (`ChartFigure`, `StepAreaChart`, `BarChart`, `StackedBarChart`, `scale.ts`), so the decision stays
    reversible: swapping in a library later means rewriting those files and nothing else. Two consequences
    are deliberate. Every chart is a **server component** — no client JavaScript at all, so the drawing is
    in the first paint on a phone. And **drill-down is a real `<a>`**, not an `onClick`: a bar wraps a link
    to `/purchases?from=…&to=…&categoryId=…`, which can be opened in a new tab, bookmarked or sent to the
    other person, none of which a router push can do. The bar anchors are `tabIndex={-1}` and
    `aria-hidden` (the SVG is one `role="img"`); the same links are repeated as ordinary links in the table
    twin, which is the keyboard and screen-reader path.

156. **"Fixed commitment" is an explicit list of child categories, not a guess (SPEC §16.7 D, v0.14.0).**
    Nothing on a purchase says "this is a direct debit", and the two plausible guesses are both wrong for
    this household: by parent would put Fuel in with Insurance and Road Tax under Vehicle Running, and
    "converted from a schedule" alone would miss the bills they pay by hand. So the definition is a new
    setting, `commitment_category_ids` — a set of **child** category ids, ticked in a checkbox list grouped
    by parent in Settings, saved through the existing key/value `settings` table with the standard audit
    entry (no schema change, no migration). Three states, all distinct: **unset** falls back to the
    children the household's own dd/so schedules already use, so the chart says something true before
    anyone visits Settings; **an explicit empty set** means "track nothing" and is stored as such; a
    **saved list** is the household's own. Ids are validated against live child categories on save. The
    strict view — only purchases the app converted from a schedule — is a **toggle on the chart**
    (`purchases.scheduleInstanceId`), not a second setting, because it is a question you ask of the same
    list, not a different list.

157. **`/purchases` accepts a repeated `categoryId`, and `targetKind=household` (SPEC §16.7, §15.4,
    v0.14.0).** The charts drill down into scopes the review page could not previously express: "Groceries
    and every child under it", "both discretionary parents, for Sam", "the four tracked commitment
    categories". Rather than invent a chart-only list page, the filter grew: `categoryId` may be repeated,
    a parent id expands to its children, more than one id becomes `filters.categoryIds` (one still becomes
    `filters.categoryId`, so every existing link behaves exactly as before), and `targetKind=household` is
    now accepted alongside `person` and `vehicle`. The filter form offers "<Parent> / all children" for
    each parent; when a link carries several ids the form shows the first, so pressing **Apply** narrows to
    that one — the caption says so rather than pretending otherwise. The old wrinkle is unchanged and now
    documented on the charts page: these filters match the **purchase**, so a matched purchase returns with
    all of its lines, receipt-style, and a split shop appears whole.

158. **On a phone the home page opens at the till (SPEC §15.1, household request 2026-09-25 — explicitly
    supersedes decision 151's "the page does not scroll itself" clause; 151's focus rule stands
    unchanged).** The till card sits ~1300px down the page behind the household total and the payday
    projection, so opening the app on a phone landed on "Shared household ledger" and a purchase at the
    checkout started with a scroll — the one thing the phone is for (the "walking out of Tesco" tool).
    Nothing had ever implemented "open at the till": the mobile drawer's **Quick Entry (Till)** link
    (v0.12.0) was a bare `href: "/"`, and for a while it *looked* like it worked only because the till
    autofocused Supplier (decision 137) and the browser dragged the page to the focused field — the side
    effect decision 151 removed, which is why the behaviour appeared to break around v0.13.x. Now it is
    deliberate: `QuickEntry` takes an `openAtTillOnMobile` prop (the home page passes it; Overview, which
    embeds the same till as a review surface, does not) and on mount, when the layout is the phone one
    (`matchMedia('(min-width: 1024px)')` fails), calls `section.scrollIntoView({ block: 'start' })` — a
    scroll, never a `focus()`, so the keyboard stays down and every decision-151 focus rule holds. The
    section carries `id="quick-entry"` and `scroll-mt-16` (64px clears the 56px sticky header), and the
    drawer link is `/#quick-entry` so a tap re-anchors even when the page is already open (the component
    does not remount on a same-route tap). A laptop still opens at the top. *Browser acceptance:* the old
    "opens and does not scroll itself" spec is replaced by two — the home page opens with the till's top
    between 56px and 96px of the viewport, `scrollY > 0` and still no focused field; and from
`/purchases`, the drawer's Quick Entry (Till) tap ends at the same place with the same silence from
the keyboard.

159. **Colour lives in one token block; a theme only redefines tokens (SPEC §15.4, household
    requirement 2026-09-25 — Phase 1 of 2: tokenise the existing scheme, zero visual change).** The
    household's ask was that *adding a new theme be a small, single-place change, not an app-wide
    edit in every page*. The requirement had no provenance — a search of SPEC.md and
    AGENT_APP_BLUEPRINT.md on 2026-09-25 found only the PWA `theme_color` metadata (§14) and the
    "colour is never the only signal" rules (§16.7) — so it is recorded here and in SPEC §15.4.
    Phase 1 therefore restructures only; Phase 2 (next session) adds the first theme + Settings
    toggle as the proof.

    **What changed.** A single Tailwind v4 `@theme static` block in `src/app/globals.css` now owns
    every colour: semantic names for the neutral spine a theme must flip (`canvas`, `surface`,
    `surface-muted`, `surface-sunk`, `marker-muted`, `border`, `border-strong`, `border-hairline`,
    `border-emphasis`, `ink`…`ink-ghost`, and the by-design-dark `till`, `till-ink`, `till-inset`,
    `till-hover`, `till-muted`) and ramp numbers for the chromatic families (`accent` was sky,
    `positive` emerald, `warning` amber, `danger` red, `negative` rose, `note` indigo, `chart-1…5` +
    chart furniture). Values are the Tailwind palette literals this app already rendered, copied so
    no pixel moves. `static` because the chart kit references its tokens from TSX as
    `var(--color-chart-…)` in inline styles, which Tailwind's scanner does not see — without
    `static` those variables would be tree-shaken and every chart would render unstyled. Today's
    distinctions stay distinct (`ink-muted` ≠ `ink-soft`), so a theme cannot collapse two greys.

    **The migration was mechanical.** 1,314 occurrences across 75 distinct classes in the same 35
    `.tsx` files were rewritten through this fixed table (1:1, no renames of anything else); variant
    prefixes (`hover:`, `focus:`, …) ride along.

    | was | now | was | now | was | now |
    |---|---|---|---|---|---|
    | bg-white | bg-surface | text-slate-600 | text-ink-soft | border-sky-200 | border-accent-200 |
    | bg-slate-50 | bg-canvas | text-slate-700 | text-ink-body | border-sky-300 | border-accent-300 |
    | bg-slate-100 | bg-surface-muted | text-slate-800 | text-ink-emphasis | border-sky-400 | border-accent-400 |
    | bg-slate-200 | bg-surface-sunk | text-slate-900 | text-ink | border-sky-500 | border-accent-500 |
    | bg-slate-400 | bg-marker-muted | text-white | text-till-ink | ring-sky-200 | ring-accent-200 |
    | bg-slate-600 | bg-till-muted | accent-slate-900 | accent-ink | ring-sky-400 | ring-accent-400 |
    | bg-slate-700 | bg-till-hover | decoration-slate-300 | decoration-ink-ghost | ring-sky-500 | ring-accent-500 |
    | bg-slate-800 | bg-till-inset | text-slate-300 | text-ink-ghost | text-sky-300 | text-accent-300 |
    | bg-slate-900 | bg-till | text-slate-400 | text-ink-faint | text-sky-700 | text-accent |
    | border-slate-100 | border-border-hairline | text-slate-500 | text-ink-muted | text-sky-800 | text-accent-800 |
    | border-slate-200 | border-border | bg-sky-50 | bg-accent-50 | text-sky-900 | text-accent-900 |
    | border-slate-300 | border-border-strong | bg-sky-100 | bg-accent-100 | bg-emerald-50 | bg-positive-50 |
    | border-slate-400 | border-marker-muted | bg-sky-300 | bg-accent-300 | bg-emerald-100 | bg-positive-100 |
    | border-slate-500 | border-border-emphasis | bg-sky-600 | bg-accent-600 | bg-emerald-500 | bg-positive-500 |
    | border-slate-900 | border-till | border-sky-100 | border-accent-100 | border-emerald-200 | border-positive-200 |
    | divide-slate-100 | divide-border-hairline | | | ring-emerald-200 | ring-positive-200 |
    | ring-slate-200 | ring-border | | | text-emerald-700 | text-positive |
    | | | | | text-emerald-800 | text-positive-800 |
    | | | | | text-emerald-900 | text-positive-900 |

    | was | now | was | now | was | now |
    |---|---|---|---|---|---|
    | bg-amber-50 | bg-warning-50 | bg-red-50 | bg-danger-50 | bg-rose-50 | bg-negative-50 |
    | bg-amber-100 | bg-warning-100 | bg-red-700 | bg-danger | ring-rose-200 | ring-negative-200 |
    | border-amber-200 | border-warning-200 | bg-red-800 | bg-danger-800 | text-rose-700 | text-negative |
    | border-amber-300 | border-warning-300 | border-red-200 | border-danger-200 | text-rose-900 | text-negative-900 |
    | ring-amber-200 | ring-warning-200 | border-red-300 | border-danger-300 | bg-indigo-700 | bg-note |
    | text-amber-600 | text-warning-600 | border-red-700 | border-danger | border-indigo-200 | border-note-200 |
    | text-amber-700 | text-warning-700 | text-red-700 | text-danger | | |
    | text-amber-800 | text-warning | text-red-800 | text-danger-800 | | |
    | text-amber-900 | text-warning-900 | | | | |
    | text-amber-950 | text-warning-950 | | | | |

    **Charts.** `CHART_COLOURS` now holds `var(--color-chart-…)` strings; the SVG kit applies them
    through inline `style` rather than `fill`/`stroke` attributes, because a custom property resolves
    in a declaration (which an inline style is) in every browser while presentation-attribute support
    is not universal. All §16.7 rules survive unchanged (legend + table twin, hatched in-progress
    week, haloed labels). The two tints are `color-mix` of their own colour so a theme that moves a
    colour moves its tint too.

    **The PWA exception.** The browser reads `themeColor` and the manifest before any stylesheet
    exists, so they cannot be variables. Phase 1 keeps the three literals (`layout.tsx`
    `themeColor`, manifest `theme_color`/`background_color`) pinned to `--color-till` and comments
    them; `tests/colour-tokens.test.ts` asserts they agree with each other and with the token
    (±1/255 per channel — Tailwind's oklch→sRGB rounding). Choosing a per-theme chrome colour is
    Phase 2's decision.

    **Guards.** `tests/colour-tokens.test.ts` is the grep-gate: no raw palette class and no colour
    literal in `src` outside the PWA exception; every `var(--color-…)` referenced is defined; the
    semantic names a theme redefines all exist. And `@source not` excludes the docs/README from
    Tailwind's scan, because the scanner reads prose — the mapping tables in this very decision would
    otherwise generate palette utilities nothing renders.

    **Verification.** `npm test` 466 green (461 + 5 gate); `tsc`, `format:check`, `next build` green;
    full Playwright **71** green via SANDBOX entry 8. Pixel proof: 39 screenshots (13 pages at
    320/412/1400) of `main`'s `src` vs the tokenised `src`, same seeded data, with only the elapsed-
    time caption ("just now"/"N minutes ago") normalised — **0 differing pixels** on every page,
    charts included. A theme is therefore one future block that re-declares these names.

160. **Themes: fourteen palettes × light and dark, generated from five hex stops, chosen per device
    (SPEC §15.4, Phase 2 of decision 159 — the proof).** Phase 1 tokenised the scheme; the household
    then supplied thirteen candidate palettes as five hex stops each (dark → light) and asked for
    **all of them**, in **both modes**, as a gallery **near the bottom of the existing Settings
    page**, remembered **per device in a cookie** — "so one of us can run dark while the other runs
    light" — with nothing stored in the database.

    **Shipped:** 28 themes (the 13 supplied palettes plus Classic, each light and dark), 73 tokens
    apiece, in `src/app/themes.generated.css`; a picker at Settings → Appearance; `sf-theme` cookie;
    per-theme browser chrome. No page, component or chart was edited to do it — the only `src`
    change outside the new files is the `text-white` → `text-fill-ink` split described below.

    **Why generated, not hand-written.** 28 × 73 = 2,044 declarations is not a thing to maintain by
    hand, and a hand-picked dark ramp is where contrast bugs live. `scripts/themes/` (≈1,300 lines,
    Node + tsx, no new runtime dependency) reads the base `@theme static` block, converts through
    OKLab/OKLCH, derives both modes of each palette and writes two files: the stylesheet and
    `src/lib/theme/catalogue.ts`. `npm run themes:build` regenerates; `npm run themes:check` fails
    if the checked-in output differs, so the shipped CSS cannot drift from its source. **Adding a
    palette is one row in `scripts/themes/palettes.ts` and a build** — which is decision 159's claim,
    finally testable.

    **Derivation, in one paragraph.** The five stops give the palette its deep, mid, accent, wash and
    paper. A light theme puts paper on the canvas and the deep stop on the till; a dark theme puts
    the deep stop on the canvas and takes the till *below* it — the till is the floor, not the
    ceiling — which keeps the light theme's hierarchy instead of turning the page inside out. Ramps
    are built by **role, not by number**: `accent-300` is till-eyebrow text and stays light in both
    modes, while 50/100 become dark tints and 700–900 become light text in dark mode. Siblings that
    share a role are spread 0.03 L apart in number order so `-700` and `-800` never merge. Family
    hues come from the palette, family chroma from a per-family ceiling (a red stays red on a green
    palette — a warning is not a matter of taste).

    **Contrast is enforced, then re-measured.** Classic's own measured ratios are the floors (ink on
    surface 17.8, `ink-muted` 4.8, `chart-axis` 2.6, `border/surface` 1.23, …, 26 rules), plus
    separation rules for the washes. The generator iterates in OKLCH until every rule passes with a
    1.02 margin for hex rounding, and fails the build otherwise. `tests/themes.test.ts` (12 cases)
    then re-measures the **shipped stylesheet**, not the generator's memory, and adds a distinctness
    rule: any pair Classic separates by OKLab Δ ≥ 0.02 must stay ≥ 0.008 apart in every theme — zero
    violations across 28 themes. Cross-group similarity is allowed on some palettes (a green
    palette's accent wash sits near its positive wash) because colour is never the only signal
    (§16.7) — the words, icons and table twins carry the meaning.

    **One token was split.** `--color-fill-ink` (4 call sites that had been `text-white` on a
    saturated fill) is white in every light theme and near-black in every dark one, so a primary
    button's label stays legible without a page knowing which mode it is in. `--color-till-ink`
    stayed as it was. That is the whole of the page-level change, and it lives in the token block
    exactly as the Phase-1 handoff required.

    **Apply before first paint: cookie, not inline script.** The layout is async, reads `sf-theme`
    (one year, `httpOnly`, `sameSite=lax`, `secure` in production) with `next/headers` and renders
    `<html data-theme>` server-side, so the very first byte is already the right theme — no
    pre-hydration script, no flash, and nothing client-side needs to read the cookie. Unknown or
    stale values fall back to `classic-light` without throwing. Per device is deliberate and is the
    household's choice: no database row, no audit entry, no household-wide surprise.

    **PWA chrome (the Phase-1 open question).** `generateViewport()` returns the chosen theme's
    chrome colour — the till on a light theme, the canvas on a dark one — which the generator writes
    into the catalogue and `tests/themes.test.ts` checks against that theme's own token. The
    manifest's `theme_color`/`background_color` stay pinned to the default: a manifest is read once
    at install time and describes the installation, not the page in front of you.

    **The gallery is the app, not a picture of it.** Each card renders real components inside an
    element carrying that theme's `data-theme` — till, figure, three status pills, a link — so a
    theme that renders badly renders badly there first. The radio applies the theme to
    `document.documentElement` and submits in the same gesture; a failed save puts the attribute
    back. Every card names its mode in words and the chosen one says "In use", so §16.7 holds inside
    the picker too.

    **Also fixed:** `src/app/not-found.tsx`. Next's built-in 404 paints its own near-black text,
    which all but disappeared on a dark theme; it is now an ordinary tokenised page.

    **Verification.** `npm test` **478** green (466 + 12 new theme cases, the grep-gate reworked to
    allowlist the generated catalogue); `tsc` and `format:check` clean; Playwright **74** green (71 +
    3 new: choosing repaints without a reload, the server's first response already carries the
    attribute on every page, and a device with no cookie — or a stale one — gets Classic).

161. **The supplier card's recent purchases say who each one was for (SPEC §21.4).** A household
    case the v0.17.0 release conversation turned up: three mobile contracts with one carrier, one
    per person. The modelling the app already supports well is **one supplier, three schedules** —
    "Vodafone — Duncan/Cara/Matthew" — each with its own `For` target, due day and contract end
    date. Every list says who a payment belongs to except one: the supplier card's **Recent
    purchases** showed `date · amount`, so on Vodafone's card the three contracts were told apart by
    **amount alone**. Each row now reads `2026-09-24 · £28.99 · Mobile Phones (Robin)`.

    **It was never a query, only a mapping.** `/suppliers` already called
    `listPurchases(db, { supplierId, limit: 5 })`, which returns `PurchaseWithLines { purchase,
    allocations }` — and the `.map(({ purchase }) => …)` threw the allocations away. The page keeps
    the same single query; it now reads the lines it was already paying for. No schema change, no
    migration, no new N+1.

    **One helper, not a fifth copy — `src/lib/records/targets.ts`.** Turning `{targetKind, targetId}`
    into `Alex` / `Vehicle A` / `household` had grown **four** independent implementations:
    `activity.ts`'s private `targetLabel()`, `purchases/page.tsx`'s `lineTargetLabel()`,
    `contracts/page.tsx`'s inline closure, and this card would have been the fifth. They are one
    pure, database-free module now — `targetNames()`, `targetLabel()`, `purchaseLineSummary()` —
    and all four call sites use it. The refactor is behaviour-preserving: the 478 pre-existing tests
    stayed green across it before a single new assertion was added.

    **Decisions, stated.** *Split purchases* follow the established answer — **first line, then
    `+N more`** — because All Transactions has rendered it that way since v0.3.0 and a household
    reading two lists should not meet two conventions; the full split is one click away on
    Purchases. *How much to show* — the **child** category, not `Parent / Child`: the target is the
    point, and the cards sit two-to-a-row on a laptop. `purchaseLineSummary()` takes the category
    map as an argument precisely so a wide table and a narrow card can differ without forking the
    rule. *Degradation*: a person or vehicle the household has since removed prints the bare kind
    (`person`) rather than an id or an exception, so history keeps rendering. Void styling
    (`line-through`) and the `AttachmentForm` row are untouched.

    **Verification.** `npm test` **481** green (478 + 3: the three-contracts case reading distinctly,
    the `+N more` rule on a three-line split, and the household/vehicle/removed-target labels), all
    driving the exact chain the page runs — `listPurchases` → `purchaseLineSummary` — so the card's
    contract cannot drift from the page that builds it. Playwright **74** green, with
    `e2e/desktop.spec.ts`'s supplier-card test now asserting `Weekly Shop (household) +1 more` on the
    seeded split shop and `Weekly Shop (Sam)` on The Corner Cafe — same category, different target,
    told apart by words. Looked at in a real browser at 1400px and 320px (SANDBOX entry 8): the
    three-contract card reads correctly and the phone wraps the clause without panning sideways.

162. **The schedule card's Edit can move the start date, and a backdated start backfills what the app was
    never told about (SPEC §11.1).** A household case with a sharp edge: they filled up the car five days
    before the app was stable enough to record in, and the direct debits inside that window belonged to
    schedules set up *after* the fact — so no instance covered those dates. Their choices were a hole in the
    history or a hand-typed Purchase, and a Purchase is a lie the size of a month: All Transactions codes it
    `PUR` not `DD` (§15.3), the commitment chart stops seeing it as a fixed commitment (§16.7), and the
    projected figures the household was reconciling in the first place read the wrong history. They had
    already proved the other half themselves: **creating** a schedule with an `activeFrom` in the past
    materialises and converts the real instances. The gap was that `activeFrom` was write-once.

    **One field, one rule.** `activeFrom` joins `EditSchedulePatch`, the edit boundary schema, the schedule
    card's form and `editSchedule`. It is the only field an edit may date in the past, and the rule the form
    states in words: earlier backfills every due date between the new start and today, later drops upcoming
    instances before that date, and **neither direction rewrites a converted record**. All three kinds take
    it (dd, so, expected receipt) — the domain edit path is one path, and a backdated payday deserves to be a
    `BAC` from its schedule as much as a backdated premium deserves to be a `DD`.

    **Two rules in `syncScheduleInstances` had to be separated for this to work at all**, and this is the
    part a form-only change would have missed. The function had one bound, `lower` — the later of
    `activeFrom` and `lastConverted + 1` — doing double duty as *where to start generating* and *what is
    allowed to exist*. Backfilling needed the first loosened and the second removed:
    `backfillBeforeToday` (set only when the start genuinely moved earlier) starts the regenerated window at
    `activeFrom` instead of at today, and the delete side of both branches now never prunes a **past-dated
    upcoming row** — the daily pass, which had been treating anything below `lower` as stale, was quietly
    deleting a backfilled instance before it could convert. A past-dated upcoming row is a due date awaiting
    its conversion (decision 162's backfill, or simply a day nobody opened the app on); only rows past the
    upper bound — a cancellation, an end of the active window — are stale. Retention is floored at today for
    the edit path and at the horizon for the pass; generation stays floored at `lower`.

    **Occupied dates are counted honestly, not optimistically.** A backfill can reach dates that already
    carry a *converted* row (the app had one instance and the household fills the months around it), so the
    insert set is filtered against every row of the schedule rather than only the upcoming ones — the UNIQUE
    index was already preventing a duplicate, but `onConflictDoNothing` would have reported a row that was
    never written. So `backfilledInstances` means what the household hears it to mean.

    **Decision 75 is untouched, deliberately.** Every edit that does not move the start date still regenerates
    from today and invents no past instance; the form always posts `activeFrom`, so "saved unchanged" takes the
    same path as before. The two `recurring-calendar` regression specs for 75 stayed green across all of this.
    The one case where a backfill *does* apply a new cadence to past dates is when the household moves the
    start date earlier **and** changes the cadence in the same save: they have just told the app "this has run
    like this since that date", so the window follows what was saved — including the amount, which is said in
    the form's copy rather than discovered afterwards.

    **Two honesty extras.** `nextDueDateAfter` now honours `activeFrom` (a period whose configured date
    precedes the start is not an expectation — the same membership rule `candidateForPeriod` uses), so moving
    a start into the future cannot leave the card advertising a "next due" that will never convert; this was
    already reachable by creating a future-dated schedule. And the backfill window is bounded before anything
    is written: `MAX_BACKFILL_SPAN_DAYS` (`1500 − MATERIALIZATION_HORIZON_DAYS`, ~3 years) is checked on edit
    *and* create, naming the earliest usable date instead of failing inside materialisation with a word like
    "materialize".

    **Shape and surface.** `editSchedule` returns `{ schedule, materializedInstances, backfilledInstances }`,
    mirroring `createSchedule`, so the action can report the outcome in the domain's own numbers instead of
    guessing from a query; three test call sites destructure `schedule` now. The submit button reads **Save
    changes**, not "Save from next instance" — it could no longer promise that, and the semantics belong in
    the section note ("a start date moved earlier backfills the dates the app was never told about") and next
    to the field. The card's meta line prints `active from <date>`, so the household can see the value they
    are about to change. No conversion is forced inside the action: SPEC §11.2's lazy due pass stays the only
    writer of records, `/transactions` runs it, and the record is there the moment it is looked for. No
    migration — `active_from` has been a column since 0002.

    **Verification.** `npm test` **494** green (481 + 10 new in `tests/schedule-start-date.test.ts` + 3
    boundary-schema cases): the missed direct debit becoming a `DD` row and a schedule-linked purchase; the
    whole window filled **before** a converted record with that record left intact and unvoided; an unchanged
    start date backfilling nothing; a start date plus a due-day change following the saved cadence; the start
    moved later dropping October's upcoming instance and keeping the summer's history; an income schedule
    backdating into a `BAC` receipt and never a purchase; a re-save adding nothing twice (idempotence);
    a backfilled record older than the checkpoint leaving the estimate exactly where it was (E6, so the fix
    cannot double-count); and the too-far-back refusal on both paths. Playwright **75** green, the new
    `desktop` spec walking the household's whole story in a browser — add a schedule starting today, watch its
    next due date sit a month away, edit the start back, read "one payment the app had not been told about is
    now expected", find the instance on the calendar, then the `DD` row on All Transactions linked to its
    schedule.

## Open questions (none block Phases 0–1; proposed defaults given)

| # | Question | Proposed default |
|---|---|---|
| OQ1 | Due-day clamping (day 29–31 in shorter months) | Clamp to last day of month; test leap years. |
| OQ2 | Income schedules: "shift to previous working day if weekend/bank holiday" toggle (salaries often pay on last working day)? | **Resolved 2026-09-23 (decision 112): always shift, no toggle, income schedules only, weekends only** — payday moves to the previous Friday; bank holidays are not handled because the app keeps no holiday calendar. |
| OQ3 | Duplicate-notice matching window & rule (currently ~2h, same pot+supplier/category+amount) | Ship as stated; tune after real use. |
| OQ4 | Checkpoint effective-date granularity (date-only backdating vs full timestamp) | Date-only backdating, boundary = end of local date; revisit if users want finer. |
| OQ5 | Receipts storage shape (own table vs signed purchase records) | **Resolved in Phase 3 (decision 55): dedicated `receipts` table** — income has no category/target (SPEC §6), so it does not reuse the split machinery; the estimate engine reads it as +signed pence. |
| OQ6 | ~~Receipt images / attachments~~ | **Resolved 2026-09-20 — in scope (decision 26, SPEC §23).** Residual sub-questions moved to OQ9–OQ12. |
| OQ7 | ~~PWA installability~~ | **Resolved v0.8.0 (decisions 122–123): manifest + icons shipped without a service worker; bypass surface equals the files that exist.** |
| OQ8 | Unraid host port | Pick a free port at first install; template documents it (never inherit 3005). |
| OQ9 | Phone camera formats: accept HEIC directly, or rely on browser JPEG capture? | v1 accepts PNG/JPEG/PDF; document the iPhone "Most Compatible"/JPEG camera setting; server-side HEIC conversion only if real devices demand it. |
| OQ10 | ~~Supplier-level document attachments (e.g. a policy PDF not tied to a purchase)?~~ | **Resolved v0.25.0 (decision 175): a supplier card has a Documents section** — `attachments.supplier_id`, the exactly-one-owner CHECK widened to three owners, PDF/JPEG/PNG only (no `text/plain`), same pipeline, audit, backup and removal. (v0.10.0, decision 138, had added income-record documents.) |
| OQ11 | ~~Interaction follow-up dates surfaced in the key-dates panel — useful?~~ | **Resolved v0.25.0 (decision 175): a follow-up is a task, not a key date.** It is listed — overdue first, until ticked — on the Tasks page, the supplier card, the Suppliers banner and Contracts & Renewals. The key-date engine and the Overview panel are unchanged; no notifications either way. |
| OQ12 | Attachment size limit and retention guidance | 10 MB per file; README guidance on archive growth; no server-side pruning in v1. User-initiated removal of one receipt is decision 89 — still no automatic pruning. |
| OQ13 | 29 February renewal dates under annual advance | Land on 28 February in non-leap years; visible and editable. |
| OQ14 | Should the Tasks page's "The app has noticed" also list a **stale pot** — a bank or cash pot with no balance checkpoint for N days? | **Deferred by household 2026-09-27 (v0.26.0, decision 176): they will road-test the app and decide in a few weeks.** Not in v0.25.0 (decision 175) nor v0.26.0. Options: **7 days** (about one and a half of the household's 4–5-day checkpoint cycles — prompts early) or **14 days** (quieter; only a pot that has clearly been forgotten). Derived and link-only either way, like the other noticed items. |
| OQ15 | Phone PDF display: should the app draw PDF pages itself (PDF.js, a new dependency, reversing the no-dependency rule in decision 177)? | **Resolved 2026-10-09: approved (decision 192).** PDF.js draws each page in the app, the same on every phone, with Open in PDF app and Download kept. |

## Release history

- **v0.21.1 — a same-day credit recorded after its checkpoint counts (session
  `arena/01a0df10-simple-finance`, from `main` @ `063ff5d`)**: decision **165**. The v0.2.1 blanket absorb
  left an inbound transfer on the checkpoint's own day out of the estimate while the outbound leg still
  counted (Natwest −£443.65 instead of £1,056.35; Horizon read the same figure). A date-only credit now
  counts when `createdAt` is strictly after the checkpoint's. Recorded before the checkpoint, it stays
  absorbed, so E13 does not return. No schema change. **Published 2026-09-26**: annotated tag `v0.21.1` on merge commit `22a9901` (PR #75),
  publish run `36265962326`, digest
  `sha256:c9ada52917fed04c28ba828c585a92bcf566d7c3103580842f3d4de02077a506` on `v0.21.1` / `latest` /
  `sha-22a9901` — one digest, different from v0.21.0's
  ([`docs/RELEASE_NOTES_v0.21.1.md`](RELEASE_NOTES_v0.21.1.md)).
- **v0.21.0 — one codebase, two homes: the phone till and the laptop dashboard (panel move session
  `arena/01a0de74-simple-finance`, from `main` @ `2578acc`, the v0.20.0 stamp merge; release session
  `arena/01a0de9d-simple-finance`)**: decision **164**. The phone's first screen and the laptop's first
  screen stop being copies of each other. Phone `/` is a till home — available now, Quick Entry (still
  parked at the till on mount, decision 158), payday projection, due this week and three links (Charts,
  Purchases, Horizon); the recurring dump, pot dump, recent purchases, key dates, Add a pot and
  checkpoint cards are gone from it. Laptop `/overview` keeps the dense dashboard — money row,
  projection, quick entry, due this week, key dates, this month so far, vehicles — and stops repeating
  purchase review, transfers, Add a pot and checkpoints. Transfers gained a review list with void and the
  canonical `/pots?transfer={id}#transfer-{id}` deep link, mirroring `?external=`; All Transactions links
  there (`src/lib/records/activity.ts`) and still finds one older than the recent-twenty cap. **Purchases**
  is the only purchase-review surface, receipts included, and SPEC §23.4 now says so. The phone drawer
  leads with Quick Entry · Purchases · Horizon · Charts · Overview · Recurring and moves everything else
  under More; the desktop bar is unchanged. Recurring on `lg+` height-matches the schedules panel to the
  calendar card, scrolls the list inside it with Add a schedule pinned and renewals below, and keeps
  `#schedule-{id}` scrolling to the row (`ScrollHashIntoView`). No schema change, no migration. `npm test`
  **506 tests / 116 suites green**, format, typecheck and production build clean, Playwright **78 green**
  (two new specs: the phone home is the till; the desktop bar lists every page). **Published 2026-09-26**:
  annotated tag `v0.21.0` on merge commit `4b177a5` (PR #73), publish run `36257538054`, digest
  `sha256:dec7f9a26eaa914b33f93e52717867fdf417075899bad6aed98966ff36ceb346` on `v0.21.0` / `latest` /
  `sha-4b177a5` — one digest, different from v0.20.0's
  ([`docs/RELEASE_NOTES_v0.21.0.md`](RELEASE_NOTES_v0.21.0.md)).
- **v0.19.0 — a schedule can start in the past, so the payments the app missed are recorded properly
  (session `arena/01a0dcf7-simple-finance`, from `main` @ `1363139`, the v0.18.0 merge)**: a household
  that started recording five days late had no way to place the direct debits inside that gap — the
  schedules were set up afterwards, so no instance covered those dates, and typing the money in as a
  Purchase mislabelled it on every page that reads the money. The schedule card's Edit now carries
  **Active from**, and moving it earlier **backfills** every due date up to today as ordinary instances
  that convert into schedule-tagged `DD` / `SO` / income records; moving it later drops upcoming
  instances only; converted history is never rewritten in either direction. It forced the one real
  domain change: separating the *generation floor* from the *retention floor* in
  `syncScheduleInstances`, because the daily pass had been pruning past-dated upcoming rows as stale
  and would have eaten a backfill before it converted. `editSchedule` returns the backfill count
  alongside the schedule, `nextDueDateAfter` honours `activeFrom`, and a backdated window is bounded by
  `MAX_BACKFILL_SPAN_DAYS` (~3 years) with a sentence rather than a materialisation error. Decision
  **162**, SPEC **§11.1**. No schema change, no migration. `npm test` **494 tests / 115 suites green**,
  format, typecheck and production build clean, Playwright **75 green**. **Published 2026-09-26**:
  annotated tag `v0.19.0` on merge commit `db74572` (PR #68), publish run `36234993565`, digest
  `sha256:596a0f8f9da86f9bc7b0f1f5674ce1ef6100dfa20ae8996dca48e24af8cc8937` on `v0.19.0` / `latest` /
  `sha-db74572` — one digest, different from v0.18.0's
  ([`docs/RELEASE_NOTES_v0.19.0.md`](RELEASE_NOTES_v0.19.0.md)).
- **v0.18.0 — a supplier card says who each purchase was for (session
  `arena/01a0dcb6-simple-finance`, from `main` @ `9dc74e4`, the v0.17.0 post-release merge)**: the
  supplier card's **Recent purchases** list showed `date · amount`, which made one carrier holding a
  contract per person readable only by price. Each row now carries the child category and the
  target — `2026-09-24 · £28.99 · Mobile Phones (Robin)` — with `+N more` for a split purchase,
  matching All Transactions. The page needed no new query (`listPurchases` already returned the
  allocations the `.map` was discarding), and the four scattered copies of the
  `{targetKind, targetId}` → name function collapsed into one pure module,
  `src/lib/records/targets.ts`, now used by All Transactions, Purchases, Contracts & Renewals and
  the supplier card. Decision **161**, SPEC **§21.4**. No schema change, no migration. `npm test`
  **481 tests / 113 suites green**, format, typecheck and production build clean, Playwright **74
  green**. **Published 2026-09-26**: annotated tag `v0.18.0` on merge commit `ee2308e` (PR #66),
  publish run `36230210060`, digest
  `sha256:8d8b822afe5ac115b605ffa825d43584262a8b5425ddb13f918dd66549977fb5` on `v0.18.0` / `latest` /
  `sha-ee2308e` — one digest, different from v0.17.0's
  ([`docs/RELEASE_NOTES_v0.18.0.md`](RELEASE_NOTES_v0.18.0.md)).
- **v0.17.0 — themes: fourteen palettes, light and dark, chosen per device (session
  `arena/01a0dad7-simple-finance`, from `main` @ `978a9a6`, the v0.16.0 stamp merge)**: decision
  **159**'s claim, cashed. 28 themes — the household's thirteen palettes plus Classic, each in a light
  and a dark form — generated from five hex stops apiece by `scripts/themes/*` into one
  `[data-theme]` block each (`src/app/themes.generated.css`, 73 tokens per theme) plus a generated
  catalogue; a gallery at **Settings → Appearance** whose cards are real app markup wearing the
  theme; the choice held in a per-device `sf-theme` cookie and rendered server-side, so the first
  paint is already right and nothing is stored in the database. Classic's own contrast ratios are the
  floors the generator enforces and `tests/themes.test.ts` re-measures on the shipped stylesheet,
  with a distinctness rule so no theme collapses two greys. `--color-fill-ink` split out (4 sites) so
  bright fills get a legible label in both modes; `generateViewport()` serves per-theme browser
  chrome while the manifest stays pinned to the default; new tokenised `src/app/not-found.tsx`.
  Decision **160**, SPEC **§15.4**. No schema change, no migration. `npm test` **478 tests / 112
  suites green**, format, typecheck and production build clean, Playwright **74 green** (new `theme`
  project). **Published 2026-09-26**: annotated tag `v0.17.0` on merge commit `cf70dba` (PR #64),
  publish run `36204626937`, digest
  `sha256:bd5aef911d64f754b21b80f34a78bc435a95ea10c7e65870961e6e25abdb8e25` on `v0.17.0` / `latest` /
  `sha-cf70dba` — one digest, different from v0.16.0's
  ([`docs/RELEASE_NOTES_v0.17.0.md`](RELEASE_NOTES_v0.17.0.md)).
- **v0.15.0 — the phone opens at the till (session `arena/01a0da35-simple-finance`, from `main` @
  `09cfc80`, the v0.14.0 post-release merge)**: on a phone the home page now opens at the Quick entry
  till — a mount-time `scrollIntoView` (`openAtTillOnMobile`, home page only) parks the card's top
  under the sticky header (`id="quick-entry"`, `scroll-mt-16`), and the mobile drawer's **Quick Entry
  (Till)** link carries `/#quick-entry` so a tap re-anchors even on the open page. A scroll, never a
  focus: decision **158** supersedes only 151's "the page does not scroll itself" clause; the keyboard
  stays down and every focus rule stands. Laptop unchanged. No schema change, no migration. `npm test`
  461 tests green; Playwright 71 green (two new specs: opens at the till with nothing focused; drawer
  link lands on the till). Tag `v0.15.0` on `439eea4`, digest
  `sha256:224cfdc9891f00a4b59444737d9e5d2e4f7126aa06ddc882e98aef0babdccc9e`. Notes:
  [`RELEASE_NOTES_v0.15.0.md`](RELEASE_NOTES_v0.15.0.md).
- **v0.14.0 — Charts: the money, drawn (session `arena/01a0d991-simple-finance`, from `main` @ `c50cfa7`,
  the v0.13.1 merge)**: a new `/charts` page with four server-rendered SVG charts — the month ahead
  (household total, zero always on the axis, sub-zero tinted, overdraft line and lowest point labelled),
  the weekly shop (Mon–Sun buckets, 12 weeks on a phone / 26 on a laptop, configured figure and trailing
  8-week average as reference lines, an empty week drawn as a zero week), personal spending (stacked
  months, "For: person" attribution, Household never split, chips in the URL) and the fixed commitments
  (monthly bars over a household-ticked list of child categories, plus a "schedule-converted only"
  toggle). Hand-rolled chart kit under `src/components/charts/` with no client JavaScript, a verdict
  sentence as each SVG's `aria-label`, a table twin under `<details>` for every chart, and drill-down as
  real `/purchases` links — which grew a repeatable `categoryId`, parent expansion and
  `targetKind=household` to carry them (decisions **152–157**). One new setting,
  `commitment_category_ids`, in the existing key/value table. No schema change, no migration. `npm test`
  **459 tests / 111 suites green**, format, typecheck and production build clean, local Playwright **70
  tests green** (7 new charts specs at 320px, 360px @130% and 1400px).

- **v0.13.0 — Horizon opens at the next payday window, and date changes apply immediately (session
  `arena/01a0d8b1-simple-finance` + release completion on `arena/01a0d912-simple-finance`, from `main` @
  `7a2a3a4`, the v0.12.1 merge)**: Horizon defaults the through date to the day before the next scheduled
  **receipt schedule** (salary only — a debt's expected support never sets the default), and changing the
  look-ahead date applies itself (decision **150**). Pure resolver `src/lib/records/horizon-default.ts`
  with `tests/horizon-default.test.ts` (12 cases); client island
  `src/components/horizon-look-ahead-form.tsx`; browser suite extended to 9 horizon specs. No schema
  change, no migration. `npm test` **416 tests / 103 suites green**, format, typecheck and production
  build clean, local Playwright **62 tests green**. **Published 2026-09-25**: annotated tag `v0.13.0` on
  merge commit `8fcc65b` (PR #54), publish run `36152070421`, digest
  `sha256:5264c114054935f76ddd59238ddb6f0fff1e552ab2005a6a8a937ab38a084df0` on `v0.13.0` / `latest` /
  `sha-8fcc65b` — one digest, different from v0.12.1's
  ([`docs/RELEASE_NOTES_v0.13.0.md`](RELEASE_NOTES_v0.13.0.md)).
- **v0.12.1 — a "Supplier card" link opens that supplier (session `arena/01a0d879-simple-finance`, from
  `main` @ `63c77c7`, the v0.12.0 merge)**: the links v0.12.0 painted on Recurring Payments and Contracts &
  Renewals pointed at a bare `/suppliers`. They now carry `/suppliers?supplierId=<id>` and the page opens
  that card expanded, filtered and scrolled into view (decision **149**). New pure resolver
  `src/lib/records/supplier-focus.ts` (SPEC §21.2a) with `tests/supplier-focus.test.ts` (15 cases); browser
  assertions added to both `e2e/desktop.spec.ts` specs. No schema change, no migration. `npm test`
  **404 tests / 101 suites green**, format, typecheck and production build clean, local Playwright
  **58 tests green** (SANDBOX entry 8 recipe). **Published 2026-09-25**: annotated tag `v0.12.1` on merge
  commit `bb30813` (PR #51), publish run `36136002907`, digest
  `sha256:4fe6c12f2e274163c5487491319cf119e21ef452ea2d081b356c0fc9e8fc0000` on `v0.12.1` / `latest` /
  `sha-bb30813` — one digest, different from v0.12.0's
  ([`docs/RELEASE_NOTES_v0.12.1.md`](RELEASE_NOTES_v0.12.1.md)).
- **Releases v0.1.0 → v0.6.0 are published** — each a lower-case annotated tag on its pull-request merge
  commit with its own digest; the notes file is the release record and earlier notes are never rewritten
  (`docs/RELEASE_NOTES_v0.1.0.md` … `docs/RELEASE_NOTES_v0.6.0.md`). Before v0.7.0, `latest` is the **v0.6.0**
  build (`b0379eb`, PR #36 merge, publish run `36006994819`, digest
  `sha256:e650c5f48e1e049d0865be8f889426630e4f8af21d40e7eaf9d4fc977ca2aa4e`). The bullets below record the
  build sessions that led to the first release — they are history, not the current state.
- **v0.7.0 — expected support with a real start, a changeable day and an end (session
  `arena/01a0d490-simple-finance`, from `main` @ `102570a`)**: migration
  `0008_debt_expected_inflow_until`; the expectation projects before the first Borrow, ends on its until
  date, stops when the debt is settled and moves its day forward-looking (decision 120), and it is visible
  as flagged `EXP<` rows on All Transactions, in the projection panel and on the debt panel (decision 121).
  SPEC §7.2/§7.6/§10.2/§15.3/§17 E11 amended; `npm test` **335 tests / 84 suites green**, format and
  typecheck clean, production build green. **Published 2026-09-24**: annotated tag `v0.7.0` on merge
  commit `0a82992` (PR #38), publish run `36042299282`, digest
  `sha256:3b1dcc809d876fa8c598c4471432d2e28c4617e63db7c6605b145e50d47fcb18` on `v0.7.0` / `latest` /
  `sha-0a82992` — one digest, different from v0.6.0's ([`docs/RELEASE_NOTES_v0.7.0.md`](RELEASE_NOTES_v0.7.0.md)).
- **v0.9.0 — the phone-first till form and the "before income lands" figure (session
  `arena/01a0d55f-simple-finance`, from `main` @ `2255607`)**: SPEC §7.7 added (two balance figures, no
  income counted, per-pot = §7.5's watch), §15.1 rewritten for the redesign, §15.2 Settings row gains the
  default pot. New: `getCycleOutlook`/`getDefaultPurchasePotId`/`setDefaultPurchasePotId`,
  `formatShortLocalDate`, `rankSupplierMatches`/`nearestSupplierName`, `components/pot-outlook.tsx`, the
  Quick Entry rewrite (pot-first, balances, typeahead, swipe panels, focus order, note collapse) and the
  Settings "Quick entry" section. Decisions **124–130**. Tests: `tests/cycle-outlook.test.ts` (6),
  typeahead ranking in `tests/quick-entry.test.ts`, the setting in `tests/settings-domain.test.ts`,
  `formatShortLocalDate` in `tests/time.test.ts`, and mobile/settings Playwright specs. `npm test`
  **357 tests / 90 suites green**, format, typecheck and production build clean. Second commit on the same
  branch: the till announces hydration readiness (`data-till-ready` + `inert`) and refuses to save without a
  pot, after the first `browser` job ran red (decisions 131–133); the browser suite was brought up inside the
  sandbox to diagnose it (SANDBOX entry 8), 50 tests green locally. **Published 2026-09-24**: annotated tag
  `v0.9.0` on merge commit `19e878c` (PR #43), publish run `36069116599`, digest
  `sha256:4384d7d2a4bd789580e733889616eb1d92ab8cd27403419bb73b3affd12aa809` on `v0.9.0` / `latest` /
  `sha-19e878c` — one digest, different from v0.8.0's ([`docs/RELEASE_NOTES_v0.9.0.md`](RELEASE_NOTES_v0.9.0.md)).
- **v0.10.0 — payslips on income, fuel economy, and the lost till fixes (session
  `arena/01a0d778-simple-finance`, from `main` @ `5cb28e3`)**: re-does decisions **134–137** (their
  post-v0.9.0 commits never reached GitHub) and adds **138–142**: migration
  `0009_income_documents_fuel_details` (attachments owned by a purchase *or* an income record; optional
  `odometer_miles`, `fuel_millilitres`, `fuel_full_tank` on purchases), documents on the Income page,
  litres/odometer/full-tank at the till and later on Purchases/Overview (`components/fuel-details-form.tsx`),
  the Insights Fuel economy panel, the post-save mpg sentence. New: `records/fuel-economy.ts`,
  `records/fuel.ts`, `tests/fuel-economy.test.ts`, `tests/migration-0009.test.ts`, income-document tests in
  `tests/attachment-pipeline.test.ts`, `e2e/fuel.spec.ts` (own project, before backup), payslip and till
  specs; the weekend-payday probe now needs a Friday after today; a restore upgrades an older archive to the
  running schema and refuses a newer one (decision 142). SPEC §15.1/§16.6/§18.4/§23 amended, mpg removed
  from out-of-scope. `npm test` **378 tests / 95 suites green**, format and typecheck clean, production
  build green, local Playwright **55 tests green** (SANDBOX entry 8). **Published 2026-09-25**: annotated
  tag `v0.10.0` on merge commit `3f18a62` (PR #45), publish run `36111884895`, digest
  `sha256:02a7321ece1fc55d245a6503c91c73b7106115bfd01132a53e41f3601d1269e6` on `v0.10.0` / `latest` /
  `sha-3f18a62` — one digest, different from v0.9.0's ([`docs/RELEASE_NOTES_v0.10.0.md`](RELEASE_NOTES_v0.10.0.md)).
- **v0.8.0 — installable PWA, no offline access (session `arena/01a0d4f9-simple-finance`, from `main` @ `837845a`)**:
  `public/manifest.webmanifest` (static file, not a Next route), `public/icon-192.png` (192×192),
  `public/icon-512.png` (512×512), `public/apple-touch-icon.png` (180×180), all derived from the existing
  icon SVG/PNG; `layout.tsx` metadata (manifest link, apple-touch icon, appleWebApp, themeColor via viewport);
  Dockerfile runtime stage gains `COPY --from=builder /app/public ./public` (the trap); Node test
  (`tests/pwa-manifest.test.ts`, 5 tests: manifest parses, required fields, icon files exist at declared pixel
  sizes, colours); Playwright spec (`e2e/pwa.spec.ts`: four paths return 200 with correct content types); CI
  docker job and publish workflow both smoke-test the four PWA paths. Decisions **122–123**, OQ7 resolved.
  SPEC §14 updated. `npm test` **340 tests / 85 suites green**, format and typecheck clean, production build
  green.
- **Pre-v0.1.0 history** (no tag, no image, no deployment existed yet): **Phase 0 + Phase 1 merged to `main` on
  2026-09-20 (PR #2, Session 1)** — application code now exists; CI runs gates and a Docker image build +
  container smoke test on every PR and push. **Phase 2a merged to `main` on 2026-09-20 (PR #3,
  Session 2)** — core money-record domain with E1/E2/E4/E6/E7 integration coverage, no UI yet. **Phase 2b
  mobile entry merged via PR #4 on 2026-09-20** — 111 tests green; browser tooling unavailable in the sandbox.
  **Phase 3 (Session 4) built on its session branch** — schedules + instances, income receipts, estimate and
  payday-projection engines, two-tier warnings, pot-level transfer watch, renewals + key-date alerts, home
  panels and entry forms; E3/E5/E8/E9 and DST boundary coverage; **154 tests green**, all gates green
  (`npm ci --ignore-scripts` in-sandbox; plain `npm ci` in CI), migration `0002_phase3_schedules`. No tag and
  no publish this session — **v0.1.0** remains the end-of-Phase-5 release.
- **Phase 4b merged 2026-09-21 (PR #8, Session 6 on branch `arena/01a0c181-simple-finance`)** — Suppliers
  page with references and the interaction log, Contracts & Renewals page, the `attachments` migration
  (`0003_phase4b_documents`) and the first upload/view path; 182 tests green.
- **Phase 5 built 2026-09-21 on branch `arena/01a0c193-simple-finance` (this session, commit `6dbeafe` plus
  the container/deployment work above it)** — backup format 2 with documents, verified restore and live
  in-place restore, the shared attachment pipeline, audited supplier operations, unprivileged container,
  Unraid template, GHCR publish workflow, Playwright acceptance suite. **224 Node tests green**, format and
  typecheck green, production build green, `npm audit --omit=dev` 0 vulnerabilities. **No tag and no
  publish yet**: the first release is still **v0.1.0**, to be tagged on the merged commit after the product
  owner's review, with the publish workflow verifying the GHCR image before the household Force Updates
  Unraid. **No browser run has been executed yet** — Playwright cannot install its browser in this sandbox
  (decision 87); the suite runs in the CI `browser` job and its result must be recorded before the tag.

## File map (current)

```
README.md                     — operating truth (Phase 0–4b merged, Phase 5 built; install, Cloudflare,
                                backup/restore, Unraid update, recovery checklist, gates, sandbox notes)
AGENT_APP_BLUEPRINT.md        — engineering/delivery contract (from Estate Organiser lessons; user-provided)
docs/SPEC.md                  — agreed product specification + worked fictional examples E1–E12
                                (E10–E12: cash handover, family loan, swap)
docs/IMPLEMENTATION_PLAN.md   — this file (now includes the session map)
docs/HANDOFF.md               — next-session continuation point (rewritten at each session end)
.gitignore                    — protects real data/secrets/backups from the public repo
package.json / package-lock.json — dependencies, scripts (gates), engines (node >=22)
tsconfig.json / next.config.ts / postcss.config.mjs / .prettierrc / .prettierignore
drizzle.config.ts             — drizzle-kit config (schema → ./drizzle)
drizzle/                      — checked-in SQL migrations (never edit an applied migration)
src/lib/version.ts            — single source of app version (kept aligned with package.json by test)
src/lib/config.ts             — env parsing; fail-closed auth completeness; dev-bypass computation
src/lib/money.ts              — integer-pence parsing/formatting (no float money, ever) + shared bounds
src/lib/time.ts               — Europe/London rendering + checkpoint age labels + local-date helpers (backdating)
src/lib/db/{client,migrate,schema}.ts — better-sqlite3 + Drizzle (WAL, FKs), migration runner, schema
src/lib/audit.ts              — in-transaction audit writer
src/lib/auth/{verify,current-user,next}.ts — jose JWT verification, fail-closed resolution, Next adapter
src/lib/records/pots.ts       — domain: create pot, add immutable checkpoint (effective-date rule), archive
                                empties only (post-release), reads
src/lib/records/{splits,categories,people,vehicles,suppliers,purchases,transfers,occurred,errors}.ts — Phase 2a
                              domain: exact-total splits, category tree, parties, money records, backdating, concurrency
src/lib/records/dates.ts      — Phase 3 pure local-calendar arithmetic (no instants): clamped due dates (OQ1/OQ13),
                                whole-day adds, leap years — DST-safe by construction
src/lib/records/estimates.ts  — Phase 3 pure estimate engine (SPEC §7.1): comparison-precision rule, per-pot + household sums
src/lib/records/projection.ts — Phase 3 pure payday-projection engine (SPEC §7.2–7.5, §8): pessimistic day-to-day block,
                                outgoings-before-receipts, two-tier selection, pot-level transfer watch
src/lib/records/keydates.ts   — Phase 3 pure key-date engine (SPEC §22): inclusive warning windows, today/rolled/past states
src/lib/records/{debts,external-movements}.ts — post-release domain: informal-IOU derived
                                balances; loan/swap/other movements, atomic swap pairs, boundary money rules
src/lib/records/{schedules,receipts,renewals,settings,money-view}.ts — Phase 3 domain + read-side assembly: schedule
                                lifecycle (sync/convert/self-heal), income records, renewal auto-advance, typed settings,
                                and the DB-backed money/projection/key-date views that run the lazy due pass first
src/lib/validation.ts         — Zod schemas at the server boundary, including Phase 2b entry payloads, Phase 3
                                schedule/cancel/renewal/settings payloads and Phase 4a edit/refund/void/transfer/
                                pot/category/rename/warning-lead payloads and post-release debt/external/
                                swap/archive payloads
src/lib/records/insights.ts   — Phase 4a pure Insights v1 engine (SPEC §16): month comparison, per-person
                                attribution, vehicle rolling-12, honesty loop (complete periods only)
src/lib/records/insights-view.ts — Phase 4a DB assembly for the four insight views (runs the lazy due pass;
                                transfers/receipts excluded by construction)
src/lib/records/entry-view.ts — shared QuickEntryData builder (mobile home + desktop overview, one code path)
src/lib/backup/crypto.ts      — AES-256-GCM + scrypt frame (`SFBA` v1), reviewed primitives only
src/lib/backup/filename.ts    — filename contract (Europe/London, same instant) + Content-Disposition parsing
                                and the local fallback name (v0.2.21 lesson)
src/lib/backup/backup.ts      — format 2 backup: snapshot + referenced documents + sha256 manifest, orphan
                                report, `inspectDocuments` (read-only health, never deletes)
src/lib/backup/restore.ts     — staged restore (formats 1 and 2): member allowlist, per-file integrity,
                                referenced-document verification, swap with rollback preserving both copies
src/lib/backup/live-restore.ts — close handle → restore → reopen (the in-place path the UI calls)
src/lib/backup/download.ts    — browser download path (client-only): header filename into anchor.download,
                                tested fallback; `chooseDownloadFilename` is unit-tested
src/lib/backup/policy.ts      — shared constants: 12-character create password, RESTORE word, 512 MB bound
src/lib/auth/origin.ts        — same-origin guard for mutating route handlers (blueprint §4.7)
src/lib/records/attachments.ts — the one attachment pipeline: content sniffing, 10 MB, key pattern, display-name
                                sanitising, store + audit, delete (soft-delete then unlink, decision 89),
                                read path (used by action, route, backup, restore)
src/lib/records/supplier-details.ts — reference pairs + interaction log as audited domain operations,
                                `upcomingSupplierFollowUps` for the contracts page
src/lib/records/supplier-focus.ts — v0.12.1 pure deep-link resolver for /suppliers (?supplierId= / ?id= /
                                ?q= / #supplier-<id>) + `supplierCardHref`/`supplierFocusKey` (decision 149)
tests/supplier-focus.test.ts  — v0.12.1: 15 cases over that resolver (stale ids, junk ids, the focus key)
src/lib/records/horizon-default.ts — v0.13.0 pure Horizon default date (day before the next scheduled income,
                                clamped; five-week fallback; explicit ?through= wins) — decision 150
tests/horizon-default.test.ts — v0.13.0: 12 cases (the clamp table + scheduled-income-only against the DB)
src/lib/records/chart-series.ts — v0.14.0 pure chart resolvers (integer pence, no DB, no framework):
                                forecastSeries, weeklyBuckets/groceriesSeries, monthlyBuckets/
                                personalSpendSeries, commitmentSeries, purchasesHref — SPEC §16.7
src/lib/records/charts-view.ts — v0.14.0 DB assembly for the four charts + the commitment-category picker
                                and `effectiveCommitmentCategoryIds` (ticked set, else schedule-derived)
src/components/charts/        — v0.14.0 hand-rolled SVG kit (decision 155): chart-figure (frame, badge,
                                legend, table twin), chart-primitives (gridlines, sub-zero band, reference
                                lines, band labels), scale (domain/ticks/geometry), step-area, bar,
                                stacked-bar, index barrel
src/app/charts/page.tsx       — v0.14.0 the Charts page: four sections, phone (320) and laptop (720)
                                variants, person chips and the schedule-only toggle as links (?who=,
                                ?scheduleOnly=1)
tests/chart-series.test.ts    — v0.14.0: 26 cases over the pure resolvers and the chart geometry
tests/charts-view.test.ts     — v0.14.0: 17 cases reconciling every chart figure against an independent
                                sum over listPurchases (voids, refunds and transfers asserted out)
e2e/charts.spec.ts            — v0.14.0: 7 browser specs (320px / 360px @130% / 1400px, table twin agrees
                                with the drawing, drill-down lands on the purchases, chips and the
                                Settings-driven commitment list)
src/components/horizon-look-ahead-form.tsx — v0.13.0 client island: the GET form, date change submits
src/app/api/restore/route.ts  — live in-place restore endpoint (confirmed, bounded, same-origin, authenticated)
src/app/api/attachments/[fileKey]/route.ts — authenticated private serving (nosniff, no-store)
src/components/backup-panel.tsx — Settings backup & restore UI (download + typed-confirmation restore)
src/components/supplier-forms.tsx — contact card editor, reference form, interaction form
src/app/                      — layout + site nav (version badge), home page (mobile-first), unauthorized page,
                                server actions (incl. Phase 4a edit/refund/void/transfer/pot/category/rename/
                                warning-lead actions), and the Phase 4a pages: /overview, /purchases, /recurring
                                (month calendar), /pots, /insights, /settings — all force-dynamic
src/app/api/health/route.ts   — public health endpoint (no diagnostics)
src/app/api/backup/route.ts   — authenticated encrypted backup download (POST)
src/components/pot-forms.tsx  — client forms (Add pot / checkpoint)
src/components/quick-entry.tsx — mobile Add Purchase / Add Fuel / Update Balance, split helper, chips, duplicate notice
src/components/getting-started.tsx — the derived first-run card and path (v1.1.0; replaced household-setup.tsx)
src/components/setup-forms.tsx — /start's inline Phase A forms (person; pot; checkpoint; salary schedule)
src/lib/records/setup-path.ts — the derived setup path read from the household's own records (v1.1.0)
src/components/recurring.tsx  — Phase 3 client forms: Add/Cancel schedule, Add renewal, projection figures
                                (slim props, decision 73)
src/components/record-forms.tsx — Phase 4a: line editor, PurchaseEditForm, RefundForm, generic VoidForm,
                                TransferForm, RecentEntryActions (edit/refund/void switcher)
src/components/activity-open-row.tsx — decisions 225/226: the shared in-place contract — the open row the
                                URL names (`?transfer=` / `?purchase=`), ActivityOpenRowProvider (one panel
                                at a time, via router.replace with scroll:false + useOptimistic), the
                                decision 131 ready hook and the shared panel frame
src/components/transfer-activity-row.tsx — decision 225: All Transactions' in-place transfer row + panel
src/lib/records/transfer-activity.ts — decision 225 (pure): open-transfer URL/windows, the usual pot,
                                pinned-row reasons, links and placement
src/components/purchase-activity-row.tsx — decision 226: All Transactions' in-place purchase row + panel
                                (PUR / DD / SO; a refund keeps its Purchases link)
src/lib/records/purchase-activity.ts — decision 226 (pure): open-purchase URL/windows, pinned-row reasons
                                and links
src/lib/records/in-place-activity.ts — decisions 225/226 (pure): what both kinds share — the open-row
                                parameter contract, date windows, the pinned entry and its placement
src/lib/records/activity-order.ts — the newest-first comparator shared by the projection and the pin
src/components/schedule-forms.tsx — Phase 4a: ScheduleEditForm (composite target picker), RenewalEditForm
src/components/settings-forms.tsx — Phase 4a: TargetRenameForm, PotEditForm, CategoryTreeEditor, WarningLeadsForm;
                                v0.14.0 CommitmentCategoriesForm (the tracked fixed-commitment children)
src/components/site-nav.tsx     — app chrome: menu pages + version badge (desktop AND mobile)
src/components/purchase-filter-form.tsx — Purchases GET filters; phone collapse + in-card layout (decision 92)
scripts/migrate.cjs           — production migration runner (entrypoint path)
scripts/e2e-server.mts        — Playwright webServer: isolated `.e2e-data` seed (fictional) + `next dev`
e2e/{home,desktop,backup,pwa}.spec.ts — browser acceptance specs (mobile till moment, desktop review incl. the
                                calendar-consistency check, backup download + UI restore, PWA asset 200s)
playwright.config.ts          — Playwright projects (mobile/desktop/backup) and the webServer wiring
docker-entrypoint.sh          — .env → dirs → one-time chown → migrations → exec server as PUID:PGID
Dockerfile                    — multi-stage production image (gosu, unprivileged default 99:100)
simple-finance.xml            — Unraid container template (appdata, free host port, PUID/PGID, AUTH_*)
public/manifest.webmanifest   — PWA manifest (static file, not a route; fetchable without Access credentials)
public/icon-192.png           — 192×192 app icon (derived from docs/assets/simple-finance-icon.svg)
public/icon-512.png           — 512×512 app icon
public/apple-touch-icon.png   — 180×180 apple touch icon
.github/workflows/ci.yml      — gates + browser acceptance + docker smoke (asserts uid 99, PWA assets)
.github/workflows/publish.yml — tag-triggered GHCR publication with pre-push smoke test and digest check
docs/assets/simple-finance-icon.{svg,png} — app/template icon (generated placeholder, fictional)
.env.example                  — placeholders incl. DOCUMENTS_DIR and the container PUID/PGID notes
.env.example                  — placeholder configuration (real values only in the private install)
tests/*.test.ts               — 340 regression tests: money, time (+ local dates), filename (DST/midnight), config, auth verify,
                                current-user fail-closed, db slice, backup/restore round-trip (3 migrations), route, migrate
                                script, version, splits, categories (SPEC §12 seed), parties (people/vehicles/suppliers),
                                purchases (E1/E2/E6/E7 + refunds/edit/void), transfers (E4 + edit/void), PWA manifest
tests/{dates,estimate,projection}.test.ts — Phase 3 pure-engine tests: local-date arithmetic + DST days (E3 sweep inputs),
                                comparison-precision rule (E5), E8 projection to the penny + tiers + pot watch
tests/schedule-lifecycle.test.ts — Phase 3 E3: 26th→30th counted-exactly-once timeline, crash self-heal, DST-midnight
                                conversions (2026-10-25 / 2026-03-29), cancel/edit/annual-month/leap/receipt conversion
tests/renewals.test.ts        — Phase 3 E9: inclusive 21-day window, annual auto-advance (audited, 29 Feb → 28 Feb),
                                contract-end alerts ("rolled / awaiting review"), version guard
tests/money-view.test.ts      — Phase 3 E8 end-to-end over the DB: estimates, payday selection, penny-exact projection,
                                due-this-week, settings round-trip
tests/entry-validation.test.ts — Phase 2b Zod boundary tests for split/purchase, fuel and checkpoint payloads
tests/insights.test.ts        — Phase 4a pure-engine tests: month boundaries (DST spring-forward), per-person
                                attribution (household never attributed), vehicle rolling-12 window, honesty-loop
                                complete weeks/months + half-up rounding
tests/insights-view.test.ts   — Phase 4a exit criterion: every insight figure reconciles with an independent
                                sum over listPurchases + categories; transfers asserted to have no effect;
                                converted schedule purchases counted exactly once
tests/recurring-calendar.test.ts — Phase 4a exit criterion: calendar/instance consistency after schedule
                                edits + cancellations (incl. due-day edit moving the next instance), month-end
                                clamping, grid construction
tests/settings-domain.test.ts — Phase 4a: pot edit rules (overdraft context, version guard), category tree
                                operations (retire/assign-block), target renames, warning leads
tests/fuel-economy.test.ts    — v0.10.0 fuel parsing, stretches/gaps, totals, sentences, audited edit + conflicts
tests/migration-0009.test.ts  — v0.10.0 upgrade of a v0.9.0-shaped database keeps every attachment and purchase
tests/household.ts            — isolated household fixture (pots, people, vehicles, category lookup) for Phase 2a+ tests
.github/workflows/ci.yml      — gates job + docker build/smoke job (PR + push to main)
```

## Known risks

- **Assume-cleared overstatement** (decision 6): bounded, self-correcting, documented; mitigate by visible
  checkpoint staleness and honest labelling — never by silent pessimism.
- **Credit recorded after a count that already included it** (decision 165): a same-day credit written
  down after the checkpoint is treated as new money. If the reported figure already included it, record
  the credit first or checkpoint again — the next checkpoint resets an overstatement. The opposite
  mistake (dropping a transfer recorded after the count) was the 2026-09-26 field report.
- **Projection drift**: configured figures going stale would weaken the warning; mitigated by the Insights
  honesty loop (SPEC §16.4).
- **Public repo exposure**: constant discipline — fictional data only, staged-diff review before publishing,
  demo paths isolated from production paths.
- **Two-user concurrency**: optimistic concurrency + audit trails implemented in Phase 2a for all money
  records; stale-form overwrites fail visibly (blueprint §3). The version guard assumes synchronous
  single-writer transactions (decision 42) — revisit if writers ever multiply.
- **Attachments are real financial data**: receipts/invoices expose genuine spending — the fictional-only
  repo rule extends to them (no real receipts in commits, screenshots, PRs, issues or demo data; demo
  attachments are generated fictional images; staged-diff review before publishing).
- **Backup archive growth** with photos: per-file size limits, honest README guidance on download cadence
  and archive size, no implied offsite automation.
- **Phone camera variability** (capture support, formats, HEIC): manual acceptance on the users' real
  devices is part of Phase 5 exit; OQ9 fallback documented. The attach control offers
  `capture="environment"` and accepts PNG/JPEG/PDF (OQ9 default).
- **Restore is a two-object swap, not one transaction** (decision 78): the database and the documents
  directory are renamed in sequence. Between the two renames a crash leaves the new database with the
  preserved documents directory — the app still starts, and the previous copies remain on disk under
  `.pre-restore-<stamp>` for a manual fix. Recovery instructions belong in the README (next session may
  extend them); the alternative (a copy-then-swap of everything) trades a rare, recoverable window for
  needing twice the disk.
- **First browser run is still owed**: the Playwright suite is written against real selectors and its
  server-rendered expectations were checked against a running dev server, but selectors can still drift
  from rendered behaviour. Until the CI `browser` job is green, no browser evidence exists (blueprint §9:
  never claim a browser run from markup rendering).
- **Missed in-app renewal alerts** if the app isn't opened inside a warning window: mitigated by the 4–5-day
  checkpoint cadence vs 21-day default lead; an email alert channel is a recorded v2 roadmap item
  (decision 24).
- **A chart is easier to misread than a table** (v0.14.0, SPEC §16.7): a drawing invites a glance, and a
  glance can take a projection for a fact or a part-finished week for a slump. Mitigated by construction —
  every chart states its verdict in words above the drawing, carries a reported/projected badge, hatches
  the in-progress period, and ships a table twin with the exact figures. The charts are also reconciled
  against `listPurchases` in `tests/charts-view.test.ts`, so they cannot drift from the history or from
  the Insights tables. The residual risk is editorial, not arithmetic: if a caption ever stops matching
  what the drawing does, the drawing wins the glance.
- **The tracked-commitment list can go stale** (v0.14.0, decision 156): `commitment_category_ids` is the
  household's own definition of "a fixed commitment", so a category added later (a new insurance child,
  say) is not tracked until someone ticks it, and the chart will quietly under-report. Mitigated by the
  Settings list flagging the children the household's schedules already use, and by the chart naming every
  tracked category underneath itself. A future session could surface "untracked categories your schedules
  now use" as a nudge.


163. **Monthly schedules can skip named calendar months, with a deliberately secondary control.**
    The ten-payment-year household case stays monthly: February and March are excluded, not a bespoke
    frequency. Migration `0011_schedule_excluded_months` adds a JSON month-number list (1–12), default
    `[]`, so existing schedules and instances are untouched. Domain and action boundaries reject
    invalid, duplicate or all-twelve selections, sort valid input, and reject non-empty exclusions for
    annual schedules. Switching to annual clears the saved list. Full schedule audit snapshots include it.

    Candidate generation and `nextDueDateAfter` both skip the configured month **before** receipt
    weekend adjustment. No downstream projection gets a parallel cadence implementation: Horizon,
    calendars, charts, upcoming lists and conversion all continue to consume the same instances.
    Next-due search begins at the later of the queried date and active start, so a distant start plus
    eleven exclusions still finds the next payment. Decisions 75/162 stand: edits regenerate today
    onwards, never rewrite converted history or invent past payments; only an earlier start backfills.

    `ScheduleMonths` is shared by recurring Add/Edit and dedicated income Add/Edit. It uses native
    details with **no `open` attribute**, Horizon's exact compact summary classes, a calendar-ordered
    names/“none” summary, and twelve wrapped-label checkboxes in a fieldset with a responsive grid.
    Annual forms do not mount it. It is an occasional exception, not twelve permanently visible fields.
    Tests cover persistence, migration, ten-payment years, forward regeneration, history/backfills,
    validation, income shifts, leap-day clamping, active/cancel bounds, Horizon totals, and browser
    save/reload, native keyboard disclosure/checkboxes and narrow layout.

164. **One codebase, two homes — duplicates leave Overview; transfers live on Accounts & Pots.**
    Confirmed with the household: the phone's first screen is `/` (till home) and the laptop's is
    `/overview` (dense dashboard). Do not build a second app or a second Quick Entry. Overview drops
    Recent entries (Purchases already is the full view), Transfers between pots, Add a pot, Balance
    checkpoint and Recent checkpoints. Phone `/` keeps only available-now, Quick Entry (still opens
    at the till, decision 158), payday projection, due this week, and links to Charts, Purchases and
    Horizon — Recurring is one drawer item, not a home section. The phone drawer leads with Quick
    Entry · Purchases · Horizon · Charts · Overview · Recurring; the rest sit in a second group.
    Desktop's full bar is unchanged.

    Transfers are recorded only in Quick Entry → Move → Between pots. Void and the review list live
    on Accounts & Pots, matching loans/swaps/other, with the same deep-link pattern as `?external=`
    (`/pots?transfer={id}#transfer-{id}`). All Transactions stays read-only; `activity.ts` retargets
    the transfer href. Checkpoints stay immutable; create remains Quick Entry → Balance plus the
    Accounts & Pots form; history is per-pot on that page only.

    Recurring on `lg+`: calendar left, compact projection figures under it; schedules panel height
    matches the calendar card with an inner-scrolling list, Add a schedule pinned under the list,
    renewals under that (beside projection). Phone stacks unclipped. `#schedule-{id}` still lands on
    the row inside the scroller. Decision 74's review-list clause is superseded; the rest of 74
    (money row, projection, due, key dates, month bars, shared `buildEntryData`) stands.

165. **A same-day credit recorded after the checkpoint counts (2026-09-26 field report).** Decision 98
    absorbed every date-only credit that shared a checkpoint's local date, so the estimate could never
    read high on that day. That fixed the £180 bug (record the swap, then checkpoint the cash that
    already includes it). It also dropped the opposite order: checkpoint Natwest at −£443.65, then
    record £1,500 in from Nationwide the same day. Nationwide fell (a debit still counts); Natwest
    stayed on the checkpoint, and Horizon started from the same figure. The household expected
    £1,056.35. Transfers are date-only (the form's date field defaults to today), so instant comparison
    cannot see that the transfer was entered after the count.

    Rule now, refining 98 rather than reversing it: a same-day date-only credit counts when its
    `createdAt` is strictly after the checkpoint's `createdAt`. Recorded before the checkpoint, or with
    no entry time to compare, it is still absorbed — E13 stays fixed, and a second same-day checkpoint
    still cannot double-count a credit already written down. Same-day debits still always count.
    A transfer recorded after both checkpoints is household-net-zero again. Residual, stated in SPEC
    §7.1: if a count already includes money not yet recorded, record that credit before the checkpoint
    or checkpoint again afterwards — a credit written down later is treated as new money. No schema
    change; live rows already carry `createdAt`.

166. **Salary-window planning and one shared low (v0.22.0, 2026-09-26).** The household confirmed
    the £1,000 on the 12th is monthly parental borrowing tracked as expected debt support, not a
    second income schedule. Salary alone ends the payday/till window; support remains flagged inside
    it. No setting, schema or migration; Horizon's decision-150 default stays unchanged. The till and
    Overview now read the payday engine's low rather than a no-inflows subtraction. Weekly spare pace
    floors whole pounds from the positive low divided by weeks to its earliest date, protecting zero,
    not overdraft. No allowance below/at zero or when the low is today. Wording states this is on top
    of planned shop/fuel and spending it all would touch zero. Starting estimates are labelled
    Household total now, never a bank balance. Decision 165 and the £180 case are untouched.

167. **Permanently delete an empty mistaken debt setup (v0.22.1, 2026-09-26).** The household
    accidentally created “Parents” and cannot remove it. They explicitly prefer full deletion, not
    voiding or hiding. Existing code said debts are never deleted; that holds for any debt with
    history. An empty setup with no movement records whatsoever, including voided, is a mistaken
    entry, not history, and may be hard-deleted.

    Safety boundary: hard-delete only when it has no movement records at all, including voided.
    Do not silently cascade-delete financial history. Enforce eligibility server-side, not just by
    hiding a button; guard against a movement being recorded between confirmation and deletion by
    checking inside the same transaction as the delete. Existing debt code explicitly said debts are
    never deleted, so this decision amends that rule deliberately. If deletion of debts with
    movements is needed, clarify separately before extending scope. Do not substitute void/archive
    for permanent removal of an eligible empty setup.

    After deletion it disappears from the list and any debt selectors, and any expected-support plan
    attached to it no longer generates forecast or All Transactions expectation rows. Unrelated
    debts, pot estimates, transactions and outstanding totals remain unchanged. Authentication,
    concurrency (optimistic version) and audit conventions are respected without retaining an active
    debt row merely to simulate deletion. UI explains confirmation clearly and identifies the
    counterparty. Tests cover empty delete, cancel leaves untouched, expected-support plan deleted
    with its projections gone, live/voided movements block deletion via UI and direct action, and
    unrelated data unchanged. No schema change; deletion is a row delete with audit.

168. **A loan awaiting its first payment must not say “settled” (v0.22.1, 2026-09-26).** Reported
    example: Martin & Sue (we owe) settled, no movements yet — bridging pending estate settlement.
    This is a genuine borrowing arrangement, but its first payment has not arrived. Zero movements
    and zero balance do not mean a loan has been repaid. Source: `debtBalanceLabel` in
    `src/lib/records/debts.ts` returned `settled` for any zero balance. The balance resolver already
    exposes `movementCount`.

    Use an honest distinct status, preferably “Awaiting first payment”, for an unstarted borrowing
    setup. Use suitable equivalent wording for money the household intends to lend — “Awaiting first
    loan” for `they_owe`. Reserve “Settled” for a loan with actual movement history whose
    outstanding amount is zero; preserve outstanding and overpayment labels. Consider voided-only
    history explicitly: with all movements voided there is no effective borrowing/lending, so the
    displayed state should be unstarted, although deletion remains blocked by retained history under
    decision 167's safety boundary. Reuse existing effective-movement semantics rather than inventing
    different balance arithmetic.

    No first payment is invented and no pot estimate is increased. Expected support still appears in
    projections as expected borrowing where configured, never received income. First borrowing/lending
    moves the status to outstanding. Full repayment shows Settled; partial repayment stays
    outstanding; overpayment remains distinguishable. Relevant lists/pickers use consistent wording.
    No schema change; `debtBalanceLabel` now takes `movementCount` and returns awaiting when zero.

169. **Category rename picker selects the wrong visible category (v0.22.1, 2026-09-26).** Settings →
    Category tree → Rename a category: selecting a parent or child made the dropdown display the
    first parent instead of the chosen category. Concrete mismatch in `CategoryTreeEditor`,
    `src/components/settings-forms.tsx`: option values are `parent:<id>` or `child:<id>`, but the
    controlled select value was only `String(categoryId)`. After selection, no option matched that
    bare ID, so the browser displayed the first selectable option while hidden `categoryId` and
    `version` still referred to the originally selected category.

    Fix the value/state mismatch: visible selection, submitted ID and optimistic version must always
    agree. The picker also serves retirement — check that path too, keep parent retirement prohibited.
    The fix stores `categoryKind` (`parent` | `child`) alongside `categoryId`, makes the select value
    `${kind}:${id}`, and keeps version in sync when the tree updates (save, then rename again without
    refreshing must not hit stale version). Apply hydration-ready conventions: `data-category-ready`
    and `inert` until React has hydrated, with `waitForCategoryEditor` in e2e support, matching the
    till and filters pattern that prevents a `selectOption` before hydration from silently desyncing.
    Tests assert selection and persisted result, not just success message.

170. **A seeded due day is a date the whole browser suite depends on (v0.22.1, 2026-09-27).** The
    `browser` job went red on `e2e/transactions.spec.ts` — "a converted standing order keeps its
    code (SO) and links back to its schedule" — and stayed red across four pushes. Nothing in the
    app was wrong. The seeded "Phone plan" standing order was dated `Math.min(dueDay + 5, 28)`, i.e.
    the **28th of the month**, so its newest converted payment was the 28th of the *previous* month.
    All Transactions shows the last 30 days (`transactions/page.tsx`: `addDaysLocal(today, -29)`,
    inclusive), and the 28th of a 31-day previous month is exactly **30 days** behind the 27th — one
    day outside the window. So on the 27th of January, February, April, June, August, September and
    November the row the spec looks for **does not exist**, and the suite fails on a green codebase.
    It failed on 2026-09-27 for precisely that reason.

    Proof, before any change: the same spec fails identically on pristine `main` @ `0f7070f` (run in
    a `git worktree` with its own `npm ci`, SANDBOX entry 14), and a no-browser probe over the seeded
    database — `ensureScheduleState` + `listPotActivity` on the default window — reports one
    Phone plan row when asked for 2026-09-26 and zero when asked for 2026-09-27. The next conversion
    cannot rescue it either: `e2e/desktop.spec.ts` moves this schedule to the 21st earlier in the
    same run, which deletes the upcoming 28th, and a cadence edit regenerates only the forward window
    (decision 162) — so it never invents the past instance the spec's comment claimed it back-filled.
    That stale comment is corrected here too; it is what made the failure look like a regression.

    Rule adopted: **seed dates that a spec asserts on must be relative to today with a guaranteed
    margin, never a fixed day-of-month.** `scripts/e2e-seed-dates.ts` exports
    `recentMonthlyDueDay(todayIso, daysBehind, avoid)`, which returns a day 1–28 whose most recent
    occurrence is `daysBehind` (up to `daysBehind + 7`) days behind today on every day of the year —
    and never a day listed in `avoid`, because `desktop.spec.ts` moves this schedule to the **21st**
    and asserts the reported next-due date actually changed. Phone plan is seeded with
    `recentMonthlyDueDay(todayIso, 6, [21])`, so its newest conversion is always about a week old.

    BroadbandCo (dd) is deliberately left as it was — due in two days, because the key-date warning
    specs need something imminent. Its last conversion can therefore sit just outside the 30-day
    window; no spec asserts on it, and that trade-off is now written down in the seed itself.

    The rule is guarded, not trusted: `tests/e2e-seed-dates.test.ts` walks **every local date in
    2025–2028** (leap year included) and asserts the seeded day always lands a conversion inside the
    window, keeps the gap between 6 and 13 days, never returns the 21st, and returns a day every
    month has — plus the 2026-09-27 regression as a worked example. A future seed edit that
    reintroduces a date bomb now fails `npm test` in milliseconds instead of failing the browser suite
    on one particular day of the month, months later, for whoever happens to open a pull request then.

171. **Credit cards are net liabilities, not liquid pots (v0.23.0 scope, 2026-09-27).** Add generic
    credit-card pot support for one or more cards, with no real provider, limit, balance or offer details
    in tracked docs, fixtures or seed data. Purchases charged to a card are spending; bank-to-card
    payments are transfers, not spending. The household headline remains net of card debt, with total
    owed shown as separate context.

    The household selected distinct projection semantics: payday, Horizon, overdraft warnings and
    §7.5 transfer-shortfall watches use bank and cash pots only. Card debt and card-assigned scheduled
    commitments/receipts/expected inflows cannot claim a bank overdraft or trigger a bank-pot transfer
    watch. Card credit limits and near-limit thresholds are separate usage context, never overdraft
    terminology. This intentionally supersedes §7.2/§7.6's former use of the all-pot household sum as
    the projection starting point; that all-pot sum remains the net household headline.

    Each card may store its usual due day (clamped in short months), a configurable reminder lead
    (default three days), the provider-statement minimum and exact due date as a paired manually copied
    snapshot, and the actual promotional end date. In-app key-date alerts prompt statement review and
    promo-term review; the app does not calculate issuer minimums, assume full repayment, schedule or
    send payments, verify provider receipt, assume a promo duration, calculate interest, or add
    card-specific interest/repaid totals. The later non-binding cash-flow scenario tool remains out of
    scope. Multiple cards are supported generically. No card/provider terms are included in demo or
    test data; tests use invented neutral labels and dates.

    Implementation uses pot settings plus migration `0012_credit_card_pots`; product rules are in
    SPEC §§4, 7, 8, 22.3 and 24. Test the signed estimate/transfer behavior, distinct net-vs-liquid
    figures, card exclusion from every liquidity projection and warning/watch path, manually supplied
    statement dates/minimums, month-end clamping, promo alert and inability to verify payment. Recheck
    migration snapshot/journal consistency and all release gates before publishing.

172. **Migration journal stamps are ordering keys; v0.23.0 silently skipped migration 0012 on
    every upgraded database (2026-09-27).** drizzle-orm's better-sqlite3 migrator applies a journal
    entry only when its `when` stamp is newer than the single newest `created_at` recorded in
    `__drizzle_migrations` (`ORDER BY created_at DESC LIMIT 1`). The journal's 0011 entry had been
    hand-stamped with the round, future-dated 1790600000000 while 0012 carried its real generation
    stamp 1790506141836 — numerically smaller — so databases upgraded from v0.20.0+ skipped 0012 at
    startup and failed on any pots query with `no such column: credit_card_payment_day_of_month`.
    Fresh installs applied everything, so CI, the Docker smoke and the browser suite were all
    green; the upgrade path was never tested. No data was lost.

    Rules adopted: journal stamps must be strictly increasing and never future-dated
    (`tests/migrate-journal.test.ts`); prefer drizzle-kit's real-clock stamps, and a hand-stamped
    entry must take a real past instant strictly between its neighbours; a shipped migration's SQL
    is never edited (drizzle records its sha256), while re-dating an ordering stamp is sanctioned
    only alongside a repair that converges fielded databases. The repair re-dates recorded rows to
    the journal's stamps by content-hash match before the migrator runs — implemented twice by
    necessity (production CJS `scripts/migrate-repair.cjs`, dev TS `src/lib/db/migrate-repair.ts`),
    with a parity test. The upgrade path is tested against a real v0.22.1-era database through the
    production runner (`tests/migrate-upgrade.test.ts`), and both CI's Docker job and the Publish
    workflow upgrade previously published images on the same volume and require every journal entry
    applied exactly once before anything merges or is pushed. 0011 is re-dated to 1790504000000 in
    this release; migration SQL files are untouched.

173. **A release is one pull request; the Publish workflow creates the GitHub release
    (2026-09-27).** The Arena session ends the moment its release PR merges, so the historical
    sequence — merge, publish, then update `HANDOFF.md` with the verified facts and create the
    GitHub release from a new session via a second, documentation-only PR — always needed a fresh
    session for work the finishing session could have done beforehand. The household retired that
    pattern after v0.23.0's PR #83 sat unmergeable; it was closed unmerged and its verified facts
    folded into `docs/RELEASE_NOTES_v0.23.0.md`.

    The reworked process: all documentation — release notes, handoff block, blueprint and plan
    updates, all five version places — lands in the single release PR before merging; the notes
    document's first line must be `# Release notes — vX.Y.Z — <subject>`; the Publish workflow
    prepends the verified facts (published date, merge commit, image tags, registry digest, run
    link) and creates the GitHub release marked Latest, refusing to publish when the document is
    missing or malformed; post-merge verified facts are recorded by the next working session in
    `HANDOFF.md`, never by a dedicated PR. `docs/RELEASE_PROCESS.md` is rewritten accordingly.

174. **A successful save hands the form back empty; Save is greyed out until the next entry is
    complete (2026-09-27, v0.24.0).** The household's own words, at the till: *"for the breadcrumbs
    from the purchase just saved to be cleared so that both entry forms (swipe screens 1 & 2) are
    reset and become blank once more. Also, once we have pressed Save on the original purchase, can
    that button be greyed out, as logically no save should be possible at that point until the user
    has completed details of the 'Add another' new purchase."*

    Two asks, one change: when a save succeeds the entry fields clear, so `balanced` is false, so the
    existing `saveBlocked` rule and the existing disabled styling grey Save out on their own. No
    "saved" flag, no new state, no new button.

    What clears on a successful save: supplier, amount, date, note (and the note field closes behind
    "+ Note" again), and the split lines back to one fresh default line with the amount-following
    restarted. **Pot and Paid by are sticky** — the household chose to keep them, matching what
    "Add another" has always done, because the same pot and the same person usually pay for the next
    purchase. The Fuel tab does the same, and keeps vehicle and paid-by sticky for the same reason;
    its "Filled to full" tick resets to off with everything else, since a tick left behind would
    measure the next fill as a full tank (decision 147). Balance checkpoints are deliberately out of
    scope: a repeated checkpoint is a different question, and the household's ask was about
    purchases.

    Shape of the change, in `src/components/quick-entry.tsx`:

    - The effect is keyed on the `state` **object**, never on `state.message`. Two identical
      consecutive saves carry the same message string ("Purchase saved: £12.00."), so a
      message-keyed effect would not fire for the second one and the form would stay dirty. Every
      action result is a new object; clearing twice is idempotent, so a StrictMode double-invoke is
      harmless. `data` is deliberately **not** a dependency: a revalidating server action hands the
      island a fresh props object, and re-firing on that would wipe the *next* entry half-typed.
    - **Errors clear nothing.** `status === 'error'` keeps every value so the household can correct
      and retry. A save that trips the duplicate notice is still `'ok'` (the purchase *was* saved)
      and resets too; the notice and its "Void this copy" read `state` and are untouched. Server-side
      duplicate detection is unchanged and stays as it is — what changes is that the accidental
      double-tap, which used to write a real second purchase on the values just saved, becomes
      unreachable.
    - **The save moves no focus and no panel** (decision 151: focus moves only as the answer to
      something the household did; the save is not that, and an uninvited phone keyboard is exactly
      what 151 exists to prevent). The household confirmed this over the recommended alternative of
      sliding back to card 1 with the supplier focused. "Add another" keeps that job.
    - **"Add another" is offered only while the next entry has not begun** — the household's choice,
      against keeping it up for as long as the success message shows. "Pristine" is computed from the
      form's own typed values (supplier, amount, date, note, split amounts and line count), so it
      needs no state: after a save the button is there, and it disappears the moment the household
      starts typing the next purchase, instead of wiping a half-typed entry under their thumb. The
      stickies (pot, paid-by, category, target) are deliberately *not* part of the test — changing a
      category is not "starting an entry", and the dots and the swipe are always there to get back to
      card 1. The success message stays on screen while the next entry is typed, as it already did
      after "Add another".
    - Immediately after a save, "Add another" is an idempotent no-op for the values and still does
      the slide to card 1 with the supplier focused (decision 137). It remains the start-over
      shortcut for a form that was *not* saved.

    Tests: `e2e/home.spec.ts` — the unbalanced-split check moved *before* the save (it used to
    assert the old sticky values after it) and the post-save half now asserts the blank form and the
    disabled Save; "Add another starts the following over" became "saving clears the form, and Add
    another goes back to the supplier"; two new specs cover the full post-save state (every field,
    the stickies, the still-visible confirmation, the still-offered button, nothing focused, Save
    disabled, then enabled again once the next entry is complete) and the identical-consecutive-save
    case. `e2e/fuel.spec.ts` gains the same for the Fuel tab. No server action, schema or migration
    changes; `npm test` is unaffected.

175. **Tasks: a real follow-up model, labelled dates, and what "prompt me" means (2026-09-27,
    v0.25.0).** The defect: a follow-up dated 2026-11-01 on a supplier call did nothing. The
    Suppliers page's "Promised follow-ups" and Contracts & Renewals' `upcomingSupplierFollowUps`
    both filtered to `>= today`, so on 2 November the promise vanished; the supplier card went on
    printing a bare, unlabelled "Follow up 2026-11-01"; nothing could complete or reschedule it.
    The household asked for the task model and **not** a bell.

    **The model.** A first-class `tasks` table (migration `0013_tasks_and_supplier_documents`):
    title, optional detail and due date, a *subject* (`household` | `supplier` | `vehicle` |
    `purchase` + id; `(subject_kind = 'household') = (subject_id IS NULL)` is a CHECK), an optional
    `related_interaction_id`, creator and times, completion (`completed_at`/`completed_by` paired by
    CHECK, optional note) and `version`. `src/lib/records/tasks.ts` copies the renewals shape:
    create / edit / complete / reopen, each versioned (`VersionConflictError` on a stale version) and
    audited (`task.create|edit|complete|reopen`); tasks are never deleted; **reopen is allowed** and
    audited, and a closed task must be reopened before it can be edited. Subjects are validated on
    write (the row exists; a voided purchase takes no new task; a related interaction must belong to
    the same supplier); `subject_id` carries no FK because it is polymorphic, and nothing in the app
    deletes suppliers, vehicles or purchases. Ordering is overdue → today → later → undated via
    `daysBetween`, and the state is always words ("Overdue by 3 days", "Due today", "In 12 days",
    "No due date") — colour is never the only signal (SPEC §16.7). **Not** `targetKind`/`targetId`:
    `targetLabel()` silently answers "household" for a kind it does not know. A new pure
    `subjectLabel()` beside it degrades to the bare kind when the subject has gone (a voided purchase
    reads "purchase", marked voided) and never returns "household" for an unknown kind. **No
    recurrence:** renewals repeat annually and key dates cover contract ends and card dates.

    **Migration 0013.** Each `supplier_interactions.follow_up_date` row with a value becomes an open
    task — title "Follow up with <supplier>", detail = the interaction's summary, due = the date when
    it is a real `YYYY-MM-DD` (else undated rather than dropped), creator and time copied, linked to
    the interaction — with one `task.migrate` audit entry each (actor `system`); then the column is
    dropped (the household has one such row). The same migration rebuilds `attachments` on the 0009
    pattern with `supplier_id` and the exactly-one-owner CHECK widened to three owners (its FKs are
    now no-action rather than 0009's cascade — nothing deletes an owner). Stamp from drizzle-kit's
    real clock (decision 172); upgrade-tested from a v0.24.0-shaped database through the production
    runner (`tests/migrate-upgrade.test.ts`), idempotent on a second start.

    **Where tasks live.** The supplier interaction form's **Follow up by** date (and optional words)
    creates the task in one transaction with the interaction (`addSupplierInteraction` now returns
    `{ interaction, followUpTask }`; a failing task insert takes the interaction with it). The
    interaction log labels every line — "Interaction:", "Outcome:", "Logged by:", "Follow up
    by:" — with dates in words from `formatShortLocalDate()` (plus the year when it is not this
    year, `formatShortLocalDateWithYear()`), replacing raw `toLocalDateString` output. The card gains
    a Tasks section (a checkbox per open task, add, reschedule/edit/close-with-note, done recently
    with Reopen) and a header badge "2 open tasks · 1 overdue"; the Suppliers banner and Contracts
    "Follow-ups you promised" read open supplier tasks, overdue first. A purchase row gains "Add a
    task" ("Chase the refund"); **case tracking** for purchases is a later decision that would grow
    from `tasks`. `/tasks` (desktop bar and the drawer's More group) shows "Your tasks" grouped with
    checkboxes, and **"The app has noticed"** — derived, links only, no checkboxes: key dates in their
    window (`getKeyDateAlerts()` + `keyDateMessage()`, new `keyDateHref()`), fuel fills missing litres
    or mileage and a run of fills with no full tank (`getFuelEconomyView()`). Supplier links use
    `supplierCardHref()` (no second resolver); purchases link to Purchases filtered to their day with
    `#purchase-{id}`; vehicles to a new `#vehicle-{id}` on Insights; renewals to a new
    `#renewal-{id}` on Contracts & Renewals.

    **Supplier documents (resolves OQ10).** `attachments.supplier_id`, the upload action accepts
    exactly one of purchase / income record / supplier, the card has a Documents section; PDF, JPEG
    and PNG only — no `text/plain`.

    **Not this release:** the bell/count badge, purchase case tracking, email/push/browser
    notifications (decision 19, SPEC §21.2/§22.3), anything that moves money, and the stale-pot
    noticed item (OQ14 — 7 or 14 days, awaiting the household). The household skipped the session's
    questions and asked the work to carry on, so two calls were made without their answer and are
    recorded here: the stale-pot item is **excluded**, and supplier attachments **ship** in this
    release's migration.

    Tests: `tests/tasks.test.ts` (due words, ordering, completion, stale-version refusal, reopen,
    edit rules, voided subject, the interaction→task transaction including a forced rollback, derived
    items), a 0013 block in `tests/migrate-upgrade.test.ts`, supplier documents in
    `tests/attachment-pipeline.test.ts`, supplier-details follow-ups as tasks, and an `e2e/tasks.spec.ts`
    project before `backup` (create → tick → survives reload → reopen; a follow-up promised on a call
    becomes a task on the card; a purchase task links back to its row).

176. **The bell — an in-app "needs attention" prompt, with personal tasks (2026-09-27, v0.26.0).** The
    household asked for a bell icon that shows what needs attention now. The count is **overdue or due
    today tasks** (filtered by who they are for, see below) plus **key-date alerts** in state **today**,
    **past** or **rolled-awaiting-review**. Not counted: tasks coming up, undated tasks, and key dates
    merely inside their 21-day window — otherwise the badge would stay lit for three weeks.

    **Personal tasks (user clarification).** Default is both users see the bell count for tasks regardless
    of who created. There is a method in the UI to pick "Only me" when adding or editing a task. That
    stores `tasks.assigned_to` (lower-cased email, null = household). A personal task only counts in that
    person's bell and only appears in that person's bell lists; it stays visible to both on `/tasks` and on
    its subject card, labelled "Only for <name>" (name from `people.email` when linked). The field is
    validated (must contain @) and lower-cased; empty means everyone. No "assign to Sam" picker in this
    release — "Only me" covers the stated case ("Query brake disc invoice on Mercedes" only for one of us).

    **Bell UI.** `SiteNav` (client, rendered by `layout.tsx` with no props, on every page including
    `/unauthorized`) now holds a `Bell` button: desktop at the right-hand end of the bar, phone in the top
    bar next to the menu button, hidden when signed out (401 from the API) or on `/unauthorized`. It is a
    `<button>`, not a link inside `nav[aria-label="Pages"]` (the phone e2e reads that nav's links in order).
    Accessible name carries the count in words ("Needs attention: 3 — 2 overdue, 1 due today" or "Nothing
    needs attention") plus "2 new since you last looked" when there is a new dot. Zero means no badge; the
    new dot is a separate small dot, not part of the number. Clicking opens a panel: laptop popover, phone
    sheet under the top bar; `aria-expanded`, Escape closes and returns focus, click outside closes. Panel
    groups: Needs attention (counted items, tasks reuse `TaskCheckbox`/`TaskDueBadge` + subject link, key
    dates use `keyDateMessage`/`keyDateHref`), Coming up in next 7 days (tasks due 1..7 days + in-window key
    dates, listed not counted), footer "N things the app has noticed →" → `/tasks#noticed-heading` and
    "All tasks →" → `/tasks`.

    **Freshness (main trap).** Root layout persists across client navigation, so a count computed in
    `layout.tsx` would go stale after navigation, at midnight, or when the other person changes something.
    Approach: `GET /api/attention` (`dynamic = 'force-dynamic'`, `cache: 'no-store'`, 401 JSON when signed
    out) returns counts and panel items; client `Bell` fetches on mount, pathname change, `visibilitychange`
    (tab becomes visible), `sf:tasks-changed` window event (task forms dispatch after success) and every
    5 minutes while visible. Ticking a task updates the bell without reload (e2e proves it).

    **Per-person "since you last looked".** Task activity by the other person since this person last opened
    the bell. Source: `audit_entries` where `entity='task'` and action create/complete/reopen, actor ≠ me
    (case-insensitive) and ≠ `system` (0013 migration), `createdAt` > my last-seen. Worded with names:
    "Sam added …", "Sam ticked …". Cap 20. Stored per person on server so phone and laptop agree: new table
    `bell_seen (email TEXT PRIMARY KEY, seen_at INTEGER NOT NULL)` — lower-cased email, UI state not a
    record (not audited, same as theme cookie, called out in SPEC). Opening panel marks seen via
    `POST /api/attention/seen`, fired on open; the new list is worked out before updating `seen_at`, so it
    stays visible while open. Person with no row yet looks back 7 days at most.

    **Pure rules:** `attentionView(tasks, alerts, auditRows, me, seenAt, today, now)` — unit-tested
    (`tests/attention.test.ts`): what counts and what doesn't, own/system excluded, seen_at respected,
    7-day look-back, 20-entry cap, assigned_to filtering. Route is thin wrapper around it, plus
    `bell_seen` helpers.

    **Migration 0014** (`bell_and_task_assignee`): `bell_seen` table and `tasks.assigned_to` column + index,
    via drizzle-kit real-clock stamp, strictly increasing, never in future (decision 172). Upgrade-tested
    from v0.25.0-shaped DB, idempotent.

    **Housekeeping:** OQ14 deferred by household (they will road-test and decide in a few weeks) — row
    updated, not built. v0.25.0 verified post-merge facts recorded at top of HANDOFF.md (decision 173).

    **Not this session:** email/push/browser/sound notifications (decision 19), service worker (122–123),
    full "my tasks only" filter on Tasks page (later decision), stale-pot item (OQ14), anything that moves
    money.

    Tests: `tests/attention.test.ts` (counts, assigned_to, seen_at, cap), `tests/tasks.test.ts` assigned_to
    create/edit, migration 0014 block in `tests/migrate-upgrade.test.ts`, `tests/backup-restore.test.ts`
    count 14→15, colour-tokens fix (text-white → text-fill-ink), e2e `bell` project before `backup`
    (badge words, add overdue → +1, tick → back without reload, panel groups/Escape/focus, phone layout
    bell in top bar and drawer's link list unchanged, Sam's seeded task shows under "Since you last looked"
    and after opening and reloading is no longer new).


177. **Closable documents and automatic split remainder (2026-09-28, v0.27.0).**

    Defaults chosen from the household's paste-ready brief without another question: native in-app
    modal instead of another route (preserves page/scroll), and £100 minus £80 means £20 on Line 1.
    The contradictory older "+ Add split stops following" sentence is superseded: adding/removing
    splits preserves auto remainder; manually editing Line 1 takes over until a fresh entry.
    Assign remaining on Line 1 is also takeover; on another line it recalculates the auto remainder.

    AttachmentViewer uses the authenticated uncached API, a revocable blob URL, native dialog focus
    trapping, Close/Escape/backdrop, focus return, background scroll lock, filename/size, download,
    conditional native file sharing, image preview and native PDF iframe with fallback wording.
    No new tabs, schema, dependency or offline cache. Printing uses the downloaded/native PDF viewer.
    API failures now explicitly carry private, no-store as well as successful responses.

    Pure remainderLineAmount uses integer pence, treats blank extra drafts as zero, holds on invalid
    drafts, clears on blank/zero Total, and clamps over-allocation to zero with a warning. Existing
    exact-total and positive-line validation remains. Tests cover phone/desktop, manual takeover,
    removal, extra splits, over-allocation, precision and invalid drafts. Viewer tests cover image/PDF,
    Close/Escape, focus, scroll, API cache policy and a failed load. Full suite also exposed an old
    supplier-suggestion assertion tied to seed ordering; it now checks a recent option exists before
    testing the specific filtered matches.

    Single-pass release continues under RELEASE_PROCESS.md, with local Playwright via SANDBOX.md
    entry 8; temporary config removed before commit. No new open question (next available remains OQ15).

    **Superseded in part by decisions 191 and 192:** the PDF is drawn in the app by pdf.js (decision 192), inside a full-screen layout with the actions in a footer (decision 191). The no-PDF.js rule was reversed by decision 192, with the household's approval.

178. **Checkpoint cash at the till; pots gain an owner; cash cards lose the overdraft fields; the pots page leads with recording (2026-09-28, v0.28.0).**

    The household's brief, answered in one conversation: they reach for cash checkpoints far more
    often than expected, so the till needed a shortcut; the pots page should lead with recording;
    cash pot cards should not show overdraft/threshold datapoints; and the page label should say
    what the page now does. Chosen from the options offered (household picked explicitly): the
    person→pot link lives **on the pot** as an optional Owner — the vehicle-Owner pattern — rather
    than a per-person setting or no link at all, because the project never guesses from labels
    (v0.9.0) and only an explicit link can make the card "open my pot". No-owner fallback: a
    cash-pots-only select (household's pick over hiding the card). Label: "Accounts, pots &
    checkpoints" (eyebrow) / "Accounts, Pots & Checkpoints" (nav and prose).

    Migration 0015 is drizzle-kit generated (`owner_person_id` nullable FK to people) with the
    cash-pot normalisation (`UPDATE … SET limit/threshold = NULL WHERE kind='cash'`) added before
    shipping — the 0013 rule only forbids changing a *shipped* migration. The domain applies the
    same rule on every write: a cash pot's limit/threshold are null by definition (the shape
    card settings already use), and an owner must be an existing person. editPot clears
    limit/threshold when the kind becomes cash; the UI hides the fields for cash but converting a
    kind needs a second edit to set a limit — deliberate, stated on the form.

    The till card is a disclosure between the Quick Entry heading and the description (the
    household's requested placement), not a fifth tab: locked to the signed-in person's single
    owned cash pot (shown as a name + "your cash pot" chip + last-counted age, never a stale
    amount — §15.1 stands), else a cash-only select. A save clears the amount (decision 174's
    double-tap rule), opens nothing, focuses nothing (decision 151), and revalidates in place.
    e2e grew a `cash-checkpoint` project (runs before backup) covering lock, save-in-place, phone
    header, page order, cash-card fields and the no-owner fallback through the real Edit pot form.

    No new open question (next available remains OQ15).

179. **Overview panel names link to the Purchases behind their figures (2026-09-28, v0.29.0).**

    The month-to-date "Spending, by parent" names are real links to `/purchases?categoryId=<live
    parent id>&from=<first of this month>&to=<today>`. IDs come from the live `categoryTree(db)`, not
    names baked into code; Purchases already expands a parent to its children (`childrenOfParent`).
    Vehicle names in "Running costs" link to `/purchases?targetKind=vehicle&targetId=<vehicle id>&from=<rolling12From>&to=<today>`.
    Both windows are pinned to the figures (chosen default: yes), rather than inheriting Purchases'
    last-30-days default. Anchors keep the category or vehicle name as their accessible name. These
    are navigation-only: no calculation or counted-record rule changes. Desktop browser coverage
    verifies the links and dates and follows a parent-category link into the filtered list. No schema
    change or migration; next open question remains OQ15.

180. **Theme-aware depth for the shared UI (2026-09-29, v0.30.0).** The household agreed to add
    tastefully implemented gradients and shadows after describing the UI as too flat. The chosen
    direction is restrained: a broad, faint accent wash on the page canvas; a soft accent gradient
    and clearer figure hierarchy on the household-total card on `/` and `/overview`; slightly more
    legible shared card/header elevation; and a subtle hover lift only on the home-page destination
    links. Respect reduced-motion preferences and provide a visible keyboard focus ring.

    **Theme contract:** keep all visual colour inside the existing token system. The global canvas
    and featured gradient use `--color-accent-*` and `--color-surface`; the shadow utilities use
    theme-derived `--color-till` and `--color-till-ink`, not a fixed black. The 28 generated themes
    remain unchanged. No gradients or shadows signal financial status; no data, calculation,
    navigation, schema, migration or dependency changes. Unit/theme guards, a light/dark browser
    assertion on the actual Overview card, and the complete Playwright suite cover the treatment.
    Release is v0.30.0 so the household can take a backup and Force Update after publish; OQ15
    remains open.

181. **Projects: the Project Costing & Supplier Optimiser, Phase 1 (2026-10-01, v0.31.0).** The
    household asked for a cross between a project budget and a multi-supplier costing utility for
    future purchases — a bill of materials down the side, suppliers across the top, quotes in the
    cells, and delivery rules that know one fee covers a whole order. Three use cases were agreed;
    DIY/home improvement first (the garden fence), holiday packages and car/TCO comparisons later.
    **One costing matrix, two ways of totalling** (decision taken up front so later phases need no
    schema rewrite): rows `project_items`, columns `project_suppliers`, cells `project_quotes`
    (UNIQUE per item+supplier), and `projects.project_mode` = `mix_and_match` (pick one cell per
    row; group by supplier; apply delivery rules) or `compare_options` (columns are whole
    candidates; vertical totals by `cost_frequency` — Phase 4). `project_items.cost_frequency`
    (`one_off`/`annual`/`monthly`) ships dormant for the same reason.

    **Schema** (migration `0016_projects`, drizzle-kit generated from `src/lib/db/schema.ts`):
    integer pence throughout, timestamp_ms instants, `version` on every mutable row, audit entries
    in the same transaction on every write — planning records follow the money records' house
    rules without touching pots/purchases/estimates/Insights. Delivery per supplier:
    `delivery_fee_pence` charged once per used supplier, `free_delivery_threshold_pence` (subtotal
    ≥ threshold → £0), `click_and_collect_available` + `fulfilment_choice` (`collect` → £0;
    choosing collect requires the availability flag). Quote cells carry inc-VAT `unit_price_pence`
    or pack-only pricing (`pack_size`+`pack_price`; packs = ceil(qty/size)), `product_url`,
    `in_stock`, notes. `project_suppliers` stays separate from the §21 contact book (OQ-P1 asks
    whether to link them later).

    **Pure module** `src/lib/projects/costing.ts` (integer pence, no I/O — the single source of
    truth for Phase 2's optimiser to reuse): line costs with pack rounding, `deliveryCost`
    (collect / free-threshold / free / charged + "£X away" shortfall), `orderBreakdown` (one group
    per used supplier, one delivery evaluation each), `budgetComparison`, and the `addVatPence`
    "+20% VAT" typing helper (half-up, exact). Domain `projects.ts` (CRUD + the cell click;
    selection requires a live quote; deleting a quote clears the selection; deleting a supplier
    cascades its quotes and clears selections; delete is allowed and audited — OQ-P2), view
    `projects-view.ts`, and the fictional **“Back Garden Fence Replacement”** demo
    (`src/lib/projects/demo.ts`, shared by the e2e seed and `scripts/seed-projects-demo.ts`).

    **UI:** `/projects` (list + start-a-project) and `/projects/[id]` — suppliers & delivery bar
    (add/edit/delete with delivery rules and the collect choice), the clickable costing matrix
    (cell = select; empty cell = inline quote form with the +20% VAT helper, pack fields, product
    URL; "No supplier" column clears; per-row edit/delete), one quote-edit panel under the matrix,
    and the supplier-grouped Shopping List &amp; Order Breakdown with the Grand Total vs
    `target_budget_pence`. `compare_options` projects show an honest "arrives in a later phase"
    note. Nav (bar + drawer) gained Projects; the two e2e nav lists were updated to match.

    **Gates:** `npm test` **618 passed** / 147 suites (32 new in `tests/projects-costing.test.ts`
    and `tests/projects.test.ts`, incl. the figure-exact fence scenario: Jewson £431.50 + Timber
    Yard £514.00 + Wickes £128.00 materials, £10.00 delivery, £1,083.50 grand, £116.50 under the
    £1,200 budget) · `typecheck`, `format:check`, `themes:check`, `build` clean ·
    `npm audit --omit=dev` zero after `npm audit fix` moved `next` **16.3.5 → 16.3.8** (new
    critical advisory GHSA-vcvr-r3jv-pc5j, RCE in `next/og` — lockfile-only change within the
    existing `^16.3.5` range; full suite + build re-run green on the patch). Playwright **113
    passed** locally via SANDBOX entry 8 (the bell's drawer-link count moved 14→15 for Projects).
    The run on 1 October also exposed a pre-existing month-boundary honesty slip in the personal
    spending chart: the table twin linked every cell while the stacked drawing skips zero segments,
    so on the first of a month the table offered drill-downs the chart does not draw — zero cells
    now print their £0.00 unlinked ("the table says what the chart draws"). The two
    `__drizzle_migrations` counts in tests/backup-restore.test.ts moved 16→17.

    The feature plan and its session status log live at the repo root:
    `PROJECTS_IMPLEMENTATION.MD` (rule: that file **and** the repo docs are refreshed just before
    any PR, every session). Phase 2 (the cheapest-combination optimiser) is next; open questions
    OQ-P1–P3 are listed in `PROJECTS_IMPLEMENTATION.MD` §8. No change to the money pipelines,
    backup format or the release loop.

182. **Projects Phase 2: the Cheapest Combination optimiser (2026-10-01, v0.32.0).** Pure `cheapestCombination(...)` in `src/lib/projects/costing.ts`, an
    `applyProjectSelections` domain function, an `applyProjectPlanAction` server action, the
    optimiser bar on `/projects/[id]` (`src/components/project-optimiser.tsx`) and SPEC §27.6. No
    schema change, migration or dependency.

    **Decision — the solver is two-stage, deliberately not just "2^S − 1 subsets".** The plan
    (PROJECTS_IMPLEMENTATION.MD §7) said: enumerate supplier subsets, buy each item from its
    cheapest member. That is kept as stage 1, but it provably misses the case the same paragraph
    asks for — *pay slightly more on one line at B so B crosses its free-delivery threshold while A
    is still needed for a line only A stocks* (a test pins it: £93.00 vs the subset answer
    £100.00). So stage 2 is an exact branch-and-bound over every item→supplier assignment, seeded
    with stage 1's best and bounded by the cheapest-possible remaining materials; it proves
    optimality, and a 400,000-node budget keeps a freak project from hanging the page — if the
    budget is hit the result says so (`exact: false`) and the bar shows an honest caveat. Past 12
    suppliers stage 1 tries only the full set and each single supplier. Correctness is checked
    against an exhaustive search on 150 random matrices (sparse cells, out-of-stock quotes,
    thresholds, Click & Collect).

    **Decision — OQ-P3 implemented as proposed:** out-of-stock quotes are skipped, never ordered;
    an item with no in-stock quote is *uncoverable* and is reported and left out of both plans.
    The household's Click & Collect/delivery choice is an input the optimiser respects, not
    something it flips. Savings are quoted against the manual selection only when that selection
    covers every item the plan buys — otherwise the bar says the totals are not like-for-like.

    **Decision — Apply never trusts the browser.** The form posts the plan kind and the total it
    showed; the server recomputes the plan and refuses (and revalidates the page) if the total
    differs. One transaction, version bump per changed row, one `project.apply-plan` audit entry
    on the project keyed by item id; re-applying is a no-op with no audit noise.

    **Gates:** `npm test` **637 passed** (19 new in `tests/projects-optimiser.test.ts`, incl. the
    figure-exact fence results: cheapest split £1,061.50 — Jewson £904.50 free delivery + Timber
    Yard gravel boards £142.00 + £15.00 delivery — vs the £1,083.50 manual selection, and best
    single supplier Wickes £1,152.00) · `typecheck` and `format:check` clean · new Playwright spec
    `e2e/projects.spec.ts` (own `projects` project, before `backup`) passed locally via SANDBOX
    entry 8: the bar, Apply single → Apply split, and persistence across a reload. The release
    gates (`build`, `themes:check`, `npm audit --omit=dev`, the full Playwright suite) are recorded
    in `docs/RELEASE_NOTES_v0.32.0.md` and `docs/HANDOFF.md`.
183. **The groceries average counts only weeks since recording began (2026-10-08, released in v0.34.0).** Reported on the Charts card: "over the last 8 complete weeks" for a household recording since Mon 14 Sep. The five weeks before launch counted as zero weeks, so £46.67 a week read as £17.50. **Decision — the start is derived, not stored.** `firstRecordedPurchaseDate` (`src/lib/records/recording.ts`) is the earliest `occurredDate` of a non-voided purchase that is not schedule-converted. Schedule-converted purchases are left out because backdating a direct debit writes its past instances as purchases. A stored "recording started" setting was rejected: it needs a backfill and a value nobody typed, and the derived date corrects itself. **A week counts only if it is complete and begins on or after that date** (`isRecordedWeek`, `src/lib/records/insights.ts`). A week that began earlier, even one partly recorded, is shown but marked "not counted"; it is never averaged in, so a part week never mixes with whole ones. Empty weeks inside the recording period still count as zero weeks. Nothing recorded means no average and no drift. The Charts card and the Insights honesty loop share the rule, so they still agree. **Known limit:** a purchase back-dated to before launch moves the start back and those weeks count again. The fix is to correct that date, not the rule. The fuel comparison uses the same start date but a different month rule, decided by the household in decision 184: a calendar month counts if it contains or follows the recording date (`isRecordedMonth`). The average divides by the months that count; with none, there is no average and no drift. Tests: `tests/groceries-recording-start.test.ts` (the reported figure, the honesty loop agreeing, nothing recorded, a mid-week start), `tests/fuel-recording-start.test.ts` (one recorded month, a partly recorded first month, quiet months after recording began) and the "groceries before recording began" block in `tests/chart-series.test.ts`.
184. **The first, part-recorded month counts in the fuel comparison (2026-10-08, released in v0.34.0).** Decision 183 left a fuel month out when it began before recording did. The household chose instead to count the month that contains the first recorded purchase, so a single fill-up in a part-recorded month reads as that month's fuel: a household that began recording on 17 Sep and fuelled once in September now sees that figure as the average, not "no complete month yet". **The trade-off is deliberate:** fuel bought before recording began in that month is not in the figure, so the average may read low until a full month is recorded. The Insights panel says so when recording began on a day other than the 1st. **Scope:** this applies to fuel months only. Groceries weeks still count only when they begin on or after the recording date (decision 183), so a part-recorded first week is shown but not averaged in. The two rules differ on purpose until the household says otherwise. Rule: `isRecordedMonth` (`src/lib/records/insights.ts`) — a month counts when its last day is on or after the recording date. Tests: `tests/fuel-recording-start.test.ts`.
185. **Horizon day-by-day amounts open their breakdown inline, one at a time (2026-10-08, released in v0.35.0).** The household asked for a way to see what a figure in the Day by day card is made of, without scrolling back to the commitments card and finding the date on a phone. Decided: **inline expansion beneath the tapped date's row** (not a popover or bottom sheet). The date stays on screen and no hover is needed. Three columns are tappable: Commitments, Expected money in (for consistency and so future income schedules are covered without a change here) and Day-to-day. **Only one breakdown is open at a time.** The panel shows only the tapped column, not a running balance, because End of day already shows that. **Day-to-day explains its basis.** Each projected shop or fill records why it falls on its date (`basis`: `anchor`, `overdue` or `never`, plus the anchor date and cadence) in `src/lib/records/day-to-day.ts`, and `describeDayToDayBasis` turns that into a sentence. The figures are unchanged. **The breakdown is a pure reshape** of the lines the view already holds (`buildHorizonDayDetails`, `src/lib/records/horizon-days.ts`), so the panel and the table cannot disagree. The interaction lives in a small client component (`src/app/horizon/day-by-day-table.tsx`). The panel is pinned to the visible width because the table scrolls sideways on a phone. Amount buttons are `nowrap`, and their labels avoid the words \"Day-to-day\" so the existing `getByLabel('Day-to-day')` selector still resolves to the form field. Tests: `tests/horizon-days.test.ts`, the basis block in `tests/day-to-day.test.ts`, and the Horizon e2e spec \"tapping a day-by-day amount opens its breakdown beneath that date, one at a time\".

186. **The phone home's payday card is a summary; the full projection lives on Horizon (2026-10-08, v0.36.0).**
    The household asked for the Quick Entry page's **PAYDAY PROJECTION** card to be trimmed so the other user
    can digest it, and wrote the new copy themselves: next pay day and the day count; the household low from
    the current balance with "no additional unplanned spending"; the overdraft-fee verdict; a "Plan a
    transfer?" line in its existing amber treatment; and a link into **Horizon**. Four answers were taken from
    the household before any code: the trim applies to the **phone home**, with **Overview** keeping the tables
    but losing the duplicated prose ("home trimmed, Overview slightly trimmed"); the balance in the sentence is
    the one the low is derived from — **liquid funds, bank and cash, ignoring card debt** (their words: "the
    displayed figure should ignore any credit card debt"); the transfer deadline is **five days before the
    earliest due date** (`TRANSFER_LEAD_DAYS = 5`, a code constant — the household's 21st → 16th); and the bill
    noun **follows the schedules** ("Direct Debits", "standing orders", or both) rather than assuming direct
    debits.

    **Decision — one pure builder, two surfaces.** `buildPaydaySummary` (`src/lib/records/payday-summary.ts`)
    turns the projection view into four sentences; `paydaySummaryFromView` is the single adapter (labels, kinds,
    today), used by the home card (`src/components/payday-summary.tsx`) and the Overview pot watch, so the two
    can never disagree. Wording is pinned to the character in `tests/payday-summary.test.ts` against the
    household's own worked example (26th October, £242.22, −£165.25, Natwest £850.00 by the 16th).

    **Decision — the fee sentence follows the tier, and does not cheer for a fee.** Tier `none`/`heads-up`
    reads "No overdraft fees would be incurred."; tier `warning` says fees are likely and names the configured
    threshold. The household's example was −£165.25 against a £250.00 threshold — below zero, inside the
    threshold — which is exactly the reassuring case they asked for.

    **Decision — "no additional unplanned spending" is the declared assumption.** The projection already
    includes planned shops and fills (§7.3), so the sentence says so in the household's own words rather than
    implying the low ignores day-to-day.

    **Decision — Horizon opens on payday − 1.** The link is `/horizon?through=<payday − 1>`; the Horizon
    default already resolves "the day before the next income" (decision 150), so the link reproduces the same
    window and a stale bookmark still opens sanely. Verified in the browser: the card's −£165.25 equals
    Horizon's "Free to spend up to" for the 25th to the penny.

    **Decision — the phone home keeps the numbers, Horizon keeps the detail.** The day-by-day table, the dated
    shops/fills, the expected-support list, the weekly pace and the footnotes left the home card; Overview keeps
    its expansions (it is the sit-down surface) and lost only the pace line (the till on the same page already
    carries it) and the footnote paragraphs. Nothing was removed from Horizon.

    **Decision — the summary is honest about the pots it names.** The transfer sentence's noun comes from the
    commitment lines' `scheduleKind` (carried through `ProjectionScheduleLine` into `PotWatchResult`), the
    longest bill list is three names plus "and N more", and a pot already below zero with nothing left to leave
    it says so instead of inventing a bill.

    **Not changed:** the engine's arithmetic, the pot watch's bills-only scope (day-to-day still never enters
    it), the five-day lead's source (a constant, not a setting — add one if the household asks), and the locked
    "projection appears once a checkpoint and an income schedule exist" state.

    **Gates:** `npm test` **696 passed** / 168 suites, 0 failed (up from v0.35.0's 671 / 160; 25 new tests:
    `tests/payday-summary.test.ts` ×20 across 6 suites, and 5 for `formatDayMonthLocalDate`/`ordinalDay` in
    `tests/time.test.ts`) · `typecheck`, `format:check`,
    `themes:check`, `build` clean · `npm audit --omit=dev` zero · Playwright: the full local run and the CI
    `browser` job are the gate; the affected projects (`mobile`, `desktop`, `horizon`, `credit-card-pots`) were
    verified green locally via SANDBOX entry 8, including the new spec "the payday card states the facts and
    opens Horizon the day before payday". No schema, migration, backup-format or dependency change.

187. **Exclude all projected day-to-day spending on the main salary day and keep the home/Overview summary consistent (2026-10-09, v0.37.0 follow-up).**

    The follow-up closes the remaining gaps from decision 186 without changing the salary-window
    definition. **On the actual main salary receipt date only**, every projected day-to-day event is
    removed — weekly groceries and per-vehicle fuel alike. It is not a rule for any other receipt
    date. The shared result feeds the payday projection, Quick Entry/Till, the home card, Overview
    totals and low, and Horizon; Horizon applies the rule to every occurrence of its selected main
    salary schedule in the chosen window. The salary's configured day remains the 26th; an expected
    receipt on another date does not suppress shops or fills.

    **The phone summary gets smaller and clearer.** Keep its payday, liquid household low, single
    greatest bills-only pot shortfall, five-day transfer lead and Horizon link (`through=payday−1`);
    remove the overdraft-fees sentence. When projected day-to-day spending is positive, the worst-pot
    line may add a separately worded guide: bills-only shortfall plus that spending, assuming it also
    comes from the named pot, explicitly not a strict pot allocation. If several pots are short, name
    the one with the greatest bills-only shortfall. The selected-pot Till display calls its amount
    **Bills-only shortfall** and shows the checkpoint's existing amount, age, and Europe/London
    date/time. Negative lows use the shortfall wording (`-£96.35`); positive and zero-low guidance
    stays as it was.

    **Overview is a figures-and-door surface, not a second Horizon.** Retain the tier message, payday,
    liquid funds, day-to-day, commitments, receipts and transfer warning; remove expandable forecast
    sections and the day-by-day table; link to Horizon for dated detail. `/overview` keeps Quick
    Entry beside the projection. On `/`, mobile ordering remains Household total then Till, while a
    laptop moves the same Till above — never instead of — the existing household/dashboard content.

    **Fictional browser scenario.** A dedicated final Playwright project creates Main £242.22, salary
    due the 26th, a Natwest bank pot with supplier-first DD schedules due the 21st, and a £90 projected
    fuel event on salary day. The assertions cover the checkpoint date/time, bills-only and worst-pot
    wording, exact `-£96.35` negative-low copy, the Horizon date, and the missing salary-day event in
    Overview and Horizon. No household values are used. No schema, migration, backup format or
    dependency change; release gates are recorded in the release notes after they have actually run.

188. **Show a qualified day-to-day guide beside the Till's bills-only shortfall (2026-10-09, v0.37.0 follow-up).**

    Keep the selected pot's bills-only shortfall as the primary figure, but remove the first-due
    bill detail from that line. When projected day-to-day spending is positive, append a conditional
    guide: *"If projected day-to-day spending also comes from [pot], the guide shortfall is about
    [bills-only shortfall plus projected day-to-day spending]."* Omit the guide at zero; it never
    changes the bills-only figure. Retain the selected-pot assumption and the explanation that the
    guide is not a strict allocation in the full decision record (§7.7).

189. **Rename Quick Entry's Balance tab to Checkpoint and show the ledger's current running balance separately (2026-10-09, v0.37.0 follow-up).**

    The Purchase view labels the report **Last checkpoint**, retaining its reported amount, age and
    local timestamp. After that it shows **current account balance** from the latest running balance
    on All Transactions — checkpoint plus recorded movements after it — never by copying the
    checkpoint figure. Use the shared pence formatter for both values. Rename only the visible tab
    and its navigation/help references; the checkpoint form and its internal mode remain unchanged.

190. **Annual vehicle payments show as one twelfth a month in running costs (2026-10-09, v0.37.0 follow-up).**

    The household's car insurance is a yearly direct debit and the wife's is monthly, so the Vehicle running
    costs card could not compare them: a yearly premium landed in one month. Decision: in `vehicleRunningCosts`
    only, a converted payment from an annual schedule covers twelve months from its own month.
    `spreadOverCoverMonths` gives each covered month an equal share in whole pence, the leftover pence going to
    the earliest months, so the shares always sum to the payment. In steady state the rolling 12-month total
    counts one premium exactly. The spread is derived when figures are read and is never stored. Shares are
    month-granular (a covered month counts in full, including the one in progress), and a share dated after
    today is outside every figure. Monthly payments, ordinary purchases and every cash-basis view stay on the
    payment date: the month comparison, personal spending, the honesty loop, Horizon, Charts, Purchases and the
    cash summaries. The rule follows the schedule's cadence and its vehicle target, not its category, so an
    annual road-tax payment against a vehicle is spread too. The household confirmed that scope on 2026-10-09 (decision 193).

    Insights marks a spread row "(annual ÷ 12)", adds a footnote when a spread applies, and its subtitle now
    names this one exception to exact reconciliation. Overview shows the same figures with a one-line note. The
    DB read reaches 22 months back (the window starts 11 months back), because a payment made earlier can still
    cover the window; the engine drops anything outside the window, so no unspread figure changes. Schema,
    migrations and backup format are unchanged.

    Tests: the pure engine (split, pence remainder, refunds, window edges, future shares, steady state, cash
    summaries unchanged); the DB reads (a converted annual premium, a monthly comparator on the same vehicle, a
    premium paid more than eleven months back); and the e2e `insights` project (its own vehicle and an annual
    direct debit entered through the Recurring form, the card, and the two converted purchases). Left as they
    are, and to decide later: Charts' fixed commitments and the month comparison keep the cash spike, which is
    the truth for that month.

191. **Phone PDF viewing: an object element, a full-screen phone layout and Open in PDF app (2026-10-09, v0.37.0 follow-up).**

    The household asked for PDF viewing on a phone, with a way to open the file in a PDF-capable app. The old
    viewer put a bare iframe under a note, and kept Download and Share in a header that wrapped on a phone.
    Chosen without a new dependency: the PDF is an `<object type="application/pdf">` on the blob URL, with
    fallback text for a browser that cannot draw it. Below 640px the viewer fills the screen. The actions sit in
    a footer that is always in reach: **Open in PDF app** (the system share sheet with the file, where the
    browser offers file sharing; images keep **Share**) and **Download** (always). Close, Escape, focus return,
    scroll lock and the authenticated `no-store` fetch are unchanged.

    Not verified here, and not promised: an inline PDF on iOS Safari or Android Chrome. This sandbox's Chromium
    has no PDF viewer and no share API on Linux, so e2e proves the wiring, the fallback path, the share hand-off
    through a mocked share API, and the layout at 393px and 1400px. It does not prove an inline page. This
    supersedes the iframe and header layout of decision 177; its no-PDF.js rule was reversed by decision 192 (OQ15, resolved 2026-10-09).

192. **In-page PDF reading with PDF.js (2026-10-09, v0.38.0).**

    The household approved OQ15: PDF.js as a new dependency, reversing the no-dependency rule of decision 177 as revised by decision 191, and no phone-specific code. Decision 191 drew a PDF in an `<object>` element and left the drawing to each phone's browser, which on some phones shows only the first page or offers a download instead. Now `pdfjs-dist` (Apache-2.0) draws each page itself, the same way on every device.

    Built as follows. The **legacy build** (`pdfjs-dist/legacy/build/pdf.mjs`) is used, because the modern build calls `Promise.withResolvers` directly, which older iPhones lack. The worker (`pdf.worker.min.mjs`) is addressed by a URL that Next bundles as a static asset, so `next dev` and `next start` serve the same path; the production build emits it and `next start` serves it as `application/javascript`. pdf.js is imported only when a PDF is opened. Each page is fitted to the viewer's width and drawn at the device pixel ratio, capped at 2. A page is drawn while it is within 150% of the visible height, and its bitmap is released once it moves further away. The reader has no text layer and no annotation layer: text is not selectable or searchable, and links and form fields are inactive. The standard-font and CMap data are not shipped in this version, so a non-embedded font is drawn with a stand-in while its positions still come from the PDF; Open in PDF app remains the exact copy. Schema, migrations and the backup format are unchanged. The footer, Download, Close, Escape, focus return, scroll lock and the `no-store` fetch are as decision 191 left them.

    Tests: the pure page geometry (`tests/pdf-page-layout.test.ts`: fit to width, the pixel-ratio cap, landscape pages, unmeasured pages). The attachments e2e spec checks that the first page's centre pixel is the blue square the generated PDF draws, that a three-page file gives three page canvases, that a page fills a phone's width less its gap, and that an unreadable file shows the message with Download.

    Not verified: a real iPhone Safari or Android Chrome. This sandbox's Chromium has no PDF plugin, but it draws through pdf.js, so the reader is proven on that engine. The household's phones are the test that remains.

193. **Road tax follows the annual rule (2026-10-09, v0.38.0).**

    The household confirmed that an annual road-tax payment against a vehicle is spread like any other annual vehicle payment (decision 190). The code stays as built. Road tax is paid monthly on both cars today, so nothing is spread at present. The household's own car insurance is the one annual direct debit, and it is spread. The wife's car insurance is a monthly direct debit and is unaffected.

    A premium is spread only when its recurring payment targets the vehicle (`Vehicle — <name>` on the Recurring form) and its start date reaches back far enough for the past years to exist as purchases (SPEC §11.1). Both are checks for the household's car insurance.

194. **Horizon card-header totals (2026-10-09, v0.39.0).**

    Each Horizon card now shows its total in the card summary, beside the count: the commitments total, the expected money in total, and the day-to-day total. The totals are summed from the same lists the card renders, so they cannot drift from the rows. Expected money in carries the existing "≈ … expected — never received" support lines, so an expected receipt is never presented as money received. The household approved the change on the preview.

195. **Where the money goes: a spending-mix pie on /charts (2026-10-09, v0.39.0).**

    The household asked for a pie of what share of the money each parent category takes, with Personal split per person and a selector for the window and the categories counted. Built as SPEC §16.7 E. The pie is hand-rolled SVG like the other charts, with no client JavaScript, so the selector and the slice drill-down work as plain links and GET forms.

    Decisions as built, approved by the household on the preview: the default window is the **payday cycle** (last payday to the day before the next), using the main salary schedule and its weekend shift (decision 112). The payday split applies to **Personal only**, not to Entertainment & Eating Out. Category selection is at **parent level** (the pie's slices), not child level. A parent that nets to zero or below is listed in the table but not drawn. Household-marked personal spending is its own slice.

    The pure arithmetic is `src/lib/records/spending-mix.ts`, and the DB assembly is `getSpendingMixView` in `charts-view.ts`. `recentScheduledIncomeDates` in `money-view.ts` finds the paydays already lived through. Tests: `tests/spending-mix.test.ts` (the rules, with no database) and `tests/spending-mix-view.test.ts` (the pie against an independent sum over `listPurchases`, and against the Insights roll-up, plus the payday windows and voids). No Playwright spec was added for the pie, as the household asked for Playwright to be skipped for now; the release's `browser` check runs the existing acceptance suite in CI.

    Not verified: a real phone or laptop render. The sandbox has no browser, so the layout is checked through the server HTML only.

196. **The guide and "what this page needs first" (2026-10-11, v1.2.0).**

    The household approved Slice 2 of `docs/ONBOARDING_PLAN.md`. Built as: `/guide` (`src/app/guide/page.tsx`, copy and anchors in `src/lib/guide.ts`), with eight anchored sections explaining ideas the app already applies. It is linked from the footer and the setup path, not the navigation (the household's choice). On the four payoff pages, the missing records are shown as "What this page needs first": the setup-path steps that are not done, mapped per page in `src/lib/records/page-needs.ts`. Optional steps and Phase B bills are never prerequisites, and a checkpoint need waits behind the pots need. The Charts reported section and the Insights comparison and honesty panels give way to the block only while nothing is recorded, so a populated household sees no change except the guide links.

    Navigation decision (plan §7 item 5), recorded: `/start` keeps its navigation entry permanently. The guide's copy is pinned by `tests/guide.test.ts`, so a rule that changes must change its section in the same PR. No schema, migration or dependency change.

    Tests: `tests/guide.test.ts` and `tests/page-needs.test.ts` (15 cases), and the first-run browser suite gains a needs-and-guide assertion. The two-calendar-month requirement for Slice 3's worked example is recorded in `docs/ONBOARDING_PLAN.md` §4.

197. **Three months side by side on the Insights comparison (2026-10-12, v1.4.0).**

    The household asked for the month-comparison card to show three months, drawn in their sketch as `Category | August 2026 | September 2026 Change | October 2026 Change` — chronological, oldest first, each month after the first paired with its change against the month before. Built as SPEC §16.1: `compareCalendarMonths` now returns one column per month (three by default, `{ months: n }` for any count), each row carries `amountsPence[]` and `deltasPence[]` in the same order, and the oldest column's change is blank because there is nothing before it to compare. The month being lived stays labelled "(in progress)". The household has no August data (recording began in September) and accepts the honest blank columns; they self-cure. The `/example` reflection renders the same shape.

    Tests: `tests/insights.test.ts` (the three-month shape, the blank first change, the explicit month count), `tests/insights-view.test.ts` (reconciliation with an independent sum over `listPurchases`, including the empty month).

198. **Every Insights figure opens its line items (2026-10-12, v1.4.0).**

    The household asked for the purchases behind a monthly total to appear inline — "click on £197.66 and see the three October purchases" — on the comparison card, the by-person card and the vehicle running costs. Built as SPEC §16.1: every figure in those cards is now a real link carrying a drill key (`m:<YYYY-MM>[:parent]`, `p:<personId>:<YYYY-MM>[:parent]`, `v:<vehicleId>:<month|previous|rolling>[:child]`, parsed strictly and rejected whole if malformed) into `?show=…#month-drill|person-drill|vehicle-drill`. The drill opens beneath the card as the pie's line-items table already does (decision 195): date, where, category, who it was for, amount; a matched purchase comes back whole with the matching line's amount; "Open these purchases" repeats the row set in the purchases list. Pressing the selected figure closes the table, so the link is honest with JavaScript off and toggles with it on. A card drills only the months it displays. Vehicle rows add up to the spread figure being opened: an annual premium contributes its ÷ 12 share to a month and its ÷ 12 shares to the rolling window, with the full payment footnoted on the row.

    The pure assembly is `src/lib/records/insights-drill.ts`; the views already carried `lines` (decision 196's reconciliation aid), so no read path changed.

    Tests: `tests/insights-drill.test.ts` (key round-trips and strict rejections, cash-basis month and person tables, spread-aware vehicle tables that add up to `vehicleRunningCosts` figures, and the exact month/previous/rolling windows), `tests/insights-view.test.ts` (every cell of the comparison, every person figure and every vehicle figure equals the drill table behind it).

199. **Three months by category on /charts, with an Exclude Housing toggle (2026-10-12, v1.4.0).**

    The household asked for a grouped bar chart — parent categories along the x-axis, three adjacent bars per category for the same three months the comparison table shows — plus a button to exclude Housing alone (about 35% of their spending) so the other bars can breathe. Built as SPEC §16.7 F. The figures come from the same `getMonthComparisonView` read as the Insights table (`getCategoryMonthsView` derives from it), so the drawing and the tables cannot drift. The month being lived is hatched and labelled "(so far)". The toggle is a real link (`?noHousing=1#months`) like every other control on the page, matches the default *Housing* parent by name (the pie-split rule, decision 195), and says "Housing is excluded." while it is on. Every bar drills to its own month and category in the purchases list; the table twin repeats each link per cell with a totals row.

    Tests: `tests/charts-view.test.ts` (the drawing's figures equal the Insights comparison; the exclusion removes Housing and nothing else), and the generic charts browser loop covers the new figure alongside the original four.

200. **The preview seed script runs end-to-end (2026-10-12, v1.4.0).**

    v1.3.0 shipped `scripts/seed-example-household.mts` with two latent bugs the format check could not see: `require('node:fs')` inside an ESM module (it died at the first safety check), and a placeholder `householdDatabasePath(…, 'worked-example')` call that threw before its own "we'll override the path" line. The script is advertised in the release notes, so it is repaired rather than removed: plain ESM imports, and the household id is taken from the registry the script itself just wrote. It now seeds the worked example into a preview root in one command, and the v1.4.0 preview used it.

    Tests: none automated (it is a rehearsal tool); proven by running it against a clean `DATA_DIR` and loading `/example`, `/insights` and `/charts` against the seeded household.
201. **The months chart reads sideways instead of shrinking (2026-10-12, v1.4.0).**

    The household tried the new chart on a phone and asked for three tweaks: abbreviated category names on the axis ("Grocer'", "Person'", "Vehicle'") with the full name on hover; thinner bars so more categories fit at a time; and a sideways-scrollable drawing — "a steady horizontal scroll of the chart data when the user's finger is moving left or right" — with small left/right arrows for a tap or a PC click, and no haptic/judder on the swipe. Built as SPEC §16.7 F.

    As built: `abbrevCategory` (`src/components/charts/abbrev.ts`) shortens a name to at most six characters and a truncation apostrophe, or keeps a short first word ("Vehicle Running" → "Vehicle'"), and the shortened label carries the full name as an SVG `<title>` hover hint; the table twin always spells names out. Bars are capped thin (10px) and every band has a minimum width, so a long category list makes the drawing wider than its column rather than crushing the labels — `ChartScroller` (`src/components/charts/chart-scroller.tsx`) wraps it in `overflow-x-auto` with `overscroll-x-contain` and no scroll-snap, so the swipe is the platform's own scrolling (1:1 tracking and momentum, and nothing in the page that could stutter or buzz against the finger). The component adds only progressive enhancement: ◀ ▶ nudge buttons (hidden at the ends, with proper names) and a desktop pointer drag that swallows its own click so a pan never opens a bar's link. It is the page's one hydrated client component — the drawing, the drag-free swipe and the table twin all work with JavaScript off — and the "no client JavaScript" rule in the rules block is amended to name this exception rather than bent in silence.

    The axis now shows every label (they are short enough for the thinnest band). The charts browser spec gains a months test (the drawing overflows its scroll frame on a 320px phone, the hover hint is present, the arrows move the scroll) and its width assertion checks the scroll frame rather than the drawing for scrollable figures.

    Tests: `tests/chart-labels.test.ts` (the three abbreviation shapes and the apostrophe rule), `e2e/charts.spec.ts` months case. Not verified: a real touch device's feel of the swipe — the sandbox's Chromium emulates touch but cannot attest momentum or haptics; the implementation deliberately leaves touch to the platform, which is the only web answer to that ask.

202. **The in-progress bars were invisible on a laptop, and nothing but a pixel noticed (2026-10-12, v1.5.0).**

    The household's charts had a painting bug that survived eleven releases. On any screen 1024px or
    wider the hatched "in progress" bars — the Groceries "(so far)" week since v0.14.0 and the months
    chart's running month since v1.4.0 — were **in the DOM, at the right size, with the right
    computed `fill`, and completely unpainted**. Phones were never affected, and every existing
    assertion passed: geometry, links, the table twin and the accessible label were all correct.

    **Root cause.** Each chart is drawn twice — a phone figure (`lg:hidden`) and a laptop figure
    (`hidden lg:block`) — and an SVG `id` is document-global. Both copies defined the same hatch
    `<pattern>` (`chart-hatch` in `bar-chart.tsx`, `chart-grouped-hatch-<month>` in
    `grouped-bar-chart.tsx`), so `url(#…)` resolved to the **first** copy in DOM order; at laptop
    widths that copy lives inside the `display: none` phone figure, and a paint server that resolves
    into a hidden subtree paints nothing at all (SVG 1.1, every browser). Reproduced here in the
    sandbox's Chromium in both directions: with the shared id restored, a grey gap where the bar
    should be; with the fix, exactly the bar.

    **As built (SPEC §16.7, "Rules every chart keeps").** `BarChart` and `GroupedBarChart` take an
    `idPrefix` and namespace every pattern they define (`chart-hatch-groceries-laptop-hatch`,
    `chart-hatch-months-laptop-hatch-2026-10-01`, …), threaded from the four call sites on
    `/charts` — so a drawing's paint servers are its own, and the page can be extended with a third
    variant without touching the components. And the muted bar **degrades honestly**: it is now two
    rects, a solid `CHART_COLOURS.barMuted` base with the hatch drawn over it, so an in-progress
    period reads as a muted bar even if a paint server ever fails again (SPEC §16.7's "colour is
    never the only signal" was already claiming the hatch was a second signal; now the shape is a
    third).

    **The test that would have caught it.** `e2e/charts.spec.ts` gains a **pixel** case: it
    scrolls nothing, takes one full-page screenshot, reads it back through a small PNG decoder
    (`e2e/pixels.ts`, `node:zlib` only — no new dependency and no browser API), and requires every
    in-progress bar's own bounding box to contain paint. It first checks the structure that failed —
    no id inside one figure may be shared with, or resolve into, another — then samples the figure's
    pixels. Turning the fix off in a throwaway edit makes the new test fail with the exact bars
    named, so the check is known to bite.

    **Known history, for the release notes:** the Groceries "(so far)" bar was invisible on
    laptop/desktop in every release from **v0.14.0 to v1.4.0**, and the months chart's in-progress
    month was invisible there for all of **v1.4.0**. The phone figures were correct throughout; no
    figure was ever wrong, only unpainted on a wide screen.

203. **A link is blue and underlined (2026-10-12, v1.5.0).**

    The household reported that links were found by accident: on `/recurring` the Schedules card's
    "Supplier card", the "… →" links and the Horizon day-by-day amounts that open the inline
    transaction list all read as plain text until the pointer happened to cross them (`text-accent`
    with `hover:underline` — the same weight, and an underline that never appears on a phone).
    Asked to choose, the household picked the **familiar blue, always underlined** over keeping the
    theme's accent hue and over a hover-only underline.

    As built: one token, `--color-link`, and two Tailwind v4 utilities in `src/app/globals.css`.
    `sf-link` is an ordinary link — the blue, underlined, underline offset 2px, and hover thickens
    the line (feedback on top of the signal, never the signal). `sf-link-arrow` is a link that is
    its own call to action ("See all 18 →", a bar's axis label): the same blue and permanent
    underline, retaining its arrow and weight. Hover only thickens the line for both utilities.
    `e2e/desktop.spec.ts` checks the Supplier card, arrow links and Horizon amount controls before
    hover at phone and laptop widths. The sweep converted **119** link sites across ~31 files, including
    the four the household named; text that is a button or a toggle keeps its underline and does not
    become blue (`attachment-form.tsx`'s receipt chip, the quick-entry toggles, `record-forms.tsx`,
    the day-by-day mention chips). Links drawn on the till keep the till's own ink and their
    underline, because the link blue is a mid-tone and would not read on a dark surface.

    **The theme rule was kept, not bent.** A link cannot be blue and legible by assumption: the hue
    (`#1d4ed8`, blue-700's own) and chroma are fixed, and `scripts/themes/derive.ts` re-lights only
    lightness per theme — deepened in a light build, lifted in a dark one — until it clears every
    floor it is read against. `CONTRAST_RULES` now measures the link separately from `accent` (4.5:1
    on a card, on the page, inside a grey strip, inside a tinted panel), and the existing accent
    rules stay, because accent is still chip, focus ring and chart colour. `npm run themes:build`
    produced `--color-link: #2352cf` (light) and `#8aafff` (dark) for the generated themes; all 28
    themes carry the token, and `tests/themes.test.ts` re-measures the shipped stylesheet, including
    a new distinctness group `'link vs ink'`. The generated files stay byte-fresh:
    `npm run themes:check` is green.

204. **One attach control, not two (2026-10-12, v1.5.0).**

    On `/purchases` the household saw two controls and pressed the wrong one first: a submit button
    reading "Attach receipt" sat above the file input, so the natural gesture was to press it, and
    nothing happened. The same component serves all three owner kinds (purchase, income record,
    supplier card), so the fix is one change in `src/components/attachment-form.tsx`.

    As built (SPEC §23.1): the **styled label is the button**. It reads "Attach receipt" (or "Attach
    payslip" / "Attach document"), opens the picker, and the chosen file submits the form on the
    spot via `requestSubmit()`; while the upload runs it reads "Attaching…". The file input is
    `peer sr-only` — visually hidden, still focusable, still the labelled control — so the focus
    ring is drawn on the label (`peer-focus-visible:`), and there is never a button to press with
    nothing to attach. A `<button type="submit" hidden={jsReady}>` remains in the served HTML for a
    browser with JavaScript off, hidden by React on mount (the no-JS path still works end to end:
    the label is a label, the button submits). An effect keyed on the action's `state` clears the
    input's value after each attempt, because a file input keeps its value and re-choosing the same
    file fires no change event — which is what retrying a rejected file needs. The accessible name
    includes the visible action plus the original file-kind hint (for example, "Attach payslip
    (payslip or document file)"); the payslip browser spec also checks auto-upload without a second
    click. CI caught its old two-step expectation before release.

    `e2e/attachments.spec.ts` now drives the real gesture: it clicks the label, takes the file
    chooser the browser opens, sets the file on it, and waits for the attachment to appear — no
    "press Attach receipt" step exists to write. It also asserts the no-JavaScript button is present
    but hidden, and (found on the way) scopes that assertion to the attachment form with a
    `form:has(input[type="file"])` locator, because a purchase row has other forms of its own and a
    `filter({ has })` inner locator is resolved relative to each candidate — so an inner locator
    already anchored on the row matches nothing.

205. **Purchases page: show toggles, two-row line editor, striped rows, supplier links (2026-10-13, unreleased).**

    The three `…Only` tag boxes became four independent **show** toggles — Purchases (anything whose
    `scheduleInstanceId` is null), From schedule, Refunds, Voided — all ticked by default, so the
    page now opens on the complete history including voided records (previously voided records were
    hidden until the Voided box was ticked). Unticking a box hides that kind; a record carrying two
    tags (a voided refund, say) is hidden if any of its tags is off. `listPurchases` gained
    `excludeScheduled` / `excludePurchases` / `excludeRefunds`; voided visibility still rides on
    `includeVoided`, which the page now sets from the Voided toggle. The form submits a hidden
    `showX=0` ahead of each checkbox's `showX=1`, and the page reads the last value, so an unticked
    box is distinguishable from no submission at all. Legacy `scheduleOnly` / `refundsOnly` /
    `voidedOnly` deep links (charts, tasks) keep their old meaning when no show toggle is present.
    The shared line editor (edit + refund) now lays a line out as Spent for | Amount, then Category
    full-width (Which follows full-width when needed), with `py-1` controls, and the Purchases edit
    panel is widened (`w-80 sm:w-96`). Table rows alternate `bg-canvas` on odd rows. The supplier
    name is an `sf-link` to `supplierCardHref(id)`, which already expands that card (decision 149).
    Unit coverage in `tests/purchases.test.ts`; browser coverage in `e2e/desktop.spec.ts` (toggles
    default on, supplier link, row striping, and the reworked void flow).

206. **Recurring page: cancel inside Edit, double-confirm, restore with back-fill warning, alternating rows (2026-10-13, v1.7.0).**

    Cancel moved inside the Edit disclosure, requires a second confirmation press ("Yes, cancel it"), and cancelled schedules can be restored (`restoreSchedule`) after ticking an explicit back-fill acknowledgement; Schedules rows alternate `bg-canvas` on odd rows.

207. **Granular parent/child category tree selector on Chart E — Where the money goes (2026-10-14, v1.9.0).**

    The household asked for the category selector on Chart E (`E · Spending mix — Where the money goes`, `/charts#mix`) to start collapsed showing only parent categories as before, with a tiny drop-down arrow beside each parent that expands to reveal its child categories slightly indented like a tree view. Confirmed with the household: pie slices remain grouped by parent category (with `Personal` split per person and household), summing only the ticked child categories under each parent; and ticking or unticking a parent checkbox toggles all of its child categories, with the parent checkbox displaying its partial (`indeterminate`) state alongside a `(ticked/total)` indicator when only a subset of its children are ticked.

    As built (SPEC §16.7 E): `MixCategoryTree` (`src/components/charts/mix-category-tree.tsx`) renders the expandable parent/child tree inside `#mix-controls`. Child checkboxes remain mounted in the form (hidden when collapsed) so submitting the form always sends the exact set of ticked child category IDs whether a parent is expanded or collapsed. `getSpendingMixView` (`src/lib/records/charts-view.ts`) and `spendingMix` (`src/lib/records/spending-mix.ts`) accept `includedCategoryIds` alongside `includedParentIds`, remaining backwards-compatible with parent-id URLs and callers. Preset window links, slice drill-down links, and the `"Open these purchases →"` link preserve the active child-category selection.

    In the same `v1.9.0` stable release, the field-tested `v1.8.0-rc.1` Contracts & Renewals agreement register is signed off and promoted to stable (`latest`), and `npm test` now runs `scripts/run-tests.mjs` in sequential batches of 20 files with `--test-concurrency=2` (`docs/SANDBOX.md` entry 21) so memory is reclaimed between batches and never triggers an out-of-memory warning in the Arena sandbox.

208. **All Transactions rows alternate; Chart E becomes "Where the money went" — no dates after today, honest quick windows, pickers in sync (2026-10-14, v1.10.0, GitHub issues #23 and #24).**

    The household filed three issues; this release takes the two presentation-only ones as one slice and leaves #25 (Chart C scope) for its own session, because #25 changes what a chart *measures*.

    **#23 — alternating rows on All Transactions.** Movement rows on `/transactions` alternate `bg-canvas`, matching Purchases (decision 205) and Schedules (decision 206). The stripe counts **movements only**: a checkpoint is already a tinted divider with heavy rules, so it does not take a turn and the movements either side of it keep alternating (`stripeIndex` in `src/app/transactions/page.tsx`). Browser coverage: `e2e/transactions.spec.ts` compares the computed backgrounds of the first two movement rows.

    **#24 — Chart E's "identity disorder".** The pie counts recorded spending only, yet it was titled "Where the money goes", its pickers accepted future dates, and two of its quick windows ended in the future ("Payday cycle" ran to the day before the next payday; "This calendar month" ran to the month's last day). Agreed with the household on 2026-10-14:

    - Title **"Where the money went"** (eyebrow unchanged, `E · Spending mix`).
    - Three quick windows, none ending after today: **Since last payday** (default; latest payday → today), **Last full payday cycle** (previous payday → day before the latest), **Month to date** (1st → today). The household's own example: today 14 Oct, payday the 25th → last full cycle 25 Aug – 24 Sep, since last payday 25 Sep – 14 Oct.
    - Both pickers carry `max` = today. Server-side, a custom window starting after today is refused (default window + notice), and an end date after today is clamped to today with a sentence saying so. Typed dates equal to a quick window resolve to that window, so its button lights.
    - **Pickers follow the quick windows.** The household asked for the chosen button to update the date pickers. Root cause: the inputs are uncontrolled (`defaultValue`) and a quick-window `<Link>` is a soft navigation that keeps the form mounted. React does update the `defaultValue`, and an *untouched* date input displays it — but once the input has been edited the browser's dirty-value flag stops it following its default, so hand-typed dates stayed beside a chart drawn for different ones. Fix: both inputs are keyed on `from:to`, so they remount with the window. The browser spec edits both pickers *before* each quick-window press; it was shown to fail without the key (`Expected "2026-10-01", Received "2020-01-01"`) and pass with it.

    **Why the household never saw "Previous payday cycle".** `paydayCycleWindows` bracketed windows with the salary's *recorded* instances (`recentScheduledIncomeDates`). A salary schedule added recently has one payday on record, so the previous cycle was `null` and its button silently hidden. New `cadenceDatesOnOrBefore(schedule, date, count)` in `schedules.ts` walks the schedule's cadence backwards (monthly or annual, excluded months skipped, income weekend shift applied, `activeFrom` deliberately ignored — the salary's rhythm predates the app hearing about it; nothing is materialised). New `recentPaydayDates` in `money-view.ts` returns recorded paydays first and fills any shortfall from the cadence, requiring a derived date to sit at least 14 days before the oldest recorded one (so an edited due day cannot yield two paydays for one period). `recentScheduledIncomeDates` is unchanged for its other callers.

    Internals kept stable: `MixWindowKind` values (`payday`, `previous-payday`, `month`, `custom`) and the `presets` shape are unchanged, so `/example` and the URL contract need nothing. No schema change, no migration. Tests: `tests/payday-windows.test.ts` (new — the household's new-schedule case, a first payday still to come, no salary, and the cadence walker's weekend/excluded-month/annual edges) and `tests/spending-mix-view.test.ts` (default ends today, month to date, no preset past today, end-date clamp, future start refused, typed preset match); `e2e/charts.spec.ts` (title, `max`, three buttons, pickers follow presets after hand edits, URL clamp).

    **Deferred — #25 (Chart C counts only Personal/Entertainment parents).** Agreed direction for the next session: the person series should count every line whose "For" is that person, whatever its parent category (e.g. clothing inside a split grocery shop); the **Household series keeps its current scope** (household-marked lines under Personal and Entertainment & Eating Out only), so the mortgage and weekly shop do not swamp it. The drill-down links (`parentCategoryIds` filter) will need to drop the category filter for person segments.

209. **Chart C counts every line marked for a person, whatever its category (2026-10-14, v1.11.0, GitHub issue #25).**

    The household's report: Chart C ("Hers, his, household") misses person spending under non-Personal parents — clothing bought inside a split grocery shop, a present grouped under Groceries — so a person column can read £45–60 lower than it should while the Insights month panel (which counts the same "For: person" rule over every line) shows the full figure. The truth-versus-kindness principle (§31 of the SPEC's honesty rule) says the chart must tell the truth here: under-counting one person's spending is the kind of misleadingly reassuring figure the app exists to avoid.

    As agreed in decision 208, the fix widens only the person series. `personalSpendSeries` (`chart-series.ts`) no longer pre-filters lines by `parentNames`: a `person:{id}` key counts wherever its line sits, and only the `household` key keeps the discretionary-parent scope. `getPersonalChartView` (`charts-view.ts`) passes all window lines to the engine — the old view-level `.filter()` would have silently re-imposed the lifted scope, and a comment there says so. Person drill-down links drop `categoryIds` while household links keep `parentCategoryIds`; the caption and the `/example` reflection now say a person's bar counts every line marked for them and name the parents as the household bar's scope. SPEC §16.7 C rewritten accordingly.

    Tests: `tests/chart-series.test.ts` (the grocery line marked for Alex now counts, with its `Groceries / Weekly Shop` child named; a joint grocery shop stays out of Household); `tests/charts-view.test.ts` (a Groceries top-up for Sam in the seed, dated in an unasserted week inside the trailing-8 window; person totals reconciled without the parent filter, household with it; and a new test running panel 2's own `personalSpending` over the chart's lines to demand September's person cells match — the issue's core promise). No schema change, no migration.

210. **By Person month navigation keeps the panel in view (2026-10-14, v1.11.0, GitHub issue #26).**

    The By Person panel's Prev/Next links were bare `/insights?month=…` URLs, so paging months jumped back to the top of the page. They now go through the page's own `insightsHref` helper with the `panel-persons-heading` anchor (drills are dropped, as before — a fresh month, closed drills). The `scroll-mt-24` offset lives on the `h2` itself, not the section: scroll-hash scrolls to the heading, and scroll-margin only clears the sticky header on the element actually targeted — the same shape as the existing `person-drill` anchor. Browser coverage in `e2e/insights.spec.ts`: both links carry the anchor, and after paging the heading is in view with its top below the sticky header's bottom edge.

211. **The honesty loop reads drift within −15%…+10% as normal life (2026-10-14, v1.11.0, GitHub issue #27).**

    The household asked for a gentler honesty loop: the old verdict scolded any overspend ("Consider raising the figure — or cutting back") and any underspend alike, with no sense of scale. New `honestyBand` / `honestyDriftPercent` in `insights.ts`: drift within −15%…+10% of the configured figure is `within-tolerance` ("Close to the £85.00 you configured — actual spending of £87.00 a week is within the usual range", positive styling); outside it the verdict keeps the pounds, adds the percent ("12% over"), and speaks more strongly ("That is outside the usual range — …"). Only above-tolerance warns; below-tolerance keeps the positive styling and gains the symmetric action ("consider lowering the figure"). The band edges test the EXACT ratio, not the rounded display percent (+10.4% is already above the band though it shows as "10% over"); a null drift has no band, and a zero configured figure cannot take a percentage (any drift is out of band on its own side, pounds only). The exact-zero sentence is unchanged. SPEC §16 item 4 rewritten with the band and the real windows (8 complete weeks, 3 complete months). Tests: `tests/insights.test.ts` pins the edges, the null/zero cases and half-up rounding; `e2e/insights.spec.ts` asserts the seeded groceries verdict reads outside the usual range with a percent — robustly above the +10% edge on any weekday, since only the in-progress week (which the average never sees) can move under other specs.


212. **Recurring can hide cancelled schedules (2026-10-14, v1.12.0, GitHub issue #28).**

    The Schedules list keeps cancelled schedules by default so `#schedule-{id}` deep links still land. A `Hide cancelled` / `Show cancelled` link in the Schedules heading sets `?hideCancelled=1`, shown only when the list has a cancelled row, with a `N hidden` badge while hiding. The choice is in the URL, not stored, so it survives calendar paging (`recurringHref` builds every Recurring link). Pure logic lives in `src/lib/records/schedule-visibility.ts` with `tests/schedule-visibility.test.ts`; the e2e spec is `e2e/recurring-hide-cancelled.spec.ts`.

213. **All Transactions source links clear the sticky header (2026-10-14, v1.12.0, GitHub issue #30).**

    Native fragment scrolling to `/purchases#purchase-{id}` put the row under the 56px-plus sticky site header, on phone and laptop. The Purchases row carries `scroll-mt-24`, as the other anchored targets do (decision 210 pattern). `e2e/transactions.spec.ts` asserts the row's top sits below the header. Not run in this sandbox; CI's browser job is the evidence.

214. **Persistent hide-cancelled schedule preference across navigations (2026-10-14, v1.13.0, GitHub issue #35).**

    The hide-cancelled toggle on `/recurring` introduced in decision 212 is now remembered across page navigations via a device cookie (`sf_hide_cancelled_schedules`, max-age 1 year, path `/`, SameSite `lax`), matching the app's established client preference conventions (such as `sf_theme`). If the URL provides an explicit `?hideCancelled=1` or `0`, it overrides and updates the cookie. When navigating away and returning to `/recurring` without query parameters, the user's preference is maintained.

215. **Supplier card linked recurring schedule & in-place schedule filter (2026-10-14, v1.13.0, GitHub issue #34).**

    In the Supplier card directly under Address, connected recurring schedules are shown with deep links (`Linked to schedule "<Name>"` linking to `/recurring?q=<name>#schedule-<id>`); if unlinked, displays `"No scheduled payments relate to this supplier currently"`. On the Recurring page, an in-place filter search box with a Clear filter button enables instant filtering by schedule name or supplier name. When filtered, any matching schedule is displayed even if cancelled and the hide-cancelled setting is active.
216. **Anchored links land below the sticky header at every width (2026-10-14, v1.13.1, re-opened GitHub issue #34).**

    The household re-opened #34 from production: following a Supplier card's "Linked to schedule" link put the schedule row's top at 24px, under the 85px sticky header (measured in this sandbox's Chromium at 1400×950 with `@sparticuz/chromium`, docs/SANDBOX.md entry 8). The row carried `scroll-mt-6` (24px), and the app's own `ScrollHashIntoView` could not rescue it: Next's route-transition scroll (`layout-router` → `domNode.scrollIntoView()`, block `start`) lands an element at its own `scroll-margin-top`, and this component then called `scrollIntoView({ block: 'nearest' })`, which treats a row *under a sticky header* as already visible — a sticky header is not a scrollport, so nothing else moves it.

    **The header is not a fixed height.** Measured on `/recurring`: 57px on a phone, **121px between 1024px and 1199px** (the desktop nav wraps onto a second row), 85px from 1200px up. A constant cannot clear all three — 24px fails everywhere, and the app's usual 96px (`scroll-mt-24`, decisions 210/213) still fails on a wrapped-nav laptop. So the offset is measured, not guessed:

    - `src/lib/records/anchor-scroll.ts` (pure, `tests/anchor-scroll.test.ts`) owns the rules: the landing is the header plus a 12px gap, and no landing may ever sit above the bar it was measured from.
    - `site-nav.tsx` marks the sticky header (`data-sticky-header`) and publishes its rendered height plus the gap to `<html>` as `--sf-anchor-offset` (ResizeObserver, so it follows the wrap, not just the window).
    - `@utility sf-anchor` (globals.css) spends it as `scroll-margin-top`, so the *browser's* fragment scroll and Next's route-transition scroll land correctly before any JavaScript of ours runs. **Every hash target in the app now uses it** — Recurring schedule rows (`#schedule-{id}`), Purchases rows (`#purchase-{id}`, decision 213), Insights panels, Contracts renewals, Settings cards, supplier cards, task rows, the guide, Projects and the till — replacing 14 baked-in `scroll-mt-*` values. Before the nav has measured anything, the fallback is a phone guess (56px + 12px) below 1024px and the tallest the bar has ever measured — the wrapped 121px, plus the gap — from 1024px up, so a *cold* load's own fragment scroll is already clear of a wrapped nav.
    - `scroll-hash.tsx` (one instance, in the root layout) does the one job a fragment scroll cannot: bringing the target into an inner scrollport, because the laptop schedule list scrolls inside `overflow-y-auto` (decision 164). `scrollIntoView({ block: 'nearest' })` is a no-op for a target already on screen, so it never fights the browser's landing and, because a landing honours `scroll-margin`, it cannot leave the row under the menu. The inner-panel alignment is unchanged: Chromium parks the row at the panel's top edge, re-confirmed by probe with the new margin.

    **What was tried and removed (worth knowing before adding any scroll of our own):** the first cut also had that component *correct the document* when a target ended up behind the header after the fact — re-measuring at 0/200/600ms and calling `window.scrollBy`. It fixed the reported landing, and it broke a neighbour: v1.13.1's own `e2e/charts.spec.ts` deep-links `/settings#commitment-categories`, and on `/charts#commitments` a correction firing at ~350ms — while the page was still growing as its charts rendered — landed between a click's hit-test and its dispatch, so the click missed the `<details>` summary it was aimed at (the test failed 3 runs out of 3; it passes with the correction removed and fails again the moment `scroll-mt-6` is restored on the row). The lesson is in the component: a correct *landing* needs no re-aiming after the fact, and a page that is still settling belongs to the household, not to us. The ruled-out drift case (content that grows after arrival and pushes a target back under the bar) is not the reported bug and is not worth an interaction hazard.

    **Also fixed in this pass (found while proving it):** the Recurring filter box had no hydration readiness signal, so a keystroke landing before hydration was wiped by the hydration render — the rule the till, Purchases filters, theme gallery and category editor already follow (SPEC §15.1, decision 131). The filter row is now `inert` until it can hear and publishes `data-schedules-ready` (`e2e/support.ts` → `waitForScheduleFilter`). It was diagnosed from a *cold* dev server (`.next` removed): the spec failed with the fix stashed as well as applied, so it was pre-existing, not a regression from this decision.

    **Evidence:** `e2e/recurring-hide-cancelled.spec.ts` asserts the linked row clears the header at 1400×950 (85px bar) and again after a cold load at 1100×950 (121px bar, the case no constant can fix); the red state was re-run and confirmed with this work stashed (row top 24px vs header bottom 85px/121px). Full local browser suite, `npm test`, `typecheck`, `format:check`, `themes:check` and `npm run build` are run before the PR.

217. **Small result-and-navigation polish: Purchases total (#38) and Chart C scroll (#39) (2026-10-14, unreleased).**

    Of the open issues #33, #34, #38, #39 and #40, this PR takes the two bounded UI improvements together. #40 needs a separately designed, persistent category-preset model; #33 needs a safe transfer edit contract; #34's sticky-header correction is already in v1.13.1 and remains open for field confirmation.

    **#38.** The Purchases result heading reads `N entries: Total £X` from the *same capped, filtered rows* as the list, not an unfiltered database total. Sum the `purchase.totalPence` once per listed purchase: a category/target hit returns its whole receipt, a refund reduces the sum, and a voided row remains in the history but contributes zero. A short caption says this and that the list includes up to 500 newest matches. Zero matches show `0 entries: Total £0.00`. `sumListedPurchasesPence` (`src/lib/records/purchases.ts`) is tested with a split purchase, a linked refund, a void, category filters, an empty date window and a short list limit; the desktop browser spec checks the number/total against the rows before and after applying a supplier filter.

    **#39.** Chart C's `<Link>` chips already carry a `#personal` fallback for a direct/no-JavaScript visit, but Next's default hash navigation scrolled the chart card to its top every time a chip changed. `scroll={false}` keeps the actual document position during the in-page soft navigation without losing the URL/shareable filter or the hash fallback; `ChartCard` uses `sf-anchor` for direct landings below the measured sticky header. A phone-and-laptop browser regression test first failed by **160px** against v1.13.1, then passed after the fix, in both filter directions. No schema change or release tag requested for this PR.

218. **A saved pot-to-pot transfer is corrected in place — pots, amount, date, note (2026-10-14, v1.14.0, GitHub issue #33).**

    The household's report: on Accounts, Pots & Checkpoints the only thing a saved transfer offered was a Void. "If I forget to add an explanatory note, or at the time feel no note is necessary, I can't go back into that movement and add a note… Similarly if I entered the wrong amount or one of the pots was selected incorrectly I can't fix that with an Edit as I might do if this were a purchase which has full Edit capability, there is a gap in the design which we should change."

    **The gap was above the domain, not in it.** `editTransfer` (`src/lib/records/transfers.ts`) has existed since Phase 2a with the whole correction contract already built and tested — `expectedVersion` optimistic locking, `RecordVoidedError` for a voided row, the two-different-pots rule, a positive whole-pence amount, known pots, `undefined` = unchanged / `null` = clear for the note, and an audit row carrying `before` and `after` (`tests/transfers.test.ts`, "transfer editing and voiding"). What was missing was the UI and the boundary schema and action above it — decision 217 named this "a safe transfer edit contract", and this is that contract.

    **What makes it safe (three layers, in order).** `editTransferEntrySchema` (`src/lib/validation.ts`) requires the record id, the version the page rendered, both pots, the amount and the date, and trims the note; `editTransferAction` (`src/app/actions.ts`) refuses an unauthenticated caller and a read-only support view before anything else, then hands the patch to the domain and returns the domain's own message for `InvalidTransferInputError`, `PotNotFoundError`, `TransferNotFoundError`, `RecordVoidedError` and `VersionConflictError` — a stale form saves nothing and says so. Nothing in the path can turn a transfer into spending: it is still a `transfers` row, excluded from every insight by construction.

    **Two rules the household should know about.** (1) `entered_by` and the entry time (`createdAt`) are never editable, so a correction cannot make a movement look newer than it is — which matters because §7.1's same-day credit rule compares `createdAt` with the checkpoint's (decision 165). Editing a transfer that was absorbed by an earlier same-day checkpoint leaves it absorbed; the *date* is what the household changes when the date was wrong. (2) A blank note **keeps** the current note and a blank date means **unchanged** — the convention every other record edit follows (income, external movements; the purchase edit's own label says the same). The form arrives pre-filled, so a correction is typed over what is there rather than retyped; clearing a note is not offered, and the domain keeps its `null`-means-clear contract for whatever surface needs it later.

    **The UI.** `TransferEditForm` (`src/components/record-forms.tsx`) sits beside the existing `TransferForm`, in the transfer section of `src/app/pots/page.tsx`: every live row in "Transfers between pots" now offers **Edit** next to **Void**, opening with the row's own pots, amount, local date (never later than today, because the record never is: `max={today}`) and note. The card's introduction says so. Recording still happens only in Quick Entry → Move → Between pots (decision 164), and All Transactions stays read-only (§15.3) — it already deep-links each transfer to `/pots?transfer={id}#transfer-{id}`, which is now the page that can fix it.

    **Evidence.** The two new browser specs in `e2e/transactions.spec.ts` were run **red first** against the unmodified `src/` tree (both failed: no Edit affordance on the row — the locator waited out its 120s timeout) and green with the change: "a saved transfer is corrected in place — pots, amount and note (issue #33)" records £12.34 from the till with the wrong destination and no note, checks the editor arrives holding the record, corrects the pot, the amount and the note, and asserts the row reads the corrected record and *only* the corrected record (the old amount is gone — one movement, moved, not a void plus a second entry); "a stale transfer editor saves nothing and says why (issue #33)" loads the same row in a second page before saving in the first, then proves the stale save is refused with the domain's version message and the amount it tried to write was never saved. Both end by voiding their transfer so the shared seed's pot estimates finish where they started. Unit coverage: the schema's boundary cases in `tests/entry-validation.test.ts` (mandatory id and version, zero/negative/fractional amounts, two different pots, missing-as-unchanged, real local dates) and, in `tests/transfers.test.ts`, a correction of pots, amount and date together that proves the entry time is preserved, the old pot keeps no phantom leg, and the audit holds both sides (`transfer.create`, `transfer.edit`). No schema change, no migration.

219. **Pin a default pot for All Transactions (2026-10-15, v1.15.0, GitHub issue #44).**

    The household reported that `/transactions` opened on a pot they did not usually review. The current selection is now an explicit household preference, configured under **Settings → All Transactions**: choose any live pot, change the choice at any time, or clear it to restore the existing fallback. A valid `potId` in the URL always wins, so a target selected in the page and links carrying a target remain authoritative; the saved default applies only when a visit has no valid target. The fallback remains `Main account`, then the first live pot.

    The value lives in the existing tenant-local key/value settings table (`default_transactions_pot_id`) and uses the ordinary audit trail; no database migration or backup-format change. Archived pots cannot be pinned, and a previously pinned pot that is later archived is ignored. The server action uses the request's immutable household context and refuses writes from a read-only support view.

    Coverage: `tests/settings-domain.test.ts` checks unset/set/change/clear, invalid and archived pots, and the audit entries. `e2e/settings.spec.ts` saves a default, verifies `/transactions` opens on it, verifies an explicit page target overrides it, and clears it to restore the old fallback. No schema change, no migration.

220. **By Person month paging preserves the current scroll position (2026-10-15, v1.15.1, GitHub issue #45).**

    The report was a regression in the earlier issue #26 behavior: Prev/Next kept `#panel-persons-heading` in the URL, but Next's default link scrolling followed that fragment during a soft query-string navigation and moved the reader away from their current vertical position. Both links now pass `scroll={false}`. Their month and fragment remain shareable, direct/no-JavaScript visits still use native fragment navigation and the heading's `sf-anchor` offset, and in-place month paging leaves the live viewport where the reader put it. No financial data or schema is changed.

    The browser regression test positions the heading at a known scrolled location, then checks Next and Prev retain `window.scrollY` after delayed anchor checks settle, on both a 390px phone and a 1400px desktop. Run red against the prior code it moved **91px** on the phone; with the fix, both directions stay within **8px** of the starting position at both widths. No migration or backup-format change.

221. **Add items into a split line at the till (2026-10-15, v1.16.0, GitHub issue #46).**

    The household's report: a wider bill often has two or more items of the same parent/child
    category (four clothing lines and three appliances on one fictional Amazon order). Today they
    have to back out of the app and sum those items on a calculator before they can type the split
    line. The asked-for shape is unobtrusive: a **"+"** to the right of the Line 2 amount, and when
    they tap it they add another item of that category whose amount is added to the current line.

    **Same allocation line, not a new split.** Several items of Personal / Clothing & Shoes for the
    same person are one line. Creating a split per sock would fight §9.3 (lines must total the
    payment exactly, each with one category and one target) and would make the remainder harder to
    follow. So "+" is a running total on the line they already have: integer pence, `addToLineAmount`
    in `src/lib/records/quick-entry.ts`. Empty or zero current starts the line at the addend; a
    half-typed current, a non-positive addend or a sum past `MAX_ABS_PENCE` holds. Line 1's auto
    remainder (decision 177) is untouched — the "+" is offered on every extra split line, and on
    Line 1 only after it has been taken over, so adding never silently stops the following.

    **Till rules that still hold.** The "+" is `type="button"` and 48×48px. Tapping it focuses the
    item field because they tapped it (decision 151). Enter in that field adds and never submits
    the purchase. A successful save and "Add another" close the adder. Removing a line closes it.
    No schema, no migration, no change to what is stored.

    Coverage: `tests/quick-entry.test.ts` walks the four clothing amounts to £70.39 and the hold
    cases. `e2e/remainder.spec.ts` fills a £100 till total, adds a split, proves Line 1 has no "+",
    then adds £38.50 + £11.65 + £8.25 + £11.99 into Line 2 via Enter and asserts Line 2 is £70.39
    with Line 1 remainder £29.61, at 393px and 1400px.

    **v1.16.1 layout follow-up:** category, amount row and Add item stack at every width,
    giving the adder the full card width on laptop rather than the old 0.8fr amount
    column. The separate "+" retains a 48×48px target (explicit height defeats the
    till-wide 44px minimum override). Totalling is unchanged. Geometry coverage ran
    red on the old side-by-side layout and green after stacking; all four remainder
    specs and three mobile split specs passed locally.

222. **A hash landing is verified, not assumed (2026-10-15, v1.16.2, GitHub issue #43).**

    The household reported the Supplier card's "Linked to schedule" journey still broken in production after v1.13.1: the filtered schedule's vertical position was wrong, the schedule detail sat behind the menu bar, and the page had to be scrolled by hand to bring it into view. Decision 216 had made the landing depend on one assumption — that every browser honours the target's `scroll-margin-top` while performing Next's bare `scrollIntoView()` (the layout router passes no alignment arguments) and its own fragment scroll. Chromium honours it, which is why every sandbox probe and CI check for v1.13.1 passed at 390/768/1024/1100/1366/1400px, soft and cold; a browser that ignores the margin (older WebKit is the known case — this app already ships a legacy PDF build for older iPhones, decision 192's context) lands the row at viewport top 0, where `scrollIntoView({ block: 'nearest' })` then treats it as already visible, because a sticky header is not a scrollport. Nothing ever rescued that landing.

    **Reproduction first.** `e2e/recurring-hide-cancelled.spec.ts` gained a test that strips the `sf-anchor` margin in-page (`scroll-margin-top: 0 !important`, kept applied across the parser and soft navigations), simulating exactly such a browser. Against v1.16.1 it ran red in the reported shape — row top at 0 under an 85px header, still there 1.2s later, on desktop and again cold at 390px. A phone-width supplier journey test was added alongside it (the reported journey had only ever been asserted at laptop widths).

    **The fix keeps decision 216's landing and verifies it.** `sf-anchor`, the measured `--sf-anchor-offset` and the inner-scrollport `block: 'nearest'` nudge are unchanged. The scroll pass (`scroll-hash.tsx`) now also measures each settle sample (0/150/350ms, as before) against the real header: `anchorCorrectionDelta` (pure, `src/lib/records/anchor-scroll.ts`) returns the `window.scrollBy` delta only when the target's top is actually above the header's bottom edge, landing it where the margin would have — header bottom plus the 12px gap. In the margin-stripped simulation the row now corrects 0 → 97px (85px bar + 12px gap); in Chromium nothing changes, because the target is never behind the bar and the correction never fires.

    **The guards are decision 216's lesson, kept.** That decision removed an unguarded correction (fixed-delay re-measuring and `scrollBy`) after it moved `/charts` under a click whose hit-test had already happened. This correction may fire only when (a) the target has sat behind the header *unmoving* for `ANCHOR_CORRECTION_STABLE_MS` (100ms) — a page still growing keeps moving its target and keeps restarting the clock; (b) once per `pathname` + `#hash`; and (c) it is disarmed by the household's first `pointerdown`, `wheel`, `touchstart` or `keydown`. `tests/anchor-scroll.test.ts` pins the delta rule (clear-by-anything is the household's landing; only the missing distance plus gap is corrected) and the wiring of all three guards. The charts, insights and transactions browser projects — including the exact commitments-chart settings journey that caught the 216 attempt — pass unchanged locally.

    No schema, migration, backup-format or financial-data change; the change is one client component, one pure helper and their tests.


223. **Chart D becomes Spending trends with household category presets (2026-10-15, issue #40, v1.17.0).**

    The household accepted the name **Spending trends** and requested an Arena preview before publication.
    The chart now asks “How is this spending changing month by month?” and selects a saved category group
    from a dropdown, with `router.push(..., { scroll: false })` and a stable `preset` URL ID. The old
    schedule-only control and category lists are gone; reported monthly totals, comparison, table twins,
    hatch and purchase drill-downs remain. This is actual net spending, not projected commitments.

    Settings has a create/rename/edit/delete manager with an expandable, mixed-state parent/child tree,
    all/schedule-category/clear shortcuts, counts and confirmation before deletion. Parent and schedule
    selections save snapshots of child IDs; no silent future additions. Retired categories stay selectable
    for historical reporting. The old selection becomes Fixed commitments on a read-only compatibility
    path, falling back to schedule categories only if never configured. First mutation persists the
    collection; deleting every preset leaves an explicit empty collection.

    Storage is `spending_category_presets` in the household settings table, with stable IDs, validated
    leaf IDs, trimmed unique names (1–60 chars), collection-version conflict refusal and atomic audit.
    Authenticated actions refuse read-only support access. No migration or backup-format change.
    Legacy series/domain helpers remain for the worked example and backward-compatibility tests.

    Verification: `tests/spending-presets.test.ts`, reconciliation in `tests/charts-view.test.ts`, and
    the Chart D journey in `e2e/charts.spec.ts` (CRUD, mixed ticks, persistence, filtered drill-downs,
    deleted-ID fallback, query preservation and scroll preservation in both directions at 390/1400px).
    Local browser execution uses SANDBOX entry 8. The household accepted the preview, requested the final label “Create/Edit preset”, and authorised a stable release.

224. **The Recurring calendar summarizes crowded days, then opens the exact schedule (2026-10-15, GitHub issue #53, v1.18.0-rc.1; accepted and stable in v1.19.0).**

    The report: listing every schedule name and amount inside a calendar cell makes a busy day
    unreadable. Each populated day now shows only its item count and combined amount beside the day
    number. Selecting that summary opens a full-width details panel below the grid, with the names,
    amounts, schedule kind and conversion state. The amount is the gross sum of all listed instances;
    a same-day expected receipt is not netted against outgoings.

    Each detail row links back to Recurring with the readable name in the filter and an exact
    `scheduleId` constraint, so similarly named schedules cannot leak into the result. The
    `#schedule-edit-{id}` target is the Edit disclosure itself; the page opens it on direct and soft
    navigation, and its measured `sf-anchor` offset keeps the expanded editor below the sticky header.
    The day grid and detail list still use the same `listInstances` rows. This is presentation and
    navigation only: no financial data, schema, migration or backup-format change.

225. **A transfer between the household's own pots opens in place on All Transactions; the pots page's transfer card is retired (2026-10-15, GitHub issue #55, v1.19.0).**

    The household's report: Accounts, Pots & Checkpoints is the least intuitive page, and its
    "Transfers between pots" card the worst of it — a layout that degraded as transfers accumulated,
    whose only job was Edit or Void, repeating rows All Transactions already lists. Asked for: selecting
    a transfer in All Transactions (their example, Main account's `2026-10-14 TX< Sam's cash +£1,100.00
    1st bridging payment…` row) should not navigate away but open an edit section **directly below that
    row**, covering edit and void; transfers only — purchases keep their link to Purchases; and the card
    removed if possible. It was possible with **no schema, migration, backup-format or domain change**:
    `editTransfer` / `voidTransfer` and their actions (decision 218) are reused untouched.

    **The row and the panel.** `TransferActivityRow` (`src/components/transfer-activity-row.tsx`) renders
    an internal transfer's row with the other pot's name as a disclosure button (`aria-expanded`,
    Horizon's dotted underline, decision 203; `data-transfer-ready` + `inert` until hydrated, decision
    131). The panel is a `<tr><td colSpan={7}>` straight after the row, pinned to the visible width as
    Horizon's breakdown is, holding the transfer's identity line, the existing `TransferEditForm` and
    `VoidForm` side by side (stacked on a phone), and Close. One transfer is open at a time. Every other
    family still renders through the page's linked `ActivityTableRow`.

    **The open transfer lives in the URL** (`?transfer={id}#transfer-{id}`) so the server knows which
    transfer is open. `OpenTransferProvider` replaces the URL through `router.replace(…, { scroll: false })`
    — no history entry — and shows the new state at once with `useOptimistic` while that navigation
    completes. *Not* `history.replaceState`, which was the first design: Next's router then keeps the old
    query in its tree while the URL has the new one, so the first save after opening returns a page
    segment the router treats as new and scrolls to `#transfer-{id}`. Measured in the browser before the
    switch: a note-only save moved the page 439px; the regression spec below ran red at **333px** with
    `replaceState` and green with the router.

    **A save never pulls the panel away.** A void always removes the transfer from the projection
    (voids are never movements), and a correction can (two other pots, or a date outside the window).
    The page then pins the open transfer (`src/lib/records/transfer-activity.ts`, pure):
    `pinnedTransferReason` names why (`voided` › `elsewhere` › `outside-window` › `hidden` past the row
    cap), `transferActivityRow` / `transferActivityOrder` project it exactly as a live row, and
    `withPinnedTransfer` inserts it with the projection's own comparator (`activity-order.ts`, shared so
    the two cannot drift) — the very position it held while live. Pinned rows are muted, outside totals,
    stripe and running balance; voided ones show their reason and no forms; moved or re-dated ones keep
    their forms and link to where they are live again (`pinnedTransferLinks`). Closing the panel removes
    the pinned row at once. The first placement rule (by date only) was caught by the wider browser run:
    three same-day, date-only boundary movements shared the transfer's end-of-day instant, the live
    transfer sorted first (transfers rank ahead of boundary money) but the pin dropped below them, and
    the panel moved 163px; `tests/transfer-activity.test.ts` now pins that exact case and a DB-backed
    "same index live and pinned" check.

    **A real bug the panel exposed in `TransferEditForm`.** React resets a form after its action
    succeeds, and an uncontrolled `<select>` resets to the option it was *mounted* with — React applies a
    changed `defaultValue` to inputs but never to a select. After correcting a pot the picker therefore
    showed the old pot again, and the next save (say, of the amount) would quietly write it back. The old
    card had the same latent flaw. Both pot pickers are now keyed by the saved pot id, so they re-mount
    holding the saved value while the form — and its success message — survives; the correction spec
    asserts the pickers after a save.

    **Old links and the guide.** `/pots?transfer={id}` redirects to `transferActivityHref`: the
    household's usual All Transactions pot when the transfer touches it (`defaultActivityPot`, now shared
    with the page: saved default, `Main account`, first pot), else the pot the money left, over the last
    30 days when they hold its date, else about a month around it. The guide's transfers section points
    at All Transactions. Read-only support views see the forms, and the actions refuse them as before.

    **Supersedes** the transfer clauses of decisions 101 and 105 (All Transactions renders no forms; the
    `transfer-{id}` anchor on `/pots`), 164 (the review list and void on Accounts & Pots, and
    `/pots?transfer=` as the canonical transfer URL) and 218's UI location (its correction contract stands).
    Trade-offs accepted with the household: voided transfers are no longer listed anywhere in the UI (the
    audit trail keeps them), and an older transfer is reached by widening the dates.

    Coverage: `tests/transfer-activity.test.ts` (18: URL parsing, windows, the usual pot, reasons, links,
    placement incl. same-instant ties, DB-backed void/move projections, wiring), `tests/activity.test.ts`
    (the in-place link and transfer facts), `tests/guide.test.ts`. `e2e/transactions.spec.ts` rewrites
    the three card specs for the panel (open beneath the row, void → pinned → close; correct pots, amount
    and note with the pickers holding the saved pots; the stale-version refusal) and adds the moved-transfer
    spec (pinned with links, panel within 60px across the save, put right in place, `/pots` has no card,
    the old link redirects and opens it). The specs look a transfer up only among transfer rows
    (`tr[id^="transfer-"]`), never by amount across the whole table. The first PR browser run failed
    because of that: the `mobile` project, which runs earlier in CI, records a £12.34 till purchase on
    the same pot and day as the corrected transfer's old amount. When checking an e2e change locally,
    run the projects that precede it in CI as well, not just its own project.

226. **A purchase opens in place on All Transactions; a refund keeps its link to Purchases (2026-10-15,
    GitHub issue #57, v1.20.0).** The household asked to replicate decision 225's in-place editing for
    "PUR" and "DD" rows. Asked and answered: `PUR`, `DD` **and** `SO` open in place (they are the same
    record with the same canonical editor — a standing order is a schedule conversion like a direct
    debit, not a different kind of thing), the panel offers the transfer panel's own two actions
    (**Correct it** + **Void it**; a Refund action was declined, because recording a refund belongs
    beside the original it came back from), and a **refund** (`REF`) keeps its link to Purchases —
    its amount lives in the negative and its form belongs where the refund rules are taught.

    **The row and the panel.** `PurchaseActivityRow` (`src/components/purchase-activity-row.tsx`) makes
    the supplier's name — or the schedule's name when the record has none, as a standing order may — a
    disclosure button (`aria-expanded`, Horizon's dotted underline, decision 203; `data-purchase-ready`
    + `inert` until hydrated, decision 131). The panel is the transfer panel: a `<tr><td colSpan={7}>`
    straight after the row, the record named in full (`Purchase / Direct debit / Standing order #{id} ·
    {supplier}`, amount, date, who recorded it, and whether the schedule made it or it was hand-recorded),
    the Purchases page's **own** `PurchaseEditForm` and `VoidForm`, and Close. Correcting a converted
    `DD`/`SO` never touches the schedule that produced it (§11.1) and the schedule link stays beside the
    code. The editor's options are the Purchases page's own: the live declared leaf categories in tree
    order (`leafCategoryOptions`, extracted from `buildEntryData` so the two pages cannot drift), people
    and vehicles.

    **One open record, two URLs.** `?purchase={id}#purchase-{id}` joins `?transfer={id}` in the shared
    contract (`src/lib/records/in-place-activity.ts`, `src/components/activity-open-row.tsx`): the two
    parameters are alternatives, so opening one closes the other, and a URL carrying both resolves to the
    transfer (the older contract, so an old link keeps its meaning; a nonsense `transfer` does not shadow
    a valid `purchase`). Both rows keep the URL the same way — `router.replace(…, { scroll: false })`
    plus `useOptimistic`, never `history.replaceState` (decision 225's measured lesson) — and the
    provider, the ready hook, the panel frame and the pinned-entry placement now live in one module
    rather than in the transfer row.

    **A save never pulls the panel out from under the household.** `purchase-activity.ts` (pure) mirrors
    the transfer rules: `pinnedPurchaseReason` names why the open purchase is pinned instead of listed
    (`voided` › `outside-window` › `hidden` past the row cap — never `elsewhere`, because the correction
    form cannot move a purchase to another pot), `purchaseActivityRow` projects it exactly as the live
    row (the same `purchaseActivityRowFrom` the projection uses, so the two cannot drift), and
    `withPinnedPurchase` places it with the shared `compareActivityOrder` at the index the projection
    would list it. Pinned purchases are muted, outside totals, stripe and running balance; a voided one
    keeps its reason and shows **See it on Purchases →** (`/purchases?voidedOnly=1#purchase-{id}`, the one
    page where a voided record is readable) and no forms; a re-dated one keeps its forms and links to
    "Show <pot> around <date>". Closing the panel lets the pinned row go.

    Placement is by the record's own date, so a re-date that takes it out of the window moves the pinned
    row to where the projection would list it (the bottom, for an older date) — **not** to the pixel it
    held while live. A void, which cannot change the date, keeps the row exactly where the household was
    reading it, and the spec measures the page for that case (**≤ 4px**; the abandoned
    `history.replaceState` moved it 439px and ran red at 333px). Because a re-dated row can move far
    from the part of the table the household is looking at, both rows call the shared
    `useKeepPinnedPanelInView` (`activity-open-row.tsx`): when a record becomes pinned and its panel is
    **entirely** off screen, the panel comes back to the middle of the view once — never a general scroll
    rule, so an in-view panel, a panel the household scrolled away from, and a hash landing are untouched
    and the page never moves under a pointer (SANDBOX 22). The transaction spec's first draft asserted the
    panel stayed within 60px of its old position for the re-date; it ran red at 931px because the row had
    legitimately moved, so the spec now asserts the panel is in the viewport instead.

    Coverage: `tests/purchase-activity.test.ts` (16: URL parsing and the transfer/purchase precedence,
    windows, reasons in order, links, placement, DB-backed hand-recorded / converted / refunded / voided
    / re-dated projections and rows, wiring), `tests/transfer-activity.test.ts` (18, with the wiring
    suite now pointed at the shared provider), `tests/activity.test.ts`, `tests/guide.test.ts`.
    `e2e/transactions.spec.ts` adds three journeys — correcting at the till and voiding in place, a
    re-date out of the window (pinned, honest, no page scroll) and a refund recorded on Purchases that
    keeps its link and still lands below the sticky header (issue #30) — and rewrites the projection
    spec, whose purchase row is no longer a link. **Supersedes** decision 101's "no forms on this page"
    for purchases, alongside decision 225's exception for transfers.

227. **The Purchases page's Record refund button is repaired (2026-10-15, found while testing issue #57,
    v1.20.0).** Writing the browser journey that proves a `REF` row keeps its link to Purchases meant
    recording a real refund through the UI — and the browser found that **no refund could ever be
    recorded there**. `RefundForm` and `addRefundAction` were never wired to each other: the form sent
    `purchaseId` where the action parses `refundOfPurchaseId`, and it sent neither the `potId` nor the
    `amount`, so every attempt failed with `Invalid input: expected number, received null`; it also sent
    its lines in the editor's typed-text shape (`{amount: '12.50'}`) where the action's schema reads
    whole pence (`amountPence`). The action, for its part, passed the parsed `null` supplier and payer
    straight through, which reads to `createRefund` as "no supplier" rather than "inherit the original's"
    (SPEC §9.5) and would have left the refund unlinked from the shop it came back from.

    The form and the action now share one contract, named field by field (`refundOfPurchaseId`, `potId`,
    `amount` — the sum of the lines, computed once — and `amountPence` lines, positive magnitudes that
    the action flips), the original's supplier and payer are inherited when the form provides neither,
    and `tests/purchases.test.ts` pins every field name in both halves so a silent drift cannot happen
    again. A browser journey in `e2e/transactions.spec.ts` records a refund of a seeded shop from the
    Purchases page, reads its `REF` row in All Transactions, follows its link back to Purchases, checks
    the anchored landing below the sticky header (issue #30) and voids it, leaving the ledger as it
    found it. Reported to the household as a separate, independently reviewable repair.
228. **Borrowing gets its own page: the Owed & owing / Borrow & repay cards are reshaped into one
    combined ledger (2026-10-16, GitHub issue #60; design written up in `docs/BORROWING_PAGE_PLAN.md`
    and worked through with the household before any code).** The household's report: informal
    borrowing is laid out unintuitively — Owed & owing, Borrow & repay and the boundary history are
    three disconnected cards on Accounts, Pots & Checkpoints. Three shapes of borrowing must be
    supported: scheduled informal support ("£1,000 on the 13th for 5 months", which must keep
    projecting as *expected, never received*), one-off IOUs in both directions (borrow £50 from a
    friend; lend £75 to a son with partial repayments), and formal borrowing (loan agreements and
    credit cards — out of scope, already elsewhere). Asked for: a transaction-style history per
    arrangement (Date recorded / From-To / Amt in / Amt repaid / running balance), an amount that
    opens an inline detail beneath its row with Edit/Void/note and which pot the money landed in, a
    From/To filter, a setup card (select-or-create person → recurring vs one-off), a repay panel for
    both directions — and **everything on a new Borrowing page in the menu**.

    **What moved and what stayed.** Loans only move: the summary strip (each IOU's honest status
    word), the setup and edit/delete controls, borrow/repay entry and the boundary history's loan
    rows. Swaps and Other money stay on Accounts, Pots & Checkpoints, whose history panel is now
    "Recent swaps & other money"; a signpost card carries the running owed figures and an **Open
    Borrowing** link. Old links keep working: `/pots?external={id}` for a loan redirects to
    `/borrowing?external={id}` with that row's panel open; `/pots#debt-{id}` bookmarks are forwarded
    client-side (a fragment never reaches the server — `BorrowingMovedRedirect`) to the summary
    strip's identically-named anchors; All Transactions' `LN` rows now open the borrowing panel and
    `EXP<` rows link `/borrowing#debt-{id}` ("Open the loan panel"). **No schema, migration,
    backup-format or domain change** — loans remain external movements of kind `loan` bound to a
    debt (§10.2), and `createDebt` / `editDebt` / `deleteDebt` / `createExternalMovement` /
    `editExternalMovement` / `voidExternalMovement` are reused untouched.

    **The ledger** (`src/lib/records/borrowing.ts`, pure view over the records layer; rows typed and
    tested like a table sheet): one combined history, Date / From-To / Money in / Money out /
    Balance, oldest first with a newest-first toggle. The balance is **per arrangement** and signed
    the way the household's tables already are: **− we owe, + owed to us** ("−£1,000.00"; "£50.00
    (owed)"; "—" for a voided row, which stays struck through with its reason and moves no balance).
    Two IOUs with one person are never netted — the chip reads `we owe £1,000.00 · owed to us
    £400.00`, never £600. A person's expected payments are **greyed rows at their expected dates**,
    badged `expected — not recorded yet`, each with a one-click **Record this month's £1,000** that
    prefills the record panel (`?debt=&what=in&amountPence=#record`) — the recording is the real
    movement and the expectation-silencing matches it (the amount and day ride as a pair, decision
    219's model unchanged). Expected rows project strictly after today through a 365-day lookahead
    (weekend days landing on the Friday before), capped at six per plan so an open-ended one does
    not flood the ledger; a finite plan shows every remaining payment.

    **Clicking an amount opens the detail beneath its row** — the shared in-place contract of
    decisions 225/226 (`ActivityPanel`, extended with an optional `columnCount` for this five-column
    table; open record in `?external=`, `router.replace` + `useOptimistic`, never
    `history.replaceState`; `data-borrowing-ready` + `inert` until hydrated, decision 131; one row
    open at a time). The panel speaks in plain words (which pot the money landed in — "Came in as
    cash to Alex's cash." / "Went out from Main account." — the note, who entered it and when), links
    **Show {pot} around {date}** into All Transactions, and puts **Correct it** (pot, amount, date,
    note) and **Void it** side by side from `md` up. It finally closes the gap the old cards left:
    loan movements were voidable but not editable through any UI.

    **The setup card** is one flow (`BorrowSetupForm` → `startBorrowingAction`, which composes
    `createDebt` → `editDebt(expectedInflow)` → `createExternalMovement`, each still its own audited
    record): select a person already tracked — the card becomes a movement form for their
    arrangement — or "Someone new…", then **recurring** (the expectation fields DebtEditForm already
    had, surfaced at creation: £X on day N, until D or for N payments with Fill the end date) or
    **one-off** (person, amount, pot, note) or **just tracking** (decision 167's deletable empty
    setup). "Cash or bank transfer" stayed with the household's choice: pot plus note (Borrow into
    the Cash pot, note "cash handed over — banked 18th", then an ordinary pot-to-pot Move when it is
    banked) — no "How did it move?" field. The **record panel** is `LoanMovementForm` with presets
    (keyed remount, the decision 208 lesson) for both directions; the repay panel is never more than
    one tap away.

    **The From/To filter** (`?who=`) groups the ledger to one person and personalises the column
    captions ("Amt in (borrowed) / Amt repaid" for a we-owe arrangement, "Amt in (repaid to us) / Amt
    out (lent)" for a they-owe one). The summary strip keeps Edit (expected support, amounts, notes)
    and Delete (an empty mistaken setup only, decision 167 — a debt with voided-only history still
    cannot be deleted). Along the way `addExternalMovementAction`'s confirmation wording was made
    direction-honest (a money-in on a "they owe us" arrangement now reads "…repaid £25.00 — the
    balance is reduced", never "Borrowed…"), matching `describeLoanMovement`'s four phrases.

    Coverage: `tests/borrowing-ledger.test.ts` (6: the signed running balance and its rows, the
    filter's grouping and chips, voided history, the expectation's projection and silencing, two
    IOUs under one person never netted, the panel's phrases); `tests/activity.test.ts` re-pointed;
    the field-name pins of `tests/purchases.test.ts` extended by `e2e/borrowing.spec.ts`'s four
    journeys (recurring setup → expected row → prefilled record; one-off lend + repayment running
    the balance under the filter; the inline panel's correction and void; the pots signpost and the
    two old-link forwards). `e2e/debt-lifecycle.spec.ts` moves to the new page; the transactions
    suite's expectation journey re-runs end-to-end through it. The full unit suite (998 tests) and
    the full browser suite (132) are green locally (SANDBOX entry 8). Awaiting the household's
    review on the Arena preview before release.
229. **Chart E ("Where the money went") folds its selector inside the chart card and tucks its
    caption behind an `i` button (2026-10-16, GitHub issue #61, v1.22.0).** The household noted
    that Chart E's "Selector" card sat beside the chart as a separate visual panel with four
    lines of boilerplate (*"Selector"*, *"Choose what to count"*, *"By default this is since last
    payday…"* and *"Time window"*), and that the long `Reported: Net spending by parent category…`
    caption consumed vertical space under the figure.

    - **In-card scopes disclosure:** `MixScopes` (`src/components/charts/mix-category-tree.tsx`)
      lives inside the Chart E (`#mix`) card via `ChartFigure`'s `headerAction` and `topSlot`
      props. A top-right **Change chart scopes** button toggles `#mix-controls` open and closed
      (collapsed by default).
    - **Explicit Show submission & persistent panel:** clicking a quick-window pill (**Since last
      payday**, **Last full payday cycle**, **Month to date**) updates the `From` and `To` date
      inputs in place without auto-navigating, so any category-tree changes made alongside the
      window selection are preserved until **Show** is pressed. Pressing **Show** navigates via
      `router.push(\`/charts?\${params.toString()}#mix\`, { scroll: false })` and keeps the scopes
      panel open until the user closes it or navigates away.
    - **Two-column layout & `i` caption:** Chart D and Chart E share a two-column grid while keeping
      the pie SVG large, and `ChartFigure`'s `collapseCaption` prop hides both the `Reported` badge
      and caption text behind a compact `i` (`aria-label="Chart information"`) summary button.
230. **Borrowing inline per-person recording, collapsed new-person setup, and repayment/outflow
    sanity checks (2026-10-16, GitHub issue #63, v1.22.0).** Reviewing `v1.21.0`, the household
    pointed out that the standalone **Record money in or out** card at the bottom of `/borrowing`
    was redundant with the action links on each person's card at the top, and asked for three
    refinements plus three guardrails:

    - **Inline recording on each person's card (`PersonDebtRecord`):** clicking **Record
      borrowing** / **Record a repayment** (or **Record a loan out** / **Record what they repaid**)
      opens a compact inline form inside `#debt-{id}` with only the four necessary fields (`Which
      pot did it touch?`, `Amount (£)`, `When`, `Note`) and auto-collapses `2000ms` after a
      successful save. Expected rows in the ledger link to
      `?debt={id}&what=in&amountPence={pence}#debt-{id}` so clicking **Record this month's £X**
      opens that person's inline form pre-filled with the expected amount. The standalone bottom
      **Record money in or out** card is removed.
    - **Collapsed new-person setup below the ledger (`BorrowSetupSection`):** moved below the
      ledger panel, renamed **Setup new Borrowing or lending**, collapsed by default with a
      down-arrow disclosure icon, dedicated strictly to new people (no existing-person dropdown),
      and auto-collapsing `2000ms` after a successful save.
    - **Repayment and outflow sanity checks (`evaluateOutflowSanityCheck`, `checkLoanCashPotBalance`
      and `addExternalMovementAction`):**
      1. **Debt overpayment block:** repayments (`we_owe` + `out` or `they_owe` + `in`) cannot
         exceed the arrangement's current outstanding balance (`debtBalance(db, debt).balancePence`).
         Entering more than is owed (or any repayment on a settled £0 arrangement) renders a red
         `role="alert"` explaining the excess, disables **Record it**, and is refused server-side.
      2. **Cash pot shortfall block:** any borrowing outflow (`we_owe` repayment or `they_owe`
         loan out) from a **cash pot** whose estimated balance (`getMoneySnapshot`) is less than
         the payment renders a red `role="alert"` naming the shortfall, disables submission, and
         is refused server-side by `startBorrowingAction` and `addExternalMovementAction`.
      3. **Bank account below-zero warning:** any outflow from a **bank account** that will take
         its estimated balance below zero renders an amber warning showing the projected negative
         balance while still allowing submission.

231. **The boundary history nests each swap into one object, and the redundant Owed & owing card is
    gone (2026-10-16, GitHub issue #65, v1.23.0).** The household's
    report: on Accounts, Pots & Checkpoints, *"Recent swaps & other money is not particularly
    intuitive at first glance"* — a swap appeared as two unrelated-looking rows, and a swap could be
    edited in two different places. Asked for: the related legs **nested** and re-worded so the pair
    reads as one record, a small pointer arrow (a vertical leg joining a short horizontal leg with a
    right-pointing arrowhead) before the **Swap in** line, alternate row formatting inside each pair,
    an **Edit** that opens inline as the "Recent swaps" list already did — and the removal of the
    "Recent swaps" list from the **Swap with someone outside** card so there is only one place in the
    page to edit a swap. Separately: *"remove redundant 'Owed and owing' panel. It's no longer
    needed."*

    - **One nested object per swap** (`src/lib/records/external-history.ts` +
      `src/components/external-history.tsx`). The panel keeps ONE newest-first feed, but the two legs
      of a swap are grouped by their exchange key into a single `.sf-…`-free `<div data-swap-pair>`
      showing, in order: the **in** leg (`Swap in £40.00 from Sam · into Cash - Alex`, its note, who
      entered it, `+£40.00`, Edit and Void); the nested **out** leg on the panel's alternate shade,
      indented behind an inline SVG pointer (vertical leg → short horizontal leg → right-pointing
      arrowhead) and worded the same way (`Swap out £40.00 to Sam · from Main account`, `−£40.00`);
      and a footer carrying the pair's badge plus **Void both legs**. `describeSwapLeg` and
      `describeBoundaryMovement` replace the bare `describeExternalMovement` labels here, so the pot
      and its preposition are always spelled out.
    - **The pair's badge is the old list's honesty, unchanged:** `net £0.00` (green) when both legs
      are live and balanced; `legs differ · net +£2.50` (amber) after a one-leg correction;
      `one leg voided · net −£15.00` (amber) when one leg was voided alone; `voided` (grey) when both
      went. The net counts live legs only, so a half-voided pair reads the difference rather than
      pretending to balance — pinned by `tests/external-history.test.ts`.
    - **One place to fix a swap.** The "Recent swaps" list inside the swap card is gone; each leg's
      Edit/Void is a real button (`aria-expanded`/`aria-controls` on the leg's own `#external-{id}`)
      that opens that leg's `ExternalMovementEditForm` or `VoidForm` inline beneath it, one panel at
      a time. Other money gets the identical two controls, in the same feed.
    - **Wording and layout choices worth recording:** the fetch window is deliberately wider than the
      list it feeds (`EXTERNAL_HISTORY_FETCH_LIMIT` 60 rows → `EXTERNAL_HISTORY_DISPLAY_LIMIT` 20
      entries), because two rows now make one entry — a pair is never split by the limit; a
      `?external={id}` deep link still pins its record to the top with the "showing the record you
      linked to" note, and a pinned swap leg brings its partner with it so the object is whole; the
      history panel carries `id="swap-history"` and the pot cards' "Recent swaps involving …" links
      plus All Transactions' "Open the swap list" secondary link point at it (they pointed at `#swaps`
      before, which now only names the recording card).
    - **The "Owed & owing" signpost is removed** from Accounts, Pots & Checkpoints (component and its
      section), and the borrowing `<BorrowingMovedRedirect>` now lives in the swap card's grid slot
      alone. An old `/pots?external={id}` loan link still redirects to `/borrowing?external={id}` and a
      `#debt-{id}` bookmark is still forwarded client-side, so nothing the household had bookmarked
      breaks. The history panel's own copy says where borrowing lives.

    Coverage: `tests/external-history.test.ts` (11: grouping and ordering, the honest half-pair, the
    pinned deep link, all four badge states, the wording, and the fetch/draw ratio that protects a
    pair from the limit); `tests/activity.test.ts` re-pointed to `/pots#swap-history`;
    `e2e/external-money.spec.ts` rewritten as two journeys (record → nested object → inline edit of a
    leg → single-leg void → the pot-card link; and record → void both legs with one reason, both legs
    struck through and their controls gone); `e2e/borrowing.spec.ts`'s pots-page test now asserts the
    signpost is gone and the history panel's link to Borrowing works. No schema, migration, backup
    format or domain change — this is presentation and navigation only. Reviewed and approved by the
    household on the Arena preview (both judgement calls: the arrow marks the nested leg, and each leg
    keeps its own Edit/Void with the pair-level void in the footer) before stable `v1.23.0` was cut.

232. **The ledger tells the truth in plain words, keeps the reader in place, and the line items open
    where they were asked for (2026-10-16, GitHub issue #68, v1.25.0).** The household's report: the
    Borrowing page and the Insights page both "lose your place" — a sort order change threw the reader
    back to the top of the page, and on Insights the line items opened *below the whole card*, so
    closing them stranded the reader in the middle of nowhere. Alongside it, a visual pass: the word
    "Settled" was legal-sounding where the household wanted plain English, and a ledger on a cadence
    showed three future rows it had already told them about.

    - **"Nothing owing", and nothing to repay.** An arrangement whose balance has been brought to zero
      (or below) now reads **"Nothing owing"** on the person's card and in the ledger's status chip —
      the label the household asked for, in place of "Settled" (`src/lib/records/debts.ts`). While
      nothing is owed, the repayment action on the card is **greyed out** (`src/components/borrowing-forms.tsx`):
      a `<span aria-disabled="true">`, not a disabled `<button>`, so it is skipped by the keyboard and
      screen readers instead of inviting an action that the server would refuse. A balance that is
      negative is still "Nothing owing" — the household is ahead, and there is nothing to repay.
    - **The ledger is a history, so it shows history.** A plan on a cadence used to print three
      "expected — not recorded yet" rows in the ledger; now it prints **only the next one**
      (`EXPECTED_ROWS_PER_DEBT = 1` in `src/lib/records/borrowing.ts`) — the plan in full is already on
      the person's card, and the ledger's job is what has happened plus the one nudge for what is next.
    - **Newest first, and the reader stays where they were.** The ledger's default order is now
      **newest first** (`?order=oldest` asks for the old way round; the default is left out of the URL
      so a plain `/borrowing` is the short, honest link). The sort and filter links are `<Link
      scroll={false}>`, so changing the order or the person filter **keeps the vertical scroll
      position** instead of jumping to the top (`src/app/borrowing/page.tsx`).
    - **The line items open where they were clicked.** On Insights, a **category cell** now opens its
      line items in a table row **immediately below the category line that was clicked** — a
      `<tr colSpan={columnCount}>` inside the same table, pinned to the visible width
      (`sticky left-0 w-[min(calc(100vw-4rem),100%)]`) so it stays on screen on a phone — instead of
      below the whole card, which is what made closing it a small act of navigation (`src/app/insights/page.tsx`).
    - **Closing puts the reader back where they started.** Every close link now carries a **return
      anchor** (`insightsHref(state, anchor)`): a month total closes to the **top of the page** (a
      fragment-less URL lands at `scrollY 0`, so the month totals are showing again); a category cell
      closes to **its own row** (`#month-category-{parentId}`); a By-person figure closes to **that
      person's card** (`#person-{id}`); a vehicle figure closes to **that vehicle's card**
      (`#vehicle-{id}`), whose top then sits just below the sticky menu — the position the household
      asked for. The mechanics: an existing fragment target is scrolled to just below the 85px sticky
      header (12px gap, `sf-anchor`); a missing target leaves the browser where it was; a URL with no
      fragment lands at the top.
    - **A zero figure opens nothing.** A **£0.00** amount on the Insights month table is a muted
      non-link, not a link to an empty panel: there is nothing behind a zero figure.

    Coverage: `tests/borrowing-ledger.test.ts` (the newest-first default, the single expected row, the
    nothing-owing balance); `tests/debt-status.test.ts` and `tests/external-money.test.ts` (the new
    status word); `tests/guide.test.ts` (the guide's own wording);
    `e2e/borrowing.spec.ts` (newest-first rows, the order change keeping the scroll position, the
    "Nothing owing" card and its greyed repayment); `e2e/debt-lifecycle.spec.ts` (the honest status of a
    settled arrangement); `e2e/insights.spec.ts` (the month close returning to the top, the category
    drill opening and closing on its own row, the vehicle close landing just below the menu, the
    greyed £0.00). No schema, migration or domain change — this is presentation, copy and navigation
    only.

233. **The long-term forecast is designed, grilled and engine-built — deliberately not Horizon
    (2026-10-17).** The household asked for multi-year forecasting around pensions (two
    defined-contribution pots starting in ~4 and ~9 years), state pension at 67, a start-of-2027
    inheritance (~£250k invested after the mortgage is paid off within months), user-set investment
    return rates (recent returns treated as a possible outlier), one best-guess inflation figure on
    recurring + day-to-day spending, and estimated UK tax — answered as "income at age 62",
    "income in 2030", including the second member. The design record is
    [`LONGTERM_FORECASTING.md`](../LONGTERM_FORECASTING.md) (feature plan + session log, beside
    `PROJECTS_IMPLEMENTATION.MD` at the household's naming request).

    - **Not Horizon.** Horizon (SPEC §7.6) is penny-exact liquidity over recorded reality to 400
      days; this is decades of **assumption-driven scenarios** — per-person streams (earnings with a
      stop date, pension pots, state pension), growth rates, inflation, windfalls and estimated tax
      — answered per calendar year and per age, in future money and today's money. The only reuse
      is the spending baseline concept and the people/pot data.
    - **The grill settled the model (LONGTERM_FORECASTING.md §11A):** both pensions are DC **pots**
      (a DB shape remains in the design for other households); the tool must **aid** the
      drawdown-vs-annuity decision with a side-by-side comparison on a household-entered annuity
      rate (it never recommends); dates display as **age and year**; pot values/rates are editable
      variables, never baked in; and — the **project-wide correction** — employment with a stop date
      is a first-class stream because other households have both members working (this household's
      retired-at-56 member is the unusual case). Inflation 2.5%; return rates 4/6/8% read as net of
      charges; other spending £0 with a required output warning; horizon default = the year the
      younger person turns 90 (2070) — flagged for confirmation; her state pension age defaults to
      68 (current law for a 1980 birth year) — flagged likewise.
    - **Slice 1 is built and tested** (this decision): `src/lib/longterm/` — `types.ts` (the plan
      model), `rates.ts` (the versioned **2026/27 rate card as data** — PA £12,570 with taper,
      20/40/45, savings starting rate + PSA, dividend allowance at 10.75/35.75/39.35, CGT £3,000
      exempt at 18/24, employee NI 8/2 — plus the household's chosen defaults), `tax.ts`
      (estimated per-person tax in HMRC stacking order: non-savings, then savings, then dividends,
      gains on top), `model.ts` (the month-step engine and answer queries: income in a year, income
      at an age, money-lasts headline, capital trajectory). All integer pence via
      `roundHalfUpDivide`; inflation is one figure per year stepped each January so year one is
      exactly today's baseline and today's-money deflates exactly; annuity income is pence per
      £100k of pot at conversion; an auto-created GIA so surplus never vanishes; "money runs out"
      is the first year with **unmet** spending (capital to exactly £0 at a year end is a covered
      year). 22 tests (`tests/longterm-tax.test.ts`, `tests/longterm-model.test.ts`).
    - **No schema, migration, backup, nav, SPEC, guide or version change** — the engine is inert
      until slice 2 wires the `/longterm` page and `longterm_plans` persistence (the SPEC section,
      guide vocabulary and any release arrive with the visible build, per the feature plan §9).
      No release cut. Coverage: the tax arithmetic (allowances, bands, PSA, dividend allowance,
      CGT stacking); spend-down/run-out; state pension start + January uprating; PCLS + drawdown
      money conservation; annuity conversion and the take-up override; two-earner stop dates;
      windfall-then-January-shelter ordering; end-dated commitments; three-rate comparison
      ordering. Gates green: `format:check`, `typecheck`, `npm test` (1,034/1,034 across 238
      suites), `npm run build`.

234. **The long-term forecast's page and saved plan are built — slice 2 (2026-10-17).** The engine
    from decision 233 now has a face: `/longterm` ("Long-term forecast", "Your money across the
    years") renders the household's own questions over a **saved, editable plan of assumptions**.
    This is a preview slice — no nav entry, guide vocabulary, SPEC section, version bump or release
    yet (slice 3 follows once the household accepts the page, per `LONGTERM_FORECASTING.md` §9).

    - **Persistence — one migration, `0020_longterm_plans.sql`.** `longterm_plans(id, name, payload,
      created_at, updated_at, version)` with a unique name. The whole plan (people and their
      optional streams, pots, investments, windfalls, spending, commitments, the three comparison
      rates) lives in the validated JSON `payload`; the row carries the same optimistic-concurrency
      `version` counter as every other correctable record, so a stale tab gets a visible conflict
      instead of overwriting newer figures. Create, save and reset all write `audit_entries`
      (`longterm_plan.create|update|reset`) with before/after payloads.
    - **The draft is drafted, never baked in.** `buildDraftPlan` reads the records that already
      exist — the people, the active direct debits/standing orders (monthly-equivalent; an
      end-dated schedule becomes the engine's fixed commitment, so this household's mortgage drops
      out at payoff), the groceries/fuel basis, and the active **receipt** schedules as earnings. An
      unassigned receipt lands on the **younger** person (the working member in this household) with
      a draft stop date of the year before State Pension age; the editor says the stop date is a
      draft to correct. Everything the records cannot know comes from the reviewed defaults in
      `rates.ts` (birth years, pot start dates, the 2027 inheritance, 2.5% inflation, 4/6/8% rates,
      £40k ISA shelter, the £5,500 per £100k annuity rate) — and **every one of those is an
      editable field**, never a constant inside a calculation.
    - **The page leads with the household's questions** (grill Q6): "Income in 2030" and "Income at
      age 62 — 2032" are first-class cards, each showing net income a year, the same figure in
      today's money, estimated tax on gross, then per person and capital at year end. "Does the
      money last?" sits beside them with the three-rate list. The year query defaults to 2030 and
      the age query to 62; both are in the URL (`?year=&rate=&person=&age=`) and every link keeps
      the other parameters, so changing the rate never moves the year being read.
    - **Runs out vs a temporary gap — a decision forced by the draft.** `capitalTrajectory`-style
      first-shortfall reporting calls the pre-inheritance year "runs out", which is false for a plan
      a windfall rescues: the household's draft showed "the money runs out during 2026" at all three
      rates while 2027 onward was covered. `sustainabilityOf` now separates the **first shortfall**
      from the **trailing** run of unmet spending: `runsOutInYear` is the first year of the trailing
      run (null when the last year is covered), `gapYears` are the unmet years before it,
      `firstCoveredAfterGapYear` is the year after the last gap, and the headline says "It covers
      every year from {firstCoveredAfterGapYear} to {endYear}" with the gap named plainly. The year
      table marks any unmet year `unmet` and only the trailing run's first year `ran out`. The
      engine's old `moneyLastsTo` helper was deleted rather than left as a second, wrong rule.
    - **Three rates, one rule.** The comparison runs replace the **investments'** growth only
      (`overrideInvestmentGrowthBp`); pension pots keep their own rates, and both the card and the
      table say so. Drawdown and annuity are shown **side by side on the same pot** (projected value
      at the start date with the engine's own monthly rounding, 25% tax-free cash + the taxable
      residual fund vs the household's annuity rate) with "arithmetic, not a quote" and no
      recommendation anywhere — the honesty rule, also repeated in the page footer with the rate
      card's year and in every "est." label.
    - **The assumptions panel is one form over the whole plan.** `LongTermAssumptionsForm` keeps a
      client copy (`structuredClone`), posts the whole document as hidden JSON with
      `expectedVersion`, and the server re-validates it with zod before saving. Rows can be added
      and removed; reset re-drafts from records behind a `window.confirm` and an audit entry. The
      panel opens by default only while a warning is asking for a figure, and then **stays where the
      household put it** — a save that clears the last warning must not collapse the form (and its
      success message) underneath the reader.
    - **Warnings are output, not setup gates.** A £0 "other spending" line, an empty pension pot, a
      £0 drawdown, no capital, no State Pension and 0% inflation each get a visible flag at the top
      of the page with a link to the assumptions; the forecast still answers every question.
    - **A migration count is not a fixture.** `tests/backup-restore.test.ts` asserted exactly 20
      `__drizzle_migrations` rows; it now reads the repo journal's length, so the next migration does
      not break a backup test that was never about the count.
    - Coverage: `tests/longterm-plan.test.ts` (6 — percent parsing, age/year helpers, draft seeding
      from records including end-dated commitments and receipt-derived earnings, validation,
      create/save/reset with the audit trail), `tests/longterm-view.test.ts` (12 — the three runs,
      sustainability in the covered/exhausted/gap cases, the year table in both monies,
      drawdown-vs-annuity, warnings), `e2e/longterm.spec.ts` (4 — answer cards and warnings, asking an
      age, switching the rate, saving an assumption and reloading it). `npm test` 1,052/1,052 across
      245 suites; `format:check`, `typecheck`, `npm run build` green. Browser evidence in this session
      came from the sandbox's `@sparticuz/chromium` recipe (SANDBOX entry 8): the four journeys passed
      and desktop/phone screenshots showed no horizontal overflow.

235. **The long-term forecast becomes a first-class page — slice 3: nav, guide, SPEC and release
    (2026-10-17).** The household accepted the direction and asked for a preview before a release.
    This slice does not change the engine or the saved plan; it makes the feature reachable, explains
    it in the app's vocabulary, documents it, and prepares the `v1.26.0` stable release.

    - **Navigation.** `src/components/site-nav.tsx` carries `Long-term forecast` in the desktop bar
      **immediately beside Horizon** — the two answer different spans of the same question — and in
      the phone drawer's **second group** (`More`), because the page is a sit-down reading and
      planning surface rather than a daily tap. The active state follows the same path rule as every
      other entry (`aria-current="page"`).
    - **Guide vocabulary.** `src/lib/guide.ts` gains its ninth anchored section, `longterm`: the
      difference from Horizon, what is drafted from records and what is an assumption, estimated tax
      from the editable 2026/27 card, three rates compared, drawdown versus annuity as arithmetic and
      never a recommendation, a gap distinguished from a run-out, and the plan belonging to the
      household. The guide's intro/toc say **nine**, the page footer links back to
      `/guide#longterm`, and `tests/guide.test.ts` pins the new anchor and its load-bearing phrases.
      `docs/ONBOARDING_PLAN.md` §9 records the new count.
    - **Specification.** `docs/SPEC.md` gains **§28** (the model, the saved plan and draft, the page's
      nine layers, the guide vocabulary, and what v1 is not), a **Long-term forecast** row in the
      §15.2 menu-page table, and the nine-section wording in §15.5.
    - **E2E.** `e2e/longterm.spec.ts` gains a fifth journey: the desktop navigation carries the entry
      with `href="/longterm"` and the active state, the phone drawer carries it in `More`, and
      `/guide#longterm` renders the ninth section's title and its three-rate promise. The existing
      `longterm` Playwright project already covers the page's four data journeys.
    - **Release preparation.** `docs/RELEASE_NOTES_v1.26.0.md` describes the whole feature (the
      engine, the page and the saved plan were never released before), migration `0020` adds only
      `longterm_plans`, no existing record or backup format changes, and the five version places are
      aligned at **1.26.0** (`package.json`, `package-lock.json`, `src/lib/version.ts`, the Unraid
      template and the release notes). `AGENTS.md`, `README.md`, `docs/HANDOFF.md`,
      `docs/RELEASE_PROCESS.md` and `docs/MULTI_HOUSEHOLD_PLAN.md` name `v1.26.0`, as
      `tests/multi-household-isolation-contract.test.ts` requires. No tag, image or GitHub release is
      created until the household accepts the preview.
    - **Coverage:** `tests/guide.test.ts` (the new anchor and promises), `e2e/longterm.spec.ts` (the
      fifth journey); full suite **1,052/1,052 across 245 suites**, `format:check`, `typecheck` and
      `npm run build` green, browser evidence through SANDBOX entry 8.
    - **The menu entry's arithmetic, fixed after the first CI run.** A new drawer entry changes the
      link count three specs depend on. `e2e/bell.spec.ts` pins it (6 Daily + 12 More = **18**, 17
      until this release); `e2e/desktop.spec.ts`'s "every page" list and `e2e/home.spec.ts`'s phone
      `more` list now name the new entry, so a future menu change fails where it changes rather than
      passing silently. The longterm journey's drawer step also became a **reload at the phone
      width** instead of an in-session resize — a client-side resize closes the drawer and leaves
      the menu button asleep until the mobile layout is interactive, which is why it flaked in CI
      and passed on retry. Local run after the fix: bell, desktop, mobile and longterm projects
      **53/53**.

236. **Issue #73, slice 1 — the State Pension is today's rate, uprated from today (2026-10-17).** The
    weekly figure the household types is **today's** rate, not the rate in the start year. It is
    compounded each January after today, before and after the start date (`model.ts`, the January
    step). Before this, a 2037 start was paid at the 2026 rate and understated the pension by about
    23% in real terms. The pinned test at `tests/longterm-model.test.ts` is rewritten to the corrected
    numbers, with mid-year-start cases at 2.5%, 3.0% and 3.5%. The start year is labelled as a
    part-year on the year detail. The form's uprating default is a **fixed 3.50%**, not inflation +
    1%, and the hint names the triple lock (highest of inflation, 2.5% or earnings growth).

237. **Issue #73, slice 2 — earnings growth and tax-threshold indexation (2026-10-17).** Earnings are
    today's pay and rise each January from today: with the plan's inflation rate while **Rises with
    inflation** is ticked (the default, so a later inflation change flows through), or at an explicit
    override % when unticked; growth stops at the last-paid date. Tax thresholds and allowances are a
    plan-level option-B rate (default 1.0%): every money figure on the card indexes together from
    2027 (`rates.ts` `taxCardForYear`); rates never move. The honesty footer states the indexation
    rate. Option C (separate allowance and band rates) is recorded for later and not built. Both
    growth fields are optional with schema defaults, so saved plans load.

238. **Issue #73, slice 3 — per-person life expectancy and plan-to (2026-10-17).** Each person has a
    sex, life expectancy (ONS 87 woman / 84 man, seeded by sex, freely editable including downwards)
    and a plan-to age (life expectancy + 5). Earnings, State Pension and drawdown stop after the
    person's plan-to year (option b; spending continues, undrawn pots stay invested). The forecast
    ends on the later plan-to year and moves when a plan-to age changes; the date stays editable.
    Saved plans without plan-to fill it from their saved horizon, so their numbers do not move.
    Recorded and not built: drafts from records do not seed sex; a pension pot left at a plan-to date
    needs a follow-up (transfer to the survivor's investments, or stay); no mortality modelling and no
    joint-life model (issue #73, non-goals).

239. **Issue #73 acceptance and v1.27.0 release approval (2026-10-17).** Browser acceptance extends to nine journeys with part-year pension copy, persistent earnings growth override, sex/life-expectancy defaults and edits, plan-to/horizon sync and 1400/390/320px no-document-overflow screenshots. Fixed externally changed whole-number fields displaying stale ages, narrow-screen intrinsic input/fieldset overflow, and added the decision-131 hydration guard. Name/birth year precede life-expectancy assumptions. Reset tests reload after action success to avoid an in-flight refresh replacing edits. The household explicitly approves publication for own-data testing in Unraid; the interim release hold ends. Sex remains household-chosen per #73; survivor modelling remains follow-up. Prepare v1.27.0 with no schema or backup-format change; warn that existing saved forecasts change under the new defaults. Full release CI and Publish are the gates, not the prior #74 retry pass.

240. **Issues #76–#79 — searchable pickers, the Day by day total, and pot defaults on the pot cards
    (2026-10-19, unreleased; one slice for four issues).** The household asked for the four open
    issues to be considered together and for a preview before publication. All four are small UI
    and settings changes; none moves a figure, and there is **no schema change and no migration** —
    the new schedule default is one more audited row in the existing `settings` key/value table.

    - **#76 — the till's category picker searches as you type.** A split's category field was a
      native `<select>` over the whole parent/child tree, so a long tree meant a lot of scrolling
      on a phone. It is now a combobox over the same options, filtering on **either** the parent or
      the child name and requiring every typed word in any order (`shop groc` finds
      `Groceries / Weekly Shop`). A tap, ArrowDown, Enter or the first typed character opens the
      list; arrows and Enter pick, Escape closes; focus alone never opens it (the till's own
      `Next: category →` moves focus there, and a list that opened by itself would push the rest of
      the card down), and focusing selects the shown label so typing replaces it. A pinned
      "No category — clear this line" row survives filtering. Shared component
      `src/components/search-picker.tsx`; pure ranking in `src/lib/search.ts` (`tests/search.test.ts`).
    - **#78 — the new-schedule supplier field is A–Z and searchable.** The add form's supplier
      select now reads the **whole directory in A–Z order** (`listSuppliers`, not the
      40-most-recent entry list) through the same picker. Matching is on any part of a name,
      case-insensitively; **Add a new supplier…** and a standing order's "no supplier / household
      transfer" row are pinned so special choices survive a search; the edit form uses the same
      picker. Enter never submits the schedule form mid-search.
    - **#77 — the Horizon Day by day card counts and totals like its neighbours.** Its heading now
      reads `Day by day (42 days) · out £741.98 · in £5,900.00`, summed from the table's own rows
      by `projectionDayTotals` in `src/lib/records/projection.ts` (commitments plus day-to-day go
      out; expected money in comes back). The worked example's table uses the same helper so the
      two cannot drift. `tests/projection.test.ts` pins the arithmetic.
    - **#79 — the default pot is chosen on the pot's own card.** The detached **Quick entry** and
      **All Transactions** cards are retired. Each pot card now carries **Set as default account
      for: Till · Transactions · New DD/SO**, exactly the shape the household sketched. One
      account per use: ticking a second account **moves** the default, and unticking clears it
      only on the account that holds it (so a second card cannot silently remove another pot's
      tick). Saves go through one action (`savePotDefaultUsesAction`) and keep the existing three
      audited setting keys (`default_purchase_pot_id`, `default_transactions_pot_id`, and the new
      `default_schedule_pot_id`). The ticks are controlled state behind the decision-131 hydration
      guard (`data-pot-defaults-ready`, `inert` until listening). The new-schedule default is read
      by `/recurring`; clearing it keeps the form's first-pot fallback.
    - **Evidence.** `npm run test` 1075/1075 across 252 suites, `format:check`, `typecheck` and
      `next build` green. Full Playwright through SANDBOX entry 8: **171/171**. The gate exposed
      two pre-existing date/state traps in `insights.spec.ts` (they failed on `main` too); both
      tests were made deterministic in the same slice — the honesty verdict now derives from the
      page's own figures, and the £0.00 row is created by the test rather than borrowed from the
      seed. New journeys cover each issue: the category search, the supplier A–Z/search, the Day
      by day totals and the three default ticks. The household reviewed the Arena preview and
      approved publishing as stable **v1.28.0**; the release files and notes are in this slice.

241. **Issue #81 — the Chart D → Chart E sync: a month bar sets the Spending mix (2026-10-19).**
    The household sketched several shapes in the issue and then sharpened them in conversation:
    a two-way sync was dropped ("it could get very messy"), and so was giving Chart D date
    fields of its own — payday cycles are weeks, and monthly trend bars over them are thin.
    What survives is the one direction that pays for itself: **a toggle on Chart D
    ("Sync to Spending mix"), off by default.** Engaging it is inert; while it is on, every
    month link on Chart D — each bar and the table twin's month names, so the keyboard path
    does what the drawing does — hands Chart E that whole calendar month **and the preset's
    categories**, and nothing on Chart D opens Purchases (the drill-down returns when the sync
    is switched off; until then Chart E's line items carry the same month-and-category list).
    The month being lived ends at today, which is exactly Chart E's existing "Month to date"
    quick window, so that pill lights on its own. The chip's engaged state is the amber warning
    ramp plus a soft breathing ring (`prefers-reduced-motion` stops the pulse, keeps the amber),
    with ✓, `aria-pressed` and the bars' changed hints saying the same thing colour does.
    - **State and provenance are URL params, nothing else.** `mixsync=1` is the toggle;
      `mixvia=1` is carried only by links a synced bar produced. Disengaging the chip — or
      Chart E's "Return to since last payday" link, two doors to the same URL — removes every
      Chart E filter (window, ticks, slice, provenance, the toggle): the full reset back to the
      payday default and every category. **"Show takes control of the window"**: pressing Show
      in Chart E's own panel keeps the provenance mark only when it re-submits exactly what
      the sync set (dates *and* categories, an unticked tree and an explicit all-children list
      counting as the same selection); change anything and the signpost goes, the bars stay
      synced, and the next tap re-claims the window.
    - **Chart E's signpost is honest by construction.** It reads "Showing September 2026 with
      the Fixed commitments categories — set from Spending trends" only when the window drawn
      is the window asked, that window is exactly what tapping one of Chart D's drawn months
      produces, the ticked categories are exactly the preset's, and the provenance mark is
      present. A hand-edited URL, a stale link, or a Show that changed anything shows no
      signpost. Signposting lives in the existing notice slot, amber-tinted to match the chip.
    - **The pre-#81 quirk is fixed on the way:** Chart E's slice links and Show built a fresh
      query string and silently dropped `?preset=`, resetting Chart D to its first preset.
      Every Chart E control now merges parameters the way the rest of the page always did
      (`chartsQuery` in `src/lib/charts-sync.ts`), and a no-JavaScript Show carries the other
      charts' state in hidden inputs, since a native GET submits only the form's own fields.
    - **Files.** `src/lib/charts-sync.ts` (the query builder, `syncMonthWindow`, `sameIdSet`,
      `mixShowReconfirms` — `tests/charts-sync.test.ts` pins them); `src/app/charts/page.tsx`
      (the chip, the month-link swap, the signpost, the merging `mixHref`); MixScopes in
      `src/components/charts/mix-category-tree.tsx` (Show merge + provenance + hidden inputs);
      the pulse in `src/app/globals.css`. No schema, migration or backup-format change.
    - **Evidence.** `npm run test` 1087/1087 across 257 suites, `format:check`, `typecheck`
      and `next build` green; server-rendered behaviour verified against the seeded E2E
      household (bar hrefs, signpost truth table, full-reset URL). A new Playwright journey in
      `e2e/charts.spec.ts` covers engage → tap → signpost → Show-reconfirm → return → drill-down
      restored; this sandbox has no browser binaries (SANDBOX note in `playwright.config.ts`),
      so the suite runs in CI as ever. Awaiting the household's Arena preview acceptance before
      any release; the issue stays open until then.
    - **Preview acceptance fix — the D headline's compared month.** Trying the sync in the
      Arena preview, the household read "£46.99 in September 2026 — up £12.00 on June 2026" and
      called the three-months-earlier comparison (inherited from v1.28.0's `completeMonths[length
      - 4]`, pinned as "three complete months earlier") senseless for a reader: the verdict now
      compares the latest complete month with **the complete month immediately before it**
      (`length - 2` in `commitmentSeries`), and a lone complete month states itself without a
      comparison. `tests/chart-series.test.ts` pins both shapes; SPEC §16.7 D now names the rule.
      The rest of the sync was accepted as-is ("other than this it looks good").

242. **Issue #83 — purchase receipts in the All Transactions "Correct it" panel (2026-10-20).**
    The in-place purchase panel on `/transactions` (decision 226) already gave `PUR`, `DD` and
    `SO` rows the Purchases page's `PurchaseEditForm` and `VoidForm`, but attaching, viewing or
    removing a receipt still required leaving All Transactions for `/purchases`. Issue #83 asks to
    mirror the Purchases page's attachment block inside that "Correct it" column:
    - **Projection carries stored receipts.** `listStoredPurchaseAttachments(db, purchaseIds)` in
      `src/lib/records/attachments.ts` batches the `stored` receipts for every purchase in the
      activity window in one query (oldest first, matching `listStoredAttachments`), and
      `purchaseActivityRow` reads `listStoredAttachments(db, purchase.id)` for a pinned purchase,
      so `ActivityPurchaseFacts.attachments` is identical whether a purchase row is live or pinned.
    - **Same `AttachmentForm`, same actions, revalidated in place.** `PurchaseActivityRow` renders
      `<AttachmentForm purchaseId={purchaseId} attachments={facts.attachments} />` beneath
      `PurchaseEditForm` in the "Correct it" column — offering the single-control `Attach receipt`
      picker, the `AttachmentViewer` modal on existing receipt chips, and the two-step `Remove` /
      `Confirm` / `Cancel` flow. `revalidateAttachmentPages()` in `src/app/actions.ts` now also
      revalidates `/transactions`, so uploading or removing a receipt refreshes the open row in
      place while `?purchase={id}#purchase-{id}` keeps the panel open.
    - **Files.** `src/lib/records/attachments.ts`, `src/lib/records/activity.ts`,
      `src/components/purchase-activity-row.tsx`, `src/app/actions.ts`,
      `tests/purchase-activity.test.ts`, `e2e/transactions.spec.ts`, `docs/SPEC.md` (§15.3, §23.4).
      No schema, migration or backup-format change.
    - **Evidence.** `npm run test` 1089/1089 across 257 suites, `format:check`, `typecheck`,
      `next build` and Playwright `e2e/transactions.spec.ts` (12/12) + `e2e/attachments.spec.ts`
      (5/5) green. The household reviewed the Arena preview and approved publishing as stable
      **v1.30.0**; the release files and `docs/RELEASE_NOTES_v1.30.0.md` are in this slice.

243. **Issue #85 — the household payday is a separate, audited planning-cycle setting (2026-10-20).** The
    household chooses a day from 1–31 in Settings. Store it in the existing audited `settings` table; `null`
    or an empty/missing setting means unset, so no schema migration is required. For each month, clamp to the
    last calendar day when needed and move a Saturday/Sunday payday to the preceding Friday. Use that actual
    occurrence—not receipt schedules—to bound the payday projection, exclude projected day-to-day spending,
    drive Home/Overview/Till and Horizon defaults, and derive Chart E's payday-cycle windows. Receipts remain
    independent expected income on their own due dates. A configured payday enables the projection with no
    receipt schedule; Horizon uses today + 35 days only when no payday is configured. This change is not a
    release or version bump.

244. **Issue #86 — Getting Started distinguishes sign-ins, records and money events (2026-10-20).** The
    first-run path names household people separately from the maximum of two assigned sign-in identities;
    the number of `people` attribution records is not capped. Phase A is people, liquid pots, checkpoints and
    the household payday. Predictable recurring receipts are optional Phase B; one-off receipts are recorded
    on Income. The guidance explains that the app has no bank connection or statement import, that transfers
    between the household's own pots are not spending, and that checkpoints are household-reported balances.
    It also covers recurring bills, weekly-shop and vehicle-fuel estimates, optional credit cards/renewals and
    the first till purchase. Quick Entry does not carry a manually chosen “For” value into the next entry; that
    must remain explicit. No schema, version or release change is part of this work.


245. **Stable release v1.31.0 — issues #85 and #86 (2026-10-20).** After reviewing the Arena
    preview, the household requested a stable `v1.31.0` release so it can test the payday setting
    and updated onboarding fully on its Unraid installation. This supersedes the implementation-slice
    notes in decisions 243–244 that no version bump was then part of those changes. No schema,
    migration or backup-format change. Existing households must set a payday after upgrading. The
    release PR must pass `gates`, `browser` and `docker` (including the container and applicable
    upgrade smoke) before merge; tag the exact `main` merge commit and publish only to
    `ghcr.io/dougalbob/simple-finance-multi-household`.

246. **Issue #89 — Chart G, Spending pace: two months' cumulative spending compared day by day
    (2026-10-20).** Designed with the household in conversation before any code: calendar months
    (not payday cycles), cumulative spending only, straight lines over steps, and the issue's
    household-balance toggle **shelved** for separate thought — a historic daily balance would
    have to be rebuilt from checkpoints and the household parked that question rather than
    ship a placeholder. What landed is "G · Spending pace" at `#pace`: two overlapping
    semi-transparent line areas, each month's recorded net spending added up from its 1st, so
    the pace of one month reads against the other.
    - **Qualifying months only.** A month can be selected only when recording covers it from the
      1st. Recording is taken to begin on the **earliest dated spending entry of any kind**
      (`firstSpendingEntryDate`, manual or schedule-generated) — deliberately not decision 183's
      hand-entered-only start, which the honesty loop keeps: the household's position is that a
      reasonable user recording a scheduled entry in a month was recording the rest of their
      spending too, so completeness is assumed from that date on. The first qualifying month is
      the entry's month when it falls on the 1st, otherwise the next month; the part-recorded
      first month can never be selected. Until one qualifying month completes, the card draws
      nothing and names the date the comparison becomes available.
    - **Controls and state.** Compare/With month selectors plus a Categories selector, submitted
      together by Show as a plain GET carrying the page's other state in hidden inputs;
      defaults are the current month (drawn to today, "(so far)", even while still £0) against
      the latest completed qualifying month. The scope is a built-in **All spending** or any
      saved Settings preset, under this chart's own `cmpPreset` so Chart D's `preset` is never
      disturbed; an empty preset draws nothing, a deleted one falls back to All spending with a
      notice, and an ineligible or future month in the URL falls back with a notice naming both
      months. Naming the same month twice draws nothing and says so.
    - **The drawing.** A new `LineAreaChart`: £0 at the start of the 1st, a point at each day's
      end carrying the cumulative total, straight joins (the household's explicit choice —
      trajectory over Chart A's day-boundary steps) with no smoothing, solid vs dashed strokes
      beside colour, end dots and labels. The verdict compares at the **last common drawn
      day**, stating a finished total only when spending moved after it. The drawing is not a
      link (two series share every day); the table twin's daily figures link to that day's
      purchases under the same scope, alongside running totals and the signed difference.
    - **Files.** Pure resolvers `qualifyingMonths` / `cumulativeMonthSeries` /
      `cumulativeComparison` in `src/lib/records/chart-series.ts`; `firstSpendingEntryDate` in
      `src/lib/records/recording.ts`; `getCumulativeComparisonView` in
      `src/lib/records/charts-view.ts` (lines from the one `chartSpendingLines` query, so a
      line's final figure is the net total Charts D/F and Insights print);
      `src/components/charts/line-area-chart.tsx`; the section in `src/app/charts/page.tsx`;
      SPEC §16.7 G. No schema, migration or backup-format change. The worked example is not
      mirrored — it never carried Chart F either.
    - **Evidence.** `npm test` **1112/1112 across 261 suites** (+22 tests: the pure pace suite
      in `tests/chart-series.test.ts` and `tests/cumulative-comparison-view.test.ts`, including
      the schedule-entry-starts-the-clock case reconciled against `listPurchases`),
      `typecheck`, `format:check` and `next build` green. Browser: the local Playwright
      `charts` project (SANDBOX entry 8) **13/13**, including the new pace journey (defaults,
      day-link drill-down, month and preset changes in the URL, `cmpPreset` leaving Chart D's
      `preset` alone, the ineligible-month notice, the same-month state); `'pace'` joined the
      shared phone/laptop figure list, so the 320px / 360px@130% no-pan checks cover it. The
      chart was screenshot-checked at desktop and phone widths against the seeded household
      before handover. The household reviewed the Arena preview, approved it unchanged
      (“exactly what I was looking for”) and requested stable **v1.32.0** for full testing on
      Unraid; decision 247 records that release.

247. **Stable release v1.32.0 — issue #89 (2026-10-20).** After reviewing the Arena preview, the
    household approved Chart G unchanged and requested a stable `v1.32.0` release so it can test
    it fully on the multi-household Unraid installation. This supersedes the awaiting-acceptance
    note decision 246 was first written with. No schema, migration or backup-format change. The
    release PR must pass `gates`, `browser` and `docker` (including the container and applicable
    upgrade smoke) before merge; tag the exact `main` merge commit and publish only to
    `ghcr.io/dougalbob/simple-finance-multi-household`.

248. **Issue #87 — a synced month redraws Chart E in place, with no scroll flash (2026-10-20).**
    Tapping a month bar on Chart D while "Sync to Spending mix" was on rewrote this page's URL
    through a plain document anchor, so the browser reloaded `/charts`: the fresh document painted
    at the top of the page for a frame before its `#mix` fragment scroll landed the reader back at
    the D/E row. The URLs, the signpost and the reset were right; only the navigation mechanism was
    wrong.
    - **Soft links for same-page months.** A synced month link — every bar and the table twin's
      month name, so the keyboard path matches the drawing — is now `next/link` with
      `scroll: false` and `prefetch: false`. The client router rewrites the query without tearing
      down the document, so the viewport never moves while Chart E redraws. `BarDatum.soft` marks
      the bars; the table cell picks a `Link` only while the sync is on. `prefetch: false` keeps a
      hover from re-running every chart query for a month the reader may not tap.
    - **No change to the contract.** The hrefs are byte-for-byte the same as before (same
      `mixsync`, `mixvia`, `preset`, window, `catset`/`cat`, `#mix`), so a synced view is still
      shareable, still lands on Chart E on reload, and still degrades to the old full load with
      JavaScript off — every soft link is an ordinary `<a>` underneath. Non-synced bars still open
      `/purchases` through ordinary anchors; the drill-down behaviour is untouched.
    - **Files.** `src/components/charts/bar-chart.tsx` (`soft` on `BarDatum`, `Link` around the
      bar's `<rect>`), `src/app/charts/page.tsx` (the soft flag and the table twin's `Link`),
      `src/lib/charts-sync.ts` (the sync contract comment), SPEC §16.7 D.
    - **Evidence.** The `charts` Playwright journey gained an issue #87 test at 390px and 1400px:
      it counts documents through `sessionStorage` (a soft navigation keeps one; a reload starts
      another) and measures `window.scrollY` before and after tapping a drawn bar. The issue #81
      journey's table-twin tap now asserts the same. Against the pre-fix anchors the new test fails
      with the document count moving 1 → 2; with the change both pass. `npm test`, `typecheck`,
      `format:check` and `next build` run green. Browser via SANDBOX entry 8. No schema,
      migration or backup-format change.

249. **Stable release v1.32.1 — issue #87 (2026-10-20).** The household reviewed the Arena preview
    of the synced-month in-place navigation, approved it unchanged and requested a stable `v1.32.1`
    so it can test fully on the multi-household Unraid installation. This supersedes decision 248's
    awaiting-acceptance note. No schema, migration or backup-format change. The release PR must pass
    `gates`, `browser` and `docker` (including the container and applicable upgrade smoke) before
    merge; tag the exact `main` merge commit and publish only to
    `ghcr.io/dougalbob/simple-finance-multi-household`.

250. **Issue #94 — Charts B, C and F open their line items in line (2026-10-21).** Tapping a grocery
    week (B), a personal-spending segment (C) or a three-months bar (F) used to leave Charts for a
    filtered `/purchases` list, while Chart E had shown its purchases beneath the pie all along. The
    household asked for one behaviour everywhere: stay on the chart, see the purchases behind the
    figure, then choose whether to open the full list.
    - **One `show` parameter, three keys.** `?show=b:<weekStart>`, `?show=c:<YYYY-MM>:<household|person:N>`
      and `?show=f:<YYYY-MM>:<parentId>` (`src/lib/charts-drill.ts`: build, strict parse — real calendar
      dates only, known series only — and same-selection comparison for the re-tap toggle). The key is
      resolved against what the page actually Drew (`getChartDrillView` in
      `src/lib/records/charts-view.ts`): anything unparseable, outside the drawn window, or filtered
      away resolves to no panel rather than a wrong one, and a part-lived week or month ends at today.
    - **The panel is the bar, itemised.** All three panels render through one shared
      `LineItemsPanel` (`src/components/line-items.tsx`, Chart E's block, now common): the same
      `spendingMixLines` allocation lines the chart summed, newest first, so the heading total is the
      figure tapped to the penny — never the purchase-whole approximation the old filtered list had to
      explain. **Open these purchases** keeps the previous `/purchases` href byte-for-byte; **Close
      line items** returns to the chart. A person's panel keeps issue #25's no-category-filter rule;
      the Household panel keeps the discretionary-parent scope.
    - **Soft, scroll-preserving, still a real link.** Bars, segments and their table-twin figures are
      same-page soft links (decision 248's `soft` pattern extended from `BarChart` to the stacked and
      grouped charts), so opening or closing a panel never reloads the document or moves the
      viewport; with JavaScript off every link is an ordinary anchor and the panel is plain URL state.
      Re-tapping the open figure closes it, as Chart E already taught. Changing the drawn series
      cannot strand a panel (the issue's redraw watch, the issue #87 class): switching a person off
      with Chart C's chips closes their panel, and Exclude Housing — now `scroll: false` like the
      chips — drops `show` only when the open panel belongs to the category being excluded.
    - **Files.** `src/lib/charts-drill.ts` (new), `src/components/line-items.tsx` (new),
      `src/lib/records/charts-view.ts` (the resolver), `src/app/charts/page.tsx` (the three sections,
      `drillHref`/`closeDrillHref`, chip and toggle hrefs), `src/components/charts/stacked-bar-chart.tsx`
      and `grouped-bar-chart.tsx` (`soft` segments/bars), SPEC §16.7 B, C, F and the shared drill-down
      rule. No schema, migration or backup-format change.
    - **Evidence.** `npm test` **1141/1141 across 268 suites** (+12: `tests/charts-drill.test.ts` key
      round-trips and rejections, and the resolver reconciliations in `tests/charts-view.test.ts` —
      a £93.50 grocery week, a refund-netted part week, Sam, the Household scope, a £179.00 category
      month — each asserting the panel's rows sum to the bar), `typecheck`, `themes:check`,
      `format:check` and `next build` green. Browser: the local Playwright `charts` project (SANDBOX
      entry 8) **15/15**, including the reworked grocery journey (the panel's lines sum **exactly**
      to the tapped week, then Open these purchases reaches the old filtered list) and a new B/C/F
      journey at 390px and 1400px in the issue #87 mould (one document throughout, |ΔscrollY| < 8,
      chip-closes-panel, Exclude Housing redraws without a load). Two pre-existing journeys were
      hardened with this file's own hydration-marker wait (the chips test after its reload; the pace
      table's summary centred before its click) — the swallowed-click race decision 216 records,
      exposed by sandbox slowness; their assertions are unchanged. The household reviewed the Arena
      preview, approved it and requested stable **v1.34.0** for full testing on Unraid; decision 251
      records that release.

251. **Stable release v1.34.0 — issue #94 (2026-10-21).** The household reviewed the Arena preview
    of Charts B, C and F opening their line items in line, approved it and requested a stable
    `v1.34.0` so it can test fully on the multi-household Unraid installation. This supersedes
    decision 250's awaiting-acceptance note as first written. No schema, migration or backup-format
    change. The release PR must pass `gates`, `browser` and `docker` (including the container and
    applicable upgrade smoke) before merge; tag the exact `main` merge commit and publish only to
    `ghcr.io/dougalbob/simple-finance-multi-household`.

252. **Refund form: explicit refund amounts, blank means no refund, and both linked records
    signpost each other — issue #96 (2026-10-21, approved for stable v1.35.0).** A first preview kept
    the original amounts pre-filled and asked the household to remove lines that were not
    refunded; the household rejected that direction on sight: most users would not grasp that
    an unchanged-looking line must be removed. The settled model is explicit entry. Every
    refund amount box starts blank with only **Originally £X** as its placeholder. The form
    says: "For any line item where there has been a refund, enter the **refunded** amount (not
    the amount that remains after the refund is applied). Leave any line with no refund blank."
    Each box is labelled **Enter the amount _to be refunded_**. Blank lines are omitted before
    `addRefundAction`; submitting all blanks records nothing and asks for an amount on at least
    one line. A refund offers neither **Add a line** nor line removal — it enters money back on
    the original purchase's existing lines. (The shared `LineEditor` retains its new remove
    control for purchase edits, whose split lines could not previously leave an edit either.)
    A live total still names a partial versus whole/rest-of-purchase refund and warns beyond
    the amount still refundable. The household then corrected a £25.00 preview refund to
    £30.00 and found the refund's own edit still reusing the ordinary purchase editor. Refund
    creation and refund correction now share the locked line presentation: each parent/child
    category and spent-for target is a read-only heading inherited from the original purchase,
    with no **Spent for**, **Category** or **Which** select and no add or remove control. The
    correction box holds a positive **Amount refunded** (`30.00`, not `-30.00`) and submits it
    as the negative refund record. `editPurchase` enforces the same rule with
    `assertRefundLineIdentitiesUnchanged`: a refund edit preserves its line count, order,
    categories and targets exactly; a refund filed against the wrong part of a purchase is
    voided and recorded again instead of being reallocated by an edit.

    The preview also exposed missing signposting, now closed with read-only summaries of live
    linked refunds (`refundSummariesForPurchases`/`refundOriginalsById`, no schema change):
    a Purchases original carries **£X refunded** or **Fully refunded**, lists each refund
    record with a link, and opens its refund form behind a "Refund already recorded" notice
    naming the amount still refundable; a fully refunded original offers no further refund.
    A refund row reads **Refund · for #id** and links **Refund for purchase #id …** back to
    the original. In All Transactions, the original's `PUR`/`DD`/`SO` row and opened panel
    carry the same refund state, while its `REF` row says **for purchase #id · date · amount**
    and carries an **Original purchase #id** secondary link. Creation needed no domain
    loosening: `createRefund`/`assertRefundLink` already allowed subset lines and capped
    cumulative refunds at the original total; the one domain tightening is the refund-edit
    line-identity lock above. The household reviewed the fresh-origin refund-correction
    preview, approved the entire change and requested stable `v1.35.0`; decision 253 records
    that release.

253. **Stable release v1.35.0 — issue #96 (2026-10-21).** The household approved the explicit
    partial-refund form, bidirectional refund signposting and locked refund line identities
    after testing them in the Arena preview, and requested stable `v1.35.0` for full testing
    on the multi-household Unraid installation. No schema, migration or backup-format change.
    The release PR must pass `gates`, `browser` and `docker` (including the container and
    applicable upgrade smoke) before merge; tag the exact `main` merge commit and publish only
    to `ghcr.io/dougalbob/simple-finance-multi-household`.

254. **Issue #98 — All Transactions gets a Range drop-down and a supplier-and-notes search (2026-10-21,
    approved for stable v1.36.0).** The page's three quick-pick links were the only way to move the
    window, and the household had never used "Since last checkpoint"; they asked for one drop-down and
    for a search that reads the Supplier and Notes columns at once.
    - **One Range select, five windows.** `src/lib/records/activity-range.ts` computes **Last 30 days**
      (the default), **This month**, **Last Month** (calendar-exact: `addDaysLocal(monthStart, -1)`,
      so a leap February ends on the 29th), **This Year** and **All** from the household's local
      `today` — no browser clock, no timezone drift. "Since last checkpoint" is gone, with its
      never-checkpointed fallback note and its `latestCheckpointPerPot` read; checkpoint dividers
      still appear inside every other window. **All** is a real window the page already understands
      (`from=1970-01-01`), so `from`/`to` remain the page's only date state and every existing
      deep link, balance anchor and cap keeps working; the heading says "All time to today" rather
      than printing the sentinel. The dates stay editable, and a hand-edited window puts the select
      on a **Custom dates** entry instead of mislabelling it as a preset (`matchedActivityRangePreset`).
    - **The filter bar is one island.** `src/components/activity-filters.tsx` replaces the server-side
      `<form>`: Target, Range, Start date, End date, Show activity, and the search box. Choosing a
      range navigates at once (as a quick pick did); Show activity submits the dates as before. The
      form is `inert` until hydration and publishes `data-filters-ready` (decision 131), so nothing a
      household types is swallowed, and with JavaScript off it is still an ordinary GET.
    - **Search as you type, over two columns.** `q` is in the URL and the projection filters on it
      (`activityRowMatchesSearch`, `src/lib/records/activity-search.ts`), reusing the picker search
      rules (`src/lib/search.ts`): case and spacing folded, every whitespace-separated word required
      across the row's `source` **and** `note`, in any order. Because `source` is the row's own
      supplier / other pot / counterparty / income source, every family is searched in the column the
      household is reading — purchases (supplier or schedule name), transfers (the other pot), loans
      and swaps (the counterparty), income (the receipt's source), expectations — with no second
      notion of "supplier" that could drift. Typing debounces 300 ms into a `router.replace`
      (`scroll: false`) so one search costs one history entry, not one per word; focus and scroll
      stay put, and a server round trip never rewrites words typed while it was in flight
      (`lastRequestedQuery`).
    - **The cap and the totals follow the matches.** A search reads every family uncapped
      (`.limit(-1)`) and applies the 500-row cap to the matching rows, so a supplier whose last visit
      fell past the cap is still found; "Movements shown", the net and the hidden-row note describe
      the matches. A search view leaves checkpoint dividers out — they are context, not records with a
      supplier or notes — while they still anchor the balances shown, and an empty result says
      "Nothing in this window matches “…”" with a Clear the search link. An open in-place purchase or
      transfer follows the same rule: matching, it stays open (so a void under an active search still
      keeps its pinned panel); not matching, it is simply not listed, never pinned under a "past the
      row limit" badge it did not earn.
    - **Files.** `src/lib/records/activity-range.ts` and `src/lib/records/activity-search.ts` (new),
      `src/components/activity-filters.tsx` (new), `src/lib/records/activity.ts` (`ActivityFilters.search`,
      the uncapped reads, the match filter and the search-aware window count), `src/app/transactions/page.tsx`
      (the island, the search state and copy, the All-time heading, the no-match empty state, the
      open-record rule), SPEC §15.3 and the §15 page table.
    - **Evidence.** `npm test` **1159/1159 across 271 suites** (+16: `tests/activity-range.test.ts`'s
      calendar edges, `tests/activity-search.test.ts`'s two-column rules, and five projection cases in
      `tests/activity.test.ts` — a supplier and a note match, two families found through different
      columns, the cap applied to matches with the hidden remainder, a match the ordinary cap would
      have hidden, and an honest empty result), `typecheck`, `themes:check`, `format:check`,
      `next build` and `npm audit --omit=dev` green. Browser: the local Playwright `transactions`
      project (SANDBOX entry 8) **14/14**, including a new issue #98 journey — the five option
      labels in the household's order with no "Since last checkpoint", each range writing its own
      `from`/`to` (including the All-time heading), the search finding a purchase by supplier, by a
      word from each column, and by its note alone, and the no-match state clearing back. No schema,
      migration or backup-format change.

255. **Purchases loses two filters, gains the Range drop-down and a three-column search (2026-10-21,
    household follow-up to issue #98, approved for stable v1.36.0).** The household never used the **Pot** or **Paid by** drop-downs,
    wanted the same date-range control All Transactions now has, and asked for one search that reads
    supplier, category and notes together instead of two selects.
    - **The Range drop-down is the transaction one, shared.** `src/lib/records/activity-range.ts` was
      renamed `src/lib/records/date-range-presets.ts` (`dateRangePresets`, `matchedDateRangePreset`,
      and `ACTIVITY_ALL_FROM` → `DATE_RANGE_ALL_FROM`) with no behaviour change, so both pages compute
      **Last 30 days / This month / Last Month / This Year / All** from the household's local `today`
      through one tested module; `src/components/activity-filters.tsx` was updated to the new names and
      `tests/activity-range.test.ts` became `tests/date-range-presets.test.ts`. Purchases **keeps the
      From/To inputs**, choosing a preset fills them and navigates at once, a hand-edited window shows
      **Custom dates**, and this page's **All** is *no date filter at all* — its history starts where it
      starts, so no sentinel start date is written (`?from`/`?to` absent). Its default is All.
    - **Pot and Paid by are gone from the form, not just hidden.** `PurchaseFilterForm` no longer takes
      `pots`, `suppliers` or `categories`. The page still reads `potId`, `categoryId`, `supplierId` and
      `paidByPersonId` from the URL, so links that already carry them (a chart's category, Overview's
      Groceries/vehicle links, All Transactions' pot, a refund's own record) keep filtering exactly as
      before — `listPurchases` is unchanged for them.
    - **A chip for every filter without a control.** Because the form cannot show a filter it no longer
      owns, any such filter is printed above the results as **Also filtering** — `Pot: …`,
      `Category: Parent / Child`, `Supplier: …`, `Paid by: …` — each a link to the current URL minus only
      that parameter (`purchasesHrefWithout`), so a household that follows a link can see why the table
      is short and undo that one thing without losing its dates or search.
    - **One search over three columns, as you type.** `src/lib/records/purchase-search.ts` matches the
      supplier's directory name **and** the optional bank payee printed beside it, the
      `Parent / Child` label of **every** allocation line (so a split purchase is searched whole, retired
      categories included), and the record's note. Rules are the picker's (`src/lib/search.ts`): case and
      spacing folded, every whitespace-separated word required somewhere across those columns, in any
      order; queries cap at `PURCHASE_SEARCH_MAX_LENGTH` (120). The box writes `?q=` through a 300 ms
      debounce and a `router.replace({ scroll: false })` — one search is one history entry and the
      focus/scroll stay put — with a Clear search button and a "Searching…" state.
    - **The cap and the totals follow the matches.** `PurchaseFilters.search` makes `listPurchases` read
      the filtered window uncapped (`.limit(-1)`), apply the search, and only then take the 500 newest,
      so a matching purchase the ordinary read would have cut off is still found and the count, the net
      total and the hidden-row note all describe the matches. The heading reads
      `N entries matching “…”`, and the empty state offers **Clear the search** while keeping the other
      parameters. The query is trimmed and length-capped in the page before the projection sees it.
    - **Files.** `src/lib/records/purchase-search.ts` (new), `src/lib/records/purchases.ts`
      (`search`, the uncapped read, `categoryLabelMap`), `src/components/purchase-filter-form.tsx`
      (rewritten island), `src/app/purchases/page.tsx` (`q`, the chips, the heading, the empty state),
      `src/lib/records/date-range-presets.ts` and its test (renamed), SPEC §15.2 and the new §15.3a,
      `e2e/purchases-filters.spec.ts` (new project `purchases-filters`), and the Purchases journeys in
      `e2e/desktop.spec.ts` and `e2e/home.spec.ts`.
    - **Evidence.** `npm test` **1167/1167 across 273 suites** (+8: `tests/purchase-search.test.ts`'s
      matcher rules — supplier, payee, parent name, child name, note, two words across two columns, the
      retired category — and one projection case proving the search runs before the 500-row cap);
      `typecheck`, `themes:check`, `format:check`, `next build` and `npm audit --omit=dev` green.
      Browser: the new `purchases-filters` project **3/3** (the five Range labels with the removed
      drop-downs absent from the filter form, preset ↔ dates ↔ URL including All and Custom dates;
      searches by supplier, by one word from each of two columns, by a category word alone and by a note
      alone, with an honest no-match and Clear the search keeping the window; an Overview Groceries link
      rendering the category chip and the chip removing only `categoryId`), the full `desktop` and
      `mobile` projects **47/47** together with it, and `charts` **15/15**. No schema, migration or
      backup-format change.

256. **Stable release v1.36.0 — issue #98 and the Purchases filter rework (2026-10-21).** The household
    reviewed the All Transactions Range drop-down and supplier/notes search in the Arena preview, asked
    for the same treatment on Purchases, then reviewed that rework too and approved both, requesting
    stable `v1.36.0` for full testing on the multi-household Unraid installation (decisions 254–255).
    No schema, migration or backup-format change. The release PR must pass `gates`, `browser` and
    `docker` (including the container and applicable upgrade smoke) before merge; tag the exact `main`
    merge commit and publish only to `ghcr.io/dougalbob/simple-finance-multi-household`, moving
    `latest` with it.


257. **Issue #101, stages two and three — explicit Cloudflare grant/removal (2026-10-22, unreleased).**
    Stage one was released as v1.37.0 and owner-tested in the live multi-household environment.
    The owner authorised both mutation stages together, not a production release, and explicitly
    approved the conservative safety limits after API research: only reusable Allow policies with
    `app_count === 1`, strict supported schemas, no automatic sync, exclusive external-edit window,
    installation-level locking, prewrite reread/drift refusal and post-write verification. Cloudflare
    documents a full PUT with no atomic conditional-update facility; a remaining external-edit race
    is an acknowledged limitation, not a solved concurrency guarantee. Legacy/shared/unknown policy
    structures fail closed. Grant rechecks registry assignment; removal separately confirms and
    protects the bootstrap admin, including policy-only cleanup. Auth/JWT/allowlist/active-household
    semantics, assignments, household status, migrations and backup formats are unchanged.
    Durable audit records actor, operation, target and attempt/outcome without provider bodies or
    credentials. API write failure leaves the registry intact and onboarding pending/unknown.
    Session revocation is not part of removal. See `docs/CLOUDFLARE_INSPECTION.md` for the pinned
    official sources, permission change (account-scoped Access: Apps and Policies Edit/Write), exact
    supported writable schema, stale-lock recovery and concurrency limitations. Implementation,
    tests and docs belong in one reviewable PR; do not merge/bump/tag/publish before owner readiness
    and publication confirmation. Preserve the v1.37.0 income-test retry fix.

258. **Stable v1.38.0 approval and deterministic navigation-test correction (2026-10-22).** The owner
    reviewed PR #103's remote browser failure and requested publication if the cause was understood.
    The new fictional bootstrap-admin configuration exposes the existing Admin menu link, so the
    phone-drawer test deterministically sees 19 links instead of the old non-admin expectation of 18.
    It now checks the complete ordered destination list including `/admin`; no application behaviour
    is changed or check skipped. Prepare v1.38.0 and release notes in the same PR as decision 257,
    require all PR gates and main CI, then publish the exact annotated merge-commit tag only to the
    multi-household image. No real Cloudflare writes or live deployment are authorised by publication.

259. **Live `uid` rejection fixed; read-only policy metadata accepted (v1.38.1, 2026-10-22).** The
    owner's live installation refused **every** grant in v1.38.0 with "Policy is not a supported
    single-application reusable Allow policy", before any write, so no provider change and no
    registry assignment was touched. The owner supplied a redacted diagnostic of the account-level
    reusable-policy GET: top-level keys `app_count`, `connection_rules`, `created_at`, `decision`,
    `exclude`, `id`, `include`, `name`, `require`, `reusable`, **`uid`**, `updated_at`, with
    `reusable: true`, `app_count: 1`, `decision: allow`, seven Include rules whose only selector is
    `email`, `require: []`, `exclude: []`, `connection_rules: { "rdp": {} }`, no `precedence`, and
    `uid` a string. `reusablePolicySchema` is `.strict()`, so the legacy `uid` (a read-only
    identifier Cloudflare still returns beside `id`) failed parsing and `snapshot()` converted that
    into the refusal. Ruled out with the owner: a shared policy (`app_count` is 1 and the original
    application was deleted), the decision, unsupported selectors, and account-level precedence.
    Fix: `uid` is validated as optional read-only metadata in `reusablePolicySchema`, and
    `writablePolicy()` destructures and `void`s it, so the PUT body is byte-for-byte what v1.38.0
    would have sent; `precedence` is accepted the same way as an optional nullable integer because
    the SDK documents it on policy responses and accepting it now avoids a second patch cycle for
    another account (a null value would otherwise still refuse). The PUT response and the post-write
    readback are parsed with the same schema, and the verified comparison still uses
    `writablePolicy(...)`, so metadata-only differences are not drift. Fail-closed behaviour is
    unchanged: unknown top-level fields, unknown selectors and malformed metadata still refuse, the
    pre-write reread still treats any response change (timestamps included) as drift, and no
    automatically retried or rolled-back write was added. Tests cover the live shape, absence of
    `uid`/`precedence` in the PUT body, a PUT response still carrying them, unknown fields, and
    metadata-only readback differences versus a real Include change; the browser fixture now mirrors
    the live shape. Ship as stable **v1.38.1** through the normal one-PR gates; version files, release
    notes, handoff and inspection/docs updated in the same PR. No schema, migration, authentication,
    registry, household-status or backup-format change.

260. **Issue 105 — who is connected, and a connection log (v1.39.0, 2026-10-23).** The owner asked for a
    live view of who is using the app and a log of connections/disconnections, so that updates and restarts
    are not performed under someone's feet. Agreed with the owner before any code: **active for two minutes,
    idle to fifteen, ended after fifteen minutes of silence**; presence stored in the **system registry**
    rather than a second database; **full detail for the platform administrator across every household**
    (counts only would defeat the purpose of deciding whether it is safe to restart); **30-day retention**.
    The app has no server-side session — every request re-verifies the Cloudflare assertion and Cloudflare
    owns sign-out — so "connected" is explicitly an inference from activity and the UI says *active now*,
    *idle* and *last seen*, never *online*. Registry migration `0003_presence.sql` adds `presence_sessions`
    (email, the identity's own household, an opaque per-tab key, first/last seen, ended at/reason) with a
    partial unique index that keeps one open visit per tab; deliberately no paths, finance data, IP addresses
    or user agents. Two write paths, both throttled to one write a minute per visit: authenticated page
    renders (`src/lib/auth/next.ts`) and route handlers (`householdContextFromHeaders`) count as activity, and
    a browser heartbeat (`POST /api/presence`) beats while the tab is visible **and the reader has actually
    touched the page**, which is what distinguishes an open tab from a closed one without a background timer.
    Visits end **lazily** — on the next touch from that tab or the next read of the card — at last activity
    plus the idle timeout, so the log cannot claim an hour of use for a five-minute visit. `/admin` gains
    "Who is connected" (open visits by household, state, since/last seen, tab count, a plain
    hold-off-restarting line) and "Connection history" (ended visits, durations, idle-timeout reason), both
    polling every 30 seconds and readable without JavaScript; `GET /api/presence` is platform-administrator
    only. Closed visits are pruned after 30 days with a 2,000-row ceiling; open visits are never pruned.
    Presence can never decide access: `safeRecordPresence` swallows a read-only, locked or half-migrated
    registry, and the session gate never reads presence. Support views record the administrator's **own**
    household, never the household being viewed. Tests: 19 new domain tests (thresholds, throttle, per-tab
    visits, no-tab extension, honest end times, lazy expiry, grouping, unassignment, retention and the row
    cap, tab-key validation, cross-identity isolation, FK refusal, fail-open-on-failure) and a browser
    assertion on the admin card. No authentication, allowlist, assignment, household-status or
    backup-format change; the registry backup now carries presence metadata, which is why retention is
    bounded and the columns are audited by test. The household reviewed the Arena preview and asked for
    stable publication so it can test fully on Unraid: ship as **v1.39.0** through the normal one-PR gates,
    with `next` moved to ^16.4.2 in the same PR because the critical advisories against
    16.0.0–16.4.0 fail the `gates` audit step. The interim issue #73 release hold is recorded as finished
    (that issue closed when v1.27.0 shipped and the stale override sentence in `AGENTS.md` is corrected
    here).

261. **Issue 107 — compact, task-oriented Admin workspace (v1.40.0, 2026-10-23).** The owner asked
    for a less disjointed Admin page that does not require excessive scrolling on a laptop or large
    tablet, with progressive disclosure and bounded logs. The implementation uses compact summary
    metrics and a two-column wide workspace: household roster and recent registry activity in the
    main column, with create-household, support, presence, advanced Cloudflare/server tools and
    registry backup/restore in the task rail; small screens remain one column. The owner reviewed
    the first preview and explicitly refined the roster requirement: households must start closed
    with only their name and expand arrow, and assigned emails belong inside the expansion. The
    final interaction therefore has an outer native household disclosure for status, metadata,
    assigned emails and unassign controls, plus an independent nested **Manage household**
    disclosure for assignment, rename and status editing. Roster and activity lists scroll inside
    their cards; activity retrieves up to 25 entries, newest first, and says to scroll for earlier
    entries in that set rather than implying that audit history was deleted. Cloudflare access and
    Server settings use a shared native advanced disclosure, and backup/restore fits the compact
    rail. Browser helpers and assertions cover both disclosure levels, the Cloudflare region and
    the activity overflow contract. A real Chromium probe also verified five initially collapsed
    households, scrolling through 25 activity entries, and no horizontal overflow at laptop or
    phone widths. The owner approved the refined preview and authorised stable publication for
    full Unraid testing. Ship as **v1.40.0** through one PR with tests, version metadata, release
    notes, handoff and current-release docs; require PR gates, main CI and the tagged Publish run.
    No schema, migration, authentication, assignment, household-status, storage-path or
    backup-format change, and no live deployment is authorised by publication.

262. **Friendly names and the app-wide document search (v1.41.0, 2026-10-24).** The household
    reported that a photographed vehicle MOT arrives as `IMG_4821.jpg` and is impossible to find
    later. Agreed before building: (a) an optional **friendly label** on every attachment — set at
    upload or edited inline from the chip — displayed in place of the file name while the stored
    file name, download name and storage key are untouched; (b) a dedicated **Documents** page that
    lists and searches every stored attachment by label, file name and owning record, returning the
    document's context and a link that lands on the page where it appears. The label is cosmetic and
    deliberately not audited; a blank label means "show the file name". The search reuses the
    Purchases matching rules, is server-side and household-scoped, matches `stored` attachments only,
    and caps at 100 results. One release: migration `0021_attachment_labels.sql` adds the nullable
    `label` column; no change to authentication, household separation, storage paths or the backup
    format. Ship as **v1.41.0** through one PR with tests, version metadata, release notes, handoff
    and current-release docs; require PR gates, main CI and the tagged Publish run.

263. **The missing Documents page (v1.41.1, 2026-10-24).** After v1.41.0 was installed on Unraid the
    household reported that the Documents menu item opened Next's 404 ("That page is not here").
    Investigation confirmed `src/app/documents/page.tsx` had never existed in any commit: the
    release shipped the menu entries, `DocumentSearchForm` and the `searchAttachments` library with
    nothing importing them, and the release notes/SPEC/handoff all claimed the route was built. CI
    passed because no unit test mapped nav links to pages and no browser spec followed the menu.
    Fix as a patch, not by moving the published v1.41.0 tag: (a) add the `force-dynamic`
    `/documents` server page on the existing `householdContextFromRequest` gate, reading `?q=` and
    rendering `DocumentSearchForm` plus results (friendly name or file name, size, owning-record
    context line) whose links carry `?attachment=<id>` to the scroll-and-ring behaviour already on
    Purchases, Income and Suppliers; (b) add `tests/site-nav-routes.test.ts`, which reads every
    `href` in `site-nav.tsx` and requires a matching `src/app/**/page.tsx`, and pins the Documents
    wiring; (c) add `e2e/documents.spec.ts` over the desktop bar, phone drawer, a real receipt
    search, the deep link and the no-match state, registered in its own Playwright project match;
    (d) move the byte/KB/MB label into dependency-free `src/lib/format.ts` so a client island never
    imports the Node-only attachments pipeline (a Turbopack client-build panic caught this locally);
    (e) root-anchor the `.gitignore` `documents/` rule, whose bare form also ignored
    `src/app/documents/` and would have hidden the new page from `git add`.
    Correct the v1.41.0 notes and SPEC §23.5 honestly rather than rewriting history; no schema,
    migration, authentication, storage-path or backup-format change. Ship as **v1.41.1** through one
    PR with tests, version metadata, release notes, handoff and current-release docs; require
    `gates`, `browser` and `docker`, main CI and the tagged Publish run.
