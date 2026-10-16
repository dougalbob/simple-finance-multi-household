import { expect, test, type Page } from '@playwright/test';

/**
 * Annual vehicle payments on Insights (SPEC §16.3, decision 190). A yearly
 * premium on a vehicle reads as one twelfth in each month it covers, so it can
 * be compared with a monthly direct debit. The purchase history still records
 * the one payment on its due date.
 *
 * Fictional throughout: a made-up vehicle, insurer and £600.00 premium. The spec
 * adds its own vehicle, so no seeded running cost moves, and it runs near the
 * end of the run (playwright.config.ts) so the schedule it adds cannot change
 * another spec's figures. The premium falls due on the first of last month,
 * which is converted as soon as Insights reads, and it started thirteen months
 * back. The two payments that count therefore cover exactly the twelve months
 * of the rolling window: £600.00 over the year, £50.00 a month.
 */
const VEHICLE = 'Playwright Estate';
const INSURER = 'Playwright Insurer Ltd';

function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

test.describe('annual vehicle payments', () => {
  test('a yearly premium reads as one twelfth a month on Insights', async ({ page }) => {
    test.slow();
    const now = new Date();
    const monthStart = (offset: number) => new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const lastMonth = monthStart(-1);
    const activeFrom = monthStart(-13);

    // 1. A vehicle of its own (SPEC §13), so the figures are this spec's alone.
    await page.goto('/settings');
    const addVehicle = page.getByRole('form', { name: 'Add vehicle' });
    await addVehicle.getByLabel('Name').fill(VEHICLE);
    await addVehicle.getByRole('button', { name: 'Add vehicle' }).click();
    await expect(addVehicle.getByRole('status')).toContainText(/vehicle added/i, {
      timeout: 30_000,
    });

    // 2. The premium, as an annual direct debit for that vehicle.
    await page.goto('/recurring');
    const schedules = page.locator('section[aria-labelledby="schedules-heading"]');
    await schedules.getByText('Add a schedule').click();
    const form = schedules
      .locator('form')
      .filter({ has: page.getByRole('button', { name: 'Add schedule' }) });
    await form.locator('input[name="name"]').fill(`${INSURER} premium`);
    await form.locator('input[name="amount"]').fill('600.00');
    await form.locator('select[name="kind"]').selectOption('dd');
    await form.locator('select[name="frequency"]').selectOption('annual');
    await form.locator('select[name="dueMonth"]').selectOption(String(lastMonth.getMonth() + 1));
    await form.locator('input[name="dueDayOfMonth"]').fill('1');
    await form.locator('select[name="categoryId"]').selectOption({
      label: 'Vehicle Running / Insurance',
    });
    await form.locator('select[name="supplierId"]').selectOption({ label: 'Add a new supplier…' });
    await form.locator('input[name="supplierName"]').fill(INSURER);
    await form.locator('select[name="target"]').selectOption({ label: `Vehicle — ${VEHICLE}` });
    await form.locator('input[name="activeFrom"]').fill(isoDate(activeFrom));
    await form.getByRole('button', { name: 'Add schedule' }).click();
    await expect(form.getByRole('status')).toContainText(/added/i, { timeout: 30_000 });

    // 3. Insights: the vehicle's card shows the premium as one twelfth a month.
    await page.goto('/insights');
    const card = page.locator('div[id^="vehicle-"]').filter({ hasText: VEHICLE });
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card).toContainText('£600.00');
    await expect(card).toContainText('this month £50.00');
    await expect(card).toContainText('previous month £50.00');
    await expect(card.getByText('(annual ÷ 12)')).toBeVisible();
    await expect(card.getByText('An annual payment is shown as ÷ 12')).toBeVisible();

    // 4. Purchases: the history keeps each payment once, on its due date.
    await page.goto(`/purchases?from=${isoDate(activeFrom)}&to=${isoDate(now)}`);
    const payments = page.locator('tbody tr', { hasText: INSURER });
    await expect(payments).toHaveCount(2, { timeout: 30_000 });
    await expect(payments.first()).toContainText('£600.00');
  });
});

