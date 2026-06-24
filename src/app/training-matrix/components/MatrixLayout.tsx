'use client';
import React from 'react';
import { useMatrix } from '../context/MatrixContext';
import { Course, Staff, MatrixCell } from '../types';
import BackButton from '@/app/components/BackButton';
import UniformButton from '@/app/components/UniformButton';
import TrainingCourseChecker from '@/app/components/TrainingCourseChecker';

export function MatrixLayout() {
  const {
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
    selectAllForStaff, clearAllSelections, applyBulkUpdate, updateAllExpiriesForCourse, handleSaveTraining
  } = useMatrix();

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
                className={`px-4 py-2 rounded-lg border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                  } focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200`}
              >
                {locations.map((loc: any) => (
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
                          className={`px-3 py-2 rounded border text-sm transition-colors duration-150 ${isDark
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
                          className={`px-3 py-2 rounded border text-sm transition-colors duration-150 ${isDark
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
              <div className={`w-full max-w-4xl rounded-lg border px-4 py-2 text-sm flex items-center justify-between ${isDark ? 'bg-amber-900/20 border-amber-700 text-amber-200' : 'bg-amber-50 border-amber-300 text-amber-800'
                }`}>
                <span>
                  Removed from this location: <strong>{lastRemovedCourse.course_name}</strong>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={undoRemoveCourse}
                    className={`px-3 py-1 rounded font-semibold ${isDark ? 'bg-amber-700 hover:bg-amber-600 text-white' : 'bg-amber-500 hover:bg-amber-600 text-white'
                      }`}
                  >
                    Undo
                  </button>
                  <button
                    onClick={() => setLastRemovedCourse(null)}
                    className={`px-3 py-1 rounded ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-200 hover:bg-gray-300 text-gray-800'
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
                              const updatedCourses = courses.map(c => c.id === course.id ? { ...c, category: newCategory } : c);
                              setCourses(updatedCourses);
                              saveCategoryOverride(selectedLocation, course.id, newCategory || '');
                              setEditingHeader(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const newCategory = editHeaderValue.trim() || undefined;
                                const updatedCourses = courses.map(c => c.id === course.id ? { ...c, category: newCategory } : c);
                                setCourses(updatedCourses);
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
                        className={`px-2 py-1 text-center text-xs font-semibold ${isDark ? 'text-gray-300' : 'text-gray-700'} min-w-[140px] transition-all duration-150 cursor-grab active:cursor-grabbing hover:opacity-80 ${isDark ? 'bg-gray-600' : 'bg-gray-200'}`}
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
                        className={`border-b transition-all duration-150 ${isDivider
                          ? `${isDark ? 'bg-gray-900' : 'bg-gray-300'}`
                          : `${isDark ? 'border-gray-700 hover:bg-gray-750' : 'border-gray-200 hover:bg-gray-50'}`
                          }`}
                      >
                        <td
                          className={`px-4 py-2 font-medium sticky left-0 min-w-[200px] z-10 text-sm group ${isDivider
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
                              className={`px-4 py-3 text-center transition-all duration-200 relative group ${canEditMatrix ? 'cursor-pointer hover:opacity-75' : ''
                                } ${isSelected ? (isDark ? 'bg-blue-900/30' : 'bg-blue-100') : ''}`}
                              onClick={(e) => {
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
                  className={`px-3 py-2 rounded text-sm font-medium transition-colors ${editStatus === 'completed'
                    ? isDark ? 'bg-green-600 text-white' : 'bg-green-500 text-white'
                    : isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                >
                  In Date
                </button>
                <button
                  onClick={() => setEditStatus('allocated')}
                  className={`px-3 py-2 rounded text-sm font-medium transition-colors ${editStatus === 'allocated'
                    ? isDark ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white'
                    : isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                >
                  Allocated
                </button>
                <button
                  onClick={() => setEditStatus('not_yet_due')}
                  className={`px-3 py-2 rounded text-sm font-medium transition-colors ${editStatus === 'not_yet_due'
                    ? isDark ? 'bg-purple-600 text-white' : 'bg-purple-500 text-white'
                    : isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                >
                  Not Yet Due
                </button>
                <button
                  onClick={() => setEditStatus('na')}
                  className={`px-3 py-2 rounded text-sm font-medium transition-colors ${editStatus === 'na'
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
                  className={`px-3 py-2 rounded text-sm font-medium transition-colors ${bulkEditStatus === 'completed'
                    ? isDark ? 'bg-green-600 text-white' : 'bg-green-500 text-white'
                    : isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                >
                  In Date
                </button>
                <button
                  onClick={() => setBulkEditStatus('allocated')}
                  className={`px-3 py-2 rounded text-sm font-medium transition-colors ${bulkEditStatus === 'allocated'
                    ? isDark ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white'
                    : isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                >
                  Allocated
                </button>
                <button
                  onClick={() => setBulkEditStatus('not_yet_due')}
                  className={`px-3 py-2 rounded text-sm font-medium transition-colors ${bulkEditStatus === 'not_yet_due'
                    ? isDark ? 'bg-purple-600 text-white' : 'bg-purple-500 text-white'
                    : isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                >
                  Not Yet Due
                </button>
                <button
                  onClick={() => setBulkEditStatus('na')}
                  className={`px-3 py-2 rounded text-sm font-medium transition-colors ${bulkEditStatus === 'na'
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
}