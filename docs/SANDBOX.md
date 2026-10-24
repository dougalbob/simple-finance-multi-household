# Sandbox notes — constraints of the Arena agent environment

> **For the agent:** read this before you assume a tool is broken. It saves you an hour of retrying a blocked host.
> **For the household:** you don't need to read this — it's the agent's field notes on the sandbox where the code is written.

This file is append-only. Each entry is a constraint we actually hit, plus the workaround that is proven to work here. Don't delete old entries — future sessions will hit the same walls. Add new ones at the bottom with the date (Europe/London).

## How to use it

1. **Check here first** when `npm ci`, `npx playwright install`, `apt-get`, or a download fails. If it's listed below, use the workaround — don't brute-force the same URL.
2. If you hit a new sandbox issue, **add it before you merge your PR**. The merge closes the session — Arena won't let you push substance after that. Record the symptom, the blocked host/path, and the fix that worked.
3. Reference this file from `docs/HANDOFF.md` and from the relevant entry in `docs/IMPLEMENTATION_PLAN.md` so the next session finds it.

---

## 1. `nodejs.org` is blocked — `node-gyp` can't fetch headers

**Symptom:** `npm ci` fails during `better-sqlite3` install with `curl exit 35` / `HTTP 000` fetching from `nodejs.org`. The error rolls back the install.

**Reality:** `better-sqlite3@13.0.3` **ships prebuilds** (`prebuilds/linux-x64.node` for Node 22) and does not need a compile on this image. The failure is only `node-gyp` trying to download headers, not a missing package.

**What works here:**

- `npm ci --ignore-scripts` succeeds (86 packages) and `require('better-sqlite3')` loads the bundled prebuild. `npm test` (248 tests), `typecheck`, `format:check`, and `next build` all pass this way.
- If you need a full `npm ci` with scripts, stage a Node header tree and point npm at it:
  ```bash
  # fetched once via codeload, which is reachable (see below)
  # headers live at ~/.nodebuild/nodedir/include/node (+ config.gypi)
  npm_config_nodedir=/home/user/.nodebuild/nodedir npm ci
  ```
  Plain `~/.cache/node-gyp/.../config.gypi` alone is ignored — npm uses its own `--devdir` (`~/.npm/_node-gyp`). `npm_config_nodedir` is what npm respects.
  That header tree is **not shipped in the sandbox and is not in the repo** — a fresh session has to assemble it first, from the codeload tarball in entry 4. Until then `--ignore-scripts` above is the only route that works, and for this repo it is enough.

**Do not:** keep retrying `nodejs.org` or `npm rebuild better-sqlite3` — the prebuild exists, the host does not.

**Hosts:** `registry.npmjs.org` ✔ reachable, `api.github.com` ✔ reachable, `codeload.github.com` ✔ reachable, `nodejs.org` ✘ blocked, `objects.githubusercontent.com` (release assets) ✘ blocked after redirect.

---

## 2. `cdn.playwright.dev` is blocked — no browser download

> **Partly superseded by entry 8 (2026-09-24):** the *download* is still blocked and `apt` still has
> no `libnss3`, but `@sparticuz/chromium` on the npm registry provides both a browser and the libs, and
> the real Playwright suite runs locally through a throwaway config overlay. Read entry 8 before you
> accept a red `browser` job.

**Symptom:** `npx playwright install chromium` fails with `ECONNRESET` to `cdn.playwright.dev`. `npx playwright install --with-deps chromium` also fails — `apt-get` can't reach `deb.debian.org` and the required libs (`libnss3`, `libgbm`, `libgtk-3`, etc.) are absent (`ldconfig` finds none), so even a sideloaded binary wouldn't start.

**What works here:**

- Don't try to make Playwright run locally. The repo is designed for this: `playwright.config.ts` wires `scripts/e2e-server.mts` (fictional seed data in `.e2e-data`, port 3100, dev identity bypass) and CI runs the real browsers.  See `docs/HANDOFF.md` · `docs/IMPLEMENTATION_PLAN.md` decision 87 and `playwright.config.ts` comment.
- Run every gate that *can* run locally — `npm ci`, `format:check`, `typecheck`, `npm test`, `next build`, `npm audit --omit=dev` — and let the CI `browser` job be the proof for the new specs. An older handoff note claimed the suite "cannot run tests" here; that is wrong and is kept only as a warning. `npm test` runs (248 tests), Playwright does not.

---

## 3. `deb.debian.org` is blocked — no `apt` system deps

**Symptom:** `apt-get update` / `playwright install --with-deps` → `Connection failed` to `151.101.x.x:80`, packages `libxdamage1`, `libxkbcommon0`, `xvfb`, fonts, etc. all `Unable to locate`.

**Implication:** same as above — you cannot bring a browser into this sandbox. Don't spend the session fighting `apt`.

---

## 4. GitHub release assets redirect off-domain

**Symptom:** `gh` API works, but downloading a release asset (redirect to `objects.githubusercontent.com`) is blocked. `codeload.github.com` *is* reachable, which is how the Node header tarball was fetched (`https://codeload.github.com/nodejs/node/tar.gz/v22.22.3`). Remember the tarball prefix is `node-22.22.3` (no `v`) and `include/node` must be assembled — the tarball has `src/` but not a ready `include/node` tree.

---

## 5. `npm_config_nodedir` vs `~/.cache/node-gyp`

Staging `~/.cache/node-gyp/22.22.3/config.gypi` (`installVersion: 2`) is not enough — `npm` passes its own `--devdir` and bypasses that cache. The env var `npm_config_nodedir` is the one `npm` honours.

---

## 6. `ghcr.io` is blocked — you cannot inspect the registry from the sandbox

**Symptom:** any `curl` to `ghcr.io` fails with `curl exit 35` (`SSL_ERROR_SYSCALL`), including the anonymous pull-token endpoint `https://ghcr.io/token?scope=repository:dougalbob/simple-finance:pull`. There is also no Docker daemon in the sandbox, so `docker buildx imagetools inspect` — the command the publish workflow uses — is not available either way.

**Consequence:** release step 9/10 ("confirm GHCR carries all three tags and that they resolve to one digest differing from the previous release") **cannot be done the obvious way from here.** Do not conclude the release is unverified. Two routes work:

- **The publish workflow already proves it.** Its `Verify the registry tags resolve` step resolves the remote digest for all three tags and compares it against the digest of the image it just built and smoke tested, failing the job on any mismatch. Read the step's **conclusion**, not its output: `gh run view <id> --json jobs -q '.jobs[0].steps[] | {name, conclusion}'`. A `success` there *is* the one-digest proof.
- **`api.github.com` gives you the digest directly** (reachable, entry 1). Package versions live under the **user** scope, not the org scope — `dougalbob` is a user, so `/orgs/...` returns 404:
  ```bash
  gh api "/users/dougalbob/packages/container/simple-finance/versions?per_page=20" \
    -q '.[] | "tags=\(.metadata.container.tags|join(","))  digest=\(.name)"'
  ```
  The digest is the **`name`** field — there is a `digest` field too and it is always `null`. One entry carrying `["sha-<short>", "vX.Y.Z", "latest"]` confirms step 9, and comparing `name` against the previous release's entry confirms the digest moved.

**Do not:** retry `ghcr.io`, or try `docker login` / `docker manifest inspect`. Neither the host nor a daemon exists here.

---

## 7. GitHub Actions log text is unreachable — read step conclusions instead

**Symptom:** `gh run view <id> --log` and `gh api repos/<owner>/<repo>/actions/jobs/<jobId>/logs` both return nothing usable. The API responds with a redirect to `productionresultssa5.blob.core.windows.net`, which is blocked, so the fetch dies with a `Get "https://productionresultssa5.blob.core.windows.net/..."` error. The run **step summary** (`### ... >> $GITHUB_STEP_SUMMARY`) is not retrievable this way either.

**Consequence:** you cannot read what a CI step printed. You can still read **whether it passed**, which is usually the actual question.

**What works here:**

- Per-step conclusions: `gh run view <id> --json jobs -q '.jobs[0].steps[] | "\(.name): \(.conclusion)"'`.
- Check runs on a commit: `gh api repos/<owner>/<repo>/commits/<sha>/check-runs -q '.check_runs[] | "\(.name)\t\(.status)\t\(.conclusion)"'`.
- **Check-run annotations carry the actual failure text**, and they are served by `api.github.com` so
  they work when the log endpoints do not:
  `gh api repos/<owner>/<repo>/check-runs/<jobId>/annotations -q '.[] | "\(.path): \(.message)"'`.
  Playwright's `github` reporter puts the full error there — the failing locator, the received and
  expected values, the source line — which is exactly what a red browser job needs. Use this instead
  of `--log-failed`.
- `gh run watch <id> --exit-status` blocks until done and returns non-zero on failure — good for gating a merge or a tag.
- For values CI computed but you cannot read (a digest, a resolved tag), re-derive them from a reachable API instead — see entry 6.

**Do not:** assume a step was skipped because its log is empty. Empty log ≠ did not run; check `conclusion`.

---

