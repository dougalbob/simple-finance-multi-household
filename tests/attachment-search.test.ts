import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  ATTACHMENT_SEARCH_RESULT_LIMIT,
  attachmentMatchesSearch,
  attachmentSearchHaystack,
  normalizeAttachmentSearch,
  rankAttachmentMatches,
  searchAttachments,
  type AttachmentSearchResult,
} from '../src/lib/records/attachment-search';
import { renameAttachmentFile, storeAttachment } from '../src/lib/records/attachments';
import { createPurchase } from '../src/lib/records/purchases';
import { createReceipt } from '../src/lib/records/receipts';
import { createSupplier } from '../src/lib/records/suppliers';
import { createHouseholdFixture } from './household';

const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * The app-wide document search (v1.41.0, one name since v1.42.0): finds any
 * stored attachment by the name it carries — the file name, which is now the
 * only name and the one a rename edits — or by the record it belongs to, and
 * returns it with the context of the page where it appears. The ranking rules
 * are pure and pinned here; the projection half proves the join to the owner
 * and the context each result carries.
 */
describe('document search matching', () => {
  const mot = {
    displayName: 'Vehicle MOT.jpg',
    context: 'Purchase · Acorn Insurance · 2026-09-27 · Vehicle Running / Service',
  };

  it('matches everything when nothing is typed', () => {
    assert.equal(attachmentMatchesSearch(mot, ''), true);
    assert.equal(attachmentMatchesSearch(mot, '   '), true);
    assert.equal(normalizeAttachmentSearch('  Vehicle   MOT '), 'vehicle mot');
  });

  it('finds the document by its name, extension and all', () => {
    assert.equal(attachmentMatchesSearch(mot, 'vehicle'), true);
    assert.equal(attachmentMatchesSearch(mot, 'mot'), true);
    assert.equal(attachmentMatchesSearch(mot, 'mot.jpg'), true);
    // A document whose name and context both lack the word is a miss.
    assert.equal(
      attachmentMatchesSearch(
        { displayName: 'payslip.pdf', context: 'Income · Salary' },
        'vehicle',
      ),
      false,
    );
  });

  it('finds the owning record’s context, not just the document', () => {
    assert.equal(attachmentMatchesSearch(mot, 'acorn'), true);
    assert.equal(attachmentMatchesSearch(mot, 'insurance'), true);
    assert.equal(attachmentMatchesSearch(mot, 'service'), true);
    assert.equal(attachmentMatchesSearch(mot, '2026-09-27'), true);
  });

  it('reads the document and its context together: every word somewhere', () => {
    assert.equal(attachmentMatchesSearch(mot, 'mot acorn'), true);
    assert.equal(attachmentMatchesSearch(mot, 'acorn mot'), true);
    assert.equal(attachmentMatchesSearch(mot, 'acorn 9999'), false);
  });

  it('caps an over-long query at the same prefix the page sends', () => {
    const long = 'a'.repeat(200);
    assert.equal(normalizeAttachmentSearch(long).length, 120);
  });
});

