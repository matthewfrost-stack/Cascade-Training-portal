import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/apiAuth';
import { answersFromRow, normaliseQuestions, type CourseRate, type FeedbackResponseRow } from '@/lib/feedbackForm';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

type EventRow = { id: string; event_date: string; courses: { name?: string | null } | { name?: string | null }[] | null };

const courseOf = (row: EventRow) => (Array.isArray(row.courses) ? row.courses[0] : row.courses)?.name || 'Training session';

/**
 * Feedback results (admins only).
 *   GET ?from=YYYY-MM-DD&to=YYYY-MM-DD&course=<name>  -> questions, responses, response rates
 *   DELETE ?id=<response id>                          -> delete one response
 * Anonymous responses never carry a name or person id.
 */
export async function GET(request: NextRequest) {
  const authz = await requireRole(['admin']);
  if ('error' in authz) return authz.error;
  const { service } = authz;

  const params = new URL(request.url).searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const from = DAY.test(params.get('from') || '') ? params.get('from')! : `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;
  const to = DAY.test(params.get('to') || '') ? params.get('to')! : today;
  const course = (params.get('course') || '').trim();
  if (from > to) return NextResponse.json({ error: 'The start date must be before the end date.' }, { status: 400 });

  try {
    const { data: settings } = await service.from('feedback_settings').select('config').eq('key', 'default_form').maybeSingle();
    const questions = normaliseQuestions(settings?.config);

    // Responses in the period
    let query = service
      .from('course_feedback')
      .select('*')
      .gte('event_date', from)
      .lte('event_date', to)
      .order('created_at', { ascending: false })
      .limit(5000);
    if (course) query = query.eq('course_name', course);
    const { data: rows, error } = await query;
    if (error) throw error;

    const responses: FeedbackResponseRow[] = (rows || []).map((row) => {
      const anonymous = row.is_anonymous === true;
      return {
        id: row.id,
        submittedAt: row.created_at,
        courseName: row.course_name || 'Unknown course',
        eventDate: row.event_date,
        name: anonymous ? 'Anonymous' : row.respondent_name || 'Unknown',
        anonymous,
        answers: answersFromRow(row),
      };
    });

    // Response rate: people marked as attended vs people who responded (named or anonymous)
    const { data: eventData, error: eventError } = await service
      .from('training_events')
      .select('id, event_date, courses(name)')
      .gte('event_date', from)
      .lte('event_date', to)
      .limit(5000);
    if (eventError) throw eventError;
    const events = ((eventData || []) as EventRow[]).filter((e) => !course || courseOf(e) === course);

    const attendedBy = new Map<string, number>();
    const respondedBy = new Map<string, number>();
    const ids = events.map((e) => e.id);
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const [att, sub] = await Promise.all([
        service.from('bookings').select('event_id').in('event_id', chunk).not('attended_at', 'is', null).limit(10000),
        service.from('feedback_submissions').select('event_id').in('event_id', chunk).limit(10000),
      ]);
      for (const b of att.data || []) attendedBy.set(b.event_id, (attendedBy.get(b.event_id) || 0) + 1);
      for (const s of sub.data || []) respondedBy.set(s.event_id, (respondedBy.get(s.event_id) || 0) + 1);
    }

    const rates = new Map<string, CourseRate>();
    for (const e of events) {
      const attended = attendedBy.get(e.id) || 0;
      if (attended === 0) continue; // only sessions with someone signed in count
      const name = courseOf(e);
      const r = rates.get(name) || { courseName: name, sessions: 0, attended: 0, responded: 0 };
      r.sessions += 1;
      r.attended += attended;
      r.responded += Math.min(respondedBy.get(e.id) || 0, attended);
      rates.set(name, r);
    }

    // Every course run in the period, for the filter list
    const courseNames = Array.from(new Set([...((eventData || []) as EventRow[]).map(courseOf), ...responses.map((r) => r.courseName)]))
      .sort((a, b) => a.localeCompare(b));

    return NextResponse.json({
      period: { from, to },
      course: course || null,
      questions,
      responses,
      rates: Array.from(rates.values()).sort((a, b) => a.courseName.localeCompare(b.courseName)),
      courseNames,
    });
  } catch (error) {
    console.error('Feedback results failed:', error);
    return NextResponse.json({ error: 'Could not load feedback results.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const authz = await requireRole(['admin']);
  if ('error' in authz) return authz.error;
  const { service } = authz;

  const id = new URL(request.url).searchParams.get('id') || '';
  if (!UUID.test(id)) return NextResponse.json({ error: 'Invalid response.' }, { status: 400 });

  const { data: row } = await service.from('course_feedback').select('id, event_id, respondent_id').eq('id', id).maybeSingle();
  if (!row) return NextResponse.json({ error: 'Response not found.' }, { status: 404 });

  const { error } = await service.from('course_feedback').delete().eq('id', id);
  if (error) {
    console.error('Feedback delete failed:', error);
    return NextResponse.json({ error: 'Could not delete the response.' }, { status: 500 });
  }
  // A named response: let that person answer again. (Anonymous ones can't be traced back, by design.)
  if (row.respondent_id && row.event_id && UUID.test(String(row.event_id))) {
    await service.from('feedback_submissions').delete().eq('event_id', row.event_id).eq('profile_id', row.respondent_id);
  }
  return NextResponse.json({ ok: true });
}
