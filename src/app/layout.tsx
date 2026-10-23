import Link from 'next/link';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { PresenceHeartbeat } from '@/components/presence-heartbeat';
import { SiteNav } from '@/components/site-nav';
import { ScrollHashIntoView } from '@/components/scroll-hash';
import { SupportBanner } from '@/components/support-banner';
import { appSessionFromRequest } from '@/lib/auth/next';
import { isRegistryAdminSession } from '@/lib/auth/current-user';
import { loadAppConfig } from '@/lib/config';
import { currentTheme } from '@/lib/theme/next';
import { APP_NAME, APP_RELEASE_STAGE, APP_VERSION } from '@/lib/version';
import './globals.css';

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description:
    'Private household spending tracker for households with up to two assigned sign-in identities. Self-hosted; protected by Cloudflare Access.',
  robots: { index: false, follow: false },
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: APP_NAME },
  icons: { apple: '/apple-touch-icon.png' },
};

/**
 * The browser chrome follows the theme (decision 160).
 *
 * This is the one colour the app still states as a literal, and it cannot be
 * anything else: the browser paints its own strip — and the PWA splash —
 * before a stylesheet exists, so a custom property would resolve to nothing.
 * The value comes from the generated catalogue, which takes it from the same
 * derivation as the theme's tokens: a light theme hands over the till colour
 * (as it always has), a dark theme hands over its page. Installed-app manifest
 * colours stay pinned to the default theme, because the manifest is read once
 * at install time and belongs to no session — `tests/colour-tokens.test.ts`
 * holds those three literals together.
 */
export async function generateViewport(): Promise<Viewport> {
  const theme = await currentTheme();
  return { themeColor: theme.chrome };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = await currentTheme();
  // Admin menu visibility (issue #91): strictly the REGISTRY_ADMIN_EMAIL
  // identity. Computed here in the server layout; SiteNav stays a client
  // component and just receives the boolean.
  let showAdmin = false;
  let signedIn = false;
  try {
    const config = loadAppConfig();
    const session = await appSessionFromRequest();
    showAdmin = isRegistryAdminSession(session, config);
    // The heartbeat (issue 105) only runs for a household that is genuinely
    // in the app; a denied identity must never appear as "connected".
    signedIn = session.status === 'ok';
  } catch {
    // Any session/config failure hides the admin entry (fail closed).
    showAdmin = false;
    signedIn = false;
  }
  return (
    <html lang="en-GB" data-theme={theme.id}>
      <body className="sf-app-canvas min-h-screen bg-canvas text-ink antialiased">
        <SiteNav showAdmin={showAdmin} />
        {signedIn ? <PresenceHeartbeat /> : null}
        <SupportBanner />
        {/* Every page's `#hash` targets land below the measured header. */}
        <ScrollHashIntoView />
        {children}
        <footer className="mx-auto mt-12 max-w-3xl px-4 pb-8 text-center text-xs text-ink-faint">
          {APP_NAME} v{APP_VERSION} ({APP_RELEASE_STAGE}) · estimates and projections, never a bank
          balance ·{' '}
          <Link href="/start" className="sf-link">
            Getting started
          </Link>{' '}
          ·{' '}
          <Link href="/guide" className="sf-link">
            Guide
          </Link>{' '}
          ·{' '}
          <Link href="/example" className="sf-link">
            Worked example
          </Link>
        </footer>
      </body>
    </html>
  );
}
