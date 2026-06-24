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

async function setLocationCourseOrder(locationName) {
  console.log('\n' + '═'.repeat(120));
  console.log(`  SET COURSE ORDER FOR: ${locationName}`);
  console.log('═'.repeat(120) + '\n');

  // Load reference data
  const { data: locations } = await supabase.from('locations').select('id, name');
  const { data: courses } = await supabase.from('courses').select('id, name');

  const locationMap = {};
  locations?.forEach(loc => {
    locationMap[loc.name.trim()] = loc.id;
  });

  const courseMap = {};
  courses?.forEach(course => {
    courseMap[course.name] = course.id;
  });

  const locationId = locationMap[locationName];
  if (!locationId) {
    console.log(`❌ Location not found: ${locationName}`);
    return;
  }

  // Find the CSV file for this location
  const csvFiles = fs.readdirSync(CSV_FOLDER).filter(f => f.endsWith('.csv')).sort();
  const csvFile = csvFiles.find(f => extractLocationFromFilename(f) === locationName);

  if (!csvFile) {
    console.log(`❌ CSV file not found for: ${locationName}`);
    return;
  }

  try {
    const filePath = path.join(CSV_FOLDER, csvFile);
    const csvContent = fs.readFileSync(filePath, 'utf-8');
    
    const records = csvParse(csvContent, { relax: false });

    // Find "Staff Name" row (row 2, index 2)
    const staffNameRowIndex = 2;
    let courseNames = [];

    if (records[staffNameRowIndex]?.[0] === 'Staff Name') {
      courseNames = records[staffNameRowIndex].slice(1)
        .map(c => (c || '').trim())
        .filter(c => c && c.length > 0);
    } else {
      console.log(`❌ Unexpected structure in CSV`);
      return;
    }

    console.log(`Found ${courseNames.length} courses in CSV (in order):\n`);
    courseNames.forEach((name, index) => {
      console.log(`  ${index + 1}. ${name}`);
    });

    // Get current courses for this location
    const { data: currentCourses } = await supabase
      .from('location_courses')
      .select(`
        course_id,
        display_order,
        courses(id, name)
      `)
      .eq('location_id', locationId)
      .order('display_order', { ascending: true, nullsFirst: false });

    console.log(`\nCurrent courses in database for this location:\n`);
    currentCourses?.forEach((lc, index) => {
      console.log(`  ${(lc.display_order || index + 1)}. ${lc.courses.name}`);
    });

    // Update display_order for each course based on CSV order
    console.log(`\nUpdating display order based on CSV...\n`);
    
    for (let i = 0; i < courseNames.length; i++) {
      const courseName = courseNames[i];
      const courseId = courseMap[courseName];

      if (!courseId) {
        console.log(`  ⚠️  Course not in database: ${courseName}`);
        continue;
      }

      const { error } = await supabase
        .from('location_courses')
        .update({ display_order: i + 1 })
        .eq('location_id', locationId)
        .eq('course_id', courseId);

      if (error) {
        console.log(`  ❌ Error updating ${courseName}: ${error.message}`);
      } else {
        console.log(`  ✓ ${i + 1}. ${courseName}`);
      }
    }

    console.log('\n' + '═'.repeat(120));
    console.log(`✅ COURSE ORDER UPDATED FOR ${locationName}`);
    console.log('═'.repeat(120));
    console.log(`\nPlease verify in the UI at: http://localhost:3000`);
    console.log(`Select "${locationName}" from the location dropdown to check the course order.\n`);

  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
  }
}

// Get location name from command line argument
const locationName = process.argv[2];

if (!locationName) {
  console.log('\n❌ Please specify a location name\n');
  console.log('Available locations:');
  const csvFiles = fs.readdirSync(CSV_FOLDER).filter(f => f.endsWith('.csv')).sort();
  csvFiles.forEach(f => {
    const name = extractLocationFromFilename(f);
    if (name) console.log(`  - ${name}`);
  });
  console.log('\nUsage: node set-single-location-order.js "Location Name"\n');
  process.exit(1);
}

setLocationCourseOrder(locationName);
