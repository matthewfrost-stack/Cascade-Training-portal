'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import UniformButton from '@/app/components/UniformButton';
import {
  BAND_LABELS,
  BAND_ORDER,
  STATUS_LABELS,
  daysUntil,
  diplomaBand,
  diplomaSummary,
  dueDate,
  type DiplomaBand,
  type DiplomaStatus,
} from '@/lib/diploma';
import type { DiplomaHome, DiplomaPerson } from '@/lib/diplomaTracker';
import { openCertificate, uploadCertificate } from '@/lib/certificateUpload';

type Loaded = { homes: DiplomaHome[]; today: string };

const BAND_STYLE: Record<DiplomaBand, string> = {
  overdue: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',
  no_start_date: 'bg-slate-500/15 text-slate-700 dark:text-slate-200 border-slate-500/30',
  due_soon: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30',
  not_enrolled: 'bg-yellow-500/15 text-yellow-800 dark:text-yellow-300 border-yellow-500/30',
  on_track: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  done: 'bg-emerald-600/20 text-emerald-800 dark:text-emerald-200 border-emerald-600/40',
  not_required: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
};
const BAND_ICON: Record<DiplomaBand, string> = { overdue: '🔴', no_start_date: '❔', due_soon: '🟠', not_enrolled: '🟡', on_track: '🟢', done: '✅', not_required: '–' };

const card = 'rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm';
const input = 'w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500';
const smallLabel = 'block text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1';

const day = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '–';

function timeLeft(due: string | null, today: string) {
  if (!due) return '';
  const days = daysUntil(due, today);
  const months = Math.round(Math.abs(days) / 30.4);
  const span = Math.abs(days) < 45 ? `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}` : `${months} month${months === 1 ? '' : 's'}`;
  if (days < 0) return `${span} overdue`;
  if (days === 0) return 'due today';
  return `${span} left`;
}

