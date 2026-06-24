import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function diagnose() {
  console.log('🔍 DEEP DIAGNOSTIC\n');
  
  // Check what fields exist in staff_training_matrix
  console.log('📋 Sample records from staff_training_matrix:');
  const { data: samples } = await supabase
    .from('staff_training_matrix')
    .select('*')
    .limit(5);
  
  if (samples && samples.length > 0) {
    console.log(`Sample record fields: ${Object.keys(samples[0]).join(', ')}\n`);
    console.log(`First record:`, JSON.stringify(samples[0], null, 2).slice(0, 500));
  }
  
  // Check for NULL courses
  console.log('\n\n📋 Checking course relationships:');
  const { data: withCourses } = await supabase
    .from('staff_training_matrix')
    .select('id, course_id, courses(id, name)')
    .limit(10);
  
  console.log('Sample with courses:');
  withCourses?.forEach(r => {
    console.log(`  - course_id: ${r.course_id}, courses data:`, r.courses);
  });
  
  // Count courses
  const { count: courseCount } = await supabase
    .from('courses')
    .select('*', { count: 'exact', head: true });
  
  console.log(`\nTotal courses in table: ${courseCount}`);
  
  // Check for NULL values by column
  console.log('\n📋 NULL value analysis:');
  
  const { data: nullCounts } = await supabase
    .from('staff_training_matrix')
    .select(`
      id,
      completion_date,
      expiry_date,
      course_id,
      staff_id
    `)
    .is('completion_date', null)
    .limit(1);
  
  const { count: nullCompletionCount } = await supabase
    .from('staff_training_matrix')
    .select('*', { count: 'exact', head: true })
    .is('completion_date', null);
  
  const { count: nullExpiryCount } = await supabase
    .from('staff_training_matrix')
    .select('*', { count: 'exact', head: true })
    .is('expiry_date', null);
  
  const { count: nullCourseIdCount } = await supabase
    .from('staff_training_matrix')
    .select('*', { count: 'exact', head: true })
    .is('course_id', null);
  
  console.log(`  NULL completion_date: ${nullCompletionCount}`);
  console.log(`  NULL expiry_date: ${nullExpiryCount}`);
  console.log(`  NULL course_id: ${nullCourseIdCount}`);
  
  // Get a record with completion_date to check what's happening
  console.log('\n📋 Records WITH completion_date:');
  const { data: validRecords, count: validCount } = await supabase
    .from('staff_training_matrix')
    .select('id, course_id, completion_date, expiry_date, courses(id, name, expiry_months)', { count: 'exact' })
    .not('completion_date', 'is', null)
    .limit(10);
  
  console.log(`Total with completion_date: ${validCount}`);
  if (validRecords && validRecords.length > 0) {
    validRecords.slice(0, 3).forEach(r => {
      console.log(`\n  Record ${r.id}:`);
      console.log(`    course_id: ${r.course_id}`);
      console.log(`    completion_date: ${r.completion_date}`);
      console.log(`    expiry_date: ${r.expiry_date}`);
      console.log(`    course: ${r.courses?.[0]?.name || 'NULL'}`);
      console.log(`    expiry_months: ${r.courses?.[0]?.expiry_months}`);
    });
  }
}

diagnose().catch(err => {
  console.error('Error:', err.message);
});
