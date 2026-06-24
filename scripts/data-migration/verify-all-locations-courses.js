require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const CSV_DIR = '/Users/matthewfrost/training-portal/csv-import';

async function verifyAllLocations() {
  console.log('=== Verifying All Locations: CSV Courses vs Database ===\n');

  // Get all locations
  const { data: locations } = await supabase.from('locations').select('id, name');
  
  // Get all training courses from DB
  const { data: allCourses } = await supabase.from('training_courses').select('id, name');
  const courseNameToId = new Map();
  allCourses.forEach(c => {
    courseNameToId.set(c.name.toLowerCase().trim(), c.id);
    // Also map without (Careskills) suffix
    if (c.name.includes('(Careskills)')) {
      const baseName = c.name.replace(' (Careskills)', '').toLowerCase().trim();
      if (!courseNameToId.has(baseName)) {
        courseNameToId.set(baseName, c.id);
      }
    }
  });
  
  let totalIssues = 0;

  for (const location of locations) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📍 ${location.name}`);
    console.log(`${'='.repeat(60)}`);

    const csvPath = path.join(CSV_DIR, `${location.name} Training Matrix - Staff Matrix.csv`);
    
    if (!fs.existsSync(csvPath)) {
      console.log('⚠️  No CSV file found');
      continue;
    }

    const content = fs.readFileSync(csvPath, 'utf-8');
    const rows = parse(content, {
      relax_column_count: true,
      skip_empty_lines: false
    });

    // Find "Staff Name" header row
    const headerRow = rows.findIndex(row => String(row?.[0] || '').trim().toLowerCase() === 'staff name');

    if (headerRow === -1) {
      console.log('⚠️  Could not find Staff Name header row');
      continue;
    }

    // Parse CSV headers (course names)
    const csvCourses = (rows[headerRow] || [])
      .map(h => String(h || '').trim())
      .filter((h, i) => i > 0 && h && h.length > 2); // Skip first column (Staff Name) and empty headers

    console.log(`CSV has ${csvCourses.length} course columns`);

    // Get courses linked to this location in DB
    const { data: locationCourses } = await supabase
      .from('location_training_courses')
      .select('training_course_id, training_courses(id, name)')
      .eq('location_id', location.id);

    const dbCourseNames = new Set();
    const dbCourseIds = new Set();
    locationCourses?.forEach(lc => {
      if (lc.training_courses) {
        dbCourseNames.add(lc.training_courses.name.toLowerCase().trim());
        dbCourseIds.add(lc.training_courses.id);
        // Also add base name for Careskills courses
        if (lc.training_courses.name.includes('(Careskills)')) {
          dbCourseNames.add(lc.training_courses.name.replace(' (Careskills)', '').toLowerCase().trim());
        }
      }
    });

    console.log(`DB has ${locationCourses?.length || 0} courses linked to this location`);

    // Check which CSV courses are missing from DB
    const missingCourses = [];
    const foundCourses = [];

    for (const csvCourse of csvCourses) {
      const csvCourseLower = csvCourse.toLowerCase().trim();
      
      // Check if course exists in DB (either exact match or with Careskills suffix)
      const inDb = dbCourseNames.has(csvCourseLower) || 
                   dbCourseNames.has(csvCourseLower + ' (careskills)');
      
      if (inDb) {
        foundCourses.push(csvCourse);
      } else {
        // Check if course exists in training_courses table at all
        const existsAnywhere = courseNameToId.has(csvCourseLower);
        missingCourses.push({
          name: csvCourse,
          existsInCourseTable: existsAnywhere
        });
      }
    }

    console.log(`✅ ${foundCourses.length} courses found in DB`);
    
    if (missingCourses.length > 0) {
      console.log(`❌ ${missingCourses.length} courses MISSING from location:`);
      missingCourses.forEach(m => {
        const status = m.existsInCourseTable ? '(exists in courses table, not linked to location)' : '(not in courses table)';
        console.log(`   - "${m.name}" ${status}`);
      });
      totalIssues += missingCourses.length;
    }

    // Sample first staff member's data to verify dates match
    let firstStaffRow = headerRow + 1;
    while (firstStaffRow < rows.length) {
      const name = String(rows[firstStaffRow]?.[0] || '').trim();
      if (name && name.length > 3 && 
          !name.match(/^(Management|Team Leaders?|Lead Support|Staff Team|Staff on|Positive Behaviour|Training|Modules|Notes|->|Mandatory|Date Valid)/i)) {
        break;
      }
      firstStaffRow++;
    }

    if (firstStaffRow < rows.length) {
      const sampleCols = (rows[firstStaffRow] || []).map(c => String(c || '').trim());
      const sampleName = sampleCols[0];
      
      // Get this staff member's data from DB
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .ilike('full_name', sampleName)
        .single();

      if (profile) {
        const { data: trainingRecords } = await supabase
          .from('staff_training_matrix')
          .select('course_id, completion_date, training_courses(name)')
          .eq('staff_id', profile.id)
          .eq('completed_at_location_id', location.id);

        const dbRecordCount = trainingRecords?.filter(t => t.completion_date)?.length || 0;
        const csvDateCount = sampleCols.slice(1).filter(d => d && d.match(/\d{2}\/\d{2}\/\d{4}/)).length;
        
        console.log(`\nSample: ${sampleName}`);
        console.log(`   CSV dates: ${csvDateCount}, DB records with dates: ${dbRecordCount}`);
        
        if (Math.abs(csvDateCount - dbRecordCount) > 5) {
          console.log(`   ⚠️  Significant difference - may have missing records`);
        }
      }
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`SUMMARY: ${totalIssues} total missing course-location links`);
  console.log(`${'='.repeat(60)}`);
}

verifyAllLocations().catch(console.error);
