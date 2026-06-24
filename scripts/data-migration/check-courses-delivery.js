import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkCourses() {
  console.log('\n🔍 Checking Courses Table\n');

  // Get all columns available in courses table
  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .limit(10);

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Sample courses with all columns:');
    (data || []).forEach((course, i) => {
      console.log(`\n${i + 1}. ${course.name}`);
      Object.keys(course).forEach(key => {
        if (key !== 'name') {
          console.log(`   ${key}: ${course[key]}`);
        }
      });
    });
  }
}

checkCourses();
