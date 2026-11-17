import type { createServiceClient } from '@/lib/apiAuth';
import { escapeHtml } from '@/lib/email';

/**
 * Monthly "training due" email for each home's managers.
 *
 * For every home it lists, grouped by person:
 *   - Expired: the latest expiry date for that course is before today
 *   - Expiring: the latest expiry date is within the next LOOKAHEAD_DAYS
 *   - Allocated: allocated (or awaiting/booked) and not yet completed
 *
 * It applies the same rules as the expiry checker and TNA screens: only
 * courses on that home's matrix, no one-off courses for expiry, no deleted
 * staff, and "X" / "X (Careskills)" treated as the same course. In addition,
 * a person must still be linked to the home, which matches the matrix itself.
 */

export const LOOKAHEAD_DAYS = 60;
const TIME_ZONE = 'Europe/London';

type ServiceClient = ReturnType<typeof createServiceClient>;
type One<T> = T | T[] | null | undefined;
const first = <T,>(value: One<T>): T | undefined => (Array.isArray(value) ? value[0] : value ?? undefined);

type CourseRef = { id?: string; name?: string; expiry_months?: number | null; never_expires?: boolean | null };

export type DigestItem = {
  course: string;
  date?: string;        // expiry date (YYYY-MM-DD) for expired / expiring
  bookedOn?: string;    // earliest upcoming booking (YYYY-MM-DD), if any
};

export type DigestPerson = { name: string; items: DigestItem[] };

