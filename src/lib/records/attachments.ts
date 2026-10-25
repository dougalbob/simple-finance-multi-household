import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { recordAudit, type DbTx } from '../audit';
import type { Db } from '../db/client';
import { attachments, purchases, receipts, suppliers } from '../db/schema';

/**
 * Receipt/invoice attachments (SPEC §23). One shared, framework-free pipeline
 * so the upload action, the authenticated serving route, the backup engine and
 * the restore path all agree on what a valid attachment is:
 *
 * - MIME is decided by **content sniffing** of the leading bytes, never by the
 *   filename or the browser-supplied type (SPEC §23.3);
 * - the size limit is enforced here, server-side (SPEC §23, plan OQ12: 10 MB);
 * - storage keys are server-generated under the resolved household's
 *   `<dataDir>/households/<id>/documents/` and must
 *   match a strict pattern before anything touches the filesystem — that same
 *   pattern is what makes an archive member safe to restore (SPEC §18.4);
 * - removal flips `state` to `deleted` and audits it, and only then unlinks
 *   the file (SPEC §23.4). The other way around would make the next backup
 *   fail closed if the process died in between;
 * - a rename changes only the display/download **name** (v1.42.0) and audits
 *   it — the storage key, the bytes and the sniffed MIME type are untouched,
 *   so a name can never redirect the app at a file it did not write.
 */

/** Per-file limit (plan OQ12). Enforced on upload and on restore. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export type AttachmentMime = 'image/png' | 'image/jpeg' | 'application/pdf';

export const ATTACHMENT_MIMES: readonly AttachmentMime[] = [
  'image/png',
  'image/jpeg',
  'application/pdf',
];

/**
 * Server-generated storage keys: a UUID plus an extension derived from the
 * sniffed MIME. Anything else is rejected — user-controlled paths never reach
 * the filesystem (SPEC §23.2), and archive members are validated with the same
 * pattern on restore.
 */
export const FILE_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|pdf)$/;

export class AttachmentInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AttachmentInputError';
  }
}

/** The id does not match a row. A second delete of a row that exists is not this. */
export class AttachmentNotFoundError extends Error {
  constructor(message = 'That receipt no longer exists.') {
    super(message);
    this.name = 'AttachmentNotFoundError';
  }
}

function attachmentSizeLabel(sizeBytes: number): string {
  return `${(sizeBytes / 1024).toFixed(0)} KB`;
}

export function isSafeFileKey(fileKey: string): boolean {
  return FILE_KEY_PATTERN.test(fileKey);
}

/**
 * Content sniffing. Deliberately strict about the leading bytes: a JPEG must
 * start FF D8 FF, a PNG must carry its full 8-byte signature and a PDF must
 * start with `%PDF-`. A renamed archive or HTML file is rejected here even
 * when the browser claims `image/png`.
 */
export function sniffAttachmentMime(bytes: Buffer): AttachmentMime | null {
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString('latin1') === '%PDF-') {
    return 'application/pdf';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= pngSignature.length && pngSignature.every((b, i) => bytes[i] === b)) {
    return 'image/png';
  }
  return null;
}

export function extensionForMime(mime: AttachmentMime): 'png' | 'jpg' | 'pdf' {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg') return 'jpg';
  return 'pdf';
}

export function newFileKey(mime: AttachmentMime): string {
  return `${randomUUID()}.${extensionForMime(mime)}`;
}

/**
 * Display name used for `Content-Disposition` and download naming. Only the
 * basename survives, control characters are replaced and the length is capped
 * — the stored key, never this string, decides where the bytes live.
 */
