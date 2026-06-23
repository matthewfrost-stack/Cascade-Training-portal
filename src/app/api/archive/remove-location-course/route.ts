import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, getScopedLocationIds, requireRole } from '@/lib/apiAuth';

export async function POST(request: NextRequest) {
  const authz = await requireRole(['admin', 'scheduler']);
  if ('error' in authz) return authz.error;

  const supabaseAdmin = createServiceClient();

  const body = await request.json();
  const courseId = body?.courseId as string | undefined;
  const locationId = body?.locationId as string | undefined;
  const displayOrder = typeof body?.displayOrder === 'number' ? body.displayOrder : 9999;

  if (!courseId || !locationId) {
    return NextResponse.json({ error: 'courseId and locationId are required' }, { status: 400 });
  }

  const scopedLocations = await getScopedLocationIds(authz.userId, authz.role, supabaseAdmin);
  if (!scopedLocations.all && !scopedLocations.ids.includes(locationId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: linkRow, error: linkErr } = await supabaseAdmin
    .from('location_training_courses')
    .select('id,location_id,training_course_id,display_order')
    .eq('location_id', locationId)
    .eq('training_course_id', courseId)
    .single();

  if (linkErr || !linkRow) {
    return NextResponse.json({ error: 'Course link not found for this location' }, { status: 404 });
  }

  const { data: course } = await supabaseAdmin
    .from('training_courses')
    .select('id,name')
    .eq('id', courseId)
    .single();

  const { data: trainingRows, error: rowsErr } = await supabaseAdmin
    .from('staff_training_matrix')
    .select('id,staff_id,course_id,completion_date,expiry_date,status,completed_at_location_id,created_at,updated_at,booking_course_id')
    .eq('course_id', courseId)
    .eq('completed_at_location_id', locationId);

  if (rowsErr) {
    return NextResponse.json({ error: rowsErr.message, code: rowsErr.code }, { status: 400 });
  }

  const snapshot = {
    location_training_course: {
      location_id: linkRow.location_id,
      training_course_id: linkRow.training_course_id,
      display_order: linkRow.display_order ?? displayOrder,
    },
    course_name: course?.name || 'Unknown Course',
    training_rows: trainingRows || [],
  };

  const { data: archiveRow, error: archiveErr } = await supabaseAdmin
    .from('deleted_items')
    .insert([
      {
        entity_type: 'location_training_course',
        entity_id: String(linkRow.id),
        location_id: locationId,
        snapshot,
        deleted_by: authz.userId,
      },
    ])
    .select('id')
    .single();

  if (archiveErr) {
    return NextResponse.json({ error: archiveErr.message, code: archiveErr.code }, { status: 400 });
  }

  const { error: rowsDeleteErr } = await supabaseAdmin
    .from('staff_training_matrix')
    .delete()
    .eq('course_id', courseId)
    .eq('completed_at_location_id', locationId);
  if (rowsDeleteErr) {
    return NextResponse.json({ error: rowsDeleteErr.message, code: rowsDeleteErr.code }, { status: 400 });
  }

  const { error: deleteErr } = await supabaseAdmin
    .from('location_training_courses')
    .delete()
    .eq('location_id', locationId)
    .eq('training_course_id', courseId);

  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message, code: deleteErr.code }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    removed: {
      deleted_item_id: archiveRow.id,
      course_id: courseId,
      course_name: course?.name || 'Unknown Course',
      location_id: locationId,
      display_order: linkRow.display_order ?? displayOrder,
      archived_rows: (trainingRows || []).length,
    },
  });
}
