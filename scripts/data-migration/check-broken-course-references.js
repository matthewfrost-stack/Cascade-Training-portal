import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
  console.log('  FIND RECORDS WITH BROKEN COURSE_ID REFERENCES');
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
  console.log('');

  // Get records where course is undefined (null course_id)
  const { data: staffRecords } = await supabase
    .from('staff_training_matrix')
    .select(`
      id,
      course_id,
      completion_date,
      expiry_date,
      courses(name, expiry_months),
      profiles(full_name)
    `)
    .limit(2000);

  const nullCourses = staffRecords.filter(r => !r.courses);
  const validCourses = staffRecords.filter(r => r.courses);

  console.log(`Total records: ${staffRecords.length}`);
  console.log(`Records with valid course: ${validCourses.length}`);
  console.log(`Records with NULL/BROKEN course_id: ${nullCourses.length}`);
  console.log('');

  // Check the pattern of null course_ids
  const nullByFirstChar = {};
  nullCourses.forEach(r => {
    if (r.course_id) {
      const first = r.course_id.substring(0, 1);
      nullByFirstChar[first] = (nullByFirstChar[first] || 0) + 1;
    }
  });

  console.log('Sample of records with NULL course_id:');
  nullCourses.slice(0, 5).forEach((record, idx) => {
    console.log(`\n${idx + 1}. ID: ${record.id}`);
    console.log(`   course_id: ${record.course_id}`);
    console.log(`   Staff: ${record.profiles?.full_name}`);
    console.log(`   Completion: ${record.completion_date}`);
    console.log(`   Expiry: ${record.expiry_date}`);
  });

  // Check if there are courses that don't exist in the courses table
  console.log('\n════════════════════════════════════════════════════════════════════════════════════════');
  console.log('  CHECK IF COURSE IDs EXIST IN COURSES TABLE');
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
  console.log('');

  const courseIds = new Set(staffRecords.filter(r => r.course_id).map(r => r.course_id));
  console.log(`Unique course_ids in staff_training_matrix: ${courseIds.size}`);

  // Get all courses
  const { data: allCourses } = await supabase
    .from('courses')
    .select('id');

  const courseIdsInTable = new Set(allCourses.map(c => c.id));
  console.log(`Total courses in courses table: ${courseIdsInTable.size}`);

  // Find missing courses
  const missingCourses = Array.from(courseIds).filter(id => !courseIdsInTable.has(id));
  console.log(`Course IDs referenced but not in courses table: ${missingCourses.length}`);

  if (missingCourses.length > 0) {
    console.log('\nMissing course IDs (showing first 20):');
    missingCourses.slice(0, 20).forEach((id, idx) => {
      console.log(`${idx + 1}. ${id}`);
    });
  }
}

main().catch(console.error);
