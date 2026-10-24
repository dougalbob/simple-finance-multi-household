import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const repoFile = (relativePath: string) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

/**
 * Regression guard for the v1.41.0 incident: the site menu linked to
 * `/documents` but no `src/app/documents/page.tsx` existed, so the menu item
 * (desktop bar and the phone drawer) opened Next's 404 in production while CI
 * stayed green — no test followed a menu link. This guard reads every literal
 * `href` the navigation renders and requires a matching App Router page, so a
 * menu entry can never again point at a route the build does not emit.
 */
describe('site navigation routes', () => {
  const navSource = repoFile('src/components/site-nav.tsx');
  // NAV_ITEMS (desktop bar) and NAV_GROUPS (phone drawer) both declare their
  // destinations as `href: '/path'` literals; `/#quick-entry` is included.
  const hrefs = [...navSource.matchAll(/href:\s*'([^']+)'/g)].map((match) => match[1]!);

  it('renders at least the known set of destinations', () => {
    assert.ok(hrefs.length >= 19, `expected the full nav, got ${hrefs.length} hrefs`);
    assert.ok(hrefs.includes('/documents'), 'the Documents entry must stay in the nav');
  });

  it('links only to pages the App Router builds', () => {
    assert.ok(hrefs.length > 0, 'no nav hrefs found — the regex has drifted');
    for (const href of hrefs) {
      const route = href.split('#')[0]!.split('?')[0] || '/';
      const pagePath = route === '/' ? 'src/app/page.tsx' : `src/app${route}/page.tsx`;
      assert.ok(
        existsSync(new URL(`../${pagePath}`, import.meta.url)),
        `site-nav links to ${href} but ${pagePath} does not exist`,
      );
    }
  });

  it('keeps the Documents page wired to the search form and the household search', () => {
    // The route existing is not enough: v1.41.0 also shipped the form and the
    // search library with nothing importing them. Pin the wiring in one place.
    const page = repoFile('src/app/documents/page.tsx');
    assert.match(page, /import \{ DocumentSearchForm \} from/);
    assert.match(page, /searchAttachments\(user\.db, q\)/);
    assert.match(page, /householdContextFromRequest/);
    assert.match(page, /export const dynamic = 'force-dynamic'/);
  });

  it('does not let the runtime-data ignore rules exclude app pages', () => {
    // A bare `documents/` rule in .gitignore matched src/app/documents too, so
    // the page could exist on disk yet be silently skipped by `git add`.
    // Runtime document directories live under data/ and .e2e-data/; the rule
    // must stay root-anchored as `/documents/`.
    const gitignore = repoFile('.gitignore');
    assert.ok(
      !/^documents\/$/m.test(gitignore),
      '.gitignore ignores every documents/ directory, including src/app/documents',
    );
  });
});
