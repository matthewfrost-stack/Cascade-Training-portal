'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import UniformButton from './UniformButton';
import Icon from './Icon';

interface RosterSettingsModalProps {
  eventId: string;
  courseId: string;
  eventDate: string;
  courseName: string;
  defaultCapacity: number;
  currentCapacity: number;
  hasCapacityOverride: boolean;
  currentMessage: string;
  onClose: () => void;
  onSaved: (settings: {
    maxAttendees: number;
    hasCapacityOverride: boolean;
    message: string;
  }) => void;
}

export default function RosterSettingsModal({
  eventId,
  courseId,
  eventDate,
  courseName,
  defaultCapacity,
  currentCapacity,
  hasCapacityOverride,
  currentMessage,
  onClose,
  onSaved,
}: RosterSettingsModalProps) {
  const [isDark, setIsDark] = useState(true);
  const [bookingLimit, setBookingLimit] = useState(
    hasCapacityOverride ? String(currentCapacity) : ''
  );
  const [message, setMessage] = useState(currentMessage);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const theme = localStorage.getItem('theme');
    setIsDark(theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches));

    const handleThemeChange = (event: Event) => {
      const themeEvent = event as CustomEvent<{ isDark?: boolean }>;
      if (typeof themeEvent.detail?.isDark === 'boolean') {
        setIsDark(themeEvent.detail.isDark);
      }
    };

    window.addEventListener('themeChange', handleThemeChange);
    return () => window.removeEventListener('themeChange', handleThemeChange);
  }, []);

  const inputStyle = {
    backgroundColor: isDark ? '#0f172a' : '#ffffff',
    color: isDark ? '#f1f5f9' : '#1e293b',
    borderColor: isDark ? '#334155' : '#cbd5e1',
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage('');

    const trimmedLimit = bookingLimit.trim();
    const parsedLimit = trimmedLimit ? Number(trimmedLimit) : null;

    if (parsedLimit !== null && (!Number.isInteger(parsedLimit) || parsedLimit < 1)) {
      setErrorMessage('Booking limit must be a whole number of at least 1, or left blank to use the course default.');
      return;
    }

    setSaving(true);

    try {
      const { data: overrides, error: overrideLookupError } = await supabase
        .from('course_event_overrides')
        .select('id')
        .eq('course_id', courseId)
        .eq('event_date', eventDate)
        .order('id', { ascending: false })
        .limit(1);

      if (overrideLookupError) throw overrideLookupError;

      const existingOverride = overrides?.[0];
      if (parsedLimit === null) {
        if (existingOverride?.id) {
          const { error } = await supabase
            .from('course_event_overrides')
            .delete()
            .eq('id', existingOverride.id);
          if (error) throw error;
        }
      } else if (existingOverride?.id) {
        const { error } = await supabase
          .from('course_event_overrides')
          .update({ max_attendees: parsedLimit })
          .eq('id', existingOverride.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('course_event_overrides')
          .insert([{
            course_id: courseId,
            event_date: eventDate,
            max_attendees: parsedLimit,
            reason: 'Set from booking roster',
          }]);
        if (error) throw error;
      }

      const cleanedMessage = message.trim();
      const { error: eventUpdateError } = await supabase
        .from('training_events')
        .update({ notes: cleanedMessage || null })
        .eq('id', eventId);

      if (eventUpdateError) throw eventUpdateError;

      onSaved({
        maxAttendees: parsedLimit ?? defaultCapacity,
        hasCapacityOverride: parsedLimit !== null,
        message: cleanedMessage,
      });
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save roster settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-md">
      <div
        style={{
          backgroundColor: isDark ? '#1e293b' : '#ffffff',
          borderColor: isDark ? '#334155' : '#cbd5e1',
        }}
        className="w-full max-w-lg rounded-3xl border p-6 shadow-2xl sm:p-8"
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p style={{ color: '#2563eb' }} className="mb-1 text-[10px] font-black uppercase tracking-widest">
              Roster settings
            </p>
            <h2 style={{ color: isDark ? '#f1f5f9' : '#1e293b' }} className="text-xl font-black uppercase tracking-tight">
              {courseName}
            </h2>
            <p style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="mt-1 text-xs font-bold uppercase">
              {new Date(`${eventDate}T00:00:00`).toLocaleDateString('en-GB')}
            </p>
          </div>
          <UniformButton
            variant="icon"
            className="text-2xl"
            style={{ color: isDark ? '#94a3b8' : '#64748b' }}
            onClick={onClose}
            aria-label="Close roster settings"
          >
            <Icon name="close" className="h-6 w-6" />
          </UniformButton>
        </div>

        <form onSubmit={handleSave} className="space-y-5">
          <div>
            <label style={{ color: isDark ? '#cbd5e1' : '#475569' }} className="mb-2 block text-[10px] font-black uppercase tracking-widest">
              Booking limit
            </label>
            <input
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              placeholder={`Use course default (${defaultCapacity})`}
              value={bookingLimit}
              onChange={(event) => setBookingLimit(event.target.value)}
              style={inputStyle}
              className="w-full rounded-xl border p-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="mt-2 text-xs">
              Leave blank to remove the date-specific limit and use the course default of {defaultCapacity}.
            </p>
          </div>

          <div>
            <label style={{ color: isDark ? '#cbd5e1' : '#475569' }} className="mb-2 block text-[10px] font-black uppercase tracking-widest">
              Message shown at the top of the roster
            </label>
            <textarea
              rows={4}
              maxLength={1000}
              placeholder="e.g. Please arrive 10 minutes early and bring your ID."
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              style={inputStyle}
              className="w-full resize-none rounded-xl border p-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="mt-2 text-right text-[10px]">
              {message.length}/1000
            </p>
          </div>

          {errorMessage && (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs font-bold text-red-500" role="alert">
              {errorMessage}
            </p>
          )}

          <div className="flex gap-3">
            <UniformButton
              type="button"
              variant="secondary"
              onClick={onClose}
              className="flex-1 py-3"
              style={{ backgroundColor: isDark ? '#334155' : '#e2e8f0', color: isDark ? '#f1f5f9' : '#1e293b' }}
            >
              Cancel
            </UniformButton>
            <UniformButton
              type="submit"
              variant="primary"
              disabled={saving}
              className="flex-1 py-3"
            >
              {saving ? 'Saving...' : 'Save settings'}
            </UniformButton>
          </div>
        </form>
      </div>
    </div>
  );
}
