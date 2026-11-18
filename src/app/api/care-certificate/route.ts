import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, getScopedLocationIds, requireRole } from '@/lib/apiAuth';
import { ukToday } from '@/lib/compliance';
import { standardDue, type CareCertStatus } from '@/lib/careCertificate';
import { buildCareCertHomes, careCertCourses, CareCertNotReady, CC } from '@/lib/careCertificateTracker';
import { canManagePerson } from '@/lib/qualificationAccess';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: CareCertStatus[] = ['not_started', 'completed', 'equivalent', 'not_required'];
const date = (value: unknown) => (typeof value === 'string' && DAY.test(value) ? value : null);
const text = (value: unknown, max = 300) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);

/**
 * Care Certificate tracker (admins, schedulers, managers; managers/schedulers see their own homes).
 *   GET                        -> every home the user can see, with each person
 *   PUT { profileId, record }  -> save one person (start date goes on their staff record;
 *                                 a completion from elsewhere is also written to the Training Matrix)
 */
export async function GET() {
  const authz = await requireRole(['admin', 'scheduler', 'manager']);
  if ('error' in authz) return authz.error;
  try {
    const scope = await getScopedLocationIds(authz.userId, authz.role, authz.service);
    const homes = await buildCareCertHomes(authz.service, scope.all ? null : scope.ids);
    return NextResponse.json({ homes, today: ukToday() });
  } catch (error) {
    if (error instanceof CareCertNotReady) return NextResponse.json({ error: error.message }, { status: 503 });
    console.error('Care Certificate tracker failed:', error);
    return NextResponse.json({ error: 'Could not load the Care Certificate tracker.' }, { status: 500 });
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
  if (!STATUSES.includes(r.status)) return NextResponse.json({ error: 'Choose a status.' }, { status: 400 });

  const startDate = date(r.startDate);
  const row = {
    profile_id: profileId,
    qualification: CC,
    status: r.status as CareCertStatus,
    completed_on: date(r.completedOn),
    equivalent: text(r.equivalent),
    achieved_on: date(r.achievedOn),
    extended_to: date(r.extendedTo),
    extension_reason: text(r.extensionReason, 1000),
    notes: text(r.notes, 2000),
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };

  if (row.status === 'completed' && !row.completed_on) return NextResponse.json({ error: 'Enter the date they completed it.' }, { status: 400 });
  if (row.status === 'equivalent' && (!row.equivalent || !row.achieved_on)) return NextResponse.json({ error: 'Say which equivalent they hold and when they achieved it.' }, { status: 400 });
  if (row.status === 'not_required' && !row.notes) return NextResponse.json({ error: 'Add a note saying why it isn’t required.' }, { status: 400 });
  if (row.extended_to) {
    if (!row.extension_reason) return NextResponse.json({ error: 'Give a reason for the extension.' }, { status: 400 });
    const normal = standardDue(startDate);
    if (normal && row.extended_to <= normal) return NextResponse.json({ error: 'The extended deadline must be after the normal 12-week deadline.' }, { status: 400 });
  } else {
    row.extension_reason = null;
  }

  try {
    if (!(await canManagePerson(service, { userId, role }, profileId, CC))) {
      return NextResponse.json({ error: 'This person is not at a home you manage.' }, { status: 403 });
    }

    if (row.status === 'completed' || row.status === 'equivalent') {
      const { data: current } = await service.from('staff_qualifications').select('certificate_path').eq('profile_id', profileId).eq('qualification', CC).maybeSingle();
      if (!current?.certificate_path) return NextResponse.json({ error: 'Upload a copy of the certificate first.' }, { status: 400 });
    }

    const { error } = await service.from('staff_qualifications').upsert(row, { onConflict: 'profile_id,qualification' });
    if (error) {
      if (/extended_to|achieved_on|qualification_check/.test(error.message || '')) throw new CareCertNotReady();
      throw error;
    }
    const { error: profileError } = await service.from('profiles').update({ start_date: startDate }).eq('id', profileId);
    if (profileError) {
      if (/start_date/.test(profileError.message || '')) throw new CareCertNotReady();
      throw profileError;
    }

    const matrix = row.status === 'completed' && row.completed_on
      ? await writeCompletionToMatrix(profileId, row.completed_on, { userId, role, service })
      : null;
    return NextResponse.json({ ok: true, matrix });
  } catch (error) {
    if (error instanceof CareCertNotReady) return NextResponse.json({ error: error.message }, { status: 503 });
    console.error('Care Certificate save failed:', error);
    return NextResponse.json({ error: 'Could not save. Please try again.' }, { status: 500 });
  }
}

/**
 * Records the completion on the Training Matrix at each of the person's homes
 * (that the user can see) whose matrix has the Care Certificate. Never replaces
 * a later completion already there. Tagged in the matrix history as the tracker.
 */
async function writeCompletionToMatrix(
  profileId: string,
  completedOn: string,
  user: { userId: string; role: Parameters<typeof getScopedLocationIds>[1]; service: ReturnType<typeof createServiceClient> },
): Promise<{ homes: number; note?: string }> {
  const { service } = user;
  const courses = await careCertCourses(service);
  if (courses.length === 0) return { homes: 0, note: 'There is no Care Certificate course in the Course Catalog, so the matrix was not updated.' };

  const scope = await getScopedLocationIds(user.userId, user.role, service);
  const { data: links } = await service.from('staff_locations').select('location_id').eq('staff_id', profileId);
  const homeIds = (links || []).map((l) => l.location_id as string).filter((id) => scope.all || scope.ids.includes(id));
  if (homeIds.length === 0) return { homes: 0 };

  const { data: onMatrix } = await service
    .from('location_training_courses')
    .select('location_id, training_course_id')
    .in('location_id', homeIds)
    .in('training_course_id', courses.map((c) => c.id));

  // One Care Certificate column per home (prefer the non-Careskills copy, as the matrix does).
  const courseFor = new Map<string, string>();
  for (const link of onMatrix || []) {
    const course = courses.find((c) => c.id === String(link.training_course_id));
    if (!course) continue;
    const existing = courses.find((c) => c.id === courseFor.get(link.location_id));
    if (!existing || (/careskills/i.test(existing.name) && !/careskills/i.test(course.name))) courseFor.set(link.location_id, course.id);
  }
  if (courseFor.size === 0) return { homes: 0, note: 'The Care Certificate isn’t on this person’s home matrix, so only the tracker was updated.' };

  const writer = createServiceClient({ source: 'qualification_tracker', userId: user.userId });
  let written = 0;
  for (const [locationId, courseId] of courseFor) {
    const { data: existing } = await writer
      .from('staff_training_matrix')
      .select('id, completion_date')
      .eq('staff_id', profileId)
      .eq('course_id', courseId)
      .eq('completed_at_location_id', locationId)
      .maybeSingle();
    if (existing?.completion_date && existing.completion_date.slice(0, 10) >= completedOn) continue;
    const values = { status: 'completed', completion_date: completedOn, expiry_date: null };
    const { error } = existing
      ? await writer.from('staff_training_matrix').update(values).eq('id', existing.id)
      : await writer.from('staff_training_matrix').insert({ staff_id: profileId, course_id: courseId, completed_at_location_id: locationId, ...values });
    if (error) console.error('Care Certificate matrix write failed:', error);
    else written++;
  }
  return { homes: written };
}
