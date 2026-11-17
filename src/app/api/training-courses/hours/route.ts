import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

/**
 * Training hours for the courses on the training matrix (admin only).
 *
 * GET  -> one row per course name ("X" and "X (Careskills)" are one course),
 *         only for courses that are on at least one home's matrix.
 * POST -> { items: [{ courseIds: string[], hours: number | null }] }
 *         sets the hours on every copy of each course.
 */

type CourseRow = { id: string; name: string | null; category?: string | null; hours?: number | string | null };

const MIGRATION_HINT =
  'The database has not been updated yet. Run the migration 20261117120000_add_course_hours_and_location_regulator.sql in the Supabase SQL Editor.';

function canonicalCourseName(name?: string | null): string {
  if (!name) return '';
  return name.replace(/\s+\(Careskills\)\s*$/i, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function isCareskillsCopy(name?: string | null): boolean {
  return /\(careskills\)\s*$/i.test(name || '');
}

function toHours(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function GET() {
  const authz = await requireRole(['admin']);
  if ('error' in authz) return authz.error;
  const { service } = authz;

  // Supabase returns at most 1000 rows per request, so page through both tables.
  const fetchAll = async <T,>(table: string, columns: string) => {
    const rows: T[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await service.from(table).select(columns).range(from, from + 999);
      if (error) return { data: null, error };
      rows.push(...((data || []) as T[]));
      if (!data || data.length < 1000) return { data: rows, error: null };
    }
  };
  const [coursesResult, linksResult] = await Promise.all([
    fetchAll<CourseRow>('training_courses', 'id, name, category, hours'),
    fetchAll<{ location_id: string; training_course_id: string }>('location_training_courses', 'location_id, training_course_id'),
  ]);

  if (coursesResult.error) {
    if (coursesResult.error.code === '42703' && /hours/.test(coursesResult.error.message || '')) {
      return NextResponse.json({ error: MIGRATION_HINT }, { status: 503 });
    }
    console.error('Training hours: course query failed', coursesResult.error);
    return NextResponse.json({ error: 'Could not load courses' }, { status: 500 });
  }
  if (linksResult.error) {
    console.error('Training hours: location course query failed', linksResult.error);
    return NextResponse.json({ error: 'Could not load courses' }, { status: 500 });
  }

  const courses = coursesResult.data || [];
  const homesByCourseId = new Map<string, Set<string>>();
  for (const link of linksResult.data || []) {
    if (!link.training_course_id) continue;
    const set = homesByCourseId.get(link.training_course_id) || new Set<string>();
    set.add(link.location_id);
    homesByCourseId.set(link.training_course_id, set);
  }

  type Group = { key: string; name: string; category: string; hours: number | null; courseIds: string[]; homes: Set<string> };
  const groups = new Map<string, Group>();
  for (const course of courses) {
    const key = canonicalCourseName(course.name);
    if (!key) continue;
    const group = groups.get(key) || { key, name: '', category: '', hours: null, courseIds: [], homes: new Set<string>() };
    group.courseIds.push(course.id);
    homesByCourseId.get(course.id)?.forEach((home) => group.homes.add(home));
    // Name, category and hours come from the main copy; the Careskills copy fills gaps.
    const isMain = !isCareskillsCopy(course.name);
    if (isMain || !group.name) group.name = (course.name || '').replace(/\s+\(Careskills\)\s*$/i, '').trim();
    if ((isMain && course.category) || !group.category) group.category = course.category || group.category;
    const hours = toHours(course.hours);
    if (hours !== null && (isMain || group.hours === null)) group.hours = hours;
    groups.set(key, group);
  }

  const items = Array.from(groups.values())
    .filter((group) => group.homes.size > 0)
    .map((group) => ({
      key: group.key,
      name: group.name,
      category: group.category || 'Uncategorised',
      hours: group.hours,
      courseIds: group.courseIds,
      homeCount: group.homes.size,
    }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const authz = await requireRole(['admin']);
  if ('error' in authz) return authz.error;
  const { service } = authz;

  const body = (await request.json().catch(() => null)) as { items?: Array<{ courseIds?: unknown; hours?: unknown }> } | null;
  const items = Array.isArray(body?.items) ? body!.items : [];
  if (items.length === 0 || items.length > 2000) {
    return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 });
  }

  // Validate everything before writing anything.
  const updates: Array<{ courseIds: string[]; hours: number | null }> = [];
  for (const item of items) {
    const courseIds = Array.isArray(item.courseIds)
      ? item.courseIds.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 64)
      : [];
    if (courseIds.length === 0 || courseIds.length > 10) {
      return NextResponse.json({ error: 'Invalid course in request.' }, { status: 400 });
    }
    const hours = toHours(item.hours);
    if (item.hours !== null && item.hours !== '' && item.hours !== undefined && hours === null) {
      return NextResponse.json({ error: 'Hours must be a number.' }, { status: 400 });
    }
    if (hours !== null && (hours < 0 || hours > 1000)) {
      return NextResponse.json({ error: 'Hours must be between 0 and 1000.' }, { status: 400 });
    }
    updates.push({ courseIds, hours: hours === null ? null : Math.round(hours * 100) / 100 });
  }

  let saved = 0;
  const failed: string[] = [];
  for (const update of updates) {
    const { error } = await service.from('training_courses').update({ hours: update.hours }).in('id', update.courseIds);
    if (error) {
      if (error.code === '42703' || error.code === 'PGRST204') {
        return NextResponse.json({ error: MIGRATION_HINT }, { status: 503 });
      }
      console.error('Training hours: update failed', error);
      failed.push(update.courseIds[0]);
      continue;
    }
    saved += 1;
  }

  if (failed.length > 0) {
    return NextResponse.json({ error: `${failed.length} course${failed.length === 1 ? '' : 's'} could not be saved.`, saved }, { status: 500 });
  }
  return NextResponse.json({ ok: true, saved });
}
