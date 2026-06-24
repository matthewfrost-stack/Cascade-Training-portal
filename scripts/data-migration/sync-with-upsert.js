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

function calculateExpiryDate(completionDateStr, months) {
  if (!completionDateStr || !months) return null;
  const date = new Date(completionDateStr);
  date.setMonth(date.getMonth() + months);
  return date.toISOString().split('T')[0];
}

async function syncWithInsert() {
  console.log('\n' + '═'.repeat(120));
  console.log('  SYNCING DATA FROM CSV - COMPLETE MATRIX WITH INSERTS');
  console.log('═'.repeat(120) + '\n');

  const csvFiles = fs.readdirSync(CSV_FOLDER).filter(f => f.endsWith('.csv')).sort();
  
  // Get staff locations mapping
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

  console.log(`Loaded ${Object.keys(locationMap).length} locations, ${Object.keys(staffMap).length} staff, ${Object.keys(courseMap).length} courses\n`);

  let totalInserted = 0;
  let totalUpdated = 0;

  for (const csvFile of csvFiles) {
    const location = extractLocationFromFilename(csvFile);
    if (!location) continue;

    const locationId = locationMap[location];
    if (!locationId) {
      console.log(`⚠️ Location not found: ${location}`);
      continue;
    }

    try {
      const filePath = path.join(CSV_FOLDER, csvFile);
      const csvContent = fs.readFileSync(filePath, 'utf-8');
      const records = parse(csvContent, { skip_empty_lines: true });

      // Find staff and course row
      let staffNameRow = -1;
      for (let i = 0; i < records.length; i++) {
        if (records[i][0]?.toLowerCase().includes('staff') || 
            (records[i][0] === '' && records[i].slice(1).some(c => c && c.trim()))) {
          staffNameRow = i;
          break;
        }
      }

      if (staffNameRow < 0) continue;

      // Extract course names
      const courseNames = records[staffNameRow].slice(1).filter(c => c && c.trim().length > 0);

      // Check which courses have ANY data
      const courseHasData = {};
      courseNames.forEach(courseName => {
        courseHasData[courseName] = false;
      });

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

      const coursesWithData = Object.keys(courseHasData).filter(c => courseHasData[c]).length;
      const coursesWithoutData = courseNames.length - coursesWithData;
      console.log(`  ${location}: ${courseNames.length} courses (${coursesWithData} with data, ${coursesWithoutData} empty)`);

      // Get staff for this location
      const { data: staffLocations } = await supabase
        .from('staff_locations')
        .select('staff_id')
        .eq('location_id', locationId);

      const staffIdsForLocation = new Set(staffLocations?.map(sl => sl.staff_id) || []);

      // Build all course records needed
      const recordsToCreate = [];
      
      for (const staffId of staffIdsForLocation) {
        for (const courseName of courseNames) {
          if (!courseHasData[courseName]) continue;  // Skip courses with no data
          
          if (!courseMap[courseName]) continue;
          
          const courseId = courseMap[courseName].id;
          
          recordsToCreate.push({
            staff_id: staffId,
            course_id: courseId,
            completed_at_location_id: locationId,
            completion_date: null,
            expiry_date: null,
            status: 'na'
          });
        }
      }

      console.log(`  Creating ${recordsToCreate.length} base records for ${location}...\n`);

      // Now update with real data from CSV
      let inserted = 0;
      let updated = 0;

      for (let i = staffNameRow + 3; i < records.length; i++) {
        const staffName = (records[i][0] || '').trim();
        if (!staffName || !staffMap[staffName]) continue;

        const staffId = staffMap[staffName];

        for (let j = 0; j < courseNames.length; j++) {
          const courseName = courseNames[j].trim();
          const dateStr = (records[i][j + 1] || '').trim();

          if (!courseMap[courseName] || !courseHasData[courseName]) continue;

          const courseId = courseMap[courseName].id;
          const completionDate = parseDate(dateStr);

          const { error } = await supabase
            .from('staff_training_matrix')
            .upsert({
              staff_id: staffId,
              course_id: courseId,
              completed_at_location_id: locationId,
              completion_date: completionDate,
              expiry_date: completionDate && courseMap[courseName].expiry_months ? 
                calculateExpiryDate(completionDate, courseMap[courseName].expiry_months) : 
                null,
              status: completionDate ? 'completed' : 'na'
            }, {
              onConflict: 'staff_id, course_id, completed_at_location_id'
            });

          if (!error) {
            if (completionDate) {
              updated++;
            }
          }
        }
      }

      console.log(`  ✓ Updated ${updated} records with completion dates\n`);
      totalUpdated += updated;

    } catch (err) {
      console.error(`  Error: ${err.message}\n`);
    }
  }

  console.log('═'.repeat(120));
  console.log(`✅ SYNC COMPLETE\n`);
  console.log(`  • Updated with real dates: ${totalUpdated} records\n`);
  console.log('═'.repeat(120) + '\n');
}

syncWithInsert();
