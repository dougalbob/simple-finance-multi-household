import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import { appSessionFromRequest } from '@/lib/auth/next';
import { getRegistry, closeRegistry } from '@/lib/registry/db';
import { loadAppConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
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

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return new NextResponse('No file provided', { status: 400 });
    }

    const config = loadAppConfig();
    const registryPath = config.registryPath;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    closeRegistry();

    if (fs.existsSync(`${registryPath}-wal`)) fs.unlinkSync(`${registryPath}-wal`);
    if (fs.existsSync(`${registryPath}-shm`)) fs.unlinkSync(`${registryPath}-shm`);

    fs.writeFileSync(registryPath, buffer);

    getRegistry(config);

    return NextResponse.redirect(new URL('/admin', request.url));
  } catch (error) {
    console.error('Restore failed:', error);
    return new NextResponse('Restore failed', { status: 500 });
  }
}
