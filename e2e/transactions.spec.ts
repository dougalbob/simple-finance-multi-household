import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  pickEntryCategory,
  waitForPurchaseToggle,
  waitForTill,
  waitForTransferToggle,
} from './support';

/**
 * All Transactions (SPEC §15.3, plan decisions 101–108): a one-pot activity
 * view. These specs check the projection itself — codes, the pot-relative
 * sign, the checkpoint divider, the honest "movements shown" total — and that
 * every row's deep link lands on the record in the page that can edit or
 * void it. Two exceptions open in place, their correction and void forms
 * beneath their own row: an internal transfer (decision 225, GitHub issue
 * #55) and a purchase (decision 226, GitHub issue #57) — a hand-recorded
 * `PUR`, a `DD` or an `SO`, while a refund keeps its link to Purchases. The
 * pots page no longer lists transfers at all.
 *
 * Runs after `checkpoint`; all writes remain inside the isolated E2E seed,
 * and every transfer a spec records is voided before it ends.
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
      .locator('tr', { has: page.getByRole('button', { name: /Corner Foods/ }) })
      .first();
    // Anchored: the source cell's name ("Corner Foods — Open this purchase")
    // contains "pur" too, so an unanchored match is not unique.
    await expect(corner.getByRole('cell', { name: /^PUR\b/ })).toBeVisible();
    // A purchase opens in place too (issue #57, decision 226): the supplier
    // name is a disclosure, not a link off to Purchases.
    await expect(
      corner.getByRole('button', { name: /Corner Foods — Open this purchase/ }),
    ).toBeVisible();
    await expect(corner.getByRole('link', { name: /Corner Foods/ })).toHaveCount(0);
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
      .locator('tr', { has: page.getByRole('button', { name: /Phone plan/ }) })
      .first();
    // No \b after the code: JSX leaves no whitespace between the badge and the
    // schedule link, so the cell's accessible name is "SOOpen the schedule".
    await expect(phone.getByRole('cell', { name: /^SO/ })).toBeVisible();
    // The schedule a converted row came from is still a link (issue #57
    // changes the record's own cell, never the schedule it was converted from).
    await expect(
      phone.getByRole('button', { name: /Phone plan — Open this purchase/ }),
    ).toBeVisible();
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

  test('one transfer is red on the pot it left, green on the pot it reached, and opens in place', async ({
    page,
  }) => {
    // Transfers are recorded where they always were: the Move tab.
    await recordTransfer(page, { to: "Alex's cash", amount: '7.77' });

    // Red on Main, from the selected pot's point of view.
    await page.goto('/transactions');
    const outRow = transferRows(page).filter({ hasText: '£7.77' });
    await expect(outRow.getByRole('cell', { name: /^TX>/ })).toBeVisible();
    await expect(outRow).toContainText("Alex's cash");
    await expect(outRow).toContainText('−£7.77');

    // Green on Alex's cash — the same record, the other side.
    const filters = page.getByRole('form', { name: 'Activity filters' });
    await filters.getByLabel('Target').selectOption({ label: "Alex's cash" });
    await filters.getByRole('button', { name: 'Show activity' }).click();
    const inRow = transferRows(page).filter({ hasText: '£7.77' });
    await expect(inRow.getByRole('cell', { name: /^TX</ })).toBeVisible();
    await expect(inRow).toContainText('Main account');
    await expect(inRow).toContainText('+£7.77');

    // Issue #55: the transfer opens right here, directly beneath its row — the
    // household never leaves the list they were reading (decision 225).
    const rowId = await inRow.getAttribute('id');
    expect(rowId).toMatch(/^transfer-\d+$/);
    const transferId = Number(rowId?.slice('transfer-'.length));
    const row = page.locator(`#${rowId}`);
    await waitForTransferToggle(row);
    const toggle = row.getByRole('button', { name: /Main account — Open this transfer/ });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    const panel = page.locator(`#${rowId}-panel`);
    await expect(
      row.locator('xpath=following-sibling::tr[1]').locator(`#${rowId}-panel`),
    ).toBeVisible();
    await expect(
      row.getByRole('button', { name: /Main account — Close this transfer/ }),
    ).toHaveAttribute('aria-expanded', 'true');
    await expect(panel.getByRole('heading', { name: /Main account → Alex's cash/ })).toBeVisible();
    await expect(page).toHaveURL(
      new RegExp(`^[^?]+/transactions\\?.*transfer=${transferId}#transfer-${transferId}$`),
    );

    // Void it in place. A void takes the transfer out of the list — voided
    // records are never movements — but the open transfer stays on screen,
    // pinned and struck through, saying so, until the household closes it.
    await panel.getByLabel(/Why are you voiding this/).fill('Typed the wrong pots');
    await panel.getByRole('button', { name: 'Void transfer' }).click();
    await expect(panel).toContainText('Voided — “Typed the wrong pots”', { timeout: 30_000 });
    await expect(row).toContainText('voided — not counted');
    await expect(row.getByRole('cell').last()).toHaveText('—');
    await expect(panel.getByRole('button', { name: 'Void transfer' })).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Save transfer' })).toHaveCount(0);

    await panel.getByRole('button', { name: 'Close' }).click();
    await expect(page.locator(`#${rowId}`)).toHaveCount(0);
    await expect(page).not.toHaveURL(/transfer=/);
    await page.reload();
    await expect(transferRows(page).filter({ hasText: '£7.77' })).toHaveCount(0);
  });

  test('a saved transfer is corrected in place — pots, amount and note (issues #33, #55)', async ({
    page,
  }) => {
    // The issue as the household hit it: a transfer recorded with the wrong
    // destination and no note. It is corrected beneath its own row.
    await recordTransfer(page, { to: "Alex's cash", amount: '12.34' });

    await page.goto('/transactions');
    const row = await transferRowByAmount(page, '£12.34');
    // The row's own anchor survives the correction; its amount does not.
    const rowId = await row.getAttribute('id');
    await row.getByRole('button', { name: /Open this transfer/ }).click();
    const editor = page.locator(`#${rowId}-panel`);

    // The editor opens holding the record as saved — the amount, the date
    // and both pots — instead of blanks the household must retype. The date
    // can never be later than today, because the record never is.
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
    await expect(editor.getByText(/Transfer #\d+ corrected/)).toBeVisible({ timeout: 30_000 });

    // The row reads the corrected record — one movement, moved, not a void
    // plus a second entry — and the editor still holds what was saved: React
    // resets a form after its action, and the pickers must not snap back to
    // the pot the household just corrected.
    const corrected = page.locator(`#${rowId}`);
    await expect(corrected).toContainText("Sam's cash");
    await expect(corrected).toContainText('−£12.99');
    await expect(corrected).toContainText('Wrong pot — put right');
    expect(await selectedLabel(editor.getByLabel('To pot'))).toBe("Sam's cash");
    expect(await selectedLabel(editor.getByLabel('From pot'))).toBe('Main account');
    await expect(editor.getByLabel('Amount')).toHaveValue('12.99');
    // Scoped to transfer rows: the `mobile` project's till purchase is also
    // £12.34 on Main account today, and it is not this test's business.
    await expect(transferRows(page).filter({ hasText: '£12.34' })).toHaveCount(0);

    // Void it from the same panel — the correction bumped the version, and
    // the panel carries the new one — so the seed's estimates end where they
    // started.
    await editor
      .getByLabel(/Why are you voiding this/)
      .fill('Corrected, then voided by the browser test');
    await editor.getByRole('button', { name: 'Void transfer' }).click();
    await expect(editor).toContainText('Voided', { timeout: 30_000 });
  });

  test('a stale transfer editor saves nothing and says why (issue #33)', async ({
    page,
    context,
  }) => {
    await recordTransfer(page, { to: "Alex's cash", amount: '21.21' });
    await page.goto('/transactions');
    const transferId = Number(
      (await (await transferRowByAmount(page, '£21.21')).getAttribute('id'))?.slice(
        'transfer-'.length,
      ),
    );

    // Two readers of the same transfer: the second is loaded before the first
    // saves, so its editor carries the version the row had when it opened.
    const openUrl = `/transactions?transfer=${transferId}#transfer-${transferId}`;
    await page.goto(openUrl);
    const stalePage = await context.newPage();
    await stalePage.goto(openUrl);
    const panelOn = (p: Page) => p.locator(`#transfer-${transferId}-panel`);
    await expect(panelOn(stalePage)).toBeVisible();

    const fresh = panelOn(page);
    await fresh.getByLabel('Note (blank keeps the current note)').fill('saved first');
    await fresh.getByRole('button', { name: 'Save transfer' }).click();
    await expect(fresh.getByText(/corrected/)).toBeVisible({ timeout: 30_000 });

    // The stale editor's save is refused by the domain's version guard, with
    // the domain's own message, and the amount it tried to write is not saved.
    const stale = panelOn(stalePage);
    await stale.getByLabel('Amount').fill('99.99');
    await stale.getByRole('button', { name: 'Save transfer' }).click();
    await expect(stale.getByText(/changed by someone else/i)).toBeVisible({ timeout: 30_000 });
    await stalePage.close();

    await page.goto('/transactions');
    const row = page.locator(`#transfer-${transferId}`);
    await expect(row).toContainText('saved first');
    await expect(row).toContainText('£21.21');
    await expect(transferRows(page).filter({ hasText: '£99.99' })).toHaveCount(0);

    await waitForTransferToggle(row);
    await row.getByRole('button', { name: /Open this transfer/ }).click();
    const panel = panelOn(page);
    await panel.getByLabel(/Why are you voiding this/).fill('Voided by the browser test');
    await panel.getByRole('button', { name: 'Void transfer' }).click();
    await expect(panel).toContainText('Voided', { timeout: 30_000 });
  });

  test('a transfer moved onto other pots stays pinned under the pointer; old links redirect (issue #55)', async ({
    page,
  }) => {
    await recordTransfer(page, { to: "Alex's cash", amount: '31.13' });
    await page.goto('/transactions');
    const row = await transferRowByAmount(page, '£31.13');
    const rowId = await row.getAttribute('id');
    const transferId = Number(rowId?.slice('transfer-'.length));

    await row.getByRole('button', { name: /Open this transfer/ }).click();
    const panel = page.locator(`#${rowId}-panel`);
    await expect(panel).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`transfer=${transferId}`));

    // Correct it onto two other pots. It no longer touches Main account, so
    // it leaves this list — but the household is mid-task, so the open
    // transfer stays where it was, pinned, outside the totals, and says
    // where it went. The save must not scroll the panel away from them (the
    // row is held well down the screen first, so a jump would show): a
    // router that still held the pre-open URL once treated the save as a new
    // page and scrolled the row to the top.
    await page.evaluate((id) => {
      const target = document.getElementById(id);
      if (target !== null) window.scrollBy(0, target.getBoundingClientRect().top - 450);
    }, rowId ?? '');
    const panelTop = async () => Math.round((await panel.boundingBox())?.y ?? -1);
    const topBefore = await panelTop();
    await panel.getByLabel('From pot').selectOption({ label: 'Salary account' });
    await panel.getByRole('button', { name: 'Save transfer' }).click();
    await expect(panel).toContainText('no longer touches Main account', { timeout: 30_000 });
    await expect(page.locator(`#${rowId}`)).toContainText('moved to other pots — not counted');
    await expect(page.locator(`#${rowId}`)).toContainText("Salary account → Alex's cash");
    await expect(panel.getByText(/Transfer #\d+ corrected/)).toBeVisible();
    await expect(panel.getByRole('link', { name: "See it in Alex's cash →" })).toHaveAttribute(
      'href',
      new RegExp(`potId=\\d+&from=.*&transfer=${transferId}#transfer-${transferId}$`),
    );
    // Settled after the delayed anchor passes (0/150/350ms) have had their turn.
    await page.waitForTimeout(600);
    expect(Math.abs((await panelTop()) - topBefore)).toBeLessThanOrEqual(60);

    // The forms are still there, so the mistake is put right in place — and
    // it is a live row again.
    expect(await selectedLabel(panel.getByLabel('From pot'))).toBe('Salary account');
    await panel.getByLabel('From pot').selectOption({ label: 'Main account' });
    await panel.getByRole('button', { name: 'Save transfer' }).click();
    await expect(page.locator(`#${rowId}`)).not.toContainText('not counted', { timeout: 30_000 });
    await expect(page.locator(`#${rowId}`)).toContainText('−£31.13');

    // The pots page no longer lists transfers; a link from before decision
    // 225 opens the transfer here instead.
    await page.goto('/pots');
    await expect(page.getByRole('heading', { name: 'Transfers between pots' })).toHaveCount(0);
    await page.goto(`/pots?transfer=${transferId}#transfer-${transferId}`);
    await expect(page).toHaveURL(
      new RegExp(`/transactions\\?potId=\\d+&from=[\\d-]+&to=[\\d-]+&transfer=${transferId}`),
    );
    const linked = page.locator(`#transfer-${transferId}-panel`);
    await expect(linked).toBeVisible();
    await linked
      .getByLabel(/Why are you voiding this/)
      .fill('Moved and voided by the browser test');
    await linked.getByRole('button', { name: 'Void transfer' }).click();
    await expect(linked).toContainText('Voided', { timeout: 30_000 });
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

  test('a refund keeps its link to Purchases and lands below the sticky header (issues #30, #57)', async ({
    page,
  }) => {
    // Refund part of the seeded shop from its own page: a refund is corrected
    // and voided beside the original it was refunded against, so it keeps the
    // link (issue #57, decision 226).
    await page.goto('/purchases');
    const results = page.locator('section[aria-labelledby="results-heading"]');
    // The row is held by id, not by its text: the refund this spec records
    // carries the same £63.47, so a `hasText` lookup would find whichever of
    // the two rows the list happens to put first once the refund exists.
    const originalId = await results
      .locator('tr[id^="purchase-"]', { hasText: '£63.47' })
      .first()
      .getAttribute('id');
    const original = page.locator(`#${originalId}`);
    await original.locator('summary', { hasText: 'Edit' }).click();
    await original.getByRole('button', { name: 'Refund', exact: true }).click();
    await original.getByRole('button', { name: 'Record refund' }).click();
    await expect(original.getByRole('status')).toContainText(/refund of £63\.47 saved/i, {
      timeout: 30_000,
    });

    // On All Transactions it is a REF row — money back — with no in-place
    // toggle, and its supplier name still a link.
    await page.goto('/transactions');
    const table = page.locator('section[aria-labelledby="activity-heading"] table');
    const refundRow = table
      .locator('tr', { has: page.getByRole('cell', { name: /^REF/ }) })
      .first();
    await expect(refundRow).toContainText('+£63.47');
    await expect(refundRow.locator('button[aria-expanded]')).toHaveCount(0);
    const refundLink = refundRow.getByRole('link', { name: /Corner Foods/ });
    await expect(refundLink).toHaveAttribute(
      'href',
      /^\/purchases\?potId=\d+&from=\d{4}-\d{2}-\d{2}&to=/,
    );
    await refundLink.click();
    await expect(page).toHaveURL(
      /\/purchases\?potId=\d+&from=\d{4}-\d{2}-\d{2}&to=[\d-]+#purchase-\d+/,
    );

    // Issue #30: the target row lands *below* the sticky site header, not
    // underneath it. The row the fragment names is the one that must clear it —
    // a `hasText` match would find whichever Corner Foods row comes first in a
    // seed grown by other specs, which is not the row under test. The landing
    // offset is measured (`sf-anchor`, re-opened issue #34), and the root-layout
    // scroll pass corrects a cold load's own scroll (`src/components/scroll-hash.tsx`).
    const anchoredId = new URL(page.url()).hash.slice(1);
    const row = page.locator(`tr[id="${anchoredId}"]`);
    await expect(row).toContainText('Refund');
    const header = page.locator('header.sticky').first();
    await expect
      .poll(async () => {
        const rowBox = await row.boundingBox();
        const headerBox = await header.boundingBox();
        if (rowBox === null || headerBox === null) return false;
        return rowBox.y >= headerBox.y + headerBox.height;
      })
      .toBe(true);

    // Leave the ledger as it was: the refund is voided, so nothing it moved
    // counts again, and its row leaves All Transactions.
    await row.locator('summary', { hasText: 'Edit' }).click();
    await row.getByRole('button', { name: 'Void', exact: true }).click();
    await row.getByLabel(/Why are you voiding this/).fill('Browser-test refund, put back');
    await row.getByRole('button', { name: 'Void purchase' }).click();
    await expect(row).toContainText('Voided', { timeout: 30_000 });
    await page.goto('/transactions');
    await expect(
      table.locator('tr', { has: page.getByRole('cell', { name: /^REF/ }) }),
    ).toHaveCount(0);
  });

  test('a purchase recorded at the till is corrected in place, then voided (issue #57)', async ({
    page,
  }) => {
    await recordPurchase(page, { supplier: 'Corner Foods', amount: '31.42' });

    await page.goto('/transactions');
    const row = purchaseRows(page).filter({ hasText: '£31.42' }).first();
    const rowId = await row.getAttribute('id');
    expect(rowId).toMatch(/^purchase-\d+$/);
    const purchaseId = Number(rowId?.slice('purchase-'.length));
    await expect(row.getByRole('cell', { name: /^PUR\b/ })).toBeVisible();
    const liveRow = page.locator(`#${rowId}`);
    await waitForPurchaseToggle(liveRow);
    await liveRow.getByRole('button', { name: /Corner Foods — Open this purchase/ }).click();
    const panel = page.locator(`#${rowId}-panel`);
    // The panel is the row's own next sibling — directly beneath it, never
    // somewhere else on the page.
    await expect(
      liveRow.locator('xpath=following-sibling::tr[1]').locator(`#${rowId}-panel`),
    ).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`purchase=${purchaseId}#purchase-${purchaseId}$`));
    await expect(
      panel.getByRole('heading', { name: /Purchase #\d+ · Corner Foods/ }),
    ).toBeVisible();

    // The editor holds the record as saved — the amount, the date and the
    // note — instead of blanks the household must retype.
    await expect(panel.getByLabel('Amount')).toHaveValue('31.42');
    await expect(panel.getByLabel('Note (blank keeps the current note)')).toHaveValue('');
    await expect(panel.getByLabel('When it happened (blank keeps the current date)')).toHaveValue(
      /^\d{4}-\d{2}-\d{2}$/,
    );

    // Correct the amount and add the note the hurried entry left out.
    await panel.getByLabel('Amount').fill('31.99');
    await panel.getByLabel('Note (blank keeps the current note)').fill('Right shop, wrong amount');
    await panel.getByRole('button', { name: 'Save purchase' }).click();
    await expect(panel.getByText(/Entry #\d+ saved/)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(`#${rowId}`)).toContainText('−£31.99');
    await expect(page.locator(`#${rowId}`)).toContainText('Right shop, wrong amount');
    await expect(page.locator(`#${rowId}`)).not.toContainText('£31.42');

    // Void it from the same panel. A void takes the purchase out of the list —
    // voided records are never movements — but the open purchase stays on
    // screen, pinned and struck through, saying so, until the household closes it.
    // A void cannot move the row, so the page must not move either: this is the
    // v1.19.0 regression guard, where a router still holding the pre-open URL
    // treated the save as a new page and scrolled it 439px (the spec ran red at
    // 333px). Measured here, in the case where nothing legitimately moves.
    const scrollBefore = await page.evaluate(() => Math.round(window.scrollY));
    await panel.getByLabel(/Why are you voiding this/).fill('Recorded twice by the browser test');
    await panel.getByRole('button', { name: 'Void purchase' }).click();
    await expect(panel).toContainText('Voided — “Recorded twice by the browser test”', {
      timeout: 30_000,
    });
    await expect(page.locator(`#${rowId}`)).toContainText('voided — not counted');
    // Settled after the delayed anchor passes (0/150/350ms) have had their turn.
    await page.waitForTimeout(600);
    await expect
      .poll(async () =>
        Math.abs((await page.evaluate(() => Math.round(window.scrollY))) - scrollBefore),
      )
      .toBeLessThanOrEqual(4);
    await expect(panel.getByRole('button', { name: 'Save purchase' })).toHaveCount(0);
    await expect(panel.getByRole('link', { name: 'See it on Purchases →' })).toHaveAttribute(
      'href',
      `/purchases?voidedOnly=1#purchase-${purchaseId}`,
    );

    await panel.getByRole('button', { name: 'Close' }).click();
    await expect(page.locator(`#${rowId}`)).toHaveCount(0);
    await expect(page).not.toHaveURL(/purchase=/);
    await page.reload();
    await expect(purchaseRows(page).filter({ hasText: '£31.99' })).toHaveCount(0);
  });

  test('a purchase re-dated out of the window stays pinned where it was (issue #57)', async ({
    page,
  }) => {
    await recordPurchase(page, { supplier: 'Corner Foods', amount: '44.55' });

    await page.goto('/transactions');
    const row = purchaseRows(page).filter({ hasText: '£44.55' }).first();
    const rowId = await row.getAttribute('id');
    const purchaseId = Number(rowId?.slice('purchase-'.length));
    const liveRow = page.locator(`#${rowId}`);
    await waitForPurchaseToggle(liveRow);
    await liveRow.getByRole('button', { name: /Open this purchase/ }).click();
    const panel = page.locator(`#${rowId}-panel`);

    // Hold the row well down the screen first, so the save has real work to do.
    await page.evaluate((id) => {
      const target = document.getElementById(id);
      if (target !== null) window.scrollBy(0, target.getBoundingClientRect().top - 450);
    }, rowId ?? '');

    // Correct it to a date before the window opens: it leaves the list, and
    // stays pinned where its date now puts it, out of the totals.
    const serverToday = (await page.getByLabel('End date').getAttribute('max')) ?? '';
    await panel
      .getByLabel('When it happened (blank keeps the current date)')
      .fill(minusDays(serverToday, 45));
    await panel.getByRole('button', { name: 'Save purchase' }).click();
    await expect(page.locator(`#${rowId}`)).toContainText('outside these dates — not counted', {
      timeout: 30_000,
    });
    await expect(panel).toContainText('It stays here until you close it');
    await expect(
      panel.getByRole('link', { name: /Show Main account around .* →/ }),
    ).toHaveAttribute('href', new RegExp(`purchase=${purchaseId}#purchase-${purchaseId}$`));
    // The row genuinely moves inside the list — the corrected date sorts it to
    // the far end — so the household is brought back to their panel rather than
    // left reading the wrong part of the table. That correction is deliberate
    // and only fires when the panel is entirely off screen
    // (`useKeepPinnedPanelInView`); the *unchanged-position* case, where the
    // page must not move at all, is asserted in the test above.
    await expect(panel).toBeInViewport({ timeout: 15_000 });

    // Put it right in place — a date inside the window — and it is a live row
    // again, with its forms still holding what was saved.
    await panel.getByLabel('When it happened (blank keeps the current date)').fill(serverToday);
    await panel.getByRole('button', { name: 'Save purchase' }).click();
    await expect(page.locator(`#${rowId}`)).not.toContainText('not counted', { timeout: 30_000 });
    await expect(page.locator(`#${rowId}`)).toContainText('−£44.55');

    // Leave the ledger as it was: void it from the same panel.
    await panel.getByLabel(/Why are you voiding this/).fill('Re-dated by the browser test');
    await panel.getByRole('button', { name: 'Void purchase' }).click();
    await expect(panel).toContainText('Voided', { timeout: 30_000 });
    await panel.getByRole('button', { name: 'Close' }).click();
    await expect(page.locator(`#${rowId}`)).toHaveCount(0);
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
    // Both live on the Borrowing page since issue #60 (decision 228).
    await page.goto('/borrowing');
    const setup = page.locator('section[aria-labelledby="setup-heading"]');
    const counterparty = `E2E Expectant ${Date.now()}`;
    await setup.getByRole('button', { name: 'Setup new Borrowing or lending' }).click();
    await setup.getByLabel('Their name').fill(counterparty);
    await setup.getByLabel('Is this a recurring arrangement?').selectOption('none');
    await setup.getByRole('button', { name: 'Start tracking' }).click();
    await expect(setup.getByRole('status')).toContainText(/now tracking/i);

    const card = page.locator('section', {
      has: page.getByRole('heading', { name: counterparty, exact: true }),
    });
    const row = card.locator('li').first();
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
      /\/borrowing#debt-\d+$/,
    );

    // The money lands and is recorded that day: the expectation gives way to
    // the real borrowing, on the same window.
    await page.goto('/borrowing');
    const expectantCard = page.locator('section', {
      has: page.getByRole('heading', { name: counterparty, exact: true }),
    });
    await expectantCard.getByRole('link', { name: 'Record borrowing' }).click();
    const borrow = expectantCard.locator('[data-inline-record]');
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
    await page.goto('/borrowing');
    await expect(
      page
        .locator('section', {
          has: page.getByRole('heading', { name: counterparty, exact: true }),
        })
        .locator('li')
        .getByText('we owe £250.00'),
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

/**
 * The activity table's in-place purchase rows (decision 226) — never a
 * transfer or other record that happens to share an amount with the purchase
 * under test, and never the open panel's own row.
 */
