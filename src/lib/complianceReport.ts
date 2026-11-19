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
import { BAND_LABELS, BAND_ORDER } from '@/lib/diploma';
import { buildDiplomaHomes, DiplomaNotReady } from '@/lib/diplomaTracker';
import { CC_BAND_LABELS, CC_BAND_ORDER } from '@/lib/careCertificate';
import { buildCareCertHomes, CareCertNotReady } from '@/lib/careCertificateTracker';

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
  /** The most recent check snapshot, to show the change since then. */
  previous: { takenAt: string; compliancePct: number | null } | null;
  /** Level 3 Diploma (children's homes only; null elsewhere or before the tracker migrations). */
  diploma: QualSummary | null;
  /** Care Certificate (every home; null before the tracker migrations). */
  careCert: QualSummary | null;
};

/** How serious a qualification status is, for colouring. */
export type QualTone = 'bad' | 'warn' | 'ok' | 'done' | 'muted';

/**
 * One qualification at one home: how many people are in each status (no
 * percentage), and who needs action. Same rules as the tracker tabs.
 */
export type QualSummary = {
  bands: { key: string; label: string; count: number; tone: QualTone }[];
  /** People needing action (overdue, start date needed, due soon, not enrolled). */
  needsAction: number;
  overdue: number;
  noStartDate: number;
  /** Filled on the one-home view only. */
  actions: { name: string; band: string; label: string; tone: QualTone; due: string | null; extendedTo?: string | null }[];
};

export type CourseRow = { name: string; category: string; counts: StateCounts; required: number; compliancePct: number | null; isLda: boolean };

export type PersonAction = { course: string; state: 'expired' | 'missing' | 'expiring' | 'allocated'; expiry?: string; noExpiryDate?: boolean; bookedOn?: string };

export type PersonRow = { name: string; counts: StateCounts; required: number; compliancePct: number | null; actions: PersonAction[] };

/** Figures saved when the compliance team checked a home. */
export type CheckSnapshot = {
  id: string;
  takenAt: string;
  takenBy: string | null;
  note: string | null;
  compliancePct: number | null;
  ldaPct: number | null;
  required: number;
  expired: number;
  missing: number;
  expiring: number;
  allocated: number;
  staffCount: number;
};

export type HomeDetail = HomeSummary & {
  courses: CourseRow[];
  people: PersonRow[];
  /** Check snapshots, oldest first (up to the last 24). */
  checks: CheckSnapshot[];
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

const pctOrNull = (value: unknown) => (value === null || value === undefined ? null : Number(value));

/** The latest check snapshot for each home. */
async function latestChecks(service: ServiceClient, locationIds: string[]) {
  const latest = new Map<string, { takenAt: string; compliancePct: number | null }>();
  if (locationIds.length === 0) return latest;
  const { data, error } = await service
    .from('compliance_snapshots')
    .select('location_id, taken_at, compliance_pct')
    .in('location_id', locationIds)
    .order('taken_at', { ascending: false });
  if (error) return latest; // table not created yet: no comparison
  for (const row of data || []) {
    if (!latest.has(row.location_id)) latest.set(row.location_id, { takenAt: row.taken_at, compliancePct: pctOrNull(row.compliance_pct) });
  }
  return latest;
}

type SnapshotRow = {
  id: string; taken_at: string; taken_by_name?: string | null; note?: string | null;
  compliance_pct: unknown; lda_pct: unknown; required: number; expired: number; missing: number; expiring: number; allocated: number; staff_count: number;
};

function toCheck(row: SnapshotRow): CheckSnapshot {
  return {
    id: row.id,
    takenAt: row.taken_at,
    takenBy: row.taken_by_name ?? null,
    note: row.note ?? null,
    compliancePct: pctOrNull(row.compliance_pct),
    ldaPct: pctOrNull(row.lda_pct),
    required: row.required,
    expired: row.expired,
    missing: row.missing,
    expiring: row.expiring,
    allocated: row.allocated,
    staffCount: row.staff_count,
  };
}

/** Check snapshots for one home, oldest first. Works before the per-check migration (no name/note yet). */
async function checksForHome(service: ServiceClient, locationId: string): Promise<CheckSnapshot[]> {
  const base = 'id, taken_at, compliance_pct, lda_pct, required, expired, missing, expiring, allocated, staff_count';
  const query = (columns: string) =>
    service.from('compliance_snapshots').select(columns).eq('location_id', locationId).order('taken_at', { ascending: false }).limit(24);
  let result = await query(`${base}, taken_by_name, note`);
  if (result.error) result = await query(base);
  if (result.error) return [];
  return ((result.data || []) as unknown as SnapshotRow[]).map(toCheck).reverse();
}

function summarise(
  home: HomeEvaluation,
  hours: HoursSummary | undefined,
  previous: HomeSummary['previous'],
  quals: Qualifications = { diploma: new Map(), careCert: new Map() },
): HomeSummary {
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
    diploma: quals.diploma.get(home.locationId) || null,
    careCert: quals.careCert.get(home.locationId) || null,
  };
}

// ---------- Level 3 Diploma & Care Certificate ----------

type Qualifications = { diploma: Map<string, QualSummary>; careCert: Map<string, QualSummary> };

const TONE: Record<string, QualTone> = {
  overdue: 'bad', no_start_date: 'warn', due_soon: 'warn', not_enrolled: 'warn', on_track: 'ok', done: 'done', not_required: 'muted',
};
const ACTION_BANDS = new Set(['overdue', 'no_start_date', 'due_soon', 'not_enrolled']);

