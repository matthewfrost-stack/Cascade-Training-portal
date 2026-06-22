'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { parseFirstThreeRowsFromCsvString, CsvHeaderRows } from './csvHeaderUtils';
import { debugLog } from '@/lib/debug';

// Helper to get CSV URL for a location name (public folder)
function getCsvUrlForLocation(locationName: string): string {
  // e.g. 'Banks House School' => '/csv-import/Banks House School Training Matrix - Staff Matrix.csv'
  return `/csv-import/${locationName} Training Matrix - Staff Matrix.csv`;
}

interface TrainingRecord {
  id: string;
  staff_id: string;
  staff_name: string;
  course_id: string;
  course_name: string;
  completion_date: string | null;
  expiry_date: string | null;
  location_name: string;
}

interface Staff {
  id: string;
  name: string;
  location_id: string;
}

interface Course {
  id: string;
  name: string;
  category?: string;
  expiry_months?: number;
  never_expires?: boolean;
}

interface MatrixCell {
  completion_date: string | null;
  expiry_date: string | null;
  training_id: string | null;
  status: string | null;
}

interface RemovedCourseEntry {
  deleted_item_id: string;
  course_id: string;
  course_name: string;
  location_id: string;
  display_order: number;
}

function normalizeCourseName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().toLowerCase();
}

