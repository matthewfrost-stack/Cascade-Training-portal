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
            setProfile(profileData);
            setIsAuthenticated(true);
            return;
          }
        }

        // If profile API fails but we have a session, fall back to session data
        // This prevents losing the user when the API temporarily fails
        if (sessionUser) {
          setIsAuthenticated(true);
          setProfile({
            id: sessionUser.id,
            full_name: sessionUser.user_metadata?.full_name || null,
            email: sessionUser.email || null,
            phone_number: null,
            avatar_path: null,
            role_tier: null,
            password_needs_change: null,
          });
          return;
        }

        setProfile(null);
        setIsAuthenticated(false);
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          throw new Error('Profile request timed out');
        }
        // If fetch fails but we have session user, keep them logged in
        if (sessionUser) {
          setIsAuthenticated(true);
          setProfile({
            id: sessionUser.id,
            full_name: sessionUser.user_metadata?.full_name || null,
            email: sessionUser.email || null,
            phone_number: null,
            avatar_path: null,
            role_tier: null,
            password_needs_change: null,
          });
          console.warn("Profile API failed, using fallback session data", fetchError);
          return;
        }
        throw fetchError;
      }
    } catch (error) {
      console.error("Error loading current user profile:", error);
      // If there's an error but we have a session user, keep them authenticated
      // This prevents losing the user when the profile API fails
      if (sessionUser) {
        setIsAuthenticated(true);
        setProfile({
          id: sessionUser.id,
          full_name: sessionUser.user_metadata?.full_name || null,
          email: sessionUser.email || null,
          phone_number: null,
          avatar_path: null,
          role_tier: null,
          password_needs_change: null,
        });
        return;
      }

      setProfile(null);
      setIsAuthenticated(false);
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

  // Secondary effect: Refresh profile if critical fields are missing
  // This ensures permissions are restored even if API call initially failed
  useEffect(() => {
    if (!isAuthenticated || !profile || loading) return;
    
    // If we have a profile but critical permission data is missing, refresh
    if (profile.role_tier === null && profile.id) {
      let retryTimeout: NodeJS.Timeout;
      
      const retryLoadProfile = async () => {
        // Add a small delay to avoid hammering the API
        await new Promise(resolve => {
          retryTimeout = setTimeout(resolve, 500);
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
  }, [isAuthenticated, profile, loading, loadProfile]);

  return {
    profile,
    isAuthenticated,
    loading,
    refreshProfile: loadProfile,
  };
}
