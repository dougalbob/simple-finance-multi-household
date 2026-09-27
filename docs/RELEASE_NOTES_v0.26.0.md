# Release notes — v0.26.0 — the bell: an in-app needs-attention prompt, with personal tasks

**What changed**

- **Bell in the header (SPEC §26, decision 176):** a bell button on every signed-in page — desktop at the right-hand end of the bar, phone in the top bar next to the menu button, hidden on `/unauthorized` and when signed out. The number is "needs attention now": open tasks overdue or due today (filtered by who they are for, §26.2) plus key-date alerts in state today, past or rolled-awaiting-review. Not counted: tasks coming up, undated tasks, and key dates merely inside their 21-day window. Zero means no badge. Accessible name carries the count in words ("Needs attention: 3 — 2 overdue, 1 due today" or "Nothing needs attention") plus "2 new since you last looked" when there is a new dot. Words, never colour alone (§16.7).

- **Panel:** clicking the bell opens a panel (laptop popover, phone sheet under the top bar; `aria-expanded`, Escape closes and returns focus, click outside closes). Groups: Needs attention (counted items, tasks reuse `TaskCheckbox`/`TaskDueBadge` + subject link, key dates use `keyDateMessage`/`keyDateHref`), Coming up in the next 7 days (tasks due 1..7 days + in-window key dates, listed not counted), footer "N things the app has noticed →" → `/tasks#noticed-heading` and "All tasks →" → `/tasks`.

- **Freshness:** root layout persists across client navigation, so a count computed in `layout.tsx` would go stale. `GET /api/attention` (`dynamic = 'force-dynamic'`, `cache: 'no-store'`, 401 JSON when signed out) returns counts and panel items; client `Bell` fetches on mount, pathname change, `visibilitychange`, `sf:tasks-changed` window event (task forms dispatch after success) and every 5 minutes while visible. Ticking a task updates the bell without reload.

- **Since you last looked:** a separate small "new" dot, not part of the number. Source: `audit_entries` where `entity='task'` and action create/complete/reopen, actor ≠ me (case-insensitive) and ≠ `system` (0013 migration), `createdAt` > my last-seen. Worded with names: "Sam added …", "Sam ticked …". Cap 20. Stored per person on server so phone and laptop agree: new table `bell_seen (email TEXT PRIMARY KEY, seen_at INTEGER NOT NULL)` — lower-cased email, UI state not a record (not audited, same as theme cookie). Opening panel marks seen via `POST /api/attention/seen`, fired on open; new list is worked out before updating `seen_at`, so it stays visible while open. Person with no row yet looks back 7 days at most.

- **Personal tasks (user clarification):** default is both users see bell count for tasks regardless of who created. When adding or editing a task, the form offers "For: Everyone" (default, both count) and "Only me" (only current user's bell counts it, e.g. "Query brake disc invoice on Mercedes" only for one of us). Stores `tasks.assigned_to` (lower-cased email, null = household). Task stays visible to both on `/tasks` and subject cards, labelled "Only for <name>" when linked in Settings. No "assign to Sam" picker in this release — "Only me" covers the stated case.

- **Schema — migration 0014 `bell_and_task_assignee`:** `bell_seen` table and `tasks.assigned_to` column + index, via drizzle-kit's real clock, strictly increasing, never in future (decision 172). Upgrade-tested from v0.25.0-shaped DB, idempotent.

- **Docs:** SPEC §26 (new) and §22.3 / §25.6 wording; decision 176; OQ14 deferred by household (they will road-test and decide in a few weeks); HANDOFF block with v0.25.0 verified facts; version 0.26.0 in all five places.

**Housekeeping**

- OQ14 (stale pot) is deferred by household — they will road-test and decide in a few weeks. Not built in this release.
- v0.25.0 verified post-merge facts recorded at top of HANDOFF.md (decision 173).

**Calls made without household answer**

The household skipped questions in prior sessions and asked work to carry on, and this session had no question panel. One call was made for the bell's personal-task filtering: personal tasks are filtered out of the other person's bell counts and lists, but still appear in "Since you last looked" if created by the other person (activity awareness). The alternative — hiding personal tasks from the other person's "new" dot entirely — would be quieter and could be a later tweak.

**Gates**

`npm test` 580 passed / 136 suites · `npm run typecheck` clean · `npm run format:check` clean · `npm run build` clean (`next-env.d.ts` restored afterwards). Playwright via SANDBOX entry 8.

**Version**

0.26.0 in `package.json`, `package-lock.json` (root and `packages[""]`), `src/lib/version.ts`, `simple-finance.xml`, and these release notes.
