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
}

/** The panel opens by default only while a warning asks for a figure. */
async function openAssumptions(page: Page): Promise<void> {
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

    await page.setViewportSize({ width: 390, height: 844 });
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
