import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function diagnoseExpiryIssue() {
  console.log('Diagnosing missing expiry data issue...\n');

  try {
    // 1. Check courses with and without expiry_months
    const { data: allCourses } = await supabase
      .from('courses')
      .select('id, name, expiry_months');

    console.log('=== COURSES EXPIRY STATUS ===\n');
    
    const withExpiry = allCourses.filter(c => c.expiry_months !== null);
    const withoutExpiry = allCourses.filter(c => c.expiry_months === null);

    console.log(`Total courses: ${allCourses.length}`);
    console.log(`With expiry_months: ${withExpiry.length}`);
    console.log(`Without expiry_months (null): ${withoutExpiry.length}\n`);

    console.log('Courses WITHOUT expiry_months:');
    withoutExpiry.slice(0, 20).forEach(c => {
      console.log(`  - ${c.name}`);
    });

    // 2. Check training records - how many have expiry_date
    console.log('\n=== TRAINING RECORDS EXPIRY STATUS ===\n');

    const { data: trainingStats } = await supabase
      .from('staff_training_matrix')
      .select('expiry_date, course_id, courses(expiry_months)', { count: 'exact' });

    const withExpiryDate = trainingStats.filter(t => t.expiry_date !== null).length;
    const withoutExpiryDate = trainingStats.filter(t => t.expiry_date === null).length;

    console.log(`Total training records: ${trainingStats.length}`);
    console.log(`With expiry_date: ${withExpiryDate}`);
    console.log(`Without expiry_date: ${withoutExpiryDate}`);

    // 3. Check completed records specifically
    const { data: completedRecords } = await supabase
      .from('staff_training_matrix')
      .select('id, status, course_id, completion_date, expiry_date, courses(id, name, expiry_months)')
      .eq('status', 'completed')
      .is('expiry_date', null)
      .limit(20);

    if (completedRecords && completedRecords.length > 0) {
      console.log(`\n=== COMPLETED RECORDS WITHOUT EXPIRY_DATE (showing first 20) ===\n`);
      
      completedRecords.forEach((r, i) => {
        const course = r.courses;
        const hasExpiry = course?.expiry_months !== null;
        console.log(`${i + 1}. Course: ${course?.name}`);
        console.log(`   Expiry_months: ${course?.expiry_months || 'null'} ${!hasExpiry ? '⚠️ MISSING' : ''}`);
        console.log(`   Completion: ${r.completion_date}`);
      });
    }

    // 4. Check how many records are missing because course has no expiry_months
    const { data: recordsWithoutCourseExpiry } = await supabase
      .from('staff_training_matrix')
      .select('id, courses(name, expiry_months)', { count: 'exact' })
      .eq('status', 'completed')
      .is('expiry_date', null);

    const missingCourseExpiry = recordsWithoutCourseExpiry.filter(r => 
      r.courses?.expiry_months === null
    ).length;

    console.log(`\n=== ANALYSIS ===\n`);
    console.log(`Completed records without expiry_date: ${recordsWithoutCourseExpiry.length}`);
    console.log(`  - Due to missing course expiry_months: ${missingCourseExpiry}`);
    console.log(`  - Should be calculated: ${recordsWithoutCourseExpiry.length - missingCourseExpiry}`);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

diagnoseExpiryIssue();
