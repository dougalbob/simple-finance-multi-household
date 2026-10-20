# Release notes — v1.30.0 — Purchase receipts in the All Transactions "Correct it" panel

**Stable release**, moving `latest` and GitHub's Latest release. The badge reads
**`v1.30.0 · stable`**. Answers GitHub issue #83 (decision 242), reviewed and approved in
the Arena preview.

## What changed

- **All Transactions — purchase receipt block in the inline "Correct it" panel (#83).**
  Selecting the supplier name on any purchase row (`PUR`, `DD` or `SO`) on `/transactions`
  opens the inline panel with **Correct it** and **Void it**. That **Correct it** column now
  includes the exact receipt attachment block (`AttachmentForm`) from the Purchases page:
  - **Add attachment:** the single-control **Attach receipt (receipt or invoice file)**
    picker uploads a PNG, JPEG or PDF (up to 10 MB, content-sniffed) straight to the
    purchase without leaving All Transactions.
  - **View existing attachment:** clicking any attached receipt chip opens the in-app
    `AttachmentViewer` modal (with zoom/PDF rendering, Share/Open in PDF app and Download),
    keeping your place and scroll position on All Transactions.
  - **Remove attachment:** the two-step **Remove** → **Confirm remove** / **Cancel** flow
    marks the receipt deleted, records the `attachment.delete` audit entry on the purchase
    and unlinks the file, updating the open All Transactions panel in place.
- **Batched receipt projection and in-place revalidation.** `listPotActivity` loads stored
  receipts for all purchases in the window in a single query
  (`listStoredPurchaseAttachments`), and `purchaseActivityRow` loads them for a pinned
  purchase, so live and pinned rows carry the same `attachments` list. Uploading or
  removing a receipt now revalidates `/transactions` alongside `/purchases`, `/overview`,
  `/suppliers` and `/income`.

## Data caveats and who is affected

**No schema change, no migration and no backup-format change.** Receipts attached or
removed from All Transactions use the existing `attachments` table, household documents
directory (`/data/households/<id>/documents/`) and audit trail (`attachment.create` /
`attachment.delete`), so any receipt added or removed on `/transactions` is immediately
reflected on `/purchases` and `/suppliers` too.

## Validation evidence

- Unit suite: **1,089/1,089 across 257 suites** (new unit and wiring tests in
  `tests/purchase-activity.test.ts` pin `listStoredPurchaseAttachments`, live and pinned
  row agreement, `AttachmentForm` rendering and `/transactions` revalidation);
  `format:check`, `typecheck` and the production build pass.
- Browser suite: **12/12 in `e2e/transactions.spec.ts` and 5/5 in `e2e/attachments.spec.ts`**
  — including a new end-to-end journey that opens a purchase in place on `/transactions`,
  attaches a receipt, views it in the modal dialog, cancels a removal, confirms removal, and
  voids the test purchase.
- Required PR and `main` CI (`gates`, `browser`, `docker` including container and upgrade
  smoke), then Publish and registry-tag verification, must pass before this release is
  declared published.

## Unraid update

1. **Take a backup first** from Settings.
2. Force Update the existing multi-household container using
   `ghcr.io/dougalbob/simple-finance-multi-household:latest` (or pin `:v1.30.0`).
3. Confirm **`v1.30.0 · stable`**, then open **All Transactions** (`/transactions`), click
   any purchase's supplier name to open **Correct it**, and verify you can attach, view and
   remove a receipt in place.

Keep appdata `/mnt/user/appdata/simple-finance-multi-household` mounted at `/data` and
host port **3009** mapped to container **3000**. Do not change to the original
`simple-finance` image or appdata. Existing backups remain valid. No new setup or
migration step is required from you.
