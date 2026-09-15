import { createClient } from '@supabase/supabase-js';
import { requireRole } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

async function deleteProfile(profileId?: string, email?: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  if (!profileId && !email) {
    throw new Error('Must provide either profileId or email');
  }

  console.log('Force deleting profile - ID:', profileId, 'Email:', email);

  // Delete bookings first
  if (profileId) {
    const { error: bookingsError } = await supabaseAdmin
      .from('bookings')
      .delete()
      .eq('profile_id', profileId);
    
    console.log('Bookings deleted for profile:', profileId, 'Error:', bookingsError?.message);
  }

  // Delete profile
  let deleteError;
  if (profileId) {
    const { error } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', profileId);
    deleteError = error;
  } else if (email) {
    const { error } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('email', email);
    deleteError = error;
  }

  if (deleteError) {
    console.error('Profile deletion error:', deleteError);
    throw new Error(`Failed to delete profile: ${deleteError.message}`);
  }

  console.log('Profile force deleted successfully');
  return { success: true, message: 'Profile deleted' };
}

export async function GET(_request: Request) {
  return Response.json(
    { error: 'Method Not Allowed. Use POST for destructive actions.' },
    { status: 405 }
  );
}

export async function POST(request: Request) {
  try {
    const authz = await requireRole(['admin']);
    if ('error' in authz) return authz.error;

    const body = await request.json();
    const { profileId, email } = body;

    const result = await deleteProfile(profileId, email);
    return Response.json(result);
  } catch (error) {
    console.error('API error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
