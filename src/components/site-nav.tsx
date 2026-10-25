'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { APP_NAME, APP_RELEASE_STAGE, APP_VERSION } from '@/lib/version';
import { Bell } from '@/components/bell';
import {
  ANCHOR_OFFSET_VARIABLE,
  STICKY_HEADER_ATTRIBUTE,
  anchorScrollMargin,
} from '@/lib/records/anchor-scroll';

const NAV_ITEMS = [
  { href: '/overview', label: 'Overview' },
  { href: '/purchases', label: 'Purchases' },
  { href: '/transactions', label: 'All Transactions' },
  { href: '/recurring', label: 'Recurring' },
  { href: '/horizon', label: 'Horizon' },
  // The multi-decade forecast (LONGTERM_FORECASTING.md). It sits beside
  // Horizon on the desktop bar — the two answer different spans of the same
  // question — and in the drawer's second group, because it is a sit-down
  // page rather than a daily tap.
  { href: '/longterm', label: 'Long-term forecast' },
  { href: '/income', label: 'Income' },
  { href: '/pots', label: 'Accounts, Pots & Checkpoints' },
  { href: '/borrowing', label: 'Borrowing' },
  { href: '/insights', label: 'Insights' },
  { href: '/charts', label: 'Charts' },
  { href: '/settings', label: 'Settings' },
  { href: '/suppliers', label: 'Suppliers' },
  { href: '/documents', label: 'Documents' },
  { href: '/contracts', label: 'Contracts & Renewals' },
  { href: '/tasks', label: 'Tasks' },
  { href: '/projects', label: 'Projects' },
  // The first-run path (docs/ONBOARDING_PLAN.md). Always reachable, never a
  // gate: the page itself says when everything is done.
  { href: '/start', label: 'Getting started' },
];

const NAV_GROUPS = [
  {
    title: 'Daily',
    items: [
      // Carries the hash so the tap lands on the till itself — even when the
      // drawer was opened from `/` already (decision 158).
      { href: '/#quick-entry', label: 'Quick Entry (Till)' },
      { href: '/purchases', label: 'Purchases' },
      { href: '/horizon', label: 'Horizon' },
      { href: '/charts', label: 'Charts' },
      { href: '/overview', label: 'Overview' },
      { href: '/recurring', label: 'Recurring' },
    ],
  },
  {
    title: 'More',
    items: [
      { href: '/transactions', label: 'All Transactions' },
      { href: '/longterm', label: 'Long-term forecast' },
      { href: '/income', label: 'Income' },
      { href: '/pots', label: 'Accounts, Pots & Checkpoints' },
      { href: '/borrowing', label: 'Borrowing' },
      { href: '/insights', label: 'Insights' },
      { href: '/settings', label: 'Settings' },
      { href: '/suppliers', label: 'Suppliers' },
      { href: '/documents', label: 'Documents' },
      { href: '/contracts', label: 'Contracts & Renewals' },
      { href: '/tasks', label: 'Tasks' },
      { href: '/projects', label: 'Projects' },
      { href: '/start', label: 'Getting started' },
    ],
  },
];

/**
 * The project wiki. It lives on GitHub rather than inside the app, so it is
 * an external link: it opens in a new tab and is not an App Router route
 * (the nav-routes guard only reads literal route entries).
 */
const WIKI_URL = 'https://github.com/dougalbob/simple-finance-multi-household/wiki';
const WIKI_LABEL = 'Wiki';

/** The GitHub mark (Octicons "mark-github", MIT). Uses currentColor. */
function GitHubIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function Bars3Icon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth="2"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5"
      />
    </svg>
  );
}

function XMarkIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth="2"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}

/**
 * Site navigation:
 * - Desktop (lg:): Full horizontal navigation bar with all items visible.
 * - Mobile (< lg): Compact single-row header (saving ~20% of screen height)
 *   with an independent slide-out drawer accessible via hamburger button
 *   and edge-swipe gesture (from extreme left edge < 30px to avoid till conflict).
 */
