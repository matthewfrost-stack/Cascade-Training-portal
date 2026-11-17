import { NextResponse } from 'next/server';
import { createServiceClient, requireRole } from '@/lib/apiAuth';
import { isAuthorizedCronHeader } from '@/lib/cronAuth';
import { getTrainingInboxAddress, sendBulkEmailDetailed } from '@/lib/email';
import { getAppBaseUrl } from '@/lib/passwordLinks';
import {
  buildHomeDigests,
  digestPeriod,
  digestSubject,
  LOOKAHEAD_DAYS,
  MissingMigrationError,
  renderDigestEmail,
  type HomeDigest,
} from '@/lib/managerDigest';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type ServiceClient = ReturnType<typeof createServiceClient>;
type Action = 'status' | 'preview' | 'send';

/**
 * Monthly "training due" email to each home's managers' Google Group.
 *
 * - GET with the cron secret (GitHub Actions, 1st of the month): sends this
 *   month's email to every home that has not had it yet.
 * - Admins (POST { action }):
 *     status  – list homes with their counts, address and whether sent this month
 *     preview – email one home's digest to the admin only
 *     send    – same as the monthly run, on demand
 */
export async function GET(req: Request) {
  if (isAuthorizedCronHeader(req.headers.get('Authorization'))) {
    return run(createServiceClient(), 'send');
  }
  const authz = await requireRole(['admin']);
  if ('error' in authz) return authz.error;
  return run(authz.service, 'status');
}

export async function POST(req: Request) {
  if (isAuthorizedCronHeader(req.headers.get('Authorization'))) {
    return run(createServiceClient(), 'send');
  }
  const authz = await requireRole(['admin']);
  if ('error' in authz) return authz.error;

  const body = (await req.json().catch(() => ({}))) as { action?: Action; locationId?: string };
  const action: Action = body.action === 'preview' || body.action === 'send' ? body.action : 'status';

  if (action === 'preview') {
    if (!body.locationId) return NextResponse.json({ error: 'Choose a home to preview.' }, { status: 400 });
    const { data: me } = await authz.service.from('profiles').select('email').eq('id', authz.userId).maybeSingle();
    const myEmail = (me?.email || '').trim();
    if (!myEmail) return NextResponse.json({ error: 'Your profile has no email address to send the preview to.' }, { status: 400 });
    return run(authz.service, 'preview', { locationId: body.locationId, previewTo: myEmail });
  }

  return run(authz.service, action);
}

async function loadSentLog(service: ServiceClient, period: string) {
  const { data, error } = await service.from('manager_digest_log').select('location_id, sent_at, recipient').eq('period', period);
  if (error) {
    if (error.code === '42P01' || /manager_digest_log/.test(error.message || '')) {
      throw new MissingMigrationError(
        'The database has not been updated yet. Run the migration 20261117090000_add_location_manager_email_and_digest_log.sql in the Supabase SQL Editor.'
      );
    }
    throw new Error(error.message);
  }
  return new Map((data || []).map((row) => [row.location_id as string, row as { sent_at: string; recipient: string }]));
}

async function run(service: ServiceClient, action: Action, opts: { locationId?: string; previewTo?: string } = {}) {
  try {
    const period = digestPeriod();
    const baseUrl = getAppBaseUrl();
    const inbox = getTrainingInboxAddress();

    if (action === 'preview') {
      const [home] = await buildHomeDigests(service, { onlyLocationId: opts.locationId });
      if (!home) return NextResponse.json({ error: 'Home not found.' }, { status: 404 });
      const html = renderDigestEmail(home, period, baseUrl, { noManagerEmail: !home.managerEmail });
      const result = await sendBulkEmailDetailed([home.managerEmail || inbox || opts.previewTo!], digestSubject(home, period), html, {
        testMode: true,
        testEmailAddress: opts.previewTo,
      });
      if (!result.success) {
        return NextResponse.json({ error: 'The preview email could not be sent. Check the email settings.' }, { status: 502 });
      }
      return NextResponse.json({ ok: true, sentTo: opts.previewTo, counts: home.counts });
    }

    const [homes, sentLog] = await Promise.all([buildHomeDigests(service), loadSentLog(service, period)]);

    if (action === 'status') {
      return NextResponse.json({
        period,
        lookaheadDays: LOOKAHEAD_DAYS,
        fallbackInbox: inbox || null,
        homes: homes.map((home) => ({
          locationId: home.locationId,
          locationName: home.locationName,
          managerEmail: home.managerEmail,
          counts: home.counts,
          sentAt: sentLog.get(home.locationId)?.sent_at || null,
        })),
      });
    }

    // action === 'send'
    const outcome = { sent: [] as string[], alreadySent: [] as string[], failed: [] as { home: string; reason: string }[], testMode: false };

    for (const home of homes as HomeDigest[]) {
      if (sentLog.has(home.locationId)) {
        outcome.alreadySent.push(home.locationName);
        continue;
      }
      const recipient = home.managerEmail || inbox;
      if (!recipient) {
        outcome.failed.push({ home: home.locationName, reason: 'No managers’ email set and no training inbox configured' });
        continue;
      }

      const html = renderDigestEmail(home, period, baseUrl, { noManagerEmail: !home.managerEmail });
      const result = await sendBulkEmailDetailed([recipient], digestSubject(home, period), html);
      if (!result.success) {
        outcome.failed.push({ home: home.locationName, reason: 'Email could not be sent' });
        continue;
      }
      outcome.sent.push(home.locationName);

      // In test mode the email went to the test address, so don't mark the month as done.
      if (result.testMode) {
        outcome.testMode = true;
        continue;
      }
      const { error: logError } = await service
        .from('manager_digest_log')
        .insert({ location_id: home.locationId, period, recipient });
      if (logError && logError.code !== '23505') {
        console.error('Manager digest: could not record send for', home.locationName, logError.message);
      }
    }

    return NextResponse.json({ ok: outcome.failed.length === 0, period, ...outcome }, { status: outcome.failed.length && !outcome.sent.length ? 502 : 200 });
  } catch (error) {
    if (error instanceof MissingMigrationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error('Manager digest error:', error);
    return NextResponse.json({ error: 'Manager digest failed' }, { status: 500 });
  }
}
