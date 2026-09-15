export function timeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = String(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 23 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

export function calculatePaidMinutes(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
  amBreakMinutes = 0,
  pmBreakMinutes = 0,
): number | null {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (start === null || end === null || end < start) return null;

  return Math.max(0, end - start - Math.max(0, Number(amBreakMinutes) || 0) - Math.max(0, Number(pmBreakMinutes) || 0));
}

export function calculateScheduledMinutes(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): number | null {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (start === null || end === null || end < start) return null;
  return end - start;
}

export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return '—';
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const remainingMinutes = safeMinutes % 60;
  return `${hours}h ${String(remainingMinutes).padStart(2, '0')}m`;
}
