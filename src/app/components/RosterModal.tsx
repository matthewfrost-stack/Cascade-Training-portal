'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Icon from './Icon';

interface RosterModalProps {
  event: { id: string; course_name: string; event_date: string; venue_id: string } | null;
  onClose: () => void;
  onRefresh: () => void;
  userRole?: 'staff' | 'manager' | 'scheduler' | 'admin';
  userLocation?: string;
}
interface RosterStaff {
  id: string;
  full_name: string | null;
  home_house: string | null;
  location?: string | null;
}
interface BookedRosterStaff extends RosterStaff {
  booking_id: string;
  attended_at: string | null;
  is_late?: boolean | null;
  absence_reason?: string | null;
  lateness_minutes?: number | null;
  lateness_reason?: string | null;
}
type BookingStatusUpdates = Partial<Pick<BookedRosterStaff, 'attended_at' | 'absence_reason' | 'lateness_minutes' | 'lateness_reason'>>;

export default function RosterModal({ event, onClose, onRefresh, userRole = 'admin', userLocation }: RosterModalProps) {
  const [loading, setLoading] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const [availableStaff, setAvailableStaff] = useState<RosterStaff[]>([]);
  const [bookedStaff, setBookedStaff] = useState<BookedRosterStaff[]>([]);

  // Check if user can remove staff from roster
  const canRemoveStaff = userRole !== 'staff';
  
  // Check if manager can remove a specific staff member (only from their location)
  const canRemoveFromLocation = (staffLocation?: string | null) => {
    if (userRole === 'admin' || userRole === 'scheduler') return true;
    if (userRole === 'manager' && userLocation && staffLocation === userLocation) return true;
    return false;
  };

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

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all active staff (exclude deleted)
      const { data: staffData } = await supabase.from('profiles').select('*').eq('is_deleted', false).order('full_name');

      // Fetch bookings for this event with full profile details
      const { data: bookings } = await supabase
        .from('bookings')
        .select(`
          id,
          profile_id,
          attended_at,
          is_late,
          profiles(id, full_name, home_house),
          absence_reason,
          lateness_minutes,
          lateness_reason
        `)
        .eq('event_id', event?.id);

      // Extract booked staff IDs
      const bookedIds = bookings?.map(b => b.profile_id) || [];

      // Set booked staff with booking IDs for removal
      const booked = bookings?.map(b => {
        // Handle potential array response for joined relation
        const profile = Array.isArray(b.profiles) ? b.profiles[0] : b.profiles;
        return {
          booking_id: b.id,
          id: b.profile_id,
          full_name: profile?.full_name,
          home_house: profile?.home_house,
          location: (profile as RosterStaff | null)?.location,
          attended_at: b.attended_at,
          is_late: b.is_late,
          absence_reason: b.absence_reason,
          lateness_minutes: b.lateness_minutes,
          lateness_reason: b.lateness_reason
        };
      }) || [];
      setBookedStaff(booked);

      // Filter available staff (not already booked)
      const available = (staffData || []).filter(staff => !bookedIds.includes(staff.id));
      setAvailableStaff(available);
    } catch (err) {
      console.error("Error fetching roster data:", err);
    } finally {
      setLoading(false);
    }
  }, [event]);

  useEffect(() => {
    if (event) {
      checkTheme();
      void fetchData();
    }
  }, [event, fetchData]);

  async function handleBookStaff(staffId: string) {
    setLoading(true);
    try {
      const { error } = await supabase.from('bookings').insert([{
        profile_id: staffId,
        event_id: event?.id,
        attended_at: null
      }]);

      if (error) throw error;

      await fetchData();
      onRefresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Unable to book staff member');
    } finally {
      setLoading(false);
    }
  }

  async function handleRemoveStaff(bookingId: string) {
    if (!confirm('Remove this staff member from the event?')) return;
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('You are not authenticated. Please sign in again.');

      const response = await fetch('/api/archive/delete-booking', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ bookingId }),
      });
      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || 'Failed to remove booking');
      }

      await fetchData();
      onRefresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Unable to remove staff member');
    } finally {
      setLoading(false);
    }
  }

  async function updateBookingStatus(bookingId: string, updates: BookingStatusUpdates) {
    // Optimistic update
    setBookedStaff(prev => prev.map(staff =>
      staff.booking_id === bookingId ? { ...staff, ...updates } : staff
    ));

    try {
      const { error } = await supabase
        .from('bookings')
        .update(updates)
        .eq('id', bookingId);

      if (error) throw error;
      // Background refresh to ensure consistency
      fetchData();
    } catch (err: unknown) {
      console.error("Error updating booking:", err);
      alert("Failed to update status");
      fetchData(); // Revert on error
    }
  }

  if (!event) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
      <div style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', borderColor: isDark ? '#334155' : '#cbd5e1' }} className="rounded-3xl p-8 w-full max-w-3xl shadow-2xl border transition-colors duration-300 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 style={{ color: isDark ? '#f1f5f9' : '#1e293b' }} className="text-2xl font-black uppercase tracking-tight">{event.course_name}</h2>
            <p style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="text-[10px] font-black uppercase mt-1">{new Date(event.event_date).toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
          <button onClick={onClose} style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="hover:text-red-500 text-2xl transition-colors" aria-label="Close">
            <Icon name="close" className="w-6 h-6" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-hidden flex-1">
          {/* BOOKED STAFF */}
          <div className="flex flex-col overflow-hidden">
            <p style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="text-[10px] font-black uppercase mb-3 tracking-widest">Roster ({bookedStaff.length})</p>
            <div className="space-y-2 overflow-y-auto pr-2 custom-scrollbar flex-1">
              {bookedStaff.length === 0 ? (
                <p style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="text-sm text-center py-8">No staff booked yet</p>
              ) : (
                bookedStaff.map((staff) => (
                  <div key={staff.booking_id} style={{ backgroundColor: isDark ? '#0f172a' : '#f1f5f9', borderColor: isDark ? '#334155' : '#e2e8f0' }} className="p-3 border rounded-xl flex flex-col gap-3 group transition-all hover:border-emerald-500">
                    <div className="flex justify-between items-center">
                      <div>
                        <p style={{ color: isDark ? '#f1f5f9' : '#1e293b' }} className="font-bold text-sm">{staff.full_name}</p>
                        <p style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="text-[9px] uppercase font-black">📍 {staff.home_house}</p>
                      </div>
                      {canRemoveStaff && canRemoveFromLocation(staff.location) && (
                        <button
                          onClick={() => handleRemoveStaff(staff.booking_id)}
                          disabled={loading}
                          className="text-red-500 hover:bg-red-500/10 p-2 rounded transition-all hover:scale-110 active:scale-95 duration-200"
                          title="Remove from roster"
                        >
                          🗑️
                        </button>
                      )}
                    </div>

                    <div className="flex gap-2 items-center">
                      {/* Status Selector */}
                      <select
                        value={staff.attended_at ? 'present' : 'absent'}
                        onChange={(e) => {
                          const isPresent = e.target.value === 'present';
                          updateBookingStatus(staff.booking_id, {
                            attended_at: isPresent ? new Date().toISOString() : null,
                            // Reset reasons if switching status
                            absence_reason: null,
                            lateness_minutes: 0,
                            lateness_reason: null
                          });
                        }}
                        style={{
                          backgroundColor: staff.attended_at ? '#10b98122' : '#3b82f622',
                          color: staff.attended_at ? '#10b981' : '#3b82f6',
                          borderColor: staff.attended_at ? '#10b981' : '#3b82f6'
                        }}
                        className="text-[10px] font-black uppercase p-2 rounded-lg border outline-none cursor-pointer flex-1"
                      >
                        <option value="present">✓ Present</option>
                        <option value="absent">○ Absent</option>
                      </select>

                      {/* Conditional Dropdown */}
                      {staff.attended_at ? (
                        <div className="flex gap-2 flex-1 relative top-0.5">
                          <select
                            value={staff.lateness_minutes || 0}
                            onChange={(e) => updateBookingStatus(staff.booking_id, { lateness_minutes: parseInt(e.target.value) })}
                            style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', color: isDark ? '#f1f5f9' : '#1e293b', borderColor: isDark ? '#334155' : '#cbd5e1' }}
                            className="text-[10px] p-2 rounded-lg border outline-none w-24"
                          >
                            <option value={0}>On Time</option>
                            <option value={5}>5m Late</option>
                            <option value={10}>10m Late</option>
                            <option value={15}>15m Late</option>
                            <option value={30}>30m Late</option>
                            <option value={60}>1h+ Late</option>
                          </select>

                          {(staff.lateness_minutes || 0) > 0 && (
                            <input
                              type="text"
                              placeholder="Reason (Optional)"
                              value={staff.lateness_reason || ''}
                              onChange={(e) => updateBookingStatus(staff.booking_id, { lateness_reason: e.target.value })}
                              onBlur={(e) => updateBookingStatus(staff.booking_id, { lateness_reason: e.target.value })}
                              style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', color: isDark ? '#f1f5f9' : '#1e293b', borderColor: isDark ? '#334155' : '#cbd5e1' }}
                              className="text-[10px] p-2 rounded-lg border outline-none flex-1 min-w-0"
                            />
                          )}
                        </div>
                      ) : (
                        <select
                          value={staff.absence_reason || ''}
                          onChange={(e) => updateBookingStatus(staff.booking_id, { absence_reason: e.target.value })}
                          style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', color: isDark ? '#f1f5f9' : '#1e293b', borderColor: isDark ? '#334155' : '#cbd5e1' }}
                          className="text-[10px] p-2 rounded-lg border outline-none flex-1"
                        >
                          <option value="">Select Reason...</option>
                          <option value="Sick">Sick</option>
                          <option value="Leave">Annual Leave</option>
                          <option value="Work">Working Elsewhere</option>
                          <option value="No Show">No Show</option>
                          <option value="Other">Other</option>
                        </select>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* AVAILABLE STAFF */}
          <div className="flex flex-col overflow-hidden">
            <p style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="text-[10px] font-black uppercase mb-3 tracking-widest">Available Staff ({availableStaff.length})</p>
            <div className="space-y-2 overflow-y-auto pr-2 custom-scrollbar flex-1">
              {availableStaff.length === 0 ? (
                <p style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="text-sm text-center py-8">All staff are booked or unavailable</p>
              ) : (
                availableStaff.map((staff) => (
                  <div key={staff.id} style={{ backgroundColor: isDark ? '#0f172a' : '#f1f5f9', borderColor: isDark ? '#334155' : '#e2e8f0' }} className="p-3 border rounded-xl flex justify-between items-center group transition-all hover:border-blue-500">
                    <div>
                      <p style={{ color: isDark ? '#f1f5f9' : '#1e293b' }} className="font-bold text-sm">{staff.full_name}</p>
                      <p style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="text-[9px] uppercase font-black">📍 {staff.home_house}</p>
                    </div>
                    <button
                      onClick={() => handleBookStaff(staff.id)}
                      disabled={loading}
                      style={{ backgroundColor: '#2563eb' }}
                      className="p-2 text-white rounded-lg text-[10px] font-bold transition-all hover:opacity-80 hover:scale-105 active:scale-95 shadow-md hover:shadow-lg duration-200"
                    >
                      ➕ Add
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          style={{ backgroundColor: isDark ? '#334155' : '#cbd5e1', color: isDark ? '#f1f5f9' : '#1e293b' }}
          className="mt-6 w-full py-3 rounded-xl font-bold transition-all hover:opacity-80 hover:shadow-md active:scale-95 duration-200"
        >
          Close ✕
        </button>
      </div>
    </div>
  );
}
