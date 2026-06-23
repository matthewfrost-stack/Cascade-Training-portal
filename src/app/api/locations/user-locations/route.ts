import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, getScopedLocationIds, requireRole } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    const authz = await requireRole(['admin', 'manager', 'scheduler', 'staff']);
    if ('error' in authz) return authz.error;

    const supabase = createServiceClient();
    const scopedLocations = await getScopedLocationIds(authz.userId, authz.role, supabase);

    let locations: { id: string; name: string }[] = [];

    if (scopedLocations.all) {
      const { data } = await supabase
        .from('locations')
        .select('id, name')
        .order('name');
      locations = data || [];
    } else if (scopedLocations.ids.length > 0) {
      const { data } = await supabase
        .from('locations')
        .select('id, name')
        .in('id', scopedLocations.ids)
        .order('name');
      locations = data || [];
    }

    return NextResponse.json({
      locations,
      count: locations.length,
      userRole: authz.role
    });
  } catch (error) {
    console.error('Error in user locations endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
