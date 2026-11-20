import type { createServiceClient } from '@/lib/apiAuth';
import { fetchAll, isDeletedProfile, loadLocations, ukToday } from '@/lib/compliance';
import { l5Band, l5Due, l5StandardDue, type L5Band, type L5Role, type L5Status } from '@/lib/level5';

type ServiceClient = ReturnType<typeof createServiceClient>;
type One<T> = T | T[] | null;

export const L5 = 'L5_LEADERSHIP';

export type L5Person = {
  profileId: string;
  name: string;
  /** Names of the homes they're linked to (only the ones the viewer can see). */
  homes: { id: string; name: string }[];
  role: L5Role | null;
  inRoleSince: string | null;
  status: L5Status;
  enrolledOn: string | null;
  provider: string | null;
  standardDue: string | null;
  dueDate: string | null;
  extendedTo: string | null;
  extensionReason: string | null;
  completedOn: string | null;
  equivalent: string | null;
  achievedOn: string | null;
  certificateName: string | null;
  notes: string | null;
  band: L5Band;
};

export type L5Candidate = { profileId: string; name: string; homes: string };

export class Level5NotReady extends Error {
  constructor() {
    super('The Level 5 Diploma tracker needs the database update first. Run the migration 20261120100000_level5_tracker.sql in the Supabase SQL Editor.');
  }
}

type QualRow = {
  profile_id: string; role: L5Role | null; start_date: string | null; status: L5Status; enrolled_on: string | null; provider: string | null;
  completed_on: string | null; equivalent: string | null; achieved_on: string | null; certificate_name: string | null;
  extended_to: string | null; extension_reason: string | null; notes: string | null;
};
type LinkRow = { staff_id: string; location_id: string; profiles: One<{ full_name?: string | null; is_deleted?: boolean | null }> };

const d = (v: string | null | undefined) => v?.slice(0, 10) || null;

/**
 * Everyone on the Level 5 list that the viewer can see (linked to one of their homes),
 * plus the staff they could add. `onlyLocationIds` null = all homes.
 */
export async function buildLevel5(
  service: ServiceClient,
  onlyLocationIds: string[] | null,
  { withCandidates = true } = {},
): Promise<{ people: L5Person[]; candidates: L5Candidate[]; homes: { id: string; name: string }[] }> {
  const wanted = onlyLocationIds ? new Set(onlyLocationIds) : null;
  const homes = (await loadLocations(service)).filter((l) => !wanted || wanted.has(l.id)).map((l) => ({ id: l.id, name: l.name }));
  if (homes.length === 0) return { people: [], candidates: [], homes: [] };
  const homeName = new Map(homes.map((h) => [h.id, h.name]));
  const today = ukToday();

  const { data: rows, error } = await service
    .from('staff_qualifications')
    .select('profile_id, role, start_date, status, enrolled_on, provider, completed_on, equivalent, achieved_on, certificate_name, extended_to, extension_reason, notes')
    .eq('qualification', L5);
  if (error) {
    if (error.code === '42703' || /role|extended_to|achieved_on|certificate_name/.test(error.message || '')) throw new Level5NotReady();
    throw new Error(error.message);
  }
  const records = new Map(((rows || []) as QualRow[]).map((r) => [r.profile_id, r]));

  // Everyone linked to the viewer's homes (for names, home lists and the "add person" picker).
  const links = await fetchAll<LinkRow>((from, to) =>
    service.from('staff_locations')
      .select('staff_id, location_id, profiles(full_name, is_deleted)')
      .in('location_id', homes.map((h) => h.id))
      .range(from, to));

  const byPerson = new Map<string, { name: string; homeIds: Set<string> }>();
  for (const link of links) {
    const profile = Array.isArray(link.profiles) ? link.profiles[0] : link.profiles ?? undefined;
    if (isDeletedProfile(profile)) continue;
    const entry = byPerson.get(link.staff_id) || { name: (profile?.full_name || 'Unknown').trim(), homeIds: new Set<string>() };
    entry.homeIds.add(link.location_id);
    byPerson.set(link.staff_id, entry);
  }
  const homeList = (ids: Set<string>) =>
    Array.from(ids).map((id) => ({ id, name: homeName.get(id) || 'Unknown' })).sort((a, b) => a.name.localeCompare(b.name));

  const people: L5Person[] = [];
  const candidates: L5Candidate[] = [];
  for (const [profileId, person] of byPerson) {
    const r = records.get(profileId);
    if (!r) {
      if (withCandidates) candidates.push({ profileId, name: person.name, homes: homeList(person.homeIds).map((h) => h.name).join(', ') });
      continue;
    }
    const inRoleSince = d(r.start_date);
    const enrolledOn = d(r.enrolled_on);
    const extendedTo = d(r.extended_to);
    people.push({
      profileId,
      name: person.name,
      homes: homeList(person.homeIds),
      role: r.role,
      inRoleSince,
      status: r.status,
      enrolledOn,
      provider: r.provider,
      standardDue: l5StandardDue(enrolledOn),
      dueDate: l5Due(enrolledOn, extendedTo),
      extendedTo,
      extensionReason: r.extension_reason,
      completedOn: d(r.completed_on),
      equivalent: r.equivalent,
      achievedOn: d(r.achieved_on),
      certificateName: r.certificate_name,
      notes: r.notes,
      band: l5Band({ status: r.status, inRoleSince, enrolledOn, extendedTo }, today),
    });
  }
  people.sort((a, b) => a.name.localeCompare(b.name));
  candidates.sort((a, b) => a.name.localeCompare(b.name));
  return { people, candidates, homes };
}
