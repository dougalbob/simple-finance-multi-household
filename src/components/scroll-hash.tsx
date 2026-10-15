'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import {
  ANCHOR_CORRECTION_STABLE_MS,
  STICKY_HEADER_ATTRIBUTE,
  anchorCorrectionDelta,
} from '@/lib/records/anchor-scroll';

/**
 * Bring the current `#hash` target into its scrollport after layout, and
 * verify the landing is not behind the sticky site header.
 *
 * **The landing offset is not primarily this component's job.** Every
 * anchored target in the app spends the measured `sf-anchor` offset
 * (globals.css, fed by `site-nav.tsx` and `records/anchor-scroll.ts`), so
 * the *browser's* fragment scroll and Next's route-transition scroll both
 * land the target below the sticky header — before any JavaScript of ours
 * runs, and at whatever height the nav has wrapped to. This component
 * covers the two cases that native landing cannot guarantee:
 *
 * 1. **A scrollport *inside* the page.** Decision 164: Recurring's laptop
 *    schedule list scrolls inside `overflow-y-auto`, so a deep link such as
 *    `#schedule-12` has to move the list as well as the page.
 *    `scrollIntoView({ block: 'nearest' })` does exactly that and nothing
 *    else — it is a no-op for a target already on screen, so it never
 *    fights the landing the browser just made.
 *
 * 2. **A browser that ignores `scroll-margin` (issue #43, decision 222).**
 *    v1.13.1 (decision 216) relied on every browser honouring the target's
 *    `scroll-margin-top` during `scrollIntoView()` and fragment scrolls.
 *    Chromium does — every sandbox and CI check passed — yet the household
 *    still found the schedule behind the menu in production: a browser
 *    that ignores the margin (older WebKit is the known case) lands the
 *    row at the very top of the viewport, and `block: 'nearest'` then
 *    treats it as already visible, because a sticky header is not a
 *    scrollport. So each settle sample also measures the target against
 *    the header (`anchorCorrectionDelta`): if it is behind the bar, the
 *    document is corrected by the missing distance — once.
 *
 * **Why this correction cannot move the page under the household.**
 * Decision 216 removed an earlier correction attempt because it fired at
 * fixed delays while a page was still growing, landing between a click's
 * hit-test and its dispatch. Three guards answer that failure, and
 * `tests/anchor-scroll.test.ts` pins all of them:
 *
 * - **Settled only.** A correction may fire only after the target has sat
 *   behind the header, unmoving, for `ANCHOR_CORRECTION_STABLE_MS`. While
 *   content above it is still rendering, its position keeps changing and
 *   the clock keeps restarting.
 * - **Once per navigation.** One correction per `pathname` + `#hash`; it
 *   never becomes a loop that follows the household around the page.
 * - **Disarmed by first touch.** The household's first pointer press,
 *   wheel, touch or key press disarms the pending correction: from then
 *   on the scroll position is theirs, not ours.
 *
 * In a browser that honours the margin the target is never behind the
 * bar, so the correction simply never fires and the landing is exactly
 * the one decision 216 shipped.
 */
const SETTLE_DELAYS_MS = [0, 150, 350];

interface CorrectionGuard {
  /** `pathname#hash` the guard belongs to; a new navigation resets it. */
  key: string;
  /** When the target was first seen behind the header at its current spot. */
  behindSince: number | null;
  lastTargetTop: number | null;
  lastScrollY: number | null;
  corrected: boolean;
  disarmed: boolean;
}

export function ScrollHashIntoView() {
  const pathname = usePathname();
  const guardRef = useRef<CorrectionGuard>({
    key: '',
    behindSince: null,
    lastTargetTop: null,
    lastScrollY: null,
    corrected: false,
    disarmed: false,
  });

  useEffect(() => {
    const guardFor = (key: string): CorrectionGuard => {
      const guard = guardRef.current;
      if (guard.key !== key) {
        guard.key = key;
        guard.behindSince = null;
        guard.lastTargetTop = null;
        guard.lastScrollY = null;
        guard.corrected = false;
        guard.disarmed = false;
      }
      return guard;
    };

    const correctIfSettledBehindHeader = (target: HTMLElement, key: string) => {
      const guard = guardFor(key);
      const header = document.querySelector(`[${STICKY_HEADER_ATTRIBUTE}]`);
      if (header === null) return;
      const targetTop = target.getBoundingClientRect().top;
      const headerBottom = header.getBoundingClientRect().bottom;
      const delta = anchorCorrectionDelta({ targetTop, headerBottom });
      const scrollY = window.scrollY;
      if (guard.corrected || guard.disarmed || delta === 0) {
        guard.lastTargetTop = targetTop;
        guard.lastScrollY = scrollY;
        if (delta === 0) guard.behindSince = null;
        return;
      }
      const settled =
        guard.lastTargetTop !== null &&
        Math.abs(guard.lastTargetTop - targetTop) <= 1 &&
        guard.lastScrollY !== null &&
        Math.abs(guard.lastScrollY - scrollY) <= 1;
      if (!settled || guard.behindSince === null) {
        guard.behindSince = performance.now();
        guard.lastTargetTop = targetTop;
        guard.lastScrollY = scrollY;
        return;
      }
      if (performance.now() - guard.behindSince < ANCHOR_CORRECTION_STABLE_MS) return;
      guard.corrected = true;
      window.scrollBy(0, delta);
    };

    const align = () => {
      const id = decodeURIComponent(window.location.hash.replace(/^#/, ''));
      if (id === '') return;
      const target = document.getElementById(id);
      if (target === null) return;
      target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      correctIfSettledBehindHeader(target, `${pathname}#${id}`);
    };

    // The household taking the page over disarms any pending correction:
    // a scroll that lands between their tap and its effect is the failure
    // decision 216 recorded, and it is never worth one corrected landing.
    const disarm = () => {
      const id = decodeURIComponent(window.location.hash.replace(/^#/, ''));
      guardFor(id === '' ? pathname : `${pathname}#${id}`).disarmed = true;
    };
    const disarmEvents = ['pointerdown', 'wheel', 'touchstart', 'keydown'] as const;
    for (const event of disarmEvents) {
      window.addEventListener(event, disarm, { passive: true });
    }

    align();
    const frame = window.requestAnimationFrame(align);
    const timers = SETTLE_DELAYS_MS.map((delay) => window.setTimeout(align, delay));
    // A cold load's own fragment scroll can land after hydration; a soft
    // navigation is a `pushState`, so it fires no `hashchange` and the effect
    // re-runs off the pathname instead.
    window.addEventListener('hashchange', align);
    window.addEventListener('load', align);
    return () => {
      window.cancelAnimationFrame(frame);
      for (const timer of timers) window.clearTimeout(timer);
      window.removeEventListener('hashchange', align);
      window.removeEventListener('load', align);
      for (const event of disarmEvents) {
        window.removeEventListener(event, disarm);
      }
    };
  }, [pathname]);
  return null;
}
