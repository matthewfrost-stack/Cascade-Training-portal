import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, getScopedLocationIds, requireRole } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    const authz = await requireRole(['admin', 'manager', 'scheduler', 'staff']);
    if ('error' in authz) return authz.error;

    const supabase = createServiceClient();
    const scopedLocations = await getScopedLocationIds(authz.userId, authz.role, supabase);

    let query = supabase
      .from('profiles')
      .select(`
        id,
        full_name,
        email,
        role_tier,
        staff_locations (
          location_id,
          locations (id, name)
        )
      `);

    // Apply location filtering
    if (scopedLocations.all) {
      // Admins see all staff
    } else if (scopedLocations.ids.length > 0) {
      const { data: staffAtLocations } = await supabase
        .from('staff_locations')
        .select('staff_id')
        .in('location_id', scopedLocations.ids);

      const staffIds = staffAtLocations?.map(sl => sl.staff_id) || [];
      if (staffIds.length === 0) {
        return NextResponse.json({ staff: [] });
      }

      query = query.in('id', staffIds);
    } else {
      // Staff can only see themselves
      query = query.eq('id', authz.userId);
    }

    const { data: staff, error } = await query;

    if (error) {
      console.error('Error fetching staff:', error);
      return NextResponse.json(
        { error: 'Failed to fetch staff' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      staff: staff || [],
      count: staff?.length || 0,
      userRole: authz.role
    });
  } catch (error) {
    console.error('Error in staff by location endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
