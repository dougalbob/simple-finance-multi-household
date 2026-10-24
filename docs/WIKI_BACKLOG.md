# Wiki user guide — backlog and working notes

The GitHub wiki for this repo is a **user guide** written for an overwhelmed household user,
not a developer guide. Voice: plain second-person English, short sentences, British spelling,
honest about limits, no marketing — match `src/lib/guide.ts`. This file lives in the app repo
because earlier scratch copies outside git were lost in snapshot resets. Update it as pages ship.

## Hard rules

- Screenshots are **Route B only**: automated Playwright captures from the fictional e2e seed
  (Alex/Sam, example.com, made-up suppliers such as BroadbandCo). Never real balances, names or
  receipts — the wiki is public and SPEC §21.3/§23.3 bar real personal data.
- Capture mutations (if any) are discarded by the e2e server's automatic reseed on next boot;
  prefer non-mutating view-state captures (`<details>`, calendar expansions, URL state).
- Push wiki work to `master` every turn — the wiki remote and this app repo are the only
  durable stores; `/home/user/wiki-screenshots/`, `node_modules` and `/tmp` do not survive
  snapshot resets. Capture scripts are disposable; their recipes live in `docs/SANDBOX.md`.
- Gollum page filenames contain no commas; use piped links when the display title has one:
  `[[Purchases and All Transactions|Purchases-and-All-Transactions]]`.

## Roadmap and status

### Part 1 — Core ideas (all published)

1. Start here (`Home.md`) — four questions, no-bank-connection stance, vocabulary
2. Pots and checkpoints
3. The till and quick entry
4. Fuel and vehicles
5. Receipts, attachments and backups
6. Categories
7. Suppliers

### Part 2 — Understanding past spending (all published)

8. Purchases and All Transactions — filters, search, chips, activity codes, in-place correction
9. Charts — the seven drawings, drill-downs, presets, spending mix
10. Insights — same figures as tables, line-item drills, the configured-vs-actual honesty loop

### Part 3 — Looking ahead (in progress)

11. **Schedules and expected income** — published 2026-10-24: DD/SO/receipt lifecycle,
    conversion at local midnight, history never rewritten, Active-from backfill (decision 162,
    ~3-year/1100-day cap with named earliest date), skip-not-duplicate, excluded months
    (decision 163), weekend rules (DD/SO keep the day; receipts shift to previous Friday;
    bank holidays deliberately unhandled), cancellation with effective date, income page
    (scheduled + one-off, BAC, no categories/insights, borrowing is never income).
12. Payday projection and Horizon — to-payday card, projected low point, 400-day look-ahead,
    how scheduled instances and the grocery/fuel figures feed it (cross-link Insights honesty
    loop; projection figures also live on the Recurring payments page).
13. Contracts and renewals — `/contracts` agreement register, review/switch dates, contract
    end dates are informational and never auto-stop instances (SPEC §22.1), link from schedules.
14. Tasks and the bell — reminders wait in-app, no emails/notifications; supplier interaction
    log tasks feed the bell.
15. Borrowing — loans between household members, expected-support inflows, ledger; borrowed
    money is never income (guide anchor `borrowing`); see `docs/BORROWING_PAGE_PLAN.md`.
16. Long-term forecast — same projection arithmetic across decades of assumptions
    (guide anchor `longterm`).

### Part 4 — Recipes (not started)

Short "how do I…?" pages for real household questions; topics to harvest from support wording
and `src/lib/guide.ts`. Candidates: correcting a wrong direct debit, starting the app
mid-month (backfill), pausing a payment over the summer, recording a cash gift, reconciling a
pot to the bank with a checkpoint, what to do when the payday card warns of a low point.

## Conventions for captures and pages

- Server: e2e server on `http://127.0.0.1:3100` (check `ps aux | grep e2e-server` first —
  orphans can hold the port after a reset, SANDBOX 32). Health: `curl /api/health`.
- Settle every page: `goto(..., { waitUntil: 'load' })`, wait for `main`, remove
  `nextjs-portal` nodes, hide the `header`. Never use `networkidle` (times out).
- Chromium: only the sideloaded `/tmp/chromium` works; run with
  `LD_LIBRARY_PATH=/tmp/al2023/lib node --import tsx <script>.mts`.
- Whole-section element screenshots on `section[aria-labelledby="…"]`; add inline padding
  before element screenshots so labels don't touch the crop edge. Form grids in the recurring
  schedules panel need the injected single-column stylesheet trick (SANDBOX 33).
- Images go in wiki `images/` with a page-prefix (`schedules-*`, `income-*`, `insights-*`).
- Each page ends with a **Related pages** list of wikilinks; update `_Sidebar.md` and the
  roadmap at the bottom of `Home.md` in the same commit.
- Verify publication with `fetch_page` on the live wiki URL after pushing.

## Reference facts for the schedules page (seed, today = 2026-10-24)

- BroadbandCo fibre: dd, £34.99, day 26, supplier + linked agreement, active from 2026-04-27.
- Phone plan: so, £12.00, no supplier; the October instance (Sun 18th) shows DD/SO are not
  weekend-shifted.
- Salary: receipt, £2,450.00, day 27, into Salary account; one-off "Sale of bicycle" £45.00.
- Key limits: materialisation horizon 400 days ahead; backfill cap
  `MAX_BACKFILL_SPAN_DAYS = 1500 − 400 = 1100` days; error names the earliest acceptable date.