## 8. A browser *can* run here — `@sparticuz/chromium` from the npm registry (2026-09-24)

**Correction to entries 2 and 3.** "No browser download" and "no `apt` system deps" are both still true, but
that does not make the browser suite impossible. `registry.npmjs.org` is reachable, and
`@sparticuz/chromium` ships a Chromium build **inside its npm tarball** (no CDN fetch) together with the
Amazon-Linux shared libraries Chromium needs from an `al2023.tar.br` blob.

**Recipe (proven — the whole suite runs green locally):**

```bash
mkdir -p /tmp/pwbrowsers && cd /tmp/pwbrowsers && npm init -y && npm i @sparticuz/chromium
# writes the binary to /tmp/chromium (+ /tmp/fonts, /tmp/swiftshader)
node -e "import('@sparticuz/chromium').then(async (m) => console.log(await m.default.executablePath()))"
# the al2023 libs are only auto-extracted when the package detects Amazon Linux, so inflate them yourself
node -e "import('/tmp/pwbrowsers/node_modules/@sparticuz/chromium/build/lambdafs.js').then(m => m.inflate('/tmp/pwbrowsers/node_modules/@sparticuz/chromium/bin/al2023.tar.br'))"
LD_LIBRARY_PATH=/tmp/al2023/lib /tmp/chromium --version   # Chromium 153.0.8010.0
```

A throwaway config overlay points the repo's own projects at that binary (the repo's
`playwright.config.ts` stays untouched, and the overlay is never committed):

```ts
// playwright.local.config.ts
import { defineConfig } from '@playwright/test';
import base from './playwright.config';
const launchOptions = {
  executablePath: '/tmp/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
};
export default defineConfig({
  ...base,
  projects: (base.projects ?? []).map((project) => ({ ...project, use: { ...project.use, launchOptions } })),
  use: { ...base.use, launchOptions },
});
```

```bash
LD_LIBRARY_PATH=/tmp/al2023/lib npx playwright test --config playwright.local.config.ts
```

Notes from using it: the package's own `chromium.args` include `--single-process`, which Playwright does not
like — pass your own args as above. Playwright wanted 153.0.8010.12 and got 153.0.8010.0; the version gap has
not mattered. The suite needs the web server, and Playwright starts it (`reuseExistingServer` is on outside
CI, so kill any server already on 3100 if you want a fresh seed — the server reseeds `.e2e-data` on start).
Fifty tests across all projects took ~2 minutes, versus ~16 CI minutes per push: fix browser failures here,
not in CI.

## 9. Turbopack dev serves a stale SSR module after an edit (2026-09-24)

**Symptom:** you add an attribute to a client component and `curl http://127.0.0.1:3100/` never shows it,
even though the file on disk has it and the page hot-reloads. (Here: `inert` never appeared because the
server-rendered HTML kept coming from the pre-edit module.)

**What works:** restart the dev server, and if the new markup still does not appear, `rm -rf .next` first. A
fresh `scripts/e2e-server.mts` start after clearing `.next` rendered the attribute immediately. Do not
conclude the code is wrong from a `curl` against a long-running dev server.

## 10. Unpushed commits die with the sandbox — push after every step (2026-09-25)

**What happened:** after v0.9.0 was published, session `arena/01a0d55f-simple-finance` committed four
follow-up fixes locally (decisions 134–137) while GitHub was having an outage, so the push never landed.
That sandbox was then gone; the next session found `main` and the session branch still at the v0.9.0 merge
and had to re-implement the fixes from the conversation's description (session
`arena/01a0d778-simple-finance`, v0.10.0).

**What to do:** push the session branch after **every** commit (`git push origin <session branch>`) and check
it with `git ls-remote origin <session branch>` — a local commit is not saved work. If a push fails, say so
to the household at once and keep a note of what is unpushed in `docs/HANDOFF.md` at the next successful
push, rather than carrying on for several commits.

**Related trap:** `npm run format:check` runs `prettier --check .`, which also sees the untracked,
git-excluded `playwright.local.config.ts` from entry 8. CI never has that file, so it cannot fail CI, but the
local check reports it — run `npx prettier --write playwright.local.config.ts` once after creating it.

**Sibling fact (2026-09-25):** `node_modules` and `/tmp` do not survive a workspace re-clone / snapshot
restore either — the platform excludes them from persisted snapshots. The symptom is baffling: green
gates minutes earlier, then `prettier: not found` and every test file dying with `Cannot find package
'tsx'` on an untouched working tree. Re-run `npm ci --ignore-scripts` (and the entry 8 browser setup)
after any gap before trusting a mysteriously red gate — and never read those load failures as your code
breaking. The same boundary also rewound `.git` once: two local commits vanished and their content came
back as uncommitted changes (a push then shipped a branch identical to `main`). Commit **and** push in
the same turn, then verify with `git ls-remote`.

---

## 11. The fuzzy edit tool can quietly mangle a large file — diff after every edit (2026-09-25)

**Symptom:** three `edit_file` calls against `src/components/quick-entry.tsx` (1900 lines) each reported
success, and `npm test` even stayed green — but `tsc --noEmit` failed with two `TS1005: ':' expected`. The
diff showed what had happened: `linePence[index] ?? 0` had become `linePence? 0` (~40 lines away from the
edited hunk), a stray `   null,` had been inserted into an unrelated JSX prop, and one of the three edits
had not applied at all. The Node test suite never noticed because it does not import client components.

**What works here:**

- Run `git diff` (or `npx tsc --noEmit`, which catches it in ~15s) **after every edit** to a large file,
  not once at the end of the session. Fixes are trivial when the hunk is still fresh in mind.
- For a surgical change in a big file, a small `python3 -` heredoc with `assert s.count(old) == 1` before
  `s.replace(...)` is both exact and self-checking: it fails loudly if the anchor is not unique.
- Trusting "Edit succeeded" is not verification. Neither is a green `npm test` for a **component** change —
  the unit suites are server-side; component behaviour is only covered by `tsc` and the Playwright suite.

## 12. Next 16 refuses a second `next dev` in the same directory (2026-09-25)

**Symptom:** with the Playwright e2e server already running on 3100, a second `next dev -p 3200` (pointed at
a different `DATA_DIR`, to look at a *low-balance* database in the browser) printed `✓ Ready`, then died:

```
⨯ Another next dev server is already running.
- Local: http://localhost:3100
- PID:   6900
- Dir:   /home/user/simple-finance
```

Next 16 guards on the **project directory**, not the port, and the second process exits 1 after claiming to
be ready — so a preview started that way looks alive for a few seconds and then refuses connections.

**What works here:** stop the first server (`kill <PID>`; the message prints it), or run the second one from
a copy of the repository. Pointing two servers at two data directories is fine — the guard is only about the
project directory.

