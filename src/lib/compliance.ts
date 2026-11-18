import type { createServiceClient } from '@/lib/apiAuth';

/**
 * One place that decides the state of every training matrix cell, so the
 * manager email, the compliance report and the monthly snapshots always agree
 * with each other and with the Training Matrix.
 *
 * Every person linked to a home is checked against every course on that
 * home's matrix ("X" and "X (Careskills)" are one course). Each cell is
 * judged the way MatrixLayout colours it:
 *   - N/A                           -> 'na'
 *   - Not yet due                   -> 'not_yet_due'
 *   - Allocated / awaiting / booked -> 'allocated'
 *   - No completion date            -> 'missing' (the matrix's red "Missing")
 *   - One-off course, completed     -> 'in_date'
 *   - No expiry date, or expired    -> 'expired'
 *   - Expires within LOOKAHEAD_DAYS -> 'expiring'
 *   - Otherwise                     -> 'in_date'
 * The expiry rule (one-off or not) comes from the course on the home's
 * matrix, not from whichever copy of the course the record was saved under.
 */

export const LOOKAHEAD_DAYS = 60;
const TIME_ZONE = 'Europe/London';

type ServiceClient = ReturnType<typeof createServiceClient>;
type One<T> = T | T[] | null | undefined;
const first = <T,>(value: One<T>): T | undefined => (Array.isArray(value) ? value[0] : value ?? undefined);

export type CellState = 'in_date' | 'expiring' | 'expired' | 'missing' | 'allocated' | 'na' | 'not_yet_due';

export type CourseColumn = {
  key: string;            // canonical course name
  name: string;           // display name (without "(Careskills)")
  category: string;
  oneOff: boolean;
};

export type Cell = {
  staffId: string;
  courseKey: string;
  state: CellState;
  completion?: string;    // latest completion date (YYYY-MM-DD)
  expiry?: string;        // latest expiry date (YYYY-MM-DD)
  noExpiryDate?: boolean; // completed, but no expiry date recorded
  bookedOn?: string;      // earliest upcoming booking (YYYY-MM-DD)
};

export type HomeEvaluation = {
  locationId: string;
  locationName: string;
  managerEmail: string | null;
  regulator: 'CQC' | 'Ofsted' | null;
  people: Array<{ staffId: string; name: string }>;
  columns: CourseColumn[];
  cells: Cell[];
};

// ---------- dates ----------

/** Today's date in the UK as YYYY-MM-DD. */
export function ukToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------- course helpers (same rules as the matrix) ----------

export function canonicalCourseName(name?: string | null): string {
  if (!name) return '';
  return name.replace(/\s+\(Careskills\)\s*$/i, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function displayCourseName(name?: string | null): string {
  return (name || 'Unknown course').replace(/\s+\(Careskills\)\s*$/i, '').replace(/\s+/g, ' ').trim();
}

function isOneOffCourse(course: { expiry_months?: number | null; never_expires?: boolean | null } | undefined): boolean {
  return Boolean(course?.never_expires || !course?.expiry_months || course?.expiry_months === 9999);
}

export function isDeletedProfile(profile: { full_name?: string | null; is_deleted?: boolean | null } | undefined): boolean {
  if (!profile) return true;
  if (profile.is_deleted) return true;
  const name = (profile.full_name || '').trim().toLowerCase();
  return name === 'deleted user' || name.startsWith('deleted-') || name.includes('deleted-duplicate');
}

export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message?: string } | null }>
): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw new Error(error.message || 'Database query failed');
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

/** Runs `task` for each item with at most `limit` running at once. */
async function mapLimited<T>(items: T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      await task(items[index]);
    }
  });
  await Promise.all(workers);
}

// ---------- data ----------

type CourseRow = { id: string; name?: string | null; category?: string | null; expiry_months?: number | null; never_expires?: boolean | null };
type LocationRow = { id: string; name: string; manager_email?: string | null; regulator?: string | null };
type StaffLocationRow = { staff_id: string; location_id: string; profiles: One<{ full_name?: string | null; is_deleted?: boolean | null }> };
type LocationCourseRow = { location_id: string; training_course_id: string };
type MatrixRow = { staff_id: string; course_id: string; completion_date: string | null; expiry_date: string | null; status: string | null };
type EventRow = { id: string; event_date: string; courses: One<{ name?: string | null }> };
type BookingRow = { profile_id: string; event_id: string };

export class MissingMigrationError extends Error {}

