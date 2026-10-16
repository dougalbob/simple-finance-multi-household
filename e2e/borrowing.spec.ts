import { expect, test, type Page } from '@playwright/test';
import { londonToday } from './support';

/**
 * The Borrowing page (GitHub issue #60, decision 228): the combined ledger
 * with its From/To filter and per-person running balance, the setup flow
 * (select or create the person; recurring plan or one-off), expected rows
 * with their prefilled "Record this month's" link, the inline detail panel
 * with correction and void, and the pots-page signpost and old deep links.
 */

function personCard(page: Page, counterparty: string) {
  return page.locator('section', {
    has: page.getByRole('heading', { name: counterparty, exact: true }),
  });
}

test.describe('Borrowing page — the ledger (issue #60)', () => {
  test('a recurring setup projects as a greyed expected row and records through its prefilled form', async ({
    page,
  }) => {
    const counterparty = `Supporters ${Date.now()}`;
    const dayOfMonth = Number(londonToday().slice(8, 10));
    await page.goto('/borrowing');

    const setup = page.locator('section[aria-labelledby="setup-heading"]');
    await setup.getByLabel('Who is this with?').selectOption('new');
    await setup.getByLabel('Their name').fill(counterparty);
    await setup.getByLabel('Is this a recurring arrangement?').selectOption('recurring');
    await setup.getByLabel('Expected each month').fill('250.00');
    await setup.getByLabel('On day').fill(String(dayOfMonth));
    await setup.getByRole('button', { name: 'Start tracking' }).click();
    await expect(setup.getByRole('status')).toContainText(/expecting £250\.00 on day/i);

    // The summary card carries the plan and the honest unstarted status.
    const debtRow = personCard(page, counterparty).locator('li');
    await expect(debtRow.getByText(`Expecting £250.00 on day ${dayOfMonth}`)).toBeVisible();
    await expect(debtRow.getByText('Awaiting first payment')).toBeVisible();

    // The ledger shows the plan's future money as a greyed expected row.
    const expectedRow = page.locator('tbody tr', { hasText: counterparty });
    await expect(expectedRow.getByText('expected — not recorded yet').first()).toBeVisible();
    const recordLink = expectedRow
      .getByRole('link', { name: /Record this month's £250\.00/ })
      .first();
    await expect(recordLink).toBeVisible();

    // The link prefills the record panel — the debt, the direction, the amount.
    // (The form remounts on the presets, so pin the debt id first: waiting on
    // "What happened?" alone would pass against the old form.)
    const recordHref = (await recordLink.getAttribute('href')) ?? '';
    const debtId = /\bdebt=(\d+)/.exec(recordHref)?.[1] ?? '';
    await recordLink.click();
    const record = page.locator('section[aria-labelledby="record-heading"]');
    await expect(record.getByLabel('Debt')).toHaveValue(debtId);
    await expect(record.getByLabel('What happened?')).toHaveValue('in');
    await expect(record.getByLabel('Amount')).toHaveValue('250.00');

    await record.getByRole('button', { name: 'Record it' }).click();
    await expect(record.getByRole('status')).toContainText(/borrowed £250\.00/i);

    // The movement joins the ledger as a real row; the next month's plan
    // stays expected — recording is what moves the pot, never the plan.
    await expect(
      page.locator('tbody tr', { hasText: counterparty }).getByText('+£250.00'),
    ).toBeVisible();
    await expect(
      personCard(page, counterparty).locator('li').getByText('we owe £250.00'),
    ).toBeVisible();
    await expect(
      page
        .locator('tbody tr', { hasText: counterparty })
        .getByText('expected — not recorded yet')
        .first(),
    ).toBeVisible();
  });

  test('a one-off loan out and its repayment run the per-person balance; the From/To filter groups it', async ({
    page,
  }) => {
    const counterparty = `Their son ${Date.now()}`;
    await page.goto('/borrowing');

    const setup = page.locator('section[aria-labelledby="setup-heading"]');
    await setup.getByLabel('Who is this with?').selectOption('new');
    await setup.getByLabel('Their name').fill(counterparty);
    await setup.getByLabel('Which way round?').selectOption('they_owe');
    await setup.getByLabel('Is this a recurring arrangement?').selectOption('one-off');
    await setup.getByLabel('What happened?').selectOption({ label: 'Lent — money out' });
    await setup.getByLabel('Which pot?').selectOption({ label: 'Main account' });
    await setup.getByLabel('Amount').fill('75.00');
    await setup.getByRole('button', { name: 'Start tracking and record it' }).click();
    await expect(setup.getByRole('status')).toContainText(/lent £75\.00/i);

    await expect(
      personCard(page, counterparty).locator('li').getByText('owed to us £75.00'),
    ).toBeVisible();
    const rows = page.locator('tbody tr', { hasText: counterparty });
    await expect(rows).toHaveCount(1);
    await expect(rows.getByText('£75.00 (owed)')).toBeVisible();

    // The summary card's shortcut prefills the repayment direction.
    const repayLink = personCard(page, counterparty).getByRole('link', {
      name: 'Record what they repaid',
    });
    const repayHref = (await repayLink.getAttribute('href')) ?? '';
    const debtId = /\bdebt=(\d+)/.exec(repayHref)?.[1] ?? '';
    await repayLink.click();
    const record = page.locator('section[aria-labelledby="record-heading"]');
    // Wait for the preset remount (the old form still shows the first debt).
    await expect(record.getByLabel('Debt')).toHaveValue(debtId);
    await expect(record.getByLabel('What happened?')).toHaveValue('in');
    await record.getByLabel('Amount').fill('25.00');
    await record.getByRole('button', { name: 'Record it' }).click();
    await expect(record.getByRole('status')).toContainText(/repaid £25\.00/i);

    await expect(
      personCard(page, counterparty).locator('li').getByText('owed to us £50.00'),
    ).toBeVisible();
    const after = page.locator('tbody tr', { hasText: counterparty });
    await expect(after.nth(0).getByText('£75.00 (owed)')).toBeVisible();
    await expect(after.nth(1).getByText('£50.00 (owed)')).toBeVisible();

    // The From/To filter groups the ledger to this person and personalises
    // the column captions; everyone stays on the chips.
    await page
      .getByRole('navigation', { name: 'Filter by person' })
      .getByRole('link', { name: new RegExp(counterparty) })
      .click();
    await expect(page).toHaveURL(/who=/);
    await expect(page.locator('tbody tr', { hasText: 'Mum' })).toHaveCount(0);
    await expect(page.locator('thead')).toContainText('Amt in (repaid to us)');
  });

  test('a ledger row opens beneath itself for detail, correction and void', async ({ page }) => {
    const counterparty = `Pal ${Date.now()}`;
    await page.goto('/borrowing');

    const setup = page.locator('section[aria-labelledby="setup-heading"]');
    await setup.getByLabel('Who is this with?').selectOption('new');
    await setup.getByLabel('Their name').fill(counterparty);
    await setup.getByLabel('Is this a recurring arrangement?').selectOption('one-off');
    await setup.getByLabel('What happened?').selectOption({ label: 'Borrowed — money in' });
    await setup.getByLabel('Which pot?').selectOption({ label: 'Main account' });
    await setup.getByLabel('Amount').fill('50.00');
    await setup.getByLabel('Note (optional)').fill('cash handed over — banked 18th');
    await setup.getByRole('button', { name: 'Start tracking and record it' }).click();
    await expect(setup.getByRole('status')).toContainText(/borrowed £50\.00/i);

    const row = page.locator('tbody tr', { hasText: counterparty });
    await row.getByRole('button', { name: /Open this row/ }).click();

    // The detail panel opens beneath the row: the pot in plain words, the
    // note, who recorded it — and the correction and void side by side.
    const panel = page.locator('section[id^="external-"][id$="-panel"]');
    await expect(panel.getByText('Came in to Main account.')).toBeVisible();
    await expect(panel.getByText('Note: cash handed over — banked 18th')).toBeVisible();
    await expect(panel.getByText(/Recorded by /)).toBeVisible();

    const editForm = panel
      .locator('form')
      .filter({ has: page.getByRole('button', { name: 'Save changes' }) });
    await editForm.getByLabel('Amount').fill('60.00');
    await editForm.getByRole('button', { name: 'Save changes' }).click();
    await expect(editForm.getByRole('status')).toContainText(/saved: £60\.00/i);
    // The data row is first; the panel row beneath it carries the same text.
    await expect(row.first().getByText('+£60.00')).toBeVisible();
    await expect(
      personCard(page, counterparty).locator('li').getByText('we owe £60.00'),
    ).toBeVisible();

    const voidForm = panel.locator('form').filter({ has: page.getByLabel(/Why are you voiding/) });
    await voidForm.getByLabel(/Why are you voiding/).fill('recorded twice');
    await voidForm.getByRole('button', { name: 'Void external' }).click();
    await expect(panel.getByText(/Voided — recorded twice/)).toBeVisible();
    await expect(row.getByText(/voided — recorded twice/)).toBeVisible();
    await expect(
      personCard(page, counterparty).locator('li').getByText('Awaiting first payment'),
    ).toBeVisible();
    await expect(
      personCard(page, counterparty).locator('li').getByText('no effective movements — all voided'),
    ).toBeVisible();
  });

  test('the pots page signposts Borrowing and old deep links land there', async ({ page }) => {
    const counterparty = `Mover ${Date.now()}`;
    await page.goto('/borrowing');
    const setup = page.locator('section[aria-labelledby="setup-heading"]');
    await setup.getByLabel('Who is this with?').selectOption('new');
    await setup.getByLabel('Their name').fill(counterparty);
    await setup.getByLabel('Is this a recurring arrangement?').selectOption('one-off');
    await setup.getByLabel('What happened?').selectOption({ label: 'Borrowed — money in' });
    await setup.getByLabel('Which pot?').selectOption({ label: 'Main account' });
    await setup.getByLabel('Amount').fill('20.00');
    await setup.getByRole('button', { name: 'Start tracking and record it' }).click();
    await expect(setup.getByRole('status')).toContainText(/borrowed £20\.00/i);

    // The row's DOM id carries the movement id; the card's link carries the
    // debt id — the two halves of the old /pots deep links.
    const row = page.locator('tbody tr', { hasText: counterparty });
    const rowId = await row.getAttribute('id');
    const movementId = rowId?.replace('external-', '');
    expect(movementId).toMatch(/^\d+$/);
    const recordHref = await personCard(page, counterparty)
      .getByRole('link', { name: 'Record borrowing' })
      .getAttribute('href');
    const debtId = /\bdebt=(\d+)/.exec(recordHref ?? '')?.[1];
    expect(debtId).toMatch(/^\d+$/);

    // The signpost on Accounts, Pots & Checkpoints.
    await page.goto('/pots');
    const signpost = page.locator('section[aria-labelledby="borrowing-signpost-heading"]');
    await expect(signpost.getByText(/we owe/)).toBeVisible();
    await signpost.getByRole('link', { name: 'Open Borrowing' }).click();
    await expect(page).toHaveURL(/\/borrowing/);

    // An old `/pots?external={id}` loan link redirects to the borrowing row.
    await page.goto(`/pots?external=${movementId}`);
    await expect(page).toHaveURL(new RegExp(`/borrowing\\?external=${movementId}`));
    await expect(
      page.locator(`#external-${movementId}-panel`).getByText('Came in to Main account.'),
    ).toBeVisible();

    // An old `/pots#debt-{id}` bookmark is forwarded to the summary strip.
    await page.goto(`/pots#debt-${debtId}`);
    await expect(page).toHaveURL(new RegExp(`/borrowing#debt-${debtId}`));
  });
});
