'use client';

import { useEffect, useMemo, useState } from 'react';
import Icon from './Icon';
import UniformButton from './UniformButton';

type HoursItem = {
  key: string;
  name: string;
  category: string;
  hours: number | null;
  courseIds: string[];
  homeCount: number;
};

function parseHours(value: string): number | null | 'invalid' {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0 || n > 1000) return 'invalid';
  return Math.round(n * 100) / 100;
}

export default function TrainingHoursModal({ onClose }: { onClose: () => void }) {
  const [isDark, setIsDark] = useState(true);
  const [items, setItems] = useState<HoursItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    try {
      const theme = localStorage.getItem('theme');
      setIsDark(theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches));
    } catch {
      // keep default
    }
    const handleThemeChange = (event: Event) => {
      const detail = (event as CustomEvent<{ isDark?: boolean }>).detail;
      if (typeof detail?.isDark === 'boolean') setIsDark(detail.isDark);
    };
    window.addEventListener('themeChange', handleThemeChange);
    return () => window.removeEventListener('themeChange', handleThemeChange);
  }, []);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/training-courses/hours');
      const body = (await response.json().catch(() => ({}))) as { items?: HoursItem[]; error?: string };
      if (!response.ok) throw new Error(body.error || 'Could not load courses.');
      setItems(body.items || []);
      setDrafts({});
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load courses.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  // Changed rows only, compared with what's saved.
  const changes = useMemo(() => {
    const list: Array<{ item: HoursItem; hours: number | null | 'invalid' }> = [];
    for (const item of items) {
      if (!(item.key in drafts)) continue;
      const parsed = parseHours(drafts[item.key]);
      if (parsed !== item.hours) list.push({ item, hours: parsed });
    }
    return list;
  }, [items, drafts]);
  const invalidCount = changes.filter((c) => c.hours === 'invalid').length;

  const valueFor = (item: HoursItem) => (item.key in drafts ? drafts[item.key] : item.hours === null ? '' : String(item.hours));

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      if (term && !item.name.toLowerCase().includes(term) && !item.category.toLowerCase().includes(term)) return false;
      if (onlyMissing && item.hours !== null) return false;
      return true;
    });
  }, [items, search, onlyMissing]);

  const byCategory = useMemo(() => {
    const groups = new Map<string, HoursItem[]>();
    for (const item of filtered) {
      const list = groups.get(item.category) || [];
      list.push(item);
      groups.set(item.category, list);
    }
    return Array.from(groups.entries());
  }, [filtered]);

  const withHours = items.filter((item) => item.hours !== null).length;

  const save = async () => {
    if (changes.length === 0 || invalidCount > 0) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/training-courses/hours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: changes.map((c) => ({ courseIds: c.item.courseIds, hours: c.hours })) }),
      });
      const body = (await response.json().catch(() => ({}))) as { saved?: number; error?: string };
      if (!response.ok) throw new Error(body.error || 'Could not save.');
      setNotice(`Saved hours for ${body.saved} course${body.saved === 1 ? '' : 's'}.`);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    if (changes.length > 0 && !window.confirm('You have unsaved changes. Close without saving?')) return;
    onClose();
  };

  const muted = isDark ? '#94a3b8' : '#64748b';
  const strong = isDark ? '#f1f5f9' : '#1e293b';
  const inputStyle = { backgroundColor: isDark ? '#0f172a' : '#f1f5f9', color: strong, borderColor: isDark ? '#334155' : '#cbd5e1' };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true" aria-labelledby="training-hours-title">
      <div style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', borderColor: isDark ? '#334155' : '#cbd5e1' }} className="rounded-3xl p-6 sm:p-8 w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl border">
        <div className="flex justify-between items-start gap-4">
          <div>
            <h2 id="training-hours-title" style={{ color: strong }} className="text-2xl font-black uppercase tracking-tight">Training Hours</h2>
            <p style={{ color: muted }} className="text-sm mt-1">
              How long each course on the training matrix takes. Used in the compliance report to show hours completed and outstanding. Setting a course here also sets its Careskills copy.
            </p>
          </div>
          <button onClick={close} style={{ color: muted }} className="hover:text-red-500 transition-colors" aria-label="Close">
            <Icon name="close" className="w-6 h-6" />
          </button>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row gap-3 sm:items-center">
          <input
            type="search"
            placeholder="Search courses or categories…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={inputStyle}
            className="flex-1 p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
          <label className="flex items-center gap-2 text-sm font-bold shrink-0" style={{ color: strong }}>
            <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} className="w-4 h-4 rounded" />
            Only courses without hours
          </label>
        </div>

        {!loading && items.length > 0 && (
          <div className="mt-3">
            <div className="flex justify-between text-xs font-bold" style={{ color: muted }}>
              <span>{withHours} of {items.length} courses have hours</span>
              <span>{Math.round((withHours / items.length) * 100)}%</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: isDark ? '#334155' : '#e2e8f0' }}>
              <div className="h-full bg-blue-500 transition-all" style={{ width: `${(withHours / items.length) * 100}%` }} />
            </div>
          </div>
        )}

        {error && (
          <div className={`mt-3 rounded-lg border p-3 text-sm ${isDark ? 'border-red-900/40 bg-red-950/30 text-red-200' : 'border-red-200 bg-red-50 text-red-700'}`}>{error}</div>
        )}
        {notice && (
          <div className={`mt-3 rounded-lg border p-3 text-sm ${isDark ? 'border-emerald-900/40 bg-emerald-950/20 text-emerald-200' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{notice}</div>
        )}

        <div className="mt-4 flex-1 overflow-y-auto pr-1 custom-scrollbar">
          {loading && <p style={{ color: muted }} className="text-sm text-center py-8">Loading courses…</p>}
          {!loading && filtered.length === 0 && !error && (
            <p style={{ color: muted }} className="text-sm text-center py-8">{items.length === 0 ? 'No courses on any matrix yet.' : 'No courses match.'}</p>
          )}
          {byCategory.map(([category, list]) => (
            <div key={category} className="mb-4">
              <p style={{ color: muted, backgroundColor: isDark ? '#1e293b' : '#ffffff' }} className="text-[10px] font-black uppercase tracking-wider py-2 sticky top-0 z-10">{category}</p>
              <div className="space-y-1.5">
                {list.map((item) => {
                  const value = valueFor(item);
                  const parsed = parseHours(value);
                  const changed = item.key in drafts && parsed !== item.hours;
                  const invalid = parsed === 'invalid';
                  return (
                    <div key={item.key} style={{ backgroundColor: isDark ? '#0f172a' : '#f8fafc', borderColor: invalid ? '#ef4444' : changed ? '#3b82f6' : isDark ? '#334155' : '#e2e8f0' }} className="px-4 py-2.5 border rounded-xl flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p style={{ color: strong }} className="font-bold text-sm truncate">{item.name}</p>
                        <p style={{ color: muted }} className="text-[11px]">On {item.homeCount} home{item.homeCount === 1 ? '' : 's'}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={1000}
                          step={0.25}
                          placeholder="–"
                          aria-label={`Hours for ${item.name}`}
                          value={value}
                          onChange={(e) => setDrafts((prev) => ({ ...prev, [item.key]: e.target.value }))}
                          style={inputStyle}
                          className="w-20 p-2 border rounded-lg text-right text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <span style={{ color: muted }} className="text-xs font-bold w-6">hrs</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <p style={{ color: invalidCount ? '#ef4444' : muted }} className="text-xs">
            {invalidCount > 0
              ? 'Hours must be a number between 0 and 1000 (e.g. 6 or 1.5).'
              : changes.length > 0
                ? `${changes.length} unsaved change${changes.length === 1 ? '' : 's'}`
                : 'Use decimals for part hours, e.g. 1.5 for an hour and a half. Leave blank if unknown.'}
          </p>
          <UniformButton variant="primary" className="shrink-0" onClick={() => void save()} disabled={saving || changes.length === 0 || invalidCount > 0}>
            {saving ? 'Saving…' : changes.length > 0 ? `💾 Save ${changes.length} change${changes.length === 1 ? '' : 's'}` : 'Save'}
          </UniformButton>
        </div>
      </div>
    </div>
  );
}
