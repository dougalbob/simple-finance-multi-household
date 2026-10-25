import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { resolve } from 'node:path';
import { validateReleaseIcon } from '../scripts/validate-release-icon.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const RELEASE_ICON = resolve(ROOT, 'docs/assets/simple-finance-icon.png');
const PWA_ICON = resolve(ROOT, 'public/icon-192.png');
const WORKFLOW = resolve(ROOT, '.github/workflows/publish.yml');

describe('GitHub release icon', () => {
  it('is a fully readable 512 × 512 PNG', () => {
    assert.deepEqual(validateReleaseIcon(readFileSync(RELEASE_ICON)), {
      width: 512,
      height: 512,
      bitDepth: 8,
      colourType: 6,
    });
  });

  it('rejects a valid PNG with the wrong dimensions', () => {
    assert.throws(
      () => validateReleaseIcon(readFileSync(PWA_ICON)),
      /must be 512 × 512, got 192 × 192/,
    );
  });

  it('rejects a damaged PNG rather than trusting only its dimensions', () => {
    const damaged = Buffer.from(readFileSync(RELEASE_ICON));
    damaged[100] = (damaged[100] ?? 0) ^ 0xff;
    assert.throws(() => validateReleaseIcon(damaged), /invalid IDAT chunk checksum/);
  });

  it('passes through the same command used by Publish', () => {
    const result = spawnSync(
      process.execPath,
      ['scripts/validate-release-icon.mjs', 'docs/assets/simple-finance-icon.png'],
      { cwd: ROOT, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /512 × 512, 8-bit PNG/);
  });

  it('is uploaded under a stable name and verified on every Publish run', () => {
    const workflow = readFileSync(WORKFLOW, 'utf8');

    assert.match(
      workflow,
      /RELEASE_ICON_SOURCE: docs\/assets\/simple-finance-icon\.png/,
      'Publish must use the canonical checked-in icon',
    );
    assert.match(
      workflow,
      /RELEASE_ICON_NAME: simple-finance-multi-household-icon\.png/,
      'the downloadable asset name must stay stable',
    );
    assert.match(
      workflow,
      /node scripts\/validate-release-icon\.mjs "\$RELEASE_ICON_SOURCE"/,
      'Publish must validate the source asset',
    );
    assert.match(
      workflow,
      /gh release upload "\$VERSION" --repo "\$GITHUB_REPOSITORY" "\$ASSET_PATH"/,
      'a missing asset must be uploaded for both stable and prerelease releases',
    );
    assert.match(
      workflow,
      /gh release download "\$VERSION" --repo "\$GITHUB_REPOSITORY"[\s\S]*?--pattern "\$RELEASE_ICON_NAME"/,
      'Publish reruns must download the named asset for verification',
    );
    assert.match(
      workflow,
      /cmp -s "\$RELEASE_ICON_SOURCE" "\$DOWNLOAD_DIR\/\$RELEASE_ICON_NAME"/,
      'the release asset must have the exact bytes from the checked-out tag',
    );
    assert.doesNotMatch(
      workflow,
      /GitHub release \$VERSION already exists - leaving it untouched/,
      'an existing release must not skip asset reconciliation',
    );
  });

  it('leaves the Unraid and PWA icon contracts in place', () => {
    const template = readFileSync(resolve(ROOT, 'simple-finance-multi-household.xml'), 'utf8');
    const manifest = readFileSync(resolve(ROOT, 'public/manifest.webmanifest'), 'utf8');

    assert.match(template, /docs\/assets\/simple-finance-icon\.png<\/Icon>/);
    assert.match(manifest, /\/icon-192\.png/);
    assert.match(manifest, /\/icon-512\.png/);
    assert.match(
      readFileSync(resolve(ROOT, 'src/app/layout.tsx'), 'utf8'),
      /apple-touch-icon\.png/,
    );
  });
});
