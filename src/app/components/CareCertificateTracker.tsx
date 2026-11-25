'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import UniformButton from '@/app/components/UniformButton';
import {
  CC_BAND_LABELS,
  CC_BAND_ORDER,
  CC_STATUS_LABELS,
  careCertBand,
  careCertDue,
  careCertSummary,
  standardDue,
  type CareCertBand,
  type CareCertStatus,
} from '@/lib/careCertificate';
import { daysUntil } from '@/lib/diploma';
import type { CareCertHome, CareCertPerson } from '@/lib/careCertificateTracker';
import { openCertificate, uploadCertificate } from '@/lib/certificateUpload';

type Loaded = { homes: CareCertHome[]; today: string };

const BAND_STYLE: Record<CareCertBand, string> = {
  overdue: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',
  no_start_date: 'bg-slate-500/15 text-slate-700 dark:text-slate-200 border-slate-500/30',
  due_soon: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30',
  on_track: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  done: 'bg-emerald-600/20 text-emerald-800 dark:text-emerald-200 border-emerald-600/40',
  not_required: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
};
const BAND_ICON: Record<CareCertBand, string> = { overdue: '🔴', no_start_date: '❔', due_soon: '🟠', on_track: '🟢', done: '✅', not_required: '–' };

const card = 'rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm';
const input = 'w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500';
const smallLabel = 'block text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1';

const day = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '–';

function timeLeft(due: string | null, today: string) {
  if (!due) return '';
  const days = daysUntil(due, today);
  const weeks = Math.round(Math.abs(days) / 7);
  const span = Math.abs(days) < 14 ? `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}` : `${weeks} weeks`;
  return days < 0 ? `${span} overdue` : days === 0 ? 'due today' : `${span} left`;
}

