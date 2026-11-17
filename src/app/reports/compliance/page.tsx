'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import BackButton from '@/app/components/BackButton';
import UniformButton from '@/app/components/UniformButton';
import { formatHours } from '@/lib/trainingHours';
import type { HomeDetail, HomeSummary, PersonAction } from '@/lib/complianceReport';

type Generated = { at: string; by: string };
type OverviewResponse = { generated: Generated; period: { from: string; to: string }; homes: HomeSummary[]; canSnapshot: boolean; error?: string };
type DetailResponse = { generated: Generated; detail: HomeDetail; error?: string };
type PeriodKey = '12m' | 'this-year' | 'last-year';
type RegulatorFilter = 'all' | 'CQC' | 'Ofsted' | 'none';

// ---------- helpers ----------

function ukToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
}

function periodRange(key: PeriodKey): { from: string; to: string } {
  const today = ukToday();
  const year = Number(today.slice(0, 4));
  if (key === 'this-year') return { from: `${year}-01-01`, to: today };
  if (key === 'last-year') return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return { from: d.toISOString().slice(0, 10), to: today };
}

const PERIOD_LABELS: Record<PeriodKey, string> = { '12m': 'Last 12 months', 'this-year': 'This year', 'last-year': 'Last year' };

const day = (iso?: string | null) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';

const monthLabel = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });
};

const pctText = (pct: number | null) => (pct === null ? '–' : `${pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(1)}%`);

