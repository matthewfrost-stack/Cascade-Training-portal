import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
  console.log('  FIND ALL DUPLICATE COURSE NAMES');
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
  console.log('');

  // Get all courses
  const { data: courses } = await supabase
    .from('courses')
    .select('id, name, expiry_months')
    .order('name');

  // Find duplicates
  const nameMap = {};
  courses.forEach(course => {
    const key = course.name.toLowerCase().trim();
    if (!nameMap[key]) nameMap[key] = [];
    nameMap[key].push(course);
  });

  const duplicates = Object.entries(nameMap).filter(([_, courses]) => courses.length > 1);
  
  console.log(`Total courses: ${courses.length}`);
  console.log(`Duplicate course names: ${duplicates.length}\n`);

  if (duplicates.length > 0) {
    console.log('════════════════════════════════════════════════════════════════════════════════════════');
    console.log('  DUPLICATE COURSES FOUND:');
    console.log('════════════════════════════════════════════════════════════════════════════════════════\n');

    duplicates.forEach(([name, courseList]) => {
      console.log(`"${name}"`);
      courseList.forEach((course, idx) => {
        console.log(`  ${idx + 1}. ID: ${course.id}`);
        console.log(`     Expiry: ${course.expiry_months} months`);
      });
      console.log('');
    });
  }

  // Check how many staff_training_matrix records point to each duplicate
  console.log('════════════════════════════════════════════════════════════════════════════════════════');
  console.log('  STAFF ASSIGNMENTS FOR DUPLICATES:');
  console.log('════════════════════════════════════════════════════════════════════════════════════════\n');

  for (const [name, courseList] of duplicates) {
    console.log(`"${name}"`);
    
    for (const course of courseList) {
      const { count } = await supabase
        .from('staff_training_matrix')
        .select('id', { count: 'exact', head: true })
        .eq('course_id', course.id);
      
      console.log(`  ID ${course.id}: ${count} staff members (${course.expiry_months} months)`);
    }
    console.log('');
  }
}

main().catch(console.error);
