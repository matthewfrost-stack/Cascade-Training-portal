import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, getScopedLocationIds, requireRole } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

/**
 * "Change back" from the matrix history: puts a cell back to the values it
 * had before one recorded change (status, completion date and expiry date).
 *
 * POST { historyId }
 *   - updated entry -> the record gets its old status / dates back
 *   - removed entry -> the record is added back with its old values
 *   - created entry -> nothing to go back to (refused)
 *
 * The change back is itself recorded in the history, tagged
 * 'history_restore' with the user who did it.
 */

type HistoryRow = {
  id: string;
  matrix_id: string | null;
  staff_id: string | null;
  course_id: string | null;
  location_id: string | null;
  action: 'created' | 'updated' | 'removed';
  old_completion_date: string | null;
  new_completion_date: string | null;
  old_expiry_date: string | null;
  new_expiry_date: string | null;
  old_status: string | null;
  new_status: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const authz = await requireRole(['admin', 'scheduler']);
  if ('error' in authz) return authz.error;

  const body = (await request.json().catch(() => ({}))) as { historyId?: string };
  const historyId = String(body.historyId || '');
  if (!UUID.test(historyId)) return NextResponse.json({ error: 'Invalid history entry.' }, { status: 400 });

  const writer = createServiceClient({ source: 'history_restore', userId: authz.userId });

  const { data: entry, error: entryError } = await writer
    .from('staff_training_matrix_history')
    .select('id, matrix_id, staff_id, course_id, location_id, action, old_completion_date, new_completion_date, old_expiry_date, new_expiry_date, old_status, new_status')
    .eq('id', historyId)
    .maybeSingle<HistoryRow>();
  if (entryError || !entry) return NextResponse.json({ error: 'History entry not found.' }, { status: 404 });
  if (!entry.staff_id || !entry.course_id || !entry.location_id) {
    return NextResponse.json({ error: 'This entry is missing details, so it cannot be changed back.' }, { status: 400 });
  }

  const scope = await getScopedLocationIds(authz.userId, authz.role, writer);
  if (!scope.all && !scope.ids.includes(entry.location_id)) {
    return NextResponse.json({ error: 'You do not have access to this home.' }, { status: 403 });
  }

  if (entry.action === 'created') {
    return NextResponse.json({ error: 'This is when the record was first added, so there is nothing earlier to change back to.' }, { status: 400 });
  }
  if (
    entry.action === 'updated'
    && entry.old_status === entry.new_status
    && entry.old_completion_date === entry.new_completion_date
    && entry.old_expiry_date === entry.new_expiry_date
  ) {
    return NextResponse.json({ error: 'This was a move between homes, which can’t be changed back here.' }, { status: 400 });
  }

  const restored = {
    status: entry.old_status,
    completion_date: entry.old_completion_date,
    expiry_date: entry.old_expiry_date,
  };

  // The record as it is now: the same row if it still exists, otherwise the
  // record for the same person, course and home.
  let currentId: string | number | null = null;
  if (entry.matrix_id) {
    const { data } = await writer.from('staff_training_matrix').select('id').eq('id', entry.matrix_id).maybeSingle();
    if (data?.id != null) currentId = data.id;
  }
  if (currentId === null) {
    const { data } = await writer
      .from('staff_training_matrix')
      .select('id')
      .eq('staff_id', entry.staff_id)
      .eq('course_id', entry.course_id)
      .eq('completed_at_location_id', entry.location_id)
      .limit(1);
    if (data && data[0]?.id != null) currentId = data[0].id;
  }

  const result = currentId !== null
    ? await writer.from('staff_training_matrix').update(restored).eq('id', currentId)
    : await writer.from('staff_training_matrix').insert({
        staff_id: entry.staff_id,
        course_id: entry.course_id,
        completed_at_location_id: entry.location_id,
        ...restored,
      });

  if (result.error) {
    console.error('Matrix history restore failed:', result.error);
    return NextResponse.json({ error: 'Could not change it back.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, restored });
}
