'use client';

import { useActionState, useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  deleteAttachmentAction,
  renameAttachmentAction,
  uploadAttachmentAction,
} from '@/app/actions';
import { AttachmentViewer } from './attachment-viewer';
import { initialActionState, type ActionState } from '@/lib/action-state';
import { formatAttachmentSize } from '@/lib/format';

export interface AttachmentSummary {
  id: number;
  fileKey: string;
  /**
   * The document's file name — what the chip, the viewer header and the
   * download use (v1.42.0). Rename edits this, so there is no second name to
   * fall out of step with it.
   */
  originalName: string;
  mime: string;
  sizeBytes: number;
}

/** The name a document is shown and downloaded by. */
export function attachmentDisplayName(attachment: { originalName: string }): string {
  return attachment.originalName;
}

/** A route reply in the action-state shape, or anything else. */
function isUploadState(value: unknown): value is ActionState {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { status?: unknown; message?: unknown };
  return (
    (candidate.status === 'ok' || candidate.status === 'error' || candidate.status === 'idle') &&
    (candidate.message === null || typeof candidate.message === 'string')
  );
}

/**
 * What to say when the reply was not the app's own.
 *
 * A 403 or a 413 that carries HTML did not come from `POST /api/attachments`:
 * that route always answers JSON. It came from something standing in front of
 * the app — most often a firewall scoring the multipart body, which is exactly
 * what happened to this household's four-page energy bill while a one-page
 * render passed (v1.44.1). Naming it saves an hour of guessing.
 */
