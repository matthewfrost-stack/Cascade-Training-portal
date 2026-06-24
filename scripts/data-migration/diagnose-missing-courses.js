import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
  console.log('  DIAGNOSE: MISSING COURSES & INCOMPLETE EXPIRY MONTHS');
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
  console.log('');

  // Get all unique courses referenced in staff_training_matrix
  const { data: staffRecords } = await supabase
    .from('staff_training_matrix')
    .select('course_id, courses(id, name, expiry_months)')
    .limit(2000);

  const courseIdsInUse = new Set();
  const coursesByName = {};
  const coursesByIdWithMissingExpiry = [];

  staffRecords.forEach(record => {
    if (record.course_id) {
      courseIdsInUse.add(record.course_id);
    }
    if (record.courses) {
      const name = record.courses.name;
      if (!coursesByName[name]) {
        coursesByName[name] = {
          id: record.courses.id,
          name: name,
          expiry_months: record.courses.expiry_months,
          count: 0
        };
      }
      coursesByName[name].count++;

      if (record.courses.expiry_months === null || record.courses.expiry_months === undefined) {
        coursesByIdWithMissingExpiry.push({
          id: record.courses.id,
          name: name,
          expiry_months: record.courses.expiry_months
        });
      }
    }
  });

  console.log(`Total unique course IDs in staff_training_matrix: ${courseIdsInUse.size}`);
  console.log(`Total unique course names in staff_training_matrix: ${Object.keys(coursesByName).length}`);
  console.log('');

  // Get all courses from courses table
  const { data: allCourses } = await supabase
    .from('courses')
    .select('id, name, expiry_months')
    .order('name');

  console.log(`Total courses in courses table: ${allCourses.length}`);
  console.log('');

  // Find courses with NULL expiry_months
  const coursesWithNullExpiry = allCourses.filter(c => c.expiry_months === null || c.expiry_months === undefined);
  console.log(`\n════════════════════════════════════════════════════════════════════════════════════════`);
  console.log(`  COURSES WITH NO EXPIRY_MONTHS (${coursesWithNullExpiry.length}):`);
  console.log(`════════════════════════════════════════════════════════════════════════════════════════\n`);
  coursesWithNullExpiry.forEach(c => {
    console.log(`${c.name}`);
    console.log(`  ID: ${c.id}`);
    console.log(`  Expiry Months: ${c.expiry_months}`);
    console.log('');
  });

  // Find courses in staff_training_matrix but not in courses table
  console.log('\n════════════════════════════════════════════════════════════════════════════════════════');
  console.log(`  COURSES REFERENCED IN STAFF RECORDS BUT NOT IN COURSES TABLE:`);
  console.log(`════════════════════════════════════════════════════════════════════════════════════════\n`);

  const validCourseIds = new Set(allCourses.map(c => c.id));
  const orphanedCourseIds = Array.from(courseIdsInUse).filter(id => !validCourseIds.has(id));
  
  if (orphanedCourseIds.length > 0) {
    console.log(`Found ${orphanedCourseIds.length} orphaned course IDs\n`);
    orphanedCourseIds.slice(0, 10).forEach(id => {
      console.log(`  ${id}`);
    });
  } else {
    console.log('✅ No orphaned courses found');
  }
}

main().catch(console.error);
