import { expect, test } from '@playwright/test';

/** Household-scoped backup/restore remains an explicitly deferred feature. */
test.describe('household backup and restore status', () => {
  test('Settings does not offer the inherited global backup controls', async ({ page }) => {
    await page.goto('/settings');

    const section = page.locator('section[aria-labelledby="backup-heading"]');
    await expect(section.getByRole('heading', { name: 'Backup & restore' })).toBeVisible();
    await expect(section).toContainText(
      /Household-scoped backup and restore are temporarily unavailable/,
    );
    await expect(section.locator('input')).toHaveCount(0);
    await expect(section.getByRole('button')).toHaveCount(0);
  });
});
