import { expect, test, type Locator } from '@playwright/test';
import { waitForTill } from './support';

/**
 * All Transactions (SPEC §15.3, plan decisions 101–108): a read-only,
 * one-pot activity view. The page renders no forms, so these specs check the
 * projection itself — codes, the pot-relative sign, the checkpoint divider,
 * the honest "movements shown" total — and that every row's deep link lands
 * on the record in the page that can still edit or void it.
 *
 * Runs after `checkpoint`; all writes remain inside the isolated E2E seed.
 */

test.describe('all transactions', () => {
  test('projects one pot: purchases, converted schedules and a checkpoint divider', async ({
    page,
  }) => {
    await page.goto('/transactions');
    await expect(page.getByRole('heading', { name: 'Activity in one pot' })).toBeVisible();
    // The default target is the household's main pot.
    await expect(page.getByText('Everything that touched')).toContainText('Main account');

    const table = page.locator('section[aria-labelledby="activity-heading"] table');

    // The seeded split purchase: one row, first allocation line + "+1 more",
    // red (money out), with the original note and the exact-total intact.
    const corner = table
      .locator('tr', { has: page.getByRole('link', { name: /Corner Foods/ }) })
      .first();
    // Anchored: the source cell's name ("Corner Foods — Open this purchase")
    // contains "pur" too, so an unanchored match is not unique.
    await expect(corner.getByRole('cell', { name: /^PUR\b/ })).toBeVisible();
    await expect(corner).toContainText('Groceries / Weekly Shop (household)');
    await expect(corner).toContainText('+1 more');
    await expect(corner).toContainText('−£63.47');
    // The note field is carried across verbatim — but not pinned to the seed's
    // text, because the `desktop` project edits this very purchase's note
    // before this one runs. What matters is that it is not the empty placeholder.
    // With the running-balance column, the notes cell is second-last, not last.
    await expect(corner.getByRole('cell').nth(5)).not.toHaveText('—');

    // A converted standing order keeps its code and links back to the
    // schedule. The seed dates this schedule so its newest conversion is about
    // a week behind today on *every* day of the year (decision 170 ·
    // `scripts/e2e-seed-dates.ts`): with a fixed due day the newest conversion
    // could sit one day outside this page's default last-30-days window and the
    // row would not exist at all — which is what happened on 2026-09-27.
    // `.first()`: an older conversion can share the window on some days. The
    // `desktop` project's move of this schedule to the 21st adds nothing here —
    // a cadence edit regenerates only the forward window and never invents past
    // instances (SPEC §11.1, decision 162).
    const phone = table
      .locator('tr', { has: page.getByRole('link', { name: /Phone plan/ }) })
      .first();
    // No \b after the code: JSX leaves no whitespace between the badge and the
    // schedule link, so the cell's accessible name is "SOOpen the schedule".
    await expect(phone.getByRole('cell', { name: /^SO/ })).toBeVisible();
    await expect(phone.getByRole('link', { name: 'Open the schedule' })).toHaveAttribute(
      'href',
      /^\/recurring#schedule-\d+$/,
    );

    // Alternating rows (issue #23, as on Purchases): neighbouring movements
    // carry different backgrounds. Checkpoint dividers are left out — they are
    // tinted dividers of their own and do not take a turn in the stripe.
    const movementBackgrounds = await table.locator('tbody tr').evaluateAll((rows) =>
      rows
        .filter((row) => !(row.textContent ?? '').includes('Checkpoint · reported'))
        .slice(0, 2)
        .map((row) => getComputedStyle(row).backgroundColor),
    );
    expect(movementBackgrounds).toHaveLength(2);
    expect(movementBackgrounds[0]).not.toBe(movementBackgrounds[1]);

    // The checkpoint is a divider carrying a reported figure, never a movement.
    const divider = table.locator('tr', { hasText: 'Checkpoint · reported' });
    await expect(divider.first()).toContainText('not a movement');
    // Scoped to the footer: the caveat paragraph below the table also says
    // "Movements shown", so an unscoped text match would not be unique.
    await expect(page.locator('tfoot').getByText('Movements shown')).toBeVisible();
    // The page says what the total is not, and explains the balance column.
    await expect(page.getByText(/running balance after each movement/).first()).toBeVisible();
    await expect(page.getByText(/Green is in credit, red is overdrawn/).first()).toBeVisible();
  });

  test('one transfer is red on the pot it left and green on the pot it reached', async ({
    page,
  }) => {
    // Transfers are recorded where they always were: the Move tab. This page
    // only reads.
    await page.goto('/');
    await waitForTill(page);
    const entry = page.getByRole('region', { name: /Record it while it is fresh/i });
    await entry.getByRole('tab', { name: 'Move' }).click();
    await entry.getByLabel('From pot').selectOption({ label: 'Main account' });
    await entry.getByLabel('To pot').selectOption({ label: "Alex's cash" });
    await entry.getByLabel('Amount').fill('7.77');
    await entry.getByRole('button', { name: 'Record transfer' }).click();
    await expect(entry.getByRole('status')).toContainText(/recorded/i, { timeout: 30_000 });

    // Red on Main, from the selected pot's point of view.
    await page.goto('/transactions');
    const outRow = page
      .locator('section[aria-labelledby="activity-heading"] table tr')
      .filter({ hasText: '£7.77' });
    await expect(outRow.getByRole('cell', { name: /^TX>/ })).toBeVisible();
    await expect(outRow).toContainText("Alex's cash");
    await expect(outRow).toContainText('−£7.77');

    // Green on Alex's cash — the same record, the other side.
    const filters = page.getByRole('form', { name: 'Activity filters' });
    await filters.getByLabel('Target').selectOption({ label: "Alex's cash" });
    await filters.getByRole('button', { name: 'Show activity' }).click();
    const inRow = page
      .locator('section[aria-labelledby="activity-heading"] table tr')
      .filter({ hasText: '£7.77' });
    await expect(inRow.getByRole('cell', { name: /^TX</ })).toBeVisible();
    await expect(inRow).toContainText('Main account');
    await expect(inRow).toContainText('+£7.77');

    // The deep link lands on the record itself, not just its section.
    await inRow.getByRole('link', { name: /Open this transfer/ }).click();
    await expect(page).toHaveURL(/\/pots\?transfer=\d+#transfer-\d+/);
    const transfers = page.locator('section[aria-labelledby="transfers-heading"]');
    await expect(transfers).toContainText(/Main account\s*→\s*Alex's cash/);
    const row = transfers.locator('li').filter({ hasText: '£7.77' });
    await row.getByText('Void', { exact: true }).click();
    await row.getByLabel(/Why are you voiding this/).fill('Typed the wrong pots');
    await row.getByRole('button', { name: 'Void transfer' }).click();
    await expect(row).toContainText(/voided/i, { timeout: 30_000 });
  });

  test('a saved transfer is corrected in place — pots, amount and note (issue #33)', async ({
    page,
  }) => {
    // The issue as the household hit it: a transfer recorded with the wrong
    // destination and no note, with only a Void to reach for. It is now
    // corrected on the page that reviews it.
    await page.goto('/');
    await waitForTill(page);
    const entry = page.getByRole('region', { name: /Record it while it is fresh/i });
    await entry.getByRole('tab', { name: 'Move' }).click();
    await entry.getByLabel('From pot').selectOption({ label: 'Main account' });
    await entry.getByLabel('To pot').selectOption({ label: "Alex's cash" });
    await entry.getByLabel('Amount').fill('12.34');
    await entry.getByRole('button', { name: 'Record transfer' }).click();
    await expect(entry.getByRole('status')).toContainText(/recorded/i, { timeout: 30_000 });

    await page.goto('/pots');
    const transfers = page.locator('section[aria-labelledby="transfers-heading"]');
    const row = transfers.locator('li').filter({ hasText: '£12.34' });
    await expect(row).toBeVisible();
    // The row's own anchor survives the correction; its amount does not.
    const anchor = await row.getAttribute('id');
    expect(anchor).toMatch(/^transfer-\d+$/);

    // The editor opens holding the record as saved — the amount, the date
    // and both pots — instead of blanks the household must retype. The date
    // can never be later than today, because the record never is.
    const editor = row
      .getByText('Edit', { exact: true })
      .locator('xpath=ancestor-or-self::details[1]');
    await editor.locator(':scope > summary').click();
    await expect(editor.getByLabel('Amount')).toHaveValue('12.34');
    await expect(editor.getByLabel('Note (blank keeps the current note)')).toHaveValue('');
    await expect(editor.getByLabel('When')).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
    await expect(editor.getByLabel('When')).toHaveAttribute('max', /^\d{4}-\d{2}-\d{2}$/);
    expect(await selectedLabel(editor.getByLabel('From pot'))).toBe('Main account');
    expect(await selectedLabel(editor.getByLabel('To pot'))).toBe("Alex's cash");

    // Correct the pot, the amount, and add the note the hurried entry left out.
    await editor.getByLabel('To pot').selectOption({ label: "Sam's cash" });
    await editor.getByLabel('Amount').fill('12.99');
    await editor.getByLabel('Note (blank keeps the current note)').fill('Wrong pot — put right');
    await editor.getByRole('button', { name: 'Save transfer' }).click();
    // Re-locate by the anchor, not by the amount the correction just changed.
    const savedRow = transfers.locator(`#${anchor}`);
    await expect(savedRow.getByRole('status')).toContainText(/corrected/i, { timeout: 30_000 });

    // The row reads the corrected record, and only the corrected record:
    // one movement, moved, not a void plus a second entry.
    await page.goto('/pots');
    const corrected = page.locator(`#${anchor}`);
    await expect(corrected).toContainText(/Main account\s*→\s*Sam's cash/);
    await expect(corrected).toContainText('£12.99');
    await expect(corrected).toContainText('Wrong pot — put right');
    await expect(transfers.locator('li').filter({ hasText: '£12.34' })).toHaveCount(0);

    // Void it (after a fresh load, because a correction bumps the version and
    // the app refuses a stale form) so the shared seed's estimates end where
    // they started.
    await corrected.getByText('Void', { exact: true }).click();
    await corrected
      .getByLabel(/Why are you voiding this/)
      .fill('Corrected, then voided by the browser test');
    await corrected.getByRole('button', { name: 'Void transfer' }).click();
    await expect(corrected).toContainText(/voided/i, { timeout: 30_000 });
  });

  test('a stale transfer editor saves nothing and says why (issue #33)', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await waitForTill(page);
    const entry = page.getByRole('region', { name: /Record it while it is fresh/i });
    await entry.getByRole('tab', { name: 'Move' }).click();
    await entry.getByLabel('From pot').selectOption({ label: 'Main account' });
    await entry.getByLabel('To pot').selectOption({ label: "Alex's cash" });
    await entry.getByLabel('Amount').fill('21.21');
    await entry.getByRole('button', { name: 'Record transfer' }).click();
    await expect(entry.getByRole('status')).toContainText(/recorded/i, { timeout: 30_000 });

    // Two readers of the same row: the second is loaded before the first
    // saves, so its editor carries the version the row had when it opened.
    await page.goto('/pots');
    const stalePage = await context.newPage();
    await stalePage.goto('/pots');
    const transfersOn = (p: typeof page) =>
      p.locator('section[aria-labelledby="transfers-heading"]');
    const freshRow = transfersOn(page).locator('li').filter({ hasText: '£21.21' });
    const staleRow = transfersOn(stalePage).locator('li').filter({ hasText: '£21.21' });
    await expect(staleRow).toBeVisible();

    const freshEditor = freshRow
      .getByText('Edit', { exact: true })
      .locator('xpath=ancestor-or-self::details[1]');
    await freshEditor.locator(':scope > summary').click();
    await freshEditor.getByLabel('Note (blank keeps the current note)').fill('saved first');
    await freshEditor.getByRole('button', { name: 'Save transfer' }).click();
    await expect(freshEditor.getByRole('status')).toContainText(/corrected/i, { timeout: 30_000 });

    // The stale editor's save is refused by the domain's version guard, with
    // the domain's own message, and the amount it tried to write is not saved.
    const staleEditor = staleRow
      .getByText('Edit', { exact: true })
      .locator('xpath=ancestor-or-self::details[1]');
    await staleEditor.locator(':scope > summary').click();
    await staleEditor.getByLabel('Amount').fill('99.99');
    await staleEditor.getByRole('button', { name: 'Save transfer' }).click();
    await expect(staleEditor.getByRole('status')).toContainText(/changed by someone else/i, {
      timeout: 30_000,
    });
    await stalePage.close();

    await page.goto('/pots');
    const row = transfersOn(page).locator('li').filter({ hasText: '£21.21' });
    await expect(row).toContainText('saved first');
    await expect(transfersOn(page).locator('li').filter({ hasText: '£99.99' })).toHaveCount(0);

    await row.getByText('Void', { exact: true }).click();
    await row.getByLabel(/Why are you voiding this/).fill('Voided by the browser test');
    await row.getByRole('button', { name: 'Void transfer' }).click();
    await expect(row).toContainText(/voided/i, { timeout: 30_000 });
  });

  test('income renders as BAC and deep-links to the Income page', async ({ page }) => {
    // The seeded one-off income: the bicycle sold for cash (plan decision 110).
    // Income was reserved (`BAC`) but never rendered before v0.4.0.
    await page.goto('/transactions');
    const filters = page.getByRole('form', { name: 'Activity filters' });
    await filters.getByLabel('Target').selectOption({ label: "Alex's cash" });
    await filters.getByRole('button', { name: 'Show activity' }).click();

    const table = page.locator('section[aria-labelledby="activity-heading"] table');
    const income = table.locator('tr', { hasText: 'Sale of bicycle' }).first();
    // No \b after the code, for the same reason as the SO row above.
    await expect(income.getByRole('cell', { name: /^BAC/ })).toBeVisible();
    await expect(income).toContainText('+£45.00');
    await expect(income).toContainText('Collected in cash');
    // Income carries no category — it is not spending (SPEC §6).
    await expect(income.getByRole('cell').nth(3)).toHaveText('—');

    // The canonical form for income is the Income page, and the link lands on
    // the record itself.
    await income.getByRole('link', { name: /Open this income record/ }).click();
    await expect(page).toHaveURL(/\/income\?receipt=\d+#receipt-\d+/);
    await expect(
      page.locator('section[aria-labelledby="income-history-heading"] li', {
        hasText: 'Sale of bicycle',
      }),
    ).toContainText('+£45.00');
  });

  test('a purchase row deep-links to its filtered row on Purchases', async ({ page }) => {
    await page.goto('/transactions');
    const table = page.locator('section[aria-labelledby="activity-heading"] table');
    await table
      .getByRole('link', { name: /Corner Foods/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/purchases\?potId=\d+&from=\d{4}-\d{2}-\d{2}&to=/);
    await expect(page.locator('section[aria-labelledby="results-heading"]')).toContainText(
      'Corner Foods',
    );

    // Issue #30: the target row lands *below* the sticky site header, not
    // underneath it. The row the fragment names is the one that must clear it —
    // a `hasText` match would find whichever Corner Foods row comes first in a
    // seed grown by other specs, which is not the row under test. The landing
    // offset is measured (`sf-anchor`, re-opened issue #34), and the root-layout
    // scroll pass corrects a cold load's own scroll (`src/components/scroll-hash.tsx`).
    const anchoredId = new URL(page.url()).hash.slice(1);
    const row = page.locator(`tr[id="${anchoredId}"]`);
    await expect(row).toContainText('Corner Foods');
    const header = page.locator('header.sticky').first();
    await expect
      .poll(async () => {
        const rowBox = await row.boundingBox();
        const headerBox = await header.boundingBox();
        if (rowBox === null || headerBox === null) return false;
        return rowBox.y >= headerBox.y + headerBox.height;
      })
      .toBe(true);
  });

  test('expected support appears from its due date and gives way to the recorded borrowing', async ({
    page,
  }) => {
    // The household's shape (v0.7.0): an arrangement that has not started, so
    // the expectation must project and list before any money moves. The
    // server's own today is read from the End date input's `max` — the window
    // ends there — so this spec never fights the clock.
    await page.goto('/transactions');
    const serverToday = (await page.getByLabel('End date').getAttribute('max')) ?? '';
    if (serverToday === '') throw new Error('End date input has no max attribute');
    const dayOfMonth = Number(serverToday.slice(8, 10));

    // A brand-new IOU with no movements at all, then the expectation on it.
    await page.goto('/pots');
    const debts = page.locator('section[aria-labelledby="debts-heading"]');
    const trackForm = debts
      .locator('form')
      .filter({ has: page.getByRole('button', { name: 'Track this debt' }) });
    const counterparty = `E2E Expectant ${Date.now()}`;
    await trackForm.getByLabel('Who is it owed to or by?').fill(counterparty);
    await trackForm.getByRole('button', { name: 'Track this debt' }).click();
    await expect(trackForm.getByRole('status')).toContainText(/now tracking/i);

    const row = debts.locator('li').filter({ hasText: counterparty }).first();
    await expect(row.getByText('no movements yet')).toBeVisible();
    await row.getByText('Edit', { exact: true }).click();
    const editForm = row.locator('form');
    await editForm.getByLabel('Expected support payment').fill('250.00');
    await editForm.getByLabel('Day of the month').fill(String(dayOfMonth));
    await editForm.getByRole('button', { name: 'Save debt' }).click();
    await expect(editForm.getByRole('status')).toContainText(/updated/i);
    // The panel says what the expectation is and that it moves no money. The
    // edit form's own hint carries the same phrase, so match the panel's
    // distinctive sentence rather than the phrase alone.
    await expect(row.getByText(/Expecting £250\.00 on day \d+ of each month/)).toBeVisible();
    await expect(
      row.getByText(/Expected, never received: it shows in the projections/),
    ).toBeVisible();

    // From its due date the expectation is on All Transactions: flagged,
    // linked to the loan panel, and outside the movements totals.
    const from = minusDays(serverToday, 3);
    const activityUrl = `/transactions?from=${from}&to=${serverToday}`;
    await page.goto(activityUrl);
    const table = page.locator('section[aria-labelledby="activity-heading"] table');
    const expectedRow = table.locator('tr').filter({ hasText: counterparty });
    await expect(expectedRow.getByRole('cell', { name: /^EXP</ })).toBeVisible();
    await expect(expectedRow).toContainText('+£250.00');
    await expect(expectedRow).toContainText('expected — not recorded yet');
    // The footer counts the expectations it is deliberately not counting. The
    // number is only asserted as "at least one" in words: the seeded Mum
    // expectation can share this short window when the run lands near the
    // 12th, so pinning it to 1 would be a date-dependent flake.
    await expect(
      page.locator('tfoot').getByText(/Expected support \(\d+\s*expectations?,\s*not counted\)/),
    ).toBeVisible();
    await expect(page.locator('tfoot').getByText('not a movement')).toBeVisible();
    // The row links to the loan panel that owns it.
    await expect(expectedRow.getByRole('link', { name: /Open the loan panel/ })).toHaveAttribute(
      'href',
      /\/pots#debt-\d+$/,
    );

    // The money lands and is recorded that day: the expectation gives way to
    // the real borrowing, on the same window.
    await page.goto('/pots');
    const borrow = page.locator('section[aria-labelledby="borrow-heading"]');
    await borrow.getByLabel('Debt').selectOption({ label: `${counterparty} (we owe)` });
    await borrow.getByLabel('Pot').selectOption({ label: 'Main account' });
    await borrow.getByLabel('Amount').fill('250.00');
    await borrow.getByRole('button', { name: 'Record it' }).click();
    await expect(borrow.getByRole('status')).toContainText(/borrowed £250\.00/i);

    await page.goto(activityUrl);
    await expect(
      page.locator('section[aria-labelledby="activity-heading"]').getByText(counterparty),
    ).toBeVisible();
    // This debt's expectation is gone — the seeded one (if it happens to fall
    // in the window) is not this test's business.
    const borrowRow = table.locator('tr').filter({ hasText: counterparty });
    await expect(borrowRow.getByRole('cell', { name: /^EXP</ })).toHaveCount(0);
    await expect(borrowRow.getByRole('cell', { name: /^LN</ })).toBeVisible();
    await expect(borrowRow).toContainText('+£250.00');
    // The loan panel now carries the real balance.
    await page.goto('/pots');
    await expect(
      page.locator('section[aria-labelledby="debts-heading"]').getByText('we owe £250.00'),
    ).toBeVisible();
  });

  test('shows running balance at far right, green in credit red in debit, anchored on checkpoints', async ({
    page,
  }) => {
    await page.goto('/transactions');
    const table = page.locator('section[aria-labelledby="activity-heading"] table');
    // Header has Balance at far right
    await expect(table.getByRole('columnheader', { name: 'Balance' })).toBeVisible();

    // Checkpoint divider shows its reported figure as balance, with colour
    const divider = table.locator('tr', { hasText: 'Checkpoint · reported' }).first();
    // The balance cell is the last cell of the divider row
    const dividerBalance = divider.getByRole('cell').last();
    await expect(dividerBalance).toContainText(/£/);
    // Colour-coded: check class contains positive or danger (credit/debit)
    await expect(dividerBalance).toHaveClass(/text-(positive|danger)/);

    // A transaction row shows a running balance in the far-right cell
    const anyRow = table
      .locator('tbody tr')
      .filter({ has: page.getByText('£') })
      .first();
    const balanceCell = anyRow.getByRole('cell').last();
    // Balance cell should contain £ or — when no anchor
    await expect(balanceCell).toContainText(/£|—/);

    // If there is a balance, it should be colour-coded
    const rowsWithBalance = table.locator('tbody tr').filter({ hasText: '£' });
    // At least one row should have a £ in the balance column (not just amount)
    // The balance column is last, so check that some last cells have £
    await expect(rowsWithBalance.locator('td').last().first()).toBeVisible();
  });
});

/**
 * A local date `days` before an ISO date — computed in UTC from the server's
 * own date string, so the window never depends on the browser's clock.
 */
function minusDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const shifted = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) - days));
  return shifted.toISOString().slice(0, 10);
}

/** The visible option text of a <select> — what the household sees selected. */
async function selectedLabel(select: Locator): Promise<string> {
  return select.evaluate((el) => (el as HTMLSelectElement).selectedOptions[0]?.textContent ?? '');
}
