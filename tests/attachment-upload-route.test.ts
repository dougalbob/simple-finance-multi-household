import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { POST as uploadPOST } from '../src/app/api/attachments/route';
import { loadAppConfig } from '../src/lib/config';
import { closeDbHandles, getHouseholdDbHandle } from '../src/lib/db/client';
import { listStoredAttachments } from '../src/lib/records/attachments';
import { findChildCategory } from '../src/lib/records/categories';
import { createPerson } from '../src/lib/records/people';
import { createPot } from '../src/lib/records/pots';
import { createPurchase } from '../src/lib/records/purchases';
import { closeRegistry } from '../src/lib/registry/db';
import { makeTempDir, seedTestRegistry } from './helpers';

/**
 * `POST /api/attachments` (v1.44.1) — the document upload's own address.
 *
 * The point of the route is that an upload is no longer a POST to the page that
 * shows it (`/purchases`, which is also where the till saves a purchase), so a
 * household can exempt one path from a firewall that scores multipart bodies.
 * What must not change is everything behind it: the same sniffing, the same
 * 10 MB limit, the same audit entry, the same sentences in the household's
 * language, and the same refusals for the same reasons.
 */

const PDF_BYTES = Buffer.from('%PDF-1.7\nbody\n%%EOF\n', 'latin1');
const HTML_BYTES = Buffer.from('<html>not a receipt</html>', 'latin1');

