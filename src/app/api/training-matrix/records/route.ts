import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, getScopedLocationIds, requireRole } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

// Returns all staff_training_matrix records for a location using the service
// client so the data is not silently dropped by client-side RLS (the browser
// anon client cannot read staff_training_matrix, which left every matrix cell
// blank). Role-based location scoping is enforced here instead.
export async function GET(request: NextRequest) {
  try {
    const authz = await requireRole(['admin', 'manager', 'scheduler', 'staff']);
    if ('error' in authz) return authz.error;

    const locationId = request.nextUrl.searchParams.get('locationId')?.trim();
    if (!locationId) {
      return NextResponse.json({ error: 'locationId is required' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Ensure the caller is allowed to see this location's records.
    const scoped = await getScopedLocationIds(authz.userId, authz.role, supabase);
    if (!scoped.all && !scoped.ids.includes(locationId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const pageSize = 1000;
    let page = 0;
    let hasMore = true;
    const records: unknown[] = [];

    while (hasMore) {
      let query = supabase
        .from('staff_training_matrix')
        .select('id, staff_id, course_id, completion_date, expiry_date, status, completed_at_location_id')
        .eq('completed_at_location_id', locationId)
        .range(page * pageSize, (page + 1) * pageSize - 1);

      // Staff may only ever see their own records, even within a location.
      if (authz.role === 'staff') {
        query = query.eq('staff_id', authz.userId);
      }

      const { data, error } = await query;
      if (error) {
        console.error('Error fetching training matrix records:', error);
        return NextResponse.json({ error: 'Failed to fetch training records' }, { status: 500 });
      }

      if (!data || data.length === 0) {
        hasMore = false;
      } else {
        records.push(...data);
        page++;
        if (data.length < pageSize) hasMore = false;
      }
    }

    // Dividers (staff groups) are read here too: location_matrix_dividers has a
    // strict `auth.uid() IS NOT NULL` RLS read policy with no public fallback,
    // so the browser anon client returns zero rows and no groups render.
    const { data: dividers, error: divError } = await supabase
      .from('location_matrix_dividers')
      .select('id, name, display_order')
      .eq('location_id', locationId)
      .order('display_order', { ascending: true });
    if (divError) console.error('Error fetching dividers:', divError);

    return NextResponse.json({ records, dividers: dividers || [], count: records.length });
  } catch (error) {
    console.error('Error in training matrix records endpoint:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
