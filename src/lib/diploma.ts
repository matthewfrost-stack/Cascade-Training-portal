/**
 * Level 3 Diploma in Residential Childcare (Ofsted children's homes).
 *
 * Children's Homes Regulations (Reg 32): staff working with children must hold
 * the Level 3 Diploma (or an equivalent) within 2 years of starting in the role.
 * The clock starts at the company start date, or at "started at a children's home"
 * for someone who moved from another (e.g. CQC) site — see `clockStart`.
 * Only homes with `locations.diploma_required` are tracked (schools are not
 * children's homes). Records live in `staff_qualifications`.
 */

export const DIPLOMA_YEARS = 2;
/** Flag as "due soon" when this close to the deadline and not finished. */
export const DUE_SOON_MONTHS = 6;
/** Prompt to enrol if not enrolled this long after starting (an internal nudge, not a legal limit). */
export const ENROL_WITHIN_MONTHS = 3;

export type DiplomaStatus = 'not_started' | 'enrolled' | 'in_progress' | 'completed' | 'equivalent' | 'not_required';

export const STATUS_LABELS: Record<DiplomaStatus, string> = {
  not_started: 'Not started',
  enrolled: 'Enrolled',
  in_progress: 'In progress',
  completed: 'Completed',
  equivalent: 'Holds an equivalent',
  not_required: 'Not required',
};

/** Where someone stands, worst first. */
export type DiplomaBand = 'overdue' | 'no_start_date' | 'due_soon' | 'not_enrolled' | 'on_track' | 'done' | 'not_required';

export const BAND_LABELS: Record<DiplomaBand, string> = {
  overdue: 'Overdue',
  no_start_date: 'Start date needed',
  due_soon: 'Due within 6 months',
  not_enrolled: 'Not enrolled yet',
  on_track: 'On track',
  done: 'Qualified',
  not_required: 'Not required',
};

export const BAND_ORDER: DiplomaBand[] = ['overdue', 'no_start_date', 'due_soon', 'not_enrolled', 'on_track', 'done', 'not_required'];

export type DiplomaRecord = {
  status: DiplomaStatus;
  startDate: string | null; // YYYY-MM-DD
  completedOn?: string | null;
};

/** When the 2-year clock starts: the children's-home start if they moved in, else their start date. */
export function clockStart(startDate: string | null, homeStartDate?: string | null): string | null {
  return homeStartDate || startDate;
}

/** Adds whole months to a YYYY-MM-DD date (end-of-month safe). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export function dueDate(startDate: string | null): string | null {
  return startDate ? addMonths(startDate, DIPLOMA_YEARS * 12) : null;
}

export function diplomaBand(record: DiplomaRecord, today: string): DiplomaBand {
  if (record.status === 'not_required') return 'not_required';
  if (record.status === 'completed' || record.status === 'equivalent') return 'done';
  const due = dueDate(record.startDate);
  if (!record.startDate || !due) return 'no_start_date';
  if (today > due) return 'overdue';
  if (today >= addMonths(due, -DUE_SOON_MONTHS)) return 'due_soon';
  if (record.status === 'not_started' && today >= addMonths(record.startDate, ENROL_WITHIN_MONTHS)) return 'not_enrolled';
  return 'on_track';
}

/** Whole days from today to the deadline (negative = overdue). */
export function daysUntil(date: string, today: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/**
 * Headline for a home: of the people who need it, how many are qualified or
 * on track (not overdue / not missing a start date).
 */
export function diplomaSummary(bands: DiplomaBand[]) {
  const counts = Object.fromEntries(BAND_ORDER.map((b) => [b, 0])) as Record<DiplomaBand, number>;
  for (const b of bands) counts[b] += 1;
  const required = bands.length - counts.not_required;
  const qualified = counts.done;
  const okay = qualified + counts.on_track + counts.not_enrolled + counts.due_soon;
  return { counts, required, qualified, okay, pctQualified: required ? Math.round((qualified / required) * 1000) / 10 : null };
}
