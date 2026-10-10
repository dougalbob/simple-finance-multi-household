import { householdContextFromHeaders } from '@/lib/auth/household-context';
import { isSameOriginRequest } from '@/lib/auth/origin';
import { householdSignInEmails } from '@/lib/auth/sign-in-choices';
import { restoreHouseholdBackup } from '@/lib/backup/household';
import { BackupFormatError, BackupPasswordError } from '@/lib/backup/crypto';
import { RestoreError } from '@/lib/backup/restore';
import { MAX_ARCHIVE_BYTES, RESTORE_CONFIRMATION_WORD } from '@/lib/backup/policy';
import { HouseholdUnavailableError } from '@/lib/db/client';
import { loadAppConfig } from '@/lib/config';
import { getRegistry } from '@/lib/registry/db';

/**
 * Household-scoped restore (MULTI_HOUSEHOLD_PLAN §5). It replaces ONLY the
 * caller's own household database and documents, and only with an archive whose
 * manifest names that same household. The household ID and every path come from
 * the verified context; the archive can select nothing.
 */
export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'private, no-store' } as const;

function refuse(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: NO_STORE });
}

export async function POST(request: Request) {
  const config = loadAppConfig();
  let user;
  try {
    user = await householdContextFromHeaders(request.headers, config);
  } catch {
    return refuse('Household data is unavailable right now. Try again shortly.', 503);
  }
  if (user === null) return refuse('unauthorised', 401);
  if (!isSameOriginRequest(request)) return refuse('cross-origin restore rejected', 403);
  if (user.readOnly) {
    return refuse('A support view is read-only. Nothing can be restored from it.', 403);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return refuse('Choose the backup file and enter its passphrase.', 400);
  }
  const archive = form.get('archive');
  const password = form.get('password');
  const confirm = form.get('confirm');
  if (!(archive instanceof Blob) || archive.size === 0) {
    return refuse('Choose a backup archive first.', 400);
  }
  if (archive.size > MAX_ARCHIVE_BYTES) {
    return refuse('That file is larger than a household backup can be.', 413);
  }
  if (typeof password !== 'string' || password.length === 0) {
    return refuse('Enter the passphrase that archive was made with.', 400);
  }
  if (typeof confirm !== 'string' || confirm.trim().toUpperCase() !== RESTORE_CONFIRMATION_WORD) {
    return refuse(`Type ${RESTORE_CONFIRMATION_WORD} to confirm.`, 400);
  }

  const bytes = Buffer.from(await archive.arrayBuffer());
  try {
    const result = await restoreHouseholdBackup({
      config,
      householdId: user.householdId,
      archive: bytes,
      password,
      // Sign-in links only survive the restore when the registry still assigns
      // that address to this household.
      assignedEmails: householdSignInEmails(getRegistry(config), user.householdId),
    });
    return Response.json(
      {
        ok: true,
        counts: result.manifest.counts,
        documentsRestored: result.documentsRestored,
        personLinksCleared: result.personLinksCleared,
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    if (error instanceof BackupPasswordError || error instanceof BackupFormatError) {
      return refuse(error.message, 400);
    }
    if (error instanceof RestoreError) return refuse(error.message, 400);
    if (error instanceof HouseholdUnavailableError) {
      return refuse('Household data is busy. Try the restore again shortly.', 503);
    }
    return refuse(
      'The restore did not complete. Nothing was replaced; check the file and passphrase, then try again.',
      500,
    );
  }
}
