'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Lateness and absence reasons offered in the booking window and on the
 * Intelligence Hub. Admins manage them in Admin → Setup → Attendance Reasons
 * (`attendance_reasons` table). Bookings store the reason as text, so hiding a
 * reason never changes past bookings or past figures.
 */
export type ReasonKind = 'late' | 'absence';

export type AttendanceReason = { id: string; kind: ReasonKind; label: string; sort_order: number; is_active: boolean };

/** Used until the database update has been run (and if the list can't be loaded). */
export const DEFAULT_REASONS: Record<ReasonKind, string[]> = {
  late: ['Traffic', 'Handover delayed', 'Public Transport', 'Personal', 'Other'],
  absence: ['Appointment', 'Needed in home', 'Rostering', 'Transport issues', 'Not started yet', 'Childcare', 'Sickness', 'Holiday'],
};

export const REASON_KIND_LABELS: Record<ReasonKind, string> = { late: 'Lateness reasons', absence: 'Absence reasons' };

/** Every reason (active and hidden), in order. Throws if the table can't be read. */
export async function loadAllReasons(): Promise<AttendanceReason[]> {
  const { data, error } = await supabase
    .from('attendance_reasons')
    .select('id, kind, label, sort_order, is_active')
    .order('kind')
    .order('sort_order');
  if (error) throw error;
  return (data || []) as AttendanceReason[];
}

/** The active reasons for each kind, falling back to the built-in lists. */
export function useAttendanceReasons(): Record<ReasonKind, string[]> {
  const [reasons, setReasons] = useState<Record<ReasonKind, string[]>>(DEFAULT_REASONS);
  const load = useCallback(async () => {
    try {
      const rows = (await loadAllReasons()).filter((r) => r.is_active);
      const late = rows.filter((r) => r.kind === 'late').map((r) => r.label);
      const absence = rows.filter((r) => r.kind === 'absence').map((r) => r.label);
      setReasons({ late: late.length ? late : DEFAULT_REASONS.late, absence: absence.length ? absence : DEFAULT_REASONS.absence });
    } catch {
      // Table not there yet (migration not run) or offline: keep the built-in lists.
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return reasons;
}

/**
 * The options for a dropdown: the active reasons plus the booking's current
 * value if it isn't one of them (a hidden reason, or an automatic label such as
 * "Sign In App"), so opening the dropdown never looks like the reason was lost.
 */
export function reasonOptions(active: string[], current: string | null | undefined): string[] {
  const value = (current || '').trim();
  return value && !active.includes(value) ? [...active, value] : active;
}