function Pill({ band }: { band: DiplomaBand }) {
  return <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-md border whitespace-nowrap ${BAND_STYLE[band]}`}>{BAND_ICON[band]} {BAND_LABELS[band]}</span>;
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

// ---------- edit panel ----------

type Draft = { status: DiplomaStatus; startDate: string; qualificationsOnEntry: string; enrolledOn: string; provider: string; completedOn: string; equivalent: string; achievedOn: string; notes: string };
const toDraft = (p: DiplomaPerson): Draft => ({
  status: p.status, startDate: p.startDate || '', qualificationsOnEntry: p.qualificationsOnEntry || '', enrolledOn: p.enrolledOn || '', provider: p.provider || '',
  completedOn: p.completedOn || '', equivalent: p.equivalent || '', achievedOn: p.achievedOn || '', notes: p.notes || '',
});

function EditPanel({ person, today, onSaved, onCancel }: { person: DiplomaPerson; today: string; onSaved: (p: DiplomaPerson) => void; onCancel: () => void }) {
  const [d, setD] = useState<Draft>(toDraft(person));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [certificateName, setCertificateName] = useState(person.certificateName);
  const [uploading, setUploading] = useState(false);
  const needsEvidence = d.status === 'completed' || d.status === 'equivalent';
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError('');
    try { setCertificateName(await uploadCertificate(person.profileId, 'L3_RESIDENTIAL_CHILDCARE', file)); }
    catch (e) { setError(e instanceof Error ? e.message : 'The upload failed.'); }
    finally { setUploading(false); }
  };
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const preview = diplomaBand({ status: d.status, startDate: d.startDate || null }, today);
  const due = dueDate(d.startDate || null);

  const save = async () => {
    if (d.status === 'completed' && !d.completedOn) { setError('Enter the date they completed it.'); return; }
    if (d.status === 'equivalent' && !d.equivalent.trim()) { setError('Say which equivalent qualification they hold.'); return; }
    if (d.status === 'equivalent' && !d.achievedOn) { setError('Enter the date they achieved it.'); return; }
    if (needsEvidence && !certificateName) { setError('Upload a copy of the certificate.'); return; }
    if (d.status === 'not_required' && !d.notes.trim()) { setError('Add a note saying why it isn’t required.'); return; }
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/diploma', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profileId: person.profileId, record: d }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not save.');
      onSaved({
        ...person, status: d.status, startDate: d.startDate || null, qualificationsOnEntry: d.qualificationsOnEntry.trim() || null, dueDate: due, enrolledOn: d.enrolledOn || null, provider: d.provider.trim() || null,
        completedOn: d.completedOn || null, equivalent: d.equivalent.trim() || null, achievedOn: d.achievedOn || null, certificateName,
        notes: d.notes.trim() || null, band: preview, updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const id = (k: string) => `dip-${person.profileId}-${k}`;
  return (
    <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div>
          <label className={smallLabel} htmlFor={id('start')}>Start date</label>
          <input id={id('start')} type="date" className={input} value={d.startDate} onChange={(e) => set('startDate', e.target.value)} />
          <p className="text-[11px] text-slate-500 mt-1">{due ? `Deadline: ${day(due)}. ` : ''}Saved on their staff record (also used for the Care Certificate).</p>
        </div>
        <div>
          <label className={smallLabel} htmlFor={id('entry')}>Qualifications on entry</label>
          <input id={id('entry')} className={input} value={d.qualificationsOnEntry} maxLength={500} placeholder="What they arrived with" onChange={(e) => set('qualificationsOnEntry', e.target.value)} />
        </div>
        <div>
          <label className={smallLabel} htmlFor={id('status')}>Status</label>
          <select id={id('status')} className={input} value={d.status} onChange={(e) => set('status', e.target.value as DiplomaStatus)}>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className={smallLabel} htmlFor={id('provider')}>Provider / college</label>
          <input id={id('provider')} className={input} value={d.provider} maxLength={300} onChange={(e) => set('provider', e.target.value)} />
        </div>
        {(d.status === 'enrolled' || d.status === 'in_progress' || d.status === 'completed') && (
          <div>
            <label className={smallLabel} htmlFor={id('enrolled')}>Enrolled on</label>
            <input id={id('enrolled')} type="date" className={input} value={d.enrolledOn} onChange={(e) => set('enrolledOn', e.target.value)} />
          </div>
        )}
        {d.status === 'completed' && (
          <div>
            <label className={smallLabel} htmlFor={id('completed')}>Completed on</label>
            <input id={id('completed')} type="date" className={input} value={d.completedOn} onChange={(e) => set('completedOn', e.target.value)} />
          </div>
        )}
        {d.status === 'equivalent' && (
          <div className="sm:col-span-2">
            <label className={smallLabel} htmlFor={id('equiv')}>Equivalent qualification held</label>
            <input id={id('equiv')} className={input} value={d.equivalent} maxLength={300} placeholder="e.g. Level 3 Diploma for the Children and Young People's Workforce" onChange={(e) => set('equivalent', e.target.value)} />
          </div>
        )}
        {d.status === 'equivalent' && (
          <div>
            <label className={smallLabel} htmlFor={id('achieved')}>Achieved on</label>
            <input id={id('achieved')} type="date" className={input} value={d.achievedOn} onChange={(e) => set('achievedOn', e.target.value)} />
          </div>
        )}
      </div>
      {(needsEvidence || certificateName) && (
        <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-600 p-3 flex flex-wrap items-center gap-3">
          <span className="text-sm">
            {certificateName
              ? <>📄 <strong>{certificateName}</strong></>
              : <span className="text-amber-700 dark:text-amber-300 font-semibold">Certificate needed{needsEvidence ? ' to mark them off' : ''}</span>}
          </span>
          {certificateName && <UniformButton variant="secondary" size="sm" onClick={() => void openCertificate(person.profileId, 'L3_RESIDENTIAL_CHILDCARE')}>View</UniformButton>}
          <label className={`text-xs font-bold px-3 py-2 rounded-lg cursor-pointer ${uploading ? 'opacity-50' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
            {uploading ? 'Uploading…' : certificateName ? 'Replace certificate' : 'Upload certificate'}
            <input type="file" accept="application/pdf,image/*" className="sr-only" disabled={uploading} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          <span className="text-[11px] text-slate-500">PDF or photo, up to 10 MB. Kept privately.</span>
        </div>
      )}
      <div>
        <label className={smallLabel} htmlFor={id('notes')}>Notes</label>
        <textarea id={id('notes')} className={input} rows={2} maxLength={2000} value={d.notes}
          placeholder={d.status === 'not_required' ? 'Why it isn’t required, e.g. domestic role' : ''} onChange={(e) => set('notes', e.target.value)} />
      </div>
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500 mr-auto">Will show as <Pill band={preview} /></span>
        <UniformButton variant="secondary" size="sm" onClick={onCancel} disabled={saving}>Cancel</UniformButton>
        <UniformButton variant="primary" size="sm" onClick={() => void save()} disabled={saving || uploading}>{saving ? 'Saving…' : 'Save'}</UniformButton>
      </div>
    </div>
  );
}

// ---------- Excel ----------

