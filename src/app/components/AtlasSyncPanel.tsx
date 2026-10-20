'use client';

import { useState } from 'react';
import UniformButton from '@/app/components/UniformButton';

type SyncSummary = {
  fetched: number;
  completed: number;
  updated: number;
  created: number;
  unchanged: number;
  skippedStaff: number;
  skippedCourses: number;
  skippedRecords: number;
  ambiguousStaff: number;
  ambiguousCourses: number;
  errors: number;
  dryRun: boolean;
  skipped: Array<{ reason: string; staff?: string; course?: string }>;
};

type SyncResponse = {
  success?: boolean;
  error?: string;
  summary?: SyncSummary;
};

export default function AtlasSyncPanel({ isDark }: { isDark: boolean }) {
  const [syncing, setSyncing] = useState(false);
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const syncFromAtlas = async () => {
    if (!window.confirm('Sync completed courses from Atlas now? Existing records will be updated and missing assigned location rows will be created.')) return;

    setSyncing(true);
    setError(null);
    setSummary(null);

    try {
      const response = await fetch('/api/atlas/sync', { method: 'POST' });
      const body = await response.json().catch(() => ({})) as SyncResponse;
      if (!response.ok || !body.success || !body.summary) {
        throw new Error(body.error || 'Atlas sync failed');
      }
      setSummary(body.summary);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'Atlas sync failed');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className={`rounded-lg border p-5 ${isDark ? 'border-gray-700 bg-gray-900/40' : 'border-gray-200 bg-gray-50'}`}>
      <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
        Sync completed courses from Atlas
      </h2>
      <p className={`mt-2 text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
        This reads the latest passed courses from Atlas, updates matching records across every matrix location, and creates missing rows where the staff member and course are assigned to the same location.
      </p>

      {error && (
        <div className={`mt-4 rounded-lg border p-3 text-sm ${isDark ? 'border-red-900/40 bg-red-950/30 text-red-200' : 'border-red-200 bg-red-50 text-red-700'}`}>
          {error}
        </div>
      )}

      {summary && (
        <div className={`mt-4 rounded-lg border p-3 text-sm ${isDark ? 'border-emerald-900/40 bg-emerald-950/20 text-emerald-200' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
          <div className="font-semibold">✅ Atlas sync complete</div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div>Fetched: <strong>{summary.fetched}</strong></div>
            <div>Passed: <strong>{summary.completed}</strong></div>
            <div>Updated: <strong>{summary.updated}</strong></div>
            <div>Created: <strong>{summary.created}</strong></div>
            <div>Unchanged: <strong>{summary.unchanged}</strong></div>
            <div>Staff not found: <strong>{summary.skippedStaff}</strong></div>
            <div>Courses not found: <strong>{summary.skippedCourses}</strong></div>
            <div>Ambiguous matches: <strong>{summary.ambiguousStaff + summary.ambiguousCourses}</strong></div>
            <div>Skipped records: <strong>{summary.skippedRecords}</strong></div>
            <div>Errors: <strong>{summary.errors}</strong></div>
          </div>
          {summary.skipped.length > 0 && (
            <div className="mt-3 text-xs opacity-90">
              Skipped examples: {summary.skipped.slice(0, 5).map((item) => `${item.staff || 'Unknown staff'} / ${item.course || 'Unknown course'} (${item.reason})`).join(' · ')}
            </div>
          )}
        </div>
      )}

      <div className="mt-5 flex justify-end">
        <UniformButton
          variant="primary"
          className="no-ui-motion shadow-md"
          onClick={() => void syncFromAtlas()}
          disabled={syncing}
        >
          {syncing ? 'Syncing Atlas…' : 'Sync from Atlas'}
        </UniformButton>
      </div>
    </div>
  );
}
