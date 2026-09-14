import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, getScopedLocationIds, requireRole } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authz = await requireRole(['admin', 'manager', 'scheduler', 'staff']);
    if ('error' in authz) return authz.error;

    const service = createServiceClient();
    const scoped = await getScopedLocationIds(authz.userId, authz.role, service);

    let locationsQuery = service
      .from('locations')
      .select('id, name')
      .order('name');
    if (!scoped.all) {
      if (scoped.ids.length === 0) return NextResponse.json({ locations: [], userRole: authz.role });
      locationsQuery = locationsQuery.in('id', scoped.ids);
    }

    const { data: locations, error: locationsError } = await locationsQuery;
    if (locationsError) {
      console.error('Error loading matrix locations:', locationsError);
      return NextResponse.json({ error: 'Failed to fetch matrix locations' }, { status: 500 });
    }

    const availableLocations = locations || [];
    const requestedLocationId = request.nextUrl.searchParams.get('locationId')?.trim();
    const selectedLocationId = requestedLocationId || availableLocations[0]?.id;
    if (!selectedLocationId) {
      return NextResponse.json({ locations: availableLocations, userRole: authz.role });
    }
    if (!availableLocations.some((location) => location.id === selectedLocationId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const recordsQuery = async () => {
      const records: unknown[] = [];
      let page = 0;
      const pageSize = 1000;

      while (true) {
        let query = service
          .from('staff_training_matrix')
          .select('id, staff_id, course_id, completion_date, expiry_date, status, completed_at_location_id')
          .eq('completed_at_location_id', selectedLocationId)
          .range(page * pageSize, (page + 1) * pageSize - 1);
        if (authz.role === 'staff') query = query.eq('staff_id', authz.userId);

        const { data, error } = await query;
        if (error) return { records: [], error };
        if (!data || data.length === 0) break;
        records.push(...data);
        page += 1;
        if (data.length < pageSize) break;
      }

      return { records, error: null };
    };

    const [staffResult, recordsResult, coursesResult, dividersResult, allCoursesResult] = await Promise.all([
      service
        .from('staff_locations')
        .select('staff_id, display_order')
        .eq('location_id', selectedLocationId)
        .order('display_order', { ascending: true, nullsFirst: false }),
      recordsQuery(),
      service
        .from('location_training_courses')
        .select('training_course_id, display_order, training_courses(id, name, category, expiry_months, never_expires)')
        .eq('location_id', selectedLocationId)
        .order('display_order', { ascending: true, nullsFirst: false }),
      service
        .from('location_matrix_dividers')
        .select('id, name, display_order')
        .eq('location_id', selectedLocationId)
        .order('display_order', { ascending: true }),
      service.from('training_courses').select('id, name'),
    ]);

    if (recordsResult.error) {
      console.error('Error loading matrix records:', recordsResult.error);
      return NextResponse.json({ error: 'Failed to fetch training records' }, { status: 500 });
    }
    if (staffResult.error) {
      console.error('Error loading matrix staff:', staffResult.error);
      return NextResponse.json({ error: 'Failed to fetch matrix staff' }, { status: 500 });
    }

    let locationCourses: any[] = coursesResult.data || [];
    if (coursesResult.error) {
      const message = String(coursesResult.error.message || '');
      if (coursesResult.error.code === '42703' || message.includes('training_courses.category') || message.includes('column "category"')) {
        const fallback = await service
          .from('location_training_courses')
          .select('training_course_id, display_order, training_courses(id, name, expiry_months, never_expires)')
          .eq('location_id', selectedLocationId)
          .order('display_order', { ascending: true, nullsFirst: false });
        if (fallback.error) {
          console.error('Error loading matrix courses:', fallback.error);
          return NextResponse.json({ error: 'Failed to fetch matrix courses' }, { status: 500 });
        }
        locationCourses = fallback.data || [];
      } else {
        console.error('Error loading matrix courses:', coursesResult.error);
        return NextResponse.json({ error: 'Failed to fetch matrix courses' }, { status: 500 });
      }
    }

    const staffRows = (staffResult.data || [])
      .filter((row) => authz.role !== 'staff' || row.staff_id === authz.userId);
    const profileIds = [...new Set([
      ...staffRows.map((row) => row.staff_id),
      ...recordsResult.records.map((row) => (row as { staff_id?: string }).staff_id),
    ].filter(Boolean))];
    const { data: profiles, error: profilesError } = profileIds.length > 0
      ? await service.from('profiles').select('id, full_name, is_deleted').in('id', profileIds)
      : { data: [], error: null };
    if (profilesError) {
      console.error('Error loading matrix profiles:', profilesError);
      return NextResponse.json({ error: 'Failed to fetch matrix profiles' }, { status: 500 });
    }

    const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));
    const staffLocations = staffRows.map((row) => ({
      ...row,
      profiles: profileMap.get(row.staff_id) || null,
    }));

    return NextResponse.json({
      locations: availableLocations,
      selectedLocationId,
      userRole: authz.role,
      staffLocations,
      records: recordsResult.records,
      profiles: profiles || [],
      dividers: authz.role === 'staff' ? [] : (dividersResult.data || []),
      locationCourses,
      allCourses: allCoursesResult.data || [],
    });
  } catch (error) {
    console.error('Error in training matrix bootstrap endpoint:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
