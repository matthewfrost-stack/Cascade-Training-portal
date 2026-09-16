'use client';

import { useState } from 'react';
import UniformButton from './UniformButton';

export type QualificationTimelineEvent = {
  id: string;
  event_type: string;
  event_date: string;
  note: string | null;
  created_at?: string;
};

const eventTypes = [
  ['contact_attempt', 'Contact attempt'],
  ['application', 'Application received'],
  ['interview', 'Interview'],
  ['offer', 'Offer made'],
  ['enrolled', 'Enrolled'],
  ['progress_update', 'Progress update'],
  ['assessment', 'Assessment'],
  ['completed', 'Completed'],
  ['note', 'Note'],
] as const;

function readable(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

type Props = {
  events: QualificationTimelineEvent[];
  onAdd: (event: { event_type: string; event_date: string; note: string }) => Promise<void>;
  saving: boolean;
};

export default function QualificationTimeline({ events, onAdd, saving }: Props) {
  const [eventType, setEventType] = useState('progress_update');
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await onAdd({ event_type: eventType, event_date: `${eventDate}T12:00:00.000Z`, note });
    setNote('');
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="relative pl-7">
        <div className="absolute bottom-2 left-2 top-2 w-px bg-slate-200 dark:bg-slate-700" />
        {events.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 p-5 text-sm font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-400">No timeline entries yet.</p>
        ) : (
          <div className="space-y-4">
            {[...events].sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime()).map((item) => (
              <div key={item.id} className="relative rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
                <span className="absolute -left-[31px] top-5 h-3 w-3 rounded-full border-2 border-white bg-blue-500 shadow dark:border-slate-900" />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-black uppercase tracking-wide text-slate-800 dark:text-slate-100">{readable(item.event_type)}</p>
                  <time className="text-xs font-bold text-slate-500 dark:text-slate-400">{displayDate(item.event_date)}</time>
                </div>
                {item.note && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{item.note}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-950/50">
        <p className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Add timeline update</p>
        <div className="mt-3 grid gap-3">
          <select value={eventType} onChange={(event) => setEventType(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
            {eventTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <input type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} required className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
          <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} placeholder="What happened?" className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
          <UniformButton type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add update'}</UniformButton>
        </div>
      </form>
    </div>
  );
}

