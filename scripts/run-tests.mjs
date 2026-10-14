import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * Batched Node test runner for Simple Finance.
 *
 * Running all ~100 TypeScript test files in a single `node --import tsx --test`
 * invocation spawns default-parallelism workers that retain compiled modules
 * and SQLite fixtures across the whole run, triggering out-of-memory warnings
 * in constrained sandboxes (e.g. Arena). Splitting the suite into sequential
 * child-process batches with capped concurrency (`--test-concurrency=2`) lets
 * the OS reclaim memory after every batch while keeping full-suite `npm test`
 * a single command in both Arena and CI.
 *
 * Pass explicit test paths (`npm test -- tests/spending-mix.test.ts`) to run
 * only those files.
 */

const BATCH_SIZE = Number(process.env.TEST_BATCH_SIZE ?? '20');
const CONCURRENCY = Number(process.env.TEST_CONCURRENCY ?? '2');

const rootDir = process.cwd();
const explicitArgs = process.argv.slice(2);

const testFiles =
  explicitArgs.length > 0
    ? explicitArgs
    : readdirSync(path.join(rootDir, 'tests'))
        .filter((file) => file.endsWith('.test.ts'))
        .sort()
        .map((file) => path.join('tests', file));

const batches = [];
for (let i = 0; i < testFiles.length; i += BATCH_SIZE) {
  batches.push(testFiles.slice(i, i + BATCH_SIZE));
}

let totalTests = 0;
let totalSuites = 0;
let totalPass = 0;
let totalFail = 0;

function extractCount(output, key) {
  const match = new RegExp(`^# ${key} (\\d+)`, 'm').exec(output);
  return match ? Number(match[1]) : 0;
}

for (let index = 0; index < batches.length; index += 1) {
  const batch = batches[index];
  console.log(
    `[test batch ${index + 1}/${batches.length}] running ${batch.length} test files (${batch[0]} .. ${batch[batch.length - 1]})`,
  );
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--test', `--test-concurrency=${CONCURRENCY}`, ...batch],
    {
      cwd: rootDir,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    },
  );

  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const batchTests = extractCount(stdout, 'tests');
  const batchSuites = extractCount(stdout, 'suites');
  const batchPass = extractCount(stdout, 'pass');
  const batchFail = extractCount(stdout, 'fail');

  totalTests += batchTests;
  totalSuites += batchSuites;
  totalPass += batchPass;
  totalFail += batchFail;

  if (result.status !== 0 || batchFail > 0) {
    process.stdout.write(stdout);
    process.stderr.write(stderr);
    console.error(
      `[test batch ${index + 1}/${batches.length}] FAILED (exit ${result.status ?? 1})`,
    );
    process.exit(result.status ?? 1);
  }

  console.log(
    `[test batch ${index + 1}/${batches.length}] ok — ${batchPass}/${batchTests} tests in ${batchSuites} suites`,
  );
}

console.log(
  `\n# total across ${batches.length} batches: ${totalPass}/${totalTests} passed, ${totalFail} failed across ${totalSuites} suites`,
);
