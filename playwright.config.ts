import { defineConfig, devices } from '@playwright/test';

/**
 * The first-run suite
 * The first-run suite (docs/ONBOARDING_PLAN.md) needs a household with nothing
 * recorded — the seeded one cannot be used, and Next refuses two dev servers in
 * one directory — so it is a **separate invocation** of this same config:
 *
 *   npm run test:e2e        the seeded household, every project
 *   npm run test:e2e:fresh  the empty household, only the first-run spec
 *
 * `E2E_FRESH=1` switches the server (its own data root, `E2E_FRESH=1` through
 * to `scripts/e2e-server.mts`) and narrows the projects to the fresh spec. One
 * server per run; CI runs both commands.
 */
const E2E_FRESH = process.env.E2E_FRESH === '1';

const E2E_PORT = Number(process.env.E2E_PORT ?? (E2E_FRESH ? 3200 : 3100));
const E2E_BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${E2E_PORT}`;

/**
 * Browser acceptance run (blueprint §9: "use real browser tests for interaction
 * where possible"). The sandbox this was written in has no browser binaries and
 * no access to the Playwright download host, so the suite is executed in CI
 * (`npm run test:e2e`) — and, when Playwright is installed locally, by hand.
 *
 * The server is started by `scripts/e2e-server.mts`: it creates an isolated
 * `.e2e-data` directory, seeds a fictional household (never the real appdata),
 * and runs `next dev` with the development identity bypass — the bypass is
 * impossible in production by construction (`src/lib/config.ts`).
 */
export default defineConfig({
  testDir: './e2e',
  // One worker: all projects share a single server and fictional household seed.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // The `github` reporter turns each failure into an annotation, so a failed CI
  // run is diagnosable from the API without downloading job logs.
  reporter: process.env.CI
    ? [['list'], ['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: E2E_BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // A phone-ish default; desktop specs override the viewport.
    ...devices['Desktop Chrome'],
    // The browser keeps the household's calendar, not the CI runner's UTC —
    // so a date the page computes and a date the server computes agree even
    // in the summer hour when London is already on tomorrow (decision 134).
    timezoneId: 'Europe/London',
  },
  projects: E2E_FRESH
    ? [
        {
          // The empty household (see E2E_FRESH above): its own server and data
          // root, so nothing here can be confused with the seeded specs.
          name: 'fresh-household',
          testMatch: /fresh-household\.spec\.ts/,
          use: { viewport: { width: 1400, height: 950 } },
        },
      ]
    : [
        {
          name: 'mobile',
          testMatch: /home\.spec\.ts/,
          grepInvert: /the payday card states the facts and opens Horizon the day before payday/,
          use: { ...devices['Pixel 7'] },
        },
        {
          name: 'desktop',
          testMatch: /desktop\.spec\.ts/,
          use: { viewport: { width: 1400, height: 950 } },
        },
        {
          // Own project: testMatch is per-project, so a new spec file is not picked
          // up by mobile/desktop; include attachment specs explicitly.
          name: 'attachments',
          testMatch: /(?:attachments|remainder)\.spec\.ts/,
          use: { viewport: { width: 1400, height: 950 } },
        },
        {
          // Own project for the same reason; this spec mutates the shared category tree.
          name: 'settings',
          testMatch: /settings\.spec\.ts/,
          use: { viewport: { width: 1400, height: 950 } },
        },
        {
          // Own project for the same reason: household-boundary money mutates pots and debts.
          name: 'external',
          testMatch: /external-money\.spec\.ts/,
          use: { viewport: { width: 1400, height: 950 } },
        },
        {
          // Checkpointing on /pots must update that page in place. Uses the
          // Salary account, which no other spec touches, but still runs after
          // external so shared-pot mutations never precede it in reverse.
          name: 'checkpoint',
          testMatch: /checkpoint\.spec\.ts/,
          use: { viewport: { width: 1400, height: 950 } },
        },
        {
          // Read-only activity view (SPEC §15.3). Records a transfer through the
          // ordinary Move tab, so it runs after checkpoint.
          name: 'transactions',
          testMatch: /transactions\.spec\.ts/,
          use: { viewport: { width: 1400, height: 950 } },
        },
        {
          // Own project for the same reason: it records and voids income after
          // the transaction list has been asserted.
          name: 'income',
          testMatch: /income\.spec\.ts/,
          use: { viewport: { width: 1400, height: 950 } },
        },
        {
          // Own project: the horizon page reads income additions made by the income specs.
          name: 'horizon',
          testMatch: /horizon\.spec\.ts/,
          use: { viewport: { width: 1400, height: 950 } },
        },
        {
          // Own project (v0.10.0): adds its own vehicle and three fuel fills after
          // the specs that assert Insights and vehicle lists.
          name: 'fuel',
          testMatch: /fuel\.spec\.ts/,
          use: { viewport: { width: 1400, height: 950 } },
        },
        {
          // Own project (v0.14.0): charts are read-only, but the spec ticks a
          // commitment category in Settings, so it runs after history is added.
          name: 'charts',
          testMatch: /charts\.spec\.ts/,
          use: { viewport: { width: 1400, height: 950 } },
        },
        {
          // Own project (v0.17.0): the theme lives in a per-device cookie, so each
          // test's fresh context is a fresh device. It writes no household data.
          name: 'theme',
          testMatch: /theme\.spec\.ts/,
          use: { viewport: { width: 1400, height: 950 } },
        },
        {
          // Own project (v0.22.1): renaming a non-first category keeps visible selection
          // and version in sync; it runs before the backup-status project.
          name: 'category-picker',
          testMatch: /category-picker\.spec\.ts/,
          use: { viewport: { width: 1400, height: 950 } },
        },
        {
          // Own project (v0.22.1): debt deletion and honest awaiting status; mutates debts.
          name: 'debt-lifecycle',
          testMatch: /debt-lifecycle\.spec\.ts/,
          use: { viewport: { width: 1400, height: 950 } },
        },
        {
          // Own project (issue #60): the Borrowing page — ledger, setup flow,
          // expected rows, inline correction/void and the moved deep links.
          name: 'borrowing',
          testMatch: /borrowing\.spec\.ts/,
          use: { viewport: { width: 1400, height: 950 } },
        },
        {
          // Own project (v0.25.0): creates, ticks and reopens tasks, and logs a
          // follow-up on a supplier card in the shared E2E seed.
          name: 'tasks',
          testMatch: /tasks\.spec\.ts/,
          use: { viewport: { width: 1400, height: 950 } },
        },
        {
          // Own project (v0.26.0): bell badge, panel, freshness without reload,
          // phone layout, and Sam's seeded task for "Since you last looked".
          name: 'bell',
          testMatch: /bell\.spec\.ts/,
          use: { viewport: { width: 1400, height: 950 } },
        },
        {
          // Own project (v0.28.0): tests the till's Checkpoint cash card and
          // Accounts, Pots & Checkpoints order; it checkpoints Alex's cash and
          // rewrites a pot owner.
          name: 'cash-checkpoint',
          testMatch: /cash-checkpoint\.spec\.ts/,
          use: { viewport: { width: 1400, height: 950 } },
        },
        {
          // Own project: applying a plan rewrites the fence demo's selections.
          name: 'projects',
          testMatch: /projects\.spec\.ts/,
          use: { viewport: { width: 1400, height: 950 } },
        },
        {
          // Own project (multi-household registry): platform administration —
          // households and sign-in pre-assignment. Writes registry rows only.
          name: 'admin',
          testMatch: /admin\.spec\.ts/,
          use: { viewport: { width: 1400, height: 950 } },
        },
        {
          name: 'backup',
          testMatch: /backup\.spec\.ts/,
          use: { viewport: { width: 1400, height: 950 } },
        },
        {
          // Own project late in the suite: it adds a card pot and statement terms to the shared seed.
          name: 'credit-card-pots',
          testMatch: /credit-card-pots\.spec\.ts/,
          use: { viewport: { width: 1400, height: 950 } },
        },
        {
          // Own project: adds its own vehicle and an annual premium near the end;
          // it moves no seeded figure.
          name: 'insights',
          testMatch: /insights\.spec\.ts/,
          use: { viewport: { width: 1400, height: 950 } },
        },
        {
          name: 'recurring',
          testMatch: /recurring-hide-cancelled\.spec\.ts/,
          use: { viewport: { width: 1400, height: 950 } },
        },
        {
          // Own project (slice 2 of the long-term forecast): the spec resets the
          // saved plan to a fresh draft before it asserts anything, then saves
          // one edited assumption — so it neither reads nor leaves shared data.
          name: 'longterm',
          testMatch: /longterm\.spec\.ts/,
          use: { viewport: { width: 1400, height: 950 } },
        },
        {
          // The payday example rewrites only the isolated E2E seed. Keep it last so
          // its fictional account, schedules and settings cannot affect other specs.
          name: 'payday-summary',
          testMatch: /home\.spec\.ts/,
          grep: /the payday card states the facts and opens Horizon the day before payday/,
          use: { ...devices['Pixel 7'] },
        },
      ],
  webServer: {
    command: E2E_FRESH
      ? 'E2E_FRESH=1 node --import tsx scripts/e2e-server.mts'
      : 'node --import tsx scripts/e2e-server.mts',
    url: `${E2E_BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
