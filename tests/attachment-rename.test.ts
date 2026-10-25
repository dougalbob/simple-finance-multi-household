import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { eq } from 'drizzle-orm';
import { auditEntries } from '../src/lib/db/schema';
import {
  AttachmentInputError,
  AttachmentNotFoundError,
  deleteAttachment,
  listStoredAttachments,
  readAttachmentBytes,
  renameAttachmentFile,
  storeAttachment,
  withDocumentExtension,
} from '../src/lib/records/attachments';
import { createPurchase } from '../src/lib/records/purchases';
import { createSupplier } from '../src/lib/records/suppliers';
import { createHouseholdFixture } from './household';

const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
/** A minimal, genuine PDF — the signature is all the sniffer needs. */
const PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n', 'latin1');

/**
 * Renaming a document (v1.42.0, issue 112).
 *
 * The household types a name; the app keeps the file's own extension on it and
 * stores that name as the document's file name — the one the chip, the viewer,
 * the download and the Documents search all use. Only the name moves: the
 * storage key, the bytes, the sniffed MIME type and the sha256 are untouched,
 * so a name can never redirect the app at a file it did not write.
 */
describe('withDocumentExtension', () => {
  it('adds the file’s own extension when the name has none', () => {
    assert.deepEqual(withDocumentExtension('Vehicle MOT', 'application/pdf'), {
      name: 'Vehicle MOT.pdf',
      extensionAdded: true,
    });
    assert.deepEqual(withDocumentExtension('  Vehicle MOT  ', 'image/png'), {
      name: 'Vehicle MOT.png',
      extensionAdded: true,
    });
    assert.deepEqual(withDocumentExtension('IMG_4821', 'image/jpeg'), {
      name: 'IMG_4821.jpg',
      extensionAdded: true,
    });
  });

  it('keeps a name that already ends in the right extension, case and all', () => {
    assert.deepEqual(withDocumentExtension('Vehicle MOT.pdf', 'application/pdf'), {
      name: 'Vehicle MOT.pdf',
      extensionAdded: false,
    });
    assert.deepEqual(withDocumentExtension('MOT.PDF', 'application/pdf'), {
      name: 'MOT.PDF',
      extensionAdded: false,
    });
    // .jpeg is the same format as .jpg, so it is not "wrong".
    assert.deepEqual(withDocumentExtension('MOT.jpeg', 'image/jpeg'), {
      name: 'MOT.jpeg',
      extensionAdded: false,
    });
  });

  it('replaces a different document extension instead of doubling it', () => {
    assert.deepEqual(withDocumentExtension('MOT.png', 'application/pdf'), {
      name: 'MOT.pdf',
      extensionAdded: true,
    });
    assert.deepEqual(withDocumentExtension('MOT.jpg', 'image/png'), {
      name: 'MOT.png',
      extensionAdded: true,
    });
  });

  it('keeps a suffix that is not a document extension', () => {
    assert.deepEqual(withDocumentExtension('MOT 2026.v2', 'application/pdf'), {
      name: 'MOT 2026.v2.pdf',
      extensionAdded: true,
    });
  });

  it('sanitises the name before naming anything', () => {
    // A typed path is a name, not a path: only the basename survives.
    assert.equal(withDocumentExtension('/etc/shadow', 'image/png').name, 'shadow.png');
    assert.equal(withDocumentExtension('..\\..\\windows\\cfg', 'image/png').name, 'cfg.png');
    // Quotes, angle brackets and the Windows reserved set are replaced, so a
    // name can never break out of the download header or the markup it lands in.
    assert.equal(withDocumentExtension('"><script>', 'application/pdf').name, '___script_.pdf');
    assert.equal(withDocumentExtension('a\tb', 'image/png').name, 'a_b.png');
  });

  it('caps the whole name, extension included, at 200 characters', () => {
    const long = withDocumentExtension('a'.repeat(400), 'application/pdf');
    assert.equal(long.name.length, 200);
    assert.ok(long.name.endsWith('.pdf'));
  });

  it('leaves the name alone when the MIME type is not one this app stores', () => {
    assert.deepEqual(withDocumentExtension('notes', 'text/plain'), {
      name: 'notes',
      extensionAdded: false,
    });
  });
});

