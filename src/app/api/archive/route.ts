import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, requireRole } from '@/lib/apiAuth';

export async function GET(_request: NextRequest) {
  const authz = await requireRole(['admin']);
  if ('error' in authz) return authz.error;

  const service = createServiceClient();

  const { data, error } = await service
    .from('deleted_items')
    .select('id,entity_type,entity_id,location_id,snapshot,deleted_by,deleted_at,restored_at')
    .is('restored_at', null)
    .order('deleted_at', { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
  }

  const { data: locations } = await service.from('locations').select('id,name');
  const locationMap = new Map((locations || []).map((l: any) => [l.id, l.name]));

  const items = (data || []).map((row: any) => ({
    ...row,
    location_name: row.location_id ? locationMap.get(row.location_id) || null : null,
  }));

  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const authz = await requireRole(['admin']);
  if ('error' in authz) return authz.error;

  const service = createServiceClient();
  const { userId } = authz;
  const body = await request.json();
  const deletedItemId = body?.deletedItemId as string | undefined;

  if (!deletedItemId) {
    return NextResponse.json({ error: 'deletedItemId is required' }, { status: 400 });
  }

  const { data: item, error: itemError } = await service
    .from('deleted_items')
    .select('*')
    .eq('id', deletedItemId)
    .is('restored_at', null)
    .single();

  if (itemError || !item) {
    return NextResponse.json({ error: 'Archive item not found' }, { status: 404 });
  }

  if (item.entity_type === 'location_training_course') {
    const snapshot = item.snapshot || {};
    const link = snapshot.location_training_course || {};

    const locationId = link.location_id || item.location_id;
    const trainingCourseId = link.training_course_id;
    const displayOrder = typeof link.display_order === 'number' ? link.display_order : 9999;

    if (!locationId || !trainingCourseId) {
      return NextResponse.json({ error: 'Archive snapshot is missing location/course data' }, { status: 400 });
    }

    const { error: restoreError } = await service
      .from('location_training_courses')
      .upsert(
        [
          {
            location_id: locationId,
            training_course_id: trainingCourseId,
            display_order: displayOrder,
          },
        ],
        { onConflict: 'location_id,training_course_id' }
      );

    if (restoreError) {
      return NextResponse.json({ error: restoreError.message, code: restoreError.code }, { status: 400 });
    }

    const trainingRows = Array.isArray(snapshot.training_rows) ? snapshot.training_rows : [];
    if (trainingRows.length > 0) {
      const payload = trainingRows.map((row: any) => ({
        id: row.id,
        staff_id: row.staff_id,
        course_id: row.course_id,
        completion_date: row.completion_date ?? null,
        expiry_date: row.expiry_date ?? null,
        status: row.status ?? 'na',
        completed_at_location_id: row.completed_at_location_id ?? locationId,
        created_at: row.created_at ?? null,
        updated_at: row.updated_at ?? new Date().toISOString(),
        booking_course_id: row.booking_course_id ?? null,
      }));

      const { error: rowsRestoreError } = await service
        .from('staff_training_matrix')
        .upsert(payload, { onConflict: 'id' });

      if (rowsRestoreError) {
        return NextResponse.json({ error: rowsRestoreError.message, code: rowsRestoreError.code }, { status: 400 });
      }
    }
  } else if (item.entity_type === 'profile') {
    const snapshot = item.snapshot || {};
    const profile = snapshot.profile || {};

    const updatePayload = {
      full_name: profile.full_name || 'Restored User',
      email: profile.email || null,
      location: profile.location || null,
      home_house: profile.home_house || null,
      managed_houses: profile.managed_houses || null,
      role_tier: profile.role_tier || 'staff',
      password_needs_change: profile.password_needs_change ?? true,
      is_deleted: false,
      deleted_at: null,
    };

    const { error: restoreProfileError } = await service
      .from('profiles')
      .update(updatePayload)
      .eq('id', item.entity_id);

    if (restoreProfileError) {
      return NextResponse.json({ error: restoreProfileError.message, code: restoreProfileError.code }, { status: 400 });
    }
  } else if (item.entity_type === 'booking') {
    const snapshot = item.snapshot || {};
    const booking = snapshot.booking || {};

    if (!booking.id || !booking.event_id || !booking.profile_id) {
      return NextResponse.json({ error: 'Archive snapshot is missing booking data' }, { status: 400 });
    }

    const bookingPayload = {
      id: booking.id,
      event_id: booking.event_id,
      profile_id: booking.profile_id,
      attended_at: booking.attended_at ?? null,
      lateness_reason: booking.lateness_reason ?? null,
      absence_reason: booking.absence_reason ?? null,
      booked_by: booking.booked_by ?? null,
      created_at: booking.created_at ?? null,
      is_late: booking.is_late ?? null,
      late_reason: booking.late_reason ?? null,
      minutes_late: booking.minutes_late ?? null,
    };

    const { error: restoreBookingError } = await service
      .from('bookings')
      .upsert([bookingPayload], { onConflict: 'id' });

    if (restoreBookingError) {
      return NextResponse.json({ error: restoreBookingError.message, code: restoreBookingError.code }, { status: 400 });
    }
  } else {
    return NextResponse.json({ error: `Unsupported archive entity type: ${item.entity_type}` }, { status: 400 });
  }

  const { error: markError } = await service
    .from('deleted_items')
    .update({
      restored_at: new Date().toISOString(),
      restored_by: userId,
    })
    .eq('id', deletedItemId);

  if (markError) {
    return NextResponse.json({ error: markError.message, code: markError.code }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const authz = await requireRole(['admin']);
  if ('error' in authz) return authz.error;

  const service = createServiceClient();
  const body = await request.json();
  const deletedItemId = body?.deletedItemId as string | undefined;

  if (!deletedItemId) {
    return NextResponse.json({ error: 'deletedItemId is required' }, { status: 400 });
  }

  const { error } = await service
    .from('deleted_items')
    .delete()
    .eq('id', deletedItemId);

  if (error) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
