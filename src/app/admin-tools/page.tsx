'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { hasPermission } from '@/lib/permissions';
import AdminToolsPanel from '@/app/components/AdminToolsPanel';
import BackButton from '@/app/components/BackButton';
import { useCurrentUserProfile } from '@/lib/useCurrentUserProfile';

export default function AdminToolsPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen px-4 py-8">
          <div className="max-w-5xl mx-auto text-sm text-slate-600">Loading…</div>
        </main>
      }
    >
      <AdminToolsPageInner />
    </Suspense>
  );
}

function AdminToolsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, loading } = useCurrentUserProfile();
  const [isDark, setIsDark] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  const openParam = (searchParams?.get('open') || '').trim().toLowerCase();
  const initialModal =
    openParam === 'staff' ? 'staff' : openParam === 'notifications' ? 'notifications' : openParam === 'housekeeping' ? 'housekeeping' : null;

  useEffect(() => {
    const checkTheme = () => setIsDark(document.documentElement.classList.contains('dark'));
    checkTheme();
    window.addEventListener('themeChange', checkTheme);
    window.addEventListener('storage', checkTheme);
    return () => {
      window.removeEventListener('themeChange', checkTheme);
      window.removeEventListener('storage', checkTheme);
    };
  }, []);

  // Handle authentication and authorization
  useEffect(() => {
    // Wait for auth to complete
    if (loading) return;

    // Don't have permissions yet - wait for profile to fully load
    if (!profile?.role_tier) {
      return;
    }

    // Check if user has admin permission
    if (!hasPermission(profile.role_tier, 'STAFF_MANAGEMENT', 'canView')) {
      setAccessDenied(true);
      // Redirect after a brief delay to show the message
      const timeout = setTimeout(() => {
        router.push('/');
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [loading, profile, router]);

  if (loading) {
    return (
      <main className="min-h-screen px-4 py-8">
        <div className="max-w-5xl mx-auto text-sm text-slate-600">Loading…</div>
      </main>
    );
  }

  if (accessDenied) {
    return (
      <main style={{ backgroundColor: isDark ? '#0f172a' : '#f1f5f9' }} className="min-h-screen px-4 py-8 transition-colors duration-300 flex items-center justify-center">
        <div className="text-center">
          <h1 style={{ color: isDark ? '#f1f5f9' : '#1e293b' }} className="text-2xl font-bold mb-4">Access Denied</h1>
          <p style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="mb-6">You don&apos;t have permission to access admin tools.</p>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
          >
            Go Home
          </button>
        </div>
      </main>
    );
  }

  return (
    <main style={{ backgroundColor: isDark ? '#0f172a' : '#f1f5f9' }} className="min-h-screen px-4 py-8 transition-colors duration-300">
      <div className="max-w-6xl mx-auto">
        <div
          style={{ backgroundColor: isDark ? '#111827' : '#ffffff', borderColor: isDark ? '#1f2937' : '#e2e8f0' }}
          className="rounded-[32px] border shadow-2xl overflow-hidden"
        >
          <div className="p-6 md:p-10 border-b" style={{ borderColor: isDark ? '#1f2937' : '#e2e8f0' }}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <BackButton to="/" label="Back" labelClassName="sr-only" />
                <div>
                  <h1 className="text-2xl md:text-4xl font-black tracking-tight">Admin</h1>
                  <p className={`mt-2 text-sm md:text-base ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Manage staff and system settings.</p>
                </div>
              </div>
              <div />
            </div>
          </div>

          <div className="p-6 md:p-10">
            <AdminToolsPanel isDark={isDark} userRole={profile?.role_tier || null} initialModal={initialModal} />
          </div>
        </div>
      </div>
    </main>
  );
}
