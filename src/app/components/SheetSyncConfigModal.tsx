'use client';

import { useEffect, useState } from 'react';

type ConfigRow = {
  id: string;
  location_id: string;
  source_sheet_id: string;
  source_tab_name: string;
  source_range: string;
  primary_key: string;
  include_columns: string[];
  sync_enabled: boolean;
  allow_new_rows: boolean;
  manual_only: boolean;
  sync_active_column: string | null;
  last_updated_column: string | null;
  last_synced_at: string | null;
};

export default function SheetSyncConfigModal({ locationId, onClose }: { locationId: string; onClose: () => void }) {
  const [config, setConfig] = useState<ConfigRow | null>(null);
  const [sheetId, setSheetId] = useState('');
  const [tabName, setTabName] = useState('APP_SYNC');
  const [range, setRange] = useState('A1:Z500');
  const [primaryKey, setPrimaryKey] = useState('email');
  const [includeColumns, setIncludeColumns] = useState('email,staff_name,location,training_status,expiry_date,sync_active');
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [allowNewRows, setAllowNewRows] = useState(false);
  const [manualOnly, setManualOnly] = useState(true);
  const [syncActiveColumn, setSyncActiveColumn] = useState('sync_active');
  const [lastUpdatedColumn, setLastUpdatedColumn] = useState('last_updated');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/sheet-sync?locationId=${locationId}`);
        const body = await res.json();
        const match = Array.isArray(body?.configs) ? body.configs.find((c: ConfigRow) => c.location_id === locationId) : null;
        if (!match) return;
        setConfig(match);
        setSheetId(match.source_sheet_id || '');
        setTabName(match.source_tab_name || 'APP_SYNC');
        setRange(match.source_range || 'A1:Z500');
        setPrimaryKey(match.primary_key || 'email');
        setIncludeColumns((match.include_columns || []).join(','));
        setSyncEnabled(match.sync_enabled ?? true);
        setAllowNewRows(match.allow_new_rows ?? false);
        setManualOnly(match.manual_only ?? true);
        setSyncActiveColumn(match.sync_active_column || 'sync_active');
        setLastUpdatedColumn(match.last_updated_column || 'last_updated');
      } catch {
        // ignore for now
      }
    };
    load();
  }, [locationId]);

  const save = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const form = new FormData();
      form.set('locationId', locationId);
      form.set('sourceSheetId', sheetId);
      form.set('sourceTabName', tabName);
      form.set('sourceRange', range);
      form.set('primaryKey', primaryKey);
      form.set('syncEnabled', String(syncEnabled));
      form.set('allowNewRows', String(allowNewRows));
      form.set('manualOnly', String(manualOnly));
      form.set('syncActiveColumn', syncActiveColumn);
      form.set('lastUpdatedColumn', lastUpdatedColumn);
      form.set('includeColumns', JSON.stringify(includeColumns.split(',').map((v) => v.trim()).filter(Boolean)));

      const res = await fetch('/api/sheet-sync', { method: 'POST', body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Failed to save sync config');
      setMessage('Sheet sync configuration saved.');
      const saved = body?.config as ConfigRow | undefined;
      if (saved) setConfig(saved);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to save sync config');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Link Google Sheet</h3>
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-300">Close</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Google Sheet ID</label>
            <input
              value={sheetId}
              onChange={(e) => setSheetId(e.target.value)}
              className="w-full rounded border px-3 py-2 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              placeholder="e.g. 1AbC123xyz"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Tab name</label>
              <input value={tabName} onChange={(e) => setTabName(e.target.value)} className="w-full rounded border px-3 py-2 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Range</label>
              <input value={range} onChange={(e) => setRange(e.target.value)} className="w-full rounded border px-3 py-2 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Primary key</label>
              <input value={primaryKey} onChange={(e) => setPrimaryKey(e.target.value)} className="w-full rounded border px-3 py-2 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Allowed columns</label>
              <input value={includeColumns} onChange={(e) => setIncludeColumns(e.target.value)} className="w-full rounded border px-3 py-2 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={syncEnabled} onChange={(e) => setSyncEnabled(e.target.checked)} />
              Sync enabled
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={allowNewRows} onChange={(e) => setAllowNewRows(e.target.checked)} />
              Allow new rows during sync
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={manualOnly} onChange={(e) => setManualOnly(e.target.checked)} />
              Manual sync only
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Sync active column</label>
              <input value={syncActiveColumn} onChange={(e) => setSyncActiveColumn(e.target.value)} className="w-full rounded border px-3 py-2 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white" placeholder="sync_active" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Last updated column</label>
              <input value={lastUpdatedColumn} onChange={(e) => setLastUpdatedColumn(e.target.value)} className="w-full rounded border px-3 py-2 border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white" placeholder="last_updated" />
            </div>
          </div>

          {message && <div className="text-sm text-gray-700 dark:text-gray-200">{message}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 rounded bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-white">Cancel</button>
            <button onClick={save} disabled={saving} className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-60">
              {saving ? 'Saving...' : 'Save link'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
