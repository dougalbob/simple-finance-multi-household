# Release notes — v1.33.0 — Admin settings, admin menu and the Cloudflare shortcut

**Stable feature release**, moving `latest` and GitHub's Latest release. The badge reads
**`v1.33.0 · stable`**. Answers GitHub issue #91 ("Admin page improvements"), designed in
conversation and reviewed in the Arena preview, for full household testing on Unraid.

## What changed

- **Server settings on `/admin` (#91).** The key fields of the container's trusted environment
  file (`/data/.env`) are now editable from a new **Server settings** panel: `AUTH_ISSUER`,
  `AUTH_AUDIENCE` (the Cloudflare Access AUD tag — rotate it here if Cloudflare regenerates it),
  `AUTH_CERTS_URL`, `AUTH_ALLOWED_EMAILS` and the new `CLOUDFLARE_ACCESS_URL`. Saves write the
  file as quoted shell literals, atomically, keep a `.bak` copy of the previous version, enforce
  0600 permissions and record a registry audit entry (keys changed only, never values). Blank
  optional fields remove their line so the derived default (or the roster) applies.
- **Restart banner.** The container sources the environment file at startup, so a saved change is
  on disk immediately but reaches the running app only after a container restart — the panel says
  so plainly, and flags any difference between the file and the running process.
- **The Admin menu entry is strictly yours.** The desktop bar and the phone drawer now show an
  **Admin** button only to the `REGISTRY_ADMIN_EMAIL` identity — nobody else ever sees it, and the
  Server settings panel is gated the same way (a promoted platform administrator keeps roster
  management but cannot rewrite the environment file). If your own email ever changes, the
  recovery path is a hand edit of `REGISTRY_ADMIN_EMAIL` in `/data/.env` plus the Cloudflare rule,
  a container restart, and re-assigning your new address on `/admin`.
- **Open Cloudflare shortcut.** Set `CLOUDFLARE_ACCESS_URL` once (there is a field for it) and
  `/admin` shows an **Open Cloudflare ↗** button straight to your Access application/rule page.
  It is a bookmark only — changing who may sign in still happens in the Cloudflare dashboard.
- **The allowlist derives from the roster.** Anyone assigned on `/admin` is allowed to sign in
  automatically; `AUTH_ALLOWED_EMAILS` is now an optional fallback and can normally be left empty.
  Adding a household member is two steps in two places — the Cloudflare rule and the `/admin`
  assignment — with no duplicate comma list to maintain.

## Data and upgrade notes

There is **no schema migration, backup-format change or data rewrite**. The registry gains only
audit rows for settings changes. Existing households upgrade with no action needed. After
updating, the first restart is the one that applies any pending environment-file change.

## Validation evidence

- `npm run format:check`, `npm run typecheck`, `npm test` (**1,129/1,129 across 264 suites**) and
  `npm run build` pass. A new `tests/env-file.test.ts` covers quoted-shell round-trips of hostile
  values, atomic writes, the `.bak` copy, 0600 permissions, the editable-key allowlist and
  restart-drift detection; `auth-verify`, `current-user`, `session-gate` and `config` tests cover
  the roster-derived allowlist.
- The required PR checks are `gates`, `browser` and `docker` (including container and applicable
  upgrade smoke). Publication must not proceed unless they pass.

## Unraid update

1. Take a household backup from Settings before updating.
2. Install or update to `ghcr.io/dougalbob/simple-finance-multi-household:v1.33.0` (or
   `:latest` after publication). Confirm the app badge reads **`v1.33.0 · stable`**.
3. Open **Admin** (the entry appears only for the `REGISTRY_ADMIN_EMAIL` identity) and try
   **Server settings**: change a value, save, read the restart banner, then restart the container
   from Unraid and confirm the new value is live. The **Open Cloudflare** button appears once
   `CLOUDFLARE_ACCESS_URL` is set.
4. Keep the multi-household appdata `/mnt/user/appdata/simple-finance-multi-household` mounted at
   `/data` and host port **3009** mapped to container **3000**. Do not change to the original
   `simple-finance` image, appdata or route.
