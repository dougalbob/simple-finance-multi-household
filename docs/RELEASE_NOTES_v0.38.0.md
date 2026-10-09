# Release notes — v0.38.0 — Annual vehicle payments as ÷ 12 and PDFs read in the app

## What changed

- **An annual car payment is spread over the months it covers.** A yearly direct debit against a vehicle, such as car insurance, now counts as one twelfth in each month it covers, starting in the month it is paid. Insights > Vehicle running costs shows the spread rows marked "(annual ÷ 12)", with a footnote, and Overview has a one-line note. A £600 premium shows as £50 a month. Once a full year of payments exists, the rolling 12-month total is exactly one premium. Monthly payments, purchases, the month comparison, Horizon and Charts still use the payment date.
- **Road tax follows the same rule.** An annual road-tax payment against a vehicle is spread too. Road tax is paid monthly on both cars today, so nothing changes until an annual one is added.
- **PDF attachments open in the app.** On a phone the attachment viewer fills the screen and draws each page of a PDF in the app, using PDF.js. It works the same way on every device: pages are fitted to the width and scroll vertically. The footer holds **Open in PDF app**, which hands the file to a PDF app on the phone where the browser can share files, and **Download**, which always works.
- **The reader has limits.** Text cannot be selected or searched inside it, links and form fields are not active, and a font the PDF does not embed is drawn with a stand-in. **Open in PDF app** shows the file exactly as it is.

## Schema and data

None. No migration, data conversion or backup-format change. The annual spread is worked out when figures are read and is not stored. One new dependency, `pdfjs-dist` (Apache-2.0), is used only to draw PDF attachments in the viewer.

## Who is affected and what to do

- **Everyone:** nothing to configure. Open a PDF attachment on your phone and check that it displays, scrolls and opens in your PDF app.
- **Whoever pays an annual vehicle direct debit:** check that its recurring payment targets the vehicle (**Vehicle — [your car]** on the Recurring form) and that its start date reaches back far enough for the earlier years. A premium is spread only for the years that exist as purchases.

## Verification

- `npm test` — **723 passed**, 0 failed across 172 suites.
- `npm run typecheck`, `npm run format:check`, `npm run themes:check` and `npm run build` — passed.
- `npm audit --omit=dev` — 0 vulnerabilities.
- Browser acceptance (Playwright, headless Chromium) — the full suite of 119 tests passed locally. The attachments spec checks that a generated PDF page is drawn, that a three-page file gives three pages, and that an unreadable file shows a message with Download. The `insights` project checks the vehicle spread end to end.
- GitHub PR checks `gates`, `browser` (Playwright acceptance) and `docker` (image and upgrade smoke) are release-blocking and must all pass before merge.

Decisions recorded in [`docs/IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md): 190–193.

## What to do

In Unraid, **take a backup, then Force Update**. The version badge should read `v0.38.0 · pre-release`.

Release notes document: [`docs/RELEASE_NOTES_v0.38.0.md`](RELEASE_NOTES_v0.38.0.md).
