import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkLocationCourses() {
  console.log('\n🔍 Checking Location Courses Table\n');

  const { data, error } = await supabase
    .from('location_courses')
    .select('*')
    .limit(10);

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Sample location_courses with all columns:');
    (data || []).forEach((row, i) => {
      console.log(`\n${i + 1}. Location ${row.location_id} - Course ${row.course_id}`);
      Object.keys(row).forEach(key => {
        console.log(`   ${key}: ${row[key]}`);
      });
    });
  }
}

checkLocationCourses();
