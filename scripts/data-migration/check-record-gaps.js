import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkRecordGaps() {
  const { data: locations } = await supabase
    .from('locations')
    .select('id, name')
    .limit(1);

  const loc = locations[0];

  // Get all staff for this location
  const { data: staffList } = await supabase
    .from('staff_locations')
    .select('staff_id, profiles(full_name)')
    .eq('location_id', loc.id)
    .eq('profiles.is_deleted', false);

  // Get all courses with data  
  const { data: trainingData } = await supabase
    .from('staff_training_matrix')
    .select('staff_id, course_id')
    .eq('completed_at_location_id', loc.id);

  const courseIds = new Set();
  const staffIds = new Set();

  trainingData?.forEach(rec => {
    courseIds.add(rec.course_id);
    staffIds.add(rec.staff_id);
  });

  console.log(`\n📊 RECORD COVERAGE FOR: ${loc.name}\n`);
  console.log(`Staff in staff_locations: ${staffList?.length || 0}`);
  console.log(`Unique staff in training records: ${staffIds.size}`);
  console.log(`Unique courses in training records: ${courseIds.size}`);
  
  const expectedRecords = (staffList?.length || 0) * courseIds.size;
  const actualRecords = trainingData?.length || 0;

  console.log(`\nExpected records (${staffList?.length} × ${courseIds.size} courses): ${expectedRecords}`);
  console.log(`Actual records: ${actualRecords}`);
  console.log(`Missing: ${expectedRecords - actualRecords}`);
  
  // Find which staff are missing courses
  console.log(`\nStaff missing course entries:`);
  let missingFound = 0;
  for (const staff of staffList || []) {
    const staffTraining = trainingData?.filter(t => t.staff_id === staff.staff_id) || [];
    const hasCourses = new Set(staffTraining.map(t => t.course_id));

    const missing = courseIds.size - hasCourses.size;
    if (missing > 0) {
      missingFound++;
      if (missingFound <= 5) {
        console.log(`  - ${staff.profiles?.full_name}: missing ${missing}/${courseIds.size} courses`);
      }
    }
  }
  console.log(`Total staff with missing courses: ${missingFound}/${staffList?.length || 0}`);
}

checkRecordGaps();
