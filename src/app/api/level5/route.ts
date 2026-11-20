import { NextRequest, NextResponse } from 'next/server';
import { getScopedLocationIds, requireRole } from '@/lib/apiAuth';
import { ukToday } from '@/lib/compliance';
import { isL5Role, L5_STATUS_LABELS, l5StandardDue, type L5Status } from '@/lib/level5';
import { buildLevel5, L5, Level5NotReady } from '@/lib/level5Tracker';
import { canManagePerson, CERTIFICATE_BUCKET } from '@/lib/qualificationAccess';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const date = (value: unknown) => (typeof value === 'string' && DAY.test(value) ? value : null);
const text = (value: unknown, max = 300) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);

/**
 * Level 5 Diploma tracker (admins, schedulers, managers; non-admins see people at their own homes).
 *   GET                                        -> people on the list + staff who could be added
 *   POST   { profileId, role, inRoleSince }    -> add someone to the list
 *   PUT    { profileId, record }               -> save one person's record
 *   DELETE ?profileId=…                        -> take someone off the list (and delete their certificate)
 */
export async function GET() {
  const authz = await requireRole(['admin', 'scheduler', 'manager']);
  if ('error' in authz) return authz.error;
  try {
    const scope = await getScopedLocationIds(authz.userId, authz.role, authz.service);
    const result = await buildLevel5(authz.service, scope.all ? null : scope.ids);
    return NextResponse.json({ ...result, today: ukToday() });
  } catch (error) {
    if (error instanceof Level5NotReady) return NextResponse.json({ error: error.message }, { status: 503 });
    console.error('Level 5 tracker failed:', error);
    return NextResponse.json({ error: 'Could not load the Level 5 Diploma tracker.' }, { status: 500 });
  }
}

const notReady = (message: string | undefined) => /role|qualification_check|extended_to|achieved_on/.test(message || '');

