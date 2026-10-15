import { NextResponse } from 'next/server';
import { createServiceClient, requireRole } from '@/lib/apiAuth';
import { getLocalWallClock, parseEventWallClock } from '@/lib/feedbackAutomation';
import { isAuthorizedCronHeader } from '@/lib/cronAuth';

type NotificationRecipient = {
  id: string;
  full_name?: string | null;
  role_tier?: string | null;
  location?: string | null;
  home_house?: string | null;
  managed_houses?: string[] | null;
};

type EventCourseRow = { name?: string | null };
type EventRow = {
  id: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  courses?: EventCourseRow | EventCourseRow[] | null;
};

function getNotificationGroup(eventId: string, staffId: string) {
  return `training_no_show:${eventId}:${staffId}`;
}

function getRelevantHomeHouses(profile: Partial<NotificationRecipient> | null | undefined) {
  const values = new Set<string>();
  const directLocation = profile?.home_house || profile?.location || '';
  if (directLocation.trim()) values.add(directLocation.trim());
  return Array.from(values);
}

function getCourseName(event: EventRow) {
  const courseData = event.courses;
  if (Array.isArray(courseData)) {
    return courseData[0]?.name || 'Scheduled course';
  }
  return courseData?.name || 'Scheduled course';
}

export async function GET(req: Request) {
  return handleRequest(req);
}

export async function POST(req: Request) {
  return handleRequest(req);
}

async function handleRequest(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    const hasCronSecret = isAuthorizedCronHeader(authHeader);

    if (!hasCronSecret) {
      const authz = await requireRole(['admin']);
      if ('error' in authz) return authz.error;
    }

    const service = createServiceClient();
    const now = getLocalWallClock();
    const targetWindowMinutes = 5;

    const { data: events, error: eventsError } = await service
      .from('training_events')
      .select('id, event_date, start_time, end_time, location, courses(name)');

    if (eventsError) throw eventsError;

    let notificationsCreated = 0;
    let eventsChecked = 0;

    const { data: trainingTeam, error: trainingTeamError } = await service
      .from('profiles')
      .select('id, full_name, role_tier, location, managed_houses')
      .in('role_tier', ['admin', 'scheduler']);

    if (trainingTeamError) throw trainingTeamError;

    const { data: managers, error: managersError } = await service
      .from('profiles')
      .select('id, full_name, role_tier, location, managed_houses')
      .in('role_tier', ['manager']);

    if (managersError) throw managersError;

    const trainingTeamIds = new Set((trainingTeam || []).map((profile) => profile.id).filter(Boolean));

    for (const event of (events || []) as EventRow[]) {
      eventsChecked += 1;
      const eventStart = parseEventWallClock(event.event_date, event.start_time);
      if (!eventStart) continue;

      const targetTimestamp = new Date(eventStart.getTime() + 10 * 60 * 1000);
      const lowerBound = new Date(targetTimestamp.getTime() - targetWindowMinutes * 60 * 1000);
      const upperBound = new Date(targetTimestamp.getTime() + targetWindowMinutes * 60 * 1000);
      if (!(now >= lowerBound && now <= upperBound)) continue;

      const { data: bookings, error: bookingsError } = await service
        .from('bookings')
        .select('id, profile_id, attended_at, absence_reason, profiles:profile_id(id, full_name, role_tier, location, home_house, managed_houses)')
        .eq('event_id', event.id)
        .is('attended_at', null);

      if (bookingsError) throw bookingsError;

      for (const booking of bookings || []) {
        const absenceReason = typeof booking.absence_reason === 'string'
          ? booking.absence_reason.trim()
          : '';

        if (absenceReason) continue;

        const bookingProfile = Array.isArray(booking.profiles) ? booking.profiles[0] : booking.profiles;
        if (!bookingProfile || !bookingProfile.id) continue;

        const staffName = bookingProfile.full_name || 'Staff member';
        const relevantHouses = getRelevantHomeHouses(bookingProfile as Partial<NotificationRecipient> | null);

        const recipientIds = new Set<string>();
        for (const teamMember of trainingTeam || []) {
          if (teamMember?.id) recipientIds.add(teamMember.id);
        }

        for (const manager of managers || []) {
          const managedHouses = Array.isArray(manager.managed_houses) ? manager.managed_houses : [];
          const managerHouseSet = new Set([...managedHouses, manager.location || '']);
          const isRelevantManager = relevantHouses.some((house) => managerHouseSet.has(house));
          if (isRelevantManager && manager.id) recipientIds.add(manager.id);
        }

        const groupKey = getNotificationGroup(event.id, bookingProfile.id);
        const { data: existingNotifications, error: existingError } = await service
          .from('notifications')
          .select('id')
          .eq('notification_group', groupKey)
          .limit(1);

        if (existingError) throw existingError;
        if ((existingNotifications || []).length > 0) continue;

        const courseName = getCourseName(event);
        const eventDate = event.event_date;
        const eventTime = event.start_time || 'scheduled time';

        for (const recipientId of Array.from(recipientIds)) {
          const isTrainingTeam = trainingTeamIds.has(recipientId);
          const { error: insertError } = await service.from('notifications').insert({
            recipient_user_id: recipientId,
            type: isTrainingTeam ? 'training_no_show_team' : 'training_no_show_manager',
            event_id: event.id,
            notification_group: groupKey,
            title: `No-show alert: ${staffName}`,
            body: `${staffName} did not arrive for ${courseName} on ${eventDate} at ${eventTime}.`,
            link: '/apps/booking-calendar',
            metadata: {
              event_id: event.id,
              course_name: courseName,
              staff_name: staffName,
              event_date: eventDate,
              start_time: eventTime,
              alert_type: 'training_no_show',
            },
          });

          if (insertError) throw insertError;
          notificationsCreated += 1;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      message: 'No-show notification check complete',
      eventsChecked,
      notificationsCreated,
    });
  } catch (error) {
    console.error('Roster no-show notification automation error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
