import { expect, test } from '@playwright/test';
import { waitForTill } from './support';

/**
 * Household-boundary money (SPEC §10.2): informal debts, borrowing and
 * repayments, and swaps with someone outside the household. Borrowing is
 * shown as owed beside "available now" — never as income.
 *
 * Swap semantics (SPEC §7.1): swap legs are date-only records. A swap
 * recorded after both pots' checkpoints moves both estimates, so the
 * household total does not change. A credit recorded before a same-day
 * checkpoint is already inside that count; the debit leg still counts, so
 * that order can read one leg low until the next checkpoint.
 */

function parsePounds(text: string): number {
  const match = text.match(/£([\d,]+\.\d{2})/);
  const value = match?.[1];
  if (value === undefined) throw new Error(`no £ amount in ${JSON.stringify(text)}`);
  return Number(value.replace(/,/g, ''));
}

test.describe('external money', () => {
  test('borrowing raises the owed balance beside available now', async ({ page }) => {
    // Debts live on the Borrowing page since issue #60 (decision 228).
    await page.goto('/borrowing');
    const setup = page.locator('section[aria-labelledby="setup-heading"]');
    await setup.getByRole('button', { name: 'Setup new Borrowing or lending' }).click();
    await setup.getByLabel('Their name').fill('E2E Lender');
    await setup.getByLabel('Is this a recurring arrangement?').selectOption('none');
    await setup.getByRole('button', { name: 'Start tracking' }).click();
    await expect(setup.getByRole('status')).toContainText(/now tracking/i);

    const lenderCard = page.locator('section', {
      has: page.getByRole('heading', { name: 'E2E Lender', exact: true }),
    });
    await lenderCard.getByRole('link', { name: 'Record borrowing' }).click();
    const record = lenderCard.locator('[data-inline-record]');
    await record.getByLabel('Pot').selectOption({ label: 'Main account' });
    await record.getByLabel('Amount').fill('50.00');
    await record.getByRole('button', { name: 'Record it' }).click();
    await expect(record.getByRole('status')).toContainText(/borrowed £50\.00/i);

    // The new debt's own card reads £50.00 (the seeded "Mum" card keeps its
    // £1,000.00 beside it — both are owed, never income). Scoped to the
    // debt line: the person header repeats the same figure.
    await expect(lenderCard.locator('li').getByText('we owe £50.00')).toBeVisible();
    const mumCard = page.locator('section', {
      has: page.getByRole('heading', { name: 'Mum', exact: true }),
    });
    await expect(mumCard.locator('li').getByText('we owe £1,000.00')).toBeVisible();
    await page.goto('/');
    await waitForTill(page);
    // The household now owes Mum's £1,000 plus the £50 just borrowed.
    const owedLine = page.locator('p', { hasText: /Owe others/ }).first();
    await expect(owedLine).toContainText('£1,050.00');
    await expect(owedLine).toContainText('borrowed, not income');
  });

  test('repayments reduce the balance; a swap recorded after the checkpoint is net zero', async ({
    page,
  }) => {
    await page.goto('/borrowing');
    const lenderCard = page.locator('section', {
      has: page.getByRole('heading', { name: 'E2E Lender', exact: true }),
    });
    await lenderCard.getByRole('link', { name: 'Record a repayment' }).click();
    const record = lenderCard.locator('[data-inline-record]');
    await record.getByLabel('Pot').selectOption({ label: 'Main account' });
    await record.getByLabel('Amount').fill('20.00');
    await record.getByRole('button', { name: 'Record it' }).click();
    await expect(record.getByRole('status')).toContainText(/repaid £20\.00/i);

    await expect(lenderCard.locator('li').getByText('we owe £30.00')).toBeVisible();

    await page.goto('/');
    await waitForTill(page);
    const before = await page.locator('#money-heading').textContent();
    if (before === null) throw new Error('household heading missing');
    const beforePence = Math.round(parsePounds(before) * 100);

    await page.goto('/pots');
    const swap = page.locator('section[aria-labelledby="swap-heading"]');
    // The record card holds the SwapForm and nothing else since issue #65
    // moved the swap list into the nested history panel below.
    const swapForm = swap
      .locator('form')
      .filter({ has: page.getByRole('button', { name: 'Record swap' }) });
    await swapForm.getByLabel('Who did you swap with?').fill('E2E Son');
    await swapForm.getByLabel('Money arrived in').selectOption({ label: "Alex's cash" });
    await swapForm.getByLabel('Money left from').selectOption({ label: 'Main account' });
    await swapForm.getByLabel('Amount').fill('10.00');
    await swapForm.getByRole('button', { name: 'Record swap' }).click();
    await expect(swapForm.getByRole('status')).toContainText(/swapped £10\.00/i);

    // SPEC §7.1: both pots were checkpointed before this swap was recorded,
    // so the out-leg and the in-leg both count. The household total does not
    // move. (The one-leg-low case is a swap recorded *before* the same-day
    // checkpoint, covered by the domain tests.)
    await page.goto('/');
    await waitForTill(page);
    const after = await page.locator('#money-heading').textContent();
    if (after === null) throw new Error('household heading missing');
    expect(Math.round(parsePounds(after) * 100)).toBe(beforePence);
  });

  test('a swap reads as one nested object, editable and voidable in place', async ({ page }) => {
    await page.goto('/pots');
    const swap = page.locator('section[aria-labelledby="swap-heading"]');
    // The record card holds the SwapForm and nothing else since issue #65
    // moved the swap list into the nested history panel below.
    const swapForm = swap
      .locator('form')
      .filter({ has: page.getByRole('button', { name: 'Record swap' }) });
    // Unique per attempt: a failed attempt leaves its pair in the shared
    // e2e database, and a retry must not match the old pair's name.
    const counterparty = `E2E Trader ${Date.now()}`;
    await swapForm.getByLabel('Who did you swap with?').fill(counterparty);
    await swapForm.getByLabel('Money arrived in').selectOption({ label: "Alex's cash" });
    await swapForm.getByLabel('Money left from').selectOption({ label: 'Main account' });
    await swapForm.getByLabel('Amount').fill('30.00');
    await swapForm.getByRole('button', { name: 'Record swap' }).click();
    await expect(swapForm.getByRole('status')).toContainText(/swapped £30\.00/i);

    // Findable where the household looks: one object in the history panel,
    // its two legs nested and worded as the swap's two halves (issue #65) —
    // and linked from the pot card.
    const history = page.locator('section[aria-labelledby="external-history-heading"]');
    const pair = history.locator('[data-swap-pair]').filter({ hasText: counterparty });
    await expect(pair).toBeVisible();
    await expect(pair.getByText('net £0.00')).toBeVisible();
    await expect(pair.getByText(/Swap in £30\.00 from .* · into Alex's cash/)).toBeVisible();
    await expect(pair.getByText(/Swap out £30\.00 to .* · from Main account/)).toBeVisible();
    // The nested leg carries the pointer arrow; the leading leg does not.
    await expect(pair.locator('svg')).toHaveCount(1);
    const legs = pair.locator('div[id^="external-"]');
    await expect(legs).toHaveCount(2);
    const mainCard = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Main account', exact: true }) });
    await expect(mainCard.getByText(/Recent swaps involving Main account/)).toBeVisible();

    // Edit the in-leg's note straight from its own row — the same inline
    // editing the retired "Recent swaps" list offered, now in the one place
    // a swap can be corrected.
    const inLeg = legs.first();
    await expect(inLeg.getByText(/Swap in £30\.00/)).toBeVisible();
    await inLeg.getByRole('button', { name: 'Edit' }).click();
    await pair.getByLabel('Note (blank keeps the current note)').fill('edited at the table');
    await pair.getByRole('button', { name: 'Save changes' }).click();
    await expect(pair.getByText('— edited at the table')).toBeVisible();

    // Void the out-leg alone from its own row: the pair stays visible and
    // says so honestly.
    const outLeg = legs.nth(1);
    await expect(outLeg.getByText(/Swap out £30\.00/)).toBeVisible();
    await outLeg.getByRole('button', { name: 'Void' }).click();
    await pair.getByLabel(/Why are you voiding this\?/).fill('the transfer never left');
    await pair.getByRole('button', { name: 'Void external' }).click();
    await expect(pair.getByText('one leg voided · net +£30.00')).toBeVisible();
    await expect(outLeg.getByText(/voided — the transfer never left/)).toBeVisible();

    // The pot-card link lands on the history panel that now holds every swap.
    await mainCard.getByRole('link', { name: /Recent swaps involving Main account/ }).click();
    await expect(history).toBeInViewport();
    await expect(pair).toBeInViewport();
  });

  test('a swap that never happened is voided as a pair, with one reason', async ({ page }) => {
    await page.goto('/pots');
    const swapForm = page
      .locator('section[aria-labelledby="swap-heading"] form')
      .filter({ has: page.getByRole('button', { name: 'Record swap' }) });
    const counterparty = `E2E Pair ${Date.now()}`;
    await swapForm.getByLabel('Who did you swap with?').fill(counterparty);
    await swapForm.getByLabel('Money arrived in').selectOption({ label: "Sam's cash" });
    await swapForm.getByLabel('Money left from').selectOption({ label: 'Salary account' });
    await swapForm.getByLabel('Amount').fill('12.00');
    await swapForm.getByRole('button', { name: 'Record swap' }).click();
    await expect(swapForm.getByRole('status')).toContainText(/swapped £12\.00/i);

    const history = page.locator('section[aria-labelledby="external-history-heading"]');
    const pair = history.locator('[data-swap-pair]').filter({ hasText: counterparty });
    await pair.getByRole('button', { name: 'Void both legs' }).click();
    await pair.getByLabel('Why are you voiding both legs?').fill('the swap never happened');
    await pair.getByRole('button', { name: 'Yes, void both legs' }).click();

    // The pair's durable confirmation is the "voided" badge and the shared
    // reason; both legs are struck through but stay visible.
    await expect(pair.getByText('voided', { exact: true })).toBeVisible();
    await expect(pair.getByText(/voided — the swap never happened/).first()).toBeVisible();
    await expect(pair.getByText(/Swap in £12\.00/)).toHaveClass(/line-through/);
    await expect(pair.getByText(/Swap out £12\.00/)).toHaveClass(/line-through/);
    await expect(pair.getByRole('button', { name: 'Void both legs' })).toHaveCount(0);
    await expect(pair.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  });
});
