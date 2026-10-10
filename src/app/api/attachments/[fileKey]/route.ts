import { eq } from 'drizzle-orm';
import { householdContextFromHeaders } from '@/lib/auth/household-context';
import { loadAppConfig } from '@/lib/config';
import { attachments } from '@/lib/db/schema';
import {
  isSafeFileKey,
  readAttachmentBytes,
  sanitizeOriginalName,
} from '@/lib/records/attachments';

/**
 * Authenticated, tenant-scoped attachment viewer (SPEC §23.2). The DB row and
 * bytes are both resolved from the same verified household context. The
 * browser supplies only the opaque storage key, never a household ID or path.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ fileKey: string }> }) {
  let user;
  try {
    user = await householdContextFromHeaders(request.headers, loadAppConfig());
  } catch {
    return new Response('Household data unavailable', {
      status: 503,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }
  if (user === null) {
    return new Response('Unauthorized', {
      status: 401,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }

  const { fileKey } = await params;
  if (!isSafeFileKey(fileKey)) {
    return new Response('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }

  const row = user.db.select().from(attachments).where(eq(attachments.fileKey, fileKey)).get();
  if (row === undefined || row.state !== 'stored') {
    return new Response('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }

  try {
    const body = await readAttachmentBytes(user.documentsDir, row.fileKey);
    return new Response(new Uint8Array(body), {
      headers: {
        'Content-Type': row.mime,
        'Content-Length': String(body.byteLength),
        // `inline` so a receipt photo opens in the viewer; the name is
        // sanitized and only ever used for display/download naming.
        'Content-Disposition': `inline; filename="${sanitizeOriginalName(row.originalName)}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }
}
