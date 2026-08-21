const DEFAULT_TIME_ZONE = 'Europe/London';

export type FeedbackAutomationSettings = {
  is_enabled?: boolean | null;
  minutes_before_end?: number | null;
  feedback_minutes_before_end?: number | null;
  reminder_7_days_before?: number | null;
  reminder_1_day_before?: number | null;
  reminder_subject?: string | null;
  reminder_body?: string | null;
  manager_reminder_subject?: string | null;
  manager_reminder_body?: string | null;
  email_subject?: string | null;
  email_body?: string | null;
};

export type AutomationEvent = {
  event_date: string;
  start_time?: string | null;
  end_time?: string | null;
};

function getTimeZone() {
  return process.env.APP_TIME_ZONE || DEFAULT_TIME_ZONE;
}

export function getLocalWallClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: getTimeZone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  ));
}

export function parseEventWallClock(date: string, time?: string | null) {
  if (!date || !time) return null;
  const normalizedTime = time.length === 5 ? `${time}:00` : time;
  const parsed = new Date(`${date}T${normalizedTime}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getDateString(date: Date) {
  return date.toISOString().split('T')[0];
}

export function isWithinScheduleWindow(now: Date, target: Date, windowMinutes = 5) {
  return Math.abs(now.getTime() - target.getTime()) <= windowMinutes * 60 * 1000;
}

export function getFeedbackMinutesBeforeEnd(settings?: FeedbackAutomationSettings | null) {
  const configured = settings?.feedback_minutes_before_end ?? settings?.minutes_before_end ?? 60;
  return Math.max(0, Number(configured) || 0);
}

export function getReminderDaysBefore(settings: FeedbackAutomationSettings | null | undefined, kind: 'seven_days' | 'one_day') {
  const configured = kind === 'seven_days'
    ? settings?.reminder_7_days_before
    : settings?.reminder_1_day_before;
  const fallback = kind === 'seven_days' ? 7 : 1;
  return Math.max(0, Number(configured ?? fallback) || 0);
}

export function getManagerEmail(location?: string | null) {
  const normalized = String(location || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return normalized ? `${normalized}managers@cascade-care.com` : null;
}

export function formatEventDate(date: string) {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(parsed);
}

export function formatEventTime(time?: string | null) {
  if (!time) return '';
  const [hours = '', minutes = ''] = time.split(':');
  const parsedHours = Number(hours);
  if (!minutes || Number.isNaN(parsedHours)) return time;
  const suffix = parsedHours >= 12 ? 'pm' : 'am';
  return `${parsedHours % 12 || 12}:${minutes} ${suffix}`;
}

export function applyTemplate(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replace(new RegExp(`{{${key}}}`, 'g'), value),
    template
  );
}