export function sanitizeOriginalName(raw: string): string {
  // Treat a Windows-style path as a path too, so its directory part is dropped
  // on every platform rather than surviving as literal characters.
  const base = path
    .basename(raw.trim().replace(/\\/g, '/'))
    // Control characters, quotes/backslashes and the characters Windows (and
    // the Content-Disposition header) dislike, so a display name can never
    // break out of the header or the markup it lands in.
    .replace(/[\u0000-\u001f\u007f"\\/<>|*?:]/g, '_');
  const cleaned = base.replace(/\s+/g, ' ').replace(/^\.+/, '').trim();
  if (cleaned.length === 0) return 'attachment';
  return cleaned.slice(0, 200);
}

/**
 * The extensions this app stores, and the one extension each sniffed MIME
 * type is named with (v1.42.0). A document's *name* is display and download
 * text; its **storage key** is minted from the sniffed bytes and never
 * changes, so a name can never point the app at a path it did not create.
 */
const DOCUMENT_EXTENSION_PATTERN = /\.(png|jpe?g|pdf)$/i;

/** `application/pdf` → `pdf`, `image/jpeg` → `jpg`, `image/png` → `png`. */
export function canonicalExtension(mime: string): 'png' | 'jpg' | 'pdf' | null {
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  return null;
}

function extensionOf(name: string): string | null {
  const match = /\.([a-z0-9]+)$/i.exec(name);
  return match === null ? null : match[1]!.toLowerCase();
}

export interface DocumentFileName {
  /** The full name to store, extension included. */
  name: string;
  /** True when the extension was added or corrected, not typed by the household. */
  extensionAdded: boolean;
}

/**
 * A document name as the app stores it (v1.42.0, issue 112): sanitised, and
 * ending in the extension of the file's **sniffed** type.
 *
 * The household types a name — `Vehicle MOT`, or `Vehicle MOT.pdf`. A name
 * that already ends in the document's own extension is kept exactly as typed
 * (case and all); `.jpeg` is accepted as another spelling of `.jpg`. Anything
 * else gets the extension appended, and a name ending in a *different*
 * document extension has that one replaced rather than doubled, so a PDF can
 * never be saved as `MOT.png` and a name is never `MOT.png.pdf`. A trailing
 * non-document suffix (`MOT 2026.v2`) is not an extension and is kept.
 *
 * The extension comes from the MIME type content sniffing decided at upload,
 * never from the typed name: the name is display text, the bytes decide what
 * the file really is.
 */
export function withDocumentExtension(typed: string, mime: string): DocumentFileName {
  const sanitized = sanitizeOriginalName(typed);
  const canonical = canonicalExtension(mime);
  if (canonical === null) return { name: sanitized, extensionAdded: false };
  const current = extensionOf(sanitized);
  const alreadyRight = current === canonical || (canonical === 'jpg' && current === 'jpeg');
  if (alreadyRight) return { name: sanitized, extensionAdded: false };
  const base = sanitized.replace(DOCUMENT_EXTENSION_PATTERN, '');
  const suffix = `.${canonical}`;
  const trimmedBase = base === '' ? 'attachment' : base;
  return {
    name: `${trimmedBase.slice(0, 200 - suffix.length)}${suffix}`,
    extensionAdded: true,
  };
}

/**
 * What a document is attached to (decision 138): a purchase (receipts,
 * invoices), since v0.10.0 an income record (payslips), and since v0.25.0 a
 * supplier (letters, policy documents, terms — decision 175). Exactly one;
 * the table's CHECK says the same thing.
 */
export type AttachmentOwner =
  | { kind: 'purchase'; id: number }
  | { kind: 'receipt'; id: number }
  | { kind: 'supplier'; id: number };

export interface StoreAttachmentInput {
  db: Db;
  /** A purchase's receipt or invoice. Give exactly one of the three owner ids. */
  purchaseId?: number;
  /** An income record's document — a payslip, typically (v0.10.0). */
  receiptId?: number;
  /** A supplier's letter, policy document or terms (v0.25.0). */
  supplierId?: number;
  originalName: string;
  bytes: Buffer;
  actor: string;
  /** Resolved tenant `<dataDir>/households/<id>/documents`, never request input. */
  documentsDir: string;
  now?: Date;
}

export interface StoredAttachment {
  id: number;
  fileKey: string;
  originalName: string;
  mime: string;
  sizeBytes: number;
  sha256: string;
}

/**
 * The upload half of the pipeline: validate, write the file, then record the
 * row and the audit entry together. A rejected upload writes nothing at all,
 * so the purchase is untouched and the retry is a clean retry (SPEC §23.1).
 *
 * The file is written with `wx` (never overwriting an existing key) before the
 * database row exists; a crash between the two leaves an unreferenced file,
 * which the backup's orphan report surfaces without ever deleting it (SPEC
 * §18.2). The reverse order would be worse: a stored row whose bytes are
 * missing would make the archive inconsistent.
 */
export async function storeAttachment(input: StoreAttachmentInput): Promise<StoredAttachment> {
  const owner = resolveOwner(input);
  assertOwnerExists(input.db, owner);

  if (input.bytes.length === 0) throw new AttachmentInputError('The file is empty.');
  if (input.bytes.length > MAX_ATTACHMENT_BYTES) {
    throw new AttachmentInputError(
      `Attachments must be 10 MB or smaller (this one is ${(input.bytes.length / (1024 * 1024)).toFixed(1)} MB).`,
    );
  }

  const mime = sniffAttachmentMime(input.bytes);
  if (mime === null) {
    throw new AttachmentInputError('Only genuine PNG, JPEG or PDF files are accepted.');
  }

  const now = input.now ?? new Date();
  const fileKey = newFileKey(mime);
  if (!isSafeFileKey(fileKey)) throw new AttachmentInputError('Could not allocate a storage key.');

  await mkdir(input.documentsDir, { recursive: true, mode: 0o700 });
  await writeFile(path.join(input.documentsDir, fileKey), input.bytes, {
    flag: 'wx',
    mode: 0o600,
  });

  const sha256 = createHash('sha256').update(input.bytes).digest('hex');
  const originalName = withDocumentExtension(input.originalName, mime).name;
  const id = input.db.transaction((tx: DbTx) => {
    const row = tx
      .insert(attachments)
      .values({
        purchaseId: owner.kind === 'purchase' ? owner.id : null,
        receiptId: owner.kind === 'receipt' ? owner.id : null,
        supplierId: owner.kind === 'supplier' ? owner.id : null,
        fileKey,
        originalName,
        mime,
        sizeBytes: input.bytes.length,
        sha256,
        state: 'stored',
        createdBy: input.actor,
        createdAt: now,
      })
      .returning({ id: attachments.id })
      .get();
    recordAudit(tx, {
      actor: input.actor,
      action: 'attachment.store',
      entity: owner.kind,
      entityId: owner.id,
      summary: `Attached ${originalName} (${attachmentSizeLabel(input.bytes.length)}, ${mime})`,
      after: { fileKey, originalName, mime, sizeBytes: input.bytes.length, sha256 },
      now,
    });
    return row.id;
  });

  return { id, fileKey, originalName, mime, sizeBytes: input.bytes.length, sha256 };
}

/**
 * Rename a stored document (v1.42.0, issue 112): the household's own name for
 * the file, in place of `IMG_4821.jpg`.
 *
 * What changes is the stored **file name** — the name the chip shows, the name
 * the viewer's header shows and the name the download saves as. What does not
 * change is anything that decides where bytes live: the storage key, the bytes,
 * the sniffed MIME type, the size and the sha256 are all untouched, so backups,
 * restore, the orphan report and the serving route cannot notice a rename. The
 * extension rule is `withDocumentExtension`: a typed name that lacks the
 * document's own extension gets it, and one that carries a *different* document
 * extension has it replaced.
 *
 * The rename **is** audited (`attachment.rename`, against the owning record):
 * unlike the cosmetic v1.41.0 label, the file name is what the download name
 * and the archive's manifest lines show, so the trail should say when it
 * changed. Exactly one `stored` row is affected; renaming something already
 * removed writes nothing and reports `removed`, and an unknown id throws
 * `AttachmentNotFoundError`.
 */
export interface RenameAttachmentInput {
  db: Db;
  id: number;
  /** What the household typed. The document's extension is added when missing. */
  name: string;
  actor: string;
  now?: Date;
}

export type RenameAttachmentOutcome = 'renamed' | 'unchanged' | 'removed';

export interface RenameAttachmentResult {
  /** `renamed` wrote a new file name; `unchanged` had nothing to do; `removed` is a deleted row. */
  outcome: RenameAttachmentOutcome;
  /** The document's file name after this call. */
  originalName: string;
  /** True when the extension was added (or corrected) because it was missing or wrong. */
  extensionAdded: boolean;
}

export function renameAttachmentFile(input: RenameAttachmentInput): RenameAttachmentResult {
  const row = input.db.select().from(attachments).where(eq(attachments.id, input.id)).get();
  if (row === undefined) throw new AttachmentNotFoundError('That document no longer exists.');
  if (input.name.trim() === '') throw new AttachmentInputError('Give the document a name.');

  const { name, extensionAdded } = withDocumentExtension(input.name, row.mime);
  if (row.state !== 'stored') {
    return { outcome: 'removed', originalName: row.originalName, extensionAdded };
  }
  if (name === row.originalName) {
    return { outcome: 'unchanged', originalName: row.originalName, extensionAdded };
  }

  const now = input.now ?? new Date();
  const renamed = input.db.transaction((tx: DbTx) => {
    const updated = tx
      .update(attachments)
      .set({ originalName: name })
      .where(and(eq(attachments.id, row.id), eq(attachments.state, 'stored')))
      .returning({ id: attachments.id, originalName: attachments.originalName })
      .all();
    if (updated.length === 0) return null;
    const owner = ownerOfRow(row);
    recordAudit(tx, {
      actor: input.actor,
      action: 'attachment.rename',
      entity: owner.kind,
      entityId: owner.id,
      summary: `Renamed ${row.originalName} to ${name}`,
      before: { fileKey: row.fileKey, originalName: row.originalName },
      after: { fileKey: row.fileKey, originalName: name },
      now,
    });
    return updated[0]!;
  });

  if (renamed === null) {
    return { outcome: 'removed', originalName: row.originalName, extensionAdded };
  }
  return { outcome: 'renamed', originalName: renamed.originalName, extensionAdded };
}

export interface DeleteAttachmentInput {
  db: Db;
  id: number;
  actor: string;
  /** Resolved tenant `<dataDir>/households/<id>/documents`, never request input. */
  documentsDir: string;
  now?: Date;
}

export interface DeleteAttachmentResult {
  /** True when this call flipped a `stored` row to `deleted`. */
  deleted: boolean;
  /**
   * True when the file is gone (unlinked, or already absent). False only when
   * the row was marked deleted but the bytes could not be removed — an orphan,
   * which the backup report is designed to surface. Irrelevant when `deleted`
   * is false.
   */
  fileRemoved: boolean;
  originalName: string | null;
}

/**
 * Remove one receipt (SPEC §23.4). The client supplies an id, never a storage
 * key. The row is marked `deleted` and audited in one transaction; the file
 * is unlinked only after that commit. A second call is a no-op (the
 * `state = 'stored'` guard matches nothing, so there is no second audit entry
 * and no second unlink).
 *
 * An unlink failure does not roll the database back. The row is already
 * `deleted`, so later backups do not fail closed on a missing file; a leftover
 * file is an orphan, which is the designed report.
 */
export async function deleteAttachment(
  input: DeleteAttachmentInput,
): Promise<DeleteAttachmentResult> {
  const row = input.db.select().from(attachments).where(eq(attachments.id, input.id)).get();
  if (row === undefined) throw new AttachmentNotFoundError();

  const now = input.now ?? new Date();
  const flipped = input.db.transaction((tx: DbTx) => {
    const updated = tx
      .update(attachments)
      .set({ state: 'deleted' })
      .where(and(eq(attachments.id, row.id), eq(attachments.state, 'stored')))
      .returning({ id: attachments.id })
      .all();
    if (updated.length === 0) return false;
    const owner = ownerOfRow(row);
    recordAudit(tx, {
      actor: input.actor,
      action: 'attachment.delete',
      entity: owner.kind,
      entityId: owner.id,
      summary: `Removed ${row.originalName} (${attachmentSizeLabel(row.sizeBytes)}, ${row.mime})`,
      before: {
        fileKey: row.fileKey,
        originalName: row.originalName,
        mime: row.mime,
        sizeBytes: row.sizeBytes,
        sha256: row.sha256,
      },
      now,
    });
    return true;
  });

  if (!flipped) {
    return { deleted: false, fileRemoved: true, originalName: row.originalName };
  }
  return {
    deleted: true,
    fileRemoved: await unlinkStoredFile(input.documentsDir, row.fileKey),
    originalName: row.originalName,
  };
}

/**
 * Unlink a file this module minted. Anything that is not a safe storage key
 * is refused here — deletion must not grow a second path that accepts or
 * builds a key (SPEC §23.4). `ENOENT` is success: the file is already gone.
 */
async function unlinkStoredFile(documentsDir: string, fileKey: string): Promise<boolean> {
  if (!isSafeFileKey(fileKey)) {
    console.error(
      '[attachments] receipt row marked deleted but its storage key is not a safe file key; leaving the filesystem untouched',
    );
    return false;
  }
  try {
    await unlink(path.join(documentsDir, fileKey));
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return true;
    console.error(
      `[attachments] receipt ${fileKey} is deleted in the database but the file could not be removed (${code ?? 'unknown'}). It will show up in the orphan report.`,
    );
    return false;
  }
}

/** Stored attachments of one purchase, oldest first (the receipt order). */
export function listStoredAttachments(db: Db, purchaseId: number): StoredAttachment[] {
  return db
    .select({
      id: attachments.id,
      fileKey: attachments.fileKey,
      originalName: attachments.originalName,
      mime: attachments.mime,
      sizeBytes: attachments.sizeBytes,
      sha256: attachments.sha256,
    })
    .from(attachments)
    .where(and(eq(attachments.purchaseId, purchaseId), eq(attachments.state, 'stored')))
    .orderBy(asc(attachments.id))
    .all();
}

/**
 * Stored receipts of many purchases at once (issue #83), oldest first per
 * purchase — All Transactions lists up to five hundred rows and should not ask
 * five hundred times.
 */
export function listStoredPurchaseAttachments(
  db: Db,
  purchaseIds: readonly number[],
): Map<number, StoredAttachment[]> {
  const byPurchase = new Map<number, StoredAttachment[]>();
  if (purchaseIds.length === 0) return byPurchase;
  const rows = db
    .select({
      purchaseId: attachments.purchaseId,
      id: attachments.id,
      fileKey: attachments.fileKey,
      originalName: attachments.originalName,
      mime: attachments.mime,
      sizeBytes: attachments.sizeBytes,
      sha256: attachments.sha256,
    })
    .from(attachments)
    .where(and(inArray(attachments.purchaseId, [...purchaseIds]), eq(attachments.state, 'stored')))
    .orderBy(asc(attachments.id))
    .all();
  for (const { purchaseId, ...attachment } of rows) {
    if (purchaseId === null) continue;
    const list = byPurchase.get(purchaseId) ?? [];
    list.push(attachment);
    byPurchase.set(purchaseId, list);
  }
  return byPurchase;
}

/**
 * Stored documents of many income records at once, oldest first per record —
 * the Income page lists up to two hundred rows and should not ask two hundred
 * times.
 */
export function listStoredReceiptAttachments(
  db: Db,
  receiptIds: readonly number[],
): Map<number, StoredAttachment[]> {
  const byReceipt = new Map<number, StoredAttachment[]>();
  if (receiptIds.length === 0) return byReceipt;
  const rows = db
    .select({
      receiptId: attachments.receiptId,
      id: attachments.id,
      fileKey: attachments.fileKey,
      originalName: attachments.originalName,
      mime: attachments.mime,
      sizeBytes: attachments.sizeBytes,
      sha256: attachments.sha256,
    })
    .from(attachments)
    .where(and(inArray(attachments.receiptId, [...receiptIds]), eq(attachments.state, 'stored')))
    .orderBy(asc(attachments.id))
    .all();
  for (const { receiptId, ...attachment } of rows) {
    if (receiptId === null) continue;
    const list = byReceipt.get(receiptId) ?? [];
    list.push(attachment);
    byReceipt.set(receiptId, list);
  }
  return byReceipt;
}

/**
 * Stored documents of many suppliers at once (v0.25.0), oldest first per
 * supplier — the Suppliers page builds every card in one request.
 */
export function listStoredSupplierAttachments(
  db: Db,
  supplierIds: readonly number[],
): Map<number, StoredAttachment[]> {
  const bySupplier = new Map<number, StoredAttachment[]>();
  if (supplierIds.length === 0) return bySupplier;
  const rows = db
    .select({
      supplierId: attachments.supplierId,
      id: attachments.id,
      fileKey: attachments.fileKey,
      originalName: attachments.originalName,
      mime: attachments.mime,
      sizeBytes: attachments.sizeBytes,
      sha256: attachments.sha256,
    })
    .from(attachments)
    .where(and(inArray(attachments.supplierId, [...supplierIds]), eq(attachments.state, 'stored')))
    .orderBy(asc(attachments.id))
    .all();
  for (const { supplierId, ...attachment } of rows) {
    if (supplierId === null) continue;
    const list = bySupplier.get(supplierId) ?? [];
    list.push(attachment);
    bySupplier.set(supplierId, list);
  }
  return bySupplier;
}

function resolveOwner(input: {
  purchaseId?: number;
  receiptId?: number;
  supplierId?: number;
}): AttachmentOwner {
  const owners: AttachmentOwner[] = [
    ...(input.purchaseId !== undefined
      ? [{ kind: 'purchase' as const, id: input.purchaseId }]
      : []),
    ...(input.receiptId !== undefined ? [{ kind: 'receipt' as const, id: input.receiptId }] : []),
    ...(input.supplierId !== undefined
      ? [{ kind: 'supplier' as const, id: input.supplierId }]
      : []),
  ];
  if (owners.length !== 1) {
    throw new AttachmentInputError(
      'A document belongs to exactly one purchase, income record or supplier.',
    );
  }
  return owners[0] as AttachmentOwner;
}

function assertOwnerExists(db: Db, owner: AttachmentOwner): void {
  if (owner.kind === 'purchase') {
    const row = db
      .select({ id: purchases.id })
      .from(purchases)
      .where(eq(purchases.id, owner.id))
      .get();
    if (row === undefined) throw new AttachmentInputError('That purchase no longer exists.');
    return;
  }
  if (owner.kind === 'supplier') {
    const row = db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(eq(suppliers.id, owner.id))
      .get();
    if (row === undefined) throw new AttachmentInputError('That supplier no longer exists.');
    return;
  }
  const row = db.select({ id: receipts.id }).from(receipts).where(eq(receipts.id, owner.id)).get();
  if (row === undefined) throw new AttachmentInputError('That income record no longer exists.');
}

function ownerOfRow(row: {
  purchaseId: number | null;
  receiptId: number | null;
  supplierId: number | null;
}): AttachmentOwner {
  if (row.purchaseId !== null) return { kind: 'purchase', id: row.purchaseId };
  if (row.supplierId !== null) return { kind: 'supplier', id: row.supplierId };
  // The CHECK constraint guarantees exactly one of the three is set.
  return { kind: 'receipt', id: row.receiptId as number };
}

/** Read one stored attachment's bytes from the documents directory. */
export async function readAttachmentBytes(documentsDir: string, fileKey: string): Promise<Buffer> {
  if (!isSafeFileKey(fileKey)) throw new AttachmentInputError('Unsafe attachment key.');
  return readFile(path.join(documentsDir, fileKey));
}