function Pill({ band }: { band: CareCertBand }) {
  return <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-md border whitespace-nowrap ${BAND_STYLE[band]}`}>{BAND_ICON[band]} {CC_BAND_LABELS[band]}</span>;
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

type Draft = {
  status: CareCertStatus; startDate: string; completedOn: string; equivalent: string; achievedOn: string;
  extend: boolean; extendedTo: string; extensionReason: string; notes: string;
};
const toDraft = (p: CareCertPerson): Draft => ({
  status: p.status, startDate: p.startDate || '', completedOn: p.completedOn || '', equivalent: p.equivalent || '', achievedOn: p.achievedOn || '',
  extend: !!p.extendedTo, extendedTo: p.extendedTo || '', extensionReason: p.extensionReason || '', notes: p.notes || '',
});

function EditPanel({ person, today, onSaved, onCancel }: { person: CareCertPerson; today: string; onSaved: (p: CareCertPerson, note?: string) => void; onCancel: () => void }) {
  const [d, setD] = useState<Draft>(toDraft(person));
  const [certificateName, setCertificateName] = useState(person.certificateName);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const needsEvidence = d.status === 'completed' || d.status === 'equivalent';
  const normalDue = standardDue(d.startDate || null);
  const extendedTo = d.extend ? d.extendedTo || null : null;
  const preview = careCertBand({ status: d.status, startDate: d.startDate || null, matrixCompletedOn: person.matrixCompletedOn, extendedTo }, today);
  const id = (k: string) => `cc-${person.profileId}-${k}`;

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError('');
    try { setCertificateName(await uploadCertificate(person.profileId, 'CARE_CERTIFICATE', file)); }
    catch (e) { setError(e instanceof Error ? e.message : 'The upload failed.'); }
    finally { setUploading(false); }
  };

  const save = async () => {
    if (d.status === 'completed' && !d.completedOn) { setError('Enter the date they completed it.'); return; }
    if (d.status === 'equivalent' && (!d.equivalent.trim() || !d.achievedOn)) { setError('Say which equivalent they hold and when they achieved it.'); return; }
    if (needsEvidence && !certificateName) { setError('Upload a copy of the certificate.'); return; }
    if (d.status === 'not_required' && !d.notes.trim()) { setError('Add a note saying why it isn’t required.'); return; }
    if (d.extend) {
      if (!d.extendedTo || !d.extensionReason.trim()) { setError('An extension needs a new deadline and a reason.'); return; }
      if (normalDue && d.extendedTo <= normalDue) { setError(`The new deadline must be after the normal one (${day(normalDue)}).`); return; }
    }
    setSaving(true);
    setError('');
    try {
      const record = { ...d, extendedTo: extendedTo || '', extensionReason: d.extend ? d.extensionReason : '' };
      const response = await fetch('/api/care-certificate', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profileId: person.profileId, record }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not save.');
      const startDate = d.startDate || null;
      onSaved({
        ...person, status: d.status, startDate, standardDue: standardDue(startDate), dueDate: careCertDue(startDate, extendedTo),
        completedOn: d.completedOn || null, equivalent: d.equivalent.trim() || null, achievedOn: d.achievedOn || null, certificateName,
        extendedTo, extensionReason: d.extend ? d.extensionReason.trim() : null, notes: d.notes.trim() || null,
        matrixCompletedOn: d.status === 'completed' && body.matrix?.homes > 0 && (!person.matrixCompletedOn || d.completedOn > person.matrixCompletedOn) ? d.completedOn : person.matrixCompletedOn,
        band: preview,
      }, body.matrix?.note || (body.matrix?.homes ? `Completion saved to the Training Matrix (${body.matrix.homes} home${body.matrix.homes === 1 ? '' : 's'}).` : undefined));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 space-y-3">
      {person.matrixCompletedOn && (
        <p className="text-sm text-emerald-700 dark:text-emerald-300 font-semibold">✅ On the Training Matrix as completed on {day(person.matrixCompletedOn)}.</p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div>
          <label className={smallLabel} htmlFor={id('start')}>Start date</label>
          <input id={id('start')} type="date" className={input} value={d.startDate} onChange={(e) => set('startDate', e.target.value)} />
          <p className="text-[11px] text-slate-500 mt-1">{normalDue ? `12-week deadline: ${day(normalDue)}. ` : ''}Saved on their staff record.</p>
        </div>
        <div className="lg:col-span-2">
          <label className={smallLabel} htmlFor={id('status')}>Status</label>
          <select id={id('status')} className={input} value={d.status} onChange={(e) => set('status', e.target.value as CareCertStatus)}>
            {Object.entries(CC_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {d.status === 'not_started' && <p className="text-[11px] text-slate-500 mt-1">Completion is picked up from the Training Matrix automatically.</p>}
        </div>
        {d.status === 'completed' && (
          <div>
            <label className={smallLabel} htmlFor={id('completed')}>Completed on</label>
            <input id={id('completed')} type="date" className={input} value={d.completedOn} onChange={(e) => set('completedOn', e.target.value)} />
            <p className="text-[11px] text-slate-500 mt-1">Also saved to the Training Matrix.</p>
          </div>
        )}
        {d.status === 'equivalent' && (
          <>
            <div className="sm:col-span-2">
              <label className={smallLabel} htmlFor={id('equiv')}>Equivalent held</label>
              <input id={id('equiv')} className={input} value={d.equivalent} maxLength={300} placeholder="e.g. Level 2 Diploma in Health and Social Care" onChange={(e) => set('equivalent', e.target.value)} />
            </div>
            <div>
              <label className={smallLabel} htmlFor={id('achieved')}>Achieved on</label>
              <input id={id('achieved')} type="date" className={input} value={d.achievedOn} onChange={(e) => set('achievedOn', e.target.value)} />
            </div>
          </>
        )}
      </div>

      {(needsEvidence || certificateName) && (
        <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-600 p-3 flex flex-wrap items-center gap-3">
          <span className="text-sm">{certificateName ? <>📄 <strong>{certificateName}</strong></> : <span className="text-amber-700 dark:text-amber-300 font-semibold">Certificate needed to mark them off</span>}</span>
          {certificateName && <UniformButton variant="secondary" size="sm" onClick={() => void openCertificate(person.profileId, 'CARE_CERTIFICATE')}>View</UniformButton>}
          <label className={`text-xs font-bold px-3 py-2 rounded-lg cursor-pointer ${uploading ? 'opacity-50' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
            {uploading ? 'Uploading…' : certificateName ? 'Replace certificate' : 'Upload certificate'}
            <input type="file" accept="application/pdf,image/*" className="sr-only" disabled={uploading} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          <span className="text-[11px] text-slate-500">PDF or photo, up to 10 MB. Kept privately.</span>
        </div>
      )}

      {(d.status === 'not_started') && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-3">
          <label className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" className="w-4 h-4" checked={d.extend} onChange={(e) => set('extend', e.target.checked)} />
            Extension agreed – they won&rsquo;t meet the 12 weeks
          </label>
          {d.extend && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={smallLabel} htmlFor={id('extto')}>New deadline</label>
                <input id={id('extto')} type="date" className={input} value={d.extendedTo} min={normalDue || undefined} onChange={(e) => set('extendedTo', e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className={smallLabel} htmlFor={id('extwhy')}>Reason</label>
                <input id={id('extwhy')} className={input} value={d.extensionReason} maxLength={1000} placeholder="e.g. long-term sickness, part-time hours" onChange={(e) => set('extensionReason', e.target.value)} />
              </div>
            </div>
          )}
        </div>
      )}

      <div>
        <label className={smallLabel} htmlFor={id('notes')}>Notes</label>
        <textarea id={id('notes')} className={input} rows={2} maxLength={2000} value={d.notes} placeholder={d.status === 'not_required' ? 'Why it isn’t required, e.g. office-based role' : ''} onChange={(e) => set('notes', e.target.value)} />
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

