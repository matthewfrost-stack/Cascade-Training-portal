'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { signOutClientSide } from '@/lib/clientSignOut';

export default function SessionTimeout() {
  const pathname = usePathname();
  const router = useRouter();
  const timeoutIdRef = useRef<number | null>(null);
  const countdownRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const lastActivityBroadcastRef = useRef(0);
  const inactivityTimeoutMs = 5 * 60 * 1000;
  const warningMs = 60_000;
  const activityStorageKey = 'cascade:last-activity-at';
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(60);

  const clearTimeoutId = useCallback(() => {
    if (timeoutIdRef.current !== null) {
      window.clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = null;
    }
  }, []);

  const clearCountdown = useCallback(() => {
    if (countdownRef.current !== null) {
      window.clearInterval(countdownRef.current);
      countdownRef.current = null;
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

  const startWarningCountdown = useCallback((remainingMs: number) => {
    clearCountdown();
    setShowWarning(true);
    setSecondsLeft(Math.max(1, Math.ceil(remainingMs / 1000)));

    countdownRef.current = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearCountdown();
          void signOutAndRedirect();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Schedule final logout as a safety net
    timeoutIdRef.current = window.setTimeout(() => {
      clearCountdown();
      void signOutAndRedirect();
    }, remainingMs);
  }, [clearCountdown, signOutAndRedirect]);

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

    if (remainingMs <= warningMs) {
      startWarningCountdown(remainingMs);
      return;
    }

    // Schedule a check when we reach the warning threshold
    timeoutIdRef.current = window.setTimeout(() => {
      resetInactivityTimer();
    }, remainingMs - warningMs);
  }, [clearTimeoutId, readLastActivity, signOutAndRedirect, inactivityTimeoutMs, warningMs, startWarningCountdown]);

  const recordActivity = useCallback(() => {
    if (document.visibilityState !== 'visible') return;

    clearCountdown();
    setShowWarning(false);

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
  }, [clearCountdown, resetInactivityTimer]);

  useEffect(() => {
    mountedRef.current = true;

    const currentPath = pathname ?? '';
    const isAuthRoute =
      currentPath === '/login' || currentPath === '/auth/callback' || currentPath.startsWith('/auth/');

    if (isAuthRoute) {
      clearTimeoutId();
      clearCountdown();
      setShowWarning(false);
      return;
    }

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
      clearCountdown();
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, recordActivity);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('storage', handleStorageChange);
      authListener.subscription.unsubscribe();
    };
  }, [pathname, router, recordActivity, clearTimeoutId, clearCountdown, resetInactivityTimer, signOutAndRedirect]);

  const handleStayLoggedIn = useCallback(() => {
    recordActivity();
  }, [recordActivity]);

  if (!showWarning) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60">
      <div className="mx-4 w-full max-w-sm rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
        <h2 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
          Session Expiring
        </h2>
        <p className="mb-6 text-sm text-gray-600 dark:text-gray-300">
          You will be logged out in{' '}
          <span className="font-mono font-bold text-red-600 dark:text-red-400">
            {secondsLeft}
          </span>{' '}
          {secondsLeft === 1 ? 'second' : 'seconds'} due to inactivity.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleStayLoggedIn}
            className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
          >
            Stay Logged In
          </button>
          <button
            type="button"
            onClick={() => void signOutAndRedirect()}
            className="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 dark:focus:ring-offset-gray-800"
          >
            Log Out Now
          </button>
        </div>
      </div>
    </div>
  );
}
