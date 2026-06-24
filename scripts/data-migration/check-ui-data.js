import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkUIDataForLocation() {
  // Get first location
  const { data: locations } = await supabase
    .from('locations')
    .select('id, name')
    .order('name')
    .limit(1);

  const loc = locations[0];
  console.log(`\n📊 SIMULATING UI DATA FOR: ${loc.name}\n`);

  // Get courses (like the UI does)
  const { data: courseData } = await supabase
    .from('courses')
    .select('*')
    .order('display_order', { ascending: true, nullsFirst: false })
    .order('id', { ascending: true });

  console.log(`Total courses in system: ${courseData?.length || 0}`);

  // Get course IDs that have training data for this location
  const { data: courseIdsData } = await supabase
    .from('staff_training_matrix')
    .select('course_id')
    .eq('completed_at_location_id', loc.id);

  const courseIdsWithData = new Set(courseIdsData?.map(c => c.course_id) || []);
  console.log(`Courses with ANY training data for ${loc.name}: ${courseIdsWithData.size}`);

  // Filter like the UI does
  const filteredCourses = (courseData || []).filter(c => courseIdsWithData.has(c.id));
  console.log(`Courses UI will display for ${loc.name}: ${filteredCourses.length}`);

  console.log('\nFirst 10 courses UI will show:');
  filteredCourses.slice(0, 10).forEach((c, i) => {
    console.log(`  ${i+1}. ${c.name} (${c.expiry_months || 'One-off'} months)`);
  });

  // Get staff
  const { data: staffLocationsData } = await supabase
    .from('staff_locations')
    .select('staff_id, profiles(id, full_name, is_deleted)')
    .eq('location_id', loc.id);

  const activeStaffLocations = (staffLocationsData || []).filter(sl => !sl.profiles?.is_deleted);
  console.log(`\nActive staff for ${loc.name}: ${activeStaffLocations.length}`);

  // Get all training staff
  const { data: trainingStaffIds } = await supabase
    .from('staff_training_matrix')
    .select('staff_id')
    .eq('completed_at_location_id', loc.id);

  const uniqueTrainingStaffIds = new Set(trainingStaffIds?.map(t => t.staff_id) || []);
  console.log(`Staff with training records for ${loc.name}: ${uniqueTrainingStaffIds.size}`);

  // Get profiles for training staff
  if (uniqueTrainingStaffIds.size > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', Array.from(uniqueTrainingStaffIds))
      .eq('is_deleted', false);

    console.log(`Active profiles in training data: ${profiles?.length || 0}`);

    if (profiles && profiles.length > 0) {
      console.log('\nSample staff:');
      profiles.slice(0, 5).forEach((p, i) => {
        console.log(`  ${i+1}. ${p.full_name}`);
      });
    }

    // Now check actual data for one staff member
    if (profiles && profiles.length > 0) {
      const staff = profiles[0];
      const { data: staffRecords } = await supabase
        .from('staff_training_matrix')
        .select('id, course_id, completion_date, status')
        .eq('completed_at_location_id', loc.id)
        .eq('staff_id', staff.id);

      console.log(`\n📋 ${staff.full_name}'s training:`);
      console.log(`   Total course entries: ${staffRecords?.length || 0} (should be ${filteredCourses.length})`);

      // Count by status
      const withDates = staffRecords?.filter(r => r.completion_date).length || 0;
      const withoutDates = (staffRecords?.length || 0) - withDates;

      console.log(`   With completion dates: ${withDates}`);
      console.log(`   Without dates (N/A etc): ${withoutDates}`);

      // Check for gaps
      const recordedCourseIds = new Set(staffRecords?.map(r => r.course_id) || []);
      const missingCourses = filteredCourses.filter(c => !recordedCourseIds.has(c.id));

      if (missingCourses.length > 0) {
        console.log(`   ❌ MISSING COURSE ENTRIES: ${missingCourses.length}`);
        missingCourses.slice(0, 3).forEach(c => {
          console.log(`      - ${c.name}`);
        });
      } else {
        console.log(`   ✅ All courses have entries`);
      }
    }
  }
}

checkUIDataForLocation();
