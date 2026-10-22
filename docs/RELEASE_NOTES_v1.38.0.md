# Release notes — v1.38.0 — Explicit Cloudflare access grant and removal

Stable release for issue #101 stages two and three. Moves `latest`; version badge **1.38.0**.
Stage one's read-only panel was released and owner-tested in v1.37.0.

## Changes

- **Grant Cloudflare access** explicitly adds one direct policy email for a current registry
  assignment. Already present is a no-op. Assignment saves never automatically grant access.
- **Remove from Cloudflare** separately confirms removal, including cleanup of policy-only emails.
  The configured administrator's own email is protected. Already absent is a no-op. Registry
  unassignment and household deactivation stay separate and never automatically remove access.
- Every mutation authorises the actual bootstrap administrator server-side, checks application
  audience/policy binding, and accepts only supported reusable Allow policies used by one application.
  Supported unrelated rules/settings are preserved; shared, legacy or unknown structures fail closed.
- Filesystem exclusion, prewrite reread/drift refusal and post-write verification reduce risk.
  **Cloudflare has no documented atomic conditional-update facility:** confirm nobody is editing the
  policy or its application associations externally during an operation. This is not an atomic patch.
- Audited actor/operation/target/outcome, sanitised errors and refreshed inspection. Failed or
  unverifiable writes leave the registry intact and report pending/unknown, never onboarding complete.
  No automatic write retries, rollback or background synchronisation.
- Browser harness now exercises the strict admin gate with fictional provider data; the phone-drawer
  test verifies all 19 admin-seed destinations instead of the outdated 18-link non-admin count.

## Install and secure configuration

Back up household data, registry and the trusted environment file before updating. Install
`ghcr.io/dougalbob/simple-finance-multi-household:v1.38.0` (or `:latest` after successful publication).
Keep bridge networking, host **3009** → container **3000**, appdata
`/mnt/user/appdata/simple-finance-multi-household` → `/data`. Never use the original single-household
image/appdata or port 3007. Publication does not automatically upgrade your container.

Keep the four stage-one connection settings. Read-only tokens still inspect, but writes need
**Account / Access: Apps and Policies / Edit**, restricted to the intended account (API permission
name: Write). Configure the token only via trusted `/data/.env` or container environment, then
restart. Never paste credentials into chat or the web editor. The token has account-level powers;
the app's configured IDs/binding checks do not narrow the token itself.

Check that the live policy is reusable, used by this application alone, and uses a supported schema.
Legacy/shared/unknown structures are refused; the app does not convert policies automatically.
See [setup, supported fields, limitations and recovery](CLOUDFLARE_INSPECTION.md).

Removal affects only direct Include entries in this policy. It **does not revoke existing sessions**
or guarantee denial through other policies/conditions. Urgent session revocation remains a separate
Cloudflare operation. JWT verification, optional AUTH_ALLOWED_EMAILS fallback, registry assignment
and active-household requirements are unchanged.

No schema, migration, household-data or backup-format changes. A safety lock lives at
`/data/system/cloudflare-policy.lock` during operations; do not auto-delete an orphan lock. Review
provider state and pending audit first, following the documented recovery procedure.

## Validation

- Local implementation unit tests **1194/1194**, 273 suites; format, types, themes and production
  dependency audit passed (zero production vulnerabilities).
- Targeted local Bell/Admin/Cloudflare browser tests **11/11** and production build passed; the
  deterministic phone-drawer mismatch was corrected. Tests use fictional configuration and intercept all Cloudflare requests.
- Release requires all corrected PR gates (full seeded/fresh Playwright, format/types/unit/build/audit,
  Docker startup/upgrade smoke) and merged-main CI before tagging. Publish repeats container smoke
  and verifies `v1.38.0`, `latest` and `sha-<merge-short>` resolve to one digest before release creation.
- Real Cloudflare writes/live policy compatibility are not claimed by mocked tests; test deliberately
  in the owner's multi-household installation after secure configuration.
