const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  console.log('Fetching all staff and their locations...\n');
  
  // Get staff with their locations
  const { data: staff } = await supabase
    .from('staff_locations')
    .select('profiles(id, full_name, email), locations(name)')
    .eq('profiles.is_deleted', false)
    .order('profiles(full_name)');

  // Count total unique staff
  const uniqueStaff = new Set();
  const staffByLocation = {};

  staff?.forEach(record => {
    const staffName = record.profiles?.full_name;
    const locName = record.locations?.name;
    
    if (staffName) {
      uniqueStaff.add(staffName);
      if (!staffByLocation[locName]) {
        staffByLocation[locName] = [];
      }
      staffByLocation[locName].push(staffName);
    }
  });

  console.log(`📊 TOTAL UNIQUE STAFF: ${uniqueStaff.size}\n`);

  // Sort locations alphabetically
  const sortedLocs = Object.keys(staffByLocation).sort();
  
  console.log('📍 STAFF BY LOCATION:\n');
  sortedLocs.forEach(loc => {
    const staffList = staffByLocation[loc];
    console.log(`${loc} (${staffList.length} staff):`);
    staffList.forEach(s => console.log(`  - ${s}`));
    console.log('');
  });

  // Get staff in profiles but not in staff_locations (unassigned)
  console.log('Checking for unassigned staff...\n');
  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('id, full_name, email, location')
    .eq('is_deleted', false)
    .order('full_name');

  const { data: assignedStaff } = await supabase
    .from('staff_locations')
    .select('staff_id');

  const assignedIds = new Set(assignedStaff?.map(s => s.staff_id) || []);
  const unassigned = allProfiles?.filter(p => !assignedIds.has(p.id)) || [];

  if (unassigned.length > 0) {
    console.log(`⚠️ UNASSIGNED STAFF (${unassigned.length}):`);
    unassigned.forEach(p => {
      console.log(`  - ${p.full_name} (stored location: ${p.location})`);
    });
  } else {
    console.log('✅ All staff are properly assigned to locations');
  }
})();
