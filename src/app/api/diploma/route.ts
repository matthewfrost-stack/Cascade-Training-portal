import { NextRequest, NextResponse } from 'next/server';
import { getScopedLocationIds, requireRole } from '@/lib/apiAuth';
import { STATUS_LABELS, type DiplomaStatus } from '@/lib/diploma';
import { ukToday } from '@/lib/compliance';
import { buildDiplomaHomes, diplomaHomes, DiplomaNotReady, L3 } from '@/lib/diplomaTracker';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Level 3 Diploma tracker (admins, schedulers, managers; managers see their own homes).
 *   GET                         -> every children's home the user can see, with each person's record
 *   PUT { profileId, record }   -> save one person's record
 */
export async function GET() {
  const authz = await requireRole(['admin', 'scheduler', 'manager']);
  if ('error' in authz) return authz.error;
  try {
    const scope = await getScopedLocationIds(authz.userId, authz.role, authz.service);
    const homes = await buildDiplomaHomes(authz.service, scope.all ? null : scope.ids);
    return NextResponse.json({ homes, today: ukToday() });
  } catch (error) {
    if (error instanceof DiplomaNotReady) return NextResponse.json({ error: error.message }, { status: 503 });
    console.error('Diploma tracker failed:', error);
    return NextResponse.json({ error: 'Could not load the Level 3 Diploma tracker.' }, { status: 500 });
  }
}

const date = (value: unknown) => (typeof value === 'string' && DAY.test(value) ? value : null);
const text = (value: unknown, max = 300) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);

export async function PUT(request: NextRequest) {
  const authz = await requireRole(['admin', 'scheduler', 'manager']);
  if ('error' in authz) return authz.error;
  const { service, userId, role } = authz;

  const body = await request.json().catch(() => null);
  const profileId = typeof body?.profileId === 'string' ? body.profileId : '';
  const r = body?.record || {};
  if (!UUID.test(profileId)) return NextResponse.json({ error: 'Invalid person.' }, { status: 400 });
  if (!(r.status in STATUS_LABELS)) return NextResponse.json({ error: 'Choose a status.' }, { status: 400 });

  const row = {
    profile_id: profileId,
    qualification: L3,
    status: r.status as DiplomaStatus,
    start_date: date(r.startDate),
    enrolled_on: date(r.enrolledOn),
    provider: text(r.provider),
    completed_on: date(r.completedOn),
    equivalent: text(r.equivalent),
    notes: text(r.notes, 2000),
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };
  if (row.status === 'equivalent' && !row.equivalent) {
    return NextResponse.json({ error: 'Say which equivalent qualification they hold.' }, { status: 400 });
  }

  try {
    // Only people at a children's home this user can see.
    const scope = await getScopedLocationIds(userId, role, service);
    const homes = await diplomaHomes(service, scope.all ? null : scope.ids);
    const homeIds = homes.map((h) => h.id);
    const { data: links } = homeIds.length
      ? await service.from('staff_locations').select('location_id').eq('staff_id', profileId).in('location_id', homeIds)
      : { data: [] };
    if (!links || links.length === 0) return NextResponse.json({ error: 'This person is not at a children’s home you manage.' }, { status: 403 });

    const { error } = await service.from('staff_qualifications').upsert(row, { onConflict: 'profile_id,qualification' });
    if (error) throw error;
    // The start date (and qualifications on entry) belong to the person, shared with the Care Certificate.
    const { error: profileError } = await service
      .from('profiles')
      .update({ start_date: row.start_date, qualifications_on_entry: text(r.qualificationsOnEntry, 500) })
      .eq('id', profileId);
    if (profileError) {
      if (/start_date|qualifications_on_entry/.test(profileError.message || '')) throw new DiplomaNotReady();
      throw profileError;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof DiplomaNotReady) return NextResponse.json({ error: error.message }, { status: 503 });
    console.error('Diploma save failed:', error);
    return NextResponse.json({ error: 'Could not save. Please try again.' }, { status: 500 });
  }
}
