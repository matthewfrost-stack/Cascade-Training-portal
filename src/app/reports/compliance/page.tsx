'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import BackButton from '@/app/components/BackButton';
import UniformButton from '@/app/components/UniformButton';
import { formatHours } from '@/lib/trainingHours';
import type { HomeDetail, HomeSummary, PersonAction } from '@/lib/complianceReport';

type Generated = { at: string; by: string };
type OverviewResponse = { generated: Generated; period: { from: string; to: string }; homes: HomeSummary[]; error?: string };
type DetailResponse = { generated: Generated; detail: HomeDetail; canSnapshot?: boolean; error?: string };
type Check = HomeDetail['checks'][number];
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

/** A snapshot time as a UK date, e.g. "3 Oct 26". */
const checkDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'Europe/London' });
const checkDateTime = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });

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
    <div className="flex items-center gap-2 min-w-[120px] print:min-w-[64px] print:gap-1" title={`${pctText(pct)} – ${b.label}`}>
      <div className="flex-1 h-2 print:h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden print:border print:border-slate-300">
        <div className={`h-full rounded-full ${b.bar}`} style={{ width: `${pct ?? 0}%` }} />
      </div>
      <span className={`text-sm font-black tabular-nums w-14 text-right print:text-[9.5px] print:w-9 ${b.text}`}>{pctText(pct)}</span>
    </div>
  );
}

