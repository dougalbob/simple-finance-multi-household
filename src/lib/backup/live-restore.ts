/**
 * The old live-restore adapter swapped a process-wide database and root-level
 * documents directory. That operation is not safe after finance data is
 * household-routed. Keep a fail-closed guard until tenant-scoped backup and
 * restore are implemented in their separately approved step.
 */
export class HouseholdRestoreUnavailableError extends Error {
  constructor() {
    super('Live restore is disabled until household-scoped backup and restore are implemented.');
    this.name = 'HouseholdRestoreUnavailableError';
  }
}

export interface LiveRestoreOptions {
  archive: Buffer;
  password: string;
}

/** Refuse unscoped in-place restore rather than touching any household data. */
export async function restoreLiveInstallation(_options: LiveRestoreOptions): Promise<never> {
  throw new HouseholdRestoreUnavailableError();
}
