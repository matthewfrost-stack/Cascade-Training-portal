import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, getScopedLocations, requireRole } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

const getNextDateIso = (dateValue: string): string => {
  const base = new Date(`${dateValue}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + 1);
  return base.toISOString().split('T')[0];
};

export async function POST(request: NextRequest) {
  try {
    const authz = await requireRole(['admin', 'scheduler', 'manager']);
    if ('error' in authz) return authz.error;

    const { eventId, staffIds } = await request.json();

    const requestedStaffIds = Array.isArray(staffIds)
      ? [...new Set(staffIds.filter((id): id is string => typeof id === 'string' && Boolean(id.trim())))]
      : [];

    if (!eventId || requestedStaffIds.length === 0) {
      return NextResponse.json(
        { error: 'Missing eventId or staffIds' },
        { status: 400 }
      );
    }

    const supabaseAdmin = createServiceClient();

    // Get event details
    const { data: event, error: eventError } = await supabaseAdmin
      .from('training_events')
      .select('*, courses(max_attendees, name)')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      return NextResponse.json(
        { error: 'Event not found' },
        { status: 404 }
      );
    }

    if (authz.role === 'manager') {
      const today = new Date().toISOString().split('T')[0];
      if (event.event_date < today) {
        return NextResponse.json(
          { error: 'Managers cannot add staff to past courses.' },
          { status: 400 }
        );
      }

      const scopedLocations = await getScopedLocations(authz.userId, authz.role, supabaseAdmin);
      if (scopedLocations.all || scopedLocations.locations.length === 0) {
        return NextResponse.json({ error: 'You do not have any assigned locations.' }, { status: 403 });
      }

      const scopedLocationIds = scopedLocations.locations.map((location) => location.id);
      const scopedLocationNames = scopedLocations.locations.map((location) => location.name);
      const allowedStaffIds = new Set<string>();

      const { data: linkedStaff } = await supabaseAdmin
        .from('staff_locations')
        .select('staff_id')
        .in('location_id', scopedLocationIds);
      (linkedStaff || []).forEach((row) => {
        if (row.staff_id) allowedStaffIds.add(row.staff_id);
      });

      // Keep legacy profiles whose primary location is assigned even if their
      // staff_locations link has not been backfilled yet.
      const { data: primaryLocationStaff } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .in('location', scopedLocationNames);
      (primaryLocationStaff || []).forEach((row) => {
        if (row.id) allowedStaffIds.add(row.id);
      });

      const unauthorizedStaffIds = requestedStaffIds.filter((id) => !allowedStaffIds.has(id));
      if (unauthorizedStaffIds.length > 0) {
        return NextResponse.json(
          { error: 'Managers can only book staff assigned to their locations.', unauthorizedStaffIds },
          { status: 403 }
        );
      }
    }

    const staffIdsForBooking = requestedStaffIds;

    const courseMaxAttendees = event.courses?.max_attendees || 10;
    const isTeamTeachLevel2 = String(event.courses?.name || '').trim().toLowerCase() === 'team teach level 2';
    const nextDayDate = getNextDateIso(event.event_date);

    // Check for course overrides for this event date
    const { data: overrides } = await supabaseAdmin
      .from('course_event_overrides')
      .select('max_attendees')
      .eq('course_id', event.course_id)
      .eq('event_date', event.event_date);

    // Use override if it exists for this date
    const maxCapacity = overrides && overrides.length > 0 
      ? overrides[0].max_attendees 
      : courseMaxAttendees;

    // Count current bookings for this event
    const { data: currentBookings, error: bookingCountError } = await supabaseAdmin
      .from('bookings')
      .select('id', { count: 'exact' })
      .eq('event_id', eventId);

    if (bookingCountError) {
      return NextResponse.json(
        { error: 'Failed to check current bookings' },
        { status: 500 }
      );
    }

    const currentCount = currentBookings?.length || 0;
    const totalAfterBooking = currentCount + staffIdsForBooking.length;

    // Validate capacity (selected event)
    if (totalAfterBooking > maxCapacity) {
      const availableSpots = maxCapacity - currentCount;
      return NextResponse.json(
        {
          error: `Capacity exceeded! Course capacity: ${maxCapacity}, Current bookings: ${currentCount}, Trying to add: ${staffIdsForBooking.length}, Available spots: ${Math.max(0, availableSpots)}`,
          currentCount,
          maxCapacity,
          availableSpots: Math.max(0, availableSpots),
          tryingToAdd: staffIdsForBooking.length,
          wouldExceedBy: totalAfterBooking - maxCapacity
        },
        { status: 400 }
      );
    }

    // Check if any staff are already booked for this event
    const { data: existingBookings } = await supabaseAdmin
      .from('bookings')
      .select('profile_id')
      .eq('event_id', eventId)
      .in('profile_id', staffIdsForBooking);

    const alreadyBookedIds = existingBookings?.map(b => b.profile_id) || [];
    const newStaffIds = staffIdsForBooking.filter((id: string) => !alreadyBookedIds.includes(id));

    if (newStaffIds.length === 0) {
      return NextResponse.json(
        { error: 'All selected staff are already booked for this event' },
        { status: 400 }
      );
    }

    let linkedEventId: string | null = null;
    let linkedEventNewStaffIds: string[] = [];
    let linkedEventCapacity: number | null = null;

    if (isTeamTeachLevel2) {
      const { data: nextDayEvent } = await supabaseAdmin
        .from('training_events')
        .select('id, event_date, course_id, location, start_time, end_time, courses(max_attendees)')
        .eq('course_id', event.course_id)
        .eq('location', event.location)
        .eq('start_time', event.start_time)
        .eq('end_time', event.end_time)
        .eq('event_date', nextDayDate)
        .maybeSingle();

      if (nextDayEvent?.id) {
        linkedEventId = nextDayEvent.id;

        const nextDayCourseMaxAttendees = (nextDayEvent.courses as { max_attendees?: number } | null)?.max_attendees || courseMaxAttendees;
        const { data: nextDayOverrides } = await supabaseAdmin
          .from('course_event_overrides')
          .select('max_attendees')
          .eq('course_id', nextDayEvent.course_id)
          .eq('event_date', nextDayEvent.event_date);

        const overrideCapacity = nextDayOverrides && nextDayOverrides.length > 0 ? nextDayOverrides[0].max_attendees : null;
        linkedEventCapacity = overrideCapacity ?? nextDayCourseMaxAttendees;

        const { data: nextDayCurrentBookings, error: nextDayCountError } = await supabaseAdmin
          .from('bookings')
          .select('id', { count: 'exact' })
          .eq('event_id', linkedEventId);

        if (nextDayCountError) {
          return NextResponse.json(
            { error: 'Failed to check linked day capacity' },
            { status: 500 }
          );
        }

        const { data: nextDayExistingBookings } = await supabaseAdmin
          .from('bookings')
          .select('profile_id')
          .eq('event_id', linkedEventId)
          .in('profile_id', newStaffIds);

        const nextDayAlreadyBookedIds = nextDayExistingBookings?.map(b => b.profile_id) || [];
        linkedEventNewStaffIds = newStaffIds.filter((id: string) => !nextDayAlreadyBookedIds.includes(id));

        const nextDayCurrentCount = nextDayCurrentBookings?.length || 0;
        const nextDayTotalAfterBooking = nextDayCurrentCount + linkedEventNewStaffIds.length;

        if (linkedEventCapacity === null) {
          return NextResponse.json(
            { error: 'Missing capacity for linked day event' },
            { status: 500 }
          );
        }

        if (nextDayTotalAfterBooking > linkedEventCapacity) {
          const availableSpots = linkedEventCapacity - nextDayCurrentCount;
          return NextResponse.json(
            {
              error: `Capacity exceeded for Team Teach Level 2 day 2. Capacity: ${linkedEventCapacity}, Current bookings: ${nextDayCurrentCount}, Trying to add: ${linkedEventNewStaffIds.length}, Available spots: ${Math.max(0, availableSpots)}`,
              currentCount: nextDayCurrentCount,
              maxCapacity: linkedEventCapacity,
              availableSpots: Math.max(0, availableSpots),
              tryingToAdd: linkedEventNewStaffIds.length,
              wouldExceedBy: nextDayTotalAfterBooking - linkedEventCapacity
            },
            { status: 400 }
          );
        }
      }
    }

    // All validations passed - create bookings
    const primaryBookingData = newStaffIds.map((id: string) => ({
      event_id: eventId,
      profile_id: id
    }));

    const linkedBookingData =
      linkedEventId && linkedEventNewStaffIds.length > 0
        ? linkedEventNewStaffIds.map((id: string) => ({
            event_id: linkedEventId as string,
            profile_id: id
          }))
        : [];

    const { error: insertError } = await supabaseAdmin
      .from('bookings')
      .insert([...primaryBookingData, ...linkedBookingData]);

    if (insertError) {
      // Check if it's a capacity constraint error from the database trigger
      if (insertError.message && insertError.message.includes('at full capacity')) {
        return NextResponse.json(
          { 
            error: `❌ Course is now full! Another user just booked the last available spot(s). Please refresh and try again.`,
            capacityFull: true
          },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: `Failed to create bookings: ${insertError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message:
        isTeamTeachLevel2 && linkedEventId
          ? `${newStaffIds.length} staff member(s) booked successfully. ${linkedBookingData.length} roster booking(s) were also added to the following day.`
          : `${newStaffIds.length} staff member(s) booked successfully`,
      bookedCount: newStaffIds.length,
      newCapacityCount: currentCount + newStaffIds.length,
      maxCapacity,
      linkedDayBookedCount: linkedBookingData.length,
      linkedDayCapacity: linkedEventCapacity
    });
  } catch (error: any) {
    console.error('Booking error:', error);
    
    // Handle capacity constraint errors
    if (error.message && error.message.includes('at full capacity')) {
      return NextResponse.json(
        { 
          error: `❌ Course is now full! Another user just booked the last available spot(s). Please refresh and try again.`,
          capacityFull: true
        },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
