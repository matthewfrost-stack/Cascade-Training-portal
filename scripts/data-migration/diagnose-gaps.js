import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function compareCSVWithDatabase() {
  try {
    // Get all locations
    const { data: locations } = await supabase
      .from('locations')
      .select('id, name')
      .order('name');

    console.log('Comparing CSV files with database...\n');

    // Check first location in detail
    const firstLoc = locations[0];
    console.log(`\n${'='.repeat(80)}`);
    console.log(`DETAILED ANALYSIS: ${firstLoc.name}`);
    console.log(`${'='.repeat(80)}`);

    // Load CSV
    const csvPath = `/Users/matthewfrost/training-portal/csv-import/${firstLoc.name}.csv`;
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const records = parse(csvContent, { skip_empty_lines: true });

    // Extract courses from CSV (row 2)
    const courseRow = records[1]; // 0-indexed, so row 2 is index 1
    console.log('\nCSV Course Order (Row 2):');
    const csvCourses = courseRow.slice(1).map(c => c.trim()).filter(c => c); // Skip first column (staff name)
    csvCourses.forEach((course, idx) => {
      console.log(`  ${idx + 1}. ${course}`);
    });

    // Get database courses for this location
    const { data: dbRecords } = await supabase
      .from('staff_training_matrix')
      .select('course_id, course_name')
      .eq('location_id', firstLoc.id)
      .order('course_id');

    // Get unique courses in database order
    const uniqueDbCourses = [];
    const seenCourses = new Set();
    
    dbRecords.forEach(rec => {
      if (!seenCourses.has(rec.course_name)) {
        uniqueDbCourses.push(rec.course_name);
        seenCourses.add(rec.course_name);
      }
    });

    console.log(`\nDatabase Course Order (${uniqueDbCourses.length} courses):`);
    uniqueDbCourses.forEach((course, idx) => {
      console.log(`  ${idx + 1}. ${course}`);
    });

    // Compare
    console.log('\n' + '-'.repeat(80));
    console.log('ORDER ANALYSIS:');
    console.log('-'.repeat(80));

    // Check if all CSV courses are in database
    const csvSet = new Set(csvCourses);
    const dbSet = new Set(uniqueDbCourses);
    
    const missingFromDB = csvCourses.filter(c => !dbSet.has(c));
    const extraInDB = uniqueDbCourses.filter(c => !csvSet.has(c));

    if (missingFromDB.length > 0) {
      console.log(`\n❌ MISSING FROM DATABASE (${missingFromDB.length}):`);
      missingFromDB.forEach(c => console.log(`  - ${c}`));
    } else {
      console.log(`\n✅ All CSV courses are in database`);
    }

    if (extraInDB.length > 0) {
      console.log(`\n⚠️  EXTRA IN DATABASE (${extraInDB.length}):`);
      extraInDB.forEach(c => console.log(`  - ${c}`));
    }

    // Check ordering
    const csvIndex = {};
    csvCourses.forEach((course, idx) => csvIndex[course] = idx);

    let orderingMatches = 0;
    let orderingMismatches = 0;

    for (let i = 0; i < uniqueDbCourses.length - 1; i++) {
      const curr = uniqueDbCourses[i];
      const next = uniqueDbCourses[i + 1];
      
      if (csvIndex[curr] !== undefined && csvIndex[next] !== undefined) {
        if (csvIndex[curr] < csvIndex[next]) {
          orderingMatches++;
        } else {
          orderingMismatches++;
          if (orderingMismatches <= 5) {
            console.log(`\n⚠️  ORDER MISMATCH: "${curr}" (pos ${csvIndex[curr]}) should come before "${next}" (pos ${csvIndex[next]})`);
          }
        }
      }
    }

    console.log(`\nOrdering: ${orderingMatches} correct pairs, ${orderingMismatches} out of order`);

    // Sample data check - show actual records for a course
    console.log('\n' + '-'.repeat(80));
    console.log('DATA VERIFICATION:');
    console.log('-'.repeat(80));

    // Get a staff member and show their records
    const { data: staffList } = await supabase
      .from('profiles')
      .select('id, display_name')
      .limit(1);

    if (staffList?.length > 0) {
      const staff = staffList[0];
      const { data: staffRecords } = await supabase
        .from('staff_training_matrix')
        .select('course_name, completion_date, expiry_date, status')
        .eq('location_id', firstLoc.id)
        .eq('profile_id', staff.id);

      console.log(`\nSample staff member: ${staff.display_name}`);
      console.log(`Records in DB: ${staffRecords?.length || 0}`);
      
      if (staffRecords && staffRecords.length > 0) {
        console.log('Courses with data:');
        staffRecords.filter(r => r.completion_date).forEach(r => {
          console.log(`  - ${r.course_name}: ${r.completion_date}`);
        });
        
        console.log('Courses without dates:');
        staffRecords.filter(r => !r.completion_date).slice(0, 5).forEach(r => {
          console.log(`  - ${r.course_name}: ${r.status || 'N/A'}`);
        });
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
    if (error.stack) console.error(error.stack);
  }
}

compareCSVWithDatabase();
