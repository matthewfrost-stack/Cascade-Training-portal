'use client';

import { useState } from 'react';

type Change = { from: string | null; to: string | null };

type HistoryEntry = {
  id: string;
  changedAt: string;
  action: 'created' | 'updated' | 'removed';
  source: string;
  by: string | null;
  completion: Change;
  expiry: Change;
  status: Change;
  movedFrom: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  completed: 'Completed',
  allocated: 'Allocated',
  booked: 'Allocated',
  awaiting: 'Allocated',
  not_yet_due: 'Not yet due',
  na: 'N/A',
};

const statusLabel = (status: string | null) => (status ? STATUS_LABELS[status] || status : 'Blank');

const day = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { timeZone: 'UTC' });
};

const when = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** "by Jane Smith", "Atlas sync", "CSV upload by Jane Smith", … */
function describeWho(entry: HistoryEntry): string {
  const by = entry.by ? ` by ${entry.by}` : '';
  switch (entry.source) {
    case 'manual': return entry.by ? entry.by : 'Matrix edit';
    case 'atlas_sync': return entry.by ? `Atlas sync (run by ${entry.by})` : 'Atlas sync';
    case 'atlas_import': return `Atlas import${by}`;
    case 'csv_import': return `CSV upload${by}`;
    case 'bulk_edit': return `Bulk edit${by}`;
    case 'new_starter': return `New starter set-up${by}`;
    case 'restored': return `Restored from archive${by}`;
    case 'removed_from_home': return `Removed from home${by}`;
    case 'course_removed': return `Course removed from home${by}`;
    default: return entry.by ? entry.by : 'System';
  }
}

/** One line describing what changed. */
function describeChange(entry: HistoryEntry): string {
  if (entry.action === 'created') {
    const parts = [`Added as ${statusLabel(entry.status.to)}`];
    if (entry.completion.to) parts.push(`completed ${day(entry.completion.to)}`);
    if (entry.expiry.to) parts.push(`expires ${day(entry.expiry.to)}`);
    return parts.join(' · ');
  }
  if (entry.action === 'removed') {
    const was = [statusLabel(entry.status.from)];
    if (entry.completion.from) was.push(`completed ${day(entry.completion.from)}`);
    return `Record removed (was ${was.join(', ')})`;
  }
  const parts: string[] = [];
  if (entry.status.from !== entry.status.to && statusLabel(entry.status.from) !== statusLabel(entry.status.to)) {
    parts.push(`${statusLabel(entry.status.from)} → ${statusLabel(entry.status.to)}`);
  }
  if (entry.completion.from !== entry.completion.to) {
    parts.push(entry.completion.from ? `Completed ${day(entry.completion.from)} → ${day(entry.completion.to)}` : `Completed ${day(entry.completion.to)}`);
  }
  if (entry.expiry.from !== entry.expiry.to) {
    parts.push(entry.expiry.from ? `Expiry ${day(entry.expiry.from)} → ${day(entry.expiry.to)}` : `Expires ${day(entry.expiry.to)}`);
  }
  if (entry.movedFrom) parts.push(`Moved from ${entry.movedFrom}`);
  return parts.length ? parts.join(' · ') : 'Updated';
}

export function MatrixCellHistory({ staffId, courseId, locationId, isDark }: { staffId: string; courseId: string; locationId: string; isDark: boolean }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (!next || entries) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ staffId, courseId, locationId });
      const response = await fetch(`/api/training-matrix/history?${qs.toString()}`);
      const body = (await response.json().catch(() => ({}))) as { entries?: HistoryEntry[]; error?: string };
      if (!response.ok) throw new Error(body.error || 'Could not load history.');
      setEntries(body.entries || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load history.');
    } finally {
      setLoading(false);
    }
  };

  const muted = isDark ? 'text-gray-400' : 'text-slate-500';

  return (
    <div className={`mt-4 pt-3 border-t ${isDark ? 'border-gray-800' : 'border-slate-200'}`}>
      <button
        type="button"
        onClick={() => void toggle()}
        aria-expanded={open}
        className={`text-xs font-bold ${isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'}`}
      >
        🕘 {open ? 'Hide history' : 'History'}
      </button>

      {open && (
        <div className="mt-2 max-h-48 overflow-y-auto pr-1">
          {loading && <p className={`text-xs ${muted}`}>Loading…</p>}
          {error && <p className="text-xs text-red-500">{error}</p>}
          {entries && entries.length === 0 && (
            <p className={`text-xs ${muted}`}>No changes recorded yet. History is kept from 17 Nov 2026 onwards.</p>
          )}
          {entries && entries.length > 0 && (
            <ul className="space-y-2">
              {entries.map((entry) => (
                <li key={entry.id} className="text-xs leading-snug">
                  <span className={`font-bold ${isDark ? 'text-gray-200' : 'text-slate-800'}`}>{when(entry.changedAt)}</span>
                  <span className={muted}> · </span>
                  <span className={isDark ? 'text-gray-300' : 'text-slate-700'}>{describeChange(entry)}</span>
                  <span className={`block italic ${muted}`}>{describeWho(entry)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
