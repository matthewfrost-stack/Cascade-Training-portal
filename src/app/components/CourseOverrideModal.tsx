'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import UniformButton from './UniformButton';

interface CourseOverride {
  id: string;
  event_date: string;
  max_attendees: number;
  reason?: string | null;
}

export default function CourseOverrideModal({ courseId, courseName, onClose }: { courseId: string; courseName: string; onClose: () => void }) {
  const [overrides, setOverrides] = useState<CourseOverride[]>([]);
  const [isDark, setIsDark] = useState(true);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ 
    event_date: '', 
    max_attendees: 1,
    reason: ''
  });

  useEffect(() => {
    const handleThemeChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ isDark?: boolean }>;
      if (typeof customEvent.detail?.isDark === 'boolean') setIsDark(customEvent.detail.isDark);
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

  const fetchOverrides = useCallback(async () => {
    const { data } = await supabase
      .from('course_event_overrides')
      .select('*')
      .eq('course_id', courseId)
      .order('event_date', { ascending: false });
    setOverrides(data || []);
  }, [courseId]);

  useEffect(() => {
    checkTheme();
    void fetchOverrides();
  }, [fetchOverrides]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.from('course_event_overrides').insert([{
        course_id: courseId,
        event_date: formData.event_date,
        max_attendees: formData.max_attendees,
        reason: formData.reason || null
      }]);
      
      if (error) throw error;
      
      setFormData({ event_date: '', max_attendees: 1, reason: '' });
      fetchOverrides();
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : 'Unable to add override');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this override?')) return;
    try {
      const { error } = await supabase.from('course_event_overrides').delete().eq('id', id);
      if (error) throw error;
      fetchOverrides();
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : 'Unable to remove override');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
      <div style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', borderColor: isDark ? '#334155' : '#cbd5e1' }} className="rounded-3xl p-8 w-full max-w-2xl shadow-2xl border transition-colors duration-300">
        <div className="flex justify-between items-center mb-6">
          <h2 style={{ color: isDark ? '#f1f5f9' : '#1e293b' }} className="text-2xl font-black uppercase tracking-tight">
            Capacity Overrides - {courseName}
          </h2>
          <UniformButton
            variant="icon"
            className="hover:text-red-500 text-2xl transition-all hover:scale-125 active:scale-100 duration-200"
            style={{ color: isDark ? '#94a3b8' : '#64748b' }}
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </UniformButton>
        </div>

        {/* ADD OVERRIDE FORM */}
        <form onSubmit={handleAdd} style={{ backgroundColor: isDark ? '#0f172a' : '#f1f5f9', borderColor: isDark ? '#334155' : '#e2e8f0' }} className="p-6 rounded-2xl border mb-8">
          <p style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="text-[10px] font-black uppercase mb-4">Add New Override</p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div>
              <label style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="block text-[10px] font-black uppercase mb-2">Event Date</label>
              <style>{`
                input[type="date"]::-webkit-calendar-picker-indicator {
                  filter: ${isDark ? 'invert(1) brightness(1.2)' : 'none'};
                  cursor: pointer;
                }
              `}</style>
              <input 
                type="date" 
                required 
                style={{ backgroundColor: isDark ? '#0f172a' : '#ffffff', color: isDark ? '#f1f5f9' : '#1e293b', borderColor: isDark ? '#334155' : '#cbd5e1' }}
                className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-purple-500"
                value={formData.event_date} 
                onChange={e => setFormData({...formData, event_date: e.target.value})}
              />
            </div>
            <div>
              <label style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="block text-[10px] font-black uppercase mb-2">Max Attendees</label>
              <input 
                type="number" 
                min="1"
                required 
                style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', color: isDark ? '#f1f5f9' : '#1e293b', borderColor: isDark ? '#334155' : '#cbd5e1' }}
                className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-purple-500"
                value={formData.max_attendees} 
                onChange={e => setFormData({...formData, max_attendees: parseInt(e.target.value) || 1})}
              />
            </div>
            <div>
              <label style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="block text-[10px] font-black uppercase mb-2">Reason (Optional)</label>
              <input 
                type="text" 
                placeholder="e.g. Single trainer" 
                style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', color: isDark ? '#f1f5f9' : '#1e293b', borderColor: isDark ? '#334155' : '#cbd5e1' }}
                className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-purple-500"
                value={formData.reason} 
                onChange={e => setFormData({...formData, reason: e.target.value})}
              />
            </div>
          </div>

          <UniformButton
            variant="primary"
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-bold shadow-lg transition-all disabled:opacity-50 hover:scale-105 active:scale-95 duration-200"
            style={{ backgroundColor: '#a855f7', color: '#fff' }}
          >
            {loading ? 'Processing...' : '➕ Add Override'}
          </UniformButton>
        </form>

        {/* OVERRIDES LIST */}
        <div>
          <p style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="text-[10px] font-black uppercase mb-4 tracking-widest">Active Overrides</p>
          <div className="space-y-3 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
            {overrides.length === 0 ? (
              <p style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="text-sm text-center py-8">No overrides set</p>
            ) : (
              overrides.map(override => (
                <div key={override.id} style={{ backgroundColor: isDark ? '#0f172a' : '#f1f5f9', borderColor: isDark ? '#334155' : '#e2e8f0' }} className="p-4 border rounded-2xl flex justify-between items-center group transition-all hover:border-purple-500">
                  <div className="flex-1">
                    <p style={{ color: isDark ? '#f1f5f9' : '#1e293b' }} className="font-bold">{new Date(override.event_date).toLocaleDateString('en-GB', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</p>
                    <div className="flex gap-4 mt-1">
                      <p style={{ color: '#a855f7' }} className="text-[10px] font-black uppercase">Capacity: {override.max_attendees}</p>
                      {override.reason && (
                        <p style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="text-[10px] font-black uppercase">Reason: {override.reason}</p>
                      )}
                    </div>
                  </div>
                  <UniformButton
                    variant="danger"
                    className="p-3 rounded-lg font-bold transition-all hover:scale-110 active:scale-95 shadow-md hover:shadow-lg duration-200"
                    style={{ backgroundColor: '#dc2626', color: '#fff' }}
                    onClick={() => handleDelete(override.id)}
                  >
                    🗑️
                  </UniformButton>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
