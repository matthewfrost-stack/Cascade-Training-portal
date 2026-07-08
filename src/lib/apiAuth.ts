import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';

export type RoleTier = 'staff' | 'manager' | 'scheduler' | 'admin';

export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );
}

export async function requireRole(allowedRoles: RoleTier[]) {
  const reqHeaders = await headers();
  const authHeader = reqHeaders.get('authorization') || reqHeaders.get('Authorization');
  const bearerToken = authHeader?.replace(/^Bearer\s+/i, '').trim();

  let user: { id: string } | null = null;
  let userError: unknown = null;

  const cookieStore = await cookies();
  if (bearerToken) {
    const tokenClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      {
        global: {
          headers: {
            Authorization: `Bearer ${bearerToken}`,
          },
        },
      }
    );
    const { data, error } = await tokenClient.auth.getUser();
    user = data.user;
    userError = error;
  }

  if (!user) {
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll() {
            // No-op in route handlers.
          },
        },
      }
    );
    const { data, error } = await authClient.auth.getUser();
    user = data.user;
    userError = user ? null : error;
  }

  if (userError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) } as const;
  }

  const service = createServiceClient();
  const { data: profile, error: profileError } = await service
    .from('profiles')
    .select('id, role_tier')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    return { error: NextResponse.json({ error: 'Profile not found' }, { status: 404 }) } as const;
  }

  if (!allowedRoles.includes(profile.role_tier as RoleTier)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) } as const;
  }

  return { userId: profile.id as string, role: profile.role_tier as RoleTier, service } as const;
}

type LocationRow = { id: string; name: string };

export async function getScopedLocationIds(
  userId: string,
  role: RoleTier,
  service: ReturnType<typeof createServiceClient>
): Promise<{ all: true } | { all: false; ids: string[] }> {
  if (role === 'admin') {
    return { all: true };
  }

  if (role === 'manager' || role === 'scheduler') {
    const locationMap = new Map<string, LocationRow>();

    const { data: linkedLocations } = await service
      .from('staff_locations')
      .select('location_id, locations(id, name)')
      .eq('staff_id', userId);

    (linkedLocations || []).forEach((sl) => {
      const loc = (sl as unknown as { locations?: LocationRow | null })?.locations;
      if (loc?.id && loc?.name) {
        locationMap.set(loc.id, loc);
      }
    });

    const { data: rawProfile } = await service
      .from('profiles')
      .select('managed_houses, location')
      .eq('id', userId)
      .single();

    const userProfile = rawProfile as { managed_houses?: unknown[]; location?: string } | null;
    const managedNames = new Set<string>();
    if (Array.isArray(userProfile?.managed_houses)) {
      userProfile.managed_houses.forEach((name: unknown) => {
        if (typeof name === 'string' && name.trim()) {
          managedNames.add(name.trim());
        }
      });
    }
    if (typeof userProfile?.location === 'string' && userProfile.location.trim()) {
      managedNames.add(userProfile.location.trim());
    }

    if (managedNames.size > 0) {
      const { data: managedLocations } = await service
        .from('locations')
        .select('id, name')
        .in('name', Array.from(managedNames));

      (managedLocations || []).forEach((loc) => {
        const row = loc as LocationRow;
        if (row.id && row.name) {
          locationMap.set(row.id, row);
        }
      });
    }

    return { all: false, ids: Array.from(locationMap.keys()) };
  }

  const { data: staffLocations } = await service
    .from('staff_locations')
    .select('locations(id)')
    .eq('staff_id', userId);

  const ids = (staffLocations || [])
    .map((sl) => (sl as { locations?: { id?: string } | null }).locations?.id)
    .filter((id): id is string => typeof id === 'string' && Boolean(id));

  return { all: false, ids };
}