describe('storing a document names it with its own extension', () => {
  it('adds the extension the browser did not send, keeping the sniffed type', async () => {
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

      // The bytes are a PNG whatever the name says: the name follows the bytes.
      const stored = await storeAttachment({
        db: fx.db,
        purchaseId: purchase,
        originalName: 'IMG_4821',
        bytes: PNG_BYTES,
        actor: 'alex@example.com',
        documentsDir,
      });
      assert.equal(stored.mime, 'image/png');
      assert.equal(stored.originalName, 'IMG_4821.png');

      // A suffix that is not a document extension is part of the name, not a
      // type to correct: `.txt` here is neither replaced nor trusted — the
      // bytes decide the type, and the name ends in the type it really is.
      const pdf = await storeAttachment({
        db: fx.db,
        purchaseId: purchase,
        originalName: 'policy.txt',
        bytes: PDF_BYTES,
        actor: 'alex@example.com',
        documentsDir,
      });
      assert.equal(pdf.mime, 'application/pdf');
      assert.equal(pdf.originalName, 'policy.txt.pdf');

      assert.deepEqual(
        listStoredAttachments(fx.db, purchase).map((attachment) => attachment.originalName),
        ['IMG_4821.png', 'policy.txt.pdf'],
      );
    } finally {
      fx.close();
    }
  });
});

describe('renaming a document', () => {
  it('changes the file name only, and audits it against the owning record', async () => {
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
        originalName: 'IMG_4821.png',
        bytes: PNG_BYTES,
        actor: 'alex@example.com',
        documentsDir,
      });

      const renamed = renameAttachmentFile({
        db: fx.db,
        id: stored.id,
        name: 'Vehicle MOT 2026',
        actor: 'alex@example.com',
      });
      assert.equal(renamed.outcome, 'renamed');
      assert.equal(renamed.originalName, 'Vehicle MOT 2026.png');
      assert.equal(renamed.extensionAdded, true);

      const [row] = listStoredAttachments(fx.db, purchase);
      assert.equal(row!.originalName, 'Vehicle MOT 2026.png');
      // Everything that decides where the bytes live is untouched.
      assert.equal(row!.fileKey, stored.fileKey);
      assert.equal(row!.mime, stored.mime);
      assert.equal(row!.sizeBytes, stored.sizeBytes);
      assert.equal(row!.sha256, stored.sha256);
      assert.deepEqual(await readAttachmentBytes(documentsDir, stored.fileKey), PNG_BYTES);

      // The rename is in the trail, against the purchase, with both names.
      const audit = fx.db
        .select()
        .from(auditEntries)
        .where(eq(auditEntries.action, 'attachment.rename'))
        .all();
      assert.equal(audit.length, 1);
      assert.equal(audit[0]!.actor, 'alex@example.com');
      assert.equal(audit[0]!.entity, 'purchase');
      assert.equal(audit[0]!.entityId, String(purchase));
      assert.match(audit[0]!.summary, /IMG_4821\.png/);
      assert.match(audit[0]!.summary, /Vehicle MOT 2026\.png/);
      assert.deepEqual(JSON.parse(audit[0]!.before!), {
        fileKey: stored.fileKey,
        originalName: 'IMG_4821.png',
      });
      assert.deepEqual(JSON.parse(audit[0]!.after!), {
        fileKey: stored.fileKey,
        originalName: 'Vehicle MOT 2026.png',
      });
    } finally {
      fx.close();
    }
  });

  it('keeps the extension the household typed, and reports nothing changed twice', async () => {
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
        originalName: 'IMG_4821.png',
        bytes: PNG_BYTES,
        actor: 'alex@example.com',
        documentsDir,
      });

      const typed = renameAttachmentFile({
        db: fx.db,
        id: stored.id,
        name: 'MOT.PNG',
        actor: 'alex@example.com',
      });
      assert.equal(typed.outcome, 'renamed');
      assert.equal(typed.originalName, 'MOT.PNG');
      assert.equal(typed.extensionAdded, false);

      // Saving the same name again is a no-op: no second audit entry.
      const again = renameAttachmentFile({
        db: fx.db,
        id: stored.id,
        name: 'MOT.PNG',
        actor: 'alex@example.com',
      });
      assert.equal(again.outcome, 'unchanged');
      assert.equal(again.originalName, 'MOT.PNG');
      assert.equal(
        fx.db.select().from(auditEntries).where(eq(auditEntries.action, 'attachment.rename')).all()
          .length,
        1,
      );
    } finally {
      fx.close();
    }
  });

  it('refuses an empty name, an unknown id, and a removed document', async () => {
    const fx = await createHouseholdFixture();
    try {
      const documentsDir = path.join(path.dirname(fx.handle.raw.name), 'documents');
      const supplier = createSupplier(fx.db, {
        name: 'Acorn Insurance',
        actor: 'alex@example.com',
      });
      const stored = await storeAttachment({
        db: fx.db,
        supplierId: supplier.id,
        originalName: 'policy.pdf',
        bytes: PDF_BYTES,
        actor: 'alex@example.com',
        documentsDir,
      });

      // A name of nothing is a mistake the household can fix, not a rename.
      assert.throws(
        () => renameAttachmentFile({ db: fx.db, id: stored.id, name: '   ', actor: 'a@b.c' }),
        AttachmentInputError,
      );
      assert.throws(
        () => renameAttachmentFile({ db: fx.db, id: 9_999_999, name: 'x', actor: 'a@b.c' }),
        AttachmentNotFoundError,
      );

      // A removed document is not renamed, and writes no audit entry.
      const renamed = renameAttachmentFile({
        db: fx.db,
        id: stored.id,
        name: 'Policy 2026',
        actor: 'alex@example.com',
      });
      assert.equal(renamed.outcome, 'renamed');
      assert.equal(renamed.originalName, 'Policy 2026.pdf');
      await deleteAttachment({
        db: fx.db,
        id: stored.id,
        actor: 'alex@example.com',
        documentsDir,
      });
      const afterDelete = renameAttachmentFile({
        db: fx.db,
        id: stored.id,
        name: 'Policy 2027',
        actor: 'alex@example.com',
      });
      assert.equal(afterDelete.outcome, 'removed');
      assert.equal(afterDelete.originalName, 'Policy 2026.pdf');
      assert.equal(
        fx.db.select().from(auditEntries).where(eq(auditEntries.action, 'attachment.rename')).all()
          .length,
        1,
      );
    } finally {
      fx.close();
    }
  });

  it('audits a supplier’s own document against the supplier', async () => {
    const fx = await createHouseholdFixture();
    try {
      const documentsDir = path.join(path.dirname(fx.handle.raw.name), 'documents');
      const supplier = createSupplier(fx.db, {
        name: 'Acorn Insurance',
        actor: 'alex@example.com',
      });
      const stored = await storeAttachment({
        db: fx.db,
        supplierId: supplier.id,
        originalName: 'policy.pdf',
        bytes: PDF_BYTES,
        actor: 'alex@example.com',
        documentsDir,
      });
      renameAttachmentFile({
        db: fx.db,
        id: stored.id,
        name: 'Policy schedule',
        actor: 'sam@example.com',
      });
      const [audit] = fx.db
        .select()
        .from(auditEntries)
        .where(eq(auditEntries.action, 'attachment.rename'))
        .all();
      assert.equal(audit!.entity, 'supplier');
      assert.equal(audit!.entityId, String(supplier.id));
      assert.equal(audit!.actor, 'sam@example.com');
    } finally {
      fx.close();
    }
  });
});

