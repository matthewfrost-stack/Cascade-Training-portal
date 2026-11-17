import { NextRequest, NextResponse } from 'next/server';
import { getScopedLocationIds, requireRole } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

/**
 * History of one training matrix cell: a person, a course (including its
 * "(Careskills)" copy) at one home. Newest first, up to 20 entries.
 *
 * GET ?staffId=…&courseId=…&locationId=…
 */

type HistoryRow = {
  id: string;
  action: 'created' | 'updated' | 'removed';
  old_completion_date: string | null;
  new_completion_date: string | null;
  old_expiry_date: string | null;
  new_expiry_date: string | null;
  old_status: string | null;
  new_status: string | null;
  old_location_id: string | null;
  location_id: string | null;
  source: string;
  changed_by: string | null;
  changed_at: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function canonicalCourseName(name?: string | null): string {
  if (!name) return '';
  return name.replace(/\s+\(Careskills\)\s*$/i, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export async function GET(request: NextRequest) {
  const authz = await requireRole(['admin', 'scheduler', 'manager']);
  if ('error' in authz) return authz.error;
  const { service } = authz;

  const params = new URL(request.url).searchParams;
  const staffId = params.get('staffId') || '';
  const courseId = params.get('courseId') || '';
  const locationId = params.get('locationId') || '';
  if (![staffId, courseId, locationId].every((v) => UUID.test(v))) {
    return NextResponse.json({ error: 'Missing or invalid cell.' }, { status: 400 });
  }

  const scope = await getScopedLocationIds(authz.userId, authz.role, service);
  if (!scope.all && !scope.ids.includes(locationId)) {
    return NextResponse.json({ error: 'You do not have access to this home.' }, { status: 403 });
  }

  // The cell's course and any other copy with the same name ("X (Careskills)").
  const { data: course } = await service.from('training_courses').select('id, name').eq('id', courseId).maybeSingle();
  const courseIds = new Set<string>([courseId]);
  const key = canonicalCourseName(course?.name);
  if (key) {
    for (let from = 0; ; from += 1000) {
      const { data: page } = await service.from('training_courses').select('id, name').range(from, from + 999);
      for (const row of page || []) if (canonicalCourseName(row.name) === key) courseIds.add(row.id);
      if (!page || page.length < 1000) break;
    }
  }
  const ids = Array.from(courseIds);

  const { data, error } = await service
    .from('staff_training_matrix_history')
    .select('id, action, old_completion_date, new_completion_date, old_expiry_date, new_expiry_date, old_status, new_status, old_location_id, location_id, source, changed_by, changed_at')
    .eq('staff_id', staffId)
    .or(`location_id.eq.${locationId},old_location_id.eq.${locationId}`)
    .or(`course_id.in.(${ids.join(',')}),old_course_id.in.(${ids.join(',')})`)
    .order('changed_at', { ascending: false })
    .limit(20);

  if (error) {
    if (error.code === '42P01' || /staff_training_matrix_history/.test(error.message || '')) {
      return NextResponse.json({
        error: 'History is not switched on yet. Run the migration 20261117150000_add_training_matrix_history.sql in the Supabase SQL Editor.',
      }, { status: 503 });
    }
    console.error('Matrix history query failed:', error);
    return NextResponse.json({ error: 'Could not load history.' }, { status: 500 });
  }

  const rows = (data || []) as HistoryRow[];

  // Names for people and homes mentioned.
  const actorIds = Array.from(new Set(rows.map((r) => r.changed_by).filter((v): v is string => Boolean(v))));
  const locationIds = Array.from(new Set(rows.flatMap((r) => [r.old_location_id, r.location_id]).filter((v): v is string => Boolean(v))));
  const [actorsResult, locationsResult] = await Promise.all([
    actorIds.length ? service.from('profiles').select('id, full_name').in('id', actorIds) : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
    locationIds.length ? service.from('locations').select('id, name').in('id', locationIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const actorName = new Map((actorsResult.data || []).map((p) => [p.id, p.full_name || 'Unknown user']));
  const locationName = new Map((locationsResult.data || []).map((l) => [l.id, l.name]));

  return NextResponse.json({
    entries: rows.map((row) => ({
      id: row.id,
      changedAt: row.changed_at,
      action: row.action,
      source: row.source,
      by: row.changed_by ? actorName.get(row.changed_by) || 'Unknown user' : null,
      completion: { from: row.old_completion_date, to: row.new_completion_date },
      expiry: { from: row.old_expiry_date, to: row.new_expiry_date },
      status: { from: row.old_status, to: row.new_status },
      movedFrom: row.old_location_id && row.old_location_id !== row.location_id ? locationName.get(row.old_location_id) || 'another home' : null,
    })),
  });
}
