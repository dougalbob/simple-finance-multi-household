<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Simple Finance Multi-household

Continuation point: [`docs/HANDOFF.md`](docs/HANDOFF.md). Read that before changing the app. [`docs/SPEC.md`](docs/SPEC.md) is the product spec; [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) is the decision log — read the decisions that touch the area you are changing. The active multi-household contract is [`docs/MULTI_HOUSEHOLD_PLAN.md`](docs/MULTI_HOUSEHOLD_PLAN.md); older v0.x history is from the original single-household source project.

## Current project identity and non-negotiable boundaries

This repository is `dougalbob/simple-finance-multi-household`, independent of the live `dougalbob/simple-finance` app. Never publish any tag, including `latest`, to `ghcr.io/dougalbob/simple-finance`. The only permitted image is `ghcr.io/dougalbob/simple-finance-multi-household`; `.github/workflows/publish.yml` must hard-fail unless the GitHub repository is exactly `dougalbob/simple-finance-multi-household`. Never push or publish inherited v0.x tags as releases of this product.

The original Unraid app remains on host port 3007 and `/mnt/user/appdata/simple-finance`. The new app uses bridge networking, host port **3009** → container port **3000**, and `/mnt/user/appdata/simple-finance-multi-household` → `/data`. Never mount, migrate in place, or alter the original appdata path or route. `v1.0.2` is the accepted stable release and moves `latest` (`v1.0.0` was the first stable; `v1.0.1` shipped registry backup/restore). Candidates (`v1.0.0-rc.N`) never move `latest`; `v1.0.0-rc.1` and `v1.0.0-rc.2` are Git tags with **no published image** (their Publish runs failed before pushing), and `v1.0.0-rc.3` is the accepted candidate `v1.0.0` was promoted from.

Target households contain one or two people and each has a separate SQLite database and documents directory. The app administrator pre-assigns Cloudflare-authenticated email identities before first login; there is no self-sign-up. Cross-household financial access is denied unless the household later explicitly grants an audited, time-limited support session. **Implemented and released in `v1.0.0`:** the system registry (`src/lib/registry`, `system/registry.sqlite`), `/admin` pre-assignment, the one-or-two identity limit, first-login denial, immutable per-request household contexts with independent per-household handles, and finance pages/actions, attachment storage/viewing and attention/attachment APIs all using the verified registry assignment. Startup migrations discover only registry-listed tenant databases. There is no mutable current-household pointer and no request-selected household ID. Consent-based support access (`/support`, registry migration `0002`, read-only at three layers, audited), the verified identity-to-`people` link, and per-household backup/restore (format 3 archives, `/api/backup` and `/api/restore`) are all built. Registry backup and restore shipped in the admin panel in `v1.0.1` (`GET /admin/backup` download, `POST /admin/restore` file replace, `RegistryBackup` client component); `v1.0.2` fixed the restore's broken post-restore redirect (relative `/admin`, status 303) and hardened the swap (upload validation, atomic replace, timestamped pre-restore copy, outcome logging) with dedicated route and browser tests. The inherited app-wide backup/restore controls are gone from Settings.

**Still deferred:** import of the owner's existing single-household data (a fictional rehearsal passes via `npm run rehearse:import`; real data needs its own approval), and a browser test for the support-grant flow. The registry and `.env` are still not in a household backup: since `v1.0.1` the registry has its own admin-panel download/restore, while `.env` still needs the host's own backup routine. Do not point this app at the original appdata. See [`docs/MULTI_HOUSEHOLD_PLAN.md`](docs/MULTI_HOUSEHOLD_PLAN.md) and the current [`docs/HANDOFF.md`](docs/HANDOFF.md) before changing storage, auth, backup, restore, deployment or release code.

Releases follow [`docs/RELEASE_PROCESS.md`](docs/RELEASE_PROCESS.md) — the standing default for every GitHub release: the agent owns version bumps, the merge-commit pull request, the lower-case annotated tag, registry verification, release notes and the GitHub release. Do not ask the household to merge, tag or publish anything by hand.

## Working ethos — how to use the docs

These docs are here to help you and the household, not to box you in. Treat `docs/SPEC.md`, `docs/IMPLEMENTATION_PLAN.md` and `AGENT_APP_BLUEPRINT.md` as a guiding hand, not an unbreakable pact.

- If a doc is getting in the way of the task, **say so and ask**. You're authorised to challenge the spec and suggest a better alternative — have the quick conversation with the household before you deviate, don't just silently work around it.
- If a blueprint or spec rule is genuinely the wrong call for the change in front of you, propose the alternative and get an explicit "go ahead". That 30-second check beats a perfect implementation of the wrong thing.
- **Exception:** `docs/RELEASE_PROCESS.md` is the one rule that *is* strict. The household is deliberately hands-off on GitHub delivery (merge, tag, publish, release) — don't pull them into that flow and don't offer to let them do it by hand. Own it end-to-end and follow its checks and release sequence.

### Sandbox

The sandbox has real network/filesystem limits. Before you retry a failing install three times, read `docs/SANDBOX.md` — if you hit a *new* limit, add it there (with the fix) and reference it from `docs/HANDOFF.md` / `docs/IMPLEMENTATION_PLAN.md`. Update that handoff note **before** you merge the PR — Arena won't let you push substance after the merge.

[`AGENT_APP_BLUEPRINT.md`](AGENT_APP_BLUEPRINT.md) supported the initial build through the first release. It is historical context, not required reading for ongoing work. Do not treat it as a gate, and do not send future sessions back to it first.