describe('document search ranking', () => {
  function result(fields: {
    displayName: string;
    context: string;
    createdAt: Date;
  }): AttachmentSearchResult {
    return {
      id: 0,
      fileKey: 'key',
      originalName: fields.displayName,
      mime: 'image/png',
      sizeBytes: 1,
      ownerKind: 'purchase',
      ownerLabel: 'Supplier',
      href: '/purchases',
      haystack: attachmentSearchHaystack(fields),
      ...fields,
    };
  }

  it('puts a phrase-at-the-start match before a scattered one', () => {
    const exact = result({
      displayName: 'MOT certificate',
      context: 'Purchase · Acorn',
      createdAt: new Date('2026-09-20T00:00:00Z'),
    });
    const scattered = result({
      displayName: 'Vehicle history',
      context: 'MOT · Acorn',
      createdAt: new Date('2026-09-21T00:00:00Z'),
    });
    const ranked = rankAttachmentMatches([scattered, exact], 'mot');
    assert.deepEqual(
      ranked.map((entry) => entry.displayName),
      ['MOT certificate', 'Vehicle history'],
    );
  });

  it('keeps the database order for an empty query and caps the list', () => {
    const rows = Array.from({ length: ATTACHMENT_SEARCH_RESULT_LIMIT + 5 }, (_unused, index) =>
      result({
        displayName: `doc ${index}`,
        context: 'Purchase · Acorn',
        // Newest first, as `searchAttachments` hands them over.
        createdAt: new Date(Date.UTC(2026, 8, 20) - index * 1000),
      }),
    );
    const ranked = rankAttachmentMatches(rows, '');
    assert.equal(ranked.length, ATTACHMENT_SEARCH_RESULT_LIMIT);
    assert.equal(ranked[0]!.displayName, 'doc 0');
  });

  it('drops a document whose context does not contain every word', () => {
    const kept = result({
      displayName: 'MOT.pdf',
      context: 'Purchase · Acorn',
      createdAt: new Date(),
    });
    const dropped = result({
      displayName: 'MOT.pdf',
      context: 'Purchase · Other',
      createdAt: new Date(),
    });
    const ranked = rankAttachmentMatches([kept, dropped], 'acorn');
    assert.deepEqual(ranked, [kept]);
  });
});

