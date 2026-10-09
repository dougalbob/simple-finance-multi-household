import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MAX_DEVICE_PIXEL_RATIO, pdfPageLayout } from '../src/lib/pdf-page-layout';

/** Letter-size portrait page, in PDF points (SPEC §23.2, decision 192). */
const LETTER = { widthPt: 612, heightPt: 792 };

describe('pdfPageLayout', () => {
  it('fits a page to the width it is given and keeps its proportions', () => {
    const layout = pdfPageLayout(LETTER, 306, 1);
    assert.equal(layout.cssWidth, 306);
    assert.equal(layout.cssHeight, (306 * 792) / 612);
    assert.equal(layout.renderScale, 306 / 612);
    assert.equal(layout.canvasWidth, 306);
    assert.equal(layout.canvasHeight, 396);
  });

  it('draws the bitmap at the device pixel ratio so text stays sharp', () => {
    const layout = pdfPageLayout(LETTER, 306, 2);
    assert.equal(layout.cssWidth, 306, 'the CSS size does not change');
    assert.equal(layout.canvasWidth, 612);
    assert.equal(layout.canvasHeight, 792);
    assert.equal(layout.renderScale, (306 / 612) * 2);
  });

  it('caps the pixel ratio, so a 3x phone does not pay ninefold for the bitmap', () => {
    assert.equal(MAX_DEVICE_PIXEL_RATIO, 2);
    const capped = pdfPageLayout(LETTER, 306, 3);
    assert.equal(capped.canvasWidth, 306 * 2);
    assert.equal(capped.renderScale, (306 / 612) * 2);
  });

  it('treats a missing or fractional-low pixel ratio as one', () => {
    assert.equal(pdfPageLayout(LETTER, 306, 0).canvasWidth, 306);
    assert.equal(pdfPageLayout(LETTER, 306, Number.NaN).canvasWidth, 306);
    assert.equal(pdfPageLayout(LETTER, 306, 0.5).canvasWidth, 306);
  });

  it('keeps a landscape page within the width and gives it the shorter height', () => {
    const layout = pdfPageLayout({ widthPt: 792, heightPt: 612 }, 306, 1);
    assert.equal(layout.cssWidth, 306);
    assert.equal(layout.cssHeight, (306 * 612) / 792);
    assert.ok(layout.cssHeight < layout.cssWidth);
  });

  it('draws nothing before the width is measured or for a page without a size', () => {
    const empty = {
      cssWidth: 0,
      cssHeight: 0,
      renderScale: 0,
      canvasWidth: 0,
      canvasHeight: 0,
    };
    assert.deepEqual(pdfPageLayout(LETTER, 0, 2), empty);
    assert.deepEqual(pdfPageLayout(LETTER, -4, 2), empty);
    assert.deepEqual(pdfPageLayout({ widthPt: 0, heightPt: 792 }, 306, 2), empty);
    assert.deepEqual(pdfPageLayout({ widthPt: Number.NaN, heightPt: 792 }, 306, 2), empty);
  });
});