async function downloadExcel(homes: DiplomaHome[], today: string) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const bold = { fontWeight: 'bold' as const };
  const head = ['Home', 'Name', 'Qualifications on entry', 'Status', 'Where they stand', 'Start date', 'Deadline', 'Time left', 'Provider', 'Enrolled on', 'Completed on', 'Equivalent', 'Achieved on', 'Certificate on file', 'Notes'];
  const rows = homes.flatMap((h) => h.people.map((p) => [
    h.locationName, p.name, p.qualificationsOnEntry || '', STATUS_LABELS[p.status], BAND_LABELS[p.band], day(p.startDate), day(p.dueDate), timeLeft(p.dueDate, today),
    p.provider || '', day(p.enrolledOn), day(p.completedOn), p.equivalent || '', day(p.achievedOn), p.certificateName ? 'Yes' : 'No', p.notes || '',
  ]));
  await writeXlsxFile([head.map((value) => ({ value, ...bold })), ...rows], {
    sheet: 'Level 3 Diploma',
    columns: [{ width: 24 }, { width: 26 }, { width: 30 }, { width: 18 }, { width: 22 }, { width: 13 }, { width: 13 }, { width: 18 }, { width: 24 }, { width: 13 }, { width: 13 }, { width: 30 }, { width: 13 }, { width: 12 }, { width: 40 }],
    stickyRowsCount: 1,
  }).toFile(`Level 3 Diploma tracker - ${today}.xlsx`);
}

// ---------- page ----------

