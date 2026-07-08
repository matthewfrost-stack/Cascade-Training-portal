'use client';

import { useEffect, useMemo, useState } from 'react';
import AtlasImportModal from '@/app/components/AtlasImportModal';
import UniformButton from '@/app/components/UniformButton';
import { supabase } from '@/lib/supabase';

type LocationRow = { id: string; name: string };

export default function MatrixSyncModal({ onClose }: { onClose: () => void }) {
  const [isDark, setIsDark] = useState(true);
  const [mode, setMode] = useState<'atlas' | 'full'>('atlas');
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [locationId, setLocationId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    const loadLocations = async () => {
      try {
        // Keep locations consistent with the Training Matrix page.
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) throw new Error('No session token available');

        const res = await fetch('/api/locations/user-locations', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await res.json().catch(() => ({}));
        const list = Array.isArray(body?.locations) ? body.locations : [];
        const mapped = Array.from(
          new Map<string, LocationRow>(
            list
              .map((l: any) => ({ id: String(l.id || ''), name: String(l.name || '') }))
              .filter((l: any) => l.id && l.name)
              .map((l: LocationRow) => [l.id, l])
          ).values()
        ).sort((a, b) => a.name.localeCompare(b.name));
        setLocations(mapped);
        if (!locationId && mapped[0]?.id) setLocationId(mapped[0].id);
      } catch {
        // fallback: direct query for admins
        const { data } = await supabase.from('locations').select('id, name').order('name', { ascending: true });
        const mapped = (data || [])
          .map((l: any) => ({ id: String(l.id || ''), name: String(l.name || '') }))
          .filter((l: any) => l.id && l.name);
        setLocations(mapped);
        if (!locationId && mapped[0]?.id) setLocationId(mapped[0].id);
      }
    };
    loadLocations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canRunFull = useMemo(() => mode === 'full', [mode]);

  const handleImport = async () => {
    await runImport(false);
  };

  const runImport = async (allowNewStaff: boolean) => {
    if (!file) return;
    if (!locationId) return;

    setImporting(true);
    setError(null);
    setResult(null);

    try {
      const form = new FormData();
      form.set('locationId', locationId);
      form.set('file', file);
      form.set('replaceMissing', 'true');
      form.set('allowNewStaff', String(allowNewStaff));

      const res = await fetch('/api/training-matrix/import-csv', { method: 'POST', body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Import failed');
      setResult(body);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className={`w-full max-w-3xl rounded-lg p-6 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
      <div className="flex justify-between items-center mb-4">
        <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Matrix Sync</h3>
        <button
          onClick={onClose}
          className={`px-3 py-1 rounded ${isDark ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-900'}`}
        >
          Close
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => {
            setMode('atlas');
            setError(null);
            setResult(null);
          }}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            mode === 'atlas'
              ? isDark
                ? 'bg-emerald-700 text-white'
                : 'bg-emerald-600 text-white'
              : isDark
                ? 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                : 'bg-gray-200 text-gray-900 hover:bg-gray-300'
          }`}
        >
          Atlas
        </button>
        <button
          onClick={() => {
            setMode('full');
            setError(null);
            setResult(null);
          }}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            mode === 'full'
              ? isDark
                ? 'bg-blue-700 text-white'
                : 'bg-blue-600 text-white'
              : isDark
                ? 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                : 'bg-gray-200 text-gray-900 hover:bg-gray-300'
          }`}
        >
          Full Matrix (CSV)
        </button>
      </div>

      {mode === 'atlas' && (
        <div className="rounded-lg">
          <AtlasImportModal onClose={onClose} />
        </div>
      )}

      {mode === 'full' && (
        <div>
          <p className={`mb-4 text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
            Select a location and upload the latest matrix CSV for that site. The sync now updates matched records and also creates missing staff, courses, and location links where possible.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className={`block text-xs font-semibold mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Location</label>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className={`w-full px-3 py-2 rounded border text-sm ${
                  isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                }`}
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={`block text-xs font-semibold mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>CSV File</label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className={`block w-full text-sm ${isDark ? 'text-gray-200' : 'text-gray-800'}`}
              />
              {file && (
                <p className={`mt-1 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Selected: {file.name}</p>
              )}
            </div>
          </div>

          {error && (
            <div className={`rounded-lg border p-3 text-sm mb-4 ${isDark ? 'border-red-900/40 bg-red-950/30 text-red-200' : 'border-red-200 bg-red-50 text-red-700'}`}>
              {error}
            </div>
          )}

          {result?.summary && (
            <div className={`rounded-lg border p-3 text-sm mb-4 ${isDark ? 'border-emerald-900/40 bg-emerald-950/20 text-emerald-200' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
              <div className="font-semibold mb-1">{result.success ? '✅ Sync complete' : '⚠️ Sync completed with errors'}</div>
              <div>
                Upserts: <strong>{result.summary.upserts}</strong> · Processed cells: <strong>{result.summary.processedCells}</strong> · Created profiles: <strong>{result.summary.createdProfiles || 0}</strong> · Created courses: <strong>{result.summary.createdCourses || 0}</strong>
                {' '}· Linked staff: <strong>{result.summary.linkedStaffLocations || 0}</strong> · Linked courses: <strong>{result.summary.linkedCourses || 0}</strong>
                {' '}· Unknown staff: <strong>{result.summary.skippedUnknownStaff}</strong> · Unknown courses: <strong>{result.summary.skippedUnknownCourses}</strong>
              </div>
              {result.requiresStaffApproval && Array.isArray(result.unknownStaff) && result.unknownStaff.length > 0 && (
                <div className={`mt-3 rounded-lg border p-3 ${isDark ? 'border-amber-900/40 bg-amber-950/20 text-amber-100' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                  <div className="font-semibold">Staff approval required</div>
                  <div className="mt-1 text-sm">
                    These new staff names were found in the CSV and were not created yet:
                  </div>
                  <div className="mt-2 text-xs opacity-90">{result.unknownStaff.slice(0, 10).join(' · ')}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <UniformButton
                      variant="primary"
                      className="no-ui-motion shadow-md"
                      onClick={() => runImport(true)}
                      disabled={importing}
                    >
                      Approve & Add New Staff
                    </UniformButton>
                    <UniformButton
                      variant="secondary"
                      className="no-ui-motion border shadow-sm"
                      onClick={() => {
                        setResult(null);
                      }}
                      disabled={importing}
                    >
                      Leave Pending
                    </UniformButton>
                  </div>
                </div>
              )}
              <div className="mt-2 space-y-2">
                {Array.isArray(result.errors) && result.errors.length > 0 && (
                  <div>
                    <div className="font-semibold">Errors</div>
                    <ul className="list-disc pl-5">
                      {result.errors.slice(0, 3).map((e: string, idx: number) => (
                        <li key={idx}>{e}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {Array.isArray(result.unknownCourses) && result.unknownCourses.length > 0 && (
                  <div>
                    <div className="font-semibold">Unknown course columns (sample)</div>
                    <div className="text-xs opacity-90">{result.unknownCourses.slice(0, 8).join(' · ')}</div>
                  </div>
                )}
                {Array.isArray(result.unknownStaff) && result.unknownStaff.length > 0 && (
                  <div>
                    <div className="font-semibold">Unknown staff names (sample)</div>
                    <div className="text-xs opacity-90">{result.unknownStaff.slice(0, 8).join(' · ')}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <UniformButton
              variant="secondary"
              className="no-ui-motion border shadow-sm"
              onClick={() => {
                setFile(null);
                setError(null);
                setResult(null);
              }}
              disabled={importing}
            >
              Clear
            </UniformButton>
            <UniformButton
              variant="primary"
              className="no-ui-motion shadow-md"
              onClick={handleImport}
              disabled={!canRunFull || !file || !locationId || importing}
            >
              {importing ? 'Syncing…' : 'Run Sync'}
            </UniformButton>
          </div>
        </div>
      )}
    </div>
  );
}
