import { NextResponse } from 'next/server';
import { describeSession } from '@/lib/auth/current-user';
import { loadAppConfig } from '@/lib/config';
import { getRegistry } from '@/lib/registry/db';
import {
  buildPresenceView,
  PRESENCE_KEY_HEADER,
  safeRecordPresence,
  type PresenceView,
} from '@/lib/registry/presence';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'private, no-store' } as const;

/**
 * Presence (GitHub issue 105) — operational metadata only.
 *
 * `GET` returns the same view `/admin` renders, for the card's live refresh.
 * It is platform-administrator only, and a deactivated household's
 * administrator keeps access so they can still see who is working before they
 * restore it. The payload names identities, their own household and
 * timestamps: no finance data, no page paths, no household a support view was
 * looking at.
 *
 * `POST` is the browser heartbeat. It records the caller's own visit — the
 * identity always comes from the verified session, and the tab key from the
 * browser can only select which visit to extend, never whose. Any signed-in
 * identity may call it; it writes nothing else and returns no roster data.
 */
export async function GET(request: Request) {
  const config = loadAppConfig();
  const session = await describeSession(request.headers, config);
  if (session.status === 'not-signed-in' || session.status === 'unassigned') {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401, headers: NO_STORE });
  }
  if (session.status === 'registry-unavailable') {
    return NextResponse.json({ error: 'registry_unavailable' }, { status: 503, headers: NO_STORE });
  }
  if (session.user.role !== 'platform_admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: NO_STORE });
  }

  const view: PresenceView = buildPresenceView(getRegistry(config));
  return NextResponse.json(view, { headers: NO_STORE });
}

export async function POST(request: Request) {
  const config = loadAppConfig();
  const session = await describeSession(request.headers, config);
  if (session.status !== 'ok') {
    return NextResponse.json({ ok: false }, { status: 401, headers: NO_STORE });
  }

  // The heartbeat body is never trusted for identity; only the header names a
  // tab, and it is validated in `normalizeSessionKey`.
  const body: unknown = await request.json().catch(() => null);
  const sessionKey =
    typeof body === 'object' && body !== null
      ? (body as { sessionKey?: unknown }).sessionKey
      : undefined;

  safeRecordPresence(getRegistry(config), {
    email: session.user.email,
    householdId: session.user.householdId,
    sessionKey:
      typeof sessionKey === 'string' ? sessionKey : request.headers.get(PRESENCE_KEY_HEADER),
  });

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
