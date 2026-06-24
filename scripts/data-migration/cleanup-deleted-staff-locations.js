const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  // Get all deleted profiles
  const { data: deleted } = await supabase
    .from('profiles')
    .select('id')
    .eq('is_deleted', true);

  const deletedIds = deleted.map(d => d.id);
  console.log('Deleted profiles:', deletedIds.length);

  // Delete staff_locations for deleted profiles
  let removed = 0;
  for (const id of deletedIds) {
    const { error } = await supabase
      .from('staff_locations')
      .delete()
      .eq('staff_id', id);
    
    if (!error) removed++;
  }

  console.log('Removed staff_locations entries:', removed);

  // Final count by location
  const { data: locs } = await supabase
    .from('locations')
    .select('id, name')
    .order('name');

  console.log('\nFINAL STAFF BY LOCATION:');
  for (const loc of locs) {
    const { count } = await supabase
      .from('staff_locations')
      .select('*', { count: 'exact', head: true })
      .eq('location_id', loc.id);
    
    console.log(`  ${loc.name}: ${count}`);
  }
})();
