#!/bin/bash
export NEXT_PUBLIC_SUPABASE_URL=https://ykrmrwgnbuigdzodnliw.supabase.co
export SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlrcm1yd2duYnVpZ2R6b2RubGl3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ2MDgzMCwiZXhwIjoyMDg0MDM2ODMwfQ.wlJhJ4dN1y94WgLoiBU0pWvqf0AkdW06XE7jtU_1Rcc"

node --input-type=module << 'EONODE'
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Get first location
const { data: locations } = await supabase
  .from('locations')
  .select('id, name')
  .order('name')
  .limit(1);

const loc = locations[0];
console.log(`\n📊 DATABASE STATE: ${loc.name}\n`);

// Get staff count
const { data: staffList } = await supabase
  .from('staff_locations')
  .select('staff_id')
  .eq('location_id', loc.id);

const staffCount = staffList?.length || 0;
console.log(`Staff members: ${staffCount}`);

// Get training records for location
const { data: allRecords } = await supabase
  .from('staff_training_matrix')
  .select('id')
  .eq('completed_at_location_id', loc.id);

console.log(`Total records in database: ${allRecords?.length || 0}`);

// Get unique courses
const { data: courseRecords } = await supabase
  .from('staff_training_matrix')
  .select('course_id')
  .eq('completed_at_location_id', loc.id);

const uniqueCourses = new Set(courseRecords?.map(r => r.course_id) || []);
console.log(`Unique courses: ${uniqueCourses.size}`);

// Get list of actual courses
const { data: courseDetails } = await supabase
  .from('courses')
  .select('id, name')
  .in('id', Array.from(uniqueCourses));

console.log(`\nCourses in database for ${loc.name}:`);
courseDetails?.slice(0, 10).forEach((c, i) => {
  console.log(`  ${i+1}. ${c.name}`);
});
const courseCount = courseDetails?.length || 0;
if (courseCount > 10) {
  console.log(`  ... and ${courseCount - 10} more`);
}

// Sample a staff member
if (staffList && staffList.length > 0) {
  const staffId = staffList[0].staff_id;
  
  const { data: staffProfile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', staffId)
    .limit(1);
  
  const { data: staffRecords } = await supabase
    .from('staff_training_matrix')
    .select('id, course_id, completion_date, status')
    .eq('completed_at_location_id', loc.id)
    .eq('staff_id', staffId);
  
  console.log(`\nSample staff: ${staffProfile?.[0]?.full_name || staffId}`);
  console.log(`Records: ${staffRecords?.length || 0}`);
  
  // Count by status
  const byStatus = {};
  staffRecords?.forEach(r => {
    const key = r.completion_date ? 'With Date' : (r.status || 'No Status');
    byStatus[key] = (byStatus[key] || 0) + 1;
  });
  
  console.log('By status:');
  Object.entries(byStatus).forEach(([status, count]) => {
    console.log(`  - ${status}: ${count}`);
  });
}

console.log('\n');

EONODE
