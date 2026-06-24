require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CSV_DIR = '/Users/matthewfrost/training-portal/csv-import';

async function verifyAllLocations() {
  // Get all locations
  const { data: locations, error: locError } = await supabase
    .from('locations')
    .select('id, name')
    .order('name');

  if (locError) {
    console.error('Error fetching locations:', locError);
    return;
  }

  // Get CSV files
  const csvFiles = fs.readdirSync(CSV_DIR).filter(f => f.endsWith('.csv'));
  
  console.log('='.repeat(80));
  console.log('VERIFICATION REPORT: Course Order by Location');
  console.log('='.repeat(80));
  console.log('');

  let allMatch = true;
  let locationResults = [];

  for (const location of locations) {
    // Find matching CSV file - need exact match on location name
    // CSV file format: "Location Name Training Matrix - Staff Matrix.csv"
    const csvFile = csvFiles.find(f => {
      // Extract location name from CSV filename
      const match = f.match(/^(.+?)\s+Training Matrix\s*-/);
      if (!match) return false;
      const csvLocationName = match[1].trim().toLowerCase();
      const locName = location.name.toLowerCase().trim();
      return csvLocationName === locName;
    });

    if (!csvFile) {
      console.log(`⚠️  ${location.name}: No matching CSV file found`);
      locationResults.push({ name: location.name, status: 'NO_CSV', matches: null });
      continue;
    }

    // Read CSV and extract course order
    const csvContent = fs.readFileSync(path.join(CSV_DIR, csvFile), 'utf-8');
    const records = parse(csvContent, { relax_column_count: true });
    
    // Find header row (contains "Staff Name" in first column)
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(10, records.length); i++) {
      const firstCell = (records[i][0] || '').toString().trim().toLowerCase();
      if (firstCell === 'staff name' || firstCell === 'name') {
        headerRowIndex = i;
        break;
      }
    }

    if (headerRowIndex === -1) {
      console.log(`⚠️  ${location.name}: Could not find header row in CSV`);
      locationResults.push({ name: location.name, status: 'NO_HEADER', matches: null });
      continue;
    }

    // Extract course names from CSV (skip first column which is "Staff Name")
    // De-duplicate while preserving order (CSV may have duplicate columns)
    const rawCsvCourses = records[headerRowIndex]
      .slice(1)
      .map(c => (c || '').toString().trim())
      .filter(c => c && c.length > 0);
    
    const seenCourses = new Set();
    const csvCourses = [];
    let csvDuplicates = 0;
    rawCsvCourses.forEach(c => {
      const normalized = c.replace(/\s+/g, ' ').toLowerCase();
      if (!seenCourses.has(normalized)) {
        seenCourses.add(normalized);
        csvCourses.push(c);
      } else {
        csvDuplicates++;
      }
    });

    // Get courses from database for this location
    const { data: dbCourses, error: dbError } = await supabase
      .from('location_training_courses')
      .select('training_course_id, display_order, training_courses(id, name)')
      .eq('location_id', location.id)
      .order('display_order');

    if (dbError) {
      console.log(`❌ ${location.name}: Database error - ${dbError.message}`);
      locationResults.push({ name: location.name, status: 'DB_ERROR', matches: null });
      continue;
    }

    // Filter out Careskills suffix courses
    const filteredDbCourses = dbCourses.filter(c => 
      c.training_courses && !c.training_courses.name.toLowerCase().includes('(careskills)')
    );

    // Compare orders (normalize whitespace for comparison)
    let matches = 0;
    let mismatches = [];
    const maxCompare = Math.min(csvCourses.length, filteredDbCourses.length);

    for (let i = 0; i < maxCompare; i++) {
      const csvName = csvCourses[i].replace(/\s+/g, ' ').toLowerCase().trim();
      const dbName = (filteredDbCourses[i]?.training_courses?.name || '').replace(/\s+/g, ' ').toLowerCase().trim();
      
      if (csvName === dbName) {
        matches++;
      } else {
        mismatches.push({
          position: i + 1,
          csv: csvCourses[i],
          db: filteredDbCourses[i]?.training_courses?.name || '(missing)'
        });
      }
    }

    const matchPercent = maxCompare > 0 ? Math.round((matches / maxCompare) * 100) : 0;
    const status = matchPercent === 100 ? '✅' : matchPercent >= 80 ? '⚠️' : '❌';

    console.log(`${status} ${location.name}:`);
    console.log(`   CSV: ${csvFile} (${csvCourses.length} unique courses${csvDuplicates > 0 ? `, ${csvDuplicates} duplicates removed` : ''})`);
    console.log(`   DB: ${filteredDbCourses.length} courses in location_training_courses`);
    console.log(`   Match: ${matches}/${maxCompare} (${matchPercent}%)`);

    if (mismatches.length > 0 && mismatches.length <= 5) {
      console.log(`   Mismatches:`);
      mismatches.forEach(m => {
        console.log(`     Position ${m.position}: CSV="${m.csv}" vs DB="${m.db}"`);
      });
    } else if (mismatches.length > 5) {
      console.log(`   First 5 mismatches:`);
      mismatches.slice(0, 5).forEach(m => {
        console.log(`     Position ${m.position}: CSV="${m.csv}" vs DB="${m.db}"`);
      });
    }

    if (matchPercent < 100) {
      allMatch = false;
    }

    locationResults.push({ 
      name: location.name, 
      status: matchPercent === 100 ? 'MATCH' : 'MISMATCH',
      matches: matchPercent,
      csvCourses: csvCourses.length,
      dbCourses: filteredDbCourses.length
    });

    console.log('');
  }

  console.log('='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  
  const matching = locationResults.filter(r => r.status === 'MATCH').length;
  const mismatching = locationResults.filter(r => r.status === 'MISMATCH').length;
  const noCSV = locationResults.filter(r => r.status === 'NO_CSV').length;
  const errors = locationResults.filter(r => r.status === 'NO_HEADER' || r.status === 'DB_ERROR').length;

  console.log(`Total Locations: ${locations.length}`);
  console.log(`✅ Matching: ${matching}`);
  console.log(`❌ Mismatching: ${mismatching}`);
  console.log(`⚠️  No CSV: ${noCSV}`);
  console.log(`⚠️  Errors: ${errors}`);
  console.log('');

  if (allMatch && matching === locations.length) {
    console.log('🎉 ALL LOCATIONS VERIFIED - Course orders match CSV files!');
  } else {
    console.log('Some locations need attention. Review the details above.');
  }
}

verifyAllLocations().catch(console.error);
