import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Browser client that shares the SAME cookie session the server/middleware set
// on login. Previously this used createClient (localStorage), which never
// received the server-action login session — so the browser client was
// effectively anonymous and every RLS-protected write (checklists, roster,
// dividers, etc.) failed with "row violates row-level security policy".
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