Related and useful for chart work: a throwaway database is the quickest way to see a state the seed does not
produce. `cp -r .e2e-data /tmp/low-data`, open it with the repo's own domain functions
(`node --import tsx` + `openDatabase` + `addCheckpoint`/`createSchedule`), then start one dev server against
`DATA_DIR=/tmp/low-data`. That is how the below-zero forecast (sub-zero tint, overdraft line, "£1,831.27
below zero" headline) was checked in a real browser before release without touching the seeded specs.

Current multi-household runtime note: there is no global `DATABASE_PATH` or `DOCUMENTS_DIR` setting.
Each finance handle is cached by the absolute path derived from the active registry household ID, and
its documents path comes from the same resolved context. Relative `DATA_DIR` is supported and covered
by `tests/db-handle.test.ts`; absolute roots (`DATA_DIR=$PWD/.e2e-data …`) remain easiest to inspect.
Never select a tenant by setting an ID in a URL, form or environment variable.

---

## 13. The Arena GitHub connector drops mid-session — reconnect windows (2026-09-25)

**Symptom:** mid-session, every GitHub call dies at once: `gh auth status` → `token in GH_TOKEN is no
longer valid`; `gh api …` → `401 Bad credentials`; `git push` / `git ls-remote` → `could not read
Username` (terminal prompts are disabled, so it fails instead of asking). It killed the v0.14.0 release
session minutes after PR #58 merged, and there is no local fallback to find afterwards: no credential
helper, no `~/.git-credentials`, no `~/.netrc`, no `GIT_ASKPASS`, and `.git/config` holds only a plain
`https` remote.

**Consequence:** the session cannot touch GitHub at all until a human toggles the connector. Two facts
keep the diagnosis honest. `GH_TOKEN` is a 24-character opaque Arena handle beginning `aren`, not a
GitHub token at all — so GitHub token lifetimes, SAML and SSO are red herrings, and there is no local
credential to refresh or rotate. And `dougalbob` is a USER account, so org SSO and IP-allow-list
explanations do not apply either. The observed correlation (2026-09-25): the handle went invalid around
the PR-merge / session-close / workspace re-clone window — PR #58 merged at 18:16:55 UTC, the workspace
re-cloned at 18:44:44 UTC, and 401s appeared in between — so treat any of those three as a likely
expiry trigger.

**What works here:** the reconnect window — now standard practice for every release. Batch remote work
into as few windows as possible and do ALL local work (edits, tests, gates, Playwright) outside them.
Immediately before each window, ask the household to toggle the GitHub connector off and on in "Add
files and connections"; only once they reply, verify with `gh auth status` plus one cheap authenticated
read, then run the remote calls straight away. Waiting on a workflow inside a window is fine (polling is
a read) — if a poll 401s, ask for a toggle and resume polling. Two quirks of the post-toggle token
(`arena-ai-coding-agent[bot]`, 2026-09-25): `GET /user` returns `403 Resource not accessible by
integration` — app-bot tokens cannot call that endpoint — so use a repo-scoped read such as `gh api
repos/dougalbob/simple-finance --jq .full_name` as the liveness probe, and note `403` is **not** the
dead-handle signature (that is `401 Bad credentials`). And the token has no `actions: write`: `gh run
rerun` fails with "cannot be rerun; its workflow file may be broken", which is gh's misleading wrapper
around a plain 403 from the re-run API — plan CI around one green run per SHA, or document the flake the
way v0.14.0's release notes do.

**Do not:** never blindly retry a 401 — report exactly which steps completed and which did not, ask for a
toggle, and resume from the correct step; never re-tag a pushed tag and never force-push. Do not ask the
household for a PAT — the connector is broker-side and a personal token is not the fix. And do not assume
a toggle always revives a running sandbox: if `gh auth status` still fails after the toggle, say so at
once — the sandbox may be stuck with a stale handle, and a brand-new session is the way out.

---

## 14. Turbopack rejects a symlinked `node_modules` that points outside the project (2026-09-25)

**Symptom:** trying to run a second, pristine checkout (to pixel-diff `main` against a change) by
`git archive`-ing it to another directory and symlinking the first project's `node_modules` in fails
at compile time with a Turbopack panic: `Symlink [project]/node_modules is invalid, it points out of
the filesystem root`. The server prints `Ready` and then dies on the first request.

**Reality:** Next 16's Turbopack resolves packages relative to the project root and treats a
`node_modules` symlink escaping that root as an error rather than following it.

**What works here:** don't symlink. Either (a) compare against the *same* project by checking the old
`src/` out over the new (`git checkout <base> -- src`, restart the dev server per entry 9, screenshot,
`git checkout HEAD -- src`) so both states share one `node_modules` and one seed, or (b) copy
`node_modules` into the second tree. Route (a) is what produced the 0-pixel main-vs-tokens proof;
remember to restart the dev server (and clear `.next`) between the two states, and keep the seed
constant by *not* restarting the seeder between them.

**Do not:** fight the symlink — it is a hard Turbopack rule, not a permissions hiccup.

---

## 15. GitHub Actions **job logs cannot be downloaded** here — read failures through check-run annotations (2026-09-27)

**Symptom:** both routes to a CI log die at the network layer, every time, within a second:

```
gh run view <run-id> --log-failed
# failed to get run log: Get "https://results-receiver.actions.githubusercontent.com/rest/runs/…/logs?…": EOF
gh api repos/dougalbob/simple-finance/actions/jobs/<job-id>/logs
# Get "https://productionresultssa8.blob.core.windows.net/actions-results/…/job-logs.txt?…": EOF
```

`gh run view <id>` (metadata), `gh api …/actions/runs/<id>/jobs` and the run list all work — only the
log/artifact **blob hosts** are unreachable, so this looks like a transient GitHub error and invites a
retry loop. It is not transient.

**What works here:** the suite already reports through the `github` reporter (`playwright.config.ts`),
so every failure is a **check-run annotation** on `api.github.com`, which *is* reachable:

```bash
gh api repos/dougalbob/simple-finance/actions/runs/<run-id>/jobs --jq '.jobs[] | {name, id, conclusion}'
gh api repos/dougalbob/simple-finance/check-runs/<job-id>/annotations \
  --jq '.[] | {level:.annotation_level, path:.path, line:.start_line, msg:.message}'
```

The `notice` annotation carries the `1 failed / 87 passed` summary and *which* specs failed; each
`failure` annotation carries the full Playwright message — locator, expected vs received, the source
line and the call log. That was enough to diagnose a red `browser` job completely, with no log and no
trace artifact.

**Better still: do not diagnose through CI at all.** Entry 8 runs the whole suite locally — re-proved
2026-09-27 on a fresh sandbox: `@sparticuz/chromium` installed in 3s, `Chromium 153.0.8010.0`,
**88 tests across all 15 projects in ~5 minutes** (Playwright wanted 153.0.8010.12 and got .0, still
harmless). A CI run is ~6 minutes *and* its logs are unreadable here, so a local red-to-green loop is
both faster and better instrumented. Use annotations to confirm what CI saw, not to find out why.

**Also:** `gh pr view <n>` now fails outright with
`GraphQL: Projects (classic) is being deprecated … (repository.pullRequest.projectCards)`. Use the REST
endpoint instead — `gh api repos/dougalbob/simple-finance/pulls/<n> --jq '{title, state, head:.head.ref, head_sha:.head.sha, mergeable, commits}'`.

**Do not:** retry the log download, or conclude a job "produced no output" because the fetch came back
empty — the fetch was blocked.

## 16. Chromium here has no PDF plugin, and Linux has no share API — PDF.js draws pages onto a canvas, so e2e can read a page's pixels (2026-10-09)

**Symptom:** a PDF in the attachment viewer looks blank in screenshots taken here, and the share action never appears in e2e.

- This build's Chromium has no PDF plugin: `navigator.pdfViewerEnabled` is `false` and `navigator.mimeTypes` is empty. An `<object type="application/pdf">` or an `<iframe>` therefore shows its fallback content, or nothing, whatever a phone would do. That is why the reader (decision 192) draws each page with pdf.js onto a canvas: this Chromium can draw a canvas, so the attachments spec reads the centre pixel of the generated page (`isBluePixel` in `e2e/attachments.spec.ts`). A blank canvas here is a real failure. A drawn page is still no proof for a phone, because this sandbox tests neither iOS Safari nor Android Chrome.
- `navigator.share` and `navigator.canShare` are `undefined` on Linux headless, so the share button is absent. A test that needs it must define both properties with `page.evaluate` **before** it opens the viewer: the viewer reads the capability when it draws its footer, so a mock installed afterwards is never seen.
- `test.use()` inside a `test.describe` group throws `Cannot use({ defaultBrowserType }) in a describe group`. Device presets such as `devices['Pixel 7']` carry `defaultBrowserType`, so spreading one into a describe fails. Put `test.use()` at the top level, or set phone emulation explicitly in the test (viewport, `isMobile`, `hasTouch`, `deviceScaleFactor`, `userAgent`).
- A purchase created at phone width left **Save purchase** disabled until the test timed out. Create records at desktop width, then `page.setViewportSize` to phone size before opening the viewer.
- For a visual check, use a throwaway copy of a spec and a throwaway overlay project whose `testMatch` names only that copy. Delete both before committing, and never leave probe specs in `e2e/`.

**Do not:** read a passing PDF test as evidence about a phone's own browser; and do not retry `test.use` inside a describe.

---

## 17. The full Playwright run can lose its web server mid-run; `pkill -f` can kill your own shell (2026-10-10)

- **Symptom:** a full `npx playwright test` run on this 4 GB sandbox reports many unrelated failures with
  `page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:3100/...` after one long spec (about 2 minutes). The
  server log shows no crash. Rerunning just the failing specs passes, and a clean full rerun passed 123/123.
- **Do:** when `ERR_CONNECTION_REFUSED` appears mid-run, rerun the failing specs by title with `-g` before you treat them
  as real. Confirm port 3100 is free with `ss -ltnp | grep 3100` before a clean run.
- **Don't:** `pkill -f e2e-server` (or any pattern that appears in your own command) from a shell whose command line
  contains that pattern. It kills the shell and the command exits `-1` with no output. Stop servers by PID or with
  `stop_process`.
- **Smoke-check pages without a browser:** `node --import tsx scripts/e2e-server.mts` serves the seeded app on port
  3100 with dev identity bypass, so `curl` can check status codes, headers and rendered text for any route.

## 18. The Node headers are already at `/usr/local`, and container smoke steps can be replayed without Docker (2026-10-10)

- **Symptom:** after a snapshot restore `node_modules` is gone (entry 10), and plain `npm ci` then fails while building
  `better-sqlite3`: `node-gyp` tries to fetch `https://nodejs.org/download/release/v22.22.3/node-v22.22.3-headers.tar.gz`,
  which is blocked (entry 1).
- **What works here:** this sandbox's official Node image already ships the headers (`/usr/local/include/node`), so no
  codeload tarball is needed (entry 4 is about assembling one when they are *not* present):
  ```bash
  npm_config_nodedir=/usr/local npm ci   # full install, better-sqlite3 compiled, ~90 packages, ~15 s
  ```
  `npm ci --ignore-scripts` (entry 1) still works and is quicker; use the env var when a script-driven install is the
  point (for example, to prove a production dependency really resolves).
- **Replaying container steps with no Docker daemon and no `/data`:** the sandbox user is uid 1001, so `/data` cannot be
  created, and there is no Docker. Replay the workflow's own logic against a scratch data root instead — export
  `DATA_DIR=/tmp/<name>/data`, run `node scripts/registry-migrate.cjs`, insert a household into
  `$DATA_DIR/system/registry.sqlite`, run `node scripts/migrate.cjs`, then run the workflow's `node -e` payloads with
  `/data/...` rewritten to `$DATA_DIR/...` and `/app/drizzle` rewritten to the repo's `drizzle` folder. Extracting the
  payloads from the YAML (rather than retyping them) is what makes the replay evidence rather than a paraphrase.

## 19. A fresh Arena clone hides every branch but `main`, and its history is cut off (2026-10-11)

- **Symptom:** `git branch -a` shows only `main` and the session branch, `git tag -l` is empty, and `git log`
  stops abruptly with a commit marked `(grafted)`. It looks as though no other branches, tags or history
  exist. They do — this is what let `v1.0.0-rc.2` and `v1.0.0-rc.3` sit unpublished-to-`main` and unnoticed:
  the branch carrying them was invisible to a fresh session.
- **Cause:** the clone is **shallow** (`.git/shallow` names the graft point) and its `remote.origin.fetch`
  refspec is narrowed to `main` plus the current session branch:
  ```ini
  fetch = +refs/heads/main:refs/remotes/origin/main
  fetch = +refs/heads/arena/<this-session>:refs/remotes/origin/arena/<this-session>*
  ```
  So a plain `git fetch --all` cannot see anything else, and `git fetch --tags` brings tags but not the
  branches they point at.
- **Fix, at the start of any session that needs real history:**
  ```bash
  git ls-remote --heads origin          # the truth about which branches exist — always works
  git config --unset-all remote.origin.fetch
  git config --add remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'
  git fetch --unshallow --tags --prune origin
  ```
  After that, `git log --oneline --graph --all --decorate` shows every branch and tag. `--unshallow` is what
  restores history behind the graft; without it `git merge-base --is-ancestor` between a tag and `main` can
  answer from an incomplete graph.
- **Checking whether a release actually reached `main`:**
  `git merge-base --is-ancestor <tag>^{commit} origin/main && echo yes || echo no`. A tag existing proves only
  that someone tagged a commit — not that the commit was merged, and not that an image was pushed (see
  `docs/RELEASE_NOTES_v1.0.0-rc.1.md` and `-rc.2.md`, both of which are tags with no image).

## 20. `element.screenshot()` returns an unpainted image here — take the **full page** and read the box out of it (2026-10-12)

- **Symptom:** proving the chart fix (decision 202) by pixels nearly failed for the wrong reason. A
  `locator.screenshot()` of the laptop `figure` came back **entirely blank** — and so did
  `locator.evaluate((el) => el.getBoundingClientRect())`-based crops of a *viewport* screenshot taken after
  scrolling — while the same chart was plainly painted on screen. Chromium here renders element and clipped
  screenshots through a different path (`CDPScreenshotNewSurface` is forced in this build) and the SVG paint
  servers are not composited into it.
- **What paints correctly:** `page.screenshot({ fullPage: true })`, taken with the page scrolled to the top.
  Measure the bar's box with `getBoundingClientRect()` plus `window.scrollX/scrollY` (page coordinates, which
  is what a full-page shot is in), and scale by `raster.width / window.innerWidth` — **`innerWidth`, not
  `document.documentElement.clientWidth`**: the full-page shot is the viewport's width and a 15px scrollbar
  makes the two disagree by 1%, which is enough to sample the wrong pixels in a 10px-wide bar.