export function SiteNav({ showAdmin = false }: { showAdmin?: boolean }) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  const isActive = (href: string) => {
    // Compare the path only: a hash link ("/#quick-entry") is the home page.
    const path = href.split('#')[0] || '/';
    if (path === '/') return pathname === '/';
    return pathname === path || pathname.startsWith(`${path}/`);
  };

  // Publish the bar's real height as `--sf-anchor-offset`, so anchored links
  // land below it wherever the nav happens to wrap (re-opened issue #34). A
  // ResizeObserver rather than a window listener: the header's height follows
  // its own content, not only the viewport.
  useEffect(() => {
    const header = headerRef.current;
    if (header === null) return;
    const publish = () => {
      const height = Math.round(header.getBoundingClientRect().height);
      document.documentElement.style.setProperty(
        ANCHOR_OFFSET_VARIABLE,
        `${anchorScrollMargin(height)}px`,
      );
    };
    publish();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(publish);
    observer.observe(header);
    return () => {
      observer.disconnect();
    };
  }, []);

  // Close drawer on route changes
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Close drawer on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Close drawer if window is resized to desktop width
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handle edge-swipe to open drawer, and swipe left on drawer to close.
  // Note: startX <= 30px ensures we never conflict with the Quick Entry till swipe gestures.
  useEffect(() => {
    let startX = 0;
    let startY = 0;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch || e.touches.length !== 1) return;
      startX = touch.clientX;
      startY = touch.clientY;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const touch = e.changedTouches[0];
      if (!touch || e.changedTouches.length !== 1) return;
      const endX = touch.clientX;
      const endY = touch.clientY;
      const deltaX = endX - startX;
      const deltaY = endY - startY;

      // Only respond if the swipe is predominantly horizontal
      if (Math.abs(deltaX) < 40 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.5) {
        return;
      }

      // If closed: swipe right starting from left edge (< 30px) opens drawer
      if (!isOpen && startX <= 30 && deltaX > 45) {
        setIsOpen(true);
      }

      // If open: swipe left anywhere closes drawer
      if (isOpen && deltaX < -45) {
        setIsOpen(false);
      }
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isOpen]);

  return (
    <>
      <header
        ref={headerRef}
        // Anchored deep links (`#schedule-12`, `#purchase-3`) have to land
        // *below* this bar, and its height is not a constant: the desktop nav
        // wraps onto a second row between 1024px and 1199px, so it measures
        // 57px on a phone, 121px on a small laptop and 85px on a wide one
        // (re-opened GitHub issue #34). `site-nav` measures itself into
        // `--sf-anchor-offset`, and `sf-anchor` (globals.css) spends it as the
        // `scroll-margin-top` of every anchored target. The attribute is
        // `STICKY_HEADER_ATTRIBUTE` (tests/anchor-scroll.test.ts pins the pair).
        data-sticky-header=""
        className="sticky top-0 z-30 border-b border-border bg-surface/95 shadow-sm backdrop-blur"
      >
        {/* Desktop Navbar (lg and up) */}
        <div className="mx-auto hidden max-w-7xl items-center justify-between gap-x-4 px-4 py-2 lg:flex">
          <Link href="/" className="shrink-0 text-sm font-semibold tracking-tight text-ink">
            {APP_NAME}
            <span className="ml-2 rounded-full bg-surface-muted px-2 py-0.5 text-xs font-normal text-ink-muted">
              v{APP_VERSION} · {APP_RELEASE_STAGE}
            </span>
          </Link>
          <div className="flex items-center gap-x-2">
            <nav
              aria-label="Desktop navigation"
              className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm"
            >
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive(item.href) ? 'page' : undefined}
                  className={`rounded-md px-2.5 py-1.5 font-medium transition-colors ${
                    isActive(item.href)
                      ? 'bg-till text-till-ink'
                      : 'text-ink-soft hover:bg-surface-muted hover:text-ink'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
              <a
                href={WIKI_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium text-ink-soft transition-colors hover:bg-surface-muted hover:text-ink"
              >
                <GitHubIcon className="h-4 w-4" />
                {WIKI_LABEL}
              </a>
              {showAdmin ? (
                <Link
                  href="/admin"
                  aria-current={isActive('/admin') ? 'page' : undefined}
                  className={`rounded-md px-2.5 py-1.5 font-medium transition-colors ${
                    isActive('/admin')
                      ? 'bg-till text-till-ink'
                      : 'border border-border-strong bg-accent/10 text-accent hover:bg-accent/20'
                  }`}
                >
                  Admin
                </Link>
              ) : null}
            </nav>
            <Bell />
          </div>
        </div>

        {/* Mobile Header Bar (< lg) */}
        <div className="flex h-14 items-center justify-between px-4 lg:hidden">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={isOpen}
              aria-controls="mobile-nav-drawer"
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg text-ink-body hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
            >
              <Bars3Icon className="h-6 w-6" />
            </button>
            <Link href="/" className="text-sm font-semibold tracking-tight text-ink">
              {APP_NAME}
              <span className="ml-1.5 rounded-full bg-surface-muted px-1.5 py-0.5 text-[11px] font-normal text-ink-muted">
                v{APP_VERSION}
              </span>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <Bell />
          </div>
        </div>
      </header>

      {/* Mobile Drawer Backdrop */}
      {isOpen ? (
        <div
          className="fixed inset-0 z-40 bg-till/50 backdrop-blur-xs transition-opacity duration-300 lg:hidden"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      {/* Mobile Drawer Panel */}
      <div
        id="mobile-nav-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-surface shadow-2xl transition-transform duration-300 ease-in-out lg:hidden ${
          isOpen
            ? 'translate-x-0 pointer-events-auto'
            : '-translate-x-full pointer-events-none invisible'
        }`}
      >
        {/* Drawer Header */}
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <Link
            href="/"
            onClick={() => setIsOpen(false)}
            className="text-sm font-semibold tracking-tight text-ink"
          >
            {APP_NAME}
            <span className="ml-2 rounded-full bg-surface-muted px-2 py-0.5 text-xs font-normal text-ink-muted">
              v{APP_VERSION} · {APP_RELEASE_STAGE}
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Close navigation menu"
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Drawer Body */}
        <nav aria-label="Pages" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="px-3 text-xs font-semibold uppercase tracking-wider text-ink-faint">
                {group.title}
              </p>
              <ul className="mt-1.5 space-y-1">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setIsOpen(false)}
                      aria-current={isActive(item.href) ? 'page' : undefined}
                      className={`flex min-h-[44px] items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        isActive(item.href)
                          ? 'bg-till text-till-ink'
                          : 'text-ink-body hover:bg-surface-muted hover:text-ink'
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
                {group.title === 'More' ? (
                  <li>
                    <a
                      href={WIKI_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setIsOpen(false)}
                      className="flex min-h-[44px] items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-ink-body transition-colors hover:bg-surface-muted hover:text-ink"
                    >
                      <GitHubIcon className="h-4 w-4" />
                      {WIKI_LABEL}
                    </a>
                  </li>
                ) : null}
                {/* Admin is env-gated (issue #91): only the
                    REGISTRY_ADMIN_EMAIL identity ever sees this entry. */}
                {showAdmin && group.title === 'More' ? (
                  <li>
                    <Link
                      href="/admin"
                      onClick={() => setIsOpen(false)}
                      aria-current={isActive('/admin') ? 'page' : undefined}
                      className={`flex min-h-[44px] items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        isActive('/admin')
                          ? 'bg-till text-till-ink'
                          : 'border border-border-strong bg-accent/10 text-accent hover:bg-accent/20'
                      }`}
                    >
                      Admin
                    </Link>
                  </li>
                ) : null}
              </ul>
            </div>
          ))}
        </nav>

        {/* Drawer Footer hint */}
        <div className="border-t border-border-hairline px-4 py-3 text-xs text-ink-faint">
          Swipe left to close · tap outside to dismiss
        </div>
      </div>
    </>
  );
}
