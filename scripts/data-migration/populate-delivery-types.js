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

async function updateLocationCourseDeliveryTypes() {
  console.log('\n🔄 Updating location_courses with delivery types from CSV files\n');

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
      const records = parse(content, { headers: false });

      // Row 2 = section headers (e.g., "Careskills Wave 1", "GDPR 1", etc.)
      // Row 3 onwards = course names and data
      if (records.length < 3) {
        console.log(`   ⚠️  CSV has less than 3 rows`);
        continue;
      }

      const sectionHeadersRow = records[1]; // Row 2 (0-indexed as 1)
      const courseNamesRow = records[2]; // Row 3 (0-indexed as 2)

      // Get courses for this location
      const { data: locationCourses, error: lcError } = await supabase
        .from('location_courses')
        .select(`
          id,
          course_id,
          display_order,
          courses(id, name)
        `)
        .eq('location_id', location.id)
        .order('display_order', { ascending: true });

      if (lcError) {
        console.error(`   Error fetching courses for ${locationName}:`, lcError);
        continue;
      }

      if (!locationCourses || locationCourses.length === 0) {
        console.log(`   ℹ️  No courses found for location`);
        continue;
      }

      console.log(`   Found ${locationCourses.length} courses`);

      // Build a map of course names to section headers from CSV
      const courseToHeaderMap = new Map();
      for (let colIdx = 0; colIdx < courseNamesRow.length; colIdx++) {
        const courseName = courseNamesRow[colIdx]?.trim();
        const sectionHeader = sectionHeadersRow[colIdx]?.trim() || '';
        if (courseName && courseName.length > 0) {
          // Store mapping by course name (normalized) to section header
          courseToHeaderMap.set(courseName.toLowerCase(), sectionHeader || 'Face to Face');
        }
      }

      console.log(`   CSV has section headers for ${courseToHeaderMap.size} unique courses`);

      // Update location_courses by matching course names to CSV columns
      let updated = 0;
      let notFound = 0;
      for (const lc of locationCourses) {
        const courseName = lc.courses?.name?.toLowerCase();
        if (!courseName) continue;

        const sectionHeader = courseToHeaderMap.get(courseName);
        
        if (!sectionHeader) {
          notFound++;
          continue;
        }

        const { error: updateError } = await supabase
          .from('location_courses')
          .update({ delivery_type: sectionHeader })
          .eq('id', lc.id);

        if (updateError) {
          console.error(`   Error updating course ${lc.courses?.name}:`, updateError);
        } else {
          updated++;
        }
      }

      console.log(`   ✅ Updated ${updated} courses with section headers from CSV`);
      if (notFound > 0) {
        console.log(`   ⚠️  ${notFound} courses not found in CSV (will keep current value)`);
      }
    }

    console.log('\n✅ All location courses updated with delivery types from CSV files\n');
  } catch (error) {
    console.error('Error:', error);
  }
}

updateLocationCourseDeliveryTypes();
