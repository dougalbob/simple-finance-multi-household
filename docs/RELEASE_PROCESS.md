# Release and GitHub delivery process

**Standing default.** This is how every Simple Finance release is delivered, agreed with the
household after v0.1.7 and reworked on 2026-09-27 after v0.23.0 (decisions 172–173). It applies to
all future releases unless the household changes it explicitly.

**The agent owns the whole process.** The household should never have to merge a pull request,
create a tag, publish an image or open a GitHub release by hand. The household states when they
want the next release — or the agent asks at a sensible milestone — and the agent takes it from
there to a published image. At the end the household is asked to do exactly two things in Unraid:
take a backup, then Force Update.

**One pull request, no post-merge session work (decision 173).** The Arena session ends the moment
its release PR merges, so nothing may be left for "after the merge". Implementation, tests, all
five version places, the release notes document, the handoff block, blueprint/plan updates — all of
it lands in the single release PR *before* merging. The Publish workflow creates the GitHub release
itself, and post-merge verified facts (digest, run IDs) are recorded by the *next working session*
in `HANDOFF.md` — never by a second, documentation-only PR. The old pattern of a docs follow-up PR
after each release is retired; v0.23.0's PR #83 was the last of them and was closed unmerged.

## 1. Version

Bump the version consistently in all five places. `tests/version.test.ts` checks the first three
against each other, so a partial bump fails CI rather than shipping a mismatch.

- `package.json`
- `package-lock.json` (root `version` and `packages[""]`)
- `src/lib/version.ts` (`APP_VERSION` — the version badge in the navigation reads from here)
- `simple-finance.xml` (the Unraid template description)
- the release notes document, `docs/RELEASE_NOTES_vX.Y.Z.md`

## 2. Branch, pull request, merge

1. Commit the implementation on the Arena session branch.
2. Push that branch and open the pull request against `main`.
3. Merge with a **merge commit, never squash**. The repository allows all three merge methods, so
   pass the method explicitly rather than accepting a default: `gh pr merge --merge`.
4. Wait for all pull request checks to pass before merging — `gates` (format, types, tests, build,
   audit), `browser` (Playwright acceptance) and `docker` (image build, entrypoint smoke, and the
   upgrade smoke from the most recently published release image).
5. After merging, wait for the CI checks on the resulting `main` merge commit to pass too.

## 3. Migrations

Any release that adds a migration must keep the migration journal ordered:

- `drizzle/meta/_journal.json` `when` stamps must be **strictly increasing and never in the
  future**. drizzle's migrator applies an entry only when its stamp is newer than the single newest
  stamp recorded in the database's `__drizzle_migrations` table — an out-of-order stamp is
  *silently skipped on every upgraded database* while fresh installs stay green. That is exactly
  how v0.23.0 shipped broken (decision 172). `tests/migrate-journal.test.ts` guards this in
  milliseconds.
- Prefer `npm run db:generate` (drizzle-kit) so stamps come from the real clock. If an entry must
  be hand-stamped, pick a real past instant strictly between its neighbours.
- Never change a shipped migration's SQL — the hash drizzle records is the sha256 of that file, and
  editing it orphans every fielded database. Re-dating an ordering stamp is the only sanctioned
  edit, and only alongside a repair that converges fielded databases (v0.23.1 is the worked
  example: `src/lib/db/migrate-repair.ts` + `scripts/migrate-repair.cjs`).
- Test the upgrade path, not just fresh databases: `tests/migrate-upgrade.test.ts` has the harness,
  and the Docker jobs upgrade a previously published image end to end.

## 4. Tag and publish

6. Create an **annotated, lower-case** tag — `vX.Y.Z` — on that exact merge commit.
7. Push the tag. The Publish workflow is tag-triggered (`on: push: tags: 'v*.*.*'`); merging a
   pull request publishes nothing on its own.
8. Wait for the Publish workflow to complete successfully. It builds, smoke-tests the fresh start,
   **upgrades the two most recently published release images to this build on the same volume and
   requires every journal entry applied exactly once**, and only then pushes — a broken image or a
   broken upgrade cannot reach the registry just because a tag exists.

Never retag a published release and never rewrite an earlier `docs/RELEASE_NOTES_vX.Y.Z.md`.
`latest` moves forward; history stays put.

## 5. Verify the registry

9. Confirm GHCR carries all three tags for the release:
   - `ghcr.io/dougalbob/simple-finance:vX.Y.Z`
   - `ghcr.io/dougalbob/simple-finance:latest`
   - `ghcr.io/dougalbob/simple-finance:sha-<merge short SHA>`
10. Confirm all three resolve to **one digest**, and that the digest **differs** from the previous
    published release. A digest equal to the previous release means the new code was not published.
    (The Publish workflow performs this check itself and fails the run on a mismatch; this step is
    the agent's independent confirmation.)

## 6. Release notes

Complete `docs/RELEASE_NOTES_vX.Y.Z.md` **in the release PR, before merging**. Its first line must
be exactly:

```text
# Release notes — vX.Y.Z — <short subject>
```

The Publish workflow derives the GitHub release title from that line and refuses to publish without
the document. The document itself carries: what changed; schema and data caveats (state plainly
when there are none); who is affected and what to do; verification; Unraid backup and Force Update
instructions; the version badge text the household should see; and a link to the release notes
document. The published date, merge commit, image tags and verified digest are **prepended
automatically by the Publish workflow** — do not hand-write them into the document.

## 7. GitHub release and handover

11. The Publish workflow creates the GitHub release (body: auto-generated facts + the notes
    document) and marks it **Latest**. After the run completes, verify the release exists, is
    marked Latest, and shows the correct digest — then record the verified facts (merge SHA, run
    IDs, digest) in the next working session's `HANDOFF.md` block. If the workflow cannot create
    the release, that is a defect to fix in the workflow — not a step to hand to a future session.
12. Tell the household only this: take a backup, then Force Update in Unraid.

## Scope discipline

A release carries the work that session agreed on. Unrelated open items from
[`HANDOFF.md`](HANDOFF.md) stay out unless the household expands the scope, and the five version
files stay in step with each other.

## Worked example

v0.23.1 — the v0.23.0 upgrade migration repair. Journal entry 0011 re-dated to `1790504000000`
(strictly increasing, never future); the migration runner repairs fielded bookkeeping before
migrating (`[migrate-repair] re-dated 0011_schedule_excluded_months: 1790600000000 ->
1790504000000`); CI and Publish upgrade previously published images before anything merges or
pushes; the Publish workflow created the GitHub release from
[`RELEASE_NOTES_v0.23.1.md`](RELEASE_NOTES_v0.23.1.md) with the verified facts prepended.
