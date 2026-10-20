import { expect, test } from '@playwright/test';
import { addDaysIso, londonToday, waitForTill } from './support';

/**
 * The first-run path (docs/ONBOARDING_PLAN.md, Slice 1) — and the only spec
 * that runs against a household with **nothing recorded**. It has its own
 * server and data root (`.e2e-data-fresh`, `E2E_FRESH=1` in
 * `scripts/e2e-server.mts`), because a fresh household cannot be simulated
 * inside the seeded one: the whole point is what the app says before any
 * record exists.
 *
 * Everything asserted here is derived from records, so the spec drives the
 * real forms — the same actions /pots, /income and the till use — and watches
 * the home card advance, close, and hand over to the projection.
 */
test.describe('a brand-new household', () => {
  test('the home card names the first step and the empty states point at the right pages', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForTill(page);

    const card = page.locator('section[aria-labelledby="getting-started-heading"]');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Step 1 of 4 to your first projection');
    await expect(card).toContainText('Add the people in your household');
    await expect(card).toContainText('Nobody named yet');

    // The till offers the way to the first pot instead of an empty picker.
    await expect(
      page.getByText('No pots yet — a purchase needs somewhere for the money to leave.'),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Add the first pot' })).toHaveAttribute(
      'href',
      '/pots',
    );

    // /start states the whole path, Phase A first, with the review rhythm last.
    await page.goto('/start');
    await expect(page.getByRole('heading', { name: 'Set up this household' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'First: your first projection' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Then: the rest, at your pace' })).toBeVisible();
    await expect(page.getByText('0 of 4 done')).toBeVisible();
    const peopleStep = page.locator('#setup-people');
    await expect(peopleStep).toContainText('To do');
    await expect(peopleStep).toContainText('people records are not limited to two');
    await expect(peopleStep).toContainText(
      'an administrator assigns up to two sign-in identities to the household before first login',
    );
    await expect(peopleStep).not.toContainText('two is the maximum');
    await expect(page.locator('#setup-pots')).toContainText(
      'Record transfers between your own pots',
    );
    await expect(page.locator('#setup-checkpoints')).toContainText(
      'There is no bank connection, statement import or automatic knowledge of cash',
    );
    await expect(page.locator('#setup-income')).toContainText('predictable amount and date');
    await expect(page.locator('#setup-income')).toContainText('record the money on Income');
    await expect(page.locator('#setup-bills')).toContainText('edit that transaction');
    await expect(page.locator('#setup-figures')).toContainText('typical monthly fuel amount');
    await expect(page.locator('#setup-cards')).toContainText('not liquid money available to spend');
    await expect(page.locator('#setup-purchases')).toContainText(
      'does not remember a manually selected target for the next purchase',
    );
    await expect(page.getByRole('heading', { name: 'What to look at, and when' })).toBeVisible();

    // The old dead ends now point at the page that can actually do the thing
    // (scoped to <main>: the navigation carries the same page name).
    await page.goto('/transactions');
    await expect(
      page.getByRole('main').getByRole('link', { name: 'Accounts, Pots & Checkpoints' }),
    ).toHaveAttribute('href', '/pots');

    await page.goto('/income');
    await expect(
      page.getByRole('main').getByText('Create a pot first, then record income'),
    ).toBeVisible();
    await expect(
      page.getByRole('main').getByRole('link', { name: 'Accounts, Pots & Checkpoints' }).first(),
    ).toHaveAttribute('href', '/pots');

    // With no household payday configured, Horizon alone uses the five-week
    // fallback. The seeded suite separately covers the configured-payday default.
    await page.goto('/horizon');
    await expect(page.getByLabel('Look ahead to')).toHaveValue(addDaysIso(londonToday(), 35));
  });

  test('the payoff pages name what they need, and the guide is anchored', async ({ page }) => {
    // Zero-figure scaffolding is replaced by the needs block (Slice 2): the
    // forecast and the reported charts each name their own missing records.
    await page.goto('/charts');
    const needs = page.getByRole('heading', { name: 'What this page needs first' });
    await expect(needs.first()).toBeVisible();
    await expect(page.getByText('Where liquid funds go, today to a month ahead')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Add the pots you actually have →' }),
    ).toHaveAttribute('href', '/start#setup-pots');

    await page.goto('/horizon');
    await expect(
      page.getByRole('link', { name: 'Add the pots you actually have →' }),
    ).toBeVisible();

    await page.goto('/insights');
    await expect(
      page.getByRole('link', { name: 'Record your first purchase →' }).first(),
    ).toBeVisible();
    await expect(page.getByText('No complete week of shopping is recorded yet')).toHaveCount(0);

    // The guide is one page, reachable from the footer, with every anchor a
    // needs block can link to.
    await page.goto('/guide');
    await expect(
      page.getByRole('heading', { name: 'How this app thinks', level: 1 }),
    ).toBeVisible();
    for (const anchor of ['checkpoint', 'income', 'transfers', 'borrowing', 'schedules']) {
      await expect(page.locator(`#${anchor}`)).toBeVisible();
    }
    await page.goto('/guide#checkpoint');
    await expect(page.locator('#checkpoint')).toBeInViewport();
  });

  test('completing Phase A turns the projection on and clears the home card', async ({ page }) => {
    test.slow();
    await page.goto('/');
    await waitForTill(page);
    const card = page.locator('section[aria-labelledby="getting-started-heading"]');

    // Each step's fields are scoped to its own card (`#setup-…`): the till's
    // own controls carry some of the same labels.
    // Step 1 — name the person.
    const people = page.locator('#setup-people');
    await people.getByLabel('Name (up to 60 characters)').fill('Alex');
    await people.getByRole('button', { name: 'Add person' }).click();
    await expect(card).toContainText('Step 2 of 4');

    // Step 2 — the first pot.
    const pots = page.locator('#setup-pots');
    await pots.getByLabel('Pot name').fill('Current account');
    await pots.getByLabel('Type').selectOption('bank');
    await pots.getByRole('button', { name: 'Add pot' }).click();
    await expect(card).toContainText('Step 3 of 4');

    // Step 3 — the checkpoint that anchors it.
    const checkpoint = page.locator('#setup-checkpoints');
    await checkpoint.getByLabel('Balance right now').fill('412.35');
    await checkpoint.getByRole('button', { name: 'Save checkpoint' }).click();
    await expect(card).toContainText('Step 4 of 4');

    // Step 4 — set the household's planning payday. No receipt schedule is
    // needed for the projection to turn on.
    const payday = page.locator('#setup-payday');
    await payday.getByLabel('Payday day of month').fill('28');
    await payday.getByRole('button', { name: 'Save payday' }).click();
    await expect(payday.getByRole('status')).toContainText('Household payday saved as day 28');

    // Phase A is done: the card goes, the household total appears, and the
    // locked projection is replaced by the real thing.
    await expect(page.locator('section[aria-labelledby="getting-started-heading"]')).toHaveCount(0);
    await expect(page.getByText('£412.35').first()).toBeVisible();
    await expect(page.locator('section[aria-labelledby="payday-summary-heading"]')).toBeVisible();
    await expect(
      page.getByText('The liquidity projection appears once a bank or cash pot has a balance'),
    ).toHaveCount(0);
    await expect(page.getByText('No pots yet — a purchase needs somewhere')).toHaveCount(0);

    // Overview uses the configured payday even though no income receipt has
    // ever been scheduled in this household.
    await page.goto('/overview');
    const projection = page.locator('section[aria-labelledby="projection-heading"]');
    await expect(projection.getByRole('heading', { name: /^To pay day ·/ })).toBeVisible();
    await expect(
      projection.getByText('Expected receipts', { exact: true }).locator('..'),
    ).toContainText('+£0.00');

    // Phase B is not done, so the home page keeps one line pointing at it.
    await page.goto('/');
    const strip = page.locator('section[aria-labelledby="getting-started-strip"]');
    await expect(strip).toContainText('3 more steps');

    // And /start now reports Phase A complete.
    await page.goto('/start');
    await expect(page.getByText('4 of 4 done')).toBeVisible();
    await expect(page.locator('#setup-people')).toContainText('Done');
    await expect(page.locator('#setup-payday')).toContainText('Done');
    await expect(page.locator('#setup-income')).toContainText(
      'No recurring income scheduled — add it only if predictable',
    );
    await expect(page.getByText('The projection is live.')).toBeVisible();
  });
});
