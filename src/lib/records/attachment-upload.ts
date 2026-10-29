import {
  AttachmentInputError,
  storeAttachment,
  type AttachmentOwner,
  type StoredAttachment,
  type StoreAttachmentInput,
} from './attachments';

/**
 * One upload, two front doors (v1.44.1).
 *
 * The attach control posts **multipart to `/api/attachments`**, not to the page
 * it sits on. `POST /purchases` is not an address any firewall can exempt: it
 * is the same path the till saves a purchase to, so a rule that skips body
 * inspection there skips it for every purchase save as well. A document upload
 * needs an address of its own for a household to be able to say "this path
 * only" to Cloudflare.
 *
 * The no-JavaScript path is the fallback: with React off the page, the form
 * still submits its server action (`uploadAttachmentAction`), so the route and
 * the action must accept exactly the same form and refuse it for exactly the
 * same reasons. That is what this module is for — both call it, and neither can
 * drift from the pipeline that sniffs the bytes, enforces the limit and writes
 * the audit entry.
 */

/** The form posts ids as strings; anything but a positive integer is nothing. */
function positiveNumber(value: FormDataEntryValue | null): number | null {
  if (typeof value !== 'string') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Exactly one owner. The form posts one id and the others are absent, so a
 * request carrying two is not the app's own and is refused rather than guessed
 * at — attaching a receipt to two records is not something to be helpful about.
 */
export function attachmentOwnerFromForm(form: FormData): AttachmentOwner {
  const owners: AttachmentOwner[] = [];
  const purchaseId = positiveNumber(form.get('purchaseId'));
  if (purchaseId !== null) owners.push({ kind: 'purchase', id: purchaseId });
  const receiptId = positiveNumber(form.get('receiptId'));
  if (receiptId !== null) owners.push({ kind: 'receipt', id: receiptId });
  const supplierId = positiveNumber(form.get('supplierId'));
  if (supplierId !== null) owners.push({ kind: 'supplier', id: supplierId });
  const owner = owners[0];
  if (owners.length !== 1 || owner === undefined) {
    throw new AttachmentInputError('Choose a record to attach the document to.');
  }
  return owner;
}

function ownerFields(
  owner: AttachmentOwner,
): Pick<StoreAttachmentInput, 'purchaseId' | 'receiptId' | 'supplierId'> {
  if (owner.kind === 'purchase') return { purchaseId: owner.id };
  if (owner.kind === 'receipt') return { receiptId: owner.id };
  return { supplierId: owner.id };
}

export function attachmentFileFromForm(form: FormData): File {
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    throw new AttachmentInputError('Choose a file to attach.');
  }
  return file;
}

/**
 * The whole upload: read the owner and the file out of the form, hand both to
 * the shared pipeline. Domain refusals are `AttachmentInputError` and carry the
 * sentence the household should read; anything else is a real fault and is
 * left to the caller to log and report as such.
 */
export async function uploadAttachmentFromForm(input: {
  form: FormData;
  db: StoreAttachmentInput['db'];
  actor: string;
  documentsDir: string;
}): Promise<StoredAttachment> {
  const owner = attachmentOwnerFromForm(input.form);
  const file = attachmentFileFromForm(input.form);
  const bytes = Buffer.from(await file.arrayBuffer());
  return storeAttachment({
    db: input.db,
    ...ownerFields(owner),
    originalName: file.name,
    bytes,
    actor: input.actor,
    documentsDir: input.documentsDir,
  });
}
