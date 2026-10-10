import { householdContextFromHeaders } from '@/lib/auth/household-context';
import { isSameOriginRequest } from '@/lib/auth/origin';
import { createHouseholdBackup } from '@/lib/backup/household';
import { MIN_BACKUP_PASSWORD_LENGTH } from '@/lib/backup/policy';
import { BackupIncompleteError } from '@/lib/backup/backup';
import { loadAppConfig } from '@/lib/config';

/**
 * Household-scoped encrypted backup (MULTI_HOUSEHOLD_PLAN §5, docs/SPEC.md §18).
 *
 * The archive is built only from the caller's verified household context: its
 * own database handle and its own documents directory. The browser supplies
 * the passphrase and nothing else — no household ID, no path. A support view is
 * read-only and may not take an archive: a household's full export is the
 * household's own act.
 */
export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'private, no-store' } as const;

export async function POST(request: Request) {
  let user;
  try {
    user = await householdContextFromHeaders(request.headers, loadAppConfig());
  } catch {
    return Response.json(
      { error: 'Household data is unavailable right now. Try again shortly.' },
      { status: 503, headers: NO_STORE },
    );
  }
  if (user === null) {
    return Response.json({ error: 'unauthorised' }, { status: 401, headers: NO_STORE });
  }
  if (!isSameOriginRequest(request)) {
    return Response.json(
      { error: 'cross-origin backup request rejected' },
      { status: 403, headers: NO_STORE },
    );
  }
  if (user.readOnly) {
    return Response.json(
      { error: 'A support view is read-only. Backups are made by the household itself.' },
      { status: 403, headers: NO_STORE },
    );
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const password =
    typeof body === 'object' && body !== null && 'password' in body
      ? (body as { password: unknown }).password
      : null;
  if (typeof password !== 'string' || password.length < MIN_BACKUP_PASSWORD_LENGTH) {
    return Response.json(
      {
        error: `Use a passphrase of at least ${MIN_BACKUP_PASSWORD_LENGTH} characters.`,
      },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const backup = await createHouseholdBackup({
      householdId: user.householdId,
      handle: user.dbHandle,
      documentsDir: user.documentsDir,
      password,
    });
    return new Response(new Uint8Array(backup.bytes), {
      headers: {
        ...NO_STORE,
        'content-type': 'application/octet-stream',
        'content-disposition': `attachment; filename="${backup.filename}"`,
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof BackupIncompleteError) {
      // The message names server paths; the household gets a plain sentence.
      return Response.json(
        {
          error:
            'An attached document is missing from the store, so a complete backup cannot be made. Nothing was downloaded.',
        },
        { status: 409, headers: NO_STORE },
      );
    }
    return Response.json(
      { error: 'The backup could not be created. Nothing was downloaded.' },
      { status: 500, headers: NO_STORE },
    );
  }
}
