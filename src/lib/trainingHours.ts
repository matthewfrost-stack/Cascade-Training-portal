/**
 * Training hours for face-to-face sessions, worked out from the booked
 * session's start and end times (no lunch deduction).
 *
 * For one person's booking on a session that has already happened:
 *   - scheduled: the full session length
 *   - delivered: session length minus any minutes late (if they attended)
 *   - lostAbsence: the full session, if they did not attend
 *   - lostLate: minutes missed by arriving late (capped at the session length)
 */

/** Minutes since midnight for 'HH:MM' or 'HH:MM:SS', or null. */
function toMinutes(time?: string | null): number | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Session length in hours, or null if the times are missing or don't make sense. */
export function sessionHours(startTime?: string | null, endTime?: string | null): number | null {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  if (start === null || end === null || end <= start) return null;
  return (end - start) / 60;
}

export type BookingHours = {
  scheduled: number;
  delivered: number;
  lostAbsence: number;
  lostLate: number;
  /** false when the session has no usable start/end time */
  known: boolean;
};

export function bookingHours(
  session: { start_time?: string | null; end_time?: string | null } | null | undefined,
  booking: { attended_at?: string | null; minutes_late?: number | null }
): BookingHours {
  const length = sessionHours(session?.start_time, session?.end_time);
  if (length === null) return { scheduled: 0, delivered: 0, lostAbsence: 0, lostLate: 0, known: false };

  if (!booking.attended_at) {
    return { scheduled: length, delivered: 0, lostAbsence: length, lostLate: 0, known: true };
  }
  const late = Math.min(Math.max(booking.minutes_late || 0, 0) / 60, length);
  return { scheduled: length, delivered: length - late, lostAbsence: 0, lostLate: late, known: true };
}

/** e.g. 7 -> "7h", 6.5 -> "6.5h", 0.25 -> "15m", 1234.5 -> "1,234.5h" */
export function formatHours(hours: number): string {
  if (hours > 0 && hours < 1) return `${Math.round(hours * 60)}m`;
  const rounded = Math.round(hours * 10) / 10;
  return `${rounded.toLocaleString('en-GB', { maximumFractionDigits: 1 })}h`;
}
