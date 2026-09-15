'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { calculatePaidMinutes, formatDuration } from '@/lib/trainingEventTime';

type KioskEvent = {
  id: string;
  courseName: string;
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
  amBreakMinutes: number;
  pmBreakMinutes: number;
  location: string | null;
};

type KioskBooking = {
  id: string;
  profileId: string;
  fullName: string;
  location: string;
  attendedAt: string | null;
  minutesLate: number;
  lateReason: string | null;
  absenceReason: string | null;
  attendanceSource: string;
  attendanceMarkedAt: string | null;
};

type Filter = 'all' | 'outstanding' | 'present';

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(`${value}T00:00:00`));
  } catch {
    return value;
  }
}

function formatTime(value: string | null) {
  return value ? String(value).slice(0, 5) : '';
}

function KioskPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const eventId = searchParams?.get('eventId') ?? null;
  const [event, setEvent] = useState<KioskEvent | null>(null);
  const [bookings, setBookings] = useState<KioskBooking[]>([]);
  const [filter, setFilter] = useState<Filter>('outstanding');
  const [search, setSearch] = useState('');
  const [minutesDraft, setMinutesDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const loadRegister = useCallback(async () => {
    if (!eventId) {
      setError('This register link is missing its course event.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/attendance/kiosk?eventId=${encodeURIComponent(eventId)}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Could not load the register.');
      setEvent(payload.event);
      setBookings(payload.bookings || []);
      setMinutesDraft(Object.fromEntries((payload.bookings || []).map((booking: KioskBooking) => [booking.id, String(booking.minutesLate || 0)])));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load the register.');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    loadRegister();
  }, [loadRegister]);

  const visibleBookings = useMemo(() => {
    const searchValue = search.trim().toLowerCase();
    return bookings.filter((booking) => {
      const matchesFilter = filter === 'all'
        || (filter === 'present' && Boolean(booking.attendedAt))
        || (filter === 'outstanding' && !booking.attendedAt);
      const matchesSearch = !searchValue
        || booking.fullName.toLowerCase().includes(searchValue)
        || booking.location.toLowerCase().includes(searchValue);
      return matchesFilter && matchesSearch;
    });
  }, [bookings, filter, search]);

  const presentCount = bookings.filter((booking) => booking.attendedAt).length;

  function closeRegister() {
    // The register is normally opened in a new tab, so router.back() can have
    // no history entry to return to. Always provide a deterministic destination.
    router.push('/apps/booking-calendar');
  }

  async function updateAttendance(booking: KioskBooking, present: boolean) {
    setSaving(booking.id);
    try {
      const response = await fetch('/api/attendance/kiosk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          bookingId: booking.id,
          present,
          minutesLate: Number(minutesDraft[booking.id] || 0),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Could not update attendance.');
      if (payload.booking) {
        setBookings((current) => current.map((row) => row.id === booking.id ? payload.booking : row));
      }
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Could not update attendance.');
    } finally {
      setSaving(null);
    }
  }

  return (
    <main className="fixed inset-0 z-[2000] overflow-y-auto bg-slate-100 text-slate-950 dark:bg-slate-950 dark:text-white">
      <div className="mx-auto min-h-full w-full max-w-5xl px-4 py-5 sm:px-8 sm:py-8">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-[0.25em] text-blue-600 dark:text-blue-400">Trainer register</p>
            <h1 className="text-2xl font-black sm:text-4xl">{event?.courseName || 'Course register'}</h1>
            {event && (
              <>
                <p className="mt-2 text-sm font-bold text-slate-500 dark:text-slate-400">
                  {formatDate(event.eventDate)} · {formatTime(event.startTime)}{event.endTime ? `–${formatTime(event.endTime)}` : ''}
                  {event.location ? ` · ${event.location}` : ''}
                </p>
                <p className="mt-1 text-xs font-black uppercase text-slate-500 dark:text-slate-400">
                  AM break {event.amBreakMinutes}m · PM break {event.pmBreakMinutes}m · Paid {formatDuration(calculatePaidMinutes(event.startTime, event.endTime, event.amBreakMinutes, event.pmBreakMinutes))}
                </p>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={loadRegister} className="rounded-2xl bg-white px-4 py-3 text-xs font-black uppercase shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">Refresh</button>
            <button onClick={closeRegister} className="rounded-2xl bg-slate-900 px-4 py-3 text-xs font-black uppercase text-white dark:bg-white dark:text-slate-900">Close</button>
          </div>
        </header>

        {error && <div className="mb-5 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm font-bold text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</div>}

        {!loading && !error && (
          <>
            <section className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800"><p className="text-[10px] font-black uppercase text-slate-500">Booked</p><p className="mt-1 text-3xl font-black">{bookings.length}</p></div>
              <div className="rounded-3xl bg-emerald-500 p-4 text-white shadow-sm"><p className="text-[10px] font-black uppercase text-emerald-100">Present</p><p className="mt-1 text-3xl font-black">{presentCount}</p></div>
              <div className="rounded-3xl bg-amber-400 p-4 text-amber-950 shadow-sm"><p className="text-[10px] font-black uppercase text-amber-900">Outstanding</p><p className="mt-1 text-3xl font-black">{bookings.length - presentCount}</p></div>
              <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800"><p className="text-[10px] font-black uppercase text-slate-500">Checked in</p><p className="mt-1 text-3xl font-black">{bookings.length ? Math.round((presentCount / bookings.length) * 100) : 0}%</p></div>
            </section>

            <section className="mb-5 rounded-3xl bg-white p-3 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
              <div className="flex flex-col gap-3 sm:flex-row">
                <input value={search} onChange={(input) => setSearch(input.target.value)} placeholder="Find a person..." className="min-h-12 flex-1 rounded-2xl bg-slate-100 px-4 text-sm font-bold outline-none ring-blue-500 focus:ring-2 dark:bg-slate-800" />
                <div className="grid grid-cols-3 gap-2">
                  {(['outstanding', 'present', 'all'] as Filter[]).map((option) => (
                    <button key={option} onClick={() => setFilter(option)} className={`rounded-2xl px-3 py-3 text-[10px] font-black uppercase ${filter === option ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{option}</button>
                  ))}
                </div>
              </div>
            </section>

            <section className="space-y-3 pb-8">
              {visibleBookings.map((booking) => {
                const isPresent = Boolean(booking.attendedAt);
                const isSaving = saving === booking.id;
                return (
                  <article key={booking.id} className={`rounded-3xl border p-4 shadow-sm sm:p-5 ${isPresent ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'}`}>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="truncate text-lg font-black sm:text-xl">{booking.fullName}</h2>
                          <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${isPresent ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>{isPresent ? 'Present' : 'Not checked in'}</span>
                          {isPresent && <span className="rounded-full bg-white/80 px-2 py-1 text-[9px] font-black uppercase text-slate-500 dark:bg-slate-900/70">{booking.attendanceSource === 'sign_in_app' ? 'Sign In App' : 'Kiosk override'}</span>}
                        </div>
                        <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">{booking.location}{booking.minutesLate > 0 ? ` · ${booking.minutesLate} mins late` : ''}</p>
                      </div>
                      <div className="flex flex-wrap items-end justify-start gap-2 sm:justify-end">
                        <label className="flex flex-col gap-1 text-[9px] font-black uppercase text-slate-500">
                          Late minutes
                          <input type="number" min="0" max="1440" value={minutesDraft[booking.id] ?? '0'} onChange={(input) => setMinutesDraft((current) => ({ ...current, [booking.id]: input.target.value }))} className="h-12 w-28 rounded-2xl bg-white px-3 text-base font-black text-slate-900 ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-white dark:ring-slate-700" />
                        </label>
                        <button disabled={isSaving} onClick={() => updateAttendance(booking, !isPresent)} className={`min-h-12 rounded-2xl px-5 text-xs font-black uppercase text-white disabled:opacity-50 ${isPresent ? 'bg-slate-700 dark:bg-slate-600' : 'bg-emerald-600'}`}>
                          {isSaving ? 'Saving...' : isPresent ? 'Undo / absent' : 'Mark present'}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
              {visibleBookings.length === 0 && <div className="rounded-3xl border border-dashed border-slate-300 p-10 text-center text-sm font-bold text-slate-500 dark:border-slate-700">No people match this view.</div>}
            </section>
          </>
        )}

        {loading && <div className="rounded-3xl bg-white p-12 text-center text-sm font-black uppercase text-slate-500 shadow-sm dark:bg-slate-900">Loading register...</div>}
      </div>
    </main>
  );
}

export default function KioskPage() {
  return (
    <Suspense fallback={<main className="fixed inset-0 z-[2000] grid place-items-center bg-slate-100 text-sm font-black uppercase text-slate-500 dark:bg-slate-950">Loading register...</main>}>
      <KioskPageContent />
    </Suspense>
  );
}
