# Release notes — v1.35.0 — Explicit partial refunds and linked refund signposting

**Stable feature release**, moving `latest` and GitHub's Latest release. The badge reads
**`v1.35.0 · stable`**. Answers GitHub issue #96, reviewed and approved in the Arena preview,
for full household testing on Unraid. See decisions 252–253 and SPEC §9.5 and §15.3.

## What changed

- **A refund amount is entered explicitly.** The refund form shows each original purchase line
  with a blank amount box and only **Originally £X** as its placeholder. It says: “For any line
  item where there has been a refund, enter the **refunded** amount (not the amount that remains
  after the refund is applied). Leave any line with no refund blank.” Each box is labelled
  **Enter the amount _to be refunded_**.
- **Blank means no refund.** A partial refund can now be recorded on one line of a multi-line
  purchase without inventing £0 lines or understanding line removal. Untouched lines are omitted;
  submitting every box blank records nothing and asks for an amount on at least one line.
- **Refund lines identify themselves but cannot be re-filed.** In both refund creation and refund
  correction, each parent/child category and spent-for target is a read-only heading inherited
  from the original purchase — for example, **Groceries / Weekly Shop (household)**. There are no
  **Spent for**, **Category** or **Which** controls, and no **Add a line** or remove-line control.
- **Correcting a refund uses a positive amount.** Its editor shows **Amount refunded** (`30.00`,
  not `-30.00`) and **Save refund**. The server enforces the same rule as the form: a refund edit
  preserves its line count, order, categories and targets exactly. A refund filed against the
  wrong part of a purchase is voided and recorded again rather than silently reallocated.
- **Both linked records signpost each other on Purchases.** An original shows **£X refunded** or
  **Fully refunded**, the amount still refundable and each linked refund record. Reopening its
  Refund form warns that a refund is already recorded before the same money can be entered again;
  a fully refunded purchase offers no further refund. A refund row reads **Refund · for #id** and
  links back to its original purchase.
- **All Transactions carries the same warning.** A purchase row and its opened panel show live
  refunded state, while a `REF` row names **for purchase #id · date · amount** and links to the
  **Original purchase #id**.
- As the related line-editor repair, an ordinary purchase edit can now remove a split line rather
  than leaving an impossible £0 line; refund forms deliberately do not use that control.

## Data and upgrade notes

There is **no schema migration, backup-format change or data rewrite**. Existing purchases and
refunds remain as recorded. Refund corrections are deliberately narrower from this release:
amounts, date and note can be corrected, while category and spent-for identity stay with the
original purchase line.

## Validation evidence

- `npm run format:check`, `npm run typecheck`, `npm run themes:check`, `npm test`
  (**1,143/1,143 across 268 suites**, including live/voided refund summaries, original-purchase
  links, subset refunds and the refund-edit line-identity lock) and `npm run build` pass;
  `npm audit --omit=dev` reports 0 vulnerabilities.
- Browser: the local Playwright `transactions` refund journeys passed **2/2**, covering a full
  refund and an explicit partial refund — blank lines omitted, all-blank submission refused,
  already-refunded warnings, Purchases and All Transactions signposting, and correcting the
  refund through the locked editor.
- The household approved the corrected refund and refund-correction forms in a fresh Arena
  preview. The required PR checks are `gates`, `browser` and `docker` (including container and
  applicable upgrade smoke). Publication must not proceed unless they pass.

## Unraid update

1. Take a household backup from Settings before updating.
2. Install or update to `ghcr.io/dougalbob/simple-finance-multi-household:v1.35.0` (or
   `:latest` after publication). Confirm the app badge reads **`v1.35.0 · stable`**.
3. On **Purchases**, open a multi-line purchase and choose **Refund**: enter a refunded amount on
   one line, leave another blank, and record it. Confirm the original shows the amount refunded
   and still refundable, then open the linked refund and correct its **Amount refunded** using a
   positive figure. Its category and spent-for heading should remain read-only.
4. Keep the multi-household appdata `/mnt/user/appdata/simple-finance-multi-household` mounted at
   `/data` and host port **3009** mapped to container **3000**. Do not change to the original
   `simple-finance` image, appdata or route.
