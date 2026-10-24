'use client';

import { useEffect, useRef, useState } from 'react';
import { attachmentDisplayName, type AttachmentSummary } from './attachment-form';
import { PdfPages } from './pdf-pages';

/**
 * Native modal: focus trap, Escape, focus return; no navigation out of the PWA.
 *
 * Layout (SPEC §23.2, decisions 191–192): full screen on a phone, a centred panel
 * from 640px up. The header holds Close, the file name (wrapping, not cut
 * short) and the size. A PDF is drawn page by page by pdf.js (decision 192), the
 * same on every device. The footer always holds the actions, within reach on a
 * phone: "Open in PDF app" hands the file to the system share sheet, where the
 * browser offers one, and Download works everywhere.
 */
const ACTION = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded border px-4 py-2';

export function AttachmentViewer({
  attachment,
  onClose,
  trigger,
}: {
  attachment: AttachmentSummary;
  onClose: () => void;
  trigger: HTMLElement;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const node = dialog.current!;
    const previousOverflow = document.body.style.overflow;
    node.showModal();
    document.body.style.overflow = 'hidden';
    const controller = new AbortController();
    let objectUrl: string | undefined;
    async function load() {
      try {
        const response = await fetch(`/api/attachments/${attachment.fileKey}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Document unavailable. Please close and try again.');
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
        setFile(new File([blob], attachment.originalName, { type: attachment.mime }));
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'Unable to load document.');
      }
    }
    void load();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      node.close();
      document.body.style.overflow = previousOverflow;
      trigger.focus({ preventScroll: true });
    };
  }, [attachment, trigger]);

  const isPdf = attachment.mime === 'application/pdf';
  // Read at render, after the file has loaded. Not every browser offers file sharing.
  const canShareFile =
    file !== null &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] });

  async function shareFile() {
    if (file === null) return;
    // Called straight from the tap, so the browser still counts it as a user gesture.
    try {
      await navigator.share({ files: [file] });
    } catch (cause) {
      if (!(cause instanceof Error && cause.name === 'AbortError'))
        setError('Sharing unavailable. Use Download instead.');
    }
  }

  return (
    <dialog
      ref={dialog}
      aria-label={`Document: ${attachmentDisplayName(attachment)}`}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 m-0 h-auto max-h-none w-auto max-w-none bg-surface p-0 text-ink backdrop:bg-ink/70 sm:m-auto sm:h-[90dvh] sm:max-h-[90dvh] sm:w-[96vw] sm:max-w-5xl sm:rounded-lg"
    >
      <div className="flex h-full flex-col">
        <header className="flex items-center gap-3 border-b border-border p-3">
          <button type="button" onClick={onClose} className={ACTION}>
            Close
          </button>
          <div className="min-w-0 flex-1">
            <span className="block break-words font-semibold">
              {attachmentDisplayName(attachment)}
            </span>
            {attachment.label !== null ? (
              <span className="block text-xs text-ink-muted">File: {attachment.originalName}</span>
            ) : null}
          </div>
          <span className="shrink-0 text-sm text-ink-muted">
            {Math.ceil(attachment.sizeBytes / 1024)} KB
          </span>
        </header>
        {error ? (
          <p role="alert" className="border-b border-border p-3">
            {error}
          </p>
        ) : null}
        {!url && !error ? (
          <p role="status" className="p-3">
            Loading document…
          </p>
        ) : null}
        {url ? (
          isPdf && file !== null ? (
            <div className="relative min-h-0 flex-1 bg-till-inset">
              <PdfPages file={file} />
            </div>
          ) : (
            <div className="relative min-h-0 flex-1 overflow-auto bg-till-inset">
              <img
                src={url}
                alt={attachment.originalName}
                className="mx-auto h-auto max-w-full p-2"
              />
            </div>
          )
        ) : null}
        {url ? (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {canShareFile ? (
              <button type="button" className={ACTION} onClick={shareFile}>
                {isPdf ? 'Open in PDF app' : 'Share'}
              </button>
            ) : null}
            <a href={url} download={attachment.originalName} className={ACTION}>
              Download
            </a>
          </footer>
        ) : null}
      </div>
    </dialog>
  );
}
