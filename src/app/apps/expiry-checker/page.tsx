'use client';

import { useState, useEffect } from 'react';
import CourseExpiryChecker from '@/app/components/CourseExpiryChecker';

export default function ExpiryCheckerPage() {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
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

  return (
    <div className="min-h-screen transition-colors duration-500">
      <CourseExpiryChecker isDark={isDark} />
    </div>
  );
}
