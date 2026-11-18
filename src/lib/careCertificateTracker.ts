import type { createServiceClient } from '@/lib/apiAuth';
import { fetchAll, isDeletedProfile, loadLocations, ukToday } from '@/lib/compliance';
import { careCertBand, careCertDue, standardDue, type CareCertBand, type CareCertStatus } from '@/lib/careCertificate';

type ServiceClient = ReturnType<typeof createServiceClient>;
type One<T> = T | T[] | null;

export const CC = 'CARE_CERTIFICATE';

export type CareCertPerson = {
  profileId: string;
  name: string;
  startDate: string | null;
  qualificationsOnEntry: string | null;
  standardDue: string | null;
  dueDate: string | null;
  status: CareCertStatus;
  /** Latest Care Certificate completion on the Training Matrix (any home). */
  matrixCompletedOn: string | null;
  /** On the matrix as allocated / booked, not yet completed. */
  matrixAllocated: boolean;
  completedOn: string | null;
  equivalent: string | null;
  achievedOn: string | null;
  certificateName: string | null;
  extendedTo: string | null;
  extensionReason: string | null;
  notes: string | null;
  band: CareCertBand;
};

export type CareCertHome = { locationId: string; locationName: string; people: CareCertPerson[] };

export class CareCertNotReady extends Error {
  constructor() {
    super('The Care Certificate tracker needs the database update first. Run the latest migrations (20261118190000 and 20261118210000) in the Supabase SQL Editor.');
  }
}

/** Every course called "Care Certificate…" (not the assessor tutorial). */
export async function careCertCourses(service: ServiceClient): Promise<{ id: string; name: string }[]> {
  const { data, error } = await service.from('training_courses').select('id, name').ilike('name', 'care certificate%');
  if (error) throw new Error(error.message);
  return (data || []).filter((c) => !/assessor/i.test(c.name || '')).map((c) => ({ id: String(c.id), name: c.name }));
}

type QualRow = {
  profile_id: string; status: string; completed_on: string | null; equivalent: string | null; achieved_on: string | null;
  certificate_name: string | null; extended_to: string | null; extension_reason: string | null; notes: string | null;
};

export async function buildCareCertHomes(service: ServiceClient, onlyLocationIds: string[] | null): Promise<CareCertHome[]> {
  const wanted = onlyLocationIds ? new Set(onlyLocationIds) : null;
  const homes = (await loadLocations(service)).filter((l) => !wanted || wanted.has(l.id));
  if (homes.length === 0) return [];
  const today = ukToday();

  type LinkRow = { staff_id: string; location_id: string; profiles: One<{ full_name?: string | null; is_deleted?: boolean | null; start_date?: string | null; qualifications_on_entry?: string | null }> };
  let links: LinkRow[];
  try {
    links = await fetchAll<LinkRow>((from, to) =>
      service.from('staff_locations')
        .select('staff_id, location_id, profiles(full_name, is_deleted, start_date, qualifications_on_entry)')
        .in('location_id', homes.map((h) => h.id))
        .range(from, to));
  } catch (error) {
    if (/start_date|qualifications_on_entry/.test(error instanceof Error ? error.message : '')) throw new CareCertNotReady();
    throw error;
  }
  const staffIds = Array.from(new Set(links.map((l) => l.staff_id)));
  const courseIds = (await careCertCourses(service)).map((c) => c.id);

  // Matrix: latest completion per person, and whether it's allocated/booked.
  const completed = new Map<string, string>();
  const allocated = new Set<string>();
  const records = new Map<string, QualRow>();
  for (let i = 0; i < staffIds.length; i += 200) {
    const chunk = staffIds.slice(i, i + 200);
    if (courseIds.length) {
      const rows = await fetchAll<{ staff_id: string; completion_date: string | null; status: string | null }>((from, to) =>
        service.from('staff_training_matrix').select('staff_id, completion_date, status').in('staff_id', chunk).in('course_id', courseIds).range(from, to));
      for (const r of rows) {
        const date = r.completion_date?.slice(0, 10);
        if (date && (!completed.has(r.staff_id) || date > completed.get(r.staff_id)!)) completed.set(r.staff_id, date);
        if (['allocated', 'awaiting', 'booked'].includes((r.status || '').toLowerCase())) allocated.add(r.staff_id);
      }
    }
    const { data, error } = await service
      .from('staff_qualifications')
      .select('profile_id, status, completed_on, equivalent, achieved_on, certificate_name, extended_to, extension_reason, notes')
      .eq('qualification', CC)
      .in('profile_id', chunk);
    if (error) {
      if (error.code === '42P01' || error.code === '42703' || /staff_qualifications|achieved_on|extended_to|certificate_name/.test(error.message || '')) throw new CareCertNotReady();
      throw new Error(error.message);
    }
    for (const row of (data || []) as QualRow[]) records.set(row.profile_id, row);
  }

  return homes.map((home) => {
    const people = new Map<string, CareCertPerson>();
    for (const link of links) {
      if (link.location_id !== home.id || people.has(link.staff_id)) continue;
      const profile = Array.isArray(link.profiles) ? link.profiles[0] : link.profiles ?? undefined;
      if (isDeletedProfile(profile)) continue;
      const r = records.get(link.staff_id);
      const status = (['completed', 'equivalent', 'not_required'].includes(r?.status || '') ? r!.status : 'not_started') as CareCertStatus;
      const startDate = profile?.start_date?.slice(0, 10) || null;
      const extendedTo = r?.extended_to?.slice(0, 10) || null;
      const matrixCompletedOn = completed.get(link.staff_id) || null;
      people.set(link.staff_id, {
        profileId: link.staff_id,
        name: (profile?.full_name || 'Unknown').trim(),
        startDate,
        qualificationsOnEntry: profile?.qualifications_on_entry?.trim() || null,
        standardDue: standardDue(startDate),
        dueDate: careCertDue(startDate, extendedTo),
        status,
        matrixCompletedOn,
        matrixAllocated: allocated.has(link.staff_id),
        completedOn: r?.completed_on?.slice(0, 10) || null,
        equivalent: r?.equivalent || null,
        achievedOn: r?.achieved_on?.slice(0, 10) || null,
        certificateName: r?.certificate_name || null,
        extendedTo,
        extensionReason: r?.extension_reason || null,
        notes: r?.notes || null,
        band: careCertBand({ status, startDate, matrixCompletedOn, extendedTo }, today),
      });
    }
    return {
      locationId: home.id,
      locationName: home.name,
      people: Array.from(people.values()).sort((a, b) => a.name.localeCompare(b.name)),
    };
  });
}
