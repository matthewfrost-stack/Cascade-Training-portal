'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import UniformButton from './UniformButton';

// Import the useMatrixHeaders hook (already defined at the bottom of this file)
import { supabase } from '@/lib/supabase';

interface CourseData {
  name: string;
  course: string;
  expiry: string;
  expiryTime?: number;
  location: string;
  delivery: string;
  allocatedTrainingDate?: boolean;
  isOneOff?: boolean;
  expiredSince?: string;
}

interface MatrixHeaderData {
  headers: string[];
  atlasCourses: string[];
}

function canonicalCourseName(name: string): string {
  return name.replace(/\s+\(Careskills\)\s*$/i, '').replace(/\s+/g, ' ').trim();
}

function isCareskillsCourse(name: string): boolean {
  return /\(careskills\)/i.test(name);
}

function dedupeRows(rows: CourseData[]): CourseData[] {
  const byKey = new Map<string, CourseData>();

  for (const row of rows) {
    const expiryKey = row.allocatedTrainingDate ? '-' : (row.expiry || '-');
    const key = `${row.name}||${row.location}||${expiryKey}||${canonicalCourseName(row.course).toLowerCase()}`;
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, row);
      continue;
    }

    // Prefer non-Careskills display name when both exist.
    if (isCareskillsCourse(existing.course) && !isCareskillsCourse(row.course)) {
      byKey.set(key, row);
    }
  }

  return Array.from(byKey.values());
}

