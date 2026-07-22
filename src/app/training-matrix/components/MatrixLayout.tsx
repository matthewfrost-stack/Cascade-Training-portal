'use client';
import React, { useState, useMemo } from 'react';
import { useMatrix } from '../context/MatrixContext';
import { GroupManagerModal } from './GroupManagerModal';
import { Course, Staff, MatrixCell } from '../types';

// Compact rollup component for collapsed categories
interface SummaryCellProps {
  staffMember: Staff;
  coursesInCat: Course[];
  matrixData: Record<string, Record<string, MatrixCell>>;
  isDark: boolean;
  onExpandClick: () => void;
  checkStatus: (cell: any, course: any) => 'valid' | 'expiring' | 'expired';
}

function CategorySummaryCell({ staffMember, coursesInCat, matrixData, isDark, onExpandClick, checkStatus }: SummaryCellProps) {
  let valid = 0;
  let expiring = 0;
  let expired = 0;
  let allocated = 0;
  let na = 0;
  let notYetDue = 0;
  const total = coursesInCat.length;

  coursesInCat.forEach((course) => {
    const cell = matrixData[staffMember.id]?.[course.id];
    if (cell?.status === 'allocated' || cell?.status === 'booked' || cell?.status === 'awaiting') {
      allocated++;
    } else if (cell?.status === 'na') {
      na++;
    } else if (cell?.status === 'not_yet_due') {
      notYetDue++;
    } else if (cell?.completion_date) {
      const status = checkStatus(cell, course);
      if (status === 'valid') valid++;
      else if (status === 'expiring') expiring++;
      else if (status === 'expired') expired++;
    } else {
      expired++;
    }
  });

  const compliantCount = valid + na + notYetDue;
  const complianceRate = total > 0 ? Math.round((compliantCount / total) * 100) : 0;

  const bgClass = expired > 0
    ? (isDark ? 'bg-red-950/10 hover:bg-red-950/20' : 'bg-red-50 hover:bg-red-100/70')
    : expiring > 0
      ? (isDark ? 'bg-amber-950/10 hover:bg-amber-950/20' : 'bg-amber-50 hover:bg-amber-100/70')
      : (isDark ? 'bg-emerald-950/10 hover:bg-emerald-950/20' : 'bg-emerald-50 hover:bg-emerald-100/70');

  const textClass = expired > 0
    ? (isDark ? 'text-red-400' : 'text-red-700')
    : expiring > 0
      ? (isDark ? 'text-amber-400' : 'text-amber-700')
      : (isDark ? 'text-emerald-400' : 'text-emerald-700');

  const details = coursesInCat.map((course) => {
    const cell = matrixData[staffMember.id]?.[course.id];
    let statusText = 'Missing';
    let statusColor = 'text-red-500';

    if (cell?.status === 'allocated' || cell?.status === 'booked' || cell?.status === 'awaiting') {
      statusText = 'Allocated'; statusColor = 'text-blue-500';
    } else if (cell?.status === 'na') {
      statusText = 'N/A'; statusColor = 'text-gray-400';
    } else if (cell?.status === 'not_yet_due') {
      statusText = 'Not Yet Due'; statusColor = 'text-purple-500';
    } else if (cell?.completion_date) {
      const status = checkStatus(cell, course);
      if (status === 'valid') { statusText = `Valid (${cell.expiry_date ? new Date(cell.expiry_date).toLocaleDateString('en-GB') : 'No exp'})`; statusColor = 'text-green-500'; }
      else if (status === 'expiring') { statusText = `Expiring (${cell.expiry_date ? new Date(cell.expiry_date).toLocaleDateString('en-GB') : ''})`; statusColor = 'text-amber-500'; }
      else { statusText = `Expired (${cell.expiry_date ? new Date(cell.expiry_date).toLocaleDateString('en-GB') : ''})`; statusColor = 'text-red-500'; }
    }
    return { name: course.name, statusText, statusColor };
  });

  return (
    <td
      className={`px-3 py-3 text-center border-r border-b transition-all duration-150 relative group/cell cursor-pointer min-w-[120px] ${bgClass} ${isDark ? 'border-gray-800/80' : 'border-gray-200'}`}
      onClick={onExpandClick}
      title="Click to expand category"
    >
      <div className="flex flex-col items-center justify-center gap-1">
        <span className={`text-sm font-black tracking-tight ${textClass}`}>{complianceRate}%</span>
        <div className="flex items-center gap-0.5 flex-wrap justify-center">
          {valid > 0 && <span className="px-1 py-0.5 bg-emerald-500/10 text-emerald-500 rounded text-[10px] font-bold">{valid}✓</span>}
          {expiring > 0 && <span className="px-1 py-0.5 bg-amber-500/10 text-amber-500 rounded text-[10px] font-bold">{expiring}⚠</span>}
          {expired > 0 && <span className="px-1 py-0.5 bg-red-500/10 text-red-500 rounded text-[10px] font-bold">{expired}✗</span>}
          {allocated > 0 && <span className="px-1 py-0.5 bg-blue-500/10 text-blue-500 rounded text-[10px] font-bold">{allocated}📅</span>}
        </div>
      </div>
      {/* Tooltip */}
      <div className={`absolute left-1/2 bottom-full mb-2 -translate-x-1/2 hidden group-hover/cell:flex flex-col w-64 rounded-xl shadow-2xl p-3 border text-left z-50 pointer-events-none ${isDark ? 'bg-gray-800 border-gray-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'}`}>
        <div className={`font-extrabold text-xs border-b pb-1.5 mb-1.5 flex justify-between ${isDark ? 'border-gray-700' : 'border-slate-200'}`}>
          <span>{coursesInCat[0]?.category || 'Category'}</span>
          <span className="text-[10px] text-slate-500">{complianceRate}% Compliant</span>
        </div>
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {details.map((d, idx) => (
            <div key={idx} className="flex justify-between gap-2 text-[10px]">
              <span className="truncate flex-1 font-semibold opacity-80" title={d.name}>{d.name}</span>
              <span className={`font-black flex-shrink-0 ${d.statusColor}`}>{d.statusText}</span>
            </div>
          ))}
        </div>
        <p className={`mt-2 text-[9px] text-center italic border-t pt-1 ${isDark ? 'border-gray-700 text-gray-500' : 'border-slate-200 text-slate-400'}`}>Click to expand</p>
      </div>
    </td>
  );
}

