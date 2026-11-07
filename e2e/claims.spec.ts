import { expect, test, type Locator, type Page } from '@playwright/test';
import { pickEntryCategory, waitForTill } from './support';

/**
 * Money owed to us — tracked reimbursement claims (issue #124).
 * The claims live on the Borrowing page: create a claim from spend the
 * household fronted, watch it sit in "Money owed to us", then close it either
 * when the money arrives (one audited action records one-off income) or when
 * the third party pays someone else directly (the informal IOU drops, no pot
 * moves). A voided claim releases its purchases again.
 *
 * Each test records its own purchase at the till (named, like every other
 * mutating spec, with a timestamp) because a purchase linked to a claim can
 * never be linked again — even after the claim closes — so the seeded rows
 * can only support one claim each. Names carry the timestamp so a CI retry
 * never collides with the first attempt's rows in the shared database.
 */

function personCard(page: Page, counterparty: string) {
  return page.locator('section', {
    has: page.getByRole('heading', { name: counterparty, exact: true }),
  });
}

function openClaimsCard(page: Page) {
  return page.locator('section#claims');
}

/** The open-claim card for a counterparty — the direct-child list only, so a
 * just-closed claim (remembered in the "Settled and closed" disclosure inside
 * the same section) never matches. */
function openClaimCard(page: Page, counterparty: string) {
  return page.locator('section#claims > ul').locator('li', { hasText: counterparty });
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
  // The details toggle is a native DOM flip; confirm it took, so a missed
  // open fails here with a clear signal instead of a mystery li timeout.
  await expect(disclosure).toHaveJSProperty('open', true);
  return disclosure;
}

/** Post the purchase search and wait for the fresh page to be interactive. */
async function submitClaimSearch(page: Page, scope: Locator, expected: RegExp) {
  await scope.getByRole('button', { name: 'Search' }).click();
  // The GET submit is a full navigation; the URL matches before the new
  // document is interactive, so wait for the load before touching the page.
  await page.waitForLoadState('load');
  await expect(page).toHaveURL(expected);
}

/** Record a fresh purchase at the till under a unique supplier name. */
async function recordPurchase(page: Page, supplier: string, amount: string): Promise<void> {
  await page.goto('/');
  await waitForTill(page);
  const entry = page.getByRole('region', { name: /Record it while it is fresh/i });
  await entry.locator('input[name="supplierName"]').fill(supplier);
  await entry.locator('input[name="amount"]').fill(amount);
  await entry.getByLabel('Line 1 amount').fill(amount);
  await pickEntryCategory(entry, 'Groceries / Weekly Shop');
  await entry.getByRole('button', { name: 'Save purchase' }).click();
  await expect(entry.getByRole('status')).toContainText(/saved/i, { timeout: 30_000 });
}

/** Track a claim covering the purchase recorded under `supplier`. */
async function createClaimFrom(
  page: Page,
  supplier: string,
  counterparty: string,
  expectedStatus: RegExp,
) {
  const track = await openTrackForm(openClaimsCard(page));
  await track.getByLabel('Search the purchases the claim covers').fill(supplier);
  await submitClaimSearch(page, track, /claimQ=/);
  const reopened = await openTrackForm(openClaimsCard(page));
  await reopened.locator('li', { hasText: supplier }).locator('input[type="checkbox"]').check();
  await reopened.getByLabel('Who owes you the money?').fill(counterparty);
  await reopened.getByLabel('What for? (optional)').fill('share of the shop');
  await reopened.getByRole('button', { name: 'Start tracking' }).click();
  await expect(reopened.getByRole('status')).toContainText(expectedStatus);
}

