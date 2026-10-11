import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appSessionFromRequest } from '@/lib/auth/next';
import { getRegistry } from '@/lib/registry/db';
import { APP_VERSION } from '@/lib/version';
import { registryBackupFilename } from '@/lib/backup/filename';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await appSessionFromRequest();
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

  const db = getRegistry();
  const backupPath = path.join(os.tmpdir(), `registry_backup_${Date.now()}.sqlite`);
  
  try {
    await db.backup(backupPath);
    const fileBuffer = fs.readFileSync(backupPath);
    fs.unlinkSync(backupPath);

    const filename = registryBackupFilename(APP_VERSION, new Date());

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Type': 'application/x-sqlite3',
      },
    });
  } catch (error) {
    console.error('Backup failed:', error);
    return new NextResponse('Backup failed', { status: 500 });
  }
}
