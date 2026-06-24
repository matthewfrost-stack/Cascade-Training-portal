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
  const match = filename.match(/^(.+?)\s+Training Matrix\s+-.+\.csv$/);
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
  const date = new Date(year, month - 1, day);
  return date.toISOString().split('T')[0];
}

function calculateExpiryDate(completionDateStr, months) {
  if (!completionDateStr || !months) return null;
  const date = new Date(completionDateStr);
  date.setMonth(date.getMonth() + months);
  return date.toISOString().split('T')[0];
}

async function setCourseDisplayOrderByLocation() {
  console.log('\n' + '═'.repeat(120));
  console.log('  SET COURSE DISPLAY ORDER BY LOCATION FROM CSV');
  console.log('═'.repeat(120) + '\n');

  // Load reference data
  const { data: locations } = await supabase.from('locations').select('id, name');
  const { data: courses } = await supabase.from('training_courses').select('id, name, careskills_name');

  const locationMap = {};
  locations?.forEach(loc => {
    locationMap[loc.name.trim()] = loc.id;
  });

  const courseMap = {};
  courses?.forEach(course => {
    courseMap[course.name.trim().toLowerCase()] = course.id;
    if (course.careskills_name) {
      courseMap[course.careskills_name.trim().toLowerCase()] = course.id;
    }
  });

  // Process each CSV to extract course order
  const csvFiles = fs.readdirSync(CSV_FOLDER).filter(f => f.endsWith('.csv')).sort();
  const locationCourseOrder = {}; // locationId -> { courseId: displayOrder }

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
      
      const records = csvParse(csvContent, { relax_column_count: true });

      // Find "Staff Name" row (header row)
      const staffNameRowIndex = records.findIndex(row => {
        const firstCell = String(row?.[0] || '').trim().toLowerCase();
        return firstCell.includes('staff name') || firstCell.includes("learner's name") || firstCell === 'learner name';
      });

      if (staffNameRowIndex === -1) {
        console.log(`⚠️ Unexpected structure in ${locationName}`);
        continue;
      }

      const courseNames = records[staffNameRowIndex].slice(1)
        .map(c => (c || '').toString().trim())
        .filter(c => c && c.length > 0);

      // Store the course order for this location
      locationCourseOrder[locationId] = {};
      courseNames.forEach((courseName, index) => {
        const courseId = courseMap[courseName.toLowerCase()];
        if (courseId) {
          locationCourseOrder[locationId][courseId] = index + 1;
        }
      });

      console.log(`${locationName}: ${courseNames.length} courses`);

    } catch (err) {
      console.error(`  ❌ Error processing ${locationName}: ${err.message}`);
    }
  }

  // Now update location_training_courses with display_order for each location
  console.log('\nUpdating location_training_courses with location-specific display orders...\n');

  for (const locationId of Object.keys(locationCourseOrder)) {
    const courseOrders = locationCourseOrder[locationId];
    
    for (const courseId of Object.keys(courseOrders)) {
      const displayOrder = courseOrders[courseId];
      
      const { error } = await supabase
        .from('location_training_courses')
        .upsert({
          location_id: locationId,
          training_course_id: courseId,
          display_order: displayOrder
        }, { onConflict: 'location_id,training_course_id' });

      if (error) {
        console.error(`Error updating location ${locationId}, course ${courseId}:`, error.message);
      }
    }
  }

  console.log('═'.repeat(120));
  console.log('✅ LOCATION-SPECIFIC COURSE ORDERING COMPLETE\n');
  console.log('═'.repeat(120) + '\n');
}

setCourseDisplayOrderByLocation();
