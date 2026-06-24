const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function cleanupDuplicateCourses() {
  console.log('='.repeat(80));
  console.log('Cleaning up duplicate Careskills-suffix courses from location_training_courses');
  console.log('='.repeat(80) + '\n');

  // Count total training courses
  const { count: totalCourses } = await supabase
    .from('training_courses')
    .select('*', { count: 'exact', head: true });
  
  console.log('Total training_courses:', totalCourses);
  
  // Count Careskills suffix courses
  const { data: careskillsCourses } = await supabase
    .from('training_courses')
    .select('id, name')
    .ilike('name', '%(Careskills)%');
  
  console.log('Courses with (Careskills) suffix:', careskillsCourses?.length);
  
  // Check location_training_courses entries for Careskills courses
  if (careskillsCourses && careskillsCourses.length > 0) {
    const careskillsIds = careskillsCourses.map(c => c.id);
    const { count: ltcCount } = await supabase
      .from('location_training_courses')
      .select('*', { count: 'exact', head: true })
      .in('training_course_id', careskillsIds);
    
    console.log('location_training_courses with Careskills courses:', ltcCount);
    
    // Delete these from location_training_courses
    console.log('\nDeleting Careskills-suffix courses from location_training_courses...');
    const { error } = await supabase
      .from('location_training_courses')
      .delete()
      .in('training_course_id', careskillsIds);
    
    if (error) {
      console.error('Error:', error.message);
    } else {
      console.log('Deleted successfully');
    }
  }
  
  // Recheck
  const { data: afterCleanup } = await supabase
    .from('location_training_courses')
    .select('display_order, training_courses(name)')
    .eq('location_id', '62dca354-f597-4c7a-96f5-6a9308eafb35')
    .order('display_order')
    .limit(15);
  
  console.log('\nArmfield House courses after cleanup (first 15):');
  afterCleanup?.forEach(c => {
    console.log(`  ${c.display_order}. ${c.training_courses?.name}`);
  });
}

cleanupDuplicateCourses();
