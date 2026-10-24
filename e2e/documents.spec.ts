import { expect, test } from '@playwright/test';
import { pickEntryCategory, waitForDocumentSearch, waitForTill } from './support';

/**
 * The Documents page (SPEC §23.5). v1.41.0 shipped the menu entry, the search
 * form and the search library but not the page itself, so the menu opened
 * Next's 404 and no browser test noticed. This spec owns the route itself:
 * both navigation surfaces open it, the box searches a real stored receipt,
 * and a result lands back on the purchase with its chip scrolled to and rung.
 * It creates its own purchase so it does not depend on seed rows surviving
 * other specs in the shared E2E installation.
 */
const SHOP_NAME = 'Playwright Documents Shop';
const RECEIPT_NAME = 'fictional-mot.png';
/** 1×1 PNG. Generated fixture, not a household document. */
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test.describe('Documents page', () => {
  test('the desktop menu opens /documents with a 200 and the page heading', async ({ page }) => {
    const response = await page.request.get('/documents');
    expect(response.status()).toBe(200);

    await page.goto('/overview');
    await page
      .getByRole('navigation', { name: 'Desktop navigation' })
      .getByRole('link', { name: 'Documents', exact: true })
      .click();
    await expect(page).toHaveURL(/\/documents$/);
    await expect(
      page.getByRole('heading', { name: 'Every stored document', level: 1 }),
    ).toBeVisible();
  });

  test('the phone drawer opens /documents too', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 727 });
    await page.goto('/overview');
    await page.getByRole('button', { name: 'Open navigation menu' }).click();
    await page
      .getByRole('navigation', { name: 'Pages' })
      .getByRole('link', { name: 'Documents', exact: true })
      .click();
    await expect(page).toHaveURL(/\/documents$/);
    await expect(
      page.getByRole('heading', { name: 'Every stored document', level: 1 }),
    ).toBeVisible();
  });

  test('searches a stored receipt and follows it back to its purchase', async ({ page }) => {
    test.slow();
    await page.goto('/');
    await waitForTill(page);
    const entry = page.getByRole('region', { name: /Record it while it is fresh/i });
    await entry.locator('input[name="supplierName"]').fill(SHOP_NAME);
    await entry.locator('input[name="amount"]').fill('4.50');
    await entry.getByLabel('Line 1 amount').fill('4.50');
    await pickEntryCategory(entry, 'Groceries / Weekly Shop');
    await entry.getByRole('button', { name: 'Save purchase' }).click();
    await expect(entry.getByRole('status')).toContainText(/saved/i, { timeout: 30_000 });

    await page.goto('/purchases');
    const row = page.locator('tbody tr', { hasText: SHOP_NAME });
    await expect(row).toHaveCount(1);
    const attachForm = row.locator('form:has(input[type="file"])');
    const choosing = page.waitForEvent('filechooser');
    await attachForm
      .locator('label[for^="attachment-file-"]', { hasText: 'Attach receipt' })
      .click();
    const chooser = await choosing;
    await chooser.setFiles({ name: RECEIPT_NAME, mimeType: 'image/png', buffer: PNG_BYTES });
    await expect(row.getByRole('link', { name: new RegExp(RECEIPT_NAME) })).toBeVisible({
      timeout: 30_000,
    });

    await page.goto('/documents');
    await expect(
      page.getByRole('heading', { name: 'Every stored document', level: 1 }),
    ).toBeVisible();

    // A word from the owning record's context, not the file name: the search
    // reads label, file name and owner context together.
    await waitForDocumentSearch(page);
    const search = page.getByLabel('Search documents');
    await search.fill('documents shop');
    await expect(page).toHaveURL(/\/documents\?q=.+/, { timeout: 30_000 });

    const result = page.getByRole('listitem').filter({ hasText: RECEIPT_NAME });
    await expect(result).toHaveCount(1);
    // The context line names the owning purchase's supplier.
    await expect(result).toContainText(SHOP_NAME);
    await result.getByRole('link').click();

    await expect(page).toHaveURL(/\/purchases\?attachment=\d+#purchase-\d+$/, {
      timeout: 30_000,
    });
    const attachmentId = new URL(page.url()).searchParams.get('attachment');
    expect(attachmentId).not.toBeNull();
    // The target page scrolls to the chip and rings it (AttachmentForm focus).
    await expect(
      page.locator(`li[data-attachment-id="${attachmentId}"] .ring-accent`),
    ).toBeVisible();
    await expect(
      page.locator('tbody tr', { hasText: SHOP_NAME }).getByRole('link', {
        name: new RegExp(RECEIPT_NAME),
      }),
    ).toBeVisible();
  });

  test('says so when nothing matches and can clear the search', async ({ page }) => {
    await page.goto('/documents');
    await waitForDocumentSearch(page);
    const search = page.getByLabel('Search documents');
    await search.fill('zzqx no such document 9281');
    await expect(page).toHaveURL(/\/documents\?q=.+/, { timeout: 30_000 });
    await expect(page.getByText(/Nothing matches/)).toBeVisible();
    await expect(page.getByRole('listitem')).toHaveCount(0);

    await page.getByRole('link', { name: 'Clear the search' }).click();
    await expect(page).toHaveURL(/\/documents$/);
    await expect(search).toHaveValue('');
  });
});
