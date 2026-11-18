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
    case 'history_restore': return `Changed back from history${by}`;
    case 'qualification_tracker': return `Qualification tracker${by}`;
    default: return entry.by ? entry.by : 'System';
  }
}

/** What the record looked like, e.g. "Completed 05/01/2026 · expires 05/01/2027". */
function describeState(status: string | null, completion: string | null, expiry: string | null): string {
  const parts = [statusLabel(status)];
  if (completion) parts.push(`completed ${day(completion)}`);
  if (expiry) parts.push(`expires ${day(expiry)}`);
  return parts.join(' · ');
}

/** From / To lines for one entry (null when there's no "from"). */
function describeFromTo(entry: HistoryEntry): { from: string | null; to: string | null; note: string | null } {
  if (entry.action === 'created') {
    return { from: null, to: describeState(entry.status.to, entry.completion.to, entry.expiry.to), note: 'Record added' };
  }
  if (entry.action === 'removed') {
    return { from: describeState(entry.status.from, entry.completion.from, entry.expiry.from), to: null, note: 'Record removed' };
  }
  const valuesChanged =
    entry.status.from !== entry.status.to || entry.completion.from !== entry.completion.to || entry.expiry.from !== entry.expiry.to;
  if (!valuesChanged) return { from: null, to: null, note: entry.movedFrom ? `Moved from ${entry.movedFrom}` : 'Updated' };
  return {
    from: describeState(entry.status.from, entry.completion.from, entry.expiry.from),
    to: describeState(entry.status.to, entry.completion.to, entry.expiry.to),
    note: entry.movedFrom ? `Moved from ${entry.movedFrom}` : null,
  };
}

const canChangeBack = (entry: HistoryEntry) =>
  entry.action === 'removed'
  || (entry.action === 'updated'
    && (entry.status.from !== entry.status.to || entry.completion.from !== entry.completion.to || entry.expiry.from !== entry.expiry.to));

export function MatrixCellHistory({
  staffId,
  courseId,
  locationId,
  isDark,
  canEdit = false,
  onRestored,
}: {
  staffId: string;
  courseId: string;
  locationId: string;
  isDark: boolean;
  canEdit?: boolean;
  /** Called after a successful "change back" so the matrix can refresh. */
  onRestored?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = async () => {
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

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !entries) await load();
  };

  const changeBack = async (entry: HistoryEntry) => {
    const target = describeState(entry.status.from, entry.completion.from, entry.expiry.from);
    if (!window.confirm(`Change this record back to:\n\n${target}\n\nThe change back will also be recorded in the history.`)) return;
    setRestoringId(entry.id);
    setError(null);
    try {
      const response = await fetch('/api/training-matrix/history/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ historyId: entry.id }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Could not change it back.');
      onRestored?.();
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : 'Could not change it back.');
    } finally {
      setRestoringId(null);
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
        <div className="mt-2 max-h-64 overflow-y-auto pr-1">
          {loading && <p className={`text-xs ${muted}`}>Loading…</p>}
          {error && <p className="text-xs text-red-500">{error}</p>}
          {entries && entries.length === 0 && (
            <p className={`text-xs ${muted}`}>No changes recorded yet. History is kept from 17 Nov 2026 onwards.</p>
          )}
          {entries && entries.length > 0 && (
            <ul className="space-y-2">
              {entries.map((entry) => {
                const { from, to, note } = describeFromTo(entry);
                return (
                  <li key={entry.id} className={`text-xs leading-snug rounded-lg p-2 ${isDark ? 'bg-gray-800/60' : 'bg-slate-50'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className={`font-bold ${isDark ? 'text-gray-200' : 'text-slate-800'}`}>{when(entry.changedAt)}</span>
                        <span className={`italic ${muted}`}> · {describeWho(entry)}</span>
                      </div>
                      {canEdit && canChangeBack(entry) && (
                        <button
                          type="button"
                          onClick={() => void changeBack(entry)}
                          disabled={restoringId !== null}
                          className={`shrink-0 px-2 py-0.5 rounded-md font-bold transition-colors disabled:opacity-50 ${isDark ? 'bg-gray-700 text-gray-100 hover:bg-gray-600' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'}`}
                          title="Put this record back to how it was before this change"
                        >
                          {restoringId === entry.id ? 'Changing…' : '↩ Change back'}
                        </button>
                      )}
                    </div>
                    {note && <div className={`mt-0.5 ${muted}`}>{note}</div>}
                    {from && (
                      <div className="mt-0.5">
                        <span className={`font-bold ${muted}`}>From: </span>
                        <span className={isDark ? 'text-red-300' : 'text-red-700'}>{from}</span>
                      </div>
                    )}
                    {to && (
                      <div>
                        <span className={`font-bold ${muted}`}>To: </span>
                        <span className={isDark ? 'text-green-300' : 'text-green-700'}>{to}</span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
