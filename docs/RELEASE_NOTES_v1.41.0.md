# Release notes — v1.41.0 — Friendly document names and the app-wide document search

> **Erratum (corrected in v1.41.1).** This release shipped the friendly-label work and the
> document-search library, but the **Documents page itself (`/documents`) was missing from the
> build** — the menu item opened Next's 404. The friendly-label features below all worked; only the
> search page did not exist. v1.41.1 adds the page, its browser tests and a regression guard that
> fails CI if any menu link ever points at a route without a page again. See
> [RELEASE_NOTES_v1.41.1.md](RELEASE_NOTES_v1.41.1.md).

**Stable feature release**, moving `latest` and GitHub's Latest release. The badge reads
**`v1.41.0 · stable`**. Answers the household's report that a photographed vehicle MOT arrives as
`IMG_4821.jpg` and is impossible to find later.

## What changed

- **A friendly name for every document.** Each attachment can carry an optional label — the
  household's own display name — set in an optional field beside the picker at upload, or edited
  later from the chip's inline **Rename** control. The label is what the chip and the viewer header
  show; the stored file name, the download name and the `Content-Disposition` name are never
  changed, and a blank label means "show the file name". Renaming is cosmetic and deliberately not
  audited: the document's identity — its file name and storage key — is unchanged, and those stay
  in the store and delete entries.
- **An app-wide Documents search.** A new **Documents** page (in the menu beside Suppliers) lists
  every stored attachment in the household and searches it in one place. The box reads the friendly
  label, the original file name **and** the owning record's context together, using the same
  matching rules as the Purchases search: case and whitespace are normalised and every
  whitespace-separated word must appear somewhere, in any order. So `vehicle mot` finds a supplier
  document even when the file is `IMG_4821.jpg`.
- **Each result lands where the document lives.** A result shows the document's name, size and a
  context line — `Purchase · supplier · date · category`, `Income · source · date` or
  `Supplier · name` — and opens the page where it appears (`/purchases`, `/income` or
  `/suppliers`) with `?attachment=<id>`, which scrolls to and briefly rings that document. The
  query is debounced and lives in the URL (`?q=`), so a search is shareable.
- **The same pipeline, the same rules.** Labelling goes through the existing upload action; the
  search is server-side, scoped to the verified household, matches `stored` attachments only and is
  capped at 100 results.

## Data and upgrade notes

**Dependency maintenance.** `zod` moves to `^4.6.7` to clear a high-severity advisory
(`GHSA-mrhx-c7xc-m3w5`) that otherwise fails the CI audit step. It is a patch bump; no schema or
behaviour change.

Migration **`0021_attachment_labels.sql`** adds a nullable `label` column to `attachments`; existing
rows simply show their file name. There is **no change to authentication, household separation,
storage paths, the backup format or the orphan report** — a label is database metadata carried by
the full SQLite snapshot. Back up each household and the Admin registry before updating, as usual.

## Validation evidence

- `npm test`: **1,232/1,232 tests across 280 suites**; typecheck, Prettier, theme and production
  build checks pass. **This claim was wrong for the route: the build did not emit `/documents` in
  v1.41.0 — the page file was absent — and no test followed the menu link, so CI stayed green.
  Corrected by v1.41.1.**
- New focused suites cover label normalisation, storing and renaming (including clearing and an
  unknown id), and the search's matching, ranking and owner-context join.
- The required PR checks remain `gates`, `browser` and `docker`, followed by main CI and the tagged
  Publish workflow. Publication is not complete until those checks and the stable image/release
  verification pass.

## Unraid update

1. Back up first: download each household's backup and take the Admin registry backup.
2. Update only `ghcr.io/dougalbob/simple-finance-multi-household` to **`:v1.41.0`** (or **`:latest`**
   after publication). Confirm the app badge reads **`v1.41.0 · stable`**.
3. Keep appdata **`/mnt/user/appdata/simple-finance-multi-household`** mounted at **`/data`**, and
   host port **3009** mapped to container port **3000**. Do not switch to the original
   single-household image, appdata or port **3007**.
4. Open **Documents** and search for a document by its friendly name, its file name, or the record
   it belongs to; open a result to land on the page that shows it. Rename a document from its chip
   on Purchases, Income or Suppliers. **On v1.41.0 the Documents menu item 404s — update to
   v1.41.1 before this step; the rename step works on both versions.**
