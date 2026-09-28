'use client';

import { useEffect, useRef, useState } from 'react';
import type { AttachmentSummary } from './attachment-form';

/** Native modal: focus trap, Escape, focus return; no navigation out of the PWA. */
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
  return (
    <dialog
      ref={dialog}
      aria-label={`Document: ${attachment.originalName}`}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 m-auto h-[90dvh] max-h-[90dvh] w-[96vw] max-w-5xl rounded-lg bg-surface p-0 text-ink backdrop:bg-ink/70"
    >
      <div className="flex h-full flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-border p-3">
          <button type="button" onClick={onClose} className="rounded border px-3 py-2">
            Close
          </button>
          <span className="min-w-0 flex-1 break-words font-semibold">
            {attachment.originalName}
          </span>
          <span>{Math.ceil(attachment.sizeBytes / 1024)} KB</span>
          {url ? (
            <a href={url} download={attachment.originalName} className="rounded border px-3 py-2">
              Download
            </a>
          ) : null}
          {file &&
          typeof navigator.canShare === 'function' &&
          navigator.canShare({ files: [file] }) ? (
            <button
              type="button"
              className="rounded border px-3 py-2"
              onClick={async () => {
                try {
                  await navigator.share({ files: [file] });
                } catch (cause) {
                  if (!(cause instanceof Error && cause.name === 'AbortError'))
                    setError('Sharing unavailable. Use Download instead.');
                }
              }}
            >
              Share
            </button>
          ) : null}
        </header>
        {error ? (
          <p role="alert" className="p-3">
            {error}
          </p>
        ) : null}
        {!url && !error ? (
          <p role="status" className="p-3">
            Loading document…
          </p>
        ) : null}
        {url ? (
          <div className="min-h-0 flex-1 overflow-auto bg-till-inset p-2">
            {attachment.mime === 'application/pdf' ? (
              <>
                <p className="bg-surface p-2 text-sm">
                  If your browser cannot preview this PDF, use Download or Share.
                </p>
                <iframe
                  title={attachment.originalName}
                  src={url}
                  className="h-[90%] w-full border-0 bg-surface"
                />
              </>
            ) : (
              <img src={url} alt={attachment.originalName} className="mx-auto h-auto max-w-full" />
            )}
          </div>
        ) : null}
      </div>
    </dialog>
  );
}
