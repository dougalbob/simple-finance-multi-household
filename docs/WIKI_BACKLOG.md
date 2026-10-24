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
12. **The payday projection and Horizon** — published 2026-10-24: configured household payday
    (day 1–31, clamp + Friday shift, independent of receipt schedules), household-net vs
    liquid-funds starting figures (cards excluded), home card / Overview panel / till weekly
    pace / pot bills-only transfer watch (5-day lead, worst pot only), anchor-reset day-to-day
    events (7-day shop, 30-day per-vehicle fill, overdue → tomorrow, suppressed on payday),
    two warning tiers (SPEC §8), Horizon 400-day window, default = day before payday
    (+35 fallback), URL state (`through/pots/daytoday`), ≈ expected support vs + income,
    day-by-day drill, bills-only relabel, pending-debit limitation (SPEC §7.4).
13. **Contracts and renewals** — published 2026-10-24: `/contracts` register grouped into
    insurance policies / service contracts / other reminders; explicit kind + auto-renew
    yes/no/unknown (never inferred); two independent dates (renewal/cover-end vs fee-free
    switch, each with its own 0–365-day in-app reminder, default 21); annual date only rolls
    forward when auto-renew = yes (no/unknown stays a review prompt; 29 Feb → 28); link is
    navigational only and never stops a payment; one schedule per agreement, two-way anchors
    (`/recurring#schedule-edit-N`, `/contracts#agreement-N`); Overview Key dates in-window
    alerts, no duplicates from linked schedules; credit-card payment/promo reviews; supplier
    follow-up tasks; in-app channel only (email is v2).
14. **Tasks and the bell** — published 2026-10-24: `/tasks` two columns (Your tasks with tick
    boxes vs The app has noticed, derived and untickable); four due groups in fixed order
    (overdue → today → coming up → undated) with states always in words; overdue stays at the
    top until closed; "For: Everyone / Only me" (assigned_to) — the task stays visible to both
    but only counts in that person's bell; tick/edit/close-with-note/reopen with version
    guards; Done in the last 30 days with who-closed-what; noticed = in-window key dates +
    fuel fills missing litres/mileage + no-full-tank vehicles, each linking to its cure;
    tasks also live on supplier cards (header counts in words), purchase rows and the
    Suppliers "Promised follow-ups" banner; bell counts overdue/today tasks relevant to me
    plus key dates today/past/available/rolled, never in-window or coming-up, zero = no badge,
    accessible name in words; panel = new-since-you-last-looked (audit rows by the other
    person, 7-day first look-back, cap 20, names from linked sign-in emails) + needs-attention
    (tickable) + coming-up 7 days + footer links; laptop popover / phone sheet; refetch on
    mount, pathname change, visibilitychange, `sf:tasks-changed` and every 5 minutes; seen-at
    is UI state, not audited; nothing is ever sent (decision 19).
15. **Borrowing** — published 2026-10-24: `/borrowing` one card per person with honest status
    words (we owe / owed to us / Nothing owing / Awaiting first payment / overpaid; "no
    movements yet" vs "no effective movements — all voided"; repayment greyed out while
    nothing is owed; Delete only for a movement-free setup); derived balances that cannot
    drift; two IOUs per person never netted; inline Record borrowing/repayment (and the
    they_owe mirror) with overpayment and insufficient-cash refusals plus a below-zero
    warning; cash-vs-bank answered by pot + note with a "Show <pot> around <date>" link;
    statement-style ledger newest first (order and person filter keep the scroll position,
    `?who=`/`?order=`/`?external=` URL state), per-person running balance − we owe · + owed
    to us, greyed next-expected rows with "Record this month's £…", voided rows struck with
    reason and no balance, in-row detail/correct/void with immutable kind/direction/debt link;
    setup flow below the ledger (recurring / one-off / just track, Fill the end date);
    expected support = plan not promise (weekend Friday shift, until date inclusive,
    forward-looking edits, settled expects nothing, unstarted is not settled, recording the
    borrow silences the month, EXP< rows outside totals) flagged ≈ "expected — never received"
    in the projections and Horizon; home page prints "Owe others £X (borrowed, not income)".
    See `docs/BORROWING_PAGE_PLAN.md`.
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

