/**
 * The training feedback form: one set of questions for every course.
 *
 * The questions are stored in `feedback_settings` (key 'default_form', column
 * `config.fields`), which is what the admin question builder edits. Older
 * builder field types are read too (radio, descriptors, scale with before/after
 * labels), so existing saved questions keep working.
 *
 * Answers are saved in `course_feedback.responses` keyed by question id:
 *   before_after -> { before: 1-10, after: 1-10 }
 *   scale        -> 1-10
 *   choice       -> one option (string)
 *   words        -> several options (string[])
 *   text         -> string
 */

export type QuestionType = 'before_after' | 'scale' | 'choice' | 'words' | 'text';

export type FeedbackQuestion = {
  id: string;
  type: QuestionType;
  label: string;
  required: boolean;
  /** choice / words */
  options?: string[];
  /** words: the least that must be picked */
  minPicks?: number;
  /** words: options counted as positive on the results page */
  positive?: string[];
  /** scale / before_after: what 1 and 10 mean */
  lowLabel?: string;
  highLabel?: string;
};

export type BeforeAfter = { before: number; after: number };
export type FeedbackAnswer = number | string | string[] | BeforeAfter;
export type FeedbackAnswers = Record<string, FeedbackAnswer>;

export const DEFAULT_QUESTIONS: FeedbackQuestion[] = [
  { id: 'knowledge', type: 'before_after', label: 'Your knowledge of the subject', required: true, lowLabel: 'Very little', highLabel: 'A lot' },
  { id: 'confidence', type: 'before_after', label: 'Your confidence putting it into practice', required: true, lowLabel: 'Not confident', highLabel: 'Very confident' },
  { id: 'relevance', type: 'scale', label: 'How relevant was this training to your work role?', required: true, lowLabel: 'Not relevant', highLabel: 'Very relevant' },
  {
    id: 'descriptors',
    type: 'words',
    label: 'Which words describe this session?',
    required: true,
    minPicks: 3,
    options: ['Well tutored', 'Useful', 'Practical', 'Fun', 'Professional', 'Informative', 'Motivating', 'Educational', 'Participative', 'Interactive', 'Basic', 'Nothing new', 'Boring', 'Too long', 'Hard to follow', 'Vague', 'Disorganised'],
    positive: ['Well tutored', 'Useful', 'Practical', 'Fun', 'Professional', 'Informative', 'Motivating', 'Educational', 'Participative', 'Interactive'],
  },
  { id: 'skills_gained', type: 'choice', label: 'Did you gain new skills?', required: true, options: ['Yes', 'No'] },
  { id: 'comments', type: 'text', label: 'Any other comments?', required: false },
];

const DEFAULT_POSITIVE = new Set(DEFAULT_QUESTIONS.find((q) => q.id === 'descriptors')?.positive?.map((w) => w.toLowerCase()));

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);

/** Turns whatever is saved (new or older builder format) into clean questions. */
export function normaliseQuestions(config: unknown): FeedbackQuestion[] {
  const fields = (config as { fields?: unknown })?.fields;
  if (!Array.isArray(fields) || fields.length === 0) return DEFAULT_QUESTIONS;

  const used = new Set<string>();
  const out: FeedbackQuestion[] = [];
  for (const raw of fields as Record<string, unknown>[]) {
    const label = String(raw?.label || '').trim();
    if (!label) continue;
    let id = slug(String(raw.id || label)) || 'question';
    while (used.has(id)) id = `${id}_2`;
    used.add(id);

    const options = Array.isArray(raw.options) ? raw.options.map((o) => String(o).trim()).filter(Boolean) : [];
    const required = raw.required !== false;
    const type = String(raw.type || '');
    // Only a session-time radio from the very first form: the session now comes from the booking.
    if (id === 'session_time') continue;

    if (type === 'before_after' || (type === 'scale' && raw.after_label)) {
      out.push({ id, type: 'before_after', label, required, lowLabel: str(raw.lowLabel), highLabel: str(raw.highLabel) });
    } else if (type === 'scale') {
      // The older builder kept the full question in before_label (e.g. "Relevance" / "How relevant was…").
      out.push({ id, type: 'scale', label: str(raw.before_label) || label, required, lowLabel: str(raw.lowLabel), highLabel: str(raw.highLabel) });
    } else if ((type === 'choice' || type === 'radio' || type === 'select') && options.length > 0) {
      out.push({ id, type: 'choice', label, required, options });
    } else if ((type === 'words' || type === 'descriptors' || type === 'checkbox') && options.length > 0) {
      const positive = Array.isArray(raw.positive)
        ? raw.positive.map(String)
        : options.filter((o) => DEFAULT_POSITIVE.has(o.toLowerCase()));
      const minPicks = Math.max(0, Math.min(options.length, Number(raw.minPicks ?? (/(\d+)\s+or more/.exec(label)?.[1] ?? 1)) || 0));
      out.push({ id, type: 'words', label: label.replace(/\s*\(select \d+ or more\)\s*/i, ''), required, options, minPicks, positive });
    } else {
      out.push({ id, type: 'text', label, required });
    }
  }
  return out.length > 0 ? out : DEFAULT_QUESTIONS;
}

function str(value: unknown) {
  const s = typeof value === 'string' ? value.trim() : '';
  return s || undefined;
}

const isScore = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 10;

/**
 * Checks answers against the questions. Returns cleaned answers (unknown keys
 * dropped, text trimmed) or a message for the person filling in the form.
 */
export function validateAnswers(questions: FeedbackQuestion[], input: unknown): { answers: FeedbackAnswers } | { error: string } {
  const given = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const answers: FeedbackAnswers = {};
  for (const q of questions) {
    const value = given[q.id];
    const missing = () => ({ error: `Please answer: ${q.label}` });
    switch (q.type) {
      case 'before_after': {
        const v = value as Partial<BeforeAfter> | undefined;
        if (v && isScore(v.before) && isScore(v.after)) answers[q.id] = { before: v.before, after: v.after };
        else if (q.required) return missing();
        break;
      }
      case 'scale':
        if (isScore(value)) answers[q.id] = value;
        else if (q.required) return missing();
        break;
      case 'choice':
        if (typeof value === 'string' && q.options?.includes(value)) answers[q.id] = value;
        else if (q.required) return missing();
        break;
      case 'words': {
        const picks = Array.isArray(value) ? Array.from(new Set(value.filter((w): w is string => typeof w === 'string' && !!q.options?.includes(w)))) : [];
        const min = q.minPicks ?? 1;
        if (q.required && picks.length < Math.max(1, min)) return { error: `Please pick at least ${Math.max(1, min)} word${Math.max(1, min) === 1 ? '' : 's'} for: ${q.label}` };
        if (picks.length > 0) answers[q.id] = picks;
        break;
      }
      case 'text': {
        const text = typeof value === 'string' ? value.trim().slice(0, 4000) : '';
        if (text) answers[q.id] = text;
        else if (q.required) return missing();
        break;
      }
    }
  }
  return { answers };
}
