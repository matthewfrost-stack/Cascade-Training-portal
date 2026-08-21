import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireRole } from '@/lib/apiAuth';
import { sendEmail, getEmailSendOptionsFromHeaders } from '@/lib/email';
import {
  applyTemplate,
  formatEventDate,
  formatEventTime,
  getDateString,
  getFeedbackMinutesBeforeEnd,
  getLocalWallClock,
  getManagerEmail,
  getReminderDaysBefore,
  isWithinScheduleWindow,
  parseEventWallClock,
  type FeedbackAutomationSettings,
} from '@/lib/feedbackAutomation';

type AutomationEvent = {
  id: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  feedback_sent_at: string | null;
  reminder_7_days_sent_at: string | null;
  reminder_1_day_sent_at: string | null;
  courses: { name?: string | null } | null;
};

type BookingProfile = {
  email: string | null;
  full_name: string | null;
  location: string | null;
};

type Booking = {
  profiles: BookingProfile | null;
};

type AutomationKind = 'reminder_7_days' | 'reminder_1_day' | 'feedback';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function makeEmailHtml(body: string) {
  return `
    <div style="font-family: sans-serif; padding: 20px; border: 1px solid #dbeafe; border-radius: 10px; background-color: #f8fafc;">
      ${escapeHtml(body).replace(/\n/g, '<br>')}
      <p style="font-size: 11px; color: #64748b; margin-top: 20px;">Training Portal</p>
    </div>
  `;
}

function makeFeedbackHtml(body: string, feedbackLink: string) {
  return `
    <div style="font-family: sans-serif; padding: 20px; border: 1px solid #dbeafe; border-radius: 10px; background-color: #f8fafc;">
      ${escapeHtml(body).replace(/\n/g, '<br>')}
      <div style="margin: 25px 0;">
        <a href="${escapeHtml(feedbackLink)}" style="background-color: #ec4899; color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
          Submit Feedback
        </a>
      </div>
      <p style="font-size: 11px; color: #64748b; margin-top: 20px;">Training Portal</p>
    </div>
  `;
}

function getAutomationTarget(event: AutomationEvent, kind: AutomationKind, settings: FeedbackAutomationSettings, now: Date) {
  if (kind === 'feedback') {
    const end = parseEventWallClock(event.event_date, event.end_time);
    if (!end) return false;
    const target = new Date(end.getTime() - getFeedbackMinutesBeforeEnd(settings) * 60 * 1000);
    return isWithinScheduleWindow(now, target);
  }

  const start = parseEventWallClock(event.event_date, event.start_time);
  if (!start) return false;
  const reminderType = kind === 'reminder_7_days' ? 'seven_days' : 'one_day';
  const daysBefore = getReminderDaysBefore(settings, reminderType);
  const target = new Date(start.getTime() - daysBefore * 24 * 60 * 60 * 1000);
  return isWithinScheduleWindow(now, target);
}

function getTemplateValues(event: AutomationEvent, staffName: string, staffList = '') {
  return {
    staff_name: staffName,
    course_name: event.courses?.name || 'Training Course',
    event_date: formatEventDate(event.event_date),
    start_time: formatEventTime(event.start_time) || 'the scheduled start time',
    end_time: formatEventTime(event.end_time) || 'the scheduled end time',
    staff_list: staffList,
  };
}

