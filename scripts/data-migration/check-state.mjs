import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Count current courses in each table
const { count: coursesCount } = await supabase.from('courses').select('*', { count: 'exact', head: true });
const { count: trainingCoursesCount } = await supabase.from('training_courses').select('*', { count: 'exact', head: true });
const { count: locationCoursesCount } = await supabase.from('location_courses').select('*', { count: 'exact', head: true });
const { count: locationTrainingCoursesCount } = await supabase.from('location_training_courses').select('*', { count: 'exact', head: true });

console.log('Current state:');
console.log('  courses:', coursesCount);
console.log('  training_courses:', trainingCoursesCount);
console.log('  location_courses:', locationCoursesCount);
console.log('  location_training_courses:', locationTrainingCoursesCount);

// Get all courses currently used in location_courses
const { data: allLocationCourses } = await supabase
  .from('location_courses')
  .select('course_id, display_order, location_id, courses(id, name, category, expiry_months)')
  .order('course_id');

const uniqueCourses = new Map();
allLocationCourses?.forEach(lc => {
  if (lc.courses && !uniqueCourses.has(lc.courses.id)) {
    uniqueCourses.set(lc.courses.id, lc.courses);
  }
});

console.log('\nUnique courses in location_courses:', uniqueCourses.size);
console.log('Sample:', Array.from(uniqueCourses.values()).slice(0, 10).map(c => c.name));

// Get locations
const { data: locations } = await supabase.from('locations').select('id, name');
console.log('\nLocations:', locations?.length);
