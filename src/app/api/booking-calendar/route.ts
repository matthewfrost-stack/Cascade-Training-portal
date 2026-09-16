import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, getScopedLocations, requireRole } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

function isIsoDate(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

const bookingEventSelection = 'id, event_date, start_time, end_time, am_break_minutes, pm_break_minutes, location, venue_id, course_id, notes, courses(id, name, max_attendees), bookings(id, event_id, profile_id, attended_at, minutes_late, late_reason, lateness_minutes, lateness_reason, absence_reason, attendance_source, attendance_marked_at, profiles:profile_id(id, full_name, location))';
const legacyBookingEventSelection = 'id, event_date, start_time, end_time, location, venue_id, course_id, notes, courses(id, name, max_attendees), bookings(id, event_id, profile_id, attended_at, minutes_late, late_reason, lateness_minutes, lateness_reason, absence_reason, attendance_source, attendance_marked_at, profiles:profile_id(id, full_name, location))';

function isMissingBreakColumnsError(error: { code?: string; message?: string } | null) {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === '42703'
    || error?.code === 'PGRST204'
    || (message.includes('am_break_minutes') && message.includes('does not exist'))
    || (message.includes('pm_break_minutes') && message.includes('does not exist'));
}

export async function GET(request: NextRequest) {
  try {
    const authz = await requireRole(['admin', 'manager', 'scheduler', 'staff']);
    if ('error' in authz) return authz.error;

    const startDate = request.nextUrl.searchParams.get('startDate');
    const endDate = request.nextUrl.searchParams.get('endDate');
    if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
      return NextResponse.json({ error: 'startDate and endDate are required as YYYY-MM-DD' }, { status: 400 });
    }

    const supabase = createServiceClient();
    let managerStaffIds: Set<string> | null = null;
    let query = supabase
      .from('training_events')
      // Keep the calendar response focused on fields used by the calendar and
      // roster modal. The previous `*` selection returned every course and
      // booking column for the whole month on every navigation.
      .select(bookingEventSelection)
      .gte('event_date', startDate)
      .lte('event_date', endDate)
      .order('event_date', { ascending: true });

    if (authz.role === 'staff') {
      // Staff can only discover events where their own profile is booked. The
      // lower bound also prevents staff from browsing historical sessions by
      // changing the calendar month.
      const today = new Date().toISOString().split('T')[0];
      const effectiveStartDate = startDate > today ? startDate : today;

      const { data: ownBookings, error: bookingError } = await supabase
        .from('bookings')
        .select('event_id')
        .eq('profile_id', authz.userId);

      if (bookingError) {
        console.error('Error fetching staff calendar bookings:', bookingError);
        return NextResponse.json({ error: 'Failed to fetch booking calendar' }, { status: 500 });
      }

      const ownEventIds = [...new Set((ownBookings || []).map((booking) => booking.event_id).filter(Boolean))];
      if (ownEventIds.length === 0 || endDate < effectiveStartDate) {
        return NextResponse.json({ events: [], userRole: authz.role });
      }

      query = query
        .gte('event_date', effectiveStartDate)
        .in('id', ownEventIds);
    } else if (authz.role === 'manager') {
      // Events are currently stored with a venue/name rather than a location
      // foreign key. Use booked staff as the reliable location relationship:
      // a manager can see an event when at least one attendee belongs to one of
      // the manager's assigned locations. The response is also trimmed so a
      // cross-location event cannot expose attendees from another location.
      const scopedLocations = await getScopedLocations(authz.userId, authz.role, supabase);
      if (scopedLocations.all || scopedLocations.locations.length === 0) {
        return NextResponse.json({ events: [], userRole: authz.role });
      }

      const { data: scopedStaff, error: scopedStaffError } = await supabase
        .from('staff_locations')
        .select('staff_id')
        .in('location_id', scopedLocations.locations.map((location) => location.id));

      if (scopedStaffError) {
        console.error('Error resolving manager calendar scope:', scopedStaffError);
        return NextResponse.json({ error: 'Failed to fetch booking calendar' }, { status: 500 });
      }

      managerStaffIds = new Set((scopedStaff || []).map((row) => row.staff_id).filter(Boolean));
      const { data: staffWithScopedPrimaryLocation } = await supabase
        .from('profiles')
        .select('id')
        .in('location', scopedLocations.locations.map((location) => location.name));
      (staffWithScopedPrimaryLocation || []).forEach((profile) => {
        if (profile.id) managerStaffIds?.add(profile.id);
      });
      if (managerStaffIds.size === 0) {
        return NextResponse.json({ events: [], userRole: authz.role });
      }
    }

    let events: any[] | null = null;
    let error: { code?: string; message?: string } | null = null;
    ({ data: events, error } = await query);
    if (error && isMissingBreakColumnsError(error)) {
      let legacyQuery = supabase
        .from('training_events')
        .select(legacyBookingEventSelection)
        .gte('event_date', startDate)
        .lte('event_date', endDate)
        .order('event_date', { ascending: true });

      if (authz.role === 'staff') {
        const today = new Date().toISOString().split('T')[0];
        legacyQuery = legacyQuery.gte('event_date', startDate > today ? startDate : today);
        const { data: ownBookings } = await supabase.from('bookings').select('event_id').eq('profile_id', authz.userId);
        legacyQuery = legacyQuery.in('id', (ownBookings || []).map((booking) => booking.event_id).filter(Boolean));
      }
      // Manager scope is applied again below after the fallback query.
      ({ data: events, error } = await legacyQuery);
    }
    if (error) {
      console.error('Error fetching booking calendar:', error);
      return NextResponse.json({ error: 'Failed to fetch booking calendar' }, { status: 500 });
    }

    const visibleEvents = authz.role === 'manager'
      ? (events || [])
          // Managers may see the complete roster, including staff from other
          // locations, but only for events connected to one of their staff.
          .filter((event) => (event.bookings || []).some((booking: { profile_id?: string }) =>
            Boolean(booking.profile_id && managerStaffIds?.has(booking.profile_id))
          ))
      : authz.role === 'staff'
      ? (events || []).map((event) => ({
          ...event,
          // The service client bypasses RLS, so explicitly remove everyone
          // else's booking before returning the response to staff.
          bookings: (event.bookings || []).filter((booking: { profile_id?: string }) => booking.profile_id === authz.userId),
        }))
      : (events || []);
    const courseIds = [...new Set(visibleEvents.map((event) => event.course_id).filter(Boolean))];
    let eventsWithOverrides = visibleEvents;
    if (courseIds.length > 0) {
      const { data: overrides, error: overrideError } = await supabase
        .from('course_event_overrides')
        .select('course_id, event_date, max_attendees')
        .in('course_id', courseIds)
        .gte('event_date', startDate)
        .lte('event_date', endDate);

      if (overrideError) {
        console.warn('Could not load booking capacity overrides:', overrideError.message);
      } else {
        const overrideMap = new Map(
          (overrides || []).map((override) => [`${override.course_id}|${override.event_date}`, override])
        );
        eventsWithOverrides = eventsWithOverrides.map((event) => ({
          ...event,
          course_event_overrides: [overrideMap.get(`${event.course_id}|${event.event_date}`)].filter(Boolean),
        }));
      }
    }

    return NextResponse.json({ events: eventsWithOverrides, userRole: authz.role });
  } catch (error) {
    console.error('Error in booking calendar endpoint:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
