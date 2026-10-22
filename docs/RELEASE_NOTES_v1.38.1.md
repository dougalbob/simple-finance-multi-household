# Release notes — v1.38.1 — Cloudflare grants accept read-only policy metadata (`uid`)

Stable patch for issue #101. Restores the **Grant Cloudflare access** and **Remove from
Cloudflare** operations that v1.38.0 made unusable in the owner's live environment. Version badge
**1.38.1**; no feature or schema change.

## The defect

v1.38.0 refused **every** operation, before any write, with:

> Policy is not a supported single-application reusable Allow policy. Shared, legacy, unknown
> fields/rules or malformed settings require dashboard review.

The account-level reusable-policy `GET` returns a legacy, read-only top-level **`uid`** field beside
`id`. `reusablePolicySchema` is deliberately strict, so the unrecognised key failed parsing and
`snapshot()` converted that failure into the refusal above. Fail-closed behaviour worked as designed
— nothing was sent to Cloudflare and no registry assignment changed — but the feature was
unusable.

## Changes

- `reusablePolicySchema` now accepts `uid` as optional read-only metadata: a non-empty string,
  still strictly validated.
- `writablePolicy()` strips `uid` from the projection, so the `PUT` body is exactly what v1.38.0
  would have sent. The pinned Cloudflare SDK's `PolicyUpdateParams` does not list `uid` as writable,
  so sending it would be wrong regardless.
- `precedence` is accepted the same way (optional, integer or null) as defensive read-only metadata.
  It is absent in the owner's account but documented on policy responses; accepting it now avoids a
  second release cycle for another account.
- Nothing else changed: strict bootstrap-administrator gate, single-application reusable Allow
  policy only, full-preserving `PUT`, pre-write reread/drift refusal (any response change,
  timestamps included), post-write verification, exclusive-edit acknowledgement, audited outcomes,
  and no automatic synchronisation, retry or rollback.
- **Genuinely unknown fields still fail closed.** Metadata-only differences are excluded from the
  verified comparison, so they are not reported as drift, while a real Include change still is.
- The browser harness fixture now mirrors the live provider shape (`uid`, empty Require/Exclude,
  `connection_rules: { "rdp": {} }`).

## Live evidence

Owner-supplied redacted diagnostic of the account-level policy response: top-level keys
`app_count`, `connection_rules`, `created_at`, `decision`, `exclude`, `id`, `include`, `name`,
`require`, `reusable`, `uid`, `updated_at`; `reusable: true`; `app_count: 1`; `decision: "allow"`;
seven Include rules with the single selector `email`; `require: []`; `exclude: []`;
`connection_rules: { "rdp": {} }`; `precedence` absent; `uid` a string. Shared-policy, decision,
selector and precedence causes were ruled out with the owner. No credentials or policy contents are
recorded here.

## Install and verify

Back up household data, registry and the trusted environment file, then install
`ghcr.io/dougalbob/simple-finance-multi-household:v1.38.1` (or `:latest` after successful
publication). Keep bridge networking, host **3009** → container **3000**, appdata
`/mnt/user/appdata/simple-finance-multi-household` → `/data`. Never use the original
single-household image/appdata or port 3007. Publication does not upgrade your container.

Then retry the grant for the pending email on household `test`, and confirm the refreshed inspection
shows the verified direct entry. If that email was added manually in the Cloudflare dashboard as an
interim workaround, the first app-driven grant reports it as already present (a safe no-op) and a
subsequent removal works end to end.

No schema, migration, household-data, authentication, registry or backup-format change. Write
tokens still need account-scoped **Access: Apps and Policies / Edit** (API: Write), configured only
through trusted `/data/.env` or container environment.

## Validation

- Local unit suite, `format:check`, `typecheck`, `themes:check`, `npm audit --omit=dev`, production
  build and the targeted local browser run (Bell, Admin, Cloudflare) all pass on the release head.
- New coverage: grant against a policy returning `uid` with no `uid` in the `PUT` body; a `PUT`
  response still carrying `uid`/`precedence` verifying; a genuinely unknown top-level field still
  refusing with the existing message; metadata-only readback differences not treated as drift while
  a real Include change still is; `connection_rules: { "rdp": {} }` round-tripping unchanged.
- Release requires the corrected PR gates (`gates`, `browser`, `docker`) and merged-main CI before
  tagging. Publish repeats container smoke and verifies `v1.38.1`, `latest` and `sha-<merge-short>`
  resolve to one digest before creating the GitHub release from this document.
- Mocked tests do not claim real provider compatibility; the definitive check is the owner's retry
  in the live multi-household installation.
