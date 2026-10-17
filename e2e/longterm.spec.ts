import { expect, test, type Page } from '@playwright/test';

/**
 * Slice 2 of the long-term forecast (LONGTERM_FORECASTING.md): the page, the
 * answer cards, the three-rate comparison and the editable assumptions.
 *
 * The group is serial and starts by resetting the saved plan to a fresh draft,
 * so every assertion begins from the seed's records rather than whatever an
 * earlier run (or a retry) saved. The last test edits and saves the plan.
 */
async function resetToDraft(page: Page): Promise<void> {
  await page.goto('/longterm');
  await openAssumptions(page);
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Reset to a draft from records' }).click();
  await expect(page.getByText(/The draft was rebuilt from household records/)).toBeVisible();
  // The action message precedes router.refresh(); start edits on the persisted draft,
  // not on client state that the in-flight refresh is about to replace.
  await page.reload();
  await openAssumptions(page);
}

/** The panel opens by default only while a warning asks for a figure. */
async function openAssumptions(page: Page): Promise<void> {
  await expect(page.locator('[data-longterm-ready="true"]')).toBeAttached();
  const summary = page.getByText('The assumptions — every figure is editable');
  const baseline = page.getByLabel('Spending baseline, a month');
  if (!(await baseline.isVisible())) await summary.click();
  await expect(baseline).toBeVisible();
}

