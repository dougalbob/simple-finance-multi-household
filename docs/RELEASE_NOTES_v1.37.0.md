# Release notes — v1.37.0 — Read-only Cloudflare inspection

Stable release for issue #101, stage one. Moves `latest`; version badge: **1.37.0**.

## Changes

- Bootstrap administrator-only Cloudflare inspection on Admin.
- Compares assigned registry emails and direct policy email entries, including
  Cloudflare-only emails without a registry assignment.
- Verifies application AUD and policy association. Flags complex conditions and
  distinguishes a failed check from a missing email.
- Fixed-host, uncached GET requests only; credentials remain server-side and
  provider error bodies are not exposed. No grant/revoke operations yet.

## Install and configure

Back up household data, registry and the trusted environment file before updating.
Use `ghcr.io/dougalbob/simple-finance-multi-household:v1.37.0` or `:latest`.
Keep host port **3009**, bridge container port **3000**, and appdata
`/mnt/user/appdata/simple-finance-multi-household` mounted at `/data`.
Never use the original single-household appdata or port 3007.

Add `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_APPLICATION_ID`, `CLOUDFLARE_POLICY_ID`
and `CLOUDFLARE_API_TOKEN` to the trusted `/data/.env` or container environment.
Use an account-scoped **Access: Apps and Policies / Read** token. Restart and open
Admin as `REGISTRY_ADMIN_EMAIL`. See [detailed setup](CLOUDFLARE_INSPECTION.md).
Without configuration, the panel explains setup and existing onboarding still works.

No schema, migration, finance-data, backup-format or authentication changes.
Inspection is not an effective-access guarantee; other policies, conditions and
household activity can still affect sign-in. Live Cloudflare verification requires
the owner's configuration and is not claimed by mocked tests.

## Validation

Six targeted API tests and TypeScript checks passed locally. Required CI gates
(format, types, full unit suite, production build, audit), browser acceptance and
Docker upgrade/startup smoke must pass before merge; publication repeats container
smoke checks and verifies the stable tags resolve to the same image digest.
