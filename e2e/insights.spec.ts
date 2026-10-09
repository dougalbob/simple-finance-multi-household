import { expect, test } from '@playwright/test';

/**
 * Annual vehicle payments on Insights (SPEC §16.3, decision 190). A yearly
 * premium on a vehicle reads as one twelfth in each month it covers, so it can
 * be compared with a monthly direct debit. The purchase history still records
 * the one payment on its due date.
 *
 * Fictional throughout: a made-up vehicle, insurer and £600.00 premium. The spec
 * adds its own vehicle, so no seeded running cost moves, and it runs near the
 * end of the run (playwright.config.ts) so the schedule it adds cannot change
 * another spec's figures. The premium falls due on the first of last month,
 * which is converted as soon as Insights reads, and it started thirteen months
 * back. The two payments that count therefore cover exactly the twelve months
 * of the rolling window: £600.00 over the year, £50.00 a month.
 */
const VEHICLE = 'Playwright Estate';
const INSURER = 'Playwright Insurer Ltd';

function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

test.describe('annual vehicle payments', () => {
  test('a yearly premium reads as one twelfth a month on Insights', async ({ page }) => {
    test.slow();
    const now = new Date();
    const monthStart = (offset: number) => new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const lastMonth = monthStart(-1);
    const activeFrom = monthStart(-13);

    // 1. A vehicle of its own (SPEC §13), so the figures are this spec's alone.
    await page.goto('/settings');
    const addVehicle = page.getByRole('form', { name: 'Add vehicle' });
    await addVehicle.getByLabel('Name').fill(VEHICLE);
    await addVehicle.getByRole('button', { name: 'Add vehicle' }).click();
    await expect(addVehicle.getByRole('status')).toContainText(/vehicle added/i, {
      timeout: 30_000,
    });

    // 2. The premium, as an annual direct debit for that vehicle.
    await page.goto('/recurring');
    const schedules = page.locator('section[aria-labelledby="schedules-heading"]');
    await schedules.getByText('Add a schedule').click();
    const form = schedules
      .locator('form')
      .filter({ has: page.getByRole('button', { name: 'Add schedule' }) });
    await form.locator('input[name="name"]').fill(`${INSURER} premium`);
    await form.locator('input[name="amount"]').fill('600.00');
    await form.locator('select[name="kind"]').selectOption('dd');
    await form.locator('select[name="frequency"]').selectOption('annual');
    await form.locator('select[name="dueMonth"]').selectOption(String(lastMonth.getMonth() + 1));
    await form.locator('input[name="dueDayOfMonth"]').fill('1');
    await form.locator('select[name="categoryId"]').selectOption({
      label: 'Vehicle Running / Insurance',
    });
    await form.locator('select[name="supplierId"]').selectOption({ label: 'Add a new supplier…' });
    await form.locator('input[name="supplierName"]').fill(INSURER);
    await form.locator('select[name="target"]').selectOption({ label: `Vehicle — ${VEHICLE}` });
    await form.locator('input[name="activeFrom"]').fill(isoDate(activeFrom));
    await form.getByRole('button', { name: 'Add schedule' }).click();
    await expect(form.getByRole('status')).toContainText(/added/i, { timeout: 30_000 });

    // 3. Insights: the vehicle's card shows the premium as one twelfth a month.
    await page.goto('/insights');
    const card = page.locator('div[id^="vehicle-"]').filter({ hasText: VEHICLE });
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card).toContainText('£600.00');
    await expect(card).toContainText('this month £50.00');
    await expect(card).toContainText('previous month £50.00');
    await expect(card.getByText('(annual ÷ 12)')).toBeVisible();
    await expect(card.getByText('An annual payment is shown as ÷ 12')).toBeVisible();

    // 4. Purchases: the history keeps each payment once, on its due date.
    await page.goto(`/purchases?from=${isoDate(activeFrom)}&to=${isoDate(now)}`);
    const payments = page.locator('tbody tr', { hasText: INSURER });
    await expect(payments).toHaveCount(2, { timeout: 30_000 });
    await expect(payments.first()).toContainText('£600.00');
  });
});