/** Status band for a compliance %, always shown alongside the number itself. */
function band(pct: number | null): { label: string; bar: string; text: string } {
  if (pct === null) return { label: 'No training applies', bar: 'bg-slate-400', text: 'text-slate-500' };
  if (pct >= 90) return { label: 'Good', bar: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' };
  if (pct >= 75) return { label: 'Needs attention', bar: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' };
  return { label: 'At risk', bar: 'bg-red-500', text: 'text-red-600 dark:text-red-400' };
}

const ACTION_LABEL: Record<PersonAction['state'], string> = {
  expired: 'Expired',
  missing: 'Never completed',
  expiring: 'Expiring',
  allocated: 'Allocated',
};
const ACTION_STYLE: Record<PersonAction['state'], string> = {
  expired: 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30',
  missing: 'bg-slate-500/10 text-slate-700 dark:text-slate-200 border-slate-500/30',
  expiring: 'bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30',
  allocated: 'bg-yellow-500/10 text-yellow-800 dark:text-yellow-300 border-yellow-500/30',
};

function describeAction(a: PersonAction) {
  if (a.state === 'expired') return a.noExpiryDate ? 'no expiry date recorded' : `expired ${day(a.expiry)}`;
  if (a.state === 'expiring') return `expires ${day(a.expiry)}`;
  return '';
}

function useIsDark() {
  const [isDark, setIsDark] = useState(true);
  useEffect(() => {
    try {
      const theme = localStorage.getItem('theme');
      setIsDark(theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches));
    } catch {
      // keep default
    }
    const handle = (event: Event) => {
      const detail = (event as CustomEvent<{ isDark?: boolean }>).detail;
      if (typeof detail?.isDark === 'boolean') setIsDark(detail.isDark);
    };
    window.addEventListener('themeChange', handle);
    return () => window.removeEventListener('themeChange', handle);
  }, []);
  return isDark;
}

// ---------- small pieces ----------

function PctBar({ pct }: { pct: number | null }) {
  const b = band(pct);
  return (
    <div className="flex items-center gap-2 min-w-[120px]" title={`${pctText(pct)} – ${b.label}`}>
      <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden print:border print:border-slate-300">
        <div className={`h-full rounded-full ${b.bar}`} style={{ width: `${pct ?? 0}%` }} />
      </div>
      <span className={`text-sm font-black tabular-nums w-14 text-right ${b.text}`}>{pctText(pct)}</span>
    </div>
  );
}

function Change({ now, before }: { now: number | null; before: HomeSummary['previous'] }) {
  if (!before || now === null || before.compliancePct === null) return null;
  const diff = Math.round((now - before.compliancePct) * 10) / 10;
  if (diff === 0) return <span className="text-[11px] text-slate-500">no change since {monthLabel(before.period)}</span>;
  const up = diff > 0;
  return (
    <span className={`text-[11px] font-bold ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
      {up ? '▲' : '▼'} {Math.abs(diff)} pts since {monthLabel(before.period)}
    </span>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 print:break-inside-avoid">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`text-3xl font-black mt-1 tabular-nums ${tone || 'text-slate-900 dark:text-slate-100'}`}>{value}</p>
      {sub && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sub}</div>}
    </div>
  );
}

function RegulatorBadge({ regulator }: { regulator: HomeSummary['regulator'] }) {
  if (!regulator) return <span className="text-[10px] font-bold text-amber-600">Not set</span>;
  return (
    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${regulator === 'CQC' ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300' : 'bg-purple-500/15 text-purple-700 dark:text-purple-300'}`}>
      {regulator}
    </span>
  );
}

/** Monthly compliance % from saved snapshots: one series, bars with hover values. */
function TrendChart({ points }: { points: HomeDetail['trend'] }) {
  if (points.length === 0) {
    return <p className="text-sm text-slate-500">No monthly snapshots yet. The first is saved on the 1st of the month (or by an admin from the overview).</p>;
  }
  return (
    <div>
      <div className="flex items-end gap-2 h-36 border-b border-slate-300 dark:border-slate-600 pl-1" role="img" aria-label="Compliance by month">
        {points.map((p) => {
          const b = band(p.compliancePct);
          return (
            <div key={p.period} className="flex-1 flex flex-col items-center justify-end h-full group relative min-w-[18px]">
              <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 mb-1 tabular-nums">{pctText(p.compliancePct)}</span>
              <div className={`w-full max-w-[28px] rounded-t ${b.bar}`} style={{ height: `${Math.max(p.compliancePct ?? 0, 1)}%` }} title={`${monthLabel(p.period)}: ${pctText(p.compliancePct)}${p.ldaPct !== null ? ` · Oliver McGowan ${pctText(p.ldaPct)}` : ''}`} />
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 pl-1 mt-1">
        {points.map((p) => (
          <span key={p.period} className="flex-1 text-center text-[10px] text-slate-500 min-w-[18px]">{monthLabel(p.period)}</span>
        ))}
      </div>
    </div>
  );
}

// ---------- Excel ----------

async function downloadExcel(detail: HomeDetail, generated: Generated) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const bold = { fontWeight: 'bold' as const };
  const head = (labels: string[]) => labels.map((value) => ({ value, ...bold }));
  const pctCell = (pct: number | null) => (pct === null ? '' : pct / 100);

  const summary = [
    [{ value: 'Training compliance report', ...bold }],
    ['Home', detail.locationName],
    ['Regulated by', detail.regulator || 'Not set'],
    ['Generated', `${new Date(generated.at).toLocaleString('en-GB')} by ${generated.by}`],
    [],
    head(['Measure', 'Value']),
    ['Compliance', { value: pctCell(detail.compliancePct), type: Number, format: '0.0%' }],
    ['Staff', detail.staffCount],
    ['Training that applies', detail.required],
    ['Expired', detail.counts.expired],
    ['Never completed', detail.counts.missing],
    ['Expiring in 60 days', detail.counts.expiring],
    ['Allocated, not completed', detail.counts.allocated],
    ['Learning disability & autism (Oliver McGowan)', detail.ldaApplies ? { value: pctCell(detail.ldaPct), type: Number, format: '0.0%' } : 'Not on matrix'],
    [`Hours delivered (${detail.period.from} to ${detail.period.to})`, Math.round(detail.hours.delivered * 10) / 10],
    ['Hours lost – absences', Math.round(detail.hours.lostAbsence * 10) / 10],
    ['Hours lost – late arrivals', Math.round(detail.hours.lostLate * 10) / 10],
    [],
    head(['Month', 'Compliance', 'Oliver McGowan']),
    ...detail.trend.map((t) => [
      t.period,
      { value: pctCell(t.compliancePct), type: Number, format: '0.0%' },
      { value: pctCell(t.ldaPct), type: Number, format: '0.0%' },
    ]),
  ];

  const courses = [
    head(['Course', 'Group', 'Compliance', 'In date', 'Expiring', 'Expired', 'Never completed', 'Allocated', 'N/A', 'Not yet due']),
    ...detail.courses.map((c) => [
      c.name, c.category, { value: pctCell(c.compliancePct), type: Number, format: '0.0%' },
      c.counts.in_date, c.counts.expiring, c.counts.expired, c.counts.missing, c.counts.allocated, c.counts.na, c.counts.not_yet_due,
    ]),
  ];

  const people = [
    head(['Name', 'Compliance', 'Course', 'Needs', 'Detail', 'Booked']),
    ...detail.people.flatMap((p) =>
      p.actions.length === 0
        ? [[p.name, { value: pctCell(p.compliancePct), type: Number, format: '0.0%' }, '', 'Up to date', '', '']]
        : p.actions.map((a) => [p.name, { value: pctCell(p.compliancePct), type: Number, format: '0.0%' }, a.course, ACTION_LABEL[a.state], describeAction(a), a.bookedOn ? day(a.bookedOn) : ''])),
  ];

  const safeName = detail.locationName.replace(/[^\w\- ]+/g, '').trim() || 'Home';
  await writeXlsxFile([
    { data: summary, sheet: 'Summary', columns: [{ width: 46 }, { width: 40 }, { width: 16 }] },
    { data: courses, sheet: 'By course', columns: [{ width: 40 }, { width: 20 }, ...Array(8).fill({ width: 13 })], stickyRowsCount: 1 },
    { data: people, sheet: 'By person', columns: [{ width: 28 }, { width: 12 }, { width: 40 }, { width: 16 }, { width: 26 }, { width: 14 }], stickyRowsCount: 1 },
  ]).toFile(`Compliance report - ${safeName} - ${ukToday()}.xlsx`);
}

// ---------- page ----------

export default function ComplianceReportPage() {
  const router = useRouter();
  const isDark = useIsDark();
  const [periodKey, setPeriodKey] = useState<PeriodKey>('12m');
  const [regulator, setRegulator] = useState<RegulatorFilter>('all');
  const [homeId, setHomeId] = useState<string | null>(null);
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [snapshotting, setSnapshotting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [onlyActions, setOnlyActions] = useState(true);

  // Print (Save as PDF) in light colours, then put dark mode back.
  useEffect(() => {
    const html = document.documentElement;
    let wasDark = false;
    const before = () => { wasDark = html.classList.contains('dark'); html.classList.remove('dark'); };
    const after = () => { if (wasDark) html.classList.add('dark'); };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => { window.removeEventListener('beforeprint', before); window.removeEventListener('afterprint', after); };
  }, []);

  // Remember the selected home in the address bar so Back and refresh work.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('home');
    if (id) setHomeId(id);
  }, []);
  const openHome = (id: string | null) => {
    setHomeId(id);
    const url = id ? `/reports/compliance?home=${id}` : '/reports/compliance';
    window.history.pushState(null, '', url);
    window.scrollTo({ top: 0 });
  };
  useEffect(() => {
    const onPop = () => setHomeId(new URLSearchParams(window.location.search).get('home'));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { from, to } = periodRange(periodKey);
    const qs = new URLSearchParams({ from, to, ...(homeId ? { locationId: homeId } : {}) });
    try {
      const response = await fetch(`/api/reports/compliance?${qs.toString()}`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not load the report.');
      if (homeId) setDetail(body as DetailResponse);
      else setOverview(body as OverviewResponse);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load the report.');
    } finally {
      setLoading(false);
    }
  }, [homeId, periodKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveSnapshot = async () => {
    if (!window.confirm("Save this month's compliance figures for every home? If this month already has a snapshot it will be replaced.")) return;
    setSnapshotting(true);
    setNotice(null);
    try {
      const response = await fetch('/api/reports/compliance/snapshot', { method: 'POST' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Snapshot failed.');
      setNotice(`Saved ${body.saved} home${body.saved === 1 ? '' : 's'} for ${monthLabel(body.period)}.`);
    } catch (snapError) {
      setError(snapError instanceof Error ? snapError.message : 'Snapshot failed.');
    } finally {
      setSnapshotting(false);
    }
  };

  const homes = useMemo(() => {
    const list = overview?.homes || [];
    if (regulator === 'all') return list;
    if (regulator === 'none') return list.filter((h) => !h.regulator);
    return list.filter((h) => h.regulator === regulator);
  }, [overview, regulator]);

  const totals = useMemo(() => {
    const t = { required: 0, compliant: 0, delivered: 0, lostAbsence: 0, lostLate: 0, expired: 0, missing: 0 };
    for (const h of homes) {
      t.required += h.required;
      t.compliant += h.counts.in_date + h.counts.expiring;
      t.delivered += h.hours.delivered;
      t.lostAbsence += h.hours.lostAbsence;
      t.lostLate += h.hours.lostLate;
      t.expired += h.counts.expired;
      t.missing += h.counts.missing;
    }
    return { ...t, pct: t.required ? Math.round((t.compliant / t.required) * 1000) / 10 : null };
  }, [homes]);

  const d = detail?.detail;
  const generated = homeId ? detail?.generated : overview?.generated;

  const select = 'bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500';
  const card = 'rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm print:shadow-none print:break-inside-avoid';
  const th = 'p-3 text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400';

  return (
    <main className={`min-h-screen p-4 md:p-8 bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-slate-100 print:bg-white print:p-0`} data-theme={isDark ? 'dark' : 'light'}>
      <div className="max-w-7xl mx-auto">
        {/* Header (screen) */}
        <div className="flex flex-wrap justify-between items-center gap-4 mb-6 print:hidden">
          <BackButton label={homeId ? 'All homes' : 'Back'} onClick={() => (homeId ? openHome(null) : router.push('/'))} />
          <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tighter">Compliance Report</h1>
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-bold uppercase text-slate-500" htmlFor="hours-period">Hours</label>
            <select id="hours-period" value={periodKey} onChange={(e) => setPeriodKey(e.target.value as PeriodKey)} className={select}>
              {Object.entries(PERIOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>

        {/* Header (print / PDF) */}
        <div className="hidden print:block mb-4 border-b border-slate-300 pb-3">
          <h1 className="text-2xl font-black">Training compliance report{d ? ` – ${d.locationName}` : ' – all homes'}</h1>
          <p className="text-sm">
            {d && <>Regulated by {d.regulator || 'not set'} · </>}
            Training hours: {PERIOD_LABELS[periodKey].toLowerCase()} · Generated {generated ? new Date(generated.at).toLocaleString('en-GB') : ''} by {generated?.by}
          </p>
        </div>

        {error && <div className="mb-4 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-900/50 p-3 text-sm text-red-700 dark:text-red-200 print:hidden">{error}</div>}
        {notice && <div className="mb-4 rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900/50 p-3 text-sm text-emerald-800 dark:text-emerald-200 print:hidden">{notice}</div>}
        {loading && <p className="text-center text-slate-500 py-16">Working out compliance for {homeId ? 'this home' : 'every home'}…</p>}

        {/* ---------- OVERVIEW ---------- */}
        {!loading && !homeId && overview && (
          <>
            <div className="flex flex-wrap items-center gap-3 mb-4 print:hidden">
              <div className="flex rounded-lg border border-slate-300 dark:border-slate-600 overflow-hidden" role="group" aria-label="Filter by regulator">
                {([['all', 'All homes'], ['CQC', 'CQC'], ['Ofsted', 'Ofsted'], ['none', 'Not set']] as [RegulatorFilter, string][]).map(([k, v]) => (
                  <button key={k} type="button" onClick={() => setRegulator(k)} aria-pressed={regulator === k}
                    className={`px-3 py-1.5 text-xs font-bold ${regulator === k ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
                    {v}
                  </button>
                ))}
              </div>
              <div className="flex-1" />
              {overview.canSnapshot && (
                <UniformButton variant="secondary" size="sm" onClick={() => void saveSnapshot()} disabled={snapshotting}>
                  {snapshotting ? 'Saving…' : "📸 Save this month's snapshot"}
                </UniformButton>
              )}
              <UniformButton variant="secondary" size="sm" onClick={() => window.print()}>🖨️ Download PDF</UniformButton>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Tile label="Overall compliance" value={pctText(totals.pct)} tone={band(totals.pct).text} sub={`${band(totals.pct).label} · ${homes.length} home${homes.length === 1 ? '' : 's'}`} />
              <Tile label="Expired" value={String(totals.expired)} sub={`${totals.missing} never completed`} />
              <Tile label="Hours delivered" value={formatHours(totals.delivered)} sub={PERIOD_LABELS[periodKey]} />
              <Tile label="Hours lost" value={formatHours(totals.lostAbsence + totals.lostLate)} sub={`${formatHours(totals.lostAbsence)} absences · ${formatHours(totals.lostLate)} late`} />
            </div>

            <div className={`${card} overflow-x-auto`}>
              <table className="w-full text-left min-w-[900px]">
                <thead className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                  <tr>
                    <th className={th}>Home</th>
                    <th className={th}>Compliance</th>
                    <th className={`${th} text-center`}>Expired</th>
                    <th className={`${th} text-center`}>Never done</th>
                    <th className={`${th} text-center`}>Expiring</th>
                    <th className={`${th} text-center`}>Allocated</th>
                    <th className={`${th} text-center`}>Oliver McGowan</th>
                    <th className={`${th} text-center`}>Hours delivered</th>
                    <th className={`${th} text-center`}>Hours lost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {homes.length === 0 && (
                    <tr><td colSpan={9} className="p-8 text-center text-slate-500">No homes match this filter.</td></tr>
                  )}
                  {homes.map((h) => (
                    <tr key={h.locationId} className="hover:bg-slate-50 dark:hover:bg-slate-700/40 cursor-pointer" onClick={() => openHome(h.locationId)}>
                      <td className="p-3">
                        <button type="button" className="font-bold text-left hover:underline" onClick={(e) => { e.stopPropagation(); openHome(h.locationId); }}>{h.locationName}</button>
                        <div className="flex items-center gap-2 mt-0.5"><RegulatorBadge regulator={h.regulator} /><span className="text-[11px] text-slate-500">{h.staffCount} staff</span></div>
                      </td>
                      <td className="p-3"><PctBar pct={h.compliancePct} /><Change now={h.compliancePct} before={h.previous} /></td>
                      <td className="p-3 text-center font-bold tabular-nums">{h.counts.expired}</td>
                      <td className="p-3 text-center font-bold tabular-nums">{h.counts.missing}</td>
                      <td className="p-3 text-center tabular-nums">{h.counts.expiring}</td>
                      <td className="p-3 text-center tabular-nums">{h.counts.allocated}</td>
                      <td className="p-3 text-center tabular-nums">{h.ldaApplies ? pctText(h.ldaPct) : <span className="text-slate-400">–</span>}</td>
                      <td className="p-3 text-center tabular-nums">{formatHours(h.hours.delivered)}</td>
                      <td className="p-3 text-center tabular-nums">{formatHours(h.hours.lostAbsence + h.hours.lostLate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500 mt-3">
              Compliance = training in date (including expiring soon) ÷ training that applies. N/A and &ldquo;Not yet due&rdquo; are left out. Lowest compliance is listed first. Hours come from booked face-to-face sessions, matched to homes by each person&rsquo;s location.
            </p>
          </>
        )}

        {/* ---------- ONE HOME ---------- */}
        {!loading && homeId && d && detail && (
          <>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <h2 className="text-2xl font-black print:hidden">{d.locationName}</h2>
              <span className="print:hidden"><RegulatorBadge regulator={d.regulator} /></span>
              <div className="flex-1" />
              <div className="flex gap-2 print:hidden">
                <UniformButton variant="secondary" size="sm" onClick={() => window.print()}>🖨️ Download PDF</UniformButton>
                <UniformButton variant="primary" size="sm" disabled={exporting} onClick={async () => {
                  setExporting(true);
                  try { await downloadExcel(d, detail.generated); } catch { setError('Could not create the Excel file.'); } finally { setExporting(false); }
                }}>
                  {exporting ? 'Preparing…' : '📊 Download Excel'}
                </UniformButton>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <Tile label="Compliance" value={pctText(d.compliancePct)} tone={band(d.compliancePct).text} sub={<>{band(d.compliancePct).label} · {d.staffCount} staff<br /><Change now={d.compliancePct} before={d.previous} /></>} />
              <Tile label="Expired" value={String(d.counts.expired)} sub={`${d.counts.missing} never completed`} tone="text-red-600 dark:text-red-400" />
              <Tile label="Expiring in 60 days" value={String(d.counts.expiring)} sub={`${d.counts.allocated} allocated, not done`} />
              <Tile label="Oliver McGowan" value={d.ldaApplies ? pctText(d.ldaPct) : '–'} tone={d.ldaApplies ? band(d.ldaPct).text : undefined} sub={d.ldaApplies ? 'Learning disability & autism training' : 'Not on this home’s matrix'} />
            </div>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <Tile label="Hours delivered" value={formatHours(d.hours.delivered)} sub={PERIOD_LABELS[periodKey]} />
              <Tile label="Hours lost" value={formatHours(d.hours.lostAbsence + d.hours.lostLate)} sub={<>{formatHours(d.hours.lostAbsence)} absences · {formatHours(d.hours.lostLate)} late{d.hours.sessionsWithoutTimes > 0 && <span className="text-amber-600"> · {d.hours.sessionsWithoutTimes} session(s) without times not counted</span>}</>} />
            </div>

            <section className={`${card} p-5 mb-6`}>
              <h3 className="text-sm font-black uppercase mb-3">Compliance by month</h3>
              <TrendChart points={d.trend} />
            </section>

            <section className={`${card} mb-6 overflow-x-auto`}>
              <h3 className="text-sm font-black uppercase p-4 pb-2">By course</h3>
              <table className="w-full text-left min-w-[760px]">
                <thead className="border-y border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                  <tr>
                    <th className={th}>Course</th>
                    <th className={th}>Compliance</th>
                    <th className={`${th} text-center`}>In date</th>
                    <th className={`${th} text-center`}>Expiring</th>
                    <th className={`${th} text-center`}>Expired</th>
                    <th className={`${th} text-center`}>Never done</th>
                    <th className={`${th} text-center`}>Allocated</th>
                    <th className={`${th} text-center`}>N/A</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {d.courses.map((c, i) => (
                    <Fragment key={c.name}>
                      {(i === 0 || d.courses[i - 1].category !== c.category) && (
                        <tr className="bg-slate-50/60 dark:bg-slate-900/30"><td colSpan={8} className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-500">{c.category}</td></tr>
                      )}
                      <tr className={c.isLda ? 'bg-blue-50/60 dark:bg-blue-950/20' : ''}>
                        <td className="p-3 font-bold text-sm">{c.name}{c.isLda && <span className="ml-2 text-[10px] font-black text-blue-600 dark:text-blue-300">CQC REQUIRED</span>}</td>
                        <td className="p-3"><PctBar pct={c.compliancePct} /></td>
                        <td className="p-3 text-center tabular-nums">{c.counts.in_date}</td>
                        <td className="p-3 text-center tabular-nums">{c.counts.expiring}</td>
                        <td className="p-3 text-center tabular-nums font-bold">{c.counts.expired}</td>
                        <td className="p-3 text-center tabular-nums font-bold">{c.counts.missing}</td>
                        <td className="p-3 text-center tabular-nums">{c.counts.allocated}</td>
                        <td className="p-3 text-center tabular-nums text-slate-500">{c.counts.na}</td>
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </section>

            <section className={`${card} overflow-x-auto print:break-inside-auto`}>
              <div className="flex flex-wrap items-center justify-between gap-2 p-4 pb-2">
                <h3 className="text-sm font-black uppercase">By person – what&rsquo;s needed</h3>
                <label className="flex items-center gap-2 text-xs font-bold print:hidden">
                  <input type="checkbox" checked={onlyActions} onChange={(e) => setOnlyActions(e.target.checked)} className="w-4 h-4 rounded" />
                  Only people with something outstanding
                </label>
              </div>
              <table className="w-full text-left min-w-[700px]">
                <thead className="border-y border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                  <tr>
                    <th className={`${th} w-56`}>Name</th>
                    <th className={`${th} w-44`}>Compliance</th>
                    <th className={th}>Outstanding</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {d.people.filter((p) => !onlyActions || p.actions.length > 0).map((p) => (
                    <tr key={p.name} className="align-top print:break-inside-avoid">
                      <td className="p-3 font-bold text-sm">{p.name}</td>
                      <td className="p-3"><PctBar pct={p.compliancePct} /></td>
                      <td className="p-3">
                        {p.actions.length === 0 ? (
                          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">✓ Up to date</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {p.actions.map((a) => (
                              <span key={`${a.course}-${a.state}`} className={`text-[11px] px-2 py-0.5 rounded-md border ${ACTION_STYLE[a.state]}`}>
                                <strong>{ACTION_LABEL[a.state]}:</strong> {a.course}{describeAction(a) && ` – ${describeAction(a)}`}
                                {a.bookedOn && <span className="ml-1 font-bold text-emerald-700 dark:text-emerald-300">· Booked {day(a.bookedOn)}</span>}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {d.people.length === 0 && <tr><td colSpan={3} className="p-8 text-center text-slate-500">No staff linked to this home.</td></tr>}
                </tbody>
              </table>
            </section>
            <p className="text-xs text-slate-500 mt-3">
              Compliance = training in date (including expiring soon) ÷ training that applies; N/A and &ldquo;Not yet due&rdquo; are left out. &ldquo;Booked&rdquo; means the person is on an upcoming session for that course. Figures follow the Training Matrix.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
