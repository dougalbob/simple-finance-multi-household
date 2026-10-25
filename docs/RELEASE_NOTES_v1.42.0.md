# Release notes — v1.42.0 — Renaming a document renames the file

**Stable feature release**, moving `latest` and GitHub's Latest release. The badge reads
**`v1.42.0 · stable`**. It answers GitHub issue #112: the v1.41.0/v1.41.1 **friendly name** did not
behave the way the household expected — pressing **Save** in the chip's inline editor often changed
nothing they could see, and the upload field asked for a "friendly name" that then never turned up
on the document.

## What changed

- **There is one name per document now, and it is the file name.** **Rename** edits the document's
  stored file name in place, so the chip, the viewer header, the download name, the
  `Content-Disposition` name and the **Documents** search all read the same thing. There is no
  second display name to fall out of step with it.
- **The friendly-name field is gone from the interface.** The upload form asks for the file and
  nothing else. The `label` column added by v1.41.0 stays in the schema, in existing rows and in
  every backup — **no migration, no data loss** — but the app neither writes, displays nor searches
  it any more, in case a second display name is wanted later.
- **The extension is kept on the name automatically**, which is the household's own suggestion:

  | You type | The document is saved as |
  | --- | --- |
  | `Vehicle MOT` (a PNG) | `Vehicle MOT.png` |
  | `Policy 2026` (a PDF) | `Policy 2026.pdf` |
  | `MOT.PDF` (a PDF) | `MOT.PDF` (left exactly as typed) |
  | `MOT.jpeg` (a JPEG) | `MOT.jpeg` (`.jpeg` is `.jpg`) |
  | `MOT.png` (a PDF) | `MOT.pdf` (the wrong extension is replaced, never doubled) |
  | `MOT 2026.v2` (a PDF) | `MOT 2026.v2.pdf` (`.v2` is part of the name) |

  The extension comes from the file's **content-sniffed type**, never from what was typed, so a PDF
  can never be saved as `.png`. Emptiness is refused with a message rather than stored.
- **Rename opens a proper little editor.** Pressing **Rename** opens a native disclosure holding the
  document's whole current name in a text box, a **Save** button and one short line — *the file's own
  extension is added if you leave it off*. The box arrives pre-filled with the whole name, so the
  thing to edit is right there and no long explanation has to sit on the chip (the household's point
  about mobile width). Save appears the moment Rename is pressed, which is the behaviour the issue
  asked for.
- **Renames are audited.** A rename writes an `attachment.rename` entry against the owning purchase,
  income record or supplier with both names and the unchanged storage key, so the record's History
  says what was renamed and when. (The v1.41.0 label was deliberately unaudited because it was
  cosmetic; a file name is not — it is what the download and the archive's manifest lines show.)
- **Uploads name the file after its real type too.** A PNG the camera calls `IMG_4821` is stored as
  `IMG_4821.png`, and a JPEG the phone calls `receipt.png` is stored — and downloads — as
  `receipt.jpg`. Names that already carry the right extension (`.jpg`, `.jpeg`, `.pdf`, any case) are
  kept exactly as they are.
- **The Documents search reads the new name immediately**, so renaming a photographed MOT to
  `Vehicle MOT 2026` is what makes `vehicle mot` find it.

## What did **not** change

- **No schema change and no migration.** Migration `0021_attachment_labels.sql` (v1.41.0) remains
  applied; its nullable `label` column is simply unused. Existing labels are preserved in the database
  and in every backup, and are no longer displayed — a document with a label now shows its file name.
- **Nothing about where the bytes live.** The storage key, the bytes, the sniffed MIME type, the
  size and the sha256 are untouched by a rename, so backups, restore, the orphan report, private
  serving and household separation cannot notice one. A name is never used to build a path.
- **No change** to authentication, household separation, the backup format or the release image
  target.

## Validation evidence

- `npm test`: **1,247/1,247 tests across 282 suites**; `npm run typecheck`, `npm run format:check`,
  the theme check and the production build pass.
- New focused suites (`tests/attachment-rename.test.ts`) pin the extension rules, the sanitiser, the
  200-character cap, the untouched key/bytes/sha256, the audit entry, the three outcomes
  (`renamed` / `unchanged` / `removed`) and two interface guards: the friendly-name field cannot
  reappear in the upload/rename forms or the Documents page, and the `label` column and its migration
  must stay (hidden, not dropped). `tests/attachment-search.test.ts` now proves the search reads the
  renamed file name and stops matching the old one.
- Exercised against the seeded dev server exactly as the browser posts it — the rename form is in the
  served HTML, so `name=Vehicle MOT 2026` was submitted as a real form POST: the row became
  `Vehicle MOT 2026.png`, the storage key and bytes were unchanged, `attachment.rename` appeared in
  the audit trail, and `/documents?q=vehicle mot` found it.
- `e2e/attachments.spec.ts` gains a browser spec: the friendly-name field is absent, Rename
  pre-fills the whole name, a name typed without an extension is saved with it, a wrong extension is
  replaced, the viewer's **Download** name follows, the name survives a reload, the Documents search
  finds it, and both renames appear in the purchase's History. The `browser` gate is evidenced by PR
  CI (this sandbox cannot install Playwright's browser binaries).

## Unraid update

1. Back up each household and the Admin registry first, as usual.
2. Update only `ghcr.io/dougalbob/simple-finance-multi-household` to **`:v1.42.0`** (or **`:latest`**
   after publication). Confirm the app badge reads **`v1.42.0 · stable`**.
3. Keep appdata **`/mnt/user/appdata/simple-finance-multi-household`** mounted at **`/data`**, and
   host port **3009** mapped to container port **3000**. Do not switch to the original
   single-household image, appdata or port **3007**.
4. On **Purchases**, **Income** or **Suppliers**, press **Rename** on a document, type just a name
   (`Vehicle MOT 2026`) and press **Save**: the chip, the viewer header and the download should all
   say `Vehicle MOT 2026.png`, and the record's History should show the rename. **Documents** should
   find it by the new name.

## Note for the household's own data

Nothing needs re-entering. If any document did manage to save a friendly name under v1.41.x, that
label is still in the database and the backups but is no longer displayed; renaming the document to
that name takes one press of **Rename**, and the old label is left untouched underneath.
