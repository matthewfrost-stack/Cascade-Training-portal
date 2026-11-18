'use client';

import type { BeforeAfter, FeedbackAnswer, FeedbackAnswers, FeedbackQuestion } from '@/lib/feedbackForm';

/**
 * Renders the feedback questions. Used by the staff form (/feedback) and the
 * admin preview, so both always look the same.
 */

const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function ScoreRow({ value, onChange, label, low, high }: { value?: number; onChange: (n: number) => void; label: string; low?: string; high?: string }) {
  return (
    <fieldset>
      <legend className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1.5">{label}</legend>
      <div className="grid grid-cols-10 gap-1">
        {SCORES.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-pressed={value === n}
            aria-label={`${label}: ${n} out of 10`}
            className={`h-10 rounded-lg text-sm font-bold tabular-nums transition-colors ${value === n ? 'bg-blue-600 text-white shadow' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
          >
            {n}
          </button>
        ))}
      </div>
      {(low || high) && (
        <div className="flex justify-between text-[11px] text-slate-500 mt-1">
          <span>1 = {low || 'Low'}</span>
          <span>10 = {high || 'High'}</span>
        </div>
      )}
    </fieldset>
  );
}

export default function FeedbackQuestionFields({
  questions,
  answers,
  onChange,
}: {
  questions: FeedbackQuestion[];
  answers: FeedbackAnswers;
  onChange: (id: string, value: FeedbackAnswer | undefined) => void;
}) {
  return (
    <div className="space-y-6">
      {questions.map((q) => {
        const value = answers[q.id];
        const title = (
          <p className="text-sm font-semibold text-slate-200 mb-3">
            {q.label} {q.required && <span className="text-red-400" aria-label="required">*</span>}
          </p>
        );

        if (q.type === 'before_after') {
          const v = (value as Partial<BeforeAfter> | undefined) || {};
          const set = (part: 'before' | 'after', n: number) => onChange(q.id, { ...v, [part]: n } as BeforeAfter);
          return (
            <div key={q.id} className="bg-slate-700/40 rounded-xl p-4 space-y-4">
              {title}
              <ScoreRow label="Before the training" value={v.before} onChange={(n) => set('before', n)} low={q.lowLabel} high={q.highLabel} />
              <ScoreRow label="After the training" value={v.after} onChange={(n) => set('after', n)} low={q.lowLabel} high={q.highLabel} />
            </div>
          );
        }

        if (q.type === 'scale') {
          return (
            <div key={q.id} className="bg-slate-700/40 rounded-xl p-4">
              {title}
              <ScoreRow label="Your score" value={value as number | undefined} onChange={(n) => onChange(q.id, n)} low={q.lowLabel} high={q.highLabel} />
            </div>
          );
        }

        if (q.type === 'choice') {
          return (
            <div key={q.id}>
              {title}
              <div className="flex flex-wrap gap-2">
                {(q.options || []).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onChange(q.id, option)}
                    aria-pressed={value === option}
                    className={`flex-1 min-w-[96px] py-3 rounded-lg font-semibold text-sm transition-colors ${value === option ? 'bg-blue-600 text-white shadow' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          );
        }

        if (q.type === 'words') {
          const picked = Array.isArray(value) ? value : [];
          const min = q.minPicks ?? 1;
          const toggle = (word: string) => {
            const next = picked.includes(word) ? picked.filter((w) => w !== word) : [...picked, word];
            onChange(q.id, next.length ? next : undefined);
          };
          return (
            <div key={q.id}>
              {title}
              {min > 0 && (
                <p className="text-xs text-slate-500 -mt-2 mb-3">
                  {picked.length < min ? `Pick at least ${min - picked.length} more` : `${picked.length} picked ✓`}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {(q.options || []).map((word) => (
                  <button
                    key={word}
                    type="button"
                    onClick={() => toggle(word)}
                    aria-pressed={picked.includes(word)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${picked.includes(word) ? 'bg-blue-600 text-white shadow' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                  >
                    {word}
                  </button>
                ))}
              </div>
            </div>
          );
        }

        return (
          <div key={q.id}>
            <label htmlFor={`fb-${q.id}`} className="block">{title}</label>
            <textarea
              id={`fb-${q.id}`}
              value={typeof value === 'string' ? value : ''}
              onChange={(e) => onChange(q.id, e.target.value || undefined)}
              rows={3}
              maxLength={4000}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-y"
            />
          </div>
        );
      })}
    </div>
  );
}
