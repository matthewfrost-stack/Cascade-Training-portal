import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/apiAuth';
import { runAtlasCompletedCourseSync } from '@/lib/atlasSync';
import { isAuthorizedCronHeader } from '@/lib/cronAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isAuthorizedCron(request: NextRequest): boolean {
  return isAuthorizedCronHeader(request.headers.get('authorization'));
}

async function runSync(request: NextRequest): Promise<NextResponse> {
  const dryRun = new URL(request.url).searchParams.get('dryRun') === 'true';
  try {
    const summary = await runAtlasCompletedCourseSync({ dryRun });
    return NextResponse.json({ success: true, summary });
  } catch (error) {
    console.error('Atlas completed-course sync failed:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Atlas sync failed' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return runSync(request);
}

export async function POST(request: NextRequest) {
  const authz = await requireRole(['admin']);
  if ('error' in authz) return authz.error;
  return runSync(request);
}
