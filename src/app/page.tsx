'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import MatrixSyncModal from '@/app/components/MatrixSyncModal';
import TileButton from '@/app/components/TileButton';
import { hasPermission } from '@/lib/permissions';
import { useCurrentUserProfile } from '@/lib/useCurrentUserProfile';
import { supabase } from '@/lib/supabase';

export default function LandingPage() {
  const router = useRouter();
  const [isDark, setIsDark] = useState(true);
  const [showMatrixSyncModal, setShowMatrixSyncModal] = useState(false);
  const { profile, loading, isAuthenticated } = useCurrentUserProfile();
  const userRole = profile?.role_tier ?? null;

  useEffect(() => {
    let active = true;

    const runAuthCheck = async () => {
      if (!active || loading) return;

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!active) return;

      if (!session?.user) {
        router.replace('/login');
        return;
      }

      if (!isAuthenticated) {
        window.setTimeout(async () => {
          if (!active) return;

          const { data: fallbackSessionData } = await supabase.auth.getSession();
          if (!active) return;

          if (!fallbackSessionData.session?.user) {
            router.replace('/login');
          }
        }, 1000);
        return;
      }

      if (profile?.password_needs_change) {
        router.replace('/auth/change-password-required');
      }
    };

    void runAuthCheck();

    return () => {
      active = false;
    };
  }, [isAuthenticated, loading, profile?.password_needs_change, router]);

  useEffect(() => {
    const handleThemeChange = (event: Event) => {
      const themeEvent = event as CustomEvent<{ isDark: boolean }>;
      setIsDark(themeEvent.detail.isDark);
    };

    window.addEventListener('themeChange', handleThemeChange);
    return () => window.removeEventListener('themeChange', handleThemeChange);
  }, []);

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center transition-colors duration-500 ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className={`mt-4 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>Loading portal...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen transition-colors duration-500 ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
      {/* Main Content Header */}
      <div className={`border-b transition-colors duration-300 ${isDark ? 'border-gray-800 bg-gray-800' : 'border-gray-200 bg-white'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
          <div className="flex justify-between items-center">
            <div>
              <h1 className={`text-3xl font-bold transition-colors duration-300 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Training Portal
              </h1>
              <p className={`mt-1 text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                Manage staff training, course compliance, and calendar bookings
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Apps */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
        <div className="mb-8">
          <h2 className={`text-2xl font-bold transition-colors duration-300 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
            Select an App
          </h2>
          <p className={`mt-2 transition-colors duration-300 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            Choose which training tool you&apos;d like to access
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch">
          {hasPermission(userRole, 'STAFF_MANAGEMENT', 'canView') && (
            <TileButton
              title="Matrix Sync"
              description="Sync via Atlas upload or a full matrix CSV per location."
              emoji="📥"
              accent="blue"
              actionText="Open Sync"
              onClick={() => setShowMatrixSyncModal(true)}
            />
          )}

          {/* Training Matrix Card */}
          <TileButton
            title="Training Matrix"
            description="View all staff training records, completion dates, and manage certification expiry dates across all locations."
            emoji="📊"
            accent="purple"
            actionText="Open App"
            onClick={() => router.push('/training-matrix')}
          />

          {/* Course Expiry Checker Card */}
          <TileButton
            title="Course Expiry Checker"
            description="Track staff training certifications, expiry dates, and manage course compliance across your organization."
            emoji="📅"
            accent="blue"
            actionText="Open App"
            onClick={() => router.push('/apps/expiry-checker')}
          />

          {/* Booking Calendar Card */}
          <TileButton
            title="Booking Calendar"
            description="Schedule training events, manage staff bookings, and track attendance for courses."
            emoji="📆"
            accent="emerald"
            actionText="Open App"
            onClick={() => router.push('/apps/booking-calendar')}
          />
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
