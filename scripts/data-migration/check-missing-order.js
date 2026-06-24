require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: locations } = await supabase.from('locations').select('id, name').order('name');
  
  console.log('=== STAFF WITHOUT DISPLAY_ORDER ===\n');
  
  for (const loc of locations) {
    const { data: noOrder, count } = await supabase
      .from('staff_locations')
      .select('profiles(full_name)', { count: 'exact' })
      .eq('location_id', loc.id)
      .is('display_order', null);
    
    if (count > 0) {
      console.log(`${loc.name}: ${count} staff without display_order`);
      noOrder.slice(0, 5).forEach(s => console.log(`  - ${s.profiles?.full_name}`));
      if (count > 5) console.log(`  ... and ${count - 5} more`);
    }
  }
  
  // Total counts
  const { count: totalWithOrder } = await supabase
    .from('staff_locations')
    .select('*', { count: 'exact', head: true })
    .not('display_order', 'is', null);
  
  const { count: totalWithoutOrder } = await supabase
    .from('staff_locations')
    .select('*', { count: 'exact', head: true })
    .is('display_order', null);
  
  console.log(`\nTotal with display_order: ${totalWithOrder}`);
  console.log(`Total without display_order: ${totalWithoutOrder}`);
}

check();
