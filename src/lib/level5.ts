/**
 * Level 5 Diploma in Leadership & Management (Registered Managers and Deputies, every home).
 *
 * In-house rule: the diploma must be finished within 2 years of ENROLLING (extensions
 * can be agreed, with a reason). There's no time limit on when they enrol: before
 * that they simply show as "Not enrolled yet". People are added to the list by hand.
 * Records live in `staff_qualifications` (qualification = 'L5_LEADERSHIP').
 */
import { addMonths } from '@/lib/diploma';
import type { DiplomaStatus } from '@/lib/diploma';

export const L5_YEARS = 2;
export const L5_DUE_SOON_MONTHS = 6;

export type L5Role = 'registered_manager' | 'deputy';
export const L5_ROLE_LABELS: Record<L5Role, string> = { registered_manager: 'Registered Manager', deputy: 'Deputy' };
export const isL5Role = (value: unknown): value is L5Role => value === 'registered_manager' || value === 'deputy';

/** Same statuses as Level 3. */
export type L5Status = DiplomaStatus;
export const L5_STATUS_LABELS: Record<L5Status, string> = {
  not_started: 'Not enrolled yet',
  enrolled: 'Enrolled',
  in_progress: 'In progress',
  completed: 'Completed',
  equivalent: 'Holds an equivalent',
  not_required: 'Not required',
};

export type L5Band = 'overdue' | 'date_needed' | 'due_soon' | 'on_track' | 'not_enrolled' | 'done' | 'not_required';
export const L5_BAND_LABELS: Record<L5Band, string> = {
  overdue: 'Overdue',
  date_needed: 'Enrolment date needed',
  due_soon: 'Due within 6 months',
  on_track: 'On track',
  not_enrolled: 'Not enrolled yet',
  done: 'Qualified',
  not_required: 'Not required',
};
export const L5_BAND_ORDER: L5Band[] = ['overdue', 'date_needed', 'due_soon', 'on_track', 'not_enrolled', 'done', 'not_required'];

export type L5Record = {
  status: L5Status;
  enrolledOn: string | null; // YYYY-MM-DD
  extendedTo?: string | null;
};

const isEnrolledStatus = (s: L5Status) => s === 'enrolled' || s === 'in_progress';

/** Normal deadline: enrolment date + 2 years. */
export const l5StandardDue = (enrolledOn: string | null) => (enrolledOn ? addMonths(enrolledOn, L5_YEARS * 12) : null);
/** Deadline that counts (an agreed extension replaces the normal one). */
export const l5Due = (enrolledOn: string | null, extendedTo?: string | null) => (enrolledOn ? extendedTo || l5StandardDue(enrolledOn) : null);

export function l5Band(r: L5Record, today: string): L5Band {
  if (r.status === 'not_required') return 'not_required';
  if (r.status === 'completed' || r.status === 'equivalent') return 'done';
  const due = l5Due(r.enrolledOn, r.extendedTo);
  if (due) {
    if (today > due) return 'overdue';
    if (today >= addMonths(due, -L5_DUE_SOON_MONTHS)) return 'due_soon';
    return 'on_track';
  }
  // No enrolment date yet: no deadline.
  if (isEnrolledStatus(r.status)) return 'date_needed'; // says enrolled but no date: the clock can't start
  return 'not_enrolled';
}

export function l5Summary(bands: L5Band[]) {
  const counts = Object.fromEntries(L5_BAND_ORDER.map((b) => [b, 0])) as Record<L5Band, number>;
  for (const b of bands) counts[b] += 1;
  const required = bands.length - counts.not_required;
  return { counts, required, qualified: counts.done };
}
