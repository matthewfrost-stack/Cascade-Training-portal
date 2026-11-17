import type { createServiceClient } from '@/lib/apiAuth';
import { escapeHtml } from '@/lib/email';

/**
 * Monthly "training due" email for each home's managers.
 *
 * It follows the Training Matrix exactly: every person linked to the home,
 * against every course on that home's matrix ("X" and "X (Careskills)" are one
 * course). Each cell is judged the way MatrixLayout colours it:
 *   - N/A or Not yet due            -> left out
 *   - Allocated / awaiting / booked -> Allocated
 *   - No completion date            -> Never completed (the matrix's red "Missing")
 *   - One-off course, completed     -> left out
 *   - No expiry date, or expired    -> Expired
 *   - Expires within LOOKAHEAD_DAYS -> Expiring
 * The expiry rule (one-off or not) comes from the course on the home's
 * matrix, not from whichever copy of the course the record was saved under.
 */

export const LOOKAHEAD_DAYS = 60;
const TIME_ZONE = 'Europe/London';

type ServiceClient = ReturnType<typeof createServiceClient>;
type One<T> = T | T[] | null | undefined;
const first = <T,>(value: One<T>): T | undefined => (Array.isArray(value) ? value[0] : value ?? undefined);

type CourseRef = { id: string; name?: string | null; expiry_months?: number | null; never_expires?: boolean | null };

export type DigestItem = {
  course: string;
  date?: string;          // expiry date (YYYY-MM-DD), when there is one
  noExpiryDate?: boolean; // completed, but no expiry date recorded
  bookedOn?: string;      // earliest upcoming booking (YYYY-MM-DD), if any
};

export type DigestPerson = { name: string; items: DigestItem[] };

export type DigestCounts = { expired: number; missing: number; expiring: number; allocated: number };

export type HomeDigest = {
  locationId: string;
  locationName: string;
  managerEmail: string | null;
  expired: DigestPerson[];
  missing: DigestPerson[];
  expiring: DigestPerson[];
  allocated: DigestPerson[];
  counts: DigestCounts;
};

// ---------- dates ----------

/** Today's date in the UK as YYYY-MM-DD. */
export function ukToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** The month a send belongs to, e.g. '2026-12'. */
export function digestPeriod(now: Date = new Date()): string {
  return ukToday(now).slice(0, 7);
}

