import { getCurrentUser } from '@/lib/auth/current-user';
import { loadAppConfig } from '@/lib/config';
import { getDbHandle } from '@/lib/db/client';
import { setBellSeenAt } from '@/lib/records/bell-seen';

export const dynamic = 'force-dynamic';

/**
 * POST /api/attention/seen — mark bell as seen now (SPEC §26, decision 176).
 * Fired when the panel is opened, after the GET has been used to compute
 * the "new" list, so the list stays visible while open.
 */
export async function POST(request: Request) {
  const config = loadAppConfig();
  const user = await getCurrentUser(request.headers, config);
  if (user === null) {
    return Response.json(
      { error: 'unauthorised' },
      { status: 401, headers: { 'cache-control': 'no-store' } },
    );
  }
  const { db } = getDbHandle(config);
  setBellSeenAt(db, user.email, new Date());
  return Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
}
