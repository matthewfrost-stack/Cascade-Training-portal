'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import CourseManagerModal from '@/app/components/CourseManagerModal';
import LocationManagerModal from '@/app/components/LocationManagerModal';
import ChecklistTemplateModal from '@/app/components/ChecklistTemplateModal';
import AttendanceReasonsModal from '@/app/components/AttendanceReasonsModal';
import AddStaffModal from '@/app/components/AddStaffModal';
import DuplicateRemovalModal from '@/app/components/DuplicateRemovalModal';
import MatrixSyncModal from '@/app/components/MatrixSyncModal';
import { hasPermission } from '@/lib/permissions';
import BackButton from '@/app/components/BackButton';
import UniformButton from '@/app/components/UniformButton';
import { useCurrentUserProfile } from '@/lib/useCurrentUserProfile';
import { supabase } from '@/lib/supabase';
import { AppIcon, type AppIconName } from '@/lib/appIcons';

type DashboardCardProps = {
  isDark: boolean;
  accent: string;
  icon: AppIconName;
  title: string;
  description: string;
  actionLabel: string;
  onClick: () => void;
};

function DashboardCard({
  isDark,
  accent,
  icon,
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
      <div className="mb-3"><AppIcon name={icon} size="md" /></div>
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

function AdminSection({ isDark, title, description, children }: { isDark: boolean; title: string; description: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 px-1">
        <h2 style={{ color: isDark ? '#f1f5f9' : '#1e293b' }} className="text-sm font-black uppercase tracking-widest">{title}</h2>
        <p style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="text-xs mt-0.5">{description}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const { profile, isAuthenticated, loading, refreshProfile } = useCurrentUserProfile();
  const [isDark, setIsDark] = useState(true);
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showChecklistTemplateModal, setShowChecklistTemplateModal] = useState(false);
  const [showReasonsModal, setShowReasonsModal] = useState(false);
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [showMatrixSyncModal, setShowMatrixSyncModal] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [permissionRetry, setPermissionRetry] = useState(0);
  const [permissionLoadError, setPermissionLoadError] = useState(false);
  const permissionRetryRef = useRef(0);

  useEffect(() => {
    checkTheme();
  }, []);

  // Old links to the separate Admin Tools page (/admin-tools?open=…) land here.
  useEffect(() => {
    const open = new URLSearchParams(window.location.search).get('open');
    if (open === 'staff') setShowStaffModal(true);
    if (open === 'notifications') router.replace('/automation-control?tab=test');
  }, [router]);

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

    // Schedulers only ever had the reports here; they now have their own page.
    if (profile.role_tier.trim().toLowerCase() === 'scheduler') {
      router.replace('/reports');
      return;
    }

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
    router.push('/');
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
          <p style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="mt-4">Loading Admin...</p>
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
          <h1 style={{ color: isDark ? '#f1f5f9' : '#1e293b' }} className="text-xl sm:text-2xl md:text-3xl font-black uppercase tracking-tighter">Admin</h1>
          <div />
        </div>

        <div className="space-y-8">
          {isAdmin && (
            <AdminSection isDark={isDark} title="People" description="Staff accounts, people who have left, and duplicate clean-up.">
              <DashboardCard isDark={isDark} accent="#3b82f6" icon="staff" title="Manage Staff" description="Add or edit staff, their homes, start dates and logins." actionLabel="Manage" onClick={() => setShowStaffModal(true)} />
              <DashboardCard isDark={isDark} accent="#0ea5e9" icon="archive" title="Archive & Restore" description="People who have left. Restore someone to bring their login back." actionLabel="Open" onClick={() => router.push('/admin/archive')} />
              <DashboardCard isDark={isDark} accent="#ef4444" icon="duplicates" title="Clean Duplicates" description="Find and merge duplicate staff records." actionLabel="Open" onClick={() => setShowDuplicateModal(true)} />
            </AdminSection>
          )}

          {isAdmin && (
            <AdminSection isDark={isDark} title="Setup" description="Homes, courses, the booking checklist and attendance reasons.">
              <DashboardCard isDark={isDark} accent="#f59e0b" icon="venues" title="Manage Venues" description="Homes and training locations, regulator, managers' email group." actionLabel="Manage" onClick={() => setShowLocationModal(true)} />
              <DashboardCard isDark={isDark} accent="#a855f7" icon="courses" title="Course Catalog" description="Create training types and set capacities." actionLabel="Manage" onClick={() => setShowCourseModal(true)} />
              <DashboardCard isDark={isDark} accent="#6366f1" icon="checklist" title="Checklist Template" description="Add/remove booking checklist items." actionLabel="Manage" onClick={() => setShowChecklistTemplateModal(true)} />
              <DashboardCard isDark={isDark} accent="#f97316" icon="attendanceReasons" title="Attendance Reasons" description="Add or remove the lateness and absence reasons used in bookings and the Intelligence Hub." actionLabel="Manage" onClick={() => setShowReasonsModal(true)} />
            </AdminSection>
          )}

          {isAdmin && (
            <AdminSection isDark={isDark} title="Emails" description="Every automatic email in one place, with its on/off switch.">
              <DashboardCard isDark={isDark} accent="#06b6d4" icon="emails" title="Emails & Feedback" description="Feedback form and emails, booking reminders, manager emails, test mode and sent emails." actionLabel="Manage" onClick={() => router.push('/automation-control')} />
            </AdminSection>
          )}

          <AdminSection isDark={isDark} title="Reports" description="Compliance, Intelligence Hub and Feedback Results now have their own Reports page.">
            <DashboardCard isDark={isDark} accent="#10b981" icon="reports" title="Reports" description="Compliance Report, Intelligence Hub and Feedback Results." actionLabel="Open Reports" onClick={() => router.push('/reports')} />
          </AdminSection>

          {isAdmin && (
            <AdminSection isDark={isDark} title="Data" description="Bring training records in from Atlas or a spreadsheet.">
              <DashboardCard isDark={isDark} accent="#2563eb" icon="sync" title="Matrix Sync" description="Sync via Atlas upload or a full matrix CSV per location." actionLabel="Open Sync" onClick={() => setShowMatrixSyncModal(true)} />
            </AdminSection>
          )}
        </div>
      </div>

      {/* MODALS */}
      {isAdmin && showCourseModal && <CourseManagerModal onClose={() => setShowCourseModal(false)} />}
      {isAdmin && showLocationModal && <LocationManagerModal onClose={() => setShowLocationModal(false)} />}
      {isAdmin && showChecklistTemplateModal && <ChecklistTemplateModal onClose={() => setShowChecklistTemplateModal(false)} />}
      {isAdmin && showReasonsModal && <AttendanceReasonsModal onClose={() => setShowReasonsModal(false)} />}
      {isAdmin && showStaffModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`max-w-2xl w-full max-h-[90vh] overflow-y-auto rounded-lg ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
            <AddStaffModal
              onClose={() => setShowStaffModal(false)}
              onRefresh={() => {
                // Keep the window open after save/update so more edits can be made.
              }}
            />
          </div>
        </div>
      )}
      {isAdmin && showDuplicateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`max-w-2xl w-full max-h-[90vh] overflow-y-auto rounded-lg ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
            <DuplicateRemovalModal onClose={() => setShowDuplicateModal(false)} />
          </div>
        </div>
      )}
      {isAdmin && showMatrixSyncModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <MatrixSyncModal onClose={() => setShowMatrixSyncModal(false)} />
        </div>
      )}
    </main>
  );
}
