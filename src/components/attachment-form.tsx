'use client';

import { useActionState, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { deleteAttachmentAction, uploadAttachmentAction } from '@/app/actions';
import { AttachmentViewer } from './attachment-viewer';
import { initialActionState } from '@/lib/action-state';

export interface AttachmentSummary {
  id: number;
  fileKey: string;
  originalName: string;
  mime: string;
  sizeBytes: number;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Wording for each kind of owner (decision 138): a purchase carries receipts
 * and invoices, an income record carries payslips and similar, and since
 * v0.25.0 a supplier carries letters, policy documents and terms (decision
 * 175).
 */
const OWNER_WORDS = {
  purchase: {
    field: 'purchaseId',
    fileLabel: 'Receipt or invoice file',
    attach: 'Attach receipt',
    noun: 'receipt',
  },
  receipt: {
    field: 'receiptId',
    fileLabel: 'Payslip or document file',
    attach: 'Attach payslip',
    noun: 'document',
  },
  supplier: {
    field: 'supplierId',
    fileLabel: 'Letter, policy or terms file',
    attach: 'Attach document',
    noun: 'document',
  },
} as const;

/**
 * Documents already attached to a record, plus the capture/upload control
 * (SPEC §23.1, §23.4). A purchase's receipts, since v0.10.0 an income
 * record's payslips (pass `receiptId`), and since v0.25.0 a supplier's
 * letters and policy documents (pass `supplierId`) — exactly one owner id.
 * Viewing, attaching and removing are authenticated; the attachment lifecycle
 * is independent of the record's save, so this form never blocks entry and a
 * document can be added or removed later.
 *
 * The chip is a container, not a link wrapping a button: a button inside an
 * anchor is invalid HTML and hydration-hostile. Removal is a two-click
 * confirm — irreversible for this installation; an older backup is the way back.
 */
export function AttachmentForm({
  purchaseId,
  receiptId,
  supplierId,
  attachments,
  allowUpload = true,
}: {
  purchaseId?: number;
  receiptId?: number;
  supplierId?: number;
  attachments: readonly AttachmentSummary[];
  /** False hides the upload control (a voided income record keeps its documents, gains none). */
  allowUpload?: boolean;
}) {
  const [viewing, setViewing] = useState<{
    attachment: AttachmentSummary;
    trigger: HTMLAnchorElement;
  } | null>(null);
  const [state, formAction, pending] = useActionState(uploadAttachmentAction, initialActionState);
  const fileRef = useRef<HTMLInputElement | null>(null);
  // False in the served HTML (so the no-JavaScript submit button is visible),
  // true from the first client render: with React on the page the upload is
  // started by the file choice itself (decision 204).
  const [jsReady, setJsReady] = useState(false);
  useEffect(() => setJsReady(true), []);
  // Choosing the file is the whole gesture now: the form submits itself. The
  // browser's own `required` check still runs, and a cancelled picker fires
  // nothing at all.
  const submitOnChoose = (event: ChangeEvent<HTMLInputElement>): void => {
    const form = event.currentTarget.form;
    if (form === null) return;
    form.requestSubmit();
  };
  // A file input keeps its value, and re-choosing the *same* file fires no
  // change event — so clear it once each upload has reported back.
  useEffect(() => {
    if (state.message === null || fileRef.current === null) return;
    fileRef.current.value = '';
  }, [state]);
  const kind =
    supplierId !== undefined ? 'supplier' : receiptId !== undefined ? 'receipt' : 'purchase';
  const words = OWNER_WORDS[kind];
  const ownerId = (supplierId ?? receiptId ?? purchaseId) as number;
  const inputId = `attachment-file-${kind}-${ownerId}`;
  return (
    <div className="mt-2 space-y-1 text-xs">
      {viewing ? (
        <AttachmentViewer
          attachment={viewing.attachment}
          trigger={viewing.trigger}
          onClose={() => setViewing(null)}
        />
      ) : null}
      {attachments.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <li key={attachment.id} className="flex flex-wrap items-center gap-1">
              <span className="inline-flex items-center gap-1 rounded-full bg-warning-50 px-2 py-0.5 font-medium text-warning">
                <a
                  href={`/api/attachments/${attachment.fileKey}`}
                  onClick={(event) => {
                    event.preventDefault();
                    setViewing({ attachment, trigger: event.currentTarget });
                  }}
                  className="inline-flex items-center gap-1 underline underline-offset-2"
                >
                  <span aria-hidden="true">📎</span>
                  <span className="max-w-[160px] truncate">{attachment.originalName}</span>
                  <span className="text-warning-600">{formatSize(attachment.sizeBytes)}</span>
                </a>
              </span>
              <RemoveReceiptControl
                attachmentId={attachment.id}
                originalName={attachment.originalName}
                noun={words.noun}
              />
            </li>
          ))}
        </ul>
      ) : null}
      {allowUpload ? (
        <form action={formAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name={words.field} value={ownerId} />
          <input
            id={inputId}
            ref={fileRef}
            name="file"
            type="file"
            accept="image/png,image/jpeg,application/pdf"
            // A till receipt is photographed on the spot, so purchases open the
            // camera. A payslip or a supplier's letter is as often a PDF from a
            // portal or an email as a sheet of paper, so those leave the phone's
            // own choice (files, photos or camera) alone.
            capture={kind === 'purchase' ? 'environment' : undefined}
            required
            onChange={submitOnChoose}
            // Visually hidden but very much present: the label below is the
            // button, and this is what the browser opens when it is tapped.
            className="peer sr-only"
          />
          <label
            htmlFor={inputId}
            className="cursor-pointer rounded bg-till-inset px-2 py-1 text-till-ink hover:bg-till-hover peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"
          >
            {pending ? 'Attaching…' : words.attach}
            {/*
              Keep the visible action in the accessible name (WCAG 2.5.3),
              together with the file-kind hint for assistive technology.
            */}
            <span className="sr-only"> ({words.fileLabel.toLowerCase()})</span>
          </label>
          {/*
            Decision 204: one control, not two. The label above is the button —
            it opens the picker — and choosing a file uploads it on the spot,
            so "Attach receipt" never sits there inviting a press before there
            is anything to attach. This second control is the no-JavaScript
            path only: it is in the served HTML, and the moment React is on the
            page it is hidden, because the upload has already started by then.
          */}
          <button
            type="submit"
            hidden={jsReady}
            className="rounded bg-till-inset px-2 py-1 text-till-ink"
          >
            {words.attach}
          </button>
          {state.message !== null ? (
            <span
              role="status"
              className={state.status === 'error' ? 'text-danger' : 'text-positive'}
            >
              {state.message}
            </span>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}

function RemoveReceiptControl({
  attachmentId,
  originalName,
  noun,
}: {
  attachmentId: number;
  originalName: string;
  noun: string;
}) {
  const [state, formAction, pending] = useActionState(deleteAttachmentAction, initialActionState);
  const [armed, setArmed] = useState(false);
  const removeName = `Remove ${noun} ${originalName}`;
  const confirmName = `Confirm remove ${noun} ${originalName}`;
  return (
    <form action={formAction} className="inline-flex flex-wrap items-center gap-1">
      <input type="hidden" name="attachmentId" value={attachmentId} />
      {armed ? (
        <>
          <button
            type="submit"
            disabled={pending}
            aria-label={confirmName}
            className="rounded border border-danger-300 bg-surface px-1.5 py-0.5 font-medium text-danger hover:bg-danger-50 disabled:opacity-60"
          >
            {pending ? 'Removing…' : 'Confirm'}
          </button>
          <button
            type="button"
            onClick={() => setArmed(false)}
            className="rounded px-1 py-0.5 text-ink-muted hover:text-ink-emphasis"
          >
            Cancel
          </button>
          <span className="text-ink-muted">
            Deletes the file from this installation. An older backup is the only way back.
          </span>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setArmed(true)}
          aria-label={removeName}
          className="rounded px-1 py-0.5 font-medium text-ink-muted hover:bg-surface-muted hover:text-danger-800"
        >
          Remove
        </button>
      )}
      {state.message !== null ? (
        <span role="status" className={state.status === 'error' ? 'text-danger' : 'text-positive'}>
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
