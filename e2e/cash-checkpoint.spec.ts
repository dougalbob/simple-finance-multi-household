import { expect, test } from '@playwright/test';

/**
 * The till's Checkpoint cash card and the Accounts, Pots & Checkpoints page
 * changes (v0.28.0, decision 178): the collapsed disclosure opens the
 * signed-in person's own cash pot (the seed links Alex's cash to Alex, the
 * dev identity), a checkpoint saved there updates the estimates in place,
 * the /pots page leads with the checkpoint and add-pot cards ahead of the
 * pot cards, and cash pot cards carry no overdraft or warning threshold.
 *
 * Own project: it checkpoints Alex's cash and rewrites a pot's owner, so it
 * must not run inside another project's assertions — and it runs before the
 * backup project's restore rewinds the installation.
 */
test.describe('checkpoint cash (decision 178)', () => {
  test('the till card opens the signed-in person’s own cash pot and checkpoints it', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Checkpoint cash' })).toBeVisible();
    await page.getByRole('button', { name: 'Checkpoint cash' }).click();

    const card = page.locator('#cash-checkpoint-card');
    await expect(card).toBeVisible();
    // Locked on Alex's own pot: the name is shown, not a pot picker.
    await expect(card.getByText("Alex's cash")).toBeVisible();
    await expect(card.getByText('your cash pot')).toBeVisible();
    await expect(card.getByText(/Last counted/)).toBeVisible();
    const save = card.getByRole('button', { name: 'Save checkpoint' });
    await expect(save).toBeDisabled(); // no amount yet

    await card.getByLabel('Counted amount').fill('42.10');
    await expect(save).toBeEnabled();
    await save.click();
    await expect(card.getByRole('status')).toContainText(/checkpoint saved: £42\.10/i);
    // The save hands the amount back empty (decision 174's rule): no
    // accidental second checkpoint one tap away.
    await expect(save).toBeDisabled();
    await expect(card.getByLabel('Counted amount')).toHaveValue('');

    // No reload: the money section reads the new figure straight away.
    await expect(
      page
        .locator('li')
        .filter({ has: page.getByText("Alex's cash", { exact: true }) })
        .getByText('£42.10'),
    ).toBeVisible();
  });

  test('reopening the card shows the fresh count age', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Checkpoint cash' }).click();
    const card = page.locator('#cash-checkpoint-card');
    await expect(card.getByText('Last counted just now.')).toBeVisible();
  });

  test('/pots leads with checkpoint and add-pot cards; cash cards hide overdraft', async ({
    page,
  }) => {
    await page.goto('/pots');
    // exact: the nav links carry the title-cased variant of the same name.
    await expect(page.getByText('Accounts, pots & checkpoints', { exact: true })).toBeVisible();

    const checkpointCard = page.locator('section[aria-labelledby="add-checkpoint-heading"]');
    const addPotCard = page.locator('section[aria-labelledby="add-pot-heading"]');
    const firstPotCard = page.locator('section[aria-labelledby^="pot-"]').first();
    await expect(checkpointCard.getByText('Record a balance checkpoint')).toBeVisible();
    await expect(addPotCard.getByText('Add a pot')).toBeVisible();

    // DOM order: checkpoint card, add-pot card, then the pot cards. (Pixel
    // tops are no good here — the two leading cards sit side by side on a
    // laptop, so DOM position is the honest oracle.)
    const ordered = await page.evaluate(() => {
      const checkpoint = document.querySelector(
        'section[aria-labelledby="add-checkpoint-heading"]',
      );
      const addPot = document.querySelector('section[aria-labelledby="add-pot-heading"]');
      const firstPot = document.querySelector('section[aria-labelledby^="pot-"]');
      if (checkpoint === null || addPot === null || firstPot === null) return false;
      const after = (a: Element, b: Element) =>
        (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      return after(checkpoint, addPot) && after(addPot, firstPot);
    });
    expect(ordered).toBe(true);

    // The add-pot card offers an owner (decision 178).
    await expect(addPotCard.getByLabel('Owner (optional)')).toBeVisible();

    // Cash pot card: no overdraft, no warning threshold, owner shown. The
    // datapoints live in the card's dl — asserted on that block, not on
    // loose text (the edit form's explanatory note legitimately mentions
    // both words).
    const alexCash = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: "Alex's cash", exact: true }) });
    await expect(alexCash.getByText('Cash pot · Alex')).toBeVisible();
    await expect(alexCash.locator('dl')).toHaveCount(0);

    // A bank pot card keeps both datapoints.
    const main = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Main account', exact: true }) });
    await expect(main.locator('dl').getByText('Overdraft limit')).toBeVisible();
    await expect(main.locator('dl').getByText('Warning threshold')).toBeVisible();
  });

  test('without an owner the card falls back to picking from the cash pots', async ({ page }) => {
    // Unassign Alex's cash through the ordinary Edit pot form.
    await page.goto('/pots');
    const alexCash = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: "Alex's cash", exact: true }) });
    await alexCash.getByText('Edit pot').click();
    await alexCash.getByLabel('Owner').selectOption({ label: 'Shared / not assigned' });
    await alexCash.getByRole('button', { name: 'Save pot' }).click();
    await expect(alexCash.getByText('Cash pot · Alex')).toHaveCount(0);

    // The till card now shows the cash-pots-only select, and Save waits.
    await page.goto('/');
    await page.getByRole('button', { name: 'Checkpoint cash' }).click();
    const card = page.locator('#cash-checkpoint-card');
    const potSelect = card.getByLabel('Which cash pot');
    await expect(potSelect).toBeVisible();
    await expect(potSelect).toHaveValue('');
    await expect(card.getByRole('button', { name: 'Save checkpoint' })).toBeDisabled();
    await potSelect.selectOption({ label: "Alex's cash" });
    await card.getByLabel('Counted amount').fill('7.50');
    await expect(card.getByRole('button', { name: 'Save checkpoint' })).toBeEnabled();

    // Put the owner back for the projects that follow.
    await page.goto('/pots');
    await alexCash.getByText('Edit pot').click();
    await alexCash.getByLabel('Owner').selectOption({ label: 'Alex' });
    await alexCash.getByRole('button', { name: 'Save pot' }).click();
    await expect(alexCash.getByText('Cash pot · Alex')).toBeVisible();
  });
});
