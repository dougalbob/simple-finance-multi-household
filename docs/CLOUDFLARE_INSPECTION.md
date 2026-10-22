# Cloudflare inspection — issue #101, stage one

The Admin page now has a **read-only** Cloudflare panel, visible only to the
`REGISTRY_ADMIN_EMAIL` identity (including recovery while their household is
deactivated). Promoted platform administrators do not trigger API calls.
No Cloudflare mutation endpoints are implemented.

## Server setup

Set these variables in the trusted `/data/.env` or container environment, then
restart the container:

- `CLOUDFLARE_ACCOUNT_ID`: account containing your Access application.
- `CLOUDFLARE_APPLICATION_ID`: application UUID, **not** the AUD tag.
- `CLOUDFLARE_POLICY_ID`: dedicated Allow policy UUID.
- `CLOUDFLARE_API_TOKEN`: API token with **Account / Access: Apps and Policies / Read**,
  scoped to that account. Do not grant Edit for this stage.

Keep the existing `AUTH_AUDIENCE`: inspection checks the application's AUD
against it, and verifies that the selected policy belongs to the application.
Use Cloudflare's dashboard to obtain IDs. Never commit a token, paste it into
chat, or put it in a URL. These fields intentionally are not part of the web
Server settings editor, and token values are never passed to the browser.
Protect the environment file and its backups as secrets; revoke/rotate the token
in Cloudflare if exposed.

Reload Admin to check again. Each request is uncached, GET-only, HTTPS to a fixed
Cloudflare host, refuses redirects, and has a ten-second timeout. Errors are
sanitised: a failed check means **unknown**, not that an email is absent.

The panel compares direct email Include entries with registry assignments and
also lists policy emails without assignments. Additional Require/Exclude rules
or non-email Include rules produce a warning. This is **not an effective-access
evaluator**: other policies, identity providers, sessions and household activity
can affect actual access. A deactivated household still denies application use.

No registry schema or sign-in behaviour changes. Existing onboarding remains
manual. Grant/revoke buttons and automatic synchronisation are future stages.

API shapes cross-checked against Cloudflare's official TypeScript SDK:
`src/resources/zero-trust/access/applications/{applications,policies}.ts` in
https://github.com/cloudflare/cloudflare-typescript . The application GET and
application-scoped policy GET are the only API endpoints used.