function summariseQualification(
  people: { name: string; band: string; dueDate: string | null; extendedTo?: string | null }[],
  order: readonly string[],
  labels: Record<string, string>,
  withActions: boolean,
): QualSummary {
  const counts = new Map(order.map((b) => [b, 0]));
  for (const p of people) counts.set(p.band, (counts.get(p.band) || 0) + 1);
  const rank = new Map(order.map((b, i) => [b, i]));
  const needing = people.filter((p) => ACTION_BANDS.has(p.band));
  return {
    bands: order.map((key) => ({ key, label: labels[key] || key, count: counts.get(key) || 0, tone: TONE[key] || 'muted' })),
    needsAction: needing.length,
    overdue: counts.get('overdue') || 0,
    noStartDate: counts.get('no_start_date') || 0,
    actions: withActions
      ? needing
        .map((p) => ({ name: p.name, band: p.band, label: labels[p.band] || p.band, tone: TONE[p.band] || 'muted', due: p.dueDate, ...(p.extendedTo ? { extendedTo: p.extendedTo } : {}) }))
        .sort((a, b) => (rank.get(a.band) ?? 99) - (rank.get(b.band) ?? 99) || (a.due || '9999').localeCompare(b.due || '9999') || a.name.localeCompare(b.name))
      : [],
  };
}

/**
 * Level 3 Diploma and Care Certificate summaries per home, from the tracker
 * code. If a tracker's tables aren't there yet, that part is simply left out
 * so the training report still works.
 */
async function qualificationsByHome(service: ServiceClient, locationIds: string[] | null, withActions: boolean): Promise<Qualifications> {
  const [diplomaHomes, careCertHomes] = await Promise.all([
    buildDiplomaHomes(service, locationIds).catch((error) => {
      if (error instanceof DiplomaNotReady) return [];
      throw error;
    }),
    buildCareCertHomes(service, locationIds).catch((error) => {
      if (error instanceof CareCertNotReady) return [];
      throw error;
    }),
  ]);
  return {
    diploma: new Map(diplomaHomes.map((h) => [h.locationId, summariseQualification(h.people, BAND_ORDER, BAND_LABELS, withActions)])),
    careCert: new Map(careCertHomes.map((h) => [h.locationId, summariseQualification(h.people, CC_BAND_ORDER, CC_BAND_LABELS, withActions)])),
  };
}

/** Default hours period: the last 12 months up to today. */
export function defaultPeriod(): { from: string; to: string } {
  const to = ukToday();
  return { from: addDays(to, -365), to };
}

export async function buildOverview(service: ServiceClient, locationIds: string[] | null, period = defaultPeriod()): Promise<HomeSummary[]> {
  const homes = await evaluateHomes(service, { onlyLocationIds: locationIds ?? undefined });
  const [hours, previous, quals] = await Promise.all([
    hoursByHome(service, period.from, period.to),
    latestChecks(service, homes.map((h) => h.locationId)),
    qualificationsByHome(service, homes.map((h) => h.locationId), false),
  ]);
  return homes
    .map((home) => summarise(home, hours.get(home.locationName.trim().toLowerCase()), previous.get(home.locationId) || null, quals))
    .sort((a, b) => (a.compliancePct ?? 101) - (b.compliancePct ?? 101) || a.locationName.localeCompare(b.locationName));
}

export async function buildHomeDetail(service: ServiceClient, locationId: string, period = defaultPeriod()): Promise<HomeDetail | null> {
  const [home] = await evaluateHomes(service, { onlyLocationIds: [locationId] });
  if (!home) return null;

  const [hours, checks, quals] = await Promise.all([
    hoursByHome(service, period.from, period.to),
    checksForHome(service, locationId),
    qualificationsByHome(service, [locationId], true),
  ]);
  const last = checks[checks.length - 1];
  const previous = last ? { takenAt: last.takenAt, compliancePct: last.compliancePct } : null;

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

  return {
    ...summarise(home, hours.get(home.locationName.trim().toLowerCase()), previous, quals),
    courses,
    people,
    checks,
    period,
  };
}

/** Saves one home's figures now, as a check snapshot (earlier snapshots are kept). */
export async function saveCheckSnapshot(
  service: ServiceClient,
  locationId: string,
  by: { userId: string; name: string; note: string | null },
): Promise<CheckSnapshot> {
  const [home] = await evaluateHomes(service, { onlyLocationIds: [locationId] });
  if (!home) throw new Error('Home not found.');
  const counts = countStates(home.cells);
  const row = {
    location_id: home.locationId,
    period: ukToday().slice(0, 7),
    taken_at: new Date().toISOString(),
    taken_by: by.userId,
    taken_by_name: by.name,
    note: by.note,
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
  const { data, error } = await service.from('compliance_snapshots').insert(row).select('id, taken_at, taken_by_name, note, compliance_pct, lda_pct, required, expired, missing, expiring, allocated, staff_count').single();
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST204' || error.code === '23505' || /compliance_snapshots|taken_by|note/.test(error.message || '')) {
      throw new Error('Check snapshots are not switched on yet. Run the migrations 20261117180000_add_compliance_snapshots.sql and 20261118090000_compliance_snapshots_per_check.sql in the Supabase SQL Editor.');
    }
    throw new Error(error.message);
  }
  return toCheck(data as SnapshotRow);
}
