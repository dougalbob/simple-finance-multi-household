import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  ANCHOR_CORRECTION_STABLE_MS,
  ANCHOR_GAP_PX,
  ANCHOR_OFFSET_VARIABLE,
  COMPACT_HEADER_PX,
  STICKY_HEADER_ATTRIBUTE,
  WRAPPED_HEADER_PX,
  anchorCorrectionDelta,
  anchorLandingTop,
  anchorScrollMargin,
} from '../src/lib/records/anchor-scroll';

const repoFile = (relativePath: string) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

/**
 * The measured site header heights, from a real browser at 1400×950 and
 * 1100×950 (`e2e/recurring-hide-cancelled.spec.ts`): the desktop nav does not
 * fit on one row between 1024px and 1199px.
 */
const PHONE_HEADER = 57;
const WRAPPED_NAV_HEADER = 121;
const WIDE_HEADER = 85;

describe('anchored deep links clear the sticky header (re-opened issue #34)', () => {
  it('lands an anchored element just below the header, with a gap', () => {
    assert.equal(anchorLandingTop({ headerHeight: WIDE_HEADER }), 97);
    assert.equal(anchorLandingTop({ headerHeight: WRAPPED_NAV_HEADER }), 133);
    assert.equal(anchorLandingTop({ headerHeight: PHONE_HEADER }), 69);
    assert.equal(anchorLandingTop({ headerHeight: WIDE_HEADER, gap: 0 }), WIDE_HEADER);
    // A page with no sticky header at all still gets the gap, never NaN.
    assert.equal(anchorLandingTop({ headerHeight: 0 }), ANCHOR_GAP_PX);
    assert.equal(anchorLandingTop({ headerHeight: -20 }), ANCHOR_GAP_PX);
  });

  it('clears the header at every measured width', () => {
    // The production report: a schedule row landed 24px down the page, 61px of
    // it behind the 85px header. The offset must always be at least the header.
    for (const headerHeight of [PHONE_HEADER, WIDE_HEADER, WRAPPED_NAV_HEADER]) {
      const landing = anchorLandingTop({ headerHeight });
      assert.ok(
        landing >= headerHeight,
        `a ${headerHeight}px header needs a landing of at least ${headerHeight}px, got ${landing}`,
      );
      assert.equal(anchorScrollMargin(headerHeight), landing);
    }
    // The old constants could not: 24px is under every bar, and 96px is under
    // the wrapped-nav one.
    assert.ok(24 < PHONE_HEADER);
    assert.ok(96 < WRAPPED_NAV_HEADER);
    assert.equal(anchorScrollMargin(-5), ANCHOR_GAP_PX);
  });

  it('corrects only a landing that actually ends behind the header (issue #43)', () => {
    // The production landing that v1.13.1 could not rescue: the browser
    // ignored the scroll margin and parked the row at the very top of the
    // viewport (top 0), behind whichever bar that width carries. The
    // correction is exactly the missing distance, landing the row where
    // the margin would have put it — header bottom plus the gap.
    for (const headerBottom of [PHONE_HEADER, WIDE_HEADER, WRAPPED_NAV_HEADER]) {
      const delta = anchorCorrectionDelta({ targetTop: 0, headerBottom });
      assert.equal(delta, -(headerBottom + ANCHOR_GAP_PX));
      assert.equal(0 + -delta, headerBottom + ANCHOR_GAP_PX, 'the row lands below the bar');
    }
    // Partly behind the bar: only the hidden part plus the gap is missing.
    assert.equal(anchorCorrectionDelta({ targetTop: 40, headerBottom: WIDE_HEADER }), -57);
    assert.equal(anchorCorrectionDelta({ targetTop: 40, headerBottom: WIDE_HEADER, gap: 0 }), -45);
    // Clear of the bar — even by less than the gap — is the household's
    // landing to keep: no correction, however close it sits.
    assert.equal(anchorCorrectionDelta({ targetTop: WIDE_HEADER, headerBottom: WIDE_HEADER }), 0);
    assert.equal(anchorCorrectionDelta({ targetTop: 300, headerBottom: WIDE_HEADER }), 0);
    // The settled wait must exist and be short enough to rescue a landing
    // within the settle samples the component takes (0/150/350ms).
    assert.ok(ANCHOR_CORRECTION_STABLE_MS > 0);
    assert.ok(ANCHOR_CORRECTION_STABLE_MS <= 150);
  });

  it('publishes the same offset the stylesheet spends as `sf-anchor`', () => {
    const css = repoFile('src/app/globals.css');
    assert.ok(css.includes('@utility sf-anchor {'), 'globals.css defines the sf-anchor utility');
    assert.ok(css.includes(ANCHOR_OFFSET_VARIABLE), 'sf-anchor reads the measured offset');
    assert.ok(
      css.includes(WRAPPED_HEADER_PX.toString()),
      'the laptop fallback names the wrapped header height',
    );
    // Two pre-hydration guesses, both built from the same numbers as this
    // module: the compact bar plus the gap on a phone, and the tallest bar the
    // nav has measured (a wrapped desktop nav) plus the gap on a laptop —
    // where the nav can wrap and nothing has measured it yet.
    const fallbacks = [
      ...css.matchAll(/var\(\s*--sf-anchor-offset,\s*calc\((\d+)px \+ (\d+)px\)\s*\)/g),
    ];
    assert.equal(fallbacks.length, 2, 'a phone guess and a laptop guess');
    const guesses = fallbacks.map(([, header, gap]) => [Number(header), Number(gap)]);
    assert.deepEqual(guesses, [
      [COMPACT_HEADER_PX, ANCHOR_GAP_PX],
      [WRAPPED_HEADER_PX, ANCHOR_GAP_PX],
    ]);
    assert.match(css, /@media \(min-width: 1024px\) \{[\s\S]*?scroll-margin-top/);
    // Each guess has to clear the bar it will meet: the phone one is spent
    // below 1024px, where the bar is a fixed compact height, and the laptop one
    // from 1024px, where the nav may already have wrapped and nothing has
    // measured it. A cold load lands a target behind the menu otherwise.
    const landings = guesses.map(([header, gap]) => (header ?? 0) + (gap ?? 0));
    const [phoneLanding, laptopLanding] = landings;
    // The compact bar renders at 56px plus its border, so the falling-back
    // phone landing has to clear the *measured* 57px, not just the constant.
    assert.ok((phoneLanding ?? 0) >= PHONE_HEADER, 'a phone fallback that cannot clear its bar');
    assert.ok(
      (laptopLanding ?? 0) >= WRAPPED_NAV_HEADER,
      'a laptop fallback that cannot clear a wrapped nav',
    );
  });

  it('keeps the nav and the measuring attribute wired together', () => {
    // The attribute the scroll pass queries must be the one the nav sets.
    const nav = repoFile('src/components/site-nav.tsx');
    assert.ok(
      nav.includes(` ${STICKY_HEADER_ATTRIBUTE}=""`),
      'the site nav marks its sticky header for measurement',
    );
    assert.ok(nav.includes('anchorScrollMargin'), 'the nav publishes the shared landing rule');
    assert.ok(
      nav.includes(ANCHOR_OFFSET_VARIABLE),
      'the published custom property is the one sf-anchor reads',
    );

    // The scroll pass owns the nested scrollport first: it nudges the
    // target within an inner scrollport and nothing else (decision 216).
    const scroller = repoFile('src/components/scroll-hash.tsx');
    assert.ok(scroller.includes("block: 'nearest'"), 'the pass nudges within a scrollport');
    // Issue #43 (decision 222) adds exactly one guarded document
    // correction for a browser that ignored the scroll margin — decision
    // 216's unguarded version moved the page under a click, so the guards
    // are the contract: measured against the real header, settled before
    // it may fire, once per navigation, and disarmed by first touch.
    assert.ok(
      scroller.includes('anchorCorrectionDelta'),
      'the correction is the measured header rule, not a constant',
    );
    assert.ok(
      scroller.includes(`[${'STICKY_HEADER_ATTRIBUTE'}]`) ||
        scroller.includes('STICKY_HEADER_ATTRIBUTE'),
      'the correction measures the header the nav marks',
    );
    assert.ok(
      scroller.includes('ANCHOR_CORRECTION_STABLE_MS'),
      'the correction waits for a settled position',
    );
    assert.ok(scroller.includes('guard.corrected = true'), 'the correction fires once');
    assert.ok(scroller.includes('window.scrollBy(0, delta)'), 'one measured correction');
    assert.equal(
      (scroller.match(/window\.scrollBy/g) ?? []).length,
      1,
      'no other document re-aiming',
    );
    assert.doesNotMatch(scroller, /window\.scrollTo/, 'no absolute re-aiming');
    for (const event of ['pointerdown', 'wheel', 'touchstart', 'keydown']) {
      assert.ok(
        scroller.includes(`'${event}'`),
        `the household's first ${event} disarms the correction`,
      );
    }
    // One instance, in the root layout, so every page's hash target is aligned
    // — and re-armed, since a soft navigation does not remount the layout.
    assert.ok(repoFile('src/app/layout.tsx').includes('<ScrollHashIntoView />'));
    assert.match(scroller, /usePathname\(\)/);
    assert.doesNotMatch(
      repoFile('src/components/recurring-schedule-list.tsx'),
      /ScrollHashIntoView/,
    );
  });

  it('leaves no anchored target on a baked-in offset', () => {
    // A fixed `scroll-mt-*` is what re-opened issue #34, and a target that
    // keeps one keeps the bug at some width. Comments may name the old
    // classes; code may not carry them.
    const sources = readdirSync(new URL('../src', import.meta.url), {
      recursive: true,
      withFileTypes: true,
    })
      .filter((entry) => entry.isFile() && /\.(tsx|ts|css)$/.test(entry.name))
      .map((entry) => `${entry.parentPath}/${entry.name}`);
    assert.ok(sources.length > 50, 'the scan must actually see the app');
    const offenders: string[] = [];
    for (const file of sources) {
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        if (!line.includes('scroll-mt-')) continue;
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
          continue;
        }
        offenders.push(`${file.replace(/.*\/src\//, 'src/')}: ${trimmed}`);
      }
    }
    assert.deepEqual(offenders, [], 'anchored targets must spend the measured offset');
  });
});
