import { expect, test, type Locator, type Page } from '@playwright/test';
import { addDaysIso, pickEntryCategory, waitForTill } from './support';
import { formatPence } from '../src/lib/money';
import { APP_RELEASE_STAGE, APP_VERSION } from '../src/lib/version';
import { seedPaydayScenario } from './payday-scenario';

/**
 * Mobile acceptance path (blueprint §12: "desktop and mobile primary paths are
 * checked"). This is the run earlier sessions could not claim — the sandbox had
 * no browser binaries.
 */

function parsePounds(text: string): number {
  const match = text.match(/£([\d,]+\.\d{2})/);
  const value = match?.[1];
  if (value === undefined) throw new Error(`no £ amount in ${JSON.stringify(text)}`);
  return Number(value.replace(/,/g, ''));
}

/** The till's two panels (decision 143): switch with the dots, wait for the slide. */
async function showPanel(entry: Locator, index: 0 | 1): Promise<void> {
  await entry
    .getByRole('button', { name: index === 0 ? 'Show the entry panel' : 'Show the details panel' })
    .click();
  await expect(entry.locator('[data-panel-track]')).toHaveAttribute(
    'data-active-panel',
    String(index),
  );
}

/** Tap a pill in a ChipGroup (Paid by, Vehicle) and check it took. */
async function pickChip(entry: Locator, group: string, label: string): Promise<void> {
  const radios = entry.getByRole('radiogroup', { name: group });
  await radios.locator('label', { hasText: label }).click();
  await expect(radios.getByRole('radio', { name: label })).toBeChecked();
}

/**
 * Nothing the household did not tap is focused (decision 151).
 *
 * Focus at the till moves only as the answer to something they did — tapping a
 * field, Enter in Supplier, Next, "+ Note", "Add another" — never as a
 * side-effect of the till becoming ready or of a type tab appearing. A tab
 * button they just tapped keeps its own focus; a text field the page focused by
 * itself is the bug this guards.
 */
async function expectNoFieldFocused(page: Page): Promise<void> {
  const active = await page.evaluate(() => {
    const element = document.activeElement;
    if (element === null) return null;
    const tag = element.tagName.toLowerCase();
    if (tag === 'body' || tag === 'html') return null;
    return {
      tag,
      name: element.getAttribute('name'),
      inTill: element.closest('[data-till-ready]') !== null,
    };
  });
  const fields = ['input', 'select', 'textarea'];
  expect(
    active === null || !fields.includes(active.tag),
    `a field was focused without the household tapping it: ${JSON.stringify(active)}`,
  ).toBe(true);
}

/** A real finger on the glass: Chromium touch events through CDP. */
async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
  const steps = 8;
  for (let step = 1; step <= steps; step += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        {
          x: from.x + ((to.x - from.x) * step) / steps,
          y: from.y + ((to.y - from.y) * step) / steps,
        },
      ],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Centre an element in the viewport and measure it **once the scroll has
 * settled**. `drag()` dispatches raw touch events at absolute coordinates, so a
 * box measured while the page is still moving hands the gesture stale
 * coordinates: the drag then arrives diagonal, and the till's own swipe rule
 * (at least 50px, and at least 1.5x more sideways than down — decision 144)
 * reads it as a scroll and leaves the panel where it was. On a loaded CI runner
 * that race failed `data-active-panel` in "Save is only on the second card…"
 * (2026-09-27, on the v0.22.1 merge commit) while the identical tree passed
 * 88/88 on PR #80 twenty minutes earlier and six consecutive local runs of this
 * project. Measuring until two readings agree removes the race without guessing
 * a scroll duration; it costs one extra `boundingBox` when the page is already
 * still.
 */
async function settledBox(page: Page, target: Locator, what: string): Promise<Box> {
  await target.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  let previous: Box | null = null;
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const box = await target.boundingBox();
    if (box === null) throw new Error(`no ${what}`);
    if (previous !== null && box.x === previous.x && box.y === previous.y) return box;
    previous = box;
    await page.waitForTimeout(100);
  }
  throw new Error(`${what} never settled after scrolling`);
}

