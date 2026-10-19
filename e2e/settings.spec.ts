import { expect, test, type Locator } from '@playwright/test';
import { waitForPotDefaults, waitForTill } from './support';

/**
 * Settings → Category tree (SPEC §15.2). Regression for a field report on
 * v0.1.7: adding a parent or a child showed the success message but the new
 * entry was missing from the tree until a manual browser refresh.
 *
 * `saveCategoryAction` wrote correctly and returned `status: 'ok'`, but — unlike
 * every other Settings writer — it never revalidated. `CategoryTreeEditor`
 * renders the tree from server-rendered props, so the browser kept the previous
 * RSC payload. These tests therefore assert on the tree *without* ever calling
 * `page.reload()`, and rename/retire are covered because they had the same
 * stale-tree risk.
 *
 * Names are fictional. The rename/retire cases operate on categories this spec
 * creates, so the seeded `Groceries / Weekly Shop` the other specs pick is left
 * alone and a CI retry starts from a clean state.
 */
const PARENT = 'Playwright Garden';
const CHILD = 'Playwright Seedlings';
const RENAMED_CHILD = 'Playwright Seedlings Renamed';

/**
 * The parent card, not one of its own child rows: the tree is a nested list, so
 * a bare `hasText` filter matches the parent `li` *and* every `li` beneath it.
 * A card is the `li` that directly holds the parent name in its `p`.
 */
const parentCard = (section: Locator) => section.locator(`li:has(> p:text-is("${PARENT}"))`);

test.describe('category tree', () => {
  test('a new parent appears in the tree without a refresh', async ({ page }) => {
    await page.goto('/settings');
    const section = page.getByRole('region', { name: /Category tree/i });
    await expect(section.getByRole('heading', { name: 'Category tree', level: 2 })).toBeVisible();
    await expect(section.locator('li p', { hasText: PARENT })).toHaveCount(0);

    await section.getByLabel('Operation').selectOption('add-parent');
    await section.getByLabel('Name').fill(PARENT);
    await section.getByRole('button', { name: 'Apply' }).click();

    await expect(section.getByRole('status')).toContainText(/added/i, { timeout: 30_000 });
    // No page.reload(): the revalidated tree has to arrive on its own.
    await expect(section.locator('li p', { hasText: PARENT })).toHaveCount(1, { timeout: 30_000 });
    await expect(parentCard(section).getByText('No children yet')).toBeVisible();
  });

  test('a new child appears under its parent without a refresh', async ({ page }) => {
    await page.goto('/settings');
    const section = page.getByRole('region', { name: /Category tree/i });

    await section.getByLabel('Operation').selectOption('add-child');
    // The parent the previous test created is only selectable if the tree this
    // form renders came from the revalidated page, not a stale payload.
    await section.getByLabel('Under which parent').selectOption({ label: PARENT });
    await section.getByLabel('Name').fill(CHILD);
    await section.getByRole('button', { name: 'Apply' }).click();

    await expect(section.getByRole('status')).toContainText(/added/i, { timeout: 30_000 });
    const card = parentCard(section);
    await expect(card.getByText(CHILD)).toBeVisible({ timeout: 30_000 });
    await expect(card.getByText('No children yet')).toHaveCount(0);
  });

  test('rename and retire update the tree without a refresh', async ({ page }) => {
    test.slow();
    await page.goto('/settings');
    const section = page.getByRole('region', { name: /Category tree/i });
    const card = parentCard(section);

    // Child options carry the bare name; parent options are suffixed "(parent)".
    await section.getByLabel('Operation').selectOption('rename');
    await section.getByLabel('Which category').selectOption({ label: CHILD });
    await section.getByLabel('Name').fill(RENAMED_CHILD);
    await section.getByRole('button', { name: 'Apply' }).click();

    await expect(section.getByRole('status')).toContainText(/renamed/i, { timeout: 30_000 });
    await expect(card.getByText(RENAMED_CHILD)).toBeVisible({ timeout: 30_000 });

    await section.getByLabel('Operation').selectOption('retire');
    await section.getByLabel('Which category').selectOption({ label: RENAMED_CHILD });
    await section.getByRole('button', { name: 'Apply' }).click();

    await expect(section.getByRole('status')).toContainText(/retired/i, { timeout: 30_000 });
    // Retired children stay visible but struck through, so history is preserved.
    await expect(card.getByText(RENAMED_CHILD)).toHaveClass(/line-through/, { timeout: 30_000 });
  });
});

/**
 * Pot defaults (GitHub issue #79). The detached Quick entry and All
 * Transactions cards are gone: each pot card now carries the three ticks
 * that choose where the till, All Transactions and a new schedule start.
 * These run in the settings project, after the mobile project has asserted
 * the seeded default, and leave every use *cleared* — that state is the
 * point of the final assertions. Any spec that runs after this one and
 * records a purchase names its pot explicitly (the payday scenario does so);
 * the till cannot save without one.
 */
