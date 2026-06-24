import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const pathname = request.nextUrl.pathname

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options: _options }) => request.cookies.set(name, value))
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  let user: { id: string } | null = null
  try {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser()
    user = authUser
  } catch (error) {
    // Malformed/partial auth cookies can throw during JSON parsing.
    // Clear likely Supabase auth cookies so requests can proceed to login cleanly.
    console.error('Supabase auth cookie parse error in middleware:', error)
    request.cookies.getAll().forEach(({ name }) => {
      if (name.startsWith('sb-') || name.includes('auth-token')) {
        response.cookies.set(name, '', { path: '/', maxAge: 0 })
      }
    })
  }

  const isLoginPage = pathname === '/login'
  const isChangePasswordPage = pathname === '/auth/change-password-required'

  // 1. If NOT logged in and NOT on login page and NOT on auth callback -> FORCE to /login
  if (!user && !isLoginPage && !pathname.startsWith('/auth')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // 2. If ALREADY logged in and trying to go to /login -> FORCE to /dashboard
  if (user && isLoginPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  // 3. If logged in, validate profile state (deleted / password reset)
  if (user) {
    try {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('password_needs_change, is_deleted, role_tier')
        .eq('id', user.id)
        .single()

      if (profileError) {
        console.error('Error fetching profile:', profileError)
      }

      // Block deleted users from accessing the app even if auth session exists.
      if (profile?.is_deleted === true) {
        await supabase.auth.signOut()
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        url.searchParams.set('error', 'account_deleted')
        return NextResponse.redirect(url)
      }

      if (!isChangePasswordPage && profile?.password_needs_change === true) {
        const url = request.nextUrl.clone()
        url.pathname = '/auth/change-password-required'
        return NextResponse.redirect(url)
      }
    } catch (error) {
      console.error('Error checking password status:', error)
    }
  }

  return response
}

// Ensure this matches everything EXCEPT static files and internal Next.js paths
export const config = {
  matcher: ['/((?!_next|favicon.ico|api).*)'],
}
