import { rmSync } from 'node:fs';
import path from 'node:path';
import { loadAppConfig } from '../src/lib/config';
import { householdDatabasePath } from '../src/lib/registry/paths';
import { seedDemoHousehold } from '../src/lib/demo/household';

/**
 * Seed the fictional worked example household into an ISOLATED data root.
 *
 * This is a rehearsal tool, not an in-app playground: the one-household-per-
 * identity rule stays intact, and no fake record ever lands in a household's
 * own database. It refuses a production-shaped /data root or any root that
 * already contains records.
 *
 * Usage:
 *   DATA_DIR=./.preview-data node --import tsx scripts/seed-example-household.mts
 *
 * The script will:
 * 1. Resolve the data root from DATA_DIR (defaults to .preview-data)
 * 2. Refuse if the data root looks like a production install (contains system/registry.sqlite)
 * 3. Refuse if any household database already exists (protects real data)
 * 4. Create a new household database and seed the fictional two-month scenario
 * 5. Print the path and instructions to open /example or /projects/[id]
 */
async function main(): Promise<void> {
  const dataDir = path.resolve(process.cwd(), process.env.DATA_DIR ?? '.preview-data');

  // Safety: refuse production-shaped roots
  const registryPath = path.join(dataDir, 'system', 'registry.sqlite');
  if (require('node:fs').existsSync(registryPath)) {
    console.error('[seed-example-household] REFUSED: DATA_DIR contains a system registry — this looks like a production install.');
    console.error('  Use an isolated preview root (e.g. DATA_DIR=./.preview-data) instead.');
    process.exitCode = 1;
    return;
  }

  // Safety: refuse if any household databases already exist
  const householdsDir = path.join(dataDir, 'households');
  if (require('node:fs').existsSync(householdsDir)) {
    const entries = require('node:fs').readdirSync(householdsDir, { withFileTypes: true });
    const hasDatabases = entries.some((entry: { isDirectory: () => boolean; name: string }) =>
      entry.isDirectory() && require('node:fs').existsSync(path.join(householdsDir, entry.name, 'simple-finance.sqlite')),
    );
    if (hasDatabases) {
      console.error('[seed-example-household] REFUSED: DATA_DIR/households already contains household databases.');
      console.error('  This script only seeds into a completely empty preview root.');
      process.exitCode = 1;
      return;
    }
  }

  // Create a minimal registry with one household and one identity (the demo user)
  const { createHousehold, assignIdentity } = await import('../src/lib/registry/domain');
  const { openRegistry } = await import('../src/lib/registry/db');
  const { systemRegistryPath } = await import('../src/lib/registry/paths');

  require('node:fs').mkdirSync(dataDir, { recursive: true });
  const registry = openRegistry(systemRegistryPath(dataDir));
  try {
    const household = createHousehold(registry, {
      displayName: 'Worked Example Household',
      actor: 'system',
    });
    assignIdentity(registry, {
      email: 'alex@example.com',
      householdId: household.id,
      role: 'platform_admin',
      actor: 'system',
    });
    assignIdentity(registry, {
      email: 'sam@example.com',
      householdId: household.id,
      actor: 'system',
    });
    console.log(`[seed-example-household] Created household ${household.id} in preview registry`);
  } finally {
    registry.close();
  }

  // Seed the fictional household data
  const config = loadAppConfig();
  const dbPath = householdDatabasePath(config.dataDir, 'worked-example'); // We'll override the path

  // Actually, let's use the household ID from the registry
  const { getRegistry } = await import('../src/lib/registry/db');
  const registry2 = getRegistry();
  const identities = registry2.prepare('SELECT household_id FROM identities WHERE email = ?').get('alex@example.com');
  const householdId = identities?.household_id;
  registry2.close();

  if (!householdId) {
    console.error('[seed-example-household] Failed to find household ID for alex@example.com');
    process.exitCode = 1;
    return;
  }

  const actualDbPath = householdDatabasePath(dataDir, householdId);
  console.log(`[seed-example-household] Seeding into ${actualDbPath}`);

  const now = new Date();
  const { dbHandle } = seedDemoHousehold(actualDbPath, now);
  dbHandle.raw.close();

  console.log(`[seed-example-household] SUCCESS: Seeded worked example into ${actualDbPath}`);
  console.log('');
  console.log('To view the worked example:');
  console.log(`  1. Start the app with DATA_DIR=${dataDir}`);
  console.log('  2. Sign in as alex@example.com (with AUTH_DEV_BYPASS=true)');
  console.log('  3. Visit /example for the full worked example');
  console.log('  4. Visit /projects/[id] for the "Back Garden Fence Replacement" project');
  console.log('');
  console.log('Example dev command:');
  console.log(`  DATA_DIR=${dataDir} AUTH_DEV_BYPASS=true AUTH_DEV_IDENTITY_EMAIL=alex@example.com npm run dev`);
}

main().catch((error: unknown) => {
  console.error('[seed-example-household] FAILED:', error);
  process.exitCode = 1;
});