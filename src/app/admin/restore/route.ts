import { NextResponse } from 'next/server';
import { describeSession } from '@/lib/auth/current-user';
import { isSameOriginRequest } from '@/lib/auth/origin';
import { loadAppConfig } from '@/lib/config';
import {
  MAX_REGISTRY_RESTORE_BYTES,
  RegistryRestoreError,
  replaceRegistryFile,
} from '@/lib/registry/restore';

export const dynamic = 'force-dynamic';

/**
 * Replace the live system registry with an uploaded backup
 * (MULTI_HOUSEHOLD_PLAN §4). Validation, the timestamped pre-restore copy and
 * the file swap live in `src/lib/registry/restore.ts`; this handler owns the
 * session gate and the response.
 */
export async function POST(request: Request) {
  const config = loadAppConfig();
  const session = await describeSession(request.headers, config);
  if (
    session.status === 'not-signed-in' ||
    session.status === 'unassigned' ||
    session.status === 'registry-unavailable'
  ) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  if (session.user.role !== 'platform_admin') {
    return new NextResponse('Forbidden', { status: 403 });
  }
  if (!isSameOriginRequest(request)) {
    return new NextResponse('Cross-origin restore rejected', { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return new NextResponse('Choose the registry backup file to restore.', { status: 400 });
  }
  const file = formData.get('file');
  if (!(file instanceof Blob) || file.size === 0) {
    return new NextResponse('Choose the registry backup file to restore.', { status: 400 });
  }
  if (file.size > MAX_REGISTRY_RESTORE_BYTES) {
    return new NextResponse('That file is larger than a registry backup can be.', {
      status: 413,
    });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    await replaceRegistryFile(config, buffer);
  } catch (error) {
    if (error instanceof RegistryRestoreError) {
      return new NextResponse(error.message, { status: 400 });
    }
    console.error('Restore failed:', error);
    return new NextResponse('Restore failed', { status: 500 });
  }

  // Redirect with a *relative* Location and status 303:
  //  - `request.url` is NOT the public URL in this deployment. `next start
  //    -H 0.0.0.0 -p 3000` builds it from the bind address, ignoring the Host
  //    header, so deriving the Location from it sent the browser to
  //    `https://0.0.0.0:3000/admin` ("This site can't be reached") on the
  //    live v1.0.1 installation. `trustHostHeader` would not help — the Host
  //    header is never consulted for `request.url` to begin with.
  //  - `NextResponse.redirect` defaults to 307, which would make the browser
  //    re-POST the uploaded file at `/admin` instead of GETting the page.
  // 303 + `/admin` always returns to the admin page over the origin the
  //    browser already trusts.
  return new NextResponse(null, { status: 303, headers: { Location: '/admin' } });
}
