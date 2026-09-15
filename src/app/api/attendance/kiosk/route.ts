import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, requireRole } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

type AttendanceBooking = {
  id: string;
  event_id: string;
  profile_id: string;
  attended_at: string | null;
  minutes_late: number | null;
  late_reason: string | null;
  lateness_minutes: number | null;
  lateness_reason: string | null;
  absence_reason: string | null;
  attendance_source: string | null;
  attendance_marked_at: string | null;
  profile?: {
    id: string;
    full_name: string;
    location: string | null;
  };
};

function normalizeProfile(value: unknown): AttendanceBooking['profile'] | undefined {
  const profile = Array.isArray(value) ? value[0] : value;
  if (!profile || typeof profile !== 'object') return undefined;
  const row = profile as Record<string, unknown>;
  if (typeof row.id !== 'string' || typeof row.full_name !== 'string') return undefined;
  return {
    id: row.id,
    full_name: row.full_name,
    location: typeof row.location === 'string' ? row.location : null,
  };
}

async function getKioskEvent(eventId: string) {
  const service = createServiceClient();
  const { data: event, error: eventError } = await service
    .from('training_events')
    .select('id, event_date, start_time, end_time, am_break_minutes, pm_break_minutes, location, courses(name)')
    .eq('id', eventId)
    .single();

  if (eventError || !event) return { service, event: null, bookings: [], error: eventError };

  const { data: bookings, error: bookingsError } = await service
    .from('bookings')
    .select('id, event_id, profile_id, attended_at, minutes_late, late_reason, lateness_minutes, lateness_reason, absence_reason, attendance_source, attendance_marked_at')
    .eq('event_id', eventId);
  if (bookingsError) return { service, event, bookings: [], error: bookingsError };

  const profileIds = [...new Set((bookings || []).map((booking) => booking.profile_id).filter(Boolean))];
  const { data: profiles, error: profilesError } = profileIds.length > 0
    ? await service.from('profiles').select('id, full_name, location').in('id', profileIds)
    : { data: [], error: null };
  if (profilesError) return { service, event, bookings: [], error: profilesError };

  const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));
  const normalizedBookings = (bookings || [])
    .map((booking) => ({
      ...booking,
      profile: normalizeProfile(profileMap.get(booking.profile_id)),
    }))
    .sort((a, b) => String(a.profile?.full_name || '').localeCompare(String(b.profile?.full_name || '')));

  return { service, event, bookings: normalizedBookings, error: null };
}

function formatEvent(event: Record<string, unknown>) {
  const course = Array.isArray(event.courses) ? event.courses[0] : event.courses;
  return {
    id: event.id,
    courseName: (course as { name?: string } | null)?.name || 'Training course',
    eventDate: event.event_date,
    startTime: event.start_time,
    endTime: event.end_time,
    amBreakMinutes: Number(event.am_break_minutes) || 0,
    pmBreakMinutes: Number(event.pm_break_minutes) || 0,
    location: event.location,
  };
}

function formatBooking(booking: AttendanceBooking) {
  const minutesLate = booking.minutes_late ?? booking.lateness_minutes ?? 0;
  return {
    id: booking.id,
    profileId: booking.profile_id,
    fullName: booking.profile?.full_name || 'Unnamed staff member',
    location: booking.profile?.location || 'Unassigned',
    attendedAt: booking.attended_at,
    minutesLate,
    lateReason: booking.late_reason ?? booking.lateness_reason,
    absenceReason: booking.absence_reason,
    attendanceSource: booking.attendance_source || 'manual',
    attendanceMarkedAt: booking.attendance_marked_at,
  };
}

export async function GET(request: NextRequest) {
  const authz = await requireRole(['admin', 'scheduler']);
  if ('error' in authz) return authz.error;

  const eventId = request.nextUrl.searchParams.get('eventId');
  if (!eventId) return NextResponse.json({ error: 'eventId is required' }, { status: 400 });

  const result = await getKioskEvent(eventId);
  if (!result.event) return NextResponse.json({ error: 'Training event not found' }, { status: 404 });
  if (result.error) {
    console.error('Could not load kiosk register:', result.error);
    return NextResponse.json({ error: 'Could not load register' }, { status: 500 });
  }

  return NextResponse.json({
    event: formatEvent(result.event as unknown as Record<string, unknown>),
    bookings: result.bookings.map((booking) => formatBooking(booking as AttendanceBooking)),
    userRole: authz.role,
  });
}

export async function PATCH(request: NextRequest) {
  const authz = await requireRole(['admin', 'scheduler']);
  if ('error' in authz) return authz.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const bookingId = typeof body.bookingId === 'string' ? body.bookingId : '';
  const present = body.present;
  if (!bookingId || typeof present !== 'boolean') {
    return NextResponse.json({ error: 'bookingId and present are required' }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: booking, error: bookingError } = await service
    .from('bookings')
    .select('id, event_id')
    .eq('id', bookingId)
    .single();
  if (bookingError || !booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });

  const rawMinutes = body.minutesLate;
  const minutesLate = rawMinutes === undefined || rawMinutes === null || rawMinutes === ''
    ? 0
    : Number(rawMinutes);
  if (!Number.isInteger(minutesLate) || minutesLate < 0 || minutesLate > 1440) {
    return NextResponse.json({ error: 'minutesLate must be a whole number from 0 to 1440' }, { status: 400 });
  }

  const lateReason = typeof body.lateReason === 'string' ? body.lateReason.trim().slice(0, 120) : '';
  const absenceReason = typeof body.absenceReason === 'string' ? body.absenceReason.trim().slice(0, 120) : '';
  const markedAt = new Date().toISOString();
  const updates = present
    ? {
        attended_at: markedAt,
        minutes_late: minutesLate,
        late_reason: minutesLate > 0 ? (lateReason || 'Kiosk register') : null,
        lateness_minutes: minutesLate,
        lateness_reason: minutesLate > 0 ? (lateReason || 'Kiosk register') : null,
        absence_reason: null,
        attendance_source: 'kiosk',
        attendance_marked_at: markedAt,
        attendance_marked_by: authz.userId,
      }
    : {
        attended_at: null,
        minutes_late: 0,
        late_reason: null,
        lateness_minutes: 0,
        lateness_reason: null,
        absence_reason: absenceReason || null,
        attendance_source: 'kiosk',
        attendance_marked_at: markedAt,
        attendance_marked_by: authz.userId,
      };

  const { error: updateError } = await service.from('bookings').update(updates).eq('id', bookingId);
  if (updateError) {
    console.error('Could not update kiosk attendance:', updateError);
    return NextResponse.json({ error: 'Could not update attendance' }, { status: 500 });
  }

  const result = await getKioskEvent(booking.event_id);
  const updated = result.bookings.find((row) => row.id === bookingId);
  return NextResponse.json({ booking: updated ? formatBooking(updated as AttendanceBooking) : null });
}
