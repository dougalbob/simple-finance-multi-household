# Cloudflare Admin integration — issue #101

Stage one shipped in **v1.37.0** and was live-tested by the owner. Stages two
and three add **explicit** grant/removal operations in **v1.38.0**.
There is no automatic or background synchronisation.

Only the verified `REGISTRY_ADMIN_EMAIL` identity can inspect or mutate
Cloudflare, including recovery while their household is deactivated. A promoted
`platform_admin` cannot use these operations, even by calling the server action
directly. Authentication semantics are unchanged: Cloudflare entry, verified
JWT, registry assignment and active household remain separate requirements;
`AUTH_ALLOWED_EMAILS` is optional for assigned identities and does not grant
household access to an unassigned identity.

## Secure server setup

Set these variables in trusted `/data/.env` or container environment and restart:

- `CLOUDFLARE_ACCOUNT_ID`: account containing the Access application.
- `CLOUDFLARE_APPLICATION_ID`: application UUID, **not** the AUD tag.
- `CLOUDFLARE_POLICY_ID`: dedicated reusable Allow policy UUID.
- `CLOUDFLARE_API_TOKEN`: account-scoped API token (see permissions below).

`AUTH_AUDIENCE` must match the application's AUD. No IDs, token, actor identity,
policy contents or registry-assignment claims are accepted from the browser.
These connection variables are deliberately excluded from the web Server
settings editor. Credentials never enter browser props, HTML, audit detail,
URLs or user-facing provider errors.

### Token permission change for writes

Read-only inspection can keep **Account / Access: Apps and Policies / Read**.
For grant/removal, create or edit a token securely in Cloudflare with
**Account / Access: Apps and Policies / Edit**, restricted to the intended
account (the official API schema calls this permission **Access: Apps and
Policies Write** and lists it for reusable-policy PUT). Keep unrelated account
and zone permissions off. This permission can affect other Access applications
in that account; the application's binding checks do not narrow the token itself.
Install/replace the token only through trusted server configuration and restart.
Never paste it in chat, a screenshot, a URL, a test, or a commit. Protect the
`.env` and its backups; rotate/revoke exposed tokens in Cloudflare.

An old Read-only token will still inspect successfully but writes will fail.
No real provider writes or token tests have been performed during development.

## Operator workflow

1. Assign an email to a household in Admin as usual. This does **not** grant
   anything in Cloudflare. A household's deactivation does not change Cloudflare.
2. Review the Cloudflare panel and select the assigned email. The panel also
   lists direct policy emails that have no registry assignment.
3. Ensure nobody is editing this policy **or its application associations** in
   Cloudflare, via another API client, or another installation. Tick the
   exclusive-edit acknowledgement and click **Grant Cloudflare access**.
4. Read the operation result and refreshed inspection. Verified success means
   the intended direct Include email is present, **not** that all onboarding or
   effective access is guaranteed. Existing conditions and household status apply.
5. For cleanup, select an email and separately confirm **Remove from Cloudflare**.
   Policy-only emails can be cleaned up without creating a registry assignment.
   The configured administrator's own email is protected server-side. Registry
   unassignment and household deactivation are separate operations.

A grant rechecks the current assignment before provider reads and immediately
before a write; it requires a roster row, not an active household. Granting to a
deactivated household does not reactivate it or permit application use.
Already-present grants and already-absent removals are safe no-ops. Removal
matches only the selected direct Include email (case-insensitively), including
duplicate direct entries; it does not remove references inside groups,
Require/Exclude rules, other policies or identity providers.

A failed request never deletes or changes the registry assignment. A write
rejection, timeout, malformed response or unverifiable readback is reported
conservatively as **outcome unknown / pending verification**, not completion.
Review refreshed inspection (reload Admin if necessary), resolve the cause and
**deliberately retry**. There are no automatic write retries or rollback writes.
Read failures mean **unknown**, never email absence or denial. Controls and
feedback stay visible even when refreshed inspection fails.

### Removal is not a session-revocation operation

Cloudflare application tokens have a lifetime; its session documentation says
users may access the application for that token lifecycle, and policies are
checked when issuing a new application token. Removing an email here does not
invoke a session-revocation API, does not promise immediate revocation of
existing sessions, and cannot guarantee denial via other matching policies or
non-email rules. For urgent response use Cloudflare's documented session
management separately, and manage the registry assignment/household status as
appropriate. The finance application still verifies JWTs and registry state on
requests exactly as before.

## Supported policy boundary and preservation

Inspection remains read-only and can describe complex policies. Mutations use
a **separate, strict schema and fresh full policy reads**, never the inspection
summary as a replacement payload.

Writes use `PUT /accounts/{account_id}/access/policies/{policy_id}`. Before any
write, the application must reference the configured policy and its AUD must
match `AUTH_AUDIENCE`. The account-level policy response must explicitly say
`reusable: true`, `app_count: 1`, the correct ID (and correct account if supplied),
and `decision: allow`. A dedicated policy name is **not** a technical guarantee.
Shared policies, missing usage metadata and legacy application-scoped policies
are refused; no attempt is made to convert or detach them. If the live policy is
legacy or unsupported, inspect and discuss a safe dashboard-side change first.
The legacy application-scoped GET remains in stage-one inspection; it is not
used as a mutation endpoint.

