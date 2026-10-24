# Release notes — v1.41.1 — The Documents page, actually shipped

**Stable patch release**, moving `latest` and GitHub's Latest release. The badge reads
**`v1.41.1 · stable`**. It fixes the v1.41.0 defect where the **Documents** menu item opened Next's
404 page ("That page is not here") instead of the promised search.

## Why this release exists

v1.41.0 shipped the friendly-label work, the search library
(`src/lib/records/attachment-search.ts`) and the search box
(`src/components/document-search-form.tsx`), but the page that was meant to render them —
`src/app/documents/page.tsx` — was never added to the tree. The menu (desktop bar and phone
drawer) linked to `/documents`, so every tap landed on the 404 page. CI stayed green because no
test followed a menu link and there was no Documents browser spec. The friendly-label features
(renaming a document from its chip) worked throughout; only the search page was missing.

## What changed

- **The Documents page now exists.** `/documents` is a `force-dynamic` server page built on the
  same household-context gate as every other finance page. The box debounces into `?q=` (so a
  search is shareable), and each result shows the document's friendly name (or file name), the
  original file name when a label is set, its size, and its owning-record context line —
  `Purchase · supplier · date · category`, `Income · source · date` or `Supplier · name`. Opening
  a result lands on `/purchases`, `/income` or `/suppliers` with `?attachment=<id>`, which already
  scrolled to and rang the document's chip on those pages in v1.41.0. Results stay
  household-scoped through the verified request context, include `stored` attachments only and are
  capped at 100.
- **A regression guard so a menu link can never 404 again.** `tests/site-nav-routes.test.ts` reads
  every `href` rendered by `src/components/site-nav.tsx` (desktop bar and drawer together) and
  fails unless each one resolves to a real `src/app/**/page.tsx`; it also pins the Documents page's
  wiring to the search form, the household-scoped `searchAttachments` call and `force-dynamic`.
- **A browser spec for the route.** `e2e/documents.spec.ts` opens Documents from both the desktop
  menu and the phone drawer (asserting a 200 and the page heading), records a purchase with a
  fictional receipt, searches it from the Documents box, follows the result and asserts the
  purchase page lands on the rung chip, and covers the no-match message and Clear the search.
- **One shared size formatter.** The chip's byte/KB/MB label moves to the dependency-free
  `src/lib/format.ts` (`formatAttachmentSize`), now used by both the chip and the Documents page.
  The displayed labels are unchanged; the move keeps Node-only modules out of the client bundle.
- **A `.gitignore` trap removed.** The runtime-data rule was a bare `documents/` pattern that also
  ignored the new `src/app/documents/` directory, so the page could exist on disk yet be skipped by
  `git add`. It is now root-anchored (`/documents/`; real household document directories live under
  the already-ignored `data/` and `.e2e-data/`), and the nav-route guard fails if the bare pattern
  returns.
- Documentation corrected: the v1.41.0 notes and `docs/SPEC.md` §23.5 now state honestly that the
  route was missing in v1.41.0 and is delivered by this release.

## Data and upgrade notes

No schema, migration, authentication, household-separation, storage-path, backup-format or
dependency change. Migration `0021_attachment_labels.sql` was applied with v1.41.0 and is simply
present; a household's database and `documents/` directory are touched only by the reads the new
page makes. Back up each household and the Admin registry before updating, as usual.

## Validation evidence

- `npm test`: **1,236/1,236 tests across 281 suites** (the new nav-route guard adds four tests
  and one suite); typecheck, Prettier and the production build pass, and the build now lists the
  `ƒ /documents` route.
- New focused coverage: `tests/site-nav-routes.test.ts` (nav-to-page resolution and Documents
  wiring) and `e2e/documents.spec.ts` (both navigation surfaces, search, deep link, no-match).
- The required PR checks remain `gates`, `browser` and `docker`, followed by main CI and the tagged
  Publish workflow. Publication is not complete until those checks and the stable image/release
  verification pass.

## Unraid update

1. Back up first: download each household's backup and take the Admin registry backup.
2. Update only `ghcr.io/dougalbob/simple-finance-multi-household` to **`:v1.41.1`** (or
   **`:latest`** after publication). Confirm the app badge reads **`v1.41.1 · stable`**.
3. Keep appdata **`/mnt/user/appdata/simple-finance-multi-household`** mounted at **`/data`**, and
   host port **3009** mapped to container port **3000**. Do not switch to the original
   single-household image, appdata or port **3007**.
4. Open **Documents** from the menu — the page loads instead of the 404 — search for a document by
   its friendly name, its file name, or the record it belongs to, and open a result to land on the
   page that shows it.
