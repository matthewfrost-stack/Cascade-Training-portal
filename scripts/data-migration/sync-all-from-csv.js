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

function normalizeCourseName(name) {
  return name
    .replace(/\s*\(Careskills\)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function syncAllFromCSV() {
  console.log('\n' + '═'.repeat(120));
  console.log('  COMPREHENSIVE SYNC FROM CSV FILES');
  console.log('  1. Sync course order from CSV to location_training_courses');
  console.log('  2. Create missing courses in training_courses');
  console.log('  3. Map location_training_courses for each location');
  console.log('═'.repeat(120) + '\n');

  // Load reference data
  const { data: locations } = await supabase.from('locations').select('id, name');
  const { data: trainingCourses } = await supabase.from('training_courses').select('id, name, careskills_name, expiry_months');

  const locationMap = {};
  locations?.forEach(loc => {
    locationMap[loc.name.trim()] = loc.id;
  });

  // Build course lookup map (lowercase name -> course)
  // IMPORTANT: Exclude courses with "(Careskills)" suffix - CSV uses names without suffix
  const courseMap = new Map();
  trainingCourses?.forEach(course => {
    // Skip courses with (Careskills) suffix - we want to match CSV names to non-suffix versions
    if (course.name.toLowerCase().includes('(careskills)')) {
      return;
    }
    courseMap.set(course.name.toLowerCase(), course);
    if (course.careskills_name && !course.careskills_name.toLowerCase().includes('(careskills)')) {
      courseMap.set(course.careskills_name.toLowerCase(), course);
    }
    // Also add normalized version
    const normalized = normalizeCourseName(course.name);
    if (normalized) {
      courseMap.set(normalized.toLowerCase(), course);
    }
  });

  console.log(`Loaded ${locations.length} locations and ${trainingCourses.length} training courses\n`);

  // Process each CSV to extract course order and create any missing courses
  const csvFiles = fs.readdirSync(CSV_FOLDER).filter(f => f.endsWith('.csv')).sort();
  const allCourseNames = new Set();
  const locationCourseData = {}; // locationId -> [{ courseName, order, expiryDuration }]

  for (const csvFile of csvFiles) {
    const locationName = extractLocationFromFilename(csvFile);
    if (!locationName) continue;

    const locationId = locationMap[locationName];
    if (!locationId) {
      console.log(`⚠️ Location not found: ${locationName}`);
      continue;
    }

    console.log(`\n📄 Processing: ${csvFile}`);
    console.log(`   Location: ${locationName} (${locationId})`);

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
        console.log(`   ⚠️ Could not find header row with "Staff Name"`);
        continue;
      }

      // Find "Date valid for" row to get expiry durations
      const expiryRowIndex = records.findIndex(row => {
        const firstCell = String(row?.[0] || '').trim().toLowerCase();
        return firstCell.includes('date valid') || firstCell.includes('expiry') || firstCell.includes('valid for');
      });

      const headerRow = records[staffNameRowIndex];
      const expiryRow = expiryRowIndex >= 0 ? records[expiryRowIndex] : null;

      const courseNames = headerRow
        .slice(1)
        .map((name, idx) => {
          const courseName = String(name || '').trim();
          let expiryMonths = 12; // Default

          if (expiryRow && expiryRow[idx + 1]) {
            const expiryStr = String(expiryRow[idx + 1]).toLowerCase().trim();
            if (expiryStr.includes('3 year') || expiryStr === '3y') {
              expiryMonths = 36;
            } else if (expiryStr.includes('2 year') || expiryStr === '2y') {
              expiryMonths = 24;
            } else if (expiryStr.includes('1 year') || expiryStr === '1y') {
              expiryMonths = 12;
            } else if (expiryStr.includes('6 month')) {
              expiryMonths = 6;
            } else if (expiryStr.includes('one off') || expiryStr.includes('n/a') || expiryStr === '-') {
              expiryMonths = 0; // Never expires
            }
          }

          return { courseName, expiryMonths };
        })
        .filter(item => item.courseName.length > 0);

      console.log(`   Found ${courseNames.length} courses in header`);

      locationCourseData[locationId] = courseNames.map((item, idx) => ({
        ...item,
        order: idx + 1
      }));

      courseNames.forEach(item => allCourseNames.add(item.courseName));

    } catch (err) {
      console.error(`   ❌ Error processing ${locationName}: ${err.message}`);
    }
  }

  console.log(`\n${'─'.repeat(80)}`);
  console.log(`Total unique course names across all CSVs: ${allCourseNames.size}`);

  // Step 2: Create missing courses
  console.log(`\n${'─'.repeat(80)}`);
  console.log('Creating missing courses in training_courses...\n');

  const missingCourses = [];
  for (const courseName of allCourseNames) {
    const normalized = normalizeCourseName(courseName);
    if (!courseMap.has(courseName.toLowerCase()) && !courseMap.has(normalized.toLowerCase())) {
      missingCourses.push(courseName);
    }
  }

  if (missingCourses.length > 0) {
    console.log(`Found ${missingCourses.length} missing courses to create:`);
    for (const courseName of missingCourses) {
      console.log(`   Creating: ${courseName}`);
      
      // Determine expiry from first location that has this course
      let expiryMonths = 12;
      for (const locId of Object.keys(locationCourseData)) {
        const courseItem = locationCourseData[locId].find(c => c.courseName === courseName);
        if (courseItem && courseItem.expiryMonths !== undefined) {
          expiryMonths = courseItem.expiryMonths;
          break;
        }
      }

      const { data: newCourse, error } = await supabase
        .from('training_courses')
        .insert({
          name: courseName,
          careskills_name: courseName,
          expiry_months: expiryMonths || 12
        })
        .select()
        .single();

      if (error) {
        console.error(`   ❌ Error creating ${courseName}: ${error.message}`);
      } else {
        console.log(`   ✅ Created: ${courseName} (expiry: ${expiryMonths} months)`);
        courseMap.set(courseName.toLowerCase(), newCourse);
        const normalized = normalizeCourseName(courseName);
        if (normalized) {
          courseMap.set(normalized.toLowerCase(), newCourse);
        }
      }
    }
  } else {
    console.log('All courses already exist in training_courses ✅');
  }

  // Step 3: Update location_training_courses with correct order
  console.log(`\n${'─'.repeat(80)}`);
  console.log('Updating location_training_courses with correct display order...\n');

  for (const locationId of Object.keys(locationCourseData)) {
    const courses = locationCourseData[locationId];
    const locationName = locations.find(l => l.id === locationId)?.name || locationId;
    
    console.log(`\n📍 ${locationName}: ${courses.length} courses`);

    let updated = 0;
    let notFound = 0;

    for (const courseItem of courses) {
      const { courseName, order } = courseItem;
      const normalized = normalizeCourseName(courseName);
      
      let course = courseMap.get(courseName.toLowerCase());
      if (!course) {
        course = courseMap.get(normalized.toLowerCase());
      }

      if (!course) {
        console.log(`   ⚠️ Course not found: ${courseName}`);
        notFound++;
        continue;
      }

      const { error } = await supabase
        .from('location_training_courses')
        .upsert({
          location_id: locationId,
          training_course_id: course.id,
          display_order: order
        }, { onConflict: 'location_id,training_course_id' });

      if (error) {
        console.error(`   ❌ Error updating ${courseName}: ${error.message}`);
      } else {
        updated++;
      }
    }

    console.log(`   ✅ Updated ${updated} courses, ${notFound} not found`);
  }

  // Final summary
  console.log(`\n${'═'.repeat(120)}`);
  console.log('✅ SYNC COMPLETE');
  console.log(`${'═'.repeat(120)}\n`);

  // Show sample of location_training_courses
  console.log('Sample: First 5 courses for first location:');
  const firstLocationId = Object.keys(locationCourseData)[0];
  if (firstLocationId) {
    const { data: sampleCourses } = await supabase
      .from('location_training_courses')
      .select('display_order, training_courses(name)')
      .eq('location_id', firstLocationId)
      .order('display_order')
      .limit(5);
    
    sampleCourses?.forEach((c, idx) => {
      console.log(`   ${c.display_order}. ${c.training_courses?.name}`);
    });
  }
}

syncAllFromCSV().catch(console.error);
