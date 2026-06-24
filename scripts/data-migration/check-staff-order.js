require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // Check staff_locations for display_order column
  const { data } = await supabase.from('staff_locations').select('*').limit(1);
  if (data && data[0]) {
    console.log('staff_locations columns:', Object.keys(data[0]));
  }
  
  // Check a specific location
  const { data: locations } = await supabase.from('locations').select('id, name').limit(1);
  const locId = locations[0].id;
  console.log('\nLocation:', locations[0].name);
  
  // Get staff for this location with their order
  const { data: staffLocs } = await supabase
    .from('staff_locations')
    .select('staff_id, display_order, profiles(full_name)')
    .eq('location_id', locId)
    .order('display_order', { ascending: true, nullsFirst: false })
    .limit(20);
  
  console.log('\nFirst 20 staff with display_order:');
  staffLocs?.forEach((s, i) => {
    console.log(`  ${i+1}. [order: ${s.display_order}] ${s.profiles?.full_name}`);
  });
})();
