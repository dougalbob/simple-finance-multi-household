import { expect, test, type Page } from '@playwright/test';

/**
 * Money owed to us — tracked reimbursement claims (issue #124).
 * The claims live on the Borrowing page: create a claim from spend the
 * household fronted, watch it sit in "Money owed to us", then close it either
 * when the money arrives (one audited action records one-off income) or when
 * the third party pays someone else directly (the informal IOU drops, no pot
 * moves). A voided claim releases its purchases again.
 */

function personCard(page: Page, counterparty: string) {
  return page.locator('section', {
    has: page.getByRole('heading', { name: counterparty, exact: true }),
  });
}

function openClaimsCard(page: Page) {
  return page.locator('section#claims');
}

async function openBorrowingSetup(page: Page) {
  const setup = page.locator('section[aria-labelledby="setup-heading"]');
  const toggle = setup.getByRole('button', { name: 'Setup new Borrowing or lending' });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  return setup;
}

/** Open the "Track money you expect back" disclosure inside the claims card. */
async function openTrackForm(claims: ReturnType<typeof openClaimsCard>) {
  const summary = claims.getByText('Track money you expect back');
  const disclosure = summary.locator('xpath=ancestor::details[1]');
  if ((await disclosure.getAttribute('open')) === null) {
    await summary.click();
  }
  return disclosure;
}

/** Track a claim covering the seeded Corner Foods weekly shop. */
async function createClaimFromWeeklyShop(page: Page, counterparty: string) {
  const claims = page.locator('section#claims');
  const track = await openTrackForm(claims);
  await track.getByLabel('Search the purchases the claim covers').fill('corner foods');
  await track.getByRole('button', { name: 'Search' }).click();
  await expect(page).toHaveURL(/claimQ=corner/);
  const reopened = await openTrackForm(page.locator('section#claims'));
  await reopened
    .locator('li', { hasText: 'Weekly shop' })
    .locator('input[type="checkbox"]')
    .check();
  await reopened.getByLabel('Who owes you the money?').fill(counterparty);
  await reopened.getByLabel('What for? (optional)').fill('share of the shop');
  await reopened.getByRole('button', { name: 'Start tracking' }).click();
  await expect(reopened.getByRole('status')).toContainText(/Tracking £63\.47/i);
}

test('a claim is tracked, then closed when the money arrives — income recorded, claim settled', async ({
  page,
}) => {
  const counterparty = `Estate test ${Date.now()}`;
  await page.goto('/borrowing');

  const claims = openClaimsCard(page);
  await expect(
    claims.getByRole('heading', { name: 'Money owed to us — expected back' }),
  ).toBeVisible();

  await createClaimFromWeeklyShop(page, counterparty);

  // The claim card lists the linked purchase and the awaited total.
  const card = openClaimsCard(page).locator('li', { hasText: counterparty });
  await expect(card.getByText('Weekly shop')).toBeVisible();
  await expect(card.getByText('£63.47 awaited')).toBeVisible();
  await expect(card.getByRole('link', { name: /Corner Foods/ })).toHaveAttribute(
    'href',
    /purchaseId=\d+/,
  );

  // The money arrives into Main account: one action, one-off income recorded.
  await card.getByText('The money arrived').click();
  const settle = card
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Record the income and settle' }) });
  await settle.getByLabel('Which pot did it land in?').selectOption({ label: 'Main account' });
  await settle.getByRole('button', { name: 'Record the income and settle' }).click();
  await expect(settle.getByRole('status')).toContainText(/is closed. Income recorded/i);

  // Open claims are empty of it; the closed disclosure remembers it.
  await expect(openClaimsCard(page).locator('li', { hasText: counterparty })).toHaveCount(0);
  await page.goto('/borrowing');
  const closed = openClaimsCard(page).getByText(/Settled and closed/);
  await closed.click();
  await expect(openClaimsCard(page).getByText(counterparty, { exact: true })).toBeVisible();
});

