# Release notes — v1.24.0 — Statement payee on purchases and Other money signposting

**Stable release (`v1.24.0`)**, moving **`latest`** and GitHub's **Latest** release. On **Purchases**,
purchases can now record an optional **Paid via / statement payee** alongside the merchant/supplier,
matching bank statement payee names (e.g. transfers to a friend for a shared meal, PayPal routes)
without polluting the commercial supplier directory. On **Accounts, Pots & Checkpoints** and
**Quick Entry**, "Other money in & out" gains explicit signposting so it is never confused with informal
borrowing or categorized budget spending. The version badge should read **`v1.24.0 · stable`**.

## What changed

### Paid via / Statement payee on Purchases (Option A)

- **Optional secondary routing on purchases:** Purchases now support a `paid_via` field (up to 120
  characters). This records who the money actually went to in your banking app (e.g. bank transfer to
  "James" for your share of a meal at "The Crown Inn", or payment through "PayPal") while preserving
  the real merchant/vendor ("The Crown Inn") and spending category ("Entertainment & Eating Out / Dining Out & Takeaways").
- **Clean supplier directory:** Counterparties like friends or payment intermediaries entered in
  "Paid via" are saved strictly as payment routing details on the purchase itself; they are never
  added to the `suppliers` table and do not create empty supplier cards, auto-suggest entries, or
  clutter contract renewal reviews.
- **Quick Entry:** Panel 1 now features a `+ Paid via` toggle button beside `+ Note`. Tapping it
  reveals the optional `Paid via / Bank payee (optional)` field with helpful placeholder guidance.
- **Activity & All Transactions:** Purchases recorded with a payee display clearly in the ledger:
  `The Crown Inn · via James` (or `via James` when no commercial supplier is specified).
- **Purchases page & In-place editing:** The Purchases table renders `· via <payee>` alongside the
  supplier link, and both the All Transactions in-place correction panel and the Purchases page editor
  allow viewing, correcting, or clearing the payee field at any time under version concurrency.

### Clear signposting for "Other money in & out"

- **Accounts, Pots & Checkpoints (`/pots`):** Updated the description to explicitly explain what
  miscellaneous boundary movements are for:
  > *"One-off cash or transfers outside your normal budget with no expectation of repayment (e.g. selling personal secondhand items like an old bike, or non-budgeted goodwill gifts)."*
  Added explicit directional links:
  > *"Not for loans or repayments (use [Borrowing](/borrowing)), and not for categorised household spending (use [Purchases](/purchases))."*
- **Quick Entry (`quick-entry.tsx`):** Updated the Move $\rightarrow$ **Other** tab subtitle with
  the same guidance:
  > *"One-off cash or transfers with no expectation of repayment — e.g. selling an old bike, or a non-budgeted gift. Not for loans (use Borrow & repay) or categorised spending (use Purchases)."*
- **Form Placeholders:** Updated the counterparty and note placeholders in `OtherMovementForm` to
  `e.g. buyer or friend` and `e.g. sold the old bike, gift to friend`.

## Schema and data caveats

- **Database migration `0019_purchase_paid_via.sql`:** Adds nullable text column `paid_via` to the
  `purchases` SQLite table. Existing databases upgrade automatically via the standard migration
  runner.
- **Backups:** Full backup and restore preserves the new `paid_via` column and verifies against the
  updated 20-entry migration journal.

## Validation evidence

- **Full test suite passes:** 1,012/1,012 tests pass across 233 suites.
- **Dedicated test coverage:** Integration tests cover creating purchases with `paidVia`, editing and
  clearing `paidVia`, rejecting oversized inputs (> 120 characters), asserting that `paidVia` does not
  create a supplier in the database, and verifying formatted ledger activity sources (`The Crown Inn · via James`, `via James`).
- **Production build & typecheck:** `tsc --noEmit` and `npm run build` pass cleanly with zero warnings or errors.
- **Audit clean:** `npm audit --omit=dev` reports 0 vulnerabilities.
