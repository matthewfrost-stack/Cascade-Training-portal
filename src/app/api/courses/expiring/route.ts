import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, getScopedLocationIds, requireRole } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

interface CourseData {
  name: string;
  course: string;
  expiry: string;
  expiryTime?: number;
  location: string;
  delivery: string;
  awaitingTrainingDate?: boolean;
  isOneOff?: boolean;
}
type CourseRef = { id?: string; name?: string; expiry_months?: number; never_expires?: boolean };
type CourseLinkRow = { location_id?: string | null; training_course_id?: string | null; training_courses?: CourseRef | CourseRef[] | null };
type TrainingCourseRow = {
  course_id?: string | null;
  completed_at_location_id?: string | null;
  expiry_date: string;
  profiles?: { full_name?: string; is_deleted?: boolean } | { full_name?: string; is_deleted?: boolean }[] | null;
  training_courses?: CourseRef | CourseRef[] | null;
  locations?: { name?: string } | { name?: string }[] | null;
};
type ServiceQuery = {
  gte: (column: string, value: string) => ServiceQuery;
  lte: (column: string, value: string) => ServiceQuery;
  lt: (column: string, value: string) => ServiceQuery;
  not: (column: string, operator: string, value: null) => ServiceQuery;
  in: (column: string, values: string[]) => ServiceQuery;
  range: (from: number, to: number) => Promise<{ data: Record<string, unknown>[] | null; error: { message?: string; code?: string } | null }>;
};

function isDeletedProfile(profile: { full_name?: string; is_deleted?: boolean } | null): boolean {
  if (!profile) return false;
  if (profile.is_deleted) return true;
  const name = (profile.full_name || '').trim().toLowerCase();
  return name === 'deleted user' || name.startsWith('deleted-') || name.includes('deleted-duplicate');
}

function buildLocationCourseKey(locationId?: string | null, courseId?: string | null): string | null {
  if (!locationId || !courseId) return null;
  return `${locationId}::${courseId}`;
}

function isOneOffCourse(course: { expiry_months?: number; never_expires?: boolean } | null | undefined): boolean {
  return Boolean(course?.never_expires || !course?.expiry_months || course?.expiry_months === 9999);
}

