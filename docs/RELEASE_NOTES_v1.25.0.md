# Release notes — v1.25.0 — Nothing owing, and line items that open and close where you were

**Stable release (`v1.25.0`)**, moving **`latest`** and GitHub's **Latest** release. It answers
**GitHub issue #68** — a set of small annoyances on the **Borrowing** and **Insights** pages, all
about the app telling the truth in plain words and about the reader keeping their place:

- On **Borrowing**, an arrangement that owes nothing now says **"Nothing owing"** (not the
  legal-sounding "Settled"), and its **repayment** action is **greyed out** — there is nothing to
  repay, so the offer is no longer made.
- The **ledger** is **newest first** by default, shows **only the next** "expected — not yet
  recorded" row instead of three, and **keeps your scroll position** when you change the order or
  the person filter.
- On **Insights**, a category's **line items open immediately below the row you clicked**, and
  closing them puts you **back exactly where you started** — the top of the page for a month total,
  the row itself for a category, the person's card for a By-person figure, and the vehicle's card
  (just below the menu) for a vehicle figure. A **£0.00** figure is greyed out and opens nothing.

The version badge should read **`v1.25.0 · stable`**.

## What changed

### Borrowing — "Nothing owing", and nothing to repay

- **Plain words on the card and in the ledger:** an arrangement whose balance has been brought to
  zero (or below) reads **"Nothing owing"** on the person's summary card and in the ledger's status
  chip. A balance below zero — the household is ahead — is still "Nothing owing": there is nothing
  left to repay. A loan with **no movements yet** still reads "Awaiting first payment" / "Awaiting
  first loan", so an arrangement that has never started is never mistaken for a finished one.
- **The repayment action is greyed out while nothing is owed:** it is drawn as a muted,
  `aria-disabled` element rather than a live button, so it is skipped by the keyboard and screen
  readers instead of inviting an action the server would refuse. The same word appears in the
  guide, so the app never contradicts itself.

### Borrowing — the ledger is a history, and it keeps your place

- **Newest first by default:** the ledger opens with the most recent movement at the top.
  `?order=oldest` still asks for the old order, and the default is left out of the URL, so a plain
  `/borrowing` stays the short link.
- **Only the next expected row:** a plan on a cadence used to print three identical "expected — not
  recorded yet" rows. It now prints **one** — the next one. The plan itself is untouched: every
  occurrence still projects into the money views (the estimate, the horizon, the `EXP<` rows on All
  Transactions), and the person's card still shows the plan in full.
- **The reader stays in place:** the sort-order and person-filter links are soft navigations
  (`scroll={false}`), so changing the order no longer throws you back to the top of the page.

### Insights — the line items open and close where you were

- **A category opens its line items in the table, immediately below the category line you clicked**
  (a full-width row inside the same table) instead of below the whole card. On a phone the drill is
  pinned to the visible width, so it stays on screen without making the page scroll sideways.
- **Closing returns you to where you started:**
  - a **month total** closes to the **top of the page**, with the month totals showing again;
  - a **category** closes to **its own row**;
  - a **By-person** figure closes to **that person's card**;
  - a **vehicle** figure closes to **that vehicle's card**, whose top then sits just below the
    sticky menu.
- **A £0.00 figure is greyed out** and opens nothing — there is no line items behind a zero.

## Schema and data caveats

- **No schema, migration or backup-format change.** This release is presentation, copy and
  navigation only: no table, column, migration or backup archive format changes, so an existing
  household database needs no upgrade and existing backups stay valid.
- **No recorded data is rewritten.** The "Nothing owing" wording is derived from the movements
  already stored; the ledger's order and the Insights anchors are view state, not data.

## Who is affected and what to do

- **Every household** sees the new "Nothing owing" wording on Borrowing where it used to say
  "Settled", and the greyed-out repayment action where nothing is owed.
- **Nothing to do.** The ledger now opens newest first; **"Oldest first"** is one click away on the
  same page if you prefer the old order.
- Existing links keep working: `?order=oldest` and `?who=…` behave as before, and the Insights
  drill links (`?show=m:…`, `?show=p:…`, `?show=v:…`) still open the same panels, now with a
  closing link that returns you to the right place.

## Validation evidence

- **Full test suite passes:** 1,012/1,012 tests across 233 suites (`npm test`).
- **Typecheck and format:** `npm run typecheck` and `npm run format:check` are clean.
- **Production build:** `npm run build` succeeds.
- **Browser suite (Playwright, Chromium):**
  - `e2e/borrowing.spec.ts` — 5/5, including the two new issue-#68 journeys: the ledger is newest
    first, shows only the next expected row and keeps the reader's scroll position when the order
    changes; and an arrangement that owes nothing says "Nothing owing" with its repayment greyed
    out.
  - `e2e/debt-lifecycle.spec.ts` — 8/8, including the honest-status journey: awaiting vs nothing
    owing, the greyed repayment, and the overpayment block.
  - `e2e/insights.spec.ts` — 7/7, including the four new issue-#68 journeys: the month close
    returning to the top, the category drill opening below its own row and closing onto it, the
    vehicle close landing just below the menu, and the greyed £0.00.

## Deployment

- **Image:** `ghcr.io/dougalbob/simple-finance-multi-household` only — tags `v1.25.0`, `latest` and
  `sha-<short>`, all to one verified digest. Never pull from `ghcr.io/dougalbob/simple-finance`.
- **Unraid:** update the container image to `:latest` (or pin `:v1.25.0`). The template's data root
  is `/mnt/user/appdata/simple-finance-multi-household`, host port **3009** → container port
  **3000**, bridge networking. Do not point it at the original appdata path or the original image.
- **Backups:** no change to the backup format; existing backups restore as before.
