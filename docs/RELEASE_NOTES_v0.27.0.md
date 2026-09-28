# Release notes — v0.27.0 — closable documents and automatic split remainder

## For the household

- Receipts, payslips and supplier documents now open inside the app with their own **Close** button.
  Closing keeps your page and scroll position — no need to exit the installed phone app. The viewer
  shows the filename and size, offers Download, and offers Share where the device supports file sharing.
  PDFs use the browser's preview; Download/Share remains available when it cannot display one.
- Split a supermarket bill without typing the total twice: £100 total, £80 on Line 2 leaves £20 on
  Line 1 automatically. Add another £10 split and Line 1 becomes £10. Editing Line 1 yourself takes
  control until the next fresh entry. Too much allocated never makes Line 1 negative; a warning asks
  you to adjust, and Save still requires positive lines adding up exactly.

## Upgrade

No migration or configuration change. Take a backup in Settings, then Force Update in Unraid.
Documents remain authenticated and private, with no offline document cache. Printing remains through
native PDF tools or the downloaded file. Actual iOS preview/share behaviour should be road-tested;
phone-sized Chromium tests are not a substitute for an installed iOS PWA.

## Engineering

Decision 177; SPEC §15.1 and §23.2. Unit coverage for integer-pence remainder calculation and draft
edge cases; browser coverage for phone/desktop remainder/takeover, document Close/Escape/focus/scroll,
image/PDF preview branches, uncached API and failed loads. Existing upload/removal/audit flow retained.
Version 0.27.0 is updated in package metadata, APP_VERSION and the Unraid template.
