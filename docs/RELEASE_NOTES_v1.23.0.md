# Release notes — v1.23.0 — Swaps nested as one object in the boundary history

**Stable release (`v1.23.0`)**, moving **`latest`** and GitHub's **Latest** release. On **Accounts,
Pots & Checkpoints**, "Recent swaps & other money" now draws each swap as **one nested object** —
the money-in leg first, the money-out leg indented beneath it behind a pointer arrow on the alternate
row shade, then the pair's honest net beside **Void both legs** — with each leg carrying its own
**Edit** and **Void** that open inline beneath that leg. The "Recent swaps" list inside the **Swap
with someone outside** card is retired, so there is one place on the page to correct a swap, and the
redundant **Owed & owing** panel is removed (GitHub issue #65). The version badge should read
**`v1.23.0 · stable`**.

## What changed

### One nested object per swap, and one place to edit one (issue #65)

- **The legs are grouped.** The history panel is still one newest-first feed of boundary money, but
  the two legs of a swap are grouped by their exchange key into a single card:
  - the **in** leg on top — `Swap in £40.00 from Sam · into Alex's cash` — with its note, who
    entered it, `+£40.00`, and its own **Edit** and **Void**;
  - the nested **out** leg beneath it — `Swap out £40.00 to Sam · from Main account` — on the
    alternate row shade, indented under the same gutter and introduced by a small pointer arrow (a
    vertical leg joining a short horizontal leg ending in a right-pointing arrowhead, drawn as SVG
    so it renders identically everywhere);
  - a footer with the pair's badge and **Void both legs**.
- **The wording names the direction, the person and the pot.** `Swap in £40.00 from Sam · into
  Alex's cash` / `Swap out £40.00 to Sam · from Main account` replace the old single-line
  `Swap in £40.00 with Sam` style, so each leg says which way the money went and which pot it
  touched. Other money is worded the same way: `Received £25.00 from the neighbour · into Main
  account`, `Paid £18.00 to the school · from Main account`.
- **The pair's badge keeps the old list's honesty:** `net £0.00` in green when both legs are live and
  balanced; `legs differ · net +£2.50` in amber after one leg was corrected on its own;
  `one leg voided · net …` when one leg was voided alone; `voided` when both legs went. The net only
  ever counts live legs, so a half-voided pair reads the difference rather than pretending to
  balance.
- **One place to fix a swap.** The **"Recent swaps"** list inside the **Swap with someone outside**
  card is gone. Each leg's **Edit** (pot, amount, when, who, note) and **Void** (with a reason) open
  inline directly beneath that leg — the behaviour the retired list already had — and other-money
  rows in the same feed carry the same two controls. One panel is open at a time.
- **Links kept working.** The history panel carries `id="swap-history"`, and the pot cards'
  "Recent swaps involving …" links and All Transactions' "Open the swap list" secondary link now
  point at it. Each leg still keeps its `#external-{id}` anchor, so a deep link from All
  Transactions (`/pots?external={id}#external-{id}`) lands on the leg and pins its record to the top
  of the list with the "showing the record you linked to" note; a pinned swap leg brings its partner
  with it, so the nested object is always whole.

### The redundant "Owed & owing" panel is removed (issue #65)

- The signpost card that carried the running owed figures and an **Open Borrowing** link is gone
  from Accounts, Pots & Checkpoints, as asked. Borrowing is still reached from the menu, from the
  history panel's own "Borrowing" link, and from any old `/pots?external={id}` loan link (which
  redirects to `/borrowing?external={id}`) or `#debt-{id}` bookmark (forwarded client-side), so
  nothing bookmarked breaks. The guide's link label that named the old panel was updated with it.

### A note on the list's size

- Each swap now takes one place in the list but two rows of data, so the page fetches 60 boundary
  rows and draws at most 20 entries: the fetch window is deliberately wider than the list it feeds,
  so a pair can never be split by the limit. A pinned deep-linked record still appears even when it
  is older than that window.

## Existing data and migrations

- **No schema migration, backup-format change or `.env` change.** Nothing already recorded is
  rewritten; swap legs, other-money records, loans and debts are untouched in the database. This
  release is presentation and navigation only, so it is safe to update at any time.

## Who should update and what to do

1. Take a household backup in **Settings**, a registry backup in **Admin** (`/admin`), and a copy of
   `/mnt/user/appdata/simple-finance-multi-household/.env`.
2. In Unraid, set the container Repository to
   **`ghcr.io/dougalbob/simple-finance-multi-household:latest`**, or pin
   `ghcr.io/dougalbob/simple-finance-multi-household:v1.23.0`, then run **Force Update**.
3. Keep bridge networking, host port **3009** → container port **3000**, the existing Cloudflare
   route, and `/mnt/user/appdata/simple-finance-multi-household` → `/data` unchanged. Never point
   this container at `/mnt/user/appdata/simple-finance` or the original app's port 3007.
4. Confirm the badge reads **`v1.23.0 · stable`**, then open **Accounts, Pots & Checkpoints** and
   confirm each swap appears as one nested object with Edit and Void on both legs.

## Validation evidence

- The household reviewed the Arena preview and approved both judgement calls before release: the
  pointer arrow marks the nested (lower) leg so it doubles as the pair's indent marker, and each leg
  keeps its own Edit and Void with the pair-level **Void both legs** staying in the footer.
- Local gates: `prettier --check .`, `tsc --noEmit` and `npm run build` are clean. `npm test` passes
  **1010/1010 across 233 suites**, including the new `tests/external-history.test.ts` (grouping and
  ordering, the honest half-pair, deep-link pinning, all four badge states, the wording, and the
  fetch-to-draw ratio that protects a pair from the limit).
- Browser (Playwright via SANDBOX entry 8): `external` (**4/4**, rewritten as two journeys —
  record → nested object → inline edit of a leg → single-leg void → the pot-card link, and record →
  void both legs with one reason) and `borrowing` (**5/5**, with the pots-page test now asserting the
  signpost is gone) pass locally. The full local browser run's extra failures reproduce as the
  sandbox's mid-run web-server loss (SANDBOX entry 17) and pass when re-run in their own batch.
- The required `gates`, `browser` and `docker` checks, main CI and the tagged Publish workflow
  (upgrade smoke against `v1.22.0` and `v1.21.0`, and one-digest verification of `v1.23.0`,
  `latest` and `sha-<short>`) gate publication.