## Reference facts for the tasks & bell page (seed + fixture, today = 2026-10-24)

- The bare seed has only two open tasks (the BroadbandCo call-back, "In 6 days · Fri 30 Oct",
  and Sam's bell task, due today+3) and no closed ones — too thin to show the groups, so the
  captures ran against a **disposable fixture** (`/home/user/wiki-screenshots/fixture-tasks.mts`,
  idempotent by title; a server restart reseeds and discards it). Fixture tasks: "Query the
  brake-disc invoice" (Vehicle B, overdue by 1 day, Only for Alex), "Ring Wattstream Energy
  about the tariff" (due today), "Call InsurerCo about the no-claims discount" (due today,
  Only for Sam), "Research cheaper tariffs" (BroadbandCo, undated); closed: "Book Vehicle A's
  MOT" (Alex, note "Booked for the first week of November.") and "Order the replacement wheel
  trims" (Sam, note "Arriving Tuesday."). Sam's person row is linked to sam@example.com so
  names print as "Sam", and Sam's seeded task is reworded to "Chase the refund for the faulty
  kettle".
- Rendered facts quoted on the page: "6 open · 1 overdue"; bell accessible name
  "Needs attention: 2 — 1 overdue, 1 due today" (Sam's own due-today task excluded) and
  "— 4 new since you last looked" before the first open; panel footer "3 things the app has
  noticed →"; noticed items = BroadbandCo fee-free switch in 12 days, Vehicle A renewal in
  17 days, Vehicle A's £21.49 fill on Fri 23 Oct missing the mileage and the litres.
- Capture notes: capture at the default 1x scale — the wiki shows images narrower than its
  column at natural size, so 2x crops read zoomed-in beside the earlier pages (a first 2x pass
  was replaced after review); narrow images that do not span the column are fine. The count
  badge and the new dot share a corner, so bell shots are taken after one open (dot cleared)
  and a visibilitychange nudge; two bell buttons exist in the DOM (desktop bar + phone bar).

## Reference facts for the borrowing page (seed + fixture, today = 2026-10-24)

- Seed alone gives one person (Mum, we_owe, £1,000 borrowed into Alex's cash five days ago,
  expecting £1,000 on day 12 open-ended) — enough for one card and two ledger rows, so the
  captures ran against a disposable fixture (`/home/user/wiki-screenshots/fixture-borrowing.mts`,
  idempotent by counterparty; a server restart reseeds and discards it): Our son (they_owe, lent
  £75 on the 15th, £25 back on the 22nd → owed to us £50.00), The neighbour (we_owe, a £40 borrow
  voided "recorded twice"), Dave and Maggie (we_owe, no movements, £500 on day 13 until
  2027-02-11 inclusive) and Sam's brother (they_owe, £60 lent and repaid → Nothing owing).
- Rendered facts quoted on the page: ledger rows 2026-11-13 Dave and 2026-11-12 Mum as expected
  — not recorded yet; 2026-10-23 Sam's brother +£60.00 → £0.00; 2026-10-22 Our son +£25.00 →
  £50.00 (owed); 2026-10-21 The neighbour voided; 2026-10-19 Mum +£1,000.00 → −£1,000.00;
  2026-10-18 −£60.00 → £60.00 (owed); 2026-10-15 −£75.00 → £75.00 (owed). Open row panel:
  "Borrowed from Mum", "Came in as cash to Alex's cash.", "No note.", "Show Alex's cash around
  2026-10-19". Horizon (window looked ahead to 2026-11-20): "Expected money in (1 income + 2
  expected support) · £3,950.00" with ≈£1,000.00 and ≈£500.00 tagged expected — never received.
  Home line: "Owe others £1,000.00 (borrowed, not income) · Owed to us £50.00".
