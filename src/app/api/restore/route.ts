import { getCurrentUser } from '@/lib/auth/current-user';
import { isSameOriginRequest } from '@/lib/auth/origin';
import { loadAppConfig } from '@/lib/config';

/**
 * Household-scoped restore is intentionally not exposed yet. The inherited
 * live restore replaced a process-wide database and documents directory,
 * which is not safe once requests can belong to different households. Keep
 * the endpoint closed until tenant-specific restore and isolation tests are
 * approved and implemented.
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
      { error: 'cross-origin restore rejected' },
      { status: 403, headers: { 'cache-control': 'private, no-store' } },
    );
  }

  return Response.json(
    { error: 'household_scoped_restore_not_implemented' },
    { status: 501, headers: { 'cache-control': 'private, no-store' } },
  );
}
