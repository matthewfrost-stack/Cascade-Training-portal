'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import BackButton from '@/app/components/BackButton';
import { hasPermission } from '@/lib/permissions';
import { useCurrentUserProfile } from '@/lib/useCurrentUserProfile';
import UniformButton from '@/app/components/UniformButton';
import {
  summariseQuestion,
  type BeforeAfter,
  type CourseRate,
  type FeedbackAnswer,
  type FeedbackQuestion,
  type FeedbackResponseRow,
  type QuestionSummary,
} from '@/lib/feedbackForm';

type ResultsResponse = {
  period: { from: string; to: string };
  questions: FeedbackQuestion[];
  responses: FeedbackResponseRow[];
  rates: CourseRate[];
  courseNames: string[];
  error?: string;
};

type PeriodKey = '3m' | '12m' | 'this-year' | 'last-year' | 'all';
const PERIOD_LABELS: Record<PeriodKey, string> = { '3m': 'Last 3 months', '12m': 'Last 12 months', 'this-year': 'This year', 'last-year': 'Last year', all: 'All time' };

function ukToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
}

function periodRange(key: PeriodKey) {
  const today = ukToday();
  const year = Number(today.slice(0, 4));
  const back = (months: number) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - months);
    return d.toISOString().slice(0, 10);
  };
  if (key === '3m') return { from: back(3), to: today };
  if (key === 'this-year') return { from: `${year}-01-01`, to: today };
  if (key === 'last-year') return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
  if (key === 'all') return { from: '2000-01-01', to: today };
  return { from: back(12), to: today };
}

const day = (iso?: string | null) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
const one = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

function answerText(q: FeedbackQuestion, value: FeedbackAnswer | undefined) {
  if (value === undefined) return '–';
  if (q.type === 'before_after') { const v = value as BeforeAfter; return `${v.before} → ${v.after}`; }
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

// ---------- pieces ----------

const card = 'rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm';

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className={`${card} p-4`}>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">{label}</p>
      <p className="text-3xl font-black mt-1 tabular-nums text-slate-900 dark:text-slate-100">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sub}</p>}
    </div>
  );
}

function Bar({ value, max, tone }: { value: number; max: number; tone: string }) {
  return (
    <div className="flex-1 h-3 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${max ? (value / max) * 100 : 0}%` }} />
    </div>
  );
}

