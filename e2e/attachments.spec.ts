import { expect, test, type Locator } from '@playwright/test';
import { pickEntryCategory, waitForTill } from './support';

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

/**
 * Renaming a document (v1.42.0, issue 112). The **Rename** control opens a
 * native disclosure holding the document's whole current name, so the thing to
 * edit is right there and no long hint has to sit on the chip; the file's own
 * extension is added when it is left off, and a wrong document extension is
 * replaced rather than doubled. The name is the file name everywhere it is
 * shown — chip, viewer, download — and there is no second "friendly" name
 * beside it. This spec creates its own purchase and timestamped names so a CI
 * retry cannot collide with the first attempt's rows.
 */
test.describe('renaming a receipt', () => {
  test('adds the extension left off, keeps viewer and download in step, and persists', async ({
    page,
  }) => {
    test.slow();
    const stamp = Date.now();
    const shopName = `Playwright Rename Shop ${stamp}`;
    const uploadedName = `fictional-mot-${stamp}.png`;
    const typedName = `Vehicle MOT ${stamp}`;
    const savedName = `${typedName}.png`;
    const secondName = `MOT certificate ${stamp}`;
    const secondSaved = `${secondName}.png`;

    await page.goto('/');
    await waitForTill(page);
    const entry = page.getByRole('region', { name: /Record it while it is fresh/i });
    await entry.locator('input[name="supplierName"]').fill(shopName);
    await entry.locator('input[name="amount"]').fill('6.50');
    await entry.getByLabel('Line 1 amount').fill('6.50');
    await pickEntryCategory(entry, 'Groceries / Weekly Shop');
    await entry.getByRole('button', { name: 'Save purchase' }).click();
    await expect(entry.getByRole('status')).toContainText(/saved/i, { timeout: 30_000 });

    await page.goto('/purchases');
    const row = page.locator('tbody tr', { hasText: shopName });
    await expect(row).toHaveCount(1);
    const attachForm = row.locator('form:has(input[type="file"])');
    // The friendly-name field is gone (issue 112): one name per document, and
    // the upload asks for nothing but the file.
    await expect(attachForm.locator('input[name="label"]')).toHaveCount(0);

    // v1.44.1: a document upload has its own address. It used to be a POST to
    // the page showing it — `/purchases`, the same path the till saves a
    // purchase to — which left a household no way to exempt uploads from a
    // firewall that scores multipart bodies without also exempting every save.
    const posts: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST') posts.push(new URL(request.url()).pathname);
    });
    await row.locator('input[type="file"]').setInputFiles({
      name: uploadedName,
      mimeType: 'image/png',
      buffer: PNG_BYTES,
    });
    const chip = row.getByRole('link', { name: new RegExp(uploadedName) });
    await expect(chip).toBeVisible({ timeout: 30_000 });
    expect(posts).toContain('/api/attachments');
    expect(posts).not.toContain('/purchases');

    const renamePanel = row.locator('details').filter({ hasText: 'Rename' }).first();
    const nameBox = renamePanel.locator('input[name="name"]');
    /** The disclosure stays open across saves; open it only when it is shut. */
    const openRename = async (): Promise<void> => {
      const open = await renamePanel
        .locator('summary')
        .evaluate((node) => (node.parentElement as HTMLDetailsElement).open);
      if (!open) await renamePanel.locator('summary').click();
    };

    // Rename: the box arrives holding the whole current name.
    await openRename();
    await expect(nameBox).toHaveValue(uploadedName);
    await expect(renamePanel).toContainText(/extension is added if you leave it off/i);
    await nameBox.fill(typedName);
    await renamePanel.getByRole('button', { name: 'Save' }).click();
    await expect(renamePanel.getByRole('status')).toContainText(
      `Renamed to “${savedName}” — the extension was added.`,
      { timeout: 30_000 },
    );

    // The chip, the viewer header and the download name all follow the rename.
    const renamed = row.getByRole('link', { name: new RegExp(`Vehicle MOT ${stamp}\\.png`) });
    await expect(renamed).toBeVisible({ timeout: 30_000 });
    await expect(row.getByRole('link', { name: new RegExp(uploadedName) })).toHaveCount(0);
    await renamed.click();
    const viewer = page.getByRole('dialog', { name: `Document: ${savedName}` });
    await expect(viewer.getByRole('link', { name: 'Download' })).toHaveAttribute(
      'download',
      savedName,
    );
    await viewer.getByRole('button', { name: 'Close', exact: true }).click();

    // A typed name that carries a different document extension has it replaced,
    // not doubled: a PNG is never saved as `.pdf`.
    await openRename();
    await nameBox.fill(`${secondName}.pdf`);
    await renamePanel.getByRole('button', { name: 'Save' }).click();
    await expect(row.getByRole('link', { name: new RegExp(`${secondName}\\.png`) })).toBeVisible({
      timeout: 30_000,
    });
    await expect(row.getByRole('link', { name: new RegExp(`${stamp}\\.pdf`) })).toHaveCount(0);

    // Server truth, not just a client re-render.
    await page.reload();
    const reloaded = page.locator('tbody tr', { hasText: shopName });
    await expect(
      reloaded.getByRole('link', { name: new RegExp(`${secondName}\\.png`) }),
    ).toBeVisible();

    // The Documents search finds it by the name it was renamed to.
    await page.goto(`/documents?q=${encodeURIComponent(`mot certificate ${stamp}`)}`);
    const result = page.getByRole('listitem').filter({ hasText: shopName });
    await expect(result).toHaveCount(1);
    await expect(result).toContainText(secondSaved);

    // The purchase's History names both ends of the rename (it is audited).
    await page.goto('/purchases');
    const historyRow = page.locator('tbody tr', { hasText: shopName });
    await historyRow.getByText('History', { exact: true }).click();
    await expect(
      historyRow.locator('li', { hasText: `Renamed ${uploadedName} to ${savedName}` }),
    ).toBeVisible();
    await expect(
      historyRow.locator('li', { hasText: `Renamed ${savedName} to ${secondSaved}` }),
    ).toBeVisible();
  });
});