export default function CourseExpiryChecker({ isDark }: { isDark: boolean }) {
  const router = useRouter();
  const [allData, setAllData] = useState<CourseData[]>([]);
  const [filteredData, setFilteredData] = useState<CourseData[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('Ready to search');
  const [activeTab, setActiveTab] = useState<'expiring' | 'allocated' | 'expired'>('expiring');
  
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [user, setUser] = useState<any>(null);
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [locations, setLocations] = useState<Array<{ id: string; name: string }>>([]);
  const selectedLocationName = selectedLocations.length === 1
    ? (locations.find(loc => loc.id === selectedLocations[0])?.name || '')
    : '';
  // Get matrix headers + atlas course mapping for the selected location
  const matrixHeaderData = useMatrixHeaders(selectedLocationName);

  // Filters
  const [filters, setFilters] = useState({
    name: '',
    course: '',
    location: '',
    delivery: '',
  });

  // Filter options
  const [filterOptions, setFilterOptions] = useState({
    names: [] as string[],
    courses: [] as string[],
    locations: [] as string[],
    deliveries: [] as string[],
  });

  useEffect(() => {
    checkAuth();
    initializeDates();
    fetchLocations();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [allData, filters]);

  useEffect(() => {
    if (locations.length === 0) return;
    const locationIds = new Set(locations.map(loc => loc.id));
    setSelectedLocations(prev => {
      const filtered = prev.filter(id => locationIds.has(id));
      if (filtered.length === 0) {
        return locations.map(loc => loc.id);
      }
      return filtered;
    });
  }, [locations]);

  useEffect(() => {
    const handleClickOutside = () => setShowLocationDropdown(false);
    if (showLocationDropdown) {
      window.addEventListener('click', handleClickOutside);
    }
    return () => window.removeEventListener('click', handleClickOutside);
  }, [showLocationDropdown]);

  const checkAuth = async (): Promise<void> => {
    try {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) {
        return;
      }

      setUser(authUser);
    } catch (error) {
      console.error('Auth error:', error);
    }
  }

  async function fetchLocations() {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const response = await fetch('/api/locations/user-locations', {
        credentials: 'include',
        headers,
      });

      if (!response.ok) {
        console.warn('Failed to fetch scoped locations:', response.status);
        return;
      }

      const payload = await response.json();
      const scopedLocations = Array.isArray(payload.locations) ? payload.locations : [];
      setLocations(scopedLocations);
    } catch (error) {
      console.error('Error in fetchLocations:', error);
    }
  }

  function formatDate(dateString: string | null): string {
    if (!dateString || dateString === '-') return '-';
    try {
      const date = new Date(dateString);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}-${month}-${year}`;
    } catch {
      return dateString;
    }
  }

  function categorizeDeliveryType(courseName: string, deliveryType?: string): 'Atlas' | 'Online' | 'Face to Face' {
    const courseNameLower = courseName.toLowerCase();
    const deliveryLower = (deliveryType || '').toLowerCase();
    const isAtlasFromMatrixHeader = matrixHeaderData.atlasCourses.some(
      atlasCourse => atlasCourse.trim().toLowerCase() === courseNameLower.trim()
    );

    // If this course is under a Careskills header in the matrix, treat as Atlas.
    if (isAtlasFromMatrixHeader) {
      return 'Atlas';
    }

    // Careskills courses are Atlas (check delivery_type first, as it's the primary source)
    if (deliveryLower.includes('careskills')) {
      return 'Atlas';
    }

    // Check both course name and delivery type for Online
    if (courseNameLower.includes('online') || deliveryLower.includes('online')) {
      return 'Online';
    }

    // Everything else is Face to Face (includes Face to Face, Classroom, Internal, Accredited, Workshop, etc.)
    return 'Face to Face';
  }

  function initializeDates() {
    const today = new Date();
    const nextMonth = new Date();
    nextMonth.setDate(today.getDate() + 30);

    const formatDate = (date: Date) => date.toISOString().split('T')[0];

    setStartDate(formatDate(today));
    setEndDate(formatDate(nextMonth));
  }

  async function getAuthHeaders(): Promise<Record<string, string>> {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }

  function buildFilterOptions(data: CourseData[]) {
    const normalizedCourseOptions = [...new Set(data.map(d => canonicalCourseName(d.course)))].sort();

    // Categorize all delivery types to only show Atlas, Online, Face to Face
    const categorizedDeliveries = new Set(
      data.map(d => categorizeDeliveryType(d.course, d.delivery))
    );
    
    setFilterOptions({
      names: [...new Set(data.map(d => d.name))].sort(),
      courses: normalizedCourseOptions,
      locations: [...new Set(data.map(d => d.location))].sort(),
      deliveries: (['Atlas', 'Online', 'Face to Face'] as const).filter(type => categorizedDeliveries.has(type)),
    });
  }

  function toggleLocation(id: string) {
    setSelectedLocations(prev => (
      prev.includes(id) ? prev.filter(locId => locId !== id) : [...prev, id]
    ));
  }

  function toggleAllLocations(checked: boolean) {
    setSelectedLocations(checked ? locations.map(loc => loc.id) : []);
  }

  function locationLabel(): string {
    if (selectedLocations.length === 0 || selectedLocations.length === locations.length) {
      return 'All Locations';
    }
    if (selectedLocations.length === 1) {
      return locations.find(loc => loc.id === selectedLocations[0])?.name || '1 Location';
    }
    return `${selectedLocations.length} locations selected`;
  }

  async function fetchExpiringCourses() {
    if (!startDate || !endDate) {
      setStatus('Please select both dates');
      return;
    }

    setLoading(true);
    setStatus('Fetching expiring courses...');
    setActiveTab('expiring');

    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
      });
      if (selectedLocations.length > 0 && selectedLocations.length !== locations.length) {
        params.append('locationFilter', selectedLocations.join(','));
      }

      const response = await fetch(`/api/courses/expiring?${params.toString()}`, {
        headers: await getAuthHeaders(),
        credentials: 'include',
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result?.error || 'Failed to fetch courses');
      }

      const data: CourseData[] = await response.json();
      const dedupedData = dedupeRows(data).map(row => ({ ...row, course: canonicalCourseName(row.course) }));

      setAllData(dedupedData);
      buildFilterOptions(dedupedData);
      setStatus(`Found ${dedupedData.length} expiring courses`);
    } catch (error: any) {
      console.error('Error fetching courses:', error);
      setStatus(error?.message || 'Error loading courses. Please check your Google Sheets connection.');
    } finally {
      setLoading(false);
    }
  }

  async function fetchAllocatedTraining() {
    setLoading(true);
    setStatus('Fetching courses allocated for training...');
    setActiveTab('allocated');

    try {
      const params = new URLSearchParams();
      if (selectedLocations.length > 0 && selectedLocations.length !== locations.length) {
        params.append('locationFilter', selectedLocations.join(','));
      }

      const url = `/api/courses/allocated-training${params.toString() ? '?' + params.toString() : ''}`;
      const response = await fetch(url, {
        headers: await getAuthHeaders(),
        credentials: 'include',
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result?.error || 'Failed to fetch courses');
      }

      const data: CourseData[] = await response.json();
      const dedupedData = dedupeRows(data).map(row => ({ ...row, course: canonicalCourseName(row.course) }));

      setAllData(dedupedData);
      buildFilterOptions(dedupedData);
      setStatus(`Found ${dedupedData.length} courses allocated for training`);
    } catch (error: any) {
      console.error('Error fetching courses:', error);
      setStatus(error?.message || 'Error loading courses. Please check your Google Sheets connection.');
    } finally {
      setLoading(false);
    }
  }

  async function fetchExpiredCourses() {
    setLoading(true);
    setStatus('Fetching expired courses...');
    setActiveTab('expired');

    try {
      const params = new URLSearchParams();
      if (selectedLocations.length > 0 && selectedLocations.length !== locations.length) {
        params.append('locationFilter', selectedLocations.join(','));
      }

      const url = `/api/courses/expired${params.toString() ? '?' + params.toString() : ''}`;
      const response = await fetch(url, {
        headers: await getAuthHeaders(),
        credentials: 'include',
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result?.error || 'Failed to fetch courses');
      }

      const data: CourseData[] = await response.json();
      const dedupedData = dedupeRows(data).map(row => ({ ...row, course: canonicalCourseName(row.course) }));

      setAllData(dedupedData);
      buildFilterOptions(dedupedData);
      setStatus(`Found ${dedupedData.length} expired courses`);
    } catch (error: any) {
      console.error('Error fetching courses:', error);
      setStatus(error?.message || 'Error loading courses. Please check your Google Sheets connection.');
    } finally {
      setLoading(false);
    }
  }

  function applyFilters() {
    let filtered = [...allData];

    if (filters.name) {
      filtered = filtered.filter(d => d.name === filters.name);
    }
    if (filters.course) {
      filtered = filtered.filter(d => canonicalCourseName(d.course) === filters.course);
    }
    if (filters.location) {
      filtered = filtered.filter(d => d.location === filters.location);
    }
    if (filters.delivery) {
      // Filter by categorized delivery type (Atlas, Online, Face to Face)
      filtered = filtered.filter(d => categorizeDeliveryType(d.course, d.delivery) === filters.delivery);
    }

    // Sort expiring/expired courses by expiry date (nearest/oldest first)
    if ((activeTab === 'expiring' || isExpiredView) && filtered.length > 0) {
      filtered = filtered.sort((a, b) => {
        const dateA = new Date(a.expiry || '');
        const dateB = new Date(b.expiry || '');
        return dateA.getTime() - dateB.getTime();
      });
    }

    setFilteredData(filtered);
  }

  const isExpiredView = allData.length > 0 && allData[0].expiredSince !== undefined;

  return (
    <div className={`min-h-screen transition-colors duration-500 ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
      {/* Header */}
      <div className={`border-b transition-colors duration-300 ${isDark ? 'border-gray-800 bg-gray-800' : 'border-gray-200 bg-white'}`}>
        <div className="px-4 sm:px-6 lg:px-8 py-10 max-w-7xl mx-auto text-center">
          <h1 className={`text-4xl font-bold transition-colors duration-300 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Course Expiry Checker
          </h1>
          <p className={`mt-3 text-lg transition-colors duration-300 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            Track staff training certifications and expiry dates
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 sm:px-6 lg:px-8 py-10 max-w-7xl mx-auto">
        {/* Search Controls */}
        <div className={`rounded-lg border p-8 mb-8 transition-colors duration-300 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <div className="flex flex-col sm:flex-row gap-4 mb-8 justify-center">
            <div>
              <label className={`block text-sm font-medium mb-2 transition-colors duration-300 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className={`px-3 py-2 text-sm rounded border w-40 transition-colors duration-300 ${
                  isDark
                    ? 'bg-gray-700 border-gray-600 text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                    : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                }`}
              />
            </div>
            <div>
              <label className={`block text-sm font-medium mb-2 transition-colors duration-300 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className={`px-3 py-2 text-sm rounded border w-40 transition-colors duration-300 ${
                  isDark
                    ? 'bg-gray-700 border-gray-600 text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                    : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                }`}
              />
            </div>
            <div>
              <label className={`block text-sm font-medium mb-2 transition-colors duration-300 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                Locations (Optional)
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowLocationDropdown(!showLocationDropdown);
                  }}
                  className={`px-3 py-2 text-sm rounded border w-56 text-left transition-colors duration-300 ${
                    isDark
                      ? 'bg-gray-700 border-gray-600 text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                      : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                  }`}
                >
                  {locationLabel()}
                </button>
                {showLocationDropdown && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className={`absolute z-20 mt-2 w-64 max-h-64 overflow-y-auto rounded-lg border shadow-lg ${
                    isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                  }`}
                  >
                    <label className={`flex items-center gap-2 px-3 py-2 text-sm font-semibold border-b ${
                      isDark ? 'border-gray-700 text-gray-200' : 'border-gray-200 text-gray-700'
                    }`}>
                      <input
                        type="checkbox"
                        checked={selectedLocations.length === 0 || selectedLocations.length === locations.length}
                        onChange={(e) => toggleAllLocations(e.target.checked)}
                      />
                      All Locations
                    </label>
                    {locations.map(loc => (
                      <label
                        key={loc.id}
                        className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer ${
                          isDark ? 'text-gray-200 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedLocations.includes(loc.id)}
                          onChange={() => toggleLocation(loc.id)}
                        />
                        {loc.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <UniformButton
              variant="primary"
              className="px-6 py-3"
              onClick={fetchExpiringCourses}
              disabled={loading}
            >
              🔍 Search Expiring
            </UniformButton>
            <UniformButton
              variant="primary"
              className="px-6 py-3 bg-yellow-500 hover:bg-yellow-600 active:bg-yellow-700 dark:bg-yellow-500 dark:hover:bg-yellow-600 dark:active:bg-yellow-700 text-slate-900"
              onClick={fetchAllocatedTraining}
              disabled={loading}
            >
              ⏳ Allocated Training
            </UniformButton>
            <UniformButton
              variant="danger"
              className="px-6 py-3"
              onClick={fetchExpiredCourses}
              disabled={loading}
            >
              ⚠️ Expired Courses
            </UniformButton>
            <UniformButton
              variant="secondary"
              className="px-6 py-3"
              onClick={() => router.push('/apps/training-course-checker')}
            >
              🧭 Course Breakdown
            </UniformButton>
          </div>
        </div>

        {/* Status */}
        <div className={`mb-6 text-center text-sm font-medium transition-colors duration-300 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
          {status}
        </div>

        {loading && (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className={`mt-2 transition-colors duration-300 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Loading...</p>
          </div>
        )}

        {/* Filters */}
        {allData.length > 0 && (
          <div className={`rounded-lg border p-8 mb-8 transition-colors duration-300 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <h3 className={`font-semibold text-lg mb-6 text-center transition-colors duration-300 ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>
              Filter Results
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <select
                value={filters.name}
                onChange={e => setFilters({ ...filters, name: e.target.value })}
                className={`px-4 py-3 rounded-lg border transition-colors duration-300 ${
                  isDark
                    ? 'bg-gray-700 border-gray-600 text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                    : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                }`}
              >
                <option value="">All Staff</option>
                {filterOptions.names.map(name => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>

              <select
                value={filters.course}
                onChange={e => setFilters({ ...filters, course: e.target.value })}
                className={`px-4 py-3 rounded-lg border transition-colors duration-300 ${
                  isDark
                    ? 'bg-gray-700 border-gray-600 text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                    : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                }`}
              >
                <option value="">All Courses</option>
                {filterOptions.courses.map(course => (
                  <option key={course} value={course}>
                    {course}
                  </option>
                ))}
              </select>

              <select
                value={filters.location}
                onChange={e => setFilters({ ...filters, location: e.target.value })}
                className={`px-4 py-3 rounded-lg border transition-colors duration-300 ${
                  isDark
                    ? 'bg-gray-700 border-gray-600 text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                    : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                }`}
              >
                <option value="">All Locations</option>
                {filterOptions.locations.map(location => (
                  <option key={location} value={location}>
                    {location}
                  </option>
                ))}
              </select>

              <select
                value={filters.delivery}
                onChange={e => setFilters({ ...filters, delivery: e.target.value })}
                className={`px-4 py-3 rounded-lg border transition-colors duration-300 ${
                  isDark
                    ? 'bg-gray-700 border-gray-600 text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                    : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                }`}
              >
                <option value="">All Delivery Types</option>
                {filterOptions.deliveries.map(delivery => (
                  <option key={delivery} value={delivery}>
                    {delivery}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Results Table */}
        {allData.length > 0 && (
          <div className={`rounded-lg border overflow-hidden shadow-lg transition-colors duration-300 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <div className={`px-6 py-4 border-b text-center font-medium transition-colors duration-300 ${isDark ? 'border-gray-700 bg-gray-750 text-gray-300' : 'border-gray-200 bg-gray-50 text-gray-600'}`}>
              Displaying {filteredData.length} records
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className={`transition-colors duration-300 ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                  <tr>
                    <th className={`px-8 py-6 text-center font-semibold transition-colors duration-300 ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>Staff Name</th>
                    <th className={`px-8 py-6 text-center font-semibold transition-colors duration-300 ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>Course</th>
                    <th className={`px-8 py-6 text-center font-semibold transition-colors duration-300 ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>{isExpiredView ? 'Expired' : 'Expiry Date'}</th>
                    <th className={`px-8 py-6 text-center font-semibold transition-colors duration-300 ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>Location</th>
                    <th className={`px-8 py-6 text-center font-semibold transition-colors duration-300 ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>Delivery</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.length > 0 ? (
                    filteredData.map((row, idx) => (
                      <tr
                        key={idx}
                        className={`border-t transition-colors duration-300 ${isDark ? 'border-gray-700 hover:bg-gray-700' : 'border-gray-200 hover:bg-gray-50'}`}
                      >
                        <td className={`px-8 py-6 text-center whitespace-nowrap transition-colors duration-300 ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>{row.name}</td>
                        <td className={`px-8 py-6 text-center whitespace-nowrap transition-colors duration-300 ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>{row.course}</td>
                        <td className={`px-8 py-6 text-center whitespace-nowrap font-semibold ${
                          isExpiredView
                            ? `transition-colors duration-300 ${isDark ? 'text-red-400' : 'text-red-600'}`
                            : `transition-colors duration-300 ${isDark ? 'text-gray-200' : 'text-gray-900'}`
                        }`}>
                          {isExpiredView ? row.expiredSince : formatDate(row.expiry)}
                        </td>
                        <td className={`px-8 py-6 text-center whitespace-nowrap transition-colors duration-300 ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>{row.location}</td>
                        <td className={`px-8 py-6 text-center whitespace-nowrap transition-colors duration-300 ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>{categorizeDeliveryType(row.course, row.delivery)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className={`px-8 py-6 text-center transition-colors duration-300 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>No data available</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {allData.length === 0 && !loading && (
          <div className={`text-center py-16 rounded-lg border transition-colors duration-300 ${isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'}`}>
            <p className={`text-lg transition-colors duration-300 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              No data yet. Use the search buttons above to get started.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

import { useCallback } from 'react';

function useMatrixHeaders(location: string) {
  const [headerData, setHeaderData] = useState<MatrixHeaderData>({ headers: ['Face to Face'], atlasCourses: [] });

  const fetchHeaders = useCallback(async () => {
    try {
      const endpoint = location
        ? `/api/matrix-headers?location=${encodeURIComponent(location)}`
        : '/api/matrix-headers';
      const res = await fetch(endpoint);
      const data = await res.json();
      setHeaderData({
        headers: data.headers || ['Face to Face'],
        atlasCourses: data.atlasCourses || [],
      });
    } catch {
      setHeaderData({ headers: ['Face to Face'], atlasCourses: [] });
    }
  }, [location]);

  useEffect(() => {
    fetchHeaders();
  }, [fetchHeaders]);

  return headerData;
}
