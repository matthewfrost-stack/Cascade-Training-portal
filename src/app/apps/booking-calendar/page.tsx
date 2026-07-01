'use client';

import { useState, useEffect } from 'react';
import CalendarPage from './CalendarPage';
import { supabase } from '@/lib/supabase';

export default function BookingCalendarPage() {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    checkAuth();
    checkTheme();
  }, []);

  useEffect(() => {
    const handleThemeChange = (event: any) => {
      setIsDark(event.detail.isDark);
    };

    window.addEventListener('themeChange', handleThemeChange);
    return () => window.removeEventListener('themeChange', handleThemeChange);
  }, []);

  const checkTheme = (): void => {
    if (typeof window !== 'undefined') {
      const isDarkMode = document.documentElement.classList.contains('dark');
      setIsDark(isDarkMode);
    }
  }

  const checkAuth = async (): Promise<void> => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        // Middleware handles unauthenticated redirects server-side.
        // Do not push to /login from the client — it causes a redirect loop
        // where middleware bounces the authenticated session back to /.
        return;
      }
    } catch (error) {
      console.error('Auth error:', error);
      // Do not redirect on error — let middleware handle it server-side.
    }
  }

  return (
    <div className={`min-h-screen transition-colors duration-500 ${isDark ? 'dark' : ''}`}>
      <div className="relative">
        <CalendarPage />
      </div>
    </div>
  );
}
