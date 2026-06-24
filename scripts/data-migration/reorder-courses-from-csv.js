import { parse } from 'csv-parse/sync';
import { readFileSync, readdirSync } from 'fs';
import { resolve, basename } from 'path';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function reorderCoursesFromCSV() {
  console.log('\n🔄 Reordering courses to match CSV file order\n');

  try {
    // Get all locations
    const { data: locations, error: locError } = await supabase
      .from('locations')
      .select('id, name');

    if (locError || !locations) {
      console.error('Error fetching locations:', locError);
      return;
    }

    console.log(`Found ${locations.length} locations`);

    // Load training courses (Careskills) for mapping
    const { data: trainingCourses, error: trainingCoursesError } = await supabase
      .from('training_courses')
      .select('id, name, careskills_name');

    if (trainingCoursesError || !trainingCourses) {
      console.error('Error fetching training courses:', trainingCoursesError);
      return;
    }

    const courseMap = new Map();
    trainingCourses.forEach(course => {
      courseMap.set(course.name.toLowerCase(), course.id);
      if (course.careskills_name) {
        courseMap.set(course.careskills_name.toLowerCase(), course.id);
      }
    });

    // Process each CSV file
    const csvDir = './csv-import';
    const csvFiles = readdirSync(csvDir).filter(f => f.endsWith('.csv'));

    for (const csvFile of csvFiles) {
      const locationName = csvFile.replace(' Training Matrix - Staff Matrix.csv', '').trim();
      console.log(`\n📄 Processing: ${csvFile}`);
      console.log(`   Looking for location: ${locationName}`);

      // Find matching location
      const location = locations.find(l => l.name === locationName);
      if (!location) {
        console.log(`   ⚠️  Location not found for: ${locationName}`);
        continue;
      }

      // Read CSV file
      const filePath = resolve(csvDir, csvFile);
      const content = readFileSync(filePath, 'utf-8');
      const records = parse(content, { relax_column_count: true });

      // Find the header row with "Staff Name" (or similar)
      const headerRowIndex = records.findIndex(row => {
        const firstCell = String(row?.[0] || '').trim().toLowerCase();
        return firstCell.includes('staff name') || firstCell.includes("learner's name") || firstCell === 'learner name';
      });

      if (headerRowIndex === -1) {
        console.log(`   ⚠️  Could not find header row with "Staff Name"`);
        continue;
      }

      const headerRow = records[headerRowIndex];
      const courseNames = headerRow
        .slice(1)
        .map(name => String(name || '').trim())
        .filter(name => name.length > 0);

      console.log(`   Found ${courseNames.length} courses in CSV header`);

      // Update display_order to match CSV column order
      let updated = 0;
      for (let idx = 0; idx < courseNames.length; idx++) {
        const courseName = courseNames[idx];
        const courseId = courseMap.get(courseName.toLowerCase());

        if (!courseId) {
          console.log(`   ⚠️  Course not found in training_courses: ${courseName}`);
          continue;
        }

        const { error: updateError } = await supabase
          .from('location_training_courses')
          .upsert({
            location_id: location.id,
            training_course_id: courseId,
            display_order: idx + 1
          }, { onConflict: 'location_id,training_course_id' });

        if (updateError) {
          console.error(`   Error updating ${courseName}:`, updateError);
        } else {
          updated++;
        }
      }

      console.log(`   ✅ Updated ${updated} courses to match CSV order`);
    }

    console.log('\n✅ All courses reordered to match CSV files\n');
  } catch (error) {
    console.error('Error:', error);
  }
}

reorderCoursesFromCSV();