- **Also:** `page.screenshot({ clip })` for a region below the fold fails with *"Clipped area is either empty
  or outside the resulting image"* rather than scrolling to it, so a clipped region must be inside the
  current viewport.
- **Two more traps found on the way.** (1) An element screenshot of a hidden-by-CSS figure is not the only
  blank-image case: while debugging this, a hand-rolled PNG reader was silently wrong and turned every pixel
  grey, which looked exactly like "Chromium painted nothing" — when the pixels say the paint is missing,
  cross-check the decoder against Playwright's own `lib/utilsBundle.js` `PNG.sync.read` (reached with
  `require(require.resolve('playwright-core').replace(/index\.js$/, 'lib/utilsBundle.js'))`, entry 8's
  trick) before believing it. (2) In a Playwright `filter({ has })`, the inner locator is resolved
  **relative to each candidate**: `row.locator('form').filter({ has: row.locator('input[type="file"]') })`
  matches nothing, because the row is not inside its own form. Use `row.locator('form:has(input[type="file"])')`.
- **Rule for specs that need pixels:** take one full-page screenshot, keep the element boxes in page
  coordinates, and probe the raster with a threshold that page furniture cannot reach (the chart's gridlines
  and paper are grey; a painted bar is not). `e2e/pixels.ts` holds the decoder (`node:zlib`, no dependency).

## 21. Running all ~100 test files in one `node --import tsx --test` invocation triggers Arena OOM warnings — run in batches (`scripts/run-tests.mjs`) or target specific files (2026-10-14)

- **Symptom:** running `node --import tsx --test tests/*.test.ts` across the entire ~100-file suite in a single invocation spawns default-parallelism workers that retain compiled TypeScript modules and SQLite fixtures across the run, triggering an out-of-memory warning in the Arena sandbox.
- **What `npm test` does now:** `package.json`'s `"test"` script runs `node scripts/run-tests.mjs`, which executes `tests/*.test.ts` in sequential child-process batches of 20 files with `--test-concurrency=2` (configurable via `TEST_BATCH_SIZE` and `TEST_CONCURRENCY`). Each batch exits cleanly when its 20 files finish so the OS reclaims all memory before the next batch starts.
- **During iterative work:** run only the test files that touch the area you are changing (`npx tsx --test tests/spending-mix.test.ts tests/spending-mix-view.test.ts` or `npm test -- tests/spending-mix.test.ts`), and reserve the full batched `npm test` for pre-PR gate verification.

## 22. The **first** browser run after `.next` is deleted is the slow, flaky one — a client island can be driven before it hydrates (2026-10-14)

- **Symptom:** removing `.next` (or a fresh sandbox) and running `npx playwright test --config playwright.local.config.ts --project=recurring` failed the *first* run of `recurring-hide-cancelled.spec.ts` at the Recurring filter step, then passed on every warm run. The filter box is a client island: a keystroke that lands before React hydrates it is wiped by the hydration render, so the box never filters and a hidden cancelled schedule never appears.
- **It was not this session's change:** the same failure reproduced with the session's source changes `git stash`ed, which is how it was classified as pre-existing rather than a regression.
- **The fix is the app's own pattern, not a longer timeout:** SPEC §15.1 (decision 131) — the island says whether it is listening and stays `inert` until it is. The Recurring filter row now publishes `data-schedules-ready`; wait for it with `waitForScheduleFilter` from `e2e/support.ts` before driving the filter (the till, Purchases filters, theme gallery and category editor already have their own `data-*-ready`).
- **When you see a green-warm/red-cold split:** re-run the failing project on its own to confirm it passes warm, check whether the spec drives a *client island* input, and compare the failure against a stashed tree before calling it a regression.
- **The same run's companion lesson — a programmatic scroll can make a click miss.** v1.13.1 first fixed issue #34 by having `ScrollHashIntoView` correct the document (`window.scrollBy`) when an anchored target ended up behind the sticky header. On `/charts#commitments` that correction fired while the page was still growing as its charts rendered, landing between a click's hit-test and its dispatch: the click went to whatever had moved under the pointer, the `<details>` summary stayed shut, and `e2e/charts.spec.ts:341` failed in three consecutive runs (it passes with the correction removed, and fails again with `scroll-mt-6` restored on the Recurring row). Playwright cannot retry its way out of that race. **Fix the landing, not the aftermath:** `scroll-margin-top` does the work before any JavaScript runs, and a component that only calls `scrollIntoView({ block: 'nearest' })` never moves the page under someone's pointer.

---

## 23. A cold `.next` is worth warming before a release run, and the preview cannot share the directory with the e2e server (2026-10-15)

- **Warm the cache first (entry 22).** This session's full run reused a `.next` that an earlier
  `--project=transactions` run had already built, so entry 22's cold-run flakiness did not appear. A fresh clone
  has no cache: run one project before the full suite, and if the *first* project fails a client-island step,
  re-run it warm before calling it a regression.