describe('POST /api/attachments', () => {
  let dataDir: string;
  let householdId: string;
  let config: ReturnType<typeof loadAppConfig>;
  let purchaseId = 0;

  const ACTOR = 'alex@example.com';

  before(async () => {
    dataDir = await makeTempDir('sf-attachment-route-');
    process.env.DATA_DIR = dataDir;
    process.env.AUTH_DEV_BYPASS = 'true';
    process.env.AUTH_DEV_IDENTITY_EMAIL = ACTOR;
    householdId = await seedTestRegistry(dataDir, [{ email: ACTOR }]);
    config = loadAppConfig({ NODE_ENV: 'test', DATA_DIR: dataDir, AUTH_DEV_BYPASS: 'true' });
    const { db } = getHouseholdDbHandle(householdId, config);
    const now = new Date('2026-10-02T09:00:00Z');
    const person = createPerson(db, { label: 'Alex', actor: ACTOR, now });
    const pot = createPot(db, {
      label: 'Main account',
      kind: 'bank',
      sortOrder: 0,
      actor: ACTOR,
      now,
    });
    const category =
      findChildCategory(db, 'Groceries', 'Weekly Shop') ??
      findChildCategory(db, 'Utilities', 'Energy');
    assert.ok(category !== null, 'the seeded category tree has a leaf to spend against');
    const saved = createPurchase(db, {
      potId: pot.id,
      totalPence: 15149,
      occurredAt: now,
      paidByPersonId: person.id,
      supplierName: 'EDF',
      actor: ACTOR,
      lines: [{ amountPence: 15149, categoryId: category.id, targetKind: 'household' }],
      now,
    });
    purchaseId = saved.purchase.id;
  });

  after(() => {
    closeDbHandles();
    closeRegistry();
    delete process.env.DATA_DIR;
    delete process.env.AUTH_DEV_BYPASS;
    delete process.env.AUTH_DEV_IDENTITY_EMAIL;
  });

  const url = 'http://localhost:3000/api/attachments';
  const SAME_ORIGIN = 'http://localhost:3000';

  function uploadRequest(fields: {
    file?: { bytes: Buffer; name: string };
    purchaseId?: number;
    receiptId?: number;
    supplierId?: number;
    origin?: string | null;
  }): Request {
    const form = new FormData();
    if (fields.file !== undefined) {
      // A copy into a plain ArrayBuffer: a Node Buffer's own buffer is typed as
      // `ArrayBufferLike`, which is not a BlobPart under the DOM lib.
      const bytes = new Uint8Array(fields.file.bytes.byteLength);
      bytes.set(fields.file.bytes);
      form.set('file', new File([bytes], fields.file.name, { type: 'application/pdf' }));
    }
    if (fields.purchaseId !== undefined) form.set('purchaseId', String(fields.purchaseId));
    if (fields.receiptId !== undefined) form.set('receiptId', String(fields.receiptId));
    if (fields.supplierId !== undefined) form.set('supplierId', String(fields.supplierId));
    const headers: Record<string, string> = {};
    const origin = fields.origin === undefined ? SAME_ORIGIN : fields.origin;
    if (origin !== null) headers.origin = origin;
    return new Request(url, { method: 'POST', body: form, headers });
  }

  it('attaches a PDF to a purchase and answers in the action-state shape', async () => {
    const response = await uploadPOST(
      uploadRequest({ file: { bytes: PDF_BYTES, name: 'EDF bill.pdf' }, purchaseId }),
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const body = (await response.json()) as { status: string; message: string };
    assert.equal(body.status, 'ok');
    assert.equal(body.message, 'Attached EDF bill.pdf.');

    const { db } = getHouseholdDbHandle(householdId, config);
    const stored = listStoredAttachments(db, purchaseId);
    assert.equal(stored.length, 1);
    assert.equal(stored[0]?.mime, 'application/pdf');
    assert.equal(stored[0]?.originalName, 'EDF bill.pdf');
  });

  it('refuses a request with no file, in the words the action uses', async () => {
    const response = await uploadPOST(uploadRequest({ purchaseId }));
    assert.equal(response.status, 400);
    const body = (await response.json()) as { status: string; message: string };
    assert.equal(body.status, 'error');
    assert.equal(body.message, 'Choose a file to attach.');
  });

  it('refuses two owners rather than guessing which record was meant', async () => {
    const response = await uploadPOST(
      uploadRequest({ file: { bytes: PDF_BYTES, name: 'bill.pdf' }, purchaseId, receiptId: 2 }),
    );
    assert.equal(response.status, 400);
    const body = (await response.json()) as { message: string };
    assert.match(body.message, /Choose a record/);
  });

  it('refuses a post from another origin, with the household’s cookies or without', async () => {
    const response = await uploadPOST(
      uploadRequest({
        file: { bytes: PDF_BYTES, name: 'bill.pdf' },
        purchaseId,
        origin: 'https://evil.example',
      }),
    );
    assert.equal(response.status, 403);
    const body = (await response.json()) as { status: string };
    assert.equal(body.status, 'error');
  });

  it('still sniffs the bytes: an HTML file renamed .pdf is refused', async () => {
    const response = await uploadPOST(
      uploadRequest({ file: { bytes: HTML_BYTES, name: 'bill.pdf' }, purchaseId }),
    );
    assert.equal(response.status, 400);
    const body = (await response.json()) as { message: string };
    assert.match(body.message, /genuine PNG, JPEG or PDF/);
  });

  it('answers an oversized body before reading it, with the 10 MB sentence', async () => {
    const response = await uploadPOST(
      new Request(url, {
        method: 'POST',
        // A browser always declares the length of a multipart body, so the
        // guard reads it and answers before a byte is buffered.
        headers: {
          origin: SAME_ORIGIN,
          'content-type': 'multipart/form-data; boundary=x',
          'content-length': String(13 * 1024 * 1024),
        },
        body: new Uint8Array(16),
      }),
    );
    assert.equal(response.status, 413);
    const body = (await response.json()) as { message: string };
    assert.match(body.message, /10 MB/);
  });

  it('refuses a signed-out request', async () => {
    const previous = process.env.AUTH_DEV_IDENTITY_EMAIL;
    process.env.AUTH_DEV_IDENTITY_EMAIL = 'nobody@example.com';
    try {
      const response = await uploadPOST(
        uploadRequest({ file: { bytes: PDF_BYTES, name: 'bill.pdf' }, purchaseId }),
      );
      assert.equal(response.status, 401);
      const body = (await response.json()) as { status: string };
      assert.equal(body.status, 'error');
    } finally {
      process.env.AUTH_DEV_IDENTITY_EMAIL = previous;
    }
  });
});