async function sendReminderEmails(
  event: AutomationEvent,
  bookings: Booking[],
  settings: FeedbackAutomationSettings,
  emailOptions: ReturnType<typeof getEmailSendOptionsFromHeaders>
) {
  const reminderSubject = String(settings.reminder_subject || 'Training reminder: {{course_name}}');
  const reminderBody = String(settings.reminder_body || 'Hi {{staff_name}},\n\nThis is a reminder that you are scheduled to attend {{course_name}} on {{event_date}} from {{start_time}} to {{end_time}}.\n\nBest regards,\nThe Training Team');
  const managerSubject = String(settings.manager_reminder_subject || 'Training reminder for {{course_name}}');
  const managerBody = String(settings.manager_reminder_body || 'The following staff are scheduled to attend {{course_name}} on {{event_date}} from {{start_time}} to {{end_time}}:\n\n{{staff_list}}\n\nThe Training Team');

  const managerStaff = new Map<string, string[]>();
  let attempted = 0;
  let succeeded = 0;

  for (const booking of bookings) {
    const profile = booking.profiles;
    if (!profile) continue;

    const staffName = profile.full_name || 'Staff Member';
    const managerEmail = getManagerEmail(profile.location);
    if (managerEmail) {
      const names = managerStaff.get(managerEmail) || [];
      if (!names.includes(staffName)) names.push(staffName);
      managerStaff.set(managerEmail, names);
    }

    if (!profile.email) continue;
    attempted++;
    const values = getTemplateValues(event, staffName);
    const body = applyTemplate(reminderBody, values);
    if (await sendEmail(profile.email, applyTemplate(reminderSubject, values), makeEmailHtml(body), emailOptions)) {
      succeeded++;
    }
  }

  for (const [managerEmail, names] of managerStaff) {
    attempted++;
    const values = getTemplateValues(event, 'Manager Team', names.map((name) => `• ${name}`).join('\n'));
    const body = applyTemplate(managerBody, values);
    if (await sendEmail(managerEmail, applyTemplate(managerSubject, values), makeEmailHtml(body), emailOptions)) {
      succeeded++;
    }
  }

  return { attempted, succeeded };
}

