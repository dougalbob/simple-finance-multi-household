'use client';

import { useEffect } from 'react';

/**
 * Presence heartbeat (GitHub issue 105).
 *
 * The application has no server-side session, so "who is connected" is
 * inferred from activity. A server render is already evidence (every page
 * passes through `appSessionFromRequest`), but a tab left open on one page
 * produces no requests at all — it would look exactly like a closed tab. This
 * beats only when someone has actually touched the page since the last beat,
 * so:
 *
 *  - a person reading and clicking stays **active**;
 *  - a tab nobody is using stops beating and falls to **idle** after two
 *    minutes, then **ended** after fifteen;
 *  - a browser that suspends a background tab (every phone) simply stops
 *    beating — the card says "last seen", never a false "still connected".
 *
 * The tab key lives in `sessionStorage`, so it is per tab and dies with it. It
 * is not a credential: the identity comes from the verified request, and the
 * key only selects which visit to extend.
 */

const BEAT_INTERVAL_MS = 60 * 1000;
const STORAGE_KEY = 'sf:presence-tab';

function tabKey(): string | null {
  try {
    const existing = window.sessionStorage.getItem(STORAGE_KEY);
    if (existing !== null) return existing;
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    const key = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    window.sessionStorage.setItem(STORAGE_KEY, key);
    return key;
  } catch {
    // Storage blocked (private modes, hardened browsers): the server files the
    // visit against the identity's open visit instead.
    return null;
  }
}

function beat(sessionKey: string | null): void {
  void fetch('/api/presence', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionKey }),
    cache: 'no-store',
    keepalive: true,
  }).catch(() => {
    // Offline or signed out: the next page request records presence again.
  });
}

export function PresenceHeartbeat() {
  useEffect(() => {
    let untouched = false;

    const markTouched = (): void => {
      untouched = true;
    };

    const send = (): void => {
      if (!untouched) return;
      untouched = false;
      beat(tabKey());
    };

    const onVisibility = (): void => {
      if (document.visibilityState !== 'visible') return;
      untouched = true;
      send();
    };

    // Arriving on a page is activity.
    untouched = true;
    send();

    window.addEventListener('pointerdown', markTouched, { passive: true });
    window.addEventListener('keydown', markTouched);
    window.addEventListener('wheel', markTouched, { passive: true });
    window.addEventListener('scroll', markTouched, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);

    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') send();
    }, BEAT_INTERVAL_MS);

    return () => {
      window.clearInterval(id);
      window.removeEventListener('pointerdown', markTouched);
      window.removeEventListener('keydown', markTouched);
      window.removeEventListener('wheel', markTouched);
      window.removeEventListener('scroll', markTouched);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return null;
}
