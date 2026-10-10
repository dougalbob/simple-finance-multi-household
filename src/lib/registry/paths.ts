import path from 'node:path';
import { assertSafeHouseholdId } from './ids';

/**
 * Runtime path derivation for the multi-household layout (docs/SPEC.md §18.1):
 *
 *   <dataDir>/system/registry.sqlite         control plane (this module set)
 *   <dataDir>/households/<opaque-id>/        one household's own data
 *     simple-finance.sqlite (+ WAL/SHM)
 *     documents/
 *
 * Every household path is derived here from the data root plus a validated
 * opaque household ID — never from a browser-supplied path or ID. Request
 * contexts and document operations use these helpers; any later backup,
 * restore or import implementation must do the same so validation cannot be
 * skipped.
 */

export function systemRegistryPath(dataDir: string): string {
  return path.join(dataDir, 'system', 'registry.sqlite');
}

export function householdDataDir(dataDir: string, householdId: string): string {
  return path.join(dataDir, 'households', assertSafeHouseholdId(householdId));
}

export function householdDatabasePath(dataDir: string, householdId: string): string {
  return path.join(householdDataDir(dataDir, householdId), 'simple-finance.sqlite');
}

export function householdDocumentsDir(dataDir: string, householdId: string): string {
  return path.join(householdDataDir(dataDir, householdId), 'documents');
}
