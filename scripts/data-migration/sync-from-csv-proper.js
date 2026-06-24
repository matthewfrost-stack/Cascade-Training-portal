import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CSV_FOLDER = '/Users/matthewfrost/training-portal/csv-import';

function extractLocationFromFilename(filename) {
  const match = filename.match(/^(.+?)\s+Training Matrix.*\.csv$/);
  return match ? match[1].trim() : null;
}

function parseDate(dateStr) {
  if (!dateStr || dateStr.trim() === '') return null;
  
  const parts = dateStr.trim().split('/');
  if (parts.length !== 3) return null;
  
  const day = parseInt(parts[0]);
  const month = parseInt(parts[1]);
  const year = parseInt(parts[2]);
  
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  
  // DD/MM/YYYY format
  const date = new Date(year, month - 1, day);
  return date.toISOString().split('T')[0];
}

async function syncFromCSV() {
  console.log('\n' + '═'.repeat(120));
  console.log('  SYNCING DATA FROM CSV - REAL DATES AND COURSE FILTERING');
  console.log('═'.repeat(120) + '\n');

  const csvFiles = fs.readdirSync(CSV_FOLDER).filter(f => f.endsWith('.csv')).sort();
  
  // Get staff locations mapping
  const { data: locations } = await supabase.from('locations').select('id, name');
  const { data: staffProfiles } = await supabase.from('profiles').select('id, full_name');
  const { data: courses } = await supabase.from('courses').select('id, name, expiry_months');

  const locationMap = {};
  locations.forEach(loc => {
    locationMap[loc.name] = loc.id;
  });

  const staffMap = {};
  staffProfiles.forEach(staff => {
    staffMap[staff.full_name] = staff.id;
  });

  const courseMap = {};
  courses.forEach(course => {
    courseMap[course.name] = { id: course.id, expiry_months: course.expiry_months };
  });

  console.log(`Loaded ${Object.keys(locationMap).length} locations, ${Object.keys(staffMap).length} staff, ${Object.keys(courseMap).length} courses\n`);

  // Process each location's CSV
  let totalUpdates = 0;
  let totalRemoved = 0;

  for (const csvFile of csvFiles) {
    const location = extractLocationFromFilename(csvFile);
    if (!location) continue;

    const locationId = locationMap[location];
    if (!locationId) {
      console.log(`⚠️ Location not found: ${location}`);
      continue;
    }

    console.log(`Processing: ${location}`);

    try {
      const content = fs.readFileSync(path.join(CSV_FOLDER, csvFile), 'utf-8');
      const records = parse(content);

      // Find key rows
      let staffNameRow = -1;
      let dateValidRow = -1;

      for (let i = 0; i < Math.min(10, records.length); i++) {
        if (records[i][0] === 'Staff Name') {
          staffNameRow = i;
        }
        if (records[i][0] && records[i][0].includes('Date valid for')) {
          dateValidRow = i;
        }
      }

      if (staffNameRow < 0) continue;

      // Extract course names and order
      const courseNames = records[staffNameRow].slice(1).filter(c => c && c.trim().length > 0);

      // Check which courses have ANY data in this location
      const courseHasData = {};
      courseNames.forEach(courseName => {
        courseHasData[courseName] = false;
      });

      // Scan all staff rows to see which courses have dates
      for (let i = staffNameRow + 3; i < records.length; i++) {
        const staffName = (records[i][0] || '').trim();
        if (!staffName || !staffMap[staffName]) continue;

        for (let j = 0; j < courseNames.length; j++) {
          const dateStr = (records[i][j + 1] || '').trim();
          if (dateStr && dateStr !== '') {
            courseHasData[courseNames[j]] = true;
          }
        }
      }

      // Count courses with data
      const coursesWithData = Object.keys(courseHasData).filter(c => courseHasData[c]).length;
      const coursesWithoutData = courseNames.length - coursesWithData;

      console.log(`  ✓ ${courseNames.length} courses (${coursesWithData} with data, ${coursesWithoutData} empty)`);

      // Now sync the actual data
      const staffLocationId = `${staffMap[Object.keys(staffMap)[0]]}-${locationId}`.replace(/^undefined/, 'unknown');

      // Process each staff member and course
      let updated = 0;
      for (let i = staffNameRow + 3; i < records.length; i++) {
        const staffName = (records[i][0] || '').trim();
        if (!staffName || !staffMap[staffName]) continue;

        const staffId = staffMap[staffName];

        for (let j = 0; j < courseNames.length; j++) {
          const courseName = courseNames[j].trim();
          const dateStr = (records[i][j + 1] || '').trim();

          if (!courseMap[courseName]) continue;

          const courseId = courseMap[courseName].id;
          const completionDate = parseDate(dateStr);

          // If this course has no data anywhere, skip it
          if (!courseHasData[courseName]) {
            totalRemoved++;
            continue;
          }

          // If this staff has a date for this course, update with real date
          // Otherwise set N/A with no dates
          const { error } = await supabase
            .from('staff_training_matrix')
            .update({
              completion_date: completionDate,
              expiry_date: completionDate && courseMap[courseName].expiry_months ? 
                calculateExpiryDate(completionDate, courseMap[courseName].expiry_months) : 
                null,
              status: completionDate ? 'completed' : 'na'
            })
            .eq('staff_id', staffId)
            .eq('course_id', courseId);

          if (!error) {
            updated++;
          }
        }
      }

      totalUpdates += updated;
      console.log(`  ✓ Updated ${updated} records\n`);

    } catch (err) {
      console.error(`  Error: ${err.message}\n`);
    }
  }

  console.log('═'.repeat(120));
  console.log(`✅ SYNC COMPLETE\n`);
  console.log(`  • Updated: ${totalUpdates} records`);
  console.log(`  • Removed: ${totalRemoved} empty course entries\n`);
  console.log('═'.repeat(120) + '\n');
}

function calculateExpiryDate(completionDateStr, months) {
  const date = new Date(completionDateStr);
  date.setMonth(date.getMonth() + months);
  return date.toISOString().split('T')[0];
}

syncFromCSV();