test.describe('By Person month navigation (issues #26 and #45)', () => {
  test('prev/next preserve the current scroll position on phone and desktop', async ({ page }) => {
    for (const width of [390, 1400]) {
      await page.setViewportSize({ width, height: 950 });
      await page.goto('/insights');
      const panel = page.locator('section[aria-labelledby="panel-persons-heading"]');
      const heading = panel.getByRole('heading', { name: /^By person/ });
      const prev = panel.getByRole('link', { name: 'Prev' });
      const next = panel.getByRole('link', { name: 'Next' });
      // Keep a real fragment in each URL for direct/no-JavaScript navigation.
      // A soft month change is an in-place choice and must not follow that hash.
      await expect(heading).toHaveClass(/sf-anchor/);
      await expect(prev).toHaveAttribute('href', /#panel-persons-heading$/);
      await expect(next).toHaveAttribute('href', /#panel-persons-heading$/);
      await page.waitForFunction(() =>
        Boolean(document.documentElement.style.getPropertyValue('--sf-anchor-offset')),
      );

      await heading.evaluate((element) => {
        window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 160);
      });
      const initialScrollY = await page.evaluate(() => window.scrollY);
      expect(initialScrollY).toBeGreaterThan(100);
      const initialMonthHeading = await heading.innerText();

      await next.click();
      await expect(page).toHaveURL(/month=.*#panel-persons-heading$/);
      await expect(heading).not.toHaveText(initialMonthHeading);
      await page.waitForTimeout(450);
      const nextScrollY = await page.evaluate(() => window.scrollY);
      expect(
        Math.abs(nextScrollY - initialScrollY),
        `${width}px: Next should leave the page at the same vertical position`,
      ).toBeLessThan(8);
      await expect(heading).toBeInViewport();
      const headerBottom = (await page.locator('header.sticky').boundingBox())?.height ?? 0;
      const headingTop = (await heading.boundingBox())?.y ?? -1;
      expect(headingTop, 'the heading sits under the sticky header').toBeGreaterThanOrEqual(
        headerBottom - 1,
      );

      await prev.click();
      await expect(page).toHaveURL(/month=.*#panel-persons-heading$/);
      await expect(heading).toHaveText(initialMonthHeading);
      await page.waitForTimeout(450);
      const prevScrollY = await page.evaluate(() => window.scrollY);
      expect(
        Math.abs(prevScrollY - initialScrollY),
        `${width}px: Prev should leave the page at the same vertical position`,
      ).toBeLessThan(8);
    }
  });
});

test.describe('honesty loop tolerance band (issue #27)', () => {
  test('the groceries verdict speaks in bands, with the percent once it matters', async ({
    page,
  }) => {
    await page.goto('/insights');
    const loop = page.getByRole('region', { name: /configured figures honest/i });
    const groceries = loop.locator('div.rounded-lg', { hasText: 'Actual average weekly' });
    // The seed's shops drift upwards against the configured £85, robustly
    // past the +10% edge whatever weekday the suite runs on (any trailing-8
    // window of seed shops averages over £96 — and the till specs only add
    // to the in-progress week, which the average never sees). So the verdict
    // says outside the usual range, with the percent.
    await expect(groceries).toContainText(/outside the usual range/);
    await expect(groceries).toContainText(/\d+% over/);
    // …while the configured and actual figures the charts agree on stay put.
    await expect(groceries).toContainText('Configured weekly');
    await expect(groceries).toContainText('Actual average weekly');
  });
});

/**
 * The Insights line-item drill (issue #68): the household reads a figure, the
 * line items open, and closing them puts the reader back exactly where they
 * started — the top of the page for the month card, the row they read for a
 * category, and the card they read for a vehicle.
 */
test.describe('the Insights line-item drill (issue #68)', () => {
  const headerHeight = async (page: Page): Promise<number> =>
    (await page.locator('header.sticky').boundingBox())?.height ?? 0;

  test('a month total opens its line items, and closing them returns to the top of the page', async ({
    page,
  }) => {
    await page.goto('/insights');
    const panel = page.locator('section[aria-labelledby="panel-month-heading"]');
    const card = panel.locator('div.grid > div.rounded-lg').first();
    await card.locator('a.sf-link').click();

    // The line items open in view, clear of the sticky menu.
    const drill = page.locator('#month-drill');
    await expect(drill).toBeVisible();
    const drillBox = await drill.boundingBox();
    expect(drillBox?.y ?? 0).toBeGreaterThanOrEqual((await headerHeight(page)) - 1);

    // Closing them returns to the top of the page, where the month totals are.
    await page.getByRole('link', { name: 'Close line items' }).click();
    await expect(page).not.toHaveURL(/show=/);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.scrollY)).toBeLessThan(8);
    await expect(card).toBeInViewport();
  });

  test('a category opens its line items immediately below its own row, and closing returns to that row', async ({
    page,
  }) => {
    await page.goto('/insights');
    const panel = page.locator('section[aria-labelledby="panel-month-heading"]');
    const row = panel
      .locator('tbody tr')
      .filter({ has: page.locator('a.sf-link') })
      .first();
    const category = (await row.locator('td').first().innerText()).trim();
    await row.locator('a.sf-link').first().click();

    // The line items are inside the table, in the row directly after the
    // category line that was clicked.
    await expect(page.locator('#month-drill')).toBeVisible();
    const placement = await page.evaluate((name) => {
      const panelElement = document.querySelector('section[aria-labelledby="panel-month-heading"]');
      const rows = Array.from(panelElement?.querySelectorAll('tbody > tr') ?? []);
      const drillRow = document.getElementById('month-drill')?.closest('tr') ?? null;
      const categoryRow = rows.find(
        (candidate) => candidate.querySelector('td')?.textContent?.trim() === name,
      );
      return {
        drillIndex: rows.indexOf(drillRow as HTMLTableRowElement),
        categoryIndex: rows.indexOf(categoryRow as HTMLTableRowElement),
      };
    }, category);
    expect(placement.drillIndex).toBe(placement.categoryIndex + 1);

    // Closing puts the reader back on the row they read.
    await page.getByRole('link', { name: 'Close line items' }).click();
    await page.waitForTimeout(500);
    const rowBox = await row.boundingBox();
    const bar = await headerHeight(page);
    expect(rowBox?.y ?? 0).toBeGreaterThanOrEqual(bar - 1);
    expect(rowBox?.y ?? 0).toBeLessThan(bar + 120);
  });

  test('a vehicle card closes its line items with the card just below the menu', async ({
    page,
  }) => {
    await page.goto('/insights');
    const card = page.locator('div[id^="vehicle-"]').first();
    await card.scrollIntoViewIfNeeded();
    await card.locator('a.sf-link').first().click();
    await expect(page.locator('#vehicle-drill')).toBeVisible();

    await page.getByRole('link', { name: 'Close line items' }).click();
    await page.waitForTimeout(500);
    const cardBox = await card.boundingBox();
    const bar = await headerHeight(page);
    // The card's top sits just below the menu — not behind it.
    expect(cardBox?.y ?? 0).toBeGreaterThanOrEqual(bar - 1);
    expect(cardBox?.y ?? 0).toBeLessThan(bar + 40);
  });

  test('a £0.00 figure is greyed out and opens nothing', async ({ page }) => {
    await page.goto('/insights');
    const panel = page.locator('section[aria-labelledby="panel-month-heading"]');
    const zero = panel.locator('tbody td span.text-ink-muted', { hasText: '£0.00' }).first();
    await expect(zero).toBeVisible();
    // Plain muted text, never a link: there is nothing behind a zero figure.
    expect(await zero.evaluate((element) => element.tagName)).toBe('SPAN');
    expect(await zero.evaluate((element) => element.closest('a'))).toBeNull();
  });
});
