'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { DEFAULT_REASONS, loadAllReasons, REASON_KIND_LABELS, type AttendanceReason, type ReasonKind } from '@/lib/attendanceReasons';
import UniformButton from './UniformButton';
import Icon from './Icon';

const KINDS: ReasonKind[] = ['late', 'absence'];

/**
 * Admin → Setup → Attendance Reasons: the lateness and absence reasons offered in
 * the booking window and on the Intelligence Hub. Removing a reason hides it from
 * the dropdowns; bookings keep the reason they were saved with.
 */
export default function AttendanceReasonsModal({ onClose }: { onClose: () => void }) {
  const [reasons, setReasons] = useState<AttendanceReason[]>([]);
  const [kind, setKind] = useState<ReasonKind>('late');
  const [loading, setLoading] = useState(false);
  const [notReady, setNotReady] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const [newLabel, setNewLabel] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const theme = localStorage.getItem('theme');
      setIsDark(theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches));
    }
    void fetchReasons();
    const handleThemeChange = (event: Event) => {
      const detail = (event as CustomEvent<{ isDark?: boolean }>).detail;
      if (typeof detail?.isDark === 'boolean') setIsDark(detail.isDark);
    };
    window.addEventListener('themeChange', handleThemeChange);
    return () => window.removeEventListener('themeChange', handleThemeChange);
  }, []);

  async function fetchReasons() {
    try {
      setReasons(await loadAllReasons());
      setNotReady(false);
    } catch {
      setNotReady(true);
    }
  }

  const list = reasons.filter((r) => r.kind === kind).sort((a, b) => a.sort_order - b.sort_order);
  const active = list.filter((r) => r.is_active);
  const hidden = list.filter((r) => !r.is_active);

  async function run(action: () => PromiseLike<{ error: { message: string; code?: string } | null }>, failure: string) {
    setLoading(true);
    try {
      const { error } = await action();
      if (error) throw new Error(error.code === '23505' ? 'That reason is already on the list (it may be hidden – show it again instead).' : error.message);
      await fetchReasons();
      return true;
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : failure);
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function addReason(e: React.FormEvent) {
    e.preventDefault();
    const label = newLabel.trim();
    if (!label) return;
    const existing = list.find((r) => r.label.toLowerCase() === label.toLowerCase());
    if (existing) {
      if (existing.is_active) { alert('That reason is already on the list.'); return; }
      if (await run(() => supabase.from('attendance_reasons').update({ is_active: true }).eq('id', existing.id), 'Could not show the reason again')) setNewLabel('');
      return;
    }
    const nextOrder = list.reduce((max, r) => Math.max(max, r.sort_order), 0) + 1;
    if (await run(() => supabase.from('attendance_reasons').insert([{ kind, label, sort_order: nextOrder }]), 'Could not add the reason')) setNewLabel('');
  }

  async function saveEdit(reason: AttendanceReason) {
    const label = editingLabel.trim();
    if (!label) { alert('Enter a name for the reason.'); return; }
    if (label === reason.label) { setEditingId(null); return; }
    if (!confirm(`Rename "${reason.label}" to "${label}"?\n\nBookings already saved as "${reason.label}" keep that wording, so the Intelligence Hub will show them separately. You can change them from the Hub.`)) return;
    if (await run(() => supabase.from('attendance_reasons').update({ label }).eq('id', reason.id), 'Could not rename the reason')) setEditingId(null);
  }

  async function setActive(reason: AttendanceReason, isActive: boolean) {
    if (!isActive && active.length <= 1) { alert('Keep at least one reason on the list.'); return; }
    if (!isActive && !confirm(`Remove "${reason.label}" from the dropdowns?\n\nBookings already saved with it keep it, and past figures don't change. You can show it again later.`)) return;
    await run(() => supabase.from('attendance_reasons').update({ is_active: isActive }).eq('id', reason.id), 'Could not update the reason');
  }

  async function move(reason: AttendanceReason, direction: -1 | 1) {
    const idx = active.findIndex((r) => r.id === reason.id);
    const other = active[idx + direction];
    if (!other) return;
    await run(async () => {
      const first = await supabase.from('attendance_reasons').update({ sort_order: other.sort_order }).eq('id', reason.id);
      if (first.error) return first;
      return supabase.from('attendance_reasons').update({ sort_order: reason.sort_order }).eq('id', other.id);
    }, 'Could not reorder');
  }

  const text = isDark ? '#f1f5f9' : '#1e293b';
  const muted = isDark ? '#94a3b8' : '#64748b';
  const panel = { backgroundColor: isDark ? '#0f172a' : '#f1f5f9', borderColor: isDark ? '#334155' : '#e2e8f0' };
  const field = { backgroundColor: isDark ? '#1e293b' : '#ffffff', color: text, borderColor: isDark ? '#334155' : '#cbd5e1' };
  const secondary = { backgroundColor: isDark ? '#334155' : '#cbd5e1', color: text };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
      <div
        style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', borderColor: isDark ? '#334155' : '#cbd5e1' }}
        className="rounded-3xl p-4 sm:p-8 w-full max-w-2xl shadow-2xl border max-h-[90vh] overflow-y-auto"
      >
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 style={{ color: text }} className="text-2xl font-black uppercase tracking-tight">Attendance Reasons</h2>
            <p style={{ color: muted }} className="text-sm mt-1">The choices in the booking window and on the Intelligence Hub.</p>
          </div>
          <UniformButton variant="icon" className="hover:text-red-500 text-2xl" style={{ color: muted }} onClick={onClose} aria-label="Close">
            <Icon name="close" className="w-6 h-6" />
          </UniformButton>
        </div>

        {notReady ? (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 p-4 text-sm text-amber-800 dark:text-amber-200">
            <p className="font-bold">The database update hasn&rsquo;t been run yet.</p>
            <p className="mt-1">Run migration 20261125120000_attendance_reasons.sql in the Supabase SQL Editor. Until then the built-in lists are used: lateness – {DEFAULT_REASONS.late.join(', ')}; absence – {DEFAULT_REASONS.absence.join(', ')}.</p>
          </div>
        ) : (
          <>
            <div className="flex gap-2 mb-5" role="tablist">
              {KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={kind === k}
                  onClick={() => { setKind(k); setEditingId(null); }}
                  className="px-4 py-2 rounded-xl text-xs font-black uppercase"
                  style={kind === k ? { backgroundColor: k === 'late' ? '#f59e0b' : '#ef4444', color: '#fff' } : secondary}
                >
                  {REASON_KIND_LABELS[k]}
                </button>
              ))}
            </div>

            <form onSubmit={addReason} style={panel} className="p-4 rounded-2xl border mb-5 flex flex-col sm:flex-row gap-3">
              <label className="sr-only" htmlFor="new-reason">New reason</label>
              <input
                id="new-reason"
                type="text"
                maxLength={100}
                placeholder={kind === 'late' ? 'e.g. Car trouble' : 'e.g. Bereavement'}
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                style={field}
                className="flex-1 p-3 border rounded-xl outline-none font-bold text-sm"
              />
              <UniformButton variant="primary" type="submit" disabled={loading || !newLabel.trim()} className="px-5 py-3 rounded-xl font-bold" style={{ backgroundColor: '#2563eb', color: '#fff' }}>
                Add
              </UniformButton>
            </form>

            <div className="space-y-2">
              {active.map((reason, idx) => (
                <div key={reason.id} style={panel} className="p-3 border rounded-xl flex items-center gap-3">
                  <div className="flex flex-col">
                    <button type="button" disabled={loading || idx === 0} onClick={() => void move(reason, -1)} className="text-xs font-black disabled:opacity-30" style={{ color: muted }} aria-label={`Move ${reason.label} up`}>↑</button>
                    <button type="button" disabled={loading || idx === active.length - 1} onClick={() => void move(reason, 1)} className="text-xs font-black disabled:opacity-30" style={{ color: muted }} aria-label={`Move ${reason.label} down`}>↓</button>
                  </div>
                  <div className="flex-1 min-w-0">
                    {editingId === reason.id ? (
                      <input aria-label="Reason name" value={editingLabel} maxLength={100} onChange={(e) => setEditingLabel(e.target.value)} style={field} className="w-full p-2 border rounded-lg outline-none font-bold text-sm" />
                    ) : (
                      <p style={{ color: text }} className="font-bold truncate">{reason.label}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {editingId === reason.id ? (
                      <>
                        <UniformButton variant="primary" size="sm" disabled={loading} onClick={() => void saveEdit(reason)} style={{ backgroundColor: '#2563eb', color: '#fff' }}>Save</UniformButton>
                        <UniformButton variant="secondary" size="sm" disabled={loading} onClick={() => setEditingId(null)} style={secondary}>Cancel</UniformButton>
                      </>
                    ) : (
                      <>
                        <UniformButton variant="secondary" size="sm" disabled={loading} onClick={() => { setEditingId(reason.id); setEditingLabel(reason.label); }} style={secondary}>Rename</UniformButton>
                        <UniformButton variant="danger" size="sm" disabled={loading} onClick={() => void setActive(reason, false)}>Remove</UniformButton>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {hidden.length > 0 && (
              <div className="mt-6">
                <p style={{ color: muted }} className="text-[10px] font-black uppercase tracking-widest mb-2">Removed (kept on past bookings)</p>
                <div className="space-y-2">
                  {hidden.map((reason) => (
                    <div key={reason.id} style={panel} className="p-3 border rounded-xl flex items-center gap-3 opacity-75">
                      <p style={{ color: text }} className="flex-1 font-bold truncate">{reason.label}</p>
                      <UniformButton variant="secondary" size="sm" disabled={loading} onClick={() => void setActive(reason, true)} style={secondary}>Show again</UniformButton>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p style={{ color: muted }} className="text-[11px] mt-6">
              &ldquo;Not specified&rdquo; is always available and isn&rsquo;t on this list. Sign In App and the kiosk record lateness as &ldquo;Not specified&rdquo; until someone picks a reason.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
