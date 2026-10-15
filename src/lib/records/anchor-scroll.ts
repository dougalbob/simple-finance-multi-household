/**
 * Coordinate rules for anchored deep links under the sticky site header
 * (re-opened GitHub issue #34).
 *
 * Why this module exists: the landing offset for an anchored element used to
 * be a fixed number baked into a Tailwind class — `scroll-mt-6` (24px) on a
 * Recurring schedule row, `scroll-mt-24` (96px) on the Purchases rows and
 * three-quarters of the app's other hash targets. The header is not a fixed
 * height, because the desktop nav wraps onto a second row at some widths.
 * Measured in a real browser (1400×950 and 1100×950, in
 * `e2e/recurring-hide-cancelled.spec.ts`): **57px** on a phone, **121px**
 * between 1024px and 1199px, **85px** from 1200px up. A constant cannot clear
 * all three: 24px puts a schedule row behind the menu, and even 96px still
 * does on a wrapped-nav laptop. Every hash target in the app therefore spends
 * `sf-anchor`, and `tests/anchor-scroll.test.ts` fails if a new one goes back
 * to a baked-in constant.
 *
 * So the header measures itself (`site-nav.tsx` publishes
 * {@link ANCHOR_OFFSET_VARIABLE}: its own height plus {@link ANCHOR_GAP_PX})
 * and the landing decision is made here, from the measured height rather than
 * a magic number. The offset is spent as `scroll-margin-top` by the
 * `sf-anchor` utility, so the browser's own fragment scroll — and Next's
 * route-transition scroll — land correctly with no JavaScript of ours
 * involved.
 *
 * **Issue #43 (decision 222): that honouring is not universal.** v1.13.1
 * passed every Chromium check, yet the household still found the schedule
 * behind the menu in production: a browser whose `scrollIntoView()` /
 * fragment scroll ignores the target's `scroll-margin-top` (older WebKit
 * is the known case) lands the row at the very top of the viewport, and
 * nothing in v1.13.1 ever moved it. So the scroll pass now verifies the
 * landing it can measure — target top against header bottom, the rule in
 * {@link anchorCorrectionDelta} — and, only when the target has sat
 * settled behind the bar, corrects the document once. The guards around
 * that correction are the ones decision 216's removed attempt lacked:
 * settled position, once per navigation, and disarmed by the household's
 * first scroll or tap, so the page is never moved under a pointer.
 *
 * Pure by design — no DOM, no database — so the rules are unit-tested
 * (`tests/anchor-scroll.test.ts`) rather than only observed in a browser.
 */

/** Breathing room between the sticky header's bottom edge and a landed element (px). */
export const ANCHOR_GAP_PX = 12;

/**
 * Height assumed before the nav has measured itself: the compact bar on a
 * phone. It is the *pre-measurement* guess for widths below 1024px, where the
 * nav never wraps; the taller {@link WRAPPED_HEADER_PX} guess covers the
 * widths where it can (globals.css). Both are only ever used for the moment
 * between a cold load's fragment scroll and the nav's first measurement.
 */
export const COMPACT_HEADER_PX = 56;

/** The attribute the site nav puts on the sticky header, so anchors can measure it. */
export const STICKY_HEADER_ATTRIBUTE = 'data-sticky-header';

/**
 * Custom property the site nav publishes on `<html>`: the measured landing
 * offset in px. `@utility sf-anchor` in `globals.css` reads it as the
 * `scroll-margin-top` of every anchored target, so the browser's own fragment
 * scroll (and Next's route-transition scroll) already clears the header.
 */
export const ANCHOR_OFFSET_VARIABLE = '--sf-anchor-offset';

/** Where an anchored element should sit, viewport-relative: just below the header. */
export function anchorLandingTop(options: { headerHeight: number; gap?: number }): number {
  return Math.max(0, options.headerHeight) + (options.gap ?? ANCHOR_GAP_PX);
}

/**
 * The smallest header height a landing offset must clear to be safe at *any*
 * measured width — the wrapped desktop nav. A stylesheet cannot know which
 * width it is about to be rendered at, so this is what the pre-hydration
 * fallback is built from, and what `tests/anchor-scroll.test.ts` asserts the
 * offset never falls below.
 */
export const WRAPPED_HEADER_PX = 121;

/** The `scroll-margin-top` the nav publishes — the measured header plus the gap, in px. */
export function anchorScrollMargin(headerHeight: number, gap = ANCHOR_GAP_PX): number {
  return anchorLandingTop({ headerHeight, gap });
}

/**
 * How long (ms) a hash target must sit unmoving behind the sticky header
 * before the scroll pass may correct the landing itself (issue #43). The
 * wait is what separates "the browser landed this wrong" from "this page
 * is still growing into place": while content above the target is still
 * rendering, the target keeps moving and no correction may fire.
 */
export const ANCHOR_CORRECTION_STABLE_MS = 100;

/**
 * The `window.scrollBy(0, delta)` that puts a landed hash target below the
 * sticky header, or 0 when it is already clear of it (issue #43).
 *
 * Coordinates are viewport-relative, as `getBoundingClientRect()` reports
 * them: the target is behind the bar exactly when its top is above the
 * header's bottom edge. A correcting delta is therefore always negative
 * (scroll up, content moves down) and lands the target where the
 * `sf-anchor` margin would have put it — the header's bottom plus the
 * gap. A target that merely sits closer than the gap, but clear of the
 * bar, is the household's to keep: no delta.
 */
export function anchorCorrectionDelta(options: {
  targetTop: number;
  headerBottom: number;
  gap?: number;
}): number {
  if (options.targetTop >= options.headerBottom) return 0;
  return options.targetTop - (options.headerBottom + (options.gap ?? ANCHOR_GAP_PX));
}
