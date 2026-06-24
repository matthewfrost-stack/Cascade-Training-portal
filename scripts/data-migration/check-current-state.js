require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // Get divider counts per location
  const { data: dividers } = await supabase
    .from('location_matrix_dividers')
    .select('location_id, name, locations(name)')
    .order('location_id')
    .order('display_order');
  
  const byLocation = {};
  dividers.forEach(d => {
    const locName = d.locations?.name || 'Unknown';
    if (!byLocation[locName]) byLocation[locName] = [];
    byLocation[locName].push(d.name);
  });
  
  console.log('=== DIVIDERS IN DATABASE ===\n');
  Object.entries(byLocation).forEach(([loc, divs]) => {
    console.log(`${loc} (${divs.length}):`, divs.join(', '));
  });
  
  // Count total staff with orders
  const { count: staffWithOrder } = await supabase
    .from('staff_locations')
    .select('*', { count: 'exact', head: true })
    .not('display_order', 'is', null);
  
  console.log('\n=== SUMMARY ===');
  console.log('Total staff with display_order set:', staffWithOrder);
  console.log('Total dividers in database:', dividers.length);
})();
