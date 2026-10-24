import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  AttachmentNotFoundError,
  deleteAttachment,
  listStoredAttachments,
  normalizeAttachmentLabel,
  renameAttachment,
  storeAttachment,
} from '../src/lib/records/attachments';
import { createPurchase } from '../src/lib/records/purchases';
import { createHouseholdFixture } from './household';

const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * The friendly name (v1.41.0): an optional display label that never replaces
 * the stored file name, the download name or the storage key. Stored through
 * the same pipeline as the file, editable in place, and cleared by a blank
 * value. Deliberately not audited.
 */
describe('normalizeAttachmentLabel', () => {
  it('trims, collapses whitespace and replaces control characters', () => {
    assert.equal(normalizeAttachmentLabel('  Vehicle MOT  '), 'Vehicle MOT');
    assert.equal(normalizeAttachmentLabel('a\tb\nc'), 'a b c');
    assert.equal(normalizeAttachmentLabel('bad\u0000name'), 'bad name');
  });

  it('caps at 200 characters and treats blank as "no label"', () => {
    assert.equal((normalizeAttachmentLabel('a'.repeat(300)) ?? '').length, 200);
    assert.equal(normalizeAttachmentLabel('   '), null);
    assert.equal(normalizeAttachmentLabel(''), null);
  });
});

describe('storing a document with a friendly name', () => {
  it('keeps the label alongside the file name, and stores null when none is given', async () => {
    const fx = await createHouseholdFixture();
    try {
      const documentsDir = path.join(path.dirname(fx.handle.raw.name), 'documents');
      const purchase = createPurchase(fx.db, {
        supplierName: 'Acorn Insurance',
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
      }).purchase.id;

      const labelled = await storeAttachment({
        db: fx.db,
        purchaseId: purchase,
        originalName: 'IMG_4821.jpg',
        label: 'Vehicle MOT',
        bytes: PNG_BYTES,
        actor: 'alex@example.com',
        documentsDir,
      });
      assert.equal(labelled.label, 'Vehicle MOT');
      assert.equal(labelled.originalName, 'IMG_4821.jpg');

      const unlabelled = await storeAttachment({
        db: fx.db,
        purchaseId: purchase,
        originalName: 'payslip.pdf',
        bytes: PNG_BYTES,
        actor: 'alex@example.com',
        documentsDir,
      });
      assert.equal(unlabelled.label, null);

      const stored = listStoredAttachments(fx.db, purchase);
      assert.deepEqual(
        stored.map((attachment) => attachment.label),
        ['Vehicle MOT', null],
      );
      assert.deepEqual(
        stored.map((attachment) => attachment.originalName),
        ['IMG_4821.jpg', 'payslip.pdf'],
      );
    } finally {
      fx.close();
    }
  });
});

describe('renaming a document', () => {
  it('sets a label, clears it with a blank, and refuses an unknown id', async () => {
    const fx = await createHouseholdFixture();
    try {
      const documentsDir = path.join(path.dirname(fx.handle.raw.name), 'documents');
      const purchase = createPurchase(fx.db, {
        supplierName: 'Acorn Insurance',
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
      }).purchase.id;
      const stored = await storeAttachment({
        db: fx.db,
        purchaseId: purchase,
        originalName: 'IMG_4821.jpg',
        bytes: PNG_BYTES,
        actor: 'alex@example.com',
        documentsDir,
      });

      const renamed = renameAttachment({
        db: fx.db,
        id: stored.id,
        label: 'MOT certificate',
      });
      assert.equal(renamed.changed, true);
      assert.equal(renamed.label, 'MOT certificate');
      assert.equal(listStoredAttachments(fx.db, purchase)[0]!.label, 'MOT certificate');

      // A blank value clears the label, which means "show the file name".
      const cleared = renameAttachment({ db: fx.db, id: stored.id, label: '   ' });
      assert.equal(cleared.changed, true);
      assert.equal(cleared.label, null);

      // An unknown id is a distinct, named error.
      assert.throws(
        () => renameAttachment({ db: fx.db, id: 9_999_999, label: 'x' }),
        AttachmentNotFoundError,
      );

      // A removed document is not renameable: the update matches nothing.
      await deleteAttachment({
        db: fx.db,
        id: stored.id,
        actor: 'alex@example.com',
        documentsDir,
      });
      const afterDelete = renameAttachment({ db: fx.db, id: stored.id, label: 'again' });
      assert.equal(afterDelete.changed, false);
    } finally {
      fx.close();
    }
  });
});
