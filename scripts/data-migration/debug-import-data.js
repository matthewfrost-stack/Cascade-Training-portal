const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  console.log('=== IMPORT DEBUG ===\n');

  // Get training courses
  const { data: courses } = await supabase
    .from('training_courses')
    .select('id, name, careskills_name')
    .order('name');

  console.log(`Training Courses in DB: ${courses?.length || 0}`);
  courses?.slice(0, 5).forEach(c => {
    console.log(`  - "${c.name}" / "${c.careskills_name}"`);
  });

  // Get active staff
  const { data: staff } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('is_deleted', false)
    .order('full_name');

  console.log(`\nActive Staff in DB: ${staff?.length || 0}`);
  staff?.slice(0, 10).forEach(s => {
    console.log(`  - "${s.full_name}"`);
  });

  // Get staff locations
  const { data: staffLocs } = await supabase
    .from('staff_locations')
    .select('staff_id, location_id, locations(name), profiles(full_name)')
    .limit(10);

  console.log(`\nStaff Location Assignments (sample):`);
  staffLocs?.forEach(sl => {
    console.log(`  - ${sl.profiles?.full_name} @ ${sl.locations?.name}`);
  });

  // Check for staff without locations
  const staffIds = new Set(staff?.map(s => s.id) || []);
  const staffWithLocs = new Set(staffLocs?.map(sl => sl.staff_id) || []);

  // Get ALL staff locations to see full picture
  const { data: allStaffLocs } = await supabase
    .from('staff_locations')
    .select('staff_id');

  const allStaffWithLocs = new Set(allStaffLocs?.map(sl => sl.staff_id) || []);
  
  let withoutLoc = 0;
  staff?.forEach(s => {
    if (!allStaffWithLocs.has(s.id)) {
      withoutLoc++;
      if (withoutLoc <= 5) {
        console.log(`  ⚠️ No location: ${s.full_name}`);
      }
    }
  });

  console.log(`\nStaff without locations: ${withoutLoc}`);
  console.log(`Staff with locations: ${allStaffWithLocs.size}`);
})();
