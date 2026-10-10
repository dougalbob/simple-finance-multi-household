# Multi-household edition — active product and safety contract

**Status:** Approved direction recorded 2026-10-10. This document describes the target behaviour; the multi-household application, household registry, consent flow and per-household storage are **not implemented yet**. The current source is inherited from the single-household Simple Finance v0.39.0 codebase. Do not treat its current screens, schema, `AUTH_ALLOWED_EMAILS` behaviour, backup endpoint or database connection as multi-household-safe.

This is the concise active contract for future agents. It is also reflected in `AGENTS.md`, `README.md`, `docs/HANDOFF.md`, `docs/SPEC.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/RELEASE_PROCESS.md`, the publish workflow and the Unraid template. If historical source documents disagree, this contract and the current product spec take precedence for the multi-household edition. Historical v0.x release notes describe the original single-household product and must not be rewritten or published as releases of this edition.

## 1. Hard separation: repository, GHCR and Unraid

- This is the independent repository `dougalbob/simple-finance-multi-household`. The original production repository remains `dougalbob/simple-finance`.
- The **only** image destination for this repository is `ghcr.io/dougalbob/simple-finance-multi-household`. The Publish workflow must check the GitHub repository identity and fail closed if it is not exactly `dougalbob/simple-finance-multi-household`; it must not derive an unguarded destination that could point to the original package. Never push any tag, including `latest`, to `ghcr.io/dougalbob/simple-finance`.
- The original Unraid installation remains on bridge networking, host port **3007** → container port **3000**, and `/mnt/user/appdata/simple-finance`. Do not reuse, mount, migrate in place, or modify that host data path.
- The new Unraid installation uses bridge networking, host port **3009** → container port **3000**, and one separate bind mount: `/mnt/user/appdata/simple-finance-multi-household` → `/data`. Its Cloudflare Tunnel route must point to the new container and must not replace the original route. Prefer a separate hostname for the new route.
- The Unraid template, README, workflow and test fixtures must all use the new repository, image, route and appdata identity. The old `v0.x` Git tags in the inherited source history are not releases of this product line. The publish workflow must reject v0 tags and its upgrade smoke must never try to pull original-product tags from the new GHCR package.

## 2. Household and identity model

- One installation serves multiple independent households in one application container.
- A household has **one or two people**. A two-adult household is typical; a person may also have a one-person household. The app must treat one person as a complete household and must reject a third person/member.
- Cloudflare Access + Google sign-in remains the identity provider and outer access gate. The app independently verifies the Access JWT. The app's administrator pre-creates a household and assigns each allowed sign-in email to exactly one household before that person visits for the first time. There is no self-sign-up and no automatic assignment based only on a successful Cloudflare login. An authenticated but unassigned identity is denied by the application.
- The person record used for attribution (`people`) is linked to that verified identity within the assigned household. A person's identity must not be linked to more than one household.
- Cloudflare's email policy and the app's household roster are separate checks: the Access policy decides who may reach the hostname; the app roster decides whether that verified identity is assigned and which household database it may use.

## 3. Storage and request isolation

Target host/container layout:

```text
/mnt/user/appdata/simple-finance-multi-household/  ->  /data/
  .env                                           Cloudflare/bootstrap secrets; root-owned, not backed up
  system/registry.sqlite                        household roster, assignments, roles and support grants only
  households/<opaque-household-id>/
    simple-finance.sqlite (+ WAL/SHM)             that household's finance records only
    documents/                                    that household's attachments only
    logging/                                      that household's logs, if needed
```

