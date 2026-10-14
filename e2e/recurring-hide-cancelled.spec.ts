import { expect, test, type Page } from '@playwright/test';

/**
 * Issue #28: the Recurring Schedules list can hide cancelled schedules, with a
 * badge counting what is hidden. The choice lives in `?hideCancelled=1`, so it
 * must survive month paging. Cancelled schedules stay visible by default.
 */

const scheduleName = `Hide-cancel probe ${Date.now()}`;

async function cancelSchedule(page: Page, name: string): Promise<void> {
  const row = page
    .locator('section[aria-labelledby="schedules-heading"] li', { hasText: name })
    .first();
  await row.scrollIntoViewIfNeeded();
  await row.locator('summary', { hasText: 'Edit schedule' }).click();
  // First click reveals the confirmation step; the form then asks twice more.
  await row.getByRole('button', { name: 'Cancel schedule', exact: true }).click();
  await row.getByRole('button', { name: 'Cancel schedule', exact: true }).click();
  await row.getByRole('button', { name: 'Yes, cancel it' }).click();
  await expect(row).toContainText('Cancelled', { timeout: 30_000 });
}

test.describe('recurring schedules: hide cancelled', () => {
  test('hiding cancelled schedules keeps the month, shows a count, and can be undone', async ({
    page,
  }) => {
    test.slow();
    await page.goto('/recurring');
    const schedules = page.locator('section[aria-labelledby="schedules-heading"]');
    await schedules.getByText('Add a schedule').click();
    const addForm = schedules
      .locator('form')
      .filter({ has: page.getByRole('button', { name: 'Add schedule' }) });
    await addForm.locator('input[name="name"]').fill(scheduleName);
    await addForm.locator('input[name="amount"]').fill('3.33');
    await addForm.locator('select[name="potId"]').selectOption({ label: 'Main account' });
    await addForm
      .locator('select[name="categoryId"]')
      .selectOption({ label: 'Utilities / Energy' });
    await addForm.getByRole('button', { name: 'Add schedule' }).click();
    await expect(addForm.getByRole('status')).toContainText(/added/i, { timeout: 30_000 });

    await cancelSchedule(page, scheduleName);

    // Shown by default: deep links to a cancelled schedule still land.
    await page.goto('/recurring');
    const list = page.locator('section[aria-labelledby="schedules-heading"] ul');
    await expect(list.locator('li', { hasText: scheduleName })).toHaveCount(1);
    await expect(page.getByTestId('hidden-cancelled-count')).toHaveCount(0);

    // Hide: the row goes, the badge counts it, and the calendar month is kept.
    await page.getByRole('link', { name: 'Hide cancelled' }).click();
    await expect(page).toHaveURL(/hideCancelled=1/);
    await expect(list.locator('li', { hasText: scheduleName })).toHaveCount(0);
    await expect(page.getByTestId('hidden-cancelled-count')).toContainText(/\d+ hidden/);

    // Paging the calendar keeps the choice.
    await page.getByRole('link', { name: 'Next →' }).click();
    await expect(page).toHaveURL(/hideCancelled=1/);
    await expect(page).toHaveURL(/month=\d{4}-\d{2}/);

    // Show again: the row returns and the badge goes.
    await page.getByRole('link', { name: 'Show cancelled' }).click();
    await expect(page).not.toHaveURL(/hideCancelled/);
    await expect(list.locator('li', { hasText: scheduleName })).toHaveCount(1);
    await expect(page.getByTestId('hidden-cancelled-count')).toHaveCount(0);
  });
});
