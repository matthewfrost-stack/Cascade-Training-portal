require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function populateLocationCourses() {
  console.log('='.repeat(80));
  console.log('POPULATING LOCATION_COURSES TABLE');
  console.log('='.repeat(80) + '\n');

  try {
    // Get all locations
    const { data: locations } = await supabase.from('locations').select('id, name');
    console.log(`Found ${locations.length} locations\n`);

    // For each location, find which courses are used
    for (const location of locations) {
      console.log(`Processing ${location.name}...`);

      // Get all unique courses used at this location
      const { data: courses } = await supabase
        .from('staff_training_matrix')
        .select('course_id')
        .eq('completed_at_location_id', location.id)
        .not('course_id', 'is', null);

      const courseIds = [...new Set(courses.map(c => c.course_id))];
      console.log(`  Found ${courseIds.length} courses`);

      // Insert into location_courses (will skip duplicates due to unique constraint)
      const locationCourseRecords = courseIds.map((course_id, index) => ({
        location_id: location.id,
        course_id,
        display_order: index
      }));

      for (const record of locationCourseRecords) {
        const { error } = await supabase
          .from('location_courses')
          .upsert(record, { onConflict: 'location_id,course_id' });

        if (error && error.code !== '23505') {
          // 23505 is unique constraint violation (duplicate), which is expected
          console.error(`  Error inserting course ${record.course_id}:`, error.message);
        }
      }

      console.log(`  ✅ Updated location_courses for ${location.name}`);
    }

    // Verify the results
    const { data: locationCourseCount } = await supabase
      .from('location_courses')
      .select('id');

    console.log(`\n✅ Successfully populated location_courses with ${locationCourseCount?.length || 0} records`);

    // Show summary
    console.log('\nSummary by location:');
    for (const location of locations) {
      const { count } = await supabase
        .from('location_courses')
        .select('*', { count: 'exact', head: true })
        .eq('location_id', location.id);

      console.log(`  ${location.name}: ${count} courses`);
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

populateLocationCourses();