export default function TrainingMatrixPage() {
  const router = useRouter();
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
  const [staffOrder, setStaffOrder] = useState<Map<string, number>>(new Map());
  const [showAddCourse, setShowAddCourse] = useState(false);
  const [newCourseName, setNewCourseName] = useState('');
  const [draggedCourse, setDraggedCourse] = useState<string | null>(null);
  const [showAddDivider, setShowAddDivider] = useState(false);
  const [newDividerName, setNewDividerName] = useState('');
  const [draggedStaff, setDraggedStaff] = useState<string | null>(null);
  const [editingHeader, setEditingHeader] = useState<{ courseId: string; type: 'name' | 'category' | 'expiry' } | null>(null);
  const [editHeaderValue, setEditHeaderValue] = useState<string>('');
  const [editNeverExpires, setEditNeverExpires] = useState<boolean>(false);
  const [showReorderCourses, setShowReorderCourses] = useState(false);
  const [courseOrderInput, setCourseOrderInput] = useState('');
  const [lastRemovedCourse, setLastRemovedCourse] = useState<RemovedCourseEntry | null>(null);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set()); // staffId-courseId
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
    // Check if course never expires (9999 months, neverExpires flag, or null months)
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

  // Cleanup abort controller when component unmounts
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
    
    // Only abort if we're changing locations (selectedLocation changed)
    // Don't abort on other effect re-runs (which could cause issues with user actions)
    if (fetchAbortControllerRef.current) {
      try {
        fetchAbortControllerRef.current.abort();
      } catch (e) {
        // Ignore errors from aborting
      }
    }
    
    // Create new abort controller for this fetch
    const abortController = new AbortController();
    fetchAbortControllerRef.current = abortController;
    
    // Set a flag so we know this is the current request
    let isCurrentRequest = true;
    
    // Start the fetch
    fetchMatrixData(abortController.signal).then(() => {
      // Mark that this request completed successfully
      if (isCurrentRequest && abortController === fetchAbortControllerRef.current) {
        // This was the latest request, good to go
      }
    }).catch(error => {
      // Ignore abort errors - they're expected when navigating
      if (!(error instanceof Error && error.name === 'AbortError')) {
        console.error('Unexpected error in fetchMatrixData:', error);
      }
    });
    
    // After fetching matrix data, check if there are any courses for this location
    (async () => {
      // Guard: don't run if selectedLocation is empty or request was aborted
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
        // No courses in DB for this location, import from CSV
        const locationObj = locations.find(l => l.id === selectedLocation);
        if (locationObj && locationObj.name) {
          const csvUrl = getCsvUrlForLocation(locationObj.name);
          try {
            const res = await fetch(csvUrl);
            if (!res.ok) throw new Error('CSV not found');
            const csvContent = await res.text();
            const csvHeaders: CsvHeaderRows = parseFirstThreeRowsFromCsvString(csvContent);
            // Insert each course into training_courses and location_training_courses
            for (let idx = 0; idx < csvHeaders.courseNameRow.length; idx++) {
              const name = csvHeaders.courseNameRow[idx]?.trim();
              if (!name) continue;
              // Insert or upsert course
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
              // Insert into location_training_courses
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
            // After import, re-fetch matrix data to show DB-backed courses
            fetchMatrixData();
          } catch (e) {
            console.warn('Could not import CSV headers for location', locationObj.name, e);
          }
        }
      }
    })();
    
    // Cleanup function
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
        router.push('/login');
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
      router.push('/login');
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
        console.warn('No session token available for location fetch');
        setLoading(false);
        return;
      }

      const response = await fetch('/api/locations/user-locations', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        console.warn('Failed to fetch scoped locations:', response.status);
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
  }

  async function fetchMatrixData(signal?: AbortSignal) {
    try {
      // Safety check: don't proceed if no location selected
      if (!selectedLocation || selectedLocation.trim() === '') {
        console.warn('fetchMatrixData called with invalid selectedLocation:', selectedLocation);
        setLoading(false);
        return;
      }
      
      // Check if request was aborted before we even start
      if (signal?.aborted) {
        console.log('fetchMatrixData: request aborted before start');
        return;
      }
      
      setLoading(true);

      // Fetch dividers from location_matrix_dividers table
      const { data: dividersData, error: dividersError } = await supabase
        .from('location_matrix_dividers')
        .select('id, name, display_order')
        .eq('location_id', selectedLocation)
        .order('display_order', { ascending: true });

      if (dividersError) {
        console.warn('Error fetching dividers:', dividersError);
      }

      // First, fetch all staff from staff_locations with display_order
      const { data: staffLocationsData, error: staffLocationsError } = await supabase
        .from('staff_locations')
        .select('staff_id, display_order, profiles(id, full_name, is_deleted)')
        .eq('location_id', selectedLocation)
        .order('display_order', { ascending: true, nullsFirst: false });

      if (staffLocationsError) {
        console.warn('Error fetching staff from staff_locations:', staffLocationsError);
      }
      
      // Filter out deleted profiles in code
      const activeStaffLocationsData = staffLocationsData?.filter((sl: any) => !sl.profiles?.is_deleted) || [];

      // Also fetch staff who have training records for this location (even if not in staff_locations)
      // Get distinct staff IDs first, then fetch their profiles - WITH PAGINATION
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

        if (trainingStaffIdError) {
          console.warn('Error fetching training staff IDs page', pageNum, ':', trainingStaffIdError);
          break;
        }

        if (!trainingStaffIds || trainingStaffIds.length === 0) {
          hasMoreStaff = false;
        } else {
	          debugLog(`Fetching staff page ${pageNum}: ${trainingStaffIds.length} records`);
          allTrainingStaffIds = allTrainingStaffIds.concat(trainingStaffIds);
          pageNum++;
          if (trainingStaffIds.length < staffPageSize) {
            hasMoreStaff = false;
          }
        }
      }
      
	      debugLog(`Total staff from training data (paginated): ${allTrainingStaffIds.length}`);

      // Get unique staff IDs from training data
      const uniqueStaffIds = new Set<string>();
      allTrainingStaffIds?.forEach((t: any) => {
        if (t.staff_id) {
          uniqueStaffIds.add(t.staff_id);
        }
      });

      // Only include staff from training data if they're also in staff_locations for this location
      // This prevents previously-removed staff from reappearing on refresh
      const staffLocationsIds = new Set(activeStaffLocationsData.map((sl: any) => sl.staff_id));
      const filteredTrainingStaffIds = Array.from(uniqueStaffIds).filter(id => staffLocationsIds.has(id));

      // Fetch profiles for these staff members
      let trainingStaffData: any[] = [];
      if (filteredTrainingStaffIds.length > 0) {
	        debugLog('Fetching profiles for staff IDs:', filteredTrainingStaffIds.length);
        
        const { data: profiles, error: profileError } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', filteredTrainingStaffIds)
          .eq('is_deleted', false);

        if (profileError) {
          console.error('Error fetching profiles:', profileError);
        } else {
	          debugLog('Fetched profiles:', profiles?.length || 0);
          trainingStaffData = profiles?.map((p: any) => ({
            profiles: p
          })) || [];
        }
      } else {
	        debugLog('No training staff IDs found for this location');
      }

      // Merge both lists, eliminating duplicates
      const staffMap = new Map<string, any>();
      
	      debugLog('Staff from staff_locations:', activeStaffLocationsData?.length || 0);
      activeStaffLocationsData?.forEach((s: any) => {
        if (s.profiles) {
          staffMap.set(s.profiles.id, {
            id: s.profiles.id,
            full_name: s.profiles.full_name,
            source: 'staff_locations'
          });
        }
      });

	      debugLog('Staff from training data:', trainingStaffData?.length || 0);
      trainingStaffData?.forEach((s: any) => {
	        debugLog('Processing training staff:', s);
        if (s.profiles && !staffMap.has(s.profiles.id)) {
          staffMap.set(s.profiles.id, {
            id: s.profiles.id,
            full_name: s.profiles.full_name,
            source: 'training_data'
          });
        }
      });

	      debugLog('Final staff map size:', staffMap.size);

      const staffData = Array.from(staffMap.values()).map(s => ({
        profiles: { id: s.id, full_name: s.full_name }
      }));

      // Fetch courses with LOCATION-SPECIFIC ordering from location_training_courses table.
      // Some DB environments don't have `training_courses.category` or `display_order`, so fallback gracefully.
      let locationCoursesData: any[] | null = null;
      let locationCoursesError: any = null;

      const withCategoryRes = await supabase
        .from('location_training_courses')
        .select(`
          training_course_id,
          display_order,
          training_courses(id, name, category, expiry_months, never_expires)
        `)
        .eq('location_id', selectedLocation)
        .order('display_order', { ascending: true, nullsFirst: false });

      locationCoursesData = withCategoryRes.data;
      locationCoursesError = withCategoryRes.error;

      // Handle missing category column (42703)
      if (locationCoursesError?.code === '42703' && locationCoursesError?.message?.includes('category')) {
        const withoutCategoryRes = await supabase
          .from('location_training_courses')
          .select(`
            training_course_id,
            display_order,
            training_courses(id, name, expiry_months, never_expires)
          `)
          .eq('location_id', selectedLocation)
          .order('display_order', { ascending: true, nullsFirst: false });

        locationCoursesData = withoutCategoryRes.data;
        locationCoursesError = withoutCategoryRes.error;
      }

      // Handle missing display_order column (42703)
      if (locationCoursesError?.code === '42703' && locationCoursesError?.message?.includes('display_order')) {
        const withoutDisplayOrderRes = await supabase
          .from('location_training_courses')
          .select(`
            training_course_id,
            training_courses(id, name, category, expiry_months, never_expires)
          `)
          .eq('location_id', selectedLocation);

        locationCoursesData = withoutDisplayOrderRes.data;
        locationCoursesError = withoutDisplayOrderRes.error;
      }

      // Handle missing both columns
      if (locationCoursesError?.code === '42703') {
        const withoutDisplayOrderRes = await supabase
          .from('location_training_courses')
          .select(`
            training_course_id,
            training_courses(id, name, expiry_months, never_expires)
          `)
          .eq('location_id', selectedLocation);

        locationCoursesData = withoutDisplayOrderRes.data;
        locationCoursesError = withoutDisplayOrderRes.error;
      }

	      debugLog('DEBUG: selectedLocation =', selectedLocation);
	      debugLog('DEBUG: locationCoursesError =', locationCoursesError);
	      debugLog('DEBUG: locationCoursesData =', locationCoursesData);
	      debugLog('DEBUG: locationCoursesData length =', locationCoursesData?.length);

      if (locationCoursesError) {
        console.warn('Error fetching location courses:', locationCoursesError);
      }

      // Map courses with location-specific ordering
      let filteredCourses = (locationCoursesData || [])
        .map((lc: any) => {
          const joinedCourse = Array.isArray(lc.training_courses) ? lc.training_courses[0] : lc.training_courses;
          if (!joinedCourse) return null;

          return {
            id: joinedCourse.id,
            name: joinedCourse.name,
            category: joinedCourse.category || undefined,
            display_order: lc.display_order,
            expiry_months: joinedCourse.expiry_months !== null ? joinedCourse.expiry_months : null,
            never_expires: joinedCourse.never_expires || false,
          };
        })
        .filter(Boolean) as Course[];

      // Pull category/header labels from CSV top row for this location.
      // DB schema currently doesn't hold per-location training course category headers.
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
              if (!courseName) continue;
              const category = csvHeaders.categoryRow[idx]?.trim() || '';
              if (category) {
                csvCategoryByCourseName.set(normalizeCourseName(courseName), category);
              }
            }

            filteredCourses = filteredCourses.map(course => ({
              ...course,
              category: course.category || csvCategoryByCourseName.get(normalizeCourseName(course.name)) || undefined,
            }));
          }
        } catch (error) {
          console.warn('Could not load CSV category headers:', error);
        }
      }

      // Apply manual per-location overrides after CSV defaults.
      const categoryOverrides = getCategoryOverrides(selectedLocation);
      filteredCourses = filteredCourses.map(course => ({
        ...course,
        category: categoryOverrides[course.id] ?? course.category,
      }));

      debugLog(`Found ${filteredCourses.length} courses for location ${selectedLocation} with location-specific ordering`);

      // Build mapping of Careskills course IDs to base course IDs
      // This allows records stored under "(Careskills)" variants to show in the base course column
      const { data: allCoursesForMapping } = await supabase
        .from('training_courses')
        .select('id, name');
      
      const careskillsToBaseMap = new Map<string, string>();
      if (allCoursesForMapping) {
        const baseCourses = new Map<string, string>();
        
        // First, index all base courses (without Careskills suffix)
        allCoursesForMapping.forEach((c: any) => {
          if (!c.name.includes('(Careskills)')) {
            baseCourses.set(c.name.toLowerCase().trim(), c.id);
          }
        });
        
        // Then, map Careskills courses to their base equivalents
        allCoursesForMapping.forEach((c: any) => {
          if (c.name.includes('(Careskills)')) {
            const baseName = c.name.replace(' (Careskills)', '').toLowerCase().trim();
            const baseId = baseCourses.get(baseName);
            if (baseId) {
              careskillsToBaseMap.set(c.id, baseId);
            }
          }
        });
        debugLog(`Mapped ${careskillsToBaseMap.size} Careskills courses to base courses`);
      }
      
      // Fetch all training records by paginating through results
      let allTrainingData: any[] = [];
      let pageNumber = 0;
      const pageSize = 1000;
      let hasMore = true;
      
      while (hasMore) {
        const { data: pageData, error: pageError } = await supabase
          .from('staff_training_matrix')
          .select(`
            id,
            staff_id,
            course_id,
            completion_date,
            expiry_date,
            status,
            completed_at_location_id
          `)
          .eq('completed_at_location_id', selectedLocation)
          .order('id', { ascending: true })
          .range(pageNumber * pageSize, (pageNumber + 1) * pageSize - 1);
        
        if (pageError) {
          console.warn('Error fetching training data page', pageNumber, ':', pageError);
          break;
        }
        
        if (!pageData || pageData.length === 0) {
          hasMore = false;
        } else {
          debugLog(`Fetching training data page ${pageNumber}: ${pageData.length} records`);
          allTrainingData = allTrainingData.concat(pageData);
          pageNumber++;
          if (pageData.length < pageSize) {
            hasMore = false;
          }
        }
      }
      
      const trainingData = allTrainingData;
      const trainingError = null;
      debugLog('Total training records fetched (paginated):', trainingData.length);
      debugLog('Selected location:', selectedLocation);

      if (trainingError) {
        console.warn('Error fetching training data:', trainingError);
      }

      // Collect all unique staff IDs from training data for this location
      const staffFromTrainingSet = new Set<string>();
      trainingData?.forEach((t: any) => {
        if (t.completed_at_location_id === selectedLocation) {
          staffFromTrainingSet.add(t.staff_id);
        }
      });

      debugLog('Staff IDs in training data:', Array.from(staffFromTrainingSet).length);

      // Combine staff from staffData with staff IDs from training data
      const allStaffIds = new Set<string>();
      staffData?.forEach((s: any) => {
        if (s.profiles) {
          allStaffIds.add(s.profiles.id);
        }
      });
      staffFromTrainingSet.forEach(id => allStaffIds.add(id));
      debugLog('Total unique staff:', allStaffIds.size);

      // Get profiles for any staff IDs that aren't in staffData
      let allStaffProfiles: any[] = [];
      if (staffData && staffData.length > 0) {
        allStaffProfiles = staffData.filter((s: any) => s.profiles);
      }

      // Add any missing profiles from training data
      const staffIdsInProfiles = new Set(allStaffProfiles.map((s: any) => s.profiles.id));
      const missingIds = Array.from(allStaffIds).filter(id => !staffIdsInProfiles.has(id));

      if (missingIds.length > 0) {
        debugLog('Fetching missing staff profiles:', missingIds.length);
        const { data: missingProfiles, error: missingError } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', missingIds)
          .eq('is_deleted', false);

        if (missingError) {
          console.error('Error fetching missing profiles:', missingError);
        } else if (missingProfiles) {
          missingProfiles.forEach((p: any) => {
            allStaffProfiles.push({ profiles: p });
          });
        }
      }

      // Build staff list with display_order from staff_locations
      const staffWithOrder = allStaffProfiles
        .filter((s: any) => s.profiles && !s.profiles.full_name?.toLowerCase().includes('deleted'))
        .map((s: any) => {
          // Find display_order from staffLocationsData
          const staffLoc = activeStaffLocationsData?.find((sl: any) => sl.staff_id === s.profiles.id);
          return {
            id: s.profiles.id,
            name: s.profiles.full_name,
            location_id: selectedLocation,
            display_order: staffLoc?.display_order || 9999,
            isDivider: false,
          };
        });

      // Safety dedupe: if near-identical names exist in the same location and one has no
      // training rows, prefer the one that has training data to avoid blank duplicate rows.
      const normalizePersonName = (value: string) =>
        String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const levenshteinDistance = (a: string, b: string): number => {
        const aa = normalizePersonName(a);
        const bb = normalizePersonName(b);
        const m = aa.length;
        const n = bb.length;
        if (m === 0) return n;
        if (n === 0) return m;
        const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;
        for (let i = 1; i <= m; i++) {
          for (let j = 1; j <= n; j++) {
            const cost = aa[i - 1] === bb[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
          }
        }
        return dp[m][n];
      };
      const sharesNameToken = (a: string, b: string): boolean => {
        const tokensA = normalizePersonName(a).split(' ').filter((t) => t.length > 2);
        const tokensB = new Set(normalizePersonName(b).split(' ').filter((t) => t.length > 2));
        return tokensA.some((t) => tokensB.has(t));
      };

      const dedupedStaffWithOrder: typeof staffWithOrder = [];
      for (const candidate of staffWithOrder.sort((a, b) => (a.display_order || 9999) - (b.display_order || 9999))) {
        const existingIndex = dedupedStaffWithOrder.findIndex((existing) => {
          const distance = levenshteinDistance(existing.name, candidate.name);
          const sameOrNear = distance === 0 || (distance <= 2 && sharesNameToken(existing.name, candidate.name));
          return sameOrNear;
        });

        if (existingIndex === -1) {
          dedupedStaffWithOrder.push(candidate);
          continue;
        }

        const existing = dedupedStaffWithOrder[existingIndex];
        const existingHasTraining = staffFromTrainingSet.has(existing.id);
        const candidateHasTraining = staffFromTrainingSet.has(candidate.id);

        if (!existingHasTraining && candidateHasTraining) {
          dedupedStaffWithOrder[existingIndex] = {
            ...candidate,
            display_order: Math.min(existing.display_order || 9999, candidate.display_order || 9999),
          };
        } else if (existingHasTraining && !candidateHasTraining) {
          // Keep existing row with data; suppress blank duplicate.
        } else if (!existingHasTraining && !candidateHasTraining) {
          // Keep the first one by order.
        } else {
          // Both have data: keep both to avoid hiding potentially distinct staff.
          dedupedStaffWithOrder.push(candidate);
        }
      }

      // Add dividers from the database
      const dividerItems = (dividersData || [])
        .filter((d: any) => d.name !== 'Staff Name') // Filter out "Staff Name" header
        .map((d: any) => ({
          id: `divider-${d.id}`,
          name: d.name,
          location_id: selectedLocation,
          display_order: d.display_order,
          isDivider: true,
        }));

      // Merge staff and dividers, sort by display_order
      const combinedListDeduped = [...dedupedStaffWithOrder, ...dividerItems]
        .sort((a, b) => (a.display_order || 9999) - (b.display_order || 9999));

      debugLog('Formatted staff for location:', {
        staffCount: staffWithOrder.length,
        staffCountAfterDedupe: dedupedStaffWithOrder.length,
        dividerCount: dividerItems.length,
      });

      // Set divider IDs for styling
      const dividerIds = new Set<string>(dividerItems.map((d: any) => d.id));
      setStaffDividers(dividerIds);
      setStaff(combinedListDeduped);

      debugLog('DEBUG: filteredCourses =', filteredCourses);
      debugLog('DEBUG: filteredCourses length =', filteredCourses?.length);
      if (filteredCourses && filteredCourses.length > 0) {
        setCourses(filteredCourses);
        debugLog('DEBUG: Courses set to state:', filteredCourses);
      } else {
        console.warn('DEBUG: No courses found!');
      }

      // Build matrix as plain object from the start
      const plainMatrix: Record<string, Record<string, MatrixCell>> = {};

      // Initialize matrix with all staff IDs
      allStaffProfiles?.forEach((s: any) => {
        if (s.profiles) {
          plainMatrix[s.profiles.id] = {};
        }
      });

      debugLog('Matrix initialized with', Object.keys(plainMatrix).length, 'staff');

      // Add training data
      let addedCount = 0;
      let mappedCount = 0;
      trainingData?.forEach((t: any) => {
        // Filter by location on client side
        if (t.completed_at_location_id === selectedLocation) {
          if (plainMatrix[t.staff_id]) {
            addedCount++;
            
            // Check if this is a Careskills course that should be mapped to a base course
            const effectiveCourseId = careskillsToBaseMap.get(t.course_id) || t.course_id;
            if (effectiveCourseId !== t.course_id) {
              mappedCount++;
            }
            
            // Always update with the latest data from the database
            // This ensures bulk updates with new dates replace old expired dates
            plainMatrix[t.staff_id][effectiveCourseId] = {
              completion_date: t.completion_date,
              expiry_date: t.expiry_date,
              training_id: t.id,
              status: t.status,
            };
          }
        }
      });
      debugLog(`Added ${addedCount} training records to matrix (${mappedCount} mapped from Careskills variants)`);

      debugLog('Final matrix data:', Object.keys(plainMatrix).length, 'staff with data');
      // Count total cells
      let totalCells = 0;
      Object.values(plainMatrix).forEach(staffMap => {
        totalCells += Object.keys(staffMap).length;
      });
      debugLog('Total cells with training data:', totalCells);

      setMatrixData(plainMatrix);
    } catch (error) {
      // AbortError is expected when navigating away, don't treat as real error
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Matrix fetch was aborted (user navigated away)');
        return;
      }
      console.error('Error fetching matrix data:', error);
    } finally {
      // Don't update state if request was aborted
      if (!signal?.aborted) {
        setLoading(false);
      }
      // Reset horizontal scroll to show first courses after data is loaded
      if (!signal?.aborted) {
        setTimeout(() => {
          if (tableScrollContainerRef.current) {
            tableScrollContainerRef.current.scrollLeft = 0;
          }
        }, 50);
      }
    }
  }

  async function saveCourseChanges(courseId: string, updates: Partial<Course>, skipRefresh = false) {
    try {
      debugLog('Saving course changes:', { courseId, updates });

      const response = await fetch('/api/update-course', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId, updates }),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error('API error:', result.error);
        throw new Error(`${result.error} (${result.code || 'UNKNOWN'})`);
      }

      debugLog('Course update successful:', result.data);
      
      // Only refresh if it's not a header-only change
      if (!skipRefresh) {
        await fetchMatrixData();
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('Error saving course changes:', errorMsg);
      alert(`Error saving course changes: ${errorMsg}`);
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

  const moveCourse = (courseId: string, direction: 'left' | 'right') => {
    const currentIndex = courses.findIndex(c => c.id === courseId);
    if (currentIndex === -1) return;

    const newCourses = [...courses];
    if (direction === 'left' && currentIndex > 0) {
      [newCourses[currentIndex], newCourses[currentIndex - 1]] = [newCourses[currentIndex - 1], newCourses[currentIndex]];
    } else if (direction === 'right' && currentIndex < newCourses.length - 1) {
      [newCourses[currentIndex], newCourses[currentIndex + 1]] = [newCourses[currentIndex + 1], newCourses[currentIndex]];
    }

    setCourses(newCourses);
  };

  const handleCourseDropStart = (e: React.DragEvent, courseId: string) => {
    setDraggedCourse(courseId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleCourseDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleCourseDropEnd = (e: React.DragEvent, targetCourseId: string) => {
    e.preventDefault();
    if (!draggedCourse || draggedCourse === targetCourseId) {
      setDraggedCourse(null);
      return;
    }

    const draggedIndex = courses.findIndex(c => c.id === draggedCourse);
    const targetIndex = courses.findIndex(c => c.id === targetCourseId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedCourse(null);
      return;
    }

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
    e.dataTransfer.dropEffect = 'move';
  };

  const persistStaffOrdering = async (orderedStaff: Staff[]) => {
    if (!selectedLocation) return;

    const staffRows: Array<{ staff_id: string; location_id: string; display_order: number }> = [];
    const dividerUpdates: Array<{ divider_id: string; display_order: number }> = [];

    orderedStaff.forEach((s, idx) => {
      const displayOrder = idx + 1;
      if (s.id.startsWith('divider-')) {
        dividerUpdates.push({
          divider_id: s.id.replace(/^divider-/, ''),
          display_order: displayOrder,
        });
        return;
      }

      staffRows.push({
        staff_id: s.id,
        location_id: selectedLocation,
        display_order: displayOrder,
      });
    });

    if (staffRows.length > 0) {
      const { error: staffOrderError } = await supabase
        .from('staff_locations')
        .upsert(staffRows, { onConflict: 'staff_id,location_id' });

      if (staffOrderError) {
        throw staffOrderError;
      }
    }

    if (dividerUpdates.length > 0) {
      const dividerWrites = dividerUpdates.map((d) =>
        supabase
          .from('location_matrix_dividers')
          .update({ display_order: d.display_order })
          .eq('id', d.divider_id)
          .eq('location_id', selectedLocation)
      );
      const dividerResults = await Promise.all(dividerWrites);
      const failed = dividerResults.find((r) => r.error);
      if (failed?.error) {
        throw failed.error;
      }
    }
  };

  const handleStaffDropEnd = async (e: React.DragEvent, targetStaffId: string) => {
    e.preventDefault();
    if (!draggedStaff || draggedStaff === targetStaffId) {
      setDraggedStaff(null);
      return;
    }

    const draggedIndex = staff.findIndex(s => s.id === draggedStaff);
    const targetIndex = staff.findIndex(s => s.id === targetStaffId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedStaff(null);
      return;
    }

    const newStaff = [...staff];
    const [draggedItem] = newStaff.splice(draggedIndex, 1);
    newStaff.splice(targetIndex, 0, draggedItem);

    setStaff(newStaff);
    const newOrder = new Map<string, number>();
    newStaff.forEach((s, idx) => newOrder.set(s.id, idx + 1));
    setStaffOrder(newOrder);
    setDraggedStaff(null);

    try {
      await persistStaffOrdering(newStaff);
    } catch (error) {
      console.error('Error persisting staff order:', error);
      alert('Could not save new staff order. Reloading previous order.');
      await fetchMatrixData();
    }
  };

  const addNewCourse = async () => {
    if (!newCourseName.trim()) return;

    if (!selectedLocation || selectedLocation.trim() === '') {
      alert('Please select a location before adding a course');
      return;
    }

    try {
      const { data: newCourse, error } = await supabase
        .from('courses')
        .insert([
          {
            name: newCourseName.trim(),
            expiry_months: 12,
            display_order: courses.length + 1,
          },
        ])
        .select()
        .single();

      if (error) throw error;

      // Add the course to location_courses for the current location
      if (selectedLocation) {
        const { error: locError } = await supabase
          .from('location_courses')
          .insert([
            {
              location_id: selectedLocation,
              course_id: newCourse.id,
            },
          ]);

        if (locError) {
          console.error('Error adding course to location:', locError);
          // Still add to UI even if location assignment fails
        }
      }

      setCourses([...courses, newCourse]);
      setNewCourseName('');
      setShowAddCourse(false);
    } catch (error) {
      console.error('Error adding course:', error);
      alert('Error adding course');
    }
  };

  const deleteCourse = async (courseId: string) => {
    if (!selectedLocation || selectedLocation.trim() === '') {
      alert('Please select a location before removing a course');
      return;
    }

    const ok = confirm('Remove this course from this location matrix? You can undo this from the banner after deletion.');
    if (!ok) return;

    try {
      const removedCourse = courses.find(c => c.id === courseId);
      const removedDisplayOrder = Math.max(1, courses.findIndex(c => c.id === courseId) + 1);
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('You are not authenticated. Please sign in again.');

      const response = await fetch('/api/archive/remove-location-course', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          courseId,
          locationId: selectedLocation,
          displayOrder: removedDisplayOrder,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result?.success || !result?.removed) {
        throw new Error(result?.error || 'Failed to remove course from location');
      }

      setCourses(courses.filter(c => c.id !== courseId));
      setLastRemovedCourse({
        deleted_item_id: result.removed.deleted_item_id,
        course_id: courseId,
        course_name: result.removed.course_name || removedCourse?.name || 'Unknown Course',
        location_id: selectedLocation,
        display_order: removedDisplayOrder,
      });
      await fetchMatrixData();
    } catch (error) {
      console.error('Error removing course from location matrix:', error);
      alert('Error removing course from this location matrix');
    }
  };

  const undoRemoveCourse = async () => {
    if (!lastRemovedCourse) return;
    if (userRole !== 'admin') {
      alert('Only admins can restore from archive.');
      return;
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('You are not authenticated. Please sign in again.');

      const response = await fetch('/api/archive', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ deletedItemId: lastRemovedCourse.deleted_item_id }),
      });
      const result = await response.json();
      if (!response.ok || !result?.success) throw new Error(result?.error || 'Failed to restore removed course');

      setLastRemovedCourse(null);
      await fetchMatrixData();
    } catch (error) {
      console.error('Error restoring removed course:', error);
      alert('Error restoring removed course');
    }
  };

  const reorderCourses = async () => {
    // Parse the input - can be comma-separated or newline-separated course names
    const courseNames = courseOrderInput
      .split(/[,\n]/)
      .map(name => name.trim())
      .filter(name => name.length > 0);

    if (courseNames.length === 0) {
      alert('Please enter course names');
      return;
    }

    // Match input names to actual courses
    const reorderedCourses: Course[] = [];
    const unmatchedNames: string[] = [];

    for (const inputName of courseNames) {
      const foundCourse = courses.find(
        c => c.name.toLowerCase() === inputName.toLowerCase()
      );
      if (foundCourse) {
        reorderedCourses.push(foundCourse);
      } else {
        unmatchedNames.push(inputName);
      }
    }

    if (unmatchedNames.length > 0) {
      alert(`Could not find these courses: ${unmatchedNames.join(', ')}`);
      return;
    }

    // Update display_order for all courses
    for (let i = 0; i < reorderedCourses.length; i++) {
      const course = reorderedCourses[i];
      try {
        await supabase.rpc('update_course_data', {
          p_course_id: course.id,
          p_updates: JSON.stringify({ display_order: i + 1 }),
        });
      } catch (error) {
        console.error('Error updating course order:', error);
      }
    }

    // Update state
    setCourses(reorderedCourses);
    setShowReorderCourses(false);
    setCourseOrderInput('');
    alert('Courses reordered successfully!');
  };

  const addNewDivider = () => {
    if (!newDividerName.trim()) return;

    // Create a temporary ID for the divider
    const dividerId = `divider-${Date.now()}`;
    
    // Add divider to staff list
    const newDivider: Staff = {
      id: dividerId,
      name: newDividerName.trim(),
      location_id: selectedLocation,
    };

    // Insert after current position or at end
    setStaff([...staff, newDivider]);
    setStaffDividers(new Set([...staffDividers, dividerId]));
    setNewDividerName('');
    setShowAddDivider(false);
  };

  const moveStaff = (staffId: string, direction: 'up' | 'down') => {
    const currentIndex = staff.findIndex(s => s.id === staffId);
    if (currentIndex === -1) return;

    const newStaff = [...staff];
    if (direction === 'up' && currentIndex > 0) {
      [newStaff[currentIndex], newStaff[currentIndex - 1]] = [newStaff[currentIndex - 1], newStaff[currentIndex]];
    } else if (direction === 'down' && currentIndex < newStaff.length - 1) {
      [newStaff[currentIndex], newStaff[currentIndex + 1]] = [newStaff[currentIndex + 1], newStaff[currentIndex]];
    }

    setStaff(newStaff);

    // Save new order to database
    const newOrder = new Map<string, number>();
    newStaff.forEach((s, idx) => {
      newOrder.set(s.id, idx);
    });
    setStaffOrder(newOrder);

    // Optionally persist to database (for now just in UI)
  };

  const exportMatrixCsv = () => {
    if (!selectedLocation || staff.length === 0 || courses.length === 0) {
      alert('Nothing to export for this location yet.');
      return;
    }

    const escapeCsv = (value: string): string => {
      const needsQuotes = /[",\n]/.test(value);
      const escaped = value.replace(/"/g, '""');
      return needsQuotes ? `"${escaped}"` : escaped;
    };

    const formatCellForExport = (staffId: string, course: Course): string => {
      const cell = matrixData[staffId]?.[course.id];
      if (!cell) return '';

      if (cell.status === 'booked' || cell.status === 'awaiting' || cell.status === 'allocated') return 'Allocated';
      if (cell.status === 'not_yet_due') return 'Not Yet Due';
      if (cell.status === 'na') return 'N/A';

      if (cell.completion_date) {
        return new Date(cell.completion_date).toLocaleDateString('en-GB');
      }

      return '';
    };

    const header = ['Staff Name', ...courses.map((c) => c.name)];
    const rows = staff.map((staffMember) => {
      if (staffDividers.has(staffMember.id)) {
        return [staffMember.name, ...courses.map(() => '')];
      }

      return [
        staffMember.name,
        ...courses.map((course) => formatCellForExport(staffMember.id, course)),
      ];
    });

    const csv = [header, ...rows]
      .map((row) => row.map((value) => escapeCsv(String(value ?? ''))).join(','))
      .join('\n');

    const locationName = locations.find((l: any) => l.id === selectedLocation)?.name || 'training-matrix';
    const safeLocationName = locationName.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '');
    const datePart = new Date().toISOString().split('T')[0];
    const filename = `${safeLocationName || 'training-matrix'}-${datePart}.csv`;

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const deleteStaffMember = async (staffId: string) => {
    const staffMember = staff.find(s => s.id === staffId);
    if (!staffMember) return;

    if (!confirm(`Remove "${staffMember.name}" from this location only? They will remain in other locations.`)) return;

    try {
      // Remove from UI first
      setStaff(staff.filter(s => s.id !== staffId));
      staffDividers.delete(staffId);
      setStaffDividers(new Set(staffDividers));

      // If it's a real staff member (not a temporary divider), remove from this location only
      if (!staffId.startsWith('divider-')) {
        const response = await fetch('/api/remove-staff-from-location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ staffId, locationId: selectedLocation })
        });

        const result = await response.json();

        if (!response.ok) {
          console.warn('Could not remove staff from location:', result.error);
          alert('❌ Error: ' + (result.error || 'Could not remove staff from location'));
          // Re-fetch to restore the staff member
          fetchMatrixData();
        }
      }
    } catch (error) {
      console.error('Error deleting staff:', error);
      alert('❌ Error removing staff member from location');
      // Re-fetch to restore the staff member
      fetchMatrixData();
    }
  };

  const toggleCellSelection = (staffId: string, courseId: string) => {
    const cellKey = `${staffId}|${courseId}`;
    const newSelected = new Set(selectedCells);
    if (newSelected.has(cellKey)) {
      newSelected.delete(cellKey);
      console.log('☑️ Cell deselected:', cellKey, '| Total selected:', newSelected.size);
    } else {
      newSelected.add(cellKey);
      console.log('✅ Cell selected:', cellKey, '| Total selected:', newSelected.size);
    }
    setSelectedCells(newSelected);
  };

  const selectAllInCourse = (courseId: string) => {
    const newSelected = new Set(selectedCells);
    staff.forEach(s => {
      if (!s.id.startsWith('divider-')) {
        const cellKey = `${s.id}|${courseId}`;
        newSelected.add(cellKey);
      }
    });
    setSelectedCells(newSelected);
  };

  const deselectAllInCourse = (courseId: string) => {
    const newSelected = new Set(selectedCells);
    staff.forEach(s => {
      const cellKey = `${s.id}|${courseId}`;
      newSelected.delete(cellKey);
    });
    setSelectedCells(newSelected);
  };

  const selectAllForStaff = (staffId: string) => {
    const newSelected = new Set(selectedCells);
    courses.forEach(c => {
      const cellKey = `${staffId}|${c.id}`;
      newSelected.add(cellKey);
    });
    setSelectedCells(newSelected);
  };

  const clearAllSelections = () => {
    setSelectedCells(new Set());
  };

  const applyBulkUpdate = async () => {
    console.log('🔘 applyBulkUpdate called. Selected cells:', selectedCells.size);
    
    if (selectedCells.size === 0) {
      console.log('⚠️ No cells selected');
      alert('No cells selected');
      return;
    }

    if (!bulkEditStatus && !bulkEditDate) {
      console.log('⚠️ No status or date set');
      alert('Please set at least a status or completion date');
      return;
    }

    try {
      const updates = Array.from(selectedCells).map(cellKey => {
        const [staffId, courseId] = cellKey.split('|');
        return {
          staffId,
          courseId,
          locationId: selectedLocation,
          status: bulkEditStatus,
          completion_date: bulkEditDate || null,
        };
      });

      console.log('🚀 Frontend: Starting bulk update with', updates.length, 'updates');
      console.log('   Sample update:', updates[0]);
      console.log('   Status:', bulkEditStatus, 'Date:', bulkEditDate);

      const response = await fetch('/api/bulk-update-training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });

      console.log('📡 API Response status:', response.status);

      const result = await response.json();
      console.log('📋 API Result:', result);

      if (!result.success) {
        // Log detailed errors for debugging
        console.error('❌ Bulk update failed:', result);
        if (result.results) {
          const failedUpdates = result.results.filter((r: any) => !r.success);
          console.error('Failed records:', failedUpdates);
          throw new Error(`Failed to update ${failedUpdates.length} records: ${failedUpdates.map((r: any) => r.error).join('; ')}`);
        }
        throw new Error(result.error || `Failed to update ${result.failedCount} records`);
      }

      console.log('✅ Bulk update successful:', result);
      alert(`✅ Updated ${selectedCells.size} training records`);
      setBulkEditMode(false);
      setBulkEditStatus(null);
      setBulkEditDate('');
      setSelectedCells(new Set());
      
      // Wait a moment for the database to commit before fetching
      await new Promise(resolve => setTimeout(resolve, 500));
      await fetchMatrixData();
    } catch (error) {
      console.error('❌ Error applying bulk update:', error);
      alert('❌ Error updating records: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  if (loading || !user) {
    return <div className={`p-8 ${isDark ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'}`}>Loading...</div>;
  }

  return (
    <div className={`min-h-screen ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
      {/* Header */}
      <div className={`p-6 ${isDark ? 'bg-gray-800' : 'bg-white'} border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
        <div className="flex justify-between items-center mb-4">
          <div className="w-10" />
          <h1 className={`text-3xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Training Matrix</h1>
          <div className="w-10" />
        </div>

        {/* Centered Controls */}
        {locations.length > 0 && (
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-3">
              <label className={`font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Select Site:</label>
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className={`px-4 py-2 rounded-lg border ${
                  isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                } focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200`}
              >
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Buttons Row - Centered */}
            {selectedLocation && (
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  onClick={exportMatrixCsv}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200 text-sm font-medium"
                >
                  Export CSV
                </button>
                {selectedCells.size > 0 && (
                  <>
                    <button
                      onClick={() => setBulkEditMode(true)}
                      className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors duration-200 text-sm font-medium"
                    >
                      📝 Bulk Edit ({selectedCells.size})
                    </button>
                    <button
                      onClick={clearAllSelections}
                      className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors duration-200 text-sm font-medium"
                    >
                      Clear Selection
                    </button>
                  </>
                )}
                {canEditMatrix && (
                  <>
                    {!showAddCourse ? (
                      <button
                        onClick={() => setShowAddCourse(true)}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors duration-200 text-sm font-medium"
                      >
                        + Course
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newCourseName}
                          onChange={(e) => setNewCourseName(e.target.value)}
                          placeholder="Course name"
                          className={`px-3 py-2 rounded border text-sm transition-colors duration-150 ${
                            isDark
                              ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                              : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                          }`}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') addNewCourse();
                            if (e.key === 'Escape') {
                              setShowAddCourse(false);
                              setNewCourseName('');
                            }
                          }}
                          autoFocus
                        />
                        <button
                          onClick={addNewCourse}
                          className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors text-sm font-medium"
                        >
                          ✓
                        </button>
                        <button
                          onClick={() => {
                            setShowAddCourse(false);
                            setNewCourseName('');
                          }}
                          className="px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-sm font-medium"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                    {!showAddDivider ? (
                      <button
                        onClick={() => setShowAddDivider(true)}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors duration-200 text-sm font-medium"
                      >
                        + Divider
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newDividerName}
                          onChange={(e) => setNewDividerName(e.target.value)}
                          placeholder="Section name (e.g., Management)"
                          className={`px-3 py-2 rounded border text-sm transition-colors duration-150 ${
                            isDark
                              ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                              : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                          }`}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') addNewDivider();
                            if (e.key === 'Escape') {
                              setShowAddDivider(false);
                              setNewDividerName('');
                            }
                          }}
                          autoFocus
                        />
                        <button
                          onClick={addNewDivider}
                          className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors text-sm font-medium"
                        >
                          ✓
                        </button>
                        <button
                          onClick={() => {
                            setShowAddDivider(false);
                            setNewDividerName('');
                          }}
                          className="px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-sm font-medium"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            {lastRemovedCourse && userRole === 'admin' && (
              <div className={`w-full max-w-4xl rounded-lg border px-4 py-2 text-sm flex items-center justify-between ${
                isDark ? 'bg-amber-900/20 border-amber-700 text-amber-200' : 'bg-amber-50 border-amber-300 text-amber-800'
              }`}>
                <span>
                  Removed from this location: <strong>{lastRemovedCourse.course_name}</strong>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={undoRemoveCourse}
                    className={`px-3 py-1 rounded font-semibold ${
                      isDark ? 'bg-amber-700 hover:bg-amber-600 text-white' : 'bg-amber-500 hover:bg-amber-600 text-white'
                    }`}
                  >
                    Undo
                  </button>
                  <button
                    onClick={() => setLastRemovedCourse(null)}
                    className={`px-3 py-1 rounded ${
                      isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-200 hover:bg-gray-300 text-gray-800'
                    }`}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="p-8">
        {staff.length === 0 ? (
          <div className={`text-center py-12 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            No data available for this location
          </div>
        ) : courses.length === 0 ? (
          <div className={`text-center py-12 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            No courses configured for this location yet.
          </div>
        ) : (
          <div className={`rounded-lg border ${isDark ? 'border-gray-700' : 'border-gray-200'} overflow-hidden shadow-lg`}>
            <div ref={tableScrollContainerRef} className="overflow-x-auto overflow-y-auto h-[calc(100vh-280px)]">
              <table className={`w-full text-sm ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
                <thead className="sticky top-0 z-20">
                  {/* Category Row */}
                  <tr style={{ position: 'sticky', top: '0px', zIndex: 20 }} className={`h-8 ${isDark ? 'bg-gray-600' : 'bg-gray-200'} border-b ${isDark ? 'border-gray-500' : 'border-gray-300'}`}>
                    <th className={`px-4 py-1 text-left font-semibold text-xs sticky left-0 z-30 ${isDark ? 'bg-gray-600' : 'bg-gray-200'} min-w-[200px]`}>
                    </th>
                    {courses.map((course) => (
                      <th
                        key={`cat-${course.id}`}
                        onClick={() => {
                          setEditingHeader({ courseId: course.id, type: 'category' });
                          setEditHeaderValue(course.category || '');
                        }}
                        className={`px-2 py-1 text-center text-xs font-semibold ${isDark ? 'text-gray-400' : 'text-gray-600'} min-w-[140px] cursor-pointer hover:opacity-80 ${isDark ? 'bg-gray-600' : 'bg-gray-200'}`}
                      >
                        {editingHeader?.courseId === course.id && editingHeader?.type === 'category' ? (
                          <input
                            type="text"
                            value={editHeaderValue}
                            onChange={(e) => setEditHeaderValue(e.target.value)}
                            onBlur={() => {
                              const newCategory = editHeaderValue.trim() || undefined;
                              // Update local state immediately for instant feedback
                              const updatedCourses = courses.map(c => c.id === course.id ? { ...c, category: newCategory } : c);
                              setCourses(updatedCourses);
                              // Persist category header override per location.
                              saveCategoryOverride(selectedLocation, course.id, newCategory || '');
                              setEditingHeader(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const newCategory = editHeaderValue.trim() || undefined;
                                // Update local state immediately for instant feedback
                                const updatedCourses = courses.map(c => c.id === course.id ? { ...c, category: newCategory } : c);
                                setCourses(updatedCourses);
                                // Persist category header override per location.
                                saveCategoryOverride(selectedLocation, course.id, newCategory || '');
                                setEditingHeader(null);
                              }
                              if (e.key === 'Escape') setEditingHeader(null);
                            }}
                            className={`w-full text-xs px-1 rounded border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-400 text-gray-900'}`}
                            autoFocus
                          />
                        ) : (
                          course.category || '—'
                        )}
                      </th>
                    ))}
                  </tr>
                  {/* Course Name Row */}
                  <tr style={{ position: 'sticky', top: '32px', zIndex: 20 }} className={`h-8 ${isDark ? 'bg-gray-600' : 'bg-gray-200'} border-b ${isDark ? 'border-gray-500' : 'border-gray-300'}`}>
                    <th className={`px-4 py-1 text-left font-semibold text-xs sticky left-0 z-30 ${isDark ? 'bg-gray-600' : 'bg-gray-200'} min-w-[200px]`}>
                      Staff Member
                    </th>
                    {courses.map((course) => (
                      <th
                        key={`name-${course.id}`}
                        draggable={!editingHeader}
                        onDragStart={(e) => handleCourseDropStart(e, course.id)}
                        onDragOver={handleCourseDragOver}
                        onDrop={(e) => handleCourseDropEnd(e, course.id)}
                        onClick={() => {
                          setEditingHeader({ courseId: course.id, type: 'name' });
                          setEditHeaderValue(course.name);
                        }}
                        className={`px-2 py-1 text-center text-xs font-semibold ${isDark ? 'text-gray-300' : 'text-gray-700'} min-w-[140px] transition-all duration-150 cursor-grab active:cursor-grabbing hover:opacity-80 ${isDark ? 'bg-gray-600' : 'bg-gray-200'} ${
                          draggedCourse === course.id ? 'opacity-50' : 'opacity-100'
                        } ${draggedCourse && draggedCourse !== course.id ? 'bg-gray-500 bg-opacity-30' : ''}`}
                        title="Drag to reorder courses"
                      >
                        {editingHeader?.courseId === course.id && editingHeader?.type === 'name' ? (
                          <input
                            type="text"
                            value={editHeaderValue}
                            onChange={(e) => setEditHeaderValue(e.target.value)}
                            onBlur={() => {
                              if (editHeaderValue.trim()) {
                                const updatedCourses = courses.map(c => c.id === course.id ? { ...c, name: editHeaderValue.trim() } : c);
                                setCourses(updatedCourses);
                                saveCourseChanges(course.id, { name: editHeaderValue.trim() }, true);
                              }
                              setEditingHeader(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                if (editHeaderValue.trim()) {
                                  const updatedCourses = courses.map(c => c.id === course.id ? { ...c, name: editHeaderValue.trim() } : c);
                                  setCourses(updatedCourses);
                                  saveCourseChanges(course.id, { name: editHeaderValue.trim() }, true);
                                }
                                setEditingHeader(null);
                              }
                              if (e.key === 'Escape') setEditingHeader(null);
                            }}
                            className={`w-full text-xs px-1 rounded border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-400 text-gray-900'}`}
                            autoFocus
                          />
                        ) : (
                          <div className="flex items-center justify-center gap-1 group/header">
                            <span className="text-gray-500">⋮⋮</span>
                            <span className="block max-w-[80px] truncate text-xs leading-tight" title={course.name}>{course.name}</span>
                            <div className="flex gap-0.5 opacity-0 group-hover/header:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  selectAllInCourse(course.id);
                                }}
                                className={`text-green-600 hover:text-green-700 font-bold text-xs leading-none`}
                                title="Select all in this course"
                              >
                                ☑
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deselectAllInCourse(course.id);
                                }}
                                className={`text-gray-600 hover:text-gray-700 font-bold text-xs leading-none`}
                                title="Deselect all in this course"
                              >
                                ☐
                              </button>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteCourse(course.id);
                              }}
                              className={`ml-1 text-red-600 hover:text-red-700 font-bold text-sm leading-none opacity-60 hover:opacity-100 transition-opacity`}
                              title="Delete course"
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </th>
                    ))}
                  </tr>
                  {/* Expiry Time Row */}
                  <tr style={{ position: 'sticky', top: '64px', zIndex: 20 }} className={`h-8 ${isDark ? 'bg-gray-600' : 'bg-gray-200'} border-b ${isDark ? 'border-gray-500' : 'border-gray-300'}`}>
                    <th className={`px-4 py-1 text-left font-semibold text-xs sticky left-0 z-30 ${isDark ? 'bg-gray-600' : 'bg-gray-200'} min-w-[200px]`}>
                    </th>
                    {courses.map((course) => (
                      <th
                        key={`expiry-${course.id}`}
                        onClick={() => {
                          setEditingHeader({ courseId: course.id, type: 'expiry' });
                          setEditHeaderValue(String(course.expiry_months || 12));
                          setEditNeverExpires(course.never_expires || false);
                        }}
                        className={`px-2 py-1 text-center text-xs cursor-pointer hover:opacity-80 ${isDark ? 'text-gray-400' : 'text-gray-600'} min-w-[140px] ${isDark ? 'bg-gray-600' : 'bg-gray-200'}`}
                      >
                        {editingHeader?.courseId === course.id && editingHeader?.type === 'expiry' ? (
                          <div className="flex flex-col gap-2">
                            <label className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                              <input
                                type="checkbox"
                                checked={editNeverExpires}
                                onChange={(e) => setEditNeverExpires(e.target.checked)}
                                className="mr-1"
                              />
                              Never expires
                            </label>
                            {!editNeverExpires && (
                              <input
                                type="number"
                                value={editHeaderValue}
                                onChange={(e) => setEditHeaderValue(e.target.value)}
                                onKeyDown={async (e) => {
                                  if (e.key === 'Enter') {
                                    const months = parseInt(editHeaderValue) || 12;
                                    const updatedCourses = courses.map(c => c.id === course.id ? { ...c, expiry_months: months } : c);
                                    setCourses(updatedCourses);
                                    await saveCourseChanges(course.id, { expiry_months: months, never_expires: false }, true);
                                    await updateAllExpiriesForCourse(course.id, months, false);
                                    setEditingHeader(null);
                                  }
                                  if (e.key === 'Escape') setEditingHeader(null);
                                }}
                                className={`w-full text-xs px-1 rounded border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-400 text-gray-900'}`}
                                placeholder="months"
                                autoFocus
                              />
                            )}
                            {(editNeverExpires || course.expiry_months === 9999) && (
                              <button
                                onClick={async () => {
                                  setEditNeverExpires(false);
                                  const months = parseInt(editHeaderValue) || 12;
                                  const updatedCourses = courses.map(c => c.id === course.id ? { ...c, never_expires: false, expiry_months: months } : c);
                                  setCourses(updatedCourses);
                                  await saveCourseChanges(course.id, { never_expires: false, expiry_months: months }, true);
                                  await updateAllExpiriesForCourse(course.id, months, false);
                                  setEditingHeader(null);
                                }}
                                className={`text-xs px-2 py-1 rounded ${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-300 hover:bg-gray-400'} transition-colors`}
                              >
                                Change to months
                              </button>
                            )}
                            <button
                              onClick={async () => {
                                if (editNeverExpires) {
                                  const updatedCourses = courses.map(c => c.id === course.id ? { ...c, never_expires: true, expiry_months: 9999 } : c);
                                  setCourses(updatedCourses);
                                  await saveCourseChanges(course.id, { never_expires: true, expiry_months: 9999 }, true);
                                  await updateAllExpiriesForCourse(course.id, 9999, true);
                                } else {
                                  const months = parseInt(editHeaderValue) || 12;
                                  const updatedCourses = courses.map(c => c.id === course.id ? { ...c, never_expires: false, expiry_months: months } : c);
                                  setCourses(updatedCourses);
                                  await saveCourseChanges(course.id, { expiry_months: months, never_expires: false }, true);
                                  await updateAllExpiriesForCourse(course.id, months, false);
                                }
                                setEditingHeader(null);
                              }}
                              className={`text-xs px-2 py-1 rounded ${isDark ? 'bg-blue-700 hover:bg-blue-600' : 'bg-blue-500 hover:bg-blue-600'} text-white transition-colors`}
                            >
                              Save
                            </button>
                          </div>
                        ) : (
                          formatExpiryDisplay(course.expiry_months, course.never_expires)
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {staff.map((staffMember) => {
                    const isDivider = staffDividers.has(staffMember.id);

                    return (
                      <tr
                        key={staffMember.id}
                        draggable={true}
                        onDragStart={(e) => handleStaffDropStart(e, staffMember.id)}
                        onDragOver={handleStaffDragOver}
                        onDrop={(e) => handleStaffDropEnd(e, staffMember.id)}
                        className={`border-b transition-all duration-150 ${
                          isDivider
                            ? `${isDark ? 'bg-gray-900' : 'bg-gray-300'}`
                            : `${isDark ? 'border-gray-700 hover:bg-gray-750' : 'border-gray-200 hover:bg-gray-50'} ${draggedStaff === staffMember.id ? 'opacity-50' : 'opacity-100'} ${draggedStaff && draggedStaff !== staffMember.id ? 'cursor-move' : ''}`
                        }`}
                      >
                        <td
                          className={`px-4 py-2 font-medium sticky left-0 min-w-[200px] z-10 text-sm group ${
                            isDivider
                              ? `${isDark ? 'bg-gray-900 text-gray-400' : 'bg-gray-300 text-gray-600'} font-semibold`
                              : `${isDark ? 'bg-gray-600 text-white' : 'bg-gray-200 text-gray-900'}`
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            {!isDivider && (
                              <input
                                type="checkbox"
                                onChange={() => selectAllForStaff(staffMember.id)}
                                checked={courses.every(c => selectedCells.has(`${staffMember.id}|${c.id}`))}
                                className="w-4 h-4 cursor-pointer"
                                title="Select all courses for this staff member"
                              />
                            )}
                            <span className="text-sm flex-1">{staffMember.name}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteStaffMember(staffMember.id);
                              }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700 hover:bg-red-500/20 rounded p-1 text-base leading-none flex-shrink-0"
                              title={`Delete ${staffMember.name}`}
                            >
                              ✕
                            </button>
                          </div>
                        </td>
                        {courses.map((course) => {
                          if (isDivider) {
                            return (
                              <td
                                key={`${staffMember.id}|${course.id}`}
                                className={`px-4 py-3 ${isDark ? 'bg-gray-900' : 'bg-gray-300'}`}
                              />
                            );
                          }

                          const cellKey = `${staffMember.id}|${course.id}`;
                          const isSelected = selectedCells.has(cellKey);
                          const cell = matrixData[staffMember.id]?.[course.id];
                          const isEditing = editingCell?.staffId === staffMember.id && editingCell?.courseId === course.id;
                          const isOneOff = course.never_expires || course.expiry_months === 9999 || course.expiry_months === null;
                          const dateStatus = isOneOff ? 'no-expiry' : (cell?.expiry_date ? getDateStatus(cell.expiry_date) : 'no-expiry');
                          const dateColor = getDateColor(dateStatus);
                          const statusDisplay = getStatusDisplay(cell?.status);

                          return (
                            <td
                              key={`${staffMember.id}|${course.id}`}
                              className={`px-4 py-3 text-center transition-all duration-200 relative group ${
                                canEditMatrix ? 'cursor-pointer hover:opacity-75' : ''
                              } ${isSelected ? (isDark ? 'bg-blue-900/30' : 'bg-blue-100') : ''}`}
                              onClick={(e) => {
                                // Don't open edit modal if checkbox was clicked
                                if ((e.target as HTMLElement).tagName === 'INPUT') {
                                  return;
                                }
                                if (canEditMatrix && !isEditing) {
                                  setEditingCell({ staffId: staffMember.id, courseId: course.id });
                                  setEditDate(cell?.completion_date || '');
                                  const rawStatus = cell?.status as any;
                                  const normalizedStatus = rawStatus === 'booked' || rawStatus === 'awaiting' ? 'allocated' : rawStatus;
                                  setEditStatus(normalizedStatus || 'completed');
                                }
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  toggleCellSelection(staffMember.id, course.id);
                                }}
                                className="absolute top-2 left-2 w-4 h-4 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Select this cell for bulk operations"
                              />
                              {isEditing ? (
                                <span className={`p-2 rounded ${isDark ? 'bg-blue-900/30' : 'bg-blue-100'} text-blue-600 text-xs font-medium`}>
                                  Editing...
                                </span>
                              ) : cell?.status === 'allocated' || cell?.status === 'booked' || cell?.status === 'awaiting' ? (
                                <div className={`p-2 rounded ${statusDisplay.color}`}>
                                  <div className="font-semibold text-sm">Allocated</div>
                                  {cell?.expiry_date && (
                                    <div className="text-xs mt-1">
                                      Exp: {new Date(cell.expiry_date).toLocaleDateString('en-GB')}
                                    </div>
                                  )}
                                </div>
                              ) : cell?.status === 'not_yet_due' ? (
                                <div className={`p-2 rounded ${statusDisplay.color}`}>
                                  <div className="font-semibold text-sm">Not Yet Due</div>
                                </div>
                              ) : cell?.status === 'na' ? (
                                <div className={`p-2 rounded ${statusDisplay.color}`}>
                                  <div className="font-semibold text-sm">N/A</div>
                                </div>
                              ) : cell?.completion_date ? (
                                <div className={`p-2 rounded ${dateColor}`}>
                                  <div className="font-semibold">
                                    {new Date(cell.completion_date).toLocaleDateString('en-GB')}
                                  </div>
                                  {!isOneOff && cell.expiry_date && (
                                    <div className="text-xs mt-1">
                                      Exp: {new Date(cell.expiry_date).toLocaleDateString('en-GB')}
                                    </div>
                                  )}
                                  {isOneOff && (
                                    <div className="text-xs mt-1 font-medium">
                                      One-Off
                                    </div>
                                  )}
                                  {!isOneOff && !cell.expiry_date && (
                                    <div className="text-xs mt-1 font-medium">
                                      (No expiry)
                                    </div>
                                  )}
                                </div>
                              ) : cell?.expiry_date ? (
                                <div className={`p-2 rounded ${dateColor}`}>
                                  <div className="font-semibold text-sm">{statusDisplay.label}</div>
                                  <div className="text-xs mt-1">
                                    Exp: {new Date(cell.expiry_date).toLocaleDateString('en-GB')}
                                  </div>
                                </div>
                              ) : (
                                <div className={`text-gray-500 text-xs`}>—</div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modal - Rendered at top level */}
      {editingCell && (
        <div className={`fixed inset-0 flex items-center justify-center z-50 ${isDark ? 'bg-black/50' : 'bg-black/30'}`} onClick={() => {
          setEditingCell(null);
          setEditDate('');
          setEditStatus(null);
        }}>
          <div className={`rounded-lg p-6 shadow-2xl ${isDark ? 'bg-gray-800' : 'bg-white'} relative z-50 w-96`} onClick={(e) => e.stopPropagation()}>
            <h3 className={`text-lg font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>Update Training Record</h3>
            
            {/* Status Selection */}
            <div className="mb-4">
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Status</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setEditStatus('completed')}
                  className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                    editStatus === 'completed'
                      ? isDark ? 'bg-green-600 text-white' : 'bg-green-500 text-white'
                      : isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  In Date
                </button>
                <button
                  onClick={() => setEditStatus('allocated')}
                  className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                    editStatus === 'allocated'
                      ? isDark ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white'
                      : isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Allocated
                </button>
                <button
                  onClick={() => setEditStatus('not_yet_due')}
                  className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                    editStatus === 'not_yet_due'
                      ? isDark ? 'bg-purple-600 text-white' : 'bg-purple-500 text-white'
                      : isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Not Yet Due
                </button>
                <button
                  onClick={() => setEditStatus('na')}
                  className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                    editStatus === 'na'
                      ? isDark ? 'bg-gray-600 text-white' : 'bg-gray-400 text-white'
                      : isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  N/A
                </button>
              </div>
            </div>

            {/* Completion Date - Only show for "Completed" status */}
            {editStatus === 'completed' && (
              <div className="mb-4">
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Completion Date</label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className={`w-full px-3 py-2 rounded border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'} text-sm`}
                  autoFocus
                />
                <p className={`text-xs mt-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Expiry date will be calculated automatically</p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (editStatus === 'completed' && !editDate) {
                    alert('Please select a completion date for this training');
                    return;
                  }
                  if (!editStatus) {
                    alert('Please select a status');
                    return;
                  }
                  const staffMember = staff.find(s => s.id === editingCell.staffId);
                  const course = courses.find(c => c.id === editingCell.courseId);
                  const cell = matrixData[editingCell.staffId]?.[editingCell.courseId];
                  if (staffMember && course) {
                    handleSaveTraining(staffMember.id, course.id, cell?.training_id || null, editStatus === 'completed' ? editDate : null, editStatus);
                  }
                }}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors duration-150 font-medium text-sm"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setEditingCell(null);
                  setEditDate('');
                  setEditStatus(null);
                }}
                className="flex-1 px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors duration-150 font-medium text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Edit Modal */}
      {bulkEditMode && (
        <div className={`fixed inset-0 flex items-center justify-center z-50 ${isDark ? 'bg-black/50' : 'bg-black/30'}`} onClick={() => setBulkEditMode(false)}>
          <div className={`rounded-lg p-6 shadow-2xl ${isDark ? 'bg-gray-800' : 'bg-white'} relative z-50 w-96`} onClick={(e) => e.stopPropagation()}>
            <h3 className={`text-lg font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Bulk Update ({selectedCells.size} cells)
            </h3>
            
            {/* Status Selection */}
            <div className="mb-4">
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Status</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setBulkEditStatus('completed')}
                  className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                    bulkEditStatus === 'completed'
                      ? isDark ? 'bg-green-600 text-white' : 'bg-green-500 text-white'
                      : isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  In Date
                </button>
                <button
                  onClick={() => setBulkEditStatus('allocated')}
                  className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                    bulkEditStatus === 'allocated'
                      ? isDark ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white'
                      : isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Allocated
                </button>
                <button
                  onClick={() => setBulkEditStatus('not_yet_due')}
                  className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                    bulkEditStatus === 'not_yet_due'
                      ? isDark ? 'bg-purple-600 text-white' : 'bg-purple-500 text-white'
                      : isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Not Yet Due
                </button>
                <button
                  onClick={() => setBulkEditStatus('na')}
                  className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                    bulkEditStatus === 'na'
                      ? isDark ? 'bg-gray-600 text-white' : 'bg-gray-400 text-white'
                      : isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  N/A
                </button>
              </div>
            </div>

            {/* Completion Date - Only show for "Completed" status */}
            {bulkEditStatus === 'completed' && (
              <div className="mb-4">
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Completion Date</label>
                <input
                  type="date"
                  value={bulkEditDate}
                  onChange={(e) => setBulkEditDate(e.target.value)}
                  className={`w-full px-3 py-2 rounded border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'} text-sm`}
                />
                <p className={`text-xs mt-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Expiry date will be calculated automatically</p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => {
                  console.log('🖱️ Apply button clicked, calling applyBulkUpdate');
                  applyBulkUpdate();
                }}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors duration-150 font-medium text-sm"
              >
                Apply to {selectedCells.size} Cells
              </button>
              <button
                onClick={() => {
                  setBulkEditMode(false);
                  setBulkEditStatus(null);
                  setBulkEditDate('');
                }}
                className="flex-1 px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors duration-150 font-medium text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  async function updateAllExpiriesForCourse(courseId: string, newExpiryMonths: number, neverExpires: boolean = false) {
    try {
      // Get all training records for this course that have completion dates - WITH PAGINATION
      let allTrainings: any[] = [];
      let pageNum = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: trainingPage, error: pageError } = await supabase
          .from('staff_training_matrix')
          .select('id, completion_date')
          .eq('course_id', courseId)
          .not('completion_date', 'is', null)
          .range(pageNum * pageSize, (pageNum + 1) * pageSize - 1);

        if (pageError) throw pageError;

        if (!trainingPage || trainingPage.length === 0) {
          hasMore = false;
        } else {
          allTrainings = allTrainings.concat(trainingPage);
          pageNum++;
          if (trainingPage.length < pageSize) {
            hasMore = false;
          }
        }
      }

      debugLog(`Updating ${allTrainings.length} training records for course ${courseId}`);

      if (allTrainings && allTrainings.length > 0) {
        // Update each training record with new expiry date
        const updates = allTrainings.map(training => {
          let expiryDateString: string | null = null;
          
          if (!neverExpires) {
            const completionDate = new Date(training.completion_date);
            const expiryDate = new Date(completionDate);
            expiryDate.setMonth(expiryDate.getMonth() + newExpiryMonths);
            expiryDateString = expiryDate.toISOString().split('T')[0];
          }

          return supabase
            .from('staff_training_matrix')
            .update({ expiry_date: expiryDateString })
            .eq('id', training.id);
        });

        await Promise.all(updates);
      }
      // Fetch updated data after updates complete
      await fetchMatrixData();
    } catch (error) {
      console.error('Error updating expiry dates:', error);
      alert('Error updating expiry dates');
    }
  }

  async function handleSaveTraining(staffId: string, courseId: string, trainingId: string | null, completionDate: string | null = null, status: 'completed' | 'allocated' | 'not_yet_due' | 'na' = 'completed') {
    try {
      // Verify selectedLocation is set - if not, this will cause the record to not appear on refresh
      if (!selectedLocation || selectedLocation.trim() === '') {
        alert('Please select a location before saving training records');
        return;
      }

      // Find the course to get expiry_months and never_expires
      const course = courses.find(c => c.id === courseId);
      const expiryMonths = course?.expiry_months || 12;
      const neverExpires = course?.never_expires || false;

      const existingCell = matrixData[staffId]?.[courseId];
      let effectiveCompletionDate = completionDate;

      // Calculate expiry date only if completed with a date
      let expiryDateString: string | null = null;
      if (status === 'completed' && completionDate && !neverExpires) {
        const compDate = new Date(completionDate);
        const expiryDate = new Date(compDate);
        expiryDate.setMonth(expiryDate.getMonth() + expiryMonths);
        expiryDateString = expiryDate.toISOString().split('T')[0]; // YYYY-MM-DD
      } else if (status === 'allocated') {
        // Preserve existing expiry when switching to allocated
        if (existingCell?.expiry_date) {
          expiryDateString = existingCell.expiry_date;
        } else if (existingCell?.completion_date && !neverExpires) {
          // Calculate expiry from completion date if not already stored
          const compDate = new Date(existingCell.completion_date);
          const expiryDate = new Date(compDate);
          expiryDate.setMonth(expiryDate.getMonth() + expiryMonths);
          expiryDateString = expiryDate.toISOString().split('T')[0];
        }
        if (!effectiveCompletionDate && existingCell?.completion_date) {
          effectiveCompletionDate = existingCell.completion_date;
        }
      }

      debugLog('Saving training:', {
        staffId,
        courseId,
        trainingId,
        completion_date: completionDate,
        expiry_date: expiryDateString,
        status: status,
        completed_at_location_id: selectedLocation,
      });

      // Use upsert to handle both insert and update cases
      // Important: Do NOT include 'id' field - let database auto-generate for new records
      const upsertData: any = {
        staff_id: staffId,
        course_id: courseId,
        completion_date: effectiveCompletionDate || null,
        expiry_date: expiryDateString,
        completed_at_location_id: selectedLocation,
        status: status,
        updated_at: new Date().toISOString(),
      };

      let { data, error } = await supabase
        .from('staff_training_matrix')
        .upsert(upsertData, { onConflict: 'staff_id,course_id,completed_at_location_id' })
        .select();

      // Support deployments that still use the older two-column unique key.
      if (error?.code === '42P10') {
        const fallback = await supabase
          .from('staff_training_matrix')
          .upsert(upsertData, { onConflict: 'staff_id,course_id' })
          .select();
        data = fallback.data;
        error = fallback.error;
      }

      debugLog('Upsert response:', { data, error });

      if (error) {
        console.error('Save error:', error);
        alert(`Error saving training: ${error.message}`);
        return;
      }
      
      if (!data || data.length === 0) {
        console.error('No data returned from upsert');
        alert('Error: Record was not saved. Please try again.');
        return;
      }

      // Verify the record was actually saved by fetching it directly
      const savedRecordId = data[0].id;
      const { data: verifyData, error: verifyError } = await supabase
        .from('staff_training_matrix')
        .select('*')
        .eq('id', savedRecordId);
      
      debugLog('Verification fetch for record', savedRecordId, ':', verifyData);
      
      debugLog('Upsert saved record:', {
        id: data[0].id,
        staff_id: data[0].staff_id,
        course_id: data[0].course_id,
        completed_at_location_id: data[0].completed_at_location_id,
      });
      debugLog('Save successful:', data);

      // Immediately update the matrix with the newly saved record
      // This ensures it appears even if the database fetch doesn't include it yet
      if (data && data.length > 0) {
        const savedRecord = data[0];
        const updatedMatrix = { ...matrixData };
        if (!updatedMatrix[staffId]) {
          updatedMatrix[staffId] = {};
        }
        updatedMatrix[staffId][courseId] = {
          completion_date: savedRecord.completion_date,
          expiry_date: savedRecord.expiry_date,
          training_id: savedRecord.id,
          status: savedRecord.status,
        };
        setMatrixData(updatedMatrix);
        debugLog('Matrix updated with new record immediately');
      }

      setEditingCell(null);
      alert('Training record saved successfully!');
    } catch (error) {
      console.error('Error saving training:', error);
      alert(`Error saving training record: ${error}`);
    }
  }
}
