import { expect, test } from '@playwright/test';
import { waitForTill } from './support';

/**
 * Receipt removal (SPEC §23.4). The PNG is generated fictional bytes — never a
 * real receipt. This spec creates its own purchase so it does not depend on
 * seed rows surviving a later restore in the backup project.
 */
const RECEIPT_NAME = 'fictional-receipt.png';
/** 1×1 PNG. Generated fixture, not a household document. */
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test.describe('removing a receipt', () => {
  test('removes it from Purchases and Suppliers, and keeps the audit', async ({ page }) => {
    test.slow();
    await page.goto('/');
    await waitForTill(page);
    const entry = page.getByRole('region', { name: /Record it while it is fresh/i });
    await entry.locator('input[name="supplierName"]').fill('Playwright Receipt Shop');
    await entry.locator('input[name="amount"]').fill('4.50');
    await entry.getByLabel('Line 1 amount').fill('4.50');
    await entry.getByLabel(/^Category/).selectOption({ label: 'Groceries / Weekly Shop' });
    await entry.getByRole('button', { name: 'Save purchase' }).click();
    await expect(entry.getByRole('status')).toContainText(/saved/i, { timeout: 30_000 });

    await page.goto('/purchases');
    const row = page.locator('tbody tr', { hasText: 'Playwright Receipt Shop' });
    await expect(row).toHaveCount(1);
    await row.locator('input[type="file"]').setInputFiles({
      name: RECEIPT_NAME,
      mimeType: 'image/png',
      buffer: PNG_BYTES,
    });
    await row.getByRole('button', { name: 'Attach receipt' }).click();
    const viewLink = row.getByRole('link', { name: new RegExp(RECEIPT_NAME) });
    await expect(viewLink).toBeVisible({ timeout: 30_000 });
    const href = await viewLink.getAttribute('href');
    expect(href).toMatch(/^\/api\/attachments\/[0-9a-f-]+\.png$/);
    // Same page and scroll, including a phone-sized installed-app layout.
    for (const viewport of [
      { width: 1400, height: 950 },
      { width: 393, height: 727 },
    ]) {
      await page.setViewportSize(viewport);
      await viewLink.scrollIntoViewIfNeeded();
      const before = await page.evaluate(() => window.scrollY);
      const location = page.url();
      await viewLink.click();
      const viewer = page.getByRole('dialog', { name: `Document: ${RECEIPT_NAME}` });
      await expect(viewer.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
      await expect(viewer.getByRole('img', { name: RECEIPT_NAME })).toBeVisible();
      await expect(viewer.getByRole('link', { name: 'Download' })).toHaveAttribute(
        'download',
        RECEIPT_NAME,
      );
      await viewer.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(viewer).toHaveCount(0);
      await expect(viewLink).toBeFocused();
      expect(page.url()).toBe(location);
      expect(await page.evaluate(() => window.scrollY)).toBe(before);
      await viewLink.click();
      await page.keyboard.press('Escape');
      await expect(viewer).toHaveCount(0);
    }
    await page.setViewportSize({ width: 1400, height: 950 });
    const bytes = await page.request.get(href!);
    expect(bytes.headers()['cache-control']).toBe('private, no-store');
    await page.route(`**${href}`, (route) => route.fulfill({ status: 404, body: 'Not found' }));
    await viewLink.click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Document unavailable');
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
    await page.unroute(`**${href}`);

    // A generated blank PDF exercises the PDF branch without household data.
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>',
    ];
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, i) => {
      offsets.push(Buffer.byteLength(pdf));
      pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xref = Buffer.byteLength(pdf);
    pdf += `xref\n0 4\n0000000000 65535 f \n${offsets
      .slice(1)
      .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
      .join('')}trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    await row.locator('input[type="file"]').setInputFiles({
      name: 'fictional.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(pdf),
    });
    await row.getByRole('button', { name: 'Attach receipt' }).click();
    const pdfLink = row.getByRole('link', { name: /fictional.pdf/ });
    await expect(pdfLink).toBeVisible();
    for (const width of [393, 1400]) {
      await page.setViewportSize({ width, height: 950 });
      // The share API is read when the viewer draws its footer, so mock it before opening.
      // Headless Linux has no share API (SANDBOX entry 16).
      if (width === 393) {
        await page.evaluate(() => {
          const shared: Array<{ name: string; type: string; size: number }> = [];
          Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
          Object.defineProperty(navigator, 'share', {
            configurable: true,
            value: async (data: { files?: File[] }) => {
              for (const file of data.files ?? []) {
                shared.push({ name: file.name, type: file.type, size: file.size });
              }
            },
          });
          (window as unknown as { __shared: typeof shared }).__shared = shared;
        });
      }
      await pdfLink.click();
      const dialog = page.getByRole('dialog');
      // The PDF is an <object> on a blob URL. This Chromium has no PDF plugin, so the
      // inline page itself is not checked here: only the wiring and the fallback path.
      await expect(dialog.locator('object[type="application/pdf"]')).toHaveAttribute(
        'data',
        /^blob:/,
      );
      await expect(dialog.getByRole('link', { name: 'Download' })).toHaveAttribute(
        'download',
        'fictional.pdf',
      );
      const box = await dialog.boundingBox();
      if (width === 393) {
        // A phone gets the whole screen, and the actions are in reach without scrolling.
        expect(box?.width).toBe(393);
        expect(box?.height).toBe(950);
        await expect(dialog.getByRole('link', { name: 'Download' })).toBeInViewport();
        await dialog.getByRole('button', { name: 'Open in PDF app' }).click();
        const shared = await page.evaluate(
          () => (window as unknown as { __shared?: unknown[] }).__shared ?? [],
        );
        expect(shared).toEqual([
          expect.objectContaining({ name: 'fictional.pdf', type: 'application/pdf' }),
        ]);
      } else {
        // From 640px up the viewer is a centred panel, not the whole screen.
        expect(box?.width).toBeLessThan(1400);
      }
      await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(pdfLink).toBeFocused();
    }

    await page.goto('/suppliers');
    const supplierCard = page.getByRole('article').filter({
      has: page.getByRole('heading', { name: 'Playwright Receipt Shop', exact: true }),
    });
    await supplierCard.getByRole('button', { name: 'Playwright Receipt Shop' }).click();
    await expect(
      supplierCard.getByRole('button', { name: `Remove receipt ${RECEIPT_NAME}` }).first(),
    ).toBeVisible();

    await page.goto('/purchases');
    const again = page.locator('tbody tr', { hasText: 'Playwright Receipt Shop' });
    await again.getByRole('button', { name: `Remove receipt ${RECEIPT_NAME}` }).click();
    await again.getByRole('button', { name: `Confirm remove receipt ${RECEIPT_NAME}` }).click();
    await expect(again.getByRole('link', { name: new RegExp(RECEIPT_NAME) })).toHaveCount(0, {
      timeout: 30_000,
    });

    await again.getByText('History', { exact: true }).click();
    const removal = again.locator('li', { hasText: `Removed ${RECEIPT_NAME}` });
    await expect(removal).toBeVisible();
    await expect(removal).toContainText('alex@example.com');
    await expect(removal).toContainText(/\d{1,2}:\d{2}/);

    const gone = await page.request.get(new URL(href!, page.url()).toString());
    expect(gone.status()).toBe(404);
  });
});
