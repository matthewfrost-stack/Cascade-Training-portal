import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function diagnose() {
  console.log('🔍 CHECKING COURSES DATABASE DIRECTLY\n');
  
  // Get specific course by ID
  const courseId = '67825d6a-91f4-4340-a011-d7bc6629e029';
  
  const { data: directCourse } = await supabase
    .from('courses')
    .select('*')
    .eq('id', courseId);
  
  if (directCourse && directCourse[0]) {
    console.log(`Direct query of course ${courseId}:`);
    console.log(JSON.stringify(directCourse[0], null, 2));
  }
  
  // Check all columns in courses table
  console.log('\n\n📋 All courses (sample):');
  const { data: allCourses } = await supabase
    .from('courses')
    .select('*')
    .limit(5);
  
  if (allCourses && allCourses.length > 0) {
    console.log(`\nSample course fields: ${Object.keys(allCourses[0]).join(', ')}`);
    console.log(`\nFirst course:`, JSON.stringify(allCourses[0], null, 2).slice(0, 800));
  }
  
  // Check if expiry_months column exists and has data
  console.log('\n\n📊 Courses with expiry_months set:');
  const { data: withMonths, count } = await supabase
    .from('courses')
    .select('id, name, expiry_months', { count: 'exact' })
    .not('expiry_months', 'is', null)
    .limit(5);
  
  console.log(`Count: ${count}`);
  withMonths?.forEach(c => {
    console.log(`  - ${c.name.slice(0, 50)}: ${c.expiry_months}`);
  });
}

diagnose().catch(err => {
  console.error('Error:', err.message);
});
