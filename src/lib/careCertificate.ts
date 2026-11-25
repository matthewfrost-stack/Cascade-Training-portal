/**
 * Care Certificate: new staff are expected to complete it within 12 weeks of
 * their start date (CQC / Skills for Care expectation). Tracked at every home
 * with `locations.care_cert_required` (schools are left out).
 * Completion is read from the Training Matrix; the tracker can also record a
 * completion from elsewhere (saved to the matrix too), an equivalent, "not
 * required", or an agreed extension with a new deadline and a reason.
 */
export const CARE_CERT_WEEKS = 12;
export const CC_DUE_SOON_DAYS = 14;

export type CareCertStatus = 'not_started' | 'completed' | 'equivalent' | 'not_required';

export const CC_STATUS_LABELS: Record<CareCertStatus, string> = {
  not_started: 'Working towards it / not started',
  completed: 'Completed (date + certificate)',
  equivalent: 'Holds an equivalent',
  not_required: 'Not required',
};

export type CareCertBand = 'overdue' | 'no_start_date' | 'due_soon' | 'on_track' | 'done' | 'not_required';

export const CC_BAND_LABELS: Record<CareCertBand, string> = {
  overdue: 'Overdue',
  no_start_date: 'Start date needed',
  due_soon: 'Due within 2 weeks',
  on_track: 'Within 12 weeks',
  done: 'Completed',
  not_required: 'Not required',
};

export const CC_BAND_ORDER: CareCertBand[] = ['overdue', 'no_start_date', 'due_soon', 'on_track', 'done', 'not_required'];

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** The normal deadline: start date + 12 weeks. */
export function standardDue(startDate: string | null): string | null {
  return startDate ? addDays(startDate, CARE_CERT_WEEKS * 7) : null;
}

/** The deadline that applies: an agreed extension, otherwise start + 12 weeks. */
export function careCertDue(startDate: string | null, extendedTo: string | null): string | null {
  return extendedTo || standardDue(startDate);
}

export function careCertBand(
  r: { status: CareCertStatus; startDate: string | null; matrixCompletedOn: string | null; extendedTo: string | null },
  today: string,
): CareCertBand {
  if (r.matrixCompletedOn || r.status === 'completed' || r.status === 'equivalent') return 'done';
  if (r.status === 'not_required') return 'not_required';
  const due = careCertDue(r.startDate, r.extendedTo);
  if (!due) return 'no_start_date';
  if (today > due) return 'overdue';
  if (today >= addDays(due, -CC_DUE_SOON_DAYS)) return 'due_soon';
  return 'on_track';
}

export function careCertSummary(bands: CareCertBand[]) {
  const counts = Object.fromEntries(CC_BAND_ORDER.map((b) => [b, 0])) as Record<CareCertBand, number>;
  for (const b of bands) counts[b] += 1;
  const required = bands.length - counts.not_required;
  return { counts, required, done: counts.done, pctDone: required ? Math.round((counts.done / required) * 1000) / 10 : null };
}