Supported selectors (in Include, Require and Exclude): direct `email`,
`email_domain`, `group`, `everyone`, `ip`, `geo`, `login_method`, `auth_method`.
Every supported rule and array order is preserved verbatim except the selected
direct email addition/removal. Non-email Include rules and additional conditions
remain explicitly flagged by inspection; an email entry alone does not establish
access. Other selectors, unknown object fields, malformed/nested extensions,
non-Allow policies, or removal of the final Include rule fail closed.

The writable projection preserves all supported name/decision/rule fields,
approval groups/flags, isolation flag, purpose-justification prompt/flag, session
duration (including null), RDP connection rules and MFA settings. Objects are
strict at every level. Supported MFA authenticators are `totp`, `biometrics`,
`security_key`; unknown authenticators/settings require review. Read-only
`id`, `account_id`, `reusable`, `app_count`, `created_at`, `updated_at` metadata
is validated but **not** sent back in the PUT; Cloudflare controls timestamps.
Application settings and policy precedence/associations are never written.

## Concurrency — important limitation approved for this implementation

The current official PUT schema documents no ETag/If-Match, revision, or atomic
conditional-update facility. **This is not an atomic email patch.** Neither an
extra GET nor a local lock can prevent a dashboard/API edit between the final
read and PUT. Do not use this interface while external edits are in progress.
The owner approved this conservative exclusive-edit workflow before coding.

Within one installation an exclusive filesystem lock next to the registry
(`system/cloudflare-policy.lock`, mode 0600) rejects overlapping operations,
including separate server processes sharing that data root. It does not cover
other data roots or external clients. Operations read the binding and full
policy, reread them immediately before PUT, and abort on detected drift
(including timestamps/usage changes). After PUT they validate the returned policy
and read back both binding and full writable configuration. Policy comparisons
ignore object key order, not array order or values. Binding comparison uses
application ID, audience and policy IDs; embedded policy bodies/timestamps may
legitimately change with our own write and are not treated as association edits.
Detected post-write drift is **unknown**, never automatically overwritten again.

The lock is normally released after the attempt. A crash can leave a lock and a
pending audit row. It is **never stolen automatically**. An operator must first
stop application writers, review the provider policy and pending audit, establish
that no request remains in flight, then remove only the stale
`/data/system/cloudflare-policy.lock` and restart. This file is an operational
safety marker, not a secret or a registry/household backup-format change.

Each authorised, valid operation records a unique attempt ID, verified actor,
operation, target email and an initial `pending` audit row before provider calls,
then `changed`, `noop`, `refused` or `unknown`. Audit failure before requests
prevents writing; audit failure after requests never reports completion. No token,
policy body or raw provider response is audited. Recent registry activity shows
the sanitised outcome. A pending row records an attempt start, not current access.

All API traffic is uncached HTTPS to the fixed `api.cloudflare.com` host,
refuses redirects, uses ten-second request timeouts, and sanitises errors.
Standard Next server-action POST/Origin protections are unchanged.

## API/security research (2026-10-22)

Official sources checked through GitHub (the sandbox permits GitHub, not the
Cloudflare documentation host):

- [Cloudflare OpenAPI](https://github.com/cloudflare/api-schemas/blob/d3e86eec17211653ca9bc18c0d4bfcace2904148/openapi.json):
  reusable GET/PUT paths, `access_policy_req`, `access_reusable_policy_resp`,
  writable/read-only fields and `x-api-token-group`. No conditional-update
  parameter is documented. Legacy application-scoped policy endpoints are marked deprecated.
- [Official TypeScript SDK reusable policies](https://github.com/cloudflare/cloudflare-typescript/blob/6dbe1fc45b41f102e5edcd3630d6fd3e803552ce/src/resources/zero-trust/access/policies.ts),
  `PolicyUpdateParams` / `PolicyGetResponse`; and
  [application policies](https://github.com/cloudflare/cloudflare-typescript/blob/6dbe1fc45b41f102e5edcd3630d6fd3e803552ce/src/resources/zero-trust/access/applications/policies.ts)
  for legacy vs reusable endpoint semantics.
- [Cloudflare session management](https://github.com/cloudflare/cloudflare-docs/blob/ea89e14e0b75bab7f0dfca82ae14f35ba3550cdf/src/content/docs/cloudflare-one/access-controls/access-settings/session-management.mdx)
  for token lifecycle, renewal policy checks and separate revocation operations;
  [policy evaluation](https://github.com/cloudflare/cloudflare-docs/blob/ea89e14e0b75bab7f0dfca82ae14f35ba3550cdf/src/content/docs/cloudflare-one/access-controls/policies/index.mdx)
  for Include/Require/Exclude and multiple-policy caveats.

Tests use fictional values only. The browser runner preloads
`scripts/e2e-cloudflare.cjs` at the server-fetch boundary and intercepts **all**
Cloudflare URLs (unexpected paths are rejected). No production mock endpoint,
auth bypass, credential UI or background synchronisation was added.
