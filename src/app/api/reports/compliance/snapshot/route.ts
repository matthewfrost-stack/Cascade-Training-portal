import { NextRequest, NextResponse } from 'next/server';
import { getScopedLocationIds, requireRole } from '@/lib/apiAuth';
import { saveCheckSnapshot } from '@/lib/complianceReport';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Takes a check snapshot of one home (the compliance team, when they check a site).
 *   POST { locationId, note? }  -> admins and schedulers, for homes they can see.
 * Every snapshot is kept, so the home's progress can be followed over time.
 */
export async function POST(request: NextRequest) {
  const authz = await requireRole(['admin', 'scheduler']);
  if ('error' in authz) return authz.error;
  const { service, userId, role } = authz;

  const body = await request.json().catch(() => ({}));
  const locationId = typeof body?.locationId === 'string' ? body.locationId : '';
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 500) || null : null;
  if (!UUID.test(locationId)) return NextResponse.json({ error: 'Invalid home.' }, { status: 400 });

  try {
    const scope = await getScopedLocationIds(userId, role, service);
    if (!scope.all && !scope.ids.includes(locationId)) {
      return NextResponse.json({ error: 'You do not have access to this home.' }, { status: 403 });
    }
    const { data: me } = await service.from('profiles').select('full_name').eq('id', userId).maybeSingle();
    const snapshot = await saveCheckSnapshot(service, locationId, { userId, name: me?.full_name || 'Unknown user', note });
    return NextResponse.json({ ok: true, snapshot });
  } catch (error) {
    console.error('Compliance check snapshot failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Snapshot failed' }, { status: 500 });
  }
}
