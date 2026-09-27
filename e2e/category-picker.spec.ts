import { expect, test } from '@playwright/test';
import { waitForCategoryEditor } from './support';

/**
 * Category rename picker selects the wrong visible category (issue 1, decision 167).
 *
 * The bug: option values are `parent:<id>` / `child:<id>` but the controlled
 * select value was only `String(categoryId)`. After selection, no option
 * matched that bare ID, so the browser displayed the first selectable option
 * while hidden `categoryId` and `version` still referred to the originally
 * selected category. The fix makes visible selection, submitted ID and
 * optimistic version always agree, and keeps the version in sync after a
 * rename so a second rename without refresh does not hit a stale version.
 *
 * These tests assert selection and persisted result, not just a success message.
 */

test.describe('category rename picker — visible selection agrees with submitted ID', () => {
  test('rename a non-first parent keeps the visible selection correct and only that parent changes', async ({
    page,
  }) => {
    test.slow();
    await page.goto('/settings');
    const section = page.getByRole('region', { name: /Category tree/i });
    await expect(section.getByRole('heading', { name: 'Category tree', level: 2 })).toBeVisible();
    await waitForCategoryEditor(page);

    // Ensure we have at least two custom parents to exercise non-first selection.
    const secondParent = `Picker Parent ${Date.now()}`;
    await section.getByLabel('Operation').selectOption('add-parent');
    await section.getByLabel('Name').fill(secondParent);
    await section.getByRole('button', { name: 'Apply' }).click();
    await expect(section.getByRole('status')).toContainText(/added/i, { timeout: 30_000 });
    await expect(section.locator('li p', { hasText: secondParent })).toHaveCount(1, {
      timeout: 30_000,
    });

    // Now rename the second parent (non-first among custom, but also non-first overall).
    const renamedSecond = `${secondParent} Renamed`;
    await section.getByLabel('Operation').selectOption('rename');
    await waitForCategoryEditor(page);
    const which = section.getByLabel('Which category');
    await which.selectOption({ label: `${secondParent} (parent)` });

    // Acceptance: selection stays visibly correct before submission.
    await expect(which.locator('option:checked')).toHaveText(`${secondParent} (parent)`);

    await section.getByLabel('Name').fill(renamedSecond);
    await section.getByRole('button', { name: 'Apply' }).click();
    await expect(section.getByRole('status')).toContainText(/renamed/i, { timeout: 30_000 });

    // Names refresh in the tree and only intended category changes.
    await expect(section.locator('li p', { hasText: renamedSecond })).toHaveCount(1, {
      timeout: 30_000,
    });
    // Old name exact should no longer exist (new name contains old as prefix, so exact check)
    await expect(
      section.locator('li').filter({ has: section.locator(`p:text-is("${secondParent}")`) }),
    ).toHaveCount(0);
    // First parent still exists unchanged.
    await expect(section.locator('li p', { hasText: 'Playwright Garden' })).toHaveCount(1);

    // Acceptance: save, then rename again without refreshing; no stale version failure.
    await which.selectOption({ label: `${renamedSecond} (parent)` });
    await expect(which.locator('option:checked')).toHaveText(`${renamedSecond} (parent)`);
    await section.getByLabel('Name').fill(`${renamedSecond} Again`);
    await section.getByRole('button', { name: 'Apply' }).click();
    await expect(section.getByRole('status')).toContainText(/renamed/i, { timeout: 30_000 });
    await expect(section.locator('li p', { hasText: `${renamedSecond} Again` })).toHaveCount(1, {
      timeout: 30_000,
    });
  });

  test('rename a child under another parent keeps visible selection correct', async ({ page }) => {
    test.slow();
    await page.goto('/settings');
    const section = page.getByRole('region', { name: /Category tree/i });
    await waitForCategoryEditor(page);

    const parentForChild = `Picker Parent Child ${Date.now()}`;
    await section.getByLabel('Operation').selectOption('add-parent');
    await section.getByLabel('Name').fill(parentForChild);
    await section.getByRole('button', { name: 'Apply' }).click();
    await expect(section.getByRole('status')).toContainText(/added/i, { timeout: 30_000 });

    await section.getByLabel('Operation').selectOption('add-child');
    await section.getByLabel('Under which parent').selectOption({ label: parentForChild });
    const childName = `Picker Child ${Date.now()}`;
    await section.getByLabel('Name').fill(childName);
    await section.getByRole('button', { name: 'Apply' }).click();
    await expect(section.getByRole('status')).toContainText(/added/i, { timeout: 30_000 });
    const parentCard = section.locator(`li:has(> p:text-is("${parentForChild}"))`);
    await expect(parentCard.getByText(childName)).toBeVisible({ timeout: 30_000 });

    const renamedChild = `${childName} Renamed`;
    await section.getByLabel('Operation').selectOption('rename');
    const which = section.getByLabel('Which category');
    await which.selectOption({ label: childName });
    await expect(which.locator('option:checked')).toHaveText(childName);

    await section.getByLabel('Name').fill(renamedChild);
    await section.getByRole('button', { name: 'Apply' }).click();
    await expect(section.getByRole('status')).toContainText(/renamed/i, { timeout: 30_000 });
    await expect(parentCard.getByText(renamedChild)).toBeVisible({ timeout: 30_000 });
    await expect(parentCard.getByText(childName, { exact: true })).toHaveCount(0);
  });

  test('switching operations does not retain an unintended target', async ({ page }) => {
    await page.goto('/settings');
    const section = page.getByRole('region', { name: /Category tree/i });
    await waitForCategoryEditor(page);

    await section.getByLabel('Operation').selectOption('rename');
    const which = section.getByLabel('Which category');
    await which.selectOption({ label: 'Housing (parent)' });
    await expect(which.locator('option:checked')).toHaveText('Housing (parent)');

    await section.getByLabel('Operation').selectOption('add-parent');
    await expect(section.getByLabel('Which category')).toHaveCount(0);

    await section.getByLabel('Operation').selectOption('rename');
    const whichAgain = section.getByLabel('Which category');
    await expect(whichAgain).toHaveValue('');
  });

  test('retirement picker also shows correct visible selection', async ({ page }) => {
    test.slow();
    await page.goto('/settings');
    const section = page.getByRole('region', { name: /Category tree/i });
    await waitForCategoryEditor(page);

    const parent = `Retire Parent ${Date.now()}`;
    await section.getByLabel('Operation').selectOption('add-parent');
    await section.getByLabel('Name').fill(parent);
    await section.getByRole('button', { name: 'Apply' }).click();
    await expect(section.getByRole('status')).toContainText(/added/i, { timeout: 30_000 });

    await section.getByLabel('Operation').selectOption('add-child');
    await section.getByLabel('Under which parent').selectOption({ label: parent });
    const child = `Retire Child ${Date.now()}`;
    await section.getByLabel('Name').fill(child);
    await section.getByRole('button', { name: 'Apply' }).click();
    await expect(section.getByRole('status')).toContainText(/added/i, { timeout: 30_000 });

    await section.getByLabel('Operation').selectOption('retire');
    const which = section.getByLabel('Which category');
    await which.selectOption({ label: child });
    await expect(which.locator('option:checked')).toHaveText(child);

    await section.getByRole('button', { name: 'Apply' }).click();
    await expect(section.getByRole('status')).toContainText(/retired/i, { timeout: 30_000 });
    const card = section.locator(`li:has(> p:text-is("${parent}"))`);
    await expect(card.getByText(child)).toHaveClass(/line-through/, { timeout: 30_000 });
  });
});
