'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import MatrixSyncModal from '@/app/components/MatrixSyncModal';
import { hasPermission } from '@/lib/permissions';
import { useCurrentUserProfile } from '@/lib/useCurrentUserProfile';

export default function DashboardPage() {
  const router = useRouter();
  const [isDark, setIsDark] = useState(true);
  const [showMatrixSyncModal, setShowMatrixSyncModal] = useState(false);
  const { profile, loading } = useCurrentUserProfile();
  const userRole = profile?.role_tier ?? null;

  useEffect(() => {
    checkTheme();
    // Middleware already guards unauthenticated access server-side.
    // Only redirect for password_needs_change here (a client-specific concern).
    if (!loading && profile?.password_needs_change) {
      router.push('/auth/change-password-required');
    }
  }, [loading, profile, router]);

  useEffect(() => {
    const handleThemeChange = (event: Event) => {
      const themeEvent = event as CustomEvent<{ isDark: boolean }>;
      setIsDark(themeEvent.detail.isDark);
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

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center transition-colors duration-500 ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className={`mt-4 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen transition-colors duration-500 ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
      {/* Header */}
      <div className={`border-b transition-colors duration-300 ${isDark ? 'border-gray-800 bg-gray-800' : 'border-gray-200 bg-white'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
          <div className="flex justify-between items-center">
            <div>
              <h1 className={`text-3xl font-bold transition-colors duration-300 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Training Portal
              </h1>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <h2 className={`text-2xl font-bold transition-colors duration-300 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
            Select an App
          </h2>
          <p className={`mt-2 transition-colors duration-300 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            Choose which training tool you&apos;d like to access
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {hasPermission(userRole, 'STAFF_MANAGEMENT', 'canView') && (
            <div
              onClick={() => setShowMatrixSyncModal(true)}
              className={`group cursor-pointer p-8 rounded-xl border-2 transition-all duration-300 hover:shadow-lg ${
                isDark
                  ? 'bg-gray-800 border-gray-700 hover:border-blue-500 hover:bg-gray-750'
                  : 'bg-white border-gray-200 hover:border-blue-500 hover:bg-blue-50'
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="text-5xl">📥</div>
              </div>
              <h3 className={`text-2xl font-bold mb-2 transition-colors duration-300 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Matrix Sync
              </h3>
              <p className={`transition-colors duration-300 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                Sync via Atlas upload or a full matrix CSV per location.
              </p>
              <div className="mt-6 flex items-center text-blue-600 dark:text-blue-400 group-hover:translate-x-1 transition-transform">
                <span className="font-semibold">Open</span>
                <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          )}

          {/* Training Matrix Card */}
          <div
            onClick={() => router.push('/training-matrix')}
            className={`group cursor-pointer p-8 rounded-xl border-2 transition-all duration-300 hover:shadow-lg ${
              isDark
                ? 'bg-gray-800 border-gray-700 hover:border-purple-500 hover:bg-gray-750'
                : 'bg-white border-gray-200 hover:border-purple-500 hover:bg-purple-50'
            }`}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="text-5xl">📊</div>
            </div>
            <h3 className={`text-2xl font-bold mb-2 transition-colors duration-300 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Training Matrix
            </h3>
            <p className={`transition-colors duration-300 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              View all staff training records, completion dates, and manage certification expiry dates across all locations.
            </p>
            <div className="mt-6 flex items-center text-purple-600 dark:text-purple-400 group-hover:translate-x-1 transition-transform">
              <span className="font-semibold">Open App</span>
              <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>

          {/* Course Expiry Checker Card */}
          <div
            onClick={() => router.push('/apps/expiry-checker')}
            className={`group cursor-pointer p-8 rounded-xl border-2 transition-all duration-300 hover:shadow-lg ${
              isDark
                ? 'bg-gray-800 border-gray-700 hover:border-blue-500 hover:bg-gray-750'
                : 'bg-white border-gray-200 hover:border-blue-500 hover:bg-blue-50'
            }`}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="text-5xl">📅</div>
            </div>
            <h3 className={`text-2xl font-bold mb-2 transition-colors duration-300 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Course Expiry Checker
            </h3>
            <p className={`transition-colors duration-300 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              Track staff training certifications, expiry dates, and manage course compliance across your organization.
            </p>
            <div className="mt-6 flex items-center text-blue-600 dark:text-blue-400 group-hover:translate-x-1 transition-transform">
              <span className="font-semibold">Open App</span>
              <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>

          {/* Booking Calendar Card */}
          <div
            onClick={() => router.push('/apps/booking-calendar')}
            className={`group cursor-pointer p-8 rounded-xl border-2 transition-all duration-300 hover:shadow-lg ${
              isDark
                ? 'bg-gray-800 border-gray-700 hover:border-emerald-500 hover:bg-gray-750'
                : 'bg-white border-gray-200 hover:border-emerald-500 hover:bg-emerald-50'
            }`}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="text-5xl">📆</div>
            </div>
            <h3 className={`text-2xl font-bold mb-2 transition-colors duration-300 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Booking Calendar
            </h3>
            <p className={`transition-colors duration-300 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              Schedule training events, manage staff bookings, and track attendance for courses.
            </p>
            <div className="mt-6 flex items-center text-emerald-600 dark:text-emerald-400 group-hover:translate-x-1 transition-transform">
              <span className="font-semibold">Open App</span>
              <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {showMatrixSyncModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <MatrixSyncModal onClose={() => setShowMatrixSyncModal(false)} />
        </div>
      )}
    </div>
  );
}