async function downloadExcel(homes: CareCertHome[], today: string) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const bold = { fontWeight: 'bold' as const };
  const head = ['Home', 'Name', 'Where they stand', 'Start date', '12-week deadline', 'Extended to', 'Extension reason', 'Time left', 'Completed (matrix)', 'Status', 'Completed / achieved on', 'Equivalent', 'Certificate on file', 'Notes'];
  const rows = homes.flatMap((h) => h.people.map((p) => [
    h.locationName, p.name, CC_BAND_LABELS[p.band], day(p.startDate), day(p.standardDue), day(p.extendedTo), p.extensionReason || '',
    p.band === 'done' || p.band === 'not_required' ? '' : timeLeft(p.dueDate, today), day(p.matrixCompletedOn), CC_STATUS_LABELS[p.status],
    day(p.completedOn || p.achievedOn), p.equivalent || '', p.certificateName ? 'Yes' : 'No', p.notes || '',
  ]));
  await writeXlsxFile([head.map((value) => ({ value, ...bold })), ...rows], {
    sheet: 'Care Certificate',
    columns: head.map((h, i) => ({ width: i < 2 ? 26 : Math.max(12, Math.min(30, h.length + 2)) })),
    stickyRowsCount: 1,
  }).toFile(`Care Certificate tracker - ${today}.xlsx`);
}

// ---------- tab ----------

