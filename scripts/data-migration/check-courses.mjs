import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Check if training_courses are in location_courses
const { data: trainingCourses, error: e1 } = await supabase
  .from('training_courses')
  .select('id, name')
  .limit(5);

console.log('Training courses (imported):', trainingCourses?.map(c => c.name));
if (e1) console.log('Error:', e1);

// Check what's in location_courses for Cohen House
const { data: locationCourses, error: e2 } = await supabase
  .from('location_courses')
  .select('course_id, courses(name)')
  .eq('location_id', 'd8da5c1c-3460-4d8e-ac26-7504e0111eaa')
  .limit(10);

console.log('\nLocation courses for Cohen House:', locationCourses?.map(c => c.courses?.name));
if (e2) console.log('Error:', e2);

// Check what the matrix table references - training_courses or courses?
const { data: matrixSample, error: e3 } = await supabase
  .from('staff_training_matrix')
  .select('course_id')
  .not('course_id', 'is', null)
  .limit(5);

console.log('\nMatrix course IDs:', matrixSample?.map(m => m.course_id));

// Check if those course IDs are in training_courses
const courseIds = matrixSample?.map(m => m.course_id) || [];
if (courseIds.length > 0) {
  const { data: inTraining } = await supabase
    .from('training_courses')
    .select('id, name')
    .in('id', courseIds);
  
  console.log('\nThese IDs in training_courses:', inTraining?.map(c => c.name));
  
  const { data: inCourses } = await supabase
    .from('courses')
    .select('id, name')
    .in('id', courseIds);
  
  console.log('These IDs in courses table:', inCourses?.map(c => c.name));
}