function QuestionCard({ q, s, total }: { q: FeedbackQuestion; s: QuestionSummary; total: number }) {
  return (
    <section className={`${card} p-5`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h3 className="font-bold text-slate-900 dark:text-slate-100">{q.label}</h3>
        <span className="text-xs text-slate-500">{s.answered} of {total} answered</span>
      </div>

      {s.kind === 'before_after' && (s.answered === 0 ? <p className="text-sm text-slate-500">No answers yet.</p> : (
        <div className="space-y-2">
          {[{ name: 'Before', v: s.before, tone: 'bg-slate-400' }, { name: 'After', v: s.after, tone: 'bg-blue-500' }].map((row) => (
            <div key={row.name} className="flex items-center gap-3 text-sm">
              <span className="w-14 text-slate-500">{row.name}</span>
              <Bar value={row.v} max={10} tone={row.tone} />
              <span className="w-14 text-right font-bold tabular-nums">{one(row.v)}/10</span>
            </div>
          ))}
          <p className={`text-sm font-bold ${s.after - s.before >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
            Average change: {s.after - s.before >= 0 ? '+' : ''}{one(s.after - s.before)}
          </p>
        </div>
      ))}

      {s.kind === 'scale' && (s.answered === 0 ? <p className="text-sm text-slate-500">No answers yet.</p> : (
        <div className="flex items-center gap-3 text-sm">
          <span className="w-14 text-slate-500">Average</span>
          <Bar value={s.average} max={10} tone="bg-blue-500" />
          <span className="w-14 text-right font-bold tabular-nums">{one(s.average)}/10</span>
        </div>
      ))}

      {s.kind === 'counts' && (
        <div className="space-y-1.5">
          {s.counts.map((c) => (
            <div key={c.option} className="flex items-center gap-3 text-sm">
              <span className="w-36 shrink-0 truncate" title={c.option}>{c.option}</span>
              <Bar value={c.count} max={Math.max(1, ...s.counts.map((x) => x.count))} tone={c.positive === undefined ? 'bg-blue-500' : c.positive ? 'bg-emerald-500' : 'bg-red-500'} />
              <span className="w-20 text-right tabular-nums"><strong>{c.count}</strong> <span className="text-slate-500">({pct(c.count, s.answered)}%)</span></span>
            </div>
          ))}
          {s.counts.some((c) => c.positive !== undefined) && <p className="text-xs text-slate-500 pt-1">Green = positive word, red = negative word.</p>}
        </div>
      )}

      {s.kind === 'text' && (s.items.length === 0 ? <p className="text-sm text-slate-500">No comments.</p> : (
        <ul className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {s.items.map((item, i) => (
            <li key={i} className="rounded-lg bg-slate-50 dark:bg-slate-900/50 p-3">
              <p className="text-sm whitespace-pre-wrap">{item.text}</p>
              <p className="text-[11px] text-slate-500 mt-1">{item.name} · {item.courseName}{item.date ? ` · ${day(item.date)}` : ''}</p>
            </li>
          ))}
        </ul>
      ))}
    </section>
  );
}

// ---------- Excel ----------

async function downloadExcel(data: ResultsResponse, label: string) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const bold = { fontWeight: 'bold' as const };
  const headers = ['Submitted', 'Course', 'Session date', 'Name'];
  for (const q of data.questions) {
    if (q.type === 'before_after') headers.push(`${q.label} – before`, `${q.label} – after`);
    else headers.push(q.label);
  }
  const rows = data.responses.map((r) => {
    const cells: (string | number)[] = [new Date(r.submittedAt).toLocaleString('en-GB'), r.courseName, r.eventDate ? day(r.eventDate) : '', r.name];
    for (const q of data.questions) {
      const v = r.answers[q.id];
      if (q.type === 'before_after') { const ba = v as BeforeAfter | undefined; cells.push(ba?.before ?? '', ba?.after ?? ''); }
      else if (typeof v === 'number') cells.push(v);
      else cells.push(v === undefined ? '' : Array.isArray(v) ? v.join(', ') : String(v));
    }
    return cells;
  });
  const rateRows = [
    ['Course', 'Sessions', 'Attended', 'Responded', 'Response rate'].map((value) => ({ value, ...bold })),
    ...data.rates.map((r) => [r.courseName, r.sessions, r.attended, r.responded, { value: r.attended ? r.responded / r.attended : 0, type: Number, format: '0%' }]),
  ];
  await writeXlsxFile([
    { data: [headers.map((value) => ({ value, ...bold })), ...rows], sheet: 'Responses', columns: headers.map((h, i) => ({ width: i < 4 ? 18 : Math.min(40, Math.max(12, h.length)) })), stickyRowsCount: 1 },
    { data: rateRows, sheet: 'Response rates', columns: [{ width: 40 }, { width: 10 }, { width: 10 }, { width: 11 }, { width: 14 }] },
  ]).toFile(`Training feedback - ${label} - ${ukToday()}.xlsx`);
}

// ---------- page ----------

export default function FeedbackResultsPage() {
  const router = useRouter();
  const { profile } = useCurrentUserProfile();
  const canDelete = hasPermission(profile?.role_tier || null, 'FEEDBACK_RESULTS', 'canDelete');
  const [periodKey, setPeriodKey] = useState<PeriodKey>('12m');
  const [course, setCourse] = useState('');
  const [data, setData] = useState<ResultsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { from, to } = periodRange(periodKey);
    const qs = new URLSearchParams({ from, to, ...(course ? { course } : {}) });
    try {
      const response = await fetch(`/api/feedback/results?${qs.toString()}`);
      const body = await response.json().catch(() => ({}));
      if (response.status === 403) throw new Error('Only admins and schedulers can see feedback results.');
      if (!response.ok) throw new Error(body.error || 'Could not load feedback results.');
      setData(body as ResultsResponse);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load feedback results.');
    } finally {
      setLoading(false);
    }
  }, [periodKey, course]);

  useEffect(() => { void load(); }, [load]);

  const deleteResponse = async (id: string) => {
    setDeleting(true);
    try {
      const response = await fetch(`/api/feedback/results?id=${id}`, { method: 'DELETE' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not delete the response.');
      setData((prev) => (prev ? { ...prev, responses: prev.responses.filter((r) => r.id !== id) } : prev));
      setExpanded(null);
      setConfirmDelete(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete the response.');
    } finally {
      setDeleting(false);
    }
  };

  const totals = useMemo(() => {
    const rates = data?.rates || [];
    const attended = rates.reduce((a, r) => a + r.attended, 0);
    const responded = rates.reduce((a, r) => a + r.responded, 0);
    const anonymous = (data?.responses || []).filter((r) => r.anonymous).length;
    return { attended, responded, anonymous, sessions: rates.reduce((a, r) => a + r.sessions, 0) };
  }, [data]);

  const select = 'bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500';
  const responses = data?.responses || [];

  return (
    <main className="min-h-screen p-4 md:p-8 bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
          <BackButton to="/reports" />
          <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tighter">Feedback Results</h1>
          <UniformButton variant="secondary" size="sm" onClick={() => router.push('/feedback')}>📝 Open the form</UniformButton>
        </div>

        <div className={`${card} p-4 mb-6 flex flex-wrap items-end gap-4`}>
          <div>
            <label htmlFor="fb-period" className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Sessions in</label>
            <select id="fb-period" value={periodKey} onChange={(e) => setPeriodKey(e.target.value as PeriodKey)} className={select}>
              {Object.entries(PERIOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="min-w-[220px] flex-1 max-w-md">
            <label htmlFor="fb-course" className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Course</label>
            <select id="fb-course" value={course} onChange={(e) => setCourse(e.target.value)} className={`${select} w-full`}>
              <option value="">All courses</option>
              {(data?.courseNames || []).map((c) => <option key={c} value={c}>{c}</option>)}
              {course && data && !data.courseNames.includes(course) && <option value={course}>{course}</option>}
            </select>
          </div>
          <div className="flex-1" />
          <UniformButton variant="primary" size="sm" disabled={!data || responses.length === 0 || exporting} onClick={async () => {
            if (!data) return;
            setExporting(true);
            try { await downloadExcel(data, course || 'all courses'); } catch { setError('Could not create the Excel file.'); } finally { setExporting(false); }
          }}>
            {exporting ? 'Preparing…' : '📊 Download Excel'}
          </UniformButton>
        </div>

        {error && <div className="mb-4 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-900/50 p-3 text-sm text-red-700 dark:text-red-200">{error}</div>}
        {loading && <p className="text-center text-slate-500 py-16">Loading feedback…</p>}

        {!loading && data && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Tile label="Responses" value={String(responses.length)} sub={totals.anonymous ? `${totals.anonymous} anonymous` : undefined} />
              <Tile label="Response rate" value={totals.attended ? `${pct(totals.responded, totals.attended)}%` : '–'} sub={`${totals.responded} of ${totals.attended} attendees`} />
              <Tile label="Sessions" value={String(totals.sessions)} sub="with attendance recorded" />
              <Tile label="Courses" value={String(data.rates.length)} sub={PERIOD_LABELS[periodKey]} />
            </div>

            {responses.length === 0 ? (
              <div className={`${card} p-10 text-center text-slate-500`}>No feedback for this period{course ? ' and course' : ''} yet.</div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {data.questions.map((q) => (
                  <div key={q.id} className={q.type === 'text' || q.type === 'words' ? 'lg:col-span-2' : ''}>
                    <QuestionCard q={q} s={summariseQuestion(q, responses)} total={responses.length} />
                  </div>
                ))}
              </div>
            )}

            {data.rates.length > 0 && (
              <section className={`${card} overflow-x-auto`}>
                <h2 className="text-sm font-black uppercase p-4 pb-2">Response rate by course</h2>
                <table className="w-full text-left text-sm min-w-[560px]">
                  <thead className="border-y border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-[11px] uppercase text-slate-500">
                    <tr>
                      <th className="p-3">Course</th><th className="p-3 text-center">Sessions</th><th className="p-3 text-center">Attended</th>
                      <th className="p-3 text-center">Responded</th><th className="p-3">Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {data.rates.map((r) => (
                      <tr key={r.courseName}>
                        <td className="p-3 font-bold">{r.courseName}</td>
                        <td className="p-3 text-center tabular-nums">{r.sessions}</td>
                        <td className="p-3 text-center tabular-nums">{r.attended}</td>
                        <td className="p-3 text-center tabular-nums">{r.responded}</td>
                        <td className="p-3"><div className="flex items-center gap-2 min-w-[140px]"><Bar value={r.responded} max={r.attended} tone="bg-blue-500" /><span className="w-10 text-right font-bold tabular-nums">{pct(r.responded, r.attended)}%</span></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-xs text-slate-500 p-4 pt-2">Attended = signed in on the register. Responded includes anonymous responses.</p>
              </section>
            )}

            {responses.length > 0 && (
              <section className={card}>
                <h2 className="text-sm font-black uppercase p-4 pb-2">All responses ({responses.length})</h2>
                <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                  {responses.map((r) => (
                    <li key={r.id}>
                      <button type="button" aria-expanded={expanded === r.id} onClick={() => { setExpanded(expanded === r.id ? null : r.id); setConfirmDelete(null); }}
                        className="w-full px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40">
                        <span className={`font-bold text-sm ${r.anonymous ? 'italic text-slate-500' : ''}`}>{r.name}</span>
                        <span className="text-xs text-slate-500">{r.courseName}{r.eventDate ? ` · ${day(r.eventDate)}` : ''}</span>
                        <span className="ml-auto text-xs text-slate-400">{expanded === r.id ? '▲' : '▼'}</span>
                      </button>
                      {expanded === r.id && (
                        <div className="px-4 pb-4">
                          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                            {data.questions.map((q) => (
                              <div key={q.id} className={q.type === 'text' || q.type === 'words' ? 'sm:col-span-2' : ''}>
                                <dt className="text-[11px] font-bold uppercase text-slate-500">{q.label}{q.type === 'before_after' ? ' (before → after)' : ''}</dt>
                                <dd className="whitespace-pre-wrap">{answerText(q, r.answers[q.id])}</dd>
                              </div>
                            ))}
                          </dl>
                          <div className="flex justify-end items-center gap-2 mt-3">
                            <span className="text-[11px] text-slate-500 mr-auto">Sent {new Date(r.submittedAt).toLocaleString('en-GB')}</span>
                            {!canDelete ? null : confirmDelete === r.id ? (
                              <>
                                <span className="text-xs text-slate-500">Delete this response?</span>
                                <UniformButton variant="danger" size="sm" disabled={deleting} onClick={() => void deleteResponse(r.id)}>{deleting ? 'Deleting…' : 'Yes, delete'}</UniformButton>
                                <UniformButton variant="secondary" size="sm" onClick={() => setConfirmDelete(null)}>Cancel</UniformButton>
                              </>
                            ) : (
                              <UniformButton variant="secondary" size="sm" onClick={() => setConfirmDelete(r.id)}>Delete response</UniformButton>
                            )}
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
