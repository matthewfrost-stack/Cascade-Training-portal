import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/apiAuth';
import { DEFAULT_QUESTIONS, normaliseQuestions } from '@/lib/feedbackForm';

export const dynamic = 'force-dynamic';

/**
 * Feedback admin screen (admins only).
 *   GET                 -> questions, email settings, recent sessions for "Send now"
 *   PUT { questions }   -> save the one form used for every course
 *   PUT { emails }      -> save the feedback email + booking reminder settings
 */

const EMAIL_TEXT_FIELDS = ['email_subject', 'email_body', 'reminder_subject', 'reminder_body', 'manager_reminder_subject', 'manager_reminder_body'] as const;

export type EmailSettings = {
  is_enabled: boolean;
  reminders_enabled: boolean;
  remindersSwitchReady: boolean;
  feedback_minutes_before_end: number;
  reminder_7_days_before: number;
  reminder_1_day_before: number;
} & Record<(typeof EMAIL_TEXT_FIELDS)[number], string>;

export type SendNowSession = { id: string; date: string; startTime: string | null; endTime: string | null; courseName: string; attended: number; feedbackSentAt: string | null };

const DEFAULT_TEXTS: Record<(typeof EMAIL_TEXT_FIELDS)[number], string> = {
  email_subject: 'How was {{course_name}}?',
  email_body: 'Hi {{staff_name}},\n\nThank you for attending {{course_name}} today. We would love to hear what you thought of it.\n\nBest regards,\nThe Training Team',
  reminder_subject: 'Training reminder: {{course_name}}',
  reminder_body: 'Hi {{staff_name}},\n\nThis is a reminder that you are booked on {{course_name}} on {{event_date}} from {{start_time}} to {{end_time}}.\n\nBest regards,\nThe Training Team',
  manager_reminder_subject: 'Training reminder for {{course_name}}',
  manager_reminder_body: 'The following staff are booked on {{course_name}} on {{event_date}} from {{start_time}} to {{end_time}}:\n\n{{staff_list}}\n\nThe Training Team',
};

// Older saved texts hold the characters "\n" instead of line breaks.
const fixBreaks = (text: unknown) => String(text ?? '').replace(/\\r\\n|\\n/g, '\n');
const whole = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export async function GET() {
  const authz = await requireRole(['admin']);
  if ('error' in authz) return authz.error;
  const { service } = authz;

  try {
    const [{ data: form }, { data: auto }] = await Promise.all([
      service.from('feedback_settings').select('config').eq('key', 'default_form').maybeSingle(),
      service.from('feedback_automation_settings').select('*').limit(1).maybeSingle(),
    ]);

    const emails = {
      is_enabled: auto?.is_enabled === true,
      reminders_enabled: auto?.reminders_enabled === true,
      remindersSwitchReady: !!auto && 'reminders_enabled' in auto,
      feedback_minutes_before_end: whole(auto?.feedback_minutes_before_end ?? auto?.minutes_before_end, 0, 600, 60),
      reminder_7_days_before: whole(auto?.reminder_7_days_before, 0, 60, 7),
      reminder_1_day_before: whole(auto?.reminder_1_day_before, 0, 60, 1),
      ...Object.fromEntries(EMAIL_TEXT_FIELDS.map((f) => [f, auto?.[f] ? fixBreaks(auto[f]) : DEFAULT_TEXTS[f]])),
    } as EmailSettings;

    // Sessions for "Send now": the last 14 days up to tomorrow, with how many signed in.
    const today = new Date();
    const from = new Date(today.getTime() - 14 * 86400000).toISOString().slice(0, 10);
    const to = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);
    const { data: events } = await service
      .from('training_events')
      .select('id, event_date, start_time, end_time, feedback_sent_at, courses(name)')
      .gte('event_date', from)
      .lte('event_date', to)
      .order('event_date', { ascending: false })
      .order('start_time', { ascending: false });
    const ids = (events || []).map((e) => e.id);
    const attended = new Map<string, number>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await service.from('bookings').select('event_id').in('event_id', ids.slice(i, i + 200)).not('attended_at', 'is', null);
      for (const b of data || []) attended.set(b.event_id, (attended.get(b.event_id) || 0) + 1);
    }
    const sessions: SendNowSession[] = (events || []).map((e) => {
      const course = Array.isArray(e.courses) ? e.courses[0] : e.courses;
      return {
        id: e.id,
        date: e.event_date,
        startTime: e.start_time,
        endTime: e.end_time,
        courseName: (course as { name?: string } | null)?.name || 'Training session',
        attended: attended.get(e.id) || 0,
        feedbackSentAt: e.feedback_sent_at ?? null,
      };
    });

    return NextResponse.json({ questions: normaliseQuestions(form?.config), defaultQuestions: DEFAULT_QUESTIONS, emails, sessions });
  } catch (error) {
    console.error('Feedback settings load failed:', error);
    return NextResponse.json({ error: 'Could not load the feedback settings.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const authz = await requireRole(['admin']);
  if ('error' in authz) return authz.error;
  const { service } = authz;
  const body = await request.json().catch(() => null);

  try {
    if (Array.isArray(body?.questions)) {
      if (body.questions.length === 0) return NextResponse.json({ error: 'The form needs at least one question.' }, { status: 400 });
      // Save the cleaned-up version, exactly as the form will read it.
      const questions = normaliseQuestions({ fields: body.questions });
      const { error } = await service
        .from('feedback_settings')
        .upsert({ key: 'default_form', config: { fields: questions }, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) throw error;
      return NextResponse.json({ ok: true, questions });
    }

    if (body?.emails && typeof body.emails === 'object') {
      const e = body.emails as Partial<EmailSettings>;
      const update: Record<string, unknown> = {
        is_enabled: e.is_enabled === true,
        reminders_enabled: e.reminders_enabled === true,
        feedback_minutes_before_end: whole(e.feedback_minutes_before_end, 0, 600, 60),
        minutes_before_end: whole(e.feedback_minutes_before_end, 0, 600, 60),
        reminder_7_days_before: whole(e.reminder_7_days_before, 0, 60, 7),
        reminder_1_day_before: whole(e.reminder_1_day_before, 0, 60, 1),
        updated_at: new Date().toISOString(),
      };
      for (const f of EMAIL_TEXT_FIELDS) update[f] = String(e[f] ?? '').slice(0, 5000).trim() || DEFAULT_TEXTS[f];

      const { data: row } = await service.from('feedback_automation_settings').select('id').limit(1).maybeSingle();
      const save = (values: Record<string, unknown>) => (row
        ? service.from('feedback_automation_settings').update(values).eq('id', row.id)
        : service.from('feedback_automation_settings').insert(values));
      let { error } = await save(update);
      if (error && /reminders_enabled/.test(error.message || '')) {
        // Reminders switch migration not run yet: save the rest, keep reminders off.
        if (update.reminders_enabled) return NextResponse.json({ error: 'Run the migration 20261118150000_feedback_reminders_switch.sql before switching reminders on.' }, { status: 400 });
        delete update.reminders_enabled;
        ({ error } = await save(update));
      }
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 });
  } catch (error) {
    console.error('Feedback settings save failed:', error);
    return NextResponse.json({ error: 'Could not save. Please try again.' }, { status: 500 });
  }
}
