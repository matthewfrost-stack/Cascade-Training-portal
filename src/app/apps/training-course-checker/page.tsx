'use client';

import { useEffect, useState } from 'react';
import TrainingCourseChecker from '@/app/components/TrainingCourseChecker';

export default function TrainingCourseCheckerPage() {
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
  };

  return (
    <div className="min-h-screen transition-colors duration-500">
      <TrainingCourseChecker isDark={isDark} />
    </div>
  );
}