test('a claim is tracked, then closed when the money arrives — income recorded, claim settled', async ({
  page,
}) => {
  test.slow();
  const supplier = `Playwright claim arrival ${Date.now()}`;
  const counterparty = `Estate test ${Date.now()}`;
  await recordPurchase(page, supplier, '63.47');

  const claims = openClaimsCard(page);
  await page.goto('/borrowing');
  await expect(
    claims.getByRole('heading', { name: 'Money owed to us — expected back' }),
  ).toBeVisible();

  await createClaimFrom(page, supplier, counterparty, /Tracking £63\.47/i);

  // The claim card lists the linked purchase and the awaited total.
  const card = openClaimCard(page, counterparty);
  await expect(card.getByText(supplier)).toBeVisible();
  await expect(card.getByText('£63.47 awaited')).toBeVisible();
  await expect(card.getByRole('link', { name: new RegExp(supplier) })).toHaveAttribute(
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

  // The open list drops the claim the moment it closes — the durable signal
  // (the success message lives in the closed disclosure, which replaces the
  // open card on the revalidated page).
  await expect(openClaimCard(page, counterparty)).toHaveCount(0);
  await page.goto('/borrowing');
  const closed = openClaimsCard(page).getByText(/Settled and closed/);
  await closed.click();
  await expect(openClaimsCard(page).getByText(counterparty, { exact: true })).toBeVisible();
});

test('settling outside the pots reduces the informal IOU without moving money', async ({
  page,
}) => {
  test.slow();
  const stamp = Date.now();
  const iou = `Sister e2e ${stamp}`;
  const supplier = `Playwright claim cafe ${stamp}`;
  const counterparty = `Estate direct ${stamp}`;
  await recordPurchase(page, supplier, '3.49');
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

  // Track a small claim against the cafe spend.
  await page.goto('/borrowing');
  await createClaimFrom(page, supplier, counterparty, /Tracking £3\.49/i);

  // Settle outside the pots, naming the IOU to reduce.
  const card = openClaimCard(page, counterparty);
  await card.getByText('Paid directly, not into a pot').click();
  const settle = card
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Settle without moving money' }) });
  await settle.getByLabel('Where did the money go?').fill('estate paid Sister directly');
  await settle
    .getByLabel(/Also clear an informal IOU/)
    .selectOption({ label: `${iou} — we owe £100.00` });
  await settle.getByRole('button', { name: 'Settle without moving money' }).click();
  // The claim leaves the open list the moment it closes (see above).
  await expect(card).toHaveCount(0);

  // The IOU dropped by exactly the settled amount.
  await expect(personCard(page, iou).locator('li').getByText('we owe £96.51')).toBeVisible();
  // The ledger carries the settlement against Sister, labelled as a claim.
  await expect(page.locator('tbody tr', { hasText: 'claim settled' }).first()).toBeVisible();
});

test('voiding a claim releases its purchases and keeps the income that already arrived', async ({
  page,
}) => {
  test.slow();
  const stamp = Date.now();
  const supplier = `Playwright claim void ${stamp}`;
  const counterparty = `Estate void ${stamp}`;
  await recordPurchase(page, supplier, '63.47');
  await page.goto('/borrowing');

  await createClaimFrom(page, supplier, counterparty, /Tracking £63\.47/i);

  const card = openClaimCard(page, counterparty);
  await card.getByRole('button', { name: 'Void' }).click();
  await card.getByLabel('Why?').fill('tracked against the wrong shop');
  await card.getByRole('button', { name: 'Yes, void the claim' }).click();

  // The claim is gone from the awaited list…
  await expect(openClaimCard(page, counterparty)).toHaveCount(0);
  // …and the purchase is claimable again.
  await page.goto('/borrowing');
  const track = await openTrackForm(openClaimsCard(page));
  await track.getByLabel('Search the purchases the claim covers').fill(supplier);
  await submitClaimSearch(page, track, /claimQ=/);
  const reopened = await openTrackForm(openClaimsCard(page));
  await expect(
    reopened.locator('li', { hasText: supplier }).locator('input[type="checkbox"]'),
  ).toBeVisible();
});
