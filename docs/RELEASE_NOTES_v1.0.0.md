# Release notes — v1.0.0 — First stable multi-household release

**Type:** stable production release. This moves `latest` and is GitHub's Latest release.
**Install this image:** `ghcr.io/dougalbob/simple-finance-multi-household:latest`. The Unraid template in this repository now defaults to `latest`.
**Version badge:** `v1.0.0 (stable)`.

## What this release is

`v1.0.0` is the accepted release candidate `v1.0.0-rc.3` promoted to stable. The application code is
the same code as the `v1.0.0-rc.3` image; nothing in the app changed between them. What this release
adds is the release metadata (version `1.0.0`, badge `stable`, template on `latest`), the documentation
corrections described below, and one CI fix.

This is the first build of the multi-household edition, a separate product from the original
single-household `simple-finance` app.

- One container serves several households. Each household has its own finance database and its own
  documents folder. A household has one or two people.
- Sign-in is through Cloudflare Access. The app checks each token itself (signature, issuer, audience,
  expiry and allowlist). Signing in to Cloudflare is not enough: the administrator must have assigned
  that sign-in email to a household in the app first. There is no self-sign-up.
- The platform administrator pre-assigns sign-ins to households on `/admin`. An assigned sign-in can be
  linked to a person in that household, and only to a sign-in assigned to that household.
- Support access: a household member can grant a platform administrator read-only access for 1, 4 or 24
  hours. Only one grant is active per household, a grant can be revoked at once, and grants and their
  use are recorded in the audit log.
- Backup and restore are per household. A backup is an encrypted archive of one household's database and
  attachments only. A restore replaces only the caller's own household and refuses, before any change, an
  archive from another household, an older-format archive, a wrong passphrase or a tampered archive.

## Acceptance

The owner accepted `v1.0.0-rc.3` on a real Unraid installation before this release was cut:

- the container ran on host port `3009` with appdata at `/mnt/user/appdata/simple-finance-multi-household`;
- sign-in worked through the **real** Cloudflare Access route, not the local stand-in;
- the household was created and its sign-ins assigned on `/admin`;
- the app was used with real household data.

That closes the two limitations the candidate carried as unverified: real Cloudflare Access, and a real
Unraid template install.

## Changes in this release, compared with the inherited 0.39.0 source

- Finance pages, actions, attachments and selected APIs use a verified household context and that
  household's own database.
- Settings no longer offers the original app's global backup and restore. It shows the household's own
  controls instead.
- Release tooling: the Unraid template is named `simple-finance-multi-household.xml`, so it can sit
  beside the original `simple-finance.xml`. The publish workflow only publishes to this package and this
  repository.

## Changes since v1.0.0-rc.3

- **Version metadata to stable.** `1.0.0` in `package.json`, `package-lock.json` (root and
  `packages[""]`) and `src/lib/version.ts`; `APP_RELEASE_STAGE` is `stable`, so the header and home-page
  badges read `v1.0.0 · stable`. The Unraid template's `Repository` is now `:latest`.
- **CI upgrade smoke picks a published base.** `.github/workflows/ci.yml` previously took the newest v1+
  tag other than the version under test, whether or not that tag had an image in GHCR. With `rc.1` and
  `rc.2` present as tags and absent from the registry, that selected `v1.0.0-rc.2` and the job would fail
  on `docker pull` rather than testing an upgrade. It now checks each candidate against the registry and
  takes the newest one that actually has an image — the same rule the Publish workflow already used. For
  this release the base is `v1.0.0-rc.3`, so the `rc.3 → v1.0.0` upgrade path is genuinely exercised.
- **Documentation corrected.** `docs/HANDOFF.md` now records the actual `rc.1 → rc.2 → rc.3` publication
  chronology and the fact that the `rc.2`/`rc.3` commits had not reached `main`; `README.md`,
  `AGENTS.md`, `docs/MULTI_HOUSEHOLD_PLAN.md` and `docs/RELEASE_PROCESS.md` no longer describe
  support consent, the identity-to-`people` link and per-household backup/restore as unimplemented, or
  name `v1.0.0-rc.1` as the current build.

