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
