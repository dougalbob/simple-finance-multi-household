import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

// The import rehearsal (MULTI_HOUSEHOLD_PLAN §5, plan step 5) runs on fictional
// data only, in a git-ignored scratch folder. This test keeps it passing: it
// builds a fictional legacy installation, imports it into an isolated data
// root, verifies counts, hashes and sign-in links, and round-trips the
// household backup and restore.
test('import rehearsal passes every check on fictional data', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const result = spawnSync('node', ['--import', 'tsx', 'scripts/rehearse-import.mts'], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 180_000,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  assert.equal(result.status, 0, output);
  assert.match(output, /\d+ of \d+ checks passed\. Rehearsal succeeded/);
});