test.describe.serial('long-term forecast', () => {
  test('answers the household’s questions and shows the honesty flags', async ({ page }) => {
    await resetToDraft(page);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your money across the years');
    await expect(page.getByRole('region', { name: 'Income in 2030' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Income at age 62 — 2032' })).toBeVisible();
    await expect(page.getByText('Does the money last?')).toBeVisible();
    await expect(page.getByRole('heading', { name: /covers every year|runs out/ })).toBeVisible();

    // The honesty rule: a £0 "everything else" line is always flagged.
    await expect(page.getByText(/Other spending is £0\.00 a year/)).toBeVisible();
    await expect(page.getByText(/have no value yet|has no value yet/)).toBeVisible();

    // Three rates and the drawdown-versus-annuity comparison.
    await expect(
      page.getByRole('heading', { name: 'Three return assumptions, side by side' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Cautious 4.00%' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Middle 6.00%' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Optimistic 8.00%' }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /Drawdown or annuity/ })).toBeVisible();

    // The year table reaches the household's horizon (the younger person at 90).
    await expect(page.getByRole('link', { name: '2070', exact: true })).toBeVisible();
    await expect(page.getByText(/Tax \(est\.\)/).first()).toBeVisible();
  });

  test('asks an age as well as a year', async ({ page }) => {
    await page.goto('/longterm?year=2030&rate=middle&person=person-1&age=62');
    await expect(page.getByRole('region', { name: 'Income at age 62 — 2032' })).toBeVisible();

    await page.getByLabel('turns age').fill('60');
    await page.getByRole('button', { name: 'Show' }).click();
    await expect(page).toHaveURL(/age=60/);
    await expect(page.getByRole('region', { name: 'Income at age 60 — 2030' })).toBeVisible();
  });

  test('switches the comparison rate from the sustainability card', async ({ page }) => {
    await page.goto('/longterm?year=2030&rate=middle&person=person-1&age=62');
    await page.getByRole('link', { name: 'Cautious 4.00%' }).first().click();
    await expect(page).toHaveURL(/rate=cautious/);
    await expect(page.getByText(/shown at the cautious rate/)).toBeVisible();
  });

  test('saves an edited assumption and keeps it after a reload', async ({ page }) => {
    await page.goto('/longterm?year=2030&rate=middle&person=person-1&age=62');
    await openAssumptions(page);

    await page.getByLabel('Everything else, a year').fill('6000');
    await page.locator('#longterm-person-0-pot-0-value').fill('200000');
    await page.getByRole('button', { name: 'Save assumptions' }).click();

    await expect(
      page.getByText('Assumptions saved. The forecast below updates immediately.'),
    ).toBeVisible();

    await page.reload();
    await openAssumptions(page);
    await expect(page.getByLabel('Everything else, a year')).toHaveValue('6000.00');
    await expect(page.locator('#longterm-person-0-pot-0-value')).toHaveValue('200000.00');
    await expect(page.getByText(/Other spending is £0\.00 a year/)).toHaveCount(0);
    await expect(page.getByText(/Pension A, Pension B have no value yet/)).toHaveCount(0);
  });

  test('saves pension timing, earnings growth and the later plan-to horizon', async ({ page }) => {
    await resetToDraft(page);
    await expect(page.getByText(/fixed 3.50%; it does not follow/).first()).toBeVisible();
    await expect(page.getByLabel('Tax thresholds rise a year')).toHaveValue('1.00');
    await expect(
      page.getByText(/with allowances and bands rising 1.00% a year from 2027/),
    ).toBeVisible();

    await page.locator('#longterm-person-0-sex').selectOption('man');
    await expect(page.locator('#longterm-person-0-life-expectancy')).toHaveValue('84');
    await expect(page.locator('#longterm-person-0-plan-to')).toHaveValue('89');
    await page.locator('#longterm-person-1-sex').selectOption('woman');
    await expect(page.locator('#longterm-person-1-life-expectancy')).toHaveValue('87');
    await expect(page.locator('#longterm-person-1-plan-to')).toHaveValue('92');
    await expect(page.getByLabel('Forecast ends on')).toHaveValue('2072-12-31');
    await page.locator('#longterm-person-1-life-expectancy').fill('88');
    await expect(page.locator('#longterm-person-1-plan-to')).toHaveValue('93');
    await expect(page.getByLabel('Forecast ends on')).toHaveValue('2073-12-31');
    await page.locator('#longterm-person-1-plan-to').fill('94');
    await expect(page.getByLabel('Forecast ends on')).toHaveValue('2074-12-31');

    await page.locator('#longterm-person-0-earning').check();
    const inflation = page.locator('#longterm-person-0-earnings-inflation');
    await expect(inflation).toBeChecked();
    await inflation.uncheck();
    await page.locator('#longterm-person-0-earnings-rises').fill('4.25');
    await inflation.check();
    await expect(page.locator('#longterm-person-0-earnings-rises')).toHaveCount(0);
    await inflation.uncheck();
    await expect(page.locator('#longterm-person-0-earnings-rises')).toHaveValue('4.25');
    await page.locator('#longterm-person-0-state-pension-start').fill('2037-07-01');
    await page.getByRole('button', { name: 'Save assumptions' }).click();
    await expect(
      page.getByText('Assumptions saved. The forecast below updates immediately.'),
    ).toBeVisible();
    await page.goto('/longterm?year=2037');
    await openAssumptions(page);
    await expect(inflation).not.toBeChecked();
    await expect(page.locator('#longterm-person-0-earnings-rises')).toHaveValue('4.25');
    await expect(page.getByLabel('Forecast ends on')).toHaveValue('2074-12-31');
    await expect(page.getByRole('link', { name: '2074', exact: true })).toBeVisible();
    await expect(page.getByText(/2037 is a part-year: 6 of 12 months/)).toBeVisible();
    await expect(page.getByText(/The first full year is 2038/)).toBeVisible();
  });

  for (const width of [1400, 390, 320]) {
    test(`assumptions and year detail fit at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 950 });
      await page.goto('/longterm?year=2037');
      await openAssumptions(page);
      await expect(page.getByLabel('Forecast ends on')).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`longterm-${width}.png`), fullPage: true });
      await page.getByRole('group', { name: 'The people', exact: true }).screenshot({
        path: testInfo.outputPath(`people-${width}.png`),
      });
    });
  }

  test('is reachable from the menu and explained in the guide', async ({ page }) => {
    // Slice 3: the page is no longer reachable only by typing its URL. On the
    // desktop bar it sits beside Horizon; in the phone drawer it is in the
    // second group, because it is a sit-down page rather than a daily tap.
    await page.goto('/longterm');
    const desktopNav = page.getByRole('navigation', { name: 'Desktop navigation' });
    await expect(desktopNav.getByRole('link', { name: 'Long-term forecast' })).toHaveAttribute(
      'href',
      '/longterm',
    );
    await expect(desktopNav.getByRole('link', { name: 'Long-term forecast' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    // The drawer is a phone-only surface. Reload at the phone width rather
    // than resizing the live session: a client-side resize closes the drawer
    // and leaves the menu button asleep until the mobile layout is interactive.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/longterm');
    await page.getByRole('button', { name: 'Open navigation menu' }).click();
    const drawer = page.getByRole('dialog', { name: 'Navigation menu' });
    await expect(drawer.getByRole('link', { name: 'Long-term forecast' })).toBeVisible();

    // The guide's ninth idea explains the same arithmetic the page performs.
    await page.goto('/guide#longterm');
    await expect(page.getByText('The nine ideas')).toBeVisible();
    await expect(
      page.getByRole('heading', {
        name: 'The long-term forecast is your assumptions, not a prediction',
      }),
    ).toBeVisible();
    await expect(
      page.getByText(/Three return rates are always compared side by side/),
    ).toBeVisible();
  });
});
