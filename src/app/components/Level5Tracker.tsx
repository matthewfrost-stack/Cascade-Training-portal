'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import UniformButton from '@/app/components/UniformButton';
import {
  L5_BAND_LABELS,
  L5_BAND_ORDER,
  L5_ROLE_LABELS,
  L5_STATUS_LABELS,
  l5Band,
  l5Due,
  l5StandardDue,
  l5Summary,
  type L5Band,
  type L5Role,
  type L5Status,
} from '@/lib/level5';
import { daysUntil } from '@/lib/diploma';
import type { L5Candidate, L5Person } from '@/lib/level5Tracker';
import { openCertificate, uploadCertificate } from '@/lib/certificateUpload';

type Loaded = { people: L5Person[]; candidates: L5Candidate[]; homes: { id: string; name: string }[]; today: string };
const Q = 'L5_LEADERSHIP' as const;

const BAND_STYLE: Record<L5Band, string> = {
  overdue: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',
  date_needed: 'bg-slate-500/15 text-slate-700 dark:text-slate-200 border-slate-500/30',
  due_soon: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30',
  not_enrolled: 'bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20',
  on_track: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  done: 'bg-emerald-600/20 text-emerald-800 dark:text-emerald-200 border-emerald-600/40',
  not_required: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
};
const BAND_ICON: Record<L5Band, string> = { overdue: '🔴', date_needed: '❔', due_soon: '🟠', not_enrolled: '⚪', on_track: '🟢', done: '✅', not_required: '–' };

const card = 'rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm';
const input = 'w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500';
const smallLabel = 'block text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1';
const select = 'bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500';

const day = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '–';

function timeLeft(due: string | null, today: string) {
  if (!due) return '';
  const days = daysUntil(due, today);
  const abs = Math.abs(days);
  const months = Math.round(abs / 30.4);
  const span = abs < 14 ? `${abs} day${abs === 1 ? '' : 's'}` : abs < 90 ? `${Math.round(abs / 7)} weeks` : `${months} months`;
  return days < 0 ? `${span} overdue` : days === 0 ? 'due today' : `${span} left`;
}

function Pill({ band }: { band: L5Band }) {
  return <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-md border whitespace-nowrap ${BAND_STYLE[band]}`}>{BAND_ICON[band]} {L5_BAND_LABELS[band]}</span>;
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className={`${card} p-4`}>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`text-3xl font-black mt-1 tabular-nums ${tone || ''}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sub}</p>}
    </div>
  );
}

async function send(method: string, url: string, body?: unknown) {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || 'Something went wrong.');
  return json;
}

// ---------- add person ----------

