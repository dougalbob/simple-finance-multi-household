'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  PDFPageProxy,
  RenderTask,
} from 'pdfjs-dist/legacy/build/pdf.mjs';
import { type PdfPageSize, pdfPageLayout } from '@/lib/pdf-page-layout';

/**
 * pdf.js's worker. Next bundles this file as a static asset and gives its URL,
 * so one path serves `next dev` and `next start`. The legacy build of pdf.js
 * also runs on older phone browsers, which the modern build does not (SPEC
 * §23.2, decision 192).
 */
const PDF_WORKER_URL = new URL(
  '../../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs',
  import.meta.url,
);

/** Space around the pages, in CSS pixels. Matches the `p-2` and `gap-2` classes below. */
const GAP_PX = 8;

/**
 * A page is drawn while it is within this distance of the visible area. Once
 * it is further away its bitmap is released, so a long document cannot exhaust
 * a phone's memory.
 */
const DRAW_MARGIN = '150% 0px';

type LoadedPdf = { pdf: PDFDocumentProxy; sizes: PdfPageSize[] };

/**
 * A PDF in the attachment viewer (SPEC §23.2, decision 192). Each page is drawn
 * to a canvas, fitted to the viewer's width and scrolled vertically. The code
 * is the same on every device: nothing here checks which phone it runs on.
 * The reader is created on the page that opens it, so pdf.js is loaded only
 * when a PDF is actually opened.
 */
export function PdfPages({ file }: { file: File }) {
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [loaded, setLoaded] = useState<LoadedPdf | null>(null);
  const [failure, setFailure] = useState('');
  const fail = useCallback((cause: unknown) => setFailure(failureMessage(cause)), []);

  // The width the pages are drawn at follows the viewer: a rotation or a window resize.
  useEffect(() => {
    if (scroller === null) return;
    const measure = () => setWidth(Math.max(0, scroller.clientWidth - 2 * GAP_PX));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [scroller]);

  useEffect(() => {
    let cancelled = false;
    let task: PDFDocumentLoadingTask | undefined;
    (async () => {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL.href;
      const data = new Uint8Array(await file.arrayBuffer());
      if (cancelled) return;
      task = pdfjs.getDocument({ data });
      const pdf = await task.promise;
      const sizes: PdfPageSize[] = [];
      for (let number = 1; number <= pdf.numPages; number += 1) {
        const page = await pdf.getPage(number);
        const { width: widthPt, height: heightPt } = page.getViewport({ scale: 1 });
        sizes.push({ widthPt, heightPt });
        void page.cleanup();
      }
      if (!cancelled) setLoaded({ pdf, sizes });
    })().catch((cause: unknown) => {
      if (!cancelled) fail(cause);
    });
    return () => {
      // Destroying the loading task also destroys the document, once it is open.
      cancelled = true;
      void task?.destroy();
    };
  }, [file, fail]);

  const devicePixelRatio = typeof window === 'undefined' ? 1 : window.devicePixelRatio;
  return (
    <div
      ref={setScroller}
      tabIndex={0}
      role="region"
      aria-label="PDF pages"
      className="absolute inset-0 overflow-x-hidden overflow-y-auto bg-till-inset"
    >
      {failure ? (
        <p role="alert" className="p-3">
          {failure}
        </p>
      ) : null}
      {failure === '' && loaded === null ? (
        <p role="status" className="p-3">
          Opening PDF…
        </p>
      ) : null}
      {loaded !== null && width > 0 && scroller !== null ? (
        <div className="flex flex-col items-center gap-2 p-2">
          {loaded.sizes.map((size, index) => (
            <PdfPage
              key={index}
              pdf={loaded.pdf}
              pageNumber={index + 1}
              pageCount={loaded.sizes.length}
              size={size}
              cssWidth={width}
              devicePixelRatio={devicePixelRatio}
              root={scroller}
              onError={fail}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PdfPage({
  pdf,
  pageNumber,
  pageCount,
  size,
  cssWidth,
  devicePixelRatio,
  root,
  onError,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  pageCount: number;
  size: PdfPageSize;
  cssWidth: number;
  devicePixelRatio: number;
  root: HTMLElement;
  onError: (cause: unknown) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const bitmap = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);
  const layout = pdfPageLayout(size, cssWidth, devicePixelRatio);
  const { canvasWidth, canvasHeight, renderScale } = layout;

  useEffect(() => {
    const node = frame.current;
    if (node === null) return;
    const observer = new IntersectionObserver(
      (entries) => setNear(entries.some((entry) => entry.isIntersecting)),
      { root, rootMargin: DRAW_MARGIN },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [root]);

  useEffect(() => {
    const canvas = bitmap.current;
    if (canvas === null) return;
    if (!near || canvasWidth === 0) {
      // Off screen: give the bitmap back. The frame keeps its height, so the scroll position holds.
      canvas.width = 0;
      canvas.height = 0;
      return;
    }
    let cancelled = false;
    let task: RenderTask | undefined;
    (async () => {
      const page: PDFPageProxy = await pdf.getPage(pageNumber);
      const context = canvas.getContext('2d');
      if (cancelled || context === null) return;
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      task = page.render({
        canvas,
        canvasContext: context,
        viewport: page.getViewport({ scale: renderScale }),
      });
      await task.promise;
      void page.cleanup();
    })().catch((cause: unknown) => {
      // A render that was cancelled because the page moved away is not a failure.
      if (!cancelled) onError(cause);
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, pageNumber, near, canvasWidth, canvasHeight, renderScale, onError]);

  return (
    <div
      ref={frame}
      className="relative bg-surface shadow"
      style={{ width: layout.cssWidth, height: layout.cssHeight }}
    >
      <canvas
        ref={bitmap}
        role="img"
        aria-label={`Page ${pageNumber} of ${pageCount}`}
        className="block h-full w-full"
      />
    </div>
  );
}

function failureMessage(cause: unknown): string {
  const locked =
    typeof cause === 'object' && cause !== null && 'name' in cause
      ? cause.name === 'PasswordException'
      : false;
  return locked
    ? 'This PDF is password-protected, so it cannot be shown here. Use the buttons below to open it in a PDF app or download it.'
    : 'This PDF could not be shown here. Use the buttons below to open it in a PDF app or download it.';
}
