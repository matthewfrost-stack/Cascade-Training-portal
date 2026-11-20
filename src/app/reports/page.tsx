'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import MainHeader from '@/app/components/MainHeader';
import TileButton from '@/app/components/TileButton';
import { AppIcon } from '@/lib/appIcons';
import { hasPermission } from '@/lib/permissions';
import { useCurrentUserProfile } from '@/lib/useCurrentUserProfile';

/**
 * Reports: Compliance Report (admin, scheduler, manager), Intelligence Hub and
 * Feedback Results (admin, scheduler). Someone who can only see the compliance
 * report (managers) goes straight to it.
 */
export default function ReportsPage() {
  const router = useRouter();
  const { profile, loading } = useCurrentUserProfile();
  const role = profile?.role_tier || null;
  const canCompliance = hasPermission(role, 'COMPLIANCE_REPORT', 'canView');
  const canHub = hasPermission(role, 'INTELLIGENCE_HUB', 'canView');
  const canFeedback = hasPermission(role, 'FEEDBACK_RESULTS', 'canView');
  const onlyCompliance = canCompliance && !canHub && !canFeedback;

  useEffect(() => {
    if (!loading && onlyCompliance) router.replace('/reports/compliance');
  }, [loading, onlyCompliance, router]);

  if (loading || onlyCompliance) {
    return <main className="min-h-screen bg-slate-50 p-8 text-center text-slate-500 dark:bg-slate-950">Loading…</main>;
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 transition-colors dark:bg-slate-950 md:p-8">
      <div className="mx-auto max-w-7xl">
        <MainHeader title="Reports" backPath="/" showThemeToggle={false} />
        {!canCompliance && !canHub && !canFeedback ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-6 font-bold text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">You do not have permission to view reports.</div>
        ) : (
          <div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-2 lg:grid-cols-3">
            {canCompliance && (
              <TileButton
                title="Compliance Report"
                description="Compliance by home for CQC and Ofsted: who needs what, qualifications, training hours, monthly trend, and PDF / Excel downloads."
                icon={<AppIcon name="compliance" size="lg" />}
                accent="emerald"
                actionText="Open Report"
                onClick={() => router.push('/reports/compliance')}
              />
            )}
            {canHub && (
              <TileButton
                title="Intelligence Hub"
                description="Attendance, training hours delivered, and hours lost to absences and lateness."
                icon={<AppIcon name="hub" size="lg" />}
                accent="blue"
                actionText="Open Hub"
                onClick={() => router.push('/analytics?from=/reports')}
              />
            )}
            {canFeedback && (
              <TileButton
                title="Feedback Results"
                description="What staff said about their training: scores, comments and response rates by course."
                icon={<AppIcon name="feedback" size="lg" />}
                accent="amber"
                actionText="View Results"
                onClick={() => router.push('/feedback/results')}
              />
            )}
          </div>
        )}
      </div>
    </main>
  );
}
