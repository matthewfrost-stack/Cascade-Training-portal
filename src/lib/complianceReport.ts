import type { createServiceClient } from '@/lib/apiAuth';
import {
  addDays,
  compliancePercent,
  countStates,
  evaluateHomes,
  fetchAll,
  isLdaCourse,
  requiredCount,
  ukToday,
  type Cell,
  type HomeEvaluation,
  type StateCounts,
} from '@/lib/compliance';
import { bookingHours } from '@/lib/trainingHours';

type ServiceClient = ReturnType<typeof createServiceClient>;

export type HoursSummary = { delivered: number; lostAbsence: number; lostLate: number; sessionsWithoutTimes: number };

export type HomeSummary = {
  locationId: string;
  locationName: string;
  regulator: 'CQC' | 'Ofsted' | null;
  staffCount: number;
  counts: StateCounts;
  required: number;
  compliancePct: number | null;
  ldaPct: number | null;
  ldaApplies: boolean;
  hours: HoursSummary;
  previous: { period: string; compliancePct: number | null } | null;
};

export type CourseRow = { name: string; category: string; counts: StateCounts; required: number; compliancePct: number | null; isLda: boolean };

export type PersonAction = { course: string; state: 'expired' | 'missing' | 'expiring' | 'allocated'; expiry?: string; noExpiryDate?: boolean; bookedOn?: string };

export type PersonRow = { name: string; counts: StateCounts; required: number; compliancePct: number | null; actions: PersonAction[] };

export type SnapshotPoint = { period: string; compliancePct: number | null; ldaPct: number | null };

export type HomeDetail = HomeSummary & {
  courses: CourseRow[];
  people: PersonRow[];
  trend: SnapshotPoint[];
  period: { from: string; to: string };
};

const ACTION_STATES = new Set(['expired', 'missing', 'expiring', 'allocated']);

function ldaSummary(home: HomeEvaluation): { pct: number | null; applies: boolean } {
  const keys = new Set(home.columns.filter(isLdaCourse).map((c) => c.key));
  if (keys.size === 0) return { pct: null, applies: false };
  const counts = countStates(home.cells.filter((cell) => keys.has(cell.courseKey)));
  return { pct: compliancePercent(counts), applies: true };
}

/**
 * Face-to-face hours for each home, from booked sessions between `from` and
 * `to` (never later than today). People are matched to a home by their
 * profile's location, as on the Intelligence Hub.
 */
export async function hoursByHome(service: ServiceClient, from: string, to: string): Promise<Map<string, HoursSummary>> {
  const today = ukToday();
  const end = to > today ? today : to;
  type EventRow = { id: string; start_time: string | null; end_time: string | null };
  type BookingRow = { profile_id: string; event_id: string; attended_at: string | null; minutes_late: number | null };

  const events = await fetchAll<EventRow>((f, t) =>
    service.from('training_events').select('id, start_time, end_time').gte('event_date', from).lte('event_date', end).range(f, t));
  const eventById = new Map(events.map((e) => [e.id, e]));

  const bookings: BookingRow[] = [];
  const eventIds = events.map((e) => e.id);
  for (let i = 0; i < eventIds.length; i += 200) {
    const chunk = eventIds.slice(i, i + 200);
    bookings.push(...await fetchAll<BookingRow>((f, t) =>
      service.from('bookings').select('profile_id, event_id, attended_at, minutes_late').in('event_id', chunk).range(f, t)));
  }

  const profileIds = Array.from(new Set(bookings.map((b) => b.profile_id).filter(Boolean)));
  const homeOf = new Map<string, string>();
  for (let i = 0; i < profileIds.length; i += 200) {
    const { data } = await service.from('profiles').select('id, location').in('id', profileIds.slice(i, i + 200));
    for (const p of data || []) if (p.location) homeOf.set(p.id, String(p.location).trim().toLowerCase());
  }

  const result = new Map<string, HoursSummary>();
  const noTimes = new Map<string, Set<string>>();
  for (const booking of bookings) {
    const home = homeOf.get(booking.profile_id);
    if (!home) continue;
    const h = bookingHours(eventById.get(booking.event_id), booking);
    const sum = result.get(home) || { delivered: 0, lostAbsence: 0, lostLate: 0, sessionsWithoutTimes: 0 };
    sum.delivered += h.delivered;
    sum.lostAbsence += h.lostAbsence;
    sum.lostLate += h.lostLate;
    if (!h.known) {
      const set = noTimes.get(home) || new Set<string>();
      set.add(booking.event_id);
      noTimes.set(home, set);
      sum.sessionsWithoutTimes = set.size;
    }
    result.set(home, sum);
  }
  return result;
}

async function previousSnapshots(service: ServiceClient, locationIds: string[], beforePeriod: string) {
  const latest = new Map<string, { period: string; compliancePct: number | null }>();
  if (locationIds.length === 0) return latest;
  const { data, error } = await service
    .from('compliance_snapshots')
    .select('location_id, period, compliance_pct')
    .in('location_id', locationIds)
    .lt('period', beforePeriod)
    .order('period', { ascending: false });
  if (error) return latest; // table not created yet: no comparison
  for (const row of data || []) {
    if (!latest.has(row.location_id)) {
      latest.set(row.location_id, { period: row.period, compliancePct: row.compliance_pct === null ? null : Number(row.compliance_pct) });
    }
  }
  return latest;
}

