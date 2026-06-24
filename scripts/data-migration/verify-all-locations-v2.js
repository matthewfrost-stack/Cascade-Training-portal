require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const CSV_DIR = '/Users/matthewfrost/training-portal/csv-import';

// Proper CSV parsing that respects quoted fields
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  
  return result;
}

async function verifyAllLocations() {
  console.log('=== Verifying All Locations: CSV Courses vs Database ===\n');

  // Get all locations
  const { data: locations } = await supabase.from('locations').select('id, name');
  
  // Get all training courses from DB
  const { data: allCourses } = await supabase.from('training_courses').select('id, name');
  const courseNameToId = new Map();
  allCourses.forEach(c => {
    courseNameToId.set(c.name.toLowerCase().trim(), c.id);
  });
  
  let totalMissing = 0;
  let totalNotLinked = 0;

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
    const lines = content.split('\n');

    // Find "Staff Name" header row
    let headerRow = -1;
    for (let i = 0; i < Math.min(60, lines.length); i++) {
      if (lines[i] && lines[i].toLowerCase().includes('staff name')) {
        headerRow = i;
        break;
      }
    }

    if (headerRow === -1) {
      console.log('⚠️  Could not find Staff Name header row');
      continue;
    }

    // Parse CSV headers properly (respecting quotes)
    const headers = parseCSVLine(lines[headerRow]);
    const csvCourses = headers
      .slice(1) // Skip first column (Staff Name)
      .filter(h => h && h.length > 2 && !h.match(/^\s*$/));

    console.log(`CSV has ${csvCourses.length} course columns`);
    
    // Get courses linked to this location in DB
    const { data: locationCourses } = await supabase
      .from('location_training_courses')
      .select('training_course_id, training_courses(id, name)')
      .eq('location_id', location.id);

    const dbCourseNames = new Map();
    locationCourses?.forEach(lc => {
      if (lc.training_courses) {
        dbCourseNames.set(lc.training_courses.name.toLowerCase().trim(), lc.training_courses.id);
      }
    });

    console.log(`DB has ${locationCourses?.length || 0} courses linked to this location`);

    // Check which CSV courses are missing from DB
    const missingFromLocation = [];
    const missingFromCourseTable = [];
    const foundCourses = [];

    for (const csvCourse of csvCourses) {
      const csvCourseLower = csvCourse.toLowerCase().trim();
      
      // Check exact match or Careskills variant
      const exactMatch = dbCourseNames.has(csvCourseLower);
      const careskillsMatch = dbCourseNames.has(csvCourseLower + ' (careskills)');
      
      if (exactMatch || careskillsMatch) {
        foundCourses.push(csvCourse);
      } else {
        // Check if course exists in training_courses table at all
        const existsInTable = courseNameToId.has(csvCourseLower) || 
                              courseNameToId.has(csvCourseLower + ' (careskills)');
        
        if (existsInTable) {
          missingFromLocation.push(csvCourse);
        } else {
          missingFromCourseTable.push(csvCourse);
        }
      }
    }

    console.log(`✅ ${foundCourses.length} courses found and linked`);
    
    if (missingFromLocation.length > 0) {
      console.log(`⚠️  ${missingFromLocation.length} courses exist but NOT linked to this location:`);
      missingFromLocation.forEach(m => console.log(`   - "${m}"`));
      totalNotLinked += missingFromLocation.length;
    }
    
    if (missingFromCourseTable.length > 0) {
      console.log(`❌ ${missingFromCourseTable.length} courses NOT in courses table:`);
      missingFromCourseTable.forEach(m => console.log(`   - "${m}"`));
      totalMissing += missingFromCourseTable.length;
    }

    // Sample check: get first staff member's record counts
    let firstStaffRow = headerRow + 1;
    while (firstStaffRow < lines.length) {
      const cols = parseCSVLine(lines[firstStaffRow]);
      const name = cols[0];
      if (name && name.length > 3 && 
          !name.match(/^(Management|Team Leaders?|Lead Support|Staff Team|Staff on|Positive Behaviour|Training|Modules|Notes|->|Mandatory|Date Valid|Core|Manager)/i)) {
        break;
      }
      firstStaffRow++;
    }

    if (firstStaffRow < lines.length) {
      const sampleCols = parseCSVLine(lines[firstStaffRow]);
      const sampleName = sampleCols[0];
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .ilike('full_name', sampleName)
        .single();

      if (profile) {
        const { data: trainingRecords } = await supabase
          .from('staff_training_matrix')
          .select('course_id, completion_date')
          .eq('staff_id', profile.id)
          .eq('completed_at_location_id', location.id);

        const dbRecordCount = trainingRecords?.filter(t => t.completion_date)?.length || 0;
        const csvDateCount = sampleCols.slice(1).filter(d => d && d.match(/\d{2}\/\d{2}\/\d{4}/)).length;
        
        console.log(`\nSample: ${sampleName}`);
        console.log(`   CSV dates: ${csvDateCount}, DB records with dates: ${dbRecordCount}`);
      }
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('SUMMARY:');
  console.log(`  ${totalMissing} courses missing from training_courses table`);
  console.log(`  ${totalNotLinked} courses exist but not linked to their location`);
  console.log(`${'='.repeat(60)}`);
}

verifyAllLocations().catch(console.error);
