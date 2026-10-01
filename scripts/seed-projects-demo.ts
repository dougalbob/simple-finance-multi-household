import { loadAppConfig } from '../src/lib/config';
import { getDbHandle } from '../src/lib/db/client';
import { seedFenceDemoProject } from '../src/lib/projects/demo';

/**
 * Seed the fictional Projects demo — “Back Garden Fence Replacement” — into
 * the configured database (DATA_DIR / DATABASE_PATH). Idempotent: running it
 * twice leaves exactly one demo project. All figures are invented; it never
 * touches real appdata unless you point DATA_DIR at it deliberately
 * (blueprint §9).
 *
 * Usage: `DATA_DIR=./.preview-data node --import tsx scripts/seed-projects-demo.ts`
 */
const config = loadAppConfig();
const { db } = getDbHandle(config);
const project = seedFenceDemoProject(db, 'alex@example.com', new Date());
console.log(
  `Seeded “${project.name}” (id ${project.id}) into ${config.databasePath}. ` +
    `Open /projects/${project.id} to walk the matrix.`,
);
