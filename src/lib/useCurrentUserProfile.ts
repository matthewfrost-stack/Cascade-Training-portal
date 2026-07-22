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
  const lastKnownProfileRef = useRef<CurrentUserProfile | null>(null);

  const loadProfile = useCallback(async () => {
    let session: {
      access_token?: string | null;
      user?: {
        id: string;
        email?: string | null;
        user_metadata?: {
          full_name?: string | null;
        };
      } | null;
    } | null = null;

    const keepSessionProfile = () => {
      if (!sessionUser) return;

      // A failed/aborted profile request must not replace a known admin or
      // scheduler role with the role-less session fallback.
      const knownProfile = lastKnownProfileRef.current;
      const fallbackProfile = knownProfile?.id === sessionUser.id
        ? knownProfile
        : {
            id: sessionUser.id,
            full_name: sessionUser.user_metadata?.full_name || null,
            email: sessionUser.email || null,
            phone_number: null,
            avatar_path: null,
            role_tier: null,
            password_needs_change: null,
          } satisfies CurrentUserProfile;

      lastKnownProfileRef.current = fallbackProfile;
      setIsAuthenticated(true);
      setProfile(fallbackProfile);
    };
    let sessionUser: {
      id: string;
      email?: string | null;
      user_metadata?: {
        full_name?: string | null;
      };
    } | null = null;

    try {
      const { data } = await supabase.auth.getSession();
      session = data.session || null;
      sessionUser = session?.user || null;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      try {
        const response = await fetch("/api/profile", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
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
            .catch(() => "<unable to read response body>");
          throw new Error(`Invalid JSON response from profile endpoint: ${body}`);
        }
        if (response.ok) {
          const profileData = (result?.profile || null) as CurrentUserProfile | null;
          if (profileData) {
            lastKnownProfileRef.current = profileData;
            setProfile(profileData);
            setIsAuthenticated(true);
            return;
          }
        }

        // If profile API fails but we have a session, fall back to session data
        // This prevents losing the user when the API temporarily fails
        if (sessionUser) {
          keepSessionProfile();
          return;
        }

        setProfile(null);
        setIsAuthenticated(false);
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          throw fetchError;
        }
        // If fetch fails but we have session user, keep them logged in
        if (sessionUser) {
          keepSessionProfile();
          if (!(fetchError instanceof Error && fetchError.name === 'AbortError')) {
            console.warn("Profile API failed, using fallback session data", fetchError);
          }
          return;
        }
        throw fetchError;
      }
    } catch (error) {
      // If there's an error but we have a session user, keep them authenticated
      // This prevents losing the user when the profile API fails
      if (sessionUser) {
        keepSessionProfile();
        if (!(error instanceof Error && error.name === 'AbortError')) {
          console.warn("Error loading current user profile:", error);
        }
        return;
      }

      if (!(error instanceof Error && error.name === 'AbortError')) {
        console.error("Error loading current user profile:", error);
      }

      // A transient session read failure must not clear permissions while the
      // user is returning to the app. SIGNED_OUT below is the authoritative
      // path for clearing this state.
      if (lastKnownProfileRef.current) {
        setProfile(lastKnownProfileRef.current);
        setIsAuthenticated(true);
      } else {
        setProfile(null);
        setIsAuthenticated(false);
      }
    }
  }, []);

  const refreshSessionAndProfile = useCallback(async () => {
    try {
      // Refresh the Supabase session first so API requests made immediately
      // after returning to a page carry a current access token.
      await supabase.auth.refreshSession();
    } catch (error) {
      console.warn("Unable to refresh session on return:", error);
    }
    await loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    const currentPath = pathname ?? "";
    const isAuthRoute =
      currentPath === "/login" ||
      currentPath === "/auth/callback" ||
      currentPath.startsWith("/auth/");

    if (isAuthRoute) {
      lastRouteWasAuthRef.current = true;
      lastKnownProfileRef.current = null;
      setProfile(null);
      setIsAuthenticated(false);
      setLoading(false);
    }
  }, [pathname]);

  useEffect(() => {
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

    const shouldBootstrapProfile =
      !hasBootstrappedRef.current || lastRouteWasAuthRef.current;
    hasBootstrappedRef.current = true;
    lastRouteWasAuthRef.current = false;

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

        // Refreshing an access token does not change the user's profile or
        // permissions, so do not show a loading state for TOKEN_REFRESHED.
        if (
          event === 'TOKEN_REFRESHED' ||
          (event === 'SIGNED_IN' && lastKnownProfileRef.current?.id === session?.user?.id)
        ) {
          return;
        }

        if (event === "SIGNED_OUT" || !session?.user) {
          lastKnownProfileRef.current = null;
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
  }, [loadProfile]);

  useEffect(() => {
    let mounted = true;

    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible' || !mounted) return;
      await refreshSessionAndProfile();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      mounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshSessionAndProfile]);

  useEffect(() => {
    const currentPath = pathname ?? '';
    const isAuthRoute =
      currentPath === "/login" ||
      currentPath === "/auth/callback" ||
      currentPath.startsWith("/auth/");

    if (isAuthRoute || loading) return;

    refreshSessionAndProfile().catch((error) => {
      console.warn('Failed to refresh profile on navigation:', error);
    });
  // `loading` is intentionally read from the render associated with a route
  // change. Including it here would cause a refresh -> loading -> refresh loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, refreshSessionAndProfile]);

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
