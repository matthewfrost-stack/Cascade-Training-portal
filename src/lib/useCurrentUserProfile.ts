"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";

export type CurrentUserProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone_number: string | null;
  avatar_path: string | null;
  role_tier: string | null;
  password_needs_change?: boolean | null;
};

type UseCurrentUserProfileState = {
  profile: CurrentUserProfile | null;
  isAuthenticated: boolean;
  loading: boolean;
  refreshProfile: () => Promise<void>;
};

export function useCurrentUserProfile(): UseCurrentUserProfileState {
  const pathname = usePathname();
  const [profile, setProfile] = useState<CurrentUserProfile | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const hasBootstrappedRef = useRef(false);
  const lastRouteWasAuthRef = useRef(true);

  const loadProfile = useCallback(async () => {
    let session: {
      access_token?: string | null;
      refresh_token?: string | null;
      expires_at?: number | null;
      user?: {
        id: string;
        email?: string | null;
        user_metadata?: {
          full_name?: string | null;
        };
      } | null;
    } | null = null;
    let sessionUser: {
      id: string;
      email?: string | null;
      user_metadata?: {
        full_name?: string | null;
      };
    } | null = null;

    const setFallbackProfile = (user: typeof sessionUser | null) => {
      if (!user) {
        setProfile(null);
        setIsAuthenticated(false);
        return;
      }

      setIsAuthenticated(true);
      setProfile({
        id: user.id,
        full_name: user.user_metadata?.full_name || null,
        email: user.email || null,
        phone_number: null,
        avatar_path: null,
        role_tier: null,
        password_needs_change: null,
      });
    };

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      session = sessionData.session || null;
      sessionUser = session?.user || null;

      const isExpired = Boolean(session?.expires_at && session.expires_at <= Math.floor(Date.now() / 1000) + 30);
      if (isExpired && session?.refresh_token) {
        const { data: refreshedSessionData, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) {
          console.warn('Failed to refresh Supabase session:', refreshError);
        } else if (refreshedSessionData.session) {
          session = refreshedSessionData.session;
          sessionUser = refreshedSessionData.session.user || sessionUser;
        }
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      try {
        const response = await fetch('/api/profile', {
          method: 'GET',
          cache: 'no-store',
          credentials: 'include',
          signal: controller.signal,
          headers: session?.access_token
            ? {
                Authorization: `Bearer ${session.access_token}`,
              }
            : undefined,
        });

        clearTimeout(timeoutId);

        let result: { profile?: CurrentUserProfile | null } | null;
        try {
          result = await response.json();
        } catch {
          const body = await response
            .text()
            .catch(() => '<unable to read response body>');
          throw new Error(`Invalid JSON response from profile endpoint: ${body}`);
        }

        if (response.ok) {
          const profileData = (result?.profile || null) as CurrentUserProfile | null;
          if (profileData) {
            setProfile(profileData);
            setIsAuthenticated(true);
            return;
          }
        }

        if (response.status === 401 || response.status === 403) {
          if (session?.refresh_token) {
            const { data: refreshedSessionData, error: refreshError } = await supabase.auth.refreshSession();
            if (!refreshError && refreshedSessionData.session?.access_token) {
              const retryResponse = await fetch('/api/profile', {
                method: 'GET',
                cache: 'no-store',
                credentials: 'include',
                signal: controller.signal,
                headers: {
                  Authorization: `Bearer ${refreshedSessionData.session.access_token}`,
                },
              });

              if (retryResponse.ok) {
                const retryResult = await retryResponse.json().catch(() => null);
                const retryProfileData = (retryResult?.profile || null) as CurrentUserProfile | null;
                if (retryProfileData) {
                  setProfile(retryProfileData);
                  setIsAuthenticated(true);
                  return;
                }
              }
            }
          }

          console.warn('Profile API returned unauthorized; preserving session auth state.');
          setFallbackProfile(sessionUser);
          return;
        }

        setFallbackProfile(sessionUser);
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          throw new Error('Profile request timed out');
        }

        if (sessionUser) {
          console.warn('Profile API failed, using fallback session data', fetchError);
          setFallbackProfile(sessionUser);
          return;
        }

        throw fetchError;
      }
    } catch (error) {
      console.error('Error loading current user profile:', error);
      setFallbackProfile(sessionUser);
    }
  }, []);

  useEffect(() => {
    const currentPath = pathname ?? "";
    const isAuthRoute =
      currentPath === "/login" ||
      currentPath === "/auth/callback" ||
      currentPath.startsWith("/auth/");

    if (isAuthRoute) {
      lastRouteWasAuthRef.current = true;
      setProfile(null);
      setIsAuthenticated(false);
      setLoading(false);
      return;
    }

    const shouldBootstrapProfile =
      !hasBootstrappedRef.current || lastRouteWasAuthRef.current;
    hasBootstrappedRef.current = true;
    lastRouteWasAuthRef.current = false;

    let mounted = true;
    let isInitialLoad = true;

    const syncProfile = async () => {
      if (mounted) {
        setLoading(true);
      }

      await loadProfile();

      if (mounted) {
        setLoading(false);
      }
    };

    if (shouldBootstrapProfile) {
      syncProfile();
    } else {
      setLoading(false);
    }

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        // Only sync on auth state changes after the initial listener setup
        if (isInitialLoad) {
          isInitialLoad = false;
          return;
        }

        if (event === "SIGNED_OUT" || !session?.user) {
          setProfile(null);
          setIsAuthenticated(false);
          setLoading(false);
          return;
        }

        await syncProfile();
      },
    );

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [loadProfile, pathname]);

  useEffect(() => {
    let mounted = true;

    const handleFocusOrVisibility = async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (!mounted) return;
      if (!hasBootstrappedRef.current || lastRouteWasAuthRef.current) return;

      // Silently re-verify session and profile state when tab/window gains focus
      if (!isAuthenticated || !profile || profile.role_tier === null) {
        setLoading(true);
        await loadProfile();
        if (mounted) {
          setLoading(false);
        }
      } else {
        await loadProfile();
      }
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key && e.key.includes('auth-token')) {
        handleFocusOrVisibility();
      }
    };

    if (typeof window !== 'undefined') {
      document.addEventListener('visibilitychange', handleFocusOrVisibility);
      window.addEventListener('focus', handleFocusOrVisibility);
      window.addEventListener('storage', handleStorageChange);
    }

    return () => {
      mounted = false;
      if (typeof window !== 'undefined') {
        document.removeEventListener('visibilitychange', handleFocusOrVisibility);
        window.removeEventListener('focus', handleFocusOrVisibility);
        window.removeEventListener('storage', handleStorageChange);
      }
    };
  }, [isAuthenticated, profile, loadProfile]);

  useEffect(() => {
    const currentPath = pathname ?? '';
    const isAuthRoute =
      currentPath === "/login" ||
      currentPath === "/auth/callback" ||
      currentPath.startsWith("/auth/");

    if (isAuthRoute || loading || isAuthenticated) return;

    loadProfile().catch((error) => {
      console.warn('Failed to refresh profile on navigation:', error);
    });
  }, [pathname, isAuthenticated, loading, loadProfile]);

  // Secondary effect: Refresh profile if critical fields are missing
  // This ensures permissions are restored even if API call initially failed.
  // Capped at 3 retries to prevent hammering the API on a degraded connection.
  const retryCountRef = useRef(0);
  useEffect(() => {
    if (!isAuthenticated || !profile || loading) return;

    if (profile.role_tier === null && profile.id && retryCountRef.current < 3) {
      retryCountRef.current += 1;
      let retryTimeout: NodeJS.Timeout;

      const retryLoadProfile = async () => {
        await new Promise(resolve => {
          retryTimeout = setTimeout(resolve, 500 * retryCountRef.current);
        });
        await loadProfile();
      };

      retryLoadProfile();

      return () => {
        if (retryTimeout) {
          clearTimeout(retryTimeout);
        }
      };
    }

    if (profile.role_tier !== null) {
      retryCountRef.current = 0;
    }
  }, [isAuthenticated, profile, loading, loadProfile]);

  return {
    profile,
    isAuthenticated,
    loading,
    refreshProfile: loadProfile,
  };
}