- Each household gets its own SQLite database and documents directory. Do not put all households' financial rows into one shared finance database with a UI-only filter.
- The registry is a control plane, not a financial database. It must not contain purchases, balances, receipts or other finance records. A household backup must not include the registry or any other household's material; the control-plane configuration needs a separate, administrator-managed backup/recovery procedure.
- The database path is selected only after verifying the request's identity and resolving its assignment from trusted registry data. Use a stable opaque household ID and safe path construction. Never trust a household ID supplied by the browser.
- Replace the current process-wide single-database assumption with safe per-household handles/context. Do not implement this as a mutable global “current household” pointer: simultaneous requests from different households must never be able to switch one another's database context.
- Every page, server action, route handler, document read/write, background operation, cache key, export, backup and restore must be household-scoped. Fail closed if the identity, membership, household status or database cannot be resolved.

## 4. Admin and support access

- The platform administrator can create/deactivate households and pre-assign verified email identities. The admin can use their own household as an ordinary member.
- Platform administration gives no standing application permission to view or edit another household's financial data. Admin listings show only the operational metadata needed to onboard and support the service.
- A household member can explicitly grant and revoke an administrator support session in the app. It must be clearly visible, time-limited, auditable, and read-only by default. Expired or revoked consent immediately blocks access. No global household reports or silent impersonation.
- The owner and participating households accept that the Unraid host administrator can technically inspect files outside the app. The app-level consent wall is the requirement; cryptographic protection from the host owner is not required.

## 5. Backups and migration

- Each household can create an encrypted backup containing only its own WAL-consistent SQLite snapshot, its own stored attachments and an integrity manifest. Restore is explicitly scoped to one household and cannot overwrite another household's directory.
- Test cross-household denial, per-household backup contents and restore isolation. Keep configuration and registry recovery separate from each household's finance backup.
- The existing two-person household is migrated into one new household directory. Preserve the database and all documents; map the two existing Cloudflare emails to their existing person records. Cloudflare owns sign-in, so no app passwords are migrated.
- Use the existing encrypted backup as a **dry-run source** only. Restore/import it into an isolated copy of the new appdata layout; verify record counts, SQLite integrity/foreign keys, attachment hashes and a new per-household backup/restore. Never rehearse against the original production database or document directory. Take a fresh backup before any later cutover if the source data has changed.

## 6. Release-candidate policy

- The first multi-household product release is **`v1.0.0-rc.1`** (npm/app version `1.0.0-rc.1`). Use conventional SemVer prerelease syntax, not the ambiguous `v1.0.0rc` spelling. Further candidates increment the suffix (`v1.0.0-rc.2`, etc.).
- RC images are published only to `ghcr.io/dougalbob/simple-finance-multi-household` with their exact `v1.0.0-rc.N` tag and `sha-<short>` trace tag. An RC must **not** create or move `latest`, and its GitHub release is marked pre-release.
- When the candidate is accepted for production, publish a separate stable `v1.0.0` release from the approved stable commit. Stable releases may create/move `latest`; never rename or retag the RC. The Unraid template's stable default is the new package's `latest`; RC acceptance installs pin the exact RC tag.
- Do not bump the current inherited app version to `1.0.0-rc.1` or cut/push any tag until the multi-household implementation and its release notes are ready. The first foundation PR changes the release mechanism and records the policy; it does not publish an image.

## 7. Delivery sequence

1. Lock repository/package/template/appdata/port identity and the RC/stable publication rules (the current foundation change).
2. Design and implement the control-plane household registry, secure identity-to-household assignment and safe request-scoped database selection.
3. Add household administration, first-login onboarding and explicit support consent/audit.
4. Make all data/document routes and encrypted backup/restore tenant-scoped; enforce the one-or-two-member limit.
5. Implement and rehearse the legacy database/documents import into the owner's household using an isolated copy of the recent backup.
6. Run cross-tenant security, two-household concurrency, backup/restore, Unraid and real Cloudflare acceptance tests. Before importing live data, use a separate test household and route; with the test account holder's consent, use a separately signed-in mobile Google account to verify the first-login path. Confirm an authenticated but unassigned identity is denied.
7. Prepare and publish `v1.0.0-rc.1` to the new GHCR package only; after the candidate is accepted, make the separate stable `v1.0.0` release.
