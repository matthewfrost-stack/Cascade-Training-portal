import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

function createTokenClient(accessToken: string): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    }
  );
}

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
  const accessToken = authHeader?.replace(/^Bearer\s+/i, '').trim();

  if (accessToken) {
    try {
      await createTokenClient(accessToken).auth.signOut();
    } catch (error) {
      console.error('Error revoking Supabase token during sign out:', error);
    }
  }

  const response = NextResponse.json({ success: true });
  const cookieStore = await cookies();

  cookieStore.getAll().forEach(({ name }) => {
    if (name.startsWith('sb-') || name.includes('auth-token')) {
      response.cookies.set(name, '', { path: '/', maxAge: 0 });
    }
  });

  return response;
}
