# Release notes — v1.44.1 — Document uploads post to their own address

**Stable release.** This build moves `latest` and is marked Latest on GitHub.

## What went wrong

A household could not attach its four-page EDF energy bill to the purchase: the upload came back
**403** with Cloudflare's headers on it (`server: cloudflare`, a `cf-ray`, `x-frame-options:
SAMEORIGIN` — not the app's own `DENY`, which the request never reached). The app was not refusing
anything: its upload action only ever answers with a sentence, and no route in the app returns 403
for an upload.

Narrowing it took a handful of tests, and each one mattered:

| Test | Result |
| --- | --- |
| A JPEG receipt | fine |
| A 1 MB JPEG | fine |
| Another random PDF | fine |
| The EDF bill, 160 KB | **403** |
| Printing **page 1** of the bill to a new PDF | fine |
| Printing **two pages** of the same bill | **403** |

So the decision was made on the **request body** — not the file type, the file name, the size, the
session or the machine. That is Cloudflare's OWASP Core Ruleset scoring multipart content: a real
bill's PDF byte sequences and text accumulate enough signature matches to cross the anomaly-score
threshold (`949110: Inbound Anomaly Score Exceeded`), while one page does not.

## Why this is a code change and not just a WAF setting

Every form in the app posts back to the page it sits on, so the upload was a **`POST /purchases`** —
the same path the till saves a purchase to. A firewall exception there would have to exempt ordinary
purchase saves too, and the blunt alternative (dropping the zone's paranoia level) weakens every page
to fix one button.

## What changed

- **`POST /api/attachments`** — the document upload now has an address nothing else uses. A household
  can exempt exactly that path (`method POST` + `path /api/attachments`) and leave every other rule
  and every purchase save alone.
- **One pipeline, two front doors.** Reading the form moved into a shared module that both the new
  route and the existing server action call; `storeAttachment` still sniffs the bytes (PNG/JPEG/PDF,
  never the file name), enforces the **10 MB** per-file limit, writes the file, records the row and the
  audit entry. The action stays as the **no-JavaScript fallback**, accepting exactly the same form.
- **A block is now named as a block.** The route always answers JSON in the app's own action-state
  shape, so the form can tell an app refusal from an HTML block page and says *"Something in front of
  the app refused that upload (403). The app never saw the file"* instead of surfacing an unhandled
  React error. A declared body over ~11 MB is refused before it is read.

## What does not change

No schema, migration, data, storage-path, backup-format or authentication change. Document storage,
naming, renaming, removal, the viewer, the PDF reader, the Documents search and every other form are
untouched — and the same-origin and household-context guards now apply to the upload route as they do
to every other mutating route.

## Upgrading

Image `ghcr.io/dougalbob/simple-finance-multi-household:v1.44.1` (stable also moves `latest`), appdata
`/mnt/user/appdata/simple-finance-multi-household`, host port **3009**. Never the original installation
or port 3007. There is no migration to apply.

## If your zone still blocks the upload

Add one Cloudflare WAF rule — **Skip** → *Managed rules*, matched on
`http.request.method eq "POST" and http.request.uri.path eq "/api/attachments"` — and leave the rest of
the zone alone. The address now exists precisely so that exception can be that narrow.
