import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, requireRole } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    const authz = await requireRole(['admin', 'scheduler', 'manager', 'staff']);
    if ('error' in authz) return authz.error;

    const supabase = createServiceClient();

    // Build query based on user role
    let query = supabase
      .from('staff_training_matrix')
      .select(`
        id,
        staff_id,
        course_id,
        completion_date,
        expiry_date,
        status,
        completed_at_location_id,
        profiles:staff_id (id, full_name),
        courses:course_id (id, name, expiry_months),
        locations:completed_at_location_id (id, name)
      `);

    // Apply location filtering based on role
    if (authz.role === 'admin') {
      // Admins see everything - no filter needed
    } else if (authz.role === 'manager' || authz.role === 'scheduler') {
      // Get locations this user manages
      const { data: managedLocations } = await supabase
        .from('staff_locations')
        .select('location_id')
        .eq('staff_id', authz.userId);

      const locationIds = managedLocations?.map(ml => ml.location_id) || [];

      if (locationIds.length === 0) {
        return NextResponse.json([]);
      }

      query = query.in('completed_at_location_id', locationIds);
    } else {
      // Staff only see their own records
      query = query.eq('staff_id', authz.userId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching training records:', error);
      return NextResponse.json(
        { error: 'Failed to fetch training records' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      records: data || [],
      userRole: authz.role,
      count: data?.length || 0
    });
  } catch (error) {
    console.error('Error in training matrix endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
