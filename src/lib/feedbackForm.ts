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

// ---------- results ----------

export type FeedbackResponseRow = {
  id: string;
  submittedAt: string;
  courseName: string;
  eventDate: string | null;
  name: string;
  anonymous: boolean;
  answers: FeedbackAnswers;
};

export type CourseRate = { courseName: string; sessions: number; attended: number; responded: number };

/**
 * Answers from a course_feedback row: the `responses` JSON, filled in from the
 * original columns for responses saved by the first version of the form.
 */
export function answersFromRow(row: Record<string, unknown>): FeedbackAnswers {
  const out: FeedbackAnswers = {};
  const num = (v: unknown) => (typeof v === 'number' ? v : null);
  const kb = num(row.knowledge_before), ka = num(row.knowledge_after);
  if (kb !== null && ka !== null) out.knowledge = { before: kb, after: ka };
  const cb = num(row.confidence_before), ca = num(row.confidence_after);
  if (cb !== null && ca !== null) out.confidence = { before: cb, after: ca };
  if (num(row.work_role_relevance) !== null) out.relevance = row.work_role_relevance as number;
  if (Array.isArray(row.session_descriptors) && row.session_descriptors.length) out.descriptors = row.session_descriptors.map(String);
  if (typeof row.skills_gained === 'boolean') out.skills_gained = row.skills_gained ? 'Yes' : 'No';
  if (typeof row.additional_comments === 'string' && row.additional_comments.trim()) out.comments = row.additional_comments.trim();

  const saved = row.responses && typeof row.responses === 'object' ? (row.responses as Record<string, unknown>) : {};
  for (const [key, value] of Object.entries(saved)) {
    if (value === null || value === undefined || value === '') continue;
    // Very first builder format used flat keys (knowledge_before …) – already covered above.
    if (/_(before|after)$/.test(key) || (key === 'skills_gained' && typeof value === 'boolean')) continue;
    out[key] = value as FeedbackAnswer;
  }
  return out;
}

export type QuestionSummary =
  | { kind: 'before_after'; answered: number; before: number; after: number }
  | { kind: 'scale'; answered: number; average: number }
  | { kind: 'counts'; answered: number; counts: { option: string; count: number; positive?: boolean }[] }
  | { kind: 'text'; answered: number; items: { text: string; name: string; courseName: string; date: string | null }[] };

const mean = (nums: number[]) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0);

/** Totals for one question across the given responses. */
export function summariseQuestion(q: FeedbackQuestion, responses: FeedbackResponseRow[]): QuestionSummary {
  const values = responses.map((r) => ({ r, v: r.answers[q.id] })).filter(({ v }) => v !== undefined);
  if (q.type === 'before_after') {
    const pairs = values.map(({ v }) => v as BeforeAfter).filter((p) => typeof p?.before === 'number' && typeof p?.after === 'number');
    return { kind: 'before_after', answered: pairs.length, before: mean(pairs.map((p) => p.before)), after: mean(pairs.map((p) => p.after)) };
  }
  if (q.type === 'scale') {
    const nums = values.map(({ v }) => v).filter((v): v is number => typeof v === 'number');
    return { kind: 'scale', answered: nums.length, average: mean(nums) };
  }
  if (q.type === 'choice' || q.type === 'words') {
    const tally = new Map<string, number>((q.options || []).map((o) => [o, 0]));
    for (const { v } of values) for (const o of Array.isArray(v) ? v : [v]) if (typeof o === 'string') tally.set(o, (tally.get(o) || 0) + 1);
    const positive = new Set(q.positive || []);
    const counts = Array.from(tally, ([option, count]) => ({ option, count, ...(q.type === 'words' ? { positive: positive.has(option) } : {}) }));
    if (q.type === 'words') counts.sort((a, b) => b.count - a.count);
    return { kind: 'counts', answered: values.length, counts };
  }
  const items = values
    .filter(({ v }) => typeof v === 'string' && v.trim())
    .map(({ r, v }) => ({ text: v as string, name: r.name, courseName: r.courseName, date: r.eventDate }));
  return { kind: 'text', answered: items.length, items };
}
