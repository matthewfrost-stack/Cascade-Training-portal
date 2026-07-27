'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import UniformButton from './UniformButton';
import BackButton from '@/app/components/BackButton';
import { supabase } from '@/lib/supabase';
import { ClockIcon, ExclamationCircleIcon, CalendarIcon } from '@/app/components/icons';
import { HoverPopoverCard, RecordDetailModal, DisplayRecordItem } from './RecordHoverPopoverModal';

interface CourseRecord {
  name: string;
  course: string;
  expiry: string;
  location: string;
  delivery: string;
  allocatedTrainingDate?: boolean;
  expiredSince?: string;
}

interface Counts {
  within3: number;
  within6: number;
  within9: number;
  within12: number;
  allocated: number;
  expired: number;
}

interface CourseStats {
  courseKey: string;
  courseName: string;
  totals: Counts;
  locations: Record<string, Counts>;
  records: DisplayRecordItem[];
}

function emptyCounts(): Counts {
  return {
    within3: 0,
    within6: 0,
    within9: 0,
    within12: 0,
    allocated: 0,
    expired: 0,
  };
}

function canonicalCourseName(name: string): string {
  return name.replace(/\s+\(Careskills\)\s*$/i, '').replace(/\s+/g, ' ').trim();
}

function isCareskillsCourse(name: string): boolean {
  return /\(careskills\)/i.test(name);
}

function dedupeRows(rows: CourseRecord[]): CourseRecord[] {
  const byKey = new Map<string, CourseRecord>();

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

function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const targetMonth = d.getMonth() + months;
  d.setMonth(targetMonth);

  // Handle month rollover for dates like Jan 31.
  if (d.getMonth() !== ((targetMonth % 12) + 12) % 12) {
    d.setDate(0);
  }

  return d;
}

function categorizeDeliveryType(courseName: string, deliveryType: string | undefined, atlasList: string[]): 'Atlas' | 'Online' | 'Face to Face' {
  const courseNameLower = courseName.toLowerCase();
  const deliveryLower = (deliveryType || '').toLowerCase();
  const normalized = canonicalCourseName(courseName).toLowerCase();

  if (isCareskillsCourse(courseName)) return 'Atlas';
  if (atlasList.includes(normalized)) return 'Atlas';
  if (courseNameLower.includes('online') || deliveryLower.includes('online')) return 'Online';

  return 'Face to Face';
}

function applyBucket(counts: Counts, bucket: keyof Counts) {
  counts[bucket] += 1;
}

