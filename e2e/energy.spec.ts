import { expect, test } from '@playwright/test';
import { londonToday, pickEntryCategory, waitForTill } from './support';

/**
 * Energy tracking (issue 118, v1.44.0; SPEC §29).
 *
 * The household's own bill drives every figure here: gas 755.23 kWh at
 * 4.748p/kWh and 25.902p a day over a 31-day period, with 21,699 kWh of
 * estimated annual usage. The spec records its own purchase under
 * `Utilities / Energy` so it never depends on seeded rows surviving another
 * spec, and it names everything with a timestamp so a CI retry cannot collide
 * with the first attempt's rows in the shared database.
 */
test.describe('energy tracking', () => {
  test('the desktop bar opens /energy and explains the empty state', async ({ page }) => {
    const response = await page.request.get('/energy');
    expect(response.status()).toBe(200);

    await page.goto('/overview');
    await page
      .getByRole('navigation', { name: 'Desktop navigation' })
      .getByRole('link', { name: 'Energy', exact: true })
      .click();
    await expect(page).toHaveURL(/\/energy$/);
    await expect(
      page.getByRole('heading', { name: 'Gas and electricity over time', level: 1 }),
    ).toBeVisible();
  });

  test('the phone drawer reaches the same page', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 727 });
    await page.goto('/overview');
    await page.getByRole('button', { name: 'Open navigation menu' }).click();
    await page
      .getByRole('navigation', { name: 'Pages' })
      .getByRole('link', { name: 'Energy', exact: true })
      .click();
    await expect(page).toHaveURL(/\/energy$/);
    await expect(
      page.getByRole('heading', { name: 'Gas and electricity over time', level: 1 }),
    ).toBeVisible();
  });

  test('records a bill’s energy details against a purchase and draws it', async ({ page }) => {
    test.slow();
    const stamp = Date.now();
    const supplierName = `Playwright Energy ${stamp}`;

    // A direct debit recorded under Utilities / Energy, the category the
    // household's own schedule pays from.
    await page.goto('/');
    await waitForTill(page);
    const entry = page.getByRole('region', { name: /Record it while it is fresh/i });
    await entry.locator('input[name="supplierName"]').fill(supplierName);
    // The settings project's default-pot tests end with the till's default
    // cleared, so name the pot rather than relying on a household setting.
    await entry.getByLabel('Pot').selectOption({ label: 'Main account' });
    await entry.locator('input[name="amount"]').fill('151.49');
    await entry.getByLabel('Line 1 amount').fill('151.49');
    await pickEntryCategory(entry, 'Utilities / Energy');
    await entry.getByRole('button', { name: 'Save purchase' }).click();
    await expect(entry.getByRole('status')).toContainText(/saved/i, { timeout: 30_000 });

    // The optional block is on the row, collapsed, and says what it wants.
    await page.goto('/purchases');
    const row = page.locator('tbody tr', { hasText: supplierName });
    await expect(row).toHaveCount(1);
    const block = row.locator('[data-energy-details]');
    await expect(block).toBeAttached();
    await row
      .getByText(/Energy details/)
      .first()
      .click();

    const form = row.locator('form[data-energy-form]');
    await expect(form).toBeVisible();
    // With no smart meter ticked, the reading boxes are genuinely absent.
    await expect(form.getByLabel('Gas opening reading')).toHaveCount(0);

    const today = londonToday();
    const thirtyDaysAgo = new Date(`${today}T00:00:00Z`);
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
    const periodStart = thirtyDaysAgo.toISOString().slice(0, 10);

    await form.getByLabel('From', { exact: true }).fill(periodStart);
    await form.getByLabel('To', { exact: true }).fill(today);
    await form.getByLabel('Gas used (kWh)').fill('755.23');
    // The supplier's own estimated annual usage, from the bill.
    await form.getByText('Estimated annual usage (optional)').click();
    await form.getByLabel('Gas (kWh a year)').fill('21699');
    await form.getByRole('button', { name: 'Save energy details' }).click();
    await expect(form.getByRole('status')).toContainText(/saved/i, { timeout: 30_000 });

    // The row now reads its own summary, in the household's figures.
    await expect(row.locator('[data-energy-details]')).toContainText(/gas 755\.23 kWh/);
    await expect(row.locator('[data-energy-details]')).toContainText(/paid/);

    // And the Energy page has a bar, a bill and a year's worth of usage.
    await page.goto('/energy');
    await expect(page.getByRole('heading', { name: 'Month by month', level: 2 })).toBeVisible();
    const bills = page.getByRole('heading', { name: 'Every bill', level: 2 });
    await expect(bills).toBeVisible();
    await expect(page.locator('section[aria-labelledby="bills-heading"]')).toContainText('755.23');
    await expect(page.locator('section[aria-labelledby="chart-heading"]')).toContainText(
      /of the last 12 months has a bill/,
    );

    // A saved tariff quotes a year on the usage the app knows: 21,699 kWh at
    // 4.748p plus 25.902p a day, plus 5% VAT — £1,181.05.
    await page.goto('/energy');
    // Opened by the disclosure itself, not by its words: the seeded
    // installation already has a gas tariff, so the summary reads "Change the
    // tariff" rather than "Add the gas tariff".
    const tariff = page.locator('[data-energy-tariff="gas"]');
    await tariff.locator('summary').click();
    await expect(tariff.getByLabel('Supplier')).toBeVisible();
    await tariff.getByLabel('Supplier').fill('Octopus Energy');
    await tariff.getByLabel('Tariff name').fill(`Simply Fixed ${stamp}`);
    await tariff.getByLabel('Unit rate (p/kWh)').fill('4.748');
    await tariff.getByLabel('Standing charge (p/day)').fill('25.902');
    await tariff.getByLabel('Early exit fee (£)').fill('50');
    await tariff.getByRole('button', { name: 'Save tariff' }).click();
    await expect(tariff.getByRole('status')).toContainText(/saved/i, { timeout: 30_000 });
    await expect(page.locator('[data-energy-tariff="gas"]').locator('..')).toContainText(
      /a year on this tariff/,
    );

    // The comparison applies a typed candidate to the same usage.
    await page.goto('/energy?cmpFuel=gas&cmpUnit=4.4&cmpStanding=30');
    const comparison = page.locator('[data-energy-comparison="gas"]');
    await expect(comparison).toBeVisible();
    await expect(comparison).toContainText(/on the same usage/);
    await expect(comparison).toContainText(/a year/);
  });

  test('a purchase outside the energy category has no energy block', async ({ page }) => {
    test.slow();
    const stamp = Date.now();
    const shopName = `Playwright No Energy ${stamp}`;

    await page.goto('/');
    await waitForTill(page);
    const entry = page.getByRole('region', { name: /Record it while it is fresh/i });
    await entry.locator('input[name="supplierName"]').fill(shopName);
    await entry.getByLabel('Pot').selectOption({ label: 'Main account' });
    await entry.locator('input[name="amount"]').fill('6.20');
    await entry.getByLabel('Line 1 amount').fill('6.20');
    await pickEntryCategory(entry, 'Groceries / Weekly Shop');
    await entry.getByRole('button', { name: 'Save purchase' }).click();
    await expect(entry.getByRole('status')).toContainText(/saved/i, { timeout: 30_000 });

    await page.goto('/purchases');
    const row = page.locator('tbody tr', { hasText: shopName });
    await expect(row).toHaveCount(1);
    await expect(row.locator('[data-energy-details]')).toHaveCount(0);
  });
});
