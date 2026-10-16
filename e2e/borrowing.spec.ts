import { expect, test, type Page } from '@playwright/test';
import { londonToday } from './support';

/**
 * The Borrowing page (GitHub issues #60 and #63, decision 228): the per-person
 * summary cards with inline movement recording ("Record borrowing" / "Record a
 * repayment" / "Record a loan out" / "Record what they repaid"), the combined
 * ledger with its From/To filter, per-person running balance and expected rows
 * whose "Record this month's" link opens the inline form prefilled, the inline
 * ledger row detail panel with correction and void, and the collapsible "Setup
 * new Borrowing or lending" card below the ledger.
 */

function personCard(page: Page, counterparty: string) {
  return page.locator('section', {
    has: page.getByRole('heading', { name: counterparty, exact: true }),
  });
}

async function openSetup(page: Page) {
  const setup = page.locator('section[aria-labelledby="setup-heading"]');
  const toggle = setup.getByRole('button', { name: 'Setup new Borrowing or lending' });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  return setup;
}

test.describe('Borrowing page — the ledger and inline recording (issues #60, #63)', () => {
  test('setup sits collapsed below the ledger, projects a greyed expected row, and records inline with 2s auto-collapse', async ({
    page,
  }) => {
    const counterparty = `Supporters ${Date.now()}`;
    const dayOfMonth = Number(londonToday().slice(8, 10));
    await page.goto('/borrowing');

    // No standalone "Record money in or out" card is displayed on the page.
    await expect(page.locator('section[aria-labelledby="record-heading"]')).toHaveCount(0);

    // Setup card is titled "Setup new Borrowing or lending", sits below the ledger,
    // starts collapsed, and only sets up new people (no existing-person dropdown).
    const ledgerSection = page.locator('section[aria-labelledby="ledger-heading"]');
    const setup = page.locator('section[aria-labelledby="setup-heading"]');
    const setupToggle = setup.getByRole('button', { name: 'Setup new Borrowing or lending' });
    await expect(setupToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(setup.locator('#borrowing-setup-panel')).toBeHidden();

    const ledgerBox = await ledgerSection.boundingBox();
    const setupBox = await setup.boundingBox();
    expect(ledgerBox).not.toBeNull();
    expect(setupBox).not.toBeNull();
    expect((setupBox?.y ?? 0) > (ledgerBox?.y ?? 0)).toBe(true);

    await openSetup(page);
    await expect(setup.getByLabel('Who is this with?')).toHaveCount(0);
    await setup.getByLabel('Their name').fill(counterparty);
    await setup.getByLabel('Is this a recurring arrangement?').selectOption('recurring');
    await setup.getByLabel('Expected each month').fill('250.00');
    await setup.getByLabel('On day').fill(String(dayOfMonth));
    await setup.getByRole('button', { name: 'Start tracking' }).click();
    await expect(setup.getByRole('status')).toContainText(/expecting £250\.00 on day/i);

    // Setup card collapses automatically after confirmation (~2000ms).
    await expect(setupToggle).toHaveAttribute('aria-expanded', 'false', { timeout: 5_000 });

    // The summary card carries the plan and the honest unstarted status.
    const card = personCard(page, counterparty);
    const debtRow = card.locator('li');
    await expect(debtRow.getByText(`Expecting £250.00 on day ${dayOfMonth}`)).toBeVisible();
    await expect(debtRow.getByText('Awaiting first payment')).toBeVisible();

    // The ledger shows the plan's future money as a greyed expected row.
    const expectedRow = page.locator('tbody tr', { hasText: counterparty });
    await expect(expectedRow.getByText('expected — not recorded yet').first()).toBeVisible();
    const recordLink = expectedRow
      .getByRole('link', { name: /Record this month's £250\.00/ })
      .first();
    await expect(recordLink).toBeVisible();

    // Clicking the expected row's link opens the inline record section on the
    // person's card prefilled with £250.00, showing only Pot, Amount, When, Note.
    await recordLink.click();
    const inlinePanel = debtRow.locator('[data-inline-record]');
    await expect(inlinePanel).toBeVisible();
    await expect(inlinePanel.getByLabel('Debt')).toHaveCount(0);
    await expect(inlinePanel.getByLabel('What happened?')).toHaveCount(0);
    await expect(inlinePanel.getByLabel('Amount')).toHaveValue('250.00');

    await inlinePanel.getByRole('button', { name: 'Record it' }).click();
    await expect(inlinePanel.getByRole('status')).toContainText(/borrowed £250\.00/i);

    // Inline panel collapses automatically after confirmation (~2000ms).
    await expect(inlinePanel).toHaveCount(0, { timeout: 5_000 });

    // The movement joins the ledger as a real row; the next month's plan
    // stays expected — recording is what moves the pot, never the plan.
    await expect(
      page.locator('tbody tr', { hasText: counterparty }).getByText('+£250.00'),
    ).toBeVisible();
    await expect(debtRow.getByText('we owe £250.00')).toBeVisible();
    await expect(
      page
        .locator('tbody tr', { hasText: counterparty })
        .getByText('expected — not recorded yet')
        .first(),
    ).toBeVisible();
  });

  test('a one-off loan out and its inline repayment run the per-person balance; the From/To filter groups it', async ({
    page,
  }) => {
    const counterparty = `Their son ${Date.now()}`;
    await page.goto('/borrowing');

    const setup = await openSetup(page);
    await setup.getByLabel('Their name').fill(counterparty);
    await setup.getByLabel('Which way round?').selectOption('they_owe');
    await setup.getByLabel('Is this a recurring arrangement?').selectOption('one-off');
    await setup.getByLabel('What happened?').selectOption({ label: 'Lent — money out' });
    await setup.getByLabel('Which pot?').selectOption({ label: 'Main account' });
    await setup.getByLabel('Amount').fill('75.00');
    await setup.getByRole('button', { name: 'Start tracking and record it' }).click();
    await expect(setup.getByRole('status')).toContainText(/lent £75\.00/i);

    const card = personCard(page, counterparty);
    await expect(card.locator('li').getByText('owed to us £75.00')).toBeVisible();
    const rows = page.locator('tbody tr', { hasText: counterparty });
    await expect(rows).toHaveCount(1);
    await expect(rows.getByText('£75.00 (owed)')).toBeVisible();

    // Selecting "Record what they repaid" on the person's card opens the inline
    // form right inside the card.
    await card.getByRole('link', { name: 'Record what they repaid' }).click();
    const inlinePanel = card.locator('[data-inline-record]');
    await expect(inlinePanel).toBeVisible();
    await inlinePanel.getByLabel('Amount').fill('25.00');
    await inlinePanel.getByRole('button', { name: 'Record it' }).click();
    await expect(inlinePanel.getByRole('status')).toContainText(/repaid £25\.00/i);

    await expect(card.locator('li').getByText('owed to us £50.00')).toBeVisible();
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

    const setup = await openSetup(page);
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

  test('repayment sanity check blocks overpayments and insufficient cash pots, and warns when a bank account goes below zero', async ({
    page,
  }) => {
    const counterparty = `Sanity ${Date.now()}`;
    await page.goto('/borrowing');

    // Set up a person we owe £750.00 to, then verify £1,000.00 is blocked as an overpayment.
    const setup = await openSetup(page);
    await setup.getByLabel('Their name').fill(counterparty);
    await setup.getByLabel('Is this a recurring arrangement?').selectOption('one-off');
    await setup.getByLabel('What happened?').selectOption({ label: 'Borrowed — money in' });
    await setup.getByLabel('Which pot?').selectOption({ label: 'Main account' });
    await setup.getByLabel('Amount').fill('750.00');
    await setup.getByRole('button', { name: 'Start tracking and record it' }).click();
    await expect(setup.getByRole('status')).toContainText(/borrowed £750\.00/i);

    const card = personCard(page, counterparty);
    await card.getByRole('link', { name: 'Record a repayment' }).click();
    const inlinePanel = card.locator('[data-inline-record]');
    await expect(inlinePanel).toBeVisible();

    // Overpayment check: £750.00 owed, £1,000.00 proposed repayment is blocked.
    await inlinePanel.getByLabel('Pot').selectOption({ label: 'Main account' });
    await inlinePanel.getByLabel('Amount').fill('1000.00');
    await expect(inlinePanel.getByRole('alert')).toContainText(
      /This £1,000\.00 repayment exceeds the £750\.00 currently owed/i,
    );
    await expect(inlinePanel.getByRole('button', { name: 'Record it' })).toBeDisabled();

    // Cash pot with insufficient funds (Alex's cash has ~£42.10) is blocked for a £500.00 repayment.
    await inlinePanel.getByLabel('Pot').selectOption({ label: "Alex's cash" });
    await inlinePanel.getByLabel('Amount').fill('500.00');
    await expect(inlinePanel.getByRole('alert')).toContainText(/Alex's cash only has £/i);
    await expect(inlinePanel.getByRole('alert')).toContainText(/short of this £500\.00 payment/i);
    await expect(inlinePanel.getByRole('button', { name: 'Record it' })).toBeDisabled();

    // Borrow another £5,000.00 into Salary account so the debt (£5,750.00) exceeds
    // Main account's balance, then verify a £5,500.00 repayment from Main account
    // warns about going below zero while keeping "Record it" enabled.
    await card.getByRole('link', { name: 'Record borrowing' }).click();
    await inlinePanel.getByLabel('Pot').selectOption({ label: 'Salary account' });
    await inlinePanel.getByLabel('Amount').fill('5000.00');
    await inlinePanel.getByRole('button', { name: 'Record it' }).click();
    await expect(inlinePanel.getByRole('status')).toContainText(/borrowed £5,000\.00/i);

    await card.getByRole('link', { name: 'Record a repayment' }).click();
    await inlinePanel.getByLabel('Pot').selectOption({ label: 'Main account' });
    await inlinePanel.getByLabel('Amount').fill('5500.00');
    await expect(
      inlinePanel.getByText(/Warning: this £5,500\.00 payment will take Main account/i),
    ).toBeVisible();
    await expect(inlinePanel.getByText(/below zero to −£/i)).toBeVisible();
    await expect(inlinePanel.getByRole('button', { name: 'Record it' })).toBeEnabled();
  });

  test('the pots page signposts Borrowing and old deep links land there', async ({ page }) => {
    const counterparty = `Mover ${Date.now()}`;
    await page.goto('/borrowing');
    const setup = await openSetup(page);
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
