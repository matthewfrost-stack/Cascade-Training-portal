import { NextResponse } from 'next/server';
import { requireRole, createServiceClient } from '@/lib/apiAuth';
import { sendEmail, getEmailSendOptionsFromHeaders, escapeHtml, isTestSend } from '@/lib/email';
import {
  applyTemplate,
  formatEventDate,
  formatEventTime,
  getDateString,
  getFeedbackMinutesBeforeEnd,
  getLocalWallClock,
  getReminderDaysBefore,
  parseEventWallClock,
  type FeedbackAutomationSettings,
} from '@/lib/feedbackAutomation';
import { isAuthorizedCronHeader } from '@/lib/cronAuth';

/**
 * Training emails, run every 10 minutes by .github/workflows/cron.yml (and by
 * admins from the Feedback screen). Two separate switches:
 *   is_enabled         -> feedback email to people signed in on the register
 *   reminders_enabled  -> booking reminders (staff N days before + a list to
 *                         each home's manager Google Group, locations.manager_email)
 * An email is "due" from its target time for up to CATCH_UP_HOURS, so a late
 * GitHub run still sends it; *_sent_at on the session stops it going twice.
 * Test sends (test mode) go to one address, send one sample of each kind and
 * do NOT mark the session as sent.
 *
 *   GET / POST {}            -> automatic run (cron secret or admin)
 *   POST { eventId }         -> send the feedback email for one session now (admin)
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const CATCH_UP_HOURS = 12;

type Settings = FeedbackAutomationSettings & { reminders_enabled?: boolean | null };

type AutomationEvent = {
  id: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  feedback_sent_at: string | null;
  reminder_7_days_sent_at: string | null;
  reminder_1_day_sent_at: string | null;
  courses: { name?: string | null } | { name?: string | null }[] | null;
};

type Person = { email: string | null; full_name: string | null; location: string | null };
type AutomationKind = 'reminder_7_days' | 'reminder_1_day' | 'feedback';
type EmailOptions = ReturnType<typeof getEmailSendOptionsFromHeaders>;

const EVENT_COLUMNS = 'id, event_date, start_time, end_time, feedback_sent_at, reminder_7_days_sent_at, reminder_1_day_sent_at, courses(name)';

const courseName = (event: AutomationEvent) => (Array.isArray(event.courses) ? event.courses[0] : event.courses)?.name || 'Training Course';

const wrap = (inner: string) => `
  <div style="font-family: Arial, sans-serif; max-width: 560px; padding: 24px; border: 1px solid #dbeafe; border-radius: 12px; background-color: #f8fafc; color: #0f172a; line-height: 1.5;">
    ${inner}
    <p style="font-size: 11px; color: #64748b; margin-top: 24px;">Cascade Training Portal</p>
  </div>`;

const textToHtml = (body: string) => escapeHtml(body).replace(/\n/g, '<br>');

function feedbackHtml(body: string, link: string) {
  return wrap(`
    ${textToHtml(body)}
    <div style="margin: 24px 0;">
      <a href="${escapeHtml(link)}" style="background-color: #2563eb; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">Give feedback</a>
    </div>
    <p style="font-size: 13px; color: #475569;">It takes about two minutes. You can choose to answer anonymously.</p>`);
}

/** Is this kind of email due for the session now (target time passed, within the catch-up window)? */
function isDue(event: AutomationEvent, kind: AutomationKind, settings: Settings, now: Date) {
  let target: Date | null = null;
  if (kind === 'feedback') {
    const end = parseEventWallClock(event.event_date, event.end_time);
    if (end) target = new Date(end.getTime() - getFeedbackMinutesBeforeEnd(settings) * 60_000);
  } else {
    const start = parseEventWallClock(event.event_date, event.start_time);
    if (!start || now >= start) return false; // never remind after it has started
    const days = getReminderDaysBefore(settings, kind === 'reminder_7_days' ? 'seven_days' : 'one_day');
    target = new Date(start.getTime() - days * 86_400_000);
  }
  if (!target) return false;
  return now >= target && now.getTime() - target.getTime() <= CATCH_UP_HOURS * 3_600_000;
}

function templateValues(event: AutomationEvent, staffName: string, staffList = '') {
  return {
    staff_name: staffName,
    course_name: courseName(event),
    event_date: formatEventDate(event.event_date),
    start_time: formatEventTime(event.start_time) || 'the scheduled start time',
    end_time: formatEventTime(event.end_time) || 'the scheduled end time',
    staff_list: staffList,
  };
}