export function periodLabel(period: string): string {
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatShortDate(isoDate: string): string {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

// ---------- course helpers (same rules as the matrix) ----------

function canonicalCourseName(name?: string | null): string {
  if (!name) return '';
  return name.replace(/\s+\(Careskills\)\s*$/i, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function displayCourseName(name?: string | null): string {
  return (name || 'Unknown course').replace(/\s+\(Careskills\)\s*$/i, '').replace(/\s+/g, ' ').trim();
}

function isOneOffCourse(course: Pick<CourseRef, 'expiry_months' | 'never_expires'> | undefined): boolean {
  return Boolean(course?.never_expires || !course?.expiry_months || course?.expiry_months === 9999);
}

function isDeletedProfile(profile: { full_name?: string | null; is_deleted?: boolean | null } | undefined): boolean {
  if (!profile) return true;
  if (profile.is_deleted) return true;
  const name = (profile.full_name || '').trim().toLowerCase();
  return name === 'deleted user' || name.startsWith('deleted-') || name.includes('deleted-duplicate');
}

async function fetchAll<T>(
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
async function mapLimited<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

// ---------- data ----------

type LocationRow = { id: string; name: string; manager_email?: string | null };
type StaffLocationRow = { staff_id: string; location_id: string; profiles: One<{ full_name?: string | null; is_deleted?: boolean | null }> };
type LocationCourseRow = { location_id: string; training_course_id: string };
type MatrixRow = {
  staff_id: string;
  course_id: string;
  completion_date: string | null;
  expiry_date: string | null;
  status: string | null;
};
type EventRow = { id: string; event_date: string; courses: One<{ name?: string | null }> };
type BookingRow = { profile_id: string; event_id: string };

export class MissingMigrationError extends Error {}

export async function loadLocations(service: ServiceClient): Promise<LocationRow[]> {
  const { data, error } = await service.from('locations').select('id, name, manager_email').order('name');
  if (error) {
    if (error.code === '42703' || /manager_email/.test(error.message || '')) {
      throw new MissingMigrationError(
        'The database has not been updated yet. Run the migration 20261117090000_add_location_manager_email_and_digest_log.sql in the Supabase SQL Editor.'
      );
    }
    throw new Error(error.message);
  }
  // Deduplicate by id, as the Location Manager does.
  return Array.from(new Map((data || []).map((row) => [row.id, row as LocationRow])).values());
}

/** Builds the digest for every home (or just `onlyLocationId`). */
export async function buildHomeDigests(
  service: ServiceClient,
  options: { onlyLocationId?: string; now?: Date } = {}
): Promise<HomeDigest[]> {
  const today = ukToday(options.now);
  const horizon = addDays(today, LOOKAHEAD_DAYS);

  let locations = await loadLocations(service);
  if (options.onlyLocationId) locations = locations.filter((loc) => loc.id === options.onlyLocationId);
  if (locations.length === 0) return [];
  const locationIds = locations.map((loc) => loc.id);

  const [staffLinks, courseLinks, allCourses, upcomingEvents] = await Promise.all([
    fetchAll<StaffLocationRow>((from, to) =>
      service.from('staff_locations').select('staff_id, location_id, profiles(full_name, is_deleted)').in('location_id', locationIds).range(from, to)),
    fetchAll<LocationCourseRow>((from, to) =>
      service.from('location_training_courses').select('location_id, training_course_id').in('location_id', locationIds).range(from, to)),
    fetchAll<CourseRef>((from, to) =>
      service.from('training_courses').select('id, name, expiry_months, never_expires').range(from, to)),
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

  const finish = (bucket: Map<string, DigestPerson>): DigestPerson[] =>
    Array.from(bucket.values())
      .map((person) => ({
        ...person,
        items: person.items.sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.course.localeCompare(b.course)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  const countItems = (people: DigestPerson[]) => people.reduce((sum, person) => sum + person.items.length, 0);

  return locations.map((loc) => {
    // Columns on this home's matrix, one per course name.
    const columns = new Map<string, CourseRef>();
    for (const link of courseLinks) {
      if (link.location_id !== loc.id) continue;
      const course = courseById.get(link.training_course_id);
      const key = canonicalCourseName(course?.name);
      if (!course || !key) continue;
      // Prefer the non-Careskills copy as the column's course, as the matrix does.
      const existing = columns.get(key);
      if (!existing || (/\(careskills\)/i.test(existing.name || '') && !/\(careskills\)/i.test(course.name || ''))) {
        columns.set(key, course);
      }
    }

    // Records for this home, grouped by person + course name.
    const recordsByCell = new Map<string, MatrixRow[]>();
    for (const row of matrixByLocation.get(loc.id) || []) {
      const key = `${row.staff_id}::${canonicalCourseName(courseById.get(row.course_id)?.name)}`;
      const list = recordsByCell.get(key) || [];
      list.push(row);
      recordsByCell.set(key, list);
    }

    // People on this home's matrix.
    const people = new Map<string, string>();
    for (const link of staffLinks) {
      if (link.location_id !== loc.id) continue;
      const profile = first(link.profiles);
      if (isDeletedProfile(profile)) continue;
      people.set(link.staff_id, (profile?.full_name || 'Unknown').trim());
    }

    const buckets = { expired: new Map<string, DigestPerson>(), missing: new Map<string, DigestPerson>(), expiring: new Map<string, DigestPerson>(), allocated: new Map<string, DigestPerson>() };
    const addTo = (bucket: Map<string, DigestPerson>, staffId: string, item: DigestItem) => {
      const person = bucket.get(staffId) || { name: people.get(staffId) || 'Unknown', items: [] };
      person.items.push(item);
      bucket.set(staffId, person);
    };

    for (const [staffId] of people) {
      for (const [courseKey, column] of columns) {
        const records = recordsByCell.get(`${staffId}::${courseKey}`) || [];
        const statuses = records.map((r) => (r.status || '').toLowerCase());
        const course = displayCourseName(column.name);
        const booking = bookedOn.get(`${staffId}::${courseKey}`);

        if (statuses.includes('na') || statuses.includes('not_yet_due')) continue;

        // Latest completion and latest expiry across "X" and "X (Careskills)".
        const completed = records.filter((r) => r.completion_date);
        const latestExpiry = completed
          .map((r) => r.expiry_date?.slice(0, 10))
          .filter((d): d is string => Boolean(d))
          .sort()
          .pop();

        if (statuses.some((s) => s === 'allocated' || s === 'awaiting' || s === 'booked')) {
          // Already renewed under the other copy of the course? Then it's in date.
          if (latestExpiry && latestExpiry > horizon && !isOneOffCourse(column)) continue;
          addTo(buckets.allocated, staffId, { course, bookedOn: booking });
          continue;
        }

        if (completed.length === 0) {
          addTo(buckets.missing, staffId, { course, bookedOn: booking });
          continue;
        }

        if (isOneOffCourse(column)) continue;

        if (!latestExpiry) {
          addTo(buckets.expired, staffId, { course, noExpiryDate: true, bookedOn: booking });
        } else if (latestExpiry <= today) { // the matrix counts 'expires today' as expired
          addTo(buckets.expired, staffId, { course, date: latestExpiry, bookedOn: booking });
        } else if (latestExpiry < horizon) {
          addTo(buckets.expiring, staffId, { course, date: latestExpiry, bookedOn: booking });
        }
      }
    }

    const expired = finish(buckets.expired);
    const missing = finish(buckets.missing);
    const expiring = finish(buckets.expiring);
    const allocated = finish(buckets.allocated);
    return {
      locationId: loc.id,
      locationName: loc.name,
      managerEmail: loc.manager_email?.trim() || null,
      expired,
      missing,
      expiring,
      allocated,
      counts: { expired: countItems(expired), missing: countItems(missing), expiring: countItems(expiring), allocated: countItems(allocated) },
    };
  });
}

// ---------- email ----------

export function digestSubject(home: HomeDigest, period: string): string {
  return `Training due – ${home.locationName} – ${periodLabel(period)}`;
}

export function renderDigestEmail(home: HomeDigest, period: string, baseUrl: string, opts: { noManagerEmail?: boolean } = {}): string {
  const total = home.counts.expired + home.counts.missing + home.counts.expiring + home.counts.allocated;
  const safeHome = escapeHtml(home.locationName);
  const safeMonth = escapeHtml(periodLabel(period));
  const calendarUrl = escapeHtml(`${baseUrl}/apps/booking-calendar`);
  const matrixUrl = escapeHtml(`${baseUrl}/training-matrix`);

  const section = (title: string, colour: string, people: DigestPerson[], count: number, describe: (item: DigestItem) => string) => {
    if (people.length === 0) return '';
    const rows = people
      .map((person) => {
        const items = person.items
          .map((item) => {
            const booked = item.bookedOn
              ? ` <span style="display:inline-block;margin-left:6px;padding:1px 8px;border-radius:10px;background:#dcfce7;color:#166534;font-size:12px;font-weight:bold;">Booked ${escapeHtml(formatShortDate(item.bookedOn))}</span>`
              : '';
            return `<li style="margin:2px 0;">${escapeHtml(item.course)}${describe(item)}${booked}</li>`;
          })
          .join('');
        return `<tr><td style="padding:8px 0;border-bottom:1px solid #f1f5f9;">
          <p style="margin:0 0 2px 0;font-weight:bold;color:#111827;">${escapeHtml(person.name)}</p>
          <ul style="margin:0;padding-left:20px;color:#374151;">${items}</ul>
        </td></tr>`;
      })
      .join('');
    return `
      <tr><td style="padding:20px 32px 0 32px;">
        <p style="margin:0 0 6px 0;font-size:16px;font-weight:bold;color:${colour};border-left:4px solid ${colour};padding-left:10px;">${title} (${count})</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
      </td></tr>`;
  };

  const expiredText = (item: DigestItem) =>
    item.noExpiryDate ? ' – no expiry date recorded' : ` – expired ${escapeHtml(formatShortDate(item.date || ''))}`;

  const noEmailBanner = opts.noManagerEmail
    ? `<tr><td style="padding:16px 32px 0 32px;"><p style="margin:0;padding:12px;border:1px solid #fcd34d;background:#fffbeb;border-radius:6px;color:#92400e;font-size:14px;">
        This home does not have a managers' email address set, so this has been sent to the training inbox. Add it in <strong>Admin → Manage Venues</strong>, then edit ${safeHome}.
      </p></td></tr>`
    : '';

  const body = total === 0
    ? `<tr><td style="padding:24px 32px 0 32px;"><p style="margin:0;padding:16px;border-radius:6px;background:#f0fdf4;color:#166534;font-size:15px;">✅ <strong>All up to date.</strong> Nobody at ${safeHome} has training expired, never completed, expiring in the next ${LOOKAHEAD_DAYS} days, or waiting to be completed.</p></td></tr>`
    : `
      <tr><td style="padding:24px 32px 0 32px;color:#1f2937;font-size:15px;line-height:1.6;">
        <p style="margin:0;">Here is the training for <strong>${safeHome}</strong> that needs booking or chasing. Please book these onto courses so everyone stays in date.</p>
      </td></tr>
      ${section('🔴 Expired', '#dc2626', home.expired, home.counts.expired, expiredText)}
      ${section('⚫ Never completed', '#374151', home.missing, home.counts.missing, () => '')}
      ${section(`🟠 Expiring in the next ${LOOKAHEAD_DAYS} days`, '#ea580c', home.expiring, home.counts.expiring, (item) => ` – expires ${escapeHtml(formatShortDate(item.date || ''))}`)}
      ${section('🟡 Allocated, not yet completed', '#ca8a04', home.allocated, home.counts.allocated, () => '')}`;

  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:24px 0;font-family:Arial,Helvetica,sans-serif;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:8px;">
        <tr>
          <td style="background-color:#1e3a5f;padding:20px 32px;border-radius:8px 8px 0 0;">
            <p style="margin:0;color:#ffffff;font-size:18px;font-weight:bold;">Training due – ${safeHome}</p>
            <p style="margin:4px 0 0 0;color:#cbd5e1;font-size:13px;">${safeMonth} · Training Team</p>
          </td>
        </tr>
        ${noEmailBanner}
        ${body}
        <tr><td style="padding:24px 32px 8px 32px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="background-color:#1d4ed8;border-radius:6px;"><a href="${calendarUrl}" style="display:inline-block;padding:12px 24px;color:#ffffff;font-weight:bold;text-decoration:none;font-size:15px;">Open booking calendar</a></td>
            <td style="width:12px;"></td>
            <td style="border:1px solid #1d4ed8;border-radius:6px;"><a href="${matrixUrl}" style="display:inline-block;padding:11px 20px;color:#1d4ed8;font-weight:bold;text-decoration:none;font-size:15px;">View training matrix</a></td>
          </tr></table>
        </td></tr>
        <tr>
          <td style="padding:16px 32px 24px 32px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.5;">
            <p style="margin:0;">Sent automatically on the 1st of each month by the Cascade Portal. “Booked” means the person is already on an upcoming session for that course. If something looks wrong, reply to this email and the Training Team will check the matrix.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}
