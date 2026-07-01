'use client';
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { parseFirstThreeRowsFromCsvString, CsvHeaderRows } from './csvHeaderUtils';
import { debugLog } from '@/lib/debug';
import { Staff, Course, MatrixCell, RemovedCourseEntry } from '../types';

// Helper to get CSV URL for a location name (public folder)
function getCsvUrlForLocation(locationName: string): string {
  return `/csv-import/${locationName} Training Matrix - Staff Matrix.csv`;
}

function normalizeCourseName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().toLowerCase();
}

interface MatrixContextType {
  [key: string]: any;
}

const MatrixContext = createContext<MatrixContextType | undefined>(undefined);

export function MatrixProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [locations, setLocations] = useState<any[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [matrixData, setMatrixData] = useState<Record<string, Record<string, MatrixCell>>>({});
  const [loading, setLoading] = useState(true);
  const [isDark, setIsDark] = useState(true);
  const tableScrollContainerRef = useRef<HTMLDivElement>(null);
  const fetchAbortControllerRef = useRef<AbortController | null>(null);
  const [editingCell, setEditingCell] = useState<{ staffId: string; courseId: string } | null>(null);
  const [editDate, setEditDate] = useState<string>('');
  const [editStatus, setEditStatus] = useState<'completed' | 'allocated' | 'not_yet_due' | 'na' | null>(null);
  const [staffDividers, setStaffDividers] = useState<Set<string>>(new Set());
  const [showAddCourse, setShowAddCourse] = useState(false);
  const [newCourseName, setNewCourseName] = useState('');
  const [draggedCourse, setDraggedCourse] = useState<string | null>(null);
  const [showAddDivider, setShowAddDivider] = useState(false);
  const [newDividerName, setNewDividerName] = useState('');
  const [draggedStaff, setDraggedStaff] = useState<string | null>(null);
  const [editingHeader, setEditingHeader] = useState<{ courseId: string; type: 'name' | 'category' | 'expiry' } | null>(null);
  const [editHeaderValue, setEditHeaderValue] = useState<string>('');
  const [editNeverExpires, setEditNeverExpires] = useState<boolean>(false);
  const [lastRemovedCourse, setLastRemovedCourse] = useState<RemovedCourseEntry | null>(null);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [bulkEditMode, setBulkEditMode] = useState(false);
  const [bulkEditStatus, setBulkEditStatus] = useState<'completed' | 'allocated' | 'not_yet_due' | 'na' | null>(null);
  const [bulkEditDate, setBulkEditDate] = useState<string>('');

  function getCategoryOverrides(locationId: string): Record<string, string> {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem('matrix_category_overrides_v1');
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, Record<string, string>>;
      return parsed[locationId] || {};
    } catch {
      return {};
    }
  }

  function saveCategoryOverride(locationId: string, courseId: string, value: string) {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem('matrix_category_overrides_v1');
      const parsed = raw ? JSON.parse(raw) as Record<string, Record<string, string>> : {};
      if (!parsed[locationId]) parsed[locationId] = {};
      if (value.trim()) {
        parsed[locationId][courseId] = value.trim();
      } else {
        delete parsed[locationId][courseId];
      }
      window.localStorage.setItem('matrix_category_overrides_v1', JSON.stringify(parsed));
    } catch (error) {
      console.warn('Could not save category override:', error);
    }
  }

  function formatExpiryDisplay(months?: number, neverExpires?: boolean): string {
    if (neverExpires || months === 9999 || months === null || months === undefined) return 'One-Off';
    const m = months || 12;
    const years = Math.floor(m / 12);
    const remainingMonths = m % 12;

    if (years > 0 && remainingMonths === 0) {
      return `${years} year${years > 1 ? 's' : ''}`;
    } else if (years > 0) {
      return `${years}y ${remainingMonths}m`;
    }
    return `${m}m`;
  }

  useEffect(() => {
    checkAuth();
    checkTheme();
  }, []);

  useEffect(() => {
    const handleThemeChange = (event: any) => {
      setIsDark(event.detail.isDark);
    };
    window.addEventListener('themeChange', handleThemeChange);
    return () => window.removeEventListener('themeChange', handleThemeChange);
  }, []);

  useEffect(() => {
    return () => {
      if (fetchAbortControllerRef.current) {
        fetchAbortControllerRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    if (user && userRole) {
      fetchLocations();
    }
  }, [user, userRole]);

  useEffect(() => {
    if (!selectedLocation) return;

    if (fetchAbortControllerRef.current) {
      try {
        fetchAbortControllerRef.current.abort();
      } catch {
        // Ignore aborting issues
      }
    }

    const abortController = new AbortController();
    fetchAbortControllerRef.current = abortController;
    let isCurrentRequest = true;

    fetchMatrixData(abortController.signal).then(() => {
      if (isCurrentRequest && abortController === fetchAbortControllerRef.current) {
        // Active request handling
      }
    }).catch(error => {
      if (!(error instanceof Error && error.name === 'AbortError')) {
        console.error('Unexpected error in fetchMatrixData:', error);
      }
    });

    (async () => {
      if (!selectedLocation || selectedLocation.trim() === '' || !isCurrentRequest) {
        return;
      }

      const { data: locationCourses, error } = await supabase
        .from('location_training_courses')
        .select('training_course_id')
        .eq('location_id', selectedLocation);
      if (error) {
        console.warn('Error checking location courses:', error);
        return;
      }
      if (!locationCourses || locationCourses.length === 0) {
        const locationObj = locations.find(l => l.id === selectedLocation);
        if (locationObj && locationObj.name) {
          const csvUrl = getCsvUrlForLocation(locationObj.name);
          try {
            const res = await fetch(csvUrl);
            if (!res.ok) throw new Error('CSV not found');
            const csvContent = await res.text();
            const csvHeaders: CsvHeaderRows = parseFirstThreeRowsFromCsvString(csvContent);
            for (let idx = 0; idx < csvHeaders.courseNameRow.length; idx++) {
              const name = csvHeaders.courseNameRow[idx]?.trim();
              if (!name) continue;
              const { data: course, error: courseError } = await supabase
                .from('training_courses')
                .upsert([
                  {
                    name,
                    expiry_months: parseInt(csvHeaders.expiryRow[idx]) || 12,
                    never_expires: csvHeaders.expiryRow[idx]?.toLowerCase().includes('one-off') || false,
                  },
                ], { onConflict: 'name' })
                .select()
                .single();
              if (courseError) {
                console.warn('Error upserting course', name, courseError);
                continue;
              }
              await supabase
                .from('location_training_courses')
                .upsert([
                  {
                    location_id: selectedLocation,
                    training_course_id: course.id,
                    display_order: idx + 1,
                  },
                ], { onConflict: 'location_id,training_course_id' });
            }
            fetchMatrixData();
          } catch (e) {
            console.warn('Could not complete the operation', e);
          }
        }
      }
    })();

    return () => {
      isCurrentRequest = false;
    };
  }, [selectedLocation, locations]);

  useEffect(() => {
    if (!lastRemovedCourse) return;
    if (!selectedLocation) return;
    if (lastRemovedCourse.location_id !== selectedLocation) {
      setLastRemovedCourse(null);
    }
  }, [selectedLocation, lastRemovedCourse]);

  const checkAuth = async (): Promise<void> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        // Middleware handles unauthenticated redirects — do not push to /login
        // from the client side as it creates a redirect loop (middleware bounces
        // authenticated sessions back to / before the client token refreshes).
        setLoading(false);
        return;
      }
      setUser(user);
      const { data: profile } = await supabase
        .from('profiles')
        .select('role_tier')
        .eq('id', user.id)
        .single();
      setUserRole(profile?.role_tier || 'staff');
    } catch (error) {
      console.error('Auth check error:', error);
      // Do not redirect on error — middleware will handle this server-side.
      setLoading(false);
    }
  };

  const checkTheme = (): void => {
    if (typeof window !== 'undefined') {
      const isDarkMode = document.documentElement.classList.contains('dark');
      setIsDark(isDarkMode);
    }
  };

  const fetchLocations = async (): Promise<void> => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setLoading(false);
        return;
      }

      const response = await fetch('/api/locations/user-locations', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        setLoading(false);
        return;
      }

      const payload = await response.json();
      const scopedLocations = Array.isArray(payload.locations) ? payload.locations : [];

      if (scopedLocations.length > 0) {
        const uniqueLocations: any[] = Array.from(
          new Map<string, any>(scopedLocations.map((loc: any) => [loc.id, loc])).values()
        );
        setLocations(uniqueLocations);
        const locationIds = new Set(uniqueLocations.map((loc) => loc.id));
        setSelectedLocation((prev) => {
          if (prev && locationIds.has(prev)) return prev;
          return uniqueLocations[0].id;
        });
      } else {
        setLocations([]);
        setSelectedLocation('');
        setLoading(false);
      }
    } catch (error) {
      console.error('Error in fetchLocations:', error);
      setLoading(false);
    }
  };

  async function fetchMatrixData(signal?: AbortSignal) {
    try {
      if (!selectedLocation || selectedLocation.trim() === '') {
        setLoading(false);
        return;
      }
      if (signal?.aborted) return;

      setLoading(true);

      const { data: dividersData, error: dividersError } = await supabase
        .from('location_matrix_dividers')
        .select('id, name, display_order')
        .eq('location_id', selectedLocation)
        .order('display_order', { ascending: true });

      if (dividersError) console.warn('Error fetching dividers:', dividersError);

      const { data: staffLocationsData, error: staffLocationsError } = await supabase
        .from('staff_locations')
        .select('staff_id, display_order, profiles(id, full_name, is_deleted)')
        .eq('location_id', selectedLocation)
        .order('display_order', { ascending: true, nullsFirst: false });

      if (staffLocationsError) console.warn('Error fetching staff structural data:', staffLocationsError);

      const activeStaffLocationsData = staffLocationsData?.filter((sl: any) => !sl.profiles?.is_deleted) || [];

      let allTrainingStaffIds: any[] = [];
      let pageNum = 0;
      const staffPageSize = 1000;
      let hasMoreStaff = true;

      while (hasMoreStaff) {
        const { data: trainingStaffIds, error: trainingStaffIdError } = await supabase
          .from('staff_training_matrix')
          .select('staff_id')
          .eq('completed_at_location_id', selectedLocation)
          .range(pageNum * staffPageSize, (pageNum + 1) * staffPageSize - 1);

        if (trainingStaffIdError) break;

        if (!trainingStaffIds || trainingStaffIds.length === 0) {
          hasMoreStaff = false;
        } else {
          allTrainingStaffIds = allTrainingStaffIds.concat(trainingStaffIds);
          pageNum++;
          if (trainingStaffIds.length < staffPageSize) hasMoreStaff = false;
        }
      }

      const uniqueStaffIds = new Set<string>();
      allTrainingStaffIds?.forEach((t: any) => { if (t.staff_id) uniqueStaffIds.add(t.staff_id); });

      const staffLocationsIds = new Set(activeStaffLocationsData.map((sl: any) => sl.staff_id));
      const filteredTrainingStaffIds = Array.from(uniqueStaffIds).filter(id => staffLocationsIds.has(id));

      let trainingStaffData: any[] = [];
      if (filteredTrainingStaffIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', filteredTrainingStaffIds)
          .eq('is_deleted', false);
        trainingStaffData = profiles?.map((p: any) => ({ profiles: p })) || [];
      }

      const staffMap = new Map<string, any>();
      activeStaffLocationsData?.forEach((s: any) => {
        if (s.profiles) staffMap.set(s.profiles.id, { id: s.profiles.id, full_name: s.profiles.full_name });
      });
      trainingStaffData?.forEach((s: any) => {
        if (s.profiles && !staffMap.has(s.profiles.id)) staffMap.set(s.profiles.id, { id: s.profiles.id, full_name: s.profiles.full_name });
      });

      const staffData = Array.from(staffMap.values()).map(s => ({ profiles: { id: s.id, full_name: s.full_name } }));

      let locationCoursesData: any[] | null = null;
      let locationCoursesError: any = null;

      const withCategoryRes = await supabase
        .from('location_training_courses')
        .select('training_course_id, display_order, training_courses(id, name, category, expiry_months, never_expires)')
        .eq('location_id', selectedLocation)
        .order('display_order', { ascending: true, nullsFirst: false });

      locationCoursesData = withCategoryRes.data;
      locationCoursesError = withCategoryRes.error;

      if (locationCoursesError?.code === '42703') {
        const fallbackRes = await supabase
          .from('location_training_courses')
          .select('training_course_id, training_courses(id, name, expiry_months, never_expires)')
          .eq('location_id', selectedLocation);
        locationCoursesData = fallbackRes.data;
      }

      let filteredCourses = (locationCoursesData || [])
        .map((lc: any) => {
          const joinedCourse = Array.isArray(lc.training_courses) ? lc.training_courses[0] : lc.training_courses;
          if (!joinedCourse) return null;
          return {
            id: joinedCourse.id,
            name: joinedCourse.name,
            category: joinedCourse.category || undefined,
            display_order: lc.display_order,
            expiry_months: joinedCourse.expiry_months,
            never_expires: joinedCourse.never_expires || false,
          };
        }).filter(Boolean) as Course[];

      const selectedLocationObj = locations.find(l => l.id === selectedLocation);
      if (selectedLocationObj?.name) {
        try {
          const csvUrl = getCsvUrlForLocation(selectedLocationObj.name);
          const res = await fetch(csvUrl);
          if (res.ok) {
            const csvContent = await res.text();
            const csvHeaders: CsvHeaderRows = parseFirstThreeRowsFromCsvString(csvContent);
            const csvCategoryByCourseName = new Map<string, string>();
            for (let idx = 1; idx < csvHeaders.courseNameRow.length; idx++) {
              const courseName = csvHeaders.courseNameRow[idx]?.trim();
              if (courseName && csvHeaders.categoryRow[idx]) csvCategoryByCourseName.set(normalizeCourseName(courseName), csvHeaders.categoryRow[idx].trim());
            }
            filteredCourses = filteredCourses.map(course => ({
              ...course,
              category: course.category || csvCategoryByCourseName.get(normalizeCourseName(course.name)) || undefined,
            }));
          }
        } catch (error) {
          console.warn('Could not load fallback headers from location asset files:', error);
        }
      }

      const categoryOverrides = getCategoryOverrides(selectedLocation);
      filteredCourses = filteredCourses.map(course => ({
        ...course,
        category: categoryOverrides[course.id] ?? course.category,
      }));

      const { data: allCoursesForMapping } = await supabase.from('training_courses').select('id, name');
      const careskillsToBaseMap = new Map<string, string>();
      if (allCoursesForMapping) {
        const baseCourses = new Map<string, string>();
        allCoursesForMapping.forEach((c: any) => {
          if (!c.name.includes('(Careskills)')) baseCourses.set(c.name.toLowerCase().trim(), c.id);
        });
        allCoursesForMapping.forEach((c: any) => {
          if (c.name.includes('(Careskills)')) {
            const baseName = c.name.replace(' (Careskills)', '').toLowerCase().trim();
            const baseId = baseCourses.get(baseName);
            if (baseId) careskillsToBaseMap.set(c.id, baseId);
          }
        });
      }

      let allTrainingData: any[] = [];
      let pageNumber = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: pageData, error: pageError } = await supabase
          .from('staff_training_matrix')
          .select('id, staff_id, course_id, completion_date, expiry_date, status, completed_at_location_id')
          .eq('completed_at_location_id', selectedLocation)
          .range(pageNumber * pageSize, (pageNumber + 1) * pageSize - 1);

        if (pageError) break;
        if (!pageData || pageData.length === 0) {
          hasMore = false;
        } else {
          allTrainingData = allTrainingData.concat(pageData);
          pageNumber++;
          if (pageData.length < pageSize) hasMore = false;
        }
      }

      const staffFromTrainingSet = new Set<string>();
      allTrainingData?.forEach((t: any) => { if (t.completed_at_location_id === selectedLocation) staffFromTrainingSet.add(t.staff_id); });

      const allStaffIds = new Set<string>();
      staffData?.forEach((s: any) => { if (s.profiles) allStaffIds.add(s.profiles.id); });
      staffFromTrainingSet.forEach(id => allStaffIds.add(id));

      const allStaffProfiles = staffData.filter((s: any) => s.profiles);
      const staffIdsInProfiles = new Set(allStaffProfiles.map((s: any) => s.profiles.id));
      const missingIds = Array.from(allStaffIds).filter(id => !staffIdsInProfiles.has(id));

      if (missingIds.length > 0) {
        const { data: missingProfiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', missingIds)
          .eq('is_deleted', false);
        missingProfiles?.forEach((p: any) => allStaffProfiles.push({ profiles: p }));
      }

      const staffWithOrder = allStaffProfiles
        .filter((s: any) => s.profiles && !s.profiles.full_name?.toLowerCase().includes('deleted'))
        .map((s: any) => {
          const staffLoc = activeStaffLocationsData?.find((sl: any) => sl.staff_id === s.profiles.id);
          return {
            id: s.profiles.id,
            name: s.profiles.full_name,
            location_id: selectedLocation,
            display_order: staffLoc?.display_order || 9999,
          };
        });

      const dedupedStaffWithOrder: typeof staffWithOrder = [];
      staffWithOrder.sort((a, b) => a.display_order - b.display_order).forEach(candidate => {
        const duplicate = dedupedStaffWithOrder.find(e => e.name.toLowerCase().trim() === candidate.name.toLowerCase().trim());
        if (!duplicate) dedupedStaffWithOrder.push(candidate);
      });

      const dividerItems = (dividersData || [])
        .filter((d: any) => d.name !== 'Staff Name')
        .map((d: any) => ({
          id: `divider-${d.id}`,
          name: d.name,
          location_id: selectedLocation,
          display_order: d.display_order,
          isDivider: true,
        }));

      const combinedListDeduped = [...dedupedStaffWithOrder, ...dividerItems]
        .sort((a, b) => (a.display_order || 9999) - (b.display_order || 9999));

      setStaffDividers(new Set<string>(dividerItems.map((d: any) => d.id)));
      setStaff(combinedListDeduped as any);

      if (filteredCourses && filteredCourses.length > 0) setCourses(filteredCourses);

      const plainMatrix: Record<string, Record<string, MatrixCell>> = {};
      allStaffProfiles?.forEach((s: any) => { if (s.profiles) plainMatrix[s.profiles.id] = {}; });

      allTrainingData?.forEach((t: any) => {
        if (t.completed_at_location_id === selectedLocation && plainMatrix[t.staff_id]) {
          const effectiveCourseId = careskillsToBaseMap.get(t.course_id) || t.course_id;
          plainMatrix[t.staff_id][effectiveCourseId] = {
            completion_date: t.completion_date,
            expiry_date: t.expiry_date,
            training_id: t.id,
            status: t.status,
          };
        }
      });

      setMatrixData(plainMatrix);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      console.error('Error fetching matrix data:', error);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  async function saveCourseChanges(courseId: string, updates: Partial<Course>, skipRefresh = false) {
    try {
      const response = await fetch('/api/update-course', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId, updates }),
      });
      if (!response.ok) throw new Error('Failed to update metadata records context entry');
      if (!skipRefresh) await fetchMatrixData();
    } catch (error) {
      console.error('Error saving course variations updates:', error);
    }
  }

  function getDateStatus(expiryDate: string) {
    const today = new Date();
    const expiry = new Date(expiryDate);
    const twoMonthsFromNow = new Date();
    twoMonthsFromNow.setMonth(twoMonthsFromNow.getMonth() + 2);

    if (expiry < today) return 'expired';
    if (expiry < twoMonthsFromNow) return 'expiring';
    return 'valid';
  }

  function getDateColor(status: string) {
    switch (status) {
      case 'valid':
      case 'no-expiry':
        return isDark ? 'bg-green-900 text-green-100' : 'bg-green-100 text-green-900';
      case 'expiring':
        return isDark ? 'bg-amber-900 text-amber-100' : 'bg-amber-100 text-amber-900';
      case 'expired':
        return isDark ? 'bg-red-900 text-red-100' : 'bg-red-100 text-red-900';
      default:
        return isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700';
    }
  }

  function getStatusDisplay(status: string | null) {
    switch (status) {
      case 'allocated':
      case 'booked':
      case 'awaiting':
        return { label: 'Allocated', color: isDark ? 'bg-blue-900 text-blue-100' : 'bg-blue-100 text-blue-900' };
      case 'not_yet_due':
        return { label: 'Not Yet Due', color: isDark ? 'bg-purple-900 text-purple-100' : 'bg-purple-100 text-purple-900' };
      case 'na':
        return { label: 'N/A', color: isDark ? 'bg-gray-700 text-gray-200' : 'bg-gray-200 text-gray-900' };
      default:
        return { label: null, color: '' };
    }
  }

  const canEditMatrix = userRole === 'admin' || userRole === 'scheduler';

  const handleCourseDropStart = (e: React.DragEvent, courseId: string) => {
    setDraggedCourse(courseId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleCourseDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleCourseDropEnd = (e: React.DragEvent, targetCourseId: string) => {
    e.preventDefault();
    if (!draggedCourse || draggedCourse === targetCourseId) return;
    const draggedIndex = courses.findIndex(c => c.id === draggedCourse);
    const targetIndex = courses.findIndex(c => c.id === targetCourseId);
    if (draggedIndex === -1 || targetIndex === -1) return;

    const newCourses = [...courses];
    const [draggedItem] = newCourses.splice(draggedIndex, 1);
    newCourses.splice(targetIndex, 0, draggedItem);
    setCourses(newCourses);
    setDraggedCourse(null);
  };

  const handleStaffDropStart = (e: React.DragEvent, staffId: string) => {
    setDraggedStaff(staffId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleStaffDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const persistStaffOrdering = async (orderedStaff: Staff[]) => {
    if (!selectedLocation) return;
    const staffRows: any[] = [];
    const dividerUpdates: any[] = [];

    orderedStaff.forEach((s, idx) => {
      const displayOrder = idx + 1;
      if (s.id.startsWith('divider-')) {
        dividerUpdates.push({ divider_id: s.id.replace(/^divider-/, ''), display_order: displayOrder });
      } else {
        staffRows.push({ staff_id: s.id, location_id: selectedLocation, display_order: displayOrder });
      }
    });

    if (staffRows.length > 0) {
      await supabase.from('staff_locations').upsert(staffRows, { onConflict: 'staff_id,location_id' });
    }
    if (dividerUpdates.length > 0) {
      await Promise.all(dividerUpdates.map(d =>
        supabase.from('location_matrix_dividers').update({ display_order: d.display_order }).eq('id', d.divider_id)
      ));
    }
  };

  const handleStaffDropEnd = async (e: React.DragEvent, targetStaffId: string) => {
    e.preventDefault();
    if (!draggedStaff || draggedStaff === targetStaffId) return;
    const draggedIndex = staff.findIndex(s => s.id === draggedStaff);
    const targetIndex = staff.findIndex(s => s.id === targetStaffId);
    if (draggedIndex === -1 || targetIndex === -1) return;

    const newStaff = [...staff];
    const [draggedItem] = newStaff.splice(draggedIndex, 1);
    newStaff.splice(targetIndex, 0, draggedItem);
    setStaff(newStaff);
    setDraggedStaff(null);
    await persistStaffOrdering(newStaff);
  };

  const addNewCourse = async () => {
    if (!newCourseName.trim() || !selectedLocation) return;
    try {
      const { data: newCourse } = await supabase
        .from('courses')
        .insert([{ name: newCourseName.trim(), expiry_months: 12, display_order: courses.length + 1 }])
        .select().single();
      if (newCourse) {
        await supabase.from('location_courses').insert([{ location_id: selectedLocation, course_id: newCourse.id }]);
        setCourses([...courses, newCourse]);
        setNewCourseName('');
        setShowAddCourse(false);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const deleteCourse = async (courseId: string) => {
    if (!selectedLocation) return;
    if (!confirm('Remove this course from this matrix?')) return;
    try {
      const removedDisplayOrder = Math.max(1, courses.findIndex(c => c.id === courseId) + 1);
      const { data: sessionData } = await supabase.auth.getSession();
      await fetch('/api/archive/remove-location-course', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionData.session?.access_token}` },
        body: JSON.stringify({ courseId, locationId: selectedLocation, displayOrder: removedDisplayOrder }),
      });
      setCourses(courses.filter(c => c.id !== courseId));
      await fetchMatrixData();
    } catch (error) {
      console.error(error);
    }
  };

  const undoRemoveCourse = async () => {
    if (!lastRemovedCourse) return;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      await fetch('/api/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionData.session?.access_token}` },
        body: JSON.stringify({ deletedItemId: lastRemovedCourse.deleted_item_id }),
      });
      setLastRemovedCourse(null);
      await fetchMatrixData();
    } catch (error) {
      console.error(error);
    }
  };

  const addNewDivider = () => {
    if (!newDividerName.trim()) return;
    const dividerId = `divider-${Date.now()}`;
    const newDivider: Staff = { id: dividerId, name: newDividerName.trim(), location_id: selectedLocation };
    setStaff([...staff, newDivider]);
    setStaffDividers(new Set([...staffDividers, dividerId]));
    setNewDividerName('');
    setShowAddDivider(false);
  };

  const exportMatrixCsv = () => {
    if (!selectedLocation || staff.length === 0 || courses.length === 0) return;
    const header = ['Staff Name', ...courses.map(c => c.name)];
    const rows = staff.map(s => {
      if (staffDividers.has(s.id)) return [s.name, ...courses.map(() => '')];
      return [
        s.name,
        ...courses.map(c => {
          const cell = matrixData[s.id]?.[c.id];
          if (!cell) return '';
          if (['booked', 'awaiting', 'allocated'].includes(cell.status || '')) return 'Allocated';
          return cell.completion_date ? new Date(cell.completion_date).toLocaleDateString('en-GB') : '';
        })
      ];
    });

    const csv = [header, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `matrix-${selectedLocation}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const deleteStaffMember = async (staffId: string) => {
    const target = staff.find(s => s.id === staffId);
    if (!target || !confirm(`Remove "${target.name}"?`)) return;
    setStaff(staff.filter(s => s.id !== staffId));
    if (!staffId.startsWith('divider-')) {
      await fetch('/api/remove-staff-from-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId, locationId: selectedLocation })
      });
    }
  };

  const toggleCellSelection = (staffId: string, courseId: string) => {
    const cellKey = `${staffId}|${courseId}`;
    const newSelected = new Set(selectedCells);
    if (newSelected.has(cellKey)) newSelected.delete(cellKey);
    else newSelected.add(cellKey);
    setSelectedCells(newSelected);
  };

  const selectAllInCourse = (courseId: string) => {
    const newSelected = new Set(selectedCells);
    staff.forEach(s => { if (!s.id.startsWith('divider-')) newSelected.add(`${s.id}|${courseId}`); });
    setSelectedCells(newSelected);
  };

  const deselectAllInCourse = (courseId: string) => {
    const newSelected = new Set(selectedCells);
    staff.forEach(s => newSelected.delete(`${s.id}|${courseId}`));
    setSelectedCells(newSelected);
  };

  const selectAllForStaff = (staffId: string) => {
    const newSelected = new Set(selectedCells);
    courses.forEach(c => newSelected.add(`${staffId}|${c.id}`));
    setSelectedCells(newSelected);
  };

  const clearAllSelections = () => {
    setSelectedCells(new Set());
  };

  const applyBulkUpdate = async () => {
    if (selectedCells.size === 0 || (!bulkEditStatus && !bulkEditDate)) return;
    try {
      const updates = Array.from(selectedCells).map(key => {
        const [staffId, courseId] = key.split('|');
        return { staffId, courseId, locationId: selectedLocation, status: bulkEditStatus, completion_date: bulkEditDate || null };
      });

      await fetch('/api/bulk-update-training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });

      setBulkEditMode(false);
      setBulkEditStatus(null);
      setBulkEditDate('');
      setSelectedCells(new Set());
      await fetchMatrixData();
    } catch (error) {
      console.error(error);
    }
  };

  const contextValue = {
    user, userRole, selectedLocation, setSelectedLocation, locations, staff, setStaff, courses, setCourses, matrixData, setMatrixData,
    loading, setLoading, isDark, setIsDark, tableScrollContainerRef, fetchAbortControllerRef, editingCell, setEditingCell,
    editDate, setEditDate, editStatus, setEditStatus, staffDividers, setStaffDividers, showAddCourse, setShowAddCourse,
    newCourseName, setNewCourseName, draggedCourse, setDraggedCourse, showAddDivider, setShowAddDivider, newDividerName, setNewDividerName,
    draggedStaff, setDraggedStaff, editingHeader, setEditingHeader, editHeaderValue, setEditHeaderValue, editNeverExpires, setEditNeverExpires,
    lastRemovedCourse, setLastRemovedCourse, selectedCells, setSelectedCells, bulkEditMode, setBulkEditMode, bulkEditStatus, setBulkEditStatus,
    bulkEditDate, setBulkEditDate, getCategoryOverrides, saveCategoryOverride, formatExpiryDisplay, checkAuth, checkTheme, fetchLocations,
    fetchMatrixData, saveCourseChanges, getDateStatus, getDateColor, getStatusDisplay, canEditMatrix, handleCourseDropStart, handleCourseDragOver,
    handleCourseDropEnd, handleStaffDropStart, handleStaffDragOver, persistStaffOrdering, handleStaffDropEnd, addNewCourse, deleteCourse,
    undoRemoveCourse, addNewDivider, exportMatrixCsv, deleteStaffMember, toggleCellSelection, selectAllInCourse, deselectAllInCourse,
    selectAllForStaff, clearAllSelections, applyBulkUpdate, updateAllExpiriesForCourse: null, handleSaveTraining: null
  };

  return <MatrixContext.Provider value={contextValue}>{children}</MatrixContext.Provider>;
}

export function useMatrix() {
  const context = useContext(MatrixContext);
  if (context === undefined) throw new Error('useMatrix must be used within a MatrixProvider');
  return context;
}