import { expect, test, type Page } from '@playwright/test';

/**
 * Issues #28, #34, #35:
 * - Recurring schedules list can hide cancelled schedules, with a badge counting hidden.
 * - Persistent hidden preference across full-page navigation via cookie (issue #35).
 * - In-place filter search box with clear button (issue #34).
 * - Matching cancelled schedules show when filtered even if hidden (issue #34).
 * - Supplier card displays "Linked to schedule" link to recurring schedule, or
 *   "No scheduled payments relate to this supplier currently" (issue #34).
 */

const scheduleName = `Hide-cancel probe ${Date.now()}`;
const supplierScheduleName = `Supplier linked probe ${Date.now()}`;

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

test.describe('recurring schedules: hide cancelled & navigation persistence', () => {
  test('hiding cancelled schedules keeps month, persists across navigation, and can be undone', async ({
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
    await addForm.locator('select[name="kind"]').selectOption('so');
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

    // Issue #35: Navigating away and back to /recurring (without query param) remembers the hidden choice.
    await page.goto('/purchases');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/purchase/i);
    await page.goto('/recurring');
    await expect(list.locator('li', { hasText: scheduleName })).toHaveCount(0);
    await expect(page.getByTestId('hidden-cancelled-count')).toContainText(/\d+ hidden/);

    // Issue #34: In-place filter search box shows matching cancelled schedules even when hidden.
    const filterInput = page.getByPlaceholder('Filter schedules…');
    await filterInput.fill(scheduleName);
    await expect(list.locator('li', { hasText: scheduleName })).toHaveCount(1);
    await expect(list.locator('li', { hasText: scheduleName })).toContainText('Cancelled');

    // Clearing the filter restores the hidden state.
    await page.getByRole('button', { name: 'Clear filter' }).click();
    await expect(filterInput).toHaveValue('');
    await expect(list.locator('li', { hasText: scheduleName })).toHaveCount(0);

    // Show again: the row returns and the badge goes.
    await page.getByRole('link', { name: 'Show cancelled' }).click();
    await expect(page).not.toHaveURL(/hideCancelled/);
    await expect(list.locator('li', { hasText: scheduleName })).toHaveCount(1);
    await expect(page.getByTestId('hidden-cancelled-count')).toHaveCount(0);

    // Navigating away and back maintains the shown choice.
    await page.goto('/purchases');
    await page.goto('/recurring');
    await expect(list.locator('li', { hasText: scheduleName })).toHaveCount(1);
    await expect(page.getByTestId('hidden-cancelled-count')).toHaveCount(0);
  });

  test('supplier card links to schedule, filters recurring page, and shows empty state when unlinked', async ({
    page,
  }) => {
    test.slow();
    // 1. Check a supplier with no schedules shows the empty note.
    await page.goto('/suppliers');
    const cafeCard = page.locator('article', { hasText: 'The Corner Cafe' });
    await expect(cafeCard).toBeVisible();
    await cafeCard.getByRole('button', { name: /The Corner Cafe/ }).click();
    await expect(
      cafeCard.getByText('No scheduled payments relate to this supplier currently'),
    ).toBeVisible();

    // 2. Check an existing supplier with a schedule (BroadbandCo is seeded with BroadbandCo fibre).
    const broadbandCard = page.locator('article', { hasText: 'BroadbandCo' });
    await expect(broadbandCard).toBeVisible();
    await broadbandCard.getByRole('button', { name: /BroadbandCo/ }).click();
    const scheduleLink = broadbandCard.getByRole('link', {
      name: 'Linked to schedule "BroadbandCo fibre"',
    });
    await expect(scheduleLink).toBeVisible();

    // Clicking the link navigates to /recurring with filter and anchor.
    await scheduleLink.click();
    await expect(page).toHaveURL(/\/recurring\?q=BroadbandCo\+fibre#schedule-\d+/);
    const filterBox = page.getByPlaceholder('Filter schedules…');
    await expect(filterBox).toHaveValue('BroadbandCo fibre');
    const list = page.locator('section[aria-labelledby="schedules-heading"] ul');
    await expect(list.locator('li', { hasText: 'BroadbandCo fibre' })).toHaveCount(1);

    // Clearing the filter restores other schedules.
    await page.getByRole('button', { name: 'Clear filter' }).click();
    await expect(filterBox).toHaveValue('');
    await expect(list.locator('li', { hasText: 'Phone plan' })).toHaveCount(1);
    await expect(list.locator('li', { hasText: 'BroadbandCo fibre' })).toHaveCount(1);
  });
});
