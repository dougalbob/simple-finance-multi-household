import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  HouseholdRestoreUnavailableError,
  restoreLiveInstallation,
} from '../src/lib/backup/live-restore';

/**
 * The inherited process-wide live restore is no longer a supported operation:
 * tenant-specific backup/restore is a later implementation step. Pin the
 * fail-closed guard so this adapter cannot silently regain access to a shared
 * database or documents directory.
 */
describe('live restore safety gate', () => {
  it('refuses in-place restore until household-scoped recovery exists', async () => {
    await assert.rejects(
      () => restoreLiveInstallation({ archive: Buffer.from('not an archive'), password: 'unused' }),
      (error: unknown) => error instanceof HouseholdRestoreUnavailableError,
    );
  });
});
