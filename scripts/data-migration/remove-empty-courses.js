require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function removeEmptyCourses() {
  console.log('='.repeat(80));
  console.log('REMOVING COURSES WITH NO DATA FROM LOCATION MATRICES');
  console.log('='.repeat(80));
  console.log('');

  // Get all locations
  const { data: locations } = await supabase
    .from('locations')
    .select('id, name')
    .order('name');

  let totalRemoved = 0;

  for (const location of locations) {
    // Get staff for this location
    const { data: staffLocations } = await supabase
      .from('staff_locations')
      .select('staff_id')
      .eq('location_id', location.id);

    const staffIds = staffLocations?.map(sl => sl.staff_id) || [];

    if (staffIds.length === 0) {
      console.log(`⚠️  ${location.name}: No staff found, skipping`);
      continue;
    }

    // Get all training records for this location's staff
    const { data: trainingRecords } = await supabase
      .from('staff_training_matrix')
      .select('course_id')
      .in('staff_id', staffIds);

    // Get unique course IDs that have data
    const coursesWithData = new Set(trainingRecords?.map(r => r.course_id) || []);

    // Get location_training_courses for this location
    const { data: locationCourses } = await supabase
      .from('location_training_courses')
      .select('id, training_course_id, training_courses(name)')
      .eq('location_id', location.id);

    // Find courses to remove (no training data)
    const coursesToRemove = locationCourses?.filter(lc => 
      !coursesWithData.has(lc.training_course_id)
    ) || [];

    if (coursesToRemove.length === 0) {
      console.log(`✅ ${location.name}: All courses have data, nothing to remove`);
      continue;
    }

    // Remove the empty courses from location_training_courses
    const idsToRemove = coursesToRemove.map(c => c.id);
    
    const { error } = await supabase
      .from('location_training_courses')
      .delete()
      .in('id', idsToRemove);

    if (error) {
      console.log(`❌ ${location.name}: Error removing courses - ${error.message}`);
    } else {
      console.log(`✅ ${location.name}: Removed ${coursesToRemove.length} empty courses:`);
      coursesToRemove.forEach(c => {
        console.log(`   - ${c.training_courses?.name}`);
      });
      totalRemoved += coursesToRemove.length;
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`COMPLETE: Removed ${totalRemoved} empty courses across all locations`);
  console.log('='.repeat(80));
}

removeEmptyCourses().catch(console.error);
