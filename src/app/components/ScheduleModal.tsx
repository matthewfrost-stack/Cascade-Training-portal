'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getEmailTestHeaders } from '@/lib/emailTestMode';
import Icon from './Icon';

export default function ScheduleModal({
  onClose,
  onRefresh,
  defaultDate,
}: {
  onClose: () => void;
  onRefresh: () => void;
  defaultDate?: string;
}) {
  const [courses, setCourses] = useState<any[]>([]);
  const [venues, setVenues] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDark, setIsDark] = useState(true);
  
  const [formData, setFormData] = useState({
    course_id: '',
    location: '', 
    event_date: defaultDate || '',
    start_time: '09:00',
    end_time: '17:00',
    am_break_minutes: '0',
    pm_break_minutes: '0',
    notes: ''
  });

  useEffect(() => {
    checkTheme();
    async function fetchData() {
      const [coursesRes, venuesRes] = await Promise.all([
        supabase.from('courses').select('id, name').order('name'),
        supabase.from('venues').select('*').order('name')
      ]);
      setCourses(coursesRes.data || []);
      setVenues(venuesRes.data || []);
    }
    fetchData();
  }, []);

  useEffect(() => {
    const handleThemeChange = (event: any) => {
      setIsDark(event.detail.isDark);
    };
    
    window.addEventListener('themeChange', handleThemeChange);
    return () => window.removeEventListener('themeChange', handleThemeChange);
  }, []);

  function checkTheme() {
    if (typeof window !== 'undefined') {
      const theme = localStorage.getItem('theme');
      const isDarkMode = theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
      setIsDark(isDarkMode);
    }
  }

  const getNextDate = (dateValue: string): string => {
    const base = new Date(`${dateValue}T00:00:00Z`);
    base.setUTCDate(base.getUTCDate() + 1);
    return base.toISOString().split('T')[0];
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const amBreakMinutes = Number(formData.am_break_minutes || 0);
    const pmBreakMinutes = Number(formData.pm_break_minutes || 0);
    const startMinutes = Number(formData.start_time.slice(0, 2)) * 60 + Number(formData.start_time.slice(3, 5));
    const endMinutes = Number(formData.end_time.slice(0, 2)) * 60 + Number(formData.end_time.slice(3, 5));

    if (!Number.isInteger(amBreakMinutes) || !Number.isInteger(pmBreakMinutes) || amBreakMinutes < 0 || pmBreakMinutes < 0) {
      alert('AM and PM break allocations must be whole numbers of minutes.');
      setLoading(false);
      return;
    }

    if (endMinutes < startMinutes || amBreakMinutes + pmBreakMinutes > endMinutes - startMinutes) {
      alert('The total AM and PM breaks cannot be longer than the scheduled session.');
      setLoading(false);
      return;
    }

    const selectedCourse = courses.find(c => c.id === formData.course_id);
    const isTeamTeachLevel2 = String(selectedCourse?.name || '').trim().toLowerCase() === 'team teach level 2';
    const eventDates = isTeamTeachLevel2
      ? [formData.event_date, getNextDate(formData.event_date)]
      : [formData.event_date];

    for (const eventDate of eventDates) {
      const { data: conflicts } = await supabase
        .from('training_events')
        .select('*, courses(name)')
        .eq('event_date', eventDate)
        .eq('location', formData.location)
        .filter('start_time', 'lt', `${formData.end_time}:00`)
        .filter('end_time', 'gt', `${formData.start_time}:00`);

      if (conflicts && conflicts.length > 0) {
        alert(
          `⚠️ VENUE CONFLICT (${new Date(`${eventDate}T00:00:00`).toLocaleDateString('en-GB')}): This room is already booked for ${conflicts[0].courses?.name}`
        );
        setLoading(false);
        return;
      }
    }

    const eventsToInsert = eventDates.map((eventDate) => ({
      ...formData,
      event_date: eventDate,
      start_time: `${formData.start_time}:00`,
      end_time: `${formData.end_time}:00`,
      am_break_minutes: amBreakMinutes,
      pm_break_minutes: pmBreakMinutes,
      notes: formData.notes?.trim() || null,
    }));

    const { data: insertedEvents, error } = await supabase
      .from('training_events')
      .insert(eventsToInsert)
      .select('id');

    if (!error && insertedEvents && insertedEvents.length > 0) {
      onRefresh();
      onClose();
    } else {
      alert(error?.message || 'Failed to create event');
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <div style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', borderColor: isDark ? '#334155' : '#cbd5e1' }} className="rounded-3xl sm:rounded-[40px] w-full max-w-lg shadow-2xl border overflow-hidden flex flex-col transition-colors duration-300">
        
        <div style={{ backgroundColor: isDark ? '#0f172a' : '#f1f5f9', borderColor: isDark ? '#334155' : '#e2e8f0' }} className="p-5 sm:p-8 border-b flex justify-between items-center">
          <h2 style={{ color: isDark ? '#f1f5f9' : '#1e293b' }} className="text-xl font-black uppercase tracking-tight">Schedule Session</h2>
          <button onClick={onClose} style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="hover:text-red-500 text-3xl font-light transition-colors" aria-label="Close">
            <Icon name="close" className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-8 space-y-6">
          <div>
            <label style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="block text-[10px] font-black uppercase mb-2">Select Course</label>
            <select 
              required
              style={{ backgroundColor: isDark ? '#0f172a' : '#f1f5f9', color: isDark ? '#f1f5f9' : '#1e293b', borderColor: isDark ? '#334155' : '#cbd5e1' }}
              className="w-full px-4 py-2.5 sm:py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-sm"
              value={formData.course_id}
              onChange={(e) => setFormData({...formData, course_id: e.target.value})}
            >
              <option value="">Choose Course...</option>
              {courses?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="block text-[10px] font-black uppercase mb-2">Training Venue</label>
            <select 
              required
              style={{ backgroundColor: isDark ? '#0f172a' : '#f1f5f9', color: isDark ? '#f1f5f9' : '#1e293b', borderColor: isDark ? '#334155' : '#cbd5e1' }}
              className="w-full px-4 py-2.5 sm:py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-sm"
              value={formData.location}
              onChange={(e) => setFormData({...formData, location: e.target.value})}
            >
              <option value="">Select Room...</option>
              {venues?.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="block text-[10px] font-black uppercase mb-2">Date</label>
              <style>{`
                input[type="date"]::-webkit-calendar-picker-indicator {
                  filter: ${isDark ? 'invert(1) brightness(1.2)' : 'none'};
                  cursor: pointer;
                }
                input[type="time"]::-webkit-calendar-picker-indicator {
                  filter: ${isDark ? 'invert(1) brightness(1.2)' : 'none'};
                  cursor: pointer;
                }
              `}</style>
              <input 
                type="date" required
                style={{ backgroundColor: isDark ? '#0f172a' : '#ffffff', color: isDark ? '#f1f5f9' : '#1e293b', borderColor: isDark ? '#334155' : '#cbd5e1' }}
                className="w-full px-4 py-2.5 sm:py-3 border rounded-xl outline-none font-bold text-sm"
                value={formData.event_date}
                onChange={(e) => setFormData({...formData, event_date: e.target.value})}
              />
              {String(courses.find(c => c.id === formData.course_id)?.name || '').trim().toLowerCase() === 'team teach level 2' && (
                <p style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="mt-2 text-[10px] font-black uppercase">
                  Team Teach Level 2 auto-adds the same session on the following day.
                </p>
              )}
            </div>

            <div>
              <label style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="block text-[10px] font-black uppercase mb-2">Start Time</label>
              <input 
                type="time" required
                style={{ backgroundColor: isDark ? '#0f172a' : '#ffffff', color: isDark ? '#f1f5f9' : '#1e293b', borderColor: isDark ? '#334155' : '#cbd5e1' }}
                className="w-full px-4 py-2.5 sm:py-3 border rounded-xl outline-none font-bold text-sm"
                value={formData.start_time}
                onChange={(e) => setFormData({...formData, start_time: e.target.value})}
              />
            </div>

          <div>
            <label style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="block text-[10px] font-black uppercase mb-2">End Time</label>
              <input 
                type="time" required
                style={{ backgroundColor: isDark ? '#0f172a' : '#ffffff', color: isDark ? '#f1f5f9' : '#1e293b', borderColor: isDark ? '#334155' : '#cbd5e1' }}
                className="w-full px-4 py-2.5 sm:py-3 border rounded-xl outline-none font-bold text-sm"
                value={formData.end_time}
                onChange={(e) => setFormData({...formData, end_time: e.target.value})}
              />
            </div>
          </div>

          <div>
            <p style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="mb-2 block text-[10px] font-black uppercase">Break allocation (minutes)</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label style={{ color: isDark ? '#cbd5e1' : '#475569' }} className="mb-2 block text-[10px] font-bold uppercase">AM break</label>
                <input
                  type="number"
                  min="0"
                  max="1440"
                  step="1"
                  inputMode="numeric"
                  value={formData.am_break_minutes}
                  onChange={(e) => setFormData({ ...formData, am_break_minutes: e.target.value })}
                  style={{ backgroundColor: isDark ? '#0f172a' : '#ffffff', color: isDark ? '#f1f5f9' : '#1e293b', borderColor: isDark ? '#334155' : '#cbd5e1' }}
                  className="w-full px-4 py-2.5 sm:py-3 border rounded-xl outline-none font-bold text-sm"
                />
              </div>
              <div>
                <label style={{ color: isDark ? '#cbd5e1' : '#475569' }} className="mb-2 block text-[10px] font-bold uppercase">PM break</label>
                <input
                  type="number"
                  min="0"
                  max="1440"
                  step="1"
                  inputMode="numeric"
                  value={formData.pm_break_minutes}
                  onChange={(e) => setFormData({ ...formData, pm_break_minutes: e.target.value })}
                  style={{ backgroundColor: isDark ? '#0f172a' : '#ffffff', color: isDark ? '#f1f5f9' : '#1e293b', borderColor: isDark ? '#334155' : '#cbd5e1' }}
                  className="w-full px-4 py-2.5 sm:py-3 border rounded-xl outline-none font-bold text-sm"
                />
              </div>
            </div>
            <p style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="mt-2 text-[10px] font-bold">Enter 0 when there is no break. Both values are deducted from paid time.</p>
          </div>

          <div>
            <label style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="block text-[10px] font-black uppercase mb-2">
              Notes (shown when booking)
            </label>
            <textarea
              rows={3}
              style={{ backgroundColor: isDark ? '#0f172a' : '#ffffff', color: isDark ? '#f1f5f9' : '#1e293b', borderColor: isDark ? '#334155' : '#cbd5e1' }}
              className="w-full px-4 py-2.5 sm:py-3 border rounded-xl outline-none font-bold text-sm resize-none"
              placeholder="e.g. Only Banks House to book, use back door..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>

          <button 
            type="submit" disabled={loading}
            className="w-full mt-4 py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-lg transition-all active:scale-95"
          >
            {loading ? 'Processing...' : 'Confirm Schedule'}
          </button>
        </form>
      </div>
    </div>
  );
}
