import { householdContextFromHeaders } from '@/lib/auth/household-context';
import { loadAppConfig } from '@/lib/config';
import { setBellSeenAt } from '@/lib/records/bell-seen';

export const dynamic = 'force-dynamic';

/**
 * POST /api/attention/seen — mark the signed-in household member's bell as
 * seen now (SPEC §26). Both the resolved database and the email key are from
 * the verified request context; no tenant value comes from the browser.
 */
export async function POST(request: Request) {
  let user;
  try {
    user = await householdContextFromHeaders(request.headers, loadAppConfig());
  } catch {
    return Response.json(
      { error: 'household_data_unavailable' },
      { status: 503, headers: { 'cache-control': 'private, no-store' } },
    );
  }
  if (user === null) {
    return Response.json(
      { error: 'unauthorised' },
      { status: 401, headers: { 'cache-control': 'private, no-store' } },
    );
  }

  setBellSeenAt(user.db, user.email, new Date());
  return Response.json({ ok: true }, { headers: { 'cache-control': 'private, no-store' } });
}
