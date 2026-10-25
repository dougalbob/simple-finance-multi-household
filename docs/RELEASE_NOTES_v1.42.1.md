# Release notes — v1.42.1 — The app icon ships with every release

**Stable release-infrastructure patch**, moving `latest` and GitHub's Latest release. The badge reads
**`v1.42.1 · stable`**. It answers GitHub issue #115: the repository's app icon now appears as a
versioned, downloadable asset on every GitHub release instead of existing only inside the source tag.

## What changed

- **Every stable release and prerelease carries the app icon.** The GitHub release asset is named
  **`simple-finance-multi-household-icon.png`**, a clear and stable download name. It is the canonical
  512 × 512 image already used by the Unraid template, not a newly generated or separately maintained
  copy.
- **The asset comes from the release tag.** Publish checks out the exact tag and uploads
  `docs/assets/simple-finance-icon.png` from that checkout. It never fetches the moving `main` branch,
  so the icon's bytes are versioned with the image and release notes they accompany.
- **Publish validates the PNG before releasing.** A dependency-free Node validator checks the PNG
  signature and framing, every chunk checksum, the IHDR/IEND structure, exact 512 × 512 dimensions,
  colour/depth metadata, compressed image data, decoded scanline lengths and row filters. The v1.42.1
  source icon's SHA-256 is `b8c861289ef16d91119997b2af19e130c82186e2c282c0e1c11bf8a3b03de93a`.
- **A Publish rerun is safe and convergent.** If a run created the GitHub release but stopped before
  uploading the icon, the rerun adds the missing asset. If the named asset already exists, Publish
  downloads it and requires an exact byte-for-byte match. It refuses to overwrite mismatched
  published bytes or proceed with ambiguous duplicates.
- **The workflow records what it verified.** The release summary includes the stable asset name and
  SHA-256 after downloading and comparing the published copy.

## What did not change

- **No application behaviour changed.** v1.42.1 contains the same household-facing document rename
  behaviour as v1.42.0; this patch changes release packaging and version metadata only.
- **No schema change and no migration.** Household databases, the system registry, documents and
  backup formats are untouched.
- **No authentication, household-separation, storage-path or Unraid-template change.** The PWA's
  `icon-192.png`, `icon-512.png` and `apple-touch-icon.png` remain as before, and the Unraid template
  still uses the canonical repository icon.
- The already-published v1.42.0 GitHub release was not rewritten or backfilled.

## Validation evidence

- `node scripts/validate-release-icon.mjs docs/assets/simple-finance-icon.png` validates the checked-in
  image as a complete 512 × 512, 8-bit PNG.
- `tests/release-icon.test.ts` covers the real icon, wrong dimensions, damaged bytes, the exact
  Publish upload/download contract and preservation of the Unraid/PWA references.
- Local validation passes: **1,253/1,253 tests across 283 suites**, typecheck, formatting, generated
  themes, zero production audit vulnerabilities and the production build. PR CI supplies the required
  `gates`, `browser` and `docker` evidence before merge.
- The tagged Publish run must build and smoke-test the image, verify `v1.42.1`, `latest` and
  `sha-<short>` on one GHCR digest, create the GitHub Latest release, upload the PNG, download it and
  compare its bytes before publication is declared complete.

## Unraid update

1. Back up each household and the Admin registry first, as usual.
2. In Unraid, **Force Update** only the **Simple Finance Multi-household** container using
   `ghcr.io/dougalbob/simple-finance-multi-household:latest`, or pin it to
   `ghcr.io/dougalbob/simple-finance-multi-household:v1.42.1`. Confirm the app badge reads
   **`v1.42.1 · stable`** after it restarts.
3. Keep appdata **`/mnt/user/appdata/simple-finance-multi-household`** mounted at **`/data`**, and
   host port **3009** mapped to container port **3000**. Do not update, replace or repoint the original
   single-household installation, its appdata or port **3007**.
4. No data conversion or re-entry is needed. The downloadable PNG is a GitHub release asset; Unraid
   does not need a new icon path or any manual file copy.