async function sendFeedbackEmails(
  event: AutomationEvent,
  bookings: Booking[],
  settings: FeedbackAutomationSettings,
  emailOptions: ReturnType<typeof getEmailSendOptionsFromHeaders>,
  baseUrl: string
) {
  const courseName = event.courses?.name || 'Training Course';
  const feedbackLink = `${baseUrl}/feedback?event=${event.id}&course=${encodeURIComponent(courseName)}&date=${event.event_date}`;
  const subjectTemplate = String(settings.email_subject || 'Feedback for {{course_name}}');
  const bodyTemplate = String(settings.email_body || 'Hi {{staff_name}},\n\nThank you for attending {{course_name}} today. We would love to hear your feedback.');
  let attempted = 0;
  let succeeded = 0;

  for (const booking of bookings) {
    const profile = booking.profiles;
    if (!profile?.email) continue;
    attempted++;
    const values = { ...getTemplateValues(event, profile.full_name || 'Staff Member'), feedback_link: feedbackLink };
    const body = applyTemplate(bodyTemplate, values);
    const subject = applyTemplate(subjectTemplate, values);
    if (await sendEmail(profile.email, subject, makeFeedbackHtml(body, feedbackLink), emailOptions)) {
      succeeded++;
    }
  }

  return { attempted, succeeded };
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
    const cronSecret = process.env.CRON_SECRET;
    const hasCronSecret = Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);
    let eventId: string | null = null;

    try {
      if (req.method === 'POST') {
        const body = (await req.json()) as { eventId?: string };
        eventId = body.eventId ?? null;
      }
    } catch {
      // GET requests and empty POST bodies are automatic runs.
    }

    if (!hasCronSecret) {
      const authz = await requireRole(['admin']);
      if ('error' in authz) return authz.error;
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    const { data: settings, error: settingsError } = await supabase
      .from('feedback_automation_settings')
      .select('*')
      .limit(1)
      .maybeSingle();
    if (settingsError) throw settingsError;

    if (!settings && !eventId) {
      return NextResponse.json({ error: 'Automation settings not found' }, { status: 404 });
    }

    const automationSettings = (settings || {}) as FeedbackAutomationSettings;
    if (!eventId && !automationSettings.is_enabled) {
      return NextResponse.json({ message: 'Automation is disabled', count: 0 });
    }

    let eventsToCheck: AutomationEvent[] = [];
    if (eventId) {
      const { data: event, error: eventError } = await supabase
        .from('training_events')
        .select('id, event_date, start_time, end_time, location, feedback_sent_at, reminder_7_days_sent_at, reminder_1_day_sent_at, courses(name)')
        .eq('id', eventId)
        .single();
      if (eventError) throw eventError;
      if (event) eventsToCheck = [event as AutomationEvent];
    } else {
      const now = getLocalWallClock();
      const maxDaysBefore = Math.max(
        getReminderDaysBefore(automationSettings, 'seven_days'),
        getReminderDaysBefore(automationSettings, 'one_day')
      );
      const rangeStart = new Date(now);
      rangeStart.setUTCDate(rangeStart.getUTCDate() - 1);
      const rangeEnd = new Date(now);
      rangeEnd.setUTCDate(rangeEnd.getUTCDate() + maxDaysBefore + 1);

      const { data: events, error: eventsError } = await supabase
        .from('training_events')
        .select('id, event_date, start_time, end_time, location, feedback_sent_at, reminder_7_days_sent_at, reminder_1_day_sent_at, courses(name)')
        .gte('event_date', getDateString(rangeStart))
        .lte('event_date', getDateString(rangeEnd));
      if (eventsError) throw eventsError;
      eventsToCheck = (events || []) as AutomationEvent[];
    }

    if (eventsToCheck.length === 0) {
      return NextResponse.json({ message: 'No events found to process', count: 0 });
    }

    const now = getLocalWallClock();
    const emailOptions = getEmailSendOptionsFromHeaders(
      req.headers.get('x-email-test-mode'),
      req.headers.get('x-test-email-address')
    );
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://training-portal.vercel.app';
    let totalSent = 0;
    let totalProcessed = 0;

    for (const event of eventsToCheck) {
      const dueKinds: AutomationKind[] = [];
      if (eventId) {
        dueKinds.push('feedback');
      } else {
        if (!event.reminder_7_days_sent_at && getAutomationTarget(event, 'reminder_7_days', automationSettings, now)) {
          dueKinds.push('reminder_7_days');
        }
        if (!event.reminder_1_day_sent_at && getAutomationTarget(event, 'reminder_1_day', automationSettings, now)) {
          dueKinds.push('reminder_1_day');
        }
        if (!event.feedback_sent_at && getAutomationTarget(event, 'feedback', automationSettings, now)) {
          dueKinds.push('feedback');
        }
      }

      for (const kind of dueKinds) {
        const bookingQuery = supabase
          .from('bookings')
          .select('profiles(email, full_name, location)')
          .eq('event_id', event.id);
        const { data: bookings, error: bookingsError } = kind === 'feedback'
          ? await bookingQuery.not('attended_at', 'is', null)
          : await bookingQuery;
        if (bookingsError) throw bookingsError;

        const typedBookings: Booking[] = (bookings || []).map((booking) => ({
          profiles: Array.isArray(booking.profiles) ? booking.profiles[0] || null : booking.profiles,
        }));
        if (typedBookings.length === 0) continue;

        const result = kind === 'feedback'
          ? await sendFeedbackEmails(event, typedBookings, automationSettings, emailOptions, baseUrl)
          : await sendReminderEmails(event, typedBookings, automationSettings, emailOptions);

        if (result.attempted > 0 && result.succeeded === result.attempted) {
          const trackingField = kind === 'feedback'
            ? 'feedback_sent_at'
            : kind === 'reminder_7_days' ? 'reminder_7_days_sent_at' : 'reminder_1_day_sent_at';
          const { error: updateError } = await supabase
            .from('training_events')
            .update({ [trackingField]: new Date().toISOString() })
            .eq('id', event.id);
          if (updateError) throw updateError;
          totalProcessed++;
        }
        totalSent += result.succeeded;
      }
    }

    return NextResponse.json({
      message: 'Feedback automation processed successfully',
      events: eventsToCheck.length,
      automations: totalProcessed,
      count: totalSent,
    });
  } catch (err) {
    console.error('Feedback automation error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