export async function POST(request: NextRequest) {
  const authz = await requireRole(['admin', 'scheduler', 'manager']);
  if ('error' in authz) return authz.error;
  const { service, userId, role } = authz;

  const body = await request.json().catch(() => null);
  const profileId = typeof body?.profileId === 'string' ? body.profileId : '';
  if (!UUID.test(profileId)) return NextResponse.json({ error: 'Choose a staff member.' }, { status: 400 });
  if (!isL5Role(body?.role)) return NextResponse.json({ error: 'Choose their role.' }, { status: 400 });
  const inRoleSince = date(body?.inRoleSince);
  if (inRoleSince && inRoleSince > ukToday()) return NextResponse.json({ error: '“In role since” can’t be in the future.' }, { status: 400 });

  try {
    if (!(await canManagePerson(service, { userId, role }, profileId, L5))) {
      return NextResponse.json({ error: 'This person is not at a home you manage.' }, { status: 403 });
    }
    const { error } = await service.from('staff_qualifications').insert({
      profile_id: profileId, qualification: L5, role: body.role, start_date: inRoleSince, status: 'not_started',
      updated_by: userId, updated_at: new Date().toISOString(),
    });
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'They are already on the Level 5 list.' }, { status: 409 });
      if (notReady(error.message)) throw new Level5NotReady();
      throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Level5NotReady) return NextResponse.json({ error: error.message }, { status: 503 });
    console.error('Level 5 add failed:', error);
    return NextResponse.json({ error: 'Could not add them. Please try again.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const authz = await requireRole(['admin', 'scheduler', 'manager']);
  if ('error' in authz) return authz.error;
  const { service, userId, role } = authz;

  const body = await request.json().catch(() => null);
  const profileId = typeof body?.profileId === 'string' ? body.profileId : '';
  const r = body?.record || {};
  if (!UUID.test(profileId)) return NextResponse.json({ error: 'Invalid person.' }, { status: 400 });
  if (!(r.status in L5_STATUS_LABELS)) return NextResponse.json({ error: 'Choose a status.' }, { status: 400 });
  if (!isL5Role(r.role)) return NextResponse.json({ error: 'Choose their role.' }, { status: 400 });

  const row = {
    role: r.role,
    start_date: date(r.inRoleSince),
    status: r.status as L5Status,
    enrolled_on: date(r.enrolledOn),
    provider: text(r.provider),
    completed_on: date(r.completedOn),
    equivalent: text(r.equivalent),
    achieved_on: date(r.achievedOn),
    extended_to: date(r.extendedTo),
    extension_reason: text(r.extensionReason, 1000),
    notes: text(r.notes, 2000),
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };
  const enrolledStatus = row.status === 'enrolled' || row.status === 'in_progress';
  if (enrolledStatus && !row.enrolled_on) return NextResponse.json({ error: 'Enter the date they enrolled – the 2 years start from it.' }, { status: 400 });
  if (row.enrolled_on && row.enrolled_on > ukToday()) return NextResponse.json({ error: 'The enrolment date can’t be in the future.' }, { status: 400 });
  if (row.status === 'completed' && !row.completed_on) return NextResponse.json({ error: 'Enter the date they completed it.' }, { status: 400 });
  if (row.status === 'equivalent' && (!row.equivalent || !row.achieved_on)) return NextResponse.json({ error: 'Say which equivalent they hold and when they achieved it.' }, { status: 400 });
  if (row.status === 'not_required' && !row.notes) return NextResponse.json({ error: 'Add a note saying why it isn’t required.' }, { status: 400 });
  if (row.extended_to) {
    const normal = l5StandardDue(row.enrolled_on);
    if (!normal) return NextResponse.json({ error: 'An extension needs an enrolment date first.' }, { status: 400 });
    if (!row.extension_reason) return NextResponse.json({ error: 'Give a reason for the extension.' }, { status: 400 });
    if (row.extended_to <= normal) return NextResponse.json({ error: 'The extended deadline must be after the normal 2-year deadline.' }, { status: 400 });
  } else {
    row.extension_reason = null;
  }

  try {
    if (!(await canManagePerson(service, { userId, role }, profileId, L5))) {
      return NextResponse.json({ error: 'This person is not at a home you manage.' }, { status: 403 });
    }
    const { data: current, error: readError } = await service
      .from('staff_qualifications').select('id, certificate_path').eq('profile_id', profileId).eq('qualification', L5).maybeSingle();
    if (readError) throw readError;
    if (!current) return NextResponse.json({ error: 'They are no longer on the Level 5 list. Refresh the page.' }, { status: 404 });
    if ((row.status === 'completed' || row.status === 'equivalent') && !current.certificate_path) {
      return NextResponse.json({ error: 'Upload a copy of the certificate first.' }, { status: 400 });
    }
    const { error } = await service.from('staff_qualifications').update(row).eq('id', current.id);
    if (error) {
      if (notReady(error.message)) throw new Level5NotReady();
      throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Level5NotReady) return NextResponse.json({ error: error.message }, { status: 503 });
    console.error('Level 5 save failed:', error);
    return NextResponse.json({ error: 'Could not save. Please try again.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const authz = await requireRole(['admin', 'scheduler', 'manager']);
  if ('error' in authz) return authz.error;
  const { service, userId, role } = authz;

  const profileId = new URL(request.url).searchParams.get('profileId') || '';
  if (!UUID.test(profileId)) return NextResponse.json({ error: 'Invalid person.' }, { status: 400 });
  try {
    if (!(await canManagePerson(service, { userId, role }, profileId, L5))) {
      return NextResponse.json({ error: 'This person is not at a home you manage.' }, { status: 403 });
    }
    const { data: current } = await service
      .from('staff_qualifications').select('id, certificate_path').eq('profile_id', profileId).eq('qualification', L5).maybeSingle();
    if (!current) return NextResponse.json({ ok: true });
    const { error } = await service.from('staff_qualifications').delete().eq('id', current.id);
    if (error) throw error;
    if (current.certificate_path) await service.storage.from(CERTIFICATE_BUCKET).remove([current.certificate_path]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Level 5 remove failed:', error);
    return NextResponse.json({ error: 'Could not remove them. Please try again.' }, { status: 500 });
  }
}
