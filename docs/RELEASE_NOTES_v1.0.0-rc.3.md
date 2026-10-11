# Release notes — v1.0.0-rc.3 — First multi-household candidate

**Type:** release candidate. This is a GitHub pre-release. It does **not** move `latest`, and it is not the stable `v1.0.0`.
**Install this exact image:** `ghcr.io/dougalbob/simple-finance-multi-household:v1.0.0-rc.3`. The Unraid template in this repository already pins it.
**Version badge:** `v1.0.0-rc.3 (pre-release)`.

**Why rc.3:** `v1.0.0-rc.1` (commit `ef02e95`) failed its Publish run at the container smoke test, and `v1.0.0-rc.2` failed at the upgrade smoke test, which tried to use the unpublished `rc.1` tag as an upgrade base. Neither run pushed anything to GHCR, so no `rc.1` or `rc.2` image exists. This candidate has the same application code, plus the publish workflow fix that skips version tags without a published image. Use `v1.0.0-rc.3` everywhere in the install steps below.

**Publication facts (verified by Publish run `38088956509`, 2026-10-10):** built from source commit
`a9e32f1fd6a550cfd1841948dd010f5c49f1b30a`; pushed as `ghcr.io/dougalbob/simple-finance-multi-household:v1.0.0-rc.3`
and `:sha-a9e32f1`; digest `sha256:ded0257383b5c64a8a980a41b17f3d86b775a48a1ea5ebb76170d44867f7c238`, shared by
both tags; `latest` untouched; GitHub release marked pre-release. Recorded here as well as in the release body
because the sandbox cannot reach `ghcr.io` to re-check it (`docs/SANDBOX.md` entry 6).

**Superseded.** This candidate was accepted and promoted to the stable release **`v1.0.0`** with no
application-code change. See [`RELEASE_NOTES_v1.0.0.md`](RELEASE_NOTES_v1.0.0.md).

> **Note on `main`:** `rc.3` was committed and tagged on the session branch
> `arena/f011a008-simple-finance-multi-household` and never merged through a pull request, so `main` kept
> describing `v1.0.0-rc.1` until the `v1.0.0` release pull request brought these commits across. The published
> image was always correct — the Publish workflow builds from the tag — but the repository was not.

## What this release is

This is the first build of the multi-household edition, a separate product from the original single-household `simple-finance` app.

- One container serves several households. Each household has its own finance database and its own documents folder. A household has one or two people.
- Sign-in is through Cloudflare Access. The app checks each token itself (signature, issuer, audience, expiry and allowlist). Signing in to Cloudflare is not enough: the administrator must have assigned that sign-in email to a household in the app first. There is no self-sign-up.
- The platform administrator pre-assigns sign-ins to households on `/admin`. An assigned sign-in can be linked to a person in that household, and only to a sign-in assigned to that household.
- Support access: a household member can grant a platform administrator read-only access for 1, 4 or 24 hours. Only one grant is active per household, a grant can be revoked at once, and grants and their use are recorded in the audit log.
- Backup and restore are per household. A backup is an encrypted archive of one household's database and attachments only. A restore replaces only the caller's own household and refuses, before any change, an archive from another household, an older-format archive, a wrong passphrase or a tampered archive.

## Changes in this release, compared with the inherited 0.39.0 source

- Finance pages, actions, attachments and selected APIs use a verified household context and that household's own database.
- Settings no longer offers the original app's global backup and restore. It shows the household's own controls instead.
- Release tooling: the Unraid template is named `simple-finance-multi-household.xml`, so it can sit beside the original `simple-finance.xml`. The publish workflow only publishes to this package and this repository.

## Schema and data caveats

- Finance migrations `0000` to `0016` are the same as the inherited source.
- The new system registry (`system/registry.sqlite`) has migrations `0001` (household roster) and `0002` (support grants).
- Layout under `/data`: `system/registry.sqlite`, plus `households/<id>/simple-finance.sqlite` and `households/<id>/documents/` for each household.
- **This release does not import any existing household data.** A fresh install starts empty. The original app's data is untouched.
- Backups made by the original app are older-format archives. This release's restore refuses them, so they cannot be restored here.

## Who is affected and what to do

- **The original household:** nothing changes for the original app, which stays on port `3007` with its own appdata folder and route. Do not point this release at `/mnt/user/appdata/simple-finance`.
- **Anyone installing this release candidate:** follow the install steps below. Use it for acceptance testing, not as a replacement for the original app.

## Install on Unraid

1. Copy `simple-finance-multi-household.xml` from this repository into your Unraid Docker templates folder. Keep the original `simple-finance.xml` as it is.
2. Create the folder `/mnt/user/appdata/simple-finance-multi-household`.
3. In that folder, create a file named `.env` with these lines, using your own values:

   ```text
   AUTH_ISSUER=https://<your-team>.cloudflareaccess.com
   AUTH_AUDIENCE=<AUD tag of the NEW Cloudflare Access application>
   AUTH_ALLOWED_EMAILS=<comma-separated sign-in emails allowed through Cloudflare, including the admin's>
   REGISTRY_ADMIN_EMAIL=<the platform administrator's sign-in email>
   REGISTRY_ADMIN_HOUSEHOLD_NAME=<the administrator's household name>
   ```

   `REGISTRY_ADMIN_EMAIL` must also appear in `AUTH_ALLOWED_EMAILS`. The first time the app opens its registry, it creates that administrator's household. This happens only once, while the registry is empty.
4. In Cloudflare, create a **new** Access application for a **new** hostname. Point its route at host port `3009`. Do not change the original route on port `3007`.
5. Add the container from the template. Check that the host port is `3009`, the appdata path is `/mnt/user/appdata/simple-finance-multi-household`, and the repository is `ghcr.io/dougalbob/simple-finance-multi-household:v1.0.0-rc.3`.
6. Open the new hostname and sign in as `REGISTRY_ADMIN_EMAIL`. Then, on `/admin`, pre-assign the other sign-in emails to their households before those people first visit.

Keep the `.env` file secret and out of backups. It is not part of a household backup.

## Validation evidence

- `npm run typecheck`, `npm run format:check`, `npm test` (825 tests, 0 failing) and `npm run build` pass.
- `npm audit --omit=dev` reports 0 vulnerabilities.
- Import rehearsal on fictional data: `npm run rehearse:import` passes 17 of 17 checks. It imports a copy into an isolated data root, runs the production startup migrations, checks counts, integrity, attachment hashes and sign-in links, and round-trips the household backup and restore.
- Acceptance on fictional data: `npm run acceptance` passes 31 of 31 checks against the production build. The checks cover sign-in denial (unassigned, deactivated, forged, wrong audience or issuer, expired, not allowlisted), household isolation, attachment isolation, 40 interleaved requests from two households, and backup and restore over HTTP.

## Known limitations and what was not verified

- Real Cloudflare Access was **not** tested. The acceptance run used a local stand-in that signs tokens the same way.
- The Docker image was not built in the development sandbox. The CI `docker` job and the Publish workflow build and smoke-test it.
- The Unraid template was not installed on a real Unraid server.
- No real household data was imported or rehearsed. Importing the existing household is a separate, approved step.
- The support-access grant flow has unit tests but no browser test yet.
- The `secure` cookie flag applies only in production builds.
- Restore reads the whole archive into memory, up to the 512 MiB limit.

## Not in this release

- Import of the existing household's data.
- The stable `v1.0.0` release, which follows only after this candidate is accepted.