/** Level 3 Diploma tab of the NVQ & Diploma Tracker (children's homes). */
export default function Level3DiplomaTracker() {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [homeFilter, setHomeFilter] = useState('');
  const [bandFilter, setBandFilter] = useState<DiplomaBand | ''>('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/diploma');
      const body = await response.json().catch(() => ({}));
      if (response.status === 403) throw new Error('You do not have access to the Level 3 Diploma tracker.');
      if (!response.ok) throw new Error(body.error || 'Could not load the tracker.');
      setData(body as Loaded);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the tracker.');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const homes = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.homes || [])
      .filter((h) => !homeFilter || h.locationId === homeFilter)
      .map((h) => ({ ...h, people: h.people.filter((p) => (!bandFilter || p.band === bandFilter) && (!term || p.name.toLowerCase().includes(term))) }));
  }, [data, homeFilter, bandFilter, search]);

  // Headline across the selected home(s); someone at two homes counts once.
  const summary = useMemo(() => {
    const selected = (data?.homes || []).filter((h) => !homeFilter || h.locationId === homeFilter);
    const byPerson = new Map<string, DiplomaBand>();
    for (const h of selected) for (const p of h.people) byPerson.set(p.profileId, p.band);
    return diplomaSummary(Array.from(byPerson.values()));
  }, [data, homeFilter]);

  const updatePerson = (updated: DiplomaPerson) => {
    setData((prev) => prev && ({ ...prev, homes: prev.homes.map((h) => ({ ...h, people: h.people.map((p) => (p.profileId === updated.profileId ? { ...updated, name: p.name } : p)) })) }));
    setEditing(null);
  };

  const select = 'bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500';
  const th = 'p-3 text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400';

  return (
    <div className="text-slate-900 dark:text-slate-100">
      <div>
        <div className="flex flex-wrap justify-between items-center gap-4 mb-2">
          <h2 className="text-lg font-black">Level 3 Diploma in Residential Childcare</h2>
          <UniformButton variant="primary" size="sm" disabled={!data || exporting} onClick={async () => {
            if (!data) return;
            setExporting(true);
            try { await downloadExcel(homes, data.today); } catch { setError('Could not create the Excel file.'); } finally { setExporting(false); }
          }}>{exporting ? 'Preparing…' : '📊 Download Excel'}</UniformButton>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Children&rsquo;s homes: staff must hold it (or an equivalent) within 2 years of their start date. You only see the homes you manage.</p>

        {error && <div className="mb-4 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-900/50 p-3 text-sm text-red-700 dark:text-red-200">{error}</div>}
        {!data && !error && <p className="text-center text-slate-500 py-16">Loading…</p>}

        {data && data.homes.length === 0 && (
          <div className={`${card} p-10 text-center text-slate-500`}>
            No children&rsquo;s homes yet. In <strong>Admin → Manage Venues</strong>, set a home to Ofsted and tick <em>&ldquo;Children&rsquo;s home – Level 3 Diploma required&rdquo;</em>.
          </div>
        )}

        {data && data.homes.length > 0 && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Tile label="Qualified" value={summary.pctQualified === null ? '–' : `${summary.pctQualified}%`} sub={`${summary.qualified} of ${summary.required} who need it`} tone="text-emerald-600 dark:text-emerald-400" />
              <Tile label="Overdue" value={String(summary.counts.overdue)} sub="past the 2-year deadline" tone={summary.counts.overdue ? 'text-red-600 dark:text-red-400' : ''} />
              <Tile label="Due within 6 months" value={String(summary.counts.due_soon)} sub={`${summary.counts.not_enrolled} not enrolled yet`} tone={summary.counts.due_soon ? 'text-orange-600 dark:text-orange-400' : ''} />
              <Tile label="Start date needed" value={String(summary.counts.no_start_date)} sub="deadline can’t be worked out" tone={summary.counts.no_start_date ? 'text-amber-600' : ''} />
            </div>

            <div className={`${card} p-4 mb-6 flex flex-wrap items-end gap-4`}>
              {data.homes.length > 1 && (
                <div>
                  <label htmlFor="dip-home" className={smallLabel}>Home</label>
                  <select id="dip-home" className={select} value={homeFilter} onChange={(e) => setHomeFilter(e.target.value)}>
                    <option value="">All children&rsquo;s homes</option>
                    {data.homes.map((h) => <option key={h.locationId} value={h.locationId}>{h.locationName}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label htmlFor="dip-band" className={smallLabel}>Show</label>
                <select id="dip-band" className={select} value={bandFilter} onChange={(e) => setBandFilter(e.target.value as DiplomaBand | '')}>
                  <option value="">Everyone</option>
                  {BAND_ORDER.map((b) => <option key={b} value={b}>{BAND_LABELS[b]}</option>)}
                </select>
              </div>
              <div className="flex-1 min-w-[200px] max-w-sm">
                <label htmlFor="dip-search" className={smallLabel}>Search name</label>
                <input id="dip-search" className={select + ' w-full'} value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>

            <div className="space-y-6">
              {homes.map((home) => {
                const all = data.homes.find((h) => h.locationId === home.locationId)!;
                const s = diplomaSummary(all.people.map((p) => p.band));
                return (
                  <section key={home.locationId} className={`${card} overflow-x-auto`}>
                    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 p-4 pb-2">
                      <h2 className="text-lg font-black">{home.locationName}</h2>
                      <span className="text-sm text-slate-500">
                        {s.qualified} of {s.required} qualified{s.counts.overdue ? ` · ${s.counts.overdue} overdue` : ''}{s.counts.no_start_date ? ` · ${s.counts.no_start_date} need a start date` : ''}
                      </span>
                    </div>
                    <table className="w-full text-left text-sm min-w-[860px]">
                      <thead className="border-y border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                        <tr>
                          <th className={th}>Name</th><th className={th}>Where they stand</th><th className={th}>Status</th>
                          <th className={th}>Start date</th><th className={th}>Deadline</th><th className={th}>Provider</th><th className={th}><span className="sr-only">Edit</span></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                        {home.people.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-slate-500">{all.people.length ? 'Nobody matches the filter.' : 'No staff linked to this home.'}</td></tr>}
                        {home.people.map((p) => {
                          const key = `${home.locationId}:${p.profileId}`;
                          return editing === key ? (
                            <tr key={key}><td colSpan={7} className="p-3">
                              <p className="font-bold mb-2">{p.name}</p>
                              <EditPanel person={p} today={data.today} onSaved={updatePerson} onCancel={() => setEditing(null)} />
                            </td></tr>
                          ) : (
                            <tr key={key} className="align-top">
                              <td className="p-3 font-bold">{p.name}{p.qualificationsOnEntry && <div className="text-[11px] font-normal text-slate-500" title="Qualifications on entry">On entry: {p.qualificationsOnEntry}</div>}</td>
                              <td className="p-3"><Pill band={p.band} /></td>
                              <td className="p-3">{STATUS_LABELS[p.status]}{p.status === 'equivalent' && p.equivalent && <div className="text-[11px] text-slate-500">{p.equivalent}</div>}{p.status === 'completed' && p.completedOn && <div className="text-[11px] text-slate-500">{day(p.completedOn)}</div>}{p.status === 'equivalent' && p.achievedOn && <div className="text-[11px] text-slate-500">{day(p.achievedOn)}</div>}{p.certificateName && <button type="button" onClick={() => void openCertificate(p.profileId, 'L3_RESIDENTIAL_CHILDCARE')} className="block text-[11px] font-bold text-blue-600 dark:text-blue-300 hover:underline">📄 View certificate</button>}</td>
                              <td className="p-3 tabular-nums whitespace-nowrap">{day(p.startDate)}</td>
                              <td className="p-3 tabular-nums whitespace-nowrap">{p.band === 'done' || p.band === 'not_required' ? '–' : <>{day(p.dueDate)}<div className="text-[11px] text-slate-500">{timeLeft(p.dueDate, data.today)}</div></>}</td>
                              <td className="p-3">{p.provider || <span className="text-slate-400">–</span>}</td>
                              <td className="p-3 text-right"><UniformButton variant="secondary" size="sm" onClick={() => setEditing(key)}>Edit</UniformButton></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </section>
                );
              })}
            </div>
            <p className="text-xs text-slate-500 mt-4">
              Deadline = start date + 2 years. &ldquo;Not enrolled yet&rdquo; is a prompt 3 months after starting (not a legal limit). Staff are listed by the homes they&rsquo;re linked to on the Training Matrix.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
