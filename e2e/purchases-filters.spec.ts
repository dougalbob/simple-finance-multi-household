import { expect, test, type Page } from '@playwright/test';
import { addDaysIso, londonToday, waitForFilters } from './support';

/**
 * The Purchases filter bar after the household's follow-up to GitHub issue
 * #98: the Pot and Paid by drop-downs are gone, the Supplier and Category
 * drop-downs became one search over the supplier, every category and the
 * notes, and the dates gained the All Transactions Range drop-down.
 *
 * Runs after `transactions` (its own project, `purchases-filters`): it reads
 * the shared seeded history and records nothing itself, so it can sit after
 * every spec that adds or edits purchases.
 */

/** The Purchases result table — every assertion about rows is scoped to it. */
function results(page: Page): ReturnType<Page['locator']> {
  return page.locator('section[aria-labelledby="results-heading"]');
}

test.describe('purchases filters', () => {
  test('the removed drop-downs are gone and the dates keep the Range preset', async ({ page }) => {
    await page.goto('/purchases');
    await waitForFilters(page);
    const form = page.getByRole('form', { name: 'Purchase filters' });

    // Pot and Paid by are gone — never used — and so are the Supplier and
    // Category selects the search replaces.
    await expect(form.getByLabel('Pot', { exact: true })).toHaveCount(0);
    await expect(form.getByLabel('Paid by', { exact: true })).toHaveCount(0);
    await expect(form.getByLabel('Supplier', { exact: true })).toHaveCount(0);
    await expect(form.getByLabel('Category', { exact: true })).toHaveCount(0);
    await expect(form.getByLabel('Search supplier, category or notes')).toBeVisible();

    // No date filter is the page's default, and the select says so.
    const range = form.getByLabel('Range');
    await expect(range).toHaveValue('all');
    await expect(form.getByLabel('From date')).toHaveValue('');
    await expect(form.getByLabel('To date')).toHaveValue('');

    const today = londonToday();
    const monthStart = `${today.slice(0, 7)}-01`;
    const lastMonthEnd = addDaysIso(monthStart, -1);
    const lastMonthStart = `${lastMonthEnd.slice(0, 7)}-01`;

    // Choosing a range applies it at once, exactly as All Transactions does,
    // and the two date boxes fill in — they stay editable underneath.
    await range.selectOption({ label: 'This month' });
    await expect.poll(() => new URL(page.url()).searchParams.get('from')).toBe(monthStart);
    await expect(form.getByLabel('From date')).toHaveValue(monthStart);
    await expect(form.getByLabel('To date')).toHaveValue(today);

    await range.selectOption({ label: 'Last Month' });
    await expect.poll(() => new URL(page.url()).searchParams.get('from')).toBe(lastMonthStart);
    await expect(form.getByLabel('From date')).toHaveValue(lastMonthStart);
    await expect(form.getByLabel('To date')).toHaveValue(lastMonthEnd);

    // Hand-editing a date is a custom window, and the select says so.
    await form.getByLabel('From date').fill(addDaysIso(today, -45));
    await form.getByRole('button', { name: 'Apply filters' }).click();
    await expect
      .poll(() => new URL(page.url()).searchParams.get('from'))
      .toBe(addDaysIso(today, -45));
    await expect(range).toHaveValue('custom');

    // All clears the date filter entirely — this page's history starts where
    // it starts, so there is no sentinel start date to carry.
    await range.selectOption({ label: 'All' });
    await expect.poll(() => new URL(page.url()).searchParams.has('from')).toBe(false);
    await expect.poll(() => new URL(page.url()).searchParams.has('to')).toBe(false);
    await expect(form.getByLabel('From date')).toHaveValue('');
  });

  test('one search reads the supplier, the categories and the notes (issue #98 follow-up)', async ({
    page,
  }) => {
    await page.goto('/purchases');
    await waitForFilters(page);
    const form = page.getByRole('form', { name: 'Purchase filters' });
    const search = form.getByLabel('Search supplier, category or notes');
    const table = results(page);

    // By supplier: every row left names Greenfield Market, and the heading
    // says what is being shown.
    await search.fill('Greenfield');
    await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('Greenfield');
    await expect(table.getByRole('heading', { level: 2 })).toContainText('matching “Greenfield”');
    await expect(table.locator('tbody tr').first()).toContainText('Greenfield Market');
    const supplierRows = await table.locator('tbody tr').allInnerTexts();
    expect(supplierRows.length).toBeGreaterThan(0);
    for (const row of supplierRows) expect(row).toContain('Greenfield Market');

    // Two words across two columns: the supplier and a word from the notes.
    await search.fill('greenfield weekly');
    await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('greenfield weekly');
    const weeklyRows = await table.locator('tbody tr').allInnerTexts();
    expect(weeklyRows.length).toBeGreaterThan(0);
    for (const row of weeklyRows) {
      expect(row).toContain('Greenfield Market');
      expect(row).toContain('Weekly shop');
    }

    // By category alone: a category word that is not a supplier and not a
    // note still finds the records — the Categories column is searched too.
    await search.fill('groceries');
    await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('groceries');
    const categoryRows = await table.locator('tbody tr').allInnerTexts();
    expect(categoryRows.length).toBeGreaterThan(0);
    for (const row of categoryRows) expect(row).toContain('Groceries');

    // By notes alone.
    await search.fill('top-up');
    await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('top-up');
    for (const row of await table.locator('tbody tr').allInnerTexts()) {
      expect(row.toLowerCase()).toContain('top-up');
    }

    // Nothing matching says so, and the clear link keeps the rest of the URL.
    await page.goto('/purchases?from=2020-01-01&to=2020-01-02');
    await waitForFilters(page);
    await form.getByLabel('Search supplier, category or notes').fill('nothing like this exists');
    await expect(page.getByText(/Nothing matches/).first()).toBeVisible();
    await expect(page.getByText(/in the supplier, category or notes/)).toBeVisible();
    await page.getByRole('link', { name: 'Clear the search' }).click();
    await expect.poll(() => new URL(page.url()).searchParams.has('q')).toBe(false);
    // The window the page arrived with survives clearing the search.
    expect(new URL(page.url()).searchParams.get('from')).toBe('2020-01-01');
    await expect(form.getByLabel('Search supplier, category or notes')).toHaveValue('');
  });

  test('a filter a link brought in is shown as a chip, and the chip clears only that filter', async ({
    page,
  }) => {
    // The Overview page's Groceries figure links to Purchases with the
    // category — a filter the form no longer offers a control for.
    await page.setViewportSize({ width: 1400, height: 950 });
    await page.goto('/overview');
    const groceries = page.getByRole('link', { name: 'Groceries', exact: true });
    const groceriesUrl = new URL((await groceries.getAttribute('href')) ?? '', 'http://test');
    const categoryId = groceriesUrl.searchParams.get('categoryId') ?? '';
    await groceries.click();
    await expect(page.getByRole('heading', { name: 'Every recorded purchase' })).toBeVisible();

    const chip = page.getByLabel(/^Remove the category filter: /);
    await expect(chip).toHaveCount(1);
    await expect(chip).toContainText('Category:');
    // The results really are filtered by it, and the page says so.
    const table = results(page);
    await expect(table.getByRole('heading', { level: 2 })).not.toContainText('0 entries');

    // The chip removes the category and nothing else — the window stays.
    const from = new URL(page.url()).searchParams.get('from') ?? '';
    await chip.click();
    await expect.poll(() => new URL(page.url()).searchParams.has('categoryId')).toBe(false);
    expect(new URL(page.url()).searchParams.get('from')).toBe(from);
    await expect(page.getByLabel(/^Remove the category filter: /)).toHaveCount(0);
    expect(categoryId).toMatch(/^\d+$/);
  });
});