- **The seeded suite's real size:** **146 tests across 24 projects**, taking roughly 25–30 minutes locally with
  `workers: 1` (entries 8's "fifty tests, ~2 minutes" is from 2026-09-24). Budget for it, or narrow with
  `--project=<name>` while iterating and run everything once before the PR.
- **`playwright.local.config.ts` is already in `.gitignore`** (line 59), so the overlay can sit in the repo root
  — `git check-ignore -v playwright.local.config.ts` confirms it, and it never appears in `git status`.
- **The e2e server owns the directory:** `scripts/e2e-server.mts` runs `next dev` on 3100 (entry 12), so stop the
  Playwright run before starting the acceptance preview (`next dev` on 3000). `ss -ltn | grep 3100` tells you
  whether the webServer is still up; Playwright kills it when its run ends.
- **A browser test can find a product bug the unit tests cannot:** the refund journey written for issue #57
  found that the Purchases page's **Record refund** button had never sent its action the fields it parses. When
  a spec needs a record the seed does not have, build it through the ordinary UI first — the wiring is part of
  what is being tested.

---

- **2026-10-15 (v1.20.0, session `arena/0ebb2691-simple-finance-multi-household`):** entry 23 added. Entry 8
  re-proved in a fresh sandbox in ~5 seconds (`npm i @sparticuz/chromium`, `inflate(bin/al2023.tar.br)` →
  `/tmp/al2023`, `LD_LIBRARY_PATH=/tmp/al2023/lib /tmp/chromium --version` → Chromium 153.0.8010.0), and the
  Chromium path and the `.gitignore` line 59 for the throwaway overlay were confirmed. Entry 17 re-proved the
  hard way: the **first** full-suite run lost its web server part-way through — 126 passed, 20 failed, from
  `projects`/`admin` onward mostly `net::ERR_CONNECTION_REFUSED :3100` — because `npm test` (the 991-test unit
  suite) was running **concurrently**; the honest full run is the solo one. Two of the failures were real spec
  defects (the `settings` project clears the household's default purchase pot, so a later till save must name
  its pot), and the rest were the dead-server cascade.
- **2026-10-14 (v1.13.1, session `arena/c2cce040-simple-finance-multi-household`):** entry 22 added after a cold-`.next` run failed the Recurring filter step; entry 8 re-proved (`@sparticuz/chromium` Chromium 153.0.8010.0, the throwaway overlay, `LD_LIBRARY_PATH=/tmp/al2023/lib`) — the recurring, insights, mobile and desktop projects and a full-suite run were all used as evidence for v1.13.1.
- **2026-10-14 (v1.9.0, session `arena/9001fee2-simple-finance-multi-household`):** entry 21 and `scripts/run-tests.mjs` added so `npm test` runs in 20-file sequential batches with `--test-concurrency=2`, avoiding Arena OOM warnings across the 885-test / 204-suite run.
- **2026-10-12 (v1.5.0, session `arena/b3e92c4d-simple-finance-multi-household`):** entry 20 added while
  proving the chart hatch fix by pixels. `@sparticuz/chromium` behaved exactly as entry 8 records
  (`npm i` in `/tmp/pwbrowsers`, `lambdafs.inflate(bin/al2023.tar.br)` → `/tmp/al2023`,
  `LD_LIBRARY_PATH=/tmp/al2023/lib`, throwaway `playwright.local.config.ts` overlay): the `charts` project
  (9 tests, including the new pixel case) and the `attachments` project (3 tests) were green locally, and the
  defective variant of the fix was proved to fail. The e2e server must be started by hand
  (`node --import tsx scripts/e2e-server.mts`) when the spec runs use `E2E_BASE_URL` against an existing
  server, and `.e2e-data` must be removed between manual runs that repeat a writing spec. `npm test` 878/201,
  typecheck, format, themes, build and `npm audit --omit=dev` all clean locally.
## History

- **2026-10-10 (v1.0.0-rc.1 publish fix, session `arena/50895dfb-simple-finance-multi-household`):** entry 18 added.
  `npm_config_nodedir=/usr/local npm ci` gives a full install (better-sqlite3 compiled) without any nodejs.org fetch,
  and the Publish workflow's smoke steps were replayed locally against a scratch `DATA_DIR` with the workflow's own
  `node -e` payloads (17 of 17 journal entries applied exactly once; the old root-level check fails as it did in CI
  run 38083365013). `npm test` 825/825, `tsc --noEmit`, `format:check` all green.
- **2026-10-09 (v0.37.0 follow-up, session `arena/9d0d4627-simple-finance`, unreleased):** entry 16 added. Entry 8 re-proved: `@sparticuz/chromium` Chromium 153.0.8010.0 with the local overlay. The full local run (`npx playwright test --config playwright.local.config.ts`, 119 tests) gave **114 passed**. The 5 red were the backup download timing out at 120 s; the dev server then stopped, so four later tests failed with `ERR_CONNECTION_REFUSED`. The same five tests then passed 5/5 on a fresh server, run as their projects (backup, credit-card-pots, insights, payday-summary). `npm test` 717/717, typecheck, format, themes and build pass, and `npm audit --omit=dev` reports 0. This sandbox's Chromium draws no PDF, so the PDF viewer is proven for wiring and layout only.
- **2026-10-08 (v0.36.0, session `arena/3b32c31f-simple-finance`):** entry 8 re-proved. The full local run
  was flaky at the *tail* in a way worth recording: by the last three projects the sandbox was at
  **3.86 GB of its 3.9 GB**, and those specs failed with `ERR_CONNECTION_REFUSED` — the `next dev` server
  had been killed. A `free -m` sample every 10 s during the run tells the story (a ~1.5 GB floor, rising
  through the compile-heavy middle projects); this is the mechanism behind entry 8's and the v0.34.0
  bullet's connection-refused flakes, not app code. Remedy that works: re-run the affected projects alone
  on a fresh server (`npx playwright test --config playwright.local.config.ts --project backup --project
  credit-card-pots`) — 3/3 green here. Budget the memory: start the run with nothing else heavy going, and
  read a red tail as memory before reading it as a bug.
- **2026-10-08 (v0.34.0, session `arena/5cf1892e-simple-finance`):** entry 8 re-proved. The first full
  local run (115 tests, `LD_LIBRARY_PATH=/tmp/al2023/lib`, ~9 min under the sandbox's load) failed three
  tests: the backup download waited the full 120 s for a `download` event, and the next two tests hit
  `ERR_CONNECTION_REFUSED` because the `next dev` server had stopped answering. The backup spec alone
  then passed 2/2, and a second full run passed 115/115 in ~6.5 min. Treat a single red local run with
  connection-refused errors as a sandbox flake: re-run before diagnosing app code. CI remains the proof.
- **2026-09-27 (v0.22.1, session `arena/01a0e1ea-simple-finance`):** entry 8 re-proved a fifth time on a
  fresh sandbox — `@sparticuz/chromium` in 3s, `inflate()` wrote `/tmp/al2023`, `Chromium 153.0.8010.0`,
  the full **88-test** suite green locally in ~5 minutes, and the failing spec reproduced locally in 2.6
  minutes before it was fixed. Entry 15 added (CI job logs are undownloadable here; check-run annotations
  are the readable route). Entry 14 widened: for a **pristine-`main` browser run alongside the working
  tree**, `git worktree add /tmp/main-check origin/main` + its own `npm ci --ignore-scripts` (11s with a
  warm cache) + a copied `playwright.local.config.ts` + `E2E_PORT=3200` works, where symlinking
  `node_modules` panics Turbopack — that is how a red spec was proved to belong to `main` and not to the
  branch. Two module-resolution traps found the hard way: `tsconfig.json`'s `**/*.ts` does **not** include
  `scripts/*.mts`, so those files are never typechecked; and a typechecked `.ts` file cannot import an
  `.mts` sibling either way — an explicit `./x.mts` path trips `TS5097` (`allowImportingTsExtensions`)
  and extensionless `./x` does not resolve. A helper the tests must import belongs in a `.ts` file
  (`scripts/e2e-seed-dates.ts`, imported extensionless from both `e2e-server.mts` and the test).
  `npm ci --ignore-scripts`, `npm test` (**534 tests / 121 suites**), `tsc --noEmit` and `format:check`
  all green locally.
- **2026-09-26 (v0.18.0 supplier card, session `arena/01a0dcb6-simple-finance`):** entry 10's sibling
  fact needs widening — `node_modules` can come back **partially** restored, not just absent. This
  session opened with a `node_modules` directory that looked fine (`ls` listed packages) but had no
  `tsx`, so `npm test` failed **all 52 suites** at import with
  `Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'tsx'` — which reads like a broken checkout or a
  bad test runner, not an install problem. `npm ci --ignore-scripts` (12s, 4 moderate advisories, as
  recorded) restored the documented **478/112 green** baseline. Rule of thumb: if the failure is an
  import of a *dev tool* rather than of the code under test, reinstall before debugging. Entry 8
  re-proved an eighth time in a fresh sandbox — `@sparticuz/chromium` installed in ~3s,
  `build/lambdafs.js` inflated `/tmp/al2023`, `LD_LIBRARY_PATH=/tmp/al2023/lib:/tmp` (with `/tmp`
  appended, as the v0.17.0 note advises), Chromium 153.0.8010.0, and the **full suite 74 tests green
  in ~4.0 minutes**. The same browser was driven directly (a plain `playwright-core` script against a
  `next dev` on a copied throwaway database) to photograph `/suppliers` at 1400px and 320px and read
  the pictures back — the cheapest way to confirm a new text clause wraps rather than pans on a
  phone. One repo-level trap worth knowing here: the Playwright projects share one `.e2e-data` with
  `workers: 1`, so `mobile` runs before `desktop`; a "five most recent" assertion must be checked
  against the **whole** suite, not just its own project.
- **2026-09-28 (v0.28.0 checkpoint cash, session `arena/01a0e796-simple-finance`):** entry 8
  re-proved an eighth time in a fresh sandbox — install, `executablePath()`, hand-inflated
  `al2023.tar.br`, `LD_LIBRARY_PATH=/tmp/al2023/lib`, throwaway overlay — and the full suite,
  now **112 tests** across every project (new `cash-checkpoint` project), went green in ~8.5
  minutes. One new note for phone/desktop layouts: assert **DOM order**
  (`compareDocumentPosition`) for "card A comes before card B" — at laptop width the pots page's
  leading cards sit side by side, so equal `getBoundingClientRect().top` is *expected*, and pixel
  tops also raced the stylesheet on a cold first paint.
- **2026-09-26 (v0.17.0 themes, session `arena/01a0dad7-simple-finance`):** entry 8 re-proved a seventh
  time in a fresh sandbox — install, `executablePath()`, then the full suite **74 tests green in ~4.5
  minutes** (new `theme` project). Two small notes for next time: the al2023 blob can also be inflated
  without the package's own helper (`zlib.brotliDecompressSync` on
  `node_modules/@sparticuz/chromium/bin/al2023.tar.br` into a file, then `tar -xf … -C /tmp/al2023`) if
  the `build/lambdafs.js` path ever moves, and `LD_LIBRARY_PATH=/tmp/al2023/lib:/tmp` (with `/tmp`
  appended) picks up the swiftshader `.so`s the package drops there. Entry 10's sibling fact held again:
  `node_modules` was simply absent at session start after the snapshot restore — `npm ci
  --ignore-scripts` fixed what looked at first like a broken checkout.
- **2026-09-25 (v0.14.0 release, session `arena/01a0d9e9-simple-finance`):** entry 13 added after the
  GitHub connector dropped mid-release (around the PR #58 merge / session-close / re-clone window) —
  reconnect windows, the `aren…` handle anatomy and both 403 quirks of the post-toggle token (`GET
  /user`, `gh run rerun`) are recorded there. Entry 12 gained the relative-`DATA_DIR` line, and
  `getDbHandle()` now resolves both sides of its identity check (`tests/db-handle.test.ts`). Entry 8
  re-proved a sixth time in a fresh sandbox (70 tests green in ~3.8 minutes) — the same browser proved
  the `/purchases` filter-form hydration race with a delayed-JS probe (DOM `vehicle`, React attached,
  options empty) before it was fixed with the decision-131 `data-filters-ready` + `inert` pattern and
  `waitForFilters`. Entry 10 gained the sibling fact that `node_modules` and `/tmp` die with a workspace
  snapshot restore (mysteriously red gates after a gap are an install problem, not a code problem).
- **2026-09-25 (v0.14.0, session `arena/01a0d991-simple-finance`):** entry 12 added. Entry 8 re-proved a
  fifth time in a fresh sandbox — `@sparticuz/chromium` installed in 3s, `inflate()` wrote `/tmp/al2023`,
  and the full suite (now **70 tests** across every project, including the new `charts` project) went green
  in ~3.8 minutes with `LD_LIBRARY_PATH=/tmp/al2023/lib`. The same browser was used headless to take
  screenshots of `/charts` at 1400px and 320px and to read them back — cheap, and it caught two things no
  assertion would have: two reference-line labels printing on top of each other, and a legend entry for an
  overdraft line that was off the chart. `npm ci --ignore-scripts`, `npm test` (459/111), `tsc --noEmit`,
  `format:check` and `next build` all green locally; `next build` flipped `next-env.d.ts` again (reverted
  with `git checkout --`).

- **2026-09-24 (v0.9.0, session `arena/01a0d55f-simple-finance`):** entries 8 and 9 added. The v0.9.0 `browser`
  job came back red on four specs, and this time the annotations alone were not enough to be sure of the
  cause — so the suite was brought up locally instead. Entry 8's recipe is the result: `@sparticuz/chromium`
  from the npm registry, its `al2023.tar.br` libs inflated by hand, `LD_LIBRARY_PATH` set, a throwaway
  `playwright.local.config.ts` overlay — and the full suite (50 tests, every project, seeded server) runs
  green in ~2 minutes. The four failures were one race: taps and keystrokes landing before React hydrated the
  quick-entry island. Fixed in the product (`data-till-ready` + `inert`, SPEC §15.1 · decision 131), in the
  specs (`e2e/support.ts` · `waitForTill`) and in the pot guard (decision 132). Entry 9 records the Turbopack
  dev-cache surprise found on the way. Everything else behaved as recorded: `npm ci --ignore-scripts`,
  `npm test`, `tsc --noEmit`, `format:check`, `next build` all green locally.
- **2026-09-25 (v0.10.0, session `arena/01a0d778-simple-finance`):** entry 10 added after the post-v0.9.0
  commits were lost with their sandbox. Entry 8 re-proved from scratch in a fresh sandbox (Debian 12 image,
  `libnss3` still missing without `LD_LIBRARY_PATH`): the full suite, now 55 tests, green in ~2.3 minutes.
  `npm test` 376/95, `tsc --noEmit`, `format:check` and `next build` green locally.
- **2026-09-22:** Initial entries after v0.1.8 (category-tree revalidation). Verified in this sandbox: `npm ci --ignore-scripts` → 86 packages, 248/248 Node tests, `next build` green, Playwright blocked as above. Source: session `arena/01a0ca74-simple-finance` discussion 2026-09-22 19:xx UTC.
- **2026-09-23:** Committed in v0.1.9 and every claim above re-probed in a **fresh** sandbox (session `arena/01a0cc97-simple-finance`), since uncommitted working-tree drafts do not survive between sessions. All reproduced: 86 packages, 248/248 tests, 67 suites, `tsc --noEmit` clean, `prettier --check .` clean, `next build` 15 routes, `npm audit --omit=dev` 0 vulnerabilities. Hosts re-confirmed — `nodejs.org` / `cdn.playwright.dev` / `objects.githubusercontent.com` fail with curl exit 35 (`SSL_ERROR_SYSCALL`), `deb.debian.org` with exit 52 and `apt-get update` failing all three indices at `151.101.x.x:80`, while `registry.npmjs.org`, `api.github.com` and `codeload.github.com` return HTTP/2 200. Missing browser libs re-confirmed absent via `ldconfig` (`libnss3`, `libgbm`, `libgtk-3`, `libxdamage`, `libxkbcommon`) and no `Xvfb`. One correction: `~/.nodebuild/nodedir` did not exist in the fresh sandbox, so entry 1 now says plainly that the header tree must be assembled first.
- **2026-09-23 (later, same session):** entries 6 and 7 added after hitting them while verifying the v0.1.9 publish. `ghcr.io` blocked with curl exit 35 including the anonymous pull-token endpoint, and no Docker daemon, so registry verification went via the publish workflow's step conclusion plus `/users/dougalbob/packages/container/simple-finance/versions` on `api.github.com` — note the **user** scope (`/orgs/...` 404s) and that the digest is the `name` field, since `digest` is always `null`. GitHub Actions log text blocked via `productionresultssa5.blob.core.windows.net`, so step conclusions were read instead. v0.1.9 resolved to `sha256:7b7d053dd4e2451c2076747acbe7a27fb0da89bc5847d042707ec244707a6b4d` on tags `v0.1.9` / `latest` / `sha-9393a85`, differing from v0.1.8's `sha256:da65d23e…`, which was not retagged.
- **2026-09-23 (v0.3.0, session `arena/01a0ce41-simple-finance`):** entry 7 gained the check-run annotations API after three red `browser` jobs on the All Transactions PR — `--log-failed` and `/actions/jobs/<id>/logs` both came back empty, while `check-runs/<jobId>/annotations` returned the full Playwright error (locator, received vs expected, source line) each time. Entry 6 re-confirmed the same session: `ghcr.io` still fails with curl exit 35 on both the manifest endpoint and the anonymous pull-token endpoint, no `docker`/`skopeo`/`crane` on PATH, and the versions API still reports the digest in `name` with `digest: null`. v0.3.0 resolved to `sha256:2db0a0c802d5055d1e7788b03dfd52c98bba0125dbbc032354b3b1f2d031da68` on tags `v0.3.0` / `latest` / `sha-96069a3`, differing from v0.2.1's `sha256:7008ed72…`, which was not retagged.
- **2026-09-24 (v0.7.0, session `arena/01a0d490-simple-finance`):** entry 7 re-proved and extended. On a red
  `browser` job, `gh run view --job <id> --log-failed`, `gh api .../jobs/<id>/logs` and even the failure
  artifact download (`gh api .../artifacts/<id>/zip`, redirected to `productionresultssa12.blob.core.windows.net`)
  all died with `EOF` — the log/artifact blob hosts are not just slow here, they are unreachable. The
  check-run annotations route worked first time and named both failing specs with the locator, the received
  vs expected values and the source line, which is all that was needed to fix them; the report artifact was
  not needed at all. Everything else about the sandbox behaved as recorded: `npm ci --ignore-scripts`,
  `npm test` (335/84), `tsc --noEmit`, `format:check` and `next build` all green locally, Playwright only in
  CI. Also worth remembering: `next build` rewrites `next-env.d.ts` (its two `reference` imports flip
  between `./.next/dev/types/…` and `./.next/types/…`), so `git checkout -- next-env.d.ts` before committing
  unless the change is the point.
- **2026-09-25 (v0.13.1, session `arena/01a0d93c-simple-finance`):** entry 8 re-proved a fourth time in a
  fresh sandbox (the `@sparticuz/chromium` install took 3s and `inflate()` wrote `/tmp/al2023` as before):
  the full suite, 63 tests across every project, green in ~2.5 minutes with `LD_LIBRARY_PATH=/tmp/al2023/lib`.
  Entry 11 added — the fuzzy edit tool mangled `quick-entry.tsx` in three places while reporting success,
  caught by `tsc --noEmit` and undone by diff review. Also re-confirmed: `npm ci --ignore-scripts`,
  `npm test` (416/103), `tsc --noEmit`, `format:check`, `next build` and `npm audit --omit=dev` all green
  locally, and `next build` flipped `next-env.d.ts` again (reverted with `git checkout --`).
- **2026-09-25 (v0.12.1, session `arena/01a0d879-simple-finance`):** entry 8 re-proved a third time in a fresh
  sandbox (Debian 12): `@sparticuz/chromium` from the registry, `al2023.tar.br` inflated by hand,
  `LD_LIBRARY_PATH=/tmp/al2023/lib`, the throwaway `playwright.local.config.ts` overlay — the full suite,
  58 tests across every project, green in ~2.5 minutes. `npm ci --ignore-scripts`, `npm test` (404/101),
  `tsc --noEmit`, `format:check` and `next build` all green locally. Two small additions to the watch-list:
  a throwaway spec that seeds supplier rows directly with `better-sqlite3` (no domain write needed) is a quick
  way to force a long `/suppliers` list and check that a deep link really scrolls the named card to the top;
  and `next build` flipped `next-env.d.ts` again — reverted with `git checkout -- next-env.d.ts` as entry 8's
  history already advises.
- **2026-10-09 (v0.38.0 release, session `arena/9d0d4627-simple-finance`):** PDF.js adopted for in-page PDF reading after the household's approval (decision 192), and annual road tax confirmed as built (decision 193). Entry 16 rewritten: pdf.js draws onto a canvas, which this Chromium can read. The full local run (`npx playwright test --config playwright.local.config.ts`, 119 tests) gave **119 passed**, with no flaky failures this time. `npm test` 723/723, typecheck, format, themes, build and `npm audit --omit=dev` (0) pass. The production build emits `pdf.worker.min.*.mjs`, and `next start` serves it as `application/javascript`.

## 23. The local Playwright web server dies at the `projects`/`admin` DB-heavy specs (2026-10-16)

**Symptom:** a full `playwright.local.config.ts` run loses `next dev` (the e2e server on 3100)
part-way through — every test from `projects`/`admin` onward gets `ERR_CONNECTION_REFUSED`, and
Playwright reports the tail as **"N interrupted"** (a bare `tail` of the summary looks like
"132 passed" — read the whole summary block before claiming a green run). Re-running just those
projects reproduces it: `admin.spec.ts`'s "registry backup, then a roster change, then restore"
is the usual death point. There is no crash marker in the server log — it simply stops answering.

**Not your change.** The same code runs green in CI (ubuntu runner, `retries: 1`), including the
admin/backup/insights/recurring specs. The sandbox's dev server does not survive the registry
restore's burst of DB writes (watcher/inotify or memory pressure is the working guess). Verify the
vulnerable projects against CI rather than burning a session on it: push and read the browser job.

**Workaround that does work locally:** run the suite in two halves (everything before `projects`,
then the late block) against a fresh server each time, or accept CI as the proof for the late
block. And when a run's tail looks too green, count the results — `PLAYWRIGHT_JSON_OUTPUT_NAME=…
--reporter=json` gives exact per-test statuses (one worker, no retries locally).

## 24. Scroll assertions need `scrollIntoViewIfNeeded()` first, and a dirty e2e database is fixed by restarting the server (2026-10-16)

**Symptom 1 — a scroll-position assertion fails by a page height.** `locator.click()` scrolls its
target into view before clicking, so measuring `window.scrollY` *after* the click measures where the
browser put the target, not where the reader was. A test that says "the reader stayed in place"
must call `await toggle.scrollIntoViewIfNeeded()` **first**, then read `scrollY`, then click, then
read `scrollY` again. Playwright's own auto-scroll is the difference between "kept the scroll
position" (206 → 206) and "jumped 2,463px".

**Symptom 2 — an unrelated assertion fails because of leftover data.** The e2e server
(`scripts/e2e-server.mts`) **re-seeds its data directory on every start** (`rmSync(DATA_DIR)` then
`seed()`), so a spec that adds a vehicle named "Playwright Estate" fails the *next* run with
"already exists", and repeated runs quietly move a pot's balance across an alert threshold
("Alex's cash only has £…"). Neither is a code bug: **restart the server to re-seed** rather than
editing the spec or the expectation. A one-line `node -e` with `better-sqlite3` against
`.e2e-data/households/<id>/simple-finance.sqlite` is the quickest way to see what the run left
behind.

**Symptom 3 — a spec that spends money today can break a spec that runs last.** A pot's estimate
counts a **same-day debit** even when the money comes straight back (the same-day *credit* is
absorbed by the pot's checkpoint — `recordIsAfterCheckpoint`, SPEC §7.1), so a journey that lends
£60 out of Main account and repays £60 today leaves Main account's estimate £60 lower for the rest
of the run. The **payday** project runs last and reads those balances: its fixture adjusts the
Scenario Energy direct debit so the household low lands on −£96.35, which ties the bills to the
household's total, and the card then names the pot with the *worst* bills-only shortfall. £60 of
extra spending in Main account flips that from Natwest to Main account and the payday spec fails
with *"Main account has the worst bills-only shortfall: £68.77. It is already £68.77 overdrawn,
with no bills left in this window."* A journey that moves money should therefore leave the shared
seed's balances as it found them: record the legs **dated before today** (they are then absorbed
by the payday fixture's checkpoint) and return the money to the pot it left. The same rule
protects the fixture from any spec that spends from a liquid pot.

**The local Playwright config's import shape.** `import { defineConfig } from '@playwright/test/index.js'`
throws *"does not provide an export named 'defineConfig'"* here; use a default import and
destructure (`import playwright from '@playwright/test/index.js'; const { defineConfig } =
playwright;`). The override config lives **outside** the repo (`/home/user/pw.local.config.mts`),
points `executablePath` at the `@sparticuz/chromium` binary (entry 8) and sets `baseURL` to the
e2e server on port 3100.

## 25. A spec that edits a saved document should reset it to a fresh draft first (2026-10-17)

The long-term forecast's `/longterm` page **persists** what the household edits, unlike every other
seeded page: once a run saves `otherAnnualPence = 6000`, the next run's "the £0 line is flagged"
assertion fails against a plan that no longer has a £0 line — and a Playwright retry starts from
that same dirty plan, so the second attempt fails for a reason that looks like a code bug. The
`longterm` spec therefore opens with a `Reset to a draft from records` (accepting the confirm
dialog) and asserts the reset succeeded before asserting anything else. Any future spec that saves
state which another assertion reads should do the same.

Two smaller lessons from the same slice:

- **A `<details>` that opens by default only while a warning exists collapses under the reader when
  the save clears the warning.** Keep the open state in the client component (`useState` +
  `onToggle`) so the form and its success message stay where the household left them; the server
  passes only the *initial* position.
- **A summary's text is not always a heading.** `getByRole('heading', { name: /Does the money last\?/ })`
  finds nothing where the page uses a small `<p>` label above an `<h2>` — match the visible text
  instead, and give the card an `aria-label` when a spec needs a stable region name.

## 21. `npm ci --ignore-scripts` leaves `better-sqlite3` without its binding — rebuild it against `/usr/local` (2026-10-17)

- **Symptom:** you ran `npm ci --ignore-scripts` (entry 1) to get past the blocked header download, and then
  `npm run build` or the tests that open a SQLite database fail with a missing native binding for `better-sqlite3`.
  Pure-engine tests (`node --import tsx --test tests/longterm-model.test.ts`) still run, which is why this is easy to miss.
- **Fix that worked here:** the Node headers are already in `/usr/local` (entry 18), so rebuild only the native module:
  `npm_config_nodedir=/usr/local npm rebuild better-sqlite3`. It finished in about a second, and `npm run build` then
  passed (`next build` rewrites `next-env.d.ts` — run `git checkout -- next-env.d.ts` before committing).
- **Not run this session:** the Playwright suite. The household asked that the browser CI check be left for the next
  session; entry 8 still describes how to run it locally.

## 26. Shell/process handshakes stopped responding during a full browser run (2026-10-22)

After the targeted Admin/Cloudflare browser checks passed, a full 183-case seeded run progressed to
144 passing cases with no recorded failures. Shell calls (including simple process/log inspection)
then timed out without output; process wait/stop tools reported `Request handshake timed out after
60000ms`. File read/edit tools still worked. This is an infrastructure interruption, not evidence
that the tests passed or failed. The cause is unverified; do not label it OOM without evidence.

No recovery was verified in that session. Do not launch duplicate full runs or assume the old
runner/server stopped after a timed-out stop request. Once shell access returns, inspect and stop
any surviving test/server processes before reseeding or building. Recheck PR #103 CI run
39747614102 and run any remaining checks. The local log was `/home/user/browser-checks.log`;
process IDs were `browser-acceptance-checks-df002ce8` (runner) and
`finance-test-preview-548bb612` (seeded dev server). Keep final handoff/validation notes in the
same PR before merge.

**Recovery observed in the owner’s follow-up (2026-10-22):** shell access returned and process
inspection showed no surviving browser/server processes. PR CI revealed one deterministic stale
phone-drawer count assertion (the bootstrap-admin seed adds the Admin link), not a provider/mutation
failure. Correct that test and rerun required gates; the owner then authorised publication conditional
on successful checks. The exact cause of the earlier infrastructure interruption remains unknown.


## 27. Wiki screenshot pipeline — Playwright against the seeded dev server (2026-10-23)

The GitHub wiki (`…wiki.git`, branch `master`) is a normal cloneable repo; its `images/` folder
holds screenshots embedded with standard Markdown. The repo is **public**, so only the fictional
e2e household may ever appear. Proven recipe for capturing pages:

- Install and browser exactly as entries 1/8/18: `npm_config_nodedir=/usr/local npm ci` (the
  prebuilt `better-sqlite3` loads fine), and the sideloaded `@sparticuz/chromium` at `/tmp/chromium`
  with `LD_LIBRARY_PATH=/tmp/al2023/lib`.
- Start the fictional seed server (re-seeds `.e2e-data` on every start, dev identity bypass,
  port 3100): `node --import tsx scripts/e2e-server.mts`, wait on `GET /api/health`.
- **`waitUntil: 'networkidle'` never settles** — the presence heartbeat (`POST /api/presence`) and
  bell polling (`GET /api/attention`) run forever. Use `waitUntil: 'load'` plus
  `page.waitForSelector('main')` and a short settle delay.
- Remove the Next.js dev-tools button before shooting:
  `page.evaluate(() => document.querySelectorAll('nextjs-portal').forEach((el) => el.remove()))`.
- Full-page screenshots are impractically tall (the Guide is ~3,200 px at 1,400 px wide); prefer
  fixed-viewport (1400×950) shots of the section a wiki page actually discusses.
- The throwaway capture script and PNG staging live outside the repo in
  `/home/user/wiki-screenshots/`; the wiki itself is cloned as a sibling at
  `/home/user/simple-finance-wiki/` (never nested inside the main repo).

## 28. Capturing seeded-data screenshots that the seed does not contain (2026-10-23)

The e2e seed has no measured mpg stretch, so the wiki Fuel page needed one. A
throwaway capture script (`/home/user/wiki-screenshots/capture-fuel.mts`, never
committed) drives the seeded server through the real UI: add a vehicle via the
Settings "Add vehicle" form, then three Fuel-tab saves — full tank with
odometer, part fill (tick off), closing full tank with the higher odometer —
which reproduces the e2e worked example (40.9 mpg, 15.6p/mile). The
`@playwright/test` library Locator has no `toHaveValue` outside the test runner:
poll `inputValue()` until the save-cleared form empties instead. The e2e server
reseeds `.e2e-data` on every start (entry 24), so restart it before re-running a
script that writes, and use `hideNav` (entry 27) for tall Insights sections.

## 29. After a snapshot restore: node_modules, /tmp tooling and sibling clones all vanish (2026-10-23)

A mid-session restore removed `node_modules`, the sideloaded `/tmp/chromium` +
`/tmp/al2023` (entry 8), AND every sibling directory under `/home/user`
including a cloned GitHub wiki and scratch backlogs. Recovery that worked, in
order: `npm_config_nodedir=/usr/local npm ci` (entry 18), rebuild the browser
exactly as entry 8, re-clone the wiki (anything pushed was safe; local-only
files were not), then restart `scripts/e2e-server.mts` which reseeds
`.e2e-data`. Lesson: push wiki work at the end of every turn and keep durable
notes inside the repo, not only in scratch folders. One more Playwright quirk
from the same session: on the first compile of a server-action form, a
`fill()` into a React controlled input can be lost to a hydration race —
assert `inputValue()` before clicking Save, re-filling if it did not stick.
Also, Gollum wiki page URLs come from the filename: keep commas out of
filenames (a `%2C` wikilink 302-redirects to the wiki root) and use a piped
link `[[Display title, with comma|Exact-File-Name]]` when the title needs one.

## 30. Third snapshot reset — recovery is now a proven routine, plus history-list capture notes (2026-10-24)

A third full restore wiped `node_modules`, `/tmp/chromium` + `/tmp/al2023`, the wiki clone and
`/home/user/wiki-screenshots`. The entry-29 sequence worked end to end again, with one addition:
the working tree can come back holding **stale, pre-push dirty copies** of tracked files (this time
`docs/SANDBOX.md` and `next-env.d.ts`) while the real latest work is already on
`origin/arena/7422d1ea-simple-finance-multi-household`. After fetching, discard them with
`git checkout -- next-env.d.ts && git reset --hard origin/<branch>` before rebuilding, rather than
wondering whether the dirty diff is work to keep.

Useful selectors discovered while capturing the part-2 history pages:

- the filter islands expose hydration guards `form[data-filters-ready="true"]` (Purchases and
  All Transactions), matching the category editor's `data-category-ready` and the activity row's
  `data-purchase-ready`; wait on these before driving any filter/editor control;
- All Transactions' table is `#activity-table`; its in-place purchase panel renders both
  `heading "Correct it"` and `heading "Void it"`, and after voiding the row shows the literal
  `voided — not counted`; the void form posts fields `recordId` / `expectedVersion` / `reason`
  (min length 4);
- the running-balance column shows `—` when no older checkpoint anchors the row — in the fresh seed
  the newest row *is* the checkpoint, so every movement in the 30-day window renders `—`;
- the Purchases result heading text is the assertion point for the as-you-type search
  (`matching “Greenfield”`), and the `Also filtering` chip has aria-label
  `Remove the <kind> filter: <value>`;
- the e2e seed contains no refunds or voids, so capture them by mutating the live seed in-UI;
  `scripts/e2e-server.mts` reseeds `.e2e-data` automatically on the next server start.

## 31. Capturing the Charts page — duplicated figures and whole-card screenshots (2026-10-24)

Every chart card (`#forecast`, `#groceries`, `#personal`, `#commitments`, `#mix`, `#months`,
`#pace`) renders the drawing twice: a 320px phone figure and a 720px laptop figure, one hidden
by CSS, and each carries its own `Show the numbers` table twin and its own set of `svg a[href]`
bar links. A naive Playwright locator therefore fails with a strict-mode violation on two
elements. In a 1400px viewport the laptop figure is the **later** DOM node, so scope with
`.last()` — e.g. `card.locator('svg a[href]').last().click()` — rather than opening the table
twin at all: tapping a bar link directly opens the in-place `Line items: …` drill panel
(`?show=` / `?slice=` URL state), which is the more useful screenshot.

Viewport screenshots of the two-column chart grid always frame a neighbour card; screenshot the
card element itself (`page.locator('#mix').screenshot()`) after `scrollIntoViewIfNeeded()`. The
preset manager on Settings (`#commitment-categories`) has its own hydration guard
`[data-presets-ready="true"]`; creating a preset then mutates the seed (the e2e server reseeds
`.e2e-data` on restart, so treat it like the other in-UI capture mutations).

## 32. An e2e server can survive a snapshot as an orphan holding port 3100 (2026-10-24)

After a restore, a plain `curl /api/health` may still answer even though every tracked process
handle is gone: the previous turn's `node --import tsx scripts/e2e-server.mts` can keep running
as an orphan (its `.e2e-data` therefore also survives, mutated seed and all). A fresh
`start_process` then fails with `EADDRINUSE 0.0.0.0:3100` and nothing new is started. Recovery:
`ps aux | grep e2e-server` to find the pid, `kill <pid>`, confirm with `ss -ltn | grep 3100`,
then start the server normally — booting it reseeds `.e2e-data`, which is also how capture-time
mutations (voided purchases, saved presets, added categories) are discarded. Do not assume a
"server DOWN" health check means the port is free; the check and the listener are different
things when the process is untracked.

Insights capture selectors (part-2 work): the panels are
`section[aria-labelledby="panel-month-heading" | panel-persons-heading | panel-vehicles-heading
| panel-mpg-heading | panel-honesty-heading"]`; drill links are full GET navigations carrying
`?show=…` and render `#month-drill` / `#person-drill` / `#vehicle-drill`, so re-running the
standard settle (wait `main`, remove nextjs-portal, hide header) after the click is required.
Whole-panel element screenshots work cleanly; no data mutation is involved, only URL state.
