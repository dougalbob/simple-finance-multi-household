import { expect, test } from '@playwright/test';
import { waitForTill } from './support';

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
    await expect(card).toContainText('Name the people');
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
    await expect(page.locator('#setup-people')).toContainText('To do');
    await expect(page.locator('#setup-checkpoints')).toContainText(
      'No bank or cash pot to record yet',
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

    // Step 4 — the salary that defines the payday cycle.
    const income = page.locator('#setup-income');
    await income.getByLabel('Amount expected').fill('2450.00');
    await income.getByLabel('Day of the month').fill('28');
    await income.getByRole('button', { name: 'Add scheduled income' }).click();

    // Phase A is done: the card goes, the household total appears, and the
    // locked projection is replaced by the real thing.
    await expect(page.locator('section[aria-labelledby="getting-started-heading"]')).toHaveCount(0);
    await expect(page.getByText('£412.35').first()).toBeVisible();
    await expect(page.locator('section[aria-labelledby="payday-summary-heading"]')).toBeVisible();
    await expect(
      page.getByText('The liquidity projection appears once a bank or cash pot has a balance'),
    ).toHaveCount(0);
    await expect(page.getByText('No pots yet — a purchase needs somewhere')).toHaveCount(0);

    // Phase B is not done, so the home page keeps one line pointing at it.
    const strip = page.locator('section[aria-labelledby="getting-started-strip"]');
    await expect(strip).toContainText('3 more steps');

    // And /start now reports Phase A complete.
    await page.goto('/start');
    await expect(page.getByText('4 of 4 done')).toBeVisible();
    await expect(page.locator('#setup-people')).toContainText('Done');
    await expect(page.locator('#setup-income')).toContainText('Salary scheduled');
    await expect(page.getByText('The projection is live.')).toBeVisible();
  });
});
