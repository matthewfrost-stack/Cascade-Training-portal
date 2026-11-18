'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import FeedbackQuestionFields from '@/app/components/FeedbackQuestionFields';
import { validateAnswers, type FeedbackAnswer, type FeedbackAnswers, type FeedbackQuestion } from '@/lib/feedbackForm';

type FormResponse = {
  questions: FeedbackQuestion[];
  event: { id: string; courseName: string; date: string } | null;
  answered: boolean;
  myName?: string;
  error?: string;
};

function Panel({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-2xl p-8 sm:p-10 max-w-md w-full text-center shadow-2xl">
        <div className="text-5xl mb-4" aria-hidden>{icon}</div>
        <h1 className="text-2xl font-black text-white mb-2">{title}</h1>
        <div className="text-slate-400">{children}</div>
      </div>
    </div>
  );
}

const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function FeedbackForm() {
  const eventId = useSearchParams()?.get('event') || '';
  const [form, setForm] = useState<FormResponse | null>(null);
  const [loadError, setLoadError] = useState('');
  const [answers, setAnswers] = useState<FeedbackAnswers>({});
  const [anonymous, setAnonymous] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/feedback?event=${encodeURIComponent(eventId)}`);
        const body = (await response.json().catch(() => ({}))) as FormResponse;
        if (cancelled) return;
        if (!response.ok) setLoadError(body.error || 'Could not load the feedback form.');
        else setForm(body);
      } catch {
        if (!cancelled) setLoadError('Could not load the feedback form. Please check your connection and try again.');
      }
    })();
    return () => { cancelled = true; };
  }, [eventId]);

  const setAnswer = (id: string, value: FeedbackAnswer | undefined) => {
    setAnswers((prev) => {
      const next = { ...prev };
      if (value === undefined) delete next[id];
      else next[id] = value;
      return next;
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form?.event) return;
    const checked = validateAnswers(form.questions, answers);
    if ('error' in checked) { setError(checked.error); return; }
    setError('');
    setSubmitting(true);
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: form.event.id, anonymous, answers: checked.answers }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 409) { setForm({ ...form, answered: true }); return; }
      if (!response.ok) throw new Error(body.error || 'Something went wrong. Please try again.');
      setSubmitted(true);
      window.scrollTo({ top: 0 });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!eventId) {
    return <Panel icon="✉️" title="Training feedback">Please open the feedback link from the email you were sent after your training session.</Panel>;
  }
  if (loadError) return <Panel icon="⚠️" title="Feedback form unavailable">{loadError}</Panel>;
  if (!form) return <Panel icon="⏳" title="Loading…">Getting your feedback form ready.</Panel>;
  if (submitted) return <Panel icon="✅" title="Thank you!">Your feedback has been sent{anonymous ? ' anonymously' : ''}. It helps us improve our training.</Panel>;
  if (form.answered) return <Panel icon="✅" title="Already done">You have already given feedback for this session. Thank you!</Panel>;
  if (!form.event) return <Panel icon="⚠️" title="Feedback form unavailable">We could not find this training session.</Panel>;

  return (
    <div className="min-h-screen bg-slate-900 py-6 sm:py-10 px-4">
      <div className="max-w-2xl mx-auto bg-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="bg-blue-700 px-6 py-6">
          <h1 className="text-xl font-black text-white uppercase tracking-tight">Training feedback</h1>
          <p className="text-blue-100 font-semibold mt-1">{form.event.courseName}</p>
          <p className="text-blue-200 text-sm mt-0.5">{longDate(form.event.date)}</p>
        </div>

        <form onSubmit={submit} className="px-6 py-6 space-y-6" noValidate>
          <fieldset className="bg-slate-700/40 rounded-xl p-4">
            <legend className="sr-only">Your name</legend>
            <p className="text-sm font-semibold text-slate-200 mb-3">Would you like to include your name?</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setAnonymous(false)} aria-pressed={!anonymous}
                className={`flex-1 min-w-[140px] py-3 px-3 rounded-lg text-sm font-semibold transition-colors ${!anonymous ? 'bg-blue-600 text-white shadow' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                Include my name{form.myName ? ` (${form.myName})` : ''}
              </button>
              <button type="button" onClick={() => setAnonymous(true)} aria-pressed={anonymous}
                className={`flex-1 min-w-[140px] py-3 px-3 rounded-lg text-sm font-semibold transition-colors ${anonymous ? 'bg-blue-600 text-white shadow' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                Stay anonymous
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {anonymous
                ? 'Your name will not be saved with your answers. We only note that you have responded, so the form can’t be sent twice.'
                : 'The training team will see your name with your answers.'}
            </p>
          </fieldset>

          <FeedbackQuestionFields questions={form.questions} answers={answers} onChange={setAnswer} />

          {error && <p role="alert" className="text-red-300 text-sm font-semibold bg-red-500/10 px-4 py-2 rounded-lg">{error}</p>}

          <button type="submit" disabled={submitting}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-black rounded-xl text-base uppercase tracking-wide transition-colors shadow-lg">
            {submitting ? 'Sending…' : 'Send feedback'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function FeedbackPage() {
  return (
    <Suspense fallback={<Panel icon="⏳" title="Loading…">Getting your feedback form ready.</Panel>}>
      <FeedbackForm />
    </Suspense>
  );
}