export async function loadLocations(service: ServiceClient): Promise<LocationRow[]> {
  const { data, error } = await service.from('locations').select('id, name, manager_email, regulator').order('name');
  if (error) {
    if (error.code === '42703' || /manager_email|regulator/.test(error.message || '')) {
      throw new MissingMigrationError(
        'The database has not been updated yet. Run the latest migrations (20261117090000 and 20261117120000) in the Supabase SQL Editor.'
      );
    }
    throw new Error(error.message);
  }
  // Deduplicate by id, as the Location Manager does.
  return Array.from(new Map((data || []).map((row) => [row.id, row as LocationRow])).values());
}

/** Works out every cell for every home (or just `onlyLocationIds`). */
export async function evaluateHomes(
  service: ServiceClient,
  options: { onlyLocationIds?: string[]; now?: Date } = {}
): Promise<HomeEvaluation[]> {
  const today = ukToday(options.now);
  const horizon = addDays(today, LOOKAHEAD_DAYS);

  let locations = await loadLocations(service);
  if (options.onlyLocationIds) {
    const wanted = new Set(options.onlyLocationIds);
    locations = locations.filter((loc) => wanted.has(loc.id));
  }
  if (locations.length === 0) return [];
  const locationIds = locations.map((loc) => loc.id);

  const [staffLinks, courseLinks, allCourses, upcomingEvents] = await Promise.all([
    fetchAll<StaffLocationRow>((from, to) =>
      service.from('staff_locations').select('staff_id, location_id, profiles(full_name, is_deleted)').in('location_id', locationIds).range(from, to)),
    fetchAll<LocationCourseRow>((from, to) =>
      service.from('location_training_courses').select('location_id, training_course_id').in('location_id', locationIds).range(from, to)),
    fetchAll<CourseRow>((from, to) =>
      service.from('training_courses').select('id, name, category, expiry_months, never_expires').range(from, to)),
    fetchAll<EventRow>((from, to) =>
      service.from('training_events').select('id, event_date, courses(name)').gte('event_date', today).range(from, to)),
  ]);

  // Every matrix record for each home (one home at a time keeps each query small).
  const matrixByLocation = new Map<string, MatrixRow[]>();
  await mapLimited(locationIds, 6, async (locationId) => {
    const rows = await fetchAll<MatrixRow>((from, to) =>
      service
        .from('staff_training_matrix')
        .select('staff_id, course_id, completion_date, expiry_date, status')
        .eq('completed_at_location_id', locationId)
        .range(from, to));
    matrixByLocation.set(locationId, rows);
  });

  const courseById = new Map(allCourses.map((course) => [course.id, course]));

  // Earliest upcoming booking per person + course name.
  const eventById = new Map(upcomingEvents.map((event) => [event.id, event]));
  const bookedOn = new Map<string, string>();
  const eventIds = upcomingEvents.map((event) => event.id);
  for (let i = 0; i < eventIds.length; i += 200) {
    const chunk = eventIds.slice(i, i + 200);
    const bookings = await fetchAll<BookingRow>((from, to) =>
      service.from('bookings').select('profile_id, event_id').in('event_id', chunk).range(from, to));
    for (const booking of bookings) {
      const event = eventById.get(booking.event_id);
      const courseName = canonicalCourseName(first(event?.courses)?.name);
      if (!event || !courseName || !booking.profile_id) continue;
      const key = `${booking.profile_id}::${courseName}`;
      const existing = bookedOn.get(key);
      if (!existing || event.event_date < existing) bookedOn.set(key, event.event_date);
    }
  }

  return locations.map((loc) => {
    // Columns on this home's matrix, one per course name.
    const columnCourse = new Map<string, CourseRow>();
    for (const link of courseLinks) {
      if (link.location_id !== loc.id) continue;
      const course = courseById.get(link.training_course_id);
      const key = canonicalCourseName(course?.name);
      if (!course || !key) continue;
      // Prefer the non-Careskills copy as the column's course, as the matrix does.
      const existing = columnCourse.get(key);
      if (!existing || (/\(careskills\)/i.test(existing.name || '') && !/\(careskills\)/i.test(course.name || ''))) {
        columnCourse.set(key, course);
      }
    }
    const columns: CourseColumn[] = Array.from(columnCourse.entries())
      .map(([key, course]) => ({ key, name: displayCourseName(course.name), category: course.category || 'Uncategorised', oneOff: isOneOffCourse(course) }))
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

    // Records for this home, grouped by person + course name.
    const recordsByCell = new Map<string, MatrixRow[]>();
    for (const row of matrixByLocation.get(loc.id) || []) {
      const key = `${row.staff_id}::${canonicalCourseName(courseById.get(row.course_id)?.name)}`;
      const list = recordsByCell.get(key) || [];
      list.push(row);
      recordsByCell.set(key, list);
    }

    // People on this home's matrix.
    const peopleMap = new Map<string, string>();
    for (const link of staffLinks) {
      if (link.location_id !== loc.id) continue;
      const profile = first(link.profiles);
      if (isDeletedProfile(profile)) continue;
      peopleMap.set(link.staff_id, (profile?.full_name || 'Unknown').trim());
    }
    const people = Array.from(peopleMap.entries())
      .map(([staffId, name]) => ({ staffId, name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const cells: Cell[] = [];
    for (const { staffId } of people) {
      for (const column of columns) {
        const records = recordsByCell.get(`${staffId}::${column.key}`) || [];
        const statuses = records.map((r) => (r.status || '').toLowerCase());
        const booking = bookedOn.get(`${staffId}::${column.key}`);
        const base = { staffId, courseKey: column.key, ...(booking ? { bookedOn: booking } : {}) };

        if (statuses.includes('na')) { cells.push({ ...base, state: 'na' }); continue; }
        if (statuses.includes('not_yet_due')) { cells.push({ ...base, state: 'not_yet_due' }); continue; }

        // Latest completion and latest expiry across "X" and "X (Careskills)".
        const completed = records.filter((r) => r.completion_date);
        const latestCompletion = completed.map((r) => r.completion_date!.slice(0, 10)).sort().pop();
        const latestExpiry = completed
          .map((r) => r.expiry_date?.slice(0, 10))
          .filter((d): d is string => Boolean(d))
          .sort()
          .pop();
        const dates = { ...(latestCompletion ? { completion: latestCompletion } : {}), ...(latestExpiry ? { expiry: latestExpiry } : {}) };

        if (statuses.some((s) => s === 'allocated' || s === 'awaiting' || s === 'booked')) {
          // Already renewed under the other copy of the course? Then it's in date.
          if (latestExpiry && latestExpiry >= horizon && !column.oneOff) { cells.push({ ...base, ...dates, state: 'in_date' }); continue; }
          cells.push({ ...base, ...dates, state: 'allocated' });
          continue;
        }

        if (completed.length === 0) { cells.push({ ...base, state: 'missing' }); continue; }
        if (column.oneOff) { cells.push({ ...base, ...dates, state: 'in_date' }); continue; }

        if (!latestExpiry) cells.push({ ...base, ...dates, state: 'expired', noExpiryDate: true });
        else if (latestExpiry <= today) cells.push({ ...base, ...dates, state: 'expired' }); // the matrix counts 'expires today' as expired
        else if (latestExpiry < horizon) cells.push({ ...base, ...dates, state: 'expiring' });
        else cells.push({ ...base, ...dates, state: 'in_date' });
      }
    }

    return {
      locationId: loc.id,
      locationName: loc.name,
      managerEmail: loc.manager_email?.trim() || null,
      regulator: loc.regulator === 'CQC' || loc.regulator === 'Ofsted' ? loc.regulator : null,
      people,
      columns,
      cells,
    };
  });
}

// ---------- summaries ----------

export type StateCounts = Record<CellState, number>;

export function countStates(cells: Cell[]): StateCounts {
  const counts: StateCounts = { in_date: 0, expiring: 0, expired: 0, missing: 0, allocated: 0, na: 0, not_yet_due: 0 };
  for (const cell of cells) counts[cell.state] += 1;
  return counts;
}

/**
 * Compliance % = in date (including expiring soon) / training that applies.
 * N/A and Not yet due don't apply, so they're left out of both sides.
 * Returns null when nothing applies.
 */
export function compliancePercent(counts: StateCounts): number | null {
  const required = counts.in_date + counts.expiring + counts.expired + counts.missing + counts.allocated;
  if (required === 0) return null;
  return Math.round(((counts.in_date + counts.expiring) / required) * 1000) / 10;
}

export function requiredCount(counts: StateCounts): number {
  return counts.in_date + counts.expiring + counts.expired + counts.missing + counts.allocated;
}

/** Learning disability & autism training (Oliver McGowan) columns. */
export function isLdaCourse(column: CourseColumn): boolean {
  return /oliver\s*mcgowan/i.test(column.name);
}
