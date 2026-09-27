import { expect, test } from '@playwright/test';

/**
 * Debt lifecycle — deletion of empty mistaken setup and honest loan status (issues 2 & 3, decisions 167 & 168).
 */

test.describe('debt deletion — empty mistaken setup', () => {
  test('empty debt can be deleted after confirmation, cancelling leaves it untouched', async ({
    page,
  }) => {
    const counterparty = `Parents ${Date.now()}`;
    await page.goto('/pots');
    const debts = page.locator('section[aria-labelledby="debts-heading"]');
    const trackForm = debts
      .locator('form')
      .filter({ has: page.getByRole('button', { name: 'Track this debt' }) });
    await trackForm.getByLabel('Who is it owed to or by?').fill(counterparty);
    await trackForm.getByRole('button', { name: 'Track this debt' }).click();
    await expect(trackForm.getByRole('status')).toContainText(/now tracking/i);

    const debtRow = debts.locator('li', { hasText: counterparty });
    await expect(debtRow).toBeVisible();
    await expect(debtRow.getByText('no movements yet')).toBeVisible();
    await expect(debtRow.getByText('Awaiting first payment')).toBeVisible();

    // Cancel path: open outer Delete details, then inner Delete button, then Keep it
    const outerDelete = debtRow.locator('details', { hasText: 'Delete' });
    await outerDelete.locator('summary').first().click();
    const innerDeleteBtn = outerDelete.getByRole('button', { name: `Delete “${counterparty}”` });
    await expect(innerDeleteBtn).toBeVisible();
    await innerDeleteBtn.click();
    const keepBtn = outerDelete.getByRole('button', { name: 'Keep it' });
    await expect(keepBtn).toBeVisible();
    await keepBtn.click();
    await expect(debtRow).toBeVisible();
    await expect(innerDeleteBtn).toBeVisible();

    // Now actually delete — persisted result is row disappearance
    await innerDeleteBtn.click();
    await expect(outerDelete.getByText(`Permanently delete “${counterparty}”`)).toBeVisible();
    await expect(outerDelete.getByText(/no movements at all — not even voided/)).toBeVisible();
    await outerDelete.getByRole('button', { name: 'Yes, permanently delete it' }).click();
    // After successful delete the row is removed, so status may disappear with it.
    // Assert the persisted result: debt no longer in list and not in selectors.
    await expect(debtRow).toHaveCount(0, { timeout: 30_000 });

    const borrow = page.locator('section[aria-labelledby="borrow-heading"]');
    await expect(
      borrow.getByLabel('Debt').locator(`option:has-text("${counterparty}")`),
    ).toHaveCount(0);
  });

  test('debt with expected-support plan but no movements can be deleted; projected expectations disappear', async ({
    page,
  }) => {
    const counterparty = `Support Parents ${Date.now()}`;
    await page.goto('/pots');
    const debts = page.locator('section[aria-labelledby="debts-heading"]');
    const trackForm = debts
      .locator('form')
      .filter({ has: page.getByRole('button', { name: 'Track this debt' }) });
    await trackForm.getByLabel('Who is it owed to or by?').fill(counterparty);
    await trackForm.getByRole('button', { name: 'Track this debt' }).click();
    await expect(trackForm.getByRole('status')).toContainText(/now tracking/i);

    const debtRow = debts.locator('li', { hasText: counterparty });
    await expect(debtRow).toBeVisible();

    const editDetails = debtRow.locator('details', { hasText: 'Edit' }).first();
    await editDetails.locator('summary').click();
    const editForm = editDetails.locator('form').first();
    await editForm.getByLabel('Expected support payment').fill('100.00');
    await editForm.getByLabel('Day of the month').fill('12');
    await editForm.getByRole('button', { name: 'Save debt' }).click();
    await expect(editForm.getByRole('status')).toContainText(/updated/i, { timeout: 30_000 });

    await expect(debtRow.getByText(/Expecting £100.00 on day 12/)).toBeVisible();

    await page.goto('/pots');
    await expect(
      debts.locator('li', { hasText: counterparty }).getByText('Awaiting first payment'),
    ).toBeVisible();

    const outerDelete = debts.locator('li', { hasText: counterparty }).locator('details', {
      hasText: 'Delete',
    });
    await outerDelete.locator('summary').first().click();
    const innerDeleteBtn = outerDelete.getByRole('button', { name: `Delete “${counterparty}”` });
    await expect(innerDeleteBtn).toBeVisible();
    await innerDeleteBtn.click();
    await expect(outerDelete.getByText(/expected-support plan that will disappear/)).toBeVisible();
    await outerDelete.getByRole('button', { name: 'Yes, permanently delete it' }).click();
    await expect(debts.locator('li', { hasText: counterparty })).toHaveCount(0, {
      timeout: 30_000,
    });

    await page.goto('/horizon');
    await expect(page.getByText(counterparty)).toHaveCount(0);
  });

  test('debt with live or voided movements cannot be hard-deleted', async ({ page }) => {
    const counterparty = `NonDeletable ${Date.now()}`;
    await page.goto('/pots');
    const debts = page.locator('section[aria-labelledby="debts-heading"]');
    const trackForm = debts
      .locator('form')
      .filter({ has: page.getByRole('button', { name: 'Track this debt' }) });
    await trackForm.getByLabel('Who is it owed to or by?').fill(counterparty);
    await trackForm.getByRole('button', { name: 'Track this debt' }).click();
    await expect(trackForm.getByRole('status')).toContainText(/now tracking/i);

    const borrow = page.locator('section[aria-labelledby="borrow-heading"]');
    await borrow.getByLabel('Debt').selectOption({ label: `${counterparty} (we owe)` });
    await borrow.getByLabel('Pot').selectOption({ label: 'Main account' });
    await borrow.getByLabel('Amount').fill('10.00');
    await borrow.getByRole('button', { name: 'Record it' }).click();
    await expect(borrow.getByRole('status')).toContainText(/borrowed £10.00/i);

    const debtRow = debts.locator('li', { hasText: counterparty });
    await expect(debtRow.getByText('we owe £10.00')).toBeVisible();
    await expect(debtRow.locator('details', { hasText: 'Delete' })).toHaveCount(0);

    await page.goto('/pots');
    const external = page.locator('section[aria-labelledby="external-history-heading"]');
    const movementRow = external.locator('li', { hasText: counterparty }).first();
    const voidDetails = movementRow.locator('details', { hasText: 'Void' }).first();
    await voidDetails.locator('summary').click();
    const voidForm = voidDetails.locator('form').first();
    await voidForm.getByLabel(/Why are you voiding/).fill('test void');
    await voidForm.getByRole('button', { name: /Void/ }).click();
    await expect(voidForm.getByRole('status')).toContainText(/voided/i, { timeout: 30_000 });

    await page.goto('/pots');
    const debtRowAfterVoid = debts.locator('li', { hasText: counterparty });
    await expect(debtRowAfterVoid.getByText('Awaiting first payment')).toBeVisible();
    await expect(debtRowAfterVoid.getByText('no effective movements — all voided')).toBeVisible();
    await expect(debtRowAfterVoid.locator('details', { hasText: 'Delete' })).toHaveCount(0);
  });
});

