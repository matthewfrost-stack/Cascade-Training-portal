import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, getScopedLocationIds, requireRole } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authz = await requireRole(['staff', 'manager', 'scheduler', 'admin']);
    if ('error' in authz) return authz.error;

    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'csv'; // csv or json
    const locationId = searchParams.get('locationId');

    if (!locationId) {
      return NextResponse.json({ error: 'locationId required' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const scopedLocations = await getScopedLocationIds(authz.userId, authz.role, supabase);
    if (!scopedLocations.all && !scopedLocations.ids.includes(locationId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get staff and courses for location
    const { data: staffData, error: staffError } = await supabase
      .from('staff_locations')
      .select('staff_id, profiles(full_name, email), display_order')
      .eq('location_id', locationId)
      .order('display_order', { ascending: true });

    if (staffError) {
      return NextResponse.json({ error: 'Failed to fetch staff' }, { status: 500 });
    }

    const { data: courseData, error: courseError } = await supabase
      .from('location_courses')
      .select('course_id, courses(name, category), display_order')
      .eq('location_id', locationId)
      .order('display_order', { ascending: true });

    if (courseError) {
      return NextResponse.json({ error: 'Failed to fetch courses' }, { status: 500 });
    }

    // Get all training records for this location
    const { data: trainingData, error: trainingError } = await supabase
      .from('staff_training_matrix')
      .select('staff_id, course_id, completion_date, expiry_date, status')
      .eq('completed_at_location_id', locationId);

    if (trainingError) {
      return NextResponse.json({ error: 'Failed to fetch training data' }, { status: 500 });
    }

    // Build matrix
    const trainingMap = new Map<string, any>();
    (trainingData || []).forEach((record) => {
      const key = `${record.staff_id}|${record.course_id}`;
      trainingMap.set(key, record);
    });

    const staff = (staffData || []).map((s: any) => ({
      id: s.staff_id,
      name: s.profiles?.full_name || 'Unknown',
      email: s.profiles?.email || '',
    }));

    const courses = (courseData || []).map((c: any) => ({
      id: c.course_id,
      name: c.courses?.name || 'Unknown',
      category: c.courses?.category || '',
    }));

    if (format === 'json') {
      return NextResponse.json({
        staff,
        courses,
        training: Array.from(trainingMap.values()),
      });
    }

    // CSV format
    let csv = 'Staff Name,Email,' + courses.map((c) => c.name).join(',') + '\n';

    staff.forEach((s: any) => {
      const row = [s.name, s.email];
      courses.forEach((c: any) => {
        const key = `${s.id}|${c.id}`;
        const record = trainingMap.get(key);
        if (record?.status === 'completed') {
          row.push(`✓ (${record.completion_date || 'N/A'})`);
        } else if (record?.status === 'allocated') {
          row.push('Allocated');
        } else if (record?.status === 'not_yet_due') {
          row.push('Not Yet Due');
        } else if (record?.status === 'na') {
          row.push('N/A');
        } else {
          row.push('');
        }
      });
      csv += row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',') + '\n';
    });

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="roster-export-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
