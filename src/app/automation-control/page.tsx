'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import BackButton from '@/app/components/BackButton';
import UniformButton from '@/app/components/UniformButton';
import FeedbackQuestionFields from '@/app/components/FeedbackQuestionFields';
import { useCurrentUserProfile } from '@/lib/useCurrentUserProfile';
import type { FeedbackAnswer, FeedbackAnswers, FeedbackQuestion, QuestionType } from '@/lib/feedbackForm';
import type { EmailSettings, SendNowSession } from '@/app/api/feedback/settings/route';

type Tab = 'questions' | 'emails' | 'send';
type Loaded = { questions: FeedbackQuestion[]; defaultQuestions: FeedbackQuestion[]; emails: EmailSettings; sessions: SendNowSession[] };

const TYPE_LABELS: Record<QuestionType, string> = {
  before_after: 'Score 1–10, before and after',
  scale: 'Score 1–10',
  choice: 'Pick one answer',
  words: 'Pick several words',
  text: 'Written answer',
};

const card = 'rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm';
const input = 'w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500';
const smallLabel = 'block text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1';

const lines = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${on ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-slate-600'}`}>
      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${on ? 'left-7' : 'left-1'}`} />
    </button>
  );
}

// ---------- Questions tab ----------

function QuestionEditor({ q, index, count, onChange, onMove, onRemove }: {
  q: FeedbackQuestion; index: number; count: number;
  onChange: (q: FeedbackQuestion) => void; onMove: (dir: -1 | 1) => void; onRemove: () => void;
}) {
  const [optionsText, setOptionsText] = useState((q.options || []).join('\n'));
  const [positiveText, setPositiveText] = useState((q.positive || []).join('\n'));
  const setType = (type: QuestionType) => {
    const next: FeedbackQuestion = { id: q.id, label: q.label, required: q.required, type };
    if (type === 'choice') next.options = q.options?.length ? q.options : ['Yes', 'No'];
    if (type === 'words') { next.options = q.options?.length ? q.options : []; next.minPicks = 1; next.positive = q.positive || []; }
    if (type === 'scale' || type === 'before_after') { next.lowLabel = q.lowLabel; next.highLabel = q.highLabel; }
    setOptionsText((next.options || []).join('\n'));
    onChange(next);
  };

  return (
    <li className={`${card} p-4`}>
      <div className="flex items-start gap-3">
        <span className="mt-2 w-6 text-center text-xs font-black text-slate-400">{index + 1}</span>
        <div className="flex-1 space-y-3 min-w-0">
          <div>
            <label className={smallLabel} htmlFor={`q-label-${q.id}`}>Question</label>
            <input id={`q-label-${q.id}`} className={input} value={q.label} maxLength={200} onChange={(e) => onChange({ ...q, label: e.target.value })} />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px]">
              <label className={smallLabel} htmlFor={`q-type-${q.id}`}>Answer type</label>
              <select id={`q-type-${q.id}`} className={input} value={q.type} onChange={(e) => setType(e.target.value as QuestionType)}>
                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold pb-2">
              <input type="checkbox" className="w-4 h-4" checked={q.required} onChange={(e) => onChange({ ...q, required: e.target.checked })} />
              Must be answered
            </label>
          </div>

          {(q.type === 'scale' || q.type === 'before_after') && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={smallLabel} htmlFor={`q-low-${q.id}`}>1 means… (optional)</label>
                <input id={`q-low-${q.id}`} className={input} value={q.lowLabel || ''} placeholder="e.g. Not confident" onChange={(e) => onChange({ ...q, lowLabel: e.target.value || undefined })} />
              </div>
              <div>
                <label className={smallLabel} htmlFor={`q-high-${q.id}`}>10 means… (optional)</label>
                <input id={`q-high-${q.id}`} className={input} value={q.highLabel || ''} placeholder="e.g. Very confident" onChange={(e) => onChange({ ...q, highLabel: e.target.value || undefined })} />
              </div>
            </div>
          )}

          {(q.type === 'choice' || q.type === 'words') && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={smallLabel} htmlFor={`q-opts-${q.id}`}>Answers to pick from (one per line)</label>
                <textarea id={`q-opts-${q.id}`} className={`${input} font-mono`} rows={Math.min(10, Math.max(3, (q.options || []).length + 1))} value={optionsText}
                  onChange={(e) => { setOptionsText(e.target.value); onChange({ ...q, options: lines(e.target.value) }); }} />
              </div>
              {q.type === 'words' && (
                <div className="space-y-3">
                  <div>
                    <label className={smallLabel} htmlFor={`q-min-${q.id}`}>Least number to pick</label>
                    <input id={`q-min-${q.id}`} type="number" min={0} max={(q.options || []).length} className={`${input} w-24`} value={q.minPicks ?? 1}
                      onChange={(e) => onChange({ ...q, minPicks: Math.max(0, Number(e.target.value) || 0) })} />
                  </div>
                  <div>
                    <label className={smallLabel} htmlFor={`q-pos-${q.id}`}>Positive words, shown green in results (one per line)</label>
                    <textarea id={`q-pos-${q.id}`} className={`${input} font-mono`} rows={4} value={positiveText}
                      onChange={(e) => { setPositiveText(e.target.value); onChange({ ...q, positive: lines(e.target.value) }); }} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => onMove(-1)} className="px-2 py-1 rounded-md text-sm bg-slate-100 dark:bg-slate-700 disabled:opacity-30">▲</button>
          <button type="button" aria-label="Move down" disabled={index === count - 1} onClick={() => onMove(1)} className="px-2 py-1 rounded-md text-sm bg-slate-100 dark:bg-slate-700 disabled:opacity-30">▼</button>
          <button type="button" aria-label="Remove question" onClick={onRemove} className="px-2 py-1 rounded-md text-sm text-red-600 hover:bg-red-500/10">✕</button>
        </div>
      </div>
    </li>
  );
}

function QuestionsTab({ initial, defaults, onSaved, notify }: { initial: FeedbackQuestion[]; defaults: FeedbackQuestion[]; onSaved: (q: FeedbackQuestion[]) => void; notify: (type: 'ok' | 'error', text: string) => void }) {
  const [questions, setQuestions] = useState(initial);
  const [version, setVersion] = useState(0); // remounts editors after reset / save
  const [preview, setPreview] = useState<FeedbackAnswers>({});
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(questions) !== JSON.stringify(initial);

  const update = (i: number, q: FeedbackQuestion) => setQuestions((all) => all.map((x, j) => (j === i ? q : x)));
  const move = (i: number, dir: -1 | 1) => setQuestions((all) => {
    const next = [...all];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    return next;
  });

  const save = async () => {
    const empty = questions.findIndex((q) => !q.label.trim());
    if (empty >= 0) { notify('error', `Question ${empty + 1} has no wording.`); return; }
    const noOptions = questions.findIndex((q) => (q.type === 'choice' || q.type === 'words') && (q.options || []).length < 2);
    if (noOptions >= 0) { notify('error', `Question ${noOptions + 1} needs at least two answers to pick from.`); return; }
    setSaving(true);
    try {
      const response = await fetch('/api/feedback/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questions }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not save.');
      setQuestions(body.questions);
      setVersion((v) => v + 1);
      onSaved(body.questions);
      notify('ok', 'Questions saved. The form uses them straight away.');
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div>
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">One form is used for every course. Changes apply to new responses only; answers already given are kept.</p>
        <ol className="space-y-3" key={version}>
          {questions.map((q, i) => (
            <QuestionEditor key={q.id} q={q} index={i} count={questions.length} onChange={(nq) => update(i, nq)} onMove={(d) => move(i, d)}
              onRemove={() => { if (window.confirm(`Remove “${q.label || 'this question'}”?`)) setQuestions((all) => all.filter((_, j) => j !== i)); }} />
          ))}
        </ol>
        <div className="flex flex-wrap gap-2 mt-4">
          <UniformButton variant="secondary" size="sm" onClick={() => setQuestions((all) => [...all, { id: `q_${Date.now().toString(36)}`, type: 'scale', label: '', required: true }])}>➕ Add question</UniformButton>
          <UniformButton variant="secondary" size="sm" onClick={() => { if (window.confirm('Put back the standard questions? Your changes here will be replaced (nothing is saved until you click Save).')) { setQuestions(defaults); setVersion((v) => v + 1); } }}>↺ Standard questions</UniformButton>
          <div className="flex-1" />
          {dirty && <UniformButton variant="secondary" size="sm" onClick={() => { setQuestions(initial); setVersion((v) => v + 1); }}>Undo changes</UniformButton>}
          <UniformButton variant="primary" size="sm" disabled={!dirty || saving} onClick={() => void save()}>{saving ? 'Saving…' : dirty ? 'Save questions' : 'Saved ✓'}</UniformButton>
        </div>
      </div>

      <div className="xl:sticky xl:top-4 self-start">
        <p className={smallLabel}>Preview – what staff see</p>
        <div className="rounded-2xl overflow-hidden bg-slate-800 shadow-xl max-h-[80vh] overflow-y-auto">
          <div className="bg-blue-700 px-5 py-4">
            <p className="text-lg font-black text-white uppercase tracking-tight">Training feedback</p>
            <p className="text-blue-100 text-sm font-semibold">Course name · session date</p>
          </div>
          <div className="p-5">
            <FeedbackQuestionFields questions={questions.filter((q) => q.label.trim())} answers={preview}
              onChange={(id: string, value: FeedbackAnswer | undefined) => setPreview((p) => { const n = { ...p }; if (value === undefined) delete n[id]; else n[id] = value; return n; })} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Emails tab ----------

function EmailsTab({ initial, onSaved, notify }: { initial: EmailSettings; onSaved: (e: EmailSettings) => void; notify: (type: 'ok' | 'error', text: string) => void }) {
  const [emails, setEmails] = useState(initial);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(emails) !== JSON.stringify(initial);
  const set = <K extends keyof EmailSettings>(key: K, value: EmailSettings[K]) => setEmails((e) => ({ ...e, [key]: value }));

  const save = async () => {
    const switchingOn = (emails.is_enabled && !initial.is_enabled) || (emails.reminders_enabled && !initial.reminders_enabled);
    if (switchingOn && !window.confirm('This switches on emails to real staff (and manager groups for reminders). Continue?')) return;
    setSaving(true);
    try {
      const response = await fetch('/api/feedback/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emails }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not save.');
      onSaved(emails);
      notify('ok', 'Email settings saved.');
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const text = (key: keyof EmailSettings, label: string, rows?: number) => (
    <div>
      <label className={smallLabel} htmlFor={`em-${key}`}>{label}</label>
      {rows
        ? <textarea id={`em-${key}`} className={input} rows={rows} value={String(emails[key])} onChange={(e) => set(key, e.target.value as never)} />
        : <input id={`em-${key}`} className={input} value={String(emails[key])} onChange={(e) => set(key, e.target.value as never)} />}
    </div>
  );
  const num = (key: 'feedback_minutes_before_end' | 'reminder_7_days_before' | 'reminder_1_day_before', label: string, unit: string) => (
    <div>
      <label className={smallLabel} htmlFor={`em-${key}`}>{label}</label>
      <div className="flex items-center gap-2">
        <input id={`em-${key}`} type="number" min={0} className={`${input} w-24`} value={emails[key]} onChange={(e) => set(key, Math.max(0, Number(e.target.value) || 0))} />
        <span className="text-sm text-slate-500">{unit}</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <section className={`${card} p-5 space-y-4`}>
        <div className="flex items-start gap-4">
          <Switch on={emails.is_enabled} onChange={(v) => set('is_enabled', v)} label="Feedback email" />
          <div>
            <h3 className="font-black">Feedback email {emails.is_enabled ? <span className="text-emerald-600">– ON</span> : <span className="text-slate-500">– off</span>}</h3>
            <p className="text-sm text-slate-500">Sent to everyone signed in on the register, with a “Give feedback” button for that session.</p>
          </div>
        </div>
        {num('feedback_minutes_before_end', 'Send it', 'minutes before the session ends (0 = when it ends)')}
        {text('email_subject', 'Subject')}
        {text('email_body', 'Message (the “Give feedback” button is added underneath)', 7)}
      </section>

      <section className={`${card} p-5 space-y-4`}>
        <div className="flex items-start gap-4">
          <Switch on={emails.reminders_enabled} onChange={(v) => set('reminders_enabled', v)} label="Booking reminders" />
          <div>
            <h3 className="font-black">Booking reminders {emails.reminders_enabled ? <span className="text-emerald-600">– ON</span> : <span className="text-slate-500">– off</span>}</h3>
            <p className="text-sm text-slate-500">Two reminders to everyone booked, plus a list of booked staff to each home&rsquo;s manager Google Group (set in Manage Venues; homes without one are skipped).</p>
            {!emails.remindersSwitchReady && <p className="text-sm text-amber-600 mt-1">Run the migration <code>20261118150000_feedback_reminders_switch.sql</code> before switching this on.</p>}
          </div>
        </div>
        <div className="flex flex-wrap gap-6">
          {num('reminder_7_days_before', 'First reminder', 'days before')}
          {num('reminder_1_day_before', 'Second reminder', 'days before')}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-3">{text('reminder_subject', 'Staff – subject')}{text('reminder_body', 'Staff – message', 6)}</div>
          <div className="space-y-3">{text('manager_reminder_subject', 'Managers – subject')}{text('manager_reminder_body', 'Managers – message', 6)}</div>
        </div>
      </section>

      <p className="text-xs text-slate-500">
        Fill-ins: <code>{'{{staff_name}}'}</code> <code>{'{{course_name}}'}</code> <code>{'{{event_date}}'}</code> <code>{'{{start_time}}'}</code> <code>{'{{end_time}}'}</code>, and for managers <code>{'{{staff_list}}'}</code>. Emails are checked every 10 minutes and never sent twice for a session.
      </p>
      <div className="flex justify-end gap-2">
        {dirty && <UniformButton variant="secondary" size="sm" onClick={() => setEmails(initial)}>Undo changes</UniformButton>}
        <UniformButton variant="primary" size="sm" disabled={!dirty || saving} onClick={() => void save()}>{saving ? 'Saving…' : dirty ? 'Save email settings' : 'Saved ✓'}</UniformButton>
      </div>
    </div>
  );
}

// ---------- Send now tab ----------

function SendTab({ sessions, notify, reload }: { sessions: SendNowSession[]; notify: (type: 'ok' | 'error', text: string) => void; reload: () => void }) {
  const { profile } = useCurrentUserProfile();
  const [testMode, setTestMode] = useState(true);
  const [testEmail, setTestEmail] = useState('');
  const [sending, setSending] = useState<string | null>(null);
  useEffect(() => { if (profile?.email) setTestEmail((c) => c || profile.email || ''); }, [profile?.email]);

  const send = async (s: SendNowSession) => {
    const question = testMode
      ? `Send a test feedback email for ${s.courseName} to ${testEmail || 'your address'}?`
      : `Send the feedback email to all ${s.attended} people signed in on ${s.courseName}? This emails real staff.`;
    if (!window.confirm(question)) return;
    setSending(s.id);
    try {
      const response = await fetch('/api/automations/feedback-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-email-test-mode': testMode ? 'true' : 'false', ...(testMode && testEmail ? { 'x-test-email-address': testEmail } : {}) },
        body: JSON.stringify({ eventId: s.id }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Sending failed.');
      if (body.count > 0) {
        notify('ok', body.testMode ? `Test email sent to ${testEmail || 'you'}. The session is not marked as sent.` : `Sent ${body.count} feedback email${body.count === 1 ? '' : 's'}.`);
        if (!body.testMode) reload();
      } else {
        notify('error', body.message === 'Training emails processed' ? 'No email was sent – check the email set-up for this site.' : body.message || 'No email was sent.');
      }
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Sending failed.');
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="space-y-4">
      <section className={`${card} p-5 flex flex-wrap items-center gap-4 ${testMode ? '' : 'ring-2 ring-red-500'}`}>
        <Switch on={testMode} onChange={setTestMode} label="Test mode" />
        <div className="flex-1 min-w-[220px]">
          <p className="font-black">{testMode ? 'Test mode – only you get an email' : 'LIVE – emails go to real staff'}</p>
          <p className="text-sm text-slate-500">{testMode ? 'Sends one sample to the address below and does not mark the session as sent.' : 'Everyone signed in on the register gets the feedback email.'}</p>
        </div>
        {testMode && (
          <div className="min-w-[240px]">
            <label className={smallLabel} htmlFor="test-email">Send tests to</label>
            <input id="test-email" type="email" className={input} value={testEmail} onChange={(e) => setTestEmail(e.target.value)} />
          </div>
        )}
      </section>

      <section className={card}>
        <h3 className="text-sm font-black uppercase p-4 pb-2">Sessions – last 14 days</h3>
        {sessions.length === 0 && <p className="p-4 text-sm text-slate-500">No sessions in the last 14 days.</p>}
        <ul className="divide-y divide-slate-200 dark:divide-slate-700">
          {sessions.map((s) => (
            <li key={s.id} className="px-4 py-3 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[200px]">
                <p className="font-bold text-sm">{s.courseName}</p>
                <p className="text-xs text-slate-500">{day(s.date)}{s.startTime ? ` · ${s.startTime.slice(0, 5)}–${(s.endTime || '').slice(0, 5)}` : ''} · {s.attended} signed in</p>
              </div>
              {s.feedbackSentAt && <span className="text-[10px] font-black uppercase text-emerald-600 bg-emerald-500/10 px-2 py-1 rounded">Sent ✓</span>}
              <UniformButton variant={testMode ? 'secondary' : 'danger'} size="sm" disabled={!!sending || s.attended === 0} onClick={() => void send(s)}>
                {sending === s.id ? 'Sending…' : s.attended === 0 ? 'Nobody signed in' : testMode ? 'Send test' : 'Send to attendees'}
              </UniformButton>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// ---------- page ----------

export default function FeedbackAdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('questions');
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/feedback/settings');
      const body = await response.json().catch(() => ({}));
      if (response.status === 401) { router.push('/login?next=/automation-control'); return; }
      if (response.status === 403) throw new Error('Only admins can change the feedback form and emails.');
      if (!response.ok) throw new Error(body.error || 'Could not load the feedback settings.');
      setData(body as Loaded);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the feedback settings.');
    }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  const notify = (type: 'ok' | 'error', text: string) => { setMessage({ type, text }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const tabs: [Tab, string][] = [['questions', '📝 Questions'], ['emails', '✉️ Emails'], ['send', '📤 Send now']];

  return (
    <main className="min-h-screen p-4 md:p-8 bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
          <BackButton to="/admin" />
          <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tighter">Feedback &amp; Emails</h1>
          <UniformButton variant="secondary" size="sm" onClick={() => router.push('/feedback/results')}>⭐ Results</UniformButton>
        </div>

        {data && (
          <div className="flex flex-wrap gap-2 mb-6 text-xs">
            <span className={`px-3 py-1.5 rounded-full font-bold ${data.emails.is_enabled ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-slate-500/15 text-slate-600 dark:text-slate-300'}`}>Feedback email: {data.emails.is_enabled ? 'ON' : 'off'}</span>
            <span className={`px-3 py-1.5 rounded-full font-bold ${data.emails.reminders_enabled ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-slate-500/15 text-slate-600 dark:text-slate-300'}`}>Booking reminders: {data.emails.reminders_enabled ? 'ON' : 'off'}</span>
            <span className="px-3 py-1.5 rounded-full font-bold bg-blue-500/15 text-blue-700 dark:text-blue-300">{data.questions.length} questions</span>
          </div>
        )}

        <div role="tablist" className="flex gap-1 border-b border-slate-300 dark:border-slate-700 mb-6 overflow-x-auto">
          {tabs.map(([key, label]) => (
            <button key={key} role="tab" aria-selected={tab === key} type="button" onClick={() => { setTab(key); setMessage(null); }}
              className={`px-4 py-2.5 text-sm font-bold border-b-2 -mb-px whitespace-nowrap ${tab === key ? 'border-blue-600 text-blue-700 dark:text-blue-300' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}>
              {label}
            </button>
          ))}
        </div>

        {message && (
          <div role="status" className={`mb-4 rounded-lg border p-3 text-sm ${message.type === 'ok' ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-900/50 dark:text-emerald-200' : 'border-red-300 bg-red-50 text-red-700 dark:bg-red-950/30 dark:border-red-900/50 dark:text-red-200'}`}>
            {message.text}
          </div>
        )}
        {error && <div className="mb-4 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-900/50 p-3 text-sm text-red-700 dark:text-red-200">{error}</div>}
        {!data && !error && <p className="text-center text-slate-500 py-16">Loading…</p>}

        {data && tab === 'questions' && <QuestionsTab initial={data.questions} defaults={data.defaultQuestions} notify={notify} onSaved={(questions) => setData({ ...data, questions })} />}
        {data && tab === 'emails' && <EmailsTab initial={data.emails} notify={notify} onSaved={(emails) => setData({ ...data, emails })} />}
        {data && tab === 'send' && <SendTab sessions={data.sessions} notify={notify} reload={() => void load()} />}
      </div>
    </main>
  );
}
