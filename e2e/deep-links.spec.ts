import { expect, test, type Page } from '@playwright/test';
import { waitForFilters } from './support';

/** The visible household-total card, shared by the phone home and Overview. */
function moneyCard(page: Page) {
  return page.locator('section[aria-labelledby="money-heading"]');
}

/** Filter the supplier list as a household would, then expand the matching card. */
async function openEnergySupplier(page: Page) {
  await page.goto('/suppliers');
  await page.getByLabel('Filter suppliers').fill('Wattstream');
  const card = page.locator('article').filter({
    has: page.getByRole('heading', { name: 'Wattstream Energy', exact: true }),
  });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: /Wattstream Energy/ }).click();
  const recent = card
    .getByRole('heading', { name: 'Recent purchases' })
    .locator('xpath=following-sibling::ul[1]');
  await expect(recent).toBeVisible();
  return recent;
}

test.describe('account and supplier deep links', () => {
  for (const width of [393, 1400]) {
    test(`account names open the right pot on Overview and home at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 950 });
      for (const path of ['/overview', '/']) {
        await page.goto(path);
        const money = moneyCard(page);
        const main = money.getByRole('link', { name: 'View transactions for Main account' });
        const salary = money.getByRole('link', { name: 'View transactions for Salary account' });
        await expect(main).toBeVisible();
        await expect(salary).toBeVisible();
        await expect(main).toHaveCSS('text-decoration-line', 'underline');
        const mainUrl = new URL((await main.getAttribute('href')) ?? '', 'http://test');
        const salaryUrl = new URL((await salary.getAttribute('href')) ?? '', 'http://test');
        expect(mainUrl.pathname).toBe('/transactions');
        expect(salaryUrl.pathname).toBe('/transactions');
        expect(mainUrl.searchParams.get('potId')).toMatch(/^\d+$/);
        expect(salaryUrl.searchParams.get('potId')).toMatch(/^\d+$/);
        expect(salaryUrl.searchParams.get('potId')).not.toBe(mainUrl.searchParams.get('potId'));
        expect([...salaryUrl.searchParams.keys()]).toEqual(['potId']);

        for (const label of ["Alex's cash", "Sam's cash"]) {
          const cash = money.locator('li').filter({ hasText: label });
          await expect(cash).toBeVisible();
          await expect(cash.locator('a')).toHaveCount(0);
        }

        // Both accounts really select their own pot. The non-default one is
        // especially important: it must override Transactions' saved default,
        // while leaving the normal last-30-days range untouched.
        for (const [index, [label, url]] of (
          [
            ['Salary account', salaryUrl],
            ['Main account', mainUrl],
          ] as const
        ).entries()) {
          if (index > 0) await page.goto(path);
          await moneyCard(page)
            .getByRole('link', { name: `View transactions for ${label}` })
            .click();
          await expect(
            page.getByRole('heading', { name: 'Activity in one pot', level: 1 }),
          ).toBeVisible();
          await waitForFilters(page);
          await expect(page.getByLabel('Target', { exact: true })).toHaveValue(
            url.searchParams.get('potId') ?? '',
          );
          await expect(page.locator('#activity-pot option:checked')).toHaveText(label);
          await expect(page.getByLabel('Range', { exact: true })).toHaveValue('last-30-days');
        }
      }
    });

    test(`supplier history opens the selected original and can clear its filter at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 950 });
      const recent = await openEnergySupplier(page);
      const links = recent.getByRole('link', { name: /open this purchase on Purchases/ });
      await expect(links).toHaveCount(5);
      const firstHref = await links.first().getAttribute('href');
      const selected = links.last(); // an older entry, well outside the last 30 days
      const selectedHref = await selected.getAttribute('href');
      expect(firstHref).not.toBe(selectedHref);
      const destination = new URL(selectedHref ?? '', 'http://test');
      const purchaseId = destination.searchParams.get('purchaseId');
      expect(destination.pathname).toBe('/purchases');
      expect(purchaseId).toMatch(/^\d+$/);
      expect(destination.hash).toBe(`#purchase-${purchaseId}`);
      const amount = (await selected.innerText()).match(/£[\d,]+\.\d{2}/)?.[0];
      expect(amount).toBeTruthy();
      await expect(selected).toHaveCSS('text-decoration-line', 'underline');

      await selected.click();
      await expect(page.getByRole('heading', { name: 'Every recorded purchase' })).toBeVisible();
      await expect(page).toHaveURL(
        new RegExp(`/purchases\\?purchaseId=${purchaseId}#purchase-${purchaseId}$`),
      );
      const results = page.locator('section[aria-labelledby="results-heading"]');
      const row = results.locator(`tr#purchase-${purchaseId}`);
      await expect(results.locator('tbody > tr')).toHaveCount(1);
      await expect(row).toBeInViewport();
      await expect(row).toContainText('Wattstream Energy');
      await expect(row).toContainText(amount ?? '');
      await expect(row.getByText('History', { exact: true })).toBeVisible();
      // The deep link lands on the real Purchases row, with its ordinary
      // editor and existing details, not a read-only supplier summary.
      await row.locator('summary', { hasText: 'Edit' }).click();
      await row.getByRole('button', { name: 'Edit', exact: true }).click();
      await expect(row.getByLabel('Note (blank keeps the current note)')).toHaveValue(
        'Energy bill',
      );
      await expect(row.getByRole('button', { name: 'Save purchase' })).toBeVisible();
      const chip = page.getByLabel(`Remove the purchase filter: #${purchaseId}`);
      await expect(chip).toBeVisible();

      // A normal search composes with the ID filter, and removing the chip
      // clears only that ID while retaining the search.
      await waitForFilters(page);
      if (width < 640) await page.getByRole('button', { name: 'Show filters' }).click();
      await page.getByLabel('Search supplier, category or notes').fill('Wattstream');
      await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('Wattstream');
      await expect(results.locator('tbody > tr')).toHaveCount(1);
      await chip.click();
      await expect.poll(() => new URL(page.url()).searchParams.has('purchaseId')).toBe(false);
      expect(new URL(page.url()).searchParams.get('q')).toBe('Wattstream');
      await expect.poll(() => results.locator('tbody > tr').count()).toBeGreaterThan(1);

      // A different row on the same supplier really links to a different
      // original, not merely to that supplier's general purchases.
      const recentAgain = await openEnergySupplier(page);
      const first = recentAgain
        .getByRole('link', { name: /open this purchase on Purchases/ })
        .first();
      const firstUrl = new URL((await first.getAttribute('href')) ?? '', 'http://test');
      const firstId = firstUrl.searchParams.get('purchaseId');
      expect(firstId).not.toBe(purchaseId);
      await first.click();
      await expect(page.locator(`tr#purchase-${firstId}`)).toBeInViewport();
      await expect(
        page.locator('section[aria-labelledby="results-heading"] tbody > tr'),
      ).toHaveCount(1);

      // The card only shows the five most recent; its separate link gives
      // access to older history, filtered to this supplier on Purchases.
      await openEnergySupplier(page);
      await page.getByRole('link', { name: 'All purchases from Wattstream Energy →' }).click();
      await expect(page.getByLabel('Remove the supplier filter: Wattstream Energy')).toBeVisible();
      await expect
        .poll(() => page.locator('section[aria-labelledby="results-heading"] tbody > tr').count())
        .toBeGreaterThan(5);
    });
  }

  test('missing and malformed purchase IDs do not break the history page', async ({ page }) => {
    await page.goto('/purchases?purchaseId=99999999#purchase-99999999');
    await expect(page.getByText('Nothing matches these filters.')).toBeVisible();
    await page.getByLabel('Remove the purchase filter: #99999999').click();
    await expect(
      page.locator('section[aria-labelledby="results-heading"] tbody > tr').first(),
    ).toBeVisible();

    await page.goto('/purchases?purchaseId=not-a-number');
    await expect(page.getByRole('heading', { name: 'Every recorded purchase' })).toBeVisible();
    await expect(page.getByLabel(/^Remove the purchase filter:/)).toHaveCount(0);
    await expect(
      page.locator('section[aria-labelledby="results-heading"] tbody > tr').first(),
    ).toBeVisible();
  });
});