function canonicalCourseName(name?: string | null): string {
  if (!name) return '';
  return name.replace(/\s+\(Careskills\)\s*$/i, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function buildCareskillsAliasMap(courses: Array<{ id?: string; name?: string }>): Map<string, string> {
  const baseByName = new Map<string, string>();
  const aliasMap = new Map<string, string>();

  for (const course of courses) {
    if (!course?.id || !course?.name) continue;
    const name = course.name.trim();
    if (!name.includes('(Careskills)')) {
      baseByName.set(name.toLowerCase(), course.id);
    }
  }

  for (const course of courses) {
    if (!course?.id || !course?.name) continue;
    const name = course.name.trim();
    if (!name.includes('(Careskills)')) continue;
    const baseName = name.replace(' (Careskills)', '').trim().toLowerCase();
    const baseId = baseByName.get(baseName);
    if (baseId) {
      aliasMap.set(course.id, baseId);
    }
  }

  return aliasMap;
}

async function fetchAllRows(
  supabase: ReturnType<typeof createServiceClient>,
  table: string,
  selectClause: string,
  applyFilters?: (query: ServiceQuery) => ServiceQuery
): Promise<{ data: Record<string, unknown>[] | null; error: { message?: string; code?: string } | null }> {
  const pageSize = 1000;
  let from = 0;
  const allRows: Record<string, unknown>[] = [];

  while (true) {
    let query = supabase.from(table).select(selectClause) as unknown as ServiceQuery;
    if (applyFilters) query = applyFilters(query);
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) return { data: null, error };

    const rows = data || [];
    allRows.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return { data: allRows, error: null };
}

export async function GET(request: NextRequest) {
  try {
    const authz = await requireRole(['admin', 'scheduler', 'manager']);
    if ('error' in authz) return authz.error;

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const locationFilter = searchParams.get('locationFilter');
    const locationFilters = locationFilter ? locationFilter.split(',').map(id => id.trim()).filter(Boolean) : [];

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'startDate and endDate are required' },
        { status: 400 }
      );
    }

    // Use service client after role-gate; RLS on these tables now requires auth context.
    const supabase = createServiceClient();
    const scopedLocations = await getScopedLocationIds(authz.userId, authz.role, supabase);
    if (!scopedLocations.all) {
      const scopedIds = scopedLocations.ids;
      if (scopedIds.length === 0) {
        return NextResponse.json([]);
      }
      if (locationFilters.length > 0) {
        const filterSet = new Set(locationFilters);
        const intersection = scopedIds.filter((id) => filterSet.has(id));
        if (intersection.length === 0) {
          return NextResponse.json([]);
        }
        locationFilters.length = 0;
        locationFilters.push(...intersection);
      } else {
        locationFilters.push(...scopedIds);
      }
    }

    const { data: expiringCourses, error } = await fetchAllRows(
      supabase,
      'staff_training_matrix',
      `
        id,
        staff_id,
        course_id,
        expiry_date,
        status,
        completed_at_location_id,
        profiles(full_name, is_deleted),
        training_courses(name, expiry_months, never_expires),
        locations(name)
      `,
      (query) => {
        let scoped = query
          .gte('expiry_date', startDate)
          .lte('expiry_date', endDate)
          .not('expiry_date', 'is', null);
        if (locationFilters.length > 0) scoped = scoped.in('completed_at_location_id', locationFilters);
        return scoped;
      }
    );

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch expiring courses' },
        { status: 500 }
      );
    }

    const { data: locationCourseLinks, error: locationCourseError } = await fetchAllRows(
      supabase,
      'location_training_courses',
      'location_id, training_course_id, training_courses(name)',
      (query) => (locationFilters.length > 0 ? query.in('location_id', locationFilters) : query)
    );
    if (locationCourseError) {
      console.error('Supabase error fetching location-course links:', locationCourseError);
      return NextResponse.json(
        { error: 'Failed to validate location courses' },
        { status: 500 }
      );
    }

    const validLocationCourseKeys = new Set(
    ((locationCourseLinks || []) as CourseLinkRow[])
        .map((link) => buildLocationCourseKey(link.location_id, link.training_course_id))
        .filter((key): key is string => Boolean(key))
    );
    const validLocationCourseNames = new Set(
      ((locationCourseLinks || []) as CourseLinkRow[])
        .map((link) => {
          const linkedCourse = Array.isArray(link.training_courses) ? link.training_courses[0] : link.training_courses;
          const normalizedName = canonicalCourseName(linkedCourse?.name);
          if (!normalizedName || !link.location_id) return null;
          return `${link.location_id}::${normalizedName}`;
        })
        .filter((key): key is string => Boolean(key))
    );

    const { data: trainingCourses, error: trainingCoursesError } = await fetchAllRows(
      supabase,
      'training_courses',
      'id, name'
    );
    if (trainingCoursesError) {
      console.error('Supabase error fetching course aliases:', trainingCoursesError);
      return NextResponse.json(
        { error: 'Failed to validate course aliases' },
        { status: 500 }
      );
    }
    const careskillsAliasMap = buildCareskillsAliasMap((trainingCourses || []) as CourseRef[]);

    // Transform data
    const formattedData: CourseData[] = ((expiringCourses || []) as TrainingCourseRow[])
      .filter((record) => {
        const primaryKey = buildLocationCourseKey(record.completed_at_location_id, record.course_id);
        const baseCourseId = record.course_id ? careskillsAliasMap.get(record.course_id) : undefined;
        const aliasKey = baseCourseId
          ? buildLocationCourseKey(record.completed_at_location_id, baseCourseId)
          : null;
        const course = Array.isArray(record.training_courses)
          ? record.training_courses[0]
          : record.training_courses;
        const nameKey = record.completed_at_location_id
          ? `${record.completed_at_location_id}::${canonicalCourseName(course?.name)}`
          : null;
        return Boolean(
          (primaryKey && validLocationCourseKeys.has(primaryKey))
          || (aliasKey && validLocationCourseKeys.has(aliasKey))
          || (nameKey && validLocationCourseNames.has(nameKey))
        );
      })
      .filter((record) => {
        const course = Array.isArray(record.training_courses)
          ? record.training_courses[0]
          : record.training_courses;
        return !isOneOffCourse(course);
      })
      .filter((record) => !isDeletedProfile((Array.isArray(record.profiles) ? record.profiles[0] : record.profiles) || null))
      .map((record) => {
        const course = Array.isArray(record.training_courses)
          ? record.training_courses[0]
          : record.training_courses;
        const profiles = Array.isArray(record.profiles) ? record.profiles[0] : record.profiles;
        const locations = Array.isArray(record.locations) ? record.locations[0] : record.locations;
        const isOneOff = course?.never_expires || !course?.expiry_months || course?.expiry_months === 9999;
        const expiryDate = new Date(record.expiry_date);
        
        return {
          name: profiles?.full_name || 'Unknown',
          course: course?.name || 'Unknown Course',
          expiry: record.expiry_date,
          expiryTime: expiryDate.getTime(),
          location: locations?.name || 'Unknown Location',
          delivery: 'Standard',
          isOneOff,
        };
      });

    return NextResponse.json(formattedData);
  } catch (error) {
    console.error('Error fetching expiring courses:', error);
    return NextResponse.json(
      { error: 'Failed to fetch courses' },
      { status: 500 }
    );
  }
}
