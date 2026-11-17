import { NextRequest, NextResponse } from 'next/server';
import { getScopedLocationIds, requireRole } from '@/lib/apiAuth';
import { MissingMigrationError } from '@/lib/compliance';
import { buildHomeDetail, buildOverview, defaultPeriod } from '@/lib/complianceReport';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Compliance report (admins, schedulers, managers; managers see their own homes).
 *   GET                         -> overview of every home the user can see
 *   GET ?locationId=…           -> one home in detail
 *   &from=YYYY-MM-DD&to=…       -> period for training hours (default: last 12 months)
 */
export async function GET(request: NextRequest) {
  const authz = await requireRole(['admin', 'scheduler', 'manager']);
  if ('error' in authz) return authz.error;
  const { service } = authz;

  const params = new URL(request.url).searchParams;
  const locationId = params.get('locationId');
  const fallback = defaultPeriod();
  const from = DAY.test(params.get('from') || '') ? params.get('from')! : fallback.from;
  const to = DAY.test(params.get('to') || '') ? params.get('to')! : fallback.to;
  if (from > to) return NextResponse.json({ error: 'The start date must be before the end date.' }, { status: 400 });

  try {
    const scope = await getScopedLocationIds(authz.userId, authz.role, service);
    const { data: me } = await service.from('profiles').select('full_name').eq('id', authz.userId).maybeSingle();
    const generated = { at: new Date().toISOString(), by: me?.full_name || 'Unknown user' };

    if (locationId) {
      if (!UUID.test(locationId)) return NextResponse.json({ error: 'Invalid home.' }, { status: 400 });
      if (!scope.all && !scope.ids.includes(locationId)) {
        return NextResponse.json({ error: 'You do not have access to this home.' }, { status: 403 });
      }
      const detail = await buildHomeDetail(service, locationId, { from, to });
      if (!detail) return NextResponse.json({ error: 'Home not found.' }, { status: 404 });
      return NextResponse.json({ generated, detail });
    }

    const homes = await buildOverview(service, scope.all ? null : scope.ids, { from, to });
    return NextResponse.json({ generated, period: { from, to }, homes, canSnapshot: authz.role === 'admin' });
  } catch (error) {
    if (error instanceof MissingMigrationError) return NextResponse.json({ error: error.message }, { status: 503 });
    console.error('Compliance report failed:', error);
    return NextResponse.json({ error: 'Could not build the compliance report.' }, { status: 500 });
  }
}