function describeUploadFailure(status: number): string {
  if (status === 403) {
    return 'Something in front of the app refused that upload (403). The app never saw the file — check firewall or proxy rules for this document.';
  }
  if (status === 413) {
    return 'Attachments must be 10 MB or smaller.';
  }
  if (status === 401) {
    return 'Sign in again to attach documents.';
  }
  return `The upload failed (${status || 'no response'}). Nothing was attached — try again.`;
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
 * Viewing, attaching, renaming and removing are authenticated; the
 * attachment lifecycle is independent of the record's save, so this form
 * never blocks entry and a document can be added, renamed or removed later.
 *
 * The chip is a container, not a link wrapping a button: a button inside an
 * anchor is invalid HTML and hydration-hostile. Removal is a two-click
 * confirm — irreversible for this installation; an older backup is the way
 * back. Renaming is a one-field editor behind a **Rename** disclosure that
 * saves on submit (v1.42.0): the file name itself changes, so the chip, the
 * viewer and the download all follow, and no separate display label exists to
 * disagree with it.
 */
export function AttachmentForm({
  purchaseId,
  receiptId,
  supplierId,
  attachments,
  focusId = null,
  allowUpload = true,
}: {
  purchaseId?: number;
  receiptId?: number;
  supplierId?: number;
  attachments: readonly AttachmentSummary[];
  /**
   * An attachment id to land on (the Documents search links here with
   * `?attachment=<id>`): the chip is scrolled into view and briefly highlighted.
   * A id that is not on this page does nothing.
   */
  focusId?: number | null;
  /** False hides the upload control (a voided income record keeps its documents, gains none). */
  allowUpload?: boolean;
}) {
  const [viewing, setViewing] = useState<{
    attachment: AttachmentSummary;
    trigger: HTMLAnchorElement;
  } | null>(null);
  const router = useRouter();
  // The server action is the **no-JavaScript fallback** only (v1.44.1). With
  // React on the page the form posts the same fields to its own address,
  // `POST /api/attachments`, so a household can point a firewall exception at
  // one path instead of the page's own URL — which is also the URL the till
  // saves a purchase to.
  const [actionState, formAction, actionPending] = useActionState(
    uploadAttachmentAction,
    initialActionState,
  );
  const [routeState, setRouteState] = useState<ActionState | null>(null);
  const [uploading, setUploading] = useState(false);
  const state: ActionState = routeState ?? actionState;
  const pending = uploading || actionPending;
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const listRef = useRef<HTMLUListElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  // False in the served HTML (so the no-JavaScript submit button is visible),
  // true from the first client render: with React on the page the upload is
  // started by the file choice itself (decision 204).
  const [jsReady, setJsReady] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  // Choosing the file is the whole gesture now: the form submits itself. The
  // browser's own `required` check still runs, and a cancelled picker fires
  // nothing at all.
  const submitOnChoose = (event: ChangeEvent<HTMLInputElement>): void => {
    const form = event.currentTarget.form;
    if (form === null) return;
    form.requestSubmit();
  };
  /**
   * Post the chosen file to `/api/attachments`.
   *
   * A refusal from the app always arrives as JSON in the action-state shape, so
   * the sentence is shown exactly as the action would have shown it. Anything
   * else — an HTML block page from a firewall, a proxy or Cloudflare — is
   * named as such: an upload stopped *before* the app is a different problem
   * from an upload the app refused, and the household should not have to guess
   * which they are looking at.
   */
  const sendUpload = useCallback(
    async (form: HTMLFormElement): Promise<void> => {
      setUploading(true);
      setRouteState(null);
      try {
        const response = await fetch('/api/attachments', {
          method: 'POST',
          body: new FormData(form),
        });
        const payload: unknown = await response.json().catch(() => null);
        if (isUploadState(payload)) {
          setRouteState(payload);
        } else {
          setRouteState({ status: 'error', message: describeUploadFailure(response.status) });
        }
        if (response.ok) router.refresh();
      } catch {
        setRouteState({
          status: 'error',
          message: 'The upload could not be sent. Check the connection and try again.',
        });
      } finally {
        setUploading(false);
      }
    },
    [router],
  );
  /**
   * The switch between the two front doors, and it is a **native** listener on
   * purpose (v1.44.1).
   *
   * The form carries `action={formAction}` in the served HTML so a browser
   * without JavaScript still submits the server action — that page has to work
   * on its own. Once React is on the page the action is **removed** and the
   * listener below does the work: React 19 drives a form action from its own
   * root-level submit handling, so `preventDefault()` in a React handler does
   * not stop it. The browser suite caught exactly that — the first cut of this
   * release still posted `POST /purchases`, the one thing it exists to stop.
   * With no action attribute there is nothing for React to run, and the
   * capture-phase listener stops the event before any ancestor sees it (a form
   * with no action would otherwise navigate to the current URL).
   *
   * Registering the listener and flipping `jsReady` together keeps them in
   * step: the no-JavaScript button is shown, and the action attribute is
   * present, exactly while interception is off.
   */
  useEffect(() => {
    const form = formRef.current;
    if (form === null) return;
    const intercept = (event: Event): void => {
      event.preventDefault();
      event.stopPropagation();
      void sendUpload(form);
    };
    form.addEventListener('submit', intercept, { capture: true });
    setJsReady(true);
    return () => form.removeEventListener('submit', intercept, { capture: true });
  }, [sendUpload]);
  // A file input keeps its value, and re-choosing the *same* file fires no
  // change event — so clear it once each upload has reported back.
  useEffect(() => {
    if (state.message === null || fileRef.current === null) return;
    fileRef.current.value = '';
  }, [state]);
  // Land on a document the Documents search pointed at: scroll its chip into
  // view, ring it, and announce it. The id is only meaningful when this form
  // happens to render it, so a stale or foreign id is simply ignored.
  useEffect(() => {
    if (focusId === null || focusId === undefined) return;
    const node = listRef.current?.querySelector<HTMLElement>(`li[data-attachment-id="${focusId}"]`);
    if (node === null || node === undefined) return;
    node.scrollIntoView({ block: 'center' });
    setHighlightId(focusId);
    const target = attachments.find((attachment) => attachment.id === focusId);
    setAnnouncement(target ? `Showing ${attachmentDisplayName(target)}` : 'Showing document');
  }, [focusId, attachments]);
  const kind =
    supplierId !== undefined ? 'supplier' : receiptId !== undefined ? 'receipt' : 'purchase';
  const words = OWNER_WORDS[kind];
  const ownerId = (supplierId ?? receiptId ?? purchaseId) as number;
  const inputId = `attachment-file-${kind}-${ownerId}`;
  return (
    <div className="mt-2 space-y-1 text-xs">
      <span role="status" className="sr-only">
        {announcement}
      </span>
      {viewing ? (
        <AttachmentViewer
          attachment={viewing.attachment}
          trigger={viewing.trigger}
          onClose={() => setViewing(null)}
        />
      ) : null}
      {attachments.length > 0 ? (
        <ul ref={listRef} className="flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              data-attachment-id={attachment.id}
              className="flex flex-wrap items-center gap-1"
            >
              <span
                className={`inline-flex items-center gap-1 rounded-full bg-warning-50 px-2 py-0.5 font-medium text-warning${
                  attachment.id === highlightId
                    ? ' ring-2 ring-accent ring-offset-1 ring-offset-warning-50'
                    : ''
                }`}
              >
                <a
                  href={`/api/attachments/${attachment.fileKey}`}
                  onClick={(event) => {
                    event.preventDefault();
                    setViewing({ attachment, trigger: event.currentTarget });
                  }}
                  className="inline-flex items-center gap-1 underline underline-offset-2"
                >
                  <span aria-hidden="true">📎</span>
                  <span className="max-w-[160px] truncate">
                    {attachmentDisplayName(attachment)}
                  </span>
                  <span className="text-warning-600">
                    {formatAttachmentSize(attachment.sizeBytes)}
                  </span>
                </a>
              </span>
              <RenameAttachmentControl attachment={attachment} />
              <RemoveReceiptControl
                attachmentId={attachment.id}
                displayName={attachmentDisplayName(attachment)}
                noun={words.noun}
              />
            </li>
          ))}
        </ul>
      ) : null}
      {allowUpload ? (
        <form ref={formRef} action={formAction} className="flex flex-wrap items-center gap-2">
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

/**
 * Rename one document (v1.42.0, issue 112): a native disclosure holding the
 * document's current name in a text box, a Save button and a one-line hint.
 *
 * The button is named **Rename** and the box arrives pre-filled with the whole
 * name — `IMG_4821.jpg` — so the thing to edit is right there and no long
 * explanation has to sit on the chip: the hint inside the panel says the file's
 * extension is added if it is left off, and that is the only signposting a
 * phone's width has to carry. Saving renames the file everywhere it is shown
 * (the chip, the viewer, the download name and the Documents search); the
 * stored bytes and storage key are untouched. The name box is keyed on the
 * saved name, so after a save it shows exactly what the server stored
 * (`Vehicle MOT` becoming `Vehicle MOT.pdf`).
 */
function RenameAttachmentControl({ attachment }: { attachment: AttachmentSummary }) {
  const [state, formAction, pending] = useActionState(renameAttachmentAction, initialActionState);
  const inputId = `attachment-rename-${attachment.id}`;
  const hintId = `attachment-rename-hint-${attachment.id}`;
  return (
    <details className="min-w-0" data-attachment-rename={attachment.id}>
      <summary
        aria-label={`Rename ${attachmentDisplayName(attachment)}`}
        className="cursor-pointer rounded px-1 py-0.5 font-medium text-ink-muted hover:bg-surface-muted hover:text-ink-emphasis"
      >
        Rename
      </summary>
      <form action={formAction} className="mt-1 flex flex-wrap items-center gap-1">
        <input type="hidden" name="attachmentId" value={attachment.id} />
        <input
          key={attachment.originalName}
          id={inputId}
          type="text"
          name="name"
          defaultValue={attachment.originalName}
          maxLength={200}
          required
          aria-label={`New name for ${attachmentDisplayName(attachment)}`}
          aria-describedby={hintId}
          className="w-56 rounded border border-warning-300 bg-surface px-2 py-0.5 text-xs"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded border border-warning-300 bg-surface px-1.5 py-0.5 font-medium text-warning hover:bg-warning-50 disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        {state.message !== null ? (
          <span
            role="status"
            className={state.status === 'error' ? 'text-danger' : 'text-positive'}
          >
            {state.message}
          </span>
        ) : null}
        <span id={hintId} className="w-full text-[11px] text-ink-muted">
          The file&rsquo;s own extension is added if you leave it off.
        </span>
      </form>
    </details>
  );
}

function RemoveReceiptControl({
  attachmentId,
  displayName,
  noun,
}: {
  attachmentId: number;
  displayName: string;
  noun: string;
}) {
  const [state, formAction, pending] = useActionState(deleteAttachmentAction, initialActionState);
  const [armed, setArmed] = useState(false);
  const removeName = `Remove ${noun} ${displayName}`;
  const confirmName = `Confirm remove ${noun} ${displayName}`;
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
