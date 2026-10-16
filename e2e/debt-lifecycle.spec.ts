import { expect, test, type Page } from '@playwright/test';

/**
 * Debt lifecycle — deletion of empty mistaken setup and honest loan status (issues 2 & 3, decisions 167 & 168).
 * Runs against the Borrowing page since issue #60 moved the cards there.
 */

/** The person's summary card on /borrowing — headed with the counterparty. */
function personCard(page: Page, counterparty: string) {
  return page.locator('section', {
    has: page.getByRole('heading', { name: counterparty, exact: true }),
  });
}

/** The setup card's new-person flow: select "Someone new…", name, direction, plan. */
async function startTracking(
  page: Page,
  counterparty: string,
  options: {
    direction?: 'we_owe' | 'they_owe';
    plan?: 'recurring' | 'one-off' | 'none';
    note?: string;
  } = {},
) {
  const setup = page.locator('section[aria-labelledby="setup-heading"]');
  await setup.getByLabel('Who is this with?').selectOption('new');
  await setup.getByLabel('Their name').fill(counterparty);
  if (options.direction !== undefined) {
    await setup.getByLabel('Which way round?').selectOption(options.direction);
  }
  await setup.getByLabel('Is this a recurring arrangement?').selectOption(options.plan ?? 'none');
  if (options.note !== undefined) {
    await setup.getByLabel('What is it for? (optional)').fill(options.note);
  }
  await setup.getByRole('button', { name: 'Start tracking' }).click();
  await expect(setup.getByRole('status')).toContainText(/now tracking/i);
}