test('settling outside the pots reduces the informal IOU without moving money', async ({
  page,
}) => {
  const iou = `Sister e2e ${Date.now()}`;
  const counterparty = `Estate direct ${Date.now()}`;
  await page.goto('/borrowing');

  // Open an IOU we owe: borrowed £100 from Sister one-off.
  const setup = await openBorrowingSetup(page);
  await setup.getByLabel('Their name').fill(iou);
  await setup.getByLabel('Which way round?').selectOption('we_owe');
  await setup.getByLabel('Is this a recurring arrangement?').selectOption('one-off');
  await setup.getByLabel('What happened?').selectOption({ label: 'Borrowed — money in' });
  await setup.getByLabel('Which pot?').selectOption({ label: 'Main account' });
  await setup.getByLabel('Amount').fill('100.00');
  await setup.getByRole('button', { name: 'Start tracking and record it' }).click();
  await expect(setup.getByRole('status')).toContainText(/borrowed £100\.00/i);

  // Track a small claim against this week's cafe spend.
  await page.goto('/borrowing');
  const track = await openTrackForm(openClaimsCard(page));
  await track.getByLabel('Search the purchases the claim covers').fill('corner cafe');
  await track.getByRole('button', { name: 'Search' }).click();
  await expect(page).toHaveURL(/claimQ=corner/);
  const second = await openTrackForm(await openClaimsCard(page));
  await second.locator('li', { hasText: 'Corner Cafe' }).locator('input[type="checkbox"]').check();
  await second.getByLabel('Who owes you the money?').fill(counterparty);
  await second.getByRole('button', { name: 'Start tracking' }).click();
  await expect(second.getByRole('status')).toContainText(/Tracking £3\.49/i);

  // Settle outside the pots, naming the IOU to reduce.
  const card = openClaimsCard(page).locator('li', { hasText: counterparty });
  await card.getByText('Paid directly, not into a pot').click();
  const settle = card
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Settle without moving money' }) });
  await settle.getByLabel('Where did the money go?').fill('estate paid Sister directly');
  await settle
    .getByLabel(/Also clear an informal IOU/)
    .selectOption({ label: `${iou} — we owe £100.00` });
  await settle.getByRole('button', { name: 'Settle without moving money' }).click();
  await expect(settle.getByRole('status')).toContainText(/is closed. No money moved/i);

  // The IOU dropped by exactly the settled amount.
  await expect(personCard(page, iou).locator('li').getByText('we owe £96.51')).toBeVisible();
  // The ledger carries the settlement against Sister, labelled as a claim.
  await expect(page.locator('tbody tr', { hasText: 'claim settled' }).first()).toBeVisible();
});

test('voiding a claim releases its purchases and keeps the income that already arrived', async ({
  page,
}) => {
  const counterparty = `Estate void ${Date.now()}`;
  await page.goto('/borrowing');

  await createClaimFromWeeklyShop(page, counterparty);

  const card = openClaimsCard(page).locator('li', { hasText: counterparty });
  await card.getByRole('button', { name: 'Void' }).click();
  await card.getByLabel('Why?').fill('tracked against the wrong shop');
  await card.getByRole('button', { name: 'Yes, void the claim' }).click();

  // The claim is gone from the awaited list…
  await expect(openClaimsCard(page).locator('li', { hasText: counterparty })).toHaveCount(0);
  // …and the purchase is claimable again.
  await page.goto('/borrowing');
  const track = await openTrackForm(openClaimsCard(page));
  await track.getByLabel('Search the purchases the claim covers').fill('corner foods');
  await track.getByRole('button', { name: 'Search' }).click();
  await expect(page).toHaveURL(/claimQ=corner/);
  const reopened = await openTrackForm(openClaimsCard(page));
  await expect(
    reopened.locator('li', { hasText: 'Weekly shop' }).locator('input[type="checkbox"]'),
  ).toBeVisible();
});
