'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import CourseManagerModal from '@/app/components/CourseManagerModal';
import LocationManagerModal from '@/app/components/LocationManagerModal';
import ChecklistTemplateModal from '@/app/components/ChecklistTemplateModal';
import { hasPermission } from '@/lib/permissions';
import BackButton from '@/app/components/BackButton';
import UniformButton from '@/app/components/UniformButton';
import { useCurrentUserProfile } from '@/lib/useCurrentUserProfile';
import { supabase } from '@/lib/supabase';

type DashboardCardProps = {
  isDark: boolean;
  accent: string;
  emoji: string;
  title: string;
  description: string;
  actionLabel: string;
  onClick: () => void;
};

function DashboardCard({
  isDark,
  accent,
  emoji,
  title,
  description,
  actionLabel,
  onClick,
}: DashboardCardProps) {
  return (
    <div
      style={{
        backgroundColor: isDark ? '#1e293b' : '#ffffff',
        borderColor: isDark ? '#334155' : '#e2e8f0',
      }}
      className="rounded-xl border p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="mb-2 text-2xl sm:text-3xl">{emoji}</div>
      <h3
        style={{ color: isDark ? '#f1f5f9' : '#1e293b' }}
        className="mb-1 text-sm font-bold sm:text-base"
      >
        {title}
      </h3>
      <p
        style={{ color: isDark ? '#94a3b8' : '#64748b' }}
        className="mb-3 text-xs"
      >
        {description}
      </p>
      <UniformButton
        variant="primary"
        size="sm"
        className="w-full"
        style={{ backgroundColor: accent }}
        onClick={onClick}
      >
        {actionLabel}
      </UniformButton>
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const { profile, isAuthenticated, loading, refreshProfile } = useCurrentUserProfile();
  const [isDark, setIsDark] = useState(true);
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showChecklistTemplateModal, setShowChecklistTemplateModal] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [permissionRetry, setPermissionRetry] = useState(0);
  const [permissionLoadError, setPermissionLoadError] = useState(false);
  const permissionRetryRef = useRef(0);

  useEffect(() => {
    checkTheme();
  }, []);

  // Handle authentication and authorization
  useEffect(() => {
    // Wait for auth to complete
    if (loading) return;

    // A client-side navigation can briefly finish before the shared Supabase
    // session is visible to this page's profile hook. Re-check and refresh
    // before redirecting, otherwise a valid user is sent back to the landing
    // page through the login route.
    if (!isAuthenticated || !profile) {
      let cancelled = false;
      let redirectTimeout: ReturnType<typeof setTimeout> | undefined;

      const restoreSessionOrRedirect = async () => {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;

        if (data.session?.user) {
          await refreshProfile();
          return;
        }

        redirectTimeout = setTimeout(() => {
          if (!cancelled) router.replace('/login');
        }, 1500);
      };

      void restoreSessionOrRedirect();

      return () => {
        cancelled = true;
        if (redirectTimeout) clearTimeout(redirectTimeout);
      };
    }

    // Don't have permissions yet - wait for profile to fully load
    if (!profile.role_tier) {
      if (permissionRetryRef.current >= 5) {
        setPermissionLoadError(true);
        return;
      }

      const retryTimeout = setTimeout(() => {
        permissionRetryRef.current += 1;
        setPermissionRetry((current) => current + 1);
        void refreshProfile();
      }, 500);

      return () => clearTimeout(retryTimeout);
    }

    permissionRetryRef.current = 0;
    setPermissionRetry(0);
    setPermissionLoadError(false);
    setAccessDenied(false);

    // Check if user has admin permission
    if (!hasPermission(profile.role_tier, 'ADMIN_DASHBOARD', 'canView')) {
      setAccessDenied(true);
      // Redirect after a brief delay to show the message
      const timeout = setTimeout(() => {
        router.push('/apps/booking-calendar');
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [loading, isAuthenticated, profile, permissionRetry, refreshProfile, router]);

  useEffect(() => {
    // Only run on client side
    if (typeof window !== 'undefined') {
      const handleThemeChange = (event: Event) => {
        const themeEvent = event as CustomEvent<{ isDark: boolean }>;
        setIsDark(themeEvent.detail.isDark);
      };
      
      window.addEventListener('themeChange', handleThemeChange);
      return () => window.removeEventListener('themeChange', handleThemeChange);
    }
  }, []);

  const checkTheme = (): void => {
    // Only run on client side
    if (typeof window !== 'undefined') {
      const theme = localStorage.getItem('theme');
      const isDarkMode = theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
      setIsDark(isDarkMode);
    }
  };

  const handleBack = (): void => {
    router.push('/apps/booking-calendar');
  };

  const roleTier = profile?.role_tier?.trim().toLowerCase() || null;
  const isAdmin = roleTier === 'admin';

  const retryPermissionLoad = () => {
    permissionRetryRef.current = 0;
    setPermissionRetry(0);
    setPermissionLoadError(false);
    void refreshProfile();
  };

  if (loading || !isAuthenticated || !profile || !roleTier) {
    if (permissionLoadError) {
      return (
        <main style={{ backgroundColor: isDark ? '#0f172a' : '#f1f5f9', minHeight: '100vh' }} className="p-8 transition-colors duration-300 flex items-center justify-center">
          <div className="max-w-md text-center">
            <div className="mb-4 text-4xl">⚠️</div>
            <h1 style={{ color: isDark ? '#f1f5f9' : '#1e293b' }} className="text-2xl font-bold">Permission details could not be loaded</h1>
            <p style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="mt-3 text-sm">
              Your session is active, but the dashboard could not confirm your admin permissions.
            </p>
            <UniformButton variant="primary" size="md" className="mt-6" onClick={retryPermissionLoad}>
              Try Again
            </UniformButton>
          </div>
        </main>
      );
    }

    return (
      <main style={{ backgroundColor: isDark ? '#0f172a' : '#f1f5f9', minHeight: '100vh' }} className="p-8 transition-colors duration-300 flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-300 border-t-emerald-500" />
          <p style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="mt-4">Loading Training Dashboard...</p>
        </div>
      </main>
    );
  }

  if (accessDenied) {
    return (
      <main style={{ backgroundColor: isDark ? '#0f172a' : '#f1f5f9', minHeight: '100vh' }} className="p-8 transition-colors duration-300 flex items-center justify-center">
        <div className="text-center">
          <h1 style={{ color: isDark ? '#f1f5f9' : '#1e293b' }} className="text-2xl font-bold mb-4">Access Denied</h1>
          <p style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="mb-6">You don&apos;t have permission to access the admin panel.</p>
          <button
            onClick={handleBack}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
          >
            Go Back
          </button>
        </div>
      </main>
    );
  }

  return (
    <main style={{ backgroundColor: isDark ? '#0f172a' : '#f1f5f9', minHeight: '100vh' }} className="transition-colors duration-300 p-3 sm:p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header row with back button and title */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 sm:mb-12 px-2 sm:px-4">
          <BackButton onClick={handleBack} />
          <h1 style={{ color: isDark ? '#f1f5f9' : '#1e293b' }} className="text-xl sm:text-2xl md:text-3xl font-black uppercase tracking-tighter">Training Control Centre</h1>
          <div />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* ADMIN-ONLY MANAGEMENT */}
          {isAdmin && (
            <>
              <DashboardCard isDark={isDark} accent="#f59e0b" emoji="📍" title="Manage Venues" description="Add and manage training locations." actionLabel="🏢 Manage" onClick={() => setShowLocationModal(true)} />
              <DashboardCard isDark={isDark} accent="#a855f7" emoji="📚" title="Course Catalog" description="Create training types and set capacities." actionLabel="📖 Manage" onClick={() => setShowCourseModal(true)} />
            </>
          )}

          <DashboardCard isDark={isDark} accent="#10b981" emoji="📊" title="Intelligence Hub" description="View your performance dashboard." actionLabel="📊 View" onClick={() => router.push('/analytics?from=/admin')} />
          <DashboardCard isDark={isDark} accent="#3b82f6" emoji="⭐" title="Feedback Results" description="Analyse training course feedback from staff." actionLabel="⭐ View Results" onClick={() => router.push('/feedback/results')} />

          {/* ADMIN-ONLY */}
          {isAdmin && (
            <>
              <DashboardCard isDark={isDark} accent="#6366f1" emoji="✅" title="Checklist Template" description="Add/remove booking checklist items." actionLabel="✅ Manage" onClick={() => setShowChecklistTemplateModal(true)} />
              <DashboardCard isDark={isDark} accent="#06b6d4" emoji="🤖" title="Automation Control" description="Control internal feedback email automation system." actionLabel="🤖 Control Automation" onClick={() => router.push('/automation-control')} />
            </>
          )}
        </div>
      </div>

      {/* MODALS */}
      {isAdmin && showCourseModal && <CourseManagerModal onClose={() => setShowCourseModal(false)} />}
      {isAdmin && showLocationModal && <LocationManagerModal onClose={() => setShowLocationModal(false)} />}
      {isAdmin && showChecklistTemplateModal && <ChecklistTemplateModal onClose={() => setShowChecklistTemplateModal(false)} />}
    </main>
  );
}
