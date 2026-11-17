import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, requireRole } from '@/lib/apiAuth';
import { isAuthorizedCronHeader } from '@/lib/cronAuth';
import { saveSnapshots } from '@/lib/complianceReport';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Saves this month's compliance figures for every home (no emails).
 * Run on the 1st of each month by GitHub Actions (cron secret), or by an admin.
 */
async function run() {
  try {
    const result = await saveSnapshots(createServiceClient());
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('Compliance snapshot failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Snapshot failed' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronHeader(request.headers.get('Authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return run();
}

export async function POST(request: NextRequest) {
  if (isAuthorizedCronHeader(request.headers.get('Authorization'))) return run();
  const authz = await requireRole(['admin']);
  if ('error' in authz) return authz.error;
  return run();
}