test.describe('mobile quick entry', () => {
  test('records a purchase at the till, then refuses an unbalanced split', async ({ page }) => {
    await page.goto('/');
    await waitForTill(page);

    // The app identifies itself: the version badge is part of the release check.
    await expect(
      page.getByRole('main').getByText(`v${APP_VERSION} · ${APP_RELEASE_STAGE}`),
    ).toBeVisible();

    const entry = page.getByRole('region', { name: /Record it while it is fresh/i });
    await expect(entry).toBeVisible();

    await entry.locator('input[name="supplierName"]').fill('Playwright Paints');
    await entry.locator('input[name="amount"]').fill('12.34');
    // No Save on the first card (decision 144): Next slides to the category.
    await entry.getByRole('button', { name: 'Next: category →' }).click();
    await expect(entry.locator('[data-panel-track]')).toHaveAttribute('data-active-panel', '1');
    await expect(entry.getByLabel(/^Category/)).toBeFocused();

    const saveButton = entry.getByRole('button', { name: 'Save purchase' });
    // Splits must total exactly: an unbalanced entry cannot be submitted.
    // Checked *before* the save, because a saved form is blank now (174).
    await entry.getByLabel('Line 1 amount').fill('1.00');
    await expect(saveButton).toBeDisabled();
    await expect(entry.getByText(/Remaining|Over by/)).toBeVisible();

    await entry.getByLabel('Line 1 amount').fill('12.34');
    await pickEntryCategory(entry, 'Groceries / Weekly Shop');
    await expect(entry.getByText('Matches exactly')).toBeVisible();

    await saveButton.click();
    await expect(entry.getByRole('status')).toContainText(/saved/i, { timeout: 30_000 });

    // The saved entry is handed back blank, so there is no second purchase
    // waiting to be saved by an accidental second tap (decision 174).
    await expect(entry.locator('input[name="supplierName"]')).toHaveValue('');
    await expect(entry.locator('input[name="amount"]')).toHaveValue('');
    await expect(entry.getByLabel('Line 1 amount')).toHaveValue('');
    await expect(saveButton).toBeDisabled();

    // The record is really stored: it is there on a fresh request.
    await page.goto('/purchases');
    const results = page.locator('section[aria-labelledby="results-heading"]');
    await expect(results.locator('tbody tr', { hasText: 'Playwright Paints' })).toHaveCount(1);
  });

  test('records a balance checkpoint, labelled as a checkpoint', async ({ page }) => {
    await page.goto('/');
    await waitForTill(page);
    const entry = page.getByRole('region', { name: /Record it while it is fresh/i });
    await entry.getByRole('tab', { name: 'Checkpoint' }).click();
    await entry.getByLabel('Balance now').fill('987.65');
    await entry.getByRole('button', { name: 'Save checkpoint' }).click();
    await expect(entry.getByRole('status')).toContainText(/checkpoint/i, { timeout: 30_000 });
    // Reported by a person, never presented as a bank balance.
    await expect(page.getByText(/not a bank balance/i).first()).toBeVisible();
  });

  test('the amount alone fills line 1, balances the split and enables Save', async ({ page }) => {
    await page.goto('/');
    await waitForTill(page);
    const entry = page.getByRole('region', { name: /Record it while it is fresh/i });
    const line1 = entry.getByLabel('Line 1 amount');

    // The till amount is typed once: Line 1 follows it, so the split is
    // complete and Save is live without touching the line.
    await entry.locator('input[name="amount"]').fill('85.00');
    await expect(line1).toHaveValue('85.00');
    await showPanel(entry, 1);
    await expect(entry.getByText('Matches exactly')).toBeVisible();
    await expect(entry.getByRole('button', { name: 'Save purchase' })).toBeEnabled();

    // The only category control is still the split line's own, in the
    // details panel above Save — no category field crept in next to the
    // supplier and amount.
    await expect(entry.getByLabel(/^Category/)).toHaveCount(1);
    await expect(entry.getByRole('heading', { name: 'Category & allocation' })).toBeVisible();
    // With one line the label is just "Amount": the amount typed at the till
    // is already mirrored, so "Line 1" would be noise (SPEC §15.1).
    await expect(entry.getByText('Line 1 amount')).toHaveCount(0);
    await expect(entry.getByText('Amount', { exact: true }).first()).toBeVisible();
  });

  test('every keystroke updates line 1 — 8 then 5 is 85.00, not 8.00', async ({ page }) => {
    await page.goto('/');
    await waitForTill(page);
    const entry = page.getByRole('region', { name: /Record it while it is fresh/i });
    const amount = entry.locator('input[name="amount"]');
    const line1 = entry.getByLabel('Line 1 amount');

    // "8" is already a valid amount, so the first digit must not freeze it.
    await amount.pressSequentially('8');
    await expect(amount).toHaveValue('8');
    await expect(line1).toHaveValue('8.00');
    await amount.pressSequentially('5');
    await expect(amount).toHaveValue('85');
    await expect(line1).toHaveValue('85.00');

    // A correction downwards follows too.
    await amount.fill('84.50');
    await expect(line1).toHaveValue('84.50');
    await expect(entry.getByText('Matches exactly')).toBeVisible();
  });

  test('a half-typed or deleted total never lies about line 1', async ({ page }) => {
    await page.goto('/');
    await waitForTill(page);
    const entry = page.getByRole('region', { name: /Record it while it is fresh/i });
    const amount = entry.locator('input[name="amount"]');
    const line1 = entry.getByLabel('Line 1 amount');
    const saveButton = entry.getByRole('button', { name: 'Save purchase' });

    await amount.fill('85');
    await expect(line1).toHaveValue('85.00');

    // "85." is not an amount yet: the last mirrored value stays put...
    await amount.fill('85.');
    await expect(line1).toHaveValue('85.00');
    // ...and the exact-total rule keeps Save off (balanced needs a parsed total).
    await expect(saveButton).toBeDisabled();
    await expect(entry.getByText('Enter amount')).toBeVisible();

    // Deleting the amount must not leave a stale mirrored line behind.
    await amount.fill('');
    await expect(line1).toHaveValue('');
    // Zero is not an amount either.
    await amount.fill('0');
    await expect(line1).toHaveValue('');
    await expect(saveButton).toBeDisabled();
  });

  test('editing line 1 takes it over and a later total change leaves it alone', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForTill(page);
    const entry = page.getByRole('region', { name: /Record it while it is fresh/i });
    const amount = entry.locator('input[name="amount"]');
    const line1 = entry.getByLabel('Line 1 amount');
    const saveButton = entry.getByRole('button', { name: 'Save purchase' });

    await amount.fill('85');
    await expect(line1).toHaveValue('85.00');

    // Touching the line is a takeover: their value sticks from here on.
    await showPanel(entry, 1);
    await line1.fill('40.00');
    await expect(entry.getByText(/Remaining £45\.00/)).toBeVisible();
    await expect(saveButton).toBeDisabled();

    await showPanel(entry, 0);
    await amount.fill('90');
    await expect(line1).toHaveValue('40.00');
    await expect(entry.getByText(/Remaining £50\.00/)).toBeVisible();
    await expect(saveButton).toBeDisabled();

    // The exact-total rule is unchanged: matching the total by hand saves.
    await showPanel(entry, 1);
    await line1.fill('90');
    await expect(entry.getByText('Matches exactly')).toBeVisible();
    await expect(saveButton).toBeEnabled();
  });

  test('category, supplier, pot, paid by, date and note do not stop the following', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForTill(page);
    const entry = page.getByRole('region', { name: /Record it while it is fresh/i });
    const amount = entry.locator('input[name="amount"]');
    const line1 = entry.getByLabel('Line 1 amount');

    // Naming a remembered supplier writes its most-used category through the
    // shared updateLine path, and the category dropdown uses that path too.
    await entry.locator('input[name="supplierName"]').fill('Corner Foods');
    await entry.getByLabel('Pot').selectOption({ index: 2 });
    await entry.getByRole('button', { name: '+ Note' }).click();
    await entry.getByLabel('Note (optional)').fill('Follows the amount');
    await showPanel(entry, 1);
    await pickEntryCategory(entry, 'Groceries / Top-up Shops');
    await entry
      .getByRole('group', { name: 'For line 1' })
      .getByRole('button', { name: 'Person' })
      .click();
    await entry
      .getByRole('group', { name: 'Person for line 1' })
      .getByRole('button', { name: 'Sam' })
      .click();
    // Paid by and Date now sit on the second card, below the lines (decision 145).
    await pickChip(entry, 'Paid by', 'Sam');
    await entry.getByLabel('Date').fill('2024-01-05');

    await showPanel(entry, 0);
    await amount.fill('42.50');
    await expect(line1).toHaveValue('42.50');
    await expect(entry.getByText('Matches exactly')).toBeVisible();
  });

  test('splits use the remainder until line 1 is taken over', async ({ page }) => {
    await page.goto('/');
    await waitForTill(page);
    const entry = page.getByRole('region', { name: /Record it while it is fresh/i });
    const amount = entry.locator('input[name="amount"]');
    const line1 = entry.getByLabel('Line 1 amount');
    const line2 = entry.getByLabel('Line 2 amount');
    const saveButton = entry.getByRole('button', { name: 'Save purchase' });
    const assignRemaining = entry.getByRole('button', { name: 'Assign remaining' });

    await amount.fill('85');
    await expect(line1).toHaveValue('85.00');

    // Splitting deliberately: the new line starts empty, Line 1 is neither
    // cleared nor shrunk, and there is nothing left to assign yet.
    await showPanel(entry, 1);
    await entry.getByRole('button', { name: '+ Add split' }).click();
    await expect(line1).toHaveValue('85.00');
    await expect(line2).toHaveValue('');
    await expect(assignRemaining).toHaveCount(0);

    // A correction to the total also recalculates the remainder.
    await showPanel(entry, 0);
    await amount.fill('60');
    await expect(line1).toHaveValue('60.00');
    await expect(line2).toHaveValue('');
    await expect(saveButton).toBeDisabled();

    // Hand-splitting still obeys the exact-total rule.
    await showPanel(entry, 1);
    await line2.fill('40');
    await expect(line1).toHaveValue('20.00');
    await line1.fill('20');
    await expect(entry.getByText('Matches exactly')).toBeVisible();
    await expect(saveButton).toBeEnabled();

    // Removing the extra line does not resume the following: the typed value
    // stays exactly as typed.
    await entry.getByRole('button', { name: 'Remove line' }).last().click();
    await expect(line1).toHaveValue('20');
    await showPanel(entry, 0);
    await amount.fill('30');
    await expect(line1).toHaveValue('20');
    await expect(saveButton).toBeDisabled();
  });

  test('saving clears the form, and Add another goes back to the supplier', async ({ page }) => {
    test.slow(); // its own purchase, against the dev server
    await page.goto('/');
    await waitForTill(page);
    const entry = page.getByRole('region', { name: /Record it while it is fresh/i });
    const amount = entry.locator('input[name="amount"]');
    const line1 = entry.getByLabel('Line 1 amount');

    // Saved straight from the mirrored amount — Line 1 was never touched.
    await entry.locator('input[name="supplierName"]').fill('Playwright Follower Shop');
    await amount.fill('12.00');
    await expect(line1).toHaveValue('12.00');
    await entry.getByRole('button', { name: 'Next: category →' }).click();
    await entry.getByRole('button', { name: 'Save purchase' }).click();
    await expect(entry.getByRole('status')).toContainText(/saved/i, { timeout: 30_000 });

    // The save already handed the following back to the amount (decision 174):
    // the entry fields are blank, so there is nothing to save again.
    await expect(amount).toHaveValue('');
    await expect(line1).toHaveValue('');
    await expect(entry.locator('input[name="supplierName"]')).toHaveValue('');
    await expect(entry.getByRole('button', { name: 'Save purchase' })).toBeDisabled();

    // "Add another" is the shortcut back to the first card on the supplier
    // (decision 137) — and it is offered because the form is still pristine.
    await entry.getByRole('button', { name: 'Add another' }).click();
    await expect(entry.locator('[data-panel-track]')).toHaveAttribute('data-active-panel', '0');
    await expect(entry.locator('input[name="supplierName"]')).toBeFocused();
    await amount.fill('7.50');
    await expect(line1).toHaveValue('7.50');
    await expect(entry.getByText('Matches exactly')).toBeVisible();
  });

  test('a saved purchase hands the form back blank, and Save waits for the next entry', async ({
    page,
  }) => {
    // The household's own ask (decision 174): clear the breadcrumbs of the
    // purchase just saved, and grey Save out until the *next* entry is
    // complete — because with a blank form the split is not balanced, so Save
    // cannot be pressed and a second tap cannot write a second purchase.
    test.slow(); // its own purchase, against the dev server
    await page.goto('/');
    await waitForTill(page);
    const entry = page.getByRole('region', { name: /Record it while it is fresh/i });
    const supplier = entry.locator('input[name="supplierName"]');
    const amount = entry.locator('input[name="amount"]');
    const line1 = entry.getByLabel('Line 1 amount');
    const date = entry.getByLabel('Date');
    const pot = entry.getByLabel('Pot');
    const saveButton = entry.getByRole('button', { name: 'Save purchase' });

    // The pot and the payer are the household's standing choices, so record
    // what they are before the save and expect them back afterwards.
    const potValue = await pot.inputValue();
    const paidByValue = await entry
      .getByRole('radiogroup', { name: 'Paid by' })
      .locator('input:checked')
      .getAttribute('value');
    expect(potValue).not.toBe('');
    expect(paidByValue).not.toBeNull();

    await supplier.fill('Playwright Blank Shop');
    await amount.fill('9.99');
    await expect(line1).toHaveValue('9.99');
    await entry.getByRole('button', { name: '+ Note' }).click();
    await entry.getByLabel('Note (optional)').fill('Left behind by the last fill');
    await entry.getByRole('button', { name: 'Next: category →' }).click();
    await expect(entry.locator('[data-panel-track]')).toHaveAttribute('data-active-panel', '1');
    // The app's own "today" — the date input's max is exactly that (SPEC §15.1).
    await date.fill((await date.getAttribute('max')) ?? '');
    await expect(date).not.toHaveValue('');

    await saveButton.click();
    await expect(entry.getByRole('status')).toContainText(/saved/i, { timeout: 30_000 });

    // Blank: supplier, amount, the split line, the date...
    await expect(supplier).toHaveValue('');
    await expect(amount).toHaveValue('');
    await expect(line1).toHaveValue('');
    await expect(date).toHaveValue('');
    // ...and the note field is closed again, behind "+ Note" as it started.
    await expect(entry.getByRole('button', { name: '+ Note' })).toBeVisible();
    await expect(entry.getByLabel('Note (optional)')).toHaveCount(0);
    // The choices the household made for this purchase stick: the same pot and
    // the same payer usually pay for the next one.
    await expect(pot).toHaveValue(potValue ?? '');
    await expect(
      entry.getByRole('radiogroup', { name: 'Paid by' }).locator(`input[value="${paidByValue}"]`),
    ).toBeChecked();
    // The confirmation stays, and so does the way back to the first card.
    await expect(entry.getByRole('status')).toContainText(/saved/i);
    await expect(entry.getByRole('button', { name: 'Add another' })).toBeVisible();
    // Nothing took focus: the save is not the household tapping a field, and
    // an uninvited keyboard is what decision 151 exists to prevent.
    await expectNoFieldFocused(page);
    // Greyed out, with the disabled styling it always had.
    await expect(saveButton).toBeDisabled();

    // The next entry starts the following over by itself — no "Add another"
    // needed for it any more...
    await showPanel(entry, 0);
    await amount.fill('14.25');
    await expect(line1).toHaveValue('14.25');
    await expect(entry.getByText('Matches exactly')).toBeVisible();
    // ...and "Add another" steps aside rather than wiping the entry in hand.
    await expect(entry.getByRole('button', { name: 'Add another' })).toBeHidden();
    await showPanel(entry, 1);
    await expect(saveButton).toBeEnabled();
  });

  test('a second identical save clears the form again, duplicate notice or not', async ({
    page,
  }) => {
    // The subtle half of decision 174. Two saves in a row produce the *same*
    // message string, so an effect keyed on the message would not fire for the
    // second one and the form would stay dirty. A duplicate notice may or may
    // not appear (the server decides, on supplier + amount + timing); either
    // way the save succeeded, so the form clears.
    test.slow(); // two sequential saves, against the dev server
    await page.goto('/');
    await waitForTill(page);
    const entry = page.getByRole('region', { name: /Record it while it is fresh/i });
    const supplier = entry.locator('input[name="supplierName"]');
    const amount = entry.locator('input[name="amount"]');

    const saveTwice = async () => {
      // The save leaves the phone on the card the household saved from, and
      // the hidden card is inert — so go back to the entry card to type.
      await showPanel(entry, 0);
      await supplier.fill('Playwright Twice Shop');
      await amount.fill('3.50');
      await entry.getByRole('button', { name: 'Next: category →' }).click();
      await entry.getByRole('button', { name: 'Save purchase' }).click();
      await expect(entry.getByRole('status')).toContainText(/saved/i, { timeout: 30_000 });
    };

    await saveTwice();
    await expect(amount).toHaveValue('');
    await saveTwice();
    // The same message, a new result: the form is blank again.
    await expect(amount).toHaveValue('');
    await expect(supplier).toHaveValue('');
    await expect(entry.getByLabel('Line 1 amount')).toHaveValue('');
    await expect(entry.getByRole('button', { name: 'Save purchase' })).toBeDisabled();
  });

  test('the till panel leads with the pot, the reported balance and what is left', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForTill(page);
    const entry = page.getByRole('region', { name: /Record it while it is fresh/i });

    // Pot first (SPEC §15.1): the balance is context for the entry, not
    // something to go hunting for. The seed sets Main account as the default.
    const pot = entry.getByLabel('Pot');
    await expect(pot.locator('option:checked')).toHaveText('Main account');

    // Keep the bank's last checkpoint visibly distinct from the current
    // account balance. Both the report age/time and the separate
    // All Transactions running-balance figure are present. (The checkpoint
    // itself moves during this spec file: an earlier test records one.)
    const checkpoint = entry.getByText(/Last checkpoint/);
    await expect(checkpoint).toBeVisible();
    await expect(checkpoint).toContainText(/Last checkpoint £[\d,]+\.\d{2}/);
    await expect(checkpoint).toContainText(/ago|just now/);
    await expect(checkpoint).toContainText(/current account balance £[\d,]+\.\d{2}/);

    // ...and the figure that stops the mortgage being a surprise three days
    // before payday: what is left when everything expected to leave has left,
    // counting expected support but not spendable salary (SPEC §7.7).
    await expect(
      entry.getByText(/Lowest before \d{1,2}(?:st|nd|rd|th) [A-Z][a-z]{2}(?: \d{4})? pay day/),
    ).toBeVisible();
    await expect(
      entry.getByText(/Salary on .* is not counted as money you can spend/),
    ).toBeVisible();
    await expect(entry.getByText(/never a bank balance/).first()).toBeVisible();

    // A cash pot shows no balance at all: the household counts the notes.
    await pot.selectOption({ label: "Alex's cash" });
    await expect(entry.getByText(/no balance is shown for cash/i)).toBeVisible();
    await expect(entry.getByText(/Last checkpoint/)).toHaveCount(0);
    await expect(
      entry.getByText(/Lowest before \d{1,2}(?:st|nd|rd|th) [A-Z][a-z]{2}(?: \d{4})? pay day/),
    ).toBeVisible();
  });

  test('suggests suppliers inline, filters as you type and moves on to the amount', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForTill(page);
    const entry = page.getByRole('region', { name: /Record it while it is fresh/i });
    const supplier = entry.locator('input[name="supplierName"]');
    const amount = entry.locator('input[name="amount"]');

    // No browser popup any more: the list is part of the page.
    await expect(entry.locator('datalist')).toHaveCount(0);

    // Landing on the field offers the household's recent suppliers.
    await supplier.click();
    const list = entry.getByRole('listbox', { name: 'Supplier suggestions' });
    await expect(list).toBeVisible();
    // Previous tests add recent suppliers; a specific seed need not be in the first six.
    await expect(list.getByRole('option').first()).toBeVisible();

    // Typing narrows it to matches.
    await supplier.fill('corner');
    await expect(list.getByRole('option')).toHaveCount(2);
    await supplier.fill('insurer');
    await expect(list.getByRole('option')).toHaveCount(1);

    // Tapping a row fills the name, closes the list and moves on to Amount.
    await list.getByRole('option', { name: /InsurerCo/ }).click();
    await expect(supplier).toHaveValue('InsurerCo');
    await expect(amount).toBeFocused();
    await expect(list).toHaveCount(0);

    // A brand-new name is still just typed in — nothing blocks the entry.
    await supplier.fill('Playwright New Shop');
    await expect(list).toHaveCount(0);
  });

  test('the home page opens at the till with nothing focused', async ({ page }) => {
    await page.goto('/');
    await waitForTill(page);
    const entry = page.getByRole('region', { name: /Record it while it is fresh/i });

    // Decision 151 still holds for focus: the page moves, but nothing takes
    // focus, so the keyboard stays down. (The old autofocus scrolled *with*
    // the keyboard up and buried the tab strip — measured before that fix at
    // scrollY 1342 with the tabs at y=-35.)
    await expectNoFieldFocused(page);

    // Decision 158: on a phone the home page opens AT the till. The card's
    // top parks just under the sticky header (the section spends the measured
    // `sf-anchor` offset — 69px against the 57px phone bar, #34), so the type
    // tabs are on screen on arrival and a purchase starts in one tap.
    const top = await entry.evaluate((element) => element.getBoundingClientRect().top);
    expect(
      top,
      `the till's top sits at ${top}px on open — expected just below the sticky header`,
    ).toBeGreaterThanOrEqual(56);
    expect(
      top,
      `the till's top sits at ${top}px on open — expected under 96px (sf-anchor)`,
    ).toBeLessThanOrEqual(96);
    const scrolled = await page.evaluate(() => window.scrollY);
    expect(
      scrolled,
      `expected the page to have scrolled itself to the till, scrollY was ${scrolled}`,
    ).toBeGreaterThan(0);

    // Everything the card shows in its first paint is there without a tap:
    // the type tabs, the pot, and what is left before income lands.
    await expect(entry.getByRole('tab', { name: 'Purchase' })).toBeVisible();
    await expect(entry.getByLabel('Pot').locator('option:checked')).toHaveText('Main account');
    await expect(
      entry.getByText(/Lowest before \d{1,2}(?:st|nd|rd|th) [A-Z][a-z]{2}(?: \d{4})? pay day/),
    ).toBeVisible();

    // The tab strip sits inside the viewport — a different mode is one tap
    // away, which is the whole point of opening here.
    const tabs = entry.getByRole('tablist', { name: 'Quick entry type' });
    const box = await tabs.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    if (box === null || viewport === null) return;
    expect(box.y, `tab strip top at y=${box.y}`).toBeGreaterThanOrEqual(0);
    expect(
      box.y + box.height,
      `tab strip bottom at y=${box.y + box.height} on a ${viewport.height}px screen`,
    ).toBeLessThanOrEqual(viewport.height);

    // That arrival was a scroll, not the browser's answer to a focus call.
    await expectNoFieldFocused(page);
  });

  test("the drawer's Quick Entry (Till) link lands on the till", async ({ page }) => {
    await page.goto('/purchases');
    const menuBtn = page.getByRole('button', { name: 'Open navigation menu' });
    await menuBtn.click();
    const nav = page.getByRole('navigation', { name: 'Pages' });
    await nav.getByRole('link', { name: 'Quick Entry (Till)' }).click();

    // The link carries the anchor, so the hop ends at the till even though
    // the drawer closes over the navigation (decision 158).
    await waitForTill(page);
    await expect(page).toHaveURL(/\/#quick-entry$/);
    const entry = page.getByRole('region', { name: /Record it while it is fresh/i });
    const top = await entry.evaluate((element) => element.getBoundingClientRect().top);
    expect(
      top,
      `the till's top sits at ${top}px after the drawer tap — expected just below the sticky header`,
    ).toBeGreaterThanOrEqual(56);
    expect(top, `the till's top sits at ${top}px after the drawer tap`).toBeLessThanOrEqual(96);
    await expectNoFieldFocused(page);
  });

  test('choosing a type does not grab a field: Fuel, Checkpoint and Move wait to be tapped', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForTill(page);
    const entry = page.getByRole('region', { name: /Record it while it is fresh/i });

    // The same rule as the opening page (decision 151), one level down:
    // choosing a *type* is not choosing a field. The Fuel amount and the
    // Checkpoint amount used to autofocus as the tab appeared, with the same
    // keyboard-and-scroll cost on a phone.
    await entry.getByRole('tab', { name: 'Fuel' }).click();
    await expect(entry.getByLabel('Fuel amount')).toBeVisible();
    await expectNoFieldFocused(page);

    await entry.getByRole('tab', { name: 'Checkpoint' }).click();
    await expect(entry.getByLabel('Balance now')).toBeVisible();
    await expectNoFieldFocused(page);

    await entry.getByRole('tab', { name: 'Move' }).click();
    await expect(entry.getByLabel('From pot')).toBeVisible();
    await expectNoFieldFocused(page);

    // Tapping the field itself still works, and still focuses it — the
    // household's tap, not the page's idea.
    await entry.getByRole('tab', { name: 'Checkpoint' }).click();
    const balance = entry.getByLabel('Balance now');
    await balance.click();
    await expect(balance).toBeFocused();
  });

  test('one tap on Next moves on, even with the supplier suggestions open', async ({ page }) => {
    test.slow(); // its own purchase, against the dev server
    await page.goto('/');
    await waitForTill(page);
    const entry = page.getByRole('region', { name: /Record it while it is fresh/i });
    const supplier = entry.locator('input[name="supplierName"]');

    await entry.locator('input[name="amount"]').fill('4.20');
    await expect(entry.getByText('Matches exactly')).toBeVisible();
    // A new name that still matches remembered suppliers: the list stays open
    // under the field, pushing Next down the page.
    await supplier.tap();
    await supplier.fill('Corner');
    const list = entry.getByRole('listbox', { name: 'Supplier suggestions' });
    await expect(list).toBeVisible();

    // One tap on Next. Closing the list must not move the button out from
    // under the finger before the tap lands (decision 135, now for Next).
    await entry.getByRole('button', { name: 'Next: category →' }).tap();
    await expect(entry.locator('[data-panel-track]')).toHaveAttribute('data-active-panel', '1');
    await expect(list).toHaveCount(0);
    await entry.getByRole('button', { name: 'Save purchase' }).tap();
    await expect(entry.getByRole('status')).toContainText(/saved/i, { timeout: 30_000 });
  });

  test('every control on every till tab is at least 44px tall', async ({ page }) => {
    await page.goto('/');
    await waitForTill(page);
    const entry = page.getByRole('region', { name: /Record it while it is fresh/i });

    const tooSmall = async (label: string): Promise<string[]> =>
      entry.evaluate((root, where) => {
        const found: string[] = [];
        const controls = root.querySelectorAll<HTMLElement>(
          'button, a[href], input:not([type="hidden"]), select, textarea, summary',
        );
        for (const control of controls) {
          const box = control.getBoundingClientRect();
          // Only what a thumb can actually reach right now: on screen, on the
          // visible swipe panel, not hidden by a closed <details>.
          if (box.width === 0 || box.height === 0) continue;
          if (box.right <= 0 || box.left >= window.innerWidth) continue;
          const style = window.getComputedStyle(control);
          if (style.visibility === 'hidden') continue;
          // A checkbox or radio is measured by its label, which is the target.
          const target =
            control instanceof HTMLInputElement &&
            (control.type === 'checkbox' || control.type === 'radio') &&
            control.closest('label') !== null
              ? (control.closest('label') as HTMLElement).getBoundingClientRect()
              : box;
          if (target.height < 44 || target.width < 44) {
            const name =
              control.getAttribute('aria-label') ??
              (control.textContent ?? '').trim().slice(0, 40) ??
              control.getAttribute('name');
            found.push(
              `${where}: <${control.tagName.toLowerCase()}> "${name || control.getAttribute('name')}" ${Math.round(target.width)}x${Math.round(target.height)}`,
            );
          }
        }
        return found;
      }, label);

    const problems: string[] = [];
    problems.push(...(await tooSmall('Purchase panel 1')));
    await showPanel(entry, 1);
    await page.waitForTimeout(400); // let the 200ms slide finish before measuring
    problems.push(...(await tooSmall('Purchase panel 2')));
    await showPanel(entry, 0);
    await page.waitForTimeout(400);
    for (const tab of ['Fuel', 'Checkpoint', 'Move']) {
      await entry.getByRole('tab', { name: tab }).click();
      problems.push(...(await tooSmall(tab)));
    }
    for (const moveTab of ['Borrow & repay', 'Swap', 'Other']) {
      await entry.getByRole('tab', { name: moveTab }).click();
      problems.push(...(await tooSmall(`Move / ${moveTab}`)));
    }
    expect(problems).toEqual([]);
  });

  test('Save is only on the second card; Next, the dots and a real swipe switch cards', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForTill(page);
    const entry = page.getByRole('region', { name: /Record it while it is fresh/i });
    const track = entry.locator('[data-panel-track]');

    // Decision 144: one Save, on the Category & allocation card.
    await expect(entry.getByRole('button', { name: 'Save purchase' })).toHaveCount(1);
    await expect(entry.getByRole('button', { name: 'Next: category →' })).toBeVisible();
    await expect(entry.getByText(/Swipe/)).toBeVisible();

    // The dots move between the panels and flip the hint.
    await showPanel(entry, 1);
    await expect(entry.getByText('Swipe ← back to the entry')).toBeVisible();
    await showPanel(entry, 0);
    await expect(entry.getByText(/Swipe → category/)).toBeVisible();

    // Start the drags on the balance card, away from inputs and buttons —
    // measured afresh each time, because a vertical drag scrolls the page.
    const balanceCard = async () => {
      // Mid-screen, clear of the sticky page navigation — and measured only
      // once the scroll has stopped (`settledBox`), because `drag()` needs
      // coordinates that are still true when the touch lands.
      const box = await settledBox(
        page,
        entry.getByText(/Lowest before \d{1,2}(?:st|nd|rd|th) [A-Z][a-z]{2}(?: \d{4})? pay day/),
        'balance card',
      );
      return { x: box.x + box.width / 2, y: box.y + 4 };
    };

    // A diagonal thumb (20px sideways, 200px down) is a scroll, not a swipe.
    let start = await balanceCard();
    await drag(page, start, { x: start.x - 20, y: start.y + 200 });
    await page.waitForTimeout(300);
    await expect(track).toHaveAttribute('data-active-panel', '0');

    // A real horizontal swipe switches — and back again.
    start = await balanceCard();
    await drag(page, start, { x: start.x - 150, y: start.y + 10 });
    await expect(track).toHaveAttribute('data-active-panel', '1');
    const heading = entry.getByRole('heading', { name: 'Category & allocation' });
    const back = await settledBox(page, heading, 'details heading');
    const from = { x: back.x + 20, y: back.y + back.height / 2 };
    await drag(page, from, { x: from.x + 150, y: from.y - 5 });
    await expect(track).toHaveAttribute('data-active-panel', '0');

    // The hidden card cannot be reached by accident.
    await expect(entry.locator('[data-panel="1"]')).toHaveAttribute('inert', '');
  });

  test('Enter on the first card never saves: supplier → amount → Next', async ({ page }) => {
    await page.goto('/');
    await waitForTill(page);
    const entry = page.getByRole('region', { name: /Record it while it is fresh/i });
    const supplier = entry.locator('input[name="supplierName"]');
    const amount = entry.locator('input[name="amount"]');

    await supplier.fill('Playwright Enter Shop');
    await supplier.press('Enter');
    await expect(amount).toBeFocused();
    await amount.fill('6.66');
    await expect(entry.getByText('Matches exactly')).toBeVisible();
    // The phone keyboard's Go key: implicit submission would press Save on the
    // hidden card. It must move on instead.
    await amount.press('Enter');
    await expect(entry.locator('[data-panel-track]')).toHaveAttribute('data-active-panel', '1');
    await expect(entry.getByLabel(/^Category/)).toBeFocused();
    await page.waitForTimeout(1000);
    await expect(entry.getByRole('status')).toHaveCount(0);
  });

  test('the page never pans sideways — 320px, and 360px with 130% text', async ({ page }) => {
    test.slow();
    const noOverflow = async (where: string) => {
      const sizes = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(sizes.scroll, `${where}: page ${sizes.scroll}px on a ${sizes.client}px screen`).toBe(
        sizes.client,
      );
    };
    for (const setup of [
      { width: 320, fontSize: null, label: '320px' },
      { width: 360, fontSize: '130%', label: '360px @130%' },
    ]) {
      await page.setViewportSize({ width: setup.width, height: 780 });
      await page.goto('/');
      await waitForTill(page);
      if (setup.fontSize !== null) {
        await page.addStyleTag({ content: `html{font-size:${setup.fontSize}}` });
      }
      const entry = page.getByRole('region', { name: /Record it while it is fresh/i });
      await noOverflow(`${setup.label} purchase panel 1`);
      await showPanel(entry, 1);
      await noOverflow(`${setup.label} purchase panel 2`);
      await showPanel(entry, 0);
      for (const tab of ['Fuel', 'Checkpoint', 'Move']) {
        await entry.getByRole('tab', { name: tab }).click();
        await noOverflow(`${setup.label} ${tab}`);
      }
      for (const moveTab of ['Borrow & repay', 'Swap', 'Other']) {
        await entry.getByRole('tab', { name: moveTab }).click();
        await noOverflow(`${setup.label} Move / ${moveTab}`);
      }
    }
  });

  test('every page stays reachable on a phone viewport', async ({ page }) => {
    await page.goto('/');
    await waitForTill(page);
    const menuBtn = page.getByRole('button', { name: 'Open navigation menu' });
    if (await menuBtn.isVisible()) {
      await menuBtn.click();
    }
    const nav = page.getByRole('navigation', { name: 'Pages' });
    const daily = ['Quick Entry (Till)', 'Purchases', 'Horizon', 'Charts', 'Overview', 'Recurring'];
    const more = [
      'All Transactions',
      'Long-term forecast',
      'Income',
      'Accounts, Pots & Checkpoints',
      'Insights',
      'Settings',
      'Suppliers',
      'Contracts & Renewals',
      'Tasks',
      'Projects',
    ];
    for (const label of [...daily, ...more]) {
      await expect(nav.getByRole('link', { name: label, exact: true })).toBeVisible();
    }
    const labels = await nav.getByRole('link').allTextContents();
    expect(labels.slice(0, daily.length)).toEqual(daily);
  });

  test('the phone home is the till, not a dump of laptop pages', async ({ page }) => {
    await page.goto('/');
    await waitForTill(page);
    await expect(
      page
        .locator('section[aria-labelledby="money-heading"]')
        .getByText('Household total now', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Payday projection').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Due this week' })).toBeVisible();
    const more = page.getByRole('navigation', { name: 'Other pages' });
    await expect(more.getByRole('link', { name: /Charts/ })).toBeVisible();
    await expect(more.getByRole('link', { name: /Purchases/ })).toBeVisible();
    await expect(more.getByRole('link', { name: /Horizon/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Add a pot' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /Record a balance checkpoint/ })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Recent checkpoints' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Recent entries' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Key dates' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /Schedules, renewals/ })).toHaveCount(0);
  });

  test('on a laptop the home till sits above the existing dashboard', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 950 });
    await page.goto('/');
    await waitForTill(page);

    const till = page.getByRole('region', { name: /Record it while it is fresh/i });
    const money = page.locator('section[aria-labelledby="money-heading"]');
    await expect(till).toBeVisible();
    await expect(money.getByText('Household total now', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Next pay day is/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Due this week' })).toBeVisible();

    const tillBox = await till.boundingBox();
    const moneyBox = await money.boundingBox();
    expect(tillBox).not.toBeNull();
    expect(moneyBox).not.toBeNull();
    if (tillBox === null || moneyBox === null) return;
    expect(tillBox.y).toBeLessThan(moneyBox.y);
    expect(tillBox.y + tillBox.height).toBeLessThan(moneyBox.y);
    await expectNoFieldFocused(page);
  });

  test('the payday card states the facts and opens Horizon the day before payday', async ({
    page,
  }) => {
    // Isolated fictional household: Main £242.22, salary due on the 26th,
    // Natwest direct debits on the 21st, and a projected £90 fuel item on
    // payday to prove that the shared filter applies to every read surface.
    const { paydayDate, natwestBillsOnlyShortfallPence } = await seedPaydayScenario();
    const dayBefore = addDaysIso(paydayDate, -1);

    await page.goto('/');
    await waitForTill(page);
    const till = page.getByRole('region', { name: /Record it while it is fresh/i });
    const mainCheckpoint = till.getByText('£242.22', { exact: true });
    await expect(mainCheckpoint).toBeVisible();
    await expect(mainCheckpoint).toHaveAttribute(
      'title',
      /^\d{1,2} [A-Za-z]{3} \d{4}, \d{1,2}:\d{2}$/,
    );
    await expect(till.getByText('Lowest before 26th Oct pay day')).toBeVisible();
    await expect(till).toContainText(
      'Projected shortfall: -£96.35 before payday. No discretionary spending is available at this time.',
    );
    await expect(till.getByText(/No weekly allowance/)).toHaveCount(0);
    await expect(till.getByText(/Salary on .* is not counted as money you can spend/)).toHaveCount(
      0,
    );
    await expect(till.getByText(/Projected liquid funds across bank and cash pots/)).toHaveCount(0);

    const card = page.locator('section[aria-labelledby="payday-summary-heading"]');
    await expect(card.getByText('Payday projection', { exact: true })).toBeVisible();
    await expect(card.getByRole('heading', { level: 2 })).toHaveText(
      /^Next pay day is \d{1,2}(?:st|nd|rd|th) [A-Z][a-z]+(?: \d{4})? \(\d+ days? from today\)$/,
    );
    await expect(
      card.getByText(
        /Based on a current household balance of £[\d,]+\.\d{2} in bank and cash pots and no additional unplanned spending, the household low would reach -?£[\d,]+\.\d{2}\./,
      ),
    ).toBeVisible();
    await expect(card).toContainText(
      /Plan a transfer\? Natwest has the worst bills-only shortfall:/,
    );
    await expect(card).not.toContainText(/overdraft fee/i);

    // The till's selected-pot checkpoint and pot watch retain their own labels.
    await till.getByLabel('Pot').selectOption({ label: 'Natwest' });
    await expect(till).toContainText('Last checkpoint £312.00');
    await expect(till).toContainText('current account balance £312.00');
    await expect(till).toContainText(
      `Bills-only shortfall: Natwest would be ${formatPence(natwestBillsOnlyShortfallPence)} short before income lands.`,
    );
    await expect(till).not.toContainText('Scenario Council Tax');
    await expect(till).not.toContainText(
      /If projected day-to-day spending also comes from Natwest/,
    );

    // Overview keeps the payday figures, but its day-to-day total excludes the
    // £90 event on salary day. Horizon excludes that same event on the same day.
    await page.goto('/overview');
    const projection = page.locator('section[aria-labelledby="projection-heading"]');
    await expect(projection).toContainText('Projected day-to-day');
    await expect(projection).toContainText('(groceries £0.00 + fuel £0.00)');
    await expect(projection).not.toContainText('£90.00');

    await page.goto('/');
    await waitForTill(page);
    const paydayCard = page.locator('section[aria-labelledby="payday-summary-heading"]');
    const paydayHorizon = paydayCard.getByRole('link', { name: 'Horizon', exact: true });
    await expect(paydayHorizon).toHaveAttribute('href', `/horizon?through=${dayBefore}`);
    await paydayHorizon.click();
    await expect(page.locator('#horizon-through')).toHaveValue(dayBefore);

    await page.goto(`/horizon?through=${paydayDate}`);
    await expect(page.getByRole('heading', { name: 'How far the money would go' })).toBeVisible();
    const paydayRow = page.getByRole('row', { name: new RegExp(paydayDate) });
    await expect(paydayRow).toBeVisible();
    await expect(
      page.getByRole('button', { name: `Projected shops and fills on ${paydayDate}` }),
    ).toHaveCount(0);
    await expectNoFieldFocused(page);
  });

  test('purchase filters start collapsed and stay inside the card', async ({ page }) => {
    await page.goto('/purchases');
    const filters = page.getByRole('form', { name: 'Purchase filters' });
    const show = filters.getByRole('button', { name: 'Show filters' });
    await expect(show).toBeVisible();
    await expect(filters.getByLabel('From date')).toBeHidden();

    await show.click();
    await expect(filters.getByRole('button', { name: 'Hide filters' })).toBeVisible();

    const from = filters.getByLabel('From date');
    const to = filters.getByLabel('To date');
    const pot = filters.getByLabel('Pot');
    await expect(from).toBeVisible();
    await expect(to).toBeVisible();
    await expect(pot).toBeVisible();

    const cardBox = await filters.boundingBox();
    const fromBox = await from.boundingBox();
    const toBox = await to.boundingBox();
    const potBox = await pot.boundingBox();
    expect(cardBox).toBeTruthy();
    expect(fromBox).toBeTruthy();
    expect(toBox).toBeTruthy();
    expect(potBox).toBeTruthy();
    if (cardBox === null || fromBox === null || toBox === null || potBox === null) return;

    // From/To sit on one row; the dropdowns stay inside the rounded card.
    expect(Math.abs(fromBox.y - toBox.y)).toBeLessThan(8);
    expect(toBox.x).toBeGreaterThan(fromBox.x);
    for (const box of [fromBox, toBox, potBox]) {
      expect(box.x).toBeGreaterThanOrEqual(cardBox.x - 1);
      expect(box.x + box.width).toBeLessThanOrEqual(cardBox.x + cardBox.width + 1);
    }

    await filters.getByLabel('Supplier').selectOption({ label: 'Corner Foods' });
    await filters.getByRole('button', { name: 'Apply filters' }).click();
    await expect(filters.getByRole('button', { name: 'Hide filters' })).toBeVisible();
    await expect(filters.getByLabel('Supplier')).toBeVisible();
  });

  test('the Move tab records a transfer; a transfer after the checkpoint is household-net-zero', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForTill(page);
    const before = await page.locator('#money-heading').textContent();
    if (before === null) throw new Error('household heading missing');
    const beforePence = Math.round(parsePounds(before) * 100);

    const entry = page.getByRole('region', { name: /Record it while it is fresh/i });
    await entry.getByRole('tab', { name: 'Move' }).click();
    await entry.getByLabel('From pot').selectOption({ label: 'Main account' });
    await entry.getByLabel('To pot').selectOption({ label: "Alex's cash" });
    await entry.getByLabel('Amount').fill('5.00');
    await entry.getByRole('button', { name: 'Record transfer' }).click();
    await expect(entry.getByRole('status')).toContainText(/recorded/i, { timeout: 30_000 });

    // SPEC §7.1: the seed checkpoints were written down before this transfer,
    // so both legs count. The household total does not move. (A credit
    // recorded *before* a same-day checkpoint is the one that stays absorbed.)
    const after = await page.locator('#money-heading').textContent();
    if (after === null) throw new Error('household heading missing');
    expect(Math.round(parsePounds(after) * 100)).toBe(beforePence);
  });

  test('the till header offers Checkpoint cash for the signed-in person’s own pot', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForTill(page);
    const entry = page.getByRole('region', { name: /Record it while it is fresh/i });
    const disclosure = entry.getByRole('button', { name: 'Checkpoint cash' });
    await expect(disclosure).toBeVisible();
    await expect(disclosure).toHaveAttribute('aria-expanded', 'false');

    // The card opens between the heading and the description, above the
    // "Mobile-first entry" line (decision 178). Locked on Alex's cash — the
    // dev identity is Alex, and the seed marks that pot as Alex's.
    await disclosure.click();
    const card = entry.locator('#cash-checkpoint-card');
    await expect(card).toBeVisible();
    await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
    await expect(card.getByText("Alex's cash")).toBeVisible();
    await expect(card.getByText('your cash pot')).toBeVisible();
    await expect(entry.getByText('Mobile-first entry', { exact: false })).toBeVisible();

    // Read-only on purpose here: later specs in this project assert seeded
    // figures, so the card is closed again without saving.
    await disclosure.click();
    await expect(card).toHaveCount(0);
  });
});