describe('document search in the projection', () => {
  it('joins each document to its owner and returns its context and link', async () => {
    const fx = await createHouseholdFixture();
    try {
      const documentsDir = path.join(path.dirname(fx.handle.raw.name), 'documents');
      const at = (date: string) => new Date(`${date}T12:00:00Z`);
      const insurer = createSupplier(fx.db, {
        name: 'Acorn Insurance',
        actor: 'alex@example.com',
      });
      const purchase = createPurchase(fx.db, {
        supplierId: insurer.id,
        potId: fx.pots.main.id,
        totalPence: 1200,
        occurredDate: '2026-09-27',
        lines: [
          {
            amountPence: 1200,
            categoryId: fx.categoryId('Vehicle Running', 'Maintenance & Repairs'),
            targetKind: 'household',
          },
        ],
        actor: 'alex@example.com',
        now: at('2026-09-27'),
      }).purchase.id;
      const salary = createReceipt(fx.db, {
        potId: fx.pots.salary.id,
        amountPence: 240000,
        source: 'Salary',
        occurredDate: '2026-09-25',
        actor: 'alex@example.com',
        now: at('2026-09-25'),
      });

      const motDocument = await storeAttachment({
        db: fx.db,
        purchaseId: purchase,
        originalName: 'IMG_4821.jpg',
        bytes: PNG_BYTES,
        actor: 'alex@example.com',
        documentsDir,
      });
      // The fixture bytes are PNGs, and since v1.42.0 the stored name ends in
      // the extension of the type the bytes really are.
      await storeAttachment({
        db: fx.db,
        supplierId: insurer.id,
        originalName: 'policy.pdf',
        bytes: PNG_BYTES,
        actor: 'alex@example.com',
        documentsDir,
      });
      await storeAttachment({
        db: fx.db,
        receiptId: salary.id,
        originalName: 'payslip',
        bytes: PNG_BYTES,
        actor: 'alex@example.com',
        documentsDir,
      });

      // An empty query lists every stored document.
      assert.equal(searchAttachments(fx.db, '').length, 3);

      // As uploaded, the camera's own name is what the search reads.
      const byFileName = searchAttachments(fx.db, 'img_4821');
      assert.equal(byFileName.length, 1);
      // The bytes are a PNG, so the stored name carries `.png` whatever the
      // browser called the file.
      assert.equal(byFileName[0]!.displayName, 'IMG_4821.png');
      assert.equal(searchAttachments(fx.db, 'vehicle mot').length, 0);

      // Renaming the file is what makes it findable by what it is (v1.42.0),
      // and the search reads the renamed file name in the owner's context.
      renameAttachmentFile({
        db: fx.db,
        id: motDocument.id,
        name: 'Vehicle MOT',
        actor: 'alex@example.com',
      });
      const mot = searchAttachments(fx.db, 'vehicle mot');
      assert.equal(mot.length, 1);
      assert.equal(mot[0]!.displayName, 'Vehicle MOT.png');
      assert.equal(mot[0]!.originalName, 'Vehicle MOT.png');
      assert.equal(mot[0]!.ownerKind, 'purchase');
      assert.match(mot[0]!.context, /Acorn Insurance/);
      assert.match(mot[0]!.context, /Vehicle Running \/ Maintenance & Repairs/);
      assert.match(mot[0]!.href, /^\/purchases\?attachment=\d+#purchase-\d+$/);
      assert.equal(searchAttachments(fx.db, 'img_4821').length, 0);

      // The supplier’s own document is found through its owner.
      const supplierDoc = searchAttachments(fx.db, 'policy');
      assert.equal(supplierDoc.length, 1);
      assert.equal(supplierDoc[0]!.ownerKind, 'supplier');
      assert.equal(supplierDoc[0]!.displayName, 'policy.png');
      assert.match(supplierDoc[0]!.href, /^\/suppliers\?attachment=\d+#supplier-\d+$/);

      // The payslip is found through its income source.
      const payslip = searchAttachments(fx.db, 'salary');
      assert.equal(payslip.length, 1);
      assert.equal(payslip[0]!.ownerKind, 'receipt');
      assert.match(payslip[0]!.href, /^\/income\?attachment=\d+$/);

      // A word in none of them is a miss.
      assert.equal(searchAttachments(fx.db, 'nothing here').length, 0);
    } finally {
      fx.close();
    }
  });

  it('names the supplier of a purchase receipt when no document is supplier-owned', async () => {
    // Regression (v1.41.1): the supplier map was built only from attachment
    // rows' own supplierId, which is null for a purchase receipt. A household
    // whose documents are all purchase receipts therefore got "Unknown
    // supplier" on every result, and searching by supplier name — the MOT case
    // this feature exists for — matched nothing.
    const fx = await createHouseholdFixture();
    try {
      const documentsDir = path.join(path.dirname(fx.handle.raw.name), 'documents');
      const insurer = createSupplier(fx.db, {
        name: 'Acorn Insurance',
        actor: 'alex@example.com',
      });
      const purchase = createPurchase(fx.db, {
        supplierId: insurer.id,
        potId: fx.pots.main.id,
        totalPence: 1200,
        occurredDate: '2026-09-27',
        lines: [
          {
            amountPence: 1200,
            categoryId: fx.categoryId('Vehicle Running', 'Maintenance & Repairs'),
            targetKind: 'household',
          },
        ],
        actor: 'alex@example.com',
        now: new Date('2026-09-27T12:00:00Z'),
      }).purchase.id;
      const motDocument = await storeAttachment({
        db: fx.db,
        purchaseId: purchase,
        originalName: 'IMG_4821.jpg',
        bytes: PNG_BYTES,
        actor: 'alex@example.com',
        documentsDir,
      });

      const results = searchAttachments(fx.db, '');
      assert.equal(results.length, 1);
      assert.equal(results[0]!.ownerLabel, 'Acorn Insurance');
      assert.match(results[0]!.context, /Acorn Insurance/);

      // The whole point: the supplier name is searchable on a purchase receipt.
      assert.equal(searchAttachments(fx.db, 'acorn insurance').length, 1);
      // Renaming the file name is what makes the supplier-name search useful.
      renameAttachmentFile({
        db: fx.db,
        id: motDocument.id,
        name: 'Vehicle MOT',
        actor: 'alex@example.com',
      });
      assert.equal(searchAttachments(fx.db, 'vehicle mot acorn').length, 1);
    } finally {
      fx.close();
    }
  });
});
