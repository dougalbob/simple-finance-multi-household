# Release notes — v1.0.1 — Registry backup and restore in the admin panel

**Type:** stable patch release. This moves `latest` and is GitHub's Latest release.
**Install this image:** `ghcr.io/dougalbob/simple-finance-multi-household:latest`.
**Version badge:** `v1.0.1 (stable)`.

## What changed since v1.0.0

- **Registry backup and restore in `/admin` (PR #9, repaired by PR #10).** The admin page has a new
  "Registry Database Backup" section, visible to platform administrators only:
  - **Download Backup** (`GET /admin/backup`) saves a consistent snapshot of the system registry
    (`system/registry.sqlite`: household roster, identity assignments, administrator roles, support
    grants and audit log). The file is a plain SQLite database named
    `simple-finance-registry-v<app-version>-YYYY-MM-DD-HHmmss.sqlite`, stamped in the business
    timezone from a single instant. Keep the download somewhere safe: unlike a household backup it
    is **not** passphrase-encrypted.
  - **Restore** (`POST /admin/restore`) replaces the live registry with an uploaded `.sqlite`/`.db`
    file after a confirmation prompt. It closes the registry handle, drops the WAL/SHM sidecars,
    writes the uploaded bytes over `system/registry.sqlite` and reopens it. It is an all-or-nothing
    file replace: there is no merge, no dry run and no undo beyond the backup you downloaded first.
  - Both routes refuse signed-out, unassigned and registry-unavailable sessions with `401` and
    non-administrators with `403`.
- **`/admin` renders again (PR #10).** PR #9 put an `onClick` confirmation handler inside the async
  Server Component, which cannot carry event handlers. The section now lives in the `RegistryBackup`
  client component (`src/components/registry-backup.tsx`), the Download link uses the `text-fill-ink`
  token instead of a raw palette class, and the touched files are Prettier-formatted. This also
  repairs the `format:check` and browser-acceptance failures that PR #9 left on `main`.

No schema, migration, backup-format or dependency change.

## Schema and data caveats

- Finance migrations `0000` to `0016` and registry migrations `0001`–`0002` are unchanged from
  `v1.0.0`. Upgrading runs no new migration; your data is untouched.
- The registry download is **unencrypted**. It names every household, sign-in email and grant. Store
  it with the same care as the live appdata, and never commit it.
- Restore overwrites the single live registry file. Download a fresh backup first, and after
  restoring, reopen `/admin` and check the roster is what you expect before anyone else signs in.
- `.env` is still outside every backup. Keep backing it up with the host's own routine.

## Who is affected and what to do

- **Anyone running `v1.0.0` or `latest`:** take a household backup as usual, then update the
  container (`latest` now resolves here). The badge should read `v1.0.1 · stable`.
- **The original single-household app:** nothing changes. It stays on port `3007` with its own
  appdata and route. Do not point this release at `/mnt/user/appdata/simple-finance`.
- **New installs:** follow the Unraid steps in the `v1.0.0` notes; the template, port (`3009`),
  appdata path and Cloudflare setup are unchanged.

## Validation evidence

- CI `gates` (format, types, unit tests, build, audit), `browser` (Playwright) and `docker` (image
  build, entrypoint smoke, `v1.0.0` → `v1.0.1` upgrade smoke) are green on the release PR and on the
  `main` merge commit.
- The Publish workflow smoke-tests the built image before pushing, upgrades a published `v1.0.0`
  volume to this image, and requires every migration exactly once.
- Honest gap: the new `/admin/backup` and `/admin/restore` routes have no dedicated automated tests
  yet (no route, unit or browser coverage). They are admin-only, they ride the release checks above,
  and dedicated coverage is the follow-up recorded in `docs/HANDOFF.md`.

## Known limitations

- Restore is a whole-file replace with no merge, preview or selective recovery, and the uploaded file
  is not validated before it overwrites the live registry.
- The support-access grant flow still has unit tests but no browser test.
- The `secure` cookie flag applies only in production builds.
- Household restore reads the whole archive into memory, up to the 512 MiB limit.