/**
 * Search as you type in the till's category picker (GitHub issue #76). The
 * parent/child list is long enough that scrolling a native `<select>` at the
 * till was the slowest part of a split; the field now filters on the parent
 * or the child name, and the picked line is unchanged.
 */
test.describe('category search at the till', () => {
  test('filters on the parent or the child and picks the line', async ({ page }) => {
    await page.goto('/');
    await waitForTill(page);
    const entry = page.getByRole('region', { name: /Record it while it is fresh/i });
    await entry.locator('input[name="amount"]').fill('18.40');
    await entry.getByRole('button', { name: 'Next: category →' }).click();

    const field = entry.getByLabel(/^Category/).first();
    const list = entry.getByRole('listbox', { name: 'Matching categories for line 1' });

    // The seeded default is Groceries / Weekly Shop.
    await expect(field).toHaveValue('Groceries / Weekly Shop');

    // The parent name matches its children even though it is not in the label.
    await field.click();
    await field.fill('vehicle');
    await expect(list.getByRole('option', { name: 'Vehicle Running / Fuel' })).toBeVisible();
    await expect(list.getByRole('option', { name: 'Groceries / Weekly Shop' })).toHaveCount(0);

    // Two words from either side of the slash narrow the list.
    await field.fill('running insur');
    await expect(list.getByRole('option', { name: 'Vehicle Running / Insurance' })).toBeVisible();
    // The pinned "no category" row stays put; only one real category matches.
    await expect(list.getByRole('option')).toHaveCount(2);
    await expect(list.getByRole('option', { name: 'No category — clear this line' })).toBeVisible();
    await list.getByRole('option', { name: 'Vehicle Running / Insurance' }).click();
    await expect(field).toHaveValue('Vehicle Running / Insurance');
    await expect(entry.getByText('Matches exactly')).toBeVisible();

    // The keyboard picks too: ArrowDown then Enter chooses the first match.
    await field.click();
    await field.fill('energy');
    await field.press('ArrowDown');
    await field.press('Enter');
    await expect(field).toHaveValue('Utilities / Energy');

    // An unmatched search says so, and Escape leaves the last choice alone.
    await field.click();
    await field.fill('zzz no such category');
    await expect(
      list.getByRole('option', { name: 'No categories match that search.' }),
    ).toBeVisible();
    await field.press('Escape');
    await expect(field).toHaveValue('Utilities / Energy');
  });
});
