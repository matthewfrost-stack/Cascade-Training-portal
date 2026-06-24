import fs from 'fs';
import path from 'path';
import { parse as csvParse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CSV_FOLDER = '/Users/matthewfrost/training-portal/csv-import';

function extractLocationFromFilename(filename) {
  const parts = filename.split(' Training Matrix');
  return parts.length > 0 ? parts[0].trim() : null;
}

function parseDate(dateStr) {
  if (!dateStr || dateStr.trim() === '') return null;
  
  const parts = dateStr.trim().split('/');
  if (parts.length !== 3) return null;
  
  const day = parseInt(parts[0]);
  const month = parseInt(parts[1]);
  const year = parseInt(parts[2]);
  
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  
  const date = new Date(year, month - 1, day);
  return date.toISOString().split('T')[0];
}

function calculateExpiryDate(completionDateStr, months) {
  if (!completionDateStr || !months) return null;
  const date = new Date(completionDateStr);
  date.setMonth(date.getMonth() + months);
  return date.toISOString().split('T')[0];
}

async function fullUpsertRebuild() {
  console.log('\n' + '═'.repeat(120));
  console.log('  FULL REBUILD WITH UPSERT - ALL RECORDS FROM CSV');
  console.log('═'.repeat(120) + '\n');

  // Load reference data
  const { data: locations } = await supabase.from('locations').select('id, name');
  const { data: staffProfiles } = await supabase.from('profiles').select('id, full_name').eq('is_deleted', false);
  const { data: courses } = await supabase.from('courses').select('id, name, expiry_months');

  const locationMap = {};
  locations?.forEach(loc => {
    locationMap[loc.name] = loc.id;
  });

  const staffMap = {};
  staffProfiles?.forEach(staff => {
    staffMap[staff.full_name] = staff.id;
  });

  const courseMap = {};
  courses?.forEach(course => {
    courseMap[course.name] = { id: course.id, expiry_months: course.expiry_months };
  });

  console.log(`Loaded: ${Object.keys(locationMap).length} locations, ${Object.keys(staffMap).length} staff, ${Object.keys(courseMap).length} courses\n`);

  const csvFiles = fs.readdirSync(CSV_FOLDER).filter(f => f.endsWith('.csv')).sort();
  
  let totalUpserted = 0;

  for (const csvFile of csvFiles) {
    const locationName = extractLocationFromFilename(csvFile);
    if (!locationName) continue;

    const locationId = locationMap[locationName];
    if (!locationId) {
      console.log(`⚠️ Location not found: ${locationName}`);
      continue;
    }

    try {
      const filePath = path.join(CSV_FOLDER, csvFile);
      const csvContent = fs.readFileSync(filePath, 'utf-8');
      
      const records = csvParse(csvContent, { relax: false });

      // Find "Staff Name" row
      let staffNameRowIndex = -1;
      let courseNames = [];

      for (let i = 0; i < Math.min(10, records.length); i++) {
        if (records[i][0] === 'Staff Name') {
          staffNameRowIndex = i;
          courseNames = records[i].slice(1)
            .map(c => (c || '').trim())
            .filter(c => c && c.length > 0);
          break;
        }
      }

      if (staffNameRowIndex < 0) {
        console.log(`⚠️ Could not find "Staff Name" row in ${locationName}`);
        continue;
      }

      // Check which courses have data
      const courseHasData = {};
      courseNames.forEach(cn => courseHasData[cn] = false);

      const dataStartRow = staffNameRowIndex + 4;
      for (let i = dataStartRow; i < records.length; i++) {
        const staffName = (records[i][0] || '').trim();
        if (!staffName || !staffMap[staffName]) continue;

        for (let j = 0; j < courseNames.length; j++) {
          const dateStr = (records[i][j + 1] || '').trim();
          if (dateStr && dateStr !== '') {
            courseHasData[courseNames[j]] = true;
          }
        }
      }

      const coursesWithData = Object.keys(courseHasData).filter(c => courseHasData[c]).length;
      console.log(`Processing: ${locationName} (${courseNames.length} courses, ${coursesWithData} with data)`);

      // Get staff for this location
      const { data: staffLocations } = await supabase
        .from('staff_locations')
        .select('staff_id')
        .eq('location_id', locationId);

      const staffIds = staffLocations?.map(sl => sl.staff_id) || [];

      // Build all records (base + with dates)
      const recordsToUpsert = [];

      // First, create all staff-course combinations with default N/A
      for (const staffId of staffIds) {
        for (const courseName of courseNames) {
          if (!courseHasData[courseName]) continue;
          if (!courseMap[courseName]) continue;

          recordsToUpsert.push({
            staff_id: staffId,
            course_id: courseMap[courseName].id,
            completed_at_location_id: locationId,
            completion_date: null,
            expiry_date: null,
            status: 'na'
          });
        }
      }

      // Then override with actual dates from CSV
      for (let i = dataStartRow; i < records.length; i++) {
        const staffName = (records[i][0] || '').trim();
        if (!staffName || !staffMap[staffName]) continue;

        const staffId = staffMap[staffName];

        for (let j = 0; j < courseNames.length; j++) {
          const courseName = courseNames[j].trim();
          const dateStr = (records[i][j + 1] || '').trim();

          if (!courseMap[courseName] || !courseHasData[courseName]) continue;

          const courseId = courseMap[courseName].id;
          const completionDate = parseDate(dateStr);

          // Find and update the matching record
          const idx = recordsToUpsert.findIndex(r =>
            r.staff_id === staffId &&
            r.course_id === courseId &&
            r.completed_at_location_id === locationId
          );

          if (idx >= 0 && completionDate) {
            const expiryDate = courseMap[courseName].expiry_months ?
              calculateExpiryDate(completionDate, courseMap[courseName].expiry_months) :
              null;

            recordsToUpsert[idx] = {
              ...recordsToUpsert[idx],
              completion_date: completionDate,
              expiry_date: expiryDate,
              status: 'completed'
            };
          }
        }
      }

      // Upsert in batches
      const batchSize = 200;
      let upserted = 0;

      for (let i = 0; i < recordsToUpsert.length; i += batchSize) {
        const batch = recordsToUpsert.slice(i, i + batchSize);
        const { count, error } = await supabase
          .from('staff_training_matrix')
          .upsert(batch, {
            onConflict: 'staff_id,course_id,completed_at_location_id'
          })
          .select('id', { count: 'exact' });

        if (!error && count !== null) {
          upserted += count;
        } else if (error) {
          console.error(`    Batch error: ${error.message}`);
        }
      }

      console.log(`  ✓ Upserted ${upserted} records\n`);
      totalUpserted += upserted;

    } catch (err) {
      console.error(`  ❌ Error: ${err.message}\n`);
    }
  }

  console.log('═'.repeat(120));
  console.log(`✅ REBUILD COMPLETE\n`);
  console.log(`  • Total upserted: ${totalUpserted} records\n`);
  console.log('═'.repeat(120) + '\n');
}

fullUpsertRebuild();
