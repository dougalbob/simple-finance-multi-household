# Release notes — v1.0.2 — Fix the /admin registry restore redirect and harden restore

**Type:** stable patch release. This moves `latest` and is GitHub's Latest release.
**Install this image:** `ghcr.io/dougalbob/simple-finance-multi-household:latest`.
**Version badge:** `v1.0.2 (stable)`.

## What changed since v1.0.1

- **Fixed: RESTORE on `/admin` sent the browser to "This site can't be reached" (live-tested on the
  v1.0.1 Unraid install).** `POST /admin/restore` built its redirect from `request.url`. Under
  `next start -H 0.0.0.0 -p 3000` behind the Cloudflare tunnel, `request.url` is built from the bind
  address — the `Host` header is never consulted — so the route emitted
  `Location: https://0.0.0.0:3000/admin`. The redirect is now the relative path `/admin` with status
  **303**: relative, so it always uses the origin the browser already trusts, and 303, so the browser
  GETs the admin page instead of re-POSTing the uploaded file (the old 307 default).
- **Hardened: the restore validates the upload before touching the live registry, and the swap is
  atomic.** `POST /admin/restore` (via the new `src/lib/registry/restore.ts`) now:
  - refuses uploads over a 64 MiB size cap (`413`);
  - refuses files without the SQLite magic header, files that fail `PRAGMA integrity_check` (checked
    on a throwaway copy, never on the live registry), and valid SQLite databases that are not a system
    registry (the `households`/`identities` roster tables must be present) — so a household database
    or any unrelated file can no longer wipe the roster;
  - takes a consistent pre-restore snapshot of the live registry with SQLite's own backup API, kept as
    `<dataDir>/system/registry.sqlite.pre-restore-<timestamp>` — the overwritten registry is no longer
    gone the moment the upload lands;
  - installs the upload by writing it to a temp file and renaming it over the live path (atomic inode
    swap): no reader can ever see a half-written registry, and the old WAL/SHM sidecars are removed
    after the swap so stale frames cannot resurrect;
  - if the swapped-in file then fails to reopen, automatically swaps the pre-restore snapshot back so
    the app keeps working, and reports the failure;
  - logs the outcome of every restore — path, byte length, sha256, household/identity row counts
    before and after, and the pre-restore copy path — so a live installation can prove from its
    container logs whether a restore landed.
- **Hardened: same-origin check.** The restore now applies the same cross-origin guard as the
  household restore (`Sec-Fetch-Site: cross-site` and mismatched `Origin` are refused), so a
  third-party page cannot submit the form with the administrator's session.
- **Tests: the routes that v1.0.1 admitted having none for.** New route tests cover the session gate
  (401 signed-out/unassigned/registry-unavailable, 403 member and cross-origin), invalid uploads
  (missing file, non-SQLite, torn SQLite, non-registry SQLite, oversize) with the live registry
  proven untouched, and the success path on an isolated `DATA_DIR` asserting the exact status **303**
  and `Location: /admin` value itself, byte-for-byte replacement, the pre-restore copy contents and
  the outcome log. A new browser test in `e2e/admin.spec.ts` runs the full round trip: download the
  registry backup, create a household, restore the backup, and verify the browser lands back on
  `/admin` with the roster exactly as the backup held it.

No schema, migration, backup-format or dependency change.

## Schema and data caveats

- Finance migrations `0000` to `0016` and registry migrations `0001`–`0002` are unchanged from
  `v1.0.1`. Upgrading runs no new migration; your data is untouched.
- Each restore leaves a `registry.sqlite.pre-restore-<timestamp>` file next to the registry in
  `<dataDir>/system/`. They are small (the registry is metadata only) and safe to keep; delete old
  ones by hand if you ever want to.
- Registry downloads remain **unencrypted**. They name every household, sign-in email and grant.
  Store them with the same care as the live appdata, and never commit one.
- `.env` is still outside every backup. Keep backing it up with the host's own routine.

## Open item carried from v1.0.1, now diagnosable

On the live v1.0.1 install a restore once appeared not to take effect even though the redirect
proved the write path ran. The redirected-to page was unreachable, so the most likely explanation is
a stale cached view rather than a failed write, but the bytes were never checked. v1.0.2 cannot
retroactively inspect that installation; what it changes is that the question is now answerable:
every restore logs its byte length, sha256 and before/after row counts to the container log, and the
overwritten registry is preserved as the pre-restore copy for a direct
`sqlite3 <copy> "SELECT id, display_name, status FROM households;"` check. If it ever happens again,
check a fresh reload of `/admin` first, then those two artifacts.

## Who is affected and what to do

- **Anyone running `v1.0.1` or `latest`:** update the container (`latest` now resolves here). The
  badge should read `v1.0.2 · stable`. If you use `/admin` restore, re-download a fresh backup after
  upgrading.
- **The original single-household app:** nothing changes. It stays on port `3007` with its own
  appdata and route. Do not point this release at `/mnt/user/appdata/simple-finance`.
- **New installs:** follow the Unraid steps in the `v1.0.0` notes; the template, port (`3009`),
  appdata path and Cloudflare setup are unchanged.

## Validation evidence

- Local gates before the PR: `format:check`, `typecheck`, `npm test` (831 passed, including the 5 new
  route tests), `next build`, `npm audit --omit=dev` (0 vulnerabilities), and the full local
  Playwright suite (124 passed) including the new registry round-trip test.
- CI `gates` (format, types, unit tests, build, audit), `browser` (Playwright) and `docker` (image
  build, entrypoint smoke, `v1.0.1` → `v1.0.2` upgrade smoke) are required green on the release PR
  and on the `main` merge commit before the tag is pushed.
- The Publish workflow smoke-tests the built image before pushing and upgrades the published
  `v1.0.1` volume to this image.

## Known limitations

- Restore is still a whole-file replace with no merge, preview or selective recovery.
- The support-access grant flow still has unit tests but no browser test.
- The `secure` cookie flag applies only in production builds.
- Household restore reads the whole archive into memory, up to the 512 MiB limit.