export function MatrixLayout() {
  const {
    user, userRole, selectedLocation, setSelectedLocation, locations, staff, setStaff, courses, setCourses, matrixData, setMatrixData,
    loading, setLoading, isDark, setIsDark, tableScrollContainerRef, editingCell, setEditingCell,
    editDate, setEditDate, editStatus, setEditStatus, staffDividers, setStaffDividers, showAddCourse, setShowAddCourse,
    newCourseName, setNewCourseName, draggedCourse, setDraggedCourse, showAddDivider, setShowAddDivider, newDividerName, setNewDividerName,
    draggedStaff, setDraggedStaff, editingHeader, setEditingHeader, editHeaderValue, setEditHeaderValue, editNeverExpires, setEditNeverExpires,
    lastRemovedCourse, setLastRemovedCourse, selectedCells, setSelectedCells, bulkEditMode, setBulkEditMode, bulkEditStatus, setBulkEditStatus,
    bulkEditDate, setBulkEditDate, getCategoryOverrides, saveCategoryOverride, formatExpiryDisplay,
    fetchMatrixData, saveCourseChanges, getDateStatus, getDateColor, getStatusDisplay, canEditMatrix, handleCourseDropStart, handleCourseDragOver,
    handleCourseDropEnd, handleStaffDropStart, handleStaffDragOver, persistStaffOrdering, persistCourseOrdering, handleStaffDropEnd, addNewCourse, deleteCourse,
    undoRemoveCourse, addNewDivider, exportMatrixCsv, deleteStaffMember, toggleCellSelection, selectAllInCourse, deselectAllInCourse,
    selectAllForStaff, clearAllSelections, applyBulkUpdate, updateAllExpiriesForCourse, handleSaveTraining
  } = useMatrix();

  const [collapsedDividers, setCollapsedDividers] = useState<Set<string>>(new Set());
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [groupModal, setGroupModal] = useState<{ type: 'staff' | 'course'; editKey: string | null } | null>(null);
  const [draggedCategory, setDraggedCategory] = useState<string | null>(null);

  const checkStatus = (cell: any, course: any): 'valid' | 'expiring' | 'expired' => {
    if (course.never_expires || course.expiry_months === 9999 || course.expiry_months === null) return 'valid';
    if (!cell?.expiry_date) return 'expired';
    const today = new Date();
    const expiry = new Date(cell.expiry_date);
    const twoMonthsFromNow = new Date();
    twoMonthsFromNow.setMonth(twoMonthsFromNow.getMonth() + 2);
    if (expiry < today) return 'expired';
    if (expiry < twoMonthsFromNow) return 'expiring';
    return 'valid';
  };

  const categories = useMemo(() => {
    const unique = new Set<string>();
    courses.forEach((c: any) => unique.add(c.category || 'Uncategorized'));
    return Array.from(unique);
  }, [courses]);

  const coursesByCategory = useMemo(() => {
    const groups: Record<string, any[]> = {};
    courses.forEach((course: any) => {
      const cat = course.category || 'Uncategorized';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(course);
    });
    return groups;
  }, [courses]);

  const staffByDivider = useMemo(() => {
    const mapping: Record<string, any[]> = {};
    let currentDividerId = '__unassigned__';
    mapping[currentDividerId] = [];
    staff.forEach((member: any) => {
      if (staffDividers.has(member.id)) {
        currentDividerId = member.id;
        mapping[currentDividerId] = [];
      } else {
        mapping[currentDividerId].push(member);
      }
    });
    return mapping;
  }, [staff, staffDividers]);

  const getDividerStats = (dividerId: string) => {
    const members = staffByDivider[dividerId] || [];
    if (members.length === 0) return { staffCount: 0, complianceRate: 100, expiredCount: 0 };
    let totalRequired = 0; let compliantCount = 0; let expiredCount = 0;
    members.forEach((member: any) => {
      courses.forEach((course: any) => {
        totalRequired++;
        const cell = matrixData[member.id]?.[course.id];
        if (cell?.status === 'na' || cell?.status === 'not_yet_due') compliantCount++;
        else if (cell?.completion_date) {
          const s = checkStatus(cell, course);
          if (s === 'valid' || s === 'expiring') compliantCount++;
          else expiredCount++;
        } else expiredCount++;
      });
    });
    return { staffCount: members.length, complianceRate: totalRequired > 0 ? Math.round((compliantCount / totalRequired) * 100) : 100, expiredCount };
  };

  const filteredStaff = useMemo(() => {
    if (!searchQuery.trim()) return staff;
    const query = searchQuery.toLowerCase().trim();
    const matchingIds = new Set<string>();
    staff.forEach((m: any) => {
      if (!staffDividers.has(m.id) && m.name.toLowerCase().includes(query)) matchingIds.add(m.id);
    });
    const result: any[] = [];
    let lastDivider: any = null;
    staff.forEach((m: any) => {
      if (staffDividers.has(m.id)) {
        lastDivider = m;
      } else if (matchingIds.has(m.id)) {
        if (lastDivider && !result.includes(lastDivider)) result.push(lastDivider);
        result.push(m);
      }
    });
    return result;
  }, [staff, staffDividers, searchQuery]);

  const dashboardStats = useMemo(() => {
    const activeStaff = staff.filter((s: any) => !staffDividers.has(s.id));
    if (activeStaff.length === 0 || courses.length === 0) return { compliance: 0, expired: 0, staffCount: 0, allocated: 0 };
    let total = 0; let compliant = 0; let expired = 0; let allocated = 0;
    activeStaff.forEach((m: any) => {
      courses.forEach((c: any) => {
        total++;
        const cell = matrixData[m.id]?.[c.id];
        if (cell?.status === 'allocated' || cell?.status === 'booked' || cell?.status === 'awaiting') allocated++;
        else if (cell?.status === 'na' || cell?.status === 'not_yet_due') compliant++;
        else if (cell?.completion_date) {
          const s = checkStatus(cell, c);
          if (s === 'valid' || s === 'expiring') compliant++;
          else expired++;
        } else expired++;
      });
    });
    return { compliance: total > 0 ? Math.round((compliant / total) * 100) : 0, expired, staffCount: activeStaff.length, allocated };
  }, [staff, courses, matrixData, staffDividers]);

  const toggleCategory = (cat: string) => setCollapsedCategories(prev => { const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n; });
  const toggleDivider = (id: string) => setCollapsedDividers(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const handleCategoryDrop = async (targetCat: string) => {
    if (!canEditMatrix || !draggedCategory || draggedCategory === targetCat) return;

    const draggedIndex = categories.indexOf(draggedCategory);
    const targetIndex = categories.indexOf(targetCat);
    if (draggedIndex === -1 || targetIndex === -1) return;

    const newCategories = [...categories];
    const [draggedItem] = newCategories.splice(draggedIndex, 1);
    newCategories.splice(targetIndex, 0, draggedItem);

    // Reorder courses array based on the new category sequence
    const newCourses: Course[] = [];
    newCategories.forEach((cat) => {
      const catCourses = coursesByCategory[cat] || [];
      newCourses.push(...catCourses);
    });

    setCourses(newCourses);
    setDraggedCategory(null);
    await persistCourseOrdering(newCourses);
  };

  const dividerIds = staff.filter((s: any) => staffDividers.has(s.id)).map((s: any) => s.id);
  const allCatsCollapsed = collapsedCategories.size === categories.length;
  const allDividersCollapsed = collapsedDividers.size === dividerIds.length;

  const visibleColCount = categories.reduce((acc, cat) => {
    return acc + (collapsedCategories.has(cat) ? 1 : (coursesByCategory[cat]?.length || 0));
  }, 0);

  const bg = isDark ? 'bg-gray-950' : 'bg-gray-50';
  const headerBg = isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200';
  const panelBg = isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200';
  const thBg = isDark ? 'bg-gray-800 border-gray-700 text-gray-300' : 'bg-slate-100 border-slate-200 text-slate-700';
  const rowBorder = isDark ? 'border-gray-800/80' : 'border-gray-200/70';
  const stickyLeft = isDark ? 'bg-gray-900 border-gray-800 text-white' : 'bg-white border-gray-200 text-gray-800';

  return (
    <div className={`min-h-screen transition-colors duration-200 ${bg}`}>
      {/* Top header */}
      <div className={`p-5 border-b shadow-sm ${headerBg}`}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 max-w-[1900px] mx-auto">
          <div>
            <h1 className={`text-2xl md:text-3xl font-black uppercase tracking-tighter ${isDark ? 'text-white' : 'text-gray-900'}`}>Training Matrix</h1>
            <p className="text-xs text-slate-500 mt-0.5">Site-wide compliance and course records.</p>
          </div>
          {locations.length > 0 && (
            <div className="flex items-center gap-3">
              <label className={`text-xs font-black uppercase tracking-widest ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Site:</label>
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className={`px-4 py-2 rounded-xl text-sm font-bold shadow-sm border focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all ${isDark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-800'}`}
              >
                {locations.map((loc: any) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-[1900px] mx-auto p-5 space-y-5">
        {selectedLocation && (
          <>
            {/* Metrics Row */}
            {!loading && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  {
                    label: 'Site Compliance',
                    value: `${dashboardStats.compliance}%`,
                    sub: dashboardStats.compliance >= 80 ? 'Good standing' : 'Needs attention',
                    accent: dashboardStats.compliance >= 90 ? 'bg-emerald-500' : dashboardStats.compliance >= 75 ? 'bg-amber-500' : 'bg-red-500',
                    bar: true
                  },
                  { label: 'Action Required', value: dashboardStats.expired, sub: dashboardStats.expired > 0 ? 'Expired records' : 'Fully compliant!', accent: '', bar: false },
                  { label: 'Total Staff', value: dashboardStats.staffCount, sub: 'Active at this site', accent: '', bar: false },
                  { label: 'Allocated', value: dashboardStats.allocated, sub: 'Upcoming sessions', accent: '', bar: false },
                ].map((card, idx) => (
                  <div key={idx} className={`p-5 rounded-2xl border shadow-sm ${panelBg}`}>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{card.label}</p>
                    <p className={`text-3xl font-black tracking-tight mt-1 ${idx === 1 && dashboardStats.expired > 0 ? 'text-red-500' : ''}`}>{card.value}</p>
                    <p className="text-[10px] text-slate-500 mt-1">{card.sub}</p>
                    {card.bar && (
                      <div className={`w-full h-1.5 rounded-full mt-3 overflow-hidden ${isDark ? 'bg-gray-800' : 'bg-slate-200'}`}>
                        <div className={`h-full rounded-full transition-all duration-500 ${card.accent}`} style={{ width: `${dashboardStats.compliance}%` }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Toolbar */}
            <div className={`p-4 rounded-2xl border shadow-sm ${panelBg}`}>
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                {/* Left: Search + collapse toggles (groups first, categories second) */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative w-64">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">🔍</span>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search staff..."
                      className={`w-full pl-9 pr-4 py-2 rounded-xl text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all ${isDark ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500' : 'bg-white border-gray-300 text-gray-800 placeholder-gray-400'}`}
                    />
                  </div>
                  <button
                    onClick={() => allDividersCollapsed ? setCollapsedDividers(new Set()) : setCollapsedDividers(new Set(dividerIds))}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${isDark ? 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700' : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'}`}
                  >
                    {allDividersCollapsed ? '⊞ Expand Groups' : '⊟ Collapse Groups'}
                  </button>
                  <button
                    onClick={() => allCatsCollapsed ? setCollapsedCategories(new Set()) : setCollapsedCategories(new Set(categories))}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${isDark ? 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700' : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'}`}
                  >
                    {allCatsCollapsed ? '⊞ Expand Categories' : '⊟ Collapse Categories'}
                  </button>
                </div>

                {/* Right: Action buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={exportMatrixCsv} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all active:scale-95">
                    Export CSV
                  </button>
                  {selectedCells.size > 0 && (
                    <>
                      <button onClick={() => setBulkEditMode(true)} className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all active:scale-95">
                        📝 Bulk Edit ({selectedCells.size})
                      </button>
                      <button onClick={clearAllSelections} className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${isDark ? 'bg-gray-800 border-gray-700 hover:bg-gray-700' : 'bg-slate-100 border-slate-200 hover:bg-slate-200'}`}>
                        Clear Selection
                      </button>
                    </>
                  )}
                  {canEditMatrix && (
                    <>
                      {!showAddCourse ? (
                        <button onClick={() => setShowAddCourse(true)} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all active:scale-95">+ Course</button>
                      ) : (
                        <div className="flex gap-1.5 items-center">
                          <input type="text" value={newCourseName} onChange={(e) => setNewCourseName(e.target.value)} placeholder="Course name" className={`px-3 py-1.5 rounded-xl border text-xs focus:outline-none ${isDark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-800'}`} onKeyDown={(e) => { if (e.key === 'Enter') addNewCourse(); if (e.key === 'Escape') { setShowAddCourse(false); setNewCourseName(''); } }} autoFocus />
                          <button onClick={addNewCourse} className="px-2.5 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold">✓</button>
                          <button onClick={() => { setShowAddCourse(false); setNewCourseName(''); }} className="px-2.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold">✕</button>
                        </div>
                      )}
                      <button onClick={() => setGroupModal({ type: 'staff', editKey: null })} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all active:scale-95">+ Group</button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Undo banner */}
            {lastRemovedCourse && userRole === 'admin' && (
              <div className={`w-full rounded-2xl border px-4 py-3 text-sm flex items-center justify-between shadow-sm ${isDark ? 'bg-amber-950/20 border-amber-900/40 text-amber-200' : 'bg-amber-50 border-amber-300 text-amber-800'}`}>
                <span>Removed: <strong>{lastRemovedCourse.course_name}</strong></span>
                <div className="flex gap-2">
                  <button onClick={undoRemoveCourse} className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white transition-colors">Undo</button>
                  <button onClick={() => setLastRemovedCourse(null)} className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${isDark ? 'bg-gray-800 hover:bg-gray-700 text-gray-200' : 'bg-gray-200 hover:bg-gray-300 text-gray-800'}`}>Dismiss</button>
                </div>
              </div>
            )}

            {/* Loading state */}
            {loading ? (
              <div className={`flex items-center justify-center h-64 rounded-2xl border ${panelBg}`}>
                <div className="text-center space-y-3">
                  <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-sm text-slate-500">Loading matrix data...</p>
                </div>
              </div>
            ) : staff.length === 0 ? (
              <div className={`flex items-center justify-center h-40 rounded-2xl border ${panelBg}`}>
                <p className="text-sm text-slate-500">No staff data for this location.</p>
              </div>
            ) : courses.length === 0 ? (
              <div className={`flex items-center justify-center h-40 rounded-2xl border ${panelBg}`}>
                <p className="text-sm text-slate-500">No courses configured for this location.</p>
              </div>
            ) : (
              /* Matrix table */
              <div className={`rounded-2xl border overflow-hidden shadow-lg ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
                <div ref={tableScrollContainerRef} className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-380px)]">
                  <table className={`w-full text-sm border-collapse ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
                    <thead className="sticky top-0 z-20">
                      {/* Row 1: Category headers */}
                      <tr className={`h-10 border-b ${thBg}`}>
                        <th className={`px-4 py-2 text-left text-xs font-black uppercase tracking-wider sticky left-0 z-40 border-r min-w-[240px] ${thBg}`}>
                          Category Group
                        </th>
                        {categories.map(cat => {
                          const catCourses = coursesByCategory[cat] || [];
                          const isCollapsed = collapsedCategories.has(cat);
                          if (isCollapsed) {
                            return (
                              <th
                                key={`cat-${cat}`}
                                rowSpan={3}
                                className={`px-3 py-2 text-center text-xs font-black border-r cursor-move select-none transition-all hover:opacity-80 min-w-[120px] ${thBg} ${draggedCategory === cat ? 'opacity-40' : ''}`}
                                onClick={() => toggleCategory(cat)}
                                title="Drag to move category, click to expand"
                                draggable={canEditMatrix}
                                onDragStart={(e) => {
                                  e.stopPropagation();
                                  setDraggedCategory(cat);
                                  e.dataTransfer.effectAllowed = 'move';
                                }}
                                onDragOver={(e) => {
                                  e.preventDefault();
                                }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  handleCategoryDrop(cat);
                                }}
                              >
                                <div className="flex flex-col items-center gap-1">
                                  <span className="text-[10px] text-blue-400 uppercase font-extrabold">Collapsed</span>
                                  <span>➕</span>
                                  <span className="truncate max-w-[100px] text-[10px]">{cat}</span>
                                </div>
                              </th>
                            );
                          }
                          return (
                            <th
                              key={`cat-${cat}`}
                              colSpan={catCourses.length}
                              className={`group/cat px-3 py-1.5 text-center text-xs font-black border-r cursor-move select-none transition-all hover:opacity-80 ${thBg} ${draggedCategory === cat ? 'opacity-40' : ''}`}
                              onClick={() => toggleCategory(cat)}
                              title="Drag to move category, click to collapse"
                              draggable={canEditMatrix}
                              onDragStart={(e) => {
                                e.stopPropagation();
                                setDraggedCategory(cat);
                                e.dataTransfer.effectAllowed = 'move';
                              }}
                              onDragOver={(e) => {
                                e.preventDefault();
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                handleCategoryDrop(cat);
                              }}
                            >
                              <div className="flex items-center justify-center gap-1.5">
                                <span className="opacity-60">➖</span>
                                <span className="text-[10px] uppercase tracking-wide opacity-60">Category:</span>
                                <span className="truncate max-w-[140px]">{cat}</span>
                                {canEditMatrix && cat !== 'Uncategorized' && (
                                  <button onClick={(e) => { e.stopPropagation(); setGroupModal({ type: 'course', editKey: cat }); }} className="text-blue-400 hover:text-blue-300 text-xs pl-1" title="Edit or delete group">✎</button>
                                )}
                              </div>
                            </th>
                          );
                        })}
                      </tr>

                      {/* Row 2: Course name headers */}
                      <tr className={`h-10 border-b ${thBg}`}>
                        <th className={`px-4 py-2 text-left text-xs font-black uppercase tracking-wider sticky left-0 z-40 border-r min-w-[240px] ${thBg}`}>
                          Staff Member
                        </th>
                        {categories.map(cat => {
                          if (collapsedCategories.has(cat)) return null;
                          const catCourses = coursesByCategory[cat] || [];
                          return catCourses.map((course: any) => (
                            <th key={`name-${course.id}`} draggable={!editingHeader} onDragStart={(e) => handleCourseDropStart(e, course.id)} onDragOver={handleCourseDragOver} onDrop={(e) => handleCourseDropEnd(e, course.id)} onClick={() => { setEditingHeader({ courseId: course.id, type: 'name' }); setEditHeaderValue(course.name); }} className={`relative px-3 py-1.5 text-center text-xs font-bold border-r border-b cursor-grab active:cursor-grabbing min-w-[160px] transition-all group/hdr ${thBg} hover:opacity-80`} title="Drag to reorder, click to edit">
                              {editingHeader?.courseId === course.id && editingHeader?.type === 'name' ? (
                                <input type="text" value={editHeaderValue} onChange={(e) => setEditHeaderValue(e.target.value)} onBlur={() => { if (editHeaderValue.trim()) { const u = courses.map((c: any) => c.id === course.id ? { ...c, name: editHeaderValue.trim() } : c); setCourses(u); saveCourseChanges(course.id, { name: editHeaderValue.trim() }, true); } setEditingHeader(null); }} onKeyDown={(e) => { if (e.key === 'Enter') { if (editHeaderValue.trim()) { const u = courses.map((c: any) => c.id === course.id ? { ...c, name: editHeaderValue.trim() } : c); setCourses(u); saveCourseChanges(course.id, { name: editHeaderValue.trim() }, true); } setEditingHeader(null); } if (e.key === 'Escape') setEditingHeader(null); }} className={`w-full text-xs px-1.5 py-0.5 rounded border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-400 text-gray-900'}`} autoFocus />
                              ) : (
                                <div className="flex items-center justify-between gap-1">
                                  <span className="text-slate-400 font-extrabold text-[10px]">⋮⋮</span>
                                  <span className="block max-w-[100px] truncate" title={course.name}>{course.name}</span>
                                  <div className="flex items-center gap-0.5 opacity-0 group-hover/hdr:opacity-100 transition-opacity">
                                    {canEditMatrix && <button onClick={(e) => { e.stopPropagation(); setEditingHeader({ courseId: course.id, type: 'category' }); setEditHeaderValue(course.category || ''); }} className="text-blue-500 hover:text-blue-400 text-xs font-bold" title="Assign to group">📁</button>}
                                    <button onClick={(e) => { e.stopPropagation(); selectAllInCourse(course.id); }} className="text-green-500 hover:text-green-400 text-xs font-bold" title="Select all">☑</button>
                                    <button onClick={(e) => { e.stopPropagation(); deselectAllInCourse(course.id); }} className="text-gray-500 text-xs font-bold" title="Deselect all">☐</button>
                                    <button onClick={(e) => { e.stopPropagation(); deleteCourse(course.id); }} className="text-red-500 hover:text-red-400 text-xs font-bold pl-0.5" title="Delete">✕</button>
                                  </div>
                                </div>
                              )}
                              {editingHeader?.courseId === course.id && editingHeader?.type === 'category' && (
                                <div className={`absolute z-50 top-full left-1/2 -translate-x-1/2 mt-1 p-3 rounded-xl shadow-xl border flex flex-col gap-2 min-w-[200px] text-left ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-300'}`} onClick={e => e.stopPropagation()}>
                                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Course Group</span>
                                  <input list="matrix-course-groups" type="text" value={editHeaderValue} onChange={(e) => setEditHeaderValue(e.target.value)} placeholder="Pick or type a new group" onKeyDown={(e) => { if (e.key === 'Enter') { const val = editHeaderValue.trim(); const u = courses.map((c: any) => c.id === course.id ? { ...c, category: val || undefined } : c); setCourses(u); if (selectedLocation) saveCategoryOverride(selectedLocation, course.id, val); saveCourseChanges(course.id, { category: val || null }, true); setEditingHeader(null); } if (e.key === 'Escape') setEditingHeader(null); }} className={`w-full text-xs px-2 py-1 rounded border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-400 text-gray-900'}`} autoFocus />
                                  <datalist id="matrix-course-groups">
                                    {categories.filter(c => c !== 'Uncategorized').map(c => <option key={c} value={c} />)}
                                  </datalist>
                                  <div className="flex gap-1 justify-between items-center">
                                    <button onClick={() => { const u = courses.map((c: any) => c.id === course.id ? { ...c, category: undefined } : c); setCourses(u); if (selectedLocation) saveCategoryOverride(selectedLocation, course.id, ''); saveCourseChanges(course.id, { category: null }, true); setEditingHeader(null); }} className="text-[10px] text-slate-400 hover:text-red-400 font-bold" title="Remove from group">Clear</button>
                                    <div className="flex gap-1">
                                      <button onClick={() => { const val = editHeaderValue.trim(); const u = courses.map((c: any) => c.id === course.id ? { ...c, category: val || undefined } : c); setCourses(u); if (selectedLocation) saveCategoryOverride(selectedLocation, course.id, val); saveCourseChanges(course.id, { category: val || null }, true); setEditingHeader(null); }} className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-bold">Save</button>
                                      <button onClick={() => setEditingHeader(null)} className="px-2 py-0.5 bg-gray-500 hover:bg-gray-600 text-white rounded text-[10px]">×</button>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </th>
                          ));
                        })}
                      </tr>

                      {/* Row 3: Expiry settings */}
                      <tr className={`h-8 border-b ${thBg}`}>
                        <th className={`px-4 py-1 text-left sticky left-0 z-40 border-r min-w-[240px] ${thBg}`} />
                        {categories.map(cat => {
                          if (collapsedCategories.has(cat)) return null;
                          const catCourses = coursesByCategory[cat] || [];
                          return catCourses.map((course: any) => (
                            <th key={`expiry-${course.id}`} onClick={() => { setEditingHeader({ courseId: course.id, type: 'expiry' }); setEditHeaderValue(String(course.expiry_months || 12)); setEditNeverExpires(course.never_expires || false); }} className={`px-3 py-1 text-center text-[10px] border-r border-b cursor-pointer hover:opacity-80 relative ${isDark ? 'text-gray-400' : 'text-gray-500'}`} title="Click to edit expiry">
                              {editingHeader?.courseId === course.id && editingHeader?.type === 'expiry' ? (
                                <div className={`absolute z-50 top-full left-1/2 -translate-x-1/2 mt-1 p-3 rounded-xl shadow-xl border flex flex-col gap-2 min-w-[160px] ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-300'}`} onClick={e => e.stopPropagation()}>
                                  <label className="text-[10px] font-bold flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={editNeverExpires} onChange={(e) => setEditNeverExpires(e.target.checked)} />Never expires</label>
                                  {!editNeverExpires && <input type="number" value={editHeaderValue} onChange={(e) => setEditHeaderValue(e.target.value)} className={`w-full text-xs px-2 py-1 rounded border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-400 text-gray-900'}`} placeholder="months" autoFocus />}
                                  <div className="flex gap-1 justify-end">
                                    <button onClick={async () => { if (editNeverExpires) { const u = courses.map((c: any) => c.id === course.id ? { ...c, never_expires: true, expiry_months: 9999 } : c); setCourses(u); await saveCourseChanges(course.id, { never_expires: true, expiry_months: 9999 }, true); await updateAllExpiriesForCourse(course.id, 9999, true); } else { const m = parseInt(editHeaderValue) || 12; const u = courses.map((c: any) => c.id === course.id ? { ...c, never_expires: false, expiry_months: m } : c); setCourses(u); await saveCourseChanges(course.id, { expiry_months: m, never_expires: false }, true); await updateAllExpiriesForCourse(course.id, m, false); } setEditingHeader(null); }} className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-bold">Save</button>
                                    <button onClick={() => setEditingHeader(null)} className="px-2 py-0.5 bg-gray-500 hover:bg-gray-600 text-white rounded text-[10px]">×</button>
                                  </div>
                                </div>
                              ) : formatExpiryDisplay(course.expiry_months, course.never_expires)}
                            </th>
                          ));
                        })}
                      </tr>
                    </thead>

                    <tbody>
                      {(() => {
                        let currentDividerCollapsed = false;
                        return filteredStaff.map((staffMember: any) => {
                          const isDivider = staffDividers.has(staffMember.id);

                          if (isDivider) {
                            currentDividerCollapsed = collapsedDividers.has(staffMember.id);
                            const stats = getDividerStats(staffMember.id);
                            return (
                              <tr key={staffMember.id} draggable onDragStart={(e) => handleStaffDropStart(e, staffMember.id)} onDragOver={handleStaffDragOver} onDrop={(e) => handleStaffDropEnd(e, staffMember.id)} className={`border-b ${isDark ? 'bg-gray-900/80 border-gray-800' : 'bg-slate-100 border-slate-300'}`}>
                                <td className={`px-4 py-2.5 sticky left-0 z-10 border-r cursor-pointer select-none min-w-[240px] group/div ${isDark ? 'bg-gray-900/80 border-gray-800' : 'bg-slate-100 border-slate-300'}`} onClick={() => toggleDivider(staffMember.id)}>
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px]">{currentDividerCollapsed ? '▶' : '▼'}</span>
                                      <span className={`font-extrabold text-xs uppercase tracking-wide ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{staffMember.name}</span>
                                      <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-extrabold ${isDark ? 'bg-gray-800 text-gray-400' : 'bg-slate-200 text-slate-600'}`}>{stats.staffCount}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${stats.complianceRate >= 90 ? 'bg-emerald-500/20 text-emerald-400' : stats.complianceRate >= 75 ? 'bg-amber-500/20 text-amber-500' : 'bg-red-500/20 text-red-500'}`}>{stats.complianceRate}%</span>
                                      {canEditMatrix && <button onClick={(e) => { e.stopPropagation(); setGroupModal({ type: 'staff', editKey: staffMember.id }); }} className="text-blue-400 hover:text-blue-300 text-xs p-0.5" title="Edit or delete group">✎</button>}
                                      <button onClick={(e) => { e.stopPropagation(); deleteStaffMember(staffMember.id); }} className="opacity-0 group-hover/div:opacity-100 transition-opacity text-red-500 hover:text-red-400 text-[10px] p-0.5 hover:bg-red-500/10 rounded">✕</button>
                                    </div>
                                  </div>
                                </td>
                                <td colSpan={visibleColCount} className={`${isDark ? 'bg-gray-900/80' : 'bg-slate-100'}`} />
                              </tr>
                            );
                          }

                          if (currentDividerCollapsed) return null;

                          return (
                            <tr key={staffMember.id} draggable onDragStart={(e) => handleStaffDropStart(e, staffMember.id)} onDragOver={handleStaffDragOver} onDrop={(e) => handleStaffDropEnd(e, staffMember.id)} className={`border-b transition-colors duration-100 ${rowBorder} ${isDark ? 'hover:bg-gray-800/30' : 'hover:bg-slate-50/80'}`}>
                              <td className={`px-4 py-3 text-xs sticky left-0 z-10 border-r min-w-[240px] group/staff ${stickyLeft}`}>
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <input type="checkbox" onChange={() => selectAllForStaff(staffMember.id)} checked={courses.every((c: any) => selectedCells.has(`${staffMember.id}|${c.id}`))} className="w-3.5 h-3.5 cursor-pointer" title="Select all" />
                                    <span className="truncate max-w-[160px] font-medium" title={staffMember.name}>{staffMember.name}</span>
                                  </div>
                                  <button onClick={(e) => { e.stopPropagation(); deleteStaffMember(staffMember.id); }} className="opacity-0 group-hover/staff:opacity-100 transition-opacity text-red-500 hover:text-red-400 text-[10px] p-0.5 hover:bg-red-500/10 rounded flex-shrink-0" title="Remove">✕</button>
                                </div>
                              </td>

                              {categories.map(cat => {
                                const catCourses = coursesByCategory[cat] || [];
                                const isCollapsed = collapsedCategories.has(cat);
                                if (isCollapsed) {
                                  return (
                                    <CategorySummaryCell
                                      key={`${staffMember.id}|cat-${cat}`}
                                      staffMember={staffMember}
                                      coursesInCat={catCourses}
                                      matrixData={matrixData}
                                      isDark={isDark}
                                      onExpandClick={() => toggleCategory(cat)}
                                      checkStatus={checkStatus}
                                    />
                                  );
                                }

                                return catCourses.map((course: any) => {
                                  const cellKey = `${staffMember.id}|${course.id}`;
                                  const isSelected = selectedCells.has(cellKey);
                                  const cell = matrixData[staffMember.id]?.[course.id];
                                  const isEditing = editingCell?.staffId === staffMember.id && editingCell?.courseId === course.id;
                                  const isOneOff = course.never_expires || course.expiry_months === 9999 || course.expiry_months === null;
                                  const dateStatus = isOneOff ? 'no-expiry' : (cell?.expiry_date ? getDateStatus(cell.expiry_date) : 'expired');
                                  const cellDateColor = cell?.completion_date ? getDateColor(dateStatus) : (isDark ? 'bg-red-950/20 text-red-400' : 'bg-red-50 text-red-700');
                                  const statusDisplay = getStatusDisplay(cell?.status);

                                  return (
                                    <td key={cellKey} className={`px-3 py-3 text-center border-r border-b transition-all duration-100 relative group/cell ${rowBorder} ${canEditMatrix ? 'cursor-pointer' : ''} ${isSelected ? (isDark ? 'bg-blue-950/25' : 'bg-blue-50') : ''} ${canEditMatrix ? (isDark ? 'hover:bg-gray-800/40' : 'hover:bg-slate-50') : ''}`} onClick={(e) => { if ((e.target as HTMLElement).tagName === 'INPUT') return; if (canEditMatrix && !isEditing) { setEditingCell({ staffId: staffMember.id, courseId: course.id }); setEditDate(cell?.completion_date || ''); const rawStatus = cell?.status as any; const norm = rawStatus === 'booked' || rawStatus === 'awaiting' ? 'allocated' : rawStatus; setEditStatus(norm || 'completed'); } }}>
                                      <input type="checkbox" checked={isSelected} onChange={(e) => { e.stopPropagation(); toggleCellSelection(staffMember.id, course.id); }} className="absolute top-1.5 left-1.5 w-3.5 h-3.5 cursor-pointer opacity-0 group-hover/cell:opacity-100 transition-opacity" title="Select cell" />
                                      {isEditing ? (
                                        <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${isDark ? 'bg-blue-950/30 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>Editing</span>
                                      ) : cell?.status === 'allocated' || cell?.status === 'booked' || cell?.status === 'awaiting' ? (
                                        <div className={`py-1 rounded-lg text-[10px] font-bold shadow-sm ${statusDisplay.color}`}>
                                          <div>Allocated</div>
                                          {cell?.expiry_date && <div className="opacity-75 font-normal">{new Date(cell.expiry_date).toLocaleDateString('en-GB')}</div>}
                                        </div>
                                      ) : cell?.status === 'not_yet_due' ? (
                                        <div className={`py-1 rounded-lg text-[10px] font-bold shadow-sm ${statusDisplay.color}`}>Not Yet Due</div>
                                      ) : cell?.status === 'na' ? (
                                        <div className={`py-1 rounded-lg text-[10px] font-bold shadow-sm ${statusDisplay.color}`}>N/A</div>
                                      ) : cell?.completion_date ? (
                                        <div className={`py-1 rounded-lg text-[10px] font-bold shadow-sm ${cellDateColor}`}>
                                          <div>{new Date(cell.completion_date).toLocaleDateString('en-GB')}</div>
                                          {!isOneOff && cell.expiry_date && <div className="opacity-75 font-normal">Exp: {new Date(cell.expiry_date).toLocaleDateString('en-GB')}</div>}
                                          {isOneOff && <div className="opacity-75">One-Off</div>}
                                        </div>
                                      ) : (
                                        <div className={`py-1 rounded-lg text-[10px] font-bold ${isDark ? 'text-red-400 bg-red-950/10' : 'text-red-600 bg-red-50/60'}`}>Missing</div>
                                      )}
                                    </td>
                                  );
                                });
                              })}
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Edit Cell Modal */}
      {editingCell && (
        <div className={`fixed inset-0 flex items-center justify-center z-50 ${isDark ? 'bg-black/60' : 'bg-black/40'}`} onClick={() => { setEditingCell(null); setEditDate(''); setEditStatus(null); }}>
          <div className={`rounded-2xl p-6 shadow-2xl w-96 ${isDark ? 'bg-gray-900 border border-gray-800' : 'bg-white'}`} onClick={e => e.stopPropagation()}>
            <h3 className={`text-base font-black tracking-tight mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>Update Training Record</h3>
            <div className="mb-4">
              <label className={`block text-[10px] font-black uppercase tracking-widest mb-2 ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>Status</label>
              <div className="grid grid-cols-2 gap-2">
                {[['completed', 'In Date', 'bg-green-600'], ['allocated', 'Allocated', 'bg-blue-600'], ['not_yet_due', 'Not Yet Due', 'bg-purple-600'], ['na', 'N/A', 'bg-slate-600']].map(([val, label, activeCls]) => (
                  <button key={val} onClick={() => setEditStatus(val as any)} className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${editStatus === val ? `${activeCls} text-white shadow-sm` : isDark ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{label}</button>
                ))}
              </div>
            </div>
            {editStatus === 'completed' && (
              <div className="mb-5">
                <label className={`block text-[10px] font-black uppercase tracking-widest mb-2 ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>Completion Date</label>
                <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className={`w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${isDark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-800'}`} autoFocus />
                <p className="text-[10px] text-slate-400 mt-1.5 italic">Expiry date auto-calculated from course settings.</p>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => { if (editStatus === 'completed' && !editDate) { alert('Please select a completion date'); return; } if (!editStatus) { alert('Please select a status'); return; } const sm = staff.find((s: any) => s.id === editingCell.staffId); const co = courses.find((c: any) => c.id === editingCell.courseId); const ce = matrixData[editingCell.staffId]?.[editingCell.courseId]; if (sm && co) handleSaveTraining(sm.id, co.id, ce?.training_id || null, editStatus === 'completed' ? editDate : null, editStatus); }} className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold transition-colors">Save</button>
              <button onClick={() => { setEditingCell(null); setEditDate(''); setEditStatus(null); }} className={`flex-1 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors ${isDark ? 'bg-gray-800 hover:bg-gray-700 text-gray-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Edit Modal */}
      {bulkEditMode && (
        <div className={`fixed inset-0 flex items-center justify-center z-50 ${isDark ? 'bg-black/60' : 'bg-black/40'}`} onClick={() => setBulkEditMode(false)}>
          <div className={`rounded-2xl p-6 shadow-2xl w-96 ${isDark ? 'bg-gray-900 border border-gray-800' : 'bg-white'}`} onClick={e => e.stopPropagation()}>
            <h3 className={`text-base font-black tracking-tight mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>Bulk Update ({selectedCells.size} cells)</h3>
            <div className="mb-4">
              <label className={`block text-[10px] font-black uppercase tracking-widest mb-2 ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>Status</label>
              <div className="grid grid-cols-2 gap-2">
                {[['completed', 'In Date', 'bg-green-600'], ['allocated', 'Allocated', 'bg-blue-600'], ['not_yet_due', 'Not Yet Due', 'bg-purple-600'], ['na', 'N/A', 'bg-slate-600']].map(([val, label, activeCls]) => (
                  <button key={val} onClick={() => setBulkEditStatus(val as any)} className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${bulkEditStatus === val ? `${activeCls} text-white shadow-sm` : isDark ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{label}</button>
                ))}
              </div>
            </div>
            {bulkEditStatus === 'completed' && (
              <div className="mb-5">
                <label className={`block text-[10px] font-black uppercase tracking-widest mb-2 ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>Completion Date</label>
                <input type="date" value={bulkEditDate} onChange={(e) => setBulkEditDate(e.target.value)} className={`w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${isDark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-800'}`} />
                <p className="text-[10px] text-slate-400 mt-1.5 italic">Expiry date auto-calculated from course settings.</p>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={applyBulkUpdate} className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold transition-colors">Apply to {selectedCells.size} Cells</button>
              <button onClick={() => { setBulkEditMode(false); setBulkEditStatus(null); setBulkEditDate(''); }} className={`flex-1 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors ${isDark ? 'bg-gray-800 hover:bg-gray-700 text-gray-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Group Manager Modal */}
      {groupModal && (
        <GroupManagerModal
          initialType={groupModal.type}
          editKey={groupModal.editKey}
          onClose={() => setGroupModal(null)}
        />
      )}
    </div>
  );
}
