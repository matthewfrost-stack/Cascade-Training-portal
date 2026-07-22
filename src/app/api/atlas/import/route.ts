import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import readXlsxFile from 'read-excel-file/node';
import { requireRole } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

type ImportChangeRecord = {
  staff: string;
  locations: string;
  course: string;
  oldDate: string;
  newDate: string;
  action: 'updated' | 'created';
};

type IgnoredStaffReason = 'manual_ignore' | 'not_in_database';

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function getConfiguredIgnoredNames(): Set<string> {
  const raw = process.env.ATLAS_IMPORT_IGNORE_STAFF_NAMES || '';
  if (!raw.trim()) return new Set();

  return new Set(
    raw
      .split(',')
      .map((name) => normalizeName(name))
      .filter(Boolean)
  );
}

function toDdMmYyyy(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear());
  return `${day}/${month}/${year}`;
}

function cellValueToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return toDdMmYyyy(value);
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';

  return String(value).trim();
}

export async function POST(request: NextRequest) {
  try {
    const authz = await requireRole(['admin']);
    if ('error' in authz) return authz.error;

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided', success: false, summary: { processed: 0, updated: 0, created: 0, changes: 0, errors: 1 }, changes: [], errors: [{ error: 'No file provided' }] },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    // Parse Excel file with proper structure understanding
    // Row 1: Keys/Legend
    // Row 2: Course names (starting from column B)
    // Rows 3+: Staff names in column A with dates in course columns
    let records: any[] = [];
    try {
      const buffer = await file.arrayBuffer();
      const rows = await readXlsxFile(Buffer.from(buffer));
      const allData: string[][] = rows.map((row) => row.map((cell) => cellValueToString(cell)));
      
      console.log(`Excel file has ${allData.length} rows`);
      
      if (allData.length < 3) {
        return NextResponse.json({
          success: false,
          summary: { processed: 0, updated: 0, created: 0, changes: 0, errors: 1 },
          changes: [],
          errors: [{ error: 'Excel file does not have expected structure (needs at least 3 rows: key row, header row, and data rows)' }]
        }, { status: 400 });
      }
      
      // With header: 1, the data is in allData[0] onwards as arrays
      // We need to manually create records from the raw arrays
      const headerRowIndex = allData.findIndex((row: any, idx: number) => {
        if (idx > 10) return false; // Only scan the first few rows
        const firstCell = String(row?.[0] || '').trim().toLowerCase();
        return firstCell.includes('staff name') || firstCell.includes("learner's name") || firstCell === 'learner name';
      });

      const resolvedHeaderRowIndex = headerRowIndex >= 0 ? headerRowIndex : 1;
      const headerRow = allData[resolvedHeaderRowIndex] as any[]; // Row with course names
      const dataRows = allData.slice(resolvedHeaderRowIndex + 1); // Rows after header contain staff data
      
      console.log(`Header row index: ${resolvedHeaderRowIndex}`);
      console.log(`Header row (headers): ${JSON.stringify(headerRow)}`);
      
      // Create records array from raw data
      records = dataRows.map((row: any, idx: number) => {
        if (!row || row.length === 0) return null;
        
        const staffName = String(row[0] || '').trim(); // Column A = staff name
        if (!staffName) return null;
        
        const record: any = { staffName };
        
        // Map course columns (starting from column B, index 1)
        for (let colIdx = 1; colIdx < headerRow.length; colIdx++) {
          const courseName = String(headerRow[colIdx] || '').trim();
          if (courseName) {
            record[courseName] = String(row[colIdx] || '').trim();
          }
        }
        
        return record;
      }).filter((r: any) => r !== null && r.staffName);
      
      console.log(`Extracted ${records.length} staff records from data rows`);
      if (records.length > 0) {
        console.log(`First record: ${JSON.stringify(records[0])}`);
      }
    } catch (parseError) {
      console.error('Excel parse error:', parseError);
      return NextResponse.json({
        success: false,
        summary: { processed: 0, updated: 0, created: 0, changes: 0, errors: 1 },
        changes: [],
        errors: [{ error: `Failed to parse Excel file: ${parseError instanceof Error ? parseError.message : 'Unknown error'}` }]
      }, { status: 400 });
    }

    if (!records || records.length === 0) {
      return NextResponse.json({
        success: false,
        summary: { processed: 0, updated: 0, created: 0, changes: 0, errors: 1 },
        changes: [],
        errors: [{ error: 'Excel file is empty or has no data rows' }]
      }, { status: 400 });
    }

    // Get column headers (course names) from the first row
    const headers = Object.keys(records[0] || {});
    if (headers.length === 0) {
      return NextResponse.json({
        success: false,
        summary: { processed: 0, updated: 0, created: 0, changes: 0, errors: 1 },
        changes: [],
        errors: [{ error: 'No columns found in Excel file. Make sure the file has headers.' }]
      }, { status: 400 });
    }

    const firstColumnName = headers[0]; // Name of the first column (should be "Keys" or "Learner's Name")
    
    // Get all TRAINING courses (Careskills) and staff from database FIRST
    const { data: dbTrainingCourses } = await supabase
      .from('training_courses')
      .select('id, name, careskills_name, expiry_months');

    const courseMap = new Map();
    dbTrainingCourses?.forEach(course => {
      courseMap.set(course.name.toLowerCase(), course.id);
      if (course.careskills_name) {
        courseMap.set(course.careskills_name.toLowerCase(), course.id);
      }
    });

    // Get all staff from database (only active staff)
    const { data: dbStaff } = await supabase
      .from('profiles')
      .select('id, full_name, location')
      .eq('is_deleted', false);

    // Get all locations to map names to IDs
    const { data: allLocations } = await supabase.from('locations').select('id, name');
    const locationNameToId = new Map<string, string>();
    allLocations?.forEach(loc => {
      locationNameToId.set(loc.name.toLowerCase().trim(), loc.id);
    });

    const staffMap = new Map();
    const staffLocations = new Map();
    
    if (dbStaff && dbStaff.length > 0) {
      dbStaff.forEach(staff => {
        staffMap.set(staff.full_name.toLowerCase(), staff.id);
        const initialLocs: any[] = [];
        if (staff.location) {
          const matchedId = locationNameToId.get(staff.location.toLowerCase().trim());
          if (matchedId) {
            initialLocs.push({ id: matchedId, name: staff.location.trim() });
          }
        }
        staffLocations.set(staff.id, initialLocs);
      });

      // Get staff locations in a separate query for better reliability
      const { data: staffLocData } = await supabase
        .from('staff_locations')
        .select('staff_id, location_id, locations(name)');

      if (staffLocData) {
        staffLocData.forEach((sl: any) => {
          const staffId = sl.staff_id;
          const locId = sl.location_id;
          const locName = sl.locations?.name;
          if (locName) {
            const existing = staffLocations.get(staffId) || [];
            if (!existing.some((e: any) => e.id === locId)) {
              staffLocations.set(staffId, [...existing, { id: locId, name: locName }]);
            }
          }
        });
      }
    }

    // With the new structure, records have course names as keys directly
    // Each record has: { staffName: "...", "Course A": "date", "Course B": "date", ... }
    // So we just need to iterate through each record and match courses to the database

    console.log(`=== ATLAS IMPORT DEBUG ===`);
    console.log(`Loaded ${records.length} staff records from Excel`);
    console.log(`Training courses in database: ${courseMap.size}, Staff in database: ${staffMap.size}`);
    
    // Show actual course names from database
    console.log(`Database training courses: ${Array.from(courseMap.keys()).slice(0, 10).join(', ')}${courseMap.size > 10 ? '...' : ''}`);
    console.log(`Database staff sample: ${Array.from(staffMap.keys()).slice(0, 5).join(', ')}`);
    
    // Show sample data
    if (records.length > 0) {
      console.log(`First record keys: ${Object.keys(records[0]).join(', ')}`);
      console.log(`Sample first record:`, records[0]);
    }
    
    // Collect all course names from the records (all keys except staffName)
    const coursesInRecords = new Set<string>();
    for (const record of records) {
      for (const key of Object.keys(record)) {
        if (key !== 'staffName') {
          coursesInRecords.add(key);
        }
      }
    }
    
    console.log(`Found ${coursesInRecords.size} unique courses in Excel records: ${Array.from(coursesInRecords).slice(0, 10).join(', ')}${coursesInRecords.size > 10 ? '...' : ''}`);
    
    const normalizeCourseName = (name: string) => {
      return name
        .replace(/\s*\(Careskills\)\s*$/i, '')
        .replace(/\s*\(step\s*\d+\)\s*$/i, '')
        .replace(/\s*-\s*step\s*\d+\s*$/i, '')
        .replace(/\s*step\s*\d+\s*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
    };

    // Match courses from Excel to database with fuzzy matching
    const recordCourseToDB = new Map<string, { id: string; name: string }>();
    const unmatchedCourses: string[] = [];
    
    for (const excelCourse of coursesInRecords) {
      // First try exact match
      const normalizedExcelCourse = normalizeCourseName(excelCourse);
      let courseId = courseMap.get(excelCourse.toLowerCase());
      let matchedName = excelCourse;
      
      // If exact match fails, try normalized match
      if (!courseId && normalizedExcelCourse) {
        courseId = courseMap.get(normalizedExcelCourse.toLowerCase());
        if (courseId) {
          matchedName = normalizedExcelCourse;
        }
      }
      
      // If still not found, try partial matching
      if (!courseId) {
        const excelWords = normalizedExcelCourse.toLowerCase().split(/\s+/).filter(Boolean);
        for (const [dbCourseLower, dbCourseId] of courseMap) {
          const dbWords = dbCourseLower.split(/\s+/);
          // Check if at least 80% of Excel words are in database course
          const matchingWords = excelWords.filter(w => dbWords.some((dw: string) => dw.includes(w) || w.includes(dw)));
          if (matchingWords.length / Math.max(excelWords.length, 1) >= 0.8) {
            courseId = dbCourseId;
            matchedName = dbCourseLower;
            break;
          }
        }
      }
      
      if (courseId) {
        recordCourseToDB.set(excelCourse, { id: courseId, name: matchedName });
        console.log(`  ✓ "${excelCourse}" -> ID: ${courseId}`);
      } else {
        unmatchedCourses.push(excelCourse);
        console.log(`  ✗ "${excelCourse}" -> NOT FOUND`);
      }
    }
    
    console.log(`Matched ${recordCourseToDB.size} courses out of ${coursesInRecords.size}`);
    if (unmatchedCourses.length > 0) {
      console.log(`Unmatched courses (first 5): ${unmatchedCourses.slice(0, 5).join(', ')}`);
    }
    
    // Show sample staff names and their match status
    console.log(`\nSample staff names from Excel:`);
    const excelStaffNames = records.slice(0, 5).map(r => r.staffName);
    const dbSampleNames = Array.from(staffMap.keys()).slice(0, 5);
    console.log(`Database sample: ${dbSampleNames.join(' | ')}`);
    for (const staffName of excelStaffNames) {
      const found = staffMap.has(staffName.toLowerCase());
      console.log(`  "${staffName}" -> ${found ? '✓ FOUND' : '✗ NOT FOUND'}`);
    }

    // Parse data rows with new record structure
    const updates: any[] = [];
    const errors: any[] = [];
    const ignoredStaff = new Set<string>();
    const ignoredMissingStaff = new Set<string>();
    const ignoredStaffReasons = new Map<string, IgnoredStaffReason>();
    const ignoredStaffNames = getConfiguredIgnoredNames();

    console.log(`Processing ${records.length} records`);
    console.log(`Found ${recordCourseToDB.size} courses to match`);
    
    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const staffName = row.staffName?.trim();

      if (!staffName) {
        console.log(`Row ${i}: Skipping empty staff name`);
        continue; // Skip empty rows
      }

      if (ignoredStaffNames.has(normalizeName(staffName))) {
        ignoredStaff.add(staffName);
        ignoredStaffReasons.set(staffName, 'manual_ignore');
        continue;
      }

      const staffId = staffMap.get(staffName.toLowerCase());

      if (!staffId) {
        console.log(`Skipping staff not in database: "${staffName}"`);
        ignoredMissingStaff.add(staffName);
        ignoredStaffReasons.set(staffName, 'not_in_database');
        continue;
      }

      // Get the staff member's location
      const staffLocList = staffLocations.get(staffId) || [];
      if (staffLocList.length === 0) {
        console.log(`No location found for staff: "${staffName}"`);
        errors.push({
          row: i + 1,
          name: staffName,
          error: 'Staff member has no location assigned'
        });
        continue;
      }

      // Use the first location (or primary location if available)
      const staffLocationId = staffLocList[0].id;

      // Process each course key in this staff record
      for (const [excelCourseName, courseInfo] of recordCourseToDB) {
        const dateValue = (row as any)[excelCourseName]?.toString().trim();
        
        if (!dateValue || dateValue.length === 0) {
          continue; // No data in this cell
        }

        const courseId = courseInfo.id;
        const courseName = courseInfo.name;

        // Parse date - handle both string dates and Excel date numbers
        let completionDate = null;
        if (dateValue) {
          // Try to parse as DD/MM/YYYY
          const parts = dateValue.split('/');
          if (parts.length === 3) {
            const day = parts[0];
            const month = parts[1];
            const year = parts[2];
            completionDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          } else if (!isNaN(Number(dateValue))) {
            // Excel date number - convert to JS date
            const excelDate = parseInt(dateValue);
            const jsDate = new Date((excelDate - 25569) * 86400 * 1000);
            completionDate = jsDate.toISOString().split('T')[0];
          }
        }

        if (completionDate) {
          updates.push({
            staff_id: staffId,
            staff_name: staffName,
            course_id: courseId,
            course_name: courseName,
            completion_date: completionDate,
            completed_at_location_id: staffLocationId
          });
        }
      }
    }
    
    console.log(`Created ${updates.length} update records from Excel data`);

    // Atlas exports can contain repeated course columns (aliases, renamed
    // headers, or duplicate sections). Keep the populated value for each
    // staff/course pair once so a duplicate cannot make an entire upsert batch
    // fail or cause one matrix location to be skipped.
    const uniqueUpdates: any[] = Array.from(
      updates.reduce((map, update) => {
        map.set(`${update.staff_id}|${update.course_id}`, update);
        return map;
      }, new Map<string, any>()).values()
    );
    console.log(`Using ${uniqueUpdates.length} unique populated staff/course values`);

    // Now process updates - check what's actually changed
    // Get unique staff IDs from the updates
    const uniqueStaffIds = [...new Set(uniqueUpdates.map(u => u.staff_id))];
    const uniqueCourseIds = [...new Set(uniqueUpdates.map(u => u.course_id))];
    
    console.log(`Querying existing records for ${uniqueStaffIds.length} staff and ${uniqueCourseIds.length} courses...`);
    
    // Query in small batches to avoid Supabase's 1000 row limit per query
    // Each staff can have up to 47 courses, so batch size of 20 = max 940 results per query
    const existingMap = new Map<string, { id: string; completion_date: string | null }>();
    const QUERY_BATCH_SIZE = 20;
    const PAGE_SIZE = 1000;
    
    for (let i = 0; i < uniqueStaffIds.length; i += QUERY_BATCH_SIZE) {
      const staffBatch = uniqueStaffIds.slice(i, i + QUERY_BATCH_SIZE);
      
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data: existingRecords, error } = await supabase
          .from('staff_training_matrix')
          .select('id, staff_id, course_id, completion_date, completed_at_location_id')
          .in('staff_id', staffBatch)
          .in('course_id', uniqueCourseIds)
          .range(from, from + PAGE_SIZE - 1);
        
        if (error) {
          console.error('Error fetching existing records:', error.message);
          break;
        }

        const rows = existingRecords || [];
        rows.forEach((record: any) => {
          const locationKey = record.completed_at_location_id || '';
          const key = `${record.staff_id}|${record.course_id}|${locationKey}`;
          existingMap.set(key, {
            id: record.id,
            completion_date: record.completion_date || null,
          });
        });

        if (rows.length < PAGE_SIZE) {
          hasMore = false;
        } else {
          from += PAGE_SIZE;
        }
      }
      
      // Log progress for large batches
      if (i > 0 && i % 100 === 0) {
        console.log(`  Queried ${i} of ${uniqueStaffIds.length} staff...`);
      }
    }
    
    console.log(`Found ${existingMap.size} existing records to check against`);

    const toUpdateExisting: Array<{
      id: string;
      completion_date: string;
      expiry_date: string | null;
      change: ImportChangeRecord;
    }> = [];
    const toInsertNew: Array<{
      payload: {
        staff_id: string;
        course_id: string;
        completion_date: string;
        expiry_date: string | null;
        status: 'completed' | 'allocated';
        completed_at_location_id?: string;
        created_at: string;
      };
      change: ImportChangeRecord;
    }> = [];

    const processedLocationKeys = new Set<string>();
    for (const update of uniqueUpdates) {
      const newDate = update.completion_date || null;
      if (!newDate) continue;

      const staffLocs = staffLocations.get(update.staff_id) || [];
      const targetLocationIds = Array.from(new Set(
        staffLocs
          .map((loc: any) => typeof loc === 'string' ? loc : loc?.id)
          .filter(Boolean)
      ));

      const locations = staffLocations.get(update.staff_id) || [];
      const locationNames = locations.map((l: any) => typeof l === 'string' ? l : l.name).join(', ');

      // Get course expiry_months to calculate expiry_date
      const course = dbTrainingCourses?.find(c => c.id === update.course_id);
      const expiryMonths = course?.expiry_months ?? 12;

      let expiryDate = null;
      if (update.completion_date && expiryMonths) {
        const completionDate = new Date(update.completion_date);
        const expiryDateObj = new Date(completionDate);
        expiryDateObj.setMonth(expiryDateObj.getMonth() + expiryMonths);
        expiryDate = expiryDateObj.toISOString().split('T')[0];
      }

      for (const locId of targetLocationIds) {
        const locationKey = locId || '';
        const processedLocationKey = `${update.staff_id}|${update.course_id}|${locationKey}`;
        if (processedLocationKeys.has(processedLocationKey)) continue;
        processedLocationKeys.add(processedLocationKey);

        const existingKey = `${update.staff_id}|${update.course_id}|${locationKey}`;
        const existing = existingMap.get(existingKey);
        const oldDate = existing?.completion_date || null;
        const hasActualChange = oldDate !== newDate;

        if (!hasActualChange) continue;

        const changeBase = {
          staff: update.staff_name,
          locations: locationNames,
          course: update.course_name,
          oldDate: oldDate || 'None',
          newDate: newDate
        };

        if (existing) {
          toUpdateExisting.push({
            id: existing.id,
            completion_date: update.completion_date,
            expiry_date: expiryDate,
            change: {
              ...changeBase,
              action: 'updated'
            }
          });
        } else {
          toInsertNew.push({
            payload: {
              staff_id: update.staff_id,
              course_id: update.course_id,
              completion_date: update.completion_date,
              expiry_date: expiryDate,
              status: update.completion_date ? 'completed' : 'allocated',
              completed_at_location_id: locId,
              created_at: new Date().toISOString()
            },
            change: {
              ...changeBase,
              action: 'created'
            }
          });
        }
      }
    }

    // Apply updates in batches for better performance
    let updatedCount = 0;
    let createdCount = 0;
    const updatedRecords: ImportChangeRecord[] = [];
    const createdRecords: ImportChangeRecord[] = [];

    console.log(`Applying ${toUpdateExisting.length} updates and ${toInsertNew.length} inserts...`);

    // Batch updates (update existing records)
    const UPDATE_BATCH_SIZE = 100;
    for (let i = 0; i < toUpdateExisting.length; i += UPDATE_BATCH_SIZE) {
      const batch = toUpdateExisting.slice(i, i + UPDATE_BATCH_SIZE);
      
      // Update each record in the batch and track successes
      const results = await Promise.all(
        batch.map(async (update) => {
          console.log(`Updating record ${update.id}: ${update.change.staff} / ${update.change.course} from ${update.change.oldDate} to ${update.change.newDate}`);
          
          const result = await supabase
            .from('staff_training_matrix')
            .update({
              completion_date: update.completion_date,
              expiry_date: update.expiry_date,
              status: 'completed'
            })
            .eq('id', update.id);
          
          if (result.error) {
            console.error(`  ✗ Error updating record ${update.id}:`, result.error);
          } else {
            console.log(`  ✓ Successfully updated record ${update.id}`);
          }
          
          return { update, success: !result.error };
        })
      );
      
      // Track successful updates
      results.forEach(r => {
        if (r.success) {
          updatedCount++;
          updatedRecords.push(r.update.change);
        }
      });
      
      if ((i + UPDATE_BATCH_SIZE) % 500 === 0) {
        console.log(`  Updated ${Math.min(i + UPDATE_BATCH_SIZE, toUpdateExisting.length)} of ${toUpdateExisting.length}...`);
      }
    }

    // Batch inserts (create new records) - use upsert to handle duplicates gracefully
    const INSERT_BATCH_SIZE = 100;
    for (let i = 0; i < toInsertNew.length; i += INSERT_BATCH_SIZE) {
      const batch = toInsertNew.slice(i, i + INSERT_BATCH_SIZE);
      const payload = batch.map(item => item.payload);
      
      console.log(`Inserting batch of ${payload.length} records...`);
      console.log(`  Sample: ${payload[0] ? `${payload[0].staff_id} / ${payload[0].course_id} -> ${payload[0].completion_date}` : 'none'}`);
      
      let { error, data } = await supabase
        .from('staff_training_matrix')
        .upsert(payload, { onConflict: 'staff_id,course_id,completed_at_location_id' });

      // Support older deployments still using the legacy unique key.
      if (error?.code === '42P10') {
        const fallback = await supabase
          .from('staff_training_matrix')
          .upsert(payload, { onConflict: 'staff_id,course_id' });
        error = fallback.error;
        data = fallback.data;
      }

      if (!error) {
        createdCount += payload.length;
        console.log(`  ✓ Inserted ${payload.length} records successfully`);
        batch.forEach(item => {
          createdRecords.push(item.change);
        });
      } else {
        console.error(`  ✗ Insert batch error: ${error.message} (code: ${error.code})`);
        console.error(`    Batch details:`, payload.slice(0, 2));
      }
      
      if ((i + INSERT_BATCH_SIZE) % 500 === 0) {
        console.log(`  Inserted ${Math.min(i + INSERT_BATCH_SIZE, toInsertNew.length)} of ${toInsertNew.length}...`);
      }
    }

    console.log(`✓ Atlas import complete: ${updatedCount} updated, ${createdCount} created, ${errors.length} errors`);
    console.log(`  Showing ${updatedRecords.length + createdRecords.length} successful changes in report`);

    return NextResponse.json({
      success: true,
      summary: {
        processed: uniqueUpdates.length,
        updated: updatedCount,
        created: createdCount,
        changes: updatedRecords.length + createdRecords.length,
        ignored: ignoredStaff.size + ignoredMissingStaff.size,
        ignoredNotInDatabase: ignoredMissingStaff.size,
        errors: errors.length
      },
      changes: [...updatedRecords, ...createdRecords],
      updatedRecords,
      createdRecords,
      ignoredStaff: Array.from(ignoredStaff),
      ignoredMissingStaff: Array.from(ignoredMissingStaff),
      ignoredStaffReasons: Array.from(ignoredStaffReasons.entries()).map(([name, reason]) => ({ name, reason })),
      errors: errors.slice(0, 20) // Show first 20 errors
    });
  } catch (error) {
    console.error('Error in atlas import:', error);
    return NextResponse.json({
      success: false,
      summary: {
        processed: 0,
        updated: 0,
        created: 0,
        changes: 0,
        errors: 1
      },
      changes: [],
      errors: [{ error: `Failed to process file: ${error instanceof Error ? error.message : 'Unknown error'}` }]
    }, { status: 500 });
  }
}
