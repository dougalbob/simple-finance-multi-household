import { expect, test } from '@playwright/test';
import { waitForTill } from './support';

for (const width of [393, 1400]) {
  test(`supermarket remainder and manual takeover at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    await page.goto('/');
    await waitForTill(page);
    const entry = page.getByRole('region', { name: /Record it while it is fresh/i });
    await entry.locator('input[name="supplierName"]').fill('Tesco');
    await entry.locator('input[name="amount"]').fill('100');
    const line1 = entry.getByLabel('Line 1 amount');
    await expect(line1).toHaveValue('100.00');
    if (width < 768) await entry.getByRole('button', { name: /Next: category/ }).click();
    await entry.getByRole('button', { name: '+ Add split' }).click();
    await expect(line1).toHaveValue('100.00');
    await expect(entry.getByLabel('Line 2 amount')).toHaveValue('');
    await entry.getByLabel('Line 2 amount').fill('80');
    await expect(line1).toHaveValue('20.00');
    await entry.getByRole('button', { name: '+ Add split' }).click();
    await entry.getByLabel('Line 3 amount').fill('10');
    await expect(line1).toHaveValue('10.00');
    await expect(entry.getByRole('button', { name: 'Save purchase' })).toBeEnabled();
    await entry.getByRole('button', { name: 'Remove line' }).last().click();
    await expect(line1).toHaveValue('20.00');
    await entry.getByLabel('Line 2 amount').fill('110');
    await expect(line1).toHaveValue('0.00');
    await expect(entry.getByText(/No remainder left/)).toBeVisible();
    await expect(entry.getByRole('button', { name: 'Save purchase' })).toBeDisabled();
    await line1.fill('15');
    await entry.getByLabel('Line 2 amount').fill('85');
    await expect(line1).toHaveValue('15');
    await expect(entry.getByRole('button', { name: 'Save purchase' })).toBeEnabled();
  });
}
