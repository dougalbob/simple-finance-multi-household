import { expect, test } from '@playwright/test';
import { addDaysIso, londonToday } from './support';

function pounds(text: string): number {
  const amount = text.match(/£([\d,]+\.\d{2})/)?.[1];
  if (amount === undefined) throw new Error(`No pound amount in: ${text}`);
  return Math.round(Number(amount.replaceAll(',', '')) * 100);
}

test('credit-card debt stays netted from household total, outside liquidity, with statement and promo reminders', async ({
  page,
}) => {
  await page.goto('/overview');
  const money = page.locator('section[aria-labelledby="money-heading"]');
  const totalBefore = pounds(
    await money.getByRole('heading', { name: /Household total now/ }).innerText(),
  );
  const projection = page.locator('section[aria-labelledby="projection-heading"]');
  const liquidValue = projection
    .locator('dt')
    .filter({ hasText: 'Liquid funds now' })
    .locator('xpath=following-sibling::dd[1]');
  const liquidBefore = pounds(await liquidValue.innerText());

  await page.goto('/pots');
  const addPot = page.locator('section[aria-labelledby="add-pot-heading"]');
  await addPot.getByLabel('Pot name').fill('Everyday card');
  await addPot.getByLabel('Type').selectOption('credit-card');
  await addPot.getByRole('button', { name: 'Add pot' }).click();
  await expect(addPot.getByRole('status')).toContainText('Pot “Everyday card” created.');

  // A non-cash card is an account too. Its name opens the right activity
  // even before the household has recorded its first checkpoint.
  await page.goto('/overview');
  const cardTile = page.locator('section[aria-labelledby="money-heading"] li').filter({
    hasText: 'Everyday card',
  });
  await expect(cardTile).toContainText('no checkpoint');
  const cardLink = cardTile.getByRole('link', { name: 'View transactions for Everyday card' });
  const cardUrl = new URL((await cardLink.getAttribute('href')) ?? '', 'http://test');
  expect(cardUrl.pathname).toBe('/transactions');
  expect(cardUrl.searchParams.get('potId')).toMatch(/^\d+$/);
  await cardLink.click();
  await expect(page.getByLabel('Target', { exact: true })).toHaveValue(
    cardUrl.searchParams.get('potId') ?? '',
  );
  await expect(page.locator('#activity-pot option:checked')).toHaveText('Everyday card');
  await page.goto('/pots');

  const checkpoint = page.locator('section[aria-labelledby="add-checkpoint-heading"]');
  await checkpoint.getByLabel('Pot').selectOption({ label: 'Everyday card (credit card)' });
  await checkpoint.getByLabel('Balance right now').fill('-50.00');
  await checkpoint.getByRole('button', { name: 'Save checkpoint' }).click();
  await expect(checkpoint.getByRole('status')).toContainText('Checkpoint saved: -£50.00.');

  await page.goto('/overview');
  const updatedMoney = page.locator('section[aria-labelledby="money-heading"]');
  const totalAfter = pounds(
    await updatedMoney.getByRole('heading', { name: /Household total now/ }).innerText(),
  );
  expect(totalBefore - totalAfter).toBe(5000);
  await expect(updatedMoney).toContainText('Includes £50.00 owed on credit cards.');
  await expect(liquidValue).toHaveText(/£[\d,]+\.\d{2}/);
  expect(pounds(await liquidValue.innerText())).toBe(liquidBefore);

  const today = londonToday();
  const statementDue = addDaysIso(today, 3);
  const promotionalEnd = addDaysIso(today, 10);
  await page.goto('/settings');
  const cardEdit = page
    .locator('form[id^="pot-edit-"]')
    .filter({ has: page.locator('input[name="label"][value="Everyday card"]') });
  await cardEdit.getByLabel('Usual payment due day (1–31)').fill('25');
  await cardEdit.getByLabel('Reminder lead (days)').fill('3');
  await cardEdit.getByLabel('0% promotional end date (optional)').fill(promotionalEnd);
  await cardEdit.getByLabel('Current statement due date').fill(statementDue);
  await cardEdit.getByLabel('Minimum payment shown on that statement (£)').fill('35.00');
  await cardEdit.getByRole('button', { name: 'Save pot' }).click();
  await expect(cardEdit.getByRole('status')).toContainText('Pot “Everyday card” saved.');

  await page.goto('/overview');
  const keyDates = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Key dates' }) });
  await expect(keyDates).toContainText('Everyday card payment due in 3 days');
  await expect(keyDates).toContainText('statement minimum £35.00');
  await expect(keyDates).toContainText('choose an amount');
  await expect(keyDates).not.toContainText(promotionalEnd);

  await page.goto('/contracts');
  const reviews = page.getByRole('region', { name: 'Credit-card payment reviews' });
  await expect(reviews).toContainText(`payment due ${statementDue}`);
  await expect(reviews).toContainText('statement minimum £35.00');
  await expect(reviews).toContainText(`0% offer ends ${promotionalEnd}`);
  await expect(reviews).toContainText('3 days before');
});
