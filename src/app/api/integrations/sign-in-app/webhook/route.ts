import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

const MAX_SIGNATURE_AGE_SECONDS = 5 * 60;

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getIdentifier(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return getString(value);
}

function getFieldValue(value: unknown, fieldName: string): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const record = asRecord(item);
      const itemName = getString(record.name) || getString(record.label) || getString(record.key);
      if (itemName?.toLowerCase().includes(fieldName)) {
        const result = getString(record.value) || getString(record.answer);
        if (result) return result;
      }
    }
    return null;
  }

  const record = asRecord(value);
  for (const [key, fieldValue] of Object.entries(record)) {
    if (key.toLowerCase().includes(fieldName)) {
      const result = getString(fieldValue);
      if (result) return result;
    }
  }
  return null;
}

function getVisitorEmail(visitor: JsonRecord): string | null {
  const email = getString(visitor.email)
    || getFieldValue(visitor.additional, 'email')
    || getFieldValue(visitor.personal_fields, 'email');
  if (email) return email.toLowerCase();
  return null;
}

function getVisitorName(visitor: JsonRecord): string | null {
  return getString(visitor.name)
    || getFieldValue(visitor.additional, 'name')
    || getFieldValue(visitor.personal_fields, 'name');
}

function verifySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;

  const parts = Object.fromEntries(
    signature.split(',').map((part) => {
      const [key, ...value] = part.split('=');
      return [key, value.join('=')];
    })
  );
  const timestamp = parts.t;
  const receivedSignature = parts.s1;
  const timestampNumber = Number(timestamp);

  if (!timestamp || !receivedSignature || !Number.isFinite(timestampNumber)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestampNumber) > MAX_SIGNATURE_AGE_SECONDS) {
    return false;
  }

  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const receivedBuffer = Buffer.from(receivedSignature, 'utf8');

  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

function getLocalDateAndMinutes(isoValue: string, timeZone: string): { date: string; minutes: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(isoValue));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    if (!values.year || !values.month || !values.day || !values.hour || !values.minute) return null;

    return {
      date: `${values.year}-${values.month}-${values.day}`,
      minutes: Number(values.hour) * 60 + Number(values.minute),
    };
  } catch {
    return null;
  }
}