test.describe('debt deletion — empty mistaken setup', () => {
  test('empty debt can be deleted after confirmation, cancelling leaves it untouched', async ({
    page,
  }) => {
    const counterparty = `Parents ${Date.now()}`;
    await page.goto('/borrowing');
    await startTracking(page, counterparty);

    const card = personCard(page, counterparty);
    const debtRow = card.locator('li');
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

    const record = page.locator('section[aria-labelledby="record-heading"]');
    await expect(
      record.getByLabel('Debt').locator(`option:has-text("${counterparty}")`),
    ).toHaveCount(0);
  });

  test('debt with expected-support plan but no movements can be deleted; projected expectations disappear', async ({
    page,
  }) => {
    const counterparty = `Support Parents ${Date.now()}`;
    await page.goto('/borrowing');
    // The setup card's recurring branch builds the plan in one flow (issue #60).
    const setup = page.locator('section[aria-labelledby="setup-heading"]');
    await setup.getByLabel('Who is this with?').selectOption('new');
    await setup.getByLabel('Their name').fill(counterparty);
    await setup.getByLabel('Is this a recurring arrangement?').selectOption('recurring');
    await setup.getByLabel('Expected each month').fill('100.00');
    await setup.getByLabel('On day').fill('12');
    await setup.getByRole('button', { name: 'Start tracking' }).click();
    await expect(setup.getByRole('status')).toContainText(/now tracking/i);

    const debtRow = personCard(page, counterparty).locator('li');
    await expect(debtRow).toBeVisible();
    await expect(debtRow.getByText(/Expecting £100.00 on day 12/)).toBeVisible();
    await expect(debtRow.getByText('Awaiting first payment')).toBeVisible();

    const outerDelete = debtRow.locator('details', { hasText: 'Delete' });
    await outerDelete.locator('summary').first().click();
    const innerDeleteBtn = outerDelete.getByRole('button', { name: `Delete “${counterparty}”` });
    await expect(innerDeleteBtn).toBeVisible();
    await innerDeleteBtn.click();
    await expect(outerDelete.getByText(/expected-support plan that will disappear/)).toBeVisible();
    await outerDelete.getByRole('button', { name: 'Yes, permanently delete it' }).click();
    await expect(personCard(page, counterparty)).toHaveCount(0, {
      timeout: 30_000,
    });

    await page.goto('/horizon');
    await expect(page.getByText(counterparty)).toHaveCount(0);
  });

  test('debt with live or voided movements cannot be hard-deleted', async ({ page }) => {
    const counterparty = `NonDeletable ${Date.now()}`;
    await page.goto('/borrowing');
    await startTracking(page, counterparty);

    const record = page.locator('section[aria-labelledby="record-heading"]');
    await record.getByLabel('Debt').selectOption({ label: `${counterparty} (we owe)` });
    await record.getByLabel('Pot').selectOption({ label: 'Main account' });
    await record.getByLabel('Amount').fill('10.00');
    await record.getByRole('button', { name: 'Record it' }).click();
    await expect(record.getByRole('status')).toContainText(/borrowed £10.00/i);

    const debtRow = personCard(page, counterparty).locator('li');
    await expect(debtRow.getByText('we owe £10.00')).toBeVisible();
    await expect(debtRow.locator('details', { hasText: 'Delete' })).toHaveCount(0);

    // The ledger row opens in place for the void (issue #60's inline panel).
    const ledgerRow = page.locator('tbody tr', { hasText: counterparty }).first();
    await ledgerRow.getByRole('button', { name: /Open this row/ }).click();
    const voidForm = page
      .locator('form')
      .filter({ has: page.getByLabel(/Why are you voiding/) })
      .first();
    await voidForm.getByLabel(/Why are you voiding/).fill('test void');
    await voidForm.getByRole('button', { name: /Void/ }).click();
    await expect(page.getByText(/voided.*test void/i).first()).toBeVisible({ timeout: 30_000 });

    await page.goto('/borrowing');
    const debtRowAfterVoid = personCard(page, counterparty).locator('li');
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
    await page.goto('/borrowing');
    await startTracking(page, counterparty, {
      note: 'bridging pending estate settlement',
    });

    const debtRow = personCard(page, counterparty).locator('li');
    await expect(debtRow.getByText('Awaiting first payment')).toBeVisible();
    await expect(debtRow.getByText('settled')).toHaveCount(0);
    await expect(debtRow.getByText('no movements yet')).toBeVisible();
    await expect(debtRow.getByText('bridging pending estate settlement')).toBeVisible();
  });

  test('first borrowing moves status to outstanding, full repayment to settled, overpayment distinguishable', async ({
    page,
  }) => {
    const counterparty = `Lifecycle ${Date.now()}`;
    await page.goto('/borrowing');
    await startTracking(page, counterparty);

    const record = page.locator('section[aria-labelledby="record-heading"]');
    const debtRow = personCard(page, counterparty).locator('li');

    await record.getByLabel('Debt').selectOption({ label: `${counterparty} (we owe)` });
    await record.getByLabel('What happened?').selectOption({ label: 'Borrowed — money in' });
    await record.getByLabel('Pot').selectOption({ label: 'Main account' });
    await record.getByLabel('Amount').fill('100.00');
    await record.getByRole('button', { name: 'Record it' }).click();
    await expect(record.getByRole('status')).toContainText(/borrowed £100.00/i);
    await expect(debtRow.getByText('we owe £100.00')).toBeVisible();

    await record.getByLabel('Debt').selectOption({ label: `${counterparty} (we owe)` });
    await record.getByLabel('What happened?').selectOption({ label: 'Repaid — money out' });
    await record.getByLabel('Pot').selectOption({ label: 'Main account' });
    await record.getByLabel('Amount').fill('40.00');
    await record.getByRole('button', { name: 'Record it' }).click();
    await expect(record.getByRole('status')).toContainText(/repaid £40.00/i);
    await expect(debtRow.getByText('we owe £60.00')).toBeVisible();

    await record.getByLabel('Debt').selectOption({ label: `${counterparty} (we owe)` });
    await record.getByLabel('What happened?').selectOption({ label: 'Repaid — money out' });
    await record.getByLabel('Pot').selectOption({ label: 'Main account' });
    await record.getByLabel('Amount').fill('60.00');
    await record.getByRole('button', { name: 'Record it' }).click();
    await expect(record.getByRole('status')).toContainText(/repaid £60.00/i);
    await expect(debtRow.getByText('settled')).toBeVisible();

    await record.getByLabel('Debt').selectOption({ label: `${counterparty} (we owe)` });
    await record.getByLabel('What happened?').selectOption({ label: 'Repaid — money out' });
    await record.getByLabel('Pot').selectOption({ label: 'Main account' });
    await record.getByLabel('Amount').fill('10.00');
    await record.getByRole('button', { name: 'Record it' }).click();
    await expect(record.getByRole('status')).toContainText(/repaid £10.00/i);
    await expect(debtRow.getByText('overpaid £10.00')).toBeVisible();
  });

  test('they_owe awaiting status uses Awaiting first loan wording', async ({ page }) => {
    const counterparty = `Lendee ${Date.now()}`;
    await page.goto('/borrowing');
    await startTracking(page, counterparty, { direction: 'they_owe' });

    const debtRow = personCard(page, counterparty).locator('li');
    await expect(debtRow.getByText('Awaiting first loan')).toBeVisible();
  });
});
