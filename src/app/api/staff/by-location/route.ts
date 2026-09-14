import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, getScopedLocations, requireRole } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    const authz = await requireRole(['admin', 'manager', 'scheduler', 'staff']);
    if ('error' in authz) return authz.error;

    const supabase = createServiceClient();
    const scopedLocations = await getScopedLocations(authz.userId, authz.role, supabase);

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

    // Staff can only ever receive their own profile. Managers and schedulers
    // may receive the staff assigned to their scoped locations.
    if (authz.role === 'staff') {
      query = query.eq('id', authz.userId);
    } else if (scopedLocations.all) {
      // Admins see all staff
    } else if (scopedLocations.locations.length > 0) {
      const { data: staffAtLocations } = await supabase
        .from('staff_locations')
        .select('staff_id')
        .in('location_id', scopedLocations.locations.map((location) => location.id));

      const staffIds = new Set((staffAtLocations || []).map((sl) => sl.staff_id).filter(Boolean));
      const { data: staffWithScopedPrimaryLocation } = await supabase
        .from('profiles')
        .select('id')
        .in('location', scopedLocations.locations.map((location) => location.name));
      (staffWithScopedPrimaryLocation || []).forEach((profile) => {
        if (profile.id) staffIds.add(profile.id);
      });

      if (staffIds.size === 0) {
        return NextResponse.json({ staff: [] });
      }

      query = query.in('id', Array.from(staffIds));
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