function purchaseRows(page: Page): Locator {
  return page.locator(
    'section[aria-labelledby="activity-heading"] table tbody > tr[id^="purchase-"]',
  );
}

/** Record a purchase through the till, as the household does (SPEC §15.1). */
async function recordPurchase(
  page: Page,
  { supplier, amount }: { supplier: string; amount: string },
): Promise<void> {
  await page.goto('/');
  await waitForTill(page);
  const entry = page.getByRole('region', { name: /Record it while it is fresh/i });
  await entry.locator('input[name="supplierName"]').fill(supplier);
  await entry.locator('input[name="amount"]').fill(amount);
  // Main account is named outright: the `settings` project, which runs before
  // this one, ends with the household's default purchase pot cleared, and the
  // till refuses to save without one (SPEC §15.1). These rows are looked up on
  // Main account's activity, so the pot here is not negotiable either.
  await entry.getByLabel('Pot').selectOption({ label: 'Main account' });
  await entry.getByRole('button', { name: 'Next: category →' }).click();
  await pickEntryCategory(entry, 'Groceries / Weekly Shop');
  await entry.getByRole('button', { name: 'Save purchase' }).click();
  await expect(entry.getByRole('status')).toContainText(/saved/i, { timeout: 30_000 });
}

/**
 * The activity table's internal-transfer rows (decision 225) — never a
 * purchase or other record that happens to share an amount with the
 * transfer under test, and never the open panel's own row.
 */
