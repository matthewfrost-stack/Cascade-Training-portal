import type { createServiceClient } from '@/lib/apiAuth';
import { fetchAll, isDeletedProfile, ukToday } from '@/lib/compliance';
import { diplomaBand, dueDate, type DiplomaBand, type DiplomaStatus } from '@/lib/diploma';

type ServiceClient = ReturnType<typeof createServiceClient>;
type One<T> = T | T[] | null;

export const L3 = 'L3_RESIDENTIAL_CHILDCARE';

export type DiplomaPerson = {
  profileId: string;
  name: string;
  status: DiplomaStatus;
  /** From the person's staff record (shared with the Care Certificate). */
  startDate: string | null;
  qualificationsOnEntry: string | null;
  dueDate: string | null;
  enrolledOn: string | null;
  provider: string | null;
  completedOn: string | null;
  equivalent: string | null;
  achievedOn: string | null;
  certificateName: string | null;
  notes: string | null;
  band: DiplomaBand;
  updatedAt: string | null;
};

export type DiplomaHome = { locationId: string; locationName: string; people: DiplomaPerson[] };

type QualRow = {
  profile_id: string; status: DiplomaStatus; start_date: string | null; enrolled_on: string | null; provider: string | null;
  completed_on: string | null; equivalent: string | null; notes: string | null; updated_at: string | null;
  achieved_on: string | null; certificate_name: string | null;
};

export class DiplomaNotReady extends Error {
  constructor() {
    super('The Level 3 Diploma tracker needs the database update first. Run the latest migrations (20261118170000, 20261118190000 and 20261118210000) in the Supabase SQL Editor.');
  }
}

/** Children's homes (diploma_required) the caller can see; `null` = all. */
export async function diplomaHomes(service: ServiceClient, onlyLocationIds: string[] | null): Promise<{ id: string; name: string }[]> {
  const { data, error } = await service.from('locations').select('id, name, diploma_required').eq('diploma_required', true).order('name');
  if (error) {
    if (error.code === '42703' || /diploma_required/.test(error.message || '')) throw new DiplomaNotReady();
    throw new Error(error.message);
  }
  const wanted = onlyLocationIds ? new Set(onlyLocationIds) : null;
  const unique = Array.from(new Map((data || []).map((row) => [row.id, row])).values());
  return unique.filter((row) => !wanted || wanted.has(row.id)).map((row) => ({ id: row.id, name: row.name }));
}

/** Everyone at each children's home (same people as the compliance report) with their Level 3 record. */
export async function buildDiplomaHomes(service: ServiceClient, onlyLocationIds: string[] | null): Promise<DiplomaHome[]> {
  const homes = await diplomaHomes(service, onlyLocationIds);
  if (homes.length === 0) return [];
  const today = ukToday();

  type LinkRow = {
    staff_id: string; location_id: string;
    profiles: One<{ full_name?: string | null; is_deleted?: boolean | null; start_date?: string | null; qualifications_on_entry?: string | null }>;
  };
  let links: LinkRow[];
  try {
    links = await fetchAll<LinkRow>((from, to) =>
      service.from('staff_locations')
        .select('staff_id, location_id, profiles(full_name, is_deleted, start_date, qualifications_on_entry)')
        .in('location_id', homes.map((h) => h.id))
        .range(from, to));
  } catch (error) {
    if (/start_date|qualifications_on_entry/.test(error instanceof Error ? error.message : '')) throw new DiplomaNotReady();
    throw error;
  }

  const staffIds = Array.from(new Set(links.map((l) => l.staff_id)));
  const records = new Map<string, QualRow>();
  for (let i = 0; i < staffIds.length; i += 200) {
    const { data, error } = await service
      .from('staff_qualifications')
      .select('profile_id, status, start_date, enrolled_on, provider, completed_on, equivalent, notes, updated_at, achieved_on, certificate_name')
      .eq('qualification', L3)
      .in('profile_id', staffIds.slice(i, i + 200));
    if (error) {
      if (error.code === '42P01' || error.code === '42703' || /staff_qualifications|achieved_on|certificate_name/.test(error.message || '')) throw new DiplomaNotReady();
      throw new Error(error.message);
    }
    for (const row of (data || []) as QualRow[]) records.set(row.profile_id, row);
  }

  return homes.map((home) => {
    const seen = new Map<string, { name: string; startDate: string | null; onEntry: string | null }>();
    for (const link of links) {
      if (link.location_id !== home.id) continue;
      const profile = Array.isArray(link.profiles) ? link.profiles[0] : link.profiles ?? undefined;
      if (isDeletedProfile(profile)) continue;
      seen.set(link.staff_id, {
        name: (profile?.full_name || 'Unknown').trim(),
        startDate: profile?.start_date?.slice(0, 10) || null,
        onEntry: profile?.qualifications_on_entry?.trim() || null,
      });
    }
    const people: DiplomaPerson[] = Array.from(seen, ([profileId, person]) => {
      const r = records.get(profileId);
      const status: DiplomaStatus = r?.status || 'not_started';
      const startDate = person.startDate || r?.start_date?.slice(0, 10) || null;
      return {
        profileId,
        name: person.name,
        status,
        startDate,
        qualificationsOnEntry: person.onEntry,
        dueDate: dueDate(startDate),
        enrolledOn: r?.enrolled_on?.slice(0, 10) || null,
        provider: r?.provider || null,
        completedOn: r?.completed_on?.slice(0, 10) || null,
        equivalent: r?.equivalent || null,
        achievedOn: r?.achieved_on?.slice(0, 10) || null,
        certificateName: r?.certificate_name || null,
        notes: r?.notes || null,
        band: diplomaBand({ status, startDate }, today),
        updatedAt: r?.updated_at || null,
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
    return { locationId: home.id, locationName: home.name, people };
  });
}