export type HomeDigest = {
  locationId: string;
  locationName: string;
  managerEmail: string | null;
  expired: DigestPerson[];
  expiring: DigestPerson[];
  allocated: DigestPerson[];
  counts: { expired: number; expiring: number; allocated: number };
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

// ---------- course helpers (same rules as /api/courses/*) ----------

function canonicalCourseName(name?: string | null): string {
  if (!name) return '';
  return name.replace(/\s+\(Careskills\)\s*$/i, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function displayCourseName(name?: string | null): string {
  return (name || 'Unknown course').replace(/\s+\(Careskills\)\s*$/i, '').replace(/\s+/g, ' ').trim();
}

function isOneOffCourse(course: CourseRef | undefined): boolean {
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

// ---------- data ----------

type LocationRow = { id: string; name: string; manager_email?: string | null };
type StaffLocationRow = { staff_id: string; location_id: string };
type LocationCourseRow = { location_id: string; training_course_id: string; training_courses: One<CourseRef> };
type MatrixRow = {
  staff_id: string;
  course_id: string;
  expiry_date: string | null;
  status: string | null;
  completed_at_location_id: string | null;
  profiles: One<{ full_name?: string | null; is_deleted?: boolean | null }>;
  training_courses: One<CourseRef>;
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

  const [staffLinks, courseLinks, matrixRows, upcomingEvents] = await Promise.all([
    fetchAll<StaffLocationRow>((from, to) =>
      service.from('staff_locations').select('staff_id, location_id').in('location_id', locationIds).range(from, to)),
    fetchAll<LocationCourseRow>((from, to) =>
      service.from('location_training_courses').select('location_id, training_course_id, training_courses(id, name)').in('location_id', locationIds).range(from, to)),
    fetchAll<MatrixRow>((from, to) =>
      service
        .from('staff_training_matrix')
        .select('staff_id, course_id, expiry_date, status, completed_at_location_id, profiles(full_name, is_deleted), training_courses(id, name, expiry_months, never_expires)')
        .in('completed_at_location_id', locationIds)
        .or('expiry_date.not.is.null,status.in.(allocated,awaiting,booked)')
        .range(from, to)),
    fetchAll<EventRow>((from, to) =>
      service.from('training_events').select('id, event_date, courses(name)').gte('event_date', today).range(from, to)),
  ]);

  // Who is still linked to each home.
  const linkedStaff = new Set(staffLinks.map((row) => `${row.location_id}::${row.staff_id}`));

  // Which courses are on each home's matrix (by id or by name).
  const validCourseIds = new Set<string>();
  const validCourseNames = new Set<string>();
  for (const link of courseLinks) {
    validCourseIds.add(`${link.location_id}::${link.training_course_id}`);
    const name = canonicalCourseName(first(link.training_courses)?.name);
    if (name) validCourseNames.add(`${link.location_id}::${name}`);
  }

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

  // Combine rows per home + person + course (so "X" and "X (Careskills)" count once,
  // and a renewal recorded under either name clears the older expiry).
  type Agg = { locationId: string; staffId: string; staffName: string; course: string; canonical: string; latestExpiry?: string; allocated: boolean };
  const combined = new Map<string, Agg>();

  for (const row of matrixRows) {
    const locationId = row.completed_at_location_id;
    if (!locationId || !row.staff_id) continue;
    if (!linkedStaff.has(`${locationId}::${row.staff_id}`)) continue;

    const profile = first(row.profiles);
    if (isDeletedProfile(profile)) continue;

    const course = first(row.training_courses);
    const canonical = canonicalCourseName(course?.name);
    if (!canonical) continue;
    const onMatrix = validCourseIds.has(`${locationId}::${row.course_id}`) || validCourseNames.has(`${locationId}::${canonical}`);
    if (!onMatrix) continue;

    const status = (row.status || '').toLowerCase();
    if (status === 'na') continue;

    const key = `${locationId}::${row.staff_id}::${canonical}`;
    const agg = combined.get(key) || {
      locationId,
      staffId: row.staff_id,
      staffName: (profile?.full_name || 'Unknown').trim(),
      course: displayCourseName(course?.name),
      canonical,
      allocated: false,
    };

    if (['allocated', 'awaiting', 'booked'].includes(status)) agg.allocated = true;
    if (row.expiry_date && !isOneOffCourse(course)) {
      const expiry = row.expiry_date.slice(0, 10);
      if (!agg.latestExpiry || expiry > agg.latestExpiry) agg.latestExpiry = expiry;
    }
    combined.set(key, agg);
  }

  // Sort into the three lists per home.
  type Bucket = Map<string, DigestPerson>;
  const buckets = new Map<string, { expired: Bucket; expiring: Bucket; allocated: Bucket }>();
  for (const loc of locations) buckets.set(loc.id, { expired: new Map(), expiring: new Map(), allocated: new Map() });

  const addTo = (bucket: Bucket, agg: Agg, item: DigestItem) => {
    const person = bucket.get(agg.staffId) || { name: agg.staffName, items: [] };
    person.items.push(item);
    bucket.set(agg.staffId, person);
  };

  for (const agg of combined.values()) {
    const home = buckets.get(agg.locationId);
    if (!home) continue;
    const booking = bookedOn.get(`${agg.staffId}::${agg.canonical}`);

    if (agg.latestExpiry) {
      if (agg.latestExpiry < today) addTo(home.expired, agg, { course: agg.course, date: agg.latestExpiry, bookedOn: booking });
      else if (agg.latestExpiry <= horizon) addTo(home.expiring, agg, { course: agg.course, date: agg.latestExpiry, bookedOn: booking });
      // Otherwise in date: nothing to do, even if a duplicate row says allocated.
    } else if (agg.allocated) {
      addTo(home.allocated, agg, { course: agg.course, bookedOn: booking });
    }
  }

  const finish = (bucket: Bucket): DigestPerson[] =>
    Array.from(bucket.values())
      .map((person) => ({
        ...person,
        items: person.items.sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.course.localeCompare(b.course)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  const countItems = (people: DigestPerson[]) => people.reduce((sum, person) => sum + person.items.length, 0);

  return locations.map((loc) => {
    const home = buckets.get(loc.id)!;
    const expired = finish(home.expired);
    const expiring = finish(home.expiring);
    const allocated = finish(home.allocated);
    return {
      locationId: loc.id,
      locationName: loc.name,
      managerEmail: loc.manager_email?.trim() || null,
      expired,
      expiring,
      allocated,
      counts: { expired: countItems(expired), expiring: countItems(expiring), allocated: countItems(allocated) },
    };
  });
}

// ---------- email ----------

export function digestSubject(home: HomeDigest, period: string): string {
  return `Training due – ${home.locationName} – ${periodLabel(period)}`;
}

export function renderDigestEmail(home: HomeDigest, period: string, baseUrl: string, opts: { noManagerEmail?: boolean } = {}): string {
  const total = home.counts.expired + home.counts.expiring + home.counts.allocated;
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

  const noEmailBanner = opts.noManagerEmail
    ? `<tr><td style="padding:16px 32px 0 32px;"><p style="margin:0;padding:12px;border:1px solid #fcd34d;background:#fffbeb;border-radius:6px;color:#92400e;font-size:14px;">
        This home does not have a managers' email address set, so this has been sent to the training inbox. Add it in <strong>Admin → Manage Venues</strong>, then edit ${safeHome}.
      </p></td></tr>`
    : '';

  const body = total === 0
    ? `<tr><td style="padding:24px 32px 0 32px;"><p style="margin:0;padding:16px;border-radius:6px;background:#f0fdf4;color:#166534;font-size:15px;">✅ <strong>All up to date.</strong> Nobody at ${safeHome} has training expired, expiring in the next ${LOOKAHEAD_DAYS} days, or waiting to be completed.</p></td></tr>`
    : `
      <tr><td style="padding:24px 32px 0 32px;color:#1f2937;font-size:15px;line-height:1.6;">
        <p style="margin:0;">Here is the training for <strong>${safeHome}</strong> that needs booking or chasing. Please book these onto courses so everyone stays in date.</p>
      </td></tr>
      ${section('🔴 Expired', '#dc2626', home.expired, home.counts.expired, (item) => ` – expired ${escapeHtml(formatShortDate(item.date || ''))}`)}
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
