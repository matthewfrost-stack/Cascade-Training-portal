import { NextRequest, NextResponse } from 'next/server';
import { requireRole, type createServiceClient } from '@/lib/apiAuth';
import { normaliseQuestions, validateAnswers, type BeforeAfter, type FeedbackAnswers } from '@/lib/feedbackForm';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ServiceClient = ReturnType<typeof createServiceClient>;

type EventRow = { id: string; event_date: string; start_time: string | null; end_time: string | null; courses: { name?: string | null } | { name?: string | null }[] | null };

/**
 * The training feedback form (any logged-in person).
 *   GET  ?event=<id>                       -> questions + the session's course/date + whether already answered
 *   POST { event, anonymous, answers }     -> save one response per person per session
 *
 * The course and date always come from the session itself, never from the link.
 * Anonymous responses are saved without a name or person id; a separate
 * `feedback_submissions` row (not linked to the answers) records that the
 * person has responded, so nobody can answer twice.
 */
async function loadQuestions(service: ServiceClient) {
  const { data } = await service.from('feedback_settings').select('config').eq('key', 'default_form').maybeSingle();
  return normaliseQuestions(data?.config);
}

async function loadEvent(service: ServiceClient, eventId: string) {
  const { data } = await service
    .from('training_events')
    .select('id, event_date, start_time, end_time, courses(name)')
    .eq('id', eventId)
    .maybeSingle();
  if (!data) return null;
  const row = data as EventRow;
  const course = Array.isArray(row.courses) ? row.courses[0] : row.courses;
  return { id: row.id, date: row.event_date, startTime: row.start_time, endTime: row.end_time, courseName: course?.name || 'Training session' };
}

async function alreadyAnswered(service: ServiceClient, eventId: string, userId: string) {
  const { data, error } = await service.from('feedback_submissions').select('id').eq('event_id', eventId).eq('profile_id', userId).limit(1);
  if (error) throw new MigrationNeeded();
  return (data || []).length > 0;
}

class MigrationNeeded extends Error {
  constructor() {
    super('The feedback form is being set up. Please try again later.');
  }
}

/** Morning / Afternoon / All day, from the session's times (as on the original form). */
function sessionTime(start: string | null, end: string | null) {
  if (!start || !end) return null;
  if (end <= '13:30') return 'Morning';
  if (start >= '12:00') return 'Afternoon';
  return 'All Day';
}

/** Copies the standard answers into the original columns so older reports still read them. */
function legacyColumns(answers: FeedbackAnswers) {
  const ba = (id: string) => answers[id] as BeforeAfter | undefined;
  const out: Record<string, unknown> = {};
  if (ba('knowledge')) { out.knowledge_before = ba('knowledge')!.before; out.knowledge_after = ba('knowledge')!.after; }
  if (ba('confidence')) { out.confidence_before = ba('confidence')!.before; out.confidence_after = ba('confidence')!.after; }
  if (typeof answers.relevance === 'number') out.work_role_relevance = answers.relevance;
  if (Array.isArray(answers.descriptors)) out.session_descriptors = answers.descriptors;
  if (typeof answers.skills_gained === 'string') out.skills_gained = answers.skills_gained === 'Yes';
  if (typeof answers.comments === 'string') out.additional_comments = answers.comments;
  return out;
}

export async function GET(request: NextRequest) {
  const authz = await requireRole(['staff', 'manager', 'scheduler', 'admin']);
  if ('error' in authz) return authz.error;
  const { service, userId } = authz;

  const eventId = new URL(request.url).searchParams.get('event') || '';
  try {
    const questions = await loadQuestions(service);
    if (!eventId) return NextResponse.json({ questions, event: null, answered: false });
    if (!UUID.test(eventId)) return NextResponse.json({ error: 'This feedback link is not valid.' }, { status: 400 });

    const event = await loadEvent(service, eventId);
    if (!event) return NextResponse.json({ error: 'We could not find this training session. It may have been cancelled.' }, { status: 404 });

    const { data: me } = await service.from('profiles').select('full_name').eq('id', userId).maybeSingle();
    return NextResponse.json({
      questions,
      event: { id: event.id, courseName: event.courseName, date: event.date },
      answered: await alreadyAnswered(service, eventId, userId),
      myName: me?.full_name || '',
    });
  } catch (error) {
    if (error instanceof MigrationNeeded) return NextResponse.json({ error: error.message }, { status: 503 });
    console.error('Feedback form load failed:', error);
    return NextResponse.json({ error: 'Could not load the feedback form.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authz = await requireRole(['staff', 'manager', 'scheduler', 'admin']);
  if ('error' in authz) return authz.error;
  const { service, userId } = authz;

  const body = await request.json().catch(() => null);
  const eventId = typeof body?.event === 'string' ? body.event : '';
  const anonymous = body?.anonymous === true;
  if (!UUID.test(eventId)) return NextResponse.json({ error: 'This feedback link is not valid.' }, { status: 400 });

  try {
    const [questions, event] = await Promise.all([loadQuestions(service), loadEvent(service, eventId)]);
    if (!event) return NextResponse.json({ error: 'We could not find this training session.' }, { status: 404 });

    const checked = validateAnswers(questions, body?.answers);
    if ('error' in checked) return NextResponse.json({ error: checked.error }, { status: 400 });

    // Claim the "responded" slot first: the unique (event, person) rule stops a double submit.
    const { error: claimError } = await service.from('feedback_submissions').insert({ event_id: eventId, profile_id: userId });
    if (claimError) {
      if (claimError.code === '23505') return NextResponse.json({ error: 'You have already given feedback for this session. Thank you!' }, { status: 409 });
      throw new MigrationNeeded();
    }

    const { data: me } = await service.from('profiles').select('full_name').eq('id', userId).maybeSingle();
    const row = {
      event_id: event.id,
      course_name: event.courseName,
      event_date: event.date,
      session_time: sessionTime(event.startTime, event.endTime),
      respondent_name: anonymous ? 'Anonymous' : me?.full_name || 'Unknown',
      respondent_id: anonymous ? null : userId,
      is_anonymous: anonymous,
      responses: checked.answers,
      ...legacyColumns(checked.answers),
    };
    const { error: insertError } = await service.from('course_feedback').insert(row);
    if (insertError) {
      // Give the slot back so they can try again.
      await service.from('feedback_submissions').delete().eq('event_id', eventId).eq('profile_id', userId);
      console.error('Feedback insert failed:', insertError);
      return NextResponse.json({ error: 'Something went wrong saving your feedback. Please try again.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof MigrationNeeded) return NextResponse.json({ error: error.message }, { status: 503 });
    console.error('Feedback submit failed:', error);
    return NextResponse.json({ error: 'Something went wrong saving your feedback. Please try again.' }, { status: 500 });
  }
}
