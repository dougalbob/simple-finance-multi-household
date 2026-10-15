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

**Where this line actually stands:** `v1.0.0-rc.1` and `v1.0.0-rc.2` exist as Git tags but their Publish runs failed before pushing, so **no image exists for either** — they must never be used as upgrade bases or described as released. `v1.0.0-rc.3` published and was accepted on a live installation. `v1.0.0` is the stable release, promoted from `rc.3` with no application-code change. `v1.0.1` shipped registry backup and restore in `/admin` (added by PR #9, repaired by PR #10). `v1.0.2` is a stable patch: it fixes the `/admin` restore's broken redirect (relative `/admin`, status 303, never derived from `request.url`) and hardens the restore (upload validation, atomic replace, timestamped pre-restore copy, outcome logging) with dedicated route and browser tests, published as `v1.0.2`, `latest` and `sha-<short>` to one digest. `v1.1.0` adds the derived first-run setup path for a brand-new household (`/start`, home card, repaired empty states, the "one person is a complete household" fix, `docs/ONBOARDING_PLAN.md` Slice 1) and a browser suite that runs against a genuinely empty household, published as `v1.1.0`, `latest` and `sha-<short>` to one digest. `v1.2.0` added the guide (`/guide`, eight anchored sections) and the "What this page needs first" blocks on the four payoff pages (`docs/ONBOARDING_PLAN.md` Slice 2). `v1.3.0` added the worked example (`/example`, a fictional two-month household rendered through the real engines, plus the preview seed script). `v1.4.0` added the three-month Insights comparison, inline line-item drill-down on every Insights figure, and the three-months-by-category chart with its Exclude Housing toggle (SPEC §16.7 F). `v1.5.0` shipped every link as the familiar blue and permanently underlined through one token and two utilities (decision 203, SPEC §15.4), the attachment form has one control — the styled label opens the picker and choosing a file uploads it (decision 204, SPEC §23.1) — and the charts name their hatch patterns per figure with a two-rect muted bar, fixing the in-progress bars that were invisible on screens 1024px and wider from v0.14.0 (decision 202, SPEC §16.7); published as `v1.5.0`, `latest` and `sha-<short>` to one digest. `v1.7.0` shipped the Recurring page changes — Cancel moved inside the Edit disclosure, double-confirmation before cancelling, a Restore button for cancelled schedules with an explicit back-fill warning, the trimmed Active-from label, and alternating Schedules rows (decision 206); published as `v1.7.0`, `latest` and `sha-<short>` to one digest. The Contracts & Renewals redesign shipped as acceptance candidate `v1.8.0-rc.1` and was accepted in the field. `v1.9.0` promoted the accepted `v1.8.0-rc.1` Contracts & Renewals agreement register to stable, adds the granular expandable parent/child category tree selector on Chart E (`E · Spending mix — Where the money goes`, decision 207), and updates `npm test` to run in memory-bounded batches (`scripts/run-tests.mjs`); published as `v1.9.0`, `latest` and `sha-<short>` to one digest. `v1.10.0` shipped alternating All Transactions rows (issue #23) and Chart E renamed "Where the money went" with no dates after today, the Since last payday / Last full payday cycle / Month to date quick windows and pickers kept in sync (issue #24, decision 208); no schema change; published as `v1.10.0`, `latest` and `sha-<short>` to one digest. `v1.15.0` is the current stable release, GitHub issue #44: All Transactions opens on the household's saved default pot when no valid `potId` is present, while explicit targets win; clearing restores the old fallback; no schema change; published as `v1.15.0`, `latest` and `sha-<short>` to one verified digest. `v1.14.0` before it corrected saved pot-to-pot transfers in place (issue #33), with a version guard, read-only support refusal and before-and-after audit; no schema change. `v1.13.1` before it was a patch for the re-opened issue #34: anchored deep links (including the Supplier card's schedule links) land below the sticky header at every width, because the landing offset is measured from the header rather than a constant (decision 216); no schema change; published as `v1.13.1`, `latest` and `sha-<short>` to one digest. `v1.13.0` before it shipped the Supplier card schedule links and empty state, the in-place Recurring search filter, and remembered cancelled schedule visibility across navigations (issues #34 and #35, decisions 214–215); no schema change; published as `v1.13.0`, `latest` and `sha-<short>` to one digest. `v1.12.0` is the previous stable release: the Recurring Schedules list can hide cancelled schedules, with a count of those hidden (issue #28, decision 212), and All Transactions purchase links land below the sticky header (issue #30, decision 213); no schema change; published as `v1.12.0`, `latest` and `sha-<short>` to one digest. `v1.11.0` released 2026-10-14: Chart C counting every line marked for a person whatever its category (issue #25, decision 209), By Person month navigation keeping the panel in view (issue #26, decision 210), and the honesty loop's −15%…+10% tolerance band (issue #27, decision 211); no schema change; published as `v1.11.0`, `latest` and `sha-<short>` to one digest.

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
