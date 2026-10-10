import { expect, test } from '@playwright/test';

/**
 * Household-scoped backup and restore (MULTI_HOUSEHOLD_PLAN §5) and support
 * access (§4), as the signed-in household member sees them in Settings.
 */
test.describe('household backup and restore', () => {
  test('Settings offers this household’s own encrypted backup, and says what it holds', async ({
    page,
  }) => {
    await page.goto('/settings');

    const section = page.locator('section[aria-labelledby="backup-heading"]');
    await expect(section.getByRole('heading', { name: 'Backup & restore' })).toBeVisible();
    await expect(section).toContainText(/holds only this household/);
    await expect(section.getByRole('button', { name: 'Download encrypted backup' })).toBeVisible();
    await expect(section.locator('input[type="password"]').first()).toBeVisible();
  });

  test('a passphrase that is too short is refused before anything is downloaded', async ({
    page,
  }) => {
    await page.goto('/settings');

    const section = page.locator('section[aria-labelledby="backup-heading"]');
    const passphrases = section.locator('input[type="password"]');
    await passphrases.nth(0).fill('short');
    await passphrases.nth(1).fill('short');
    await section.getByRole('button', { name: 'Download encrypted backup' }).click();
    await expect(section).toContainText(/at least 12 characters/);
  });
});

test.describe('support access', () => {
  test('Settings says no support access is granted, and only offers administrators outside this household', async ({
    page,
  }) => {
    await page.goto('/settings#support-access');

    const section = page.locator('section[aria-labelledby="support-access-heading"]');
    await expect(section.getByRole('heading', { name: 'Support access' })).toBeVisible();
    await expect(section).toContainText('No support access is granted right now.');
    await expect(section).toContainText(/read-only, lasts 1, 4 or 24 hours/);
    // The only administrator in the seed belongs to this household, so there is no one to grant to.
    await expect(section).toContainText(
      'No platform administrator is available to grant access to.',
    );
  });
});
