# Release notes — v0.30.0 — A more dimensional, theme-aware interface

## What changed

The interface now has a little more depth without turning the household finance screens into a glossy dashboard:

- A faint, theme-aware colour wash gives the page canvas more atmosphere.
- The household-total card on the phone home and Overview has a soft accent gradient, a clearer figure hierarchy and more elevation.
- Shared card and sticky-header shadows are more legible, including in dark themes; the shadow colours are derived from the active theme rather than fixed black.
- The home-page destination cards lift slightly on hover-capable devices. That motion is disabled when the device requests reduced motion, and the links have a clear keyboard-focus ring.
- Existing 28 light/dark themes continue to supply the appearance. No palette was added, and no financial status or meaning relies on a gradient.

There are no data, calculation, navigation or workflow changes.

## Schema and data

No schema change or migration. No data conversion, new dependency or backup-format change is required.

## Verification

- `npm test` — **586 passed** across 139 suites.
- `npm run typecheck` — passed.
- `npm run format:check` — passed.
- `npm run themes:check` — passed; generated theme files remain current.
- `npm run build` — passed; generated `next-env.d.ts` restored after the build.
- `npm audit --omit=dev` — zero production vulnerabilities.
- Playwright via `docs/SANDBOX.md` entry 8 — **113 passed** across every project, including the new light/dark assertion for the themed Overview feature card.
- Pull-request CI and the release-image upgrade verification remain to run through GitHub before merge and publish.

## What to do

In Unraid, **take a backup, then Force Update**. The version badge should read `v0.30.0 · pre-release`.

Release notes document: [`docs/RELEASE_NOTES_v0.30.0.md`](RELEASE_NOTES_v0.30.0.md).
