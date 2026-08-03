'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { signOutClientSide } from '@/lib/clientSignOut';

export default function SessionTimeout() {
  const router = useRouter();
  const timeoutIdRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const inactivityTimeoutMs = 5 * 60 * 1000;

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

  const resetInactivityTimer = useCallback(() => {
    clearTimeoutId();
    timeoutIdRef.current = window.setTimeout(() => {
      void signOutAndRedirect();
    }, inactivityTimeoutMs);
  }, [clearTimeoutId, signOutAndRedirect, inactivityTimeoutMs]);

  useEffect(() => {
    mountedRef.current = true;
    resetInactivityTimer();

    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, resetInactivityTimer, { passive: true });
    });

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
        window.removeEventListener(eventName, resetInactivityTimer);
      });
      authListener.subscription.unsubscribe();
    };
  }, [router, resetInactivityTimer, clearTimeoutId]);

  return null;
}