type Service = ReturnType<typeof createServiceClient>;

/** Home name (lower case) -> that home's manager Google Group, from Manage Venues. */
async function managerGroups(service: Service) {
  const map = new Map<string, string>();
  const { data, error } = await service.from('locations').select('name, manager_email');
  if (error) return map; // column not added yet: no manager emails
  for (const row of data || []) {
    const email = String(row.manager_email || '').trim();
    if (row.name && email) map.set(String(row.name).trim().toLowerCase(), email);
  }
  return map;
}

async function sendReminders(event: AutomationEvent, people: Person[], settings: Settings, groups: Map<string, string>, options: EmailOptions, test: boolean) {
  const subject = String(settings.reminder_subject || 'Training reminder: {{course_name}}');
  const body = String(settings.reminder_body || 'Hi {{staff_name}},\n\nThis is a reminder that you are booked on {{course_name}} on {{event_date}} from {{start_time}} to {{end_time}}.\n\nBest regards,\nThe Training Team');
  const managerSubject = String(settings.manager_reminder_subject || 'Training reminder for {{course_name}}');
  const managerBody = String(settings.manager_reminder_body || 'The following staff are booked on {{course_name}} on {{event_date}} from {{start_time}} to {{end_time}}:\n\n{{staff_list}}\n\nThe Training Team');

  let attempted = 0;
  let succeeded = 0;
  const byGroup = new Map<string, string[]>();

  for (const person of people) {
    const name = person.full_name || 'Staff Member';
    const group = groups.get(String(person.location || '').trim().toLowerCase());
    if (group) byGroup.set(group, [...(byGroup.get(group) || []), name].filter((n, i, all) => all.indexOf(n) === i));
    if (!person.email || (test && attempted > 0)) continue;
    attempted++;
    const values = templateValues(event, name);
    if (await sendEmail(person.email, applyTemplate(subject, values), wrap(textToHtml(applyTemplate(body, values))), options)) succeeded++;
  }

  let managerSent = 0;
  for (const [group, names] of byGroup) {
    if (test && managerSent > 0) break;
    attempted++;
    managerSent++;
    const values = templateValues(event, 'Manager', names.map((n) => `• ${n}`).join('\n'));
    if (await sendEmail(group, applyTemplate(managerSubject, values), wrap(textToHtml(applyTemplate(managerBody, values))), options)) succeeded++;
  }
  return { attempted, succeeded };
}