function getClockMinutes(value: unknown): number | null {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function normalizeLocation(value: unknown): string | null {
  const location = getString(value);
  return location
    ? location.toLowerCase().replace(/[–—-]/g, ' ').replace(/\s+/g, ' ').trim()
    : null;
}

function locationMatchesSite(eventLocation: unknown, siteName: unknown): boolean {
  const eventValue = normalizeLocation(eventLocation);
  const siteValue = normalizeLocation(siteName);
  if (!eventValue || !siteValue) return false;

  return eventValue === siteValue
    || eventValue.startsWith(`${siteValue} `)
    || siteValue.startsWith(`${eventValue} `);
}

async function markWebhookEvent(
  service: ReturnType<typeof createServiceClient>,
  idempotencyKey: string,
  values: Partial<{ processed_at: string | null; processing_error: string | null }>
) {
  await service
    .from('sign_in_app_webhook_events')
    .update(values)
    .eq('idempotency_key', idempotencyKey);
}

export async function POST(request: NextRequest) {
  const secret = process.env.SIGN_IN_APP_WEBHOOK_SECRET;
  if (!secret) {
    console.error('SIGN_IN_APP_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Webhook is not configured' }, { status: 500 });
  }

  const rawBody = await request.text();
  if (!verifySignature(rawBody, request.headers.get('x-signinapp-webhook-signature'), secret)) {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
  }

  let payload: JsonRecord;
  try {
    payload = asRecord(JSON.parse(rawBody));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const eventType = getString(payload.event);
  const idempotencyKey = getString(payload.idempotency_key);
  if (!eventType || !idempotencyKey) {
    return NextResponse.json({ error: 'event and idempotency_key are required' }, { status: 400 });
  }

  const service = createServiceClient();
  const { error: recordError } = await service.from('sign_in_app_webhook_events').insert({
    idempotency_key: idempotencyKey,
    event_type: eventType,
    payload,
  });

  if (recordError) {
    if (recordError.code === '23505') {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    console.error('Could not record Sign In App webhook:', recordError);
    return NextResponse.json({ error: 'Could not record webhook' }, { status: 500 });
  }

  if (eventType !== 'visitor.signin') {
    await markWebhookEvent(service, idempotencyKey, { processed_at: new Date().toISOString() });
    return NextResponse.json({ ok: true, ignored: true });
  }

  const visitor = asRecord(payload.visitor);
  const visitorId = getIdentifier(visitor.id);
  const email = getVisitorEmail(visitor);
  const visitorName = getVisitorName(visitor);
  const eventAt = getString(payload.event_at);
  const site = asRecord(payload.site);
  const timeZone = getString(site.timezone) || 'UTC';
  const localSignIn = eventAt ? getLocalDateAndMinutes(eventAt, timeZone) : null;

  if (!localSignIn || !eventAt) {
    await markWebhookEvent(service, idempotencyKey, {
      processed_at: new Date().toISOString(),
      processing_error: 'Missing or invalid event_at',
    });
    return NextResponse.json({ ok: true, matched: false, reason: 'invalid_event_at' });
  }

  let profile: JsonRecord | null = null;
  if (visitorId) {
    const { data } = await service
      .from('profiles')
      .select('id, full_name, email, sign_in_app_visitor_id')
      .eq('sign_in_app_visitor_id', visitorId)
      .maybeSingle();
    profile = data as JsonRecord | null;
  }

  if (!profile && email) {
    const { data } = await service
      .from('profiles')
      .select('id, full_name, email, sign_in_app_visitor_id')
      .ilike('email', email)
      .limit(2);
    if (data?.length === 1) profile = data[0] as JsonRecord;
  }

  if (!profile && visitorName) {
    const { data } = await service
      .from('profiles')
      .select('id, full_name, email, sign_in_app_visitor_id')
      .ilike('full_name', visitorName)
      .limit(2);
    if (data?.length === 1) profile = data[0] as JsonRecord;
  }

  if (!profile) {
    await markWebhookEvent(service, idempotencyKey, {
      processed_at: new Date().toISOString(),
      processing_error: email || visitorName ? 'No unique profile matched by visitor id, email, or name' : 'Visitor identity was not supplied',
    });
    return NextResponse.json({ ok: true, matched: false, reason: 'profile_not_found' });
  }

  if (visitorId && profile.sign_in_app_visitor_id !== visitorId) {
    await service.from('profiles').update({ sign_in_app_visitor_id: visitorId }).eq('id', profile.id);
  }

  const { data: events, error: eventError } = await service
    .from('training_events')
    .select('id, event_date, start_time, end_time, location, courses(name)')
    .eq('event_date', localSignIn.date);
  if (eventError) {
    await markWebhookEvent(service, idempotencyKey, { processing_error: eventError.message });
    return NextResponse.json({ error: 'Could not find training events' }, { status: 500 });
  }

  const eventIds = (events || []).map((event) => event.id).filter(Boolean);
  if (eventIds.length === 0) {
    await markWebhookEvent(service, idempotencyKey, {
      processed_at: new Date().toISOString(),
      processing_error: 'No courses on the visitor local sign-in date',
    });
    return NextResponse.json({ ok: true, matched: false, reason: 'no_events_on_date' });
  }

  const { data: bookings, error: bookingError } = await service
    .from('bookings')
    .select('id, event_id')
    .eq('profile_id', profile.id)
    .in('event_id', eventIds);
  if (bookingError) {
    await markWebhookEvent(service, idempotencyKey, { processing_error: bookingError.message });
    return NextResponse.json({ error: 'Could not find booked courses' }, { status: 500 });
  }

  const bookedEvents = (events || []).filter((event) => (bookings || []).some((booking) => booking.event_id === event.id));
  const siteName = getString(site.name);
  const siteMatchedEvents = siteName
    ? bookedEvents.filter((event) => locationMatchesSite(event.location, siteName))
    : [];
  const candidates = siteMatchedEvents.length > 0 ? siteMatchedEvents : bookedEvents;

  if (candidates.length !== 1) {
    await markWebhookEvent(service, idempotencyKey, {
      processed_at: new Date().toISOString(),
      processing_error: candidates.length === 0 ? 'No booked course matched the sign-in' : 'More than one booked course matched the sign-in',
    });
    return NextResponse.json({ ok: true, matched: false, reason: candidates.length === 0 ? 'booking_not_found' : 'ambiguous_booking' });
  }

  const matchedEvent = candidates[0];
  const booking = (bookings || []).find((row) => row.event_id === matchedEvent.id);
  const startMinutes = getClockMinutes(matchedEvent.start_time);
  const minutesLate = startMinutes === null ? 0 : Math.max(0, localSignIn.minutes - startMinutes);
  const bookingId = booking?.id;

  if (!bookingId) {
    await markWebhookEvent(service, idempotencyKey, {
      processed_at: new Date().toISOString(),
      processing_error: 'Matched event did not contain the booking',
    });
    return NextResponse.json({ ok: true, matched: false, reason: 'booking_not_found' });
  }

  const { error: updateError } = await service
    .from('bookings')
    .update({
      attended_at: eventAt,
      minutes_late: minutesLate,
      late_reason: minutesLate > 0 ? 'Sign In App' : null,
      lateness_minutes: minutesLate,
      lateness_reason: minutesLate > 0 ? 'Sign In App' : null,
      absence_reason: null,
      attendance_source: 'sign_in_app',
      attendance_marked_at: eventAt,
      attendance_marked_by: null,
    })
    .eq('id', bookingId);

  if (updateError) {
    await markWebhookEvent(service, idempotencyKey, { processing_error: updateError.message });
    return NextResponse.json({ error: 'Could not update attendance' }, { status: 500 });
  }

  await markWebhookEvent(service, idempotencyKey, { processed_at: new Date().toISOString(), processing_error: null });
  return NextResponse.json({ ok: true, matched: true, bookingId, minutesLate });
}
