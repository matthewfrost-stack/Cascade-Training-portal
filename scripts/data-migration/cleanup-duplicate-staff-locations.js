const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  console.log('🔧 REMOVING DUPLICATE STAFF_LOCATIONS ENTRIES\n');

  // Get all staff_locations
  const { data: staffLocs } = await supabase
    .from('staff_locations')
    .select('id, staff_id, location_id');

  // Find duplicates (same staff_id + location_id)
  const seen = new Map();
  const duplicates = [];

  for (const sl of staffLocs || []) {
    const key = `${sl.staff_id}-${sl.location_id}`;
    if (seen.has(key)) {
      duplicates.push(sl.id);
    } else {
      seen.set(key, sl.id);
    }
  }

  console.log(`Found ${duplicates.length} duplicate staff_locations entries\n`);

  if (duplicates.length > 0) {
    console.log('Removing duplicates...');
    
    for (const id of duplicates) {
      const { error } = await supabase
        .from('staff_locations')
        .delete()
        .eq('id', id);
      
      if (error) {
        console.log(`  ❌ Error: ${error.message}`);
      }
    }
    console.log(`✅ Removed ${duplicates.length} duplicates\n`);
  }

  // Now verify final counts
  console.log('\n📊 FINAL STAFF BY LOCATION:\n');
  
  const { data: locs } = await supabase
    .from('locations')
    .select('id, name')
    .order('name');

  for (const loc of locs || []) {
    const { count } = await supabase
      .from('staff_locations')
      .select('*', { count: 'exact', head: true })
      .eq('location_id', loc.id);
    
    console.log(`  ${loc.name}: ${count} staff`);
  }

  // Total unique staff
  const { data: uniqueStaff } = await supabase
    .from('profiles')
    .select('id', { count: 'exact' })
    .eq('is_deleted', false);

  console.log(`\n📈 Total active staff in profiles: ${uniqueStaff?.length || 0}`);
})();