function Change({ now, before }: { now: number | null; before: HomeSummary['previous'] }) {
  if (!before || now === null || before.compliancePct === null) return null;
  const diff = Math.round((now - before.compliancePct) * 10) / 10;
  if (diff === 0) return <span className="text-[11px] print:text-[7.5px] text-slate-500">no change since last check ({checkDate(before.takenAt)})</span>;
  const up = diff > 0;
  return (
    <span className={`text-[11px] print:text-[7.5px] font-bold ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
      {up ? '▲' : '▼'} {Math.abs(diff)} pts since last check ({checkDate(before.takenAt)})
    </span>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 print:p-2 print:rounded-md print:break-inside-avoid">
      <p className="text-[10px] print:text-[7.5px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`text-3xl print:text-lg font-black mt-1 print:mt-0 tabular-nums ${tone || 'text-slate-900 dark:text-slate-100'}`}>{value}</p>
      {sub && <div className="mt-1 print:mt-0 text-xs print:text-[8.5px] text-slate-500 dark:text-slate-400">{sub}</div>}
    </div>
  );
}

function RegulatorBadge({ regulator }: { regulator: HomeSummary['regulator'] }) {
  if (!regulator) return <span className="text-[10px] font-bold text-amber-600">Not set</span>;
  return (
    <span className={`text-[10px] print:text-[7px] font-black px-2 py-0.5 print:px-1 print:py-0 rounded-full ${regulator === 'CQC' ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300' : 'bg-purple-500/15 text-purple-700 dark:text-purple-300'}`}>
      {regulator}
    </span>
  );
}

/** Compliance % at each check snapshot (oldest first): one series, bars with hover values. */
function TrendChart({ points }: { points: Check[] }) {
  if (points.length === 0) {
    return <p className="text-sm text-slate-500">No check snapshots yet. Use &ldquo;📸 Take snapshot&rdquo; when you check this home to start tracking its progress.</p>;
  }
  return (
    <div>
      <div className="flex items-end gap-2 h-36 print:h-20 border-b border-slate-300 dark:border-slate-600 pl-1" role="img" aria-label="Compliance at each check">
        {points.map((p) => {
          const b = band(p.compliancePct);
          return (
            <div key={p.id} className="flex-1 flex flex-col items-center justify-end h-full group relative min-w-[18px]">
              <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 mb-1 tabular-nums">{pctText(p.compliancePct)}</span>
              <div className={`w-full max-w-[28px] rounded-t ${b.bar}`} style={{ height: `${Math.max(p.compliancePct ?? 0, 1)}%` }} title={`${checkDateTime(p.takenAt)}: ${pctText(p.compliancePct)}${p.ldaPct !== null ? ` · Oliver McGowan ${pctText(p.ldaPct)}` : ''}${p.takenBy ? ` · ${p.takenBy}` : ''}`} />
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 pl-1 mt-1">
        {points.map((p) => (
          <span key={p.id} className="flex-1 text-center text-[10px] text-slate-500 min-w-[18px]">{checkDate(p.takenAt)}</span>
        ))}
      </div>
    </div>
  );
}

/** Difference between two numbers, coloured by whether it is better or worse. */
function Delta({ now, before, higherIsBetter, pct }: { now: number | null; before: number | null; higherIsBetter: boolean; pct?: boolean }) {
  if (now === null || before === null) return <span className="text-slate-400">–</span>;
  const diff = Math.round((now - before) * 10) / 10;
  if (diff === 0) return <span className="text-slate-500">no change</span>;
  const better = higherIsBetter ? diff > 0 : diff < 0;
  return (
    <span className={`font-bold ${better ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
      {diff > 0 ? '▲' : '▼'} {Math.abs(diff)}{pct ? ' pts' : ''}
    </span>
  );
}

/** "Where they are now vs where they were at the last check." */
function SinceLastCheck({ detail, last }: { detail: HomeDetail; last: Check }) {
  const rows: { label: string; then: number | null; now: number | null; higherIsBetter: boolean; pct?: boolean }[] = [
    { label: 'Compliance', then: last.compliancePct, now: detail.compliancePct, higherIsBetter: true, pct: true },
    { label: 'Expired', then: last.expired, now: detail.counts.expired, higherIsBetter: false },
    { label: 'Never completed', then: last.missing, now: detail.counts.missing, higherIsBetter: false },
    { label: 'Expiring in 60 days', then: last.expiring, now: detail.counts.expiring, higherIsBetter: false },
    { label: 'Allocated, not done', then: last.allocated, now: detail.counts.allocated, higherIsBetter: false },
    ...(detail.ldaApplies ? [{ label: 'Oliver McGowan', then: last.ldaPct, now: detail.ldaPct, higherIsBetter: true, pct: true }] : []),
  ];
  const show = (v: number | null, pct?: boolean) => (pct ? pctText(v) : v === null ? '–' : String(v));
  return (
    <div className="overflow-x-auto">
      <p className="text-xs print:text-[8px] text-slate-500 mb-2 print:mb-1">
        Last check: <strong>{checkDateTime(last.takenAt)}</strong>{last.takenBy && <> by {last.takenBy}</>}{last.note && <> – &ldquo;{last.note}&rdquo;</>}
      </p>
      <table className="w-full text-left text-sm print:text-[9px] min-w-[420px] print:min-w-0">
        <thead className="border-b border-slate-200 dark:border-slate-700">
          <tr className="text-[11px] print:text-[7.5px] uppercase text-slate-500">
            <th className="py-1.5 pr-3 font-bold">Measure</th>
            <th className="py-1.5 px-3 font-bold text-right">At last check</th>
            <th className="py-1.5 px-3 font-bold text-right">Now</th>
            <th className="py-1.5 pl-3 font-bold text-right">Change</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
          {rows.map((r) => (
            <tr key={r.label}>
              <td className="py-1.5 print:py-0.5 pr-3 font-bold">{r.label}</td>
              <td className="py-1.5 print:py-0.5 px-3 text-right tabular-nums">{show(r.then, r.pct)}</td>
              <td className="py-1.5 print:py-0.5 px-3 text-right tabular-nums font-bold">{show(r.now, r.pct)}</td>
              <td className="py-1.5 print:py-0.5 pl-3 text-right tabular-nums"><Delta now={r.now} before={r.then} higherIsBetter={r.higherIsBetter} pct={r.pct} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Every check snapshot for the home, newest first, with the change from the check before. */
function CheckHistory({ checks }: { checks: Check[] }) {
  const newestFirst = [...checks].reverse();
  const cell = 'p-2 print:px-1 print:py-0.5';
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm print:text-[8.5px] min-w-[760px] print:min-w-0">
        <thead className="border-y border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
          <tr className="text-[11px] print:text-[7.5px] uppercase text-slate-500">
            <th className={`${cell} font-bold`}>Date</th>
            <th className={`${cell} font-bold`}>Taken by</th>
            <th className={`${cell} font-bold`}>Note</th>
            <th className={`${cell} font-bold text-right`}>Compliance</th>
            <th className={`${cell} font-bold text-right`}>Change</th>
            <th className={`${cell} font-bold text-center`}>Expired</th>
            <th className={`${cell} font-bold text-center`}>Never done</th>
            <th className={`${cell} font-bold text-center`}>Expiring</th>
            <th className={`${cell} font-bold text-center`}>Oliver McGowan</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
          {newestFirst.map((c, i) => {
            const before = newestFirst[i + 1];
            return (
              <tr key={c.id} className="align-top print:break-inside-avoid">
                <td className={`${cell} whitespace-nowrap`}>{checkDateTime(c.takenAt)}</td>
                <td className={cell}>{c.takenBy || <span className="text-slate-400">–</span>}</td>
                <td className={`${cell} text-slate-600 dark:text-slate-300`}>{c.note || <span className="text-slate-400">–</span>}</td>
                <td className={`${cell} text-right font-black tabular-nums ${band(c.compliancePct).text}`}>{pctText(c.compliancePct)}</td>
                <td className={`${cell} text-right tabular-nums`}>{before ? <Delta now={c.compliancePct} before={before.compliancePct} higherIsBetter pct /> : <span className="text-slate-400">first</span>}</td>
                <td className={`${cell} text-center tabular-nums`}>{c.expired}</td>
                <td className={`${cell} text-center tabular-nums`}>{c.missing}</td>
                <td className={`${cell} text-center tabular-nums`}>{c.expiring}</td>
                <td className={`${cell} text-center tabular-nums`}>{pctText(c.ldaPct)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Compact "who needs what" table for the PDF: one row per person, one column per state. */
function PrintPeople({ people }: { people: HomeDetail['people'] }) {
  const short = (iso?: string | null) =>
    iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' }) : '';
  const withActions = people.filter((p) => p.actions.length > 0);
  const upToDate = people.filter((p) => p.actions.length === 0).map((p) => p.name);
  const cols: PersonAction['state'][] = ['expired', 'missing', 'expiring', 'allocated'];
  const list = (p: HomeDetail['people'][number], state: PersonAction['state']) =>
    p.actions
      .filter((a) => a.state === state)
      .map((a) => {
        const date = a.state === 'expired' ? (a.noExpiryDate ? 'no expiry date' : short(a.expiry)) : a.state === 'expiring' ? short(a.expiry) : '';
        return (
          <div key={a.course} className="leading-tight">
            {a.course}
            {date && <span className="text-slate-500"> ({date})</span>}
            {a.bookedOn && <span className="font-bold text-emerald-700"> · booked {short(a.bookedOn)}</span>}
          </div>
        );
      });
  return (
    <section className="hidden print:block">
      <h3 className="text-[10px] font-black uppercase mb-1">By person – what&rsquo;s needed</h3>
      <table className="w-full text-left border-collapse text-[8.5px]">
        <thead>
          <tr className="border-y border-slate-400 bg-slate-100">
            <th className="px-1 py-1 w-[18%] font-bold uppercase text-[7.5px]">Name</th>
            <th className="px-1 py-1 w-[7%] font-bold uppercase text-[7.5px] text-right">Comp.</th>
            {cols.map((c) => <th key={c} className="px-1 py-1 w-[18.75%] font-bold uppercase text-[7.5px]">{ACTION_LABEL[c]}</th>)}
          </tr>
        </thead>
        <tbody>
          {withActions.map((p) => (
            <tr key={p.name} className="border-b border-slate-200 align-top break-inside-avoid">
              <td className="px-1 py-1 font-bold">{p.name}</td>
              <td className={`px-1 py-1 text-right font-bold tabular-nums ${band(p.compliancePct).text}`}>{pctText(p.compliancePct)}</td>
              {cols.map((c) => { const items = list(p, c); return <td key={c} className="px-1 py-1">{items.length ? items : <span className="text-slate-300">–</span>}</td>; })}
            </tr>
          ))}
        </tbody>
      </table>
      {upToDate.length > 0 && (
        <p className="text-[8.5px] mt-1"><strong>Fully up to date ({upToDate.length}):</strong> {upToDate.join(', ')}</p>
      )}
    </section>
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
    head(['Check snapshot', 'Compliance', 'Oliver McGowan', 'Expired', 'Never completed', 'Expiring', 'Taken by', 'Note']),
    ...[...detail.checks].reverse().map((c) => [
      checkDateTime(c.takenAt),
      { value: pctCell(c.compliancePct), type: Number, format: '0.0%' },
      { value: pctCell(c.ldaPct), type: Number, format: '0.0%' },
      c.expired, c.missing, c.expiring, c.takenBy || '', c.note || '',
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
    { data: summary, sheet: 'Summary', columns: [{ width: 46 }, { width: 40 }, { width: 16 }, { width: 10 }, { width: 16 }, { width: 10 }, { width: 22 }, { width: 40 }] },
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
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [snapshotNote, setSnapshotNote] = useState('');
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

  const takeSnapshot = async () => {
    if (!homeId) return;
    setSnapshotting(true);
    setNotice(null);
    setError(null);
    try {
      const response = await fetch('/api/reports/compliance/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId: homeId, note: snapshotNote }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Snapshot failed.');
      setSnapshotOpen(false);
      setSnapshotNote('');
      await load();
      setNotice(`Snapshot saved (${pctText(body.snapshot?.compliancePct ?? null)}). It's now the starting point for the next check.`);
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
  const card = 'rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm print:shadow-none print:rounded-md print:overflow-visible';
  const th = 'p-3 text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400 print:px-1.5 print:py-1 print:text-[8px]';

  return (
    <main className={`min-h-screen print:min-h-0 p-4 md:p-8 bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-slate-100 print:bg-white print:p-0`} data-theme={isDark ? 'dark' : 'light'}>
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
        <div className="hidden print:block mb-3 border-b-2 border-slate-800 pb-2">
          <h1 className="text-lg font-black leading-tight">Training compliance report{d ? ` – ${d.locationName}` : ' – all homes'}</h1>
          <p className="text-[9px] text-slate-600">
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
              <UniformButton variant="secondary" size="sm" onClick={() => window.print()}>🖨️ Download PDF</UniformButton>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 print:grid-cols-4 gap-4 print:gap-2 mb-6 print:mb-3">
              <Tile label="Overall compliance" value={pctText(totals.pct)} tone={band(totals.pct).text} sub={`${band(totals.pct).label} · ${homes.length} home${homes.length === 1 ? '' : 's'}`} />
              <Tile label="Expired" value={String(totals.expired)} sub={`${totals.missing} never completed`} />
              <Tile label="Hours delivered" value={formatHours(totals.delivered)} sub={PERIOD_LABELS[periodKey]} />
              <Tile label="Hours lost" value={formatHours(totals.lostAbsence + totals.lostLate)} sub={`${formatHours(totals.lostAbsence)} absences · ${formatHours(totals.lostLate)} late`} />
            </div>

            <div className={`${card} overflow-x-auto`}>
              <table className="w-full text-left min-w-[900px] print:min-w-0">
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
                    <tr key={h.locationId} className="print:break-inside-avoid hover:bg-slate-50 dark:hover:bg-slate-700/40 cursor-pointer" onClick={() => openHome(h.locationId)}>
                      <td className="p-3 print:px-1.5 print:py-1 print:text-[9.5px]">
                        <button type="button" className="font-bold text-left hover:underline" onClick={(e) => { e.stopPropagation(); openHome(h.locationId); }}>{h.locationName}</button>
                        <div className="flex items-center gap-2 mt-0.5"><RegulatorBadge regulator={h.regulator} /><span className="text-[11px] print:text-[7.5px] text-slate-500">{h.staffCount} staff</span></div>
                      </td>
                      <td className="p-3 print:px-1.5 print:py-1 print:text-[9.5px]"><PctBar pct={h.compliancePct} /><Change now={h.compliancePct} before={h.previous} /></td>
                      <td className="p-3 print:px-1.5 print:py-1 print:text-[9.5px] text-center font-bold tabular-nums">{h.counts.expired}</td>
                      <td className="p-3 print:px-1.5 print:py-1 print:text-[9.5px] text-center font-bold tabular-nums">{h.counts.missing}</td>
                      <td className="p-3 print:px-1.5 print:py-1 print:text-[9.5px] text-center tabular-nums">{h.counts.expiring}</td>
                      <td className="p-3 print:px-1.5 print:py-1 print:text-[9.5px] text-center tabular-nums">{h.counts.allocated}</td>
                      <td className="p-3 print:px-1.5 print:py-1 print:text-[9.5px] text-center tabular-nums">{h.ldaApplies ? pctText(h.ldaPct) : <span className="text-slate-400">–</span>}</td>
                      <td className="p-3 print:px-1.5 print:py-1 print:text-[9.5px] text-center tabular-nums">{formatHours(h.hours.delivered)}</td>
                      <td className="p-3 print:px-1.5 print:py-1 print:text-[9.5px] text-center tabular-nums">{formatHours(h.hours.lostAbsence + h.hours.lostLate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs print:text-[8px] text-slate-500 mt-3 print:mt-2">
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
                {detail.canSnapshot && (
                  <UniformButton variant="secondary" size="sm" onClick={() => setSnapshotOpen((v) => !v)} disabled={snapshotting}>📸 Take snapshot</UniformButton>
                )}
                <UniformButton variant="secondary" size="sm" onClick={() => window.print()}>🖨️ Download PDF</UniformButton>
                <UniformButton variant="primary" size="sm" disabled={exporting} onClick={async () => {
                  setExporting(true);
                  try { await downloadExcel(d, detail.generated); } catch { setError('Could not create the Excel file.'); } finally { setExporting(false); }
                }}>
                  {exporting ? 'Preparing…' : '📊 Download Excel'}
                </UniformButton>
              </div>
            </div>

            {snapshotOpen && detail.canSnapshot && (
              <div className={`${card} p-4 mb-4 print:hidden`}>
                <p className="text-sm font-bold mb-1">Take a snapshot of {d.locationName} as it is now</p>
                <p className="text-xs text-slate-500 mb-3">Saves today&rsquo;s figures to this home&rsquo;s check history, with your name. Earlier snapshots are kept, and the next check will be compared with this one.</p>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={snapshotNote}
                    onChange={(e) => setSnapshotNote(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !snapshotting) void takeSnapshot(); }}
                    maxLength={500}
                    placeholder="Note (optional), e.g. Quarterly site check"
                    aria-label="Snapshot note"
                    className={`${select} flex-1 min-w-[240px]`}
                  />
                  <UniformButton variant="primary" size="sm" onClick={() => void takeSnapshot()} disabled={snapshotting}>{snapshotting ? 'Saving…' : 'Save snapshot'}</UniformButton>
                  <UniformButton variant="secondary" size="sm" onClick={() => setSnapshotOpen(false)} disabled={snapshotting}>Cancel</UniformButton>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 print:grid-cols-4 gap-4 print:gap-2 mb-4 print:mb-2">
              <Tile label="Compliance" value={pctText(d.compliancePct)} tone={band(d.compliancePct).text} sub={<>{band(d.compliancePct).label} · {d.staffCount} staff<br /><Change now={d.compliancePct} before={d.previous} /></>} />
              <Tile label="Expired" value={String(d.counts.expired)} sub={`${d.counts.missing} never completed`} tone="text-red-600 dark:text-red-400" />
              <Tile label="Expiring in 60 days" value={String(d.counts.expiring)} sub={`${d.counts.allocated} allocated, not done`} />
              <Tile label="Oliver McGowan" value={d.ldaApplies ? pctText(d.ldaPct) : '–'} tone={d.ldaApplies ? band(d.ldaPct).text : undefined} sub={d.ldaApplies ? 'Learning disability & autism training' : 'Not on this home’s matrix'} />
            </div>
            <div className="grid grid-cols-2 gap-4 print:gap-2 mb-6 print:mb-3">
              <Tile label="Hours delivered" value={formatHours(d.hours.delivered)} sub={PERIOD_LABELS[periodKey]} />
              <Tile label="Hours lost" value={formatHours(d.hours.lostAbsence + d.hours.lostLate)} sub={<>{formatHours(d.hours.lostAbsence)} absences · {formatHours(d.hours.lostLate)} late{d.hours.sessionsWithoutTimes > 0 && <span className="text-amber-600"> · {d.hours.sessionsWithoutTimes} session(s) without times not counted</span>}</>} />
            </div>

            {d.checks.length > 0 && (
              <section className={`${card} p-5 print:p-2 mb-6 print:mb-3 print:break-inside-avoid`}>
                <h3 className="text-sm print:text-[10px] font-black uppercase mb-3 print:mb-1">Since the last check</h3>
                <SinceLastCheck detail={d} last={d.checks[d.checks.length - 1]} />
              </section>
            )}

            <section className={`${card} p-5 print:p-2 mb-6 print:mb-3 print:break-inside-avoid`}>
              <h3 className="text-sm print:text-[10px] font-black uppercase mb-3 print:mb-1">Compliance at each check</h3>
              <TrendChart points={d.checks} />
            </section>

            {d.checks.length > 0 && (
              <section className={`${card} mb-6 print:mb-3`}>
                <h3 className="text-sm print:text-[10px] font-black uppercase p-4 pb-2 print:p-2 print:pb-1">Check history</h3>
                <CheckHistory checks={d.checks} />
              </section>
            )}

            <section className={`${card} mb-6 print:mb-3 overflow-x-auto`}>
              <h3 className="text-sm print:text-[10px] font-black uppercase p-4 pb-2 print:p-2 print:pb-1">By course</h3>
              <table className="w-full text-left min-w-[760px] print:min-w-0">
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
                      <tr className={`print:break-inside-avoid ${c.isLda ? 'bg-blue-50/60 dark:bg-blue-950/20' : ''}`}>
                        <td className="p-3 print:px-1.5 print:py-1 print:text-[9.5px] font-bold text-sm">{c.name}{c.isLda && <span className="ml-2 text-[10px] font-black text-blue-600 dark:text-blue-300">CQC REQUIRED</span>}</td>
                        <td className="p-3 print:px-1.5 print:py-1 print:text-[9.5px]"><PctBar pct={c.compliancePct} /></td>
                        <td className="p-3 print:px-1.5 print:py-1 print:text-[9.5px] text-center tabular-nums">{c.counts.in_date}</td>
                        <td className="p-3 print:px-1.5 print:py-1 print:text-[9.5px] text-center tabular-nums">{c.counts.expiring}</td>
                        <td className="p-3 print:px-1.5 print:py-1 print:text-[9.5px] text-center tabular-nums font-bold">{c.counts.expired}</td>
                        <td className="p-3 print:px-1.5 print:py-1 print:text-[9.5px] text-center tabular-nums font-bold">{c.counts.missing}</td>
                        <td className="p-3 print:px-1.5 print:py-1 print:text-[9.5px] text-center tabular-nums">{c.counts.allocated}</td>
                        <td className="p-3 print:px-1.5 print:py-1 print:text-[9.5px] text-center tabular-nums text-slate-500">{c.counts.na}</td>
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </section>

            <section className={`${card} overflow-x-auto print:hidden`}>
              <div className="flex flex-wrap items-center justify-between gap-2 p-4 pb-2">
                <h3 className="text-sm font-black uppercase">By person – what&rsquo;s needed</h3>
                <label className="flex items-center gap-2 text-xs font-bold print:hidden">
                  <input type="checkbox" checked={onlyActions} onChange={(e) => setOnlyActions(e.target.checked)} className="w-4 h-4 rounded" />
                  Only people with something outstanding
                </label>
              </div>
              <table className="w-full text-left min-w-[700px] print:min-w-0">
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
                      <td className="p-3 print:px-1.5 print:py-1 print:text-[9.5px] font-bold text-sm">{p.name}</td>
                      <td className="p-3 print:px-1.5 print:py-1 print:text-[9.5px]"><PctBar pct={p.compliancePct} /></td>
                      <td className="p-3 print:px-1.5 print:py-1 print:text-[9.5px]">
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
            <PrintPeople people={d.people} />
            <p className="text-xs print:text-[8px] text-slate-500 mt-3 print:mt-2">
              Compliance = training in date (including expiring soon) ÷ training that applies; N/A and &ldquo;Not yet due&rdquo; are left out. &ldquo;Booked&rdquo; means the person is on an upcoming session for that course. Figures follow the Training Matrix.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
