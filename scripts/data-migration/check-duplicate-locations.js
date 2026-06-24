const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  console.log('Fetching all locations...\n');
  
  const { data: locs } = await supabase
    .from('locations')
    .select('id, name')
    .order('name');

  console.log('📍 ALL LOCATIONS:');
  locs?.forEach(l => {
    console.log(`  ID: ${l.id.substring(0, 8)}... | Name: ${l.name}`);
  });

  // Find duplicates by name
  const locMap = {};
  locs?.forEach(l => {
    if (!locMap[l.name]) {
      locMap[l.name] = [];
    }
    locMap[l.name].push(l.id);
  });

  const dups = Object.entries(locMap).filter(([name, ids]) => ids.length > 1);
  
  if (dups.length > 0) {
    console.log('\n🚨 DUPLICATE LOCATION NAMES FOUND:\n');
    dups.forEach(([name, ids]) => {
      console.log(`"${name}":`);
      ids.forEach((id, idx) => {
        console.log(`  ${idx + 1}. ${id}`);
      });
      console.log('');
    });
    
    // Show staff in each duplicate
    console.log('STAFF DISTRIBUTION:\n');
    for (const [name, ids] of dups) {
      console.log(`Location: "${name}"`);
      for (const id of ids) {
        const { data: staff } = await supabase
          .from('staff_locations')
          .select('profiles(full_name)')
          .eq('location_id', id);
        
        console.log(`  ID ${id.substring(0, 8)}... has ${staff?.length || 0} staff`);
        staff?.slice(0, 5).forEach(s => {
          console.log(`    - ${s.profiles?.full_name}`);
        });
        if (staff && staff.length > 5) {
          console.log(`    ... and ${staff.length - 5} more`);
        }
      }
      console.log('');
    }
  } else {
    console.log('\n✅ No duplicate location names found!');
  }
})();