function AddPanel({ candidates, onAdded, onCancel }: { candidates: L5Candidate[]; onAdded: () => void; onCancel: () => void }) {
  const [search, setSearch] = useState('');
  const [profileId, setProfileId] = useState('');
  const [role, setRole] = useState<L5Role | ''>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? candidates.filter((c) => c.name.toLowerCase().includes(term)).slice(0, 50) : [];
  }, [candidates, search]);
  const chosen = candidates.find((c) => c.profileId === profileId);

  const add = async () => {
    if (!profileId) { setError('Choose a staff member.'); return; }
    if (!role) { setError('Choose their role.'); return; }
    setSaving(true);
    setError('');
    try {
      await send('POST', '/api/level5', { profileId, role });
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add them.');
      setSaving(false);
    }
  };

  return (
    <div className={`${card} p-4 mb-6 space-y-3`}>
      <h3 className="font-black">Add someone to the Level 5 list</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className={smallLabel} htmlFor="l5-add-search">Staff member</label>
          {chosen ? (
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm">{chosen.name}</span>
              <button type="button" className="text-xs font-bold text-blue-600 dark:text-blue-300 hover:underline" onClick={() => { setProfileId(''); setSearch(''); }}>Change</button>
            </div>
          ) : (
            <>
              <input id="l5-add-search" className={input} value={search} placeholder="Type a name…" autoComplete="off" onChange={(e) => setSearch(e.target.value)} />
              {matches.length > 0 && (
                <ul className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700">
                  {matches.map((c) => (
                    <li key={c.profileId}>
                      <button type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700" onClick={() => setProfileId(c.profileId)}>
                        <span className="font-bold">{c.name}</span> <span className="text-xs text-slate-500">{c.homes}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {search.trim() && matches.length === 0 && <p className="text-[11px] text-slate-500 mt-1">Nobody found (people already on the list aren&rsquo;t shown).</p>}
            </>
          )}
        </div>
        <div>
          <label className={smallLabel} htmlFor="l5-add-role">Role</label>
          <select id="l5-add-role" className={input} value={role} onChange={(e) => setRole(e.target.value as L5Role | '')}>
            <option value="">Choose…</option>
            {Object.entries(L5_ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>}
      <div className="flex justify-end gap-2">
        <UniformButton variant="secondary" size="sm" onClick={onCancel} disabled={saving}>Cancel</UniformButton>
        <UniformButton variant="primary" size="sm" onClick={() => void add()} disabled={saving}>{saving ? 'Adding…' : 'Add to list'}</UniformButton>
      </div>
    </div>
  );
}

// ---------- edit panel ----------

type Draft = {
  role: L5Role | ''; status: L5Status; enrolledOn: string; provider: string; completedOn: string;
  equivalent: string; achievedOn: string; extend: boolean; extendedTo: string; extensionReason: string; notes: string;
};
const toDraft = (p: L5Person): Draft => ({
  role: p.role || '', status: p.status, enrolledOn: p.enrolledOn || '', provider: p.provider || '',
  completedOn: p.completedOn || '', equivalent: p.equivalent || '', achievedOn: p.achievedOn || '',
  extend: !!p.extendedTo, extendedTo: p.extendedTo || '', extensionReason: p.extensionReason || '', notes: p.notes || '',
});

function EditPanel({ person, today, onSaved, onRemoved, onCancel }: {
  person: L5Person; today: string; onSaved: (p: L5Person) => void; onRemoved: () => void; onCancel: () => void;
}) {
  const [d, setD] = useState<Draft>(toDraft(person));
  const [certificateName, setCertificateName] = useState(person.certificateName);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const needsEvidence = d.status === 'completed' || d.status === 'equivalent';
  const finished = needsEvidence || d.status === 'not_required';
  const showEnrolment = d.status !== 'not_required';
  const normalDue = l5StandardDue(d.enrolledOn || null);
  const extending = d.extend && !finished && !!d.enrolledOn;
  const extendedTo = extending ? d.extendedTo || null : null;
  const preview = l5Band({ status: d.status, enrolledOn: d.enrolledOn || null, extendedTo }, today);
  const id = (k: string) => `l5-${person.profileId}-${k}`;

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError('');
    try { setCertificateName(await uploadCertificate(person.profileId, Q, file)); }
    catch (e) { setError(e instanceof Error ? e.message : 'The upload failed.'); }
    finally { setUploading(false); }
  };

  const save = async () => {
    if (!d.role) { setError('Choose their role.'); return; }
    if ((d.status === 'enrolled' || d.status === 'in_progress') && !d.enrolledOn) { setError('Enter the date they enrolled – the 2 years start from it.'); return; }
    if (d.status === 'completed' && !d.completedOn) { setError('Enter the date they completed it.'); return; }
    if (d.status === 'equivalent' && (!d.equivalent.trim() || !d.achievedOn)) { setError('Say which equivalent they hold and when they achieved it.'); return; }
    if (needsEvidence && !certificateName) { setError('Upload a copy of the certificate.'); return; }
    if (d.status === 'not_required' && !d.notes.trim()) { setError('Add a note saying why it isn’t required.'); return; }
    if (extending) {
      if (!d.extendedTo || !d.extensionReason.trim()) { setError('An extension needs a new deadline and a reason.'); return; }
      if (normalDue && d.extendedTo <= normalDue) { setError(`The new deadline must be after the normal one (${day(normalDue)}).`); return; }
    }
    setSaving(true);
    setError('');
    try {
      const enrolledOn = showEnrolment ? d.enrolledOn || null : person.enrolledOn;
      const record = {
        ...d, enrolledOn: enrolledOn || '', extendedTo: extendedTo || '', extensionReason: extendedTo ? d.extensionReason : '',
      };
      await send('PUT', '/api/level5', { profileId: person.profileId, record });
      onSaved({
        ...person, role: d.role, status: d.status, enrolledOn, provider: d.provider.trim() || null,
        standardDue: l5StandardDue(enrolledOn), dueDate: l5Due(enrolledOn, extendedTo), extendedTo,
        extensionReason: extendedTo ? d.extensionReason.trim() : null, completedOn: d.completedOn || null,
        equivalent: d.equivalent.trim() || null, achievedOn: d.achievedOn || null, certificateName, notes: d.notes.trim() || null,
        band: l5Band({ status: d.status, enrolledOn, extendedTo }, today),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Take ${person.name} off the Level 5 list? Their Level 5 record${person.certificateName ? ' and certificate' : ''} will be deleted.`)) return;
    setSaving(true);
    setError('');
    try {
      await send('DELETE', `/api/level5?profileId=${person.profileId}`);
      onRemoved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove them.');
      setSaving(false);
    }
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div>
          <label className={smallLabel} htmlFor={id('role')}>Role</label>
          <select id={id('role')} className={input} value={d.role} onChange={(e) => set('role', e.target.value as L5Role | '')}>
            <option value="">Choose…</option>
            {Object.entries(L5_ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className={smallLabel} htmlFor={id('status')}>Status</label>
          <select id={id('status')} className={input} value={d.status} onChange={(e) => set('status', e.target.value as L5Status)}>
            {Object.entries(L5_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {showEnrolment && (
          <>
            <div>
              <label className={smallLabel} htmlFor={id('enrolled')}>Enrolled on</label>
              <input id={id('enrolled')} type="date" className={input} max={today} value={d.enrolledOn} onChange={(e) => set('enrolledOn', e.target.value)} />
              <p className="text-[11px] text-slate-500 mt-1">{normalDue ? `2-year deadline: ${day(normalDue)}.` : 'The 2 years start from this date.'}</p>
            </div>
            <div className="sm:col-span-1 lg:col-span-2">
              <label className={smallLabel} htmlFor={id('provider')}>Training provider</label>
              <input id={id('provider')} className={input} value={d.provider} maxLength={300} onChange={(e) => set('provider', e.target.value)} />
            </div>
          </>
        )}
        {d.status === 'completed' && (
          <div>
            <label className={smallLabel} htmlFor={id('completed')}>Completed on</label>
            <input id={id('completed')} type="date" className={input} max={today} value={d.completedOn} onChange={(e) => set('completedOn', e.target.value)} />
          </div>
        )}
        {d.status === 'equivalent' && (
          <>
            <div className="sm:col-span-2">
              <label className={smallLabel} htmlFor={id('equiv')}>Equivalent held</label>
              <input id={id('equiv')} className={input} value={d.equivalent} maxLength={300} placeholder="e.g. Registered Managers Award (RMA)" onChange={(e) => set('equivalent', e.target.value)} />
            </div>
            <div>
              <label className={smallLabel} htmlFor={id('achieved')}>Achieved on</label>
              <input id={id('achieved')} type="date" className={input} max={today} value={d.achievedOn} onChange={(e) => set('achievedOn', e.target.value)} />
            </div>
          </>
        )}
      </div>

      {(needsEvidence || certificateName) && (
        <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-600 p-3 flex flex-wrap items-center gap-3">
          <span className="text-sm">{certificateName ? <>📄 <strong>{certificateName}</strong></> : <span className="text-amber-700 dark:text-amber-300 font-semibold">Certificate needed to mark them off</span>}</span>
          {certificateName && <UniformButton variant="secondary" size="sm" onClick={() => void openCertificate(person.profileId, Q)}>View</UniformButton>}
          <label className={`text-xs font-bold px-3 py-2 rounded-lg cursor-pointer ${uploading ? 'opacity-50' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
            {uploading ? 'Uploading…' : certificateName ? 'Replace certificate' : 'Upload certificate'}
            <input type="file" accept="application/pdf,image/*" className="sr-only" disabled={uploading} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          <span className="text-[11px] text-slate-500">PDF or photo, up to 10 MB. Kept privately.</span>
        </div>
      )}

      {!finished && d.enrolledOn && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-3">
          <label className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" className="w-4 h-4" checked={d.extend} onChange={(e) => set('extend', e.target.checked)} />
            Extension agreed – they won&rsquo;t finish within 2 years
          </label>
          {d.extend && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={smallLabel} htmlFor={id('extto')}>New deadline</label>
                <input id={id('extto')} type="date" className={input} value={d.extendedTo} min={normalDue || undefined} onChange={(e) => set('extendedTo', e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className={smallLabel} htmlFor={id('extwhy')}>Reason</label>
                <input id={id('extwhy')} className={input} value={d.extensionReason} maxLength={1000} placeholder="e.g. long-term sickness, provider delays" onChange={(e) => set('extensionReason', e.target.value)} />
              </div>
            </div>
          )}
        </div>
      )}

      <div>
        <label className={smallLabel} htmlFor={id('notes')}>Notes</label>
        <textarea id={id('notes')} className={input} rows={2} maxLength={2000} value={d.notes} placeholder={d.status === 'not_required' ? 'Why it isn’t required, e.g. already holds Level 5 in Leadership for Health & Social Care' : ''} onChange={(e) => set('notes', e.target.value)} />
      </div>
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void remove()} disabled={saving} className="px-3 py-2 text-xs font-black uppercase rounded-lg border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">Remove from list</button>
        <span className="text-xs text-slate-500 mr-auto ml-2">Will show as <Pill band={preview} /></span>
        <UniformButton variant="secondary" size="sm" onClick={onCancel} disabled={saving}>Cancel</UniformButton>
        <UniformButton variant="primary" size="sm" onClick={() => void save()} disabled={saving || uploading}>{saving ? 'Saving…' : 'Save'}</UniformButton>
      </div>
    </div>
  );
}

// ---------- Excel ----------

async function downloadExcel(people: L5Person[], today: string) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const bold = { fontWeight: 'bold' as const };
  const head = ['Name', 'Role', 'Home(s)', 'Where they stand', 'Status', 'Enrolled on', 'Provider', '2-year deadline', 'Extended to', 'Extension reason', 'Time left', 'Completed / achieved on', 'Equivalent', 'Certificate on file', 'Notes'];
  const rows = people.map((p) => [
    p.name, p.role ? L5_ROLE_LABELS[p.role] : '', p.homes.map((h) => h.name).join(', '), L5_BAND_LABELS[p.band],
    L5_STATUS_LABELS[p.status], day(p.enrolledOn), p.provider || '', day(p.standardDue), day(p.extendedTo), p.extensionReason || '',
    p.band === 'done' || p.band === 'not_required' ? '' : timeLeft(p.dueDate, today), day(p.completedOn || p.achievedOn),
    p.equivalent || '', p.certificateName ? 'Yes' : 'No', p.notes || '',
  ]);
  await writeXlsxFile([head.map((value) => ({ value, ...bold })), ...rows], {
    sheet: 'Level 5 Diploma',
    columns: head.map((h, i) => ({ width: i < 3 ? 26 : Math.max(12, Math.min(30, h.length + 2)) })),
    stickyRowsCount: 1,
  }).toFile(`Level 5 Diploma tracker - ${today}.xlsx`);
}

// ---------- tab ----------

/** Level 5 Diploma tab of the NVQ & Diploma Tracker (Registered Managers and Deputies, every home). */
export default function Level5Tracker() {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [homeFilter, setHomeFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState<L5Role | ''>('');
  const [bandFilter, setBandFilter] = useState<L5Band | ''>('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/level5', { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (response.status === 403) throw new Error('You do not have access to the Level 5 Diploma tracker.');
      if (!response.ok) throw new Error(body.error || 'Could not load the tracker.');
      setData(body as Loaded);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the tracker.');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const inScope = useMemo(
    () => (data?.people || []).filter((p) => (!homeFilter || p.homes.some((h) => h.id === homeFilter)) && (!roleFilter || p.role === roleFilter)),
    [data, homeFilter, roleFilter],
  );
  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return inScope
      .filter((p) => (!bandFilter || p.band === bandFilter) && (!term || p.name.toLowerCase().includes(term)))
      .sort((a, b) => L5_BAND_ORDER.indexOf(a.band) - L5_BAND_ORDER.indexOf(b.band) || a.name.localeCompare(b.name));
  }, [inScope, bandFilter, search]);
  const summary = useMemo(() => l5Summary(inScope.map((p) => p.band)), [inScope]);

  const updatePerson = (updated: L5Person) => {
    setData((prev) => prev && ({ ...prev, people: prev.people.map((p) => (p.profileId === updated.profileId ? updated : p)) }));
    setEditing(null);
    setNotice(`Saved ${updated.name}.`);
  };

  const th = 'p-3 text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400';

  return (
    <div className="text-slate-900 dark:text-slate-100">
      <div className="flex flex-wrap justify-between items-center gap-4 mb-2">
        <h2 className="text-lg font-black">Level 5 Diploma in Leadership &amp; Management</h2>
        <div className="flex gap-2">
          <UniformButton variant="secondary" size="sm" disabled={!data} onClick={() => { setAdding((v) => !v); setNotice(null); }}>{adding ? 'Close' : '+ Add person'}</UniformButton>
          <UniformButton variant="primary" size="sm" disabled={!data || exporting} onClick={async () => {
            if (!data) return;
            setExporting(true);
            try { await downloadExcel(shown, data.today); } catch { setError('Could not create the Excel file.'); } finally { setExporting(false); }
          }}>{exporting ? 'Preparing…' : '📊 Download Excel'}</UniformButton>
        </div>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Registered Managers and Deputies at every home. Our rule: finish the Level 5 Diploma within 2 years of enrolling. There&rsquo;s no time limit on enrolling – the clock only starts once they enrol. You only see people at the homes you manage.</p>

      {error && <div className="mb-4 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-900/50 p-3 text-sm text-red-700 dark:text-red-200">{error}</div>}
      {notice && <div className="mb-4 rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900/50 p-3 text-sm text-emerald-800 dark:text-emerald-200">{notice}</div>}
      {!data && !error && <p className="text-center text-slate-500 py-16">Loading…</p>}

      {data && (
        <>
          {adding && (
            <AddPanel candidates={data.candidates} onCancel={() => setAdding(false)}
              onAdded={() => { setAdding(false); setNotice('Added to the Level 5 list. Click Edit to add their enrolment details.'); void load(); }} />
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Tile label="Qualified" value={`${summary.qualified} of ${summary.required}`} sub="completed or holds an equivalent" tone="text-emerald-600 dark:text-emerald-400" />
            <Tile label="Overdue" value={String(summary.counts.overdue)} sub="past their 2-year deadline" tone={summary.counts.overdue ? 'text-red-600 dark:text-red-400' : ''} />
            <Tile label="Due within 6 months" value={String(summary.counts.due_soon)} tone={summary.counts.due_soon ? 'text-orange-600 dark:text-orange-400' : ''} />
            <Tile label="Not enrolled yet" value={String(summary.counts.not_enrolled)} sub={summary.counts.date_needed ? `${summary.counts.date_needed} enrolled but missing the date` : 'no deadline until they enrol'} tone={summary.counts.date_needed ? 'text-amber-600' : ''} />
          </div>

          <div className={`${card} p-4 mb-6 flex flex-wrap items-end gap-4`}>
            {data.homes.length > 1 && (
              <div>
                <label htmlFor="l5-home" className={smallLabel}>Home</label>
                <select id="l5-home" className={select} value={homeFilter} onChange={(e) => setHomeFilter(e.target.value)}>
                  <option value="">All homes</option>
                  {data.homes.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label htmlFor="l5-role" className={smallLabel}>Role</label>
              <select id="l5-role" className={select} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as L5Role | '')}>
                <option value="">RMs and Deputies</option>
                {Object.entries(L5_ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}s</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="l5-band" className={smallLabel}>Show</label>
              <select id="l5-band" className={select} value={bandFilter} onChange={(e) => setBandFilter(e.target.value as L5Band | '')}>
                <option value="">Everyone</option>
                {L5_BAND_ORDER.map((b) => <option key={b} value={b}>{L5_BAND_LABELS[b]}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-[200px] max-w-sm">
              <label htmlFor="l5-search" className={smallLabel}>Search name</label>
              <input id="l5-search" className={select + ' w-full'} value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>

          <section className={`${card} overflow-x-auto`}>
            <table className="w-full text-left text-sm min-w-[960px]">
              <thead className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                <tr><th className={th}>Name</th><th className={th}>Where they stand</th><th className={th}>Enrolled</th><th className={th}>Deadline</th><th className={th}>Completed</th><th className={th}><span className="sr-only">Edit</span></th></tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {shown.length === 0 && (
                  <tr><td colSpan={6} className="p-6 text-center text-slate-500">{data.people.length ? 'Nobody matches the filter.' : 'Nobody on the list yet. Use “+ Add person” to add your Registered Managers and Deputies.'}</td></tr>
                )}
                {shown.map((p) => editing === p.profileId ? (
                  <tr key={p.profileId}><td colSpan={6} className="p-3">
                    <p className="font-bold mb-2">{p.name} <span className="text-xs font-normal text-slate-500">{p.homes.map((h) => h.name).join(', ')}</span></p>
                    <EditPanel person={p} today={data.today} onSaved={updatePerson} onCancel={() => setEditing(null)}
                      onRemoved={() => { setEditing(null); setNotice(`${p.name} was taken off the Level 5 list.`); void load(); }} />
                  </td></tr>
                ) : (
                  <tr key={p.profileId} className="align-top">
                    <td className="p-3">
                      <span className="font-bold">{p.name}</span>
                      <div className="text-[11px] text-slate-500">{p.role ? L5_ROLE_LABELS[p.role] : 'Role not set'} · {p.homes.map((h) => h.name).join(', ')}</div>
                    </td>
                    <td className="p-3"><Pill band={p.band} /></td>
                    <td className="p-3 tabular-nums whitespace-nowrap">{day(p.enrolledOn)}{p.provider && <div className="text-[11px] text-slate-500">{p.provider}</div>}</td>
                    <td className="p-3 tabular-nums whitespace-nowrap">
                      {p.band === 'done' || p.band === 'not_required' || !p.dueDate ? '–' : <>
                        {day(p.dueDate)}<div className="text-[11px] text-slate-500">{timeLeft(p.dueDate, data.today)}</div>
                        {p.extendedTo && <div className="text-[11px] font-bold text-blue-600 dark:text-blue-300" title={p.extensionReason || ''}>Extended: {p.extensionReason}</div>}
                      </>}
                    </td>
                    <td className="p-3">
                      {p.status === 'equivalent' ? <span>Equivalent: {p.equivalent}<div className="text-[11px] text-slate-500">{day(p.achievedOn)}</div></span>
                        : p.status === 'completed' ? <span className="tabular-nums">{day(p.completedOn)}</span>
                        : p.status === 'not_required' ? <span className="text-slate-500">Not required{p.notes ? ` – ${p.notes}` : ''}</span>
                        : <span className="text-slate-400">–</span>}
                      {p.certificateName && <button type="button" onClick={() => void openCertificate(p.profileId, Q)} className="block text-[11px] font-bold text-blue-600 dark:text-blue-300 hover:underline">📄 View certificate</button>}
                    </td>
                    <td className="p-3 text-right"><UniformButton variant="secondary" size="sm" onClick={() => { setEditing(p.profileId); setNotice(null); }}>Edit</UniformButton></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <p className="text-xs text-slate-500 mt-4">Deadline = enrolment date + 2 years, unless an extension has been agreed. Most urgent first.</p>
        </>
      )}
    </div>
  );
}
