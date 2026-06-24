import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
  console.log('  FIND ALL ORPHANED COURSE IDS (NOT IN COURSES TABLE)');
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
  console.log('');

  // Get all unique course_ids from staff_training_matrix
  const { data: allRecords } = await supabase
    .from('staff_training_matrix')
    .select('course_id')
    .limit(2000);

  const courseIds = new Set(allRecords.map(r => r.course_id).filter(c => c));
  console.log(`Total unique course_ids in staff_training_matrix: ${courseIds.size}`);

  // Get all course_ids from courses table
  const { data: courses } = await supabase
    .from('courses')
    .select('id');

  const validCourseIds = new Set(courses.map(c => c.id));
  console.log(`Total courses in courses table: ${validCourseIds.size}`);

  // Find orphaned course_ids
  const orphanedCourseIds = Array.from(courseIds).filter(id => !validCourseIds.has(id));
  console.log(`Orphaned course_ids (referenced but don't exist): ${orphanedCourseIds.length}`);
  console.log('');

  // Get all staff_training_matrix records that use orphaned course_ids
  const orphanedRecords = [];
  
  console.log('Loading orphaned records...');
  for (const courseId of orphanedCourseIds) {
    const { data: records } = await supabase
      .from('staff_training_matrix')
      .select(`
        id,
        course_id,
        completion_date,
        expiry_date,
        profiles(full_name)
      `)
      .eq('course_id', courseId);
    
    if (records) {
      orphanedRecords.push(...records);
    }
  }

  console.log(`Total staff_training_matrix records with orphaned course_ids: ${orphanedRecords.length}`);
  console.log('');

  // Show sample orphaned records
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
  console.log('  SAMPLE ORPHANED RECORDS');
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
  orphanedRecords.slice(0, 20).forEach((record, idx) => {
    console.log(`\n${idx + 1}. ID: ${record.id}`);
    console.log(`   Staff: ${record.profiles?.full_name}`);
    console.log(`   Course ID: ${record.course_id}`);
    console.log(`   Completion: ${record.completion_date}`);
    console.log(`   Expiry: ${record.expiry_date}`);
  });

  console.log('\n════════════════════════════════════════════════════════════════════════════════════════');
  console.log(`  TOTAL ORPHANED RECORDS: ${orphanedRecords.length}`);
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
}

main().catch(console.error);
