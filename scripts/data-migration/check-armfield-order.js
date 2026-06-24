require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  // Get Armfield House
  const { data: loc } = await supabase.from('locations').select('id').eq('name', 'Armfield House').single();
  
  // Get staff with display_order
  const { data: staff } = await supabase
    .from('staff_locations')
    .select('display_order, profiles(full_name)')
    .eq('location_id', loc.id)
    .not('display_order', 'is', null)
    .order('display_order')
    .limit(20);
  
  // Get dividers
  const { data: dividers } = await supabase
    .from('location_matrix_dividers')
    .select('name, display_order')
    .eq('location_id', loc.id)
    .order('display_order');
  
  console.log('=== ARMFIELD HOUSE DATABASE STATE ===\n');
  console.log('Dividers:');
  dividers.forEach(d => console.log(`  Position ${d.display_order}: ${d.name}`));
  
  console.log('\nFirst 20 staff:');
  staff.forEach(s => console.log(`  Position ${s.display_order}: ${s.profiles.full_name}`));
  
  // Combined view
  console.log('\n=== COMBINED ORDER (first 25 entries) ===');
  const all = [];
  dividers.forEach(d => all.push({ pos: d.display_order, name: d.name, type: 'DIVIDER' }));
  staff.forEach(s => all.push({ pos: s.display_order, name: s.profiles.full_name, type: 'staff' }));
  all.sort((a, b) => a.pos - b.pos);
  all.slice(0, 25).forEach(item => {
    console.log(`  ${item.pos}: ${item.type === 'DIVIDER' ? `[${item.name}]` : item.name}`);
  });
}

check();
