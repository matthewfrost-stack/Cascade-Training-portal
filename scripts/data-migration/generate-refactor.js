const fs = require('fs');
const path = require('path');

const logicPath = path.join(__dirname, 'logic.tsx.txt');
const jsxPath = path.join(__dirname, 'jsx.tsx.txt');

let logic = fs.readFileSync(logicPath, 'utf8');
let jsx = fs.readFileSync(jsxPath, 'utf8');

// 1. Create MatrixContext.tsx
const contextCode = `
'use client';
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { parseFirstThreeRowsFromCsvString, CsvHeaderRows } from './csvHeaderUtils';
import { debugLog } from '@/lib/debug';
import { Staff, Course, MatrixCell, RemovedCourseEntry } from './types';

// Helper to get CSV URL for a location name (public folder)
function getCsvUrlForLocation(locationName: string): string {
  return \`/csv-import/\${locationName} Training Matrix - Staff Matrix.csv\`;
}

function normalizeCourseName(name: string): string {
  return name.replace(/\\s+/g, ' ').trim().toLowerCase();
}

interface MatrixContextType {
  // We will export everything from the context by typing it as 'any' for now to allow rapid refactoring,
  // then we can strict-type it later.
  [key: string]: any;
}

const MatrixContext = createContext<MatrixContextType | undefined>(undefined);

export function MatrixProvider({ children }: { children: React.ReactNode }) {
${logic.replace(/^'use client';\n/, '').replace(/import .*?;\n/g, '').replace(/function getCsvUrlForLocation[\s\S]*?normalizeCourseName.*?\n}\n/, '').replace(/interface Staff[\s\S]*?RemovedCourseEntry .*?\n}\n/, '').replace(/export default function TrainingMatrixPage\(\) \{/, '').trim()}
  
  // Return all state and methods to context
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
    selectAllForStaff, clearAllSelections, applyBulkUpdate, updateAllExpiriesForCourse, handleSaveTraining
  };

  return <MatrixContext.Provider value={contextValue}>{children}</MatrixContext.Provider>;
}

export function useMatrix() {
  const context = useContext(MatrixContext);
  if (context === undefined) {
    throw new Error('useMatrix must be used within a MatrixProvider');
  }
  return context;
}
`;

fs.writeFileSync(path.join(__dirname, '../../src/app/training-matrix/context/MatrixContext.tsx'), contextCode);

// 2. Create MatrixLayout.tsx
const layoutCode = `
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

  ${jsx}
`;

fs.writeFileSync(path.join(__dirname, '../../src/app/training-matrix/components/MatrixLayout.tsx'), layoutCode);

// 3. Create page.tsx wrapper
const pageCode = `
'use client';
import { MatrixProvider } from './context/MatrixContext';
import { MatrixLayout } from './components/MatrixLayout';

export default function TrainingMatrixPage() {
  return (
    <MatrixProvider>
      <MatrixLayout />
    </MatrixProvider>
  );
}
`;

fs.writeFileSync(path.join(__dirname, '../../src/app/training-matrix/page.tsx'), pageCode);
