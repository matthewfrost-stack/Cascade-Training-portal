import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, getScopedLocations, requireRole } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

function isIsoDate(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

type SummaryCourse = { id: string; name: string; max_attendees: number | null };

type SummaryEvent = {
  id: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  venue_id: string | null;
  course_id: string | null;
  notes: string | null;
  courses?: SummaryCourse | null;
  bookings?: { count: number }[];
  booking_count?: number;
  course_event_overrides?: { course_id: string; event_date: string; max_attendees: number }[];
};

type SummaryEventRow = Omit<SummaryEvent, 'courses'> & {
  courses?: SummaryCourse | SummaryCourse[] | null;
};

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
    let eventIds: string[] | null = null;
    let effectiveStartDate = startDate;

    if (authz.role === 'staff') {
      // Staff should only see their own upcoming bookings. The count is still
      // useful for non-staff views, but no roster rows are returned here.
      const today = new Date().toISOString().split('T')[0];
      effectiveStartDate = startDate > today ? startDate : today;
      if (endDate < effectiveStartDate) {
        return NextResponse.json({ events: [], userRole: authz.role });
      }

      const { data: ownBookings, error: bookingError } = await supabase
        .from('bookings')
        .select('event_id')
        .eq('profile_id', authz.userId);

      if (bookingError) {
        console.error('Error fetching staff calendar summary bookings:', bookingError);
        return NextResponse.json({ error: 'Failed to fetch booking calendar' }, { status: 500 });
      }

      eventIds = [...new Set((ownBookings || []).map((booking) => booking.event_id).filter(Boolean))];
      if (eventIds.length === 0) {
        return NextResponse.json({ events: [], userRole: authz.role });
      }
    } else if (authz.role === 'manager') {
      const scopedLocations = await getScopedLocations(authz.userId, authz.role, supabase);
      if (scopedLocations.all || scopedLocations.locations.length === 0) {
        return NextResponse.json({ events: [], userRole: authz.role });
      }

      const locationIds = scopedLocations.locations.map((location) => location.id);
      const locationNames = scopedLocations.locations.map((location) => location.name);
      const [{ data: scopedStaff, error: scopedStaffError }, { data: staffWithScopedPrimaryLocation }] = await Promise.all([
        supabase
          .from('staff_locations')
          .select('staff_id')
          .in('location_id', locationIds),
        supabase
          .from('profiles')
          .select('id')
          .in('location', locationNames),
      ]);

      if (scopedStaffError) {
        console.error('Error resolving manager calendar summary scope:', scopedStaffError);
        return NextResponse.json({ error: 'Failed to fetch booking calendar' }, { status: 500 });
      }

      const managerStaffIds = new Set<string>(
        (scopedStaff || []).map((row) => row.staff_id).filter(Boolean)
      );
      (staffWithScopedPrimaryLocation || []).forEach((profile) => {
        if (profile.id) managerStaffIds.add(profile.id);
      });

      if (managerStaffIds.size === 0) {
        return NextResponse.json({ events: [], userRole: authz.role });
      }

      const { data: scopedBookings, error: scopedBookingError } = await supabase
        .from('bookings')
        .select('event_id')
        .in('profile_id', [...managerStaffIds]);

      if (scopedBookingError) {
        console.error('Error fetching manager calendar summary bookings:', scopedBookingError);
        return NextResponse.json({ error: 'Failed to fetch booking calendar' }, { status: 500 });
      }

      eventIds = [...new Set((scopedBookings || []).map((booking) => booking.event_id).filter(Boolean))];
      if (eventIds.length === 0) {
        return NextResponse.json({ events: [], userRole: authz.role });
      }
    }

    let query = supabase
      .from('training_events')
      // The initial calendar only needs event details, course details, and a
      // server-side booking count. Full rosters are loaded on event open.
      .select('id, event_date, start_time, end_time, location, venue_id, course_id, notes, courses(id, name, max_attendees), bookings(count)')
      .gte('event_date', effectiveStartDate)
      .lte('event_date', endDate)
      .order('event_date', { ascending: true });

    if (eventIds) query = query.in('id', eventIds);

    const { data: events, error } = await query;
    if (error) {
      console.error('Error fetching booking calendar summary:', error);
      return NextResponse.json({ error: 'Failed to fetch booking calendar' }, { status: 500 });
    }

    const normalizedEvents = ((events || []) as unknown as SummaryEventRow[]).map((event) => ({
      ...event,
      courses: Array.isArray(event.courses) ? event.courses[0] || null : event.courses || null,
      booking_count: Number(event.bookings?.[0]?.count || 0),
      bookings: undefined,
    }));
    const courseIds = [...new Set(normalizedEvents.map((event) => event.course_id).filter(Boolean))];

    if (courseIds.length > 0) {
      const { data: overrides, error: overrideError } = await supabase
        .from('course_event_overrides')
        .select('course_id, event_date, max_attendees')
        .in('course_id', courseIds)
        .gte('event_date', effectiveStartDate)
        .lte('event_date', endDate);

      if (overrideError) {
        console.warn('Could not load booking capacity overrides:', overrideError.message);
      } else {
        const overrideMap = new Map(
          (overrides || []).map((override) => [`${override.course_id}|${override.event_date}`, override])
        );
        normalizedEvents.forEach((event) => {
          const override = overrideMap.get(`${event.course_id}|${event.event_date}`);
          if (override) event.course_event_overrides = [override];
        });
      }
    }

    return NextResponse.json({ events: normalizedEvents, userRole: authz.role });
  } catch (error) {
    console.error('Error in booking calendar summary endpoint:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
