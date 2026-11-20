import { getScopedLocationIds, type createServiceClient, type RoleTier } from '@/lib/apiAuth';

type ServiceClient = ReturnType<typeof createServiceClient>;

export const QUALIFICATIONS = ['L3_RESIDENTIAL_CHILDCARE', 'CARE_CERTIFICATE', 'L5_LEADERSHIP'] as const;
export type TrackedQualification = (typeof QUALIFICATIONS)[number];
export const isTrackedQualification = (value: unknown): value is TrackedQualification =>
  typeof value === 'string' && (QUALIFICATIONS as readonly string[]).includes(value);

export const CERTIFICATE_BUCKET = 'qualification-certificates';

/**
 * Can this user see (and so manage) this person's record for this qualification?
 * Admins: anyone. Managers / schedulers: people linked to a home they're assigned
 * to or manage. Level 3 also needs the home to be a children's home.
 * (Level 5 and the Care Certificate: any home.)
 */
export async function canManagePerson(
  service: ServiceClient,
  user: { userId: string; role: RoleTier },
  profileId: string,
  qualification: TrackedQualification,
): Promise<boolean> {
  const { data: links } = await service.from('staff_locations').select('location_id').eq('staff_id', profileId);
  let homeIds = (links || []).map((l) => l.location_id as string);
  if (homeIds.length === 0) return false;

  if (qualification === 'L3_RESIDENTIAL_CHILDCARE') {
    const { data } = await service.from('locations').select('id').in('id', homeIds).eq('diploma_required', true);
    homeIds = (data || []).map((l) => l.id as string);
    if (homeIds.length === 0) return false;
  }

  const scope = await getScopedLocationIds(user.userId, user.role, service);
  return scope.all || homeIds.some((id) => scope.ids.includes(id));
}