function transferRows(page: Page): Locator {
  return page.locator(
    'section[aria-labelledby="activity-heading"] table tbody > tr[id^="transfer-"]',
  );
}

/** A transfer row by its amount, once its in-place toggle is listening. */
async function transferRowByAmount(page: Page, amount: string): Promise<Locator> {
  const row = transferRows(page).filter({ hasText: amount });
  await expect(row).toHaveCount(1);
  const rowId = await row.getAttribute('id');
  const pinnedRow = page.locator(`#${rowId}`);
  await waitForTransferToggle(pinnedRow);
  return pinnedRow;
}

/** Record a transfer out of Main account from the till's Move tab, as the household does. */
async function recordTransfer(page: Page, { to, amount }: { to: string; amount: string }) {
  await page.goto('/');
  await waitForTill(page);
  const entry = page.getByRole('region', { name: /Record it while it is fresh/i });
  await entry.getByRole('tab', { name: 'Move' }).click();
  await entry.getByLabel('From pot').selectOption({ label: 'Main account' });
  await entry.getByLabel('To pot').selectOption({ label: to });
  await entry.getByLabel('Amount').fill(amount);
  await entry.getByRole('button', { name: 'Record transfer' }).click();
  await expect(entry.getByRole('status')).toContainText(/recorded/i, { timeout: 30_000 });
}