function summarise(home: HomeEvaluation, hours: HoursSummary | undefined, previous: HomeSummary['previous']): HomeSummary {
  const counts = countStates(home.cells);
  const lda = ldaSummary(home);
  return {
    locationId: home.locationId,
    locationName: home.locationName,
    regulator: home.regulator,
    staffCount: home.people.length,
    counts,
    required: requiredCount(counts),
    compliancePct: compliancePercent(counts),
    ldaPct: lda.pct,
    ldaApplies: lda.applies,
    hours: hours || { delivered: 0, lostAbsence: 0, lostLate: 0, sessionsWithoutTimes: 0 },
    previous,
  };
}

/** Default hours period: the last 12 months up to today. */
export function defaultPeriod(): { from: string; to: string } {
  const to = ukToday();
  return { from: addDays(to, -365), to };
}

export async function buildOverview(service: ServiceClient, locationIds: string[] | null, period = defaultPeriod()): Promise<HomeSummary[]> {
  const homes = await evaluateHomes(service, { onlyLocationIds: locationIds ?? undefined });
  const [hours, previous] = await Promise.all([
    hoursByHome(service, period.from, period.to),
    previousSnapshots(service, homes.map((h) => h.locationId), ukToday().slice(0, 7)),
  ]);
  return homes
    .map((home) => summarise(home, hours.get(home.locationName.trim().toLowerCase()), previous.get(home.locationId) || null))
    .sort((a, b) => (a.compliancePct ?? 101) - (b.compliancePct ?? 101) || a.locationName.localeCompare(b.locationName));
}

export async function buildHomeDetail(service: ServiceClient, locationId: string, period = defaultPeriod()): Promise<HomeDetail | null> {
  const [home] = await evaluateHomes(service, { onlyLocationIds: [locationId] });
  if (!home) return null;

  const [hours, previous, trendResult] = await Promise.all([
    hoursByHome(service, period.from, period.to),
    previousSnapshots(service, [locationId], ukToday().slice(0, 7)),
    service.from('compliance_snapshots').select('period, compliance_pct, lda_pct').eq('location_id', locationId).order('period', { ascending: false }).limit(13),
  ]);

  const byCourse = new Map<string, Cell[]>();
  const byPerson = new Map<string, Cell[]>();
  for (const cell of home.cells) {
    byCourse.set(cell.courseKey, [...(byCourse.get(cell.courseKey) || []), cell]);
    byPerson.set(cell.staffId, [...(byPerson.get(cell.staffId) || []), cell]);
  }

  const courses: CourseRow[] = home.columns.map((column) => {
    const counts = countStates(byCourse.get(column.key) || []);
    return { name: column.name, category: column.category, counts, required: requiredCount(counts), compliancePct: compliancePercent(counts), isLda: isLdaCourse(column) };
  });

  const courseName = new Map(home.columns.map((c) => [c.key, c.name]));
  const stateOrder = { expired: 0, missing: 1, expiring: 2, allocated: 3 } as const;
  const people: PersonRow[] = home.people
    .map(({ staffId, name }) => {
      const cells = byPerson.get(staffId) || [];
      const counts = countStates(cells);
      const actions: PersonAction[] = cells
        .filter((c) => ACTION_STATES.has(c.state))
        .map((c) => ({
          course: courseName.get(c.courseKey) || c.courseKey,
          state: c.state as PersonAction['state'],
          ...(c.expiry ? { expiry: c.expiry } : {}),
          ...(c.noExpiryDate ? { noExpiryDate: true } : {}),
          ...(c.bookedOn ? { bookedOn: c.bookedOn } : {}),
        }))
        .sort((a, b) => stateOrder[a.state] - stateOrder[b.state] || a.course.localeCompare(b.course));
      return { name, counts, required: requiredCount(counts), compliancePct: compliancePercent(counts), actions };
    })
    .sort((a, b) => (a.compliancePct ?? 101) - (b.compliancePct ?? 101) || a.name.localeCompare(b.name));

  const trend: SnapshotPoint[] = (trendResult.error ? [] : trendResult.data || [])
    .map((row) => ({
      period: row.period,
      compliancePct: row.compliance_pct === null ? null : Number(row.compliance_pct),
      ldaPct: row.lda_pct === null ? null : Number(row.lda_pct),
    }))
    .reverse();

  return {
    ...summarise(home, hours.get(home.locationName.trim().toLowerCase()), previous.get(locationId) || null),
    courses,
    people,
    trend,
    period,
  };
}

/** Saves this month's figures for every home (replacing this month's row if it exists). */
export async function saveSnapshots(service: ServiceClient): Promise<{ period: string; saved: number }> {
  const period = ukToday().slice(0, 7);
  const homes = await evaluateHomes(service);
  const rows = homes.map((home) => {
    const counts = countStates(home.cells);
    return {
      location_id: home.locationId,
      period,
      taken_at: new Date().toISOString(),
      compliance_pct: compliancePercent(counts),
      required: requiredCount(counts),
      in_date: counts.in_date + counts.expiring,
      expiring: counts.expiring,
      expired: counts.expired,
      missing: counts.missing,
      allocated: counts.allocated,
      staff_count: home.people.length,
      lda_pct: ldaSummary(home).pct,
    };
  });
  if (rows.length === 0) return { period, saved: 0 };
  const { error } = await service.from('compliance_snapshots').upsert(rows, { onConflict: 'location_id,period' });
  if (error) {
    if (error.code === '42P01' || /compliance_snapshots/.test(error.message || '')) {
      throw new Error('Snapshots are not switched on yet. Run the migration 20261117180000_add_compliance_snapshots.sql in the Supabase SQL Editor.');
    }
    throw new Error(error.message);
  }
  return { period, saved: rows.length };
}
