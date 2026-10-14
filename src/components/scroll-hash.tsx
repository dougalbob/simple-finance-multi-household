'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Bring the current `#hash` target into its scrollport after layout.
 *
 * **The landing offset is not this component's job.** Every anchored target in
 * the app spends the measured `sf-anchor` offset (globals.css, fed by
 * `site-nav.tsx` and `records/anchor-scroll.ts`), so the *browser's* fragment
 * scroll and Next's route-transition scroll both land the target below the
 * sticky header — before any JavaScript of ours runs, and at whatever height
 * the nav has wrapped to. This component only covers the one case a fragment
 * scroll cannot: a scrollport *inside* the page.
 *
 * That is decision 164: Recurring's laptop schedule list scrolls inside
 * `overflow-y-auto`, so a deep link such as `#schedule-12` has to move the list
 * as well as the page. `scrollIntoView({ block: 'nearest' })` does exactly that
 * and nothing else — it is a no-op for a target already on screen, so it never
 * fights the landing the browser just made, and (because a landing honours
 * `scroll-margin`) it can never leave the target under the menu.
 *
 * **Why it does not correct the document itself.** An earlier revision of the
 * fix also nudged the page when a target ended up behind the header after the
 * fact. That nudge fired while the page was still growing — and v1.13.1's own
 * chart spec caught the consequence: a scroll landing between a click's
 * hit-test and its dispatch moves the page out from under the pointer, so the
 * click misses. A correct landing does not need re-aiming; a page that is still
 * settling is the household's to use, not ours to move.
 */
const SETTLE_DELAYS_MS = [0, 150, 350];

export function ScrollHashIntoView() {
  const pathname = usePathname();

  useEffect(() => {
    const align = () => {
      const id = decodeURIComponent(window.location.hash.replace(/^#/, ''));
      if (id === '') return;
      const target = document.getElementById(id);
      if (target === null) return;
      target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };

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
    };
  }, [pathname]);
  return null;
}