test.describe('honest loan status — awaiting vs settled', () => {
  test('Martin & Sue with no effective movements displays Awaiting first payment, not Settled', async ({
    page,
  }) => {
    const counterparty = `Martin & Sue ${Date.now()}`;
    await page.goto('/pots');
    const debts = page.locator('section[aria-labelledby="debts-heading"]');
    const trackForm = debts
      .locator('form')
      .filter({ has: page.getByRole('button', { name: 'Track this debt' }) });
    await trackForm.getByLabel('Who is it owed to or by?').fill(counterparty);
    await trackForm.getByLabel('Note (optional)').fill('bridging pending estate settlement');
    await trackForm.getByRole('button', { name: 'Track this debt' }).click();
    await expect(trackForm.getByRole('status')).toContainText(/now tracking/i);

    const debtRow = debts.locator('li', { hasText: counterparty });
    await expect(debtRow.getByText('Awaiting first payment')).toBeVisible();
    await expect(debtRow.getByText('settled')).toHaveCount(0);
    await expect(debtRow.getByText('no movements yet')).toBeVisible();
  });

  test('first borrowing moves status to outstanding, full repayment to settled, overpayment distinguishable', async ({
    page,
  }) => {
    const counterparty = `Lifecycle ${Date.now()}`;
    await page.goto('/pots');
    const debts = page.locator('section[aria-labelledby="debts-heading"]');
    const trackForm = debts
      .locator('form')
      .filter({ has: page.getByRole('button', { name: 'Track this debt' }) });
    await trackForm.getByLabel('Who is it owed to or by?').fill(counterparty);
    await trackForm.getByRole('button', { name: 'Track this debt' }).click();
    await expect(trackForm.getByRole('status')).toContainText(/now tracking/i);

    const borrow = page.locator('section[aria-labelledby="borrow-heading"]');
    await borrow.getByLabel('Debt').selectOption({ label: `${counterparty} (we owe)` });
    await borrow.getByLabel('What happened?').selectOption({ label: 'Borrowed — money in' });
    await borrow.getByLabel('Pot').selectOption({ label: 'Main account' });
    await borrow.getByLabel('Amount').fill('100.00');
    await borrow.getByRole('button', { name: 'Record it' }).click();
    await expect(borrow.getByRole('status')).toContainText(/borrowed £100.00/i);
    await expect(
      debts.locator('li', { hasText: counterparty }).getByText('we owe £100.00'),
    ).toBeVisible();

    await borrow.getByLabel('Debt').selectOption({ label: `${counterparty} (we owe)` });
    await borrow.getByLabel('What happened?').selectOption({ label: 'Repaid — money out' });
    await borrow.getByLabel('Pot').selectOption({ label: 'Main account' });
    await borrow.getByLabel('Amount').fill('40.00');
    await borrow.getByRole('button', { name: 'Record it' }).click();
    await expect(borrow.getByRole('status')).toContainText(/repaid £40.00/i);
    await expect(
      debts.locator('li', { hasText: counterparty }).getByText('we owe £60.00'),
    ).toBeVisible();

    await borrow.getByLabel('Debt').selectOption({ label: `${counterparty} (we owe)` });
    await borrow.getByLabel('What happened?').selectOption({ label: 'Repaid — money out' });
    await borrow.getByLabel('Pot').selectOption({ label: 'Main account' });
    await borrow.getByLabel('Amount').fill('60.00');
    await borrow.getByRole('button', { name: 'Record it' }).click();
    await expect(borrow.getByRole('status')).toContainText(/repaid £60.00/i);
    await expect(debts.locator('li', { hasText: counterparty }).getByText('settled')).toBeVisible();

    await borrow.getByLabel('Debt').selectOption({ label: `${counterparty} (we owe)` });
    await borrow.getByLabel('What happened?').selectOption({ label: 'Repaid — money out' });
    await borrow.getByLabel('Pot').selectOption({ label: 'Main account' });
    await borrow.getByLabel('Amount').fill('10.00');
    await borrow.getByRole('button', { name: 'Record it' }).click();
    await expect(borrow.getByRole('status')).toContainText(/repaid £10.00/i);
    await expect(
      debts.locator('li', { hasText: counterparty }).getByText('overpaid £10.00'),
    ).toBeVisible();
  });

  test('they_owe awaiting status uses Awaiting first loan wording', async ({ page }) => {
    const counterparty = `Lendee ${Date.now()}`;
    await page.goto('/pots');
    const debts = page.locator('section[aria-labelledby="debts-heading"]');
    const trackForm = debts
      .locator('form')
      .filter({ has: page.getByRole('button', { name: 'Track this debt' }) });
    await trackForm.getByLabel('Who is it owed to or by?').fill(counterparty);
    await trackForm.getByLabel('Which way round?').selectOption('They owe us (money lent out)');
    await trackForm.getByRole('button', { name: 'Track this debt' }).click();
    await expect(trackForm.getByRole('status')).toContainText(/now tracking/i);

    const debtRow = debts.locator('li', { hasText: counterparty });
    await expect(debtRow.getByText('Awaiting first loan')).toBeVisible();
  });
});
