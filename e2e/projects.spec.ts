import { expect, test } from '@playwright/test';

/**
 * Projects Phase 2 (SPEC §27.6, PROJECTS_IMPLEMENTATION.MD §7): the optimiser
 * bar on the fictional "Back Garden Fence Replacement" workspace. Manual
 * selection sits beside the cheapest split and the best single supplier; one
 * click applies a plan to the matrix and the totals follow.
 *
 * Own project: applying a plan rewrites the demo selections in the E2E seed.
 */

test.use({ viewport: { width: 1400, height: 950 } });

test.describe('projects optimiser', () => {
  test('the bar compares the plans, and Apply rewrites the matrix selection', async ({ page }) => {
    await page.goto('/projects');
    await page
      .getByRole('link', { name: /Back Garden Fence Replacement/ })
      .first()
      .click();
    await expect(
      page.getByRole('heading', { name: 'Back Garden Fence Replacement', level: 1 }),
    ).toBeVisible();

    const bar = page.getByTestId('optimiser-bar');
    const split = bar.locator('[data-optimiser-card="split"]');
    const single = bar.locator('[data-optimiser-card="single"]');
    const manual = bar.locator('[data-optimiser-card="manual"]');
    const breakdown = page.locator('section[aria-labelledby="breakdown-heading"]');

    // Whatever an earlier run left selected, start from the single supplier.
    const applySingle = single.getByRole('button', { name: 'Apply the single supplier' });
    if ((await applySingle.count()) > 0) await applySingle.click();
    await expect(single).toContainText('Applied — this is your current selection.');
    await expect(manual).toContainText('£1,152.00');
    await expect(breakdown).toContainText('£1,152.00');

    // The cheapest split is £90.50 cheaper than the one supplier and uses two.
    await expect(split).toContainText('£1,061.50');
    await expect(split).toContainText('2 suppliers');
    await expect(split).toContainText('Local Timber Yard');
    await expect(split).toContainText('Jewson');
    await expect(single).toContainText('£90.50 more than the cheapest split');
    await expect(bar).toContainText('1 out-of-stock quote was skipped');

    await split.getByRole('button', { name: 'Apply the cheapest split' }).click();
    await expect(split).toContainText('Applied — this is your current selection.');
    await expect(manual).toContainText('£1,061.50');
    await expect(breakdown).toContainText('Grand total');
    await expect(breakdown).toContainText('£1,061.50');

    // It survives a reload — the selection is stored, not a client-side preview.
    await page.reload();
    await expect(
      page.getByTestId('optimiser-bar').locator('[data-optimiser-card="split"]'),
    ).toContainText('Applied — this is your current selection.');
  });
});
