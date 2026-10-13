/**
 * Single source of truth for the application identity and version.
 *
 * Blueprint §10: one client-safe version module; package.json and the
 * lockfile root metadata must stay aligned (checked by tests/version.test.ts).
 * `APP_RELEASE_STAGE` is `stable` for a production release and `pre-release`
 * for a release candidate; it is what the header and home-page badges print.
 */
export const APP_NAME = 'Simple Finance';

export const APP_VERSION = '1.7.0';

export const APP_RELEASE_STAGE = 'stable';