test.describe('pot defaults', () => {
  test('the Till tick moves the Quick Entry form and clears again', async ({ page }) => {
    await page.goto('/settings');
    await waitForPotDefaults(page);
    const salary = potDefaultForm(page, 'Salary account');

    await salary.getByRole('checkbox', { name: 'Salary account — default for Till' }).check();
    await salary.getByRole('button', { name: 'Save default uses' }).click();
    await expect(salary.getByRole('status')).toContainText(/default uses saved/i, {
      timeout: 30_000,
    });

    await page.goto('/');
    await waitForTill(page);
    const entry = page.getByRole('region', { name: /Record it while it is fresh/i });
    await expect(entry.getByLabel('Pot').locator('option:checked')).toHaveText('Salary account');

    // Back to "no default": the form starts with no pot selected rather than
    // silently falling back to the first pot in the list.
    await page.goto('/settings');
    await waitForPotDefaults(page);
    const salaryAgain = potDefaultForm(page, 'Salary account');
    await salaryAgain
      .getByRole('checkbox', { name: 'Salary account — default for Till' })
      .uncheck();
    await salaryAgain.getByRole('button', { name: 'Save default uses' }).click();
    await expect(salaryAgain.getByRole('status')).toContainText(/default uses saved/i, {
      timeout: 30_000,
    });
    await page.goto('/');
    await waitForTill(page);
    await expect(entry.getByLabel('Pot').locator('option:checked')).toHaveText('Choose…');
  });

  test('the Transactions tick applies until a target is chosen (issue #44)', async ({ page }) => {
    await page.goto('/settings');
    await waitForPotDefaults(page);
    const salary = potDefaultForm(page, 'Salary account');

    await salary
      .getByRole('checkbox', { name: 'Salary account — default for Transactions' })
      .check();
    await salary.getByRole('button', { name: 'Save default uses' }).click();
    await expect(salary.getByRole('status')).toContainText(/default uses saved/i, {
      timeout: 30_000,
    });

    // No potId in the URL: open on the saved preference.
    await page.goto('/transactions');
    const filters = page.getByRole('form', { name: 'Activity filters' });
    const target = filters.getByLabel('Target');
    await expect(target.locator('option:checked')).toHaveText('Salary account');

    // An invalid URL target is ignored, so the saved default still applies.
    await page.goto('/transactions?potId=999999');
    const invalidTarget = page.getByRole('form', { name: 'Activity filters' }).getByLabel('Target');
    await expect(invalidTarget.locator('option:checked')).toHaveText('Salary account');

    // An explicit target always wins over the saved default.
    await invalidTarget.selectOption({ label: 'Main account' });
    await filters.getByRole('button', { name: 'Show activity' }).click();
    await expect(target.locator('option:checked')).toHaveText('Main account');

    // Clearing the tick restores the page's existing fallback.
    await page.goto('/settings');
    await waitForPotDefaults(page);
    const salaryAgain = potDefaultForm(page, 'Salary account');
    await salaryAgain
      .getByRole('checkbox', { name: 'Salary account — default for Transactions' })
      .uncheck();
    await salaryAgain.getByRole('button', { name: 'Save default uses' }).click();
    await expect(salaryAgain.getByRole('status')).toContainText(/default uses saved/i, {
      timeout: 30_000,
    });
    await page.goto('/transactions');
    await expect(page.getByLabel('Target').locator('option:checked')).toHaveText('Main account');
  });

  test('the New DD/SO tick starts a schedule and moves between pots', async ({ page }) => {
    await page.goto('/settings');
    await waitForPotDefaults(page);
    const main = potDefaultForm(page, 'Main account');
    await main.getByRole('checkbox', { name: 'Main account — default for New DD/SO' }).check();
    await main.getByRole('button', { name: 'Save default uses' }).click();
    await expect(main.getByRole('status')).toContainText(/default uses saved/i, {
      timeout: 30_000,
    });

    // A new schedule opens on the chosen pot.
    await page.goto('/recurring');
    const schedules = page.locator('section[aria-labelledby="schedules-heading"]');
    await schedules.getByText('Add a schedule').click();
    const addForm = schedules
      .locator('form')
      .filter({ has: page.getByRole('button', { name: 'Add schedule' }) });
    await expect(addForm.locator('select[name="potId"]').locator('option:checked')).toHaveText(
      'Main account',
    );

    // One account per use: ticking Salary account moves the default and
    // clears Main account's tick without a reload.
    await page.goto('/settings');
    await waitForPotDefaults(page);
    const salary = potDefaultForm(page, 'Salary account');
    await salary.getByRole('checkbox', { name: 'Salary account — default for New DD/SO' }).check();
    await salary.getByRole('button', { name: 'Save default uses' }).click();
    await expect(salary.getByRole('status')).toContainText(/default uses saved/i, {
      timeout: 30_000,
    });
    await expect(
      potDefaultForm(page, 'Main account').getByRole('checkbox', {
        name: 'Main account — default for New DD/SO',
      }),
    ).not.toBeChecked();

    // Leave no default behind for the projects that run after this one.
    await salary
      .getByRole('checkbox', { name: 'Salary account — default for New DD/SO' })
      .uncheck();
    await salary.getByRole('button', { name: 'Save default uses' }).click();
    await expect(salary.getByRole('status')).toContainText(/default uses saved/i, {
      timeout: 30_000,
    });
  });
});

/**
 * The default-use form for one pot. The three ticks' accessible names carry
 * the pot label, so the containing form is unambiguous.
 */
function potDefaultForm(page: import('@playwright/test').Page, potLabel: string) {
  return page.locator('form').filter({
    has: page.getByRole('checkbox', { name: `${potLabel} — default for Till` }),
  });
}
