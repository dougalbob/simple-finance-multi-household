# Release notes — v1.36.0 — Date Range drop-downs and one search over supplier, category and notes

**Stable feature release**, moving `latest` and GitHub's Latest release. The badge reads
**`v1.36.0 · stable`**. Answers GitHub issue #98 and the Purchases filter follow-up the household
asked for in the same session, reviewed and approved in the Arena preview for full household
testing on Unraid. See decisions 254–255 and SPEC §15.3 and §15.3a.

## What changed

### All Transactions — one Range drop-down and a two-column search (issue #98)

- The three quick-pick links became one **Range** drop-down: **Last 30 days** (the default),
  **This month**, **Last Month**, **This Year** and **All**, in that order. **Since last
  checkpoint** is gone, as requested; checkpoint dividers still appear inside every other window.
- **Last Month** is calendar-exact (a leap February ends on the 29th) and every preset ends at
  today, because a record can never be dated in the future. **All** is a real window the page
  already understood, so balances, the page cap and every existing link keep working; its heading
  reads **All time to today** rather than printing the internal start date.
- The **From** and **To** dates stay editable. A hand-edited window puts the select on a
  **Custom dates** entry instead of mislabelling it as a preset; choosing a range applies it at
  once, while Show activity submits the dates as before.
- A new **search box** matches the **Supplier / transfer / loan** column and **Notes** together as
  you type: case and spacing are folded, and every whitespace-separated word must appear somewhere
  across those two columns, in any order. It is encoded in the URL as `q`, costs one history entry
  per search rather than one per word, and applies to the whole window **before** the 500-row cap —
  so the row count, the net and the hidden-row note all describe the matches, and an old purchase
  beyond the cap is still found. An empty result says **Nothing in this window matches “…”** and
  offers **Clear the search**.

### Purchases — the filter bar reworked (the follow-up)

- **Pot** and **Paid by** are removed from the filter form because the household never used them.
  **Supplier** and **Category** are replaced by one **Search supplier, category or notes** box: it
  reads the supplier's directory name **and** the optional bank payee printed beside it, the
  `Parent / Child` label of **every** allocation line (a split purchase is searched whole, retired
  categories included) and the record's note. The same word rules apply — case and spacing folded,
  every word required somewhere across those columns, in any order — and the search runs as you
  type (300 ms debounce, `?q=` through a replace so one search is one history entry and the scroll
  position stays put). It filters before the 500-row cap, so the heading
  **N entries matching “…”**: Total … describes the matches; a blank box applies no search and the
  no-match state offers **Clear the search** while keeping the rest of the window.
- Purchases now carries the **same Range drop-down** while keeping the editable **From/To** dates.
  Choosing a preset fills and applies the dates; a hand-edited window shows **Custom dates**; and
  **All** — this page's default — means no date filter at all, because this history starts where it
  starts rather than at a sentinel date.
- A link can still arrive carrying a category (a chart bar, Overview's Groceries link), a pot (All
  Transactions, a refund's own record), a supplier or a payer. Rather than filtering invisibly, the
  page now lists each filter it no longer has a control for above the results as an
  **Also filtering** chip — `Pot: …`, `Category: Parent / Child`, `Supplier: …`, `Paid by: …` — and
  clicking a chip removes only that filter, keeping the dates, the search and everything else.
- The filter bar keeps its phone behaviour: **Show filters** collapses it, it starts open when any
  filter is already applied, the Range takes a full phone row and the two dates share the next one.

## Data and upgrade notes

There is **no schema migration, backup-format change or data rewrite**. Existing records, saved
links and bookmarks keep working: the Purchases page still understands `potId`, `categoryId`,
`supplierId` and `paidByPersonId` in its URL, and All Transactions keeps `from`, `to`, `potId` and
now `q`.

## Validation evidence

- `npm run format:check`, `npm run typecheck`, `npm run themes:check`, `npm test`
  (**1,167/1,167 across 273 suites**, including the new date-preset calendar edges, the
  supplier/payee/category/note matcher cases and the projection case proving a search runs before
  the 500-row cap), `npm run build` and `npm audit --omit=dev` (0 vulnerabilities) pass.
- Browser: the local Playwright suites passed — the new `purchases-filters` project **3/3** (the
  five Range options with the removed drop-downs absent, preset ↔ dates ↔ URL including Custom
  dates and All, searches by supplier, by two columns, by a category word and by a note alone, the
  no-match state keeping the window, and the linked-filter chip clearing only its own parameter),
  `desktop` + `mobile` together with it **47/47**, `transactions` **14/14** (issue #98's journey
  including each range's own `from`/`to`) and `charts` **15/15**.
- The household approved both pages in a fresh Arena preview. The required PR checks are `gates`,
  `browser` and `docker` (including container and applicable upgrade smoke). Publication must not
  proceed unless they pass.

## Unraid update

1. Take a household backup from Settings before updating.
2. Install or update to `ghcr.io/dougalbob/simple-finance-multi-household:v1.36.0` (or `:latest`
   after publication). Confirm the app badge reads **`v1.36.0 · stable`**.
3. On **Purchases**, choose **Last Month** from **Range** and confirm the From/To dates fill
   themselves; type a supplier name into **Search supplier, category or notes** and confirm the
   heading counts the matches. Then open a Groceries link from **Overview** and confirm the
   **Category** chip clears only that filter.
4. On **All Transactions**, cycle the five **Range** options and search for a supplier and a word
   from the notes; confirm the row count and net follow the matches.
5. Keep the multi-household appdata `/mnt/user/appdata/simple-finance-multi-household` mounted at
   `/data` and host port **3009** mapped to container **3000**. Do not change to the original
   `simple-finance` image, appdata or route.