/**
 * The friendly name is gone from the interface (issue 112 asked for it to be
 * hidden, not migrated away). These guards keep it gone in the two places the
 * household sees documents, while leaving the nullable `label` column in the
 * schema and the backups — no migration, in case it is wanted later.
 */
describe('the friendly name stays out of the interface', () => {
  const form = readFileSync(
    new URL('../src/components/attachment-form.tsx', import.meta.url),
    'utf8',
  );
  const page = readFileSync(new URL('../src/app/documents/page.tsx', import.meta.url), 'utf8');

  it('has no friendly-name field on the upload form or the rename editor', () => {
    assert.equal(/Friendly/i.test(form), false);
    assert.equal(form.includes('name="label"'), false);
    // The rename editor posts the attachment id and the new file name.
    assert.match(form, /name="attachmentId"/);
    assert.match(form, /name="name"/);
  });

  it('shows one name per document, not a label beside a file name', () => {
    assert.equal(/friendly/i.test(page), false);
    assert.equal(page.includes('doc.label'), false);
    assert.match(page, /doc\.displayName/);
  });

  it('keeps the label column in the schema and its migration, with no drop', () => {
    const schema = readFileSync(new URL('../src/lib/db/schema.ts', import.meta.url), 'utf8');
    assert.match(schema, /label: text\('label'\)/);
    const migration = readFileSync(
      new URL('../drizzle/0021_attachment_labels.sql', import.meta.url),
      'utf8',
    );
    assert.match(migration, /ADD `label` text/);
  });
});
