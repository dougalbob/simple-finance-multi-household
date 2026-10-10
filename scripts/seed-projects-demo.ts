import { getCurrentUser } from '../src/lib/auth/current-user';
import { loadAppConfig } from '../src/lib/config';
import { getHouseholdDbHandle } from '../src/lib/db/client';
import { seedFenceDemoProject } from '../src/lib/projects/demo';
import { householdDatabasePath } from '../src/lib/registry/paths';

/**
 * Seed the fictional Projects demo — “Back Garden Fence Replacement” — into
 * the household resolved from the configured verified/development identity's
 * active registry assignment. It never accepts a household ID or database
 * path from command-line or browser input. All figures are invented; point
 * DATA_DIR only at isolated development data (blueprint §9).
 *
 * Usage: `DATA_DIR=./.preview-data AUTH_DEV_BYPASS=true AUTH_DEV_IDENTITY_EMAIL=alex@example.com node --import tsx scripts/seed-projects-demo.ts`
 */
async function main(): Promise<void> {
  const config = loadAppConfig();
  const user = await getCurrentUser({ get: () => null }, config);
  if (user === null) {
    throw new Error(
      'No active registry assignment for the configured identity; refusing to choose a household.',
    );
  }

  const { db } = getHouseholdDbHandle(user.householdId, config);
  const project = seedFenceDemoProject(db, user.email, new Date());
  console.log(
    `Seeded “${project.name}” (id ${project.id}) into ${householdDatabasePath(config.dataDir, user.householdId)}. ` +
      `Open /projects/${project.id} to walk the matrix.`,
  );
}

main().catch((error: unknown) => {
  console.error('[seed-projects-demo] FAILED:', error);
  process.exitCode = 1;
});