/** Care Certificate tab of the Qualifications Tracker (every home with care_cert_required; not schools). */
export default function CareCertificateTracker() {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [homeFilter, setHomeFilter] = useState('');
  const [bandFilter, setBandFilter] = useState<CareCertBand | ''>('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/care-certificate');
      const body = await response.json().catch(() => ({}));
      if (response.status === 403) throw new Error('You do not have access to the Care Certificate tracker.');
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
      .map((h) => ({ ...h, people: h.people.filter((p) => (!bandFilter || p.band === bandFilter) && (!term || p.name.toLowerCase().includes(term))) }))
      .filter((h) => h.people.length > 0 || (!bandFilter && !term));
  }, [data, homeFilter, bandFilter, search]);

  const summary = useMemo(() => {
    const byPerson = new Map<string, CareCertPerson>();
    for (const h of (data?.homes || []).filter((x) => !homeFilter || x.locationId === homeFilter)) for (const p of h.people) byPerson.set(p.profileId, p);
    const people = Array.from(byPerson.values());
    return { ...careCertSummary(people.map((p) => p.band)), extended: people.filter((p) => p.extendedTo && p.band !== 'done').length };
  }, [data, homeFilter]);

  const updatePerson = (updated: CareCertPerson, note?: string) => {
    setData((prev) => prev && ({ ...prev, homes: prev.homes.map((h) => ({ ...h, people: h.people.map((p) => (p.profileId === updated.profileId ? { ...updated, name: p.name } : p)) })) }));
    setEditing(null);
    setNotice(note || null);
  };

  const select = 'bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500';
  const th = 'p-3 text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400';

  return (
    <div className="text-slate-900 dark:text-slate-100">
      <div className="flex flex-wrap justify-between items-center gap-4 mb-2">
        <h2 className="text-lg font-black">Care Certificate</h2>
        <UniformButton variant="primary" size="sm" disabled={!data || exporting} onClick={async () => {
          if (!data) return;
          setExporting(true);
          try { await downloadExcel(homes, data.today); } catch { setError('Could not create the Excel file.'); } finally { setExporting(false); }
        }}>{exporting ? 'Preparing…' : '📊 Download Excel'}</UniformButton>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Every home except schools (set per home in Manage Venues): new staff should complete the Care Certificate within 12 weeks of their start date. Completions come from the Training Matrix. You only see the homes you manage.</p>

      {error && <div className="mb-4 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-900/50 p-3 text-sm text-red-700 dark:text-red-200">{error}</div>}
      {notice && <div className="mb-4 rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900/50 p-3 text-sm text-emerald-800 dark:text-emerald-200">{notice}</div>}
      {!data && !error && <p className="text-center text-slate-500 py-16">Loading…</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Tile label="Completed" value={summary.pctDone === null ? '–' : `${summary.pctDone}%`} sub={`${summary.done} of ${summary.required} who need it`} tone="text-emerald-600 dark:text-emerald-400" />
            <Tile label="Overdue" value={String(summary.counts.overdue)} sub="past their deadline" tone={summary.counts.overdue ? 'text-red-600 dark:text-red-400' : ''} />
            <Tile label="Due within 2 weeks" value={String(summary.counts.due_soon)} sub={`${summary.extended} with an agreed extension`} tone={summary.counts.due_soon ? 'text-orange-600 dark:text-orange-400' : ''} />
            <Tile label="Start date needed" value={String(summary.counts.no_start_date)} sub="deadline can’t be worked out" tone={summary.counts.no_start_date ? 'text-amber-600' : ''} />
          </div>

          <div className={`${card} p-4 mb-6 flex flex-wrap items-end gap-4`}>
            {data.homes.length > 1 && (
              <div>
                <label htmlFor="cc-home" className={smallLabel}>Home</label>
                <select id="cc-home" className={select} value={homeFilter} onChange={(e) => setHomeFilter(e.target.value)}>
                  <option value="">All homes</option>
                  {data.homes.map((h) => <option key={h.locationId} value={h.locationId}>{h.locationName}</option>)}
                </select>
              </div>
            )}
            <div>
              <label htmlFor="cc-band" className={smallLabel}>Show</label>
              <select id="cc-band" className={select} value={bandFilter} onChange={(e) => setBandFilter(e.target.value as CareCertBand | '')}>
                <option value="">Everyone</option>
                {CC_BAND_ORDER.map((b) => <option key={b} value={b}>{CC_BAND_LABELS[b]}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-[200px] max-w-sm">
              <label htmlFor="cc-search" className={smallLabel}>Search name</label>
              <input id="cc-search" className={select + ' w-full'} value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>

          <div className="space-y-6">
            {homes.map((home) => {
              const all = data.homes.find((h) => h.locationId === home.locationId)!;
              const s = careCertSummary(all.people.map((p) => p.band));
              return (
                <section key={home.locationId} className={`${card} overflow-x-auto`}>
                  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 p-4 pb-2">
                    <h3 className="text-lg font-black">{home.locationName}</h3>
                    <span className="text-sm text-slate-500">{s.done} of {s.required} completed{s.counts.overdue ? ` · ${s.counts.overdue} overdue` : ''}{s.counts.no_start_date ? ` · ${s.counts.no_start_date} need a start date` : ''}</span>
                  </div>
                  <table className="w-full text-left text-sm min-w-[860px]">
                    <thead className="border-y border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                      <tr><th className={th}>Name</th><th className={th}>Where they stand</th><th className={th}>Start date</th><th className={th}>Deadline</th><th className={th}>Completed</th><th className={th}><span className="sr-only">Edit</span></th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {home.people.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-500">{all.people.length ? 'Nobody matches the filter.' : 'No staff linked to this home.'}</td></tr>}
                      {home.people.map((p) => {
                        const key = `${home.locationId}:${p.profileId}`;
                        return editing === key ? (
                          <tr key={key}><td colSpan={6} className="p-3"><p className="font-bold mb-2">{p.name}</p><EditPanel person={p} today={data.today} onSaved={updatePerson} onCancel={() => setEditing(null)} /></td></tr>
                        ) : (
                          <tr key={key} className="align-top">
                            <td className="p-3 font-bold">{p.name}{p.qualificationsOnEntry && <div className="text-[11px] font-normal text-slate-500">On entry: {p.qualificationsOnEntry}</div>}</td>
                            <td className="p-3"><Pill band={p.band} />{p.matrixAllocated && p.band !== 'done' && <div className="text-[11px] text-slate-500 mt-1">Allocated / booked on the matrix</div>}</td>
                            <td className="p-3 tabular-nums whitespace-nowrap">{day(p.startDate)}</td>
                            <td className="p-3 tabular-nums whitespace-nowrap">
                              {p.band === 'done' || p.band === 'not_required' ? '–' : <>
                                {day(p.dueDate)}<div className="text-[11px] text-slate-500">{timeLeft(p.dueDate, data.today)}</div>
                                {p.extendedTo && <div className="text-[11px] font-bold text-blue-600 dark:text-blue-300" title={p.extensionReason || ''}>Extended: {p.extensionReason}</div>}
                              </>}
                            </td>
                            <td className="p-3">
                              {p.matrixCompletedOn ? <span className="tabular-nums">{day(p.matrixCompletedOn)} <span className="text-[11px] text-slate-500">(matrix)</span></span>
                                : p.status === 'equivalent' ? <span>Equivalent: {p.equivalent}<div className="text-[11px] text-slate-500">{day(p.achievedOn)}</div></span>
                                : p.status === 'completed' ? <span className="tabular-nums">{day(p.completedOn)}</span>
                                : p.status === 'not_required' ? <span className="text-slate-500">Not required{p.notes ? ` – ${p.notes}` : ''}</span>
                                : <span className="text-slate-400">–</span>}
                              {p.certificateName && <button type="button" onClick={() => void openCertificate(p.profileId, 'CARE_CERTIFICATE')} className="block text-[11px] font-bold text-blue-600 dark:text-blue-300 hover:underline">📄 View certificate</button>}
                            </td>
                            <td className="p-3 text-right"><UniformButton variant="secondary" size="sm" onClick={() => { setEditing(key); setNotice(null); }}>Edit</UniformButton></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </section>
              );
            })}
          </div>
          <p className="text-xs text-slate-500 mt-4">Deadline = start date + 12 weeks, unless an extension has been agreed. Staff are listed by the homes they&rsquo;re linked to on the Training Matrix.</p>
        </>
      )}
    </div>
  );
}