function applyExpiryBuckets(counts: Counts, expiryDate: Date, thresholds: Date[]) {
  const [in3, in6, in9, in12] = thresholds;
  if (expiryDate <= in3) {
    applyBucket(counts, 'within3');
    applyBucket(counts, 'within6');
    applyBucket(counts, 'within9');
    applyBucket(counts, 'within12');
  } else if (expiryDate <= in6) {
    applyBucket(counts, 'within6');
    applyBucket(counts, 'within9');
    applyBucket(counts, 'within12');
  } else if (expiryDate <= in9) {
    applyBucket(counts, 'within9');
    applyBucket(counts, 'within12');
  } else if (expiryDate <= in12) {
    applyBucket(counts, 'within12');
  }
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export default function TrainingCourseChecker({ isDark }: { isDark: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('Ready to load course breakdown');
  const [courseStats, setCourseStats] = useState<CourseStats[]>([]);
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null);
  const [atlasCourses, setAtlasCourses] = useState<string[]>([]);
  const [minDemand, setMinDemand] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [expiringWindow, setExpiringWindow] = useState<3 | 6 | 12>(3);
  const [sortKey, setSortKey] = useState<'course' | 'total' | 'expiring' | 'expired' | 'allocated'>('total');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    const loadAtlasCourses = async () => {
      try {
        const res = await fetch('/api/matrix-headers');
        const data = await res.json();
        const list = Array.isArray(data?.atlasCourses) ? data.atlasCourses : [];
        setAtlasCourses(
          list.map((name: string) => canonicalCourseName(name).toLowerCase())
        );
      } catch (error) {
        console.error('Failed to load Atlas courses:', error);
      }
    };

    loadAtlasCourses();
  }, []);

  useEffect(() => {
    if (hasLoaded) return;
    setHasLoaded(true);
    fetchBreakdown();
  }, [hasLoaded]);

  async function ensureAtlasCourses(): Promise<string[]> {
    if (atlasCourses.length > 0) return atlasCourses;
    try {
      const res = await fetch('/api/matrix-headers');
      const data = await res.json();
      const list = Array.isArray(data?.atlasCourses) ? data.atlasCourses : [];
      const normalized = list.map((name: string) => canonicalCourseName(name).toLowerCase());
      setAtlasCourses(normalized);
      return normalized;
    } catch (error) {
      console.error('Failed to load Atlas courses:', error);
      return [];
    }
  }

  async function fetchBreakdown() {
    setLoading(true);
    setStatus('Loading course breakdown...');

    try {
      const atlasList = await ensureAtlasCourses();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const startDate = today.toISOString().split('T')[0];
      const endDate = addMonths(today, 12).toISOString().split('T')[0];

      const [expiringRes, allocatedRes, expiredRes] = await Promise.all([
        fetch(`/api/courses/expiring?startDate=${startDate}&endDate=${endDate}`, {
          headers: await getAuthHeaders(),
        }),
        fetch('/api/courses/allocated-training', {
          headers: await getAuthHeaders(),
        }),
        fetch('/api/courses/expired', {
          headers: await getAuthHeaders(),
        }),
      ]);

      if (!expiringRes.ok) {
        const result = await expiringRes.json().catch(() => ({}));
        throw new Error(result?.error || 'Failed to fetch expiring courses');
      }
      if (!allocatedRes.ok) {
        const result = await allocatedRes.json().catch(() => ({}));
        throw new Error(result?.error || 'Failed to fetch allocated training courses');
      }
      if (!expiredRes.ok) {
        const result = await expiredRes.json().catch(() => ({}));
        throw new Error(result?.error || 'Failed to fetch expired courses');
      }

      const expiringData = dedupeRows(await expiringRes.json());
      const allocatedData = dedupeRows(await allocatedRes.json());
      const expiredData = dedupeRows(await expiredRes.json());

      const thresholds = [
        addMonths(today, 3),
        addMonths(today, 6),
        addMonths(today, 9),
        addMonths(today, 12),
      ];

      const statsMap = new Map<string, CourseStats>();

      function ensureCourse(courseName: string): CourseStats {
        const courseKey = canonicalCourseName(courseName).toLowerCase();
        const existing = statsMap.get(courseKey);
        if (existing) return existing;

        const stats: CourseStats = {
          courseKey,
          courseName: canonicalCourseName(courseName),
          totals: emptyCounts(),
          locations: {},
          records: [],
        };
        statsMap.set(courseKey, stats);
        return stats;
      }

      function ensureLocation(stats: CourseStats, location: string): Counts {
        if (!stats.locations[location]) {
          stats.locations[location] = emptyCounts();
        }
        return stats.locations[location];
      }

      for (const record of expiringData) {
        if (categorizeDeliveryType(record.course || 'Unknown Course', record.delivery, atlasList) !== 'Face to Face') continue;
        const stats = ensureCourse(record.course || 'Unknown Course');
        const location = record.location || 'Unknown Location';
        const expiryDate = new Date(record.expiry);
        if (Number.isNaN(expiryDate.getTime())) continue;

        applyExpiryBuckets(stats.totals, expiryDate, thresholds);
        const locationCounts = ensureLocation(stats, location);
        applyExpiryBuckets(locationCounts, expiryDate, thresholds);

        stats.records.push({
          staffName: record.name || 'Unknown Staff',
          courseName: canonicalCourseName(record.course || 'Unknown Course'),
          location,
          date: record.expiry,
          type: 'expiring',
        });
      }

      for (const record of allocatedData) {
        if (categorizeDeliveryType(record.course || 'Unknown Course', record.delivery, atlasList) !== 'Face to Face') continue;
        const stats = ensureCourse(record.course || 'Unknown Course');
        const location = record.location || 'Unknown Location';
        stats.totals.allocated += 1;
        const locationCounts = ensureLocation(stats, location);
        locationCounts.allocated += 1;

        stats.records.push({
          staffName: record.name || 'Unknown Staff',
          courseName: canonicalCourseName(record.course || 'Unknown Course'),
          location,
          date: record.expiry || (record as any).allocatedTrainingDate,
          type: 'allocated',
        });
      }

      for (const record of expiredData) {
        if (categorizeDeliveryType(record.course || 'Unknown Course', record.delivery, atlasList) !== 'Face to Face') continue;
        const stats = ensureCourse(record.course || 'Unknown Course');
        const location = record.location || 'Unknown Location';
        stats.totals.expired += 1;
        const locationCounts = ensureLocation(stats, location);
        locationCounts.expired += 1;

        stats.records.push({
          staffName: record.name || 'Unknown Staff',
          courseName: canonicalCourseName(record.course || 'Unknown Course'),
          location,
          date: record.expiry,
          type: 'expired',
        });
      }

      const stats = Array.from(statsMap.values()).sort((a, b) =>
        a.courseName.localeCompare(b.courseName)
      );

      setCourseStats(stats);
      setExpandedCourse(null);
      setStatus(`Loaded ${stats.length} courses across all locations`);
    } catch (error: any) {
      console.error('Error loading breakdown:', error);
      setStatus(error?.message || 'Error loading breakdown');
    } finally {
      setLoading(false);
    }
  }

  const filteredStats = useMemo(() => courseStats, [courseStats]);

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const tnaRows = useMemo(() => {
    const expiringKey = expiringWindow === 3 ? 'within3' : expiringWindow === 6 ? 'within6' : 'within12';
    const rows = filteredStats.map(course => {
    const expiring = course.totals[expiringKey];
    const expired = course.totals.expired;
    const allocated = course.totals.allocated;
    const total = expiring + expired + allocated;

    const byLocation = Object.entries(course.locations)
      .map(([location, counts]) => {
        const locExpiring = counts[expiringKey];
        const locExpired = counts.expired;
        const locAllocated = counts.allocated;
        return {
          location,
          expiring: locExpiring,
          expired: locExpired,
          allocated: locAllocated,
          total: locExpiring + locExpired + locAllocated,
        };
      })
      .sort((a, b) => b.total - a.total);

    return {
      courseKey: course.courseKey,
      courseName: course.courseName,
      expiring,
      expired,
      allocated,
      total,
      byLocation,
    };
  });

    const filtered = rows.filter(row => {
      if (minDemand > 0 && row.total < minDemand) return false;
      if (normalizedSearch && !row.courseName.toLowerCase().includes(normalizedSearch)) return false;
      return true;
    });

    const dir = sortDir === 'asc' ? 1 : -1;
    filtered.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'course') cmp = a.courseName.localeCompare(b.courseName);
      if (sortKey === 'total') cmp = a.total - b.total;
      if (sortKey === 'expiring') cmp = a.expiring - b.expiring;
      if (sortKey === 'expired') cmp = a.expired - b.expired;
      if (sortKey === 'allocated') cmp = a.allocated - b.allocated;
      if (cmp === 0) cmp = a.courseName.localeCompare(b.courseName);
      return cmp * dir;
    });

    return filtered;
  }, [expiringWindow, filteredStats, minDemand, normalizedSearch, sortDir, sortKey]);

  const [detailModal, setDetailModal] = useState<{
    isOpen: boolean;
    title: string;
    records: DisplayRecordItem[];
  }>({
    isOpen: false,
    title: '',
    records: [],
  });

  const tnaSummary = useMemo(() => {
    const totalPeople = tnaRows.reduce((sum, row) => sum + row.total, 0);
    const totalExpiring = tnaRows.reduce((sum, row) => sum + row.expiring, 0);
    const totalExpired = tnaRows.reduce((sum, row) => sum + row.expired, 0);
    const allExpiringRecords = courseStats.flatMap(c => c.records.filter(r => r.type === 'expiring'));
    const allExpiredRecords = courseStats.flatMap(c => c.records.filter(r => r.type === 'expired'));

    return {
      totalPeople,
      totalCourses: tnaRows.length,
      totalExpiring,
      totalExpired,
      allExpiringRecords,
      allExpiredRecords,
    };
  }, [tnaRows, courseStats]);

  const maxTotal = useMemo(() => {
    return Math.max(1, ...tnaRows.map(row => row.total));
  }, [tnaRows]);

  return (
    <div className={`min-h-screen transition-colors duration-500 ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className={`border-b transition-colors duration-300 ${isDark ? 'border-gray-800 bg-gray-800' : 'border-gray-200 bg-white'}`}>
        <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
            <BackButton to="/apps/expiry-checker" />
            <div className="flex-1" />
          </div>
          <div className="text-center">
          <h1 className={`text-4xl font-bold transition-colors duration-300 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Training Course Checker
          </h1>
          <p className={`mt-3 text-lg transition-colors duration-300 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            Breakdown of expiring, allocated training, and expired courses across all homes
          </p>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 py-10 max-w-7xl mx-auto">
        <div className={`mb-6 text-center text-sm font-medium transition-colors duration-300 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
          {status}
        </div>

        {tnaRows.length > 0 && (
          <div className={`rounded-lg border overflow-hidden shadow-lg transition-colors duration-300 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <div className={`px-6 py-4 ${isDark ? 'bg-gradient-to-r from-sky-600 to-blue-700' : 'bg-gradient-to-r from-sky-500 to-blue-600'}`}>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-white">Training Needs Analysis</h2>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sky-100 text-sm font-medium">Timeframe:</span>
                  <div className="flex rounded-lg overflow-hidden border border-sky-200/60">
                    {[3, 6, 12].map(months => (
                      <button
                        key={months}
                        type="button"
                        onClick={() => setExpiringWindow(months as 3 | 6 | 12)}
                        className={`px-4 py-1.5 text-sm font-semibold transition ${
                          expiringWindow === months
                            ? 'bg-white text-sky-700'
                            : 'text-sky-100 hover:bg-sky-500'
                        }`}
                      >
                        {months} months
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 px-6 py-4 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
              <div className="text-center">
                <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{tnaSummary.totalPeople.toLocaleString()}</p>
                <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} mt-0.5`}>Total Training Needs</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{tnaSummary.totalCourses.toLocaleString()}</p>
                <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} mt-0.5`}>Courses With Demand</p>
              </div>
              <div className="text-center">
                <HoverPopoverCard
                  title="Expiring in Period"
                  records={tnaSummary.allExpiringRecords}
                  accentColor="yellow"
                  isDark={isDark}
                  onCardClick={() =>
                    setDetailModal({
                      isOpen: true,
                      title: 'Expiring Courses Breakdown',
                      records: tnaSummary.allExpiringRecords,
                    })
                  }
                >
                  <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400 hover:underline">{tnaSummary.totalExpiring.toLocaleString()}</p>
                  <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} mt-0.5`}>Expiring in Period</p>
                </HoverPopoverCard>
              </div>
              <div className="text-center">
                <HoverPopoverCard
                  title="Currently Expired"
                  records={tnaSummary.allExpiredRecords}
                  accentColor="red"
                  isDark={isDark}
                  onCardClick={() =>
                    setDetailModal({
                      isOpen: true,
                      title: 'Expired Courses Breakdown',
                      records: tnaSummary.allExpiredRecords,
                    })
                  }
                >
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400 hover:underline">{tnaSummary.totalExpired.toLocaleString()}</p>
                  <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} mt-0.5`}>Currently Expired</p>
                </HoverPopoverCard>
              </div>
            </div>

            <div className={`px-6 py-3 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'} flex flex-wrap gap-3 items-center`}>
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="🔍 Search course name..."
                className={`px-3 py-1.5 rounded border text-sm flex-1 min-w-[200px] ${
                  isDark
                    ? 'bg-gray-700 border-gray-600 text-gray-100'
                    : 'bg-white border-gray-300 text-gray-700'
                }`}
              />
              <label className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'} flex items-center gap-1`}>
                Min demand:
                <input
                  type="number"
                  min={1}
                  value={minDemand}
                  onChange={e => setMinDemand(Math.max(1, Number(e.target.value) || 1))}
                  className={`w-16 px-2 py-1 rounded border text-sm ${
                    isDark
                      ? 'bg-gray-700 border-gray-600 text-gray-100'
                      : 'bg-white border-gray-300 text-gray-700'
                  }`}
                />
              </label>
              <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                Showing {tnaRows.length} of {filteredStats.length} courses
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className={`text-xs uppercase tracking-wide ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                  <tr>
                    {[
                      { key: 'course', label: 'Course Name', align: 'text-left' },
                      { key: 'total', label: 'Total Need', align: 'text-center' },
                      { key: 'expiring', label: 'Expiring', align: 'text-center', color: 'text-blue-600 dark:text-blue-400', icon: 'clock' },
                      { key: 'expired', label: 'Expired', align: 'text-center', color: 'text-red-600 dark:text-red-400', icon: 'exclamation' },
                      { key: 'allocated', label: 'Allocated', align: 'text-center', color: 'text-yellow-600 dark:text-yellow-400', icon: 'calendar' },
                    ].map(col => (
                      <th
                        key={col.key}
                        onClick={() => {
                          if (sortKey === col.key) {
                            setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
                          } else {
                            setSortKey(col.key as typeof sortKey);
                            setSortDir('desc');
                          }
                        }}
                        className={`px-4 py-3 ${col.align} font-semibold cursor-pointer select-none ${
                          isDark ? 'text-gray-200 hover:bg-gray-600' : 'text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        <span className={`inline-flex items-center gap-1 justify-center ${col.color || ''}`}>
                          {(col as any).icon === 'clock' && <ClockIcon className="w-4 h-4" />}
                          {(col as any).icon === 'exclamation' && <ExclamationCircleIcon className="w-4 h-4" />}
                          {(col as any).icon === 'calendar' && <CalendarIcon className="w-4 h-4" />}
                          {col.label}
                        </span>
                        {sortKey === col.key && (sortDir === 'desc' ? ' ↓' : ' ↑')}
                      </th>
                    ))}
                    <th className={`px-4 py-3 text-left ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>Demand Bar</th>
                    <th className={`px-4 py-3 text-center ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>Locations</th>
                  </tr>
                </thead>
                <tbody>
                  {tnaRows.map(row => {
                    const isExpanded = expandedCourse === row.courseKey;
                    const barPct = Math.round((row.total / maxTotal) * 100);
                    const barColor = row.expired > row.expiring ? '#ef4444' : row.expiring > row.allocated ? '#3b82f6' : '#38bdf8';
                    return (
                      <Fragment key={row.courseKey}>
                        <tr
                          className={`border-b transition-colors cursor-pointer ${isDark ? 'border-gray-700 hover:bg-gray-700' : 'border-gray-200 hover:bg-gray-50'}`}
                          onClick={() => setExpandedCourse(isExpanded ? null : row.courseKey)}
                        >
                          <td className={`px-4 py-3 font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                            <span className="flex items-center gap-2">
                              <span className={`text-xs transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                              {row.courseName}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-block px-3 py-1 rounded-full text-sm font-bold ${
                              row.total >= 20
                                ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                : row.total >= 10
                                  ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
                                  : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                            }`}>
                              {row.total}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-blue-600 dark:text-blue-400 font-semibold">
                            <span className="inline-flex items-center justify-center gap-1">
                              <ClockIcon className="w-3.5 h-3.5" />
                              {row.expiring || '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-red-600 dark:text-red-400 font-semibold">
                            <span className="inline-flex items-center justify-center gap-1">
                              <ExclamationCircleIcon className="w-3.5 h-3.5" />
                              {row.expired || '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-yellow-600 dark:text-yellow-400 font-semibold">
                            <span className="inline-flex items-center justify-center gap-1">
                              <CalendarIcon className="w-3.5 h-3.5" />
                              {row.allocated || '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 min-w-[120px]">
                            <div className={`${isDark ? 'bg-gray-700' : 'bg-gray-200'} rounded-full h-2 w-full`}>
                              <div
                                className="h-2 rounded-full transition-[width] duration-300"
                                style={{ width: `${barPct}%`, background: barColor }}
                              />
                            </div>
                          </td>
                          <td className={`px-4 py-3 text-center text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            {row.byLocation.length} location{row.byLocation.length !== 1 ? 's' : ''}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className={isDark ? 'bg-blue-950' : 'bg-blue-50'}>
                            <td colSpan={7} className="px-6 py-4 border-b border-blue-200 dark:border-blue-800">
                              <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>
                                Location Breakdown — {row.courseName}
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                {row.byLocation.map(loc => (
                                  <div key={loc.location} className={`rounded-lg border px-3 py-2 ${
                                    isDark ? 'border-blue-700 bg-gray-800' : 'border-blue-200 bg-white'
                                  }`}>
                                    <p className={`font-semibold text-sm truncate ${isDark ? 'text-gray-200' : 'text-gray-800'}`} title={loc.location}>
                                      {loc.location}
                                    </p>
                                    <div className="flex gap-3 mt-1 text-xs">
                                      <span className="inline-flex items-center gap-0.5 text-blue-600 dark:text-blue-400"><ClockIcon className="w-3 h-3" />{loc.expiring}</span>
                                      <span className="inline-flex items-center gap-0.5 text-red-600 dark:text-red-400"><ExclamationCircleIcon className="w-3 h-3" />{loc.expired}</span>
                                      <span className="inline-flex items-center gap-0.5 text-yellow-600 dark:text-yellow-400"><CalendarIcon className="w-3 h-3" />{loc.allocated}</span>
                                      <span className={`font-bold ml-auto ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>= {loc.total}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className={`text-xs px-6 py-3 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              * Counts unique staff–location combinations. One-off and Atlas (self-managed e-learning) courses are excluded. Face to Face courses only. Click a row to expand location breakdown.
            </p>
          </div>
        )}

        {tnaRows.length === 0 && !loading && (
          <div className={`text-center py-16 rounded-lg border transition-colors duration-300 ${isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'}`}>
            <p className={`text-lg transition-colors duration-300 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              No breakdown loaded yet. Use the button above to pull the latest data.
            </p>
          </div>
        )}
      </div>

      {/* Click-to-expand Detail Modal */}
      <RecordDetailModal
        isOpen={detailModal.isOpen}
        onClose={() => setDetailModal(prev => ({ ...prev, isOpen: false }))}
        title={detailModal.title}
        records={detailModal.records}
        isDark={isDark}
      />
    </div>
  );
}
