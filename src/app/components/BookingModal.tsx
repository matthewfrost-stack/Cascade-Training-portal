'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { hasPermission } from '@/lib/permissions';
import { getEmailTestHeaders } from '@/lib/emailTestMode';
import { useCurrentUserProfile } from '@/lib/useCurrentUserProfile';
import UniformButton from './UniformButton';

interface BookingModalProps {
  event: any;
  onClose: () => void;
  onRefresh: () => void;
  onOpenChecklist?: () => void;
}

export default function BookingModal({ event, onClose, onRefresh, onOpenChecklist }: BookingModalProps) {
  const [activeTab, setActiveTab] = useState<'booking' | 'roster'>('booking');
  const [staff, setStaff] = useState<any[]>([]);
  const [roster, setRoster] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [isDark, setIsDark] = useState(true);
  // Role via the shared hook (/api/profile with cookie fallback) instead of a
  // client supabase.auth.getUser(), which returned null when the browser
  // session wasn't attached and disabled booking/roster permissions.
  const { profile } = useCurrentUserProfile();
  const userRole = profile?.role_tier ?? null;
  const [userLocation, setUserLocation] = useState<string | null>(null);
  const [expandedLocations, setExpandedLocations] = useState<Set<string>>(new Set());

  const ABSENCE_REASONS = ["Appointment", "Needed in home", "Rostering", "Transport issues", "Not started yet", "Childcare", "Sickness", "Holiday"];
  const LATE_REASONS = ["Traffic", "Handover delayed", "Public Transport", "Personal", "Other"];

  const canBookPastEvents = userRole === 'admin' || userRole === 'scheduler';
  const canAccessChecklist = userRole === 'admin' || userRole === 'scheduler';
  const formatEventDate = (value?: string) => {
    if (!value) return '';
    try {
      return format(new Date(`${value}T00:00:00`), 'dd-MM-yyyy');
    } catch {
      return value;
    }
  };

  const formatEventTime = (value?: string) => {
    if (!value) return '';
    const s = String(value).trim();
    return s.length >= 5 ? s.slice(0, 5) : s;
  };

  const escapeCsvValue = (value: unknown) =>
    `"${String(value ?? '').replace(/"/g, '""')}"`;

  const eventTimeRange = (() => {
    const start = formatEventTime(event?.start_time);
    const end = formatEventTime(event?.end_time);
    if (!start && !end) return '';
    if (start && end) return `${start} - ${end}`;
    return start || end;
  })();

  const isPastEvent = (() => {
    if (!event?.event_date) return false;
    const eventDate = new Date(`${event.event_date}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return eventDate < today;
  })();

  useEffect(() => {
    checkTheme();
  }, [event.id]);

  // Home location comes from the user's profile; fetch it by the hook-resolved
  // id (anon read of profiles works without a client session).
  useEffect(() => {
    if (!profile?.id) return;
    let active = true;
    (async () => {
      const { data } = await supabase.from('profiles').select('home_house').eq('id', profile.id).single();
      if (active) setUserLocation(data?.home_house ?? null);
    })();
    return () => { active = false; };
  }, [profile?.id]);

  useEffect(() => {
    if (userRole && userLocation !== undefined) {
      fetchInitialData();
    }
  }, [userRole, userLocation, event.id]);

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

  async function fetchInitialData() {
    let staffData: any[] = [];

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    let scopedLocations: Array<{ id: string; name: string }> = [];
    if (token) {
      const response = await fetch('/api/locations/user-locations', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const payload = await response.json();
        scopedLocations = Array.isArray(payload.locations) ? payload.locations : [];
      }
    }

    const scopedIds = scopedLocations.map(loc => loc.id);
    const scopedNames = scopedLocations.map(loc => loc.name);

    const staffById = new Map<string, any>();

    const upsertStaff = (profile: any, locationOverride?: string) => {
      if (!profile?.id || profile.is_deleted) return;
      const existing = staffById.get(profile.id);
      const incomingLocation = locationOverride || profile.location || '';

      if (!existing) {
        staffById.set(profile.id, {
          ...profile,
          location: incomingLocation || profile.location || 'Unassigned',
        });
        return;
      }

      const existingLocation = existing.location || '';
      if (incomingLocation && existingLocation && incomingLocation !== existingLocation) {
        existing.location = 'Multiple Locations';
      } else if (!existingLocation && incomingLocation) {
        existing.location = incomingLocation;
      }
    };

    if (userRole === 'admin') {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('is_deleted', false)
        .order('full_name');
      staffData = data || [];
    } else {
      if (scopedIds.length > 0) {
        const { data: staffLinks } = await supabase
          .from('staff_locations')
          .select('staff_id, locations(id, name), profiles(id, full_name, is_deleted, location)')
          .in('location_id', scopedIds);

        (staffLinks || []).forEach((row: any) => {
          const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
          const locationName = row.locations?.name || profile?.location || '';
          upsertStaff(profile, locationName);
        });
      }

      if (scopedNames.length > 0) {
        const { data: locationProfiles } = await supabase
          .from('profiles')
          .select('*')
          .in('location', scopedNames)
          .eq('is_deleted', false)
          .order('full_name');

        (locationProfiles || []).forEach((profile: any) => upsertStaff(profile));
      }

      if (userRole === 'manager') {
        const { data: unassignedStaff } = await supabase
          .from('profiles')
          .select('*')
          .is('location', null)
          .eq('is_deleted', false)
          .order('full_name');

        (unassignedStaff || []).forEach((profile: any) => upsertStaff(profile));
      }

      staffData = Array.from(staffById.values());
    }

    staffData = staffData.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
    
    const { data: bookings } = await supabase.from('bookings').select('profile_id').eq('event_id', event.id);
    const bookedIds = bookings?.map(b => b.profile_id) || [];
    const availableStaff = staffData.filter(s => !bookedIds.includes(s.id)) || [];
    setStaff(availableStaff);
    await fetchRoster();
  }

  async function fetchRoster() {
    const { data, error } = await supabase
      .from('bookings')
      .select('id, profile_id, event_id, attended_at, minutes_late, late_reason, absence_reason')
      .eq('event_id', event.id);
    
    if (data && data.length > 0) {
      const profileIds = data.map((b: any) => b.profile_id);
      const { data: profilesData } = await supabase.from('profiles').select('id, full_name, location').in('id', profileIds);
      const rosterWithProfiles = data.map((booking: any) => ({
        ...booking,
        profiles: profilesData?.find(p => p.id === booking.profile_id)
      }));
      setRoster(rosterWithProfiles);
    } else {
      setRoster([]);
    }
  }

  const handleExportRoster = () => {
    if (!event || roster.length === 0) return;

    const headers = [
      'Staff Name',
      'Location',
      'Attendance',
      'Late Minutes',
      'Late Reason',
      'Absence Reason',
    ];

    const rows = roster.map((row) => [
      row.profiles?.full_name || '',
      row.profiles?.location || '',
      row.attended_at ? 'Present' : 'Absent',
      row.minutes_late || 0,
      row.late_reason || '',
      row.absence_reason || '',
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map(escapeCsvValue).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date(event.event_date).toISOString().split('T')[0];
    a.href = url;
    a.download = `roster-${event.course_name}-${date}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const toggleLocationExpanded = (locationName: string) => {
    const newExpanded = new Set(expandedLocations);
    if (newExpanded.has(locationName)) {
      newExpanded.delete(locationName);
    } else {
      newExpanded.add(locationName);
    }
    setExpandedLocations(newExpanded);
  };

  const getStaffByLocation = () => {
    const grouped: { [key: string]: any[] } = {};
    const filteredStaff = staff.filter(s => s.full_name?.toLowerCase().includes(searchQuery.toLowerCase()));
    
    filteredStaff.forEach(person => {
      const location = person.location || 'Unassigned';
      if (!grouped[location]) {
        grouped[location] = [];
      }
      grouped[location].push(person);
    });

    // Sort locations alphabetically
    const sorted: { [key: string]: any[] } = {};
    Object.keys(grouped).sort().forEach(key => {
      sorted[key] = grouped[key];
    });

    return sorted;
  };

  const updateBooking = async (id: string, updates: any) => {
    if (!hasPermission(userRole, 'ATTENDANCE', 'canMark')) {
      alert('Permission denied');
      return;
    }

    const { error } = await supabase.from('bookings').update(updates).eq('id', id);
    if (!error) {
      await fetchRoster();
      onRefresh();
    }
  };

  const handleBooking = async () => {
    if (!hasPermission(userRole, 'BOOKINGS', 'canCreate')) return;
    if (isPastEvent && !canBookPastEvents) {
      alert('You do not have permission to add staff to past events.');
      return;
    }
    if (loading) return;
    const staffIdsToBook = [...selectedIds];
    if (staffIdsToBook.length === 0) return;

    setLoading(true);
    try {
      // Use the new booking endpoint that validates capacity
      const response = await fetch('/api/book-staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: event.id, staffIds: staffIdsToBook })
      });

      const result = await response.json();

      if (!response.ok) {
        // If course became full, suggest refresh
        if (result.capacityFull) {
          alert(`${result.error}\n\nThe booking form will refresh to show updated availability.`);
          setTimeout(async () => {
            onRefresh();
            setSelectedIds([]);
            await fetchInitialData();
          }, 500);
        } else {
          alert(`❌ ${result.error}`);
        }
        setLoading(false);
        return;
      }

      alert(`✅ ${result.message}`);
      setSelectedIds([]);
      await fetchInitialData();
      setActiveTab('roster');
      onRefresh();

      // Send emails in the background so roster confirmation isn't delayed.
      void Promise.allSettled(
        staffIdsToBook.map(async (staffId) => {
          try {
            await fetch('/api/send-booking-confirmation', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...getEmailTestHeaders() },
              body: JSON.stringify({ staffId, eventId: event.id })
            });
          } catch (err) {
            console.error('Failed to send email for staff:', staffId, err);
          }
        })
      );
    } catch (error: any) {
      alert(`❌ Error: ${error.message}`);
    }
    setLoading(false);
  };

  const handleRemoveStaff = async (bookingId: string) => {
    if (!confirm('Remove staff member?')) return;
    
    // Get booking details before deletion
    const { data: booking } = await supabase
      .from('bookings')
      .select('profile_id')
      .eq('id', bookingId)
      .single();

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      alert('You are not authenticated. Please sign in again.');
      return;
    }

    const deleteResponse = await fetch('/api/archive/delete-booking', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ bookingId }),
    });

    const deleteResult = await deleteResponse.json();
    if (!deleteResponse.ok || !deleteResult?.success) {
      alert(`Error removing booking: ${deleteResult?.error || 'Unknown error'}`);
      return;
    }
    
    // Send cancellation email
    if (booking?.profile_id) {
      try {
        await fetch('/api/send-booking-cancellation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getEmailTestHeaders() },
          body: JSON.stringify({ 
            staffId: booking.profile_id, 
            eventId: event.id,
            reason: 'Booking removed by administrator'
          })
        });
      } catch (err) {
        console.error('Failed to send cancellation email:', err);
      }
    }
    
    await fetchRoster();
    await fetchInitialData();
    onRefresh();
  };

  const handleCancelEvent = async () => {
    if (!confirm(`Cancel this event? All ${roster.length} participants will be notified and removed.`)) return;
    
    try {
      // Send cancellation emails to all participants
      for (const booking of roster) {
        try {
          await fetch('/api/send-booking-cancellation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getEmailTestHeaders() },
            body: JSON.stringify({ 
              staffId: booking.profile_id, 
              eventId: event.id,
              reason: 'This event has been cancelled'
            })
          });
        } catch (err) {
          console.error('Failed to send cancellation email:', err);
        }
      }
      
      // Delete all bookings for this event
      const { error: deleteBookingsError } = await supabase
        .from('bookings')
        .delete()
        .eq('event_id', event.id);
      
      if (deleteBookingsError) throw deleteBookingsError;
      
      // Delete the event itself
      const { error: deleteEventError } = await supabase
        .from('training_events')
        .delete()
        .eq('id', event.id);
      
      if (deleteEventError) throw deleteEventError;
      
      onRefresh();
      onClose();
    } catch (error: any) {
      alert('Error cancelling event: ' + error.message);
    }
  };

  const canViewRoster = hasPermission(userRole, 'ROSTER', 'canView');
  const canEditRoster = hasPermission(userRole, 'ROSTER', 'canEdit');

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
      <div style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', borderColor: isDark ? '#334155' : '#cbd5e1' }} className="rounded-[40px] w-full max-w-2xl max-h-[90vh] shadow-2xl border overflow-hidden flex flex-col">
        
        {/* Header */}
        <div style={{ backgroundColor: isDark ? '#0f172a' : '#f1f5f9' }} className="p-4 sm:p-6 border-b text-center relative flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="w-full sm:w-auto flex flex-wrap gap-2 justify-center sm:justify-start">
            {canAccessChecklist && (
              <button 
                onClick={() => onOpenChecklist?.()}
                style={{ backgroundColor: '#8b5cf6' }}
                className="text-white px-3 sm:px-4 py-2 rounded-lg font-bold text-xs sm:text-sm hover:opacity-90 transition-all"
              >
                📋 Checklist
              </button>
            )}
            <button 
              onClick={handleCancelEvent}
              style={{ backgroundColor: '#ef4444' }}
              className="text-white px-3 sm:px-4 py-2 rounded-lg font-bold text-xs sm:text-sm hover:opacity-90 transition-all"
              title="Cancel this event and remove all participants"
            >
              ❌ Cancel Event
            </button>
          </div>
          <div className="flex-1 text-center">
            <h2 style={{ color: isDark ? '#f1f5f9' : '#1e293b' }} className="text-xl font-black uppercase">{event.courses?.name}</h2>
            <p style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="text-[10px] font-bold uppercase">
              {formatEventDate(event?.event_date)}
            </p>
            {eventTimeRange && (
              <p style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="text-[10px] font-bold uppercase">
                {eventTimeRange}
              </p>
            )}
          </div>
          <UniformButton
            variant="icon"
            className="text-2xl font-light self-end sm:self-auto"
            style={{ color: isDark ? '#94a3b8' : '#64748b' }}
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </UniformButton>
        </div>

        {/* Tabs */}
        <div style={{ backgroundColor: isDark ? '#1e293b' : '#f1f5f9' }} className="flex p-1.5 m-4 sm:m-6 rounded-2xl gap-1.5">
          <UniformButton
            variant={activeTab === 'booking' ? 'primary' : 'secondary'}
            className={`flex-1 py-2 text-xs font-black uppercase rounded-xl transition-all ${activeTab === 'booking' ? '' : ''}`}
            style={{ backgroundColor: activeTab === 'booking' ? '#2563eb' : 'transparent', color: activeTab === 'booking' ? '#ffffff' : (isDark ? '#94a3b8' : '#64748b') }}
            onClick={() => setActiveTab('booking')}
          >
            Add Staff ({staff.length})
          </UniformButton>
          <UniformButton
            variant={activeTab === 'roster' ? 'primary' : 'secondary'}
            className={`flex-1 py-2 text-xs font-black uppercase rounded-xl transition-all ${activeTab === 'roster' ? '' : ''}`}
            style={{ backgroundColor: activeTab === 'roster' ? '#2563eb' : 'transparent', color: activeTab === 'roster' ? '#ffffff' : (isDark ? '#94a3b8' : '#64748b') }}
            onClick={() => setActiveTab('roster')}
          >
            Roster ({roster.length})
          </UniformButton>
        </div>

        <div className="px-4 sm:px-8 pb-6 sm:pb-8 flex-1 overflow-y-auto">
          {String(event?.notes || '').trim() && (
            <div
              style={{
                backgroundColor: isDark ? '#0f172a' : '#fff7ed',
                borderColor: isDark ? '#334155' : '#fed7aa',
                color: isDark ? '#f1f5f9' : '#9a3412',
              }}
              className="mb-5 p-4 border rounded-2xl"
            >
              <p className="text-[10px] font-black uppercase tracking-widest mb-2 opacity-80">Notes</p>
              <p className="text-sm font-bold whitespace-pre-wrap">{String(event.notes).trim()}</p>
            </div>
          )}
          {activeTab === 'booking' ? (
            <>
              <input 
                type="text" placeholder="Search staff..." 
                style={{ backgroundColor: isDark ? '#0f172a' : '#f1f5f9', color: isDark ? '#f1f5f9' : '#1e293b', borderColor: isDark ? '#334155' : '#cbd5e1' }}
                className="w-full p-3 mb-4 rounded-xl text-xs border outline-none"
                value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} 
              />
              <div className="space-y-2">
                {Object.entries(getStaffByLocation()).map(([locationName, staffList]) => (
                  <div key={locationName}>
                    <button
                      onClick={() => toggleLocationExpanded(locationName)}
                      style={{
                        backgroundColor: isDark ? '#1e293b' : '#f1f5f9',
                        borderColor: isDark ? '#334155' : '#e2e8f0',
                        color: isDark ? '#f1f5f9' : '#1e293b'
                      }}
                      className="w-full p-3 border rounded-lg font-bold text-sm flex items-center justify-between hover:opacity-80 transition-all"
                    >
                      <div className="flex items-center gap-2">
                        <span>{expandedLocations.has(locationName) ? '▼' : '▶'}</span>
                        <span>{locationName}</span>
                        <span style={{ backgroundColor: '#60a5fa' }} className="text-white text-[10px] font-bold px-2 py-0.5 rounded">
                          {staffList.length}
                        </span>
                      </div>
                    </button>

                    {expandedLocations.has(locationName) && (
                      <div className="mt-2 ml-3 space-y-2 border-l-2 border-blue-500 pl-3">
                        {staffList.map(person => (
                          <label key={person.id} className="flex items-center gap-3 p-3 rounded-xl cursor-pointer border dark:border-slate-700 hover:border-blue-500 transition-all">
                            <input type="checkbox" checked={selectedIds.includes(person.id)} onChange={(e) => e.target.checked ? setSelectedIds([...selectedIds, person.id]) : setSelectedIds(selectedIds.filter(id => id !== person.id))} className="w-4 h-4 rounded" />
                            <div className="flex-1">
                              <span className="text-xs font-bold block text-black dark:text-white">{person.full_name}</span>
                              <span className="text-[9px] uppercase font-black opacity-50">📍 {person.location}</span>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={handleBooking}
                disabled={selectedIds.length === 0 || loading || (isPastEvent && !canBookPastEvents)}
                className="w-full mt-6 py-4 bg-blue-600 text-white font-black text-xs uppercase rounded-2xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Confirming Booking...
                  </>
                ) : (
                  <>Confirm Booking ({selectedIds.length})</>
                )}
              </button>
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-end">
                <UniformButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleExportRoster}
                  disabled={loading || roster.length === 0}
                  className="px-4"
                  title="Export roster as CSV"
                >
                  Export CSV
                </UniformButton>
              </div>
              {roster
                .sort((a, b) => {
                  // Sort by location first, then by name
                  const locationA = a.profiles?.location || 'Unassigned';
                  const locationB = b.profiles?.location || 'Unassigned';
                  
                  if (locationA !== locationB) {
                    return locationA.localeCompare(locationB);
                  }
                  
                  // If same location, sort by name
                  return (a.profiles?.full_name || '').localeCompare(b.profiles?.full_name || '');
                })
                .map((row) => (
                <div key={row.id} className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-[24px] border dark:border-slate-700">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className={`text-sm font-black ${row.attended_at ? 'text-emerald-500' : 'text-black dark:text-white'}`}>{row.profiles?.full_name}</p>
                      <p className="text-[9px] font-bold opacity-50 uppercase">📍 {row.profiles?.location}</p>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => updateBooking(row.id, { 
                          attended_at: row.attended_at ? null : new Date().toISOString(),
                          absence_reason: null,
                          minutes_late: null,
                          late_reason: null
                        })} 
                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${row.attended_at ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-black dark:text-white'}`}
                      >
                        {row.attended_at ? 'Present' : 'Mark Present'}
                      </button>
                      <button onClick={() => handleRemoveStaff(row.id)} className="p-2 bg-red-600 text-white rounded-lg text-[10px] transition-all hover:bg-red-700 hover:scale-110 active:scale-95 shadow-md hover:shadow-lg duration-200">🗑️</button>
                    </div>
                  </div>

                  {/* Lateness Section - Only visible if Present */}
                  {row.attended_at ? (
                    <div className="grid grid-cols-2 gap-3 mt-2 animate-in slide-in-from-top-2 duration-200">
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-black uppercase opacity-50 ml-1">Mins Late</label>
                        <input 
                          type="number"
                          placeholder="0"
                          className="w-full bg-white dark:bg-slate-700 p-2 rounded-lg text-xs font-bold outline-none border dark:border-slate-600 text-black dark:text-white"
                          value={row.minutes_late || ''}
                          onChange={(e) => updateBooking(row.id, { minutes_late: e.target.value })}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-black uppercase opacity-50 ml-1">Late Reason</label>
                        <select 
                          className="w-full bg-white dark:bg-slate-700 p-2 rounded-lg text-xs font-bold outline-none border dark:border-slate-600 text-black dark:text-white"
                          value={row.late_reason || ''}
                          onChange={(e) => updateBooking(row.id, { late_reason: e.target.value })}
                        >
                          <option value="">Reason...</option>
                          {LATE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                    </div>
                  ) : (
                    /* Absence Reason - Only visible if Not Present */
                    <div className="mt-2">
                      <select 
                        className="w-full bg-red-50 dark:bg-red-900/20 p-2 rounded-lg text-xs font-bold outline-none border border-red-200 dark:border-red-900/50 text-red-600"
                        value={row.absence_reason || ''}
                        onChange={(e) => updateBooking(row.id, { absence_reason: e.target.value })}
                      >
                        <option value="">Select Absence Reason...</option>
                        {ABSENCE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              ))}
              <div className="flex gap-3 mt-6">
                <button onClick={onClose} className="w-full py-4 bg-slate-200 dark:bg-slate-700 text-black dark:text-white font-black text-[10px] uppercase rounded-2xl">Close</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
