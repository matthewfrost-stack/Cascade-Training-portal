import { NextRequest, NextResponse, after } from 'next/server';
import { createServiceClient } from '@/lib/apiAuth';
import { PASSWORD_RESET_SUBJECT, sendPasswordResetEmail } from '@/lib/email';
import { createPasswordSetupLink } from '@/lib/passwordLinks';

export const dynamic = 'force-dynamic';

// PUBLIC route (the proxy does not run on /api). It must never reveal whether
// an address has an account: every valid request gets the same reply, and the
// lookup + email happen after the response has been sent so response timing
// gives nothing away either.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAILS_PER_ADDRESS_PER_HOUR = 3;

// Soft per-IP limit. Serverless instances don't share memory, so this only
// slows a burst from one client; the per-address limit below is the real cap.
const IP_WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS_PER_IP = 10;
const ipRequests = new Map<string, number[]>();

function isIpRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (ipRequests.get(ip) || []).filter((t) => now - t < IP_WINDOW_MS);
  recent.push(now);
  ipRequests.set(ip, recent);
  if (ipRequests.size > 5000) ipRequests.clear();
  return recent.length > MAX_REQUESTS_PER_IP;
}

async function sendResetIfEligible(email: string) {
  try {
    const service = createServiceClient();

    const { data: profiles, error: profileError } = await service
      .from('profiles')
      .select('id, full_name, is_deleted')
      .eq('email', email)
      .eq('is_deleted', false)
      .limit(1);

    if (profileError) {
      console.error('forgot-password: profile lookup failed:', profileError.message);
      return;
    }
    const profile = profiles?.[0];
    if (!profile) return;

    // Per-address cap, counted from the email log so it holds across
    // serverless instances. If the log can't be read, don't send: better a
    // missed email than an inbox flooded by someone else.
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await service
      .from('email_logs')
      .select('id', { count: 'exact', head: true })
      .ilike('subject', `%${PASSWORD_RESET_SUBJECT}%`)
      .contains('original_recipients', [email])
      .gte('created_at', since);

    if (countError) {
      console.error('forgot-password: rate-limit check failed:', countError.message);
      return;
    }
    if ((count ?? 0) >= MAX_EMAILS_PER_ADDRESS_PER_HOUR) {
      console.warn('forgot-password: hourly limit reached for a requested address');
      return;
    }

    const result = await createPasswordSetupLink(service, email);
    if (result.error !== undefined) {
      // Usually a profile with no login account (old bulk uploads); an admin
      // can fix that with Reset Password on the staff record.
      console.warn('forgot-password: could not create link:', result.error);
      return;
    }

    // No header-based options here: on a public route, honouring the
    // x-test-email-address header would let anyone redirect the email.
    await sendPasswordResetEmail(email, profile.full_name || '', result.link, undefined, 'reset');
  } catch (error) {
    console.error('forgot-password: unexpected error:', error);
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (isIpRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a few minutes and try again.' },
      { status: 429 }
    );
  }

  after(() => sendResetIfEligible(email));

  return NextResponse.json({ ok: true });
}
