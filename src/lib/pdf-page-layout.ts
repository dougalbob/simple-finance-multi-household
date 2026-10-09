/**
 * Page geometry for the in-app PDF reader (SPEC §23.2, decision 192). Pure, so
 * the size a page is drawn at can be tested without a browser.
 *
 * A page fills the width the reader leaves for it. Its canvas is drawn at the
 * device's pixel ratio, capped at 2: a 3x phone gains little sharpness for
 * roughly twice the pixels, and memory is what runs out on a phone with a long
 * document.
 */
export const MAX_DEVICE_PIXEL_RATIO = 2;

/** A page's size in PDF points, as pdf.js reports it (rotation already applied). */
export type PdfPageSize = { widthPt: number; heightPt: number };

export type PdfPageLayout = {
  /** The page's drawn width and height, in CSS pixels. */
  cssWidth: number;
  cssHeight: number;
  /** pdf.js scale: PDF points to canvas pixels. */
  renderScale: number;
  /** The canvas bitmap's size, in device pixels. */
  canvasWidth: number;
  canvasHeight: number;
};

const NOTHING_TO_DRAW: PdfPageLayout = {
  cssWidth: 0,
  cssHeight: 0,
  renderScale: 0,
  canvasWidth: 0,
  canvasHeight: 0,
};

export function pdfPageLayout(
  page: PdfPageSize,
  cssWidth: number,
  devicePixelRatio: number,
): PdfPageLayout {
  // Not yet measured, or a page with no size: draw nothing rather than divide by zero.
  if (!(page.widthPt > 0) || !(page.heightPt > 0) || !(cssWidth > 0)) return NOTHING_TO_DRAW;
  const ratio = Math.min(Math.max(devicePixelRatio || 1, 1), MAX_DEVICE_PIXEL_RATIO);
  const cssHeight = (cssWidth * page.heightPt) / page.widthPt;
  return {
    cssWidth,
    cssHeight,
    renderScale: (cssWidth / page.widthPt) * ratio,
    canvasWidth: Math.round(cssWidth * ratio),
    canvasHeight: Math.round(cssHeight * ratio),
  };
}
