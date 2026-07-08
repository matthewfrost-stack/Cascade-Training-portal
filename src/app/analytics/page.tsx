'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import BackButton from '@/app/components/BackButton';
import { debugLog, debugWarn } from '@/lib/debug';

export default function AnalyticsDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [filterYear, setFilterYear] = useState('2026');
  const [filterPeriod, setFilterPeriod] = useState('Full Year');
  const [groupBy, setGroupBy] = useState<'location' | 'course' | 'person'>('location');
  const [isDark, setIsDark] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [selectedReason, setSelectedReason] = useState<{ type: 'lateness' | 'absence'; reason: string } | null>(null);
  const [selectedAbsenceGroup, setSelectedAbsenceGroup] = useState<{ key: string } | null>(null);
  const [collapsedCourses, setCollapsedCourses] = useState<Set<string>>(new Set());
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set());

  useEffect(() => {
    checkAuth();
    checkTheme();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    if (isDark) {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
  }, [isDark]);

  useEffect(() => {
    const handleThemeChange = (event: any) => {
      setIsDark(event.detail.isDark);
    };
    
    window.addEventListener('themeChange', handleThemeChange);
    return () => window.removeEventListener('themeChange', handleThemeChange);
  }, []);

  const checkTheme = (): void => {
    if (typeof window !== 'undefined') {
      const theme = localStorage.getItem('theme');
      const isDarkMode = theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
      setIsDark(isDarkMode);
    }
  };

  const toggleCourse = (course: string) => {
    setCollapsedCourses(prev => {
      const newSet = new Set(prev);
      if (newSet.has(course)) {
        newSet.delete(course);
      } else {
        newSet.add(course);
      }
      return newSet;
    });
  };

  const toggleDate = (date: string) => {
    setCollapsedDates(prev => {
      const newSet = new Set(prev);
      if (newSet.has(date)) {
        newSet.delete(date);
      } else {
        newSet.add(date);
      }
      return newSet;
    });
  };

  const resetCollapsedState = () => {
    setCollapsedCourses(new Set());
    setCollapsedDates(new Set());
  };

  async function checkAuth() {
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) {
        return;
      }
      setUser(currentUser);
    } catch (err) {
      console.error("Error checking auth:", err);
    }
  }

  useEffect(() => {
    if (user) {
      fetchAnalytics();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterYear, filterPeriod, user]);

  async function fetchAnalytics() {
    setLoading(true);
    
    // Calculate start and end dates based on period
    let startDate = `${filterYear}-01-01`;
    let endDate = `${filterYear}-12-31`;

    if (filterPeriod === 'Q1') {
      endDate = `${filterYear}-03-31`;
    } else if (filterPeriod === 'Q2') {
      startDate = `${filterYear}-04-01`;
      endDate = `${filterYear}-06-30`;
    } else if (filterPeriod === 'Q3') {
      startDate = `${filterYear}-07-01`;
      endDate = `${filterYear}-09-30`;
    } else if (filterPeriod === 'Q4') {
      startDate = `${filterYear}-10-01`;
      endDate = `${filterYear}-12-31`;
    }

    // Ensure endDate is not in the future (today is the max)
    const today = new Date().toISOString().split('T')[0];
    if (endDate > today) {
      endDate = today;
    }

    try {
      // First fetch all bookings with basic fields using pagination (page size: 1000)
      let bookings: any[] = [];
      let pageNumber = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: pageData, error: pageError } = await supabase
          .from('bookings')
          .select('id, profile_id, event_id, attended_at, minutes_late, late_reason, absence_reason, created_at')
          .range(pageNumber * pageSize, (pageNumber + 1) * pageSize - 1);

        if (pageError) {
          console.error('Error fetching bookings page:', pageError);
          setData([]);
          setLoading(false);
          return;
        }

        if (!pageData || pageData.length === 0) {
          hasMore = false;
        } else {
          bookings = bookings.concat(pageData);
          pageNumber++;
          if (pageData.length < pageSize) {
            hasMore = false;
          }
        }
      }
      
      if (bookings.length === 0) {
        debugWarn('No bookings found');
        setData([]);
        setLoading(false);
        return;
      }

      debugLog('Total bookings:', bookings.length);

      // Get all unique event IDs and profile IDs
      const eventIds = Array.from(new Set(bookings.map((b: any) => b.event_id).filter(Boolean)));
      const profileIds = Array.from(new Set(bookings.map((b: any) => b.profile_id).filter(Boolean)));

      debugLog('Unique event IDs:', eventIds.length, eventIds);
      debugLog('Unique profile IDs:', profileIds.length);

      let events: any[] = [];
      let profiles: any[] = [];

      // Fetch training events in chunks of 500 if we have event IDs
      if (eventIds.length > 0) {
        const chunkSize = 500;
        for (let i = 0; i < eventIds.length; i += chunkSize) {
          const chunk = eventIds.slice(i, i + chunkSize);
          const { data: eventsData, error: eventsError } = await supabase
            .from('training_events')
            .select('id, event_date, course_id, courses(id, name)')
            .in('id', chunk);

          if (eventsError) {
            console.error('Error fetching events chunk:', eventsError);
          } else if (eventsData) {
            events = events.concat(eventsData);
          }
        }
        debugLog('Fetched events:', events.length);
      }

      // Fetch profiles in chunks of 500 if we have profile IDs
      if (profileIds.length > 0) {
        const chunkSize = 500;
        for (let i = 0; i < profileIds.length; i += chunkSize) {
          const chunk = profileIds.slice(i, i + chunkSize);
          const { data: profilesData, error: profilesError } = await supabase
            .from('profiles')
            .select('id, full_name, location')
            .in('id', chunk);

          if (profilesError) {
            console.error('Error fetching profiles chunk:', profilesError);
          } else if (profilesData) {
            profiles = profiles.concat(profilesData);
          }
        }
        debugLog('Fetched profiles:', profiles.length);
      }

      // Merge data
      const eventMap = new Map(events.map((e: any) => [e.id, e]));
      const profileMap = new Map(profiles.map((p: any) => [p.id, p]));

      const mergedData = bookings.map((booking: any) => ({
        ...booking,
        training_events: eventMap.get(booking.event_id),
        profiles: profileMap.get(booking.profile_id),
      }));

      // Filter by date range and only include past events
      const filtered = mergedData.filter((booking: any) => {
        const eventDate = booking?.training_events?.event_date;
        return eventDate && eventDate >= startDate && eventDate <= endDate && eventDate <= today;
      });

      debugLog('Filtered bookings:', filtered.length);
      setData(filtered);
    } catch (err) {
      console.error("Error fetching analytics:", err);
      setData([]);
    } finally {
      setLoading(false);
    }
  }

  const processStats = () => {
    try {
      const stats: any = {};
      
      data.forEach((item: any) => {
        try {
          let key = '';
          
          if (groupBy === 'location') {
            key = item?.profiles?.location || 'Unassigned Location';
          } else if (groupBy === 'course') {
            key = item?.training_events?.courses?.name || 'Unknown Course';
          } else if (groupBy === 'person') {
            key = item?.profiles?.full_name || 'Unknown Staff';
          }

          if (!stats[key]) {
            stats[key] = { key, booked: 0, attended: 0, late: 0, absences: 0 };
          }
          
          stats[key].booked++;
          if (item?.attended_at) {
            stats[key].attended++;
          } else {
            stats[key].absences++;
          }
          if (item?.minutes_late && item.minutes_late > 0) {
            stats[key].late++;
          }
        } catch (itemError) {
          console.error('Error processing item:', item, itemError);
        }
      });
      
      return Object.values(stats).sort((a: any, b: any) => b.booked - a.booked);
    } catch (error) {
      console.error('Error in processStats:', error);
      return [];
    }
  };

  const dashboardStats = processStats();
  const totalBooked = data.length;
  const totalAttended = data.filter((d: any) => d?.attended_at).length;
  const totalAbsences = totalBooked - totalAttended;
  const totalLate = data.filter((d: any) => d?.minutes_late && d.minutes_late > 0).length;
  const attendanceRate = totalBooked > 0 ? Math.round((totalAttended / totalBooked) * 100) : 0;

  // Calculate lateness reasons breakdown
  const latenessReasons = data.reduce((acc: any, item: any) => {
    if (item?.minutes_late && item.minutes_late > 0) {
      const reason = item?.late_reason || 'Not specified';
      acc[reason] = (acc[reason] || 0) + 1;
    }
    return acc;
  }, {});

  const latenessReasonsList = Object.entries(latenessReasons)
    .map(([reason, count]) => ({ reason, count: count as number }))
    .sort((a, b) => b.count - a.count);

  // Calculate absence reasons breakdown
  const absenceReasons = data.reduce((acc: any, item: any) => {
    if (!item?.attended_at) {
      const reason = item?.absence_reason || 'Not specified';
      acc[reason] = (acc[reason] || 0) + 1;
    }
    return acc;
  }, {});

  const absenceReasonsList = Object.entries(absenceReasons)
    .map(([reason, count]) => ({ reason, count: count as number }))
    .sort((a, b) => b.count - a.count);

  // Get detailed data for selected reason
  const getDetailedData = (type: 'lateness' | 'absence', reason: string) => {
    if (type === 'lateness') {
      return data
        .filter((item: any) => item?.minutes_late && item.minutes_late > 0 && (item?.late_reason || 'Not specified') === reason)
        .map((item: any) => ({
          name: item?.profiles?.full_name || 'Unknown',
          location: item?.profiles?.location || 'Unassigned Location',
          minutes_late: item?.minutes_late,
          event_date: item?.training_events?.event_date,
          course: item?.training_events?.courses?.name || 'Unknown'
        }));
    } else {
      return data
        .filter((item: any) => !item?.attended_at && (item?.absence_reason || 'Not specified') === reason)
        .map((item: any) => ({
          name: item?.profiles?.full_name || 'Unknown',
          location: item?.profiles?.location || 'Unassigned Location',
          event_date: item?.training_events?.event_date,
          course: item?.training_events?.courses?.name || 'Unknown'
        }));
    }
  };

  const getGroupAbsences = (groupKey: string) => {
    return data
      .filter((item: any) => {
        if (item?.attended_at) return false;
        if (groupBy === 'location') return (item?.profiles?.location || 'Unassigned Location') === groupKey;
        if (groupBy === 'course') return (item?.training_events?.courses?.name || 'Unknown Course') === groupKey;
        return (item?.profiles?.full_name || 'Unknown Staff') === groupKey;
      })
      .map((item: any) => ({
        name: item?.profiles?.full_name || 'Unknown',
        location: item?.profiles?.location || 'Unassigned Location',
        course: item?.training_events?.courses?.name || 'Unknown',
        event_date: item?.training_events?.event_date,
        absence_reason: item?.absence_reason || 'Not specified'
      }));
  };

  if (loading) {
    return (
      <main style={{ backgroundColor: isDark ? '#0f172a' : '#f1f5f9', minHeight: '100vh' }} className="p-8 transition-colors duration-300 flex items-center justify-center">
        <p style={{ color: isDark ? '#94a3b8' : '#64748b' }}>Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen transition-colors duration-300 p-4 md:p-8" style={{ backgroundColor: isDark ? '#0f172a' : '#f1f5f9' }}>
      <div className="max-w-7xl mx-auto">
        {/* Header row with back button and title */}
        <div className="flex justify-between items-center mb-8 px-4">
          <BackButton
            label="Back"
            onClick={() => {
              if (typeof window !== 'undefined') {
                const fromParam = new URLSearchParams(window.location.search).get('from');
                if (fromParam && fromParam.startsWith('/')) {
                  router.push(fromParam);
                  return;
                }
              }
              router.push('/admin');
            }}
          />
          <h1 style={{ color: isDark ? '#f1f5f9' : '#1e293b' }} className="text-3xl font-black uppercase tracking-tighter">Intelligence Hub</h1>
          <div />
        </div>

        {/* TOP FILTER BAR */}
        <div style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', borderColor: isDark ? '#334155' : '#cbd5e1' }} className="flex flex-wrap items-end gap-4 mb-10 p-6 rounded-3xl border shadow-sm">
          <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col">
              <label style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="text-[10px] font-bold uppercase mb-1">Year</label>
              <select 
                value={filterYear} 
                onChange={e => setFilterYear(e.target.value)} 
                style={{ backgroundColor: isDark ? '#0f172a' : '#f1f5f9', color: isDark ? '#f1f5f9' : '#1e293b', borderColor: isDark ? '#334155' : '#cbd5e1' }}
                className="bg-slate-50 border rounded-md p-2 text-sm outline-none"
              >
                <option>2026</option>
                <option>2025</option>
              </select>
            </div>
            <div className="flex flex-col">
              <label style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="text-[10px] font-bold uppercase mb-1">Period</label>
              <select 
                value={filterPeriod} 
                onChange={e => setFilterPeriod(e.target.value)} 
                style={{ backgroundColor: isDark ? '#0f172a' : '#f1f5f9', color: isDark ? '#f1f5f9' : '#1e293b', borderColor: isDark ? '#334155' : '#cbd5e1' }}
                className="bg-slate-50 border rounded-md p-2 text-sm outline-none"
              >
                <option>Full Year</option>
                <option>Q1</option>
                <option>Q2</option>
                <option>Q3</option>
                <option>Q4</option>
              </select>
            </div>
            <div className="flex flex-col">
              <label style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="text-[10px] font-bold uppercase mb-1">Group By</label>
              <select 
                value={groupBy} 
                onChange={e => setGroupBy(e.target.value as any)} 
                style={{ backgroundColor: isDark ? '#0f172a' : '#f1f5f9', color: isDark ? '#f1f5f9' : '#1e293b', borderColor: isDark ? '#334155' : '#cbd5e1' }}
                className="bg-slate-50 border rounded-md p-2 text-sm outline-none"
              >
                <option value="location">Location</option>
                <option value="course">Course</option>
                <option value="person">Staff Member</option>
              </select>
            </div>
          </div>
          <button 
            onClick={fetchAnalytics} 
            style={{ backgroundColor: '#9333ea' }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'} 
            onMouseLeave={(e) => e.currentTarget.style.opacity = '1'} 
            className="bg-purple-600 px-8 py-2.5 rounded-lg font-bold text-sm text-white h-[42px] hover:opacity-90 transition-all shadow-lg"
          >
            Refresh
          </button>
        </div>

        {/* KPI BOXES */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
          <div style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', borderColor: isDark ? '#334155' : '#e2e8f0' }} className="border-t-4 border-t-blue-600 p-6 rounded-xl text-center shadow-md">
            <p style={{ color: '#60a5fa' }} className="text-[10px] font-black uppercase tracking-widest">Total Bookings</p>
            <h2 style={{ color: isDark ? '#f1f5f9' : '#1e293b' }} className="text-4xl font-black mt-2">{totalBooked}</h2>
          </div>
          <div style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', borderColor: isDark ? '#334155' : '#e2e8f0' }} className="border-t-4 border-t-emerald-500 p-6 rounded-xl text-center shadow-md">
            <p style={{ color: '#10b981' }} className="text-[10px] font-black uppercase tracking-widest">Attendance Rate</p>
            <h2 style={{ color: '#10b981' }} className="text-4xl font-black mt-2">{attendanceRate}%</h2>
          </div>
          <div style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', borderColor: isDark ? '#334155' : '#e2e8f0' }} className="border-t-4 border-t-amber-500 p-6 rounded-xl text-center shadow-md">
            <p style={{ color: '#f59e0b' }} className="text-[10px] font-black uppercase tracking-widest">Late Arrivals</p>
            <h2 style={{ color: '#f59e0b' }} className="text-4xl font-black mt-2">{totalLate}</h2>
          </div>
          <div style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', borderColor: isDark ? '#334155' : '#e2e8f0' }} className="border-t-4 border-t-red-600 p-6 rounded-xl text-center shadow-md">
            <p style={{ color: '#ef4444' }} className="text-[10px] font-black uppercase tracking-widest">Absences</p>
            <h2 style={{ color: '#ef4444' }} className="text-4xl font-black mt-2">{totalAbsences}</h2>
          </div>
        </div>

        {/* CHARTS SECTION */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
          {/* LATENESS REASONS CHART */}
          <div style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', borderColor: isDark ? '#334155' : '#e2e8f0' }} className="rounded-2xl border p-6 shadow-xl">
            <h3 style={{ color: isDark ? '#f1f5f9' : '#1e293b' }} className="text-lg font-black uppercase mb-6">Late Arrivals by Reason</h3>
            <div className="space-y-3">
              {latenessReasonsList.length === 0 ? (
                <p style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="text-sm text-center py-8">No late arrivals recorded</p>
              ) : (
                latenessReasonsList.map((item: any, idx: number) => {
                  const maxLate = Math.max(...latenessReasonsList.map((r: any) => r.count), 1);
                  const percentage = (item.count / maxLate) * 100;
                  return (
                    <div 
                      key={idx}
                      onClick={() => {
                        setSelectedAbsenceGroup(null);
                        resetCollapsedState();
                        setSelectedReason({ type: 'lateness', reason: item.reason });
                      }}
                      className="cursor-pointer hover:opacity-80 transition-opacity p-2 rounded-lg"
                      style={{ backgroundColor: isDark ? '#0f172a' : '#f1f5f9' }}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <p style={{ color: isDark ? '#cbd5e1' : '#1e293b' }} className="text-sm font-bold truncate flex-1">{item.reason}</p>
                        <p style={{ color: '#f59e0b' }} className="text-sm font-black ml-2 whitespace-nowrap">{item.count}</p>
                      </div>
                      <div style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff' }} className="w-full h-6 rounded-lg overflow-hidden border border-gray-500 border-opacity-20">
                        <div 
                          style={{ width: `${percentage}%`, backgroundColor: '#f59e0b' }}
                          className="h-full transition-all duration-300"
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* ABSENCE REASONS CHART */}
          <div style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', borderColor: isDark ? '#334155' : '#e2e8f0' }} className="rounded-2xl border p-6 shadow-xl">
            <h3 style={{ color: isDark ? '#f1f5f9' : '#1e293b' }} className="text-lg font-black uppercase mb-6">Absences by Reason</h3>
            <div className="space-y-3">
              {absenceReasonsList.length === 0 ? (
                <p style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="text-sm text-center py-8">No absences recorded</p>
              ) : (
                absenceReasonsList.map((item: any, idx: number) => {
                  const maxAbsences = Math.max(...absenceReasonsList.map((r: any) => r.count), 1);
                  const percentage = (item.count / maxAbsences) * 100;
                  return (
                    <div 
                      key={idx}
                      onClick={() => {
                        setSelectedAbsenceGroup(null);
                        resetCollapsedState();
                        setSelectedReason({ type: 'absence', reason: item.reason });
                      }}
                      className="cursor-pointer hover:opacity-80 transition-opacity p-2 rounded-lg"
                      style={{ backgroundColor: isDark ? '#0f172a' : '#f1f5f9' }}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <p style={{ color: isDark ? '#cbd5e1' : '#1e293b' }} className="text-sm font-bold truncate flex-1">{item.reason}</p>
                        <p style={{ color: '#ef4444' }} className="text-sm font-black ml-2 whitespace-nowrap">{item.count}</p>
                      </div>
                      <div style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff' }} className="w-full h-6 rounded-lg overflow-hidden border border-gray-500 border-opacity-20">
                        <div 
                          style={{ width: `${percentage}%`, backgroundColor: '#ef4444' }}
                          className="h-full transition-all duration-300"
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* DATA TABLE */}
        <div style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', borderColor: isDark ? '#334155' : '#e2e8f0' }} className="rounded-2xl border overflow-hidden shadow-xl">
          <table className="w-full text-left">
            <thead style={{ backgroundColor: isDark ? '#0f172a' : '#f1f5f9', borderColor: isDark ? '#334155' : '#e2e8f0', color: isDark ? '#94a3b8' : '#64748b' }} className="text-[11px] font-bold uppercase border-b">
              <tr>
                <th className="p-4">Grouping</th>
                <th className="p-4 text-center">Booked</th>
                <th className="p-4 text-center">Attended</th>
                <th className="p-4 text-center">Late</th>
                <th className="p-4 text-center">Absences</th>
                <th className="p-4 text-right">Rate %</th>
              </tr>
            </thead>
            <tbody style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }} className="divide-y">
              {dashboardStats.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="p-8 text-center">
                    No data available for the selected period
                  </td>
                </tr>
              ) : (
                dashboardStats.map((row: any) => (
                  <tr key={row.key} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td style={{ color: isDark ? '#cbd5e1' : '#1e293b' }} className="p-4 font-bold">{row.key}</td>
                    <td style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="p-4 text-center">{row.booked}</td>
                    <td style={{ color: '#10b981' }} className="p-4 text-center font-bold">{row.attended}</td>
                    <td style={{ color: '#f59e0b' }} className="p-4 text-center font-bold">{row.late}</td>
                    <td className="p-4 text-center font-bold">
                      {row.absences > 0 ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedReason(null);
                            resetCollapsedState();
                            setSelectedAbsenceGroup({ key: row.key });
                          }}
                          style={{ color: '#ef4444' }}
                          className="hover:opacity-80 underline underline-offset-4"
                          aria-label={`View absences for ${row.key}`}
                        >
                          {row.absences}
                        </button>
                      ) : (
                        <span style={{ color: '#ef4444' }}>0</span>
                      )}
                    </td>
                    <td style={{ color: isDark ? '#cbd5e1' : '#1e293b' }} className="p-4 text-right font-bold">{row.booked > 0 ? Math.round((row.attended / row.booked) * 100) : 0}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* DETAIL MODAL */}
        {selectedReason && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <div style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff' }} className="rounded-3xl p-8 w-full max-w-2xl max-h-[80vh] overflow-y-auto shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h2 style={{ color: isDark ? '#f1f5f9' : '#1e293b' }} className="text-2xl font-black uppercase">
                  {selectedReason.type === 'lateness' ? 'Late Arrivals' : 'Absences'} - {selectedReason.reason}
                </h2>
                <button
                  onClick={() => setSelectedReason(null)}
                  style={{ color: isDark ? '#94a3b8' : '#64748b' }}
                  className="text-3xl font-bold hover:opacity-60 transition-opacity"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3">
                {(() => {
                  const detailedData = getDetailedData(selectedReason.type, selectedReason.reason);
                  if (detailedData.length === 0) {
                    return <p style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="text-center py-8">No records found</p>;
                  }
                  
                  // Group data by course and date
                  const groupedData = detailedData.reduce((acc: any, record: any) => {
                    const courseKey = record.course || 'Unknown Course';
                    const dateKey = record.event_date || 'Unknown Date';
                    if (!acc[courseKey]) {
                      acc[courseKey] = {};
                    }
                    if (!acc[courseKey][dateKey]) {
                      acc[courseKey][dateKey] = [];
                    }
                    acc[courseKey][dateKey].push(record);
                    return acc;
                  }, {});

                  return Object.entries(groupedData).map(([course, dates]: [string, any]) => {
                    const isCourseCollapsed = collapsedCourses.has(course);
                    return (
                      <div key={course} className="mb-6">
                        <button
                          onClick={() => toggleCourse(course)}
                          style={{ color: isDark ? '#f1f5f9' : '#1e293b' }}
                          className="text-lg font-bold mb-3 flex items-center gap-2 hover:opacity-80 transition-opacity"
                        >
                          <span className="text-sm">{isCourseCollapsed ? '▶' : '▼'}</span>
                          📚 {course}
                        </button>
                        {!isCourseCollapsed && Object.entries(dates).map(([date, records]: [string, any]) => {
                          const isDateCollapsed = collapsedDates.has(`${course}-${date}`);
                          return (
                            <div key={date} className="mb-4">
                              <button
                                onClick={() => toggleDate(`${course}-${date}`)}
                                style={{ color: isDark ? '#94a3b8' : '#64748b' }}
                                className="text-sm font-bold mb-2 flex items-center gap-2 hover:opacity-80 transition-opacity"
                              >
                                <span className="text-xs">{isDateCollapsed ? '▶' : '▼'}</span>
                                📅 {date}
                              </button>
                              {!isDateCollapsed && (
                                <div className="space-y-2">
                                  {records.map((record: any, idx: number) => (
                                    <div
                                      key={idx}
                                      style={{
                                        backgroundColor: isDark ? '#0f172a' : '#f1f5f9',
                                        borderColor: isDark ? '#334155' : '#e2e8f0'
                                      }}
                                      className="border rounded-lg p-4 ml-4"
                                    >
                                      <div className="flex justify-between items-start mb-2">
                                        <div className="min-w-0 pr-3">
                                          <p style={{ color: isDark ? '#f1f5f9' : '#1e293b' }} className="font-bold text-sm truncate">{record.name}</p>
                                          <p style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="text-[11px] font-bold uppercase truncate">{record.location}</p>
                                        </div>
                                        {selectedReason.type === 'lateness' && (
                                          <p style={{ color: '#f59e0b' }} className="text-sm font-black">{record.minutes_late} mins late</p>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  });
                })()}
              </div>
              
              {/* Close button at bottom */}
              <div className="mt-6 pt-4 border-t" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
                <button
                  onClick={() => setSelectedReason(null)}
                  style={{ 
                    backgroundColor: isDark ? '#ef4444' : '#dc2626',
                    color: '#ffffff'
                  }}
                  className="w-full py-3 px-4 rounded-lg font-bold hover:opacity-90 transition-opacity"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* GROUP ABSENCES MODAL */}
        {selectedAbsenceGroup && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <div style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff' }} className="rounded-3xl p-8 w-full max-w-2xl max-h-[80vh] overflow-y-auto shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h2 style={{ color: isDark ? '#f1f5f9' : '#1e293b' }} className="text-2xl font-black uppercase">
                  Absences - {groupBy === 'location' ? 'Location' : groupBy === 'course' ? 'Course' : 'Staff Member'}: {selectedAbsenceGroup.key}
                </h2>
                <button
                  onClick={() => setSelectedAbsenceGroup(null)}
                  style={{ color: isDark ? '#94a3b8' : '#64748b' }}
                  className="text-3xl font-bold hover:opacity-60 transition-opacity"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3">
                {(() => {
                  const detailedData = getGroupAbsences(selectedAbsenceGroup.key);
                  if (detailedData.length === 0) {
                    return <p style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="text-center py-8">No records found</p>;
                  }
                  
                  // Group data by course and date
                  const groupedData = detailedData.reduce((acc: any, record: any) => {
                    const courseKey = record.course || 'Unknown Course';
                    const dateKey = record.event_date || 'Unknown Date';
                    if (!acc[courseKey]) {
                      acc[courseKey] = {};
                    }
                    if (!acc[courseKey][dateKey]) {
                      acc[courseKey][dateKey] = [];
                    }
                    acc[courseKey][dateKey].push(record);
                    return acc;
                  }, {});

                  return Object.entries(groupedData).map(([course, dates]: [string, any]) => {
                    const isCourseCollapsed = collapsedCourses.has(course);
                    return (
                      <div key={course} className="mb-6">
                        <button
                          onClick={() => toggleCourse(course)}
                          style={{ color: isDark ? '#f1f5f9' : '#1e293b' }}
                          className="text-lg font-bold mb-3 flex items-center gap-2 hover:opacity-80 transition-opacity"
                        >
                          <span className="text-sm">{isCourseCollapsed ? '▶' : '▼'}</span>
                          📚 {course}
                        </button>
                        {!isCourseCollapsed && Object.entries(dates).map(([date, records]: [string, any]) => {
                          const isDateCollapsed = collapsedDates.has(`${course}-${date}`);
                          return (
                            <div key={date} className="mb-4">
                              <button
                                onClick={() => toggleDate(`${course}-${date}`)}
                                style={{ color: isDark ? '#94a3b8' : '#64748b' }}
                                className="text-sm font-bold mb-2 flex items-center gap-2 hover:opacity-80 transition-opacity"
                              >
                                <span className="text-xs">{isDateCollapsed ? '▶' : '▼'}</span>
                                📅 {date}
                              </button>
                              {!isDateCollapsed && (
                                <div className="space-y-2">
                                  {records.map((record: any, idx: number) => (
                                    <div
                                      key={idx}
                                      style={{
                                        backgroundColor: isDark ? '#0f172a' : '#f1f5f9',
                                        borderColor: isDark ? '#334155' : '#e2e8f0'
                                      }}
                                      className="border rounded-lg p-4 ml-4"
                                    >
                                      <div className="flex justify-between items-start mb-2">
                                        <div className="min-w-0 pr-3">
                                          <p style={{ color: isDark ? '#f1f5f9' : '#1e293b' }} className="font-bold text-sm truncate">{record.name}</p>
                                          <p style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="text-[11px] font-bold uppercase truncate">{record.location}</p>
                                        </div>
                                        <p style={{ color: '#ef4444' }} className="text-sm font-black whitespace-nowrap">{record.absence_reason}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  });
                })()}
              </div>
              
              {/* Close button at bottom */}
              <div className="mt-6 pt-4 border-t" style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }}>
                <button
                  onClick={() => setSelectedAbsenceGroup(null)}
                  style={{ 
                    backgroundColor: isDark ? '#ef4444' : '#dc2626',
                    color: '#ffffff'
                  }}
                  className="w-full py-3 px-4 rounded-lg font-bold hover:opacity-90 transition-opacity"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );

}