async function sendFeedback(event: AutomationEvent, people: Person[], settings: Settings, options: EmailOptions, baseUrl: string, test: boolean) {
  const link = `${baseUrl}/feedback?event=${event.id}`;
  const subject = String(settings.email_subject || 'How was {{course_name}}?');
  const body = String(settings.email_body || 'Hi {{staff_name}},\n\nThank you for attending {{course_name}} today. We would love to hear what you thought of it.');
  let attempted = 0;
  let succeeded = 0;
  for (const person of people) {
    if (!person.email || (test && attempted > 0)) continue;
    attempted++;
    const values = { ...templateValues(event, person.full_name || 'Staff Member'), feedback_link: link };
    if (await sendEmail(person.email, applyTemplate(subject, values), feedbackHtml(applyTemplate(body, values), link), options)) succeeded++;
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
    const hasCronSecret = isAuthorizedCronHeader(req.headers.get('Authorization'));
    let eventId: string | null = null;
    if (req.method === 'POST') {
      const body = (await req.json().catch(() => ({}))) as { eventId?: string };
      eventId = typeof body.eventId === 'string' ? body.eventId : null;
    }
    let adminEmail: string | null = null;
    if (!hasCronSecret || eventId) {
      // Sending for one session is always a deliberate admin action.
      const authz = await requireRole(['admin']);
      if ('error' in authz) return authz.error;
      const { data: me } = await authz.service.from('profiles').select('email').eq('id', authz.userId).maybeSingle();
      adminEmail = me?.email?.trim() || null;
    }

    const service = createServiceClient();
    const { data: settingsRow, error: settingsError } = await service.from('feedback_automation_settings').select('*').limit(1).maybeSingle();
    if (settingsError) throw settingsError;
    const settings = (settingsRow || {}) as Settings;
    const feedbackOn = settings.is_enabled === true;
    const remindersOn = settings.reminders_enabled === true;

    if (!eventId && !feedbackOn && !remindersOn) {
      return NextResponse.json({ message: 'Feedback emails and reminders are both switched off', count: 0 });
    }

    const now = getLocalWallClock();
    let events: AutomationEvent[] = [];
    if (eventId) {
      const { data, error } = await service.from('training_events').select(EVENT_COLUMNS).eq('id', eventId).maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      events = [data as AutomationEvent];
    } else {
      const maxDays = Math.max(getReminderDaysBefore(settings, 'seven_days'), getReminderDaysBefore(settings, 'one_day'));
      const from = new Date(now); from.setUTCDate(from.getUTCDate() - 1);
      const to = new Date(now); to.setUTCDate(to.getUTCDate() + maxDays + 1);
      const { data, error } = await service.from('training_events').select(EVENT_COLUMNS)
        .gte('event_date', getDateString(from)).lte('event_date', getDateString(to));
      if (error) throw error;
      events = (data || []) as AutomationEvent[];
    }

    const headerOptions = getEmailSendOptionsFromHeaders(req.headers.get('x-email-test-mode'), req.headers.get('x-test-email-address'));
    const test = isTestSend(headerOptions);
    // Test sends from an admin go to that admin unless another address was typed in.
    const options = test && adminEmail && !headerOptions?.testEmailAddress?.trim()
      ? { ...headerOptions, testMode: true, testEmailAddress: adminEmail }
      : headerOptions;
    // Links point at the site that sent them: live for live, the dev site for dev
    // (a dev session doesn't exist on live, so a live link from dev can't open).
    const baseUrl = process.env.NEXT_PUBLIC_VERCEL_ENV === 'production'
      ? process.env.NEXT_PUBLIC_APP_URL || 'https://cascade-training.vercel.app'
      : new URL(req.url).origin;
    const groups = remindersOn ? await managerGroups(service) : new Map<string, string>();
    let sent = 0;
    let processed = 0;
    let noAttendees = false;

    for (const event of events) {
      const kinds: AutomationKind[] = [];
      if (eventId) kinds.push('feedback');
      else {
        if (remindersOn && !event.reminder_7_days_sent_at && isDue(event, 'reminder_7_days', settings, now)) kinds.push('reminder_7_days');
        if (remindersOn && !event.reminder_1_day_sent_at && isDue(event, 'reminder_1_day', settings, now)) kinds.push('reminder_1_day');
        if (feedbackOn && !event.feedback_sent_at && isDue(event, 'feedback', settings, now)) kinds.push('feedback');
      }

      for (const kind of kinds) {
        // Feedback: only people signed in on the register. Reminders: everyone booked.
        let query = service.from('bookings').select('profiles:profile_id(email, full_name, location)').eq('event_id', event.id);
        if (kind === 'feedback') query = query.not('attended_at', 'is', null);
        const { data: bookings, error } = await query;
        if (error) throw error;
        const people = (bookings || [])
          .map((b) => (Array.isArray(b.profiles) ? b.profiles[0] : b.profiles) as Person | null)
          .filter((p): p is Person => !!p);
        if (people.length === 0) { if (eventId) noAttendees = true; continue; }

        const result = kind === 'feedback'
          ? await sendFeedback(event, people, settings, options, baseUrl, test)
          : await sendReminders(event, people, settings, groups, options, test);
        sent += result.succeeded;

        if (result.succeeded > 0 && !test) {
          const field = kind === 'feedback' ? 'feedback_sent_at' : kind === 'reminder_7_days' ? 'reminder_7_days_sent_at' : 'reminder_1_day_sent_at';
          const { error: updateError } = await service.from('training_events').update({ [field]: new Date().toISOString() }).eq('id', event.id);
          if (updateError) throw updateError;
          processed++;
          if (result.succeeded < result.attempted) {
            console.warn(`Training emails: ${result.succeeded}/${result.attempted} ${kind} emails sent for session ${event.id}; marked as sent so nobody gets it twice.`);
          }
        }
      }
    }

    return NextResponse.json({
      message: noAttendees ? 'Nobody is signed in on the register for this session yet, so no feedback emails were sent.' : 'Training emails processed',
      testMode: test,
      events: events.length,
      automations: processed,
      count: sent,
    });
  } catch (err) {
    console.error('Training email automation error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
