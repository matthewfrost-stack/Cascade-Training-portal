'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function login(formData: FormData) {
    const cookieStore = await cookies()

    // Vercel automatically sets NEXT_PUBLIC_VERCEL_ENV to 'production', 'preview', or 'development'
    // Use 'dev' schema for preview/development, 'public' schema for production
    const isDev = process.env.NEXT_PUBLIC_VERCEL_ENV !== 'production';
    const schema = isDev ? 'dev' : 'public';

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        )
                    } catch {
                        // The `setAll` method was called from a Server Component.
                        // This can be ignored if you have middleware refreshing
                        // user sessions.
                    }
                },
            },
            db: { 
                schema 
            }
        }
    )

    const email = formData.get('email') as string
    const password = formData.get('password') as string

    const { data: authData, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    })

    if (error) {
        return { error: error.message }
    }

    // Block soft-deleted users immediately at login and show a clear message.
    const userId = authData.user?.id
    if (userId) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('is_deleted')
            .eq('id', userId)
            .single()

        if (profile?.is_deleted) {
            await supabase.auth.signOut()
            return { error: 'Your account has been deactivated. Please contact an administrator.' }
        }
    }

    return { success: true }
}
