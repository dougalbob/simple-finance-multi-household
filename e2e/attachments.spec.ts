import { expect, test, type Locator } from '@playwright/test';
import { waitForTill } from './support';

/**
 * Receipt removal (SPEC §23.4). The PNG is generated fictional bytes — never a
 * real receipt. This spec creates its own purchase so it does not depend on
 * seed rows surviving other specs in the shared E2E installation.
 */
const RECEIPT_NAME = 'fictional-receipt.png';
/** 1×1 PNG. Generated fixture, not a household document. */
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * A generated PDF with `pages` pages, each carrying one blue square (0 0 1 rg)
 * so a rendered page can be checked by its pixels. Fictional, and built by hand
 * so the test needs no PDF library.
 */
function fictionalPdf(pages: number): Buffer {
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${Array.from({ length: pages }, (_, i) => `${3 + 2 * i} 0 R`).join(' ')}] /Count ${pages} >>`,
  ];
  const square = '0 0 1 rg 20 20 160 160 re f';
  for (let i = 0; i < pages; i += 1) {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents ${4 + 2 * i} 0 R >>`,
      `<< /Length ${square.length} >>\nstream\n${square}\nendstream`,
    );
  }
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body);
  const count = objects.length + 1;
  body +=
    `xref\n0 ${count}\n0000000000 65535 f \n` +
    offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('') +
    `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body);
}

/** True when the canvas's centre pixel is the blue of the generated square. */
async function isBluePixel(canvas: Locator): Promise<boolean> {
  return canvas.evaluate((node: HTMLCanvasElement) => {
    const context = node.getContext('2d');
    if (context === null || node.width === 0 || node.height === 0) return false;
    const pixel = context.getImageData(
      Math.floor(node.width / 2),
      Math.floor(node.height / 2),
      1,
      1,
    ).data;
    return (pixel[0] ?? 255) < 80 && (pixel[1] ?? 255) < 80 && (pixel[2] ?? 0) > 180;
  });
}

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

    // Generated PDFs exercise the in-app reader without household data (decision 192).
    await row.locator('input[type="file"]').setInputFiles({
      name: 'fictional.pdf',
      mimeType: 'application/pdf',
      buffer: fictionalPdf(3),
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
      // pdf.js draws every page onto a canvas. The first page must show the generated
      // square, so the page itself is checked, not only the wiring around it.
      await expect(dialog.getByRole('img', { name: /^Page \d of 3$/ })).toHaveCount(3);
      const firstPage = dialog.getByRole('img', { name: 'Page 1 of 3' });
      await expect(firstPage).toBeVisible({ timeout: 30_000 });
      await expect.poll(() => isBluePixel(firstPage), { timeout: 30_000 }).toBe(true);
      await expect(dialog.getByRole('link', { name: 'Download' })).toHaveAttribute(
        'download',
        'fictional.pdf',
      );
      const box = await dialog.boundingBox();
      if (width === 393) {
        // A phone gets the whole screen. The pages fill it less an 8px gap either side,
        // and the actions stay in reach without scrolling.
        expect(box?.width).toBe(393);
        expect(box?.height).toBe(950);
        const pageBox = await firstPage.boundingBox();
        expect(Math.abs((pageBox?.width ?? 0) - (393 - 16))).toBeLessThan(2);
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

    // A file the reader cannot open gets the message and the footer, not a blank panel.
    // It starts with %PDF- so the upload's content check accepts it.
    await row.locator('input[type="file"]').setInputFiles({
      name: 'broken.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\nnot a PDF body\n'),
    });
    await row.getByRole('button', { name: 'Attach receipt' }).click();
    await row.getByRole('link', { name: /broken.pdf/ }).click();
    const broken = page.getByRole('dialog');
    await expect(broken.getByRole('alert')).toContainText('could not be shown here', {
      timeout: 30_000,
    });
    await expect(broken.getByRole('link', { name: 'Download' })).toBeVisible();
    await broken.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(broken).toHaveCount(0);

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
