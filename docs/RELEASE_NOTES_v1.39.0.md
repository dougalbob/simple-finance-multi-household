# Release notes — v1.39.0 — Who is connected, and a connection log (issue 105)

Stable feature release. The **Admin** page gains a live **Who is connected** card and a
**Connection history** log, so a restart or update is never done under someone's feet. Version badge
**1.39.0**. One registry migration; no change to storage paths, authentication, assignments,
household status or the household backup format.

## What you asked for (issue #105)

> a new card to show a live view of any users connected to the application, and a log of
> connections/disconnections … so that as much as I can the application is not updated whilst users
> may be actively using the application.

Both are on **Admin**, above the Cloudflare panel.

## The honest limit, stated on the card

This app has **no server-side session**. Every request re-verifies your Cloudflare Access assertion
and Cloudflare owns signing out — there is no sign-out event to record. So "connected" is an
**inference from activity**, and the card says so: **active now**, **idle**, **last seen**. It never
claims a live socket, and it never invents a "disconnected at" time it cannot know.

## Thresholds (as agreed)

| State | Meaning |
| --- | --- |
| **Active now** | Something happened in the last **2 minutes** |
| **Idle** | Last activity was 2–15 minutes ago — a tab is probably open, nobody is using it |
| **Ended** | 15 minutes of silence |

A visit ends **lazily** — on the next touch from that tab or the next read of the card — so there is
no background job to run, monitor or restart. The recorded end is *last activity + 15 minutes*, not
the moment someone next looked, so a five-minute visit can never appear in the log as an hour.

## Who is connected

Grouped by household: each person, their role, `(you)` on your own row, **since** the visit began
(active) or **last seen** (idle), and a tab count when more than one is open. It leads with the
sentence that matters:

> One person is active now — hold off restarting or updating the container while someone is using
> the app.

Refreshes every 30 seconds while the page is visible, and is readable with JavaScript off (the
first paint is server-rendered).

## Connection history

Ended visits, newest first: when each began, how long it lasted, and that it ended on an idle
timeout. Kept for **30 days**, with a hard ceiling of 2,000 stored visits — closed visits are pruned,
open ones never are. Identities, households and times only: **never** which pages were open or what
was recorded.

## What is stored, and what is deliberately not

Registry migration `0003_presence.sql` adds `presence_sessions`: the normalised sign-in email, that
identity's **own** household, an opaque per-tab key, and four timestamps. Absent by design: page
paths, query strings, finance data, IP addresses and user-agent strings. A row says that someone was
using the app, never what they were doing with it. A support view records the visiting
administrator's own household, never the household being inspected.

## How it knows

- Every authenticated page load and API call counts as activity.
- A browser heartbeat beats while the tab is visible **and you have actually touched the page** since
  the previous beat, so a tab left open overnight sinks to idle instead of claiming you are working.
- Both paths are throttled to at most one write a minute per visit.

Presence is operational metadata and **can never deny access**: a read-only, locked or half-migrated
registry loses the record and nothing else, and the session gate never consults it.

## Known limitations the card states

- A **locked phone** or a suspended background tab stops beating and reads as idle / last seen.
- An **expired Cloudflare assertion** looks the same as someone walking away.
- A **restart ends every visit at once** — which is exactly the event the log is there to show you
  afterwards.

## Dependency patch

`next` moves to **^16.4.2** (installed 16.4.2) to clear the critical advisories that affect
16.0.0–16.4.0: `npm audit --omit=dev` now reports **0 vulnerabilities**. No application behaviour is
changed by the bump; every gate and the full browser suite were re-run against it.

## Upgrading from v1.38.1

1. **Back up** first — each household's own download, plus the Admin page's registry backup.
2. The container applies registry migration `0003` at startup; a migration failure refuses startup
   rather than running half-applied.
3. Pull `ghcr.io/dougalbob/simple-finance-multi-household:latest` (or `:v1.39.0`) and Force Update in
   Unraid.
4. Open Admin, sign in on your phone as a second identity, and watch the card change state. Expect
   roughly a minute of lag on the way down: that is the honest cost of having no server session.

Nothing is deleted by this release. The registry backup now includes presence metadata, which is why
its retention is bounded and its columns are pinned by a test.

## No change to

Authentication, the allowlist, identity assignments, household status, finance data locations, the
household backup format, or tenant isolation. Presence lives in the control-plane registry
(`system/registry.sqlite`), never in a household's database.

## Validation

- `npm test` **1218/1218 across 274 suites** (19 new presence tests).
- Full browser suite **184/184**, first-run suite **3/3**, including a real heartbeat `POST`.
- `npm run typecheck`, `npm run format:check`, `npm run themes:check`, `npm run build` and
  `npm audit --omit=dev` (0 vulnerabilities) all green.
- Required PR checks `gates`, `browser` and `docker` pass on the PR head, then main CI, then Publish.

Only target: `ghcr.io/dougalbob/simple-finance-multi-household`, appdata
`/mnt/user/appdata/simple-finance-multi-household`, host port **3009**. Never the original
single-household installation or port 3007.