test.describe('removing a receipt', () => {
  test('removes it from Purchases and Suppliers, and keeps the audit', async ({ page }) => {
    test.slow();
    await page.goto('/');
    await waitForTill(page);
    const entry = page.getByRole('region', { name: /Record it while it is fresh/i });
    await entry.locator('input[name="supplierName"]').fill('Playwright Receipt Shop');
    await entry.locator('input[name="amount"]').fill('4.50');
    await entry.getByLabel('Line 1 amount').fill('4.50');
    await pickEntryCategory(entry, 'Groceries / Weekly Shop');
    await entry.getByRole('button', { name: 'Save purchase' }).click();
    await expect(entry.getByRole('status')).toContainText(/saved/i, { timeout: 30_000 });

    await page.goto('/purchases');
    const row = page.locator('tbody tr', { hasText: 'Playwright Receipt Shop' });
    await expect(row).toHaveCount(1);
    // Decision 204: one control. "Attach receipt" is the label that opens the
    // picker — there is no second button to press first — and choosing the file
    // starts the upload by itself. The no-JavaScript submit button is in the
    // served HTML and is hidden the moment React is on the page.
    // `form:has(...)`, not `filter({ has: row.locator(...) })`: a `has` inner
    // locator is resolved *relative to* each candidate, so one already anchored
    // on the row matches nothing (the row is not inside its own form).
    const attachForm = row.locator('form:has(input[type="file"])');
    const attachControl = attachForm.locator('label[for^="attachment-file-"]', {
      hasText: 'Attach receipt',
    });
    await expect(attachControl).toBeVisible();
    // Keep the visible action and file-kind hint in the accessible name.
    const fileInput = attachForm.locator('input[type="file"]');
    await expect(fileInput).toHaveAccessibleName(/Attach receipt \(receipt or invoice file\)/i);
    // The row has other forms of its own (its follow-up note, for one), so the
    // no-JavaScript submit button is looked for inside the attachment form.
    await expect(attachForm.locator('button[type="submit"]')).toBeHidden();
    // Pressing "Attach receipt" is what opens the picker — it is a label for the
    // file input beneath it — and choosing a file starts the upload by itself.
    // Nothing else is pressed: there is no second button and no attach step.
    const choosing = page.waitForEvent('filechooser');
    await attachControl.click();
    const chooser = await choosing;
    expect(chooser.isMultiple()).toBe(false);
    await chooser.setFiles({ name: RECEIPT_NAME, mimeType: 'image/png', buffer: PNG_BYTES });
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