No schema, migration, backup-format or dependency change.

## Schema and data caveats

- Finance migrations `0000` to `0016` are the same as the inherited source.
- The new system registry (`system/registry.sqlite`) has migrations `0001` (household roster) and `0002`
  (support grants).
- Layout under `/data`: `system/registry.sqlite`, plus `households/<id>/simple-finance.sqlite` and
  `households/<id>/documents/` for each household.
- **This release does not import any existing household data.** A fresh install starts empty. The
  original app's data is untouched.
- Backups made by the original app are older-format archives. This release's restore refuses them, so
  they cannot be restored here.

## Who is affected and what to do

- **The original household:** nothing changes for the original app, which stays on port `3007` with its
  own appdata folder and route. Do not point this release at `/mnt/user/appdata/simple-finance`.
- **Anyone already running `v1.0.0-rc.3`:** you are on the same application code. Changing the pinned
  tag from `v1.0.0-rc.3` to `latest` and updating the container moves you to this release; your data is
  untouched and no migration is pending.
- **New installs:** follow the steps below.

## Install on Unraid

1. Copy `simple-finance-multi-household.xml` from this repository into your Unraid Docker templates
   folder. Keep the original `simple-finance.xml` as it is.
2. Create the folder `/mnt/user/appdata/simple-finance-multi-household`.
3. In that folder, create a file named `.env` with these lines, using your own values:

   ```text
   AUTH_ISSUER=https://<your-team>.cloudflareaccess.com
   AUTH_AUDIENCE=<AUD tag of the NEW Cloudflare Access application>
   AUTH_ALLOWED_EMAILS=<comma-separated sign-in emails allowed through Cloudflare, including the admin's>
   REGISTRY_ADMIN_EMAIL=<the platform administrator's sign-in email>
   REGISTRY_ADMIN_HOUSEHOLD_NAME=<the administrator's household name>
   ```

   `REGISTRY_ADMIN_EMAIL` must also appear in `AUTH_ALLOWED_EMAILS`. The first time the app opens its
   registry, it creates that administrator's household. This happens only once, while the registry is
   empty.
4. In Cloudflare, create a **new** Access application for a **new** hostname. Point its route at host
   port `3009`. Do not change the original route on port `3007`.
5. Add the container from the template. Check that the host port is `3009`, the appdata path is
   `/mnt/user/appdata/simple-finance-multi-household`, and the repository is
   `ghcr.io/dougalbob/simple-finance-multi-household:latest`.
6. Open the new hostname and sign in as `REGISTRY_ADMIN_EMAIL`. Then, on `/admin`, pre-assign the other
   sign-in emails to their households before those people first visit.

Keep the `.env` file secret and out of backups. It is not part of a household backup.

## Validation evidence

- `npm run typecheck`, `npm run format:check`, `npm test` and `npm run build` pass.
- `npm audit --omit=dev` reports 0 vulnerabilities.
- Import rehearsal on fictional data: `npm run rehearse:import` passes 17 of 17 checks.
- Acceptance on fictional data: `npm run acceptance` passes 31 of 31 checks against the production build,
  covering sign-in denial (unassigned, deactivated, forged, wrong audience or issuer, expired, not
  allowlisted), household isolation, attachment isolation, 40 interleaved requests from two households,
  and backup and restore over HTTP.
- The Publish workflow smoke-tests the built image before pushing, and upgrades a `v1.0.0-rc.3` volume to
  this image, requiring every migration exactly once.

## Known limitations

- No real household data was imported by this release. Importing the existing household is a separate,
  approved step.
- The support-access grant flow has unit tests but no browser test yet.
- The `secure` cookie flag applies only in production builds.
- Restore reads the whole archive into memory, up to the 512 MiB limit.
- The system registry has no in-app backup. Back up `/data/.env` and `system/registry.sqlite` as part of
  the host's own backup routine.

## Not in this release

- Import of the existing household's data.
