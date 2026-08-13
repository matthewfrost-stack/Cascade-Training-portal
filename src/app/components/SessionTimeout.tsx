'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { signOutClientSide } from '@/lib/clientSignOut';

export default function SessionTimeout() {
  const router = useRouter();
  const timeoutIdRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const lastActivityBroadcastRef = useRef(0);
  const inactivityTimeoutMs = 5 * 60 * 1000;
  const activityStorageKey = 'cascade:last-activity-at';

  const clearTimeoutId = useCallback(() => {
    if (timeoutIdRef.current !== null) {
      window.clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = null;
    }
  }, []);

  const signOutAndRedirect = useCallback(async () => {
    clearTimeoutId();

    try {
      await signOutClientSide();
    } catch (error) {
      console.error('SessionTimeout sign-out failed:', error);
      await supabase.auth.signOut();
    } finally {
      if (mountedRef.current) {
        router.push('/login');
      }
    }
  }, [clearTimeoutId, router]);

  const readLastActivity = useCallback(() => {
    if (typeof window === 'undefined') return Date.now();

    try {
      const storedValue = window.localStorage.getItem(activityStorageKey);
      const storedTimestamp = storedValue ? Number(storedValue) : NaN;
      return Number.isFinite(storedTimestamp) && storedTimestamp > 0
        ? storedTimestamp
        : Date.now();
    } catch {
      return Date.now();
    }
  }, []);

  const resetInactivityTimer = useCallback(() => {
    clearTimeoutId();

    // A hidden tab must not sign out the shared session while the user is
    // active in another tab. The visible tab owns the shared activity clock.
    if (document.visibilityState !== 'visible') return;

    const elapsedMs = Date.now() - readLastActivity();
    const remainingMs = inactivityTimeoutMs - elapsedMs;

    if (remainingMs <= 0) {
      void signOutAndRedirect();
      return;
    }

    timeoutIdRef.current = window.setTimeout(() => {
      resetInactivityTimer();
    }, remainingMs);
  }, [clearTimeoutId, readLastActivity, signOutAndRedirect, inactivityTimeoutMs]);

  const recordActivity = useCallback(() => {
    if (document.visibilityState !== 'visible') return;

    const now = Date.now();
    if (now - lastActivityBroadcastRef.current >= 1000) {
      lastActivityBroadcastRef.current = now;
      try {
        window.localStorage.setItem(activityStorageKey, String(now));
      } catch {
        // Continue with the in-memory timer if browser storage is unavailable.
      }
    }

    resetInactivityTimer();
  }, [resetInactivityTimer]);

  useEffect(() => {
    mountedRef.current = true;
    recordActivity();

    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, recordActivity, { passive: true });
    });

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Returning to a tab is not activity. Re-evaluate the shared clock so
        // an actually idle session can still time out.
        resetInactivityTimer();
      } else {
        clearTimeoutId();
      }
    };

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === activityStorageKey && document.visibilityState === 'visible') {
        resetInactivityTimer();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('storage', handleStorageChange);

    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (!mountedRef.current) return;

      if (event === 'SIGNED_OUT') {
        if (mountedRef.current) {
          router.push('/login');
        }
        return;
      }

      resetInactivityTimer();
    });

    return () => {
      mountedRef.current = false;
      clearTimeoutId();
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, recordActivity);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('storage', handleStorageChange);
      authListener.subscription.unsubscribe();
    };
  }, [router, recordActivity, clearTimeoutId, resetInactivityTimer, signOutAndRedirect]);

  return null;
}
