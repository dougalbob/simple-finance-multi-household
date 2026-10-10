import { getCurrentUser } from '@/lib/auth/current-user';
import { isSameOriginRequest } from '@/lib/auth/origin';
import { loadAppConfig } from '@/lib/config';

/**
 * Household-scoped backup is intentionally not exposed yet. The inherited
 * single-database backup path is unsafe for multiple households; do not
 * revive it here until per-tenant archive contents and restore isolation have
 * their own approved implementation and acceptance tests.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const user = await getCurrentUser(request.headers, loadAppConfig());
  if (user === null) {
    return Response.json(
      { error: 'unauthorised' },
      { status: 401, headers: { 'cache-control': 'private, no-store' } },
    );
  }
  if (!isSameOriginRequest(request)) {
    return Response.json(
      { error: 'cross-origin backup request rejected' },
      { status: 403, headers: { 'cache-control': 'private, no-store' } },
    );
  }

  return Response.json(
    { error: 'household_scoped_backup_not_implemented' },
    { status: 501, headers: { 'cache-control': 'private, no-store' } },
  );
}
